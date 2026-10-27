import React, { useEffect, useRef, useState } from 'react';
import Lenis from 'lenis';
import { animate, motion, useInView, useMotionValue, useReducedMotion, useSpring } from 'motion/react';

/**
 * Interaction primitives. The patterns follow what reactbits.dev ships
 * (SplitText, CountUp, Magnet, ScrollVelocity) and Lenis for smooth scroll,
 * written for this project's stack (React + motion, no GSAP).
 */

export const PALETTE = {
  pink: '#FF3254',
  cyan: '#19F3FF',
  purple: '#6B3DF5',
  yellow: '#FFC93C',
  orange: '#FF8A3D',
  lime: '#A5F25A',
} as const;
export const PALETTE_LIST = [PALETTE.pink, PALETTE.cyan, PALETTE.purple, PALETTE.yellow, PALETTE.orange, PALETTE.lime];

const EASE = [0.16, 1, 0.3, 1] as const;

/* ------------------------------------------------------------------ */
/* Smooth scroll                                                       */
/* ------------------------------------------------------------------ */

export const useLenis = (
  wrapper: React.RefObject<HTMLElement | null>,
  content: React.RefObject<HTMLElement | null>,
  onScroll: (progress: number, velocity: number) => void
) => {
  const lenisRef = useRef<Lenis | null>(null);
  const cb = useRef(onScroll);
  cb.current = onScroll;

  useEffect(() => {
    const w = wrapper.current;
    const c = content.current;
    if (!w || !c) return;

    const report = () => {
      const max = w.scrollHeight - w.clientHeight;
      cb.current(max > 0 ? w.scrollTop / max : 0, 0);
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      w.addEventListener('scroll', report, { passive: true });
      report();
      return () => w.removeEventListener('scroll', report);
    }

    const lenis = new Lenis({ wrapper: w, content: c, lerp: 0.085, smoothWheel: true, autoRaf: true });
    lenisRef.current = lenis;
    lenis.on('scroll', (l: Lenis) => cb.current(l.limit > 0 ? l.scroll / l.limit : 0, l.velocity));
    report();
    return () => {
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [wrapper, content]);

  const scrollTo = (target: string | number | HTMLElement, offset = -72) => {
    const l = lenisRef.current;
    if (l) {
      l.scrollTo(target as never, { offset, duration: 1.4, easing: (t: number) => 1 - Math.pow(1 - t, 4) });
    } else if (typeof target === 'number') {
      wrapper.current?.scrollTo({ top: target });
    } else {
      const el = typeof target === 'string' ? (content.current?.querySelector(target) as HTMLElement | null) : target;
      if (el && wrapper.current) wrapper.current.scrollTo({ top: el.offsetTop + offset });
    }
  };

  return { lenisRef, scrollTo };
};

/* ------------------------------------------------------------------ */
/* Reveal on scroll                                                    */
/* ------------------------------------------------------------------ */

export const Reveal: React.FC<{
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: 'div' | 'li' | 'article' | 'section' | 'p';
}> = ({ children, delay = 0, y = 36, className, as = 'div' }) => {
  const reduce = useReducedMotion();
  const Comp = motion[as] as typeof motion.div;
  if (reduce) return <Comp className={className}>{children}</Comp>;
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.9, delay, ease: EASE }}
    >
      {children}
    </Comp>
  );
};

