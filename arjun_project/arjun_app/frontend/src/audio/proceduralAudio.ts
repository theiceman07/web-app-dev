import type { ProceduralType } from '../types';

export interface VoiceController {
  updateParams: (params: { volume: number; pitch: number; triggerRate: number; drift: number }) => void;
  dispose: () => void;
}

// Generate a 4-second looping pink noise buffer (1/f)
function getPinkNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const bufferSize = ctx.sampleRate * 4;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buffer;
}

// Generate a 4-second brownian noise buffer (1/f^2)
function getBrownNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const bufferSize = ctx.sampleRate * 4;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  let lastOut = 0.0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    data[i] = (lastOut + 0.02 * white) / 1.02;
    lastOut = data[i];
    data[i] *= 3.5; // Gain compensation
  }
  return buffer;
}

// Generate 2-second white noise buffer
function getWhiteNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export function createProceduralVoice(
  ctx: BaseAudioContext,
  outputNode: AudioNode,
  type: ProceduralType,
  initialParams: { volume: number; pitch: number; triggerRate: number; drift: number }
): VoiceController {
  const isOffline = ctx instanceof OfflineAudioContext;
  let active = true;
  let params = { ...initialParams };
  const disposables: (() => void)[] = [];
  const intervals: any[] = [];

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(params.volume, ctx.currentTime);
  voiceGain.connect(outputNode);

  const pinkBuffer = getPinkNoiseBuffer(ctx);
  const brownBuffer = getBrownNoiseBuffer(ctx);
  const whiteBuffer = getWhiteNoiseBuffer(ctx);

  switch (type) {
    case 'torch_crackle': {
      // Base gentle combustion hiss
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = brownBuffer;
      noiseSource.loop = true;

      const baseFilter = ctx.createBiquadFilter();
      baseFilter.type = 'bandpass';
      baseFilter.frequency.value = 450 * params.pitch;
      baseFilter.Q.value = 1.2;

      const baseGain = ctx.createGain();
      baseGain.gain.value = 0.45;

      noiseSource.connect(baseFilter).connect(baseGain).connect(voiceGain);
      noiseSource.start();
      disposables.push(() => {
        try { noiseSource.stop(); } catch (_) {}
      });

      // Randomized pop and crackle bursts
      const triggerPop = () => {
        if (!active) return;
        const now = ctx.currentTime;
        const popSource = ctx.createBufferSource();
        popSource.buffer = whiteBuffer;

        const popFilter = ctx.createBiquadFilter();
        popFilter.type = 'bandpass';
        popFilter.frequency.value = (1200 + Math.random() * 2500) * params.pitch;
        popFilter.Q.value = 3.0 + Math.random() * 4.0;

        const popGain = ctx.createGain();
        const duration = 0.015 + Math.random() * 0.04;
        const amp = 0.4 + Math.random() * 0.6;
        popGain.gain.setValueAtTime(0, now);
        popGain.gain.linearRampToValueAtTime(amp, now + 0.003);
        popGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        popSource.connect(popFilter).connect(popGain).connect(voiceGain);
        popSource.start(now);
        popSource.stop(now + duration + 0.01);

        if (!isOffline && active) {
          const delay = (1000 / Math.max(0.2, params.triggerRate)) * (1 + (Math.random() - 0.5) * params.drift);
          const t = setTimeout(triggerPop, Math.max(80, delay));
          intervals.push(t);
        }
      };

      if (isOffline) {
        // Pre-schedule offline events
        const totalDuration = (ctx as OfflineAudioContext).length / ctx.sampleRate;
        let t = 0.1;
        while (t < totalDuration) {
          const popSource = ctx.createBufferSource();
          popSource.buffer = whiteBuffer;
          const popFilter = ctx.createBiquadFilter();
          popFilter.type = 'bandpass';
          popFilter.frequency.value = (1200 + Math.random() * 2500) * params.pitch;
          popFilter.Q.value = 4.0;
          const popGain = ctx.createGain();
          const duration = 0.03;
          popGain.gain.setValueAtTime(0, t);
          popGain.gain.linearRampToValueAtTime(0.5, t + 0.003);
          popGain.gain.exponentialRampToValueAtTime(0.001, t + duration);
          popSource.connect(popFilter).connect(popGain).connect(voiceGain);
          popSource.start(t);
          popSource.stop(t + duration + 0.01);
          t += (1.0 / Math.max(0.5, params.triggerRate)) * (0.8 + Math.random() * 0.4);
        }
      } else {
        triggerPop();
      }
      break;
    }

    case 'water_drops': {
      // Impulsive resonant droplet generator
      const triggerDrop = () => {
        if (!active) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const dropGain = ctx.createGain();

        // Rapid downward frequency chirp characteristic of water drop impact
        const baseFreq = (1100 + Math.random() * 800) * params.pitch;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.015);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, now + 0.09);

        dropGain.gain.setValueAtTime(0, now);
        dropGain.gain.linearRampToValueAtTime(0.7, now + 0.005);
        dropGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

        osc.connect(dropGain).connect(voiceGain);
        osc.start(now);
        osc.stop(now + 0.13);

        if (!isOffline && active) {
          const delay = (1000 / Math.max(0.1, params.triggerRate)) * (1 + (Math.random() - 0.5) * params.drift * 1.2);
          const t = setTimeout(triggerDrop, Math.max(150, delay));
          intervals.push(t);
        }
      };

      if (isOffline) {
        const totalDuration = (ctx as OfflineAudioContext).length / ctx.sampleRate;
        let t = 0.2;
        while (t < totalDuration) {
          const osc = ctx.createOscillator();
          const dropGain = ctx.createGain();
          const baseFreq = (1200 + Math.random() * 600) * params.pitch;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(baseFreq, t);
          osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.4, t + 0.015);
          osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, t + 0.09);
          dropGain.gain.setValueAtTime(0, t);
          dropGain.gain.linearRampToValueAtTime(0.7, t + 0.005);
          dropGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
          osc.connect(dropGain).connect(voiceGain);
          osc.start(t);
          osc.stop(t + 0.13);
          t += (1.0 / Math.max(0.2, params.triggerRate)) * (0.6 + Math.random() * 0.8);
        }
      } else {
        triggerDrop();
      }
      break;
    }

    case 'wind_gusts': {
      // Modulated pink noise filtered with slow sweeping LFO
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = pinkBuffer;
      noiseSource.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 350 * params.pitch;
      filter.Q.value = 1.6;

      // Slow LFO sweeping the wind howling resonance
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.18 * params.triggerRate;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 280 * (params.drift + 0.3);

      lfo.connect(lfoGain).connect(filter.frequency);

      noiseSource.connect(filter).connect(voiceGain);
      noiseSource.start();
      lfo.start();

      disposables.push(() => {
        try {
          noiseSource.stop();
          lfo.stop();
        } catch (_) {}
      });
      break;
    }

    case 'tomb_drone': {
      // Sub-bass resonant subterranean drone with chorused beating
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();

      osc1.type = 'sine';
      osc2.type = 'triangle';

      const fundamental = 55 * params.pitch;
      osc1.frequency.value = fundamental;
      osc2.frequency.value = fundamental * 1.015; // 0.8Hz acoustic beat

      filter.type = 'lowpass';
      filter.frequency.value = 180;
      filter.Q.value = 3.0;

      const subGain = ctx.createGain();
      subGain.gain.value = 0.6;

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(subGain).connect(voiceGain);

      osc1.start();
      osc2.start();

      disposables.push(() => {
        try {
          osc1.stop();
          osc2.stop();
        } catch (_) {}
      });
      break;
    }

    case 'campfire_hearth': {
      // Rich low-frequency combustion + intermittent warm pops
      const noise = ctx.createBufferSource();
      noise.buffer = brownBuffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 380 * params.pitch;
      filter.Q.value = 1.0;

      noise.connect(filter).connect(voiceGain);
      noise.start();
      disposables.push(() => {
        try { noise.stop(); } catch (_) {}
      });

      // Hearth pops
      const triggerHearthPop = () => {
        if (!active) return;
        const now = ctx.currentTime;
        const pop = ctx.createBufferSource();
        pop.buffer = whiteBuffer;
        const pFilter = ctx.createBiquadFilter();
        pFilter.type = 'bandpass';
        pFilter.frequency.value = 800 + Math.random() * 1200;
        pFilter.Q.value = 4.0;
        const pGain = ctx.createGain();
        pGain.gain.setValueAtTime(0.5, now);
        pGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        pop.connect(pFilter).connect(pGain).connect(voiceGain);
        pop.start(now);
        pop.stop(now + 0.05);

        if (!isOffline && active) {
          const delay = (1000 / Math.max(0.2, params.triggerRate)) * (0.8 + Math.random() * 0.6);
          const t = setTimeout(triggerHearthPop, delay);
          intervals.push(t);
        }
      };

      if (!isOffline) triggerHearthPop();
      break;
    }

    case 'rain_slate': {
      // Dense microscopic water texture
      const noise = ctx.createBufferSource();
      noise.buffer = pinkBuffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 950 * params.pitch;

      const filter2 = ctx.createBiquadFilter();
      filter2.type = 'lowpass';
      filter2.frequency.value = 6500;

      noise.connect(filter).connect(filter2).connect(voiceGain);
      noise.start();
      disposables.push(() => {
        try { noise.stop(); } catch (_) {}
      });
      break;
    }

    case 'distant_thunder': {
      // Periodic rolling thunder
      const triggerThunder = () => {
        if (!active) return;
        const now = ctx.currentTime;
        const noise = ctx.createBufferSource();
        noise.buffer = brownBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(80 * params.pitch, now);
        filter.frequency.linearRampToValueAtTime(140 * params.pitch, now + 0.8);
        filter.frequency.linearRampToValueAtTime(60 * params.pitch, now + 3.5);
        filter.Q.value = 4.5;

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.85, now + 0.4);
        g.gain.exponentialRampToValueAtTime(0.001, now + 3.8);

        noise.connect(filter).connect(g).connect(voiceGain);
        noise.start(now);
        noise.stop(now + 4.0);

        if (!isOffline && active) {
          const delay = (10000 / Math.max(0.1, params.triggerRate)) * (0.8 + Math.random() * 0.8);
          const t = setTimeout(triggerThunder, delay);
          intervals.push(t);
        }
      };

      if (!isOffline) triggerThunder();
      break;
    }

    case 'night_crickets': {
      // High-frequency pulsed oscillation (4.8 kHz) with 14 Hz AM
      const carrier = ctx.createOscillator();
      carrier.type = 'sine';
      carrier.frequency.value = 4600 * params.pitch;

      const amMod = ctx.createOscillator();
      amMod.type = 'square';
      amMod.frequency.value = 13.5;

      const amGain = ctx.createGain();
      amGain.gain.value = 0.5;

      const gateGain = ctx.createGain();
      gateGain.gain.value = 0.4;

      amMod.connect(gateGain.gain);
      carrier.connect(gateGain).connect(voiceGain);

      carrier.start();
      amMod.start();

      disposables.push(() => {
        try {
          carrier.stop();
          amMod.stop();
        } catch (_) {}
      });
      break;
    }

    case 'ocean_surf': {
      // Dual-phase slow pink noise breathing swell
      const noise = ctx.createBufferSource();
      noise.buffer = pinkBuffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600 * params.pitch;

      const surfLfo = ctx.createOscillator();
      surfLfo.type = 'sine';
      surfLfo.frequency.value = 0.12 * params.triggerRate; // ~8-second wave cycle

      const surfGain = ctx.createGain();
      surfGain.gain.value = 0.4;

      surfLfo.connect(surfGain.gain);
      noise.connect(filter).connect(surfGain).connect(voiceGain);

      noise.start();
      surfLfo.start();

      disposables.push(() => {
        try {
          noise.stop();
          surfLfo.stop();
        } catch (_) {}
      });
      break;
    }

    case 'forest_whisper': {
      // Filtered pink noise with organic breath
      const noise = ctx.createBufferSource();
      noise.buffer = pinkBuffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1400 * params.pitch;
      filter.Q.value = 1.0;

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.25;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.3;
      lfo.connect(lfoG.gain);

      noise.connect(filter).connect(lfoG).connect(voiceGain);
      noise.start();
      lfo.start();
      disposables.push(() => {
        try { noise.stop(); lfo.stop(); } catch (_) {}
      });
      break;
    }

    case 'floor_creak': {
      // Groaning wood resonance
      const triggerCreak = () => {
        if (!active) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        const startF = (240 + Math.random() * 80) * params.pitch;
        osc.frequency.setValueAtTime(startF, now);
        osc.frequency.exponentialRampToValueAtTime(startF * 0.6, now + 0.25);

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 550;
        filter.Q.value = 4.0;

        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.5, now + 0.04);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        osc.connect(filter).connect(g).connect(voiceGain);
        osc.start(now);
        osc.stop(now + 0.3);

        if (!isOffline && active) {
          const delay = (7000 / Math.max(0.1, params.triggerRate)) * (0.7 + Math.random() * 0.6);
          const t = setTimeout(triggerCreak, delay);
          intervals.push(t);
        }
      };

      if (!isOffline) triggerCreak();
      break;
    }

    case 'clock_tick': {
      // Clean mechanical escapement tick
      let tickTock = true;
      const triggerTick = () => {
        if (!active) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = (tickTock ? 1200 : 900) * params.pitch;
        tickTock = !tickTock;

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.6, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

        osc.connect(g).connect(voiceGain);
        osc.start(now);
        osc.stop(now + 0.04);

        if (!isOffline && active) {
          const delay = 1000 / Math.max(0.2, params.triggerRate);
          const t = setTimeout(triggerTick, delay);
          intervals.push(t);
        }
      };

      if (!isOffline) triggerTick();
      break;
    }

    case 'steam_pipe': {
      // Pressurized hiss vent
      const noise = ctx.createBufferSource();
      noise.buffer = whiteBuffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 2800 * params.pitch;
      filter.Q.value = 2.5;

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.4;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.35;
      lfo.connect(lfoG.gain);

      noise.connect(filter).connect(lfoG).connect(voiceGain);
      noise.start();
      lfo.start();

      disposables.push(() => {
        try { noise.stop(); lfo.stop(); } catch (_) {}
      });
      break;
    }

    case 'scifi_airlock': {
      // Sub hum + servo whine
      const sub = ctx.createOscillator();
      sub.type = 'sawtooth';
      sub.frequency.value = 65 * params.pitch;

      const subF = ctx.createBiquadFilter();
      subF.type = 'lowpass';
      subF.frequency.value = 220;

      sub.connect(subF).connect(voiceGain);
      sub.start();

      disposables.push(() => {
        try { sub.stop(); } catch (_) {}
      });
      break;
    }

    case 'neon_buzz': {
      // 60Hz mains hum with electric saw spikes
      const hum = ctx.createOscillator();
      hum.type = 'sawtooth';
      hum.frequency.value = 60 * params.pitch;

      const humFilter = ctx.createBiquadFilter();
      humFilter.type = 'bandpass';
      humFilter.frequency.value = 180;
      humFilter.Q.value = 3.0;

      hum.connect(humFilter).connect(voiceGain);
      hum.start();

      disposables.push(() => {
        try { hum.stop(); } catch (_) {}
      });
      break;
    }

    default: {
      // Fallback ambient pink noise
      const noise = ctx.createBufferSource();
      noise.buffer = pinkBuffer;
      noise.loop = true;
      noise.connect(voiceGain);
      noise.start();
      disposables.push(() => {
        try { noise.stop(); } catch (_) {}
      });
      break;
    }
  }

  return {
    updateParams: (newParams) => {
      params = { ...newParams };
      voiceGain.gain.setTargetAtTime(params.volume, ctx.currentTime, 0.05);
    },
    dispose: () => {
      active = false;
      intervals.forEach((id) => clearTimeout(id));
      disposables.forEach((fn) => fn());
      try {
        voiceGain.disconnect();
      } catch (_) {}
    },
  };
}
