// Synthesized sound effects: WebAudio only, no audio files and no network. The
// context is created lazily on the first user gesture and every call is a no-op
// until then, so headless captures and muted browsers stay silent and error-free.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  // Create (or resume) the context. Returns false when the browser has no
  // WebAudio at all; callers never have to check.
  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      ctx = new AudioContextClass();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  // A burst of filtered noise that decays to silence.
  function noise(duration, filterFreq, gainValue, when = 0) {
    if (!ensure()) return;
    const start = ctx.currentTime + when;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  // A tone, optionally sliding to another frequency as it decays.
  function tone(freq, duration, type, gainValue, when = 0, slideTo = 0) {
    if (!ensure()) return;
    const start = ctx.currentTime + when;
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, start);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  // The first gesture unlocks audio; browsers forbid starting it before one.
  window.addEventListener('pointerdown', ensure, { once: true });
  window.addEventListener('keydown', ensure, { once: true });

  return {
    unlock: ensure,
    shot(kind) {
      if (kind === 'shotgun') noise(0.22, 900, 0.9);
      else if (kind === 'smg') noise(0.08, 1600, 0.5);
      else noise(0.12, 1200, 0.7);
      tone(160, 0.08, 'square', 0.18, 0, 60);
    },
    enemyShot() {
      noise(0.1, 900, 0.25);
    },
    dry() {
      tone(1400, 0.03, 'square', 0.12);
    },
    reload() {
      tone(500, 0.04, 'square', 0.12);
      tone(700, 0.04, 'square', 0.12, 0.25);
    },
    hit() {
      tone(1250, 0.05, 'square', 0.2);
    },
    kill() {
      tone(880, 0.07, 'square', 0.2);
      tone(1320, 0.1, 'square', 0.2, 0.08);
    },
    explosion() {
      noise(0.7, 400, 1.0);
      tone(90, 0.6, 'sine', 0.7, 0, 35);
    },
    plantBeep() {
      tone(880, 0.06, 'square', 0.16);
    },
    plantDone() {
      tone(660, 0.09, 'square', 0.2);
      tone(990, 0.14, 'square', 0.2, 0.1);
    },
    defuseBeep() {
      tone(1100, 0.05, 'square', 0.14);
    },
    buy() {
      tone(990, 0.06, 'sine', 0.25);
      tone(1480, 0.09, 'sine', 0.25, 0.07);
    },
    roundWin() {
      tone(523, 0.12, 'sine', 0.25);
      tone(659, 0.12, 'sine', 0.25, 0.12);
      tone(784, 0.2, 'sine', 0.25, 0.24);
    },
    roundLose() {
      tone(392, 0.16, 'sine', 0.25);
      tone(311, 0.24, 'sine', 0.25, 0.16);
    },
    hurt() {
      noise(0.12, 500, 0.4);
      tone(110, 0.12, 'sawtooth', 0.15, 0, 70);
    },
  };
}
