import type { SceneState, RoomSettings, MasterSettings } from '../types';
import { createProceduralVoice } from './proceduralAudio';
import type { VoiceController } from './proceduralAudio';
import { createImpulseResponse } from './reverbGenerator';
import { audioBufferToWav } from './wavEncoder';

interface SourceAudioNodeChain {
  instanceId: string;
  voice: VoiceController;
  sourceGain: GainNode;
  airFilter: BiquadFilterNode;
  panner: PannerNode;
  reverbSend: GainNode;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private isRunning: boolean = false;

  // Master nodes
  private masterGain: GainNode | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;

  // Reverb nodes
  private reverbConvolver: ConvolverNode | null = null;
  private reverbWetGain: GainNode | null = null;
  private reverbDryGain: GainNode | null = null;

  // Active sources map: instanceId -> SourceAudioNodeChain
  private sourceChains: Map<string, SourceAudioNodeChain> = new Map();

  // Cached settings
  private currentRoom: RoomSettings | null = null;

  // Meter buffers
  private timeDomainBuffer: Float32Array = new Float32Array(512);

  constructor() {
    // Lazy AudioContext initialization on user gesture
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public getIsRunning(): boolean {
    return this.isRunning && this.ctx?.state === 'running';
  }

  // Initialize or resume AudioContext
  public async initOrResume(): Promise<boolean> {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.setupMasterGraph();
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.isRunning = true;
    return this.ctx.state === 'running';
  }

  private setupMasterGraph(): void {
    if (!this.ctx) return;

    // Master Gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

    // Master Limiter / Compressor to prevent digital clipping
    this.masterCompressor = this.ctx.createDynamicsCompressor();
    this.masterCompressor.threshold.setValueAtTime(-1.5, this.ctx.currentTime);
    this.masterCompressor.knee.setValueAtTime(4, this.ctx.currentTime);
    this.masterCompressor.ratio.setValueAtTime(12, this.ctx.currentTime);
    this.masterCompressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.masterCompressor.release.setValueAtTime(0.15, this.ctx.currentTime);

    // Analyser Node for real-time oscilloscope & VU metering
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.6;
    this.timeDomainBuffer = new Float32Array(this.analyser.fftSize);

    // Reverb Subsystem
    this.reverbConvolver = this.ctx.createConvolver();
    this.reverbWetGain = this.ctx.createGain();
    this.reverbDryGain = this.ctx.createGain();

    this.reverbWetGain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    this.reverbDryGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

    // Convolver -> Wet Gain -> Master Gain
    this.reverbConvolver.connect(this.reverbWetGain).connect(this.masterGain);

    // Dry path -> Master Gain
    this.reverbDryGain.connect(this.masterGain);

    // Master Gain -> Compressor -> Analyser -> Speakers
    this.masterGain.connect(this.masterCompressor);
    this.masterCompressor.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  public async play(): Promise<void> {
    await this.initOrResume();
    this.isRunning = true;
  }

  public pause(): void {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend();
    }
    this.isRunning = false;
  }

  public stop(): void {
    this.pause();
    // Fade out or reset if needed
  }

  // Update Reverb Impulse Response when room properties change
  public updateRoomAcoustics(room: RoomSettings): void {
    if (!this.ctx || !this.reverbConvolver || !this.reverbWetGain || !this.reverbDryGain) return;
    this.currentRoom = room;

    const duration = room.size === 'small' ? 1.2 : room.size === 'medium' ? 2.4 : room.size === 'large' ? 4.2 : 6.5;
    const impulse = createImpulseResponse(this.ctx, duration, room.decay, room.damping);
    this.reverbConvolver.buffer = impulse;

    const wet = room.reverbAmount * room.wetDry;
    const dry = 1.0 - room.reverbAmount * 0.3;

    this.reverbWetGain.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.05);
    this.reverbDryGain.gain.setTargetAtTime(dry, this.ctx.currentTime, 0.05);
  }

  public updateMasterSettings(master: MasterSettings): void {
    if (!this.ctx || !this.masterGain) return;

    const effectiveVolume = master.isMuted ? 0 : master.volume * master.intensity;
    this.masterGain.gain.setTargetAtTime(effectiveVolume, this.ctx.currentTime, 0.05);
  }

