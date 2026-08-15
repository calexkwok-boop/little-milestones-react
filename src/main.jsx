import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// Vite dispatches this whenever a dynamically-imported chunk (React.lazy
// screens here) fails to load -- almost always because the tab's been open
// across a deploy, so it's asking for an old hashed filename that no longer
// exists on the server ("TypeError: Importing a module script failed").
// One full reload picks up the current build's filenames and fixes it.
// sessionStorage guards against a reload loop if reloading genuinely
// doesn't help (e.g. a real network outage) -- auto-reloads once per
// incident, then lets the error surface normally.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  if (sessionStorage.getItem('__staleChunkReload')) return;
  sessionStorage.setItem('__staleChunkReload', '1');
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
);

// Made it this far without a preload error -- clear the guard so a *later*
// deploy (while this same tab stays open) can still trigger its own
// one-time reload too, instead of this incident's flag blocking it forever.
sessionStorage.removeItem('__staleChunkReload');
