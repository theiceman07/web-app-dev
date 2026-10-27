import React, { useState } from 'react';
import type { Preset, MasterSettings } from '../types';
import * as Icons from '../icons';

interface TopBarProps {
  sceneName: string;
  presets: Preset[];
  currentPresetId: string;
  hasUnsavedChanges: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isPlaying: boolean;
  master: MasterSettings;
  onRenameScene: (name: string) => void;
  onSelectPreset: (presetId: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onUpdateMasterVolume: (volume: number) => void;
  onOpenSaveModal: () => void;
  onOpenExportModal: () => void;
  onOpenShortcutsModal: () => void;
  onNavigateToLanding?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  sceneName,
  presets,
  currentPresetId,
  hasUnsavedChanges,
  canUndo,
  canRedo,
  isPlaying,
  master,
  onRenameScene,
  onSelectPreset,
  onUndo,
  onRedo,
  onTogglePlay,
  onStop,
  onUpdateMasterVolume,
  onOpenSaveModal,
  onOpenExportModal,
  onOpenShortcutsModal,
  onNavigateToLanding,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(sceneName);

  const handleFinishRename = () => {
    setIsEditingName(false);
    if (tempName.trim()) {
      onRenameScene(tempName.trim());
    } else {
      setTempName(sceneName);
    }
  };

  return (
    <header
      style={{
        height: '52px',
        minHeight: '52px',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-main)',
        borderBottom: '1px solid var(--border-subtle)',
        userSelect: 'none',
        zIndex: 50,
      }}
    >
      {/* LEFT: Brand Wordmark + Acoustic Icon + Scene Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Brand */}
        <div
          onClick={onNavigateToLanding}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: onNavigateToLanding ? 'pointer' : 'default',
          }}
          title={onNavigateToLanding ? 'Click to view Landing Page Overview' : undefined}
        >
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #1A1A1A 0%, #0A0A0A 100%)',
              border: '1px solid var(--accent-amber)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-amber)',
              boxShadow: '0 0 10px rgba(255, 50, 84, 0.2)',
            }}
          >
            <Icons.AudioWaveform size={17} />
          </div>
          <span
            style={{
              fontSize: '15px',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
            }}
          >
            Foley<span style={{ color: 'var(--accent-amber)' }}>Craft</span>
          </span>
          <span
            style={{
              fontSize: '9px',
              fontWeight: 700,
              color: 'var(--signal-green)',
              background: 'rgba(25, 243, 255, 0.1)',
              border: '1px solid rgba(25, 243, 255, 0.3)',
              borderRadius: '3px',
              padding: '1px 4px',
              letterSpacing: '0.05em',
            }}
          >
            STUDIO
          </span>
          {onNavigateToLanding && (
            <span
              style={{
                fontSize: '10px',
                color: 'var(--text-secondary)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '2px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                marginLeft: '4px',
              }}
            >
              <Icons.ArrowLeft size={10} /> Overview
            </span>
          )}
        </div>

        <div style={{ width: '1px', height: '22px', background: 'var(--border-subtle)' }} />

        {/* Editable Scene Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isEditingName ? (
            <input
              type="text"
              autoFocus
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onBlur={handleFinishRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFinishRename();
                if (e.key === 'Escape') {
                  setTempName(sceneName);
                  setIsEditingName(false);
                }
              }}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--accent-amber)',
                borderRadius: '4px',
                padding: '2px 8px',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontWeight: 600,
                outline: 'none',
              }}
            />
          ) : (
            <div
              onClick={() => {
                setTempName(sceneName);
                setIsEditingName(true);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                padding: '3px 8px',
                borderRadius: '4px',
                transition: 'background 0.15s ease',
              }}
              className="hover:bg-surface"
              title="Click to rename scene"
            >
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {sceneName}
              </span>
              <Icons.Pencil size={11} color="var(--text-muted)" />
            </div>
          )}

          {/* Unsaved Changes Dot */}
          {hasUnsavedChanges ? (
            <span
              style={{
                fontSize: '9.5px',
                color: 'var(--accent-amber)',
                background: 'rgba(255, 50, 84, 0.1)',
                border: '1px solid rgba(255, 50, 84, 0.25)',
                padding: '1px 6px',
                borderRadius: '10px',
              }}
            >
              ● Unsaved
            </span>
          ) : (
            <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
              Saved
            </span>
          )}
        </div>

        {/* Preset Selector Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Icons.FolderOpen size={13} color="var(--text-muted)" />
          <select
            value={currentPresetId}
            onChange={(e) => onSelectPreset(e.target.value)}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 8px',
              color: 'var(--text-primary)',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name} {preset.isCustom ? '(Custom)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* CENTER: Transport Controls (Play / Pause / Stop) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Undo / Redo */}
        <div style={{ display: 'flex', gap: '2px', marginRight: '6px' }}>
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            style={{
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              color: canUndo ? 'var(--text-primary)' : 'var(--text-muted)',
              opacity: canUndo ? 1 : 0.4,
              cursor: canUndo ? 'pointer' : 'default',
            }}
          >
            <Icons.Undo2 size={15} />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            style={{
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              color: canRedo ? 'var(--text-primary)' : 'var(--text-muted)',
              opacity: canRedo ? 1 : 0.4,
              cursor: canRedo ? 'pointer' : 'default',
            }}
          >
            <Icons.Redo2 size={15} />
          </button>
        </div>

        {/* Stop Button */}
        <button
          onClick={onStop}
          title="Stop Playback"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icons.Square size={13} fill="currentColor" />
        </button>

        {/* HERO Play / Pause Action Button */}
        <button
          onClick={onTogglePlay}
          style={{
            height: '34px',
            padding: '0 18px',
            borderRadius: '6px',
            background: isPlaying
              ? 'linear-gradient(135deg, #19F3FF 0%, #A5F25A 100%)'
              : 'linear-gradient(135deg, #FF3254 0%, #D9163A 100%)',
            color: '#000000',
            border: 'none',
            fontWeight: 700,
            fontSize: '12.5px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: isPlaying
              ? '0 0 16px rgba(25, 243, 255, 0.4)'
              : '0 0 16px rgba(255, 50, 84, 0.35)',
            transition: 'all 0.15s ease',
          }}
        >
          {isPlaying ? (
            <>
              <Icons.Pause size={15} fill="currentColor" />
              <span>PAUSE</span>
            </>
          ) : (
            <>
              <Icons.Play size={15} fill="currentColor" />
              <span>PLAY AUDIO</span>
            </>
          )}
        </button>
      </div>

      {/* RIGHT: Master Volume + Save / Export + Shortcuts */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* Quick Master Volume Slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '130px' }}>
          <Icons.Volume2 size={14} color="var(--text-muted)" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={master.volume}
            onChange={(e) => onUpdateMasterVolume(parseFloat(e.target.value))}
            title={`Master Gain: ${Math.round(master.volume * 100)}%`}
          />
        </div>

        {/* Save Preset Button */}
        <button
          onClick={onOpenSaveModal}
          className="foley-surface"
          style={{
            padding: '5px 10px',
            fontSize: '11px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            color: 'var(--text-secondary)',
          }}
          title="Save Scene as Preset"
        >
          <Icons.Save size={13} />
          Save
        </button>

        {/* Export Button (Real WAV & Scene JSON) */}
        <button
          onClick={onOpenExportModal}
          style={{
            padding: '5px 12px',
            fontSize: '11px',
            fontWeight: 600,
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(255, 50, 84, 0.15)',
            border: '1px solid var(--accent-amber)',
            color: 'var(--accent-amber)',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
          title="Export audio loop (WAV) or scene"
        >
          <Icons.Download size={13} />
          Export
        </button>

        {/* Keyboard Shortcuts & Help */}
        <button
          onClick={onOpenShortcutsModal}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Keyboard Shortcuts & Help"
        >
          <Icons.HelpCircle size={15} />
        </button>
      </div>
    </header>
  );
};
