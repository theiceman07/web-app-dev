import React from 'react';
import * as Icons from '../icons';

interface FirstRunBannerProps {
  isPlaying: boolean;
  sceneName: string;
  onStartAudio: () => void;
  onDismiss: () => void;
}

export const FirstRunBanner: React.FC<FirstRunBannerProps> = ({
  isPlaying,
  sceneName,
  onStartAudio,
  onDismiss,
}) => {
  if (isPlaying) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '64px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 45,
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '12px 18px',
        width: 'max-content',
        maxWidth: 'calc(100% - 32px)',
        background: 'var(--bg-surface)',
        border: '1.5px solid var(--accent-amber)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icons.Sparkles size={16} color="var(--accent-amber)" />
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
          Scene loaded: <strong style={{ color: 'var(--accent-amber)' }}>{sceneName}</strong>. Drag sounds around the listener to shape your environment.
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={onStartAudio}
          style={{
            padding: '5px 14px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--accent-amber)',
            color: '#000000',
            fontSize: '11.5px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
          }}
        >
          <Icons.Play size={13} fill="currentColor" />
          START AUDIO
        </button>

        <button
          onClick={onDismiss}
          style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
          title="Dismiss banner"
        >
          <Icons.X size={15} />
        </button>
      </div>
    </div>
  );
};
