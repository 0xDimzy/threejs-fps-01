// Synthesized WebAudio effects — no audio files, no network. Every sound
// is built from oscillators and filtered noise, created lazily on the first
// user gesture (browsers block audio before that). All methods are safe to
// call before the context exists: they just no-op.
export function createSoundBank() {
  const bank = {
    ctx: null,
    master: null,
    noiseBuf: null,

    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    },

    // Short filtered noise burst: the body of every gunshot.
    burst({ duration, freq, type = 'lowpass', gain = 0.5, slideTo = null }) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.setValueAtTime(freq, t);
      if (slideTo !== null) filter.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + duration);
      src.connect(filter).connect(g).connect(this.master);
      src.start(t);
      src.stop(t + duration + 0.02);
    },

    // A pure tone with a pitch slide: beeps, clicks, stingers.
    tone({ freq, endFreq = null, duration, type = 'sine', gain = 0.2, when = 0 }) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + when;
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (endFreq !== null) osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + duration + 0.02);
    },

    shot(kind) {
      if (kind === 'kestrel') {
        this.burst({ duration: 0.14, freq: 1800, slideTo: 300, gain: 0.55 });
        this.tone({ freq: 220, endFreq: 70, duration: 0.09, type: 'square', gain: 0.12 });
      } else if (kind === 'wasp') {
        this.burst({ duration: 0.09, freq: 2400, slideTo: 500, gain: 0.4 });
        this.tone({ freq: 320, endFreq: 110, duration: 0.06, type: 'square', gain: 0.08 });
      } else if (kind === 'breacher') {
        this.burst({ duration: 0.3, freq: 900, slideTo: 120, gain: 0.8 });
        this.tone({ freq: 130, endFreq: 45, duration: 0.22, type: 'sawtooth', gain: 0.18 });
      } else {
        // Distant bot fire: quieter, low-passed.
        this.burst({ duration: 0.12, freq: 900, slideTo: 200, gain: 0.16 });
      }
    },
    dryFire() {
      this.tone({ freq: 1400, duration: 0.03, type: 'square', gain: 0.08 });
    },
    reload() {
      this.tone({ freq: 900, duration: 0.04, type: 'square', gain: 0.1 });
      this.tone({ freq: 600, duration: 0.05, type: 'square', gain: 0.1, when: 0.22 });
      this.tone({ freq: 1100, duration: 0.04, type: 'square', gain: 0.1, when: 0.45 });
    },
    hit() {
      this.tone({ freq: 1900, duration: 0.05, type: 'sine', gain: 0.16 });
    },
    kill() {
      this.tone({ freq: 660, duration: 0.08, type: 'sine', gain: 0.18 });
      this.tone({ freq: 990, duration: 0.12, type: 'sine', gain: 0.18, when: 0.08 });
    },
    hurt() {
      this.burst({ duration: 0.15, freq: 400, slideTo: 150, gain: 0.3 });
    },
    step() {
      this.burst({ duration: 0.05, freq: 500, slideTo: 200, gain: 0.07 });
    },
    explosion() {
      this.burst({ duration: 0.9, freq: 500, slideTo: 60, gain: 0.9 });
      this.tone({ freq: 90, endFreq: 30, duration: 0.7, type: 'sine', gain: 0.4 });
    },
    plantTick() {
      this.tone({ freq: 1200, duration: 0.06, type: 'square', gain: 0.12 });
    },
    plantDone() {
      this.tone({ freq: 880, duration: 0.12, type: 'sine', gain: 0.2 });
      this.tone({ freq: 1320, duration: 0.2, type: 'sine', gain: 0.2, when: 0.12 });
    },
    defuseTick() {
      this.tone({ freq: 1500, duration: 0.05, type: 'square', gain: 0.1 });
    },
    buy() {
      this.tone({ freq: 740, duration: 0.07, type: 'sine', gain: 0.16 });
      this.tone({ freq: 1108, duration: 0.1, type: 'sine', gain: 0.16, when: 0.07 });
    },
    denied() {
      this.tone({ freq: 220, duration: 0.12, type: 'square', gain: 0.12 });
    },
    click() {
      this.tone({ freq: 1000, duration: 0.03, type: 'square', gain: 0.08 });
    },
    win() {
      [523, 659, 784, 1047].forEach((f, i) =>
        this.tone({ freq: f, duration: 0.22, type: 'sine', gain: 0.16, when: i * 0.13 }));
    },
    lose() {
      [392, 330, 262, 196].forEach((f, i) =>
        this.tone({ freq: f, duration: 0.25, type: 'sine', gain: 0.14, when: i * 0.15 }));
    },
  };
  return bank;
}
