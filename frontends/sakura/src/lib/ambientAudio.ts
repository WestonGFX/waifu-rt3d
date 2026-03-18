/**
 * Procedural ambient audio generator using Web Audio API.
 *
 * Each soundscape function creates an AudioContext graph of oscillators, noise
 * generators, and filters that produce a continuous ambient loop. No audio files
 * are needed — everything is synthesized in real-time.
 *
 * @module ambientAudio
 *
 * @example
 * const controller = createRainscape();
 * controller.play();
 * controller.setVolume(0.5);
 * // later...
 * controller.stop();
 */

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

export interface AmbientController {
  /** Start playback. Safe to call multiple times — no-ops if already playing. */
  play: () => void;
  /** Stop playback and release audio resources. */
  stop: () => void;
  /** Set master volume (0–1). */
  setVolume: (v: number) => void;
  /** Whether the soundscape is currently playing. */
  isPlaying: () => boolean;
}

/* ═══════════════════════════════════════════════════════════════════════
   Shared utilities
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Create a noise buffer filled with white noise samples.
 *
 * @param ctx - AudioContext to use for buffer creation.
 * @param seconds - Buffer duration in seconds.
 * @returns An AudioBuffer containing random noise.
 */
function createNoiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * seconds;
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * Create a brown (Brownian) noise buffer by integrating white noise.
 * Produces a deeper, rumbling sound compared to white noise.
 *
 * @param ctx - AudioContext for buffer creation.
 * @param seconds - Buffer duration.
 * @returns An AudioBuffer containing brown noise.
 */
function createBrownNoiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * seconds;
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5; // Amplify — brown noise is quiet
  }
  return buffer;
}

/**
 * Scaffold for all ambient soundscapes. Manages AudioContext lifecycle,
 * master gain, and play/stop state.
 */
