const DeepSpeech = require("deepspeech");
const Fs = require("fs");
const Sox = require("sox-stream");
const MemoryStream = require("memory-stream");
const Duplex = require("stream").Duplex;
const Wav = require("node-wav");
const format = require("subtitle").formatTimestamp;

let modelPath = "./models/deepspeech-0.9.3-models.pbmm";

let model = new DeepSpeech.Model(modelPath);

let desiredSampleRate = model.sampleRate();

let scorerPath = "./models/deepspeech-0.9.3-models.scorer";

model.enableExternalScorer(scorerPath);

let audioFile = process.argv[2] || "test.wav";

if (!Fs.existsSync(audioFile)) {
  console.log("file missing:", audioFile);
  process.exit();
}

const buffer = Fs.readFileSync(audioFile);
const result = Wav.decode(buffer);

if (result.sampleRate < desiredSampleRate) {
  console.error(
    "Warning: original sample rate (" +
      result.sampleRate +
      ") is lower than " +
      desiredSampleRate +
      "Hz. Up-sampling might produce erratic speech recognition."
  );
}

function bufferToStream(buffer) {
  let stream = new Duplex();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

let audioStream = new MemoryStream();
bufferToStream(buffer)
  .pipe(
    Sox({
      global: {
        "no-dither": true,
      },
      output: {
        bits: 16,
        rate: desiredSampleRate,
        channels: 1,
        encoding: "signed-integer",
        endian: "little",
        compression: 0.0,
        type: "raw",
      },
    })
  )
  .pipe(audioStream);

audioStream.on("finish", () => {
  let audioBuffer = audioStream.toBuffer();

  const audioLength = (audioBuffer.length / 2) * (1 / desiredSampleRate);
  console.log("audio length", audioLength);

  // model.setBeamWidth(50);
  // model.setScorerAlphaBeta(0.93, 1.18);

  let st = Fs.createWriteStream("text.srt");
  st.setMaxListeners(100);

  function candidateTranscriptToString(transcript) {
    var retval = "";
    let lineCount = 0;
    let start = "";

    const array = [];
    for (var i = 0; i < transcript.tokens.length; ++i) {
      if (transcript.tokens[i].text === " ") {
        lineCount += 1;
        st.write(lineCount.toString() + "\n");
        st.write(`${start} --> ${format(transcript.tokens[i].start_time)} \n`);
        st.write(retval + "\n");
        st.write("\n");
        st.write("\n");

        console.log("\n");
        console.log(lineCount);
        console.log(start + " --> " + format(transcript.tokens[i].start_time));
        console.log(retval);

        start = "";
        retval = "";
      }
      if (start == "") {
        start = format(transcript.tokens[i].start_time);
      }
      retval += transcript.tokens[i].text;
    }
    return retval;
  }

  let metadata = model.sttWithMetadata(audioBuffer, 1);
  console.log(metadata.transcripts[0]);
  candidateTranscriptToString(metadata.transcripts[0]);
  DeepSpeech.FreeMetadata(metadata);

  let result = model.stt(audioBuffer);

  console.log("result:", result);
});
