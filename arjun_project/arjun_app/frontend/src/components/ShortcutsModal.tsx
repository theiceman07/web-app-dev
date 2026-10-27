import React from 'react';
import * as Icons from '../icons';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'Space', desc: 'Toggle Play / Pause audio playback' },
    { key: 'Arrow Keys', desc: 'Nudge selected sound position (Hold Shift for 4x step)' },
    { key: 'M', desc: 'Toggle Mute on selected sound' },
    { key: 'S', desc: 'Toggle Solo on selected sound' },
    { key: 'Delete / Backspace', desc: 'Remove selected sound from stage' },
    { key: 'Esc', desc: 'Deselect current sound source' },
    { key: 'Ctrl + Z / ⌘ + Z', desc: 'Undo scene edit' },
    { key: 'Ctrl + Y / ⌘ + Shift + Z', desc: 'Redo scene edit' },
    { key: 'Double Click Knob', desc: 'Reset dial to default parameter' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="foley-panel"
        style={{
          width: '500px',
          maxWidth: '100%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-panel)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-main)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icons.Keyboard size={18} color="var(--accent-amber)" />
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Keyboard Shortcuts & Quick Guide
            </h3>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <Icons.X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Shortcuts Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {shortcuts.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                  borderBottom: '1px solid var(--border-subtle)',
                  fontSize: '12px',
                }}
              >
                <span style={{ color: 'var(--text-secondary)' }}>{item.desc}</span>
                <kbd
                  className="font-mono"
                  style={{
                    padding: '3px 7px',
                    borderRadius: '4px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-light)',
                    color: 'var(--accent-amber)',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  {item.key}
                </kbd>
              </div>
            ))}
          </div>

          {/* Quick Guide Card */}
          <div
            className="foley-surface"
            style={{
              padding: '12px',
              fontSize: '11.5px',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              How Spatial Acoustics Work in FoleyCraft:
            </div>
            Audio uses authentic browser Web Audio HRTF panner nodes and synthetic convolution impulse responses. Sounds positioned to the left/right calculate binaural delay, while distance naturally attenuates high frequencies and sound level.
          </div>
        </div>
      </div>
    </div>
  );
};
