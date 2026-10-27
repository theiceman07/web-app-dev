import React, { useState } from 'react';
import type { SceneState } from '../types';
import { audioEngine } from '../audio/audioEngine';
import * as Icons from '../icons';

interface ExportDialogProps {
  isOpen: boolean;
  scene: SceneState;
  onClose: () => void;
  onImportScene: (imported: SceneState) => void;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  isOpen,
  scene,
  onClose,
  onImportScene,
}) => {
  const [duration, setDuration] = useState<number>(15);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [renderedWavUrl, setRenderedWavUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'audio' | 'json'>('audio');

  if (!isOpen) return null;

  const handleStartRender = async () => {
    setIsRendering(true);
    setProgress(10);
    setRenderedWavUrl(null);

    try {
      const wavBlob = await audioEngine.exportOfflineWav(scene, duration, (p) => {
        setProgress(p);
      });

      const url = URL.createObjectURL(wavBlob);
      setRenderedWavUrl(url);

      // Auto-download file
      const a = document.createElement('a');
      a.href = url;
      a.download = `${scene.name.toLowerCase().replace(/\s+/g, '_')}_foleycraft.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Render failed:', err);
    } finally {
      setIsRendering(false);
    }
  };

  const handleExportJson = () => {
    const jsonStr = JSON.stringify(scene, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scene.name.toLowerCase().replace(/\s+/g, '_')}_scene.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const imported = JSON.parse(evt.target?.result as string);
        if (imported.sources && imported.room && imported.master) {
          onImportScene(imported);
          onClose();
        } else {
          alert('Invalid FoleyCraft scene JSON file structure.');
        }
      } catch (err) {
        alert('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
  };

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
          width: '460px',
          maxWidth: '100%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-panel)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
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
            <Icons.Download size={18} color="var(--accent-amber)" />
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Export Studio Soundscape
            </h3>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <Icons.X size={18} />
          </button>
        </div>

        {/* Tab Selector: Audio WAV vs Scene JSON */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setActiveTab('audio')}
            style={{
              flex: 1,
              padding: '10px',
              fontSize: '12px',
              fontWeight: 600,
              color: activeTab === 'audio' ? 'var(--accent-amber)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'audio' ? '2px solid var(--accent-amber)' : '2px solid transparent',
              background: activeTab === 'audio' ? 'var(--bg-panel)' : 'transparent',
            }}
          >
            Render WAV Audio
          </button>
          <button
            onClick={() => setActiveTab('json')}
            style={{
              flex: 1,
              padding: '10px',
              fontSize: '12px',
              fontWeight: 600,
              color: activeTab === 'json' ? 'var(--accent-amber)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'json' ? '2px solid var(--accent-amber)' : '2px solid transparent',
              background: activeTab === 'json' ? 'var(--bg-panel)' : 'transparent',
            }}
          >
            Scene Configuration (JSON)
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {activeTab === 'audio' ? (
            <>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Render Loop Duration
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '8px' }}>
                  {[10, 15, 30].map((sec) => (
                    <button
                      key={sec}
                      onClick={() => setDuration(sec)}
                      disabled={isRendering}
                      className="foley-surface"
                      style={{
                        padding: '10px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: duration === sec ? 'var(--accent-amber)' : 'var(--text-secondary)',
                        borderColor: duration === sec ? 'var(--accent-amber)' : 'var(--border-subtle)',
                        background: duration === sec ? 'var(--bg-surface-active)' : 'var(--bg-surface)',
                      }}
                    >
                      {sec} Seconds
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="foley-surface font-mono"
                style={{
                  padding: '12px',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div>Output Format: <span style={{ color: 'var(--text-primary)' }}>16-Bit PCM WAV (Stereo)</span></div>
                <div>Sample Rate: <span style={{ color: 'var(--text-primary)' }}>44.1 kHz</span></div>
                <div>Acoustics: <span style={{ color: 'var(--signal-green)' }}>Spatial HRTF + Convolution Reverb</span></div>
              </div>

              {/* Render Progress Bar */}
              {isRendering && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Rendering Offline Audio Graph...</span>
                    <span className="font-mono" style={{ color: 'var(--signal-green)' }}>{progress}%</span>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: '6px',
                      background: 'var(--bg-surface)',
                      borderRadius: '3px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${progress}%`,
                        height: '100%',
                        background: 'var(--signal-green)',
                        transition: 'width 0.2s ease',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Render Action Button */}
              <button
                onClick={handleStartRender}
                disabled={isRendering}
                style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'linear-gradient(135deg, #FF3254 0%, #D9163A 100%)',
                  color: '#000000',
                  fontWeight: 700,
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 0 16px rgba(255, 50, 84, 0.3)',
                  cursor: isRendering ? 'wait' : 'pointer',
                  opacity: isRendering ? 0.7 : 1,
                }}
              >
                {isRendering ? (
                  <>
                    <Icons.Loader2 size={16} className="animate-spin" />
                    <span>Rendering {duration}s Audio...</span>
                  </>
                ) : (
                  <>
                    <Icons.Download size={16} />
                    <span>Render & Download WAV File</span>
                  </>
                )}
              </button>

              {renderedWavUrl && !isRendering && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(25, 243, 255, 0.1)',
                    border: '1px solid var(--signal-green)',
                    fontSize: '11px',
                    color: 'var(--signal-green)',
                  }}
                >
                  <span>✓ WAV rendered successfully!</span>
                  <a
                    href={renderedWavUrl}
                    download={`${scene.name.toLowerCase().replace(/\s+/g, '_')}_foleycraft.wav`}
                    style={{ color: 'var(--text-primary)', textDecoration: 'underline', fontWeight: 600 }}
                  >
                    Click to Re-download
                  </a>
                </div>
              )}
            </>
          ) : (
            <>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Export your current scene layout, sound emitter positions, and room reverb parameters as a shareable JSON file.
              </p>

              <button
                onClick={handleExportJson}
                className="foley-surface"
                style={{
                  padding: '12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <Icons.FileJson size={16} color="var(--accent-amber)" />
                Download Scene JSON File
              </button>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Import Existing Scene JSON
                </label>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportJson}
                  style={{
                    display: 'block',
                    marginTop: '8px',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
