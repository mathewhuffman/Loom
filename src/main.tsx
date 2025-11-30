import React from 'react';
import ReactDOM from 'react-dom/client';
import LoomScene from './LoomScene';
import BackgroundWidgetLayer from './BackgroundWidgetLayer';
import OverlayUI from './OverlayUI';
import './index.css';

const params = new URLSearchParams(window.location.search);
const layer = params.get('layer') || 'background';

console.log(`🎭 LOOM Layer: ${layer}`);

if (layer === 'overlay') {
  document.documentElement.classList.add('overlay-layer');
}

const root = ReactDOM.createRoot(document.getElementById('root')!);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.loom?.removeAllListeners?.();
  });
}

if (layer === 'overlay') {
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
