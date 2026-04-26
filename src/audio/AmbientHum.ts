// 37Hz substrate drone — the building thinking about humming.
// Synthesized via Web Audio API. Requires a user gesture before start.
// Intensity scales with substrateResonance (0–100).

const BASE_FREQ    = 37;    // primary hum frequency
const BASE_GAIN    = 0.10;  // quiet enough to be subliminal
const MOD_RATE     = 0.06;  // LFO rate in Hz — slow building-breath

let ctx:        AudioContext | null = null;
let masterGain: GainNode    | null = null;
let started = false;

function buildChain(): void {
  ctx = new AudioContext();
  masterGain = ctx.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(ctx.destination);

  // Primary 37Hz sine
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = BASE_FREQ;

  // 2nd harmonic (74Hz) for body
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = BASE_FREQ * 2;
  const g2 = ctx.createGain();
  g2.gain.value = 0.28;

  // Low-pass — keep it subwoofer range, nothing creeping above ~120Hz
  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 120;
  lpf.Q.value = 0.4;

  // Amplitude LFO — very slow, ±12% modulation
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = MOD_RATE;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.12;
  const oscCarrier = ctx.createGain();
  oscCarrier.gain.value = 0.88;

  lfo.connect(lfoGain);
  lfoGain.connect(oscCarrier.gain);

  osc.connect(lpf);
  lpf.connect(oscCarrier);
  oscCarrier.connect(masterGain);

  osc2.connect(g2);
  g2.connect(masterGain);

  osc.start();
  osc2.start();
  lfo.start();

  // 2-second fade-in
  masterGain.gain.setValueAtTime(0, ctx.currentTime);
  masterGain.gain.linearRampToValueAtTime(BASE_GAIN, ctx.currentTime + 2);
}

/** Call once — must be triggered from a user gesture (click / keydown / pointerdown). */
export function startHum(): void {
  if (started) return;
  started = true;
  try {
    buildChain();
  } catch {
    // Web Audio unavailable — fail silently
  }
}

/**
 * Adjust hum volume based on substrate resonance (0–100).
 * At resonance 0 the hum is barely there; at 100 it becomes oppressive.
 */
export function setHumIntensity(resonance: number): void {
  if (!masterGain || !ctx) return;
  const t = BASE_GAIN * (1 + (resonance / 100) * 1.8);
  masterGain.gain.setTargetAtTime(t, ctx.currentTime, 0.6);
}