function createBaseController(
  setup: (ctx: AudioContext, masterGain: GainNode) => (() => void),
): AmbientController {
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let cleanup: (() => void) | null = null;
  let playing = false;
  let volume = 0.6;

  return {
    play() {
      if (playing) return;
      ctx = new AudioContext();
      masterGain = ctx.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(ctx.destination);
      cleanup = setup(ctx, masterGain);
      playing = true;
    },
    stop() {
      if (!playing) return;
      cleanup?.();
      cleanup = null;
      masterGain?.disconnect();
      ctx?.close();
      ctx = null;
      masterGain = null;
      playing = false;
    },
    setVolume(v: number) {
      volume = Math.max(0, Math.min(1, v));
      if (masterGain) {
        masterGain.gain.setTargetAtTime(volume, masterGain.context.currentTime, 0.1);
      }
    },
    isPlaying() {
      return playing;
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   Soundscape generators
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Café ambience — warm brown noise base with subtle resonant chatter
 * overtones simulated by band-passed noise at speech frequencies.
 */
export function createCafescape(): AmbientController {
  return createBaseController((ctx, master) => {
    // Base: warm brown noise (low rumble of a busy room)
    const brownBuf = createBrownNoiseBuffer(ctx, 4);
    const brownSrc = ctx.createBufferSource();
    brownSrc.buffer = brownBuf;
    brownSrc.loop = true;
    const brownLp = ctx.createBiquadFilter();
    brownLp.type = 'lowpass';
    brownLp.frequency.value = 800;
    const brownGain = ctx.createGain();
    brownGain.gain.value = 0.35;
    brownSrc.connect(brownLp).connect(brownGain).connect(master);
    brownSrc.start();

    // Chatter layer: band-passed white noise at speech frequencies (300–3kHz)
    const chatterBuf = createNoiseBuffer(ctx, 4);
    const chatterSrc = ctx.createBufferSource();
    chatterSrc.buffer = chatterBuf;
    chatterSrc.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    bp.Q.value = 0.8;
    const chatterGain = ctx.createGain();
    chatterGain.gain.value = 0.08;
    chatterSrc.connect(bp).connect(chatterGain).connect(master);
    chatterSrc.start();

    // Occasional clink: high-pitched filtered pings via oscillator LFO
    const clinkOsc = ctx.createOscillator();
    clinkOsc.type = 'sine';
    clinkOsc.frequency.value = 2800;
    const clinkGain = ctx.createGain();
    clinkGain.gain.value = 0;
    const clinkFilter = ctx.createBiquadFilter();
    clinkFilter.type = 'highpass';
    clinkFilter.frequency.value = 2000;
    clinkOsc.connect(clinkFilter).connect(clinkGain).connect(master);
    clinkOsc.start();

    // Schedule subtle clink pings at random intervals
    let clinkTimer: ReturnType<typeof setInterval> | null = null;
    const scheduleClick = () => {
      clinkTimer = setInterval(() => {
        const now = ctx.currentTime;
        clinkGain.gain.setValueAtTime(0, now);
        clinkGain.gain.linearRampToValueAtTime(0.015, now + 0.01);
        clinkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        // Slight frequency variation for natural sound
        clinkOsc.frequency.setValueAtTime(2400 + Math.random() * 800, now);
      }, 3000 + Math.random() * 5000);
    };
    scheduleClick();

    return () => {
      if (clinkTimer) clearInterval(clinkTimer);
      brownSrc.stop();
      chatterSrc.stop();
      clinkOsc.stop();
    };
  });
}

/**
 * Rain ambience — filtered white noise with random droplet pings
 * and a low-pass sweep that creates a "sheets of rain" effect.
 */
export function createRainscape(): AmbientController {
  return createBaseController((ctx, master) => {
    // Main rain: filtered white noise
    const noiseBuf = createNoiseBuffer(ctx, 4);
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4000;
    lp.Q.value = 1.2;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 200;

    const rainGain = ctx.createGain();
    rainGain.gain.value = 0.45;
    noiseSrc.connect(hp).connect(lp).connect(rainGain).connect(master);
    noiseSrc.start();

    // Wind layer: slow brown noise
    const windBuf = createBrownNoiseBuffer(ctx, 4);
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = windBuf;
    windSrc.loop = true;
    const windLp = ctx.createBiquadFilter();
    windLp.type = 'lowpass';
    windLp.frequency.value = 300;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.15;
    windSrc.connect(windLp).connect(windGain).connect(master);
    windSrc.start();

    // Droplet pings: short sine bursts at random high frequencies
    const dropOsc = ctx.createOscillator();
    dropOsc.type = 'sine';
    dropOsc.frequency.value = 4000;
    const dropGain = ctx.createGain();
    dropGain.gain.value = 0;
    dropOsc.connect(dropGain).connect(master);
    dropOsc.start();

    const dropTimer = setInterval(() => {
      const now = ctx.currentTime;
      const freq = 3000 + Math.random() * 3000;
      dropOsc.frequency.setValueAtTime(freq, now);
      dropGain.gain.setValueAtTime(0, now);
      dropGain.gain.linearRampToValueAtTime(0.02 + Math.random() * 0.02, now + 0.005);
      dropGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    }, 200 + Math.random() * 600);

    return () => {
      clearInterval(dropTimer);
      noiseSrc.stop();
      windSrc.stop();
      dropOsc.stop();
    };
  });
}

/**
 * Lo-Fi ambience — warm vinyl crackle noise layered with a slow,
 * muffled chord drone that evokes a cozy lo-fi beats atmosphere.
 */
export function createLofiscape(): AmbientController {
  return createBaseController((ctx, master) => {
    // Vinyl crackle: high-passed white noise at very low volume
    const crackleBuf = createNoiseBuffer(ctx, 4);
    const crackleSrc = ctx.createBufferSource();
    crackleSrc.buffer = crackleBuf;
    crackleSrc.loop = true;
    const crackleHp = ctx.createBiquadFilter();
    crackleHp.type = 'highpass';
    crackleHp.frequency.value = 5000;
    const crackleGain = ctx.createGain();
    crackleGain.gain.value = 0.04;
    crackleSrc.connect(crackleHp).connect(crackleGain).connect(master);
    crackleSrc.start();

    // Warm pad: layered detuned sine oscillators forming a Cmaj7 chord
    // through a low-pass filter for that muffled lo-fi sound
    const chordFreqs = [261.63, 329.63, 392.00, 493.88]; // C4, E4, G4, B4
    const oscs: OscillatorNode[] = [];
    const padGain = ctx.createGain();
    padGain.gain.value = 0.06;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 600;
    padFilter.Q.value = 2;

    for (const freq of chordFreqs) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      // Slight detune for warmth
      osc.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.005);
      osc.connect(padFilter);
      osc.start();
      oscs.push(osc);
    }
    padFilter.connect(padGain).connect(master);

    // Slow LFO on the pad filter to create gentle movement
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.1; // Very slow sweep
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 200;
    lfo.connect(lfoGain).connect(padFilter.frequency);
    lfo.start();

    // Subtle bass note
    const bassOsc = ctx.createOscillator();
    bassOsc.type = 'sine';
    bassOsc.frequency.value = 65.41; // C2
    const bassGain = ctx.createGain();
    bassGain.gain.value = 0.08;
    const bassFilter = ctx.createBiquadFilter();
    bassFilter.type = 'lowpass';
    bassFilter.frequency.value = 200;
    bassOsc.connect(bassFilter).connect(bassGain).connect(master);
    bassOsc.start();

    return () => {
      crackleSrc.stop();
      oscs.forEach(o => o.stop());
      lfo.stop();
      bassOsc.stop();
    };
  });
}

/**
 * Forest ambience — layered wind noise with random bird chirp
 * oscillators and a gentle low-frequency rustle.
 */
export function createForestscape(): AmbientController {
  return createBaseController((ctx, master) => {
    // Wind through trees: filtered brown noise
    const windBuf = createBrownNoiseBuffer(ctx, 4);
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = windBuf;
    windSrc.loop = true;
    const windBp = ctx.createBiquadFilter();
    windBp.type = 'bandpass';
    windBp.frequency.value = 500;
    windBp.Q.value = 0.5;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.25;
    windSrc.connect(windBp).connect(windGain).connect(master);
    windSrc.start();

    // Leaf rustle: high-passed noise, very subtle
    const rustleBuf = createNoiseBuffer(ctx, 4);
    const rustleSrc = ctx.createBufferSource();
    rustleSrc.buffer = rustleBuf;
    rustleSrc.loop = true;
    const rustleHp = ctx.createBiquadFilter();
    rustleHp.type = 'highpass';
    rustleHp.frequency.value = 3000;
    const rustleGain = ctx.createGain();
    rustleGain.gain.value = 0.04;
    rustleSrc.connect(rustleHp).connect(rustleGain).connect(master);
    rustleSrc.start();

    // Bird chirps: sine oscillator with rapid frequency sweeps
    const birdOsc = ctx.createOscillator();
    birdOsc.type = 'sine';
    birdOsc.frequency.value = 3000;
    const birdGain = ctx.createGain();
    birdGain.gain.value = 0;
    birdOsc.connect(birdGain).connect(master);
    birdOsc.start();

    const birdTimer = setInterval(() => {
      const now = ctx.currentTime;
      // Random chirp pattern: 1–3 quick notes
      const chirps = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < chirps; i++) {
        const t = now + i * 0.12;
        const baseFreq = 2500 + Math.random() * 2500;
        birdOsc.frequency.setValueAtTime(baseFreq, t);
        birdOsc.frequency.linearRampToValueAtTime(baseFreq * 1.3, t + 0.05);
        birdGain.gain.setValueAtTime(0, t);
        birdGain.gain.linearRampToValueAtTime(0.02, t + 0.01);
        birdGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      }
    }, 4000 + Math.random() * 8000);

    return () => {
      clearInterval(birdTimer);
      windSrc.stop();
      rustleSrc.stop();
      birdOsc.stop();
    };
  });
}

