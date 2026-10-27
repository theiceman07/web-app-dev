import React, { useRef, useEffect, useState } from 'react';
import { audioEngine } from '../audio/audioEngine';

interface AudioMonitorProps {
  isPlaying: boolean;
  activeVoicesCount: number;
}

export const AudioMonitor: React.FC<AudioMonitorProps> = ({ isPlaying, activeVoicesCount }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rmsDb, setRmsDb] = useState<number>(-96);
  const [peakDb, setPeakDb] = useState<number>(-96);
  const [isClipping, setIsClipping] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  useEffect(() => {
    let animId: number;

    const renderWaveform = () => {
      const data = audioEngine.getMeterData();
      setRmsDb(data.rmsDb);
      setPeakDb(data.peakDb);
      setIsClipping(data.isClipping);

      const canvas = canvasRef.current;
      if (canvas && isPlaying) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const width = canvas.width;
          const height = canvas.height;

          // Clear CRT canvas with deep phosphor black
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, width, height);

          // Subtle oscilloscope grid lines
          ctx.strokeStyle = '#142014';
          ctx.lineWidth = 1;
          ctx.beginPath();
          // Horizontal center line
          ctx.moveTo(0, height / 2);
          ctx.lineTo(width, height / 2);
          // Vertical division lines
          for (let x = 0; x < width; x += width / 6) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
          }
          ctx.stroke();

          // Draw real waveform
          const buffer = data.waveform;
          if (buffer && buffer.length > 0) {
            ctx.lineWidth = 1.6;
            ctx.strokeStyle = '#19F3FF';
            ctx.shadowColor = 'rgba(25, 243, 255, 0.7)';
            ctx.shadowBlur = 4;
            ctx.beginPath();

            const sliceWidth = width / buffer.length;
            let x = 0;

            for (let i = 0; i < buffer.length; i++) {
              // Float audio data is between -1.0 and 1.0
              const v = buffer[i];
              const y = ((v + 1) / 2) * height;

              if (i === 0) {
                ctx.moveTo(x, y);
              } else {
                ctx.lineTo(x, y);
              }
              x += sliceWidth;
            }

            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }
      } else if (canvas && !isPlaying) {
        // Flatline idle line
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.strokeStyle = '#1B2C1B';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, canvas.height / 2);
          ctx.lineTo(canvas.width, canvas.height / 2);
          ctx.stroke();
        }
      }

      animId = requestAnimationFrame(renderWaveform);
    };

    animId = requestAnimationFrame(renderWaveform);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

  // Convert dB (-96 to 0) to meter percentage (0% to 100%)
  const dbToPercent = (db: number) => {
    // Map -60dB..0dB to 0%..100%
    return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  };

  const meterWidth = dbToPercent(rmsDb);
  const peakWidth = dbToPercent(peakDb);

  return (
    <div
      className="foley-surface"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '6px 12px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* CRT Mini Oscilloscope Screen */}
      <div
        className="crt-screen"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          width: isExpanded ? '180px' : '90px',
          height: '36px',
          cursor: 'pointer',
          transition: 'width 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="Click to expand oscilloscope"
      >
        <canvas ref={canvasRef} width={180} height={36} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Hardware Dual Segment VU Decibel Meter */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', width: '110px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            MASTER VU
          </span>
          <span
            className="font-mono"
            style={{
              fontSize: '9.5px',
              color: isClipping ? 'var(--danger-red)' : 'var(--signal-green)',
            }}
          >
            {rmsDb > -80 ? `${rmsDb.toFixed(1)} dB` : '-∞ dB'}
          </span>
        </div>

        {/* Meter Track Bar */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '6px',
            background: '#0D110D',
            borderRadius: '2px',
            overflow: 'hidden',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {/* Signal Fill Bar with Gradient */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: `${meterWidth}%`,
              background: 'linear-gradient(90deg, #19F3FF 0%, #FF3254 80%, #FF8A3D 100%)',
              transition: 'width 0.08s ease-out',
            }}
          />
          {/* Floating Peak Hold Needle */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${peakWidth}%`,
              width: '2px',
              background: '#FFFFFF',
              boxShadow: '0 0 4px #FFFFFF',
            }}
          />
        </div>
      </div>

      {/* Clip Warning LED Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <div
          className={`led-indicator ${isClipping ? 'clipping' : ''}`}
          title={isClipping ? 'Audio Clipping Warning!' : 'Headroom Nominal'}
        />
        <span
          style={{
            fontSize: '9px',
            fontWeight: 700,
            color: isClipping ? 'var(--danger-red)' : 'var(--text-muted)',
          }}
        >
          CLIP
        </span>
      </div>

      {/* Active Voices Count Badge */}
      <div
        className="font-mono"
        style={{
          fontSize: '10px',
          color: 'var(--text-muted)',
          borderLeft: '1px solid var(--border-subtle)',
          paddingLeft: '10px',
        }}
      >
        <span style={{ color: 'var(--signal-green)' }}>{activeVoicesCount}</span> VOICES
      </div>
    </div>
  );
};
