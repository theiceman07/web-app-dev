import Lenis from 'lenis';
import { createRoot } from 'react-dom/client';
import { Assistant } from './components/Assistant';

// Smooth scrolling, the same as on the home page. Skipped for people who prefer reduced motion.
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  new Lenis({ lerp: 0.085, smoothWheel: true, autoRaf: true });
}

/**
 * Standalone build of the chat assistant for the server-rendered pages
 * (FAQ, Support, Errors, Health, 404/500). The home page and studio use the
 * same component through the main app bundle.
 */
const host =
  document.getElementById('fc-widget') ??
  document.body.appendChild(Object.assign(document.createElement('div'), { id: 'fc-widget' }));

createRoot(host).render(
  <Assistant
    view="page"
    sceneName=""
    sceneSources={[]}
    onOpenPreset={() => {
      window.location.href = '/';
    }}
  />,
);
