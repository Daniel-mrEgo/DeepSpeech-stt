const DeepSpeech = require("deepspeech");
const Fs = require("fs");
const Sox = require("sox-stream");
const MemoryStream = require("memory-stream");
const Duplex = require("stream").Duplex;
const Wav = require("node-wav");

let modelPath = "./models/deepspeech-0.9.3-models.pbmm";

let model = new DeepSpeech.Model(modelPath);

let desiredSampleRate = model.sampleRate();

let scorerPath = "./models/deepspeech-0.9.3-models.scorer";

model.enableExternalScorer(scorerPath);

let audioFile = process.argv[2] || "post1.wav";

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

  function candidateTranscriptToString(transcript) {
    var retval = "";
    for (var i = 0; i < transcript.tokens.length; ++i) {
      retval += transcript.tokens[i].text;
    }
    return retval;
  }

  let metadata = model.sttWithMetadata(audioBuffer, 1);
  // console.log(metadata.transcripts[0]);
  //   console.log(candidateTranscriptToString(metadata.transcripts[0]));
  //   consloe.log(DeepSpeech.FreeMetadata(metadata));

  let result = model.stt(audioBuffer);

  console.log("result:", result);
});
