import React from 'react';

/**
 * Google Material Symbols (fonts.google.com/icons) behind a Lucide-shaped API,
 * so call sites keep writing <Icons.Play size={16} fill="currentColor" />.
 * Glyphs are loaded as a subset in frontend/index.html; add any new glyph
 * name to the icon_names list there too (alphabetical).
 */
export interface IconProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'> {
  size?: number | string;
  color?: string;
  fill?: string | boolean;
  strokeWidth?: number;
  absoluteStrokeWidth?: boolean;
}

export const MaterialIcon: React.FC<IconProps & { glyph: string }> = ({
  glyph,
  size = 20,
  color,
  fill,
  strokeWidth: _strokeWidth,
  absoluteStrokeWidth: _absolute,
  style,
  className,
  ...rest
}) => {
  const filled = fill !== undefined && fill !== false && fill !== 'none';
  return (
    <span
      aria-hidden="true"
      {...rest}
      className={`ms${className ? ` ${className}` : ''}`}
      style={{
        fontSize: typeof size === 'number' ? `${size}px` : size,
        color,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}`,
        ...style,
      }}
    >
      {glyph}
    </span>
  );
};

const make = (glyph: string, displayName: string) => {
  const Comp: React.FC<IconProps> = (props) => <MaterialIcon glyph={glyph} {...props} />;
  Comp.displayName = displayName;
  return Comp;
};

// UI icons
export const X = make('close', 'X');
export const Volume = make('volume_up', 'Volume');
export const Volume1 = Volume;
export const Volume2 = Volume;
export const VolumeX = make('volume_off', 'VolumeX');
export const Play = make('play_arrow', 'Play');
export const Pause = make('pause', 'Pause');
export const Square = make('stop', 'Square');
export const Download = make('download', 'Download');
export const Save = make('save', 'Save');
export const ArrowRight = make('arrow_forward', 'ArrowRight');
export const ArrowLeft = make('arrow_back', 'ArrowLeft');
export const ArrowUpRight = make('arrow_outward', 'ArrowUpRight');
export const ChevronUp = make('expand_less', 'ChevronUp');
export const ChevronDown = make('expand_more', 'ChevronDown');
export const ZoomIn = make('add', 'ZoomIn');
export const ZoomOut = make('remove', 'ZoomOut');
export const Undo = make('undo', 'Undo');
export const Undo2 = Undo;
export const Redo = make('redo', 'Redo');
export const Redo2 = Redo;
export const Trash = make('delete', 'Trash');
export const Trash2 = Trash;
export const Sparkles = make('auto_awesome', 'Sparkles');
export const Sliders = make('tune', 'Sliders');
export const Search = make('search', 'Search');
export const SearchX = make('search_off', 'SearchX');
export const RotateCcw = make('restart_alt', 'RotateCcw');
export const RefreshCw = make('refresh', 'RefreshCw');
export const Plus = make('add', 'Plus');
export const Pencil = make('edit', 'Pencil');
export const MousePointerClick = make('touch_app', 'MousePointerClick');
export const Loader = make('progress_activity', 'Loader');
export const Loader2 = Loader;
export const Keyboard = make('keyboard', 'Keyboard');
export const HelpCircle = make('help', 'HelpCircle');
export const FolderOpen = make('folder_open', 'FolderOpen');
export const FileJson = make('data_object', 'FileJson');
export const Box = make('deployed_code', 'Box');
export const Radio = make('sensors', 'Radio');
export const Headphones = make('headphones', 'Headphones');
export const AudioWaveform = make('graphic_eq', 'AudioWaveform');
export const Send = make('send', 'Send');
export const Check = make('check', 'Check');
export const Home = make('home', 'Home');
export const Info = make('info', 'Info');
export const AlertTriangle = make('warning', 'AlertTriangle');
export const AlertCircle = make('error', 'AlertCircle');
export const MessageCircle = make('chat_bubble', 'MessageCircle');

// Sound-category glyphs, looked up by name from the catalog (iconName).
export const Bug = make('bug_report', 'Bug');
export const Clock = make('schedule', 'Clock');
export const CloudLightning = make('thunderstorm', 'CloudLightning');
export const CloudRain = make('rainy', 'CloudRain');
export const Disc = make('album', 'Disc');
export const Droplets = make('water_drop', 'Droplets');
export const Flame = make('local_fire_department', 'Flame');
export const FlameKindling = make('fireplace', 'FlameKindling');
export const Footprints = make('footprint', 'Footprints');
export const Gauge = make('speed', 'Gauge');
export const Hammer = make('hardware', 'Hammer');
export const Trees = make('forest', 'Trees');
export const Waves = make('waves', 'Waves');
export const Wind = make('air', 'Wind');
export const Zap = make('bolt', 'Zap');