  // Sync entire scene graph with zero interruption
  public syncScene(scene: SceneState): void {
    if (!this.ctx) return;

    this.updateMasterSettings(scene.master);
    if (!this.currentRoom || JSON.stringify(this.currentRoom) !== JSON.stringify(scene.room)) {
      this.updateRoomAcoustics(scene.room);
    }

    const anySolo = scene.sources.some((s) => s.isSolo);
    const sceneSourceIds = new Set(scene.sources.map((s) => s.instanceId));

    // Remove defunct sources
    for (const [id, chain] of this.sourceChains.entries()) {
      if (!sceneSourceIds.has(id)) {
        chain.voice.dispose();
        try {
          chain.sourceGain.disconnect();
          chain.airFilter.disconnect();
          chain.panner.disconnect();
          chain.reverbSend.disconnect();
        } catch (_) {}
        this.sourceChains.delete(id);
      }
    }

    // Update or add sources
    for (const source of scene.sources) {
      // Calculate effective volume based on mute and solo states
      let targetGain = source.volume;
      if (source.isMuted) {
        targetGain = 0;
      } else if (anySolo && !source.isSolo) {
        targetGain = 0;
      }

      // Distance from center listener (0, 0)
      const distance = Math.sqrt(source.x * source.x + source.y * source.y);
      // Atmospheric air damping (muffles high frequencies as sound gets further)
      const airCutoff = Math.max(1800, 20000 - distance * 1600);

      const existing = this.sourceChains.get(source.instanceId);

      if (existing) {
        // Update existing source nodes
        existing.sourceGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.04);
        existing.airFilter.frequency.setTargetAtTime(airCutoff, this.ctx.currentTime, 0.05);

        // Update 3D PannerNode coordinates: X (left/right), Z (front/back)
        existing.panner.positionX.setTargetAtTime(source.x, this.ctx.currentTime, 0.05);
        existing.panner.positionY.setTargetAtTime(0, this.ctx.currentTime, 0.05);
        existing.panner.positionZ.setTargetAtTime(source.y, this.ctx.currentTime, 0.05);

        existing.voice.updateParams({
          volume: 1.0,
          pitch: source.pitch,
          triggerRate: source.triggerRate,
          drift: source.drift,
        });
      } else {
        // Build new source audio node chain
        const sourceGain = this.ctx.createGain();
        sourceGain.gain.setValueAtTime(targetGain, this.ctx.currentTime);

        const airFilter = this.ctx.createBiquadFilter();
        airFilter.type = 'lowpass';
        airFilter.frequency.setValueAtTime(airCutoff, this.ctx.currentTime);

        // Web Audio HRTF Panner
        const panner = this.ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1.0;
        panner.maxDistance = 15.0;
        panner.rolloffFactor = 1.2;
        panner.coneInnerAngle = 360;

        panner.positionX.setValueAtTime(source.x, this.ctx.currentTime);
        panner.positionY.setValueAtTime(0, this.ctx.currentTime);
        panner.positionZ.setValueAtTime(source.y, this.ctx.currentTime);

        const reverbSend = this.ctx.createGain();
        reverbSend.gain.setValueAtTime(scene.room.reverbAmount * 0.5, this.ctx.currentTime);

        // Connect chain: Voice -> SourceGain -> AirFilter -> Panner -> Dry & Reverb Send
        sourceGain.connect(airFilter);
        airFilter.connect(panner);

        if (this.reverbDryGain) {
          panner.connect(this.reverbDryGain);
        }
        if (this.reverbConvolver) {
          panner.connect(reverbSend);
          reverbSend.connect(this.reverbConvolver);
        }

        const voice = createProceduralVoice(this.ctx, sourceGain, source.proceduralType, {
          volume: 1.0,
          pitch: source.pitch,
          triggerRate: source.triggerRate,
          drift: source.drift,
        });

        this.sourceChains.set(source.instanceId, {
          instanceId: source.instanceId,
          voice,
          sourceGain,
          airFilter,
          panner,
          reverbSend,
        });
      }
    }
  }

  // Get real-time audio statistics for VU meters and CRT oscilloscope
  public getMeterData(): {
    rmsDb: number;
    peakDb: number;
    isClipping: boolean;
    waveform: Float32Array;
  } {
    if (!this.analyser) {
      return { rmsDb: -96, peakDb: -96, isClipping: false, waveform: new Float32Array(0) };
    }

    (this.analyser as any).getFloatTimeDomainData(this.timeDomainBuffer);

    let sum = 0;
    let peak = 0;
    const len = this.timeDomainBuffer.length;

    for (let i = 0; i < len; i++) {
      const abs = Math.abs(this.timeDomainBuffer[i]);
      if (abs > peak) peak = abs;
      sum += abs * abs;
    }

    const rms = Math.sqrt(sum / len);
    const rmsDb = rms > 0.00001 ? 20 * Math.log10(rms) : -96;
    const peakDb = peak > 0.00001 ? 20 * Math.log10(peak) : -96;
    const isClipping = peak >= 0.99;

    return {
      rmsDb: Math.max(-96, Math.min(6, rmsDb)),
      peakDb: Math.max(-96, Math.min(6, peakDb)),
      isClipping,
      waveform: this.timeDomainBuffer,
    };
  }

  // Render authentic 16-bit PCM WAV using OfflineAudioContext
  public async exportOfflineWav(
    scene: SceneState,
    durationSeconds: number = 15,
    onProgress?: (percent: number) => void
  ): Promise<Blob> {
    const sampleRate = 44100;
    const length = Math.floor(sampleRate * durationSeconds);
    const offlineCtx = new OfflineAudioContext(2, length, sampleRate);

    // Setup Offline Master Graph
    const offMasterGain = offlineCtx.createGain();
    const effVol = scene.master.isMuted ? 0 : scene.master.volume * scene.master.intensity;
    offMasterGain.gain.setValueAtTime(effVol, 0);

    const offLimiter = offlineCtx.createDynamicsCompressor();
    offLimiter.threshold.setValueAtTime(-1.5, 0);
    offLimiter.ratio.setValueAtTime(12, 0);

    const offReverb = offlineCtx.createConvolver();
    const offReverbWet = offlineCtx.createGain();
    const offReverbDry = offlineCtx.createGain();

    const impulse = createImpulseResponse(offlineCtx, 3.0, scene.room.decay, scene.room.damping);
    offReverb.buffer = impulse;

    offReverbWet.gain.setValueAtTime(scene.room.reverbAmount * scene.room.wetDry, 0);
    offReverbDry.gain.setValueAtTime(1.0 - scene.room.reverbAmount * 0.3, 0);

    offReverb.connect(offReverbWet).connect(offMasterGain);
    offReverbDry.connect(offMasterGain);
    offMasterGain.connect(offLimiter).connect(offlineCtx.destination);

    const anySolo = scene.sources.some((s) => s.isSolo);

    // Setup sources on offline graph
    for (const source of scene.sources) {
      let targetGain = source.volume;
      if (source.isMuted || (anySolo && !source.isSolo)) {
        targetGain = 0;
      }
      if (targetGain <= 0.001) continue;

      const sGain = offlineCtx.createGain();
      sGain.gain.setValueAtTime(targetGain, 0);

      const distance = Math.sqrt(source.x * source.x + source.y * source.y);
      const airCutoff = Math.max(1800, 20000 - distance * 1600);

      const airF = offlineCtx.createBiquadFilter();
      airF.type = 'lowpass';
      airF.frequency.setValueAtTime(airCutoff, 0);

      const panner = offlineCtx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1.0;
      panner.maxDistance = 15.0;
      panner.rolloffFactor = 1.2;

      panner.positionX.setValueAtTime(source.x, 0);
      panner.positionY.setValueAtTime(0, 0);
      panner.positionZ.setValueAtTime(source.y, 0);

      sGain.connect(airF).connect(panner);
      panner.connect(offReverbDry);

      const revSend = offlineCtx.createGain();
      revSend.gain.setValueAtTime(scene.room.reverbAmount * 0.5, 0);
      panner.connect(revSend).connect(offReverb);

      // Create procedural sound source in offline context
      createProceduralVoice(offlineCtx, sGain, source.proceduralType, {
        volume: 1.0,
        pitch: source.pitch,
        triggerRate: source.triggerRate,
        drift: source.drift,
      });
    }

    if (onProgress) onProgress(30);

    // Render audio
    const renderedBuffer = await offlineCtx.startRendering();
    if (onProgress) onProgress(80);

    // Encode to WAV Blob
    const wavBlob = audioBufferToWav(renderedBuffer);
    if (onProgress) onProgress(100);

    return wavBlob;
  }
}

// Global shared singleton
export const audioEngine = new AudioEngine();
