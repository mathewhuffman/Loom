import React from 'react';
import ReactDOM from 'react-dom/client';
import LoomScene from './LoomScene';
import BackgroundWidgetLayer from './BackgroundWidgetLayer';
import OverlayUI from './OverlayUI';
import MemoryProfilerView from './components/views/MemoryProfilerView';
import './index.css';

const params = new URLSearchParams(window.location.search);
const layer = params.get('layer') || 'background';
const view = params.get('view');

console.log(`🎭 LOOM Layer: ${layer}${view ? `, View: ${view}` : ''}`);

if (layer === 'overlay') {
  document.documentElement.classList.add('overlay-layer');
}

const root = ReactDOM.createRoot(document.getElementById('root')!);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.loom?.removeAllListeners?.();
  });
}

// Handle special views (like memory profiler)
if (view === 'memory-profiler') {
  document.documentElement.classList.add('memory-profiler-layer');
  root.render(
    <React.StrictMode>
      <MemoryProfilerView />
    </React.StrictMode>
  );
} else if (layer === 'overlay') {
  root.render(
    <React.StrictMode>
      <OverlayUI />
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <div className="loom-background-shell">
        <LoomScene />
        <BackgroundWidgetLayer />
      </div>
    </React.StrictMode>
  );
}
