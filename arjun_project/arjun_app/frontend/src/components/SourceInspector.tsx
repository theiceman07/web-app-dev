import React, { useState } from 'react';
import type { SoundSourceInstance, RoomSettings, MasterSettings, RoomSizeType } from '../types';
import { RotaryKnob } from './RotaryKnob';
import * as Icons from '../icons';

interface SourceInspectorProps {
  selectedSource: SoundSourceInstance | null;
  room: RoomSettings;
  master: MasterSettings;
  onUpdateSource: (updated: SoundSourceInstance) => void;
  onRemoveSource: (id: string) => void;
  onUpdateRoom: (room: RoomSettings) => void;
  onUpdateMaster: (master: MasterSettings) => void;
  onResetSource: (id: string) => void;
}

export const SourceInspector: React.FC<SourceInspectorProps> = ({
  selectedSource,
  room,
  master,
  onUpdateSource,
  onRemoveSource,
  onUpdateRoom,
  onUpdateMaster,
  onResetSource,
}) => {
  // Tabs: 'source' | 'room' | 'master'
  const [activeTab, setActiveTab] = useState<'source' | 'room' | 'master'>('source');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Auto-switch to source tab if a source gets selected
  React.useEffect(() => {
    if (selectedSource) {
      setActiveTab('source');
    }
  }, [selectedSource?.instanceId]);

  const renderIcon = (iconName: string, size = 16) => {
    const IconComponent = (Icons as any)[iconName] || Icons.Volume2;
    return <IconComponent size={size} />;
  };

  // Calculate live spatial polar coordinates
  const distance = selectedSource
    ? Math.sqrt(selectedSource.x * selectedSource.x + selectedSource.y * selectedSource.y).toFixed(2)
    : '0.00';
  const angle = selectedSource
    ? Math.round((Math.atan2(selectedSource.x, selectedSource.y) * 180) / Math.PI)
    : 0;

  return (
    <div
      className="foley-panel"
      style={{
        width: '340px',
        minWidth: '320px',
        maxWidth: '380px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Inspector Header & Tab Navigation */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-main)',
        }}
      >
        <button
          onClick={() => setActiveTab('source')}
          style={{
            flex: 1,
            padding: '12px 8px',
            fontSize: '12px',
            fontWeight: 600,
            color: activeTab === 'source' ? 'var(--accent-amber)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'source' ? '2px solid var(--accent-amber)' : '2px solid transparent',
            background: activeTab === 'source' ? 'var(--bg-panel)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <Icons.Radio size={14} />
          Source
        </button>
        <button
          onClick={() => setActiveTab('room')}
          style={{
            flex: 1,
            padding: '12px 8px',
            fontSize: '12px',
            fontWeight: 600,
            color: activeTab === 'room' ? 'var(--accent-amber)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'room' ? '2px solid var(--accent-amber)' : '2px solid transparent',
            background: activeTab === 'room' ? 'var(--bg-panel)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <Icons.Box size={14} />
          Room
        </button>
        <button
          onClick={() => setActiveTab('master')}
          style={{
            flex: 1,
            padding: '12px 8px',
            fontSize: '12px',
            fontWeight: 600,
            color: activeTab === 'master' ? 'var(--accent-amber)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'master' ? '2px solid var(--accent-amber)' : '2px solid transparent',
            background: activeTab === 'master' ? 'var(--bg-panel)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <Icons.Sliders size={14} />
          Master
        </button>
      </div>

      {/* Tab Content Container */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {/* TAB 1: SOURCE INSPECTOR */}
        {activeTab === 'source' && (
          <div>
            {selectedSource ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* Source Badge & Identity */}
                <div
                  className="foley-surface"
                  style={{
                    padding: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '50%',
                        background: 'rgba(255, 50, 84, 0.15)',
                        border: '1.5px solid var(--accent-amber)',
                        color: 'var(--accent-amber)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {renderIcon(selectedSource.iconName, 18)}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {selectedSource.name}
                      </div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        Category: {selectedSource.category}
                      </div>
                    </div>
                  </div>

                  {/* Mute & Solo Quick Actions */}
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => onUpdateSource({ ...selectedSource, isMuted: !selectedSource.isMuted })}
                      className="foley-surface"
                      style={{
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: selectedSource.isMuted ? 'var(--danger-red)' : 'var(--bg-surface)',
                        color: selectedSource.isMuted ? '#FFF' : 'var(--text-secondary)',
                        borderColor: selectedSource.isMuted ? 'var(--danger-red)' : 'var(--border-subtle)',
                      }}
                      title="Mute Source"
                    >
                      MUTE
                    </button>
                    <button
                      onClick={() => onUpdateSource({ ...selectedSource, isSolo: !selectedSource.isSolo })}
                      className="foley-surface"
                      style={{
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: selectedSource.isSolo ? 'var(--signal-green)' : 'var(--bg-surface)',
                        color: selectedSource.isSolo ? '#000000' : 'var(--text-secondary)',
                        borderColor: selectedSource.isSolo ? 'var(--signal-green)' : 'var(--border-subtle)',
                      }}
                      title="Solo Source"
                    >
                      SOLO
                    </button>
                  </div>
                </div>

                {/* Spatial Coordinates Readout */}
                <div
                  className="foley-surface"
                  style={{
                    padding: '10px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Distance
                    </span>
                    <div className="font-mono" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {distance} <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>meters</span>
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Azimuth (Pan)
                    </span>
                    <div className="font-mono" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {angle}° <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{angle > 0 ? 'Right' : angle < 0 ? 'Left' : 'Center'}</span>
                    </div>
                  </div>
                </div>

                {/* Primary Volume Slider */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Source Gain
                    </label>
                    <span className="font-mono" style={{ fontSize: '11px', color: 'var(--accent-amber)' }}>
                      {Math.round(selectedSource.volume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedSource.volume}
                    onChange={(e) => onUpdateSource({ ...selectedSource, volume: parseFloat(e.target.value) })}
                  />
                </div>

                {/* Modulation Knobs Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '14px',
                    padding: '12px',
                    background: 'var(--bg-main)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <RotaryKnob
                    label="Rate"
                    value={selectedSource.triggerRate}
                    min={0.2}
                    max={8.0}
                    step={0.1}
                    unit="Hz"
                    defaultValue={1.5}
                    onChange={(val) => onUpdateSource({ ...selectedSource, triggerRate: val })}
                  />
                  <RotaryKnob
                    label="Variation"
                    value={selectedSource.drift}
                    min={0}
                    max={1}
                    step={0.05}
                    unit=""
                    defaultValue={0.5}
                    onChange={(val) => onUpdateSource({ ...selectedSource, drift: val })}
                  />
                </div>

                {/* Advanced Controls Collapsible */}
                <div>
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '8px 4px',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      borderTop: '1px solid var(--border-subtle)',
                    }}
                  >
                    <span>Fine Tuning (Pitch & Color)</span>
                    {showAdvanced ? <Icons.ChevronUp size={14} /> : <Icons.ChevronDown size={14} />}
                  </button>

                  {showAdvanced && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Pitch Multiplier</span>
                          <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-primary)' }}>
                            {selectedSource.pitch.toFixed(2)}x
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="2.0"
                          step="0.05"
                          value={selectedSource.pitch}
                          onChange={(e) => onUpdateSource({ ...selectedSource, pitch: parseFloat(e.target.value) })}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Actions: Reset & Remove */}
                <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '10px' }}>
                  <button
                    onClick={() => onResetSource(selectedSource.instanceId)}
                    className="foley-surface"
                    style={{
                      flex: 1,
                      padding: '8px',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                    }}
                  >
                    <Icons.RotateCcw size={12} />
                    Reset
                  </button>
                  <button
                    onClick={() => onRemoveSource(selectedSource.instanceId)}
                    className="foley-surface"
                    style={{
                      flex: 1,
                      padding: '8px',
                      fontSize: '11px',
                      color: 'var(--danger-red)',
                      borderColor: 'rgba(255, 138, 61, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                    }}
                  >
                    <Icons.Trash2 size={12} />
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '240px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  gap: '8px',
                }}
              >
                <Icons.MousePointerClick size={28} />
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                  No Source Selected
                </div>
                <p style={{ fontSize: '11px', maxWidth: '200px', lineHeight: 1.4 }}>
                  Click any sound marker on the spatial radar to adjust its volume, pitch, and triggers.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ROOM ACOUSTICS */}
        {activeTab === 'room' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Chamber Geometry
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '6px',
                  marginTop: '8px',
                }}
              >
                {(['small', 'medium', 'large', 'cathedral'] as RoomSizeType[]).map((size) => (
                  <button
                    key={size}
                    onClick={() => onUpdateRoom({ ...room, size })}
                    className="foley-surface"
                    style={{
                      padding: '8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                      color: room.size === size ? 'var(--accent-amber)' : 'var(--text-secondary)',
                      borderColor: room.size === size ? 'var(--accent-amber)' : 'var(--border-subtle)',
                      background: room.size === size ? 'var(--bg-surface-active)' : 'var(--bg-surface)',
                    }}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Room Rotary Dials */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
                padding: '16px 12px',
                background: 'var(--bg-main)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <RotaryKnob
                label="Reverb Send"
                value={room.reverbAmount}
                min={0}
                max={1}
                step={0.05}
                unit="%"
                defaultValue={0.5}
                onChange={(val) => onUpdateRoom({ ...room, reverbAmount: val })}
              />
              <RotaryKnob
                label="Decay Time"
                value={room.decay}
                min={0.2}
                max={8.0}
                step={0.1}
                unit="s"
                defaultValue={3.0}
                onChange={(val) => onUpdateRoom({ ...room, decay: val })}
              />
              <RotaryKnob
                label="Damping"
                value={room.damping}
                min={0}
                max={1}
                step={0.05}
                unit=""
                defaultValue={0.4}
                onChange={(val) => onUpdateRoom({ ...room, damping: val })}
              />
              <RotaryKnob
                label="Wet / Dry"
                value={room.wetDry}
                min={0}
                max={1}
                step={0.05}
                unit="%"
                defaultValue={0.45}
                onChange={(val) => onUpdateRoom({ ...room, wetDry: val })}
              />
            </div>

            <div className="foley-surface" style={{ padding: '10px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Impulse Response Mode
              </span>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
                Convolution reverb dynamically generates stereo high-reflection impulse buffers matching your chamber parameters.
              </p>
            </div>
          </div>
        )}

        {/* TAB 3: MASTER CONTROLS */}
        {activeTab === 'master' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Master Volume */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Master Output Gain
                </label>
                <span className="font-mono" style={{ fontSize: '11px', color: 'var(--accent-amber)' }}>
                  {Math.round(master.volume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={master.volume}
                onChange={(e) => onUpdateMaster({ ...master, volume: parseFloat(e.target.value) })}
              />
            </div>

            {/* Intensity Dial */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                padding: '16px',
                background: 'var(--bg-main)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <RotaryKnob
                label="Macro Intensity"
                value={master.intensity}
                min={0.1}
                max={1.5}
                step={0.05}
                unit="x"
                defaultValue={1.0}
                onChange={(val) => onUpdateMaster({ ...master, intensity: val })}
              />
            </div>

            {/* Mute All & Limiter Status */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={() => onUpdateMaster({ ...master, isMuted: !master.isMuted })}
                className="foley-surface"
                style={{
                  padding: '10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  color: master.isMuted ? '#FFF' : 'var(--text-primary)',
                  background: master.isMuted ? 'var(--danger-red)' : 'var(--bg-surface)',
                  borderColor: master.isMuted ? 'var(--danger-red)' : 'var(--border-subtle)',
                }}
              >
                {master.isMuted ? <Icons.VolumeX size={16} /> : <Icons.Volume2 size={16} />}
                {master.isMuted ? 'Master Muted' : 'Mute Master Output'}
              </button>

              <div
                className="foley-surface"
                style={{
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Hardware Anti-Clipping Limiter
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: master.limiterEnabled ? 'var(--signal-green)' : 'var(--text-muted)',
                  }}
                >
                  {master.limiterEnabled ? 'ENGAGED' : 'BYPASS'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
