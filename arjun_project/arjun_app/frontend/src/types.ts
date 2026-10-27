export type SoundCategory =
  | 'fire'
  | 'water'
  | 'weather'
  | 'nature'
  | 'movement'
  | 'interior'
  | 'industrial'
  | 'scifi';

export type ProceduralType =
  | 'torch_crackle'
  | 'water_drops'
  | 'wind_gusts'
  | 'tomb_drone'
  | 'campfire_hearth'
  | 'rain_slate'
  | 'distant_thunder'
  | 'night_crickets'
  | 'ocean_surf'
  | 'forest_whisper'
  | 'floor_creak'
  | 'clock_tick'
  | 'steam_pipe'
  | 'scifi_airlock'
  | 'neon_buzz'
  | 'gravel_footsteps';

export interface SoundSourceDef {
  id: string;
  name: string;
  category: SoundCategory;
  iconName: string;
  description: string;
  proceduralType: ProceduralType;
  defaultVolume: number; // 0 to 1
  defaultTriggerRate: number; // Hz or occurrences per 10s (0.1 to 10)
  defaultDrift: number; // 0 to 1 (variation/randomness)
  defaultPitch: number; // 0.5 to 2.0 (playback rate or frequency multiplier)
  tags: string[];
}

export interface SoundSourceInstance {
  instanceId: string;
  defId: string;
  name: string;
  category: SoundCategory;
  iconName: string;
  proceduralType: ProceduralType;
  // Spatial coordinates: centered at (0, 0), clamped to [-10, 10] meters
  x: number;
  y: number;
  volume: number; // 0 to 1
  pitch: number; // 0.5 to 2.0
  triggerRate: number; // 0.1 to 10
  drift: number; // 0 to 1
  isMuted: boolean;
  isSolo: boolean;
  color?: string;
}

export type RoomSizeType = 'small' | 'medium' | 'large' | 'cathedral';

export interface RoomSettings {
  size: RoomSizeType;
  reverbAmount: number; // 0 to 1 (wet/dry or send)
  decay: number; // 0.2 to 8.0 seconds
  damping: number; // 0 to 1 (high frequency absorption)
  wetDry: number; // 0 to 1
}

export interface MasterSettings {
  volume: number; // 0 to 1
  intensity: number; // 0 to 1 (macro dynamic scaling)
  isMuted: boolean;
  limiterEnabled: boolean;
}

export interface SceneState {
  id: string;
  name: string;
  sources: SoundSourceInstance[];
  room: RoomSettings;
  master: MasterSettings;
  selectedSourceId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  category: string;
  sources: Omit<SoundSourceInstance, 'instanceId'>[];
  room: RoomSettings;
  master: MasterSettings;
  isCustom?: boolean;
}