/** Words rise out of a mask, staggered. Heading text stays readable to screen readers. */
export const SplitReveal: React.FC<{
  text: string;
  as?: React.ElementType;
  className?: string;
  delay?: number;
  stagger?: number;
  id?: string;
}> = ({ text, as: Tag = 'span', className, delay = 0, stagger = 0.07, id }) => {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  // Observe the wrapper, not the words: the words sit inside an overflow mask,
  // so an observer on them would report them as never visible.
  const inView = useInView(ref, { once: true, amount: 0.2 });
  const words = text.split(' ');
  return (
    <Tag ref={ref} className={className} aria-label={text} id={id}>
      {words.map((w, i) => (
        <span key={i} aria-hidden="true" className="fx-word">
          <motion.span
            className="fx-word-inner"
            initial={reduce ? false : { y: '115%' }}
            animate={inView || reduce ? { y: 0 } : { y: '115%' }}
            transition={{ duration: 1, delay: delay + i * stagger, ease: EASE }}
          >
            {w}
          </motion.span>
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </Tag>
  );
};

/* ------------------------------------------------------------------ */
/* Count up                                                            */
/* ------------------------------------------------------------------ */

export const CountUp: React.FC<{ to: number; duration?: number; decimals?: number; className?: string }> = ({
  to,
  duration = 1.8,
  decimals = 0,
  className,
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setV(to);
      return;
    }
    const c = animate(0, to, { duration, ease: EASE, onUpdate: setV });
    return () => c.stop();
  }, [inView, to, duration, reduce]);
  return (
    <span ref={ref} className={className}>
      {v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
};

/* ------------------------------------------------------------------ */
/* Marquee whose speed follows scroll velocity                          */
/* ------------------------------------------------------------------ */

export const Marquee: React.FC<{
  items: string[];
  speed?: number;
  direction?: 1 | -1;
  velocity?: React.RefObject<number>;
  className?: string;
}> = ({ items, speed = 70, direction = 1, velocity, className }) => {
  const track = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = track.current;
    if (!el || reduce) return;
    let x = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(now - last, 64) / 1000;
      last = now;
      const setW = el.scrollWidth / 4;
      const boost = Math.min(Math.abs(velocity?.current ?? 0) * 18, 900);
      x += (speed + boost) * dt * direction;
      if (setW > 0) x = ((x % setW) + setW) % setW;
      el.style.transform = `translate3d(${-x}px,0,0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speed, direction, velocity, reduce]);

  const set = (k: number) =>
    items.map((t, i) => (
      <span key={`${k}-${i}`} className="fx-marquee-item" aria-hidden={k > 0 ? 'true' : undefined}>
        {t}
        <i className="fx-marquee-dot" aria-hidden="true" />
      </span>
    ));

  return (
    <div className={`fx-marquee ${className || ''}`}>
      <div className="fx-marquee-track" ref={track}>
        {[0, 1, 2, 3].map((k) => (
          <React.Fragment key={k}>{set(k)}</React.Fragment>
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Magnet: the element leans toward the pointer                        */
/* ------------------------------------------------------------------ */

export const Magnet: React.FC<{ children: React.ReactNode; strength?: number; className?: string }> = ({
  children,
  strength = 0.28,
  className,
}) => {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 16, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 16, mass: 0.4 });
  const ref = useRef<HTMLSpanElement>(null);

  const move = (e: React.PointerEvent) => {
    if (reduce || e.pointerType === 'touch' || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const leave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.span
      ref={ref}
      className={className}
      style={{ x: sx, y: sy, display: 'inline-flex' }}
      onPointerMove={move}
      onPointerLeave={leave}
    >
      {children}
    </motion.span>
  );
};

/* ------------------------------------------------------------------ */
/* Flat geometric shapes (the Muse-style glyph vocabulary)             */
/* ------------------------------------------------------------------ */

export const SHAPE_KINDS = 6;

/** A shape centred on (0,0) that fits a circle of radius r. */
export const ShapeGlyph: React.FC<{ kind: number; r: number; color: string }> = ({ kind, r, color }) => {
  switch (kind % SHAPE_KINDS) {
    case 0:
      return <circle r={r} fill={color} />;
    case 1:
      return <rect x={-r * 0.78} y={-r * 0.78} width={r * 1.56} height={r * 1.56} fill={color} transform="rotate(45)" />;
    case 2:
      return <path d={`M${-r} ${r * 0.5} A${r} ${r} 0 0 1 ${r} ${r * 0.5} Z`} fill={color} />;
    case 3:
      return <path d={`M0 ${-r} L${r * 0.95} ${r * 0.8} L${-r * 0.95} ${r * 0.8} Z`} fill={color} />;
    case 4:
      return (
        <g fill={color}>
          <rect x={-r} y={-r * 0.3} width={r * 2} height={r * 0.6} />
          <rect x={-r * 0.3} y={-r} width={r * 0.6} height={r * 2} />
        </g>
      );
    default:
      return <path d={`M${-r} ${r} L${-r} ${-r} A${r * 2} ${r * 2} 0 0 1 ${r} ${r} Z`} fill={color} />;
  }
};

type FieldShape = { kind: number; x: number; y: number; s: number; color: string; depth: number; rot: number };

const FIELD: FieldShape[] = [
  { kind: 0, x: 60, y: 150, s: 70, color: PALETTE.pink, depth: 14, rot: 0 },
  { kind: 2, x: 180, y: 90, s: 62, color: PALETTE.cyan, depth: -18, rot: 20 },
  { kind: 4, x: 300, y: 170, s: 56, color: PALETTE.yellow, depth: 22, rot: 0 },
  { kind: 5, x: 430, y: 100, s: 70, color: PALETTE.purple, depth: -12, rot: 0 },
  { kind: 3, x: 560, y: 160, s: 60, color: PALETTE.orange, depth: 18, rot: 0 },
  { kind: 1, x: 690, y: 90, s: 52, color: PALETTE.lime, depth: -22, rot: 0 },
  { kind: 0, x: 810, y: 165, s: 56, color: PALETTE.cyan, depth: 12, rot: 0 },
  { kind: 2, x: 930, y: 95, s: 68, color: PALETTE.pink, depth: -16, rot: -15 },
  { kind: 5, x: 1050, y: 160, s: 64, color: PALETTE.yellow, depth: 20, rot: 90 },
  { kind: 4, x: 1150, y: 90, s: 48, color: PALETTE.purple, depth: -10, rot: 0 },
];

/** A row of flat shapes that drift with the pointer and spin up on hover. */
export const ShapeField: React.FC<{ className?: string }> = ({ className }) => {
  const ref = useRef<SVGSVGElement>(null);
  const reduce = useReducedMotion();

  const onMove = (e: React.PointerEvent) => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty('--mx', String(((e.clientX - r.left) / r.width - 0.5) * 2));
    ref.current.style.setProperty('--my', String(((e.clientY - r.top) / r.height - 0.5) * 2));
  };

  return (
    <svg
      ref={ref}
      className={`fx-field ${className || ''}`}
      viewBox="0 0 1200 260"
      role="img"
      aria-label="Decorative field of coloured geometric shapes"
      onPointerMove={onMove}
    >
      {FIELD.map((s, i) => (
        <g key={i} transform={`translate(${s.x} ${s.y})`}>
          <g
            className="fx-shape"
            style={{ ['--d' as string]: `${s.depth}px`, ['--rot' as string]: `${s.rot}deg`, ['--i' as string]: i }}
          >
            <ShapeGlyph kind={s.kind} r={s.s / 2} color={s.color} />
          </g>
        </g>
      ))}
    </svg>
  );
};
