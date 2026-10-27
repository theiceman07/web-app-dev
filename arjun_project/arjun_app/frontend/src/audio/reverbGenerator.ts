// Algorithmic Synthetic Impulse Response Generator for Web Audio ConvolverNode
export function createImpulseResponse(
  ctx: BaseAudioContext,
  duration: number = 2.5,
  decay: number = 2.0,
  damping: number = 0.5
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(sampleRate * 0.1, Math.floor(sampleRate * duration));
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  // Exponential decay curve adjusted for damping (high frequency loss over time)
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    // Base exponential decay
    const envelope = Math.exp(-t * (3.0 / Math.max(0.1, decay)));

    // Damping factor: smooth high frequency attenuation over time
    const dampingDecay = Math.max(0, 1 - (t / duration) * damping * 0.8);

    // Random white noise with stereophonic decorrelation
    const noiseL = (Math.random() * 2 - 1) * dampingDecay;
    const noiseR = (Math.random() * 2 - 1) * dampingDecay;

    // Apply envelope with early reflections density buildup
    const density = Math.min(1.0, t * 25);
    left[i] = noiseL * envelope * density;
    right[i] = noiseR * envelope * density;
  }

  return impulse;
}
