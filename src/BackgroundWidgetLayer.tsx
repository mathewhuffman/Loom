/**
 * BACKGROUND WIDGET LAYER
 * Renders iframe-based widgets behind desktop icons.
 * 
 * IMPORTANT: This layer must NOT cause iframe re-renders when only position/size changes.
 * The GlyphIframe should only re-render when the actual glyph code changes.
 */

import { useState, useEffect, useRef, memo, useMemo } from 'react';
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

// Memoized iframe wrapper - only re-renders when code or glyphId actually changes
const MemoizedGlyphIframe = memo(function MemoizedGlyphIframe({ 
  code, 
  glyphId 
}: { 
  code: string; 
  glyphId: string;
}) {
  return (
    <GlyphIframe
      code={code}
      glyphId={glyphId}
      glyphType="widget"
      title={glyphId}
    />
  );
}, (prev, next) => {
  // Only re-render if code content or glyphId actually changed
  return prev.code === next.code && prev.glyphId === next.glyphId;
});

const BackgroundWidgetContainer = memo(function BackgroundWidgetContainer({ 
  widget 
}: { 
  widget: BackgroundWidget;
}) {
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

  // Memoize position/size style to prevent unnecessary object creation
  const containerStyle = useMemo(() => ({
    position: 'absolute' as const,
    left: widget.x,
    top: widget.y,
    width: widget.width,
    height: widget.height,
    borderRadius: 12,
    overflow: 'hidden' as const,
    pointerEvents: 'auto' as const,
    background: 'transparent',
  }), [widget.x, widget.y, widget.width, widget.height]);

  return (
    <div ref={containerRef} style={containerStyle}>
      <MemoizedGlyphIframe code={widget.code} glyphId={widget.glyphId} />
    </div>
  );
}, (prev, next) => {
  // Custom comparison - re-render container for position changes, but iframe is memoized separately
  return (
    prev.widget.id === next.widget.id &&
    prev.widget.x === next.widget.x &&
    prev.widget.y === next.widget.y &&
    prev.widget.width === next.widget.width &&
    prev.widget.height === next.widget.height &&
    prev.widget.code === next.widget.code &&
    prev.widget.glyphId === next.widget.glyphId
  );
});

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

      setWidgets((prev) => {
        const existingIndex = prev.findIndex((w) => w.id === widgetId);
        
        if (existingIndex >= 0) {
          const existing = prev[existingIndex];
          
          // Check if anything actually changed to avoid unnecessary re-renders
          const positionChanged = 
            existing.x !== widgetData.x ||
            existing.y !== widgetData.y ||
            existing.width !== widgetData.width ||
            existing.height !== widgetData.height;
          const codeChanged = existing.code !== widgetData.code;
          const glyphIdChanged = existing.glyphId !== widgetData.glyphId;
          
          // If nothing changed, return the same array reference
          if (!positionChanged && !codeChanged && !glyphIdChanged) {
            return prev;
          }
          
          // Only update what actually changed, preserving code reference if unchanged
          const clone = [...prev];
          clone[existingIndex] = {
            id: widgetId,
            glyphId: glyphIdChanged ? widgetData.glyphId : existing.glyphId,
            code: codeChanged ? widgetData.code : existing.code, // Preserve code reference if unchanged
            x: widgetData.x,
            y: widgetData.y,
            width: widgetData.width,
            height: widgetData.height,
          };
          return clone;
        }
        
        // New widget
        const newWidget: BackgroundWidget = {
          id: widgetId,
          glyphId: widgetData.glyphId,
          code: widgetData.code,
          x: widgetData.x,
          y: widgetData.y,
          width: widgetData.width,
          height: widgetData.height,
        };
        return [...prev, newWidget];
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