/**
 * City ambience — traffic rumble (brown noise), distant horn honks,
 * and a subtle hum that evokes urban white noise.
 */
export function createCityscape(): AmbientController {
  return createBaseController((ctx, master) => {
    // Traffic base: heavy brown noise
    const trafficBuf = createBrownNoiseBuffer(ctx, 4);
    const trafficSrc = ctx.createBufferSource();
    trafficSrc.buffer = trafficBuf;
    trafficSrc.loop = true;
    const trafficLp = ctx.createBiquadFilter();
    trafficLp.type = 'lowpass';
    trafficLp.frequency.value = 600;
    const trafficGain = ctx.createGain();
    trafficGain.gain.value = 0.3;
    trafficSrc.connect(trafficLp).connect(trafficGain).connect(master);
    trafficSrc.start();

    // General city hum: band-passed noise at low-mid frequencies
    const humBuf = createNoiseBuffer(ctx, 4);
    const humSrc = ctx.createBufferSource();
    humSrc.buffer = humBuf;
    humSrc.loop = true;
    const humBp = ctx.createBiquadFilter();
    humBp.type = 'bandpass';
    humBp.frequency.value = 250;
    humBp.Q.value = 1;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.1;
    humSrc.connect(humBp).connect(humGain).connect(master);
    humSrc.start();

    // Distant horn honks: sawtooth oscillator bursts
    const hornOsc = ctx.createOscillator();
    hornOsc.type = 'sawtooth';
    hornOsc.frequency.value = 440;
    const hornFilter = ctx.createBiquadFilter();
    hornFilter.type = 'lowpass';
    hornFilter.frequency.value = 800;
    const hornGain = ctx.createGain();
    hornGain.gain.value = 0;
    hornOsc.connect(hornFilter).connect(hornGain).connect(master);
    hornOsc.start();

    const hornTimer = setInterval(() => {
      const now = ctx.currentTime;
      const freq = 300 + Math.random() * 200;
      hornOsc.frequency.setValueAtTime(freq, now);
      // Short honk burst
      hornGain.gain.setValueAtTime(0, now);
      hornGain.gain.linearRampToValueAtTime(0.01 + Math.random() * 0.01, now + 0.05);
      const duration = 0.2 + Math.random() * 0.4;
      hornGain.gain.setValueAtTime(0.01, now + duration);
      hornGain.gain.exponentialRampToValueAtTime(0.001, now + duration + 0.2);
    }, 6000 + Math.random() * 12000);

    // Occasional siren: sweeping sine
    const sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sine';
    sirenOsc.frequency.value = 600;
    const sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();

    const sirenTimer = setInterval(() => {
      if (Math.random() > 0.3) return; // Only ~30% chance
      const now = ctx.currentTime;
      sirenGain.gain.setValueAtTime(0, now);
      sirenGain.gain.linearRampToValueAtTime(0.005, now + 0.5);
      sirenOsc.frequency.setValueAtTime(600, now);
      sirenOsc.frequency.linearRampToValueAtTime(900, now + 1);
      sirenOsc.frequency.linearRampToValueAtTime(600, now + 2);
      sirenGain.gain.setValueAtTime(0.005, now + 2);
      sirenGain.gain.exponentialRampToValueAtTime(0.001, now + 3);
    }, 20000 + Math.random() * 30000);

    return () => {
      clearInterval(hornTimer);
      clearInterval(sirenTimer);
      trafficSrc.stop();
      humSrc.stop();
      hornOsc.stop();
      sirenOsc.stop();
    };
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   Factory map
   ═══════════════════════════════════════════════════════════════════════ */

/** Map of soundscape label → factory function for easy lookup. */
export const SOUNDSCAPE_FACTORIES: Record<string, () => AmbientController> = {
  'Café': createCafescape,
  'Rain': createRainscape,
  'Lo-Fi': createLofiscape,
  'Forest': createForestscape,
  'City': createCityscape,
};
