import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Icons from '../icons';
import '../landing.css';
import { audioEngine } from '../audio/audioEngine';
import { INITIAL_PRESETS } from '../data/initialPresets';
import { SOUND_CATALOG } from '../data/soundCatalog';
import type { Preset, SceneState, SoundCategory, SoundSourceInstance } from '../types';
import {
  CountUp,
  Magnet,
  Marquee,
  PALETTE,
  PALETTE_LIST,
  Reveal,
  ShapeField,
  ShapeGlyph,
  SplitReveal,
  useLenis,
} from './fx';

interface LandingPageProps {
  onLaunchStudio: (presetId?: string) => void;
}

// Radar geometry: the stage shows a 6.5 m radius inside a 400-unit viewBox.
const VB = 400;
const CENTER = VB / 2;
const STAGE_RADIUS_M = 6.5;
const PX_PER_M = 190 / STAGE_RADIUS_M;
const CLAMP_M = 6;
const NUDGE_M = 0.5;

const CATEGORY_LABEL: Record<SoundCategory, string> = {
  fire: 'Fire',
  water: 'Water',
  weather: 'Weather',
  nature: 'Nature',
  movement: 'Movement',
  interior: 'Interior',
  industrial: 'Industrial',
  scifi: 'Sci-fi',
};
const CATEGORY_COLOR: Record<SoundCategory, string> = {
  fire: PALETTE.pink,
  water: PALETTE.cyan,
  weather: PALETTE.purple,
  nature: PALETTE.lime,
  movement: PALETTE.orange,
  interior: PALETTE.yellow,
  industrial: '#FFFFFF',
  scifi: PALETTE.cyan,
};

const ROOMS = [
  { id: 'small', label: 'Small room', decay: 0.8 },
  { id: 'large', label: 'Large hall', decay: 3.8 },
  { id: 'cathedral', label: 'Cathedral', decay: 6.5 },
];

