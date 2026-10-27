import React, { useState, useEffect, useCallback } from 'react';
import type { SceneState, SoundSourceInstance, Preset, SoundSourceDef, RoomSettings, MasterSettings } from './types';
import { INITIAL_PRESETS } from './data/initialPresets';
import { SOUND_CATALOG } from './data/soundCatalog';
import { audioEngine } from './audio/audioEngine';

import { TopBar } from './components/TopBar';
import { SpatialCanvas } from './components/SpatialCanvas';
import { SourceInspector } from './components/SourceInspector';
import { SoundPalette } from './components/SoundPalette';
import { AudioMonitor } from './components/AudioMonitor';
import { ExportDialog } from './components/ExportDialog';
import { SavePresetDialog } from './components/SavePresetDialog';
import { ShortcutsModal } from './components/ShortcutsModal';
import { FirstRunBanner } from './components/FirstRunBanner';
import { LandingPage } from './components/LandingPage';
import { Assistant } from './components/Assistant';

const LOCAL_STORAGE_CUSTOM_PRESETS = 'foleycraft_custom_presets_v1';

export const App: React.FC = () => {
  // Preset list: defaults + custom stored in localStorage
  const [presets, setPresets] = useState<Preset[]>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_CUSTOM_PRESETS);
      if (stored) {
        const custom: Preset[] = JSON.parse(stored);
        return [...INITIAL_PRESETS, ...custom];
      }
    } catch (_) {}
    return INITIAL_PRESETS;
  });

  const [currentPresetId, setCurrentPresetId] = useState<string>('dungeon_crypt');

  // Core Scene State: initialize with Dungeon Crypt
  const [scene, setScene] = useState<SceneState>(() => {
    const initPreset = INITIAL_PRESETS[0];
    const initialSources: SoundSourceInstance[] = initPreset.sources.map((s, idx) => ({
      ...s,
      instanceId: `source_${Date.now()}_${idx}`,
    }));

    return {
      id: `scene_${Date.now()}`,
      name: initPreset.name,
      sources: initialSources,
      room: { ...initPreset.room },
      master: { ...initPreset.master },
      selectedSourceId: initialSources[0]?.instanceId || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  // Undo / Redo history stacks
  const [undoStack, setUndoStack] = useState<SceneState[]>([]);
  const [redoStack, setRedoStack] = useState<SceneState[]>([]);

  // UI state
  const [isPaletteCollapsed, setIsPaletteCollapsed] = useState<boolean>(false);
  const [showFirstRunBanner, setShowFirstRunBanner] = useState<boolean>(true);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState<boolean>(false);

  // View mode: 'landing' or 'studio' (defaults to landing, responsive to hash)
  const [view, setView] = useState<'landing' | 'studio'>(() => {
    return window.location.hash === '#studio' ? 'studio' : 'landing';
  });

  useEffect(() => {
    const handleHashChange = () => {
      setView(window.location.hash === '#studio' ? 'studio' : 'landing');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Helper to push history state for undo
  const pushUndoSnapshot = useCallback(
    (newScene: SceneState) => {
      setUndoStack((prev) => [...prev.slice(-25), scene]);
      setRedoStack([]);
      setScene(newScene);
      setHasUnsavedChanges(true);
    },
    [scene]
  );

  // Keep AudioEngine synced whenever scene changes
  useEffect(() => {
    if (isPlaying) {
      audioEngine.syncScene(scene);
    }
  }, [scene, isPlaying]);

  // Master Play / Pause toggle
  const handleTogglePlay = async () => {
    if (isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
    } else {
      await audioEngine.play();
      audioEngine.syncScene(scene);
      setIsPlaying(true);
      setShowFirstRunBanner(false);
    }
  };

  const handleStop = () => {
    audioEngine.stop();
    setIsPlaying(false);
  };

  // Preset switching
  const handleSelectPreset = (presetId: string) => {
    const target = presets.find((p) => p.id === presetId);
    if (!target) return;

    if (hasUnsavedChanges) {
      const confirmSwitch = window.confirm('Switching presets will discard unsaved scene changes. Continue?');
      if (!confirmSwitch) return;
    }

    const newSources: SoundSourceInstance[] = target.sources.map((s, idx) => ({
      ...s,
      instanceId: `source_${Date.now()}_${idx}`,
    }));

    const newScene: SceneState = {
      id: `scene_${Date.now()}`,
      name: target.name,
      sources: newSources,
      room: { ...target.room },
      master: { ...target.master },
      selectedSourceId: newSources[0]?.instanceId || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setCurrentPresetId(presetId);
    setScene(newScene);
    setUndoStack([]);
    setRedoStack([]);
    setHasUnsavedChanges(false);

    if (isPlaying) {
      audioEngine.syncScene(newScene);
    }
  };

  // Undo / Redo logic
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, prev.length - 1));
    setRedoStack((prev) => [...prev, scene]);
    setScene(previous);
    setHasUnsavedChanges(true);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, prev.length - 1));
    setUndoStack((prev) => [...prev, scene]);
    setScene(next);
    setHasUnsavedChanges(true);
  };

  // Source updates
  const handleUpdateSource = (updated: SoundSourceInstance) => {
    const newSources = scene.sources.map((s) => (s.instanceId === updated.instanceId ? updated : s));
    pushUndoSnapshot({ ...scene, sources: newSources, updatedAt: Date.now() });
  };

  // Dragging node on spatial canvas (fast update without flooding undo history)
  const handleUpdateSourcePosition = (id: string, x: number, y: number) => {
    setScene((prev) => {
      const nextSources = prev.sources.map((s) => (s.instanceId === id ? { ...s, x, y } : s));
      const nextScene = { ...prev, sources: nextSources, updatedAt: Date.now() };
      if (isPlaying) audioEngine.syncScene(nextScene);
      return nextScene;
    });
    setHasUnsavedChanges(true);
  };

  const handleRemoveSource = (id: string) => {
    const newSources = scene.sources.filter((s) => s.instanceId !== id);
    const newSelectedId = scene.selectedSourceId === id ? newSources[0]?.instanceId || null : scene.selectedSourceId;
    pushUndoSnapshot({
      ...scene,
      sources: newSources,
      selectedSourceId: newSelectedId,
      updatedAt: Date.now(),
    });
  };

  const handleResetSource = (id: string) => {
    const current = scene.sources.find((s) => s.instanceId === id);
    if (!current) return;
    const def = SOUND_CATALOG.find((d) => d.id === current.defId);
    if (!def) return;

    const resetSource: SoundSourceInstance = {
      ...current,
      volume: def.defaultVolume,
      pitch: def.defaultPitch,
      triggerRate: def.defaultTriggerRate,
      drift: def.defaultDrift,
      isMuted: false,
      isSolo: false,
    };
    handleUpdateSource(resetSource);
  };

  // Adding new sound from palette to stage
  const handleAddSourceToStage = (def: SoundSourceDef, targetX?: number, targetY?: number) => {
    // Generate pleasant position offset around listener if not specified
    const angle = Math.random() * Math.PI * 2;
    const radius = 2.0 + Math.random() * 3.5;
    const x = targetX !== undefined ? targetX : Number((Math.cos(angle) * radius).toFixed(2));
    const y = targetY !== undefined ? targetY : Number((Math.sin(angle) * radius).toFixed(2));

    const categoryColors: Record<string, string> = {
      fire: '#FF3254',
      water: '#8B6BFF',
      weather: '#A5F25A',
      nature: '#FFC93C',
      movement: '#FFC93C',
      interior: '#FF3254',
      industrial: '#19F3FF',
      scifi: '#FF8A3D',
    };

    const newInstance: SoundSourceInstance = {
      instanceId: `source_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      defId: def.id,
      name: def.name,
      category: def.category,
      iconName: def.iconName,
      proceduralType: def.proceduralType,
      x,
      y,
      volume: def.defaultVolume,
      pitch: def.defaultPitch,
      triggerRate: def.defaultTriggerRate,
      drift: def.defaultDrift,
      isMuted: false,
      isSolo: false,
      color: categoryColors[def.category] || '#FF3254',
    };

    pushUndoSnapshot({
      ...scene,
      sources: [...scene.sources, newInstance],
      selectedSourceId: newInstance.instanceId,
      updatedAt: Date.now(),
    });
  };

  const handleDropNewSource = (defId: string, x: number, y: number) => {
    const def = SOUND_CATALOG.find((d) => d.id === defId);
    if (def) {
      handleAddSourceToStage(def, x, y);
    }
  };

  // Save custom preset to localStorage
  const handleSaveCustomPreset = (name: string, description: string) => {
    const customPreset: Preset = {
      id: `custom_${Date.now()}`,
      name,
      description: description || 'Custom user soundscape',
      category: 'Custom Presets',
      isCustom: true,
      room: { ...scene.room },
      master: { ...scene.master },
      sources: scene.sources.map((s) => ({
        defId: s.defId,
        name: s.name,
        category: s.category,
        iconName: s.iconName,
        proceduralType: s.proceduralType,
        x: s.x,
        y: s.y,
        volume: s.volume,
        pitch: s.pitch,
        triggerRate: s.triggerRate,
        drift: s.drift,
        isMuted: s.isMuted,
        isSolo: s.isSolo,
        color: s.color,
      })),
    };

    const updatedPresets = [...presets, customPreset];
    setPresets(updatedPresets);
    setCurrentPresetId(customPreset.id);
    setHasUnsavedChanges(false);

    try {
      const customsOnly = updatedPresets.filter((p) => p.isCustom);
      localStorage.setItem(LOCAL_STORAGE_CUSTOM_PRESETS, JSON.stringify(customsOnly));
    } catch (_) {}
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 'Escape') {
        setScene((prev) => ({ ...prev, selectedSourceId: null }));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.key.toLowerCase() === 'm' && scene.selectedSourceId) {
        const sel = scene.sources.find((s) => s.instanceId === scene.selectedSourceId);
        if (sel) handleUpdateSource({ ...sel, isMuted: !sel.isMuted });
      } else if (e.key.toLowerCase() === 's' && scene.selectedSourceId) {
        const sel = scene.sources.find((s) => s.instanceId === scene.selectedSourceId);
        if (sel) handleUpdateSource({ ...sel, isSolo: !sel.isSolo });
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isPlaying, scene, undoStack, redoStack]);

  const selectedSource = scene.sources.find((s) => s.instanceId === scene.selectedSourceId) || null;

  const assistantNode = (
    <Assistant
      view={view}
      sceneName={scene.name}
      sceneSources={scene.sources.map((s) => s.name)}
      onOpenPreset={(id) => {
        if (view === 'landing') {
          window.dispatchEvent(new CustomEvent('foley:hear-preset', { detail: id }));
        } else {
          handleSelectPreset(id);
        }
      }}
    />
  );

  if (view === 'landing') {
    return (
      <>
        <LandingPage
          onLaunchStudio={(presetId) => {
            if (presetId) handleSelectPreset(presetId);
            setView('studio');
            window.location.hash = '#studio';
          }}
        />
        {assistantNode}
      </>
    );
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg-main)',
        position: 'relative',
      }}
    >
      {/* Top Application Bar */}
      <TopBar
        sceneName={scene.name}
        presets={presets}
        currentPresetId={currentPresetId}
        hasUnsavedChanges={hasUnsavedChanges}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        isPlaying={isPlaying}
        master={scene.master}
        onRenameScene={(name) => {
          setScene((prev) => ({ ...prev, name }));
          setHasUnsavedChanges(true);
        }}
        onSelectPreset={handleSelectPreset}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onTogglePlay={handleTogglePlay}
        onStop={handleStop}
        onUpdateMasterVolume={(vol) => {
          setScene((prev) => ({
            ...prev,
            master: { ...prev.master, volume: vol },
          }));
          setHasUnsavedChanges(true);
        }}
        onOpenSaveModal={() => setIsSaveModalOpen(true)}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onOpenShortcutsModal={() => setIsShortcutsModalOpen(true)}
        onNavigateToLanding={() => {
          setView('landing');
          window.location.hash = '#landing';
        }}
      />

      {/* First-Run Welcome Banner */}
      {showFirstRunBanner && !isPlaying && (
        <FirstRunBanner
          isPlaying={isPlaying}
          sceneName={scene.name}
          onStartAudio={handleTogglePlay}
          onDismiss={() => setShowFirstRunBanner(false)}
        />
      )}

      {/* Main Workspace (Spatial Canvas + Contextual Inspector) */}
      <div className="foley-workspace">
        {/* Main Spatial Stage (Hero ~65%) */}
        <SpatialCanvas
          sources={scene.sources}
          selectedSourceId={scene.selectedSourceId}
          isPlaying={isPlaying}
          onSelectSource={(id) => setScene((prev) => ({ ...prev, selectedSourceId: id }))}
          onUpdateSourcePosition={handleUpdateSourcePosition}
          onRemoveSource={handleRemoveSource}
          onDropNewSource={handleDropNewSource}
        />

        {/* Right Inspector Panel */}
        <SourceInspector
          selectedSource={selectedSource}
          room={scene.room}
          master={scene.master}
          onUpdateSource={handleUpdateSource}
          onRemoveSource={handleRemoveSource}
          onUpdateRoom={(room: RoomSettings) => {
            pushUndoSnapshot({ ...scene, room });
          }}
          onUpdateMaster={(master: MasterSettings) => {
            pushUndoSnapshot({ ...scene, master });
          }}
          onResetSource={handleResetSource}
        />
      </div>

      {/* Docked Audio Monitor Strip */}
      <div
        style={{
          padding: '0 14px 6px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <AudioMonitor
          isPlaying={isPlaying}
          activeVoicesCount={
            isPlaying
              ? scene.sources.filter((s) => !s.isMuted && (!scene.sources.some((x) => x.isSolo) || s.isSolo)).length
              : 0
          }
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
            Spatial Model: <strong style={{ color: 'var(--text-secondary)' }}>Binaural HRTF 3D</strong>
          </span>
          <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>•</span>
          <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
            Acoustics: <strong style={{ color: 'var(--text-secondary)' }}>Convolution Engine</strong>
          </span>
        </div>
      </div>

      {/* Bottom Collapsible Sound Palette */}
      <SoundPalette
        isCollapsed={isPaletteCollapsed}
        onToggleCollapse={() => setIsPaletteCollapsed(!isPaletteCollapsed)}
        onAddSourceToStage={(def) => handleAddSourceToStage(def)}
      />

      {/* Modals & Dialogs */}
      <ExportDialog
        isOpen={isExportModalOpen}
        scene={scene}
        onClose={() => setIsExportModalOpen(false)}
        onImportScene={(imported) => {
          setScene(imported);
          if (isPlaying) audioEngine.syncScene(imported);
        }}
      />

      <SavePresetDialog
        isOpen={isSaveModalOpen}
        currentName={scene.name}
        onClose={() => setIsSaveModalOpen(false)}
        onSave={handleSaveCustomPreset}
      />

      <ShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />

      {assistantNode}
    </div>
  );
};

export default App;
