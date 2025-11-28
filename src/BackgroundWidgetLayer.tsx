/**
 * BACKGROUND WIDGET LAYER
 * Renders iframe-based widgets behind desktop icons.
 */

import { useState, useEffect, useRef } from 'react';
import GlyphIframe from './components/GlyphIframe';

interface BackgroundWidget {
  id: string;
  glyphId: string;
  code: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function BackgroundWidgetContainer({ widget }: { widget: BackgroundWidget }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleEnter = () => window.loom?.backgroundMouseEnter?.();
    const handleLeave = () => window.loom?.backgroundMouseLeave?.();

    el.addEventListener('pointerenter', handleEnter);
    el.addEventListener('pointerleave', handleLeave);
    return () => {
      el.removeEventListener('pointerenter', handleEnter);
      el.removeEventListener('pointerleave', handleLeave);
    };
  }, [widget.id]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        left: widget.x,
        top: widget.y,
        width: widget.width,
        height: widget.height,
        borderRadius: 12,
        overflow: 'hidden',
        pointerEvents: 'auto',
        background: 'transparent',
      }}
    >
      <GlyphIframe
        code={widget.code}
        glyphId={widget.glyphId}
        glyphType="widget"
        title={widget.glyphId}
      />
    </div>
  );
}

export default function BackgroundWidgetLayer() {
  const [widgets, setWidgets] = useState<BackgroundWidget[]>([]);
  const listenerRegistered = useRef(false);

  useEffect(() => {
    if (!window.loom) {
      console.log('[BackgroundWidgetLayer] ⚠️ window.loom not available');
      return;
    }

    if (listenerRegistered.current) return;
    listenerRegistered.current = true;

    console.log('[BackgroundWidgetLayer] 🎧 Registering widget-layer-update listener');

    window.loom.onWidgetLayerUpdate?.(({ widgetId, widgetData }) => {
      if (!widgetData) {
        setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
        return;
      }

      if (widgetData.layer !== 'background') {
        setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
        return;
      }

      const updatedWidget: BackgroundWidget = {
        id: widgetId,
        glyphId: widgetData.glyphId,
        code: widgetData.code,
        x: widgetData.x,
        y: widgetData.y,
        width: widgetData.width,
        height: widgetData.height,
      };

      setWidgets((prev) => {
        const existingIndex = prev.findIndex((w) => w.id === widgetId);
        if (existingIndex >= 0) {
          const clone = [...prev];
          clone[existingIndex] = updatedWidget;
          return clone;
        }
        return [...prev, updatedWidget];
      });
    });
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      {widgets.map((widget) => (
        <BackgroundWidgetContainer key={widget.id} widget={widget} />
      ))}
    </div>
  );
}