// Tile colours for the preset grid; ink is chosen for contrast on each ground.
const TILES = [
  { bg: PALETTE.pink, ink: '#000' },
  { bg: PALETTE.cyan, ink: '#000' },
  { bg: PALETTE.yellow, ink: '#000' },
  { bg: PALETTE.purple, ink: '#fff' },
  { bg: PALETTE.orange, ink: '#000' },
  { bg: PALETTE.lime, ink: '#000' },
  { bg: PALETTE.cyan, ink: '#000' },
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const toInstances = (preset: Preset): SoundSourceInstance[] =>
  preset.sources.map((s, i) => ({ ...s, instanceId: `preview_${preset.id}_${i}` }));

// Small seeded generator so "render again" gives a different but reproducible take.
const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const describeBearing = (x: number, y: number) => {
  const deg = Math.round((Math.atan2(x, y) * 180) / Math.PI);
  const abs = Math.abs(deg);
  if (abs < 5) return 'straight ahead';
  if (abs > 175) return 'directly behind';
  return `${abs}° ${deg < 0 ? 'left' : 'right'}`;
};

// A preset drawn as the listener plus each sound at its real position.
const Constellation: React.FC<{ preset: Preset }> = ({ preset }) => (
  <svg
    className="lp-const"
    viewBox="-7 -7 14 14"
    role="img"
    aria-label={`${preset.name}: ${preset.sources.length} sounds around the listener`}
  >
    <circle r="3" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="0.08" />
    <circle r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="0.08" />
    <circle r="0.5" fill="currentColor" />
    {preset.sources.map((s, i) => (
      <g key={i} transform={`translate(${s.x} ${-s.y})`}>
        <ShapeGlyph kind={i} r={0.85} color="currentColor" />
      </g>
    ))}
  </svg>
);

export const LandingPage: React.FC<LandingPageProps> = ({ onLaunchStudio }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragId = useRef<string | null>(null);
  const velocity = useRef(0);

  const [presetId, setPresetId] = useState<string>(INITIAL_PRESETS[0].id);
  const [emitters, setEmitters] = useState<SoundSourceInstance[]>(() => toInstances(INITIAL_PRESETS[0]));
  const [selectedId, setSelectedId] = useState<string>(() => toInstances(INITIAL_PRESETS[0])[0].instanceId);
  const [playing, setPlaying] = useState<boolean>(false);
  const [takeSeed, setTakeSeed] = useState<number>(7);
  const [roomId, setRoomId] = useState<string>('large');
  const [dist, setDist] = useState<number>(4);

  const { scrollTo } = useLenis(rootRef, innerRef, (progress, v) => {
    rootRef.current?.style.setProperty('--p', progress.toFixed(4));
    velocity.current = v;
  });

  const preset = INITIAL_PRESETS.find((p) => p.id === presetId) || INITIAL_PRESETS[0];
  const selected = emitters.find((e) => e.instanceId === selectedId) || emitters[0];

  const selectPreset = (id: string) => {
    const next = INITIAL_PRESETS.find((p) => p.id === id) || INITIAL_PRESETS[0];
    const inst = toInstances(next);
    setPresetId(next.id);
    setEmitters(inst);
    setSelectedId(inst[0].instanceId);
  };

  // Keep the engine in step with the stage whenever sound is on.
  useEffect(() => {
    if (!playing) return;
    const scene: SceneState = {
      id: 'landing_preview',
      name: preset.name,
      sources: emitters,
      room: preset.room,
      master: preset.master,
      selectedSourceId: null,
      createdAt: 0,
      updatedAt: 0,
    };
    audioEngine.syncScene(scene);
  }, [playing, emitters, preset]);

  // Never leave the preview running when the visitor moves on.
  useEffect(() => () => audioEngine.pause(), []);

  const togglePlaying = async () => {
    if (playing) {
      audioEngine.pause();
      setPlaying(false);
    } else {
      await audioEngine.play();
      setPlaying(true);
    }
  };

  const hearPreset = async (id: string) => {
    selectPreset(id);
    scrollTo('#stage');
    if (!playing) {
      await audioEngine.play();
      setPlaying(true);
    }
  };

  // The floating assistant can ask the page to play a scene.
  const hearRef = useRef(hearPreset);
  hearRef.current = hearPreset;
  useEffect(() => {
    const onHear = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id) void hearRef.current(id);
    };
    window.addEventListener('foley:hear-preset', onHear);
    return () => window.removeEventListener('foley:hear-preset', onHear);
  }, []);

  const goTo = (e: React.MouseEvent, target: string | number) => {
    e.preventDefault();
    scrollTo(target as string);
  };

  const askAssistant = (prompt?: string) =>
    window.dispatchEvent(new CustomEvent('foley:assistant-open', { detail: prompt }));

  const moveEmitter = (id: string, x: number, y: number) => {
    setEmitters((prev) => prev.map((e) => (e.instanceId === id ? { ...e, x, y } : e)));
  };

  const pointerToMeters = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * VB;
    const py = ((e.clientY - rect.top) / rect.height) * VB;
    return {
      x: clamp((px - CENTER) / PX_PER_M, -CLAMP_M, CLAMP_M),
      y: clamp((CENTER - py) / PX_PER_M, -CLAMP_M, CLAMP_M),
    };
  };

  const onEmitterKey = (e: React.KeyboardEvent, em: SoundSourceInstance) => {
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-NUDGE_M, 0],
      ArrowRight: [NUDGE_M, 0],
      ArrowUp: [0, NUDGE_M],
      ArrowDown: [0, -NUDGE_M],
    };
    const d = step[e.key];
    if (!d) return;
    e.preventDefault();
    moveEmitter(em.instanceId, clamp(em.x + d[0], -CLAMP_M, CLAMP_M), clamp(em.y + d[1], -CLAMP_M, CLAMP_M));
  };

  // Simple ear model for the readout and the direction diagram.
  const ears = useMemo(() => {
    const d = Math.hypot(selected.x, selected.y);
    const pan = d > 0.001 ? selected.x / d : 0;
    const gain = 1 / (1 + d * 0.18);
    return {
      dist: d,
      left: Math.sqrt((1 - pan) / 2) * gain,
      right: Math.sqrt((1 + pan) / 2) * gain,
    };
  }, [selected]);

  const takes = useMemo(() => {
    return [takeSeed, takeSeed + 101].map((s) => {
      const rnd = seeded(s * 9973);
      return Array.from({ length: 30 }, () => ({ x: 8 + rnd() * 384, h: 14 + rnd() * 54 }));
    });
  }, [takeSeed]);

  const room = ROOMS.find((r) => r.id === roomId) || ROOMS[1];
  const tailPath = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 60; i++) {
      const t = (i / 60) * 8;
      const y = 100 - 88 * Math.exp((-6.9 * t) / room.decay);
      pts.push(`${i === 0 ? 'M' : 'L'}${(i / 60) * 392 + 4} ${y.toFixed(1)}`);
    }
    return `${pts.join(' ')} L396 100 L4 100 Z`;
  }, [room]);

  const catalogByCategory = useMemo(() => {
    const groups = new Map<SoundCategory, string[]>();
    SOUND_CATALOG.forEach((s) => {
      groups.set(s.category, [...(groups.get(s.category) || []), s.name]);
    });
    return [...groups.entries()];
  }, []);

  const marqueeA = useMemo(() => SOUND_CATALOG.map((s) => s.name), []);
  const marqueeB = useMemo(() => INITIAL_PRESETS.map((p) => p.name), []);

  // Same formula the audio engine uses for air absorption.
  const airCutoff = Math.max(1800, 20000 - dist * 1600);

  // Direction diagram geometry.
  const headX = 200;
  const headY = 110;
  const srcX = clamp(headX + selected.x * 22, 24, 376);
  const srcY = clamp(headY - selected.y * 14, 18, 202);

  return (
    <div className="landing" ref={rootRef}>
      <div ref={innerRef}>
        <header className="lp-top">
          <a className="lp-brand" href="#top" onClick={(e) => goTo(e, 0)} aria-label="FoleyCraft, back to top">
            <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
              <circle cx="9" cy="9" r="8" fill={PALETTE.pink} />
              <path d="M2 27a12 12 0 0 1 24 0Z" fill={PALETTE.cyan} />
            </svg>
            foleycraft
          </a>
          <div className="lp-progress" aria-hidden="true">
            <span>intro</span>
            <i><b /></i>
            <span>studio</span>
          </div>
          <button className="lp-top-link" onClick={() => onLaunchStudio()}>
            open the studio
          </button>
        </header>

        <main id="top">
          <section className="lp-hero" aria-labelledby="hero-title">
            <ShapeField className="lp-hero-shapes" />
            <div className="lp-hero-row">
              <SplitReveal as="h1" id="hero-title" className="lp-h1" text="Place sound around you." delay={0.1} />
              <div className="lp-hero-side">
                <Reveal delay={0.25} y={24}>
                  <p className="lp-hero-sub">
                    Drag torches, rain and wind around your head. Every sound is generated live, so nothing loops.
                  </p>
                  <div className="lp-hero-actions">
                    <Magnet>
                      <button className="lp-btn" onClick={() => onLaunchStudio()}>
                        Open the studio
                        <Icons.ArrowRight size={20} />
                      </button>
                    </Magnet>
                    <button className="lp-link" onClick={togglePlaying} aria-pressed={playing}>
                      {playing ? <Icons.Pause size={20} fill="currentColor" /> : <Icons.Play size={20} fill="currentColor" />}
                      {playing ? 'Pause the preview' : 'Hear it first'}
                    </button>
                  </div>
                  <p className="lp-hint">Best with headphones. Sound only starts when you press play.</p>
                </Reveal>
              </div>
            </div>
          </section>

          <section className="lp-stage-wrap" id="stage" aria-label="Spatial stage">
            <div className="lp-stage">
              <svg
                ref={svgRef}
                className="lp-radar"
                viewBox={`0 0 ${VB} ${VB}`}
                role="group"
                aria-label="Spatial stage. Drag a sound around the listener, or focus it and use the arrow keys."
                onPointerMove={(e) => {
                  if (!dragId.current) return;
                  const m = pointerToMeters(e);
                  moveEmitter(dragId.current, m.x, m.y);
                }}
                onPointerUp={() => (dragId.current = null)}
                onPointerCancel={() => (dragId.current = null)}
              >
                {[2, 4, 6].map((m) => (
                  <circle key={m} className="ring" cx={CENTER} cy={CENTER} r={m * PX_PER_M} />
                ))}
                <text className="ring-label" x={CENTER} y={26} textAnchor="middle">Front</text>
                <text className="ring-label" x={CENTER} y={VB - 14} textAnchor="middle">Behind</text>

                <circle cx={CENTER} cy={CENTER} r="20" fill="#fff" />
                <g transform={`translate(${CENTER} ${CENTER})`} stroke="#000" strokeWidth="2.6" strokeLinecap="round" fill="#000" aria-hidden="true">
                  <path d="M-9 3v-3a9 9 0 0 1 18 0v3" fill="none" />
                  <rect x="-11.5" y="1.5" width="5" height="9" rx="2" />
                  <rect x="6.5" y="1.5" width="5" height="9" rx="2" />
                </g>

                {emitters.map((em, i) => {
                  const cx = CENTER + em.x * PX_PER_M;
                  const cy = CENTER - em.y * PX_PER_M;
                  const color = PALETTE_LIST[i % PALETTE_LIST.length];
                  const labelRight = em.x <= 0;
                  const isSel = em.instanceId === selectedId;
                  return (
                    <g
                      key={em.instanceId}
                      className={`lp-emitter${playing ? ' is-live' : ''}${isSel ? ' is-selected' : ''}`}
                      tabIndex={0}
                      role="button"
                      aria-label={`${em.name}, ${Math.hypot(em.x, em.y).toFixed(1)} metres, ${describeBearing(em.x, em.y)}`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        dragId.current = em.instanceId;
                        setSelectedId(em.instanceId);
                        svgRef.current?.setPointerCapture(e.pointerId);
                      }}
                      onFocus={() => setSelectedId(em.instanceId)}
                      onKeyDown={(e) => onEmitterKey(e, em)}
                    >
                      <circle className="pulse" cx={cx} cy={cy} r="14" stroke={color} />
                      <circle className="focus-ring" cx={cx} cy={cy} r="22" />
                      <circle cx={cx} cy={cy} r="28" fill="transparent" />
                      <g transform={`translate(${cx} ${cy})`}>
                        <g className="shape">
                          <ShapeGlyph kind={i} r={isSel ? 14 : 11} color={color} />
                        </g>
                      </g>
                      <text x={labelRight ? cx + 22 : cx - 22} y={cy + 5} textAnchor={labelRight ? 'start' : 'end'}>
                        {em.name}
                      </text>
                    </g>
                  );
                })}
              </svg>

              <div className="lp-panel">
                <p className="lp-panel-kicker">Selected sound</p>
                <h2 className="lp-panel-name">{selected.name}</h2>
                <p className="lp-panel-meta" aria-live="polite">
                  <strong>{ears.dist.toFixed(1)} m</strong>, {describeBearing(selected.x, selected.y)}
                </p>
                <div className="lp-ears">
                  <div className="lp-ear">
                    <span>Left ear</span>
                    <span className="lp-ear-bar"><i style={{ width: `${Math.round(ears.left * 100)}%` }} /></span>
                  </div>
                  <div className="lp-ear">
                    <span>Right ear</span>
                    <span className="lp-ear-bar"><i style={{ width: `${Math.round(ears.right * 100)}%` }} /></span>
                  </div>
                </div>
                <p className="lp-panel-tip">Drag a shape, or focus it and use the arrow keys.</p>
                <div className="lp-chips" role="group" aria-label="Choose a scene">
                  {INITIAL_PRESETS.slice(0, 4).map((p) => (
                    <button key={p.id} className="lp-chip" aria-pressed={p.id === presetId} onClick={() => selectPreset(p.id)}>
                      {p.name}
                    </button>
                  ))}
                </div>
                <button className="lp-link lp-ask" onClick={() => askAssistant('Which scene should I start with?')}>
                  <Icons.MessageCircle size={20} />
                  Ask the sound designer
                </button>
              </div>
            </div>
          </section>

          <section className="lp-marquees" aria-label="Sounds and scenes">
            <Marquee items={marqueeA} speed={80} velocity={velocity} className="lp-marquee-a" />
            <Marquee items={marqueeB} speed={70} direction={-1} velocity={velocity} className="lp-marquee-b" />
          </section>

          <section className="lp-section" id="features" aria-labelledby="features-title">
            <div className="lp-head">
              <SplitReveal as="h2" id="features-title" className="lp-h2" text="Built for the way ears work." />
              <Reveal delay={0.1}>
                <p className="lp-lede">
                  Four things decide where a sound seems to be. Each one below is live: change it and watch the numbers move.
                </p>
              </Reveal>
            </div>

            <ol className="lp-rows">
              <li className="lp-row">
                <Reveal className="lp-row-visual lp-row-visual--purple">
                  <svg viewBox="0 0 400 220" role="img" aria-label="Top-down view of a head with the selected sound and the level reaching each ear">
                    <path d={`M${srcX} ${srcY} L${headX - 34} ${headY}`} stroke="#fff" strokeWidth={1 + ears.left * 9} strokeLinecap="round" />
                    <path d={`M${srcX} ${srcY} L${headX + 34} ${headY}`} stroke="#fff" strokeWidth={1 + ears.right * 9} strokeLinecap="round" />
                    <circle cx={headX} cy={headY} r="30" fill="#000" />
                    <rect x={headX - 38} y={headY - 10} width="8" height="20" rx="3" fill="#fff" />
                    <rect x={headX + 30} y={headY - 10} width="8" height="20" rx="3" fill="#fff" />
                    <path d={`M${headX - 6} ${headY - 30} L${headX} ${headY - 40} L${headX + 6} ${headY - 30} Z`} fill="#fff" />
                    <circle cx={srcX} cy={srcY} r="12" fill={PALETTE.yellow} />
                  </svg>
                </Reveal>
                <Reveal className="lp-row-text" delay={0.1}>
                  <h3>Direction</h3>
                  <p>
                    HRTF is a model of how your head and ears filter sound. FoleyCraft uses it to place each sound in front of
                    you, behind you or to one side, and you hear it through ordinary headphones.
                  </p>
                  <p className="lp-row-live">
                    <strong>{selected.name}</strong> is {describeBearing(selected.x, selected.y)}. Drag it on the stage above.
                  </p>
                </Reveal>
              </li>

              <li className="lp-row">
                <Reveal className="lp-row-visual lp-row-visual--pink">
                  <svg viewBox="0 0 400 220" role="img" aria-label={`A sound ${dist} metres away; high frequencies roll off above ${Math.round(airCutoff)} hertz`}>
                    <circle cx="200" cy="110" r="104" fill="#000" fillOpacity="0.12" />
                    <circle cx="200" cy="110" r="70" fill="#000" fillOpacity="0.14" />
                    <circle cx="200" cy="110" r="36" fill="#000" fillOpacity="0.18" />
                    <circle cx="200" cy="110" r="10" fill="#000" />
                    <circle cx={200 + (dist / 10) * 96} cy="110" r="11" fill="#fff" />
                  </svg>
                </Reveal>
                <Reveal className="lp-row-text" delay={0.1}>
                  <h3>Distance</h3>
                  <p>Far sounds get quieter and duller. Air absorbs high frequencies, so a torch eight metres away loses its sparkle.</p>
                  <label className="lp-range">
                    <span>Distance from you</span>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={0.5}
                      value={dist}
                      onChange={(e) => setDist(Number(e.target.value))}
                      aria-valuetext={`${dist} metres`}
                    />
                  </label>
                  <p className="lp-row-live">
                    <strong>{dist.toFixed(1)} m</strong>: frequencies above <strong>{Math.round(airCutoff).toLocaleString()} Hz</strong> fade out.
                  </p>
                </Reveal>
              </li>

              <li className="lp-row">
                <Reveal className="lp-row-visual lp-row-visual--cyan">
                  <svg viewBox="0 0 400 110" role="img" aria-label={`Reverb tail of a ${room.label.toLowerCase()}, ${room.decay} seconds`}>
                    <path d={tailPath} fill="#000" />
                  </svg>
                </Reveal>
                <Reveal className="lp-row-text" delay={0.1}>
                  <h3>Room</h3>
                  <p>
                    A generated impulse response adds the space around a sound. Decay runs from 0.2 to 8 seconds, so a drip can
                    die in a cabin or ring through a cathedral.
                  </p>
                  <div className="lp-chips lp-chips--left" role="group" aria-label="Choose a room">
                    {ROOMS.map((r) => (
                      <button key={r.id} className="lp-chip" aria-pressed={r.id === roomId} onClick={() => setRoomId(r.id)}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <p className="lp-row-live">Example decay: <strong>{room.decay} s</strong></p>
                </Reveal>
              </li>

              <li className="lp-row">
                <Reveal className="lp-row-visual lp-row-visual--yellow">
                  <svg viewBox="0 0 400 190" role="img" aria-label="Two renders of the same torch with different crackle timing">
                    {takes.map((take, row) => (
                      <g key={row}>
                        <text x="4" y={row * 96 + 18} fill="#000" fontSize="15" fontWeight="600">{`Take ${row + 1}`}</text>
                        {take.map((t, i) => (
                          <rect key={i} x={t.x} y={row * 96 + 90 - t.h} width="4" height={t.h} rx="2" fill="#000" />
                        ))}
                      </g>
                    ))}
                  </svg>
                </Reveal>
                <Reveal className="lp-row-text" delay={0.1}>
                  <h3>Never the same twice</h3>
                  <p>No two-minute loops. Pops, drips and gusts are synthesised as they happen, so the pattern never repeats.</p>
                  <button className="lp-small-btn" onClick={() => setTakeSeed((s) => s + 2)}>
                    <Icons.RefreshCw size={18} />
                    Render again
                  </button>
                </Reveal>
              </li>
            </ol>
          </section>

          <section className="lp-stats" aria-label="By the numbers">
            {[
              { n: SOUND_CATALOG.length, label: 'sounds', dec: 0 },
              { n: INITIAL_PRESETS.length, label: 'scenes', dec: 0 },
              { n: 0, label: 'loops', dec: 0 },
              { n: 44.1, label: 'kHz WAV export', dec: 1 },
            ].map((s) => (
              <Reveal key={s.label} className="lp-stat">
                <span className="lp-stat-n"><CountUp to={s.n} decimals={s.dec} /></span>
                <span className="lp-stat-l">{s.label}</span>
              </Reveal>
            ))}
          </section>

          <section className="lp-section" id="presets" aria-labelledby="presets-title">
            <div className="lp-head">
              <SplitReveal as="h2" id="presets-title" className="lp-h2" text={`${INITIAL_PRESETS.length} places to stand.`} />
              <Reveal delay={0.1}>
                <p className="lp-lede">Hear a scene here, or open it in the studio and rearrange everything.</p>
              </Reveal>
            </div>
            <div className="lp-tiles">
              {INITIAL_PRESETS.map((p, i) => {
                const t = TILES[i % TILES.length];
                return (
                  <Reveal key={p.id} as="article" className="lp-tile" delay={(i % 4) * 0.06} y={48}>
                    <div className="lp-tile-in" style={{ ['--tile' as string]: t.bg, ['--tile-ink' as string]: t.ink }}>
                      <Constellation preset={p} />
                      <p className="lp-tile-cat">{p.category}</p>
                      <h3>{p.name}</h3>
                      <p className="lp-tile-desc">{p.description}</p>
                      <div className="lp-tile-actions">
                        <button className="lp-tile-btn" onClick={() => hearPreset(p.id)}>
                          <Icons.Play size={18} fill="currentColor" />
                          Hear it
                        </button>
                        <button className="lp-tile-btn lp-tile-btn--ghost" onClick={() => onLaunchStudio(p.id)}>
                          Open
                        </button>
                      </div>
                    </div>
                  </Reveal>
                );
              })}
              <Reveal as="article" className="lp-tile" delay={0.1} y={48}>
                <div className="lp-tile-in lp-tile-in--cta" style={{ ['--tile' as string]: '#fff', ['--tile-ink' as string]: '#000' }}>
                  <h3>Make your own</h3>
                  <p className="lp-tile-desc">Start from an empty stage and place every sound yourself.</p>
                  <div className="lp-tile-actions">
                    <button className="lp-tile-btn" onClick={() => onLaunchStudio()}>
                      Open the studio
                      <Icons.ArrowRight size={18} />
                    </button>
                  </div>
                </div>
              </Reveal>
            </div>
          </section>

          <section className="lp-section" id="library" aria-labelledby="library-title">
            <div className="lp-head">
              <SplitReveal as="h2" id="library-title" className="lp-h2" text={`${SOUND_CATALOG.length} sounds, all generated.`} />
              <Reveal delay={0.1}>
                <p className="lp-lede">Drop any of them on the stage and shape it with rate, pitch and variation.</p>
              </Reveal>
            </div>
            <ul className="lp-catalog">
              {catalogByCategory.map(([cat, names]) => (
                <Reveal as="li" key={cat} className="lp-cat" y={24}>
                  <div className="lp-cat-in" style={{ ['--c' as string]: CATEGORY_COLOR[cat] }}>
                    <h3>{CATEGORY_LABEL[cat]}</h3>
                    <p>{names.join('  /  ')}</p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </section>

          <section className="lp-close" aria-labelledby="close-title">
            <SplitReveal as="h2" id="close-title" className="lp-close-h" text="Put on headphones." />
            <Reveal delay={0.1}>
              <p>Drag, listen, then export 16-bit WAV loops for Unity, Unreal and Godot.</p>
              <div className="lp-close-actions">
                <Magnet>
                  <button className="lp-btn lp-btn--dark" onClick={() => onLaunchStudio()}>
                    Open the studio
                    <Icons.ArrowRight size={20} />
                  </button>
                </Magnet>
                <button className="lp-link lp-link--dark" onClick={() => askAssistant()}>
                  <Icons.MessageCircle size={20} />
                  Ask the sound designer
                </button>
              </div>
            </Reveal>
          </section>
        </main>

        <footer className="lp-footer">
          <nav className="lp-footer-links" aria-label="Footer">
            <a href="#features" onClick={(e) => goTo(e, '#features')}>How it works</a>
            <a href="#presets" onClick={(e) => goTo(e, '#presets')}>Scenes</a>
            <a href="#library" onClick={(e) => goTo(e, '#library')}>Catalog</a>
            <a href="/status/">Status pages</a>
            <button onClick={() => onLaunchStudio()}>Open the studio</button>
          </nav>
          <p className="lp-footer-meta">FoleyCraft © 2026. Runs in your browser on the Web Audio API.</p>
          <div className="lp-wordmark" aria-hidden="true">foleycraft</div>
        </footer>
      </div>
    </div>
  );
};
