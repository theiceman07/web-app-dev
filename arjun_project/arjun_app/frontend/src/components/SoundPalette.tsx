import React, { useState } from 'react';
import { SOUND_CATALOG, CATEGORIES } from '../data/soundCatalog';
import type { SoundSourceDef, SoundCategory } from '../types';
import * as Icons from '../icons';

interface SoundPaletteProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onAddSourceToStage: (def: SoundSourceDef) => void;
  onPreviewSound?: (def: SoundSourceDef) => void;
}

export const SoundPalette: React.FC<SoundPaletteProps> = ({
  isCollapsed,
  onToggleCollapse,
  onAddSourceToStage,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<SoundCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter catalog based on category and search query
  const filteredSounds = SOUND_CATALOG.filter((sound) => {
    const matchesCat = selectedCategory === 'all' || sound.category === selectedCategory;
    const matchesSearch =
      searchQuery.trim() === '' ||
      sound.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sound.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sound.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const renderIcon = (iconName: string, size = 16) => {
    const IconComponent = (Icons as any)[iconName] || Icons.Volume2;
    return <IconComponent size={size} />;
  };

  const handleDragStart = (e: React.DragEvent, defId: string) => {
    e.dataTransfer.setData('application/foleycraft-sound', defId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      className="foley-panel"
      style={{
        width: '100%',
        transition: 'height 0.25s cubic-bezier(0.2, 0.8, 0.3, 1)',
        height: isCollapsed ? '38px' : '210px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderTop: '1px solid var(--border-subtle)',
      }}
    >
      {/* Palette Header Bar */}
      <div
        style={{
          height: '38px',
          minHeight: '38px',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-main)',
          borderBottom: isCollapsed ? 'none' : '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Sound Library
          </span>
          <span
            className="font-mono"
            style={{
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: '4px',
              background: 'var(--bg-surface)',
              color: 'var(--text-muted)',
            }}
          >
            {filteredSounds.length} Available
          </span>
        </div>

        {/* Search Bar & Collapse Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {!isCollapsed && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '2px 8px',
                height: '26px',
              }}
            >
              <Icons.Search size={13} color="var(--text-muted)" />
              <input
                type="text"
                placeholder="Search sounds or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '11px',
                  width: '140px',
                }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ color: 'var(--text-muted)' }}>
                  <Icons.X size={12} />
                </button>
              )}
            </div>
          )}

          <button
            onClick={onToggleCollapse}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {isCollapsed ? <Icons.ChevronUp size={14} /> : <Icons.ChevronDown size={14} />}
            <span>{isCollapsed ? 'Show Library' : 'Hide'}</span>
          </button>
        </div>
      </div>

      {/* Main Drawer Content */}
      {!isCollapsed && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Category Filter Pills */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              padding: '8px 16px',
              overflowX: 'auto',
              background: 'var(--bg-panel)',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  padding: '3px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  background: selectedCategory === cat.id ? 'var(--accent-amber)' : 'var(--bg-surface)',
                  color: selectedCategory === cat.id ? '#000000' : 'var(--text-secondary)',
                  border: `1px solid ${selectedCategory === cat.id ? 'var(--accent-amber)' : 'var(--border-subtle)'}`,
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Sound Cards Horizontal Scroll / Grid */}
          <div
            style={{
              flex: 1,
              padding: '10px 16px',
              overflowX: 'auto',
              overflowY: 'hidden',
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
            }}
          >
            {filteredSounds.length > 0 ? (
              filteredSounds.map((sound) => (
                <div
                  key={sound.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, sound.id)}
                  className="foley-surface"
                  style={{
                    minWidth: '220px',
                    width: '220px',
                    height: '110px',
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    cursor: 'grab',
                    transition: 'border-color 0.15s ease, transform 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent-amber)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {/* Card Header: Icon & Name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        background: 'rgba(255, 50, 84, 0.1)',
                        border: '1px solid rgba(255, 50, 84, 0.25)',
                        color: 'var(--accent-amber)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {renderIcon(sound.iconName, 15)}
                    </div>
                    <div style={{ overflow: 'hidden' }}>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                        }}
                      >
                        {sound.name}
                      </div>
                      <span
                        style={{
                          fontSize: '9.5px',
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {sound.category}
                      </span>
                    </div>
                  </div>

                  {/* Card Description */}
                  <p
                    style={{
                      fontSize: '10.5px',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.3,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      margin: '4px 0',
                    }}
                  >
                    {sound.description}
                  </p>

                  {/* Card Footer: Add to Stage Button */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                    <button
                      onClick={() => onAddSourceToStage(sound)}
                      style={{
                        padding: '3px 10px',
                        borderRadius: '4px',
                        fontSize: '10.5px',
                        fontWeight: 600,
                        background: 'rgba(255, 50, 84, 0.15)',
                        border: '1px solid var(--accent-amber)',
                        color: 'var(--accent-amber)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Icons.Plus size={12} />
                      Add to Stage
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                }}
              >
                <Icons.SearchX size={18} />
                No sounds match "{searchQuery}" in this category.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
