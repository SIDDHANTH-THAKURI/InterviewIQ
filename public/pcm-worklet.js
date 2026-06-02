/**
 * pcm-worklet.js — microphone capture processor.
 *
 * Runs on the audio render thread. Converts the mic signal (Float32 [-1,1]) to
 * 16-bit PCM at the AudioContext's NATIVE sample rate (no resampling — we send
 * the true rate to Deepgram instead, which keeps the audio clean and improves
 * transcription accuracy). Posts ~50ms frames as transferable ArrayBuffers.
 */
class PCMWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = [];
    this.FRAME = 2048; // samples per posted frame
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const ch = input[0]; // mono Float32Array (render quantum)

    for (let i = 0; i < ch.length; i++) this.buf.push(ch[i]);

    while (this.buf.length >= this.FRAME) {
      const frame = this.buf.splice(0, this.FRAME);
      const pcm = new Int16Array(this.FRAME);
      for (let i = 0; i < this.FRAME; i++) {
        let s = frame[i];
        if (s > 1) s = 1;
        else if (s < -1) s = -1;
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }

    return true;
  }
}

registerProcessor("pcm-worklet", PCMWorklet);
