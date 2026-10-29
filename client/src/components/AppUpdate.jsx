// Never replace an offline shell silently while a food form is being edited.
import { useEffect, useState } from 'react';
export default function AppUpdate() {
  const [waiting, setWaiting] = useState(null);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let alive = true;
    const cleanups = [];
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        for (const registration of registrations) {
          const inspect = () => {
            if (alive && registration.waiting) setWaiting(registration.waiting);
          };
          inspect();
          const installing = () => {
            const worker = registration.installing;
            if (worker) {
              worker.addEventListener('statechange', inspect);
              cleanups.push(() =>
                worker.removeEventListener('statechange', inspect),
              );
            }
          };
          registration.addEventListener('updatefound', installing);
          cleanups.push(() =>
            registration.removeEventListener('updatefound', installing),
          );
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
      cleanups.forEach((fn) => fn());
    };
  }, []);
  if (!waiting) return null;
  return (
    <aside
      role="status"
      className="border-b border-forest bg-cream p-4 text-forest"
    >
      <p>A new version is ready. Finish or save any form before updating.</p>
      <button
        className="button mt-2"
        onClick={() => {
          navigator.serviceWorker.addEventListener(
            'controllerchange',
            () => window.location.reload(),
            { once: true },
          );
          // Workbox prompt workers do not claim an existing tab automatically.
          // Reload when activation finishes, even without controllerchange.
          waiting.addEventListener('statechange', () => {
            if (waiting.state === 'activated') window.location.reload();
          });
          waiting.postMessage({ type: 'SKIP_WAITING' });
        }}
      >
        Update app
      </button>
    </aside>
  );
}
