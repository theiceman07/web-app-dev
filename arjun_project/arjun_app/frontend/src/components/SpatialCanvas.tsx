import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { SoundSourceInstance } from '../types';
import * as Icons from '../icons';

interface SpatialCanvasProps {
  sources: SoundSourceInstance[];
  selectedSourceId: string | null;
  isPlaying: boolean;
  onSelectSource: (id: string | null) => void;
  onUpdateSourcePosition: (id: string, x: number, y: number) => void;
  onRemoveSource: (id: string) => void;
  onDropNewSource?: (defId: string, x: number, y: number) => void;
}

export const SpatialCanvas: React.FC<SpatialCanvasProps> = ({
  sources,
  selectedSourceId,
  isPlaying,
  onSelectSource,
  onUpdateSourcePosition,
  onRemoveSource,
  onDropNewSource,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number>(1.0);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Maximum spatial coordinate span is 10 meters in each direction
  const MAX_METERS = 10;

  // Convert (x, y) meters [-10..10] into container percentage [0%..100%]
  const metersToPercent = useCallback(
    (x: number, y: number) => {
      // x: -10..10 -> left: 0%..100%
      // y: -10..10 -> top: 100%..0% (y positive is North/Forward, negative is South/Behind)
      const left = ((x / MAX_METERS) * 0.5 + 0.5) * 100;
      const top = ((-y / MAX_METERS) * 0.5 + 0.5) * 100;
      return { left: `${left}%`, top: `${top}%` };
    },
    []
  );

  // Convert pixel click/drag event to meters [-10..10]
  const clientToMeters = useCallback(
    (clientX: number, clientY: number) => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const pxOffset = clientX - centerX;
      const pyOffset = clientY - centerY;

      // Half width is MAX_METERS * zoom
      const halfW = (rect.width / 2) / zoom;
      const halfH = (rect.height / 2) / zoom;

      let x = (pxOffset / halfW) * MAX_METERS;
      let y = -(pyOffset / halfH) * MAX_METERS;

      // Prevent sticking right onto center listener
      const dist = Math.sqrt(x * x + y * y);
      if (dist < 0.45) {
        const factor = 0.45 / (dist || 0.01);
        x *= factor;
        y *= factor;
      }

      // Clamp to max bounds
      x = Math.max(-MAX_METERS, Math.min(MAX_METERS, x));
      y = Math.max(-MAX_METERS, Math.min(MAX_METERS, y));

      return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
    },
    [zoom]
  );

  const handlePointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggedId(id);
    onSelectSource(id);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggedId) return;
    const { x, y } = clientToMeters(e.clientX, e.clientY);
    onUpdateSourcePosition(draggedId, x, y);
  };

  const handlePointerUp = () => {
    if (draggedId) {
      setDraggedId(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const defId = e.dataTransfer.getData('application/foleycraft-sound');
    if (defId && onDropNewSource) {
      const { x, y } = clientToMeters(e.clientX, e.clientY);
      onDropNewSource(defId, x, y);
    }
  };

  // Keyboard navigation for selected source
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedSourceId) return;
      const sel = sources.find((s) => s.instanceId === selectedSourceId);
      if (!sel) return;

      const step = e.shiftKey ? 0.8 : 0.2;
      let newX = sel.x;
      let newY = sel.y;

      if (e.key === 'ArrowUp') {
        newY = Math.min(MAX_METERS, sel.y + step);
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        newY = Math.max(-MAX_METERS, sel.y - step);
        e.preventDefault();
      } else if (e.key === 'ArrowLeft') {
        newX = Math.max(-MAX_METERS, sel.x - step);
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        newX = Math.min(MAX_METERS, sel.x + step);
        e.preventDefault();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        onRemoveSource(selectedSourceId);
        e.preventDefault();
        return;
      }

      if (newX !== sel.x || newY !== sel.y) {
        onUpdateSourcePosition(selectedSourceId, Number(newX.toFixed(2)), Number(newY.toFixed(2)));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSourceId, sources, onUpdateSourcePosition, onRemoveSource]);

  // Render Lucide icon safely
  const renderIcon = (iconName: string, size = 16) => {
    const IconComponent = (Icons as any)[iconName] || Icons.Volume2;
    return <IconComponent size={size} />;
  };

  return (
    <div
      ref={containerRef}
      className="foley-panel"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => onSelectSource(null)}
      style={{
        position: 'relative',
        flex: '1 1 65%',
        height: '100%',
        minHeight: '380px',
        overflow: 'hidden',
        background: 'radial-gradient(circle at center, #0A0A0A 0%, #000000 85%)',
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Background Distance Radar Rings */}
      <div
        style={{
          position: 'absolute',
          width: '90%',
          height: '90%',
          maxWidth: '800px',
          maxHeight: '800px',
          transform: `scale(${zoom})`,
          transition: 'transform 0.15s ease',
          pointerEvents: 'none',
        }}
      >
        <svg width="100%" height="100%" viewBox="-100 -100 200 200" style={{ overflow: 'visible' }}>
          {/* Subtle Directional Crosshairs */}
          <line x1="-95" y1="0" x2="95" y2="0" stroke="var(--border-subtle)" strokeWidth="0.8" strokeDasharray="3 3" />
          <line x1="0" y1="-95" x2="0" y2="95" stroke="var(--border-subtle)" strokeWidth="0.8" strokeDasharray="3 3" />
          {/* Diagonal Guides */}
          <line x1="-65" y1="-65" x2="65" y2="65" stroke="var(--border-subtle)" strokeWidth="0.5" strokeOpacity="0.4" />
          <line x1="-65" y1="65" x2="65" y2="-65" stroke="var(--border-subtle)" strokeWidth="0.5" strokeOpacity="0.4" />

          {/* Concentric Distance Rings: 1.5m (r=15), 3.5m (r=35), 6.5m (r=65), 10m (r=95) */}
          {[18, 42, 68, 95].map((radius, idx) => (
            <circle
              key={idx}
              cx="0"
              cy="0"
              r={radius}
              fill="none"
              stroke="var(--border-subtle)"
              strokeWidth="0.8"
              strokeDasharray={idx === 3 ? 'none' : '4 4'}
              opacity={0.7}
            />
          ))}

          {/* Distance Labels */}
          <text x="3" y="-19" fill="var(--text-muted)" fontSize="3.5" fontFamily="var(--font-mono)">1.8m</text>
          <text x="3" y="-43" fill="var(--text-muted)" fontSize="3.5" fontFamily="var(--font-mono)">4.2m</text>
          <text x="3" y="-69" fill="var(--text-muted)" fontSize="3.5" fontFamily="var(--font-mono)">7.0m</text>
          <text x="3" y="-96" fill="var(--text-muted)" fontSize="3.5" fontFamily="var(--font-mono)">10.0m</text>

          {/* Cardinal Directions */}
          <text x="0" y="-98" textAnchor="middle" fill="var(--text-secondary)" fontSize="4.5" fontWeight="600" letterSpacing="1">NORTH (FRONT)</text>
          <text x="98" y="1.5" textAnchor="start" fill="var(--text-secondary)" fontSize="4.5" fontWeight="600" letterSpacing="1">EAST (RIGHT)</text>
          <text x="0" y="103" textAnchor="middle" fill="var(--text-secondary)" fontSize="4.5" fontWeight="600" letterSpacing="1">SOUTH (BEHIND)</text>
          <text x="-98" y="1.5" textAnchor="end" fill="var(--text-secondary)" fontSize="4.5" fontWeight="600" letterSpacing="1">WEST (LEFT)</text>
        </svg>
      </div>

      {/* Central Listener Node (Fixed in center) */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '54px',
          height: '54px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, #2C352C 0%, #1A201A 100%)',
          border: '2px solid var(--signal-green)',
          boxShadow: '0 0 16px rgba(25, 243, 255, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        {/* Forward direction arrow */}
        <div
          style={{
            position: 'absolute',
            top: '-7px',
            width: 0,
            height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderBottom: '7px solid var(--signal-green)',
          }}
        />
        <Icons.Headphones size={22} color="var(--signal-green)" />
        <span
          style={{
            fontSize: '8px',
            fontWeight: 700,
            color: 'var(--signal-green)',
            letterSpacing: '0.08em',
            marginTop: '1px',
          }}
        >
          LISTENER
        </span>
      </div>

      {/* Active Sound Sources Overlay Container */}
      <div
        style={{
          position: 'absolute',
          width: '90%',
          height: '90%',
          maxWidth: '800px',
          maxHeight: '800px',
          transform: `scale(${zoom})`,
          transition: 'transform 0.15s ease',
        }}
      >
        {sources.map((source) => {
          const { left, top } = metersToPercent(source.x, source.y);
          const isSelected = source.instanceId === selectedSourceId;
          const isHovered = source.instanceId === hoveredId;
          const isMuted = source.isMuted;
          const dist = Math.sqrt(source.x * source.x + source.y * source.y).toFixed(1);
          // Angle in degrees: 0 deg = North, 90 deg = East, 180 deg = South, -90 deg = West
          const rad = Math.atan2(source.x, source.y);
          const deg = Math.round((rad * 180) / Math.PI);

          return (
            <div
              key={source.instanceId}
              onPointerDown={(e) => handlePointerDown(e, source.instanceId)}
              onMouseEnter={() => setHoveredId(source.instanceId)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={(e) => {
                e.stopPropagation();
                onSelectSource(source.instanceId);
              }}
              style={{
                position: 'absolute',
                left,
                top,
                transform: 'translate(-50%, -50%)',
                cursor: draggedId === source.instanceId ? 'grabbing' : 'grab',
                zIndex: isSelected ? 30 : 20,
              }}
            >
              {/* Pulsing sound ring when playing */}
              {isPlaying && !isMuted && (
                <div
                  className="sound-ring"
                  style={{
                    width: '56px',
                    height: '56px',
                    top: '-7px',
                    left: '-7px',
                    borderColor: source.color || 'var(--accent-amber)',
                    animationDuration: `${Math.max(1.0, 3.5 / source.triggerRate)}s`,
                  }}
                />
              )}

              {/* Source Marker Node */}
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: isSelected
                    ? 'radial-gradient(circle, #2B2B2B 0%, #201D17 100%)'
                    : 'radial-gradient(circle, #151515 0%, #1B201B 100%)',
                  border: `2px solid ${
                    isSelected
                      ? 'var(--accent-amber)'
                      : isHovered
                      ? 'var(--text-primary)'
                      : source.color || 'var(--border-light)'
                  }`,
                  boxShadow: isSelected
                    ? '0 0 16px rgba(255, 50, 84, 0.5), inset 0 0 8px rgba(255, 50, 84, 0.2)'
                    : '0 4px 10px rgba(0, 0, 0, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isMuted ? 'var(--text-muted)' : isSelected ? 'var(--accent-amber)' : 'var(--text-primary)',
                  position: 'relative',
                  transition: 'border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease',
                  transform: isSelected || isHovered ? 'scale(1.1)' : 'scale(1.0)',
                }}
              >
                {renderIcon(source.iconName, 18)}

                {/* Status Badges */}
                {source.isSolo && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      background: 'var(--signal-green)',
                      color: '#000000',
                      fontSize: '8px',
                      fontWeight: 800,
                      borderRadius: '3px',
                      padding: '1px 3px',
                      lineHeight: 1,
                    }}
                  >
                    S
                  </span>
                )}
                {source.isMuted && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: '-4px',
                      right: '-4px',
                      background: 'var(--danger-red)',
                      color: '#FFFFFF',
                      fontSize: '8px',
                      fontWeight: 800,
                      borderRadius: '3px',
                      padding: '1px 3px',
                      lineHeight: 1,
                    }}
                  >
                    M
                  </span>
                )}
              </div>

              {/* Floating Label and Distance Tooltip */}
              <div
                style={{
                  position: 'absolute',
                  top: '46px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  pointerEvents: 'none',
                  background: 'rgba(0, 0, 0, 0.85)',
                  backdropFilter: 'blur(4px)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: isSelected ? 'var(--accent-amber)' : 'var(--text-primary)',
                  }}
                >
                  {source.name}
                </span>
                <span
                  className="font-mono"
                  style={{
                    fontSize: '9.5px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {dist}m · {deg}°
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State Banner */}
      {sources.length === 0 && (
        <div
          style={{
            zIndex: 15,
            textAlign: 'center',
            maxWidth: '360px',
            background: 'rgba(13, 13, 13, 0.9)',
            border: '1px dashed var(--border-light)',
            padding: '24px',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <Icons.Radio size={36} color="var(--accent-amber)" style={{ marginBottom: '10px' }} />
          <h3 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '6px' }}>
            Stage is Empty
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Drag sounds from the sound palette below onto the radar grid, or choose a preset from the top bar.
          </p>
        </div>
      )}

      {/* Floating Canvas Controls (Top Right: Zoom & Reset) */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          display: 'flex',
          gap: '6px',
          zIndex: 40,
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setZoom((z) => Math.min(1.5, z + 0.15));
          }}
          title="Zoom In"
          className="foley-surface"
          style={{
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
          }}
        >
          <Icons.ZoomIn size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setZoom((z) => Math.max(0.7, z - 0.15));
          }}
          title="Zoom Out"
          className="foley-surface"
          style={{
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
          }}
        >
          <Icons.ZoomOut size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setZoom(1.0);
          }}
          title="Reset View (100%)"
          className="foley-surface"
          style={{
            padding: '0 8px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
          }}
        >
          {Math.round(zoom * 100)}%
        </button>
      </div>

      {/* Bottom Left Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          fontSize: '10.5px',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'rgba(0, 0, 0, 0.7)',
          padding: '4px 10px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
          pointerEvents: 'none',
          zIndex: 40,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', border: '1.5px solid var(--signal-green)' }} />
          Listener (Center)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', border: '1.5px solid var(--accent-amber)' }} />
          Sound Source
        </span>
        <span style={{ color: 'var(--text-secondary)' }}>
          Max Radius: 10m
        </span>
      </div>
    </div>
  );
};
