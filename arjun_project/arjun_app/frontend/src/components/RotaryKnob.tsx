import React, { useRef, useState, useCallback, useEffect } from 'react';

interface RotaryKnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  defaultValue?: number;
  size?: number;
  onChange: (val: number) => void;
}

export const RotaryKnob: React.FC<RotaryKnobProps> = ({
  label,
  value,
  min,
  max,
  step = 0.01,
  unit = '',
  defaultValue,
  size = 46,
  onChange,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef<number>(0);
  const startValRef = useRef<number>(value);

  // Normalize value to 0..1 range
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  // Angle from -135deg (min) to +135deg (max) => 270deg total sweep
  const angle = -135 + normalized * 270;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startYRef.current = e.clientY;
    startValRef.current = value;
  };

  const handleDoubleClick = () => {
    if (defaultValue !== undefined) {
      onChange(defaultValue);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? step * 2 : -step * 2;
    const newVal = Math.max(min, Math.min(max, Number((value + delta).toFixed(2))));
    onChange(newVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      onChange(Math.min(max, Number((value + step).toFixed(2))));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onChange(Math.max(min, Number((value - step).toFixed(2))));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(min);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(max);
    }
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaY = startYRef.current - e.clientY;
      const range = max - min;
      // 120 pixels of vertical drag spans full range
      const deltaVal = (deltaY / 120) * range;
      const rawVal = startValRef.current + deltaVal;
      const clamped = Math.max(min, Math.min(max, rawVal));
      const stepped = Math.round(clamped / step) * step;
      onChange(Number(stepped.toFixed(2)));
    },
    [isDragging, min, max, step, onChange]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Display formatting
  const displayVal = step < 0.1 ? value.toFixed(2) : value.toFixed(1);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        userSelect: 'none',
      }}
    >
      <div
        className="hardware-dial"
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={0}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          position: 'relative',
          cursor: isDragging ? 'grabbing' : 'ns-resize',
        }}
      >
        {/* Outer Arc track */}
        <svg
          width={size}
          height={size}
          viewBox="0 0 46 46"
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        >
          {/* Inactive track */}
          <circle
            cx="23"
            cy="23"
            r="19"
            fill="none"
            stroke="var(--border-subtle)"
            strokeWidth="2.5"
            strokeDasharray="90 120"
            strokeDashoffset="-25"
          />
          {/* Active amber sweep */}
          <circle
            cx="23"
            cy="23"
            r="19"
            fill="none"
            stroke={isDragging ? 'var(--signal-green)' : 'var(--accent-amber)'}
            strokeWidth="2.5"
            strokeDasharray={`${normalized * 90} 120`}
            strokeDashoffset="-25"
            style={{ transition: isDragging ? 'none' : 'stroke-dasharray 0.15s ease' }}
          />
        </svg>

        {/* Pointer notch rotating with angle */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '2px',
            height: `${size * 0.32}px`,
            background: isDragging ? 'var(--signal-green)' : 'var(--accent-amber)',
            borderRadius: '1px',
            transformOrigin: '50% 0%',
            transform: `translate(-50%, 0) rotate(${angle + 180}deg)`,
            boxShadow: `0 0 5px ${isDragging ? 'var(--signal-green)' : 'var(--accent-amber)'}`,
            pointerEvents: 'none',
          }}
        />

        {/* Center cap */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: `${size * 0.36}px`,
            height: `${size * 0.36}px`,
            borderRadius: '50%',
            background: 'radial-gradient(circle, #252B25 0%, #0A0A0A 100%)',
            border: '1px solid var(--border-subtle)',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Label and Value */}
      <span
        style={{
          fontSize: '10.5px',
          fontWeight: 500,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </span>
      <span
        className="font-mono"
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: isDragging ? 'var(--signal-green)' : 'var(--text-primary)',
        }}
      >
        {displayVal}
        <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginLeft: '1px' }}>{unit}</span>
      </span>
    </div>
  );
};
