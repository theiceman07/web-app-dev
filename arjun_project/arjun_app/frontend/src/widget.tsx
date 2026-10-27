import { createRoot } from 'react-dom/client';
import { Assistant } from './components/Assistant';

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
