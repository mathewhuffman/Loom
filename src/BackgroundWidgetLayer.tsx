/**
 * BACKGROUND WIDGET LAYER
 * Renders iframe-based widgets behind desktop icons.
 * 
 * IMPORTANT: This layer must NOT cause iframe re-renders when only position/size changes.
 * The GlyphIframe should only re-render when the actual glyph code changes.
 */

import { useState, useEffect, useRef, memo, useMemo, useCallback } from 'react';
import GlyphIframe, { type GlyphIframeHandle } from './components/GlyphIframe';

interface BackgroundWidget {
  id: string;
  glyphId: string;
  code: string;
  x: number;
  y: number;
  width: number;
  height: number;
  inputs?: Record<string, unknown>;
}

// Memoized iframe wrapper - only re-renders when code, glyphId, or inputs actually changes
const MemoizedGlyphIframe = memo(function MemoizedGlyphIframe({
  code,
  glyphId,
  inputs,
  widgetId,
  registerDisposer,
}: {
  code: string;
  glyphId: string;
  inputs?: Record<string, unknown>;
  widgetId: string;
  registerDisposer?: (id: string, disposer: () => void) => (() => void) | void;
}) {
  const glyphRef = useRef<GlyphIframeHandle>(null);

  useEffect(() => {
    if (!registerDisposer) {
      return;
    }
    const unregister = registerDisposer(widgetId, () => {
      glyphRef.current?.dispose('widget-dispose');
    });
    return () => {
      glyphRef.current?.dispose('widget-unmount');
      unregister && unregister();
    };
  }, [registerDisposer, widgetId]);

  return (
    <GlyphIframe
      ref={glyphRef}
      code={code}
      glyphId={glyphId}
      glyphType="widget"
      title={glyphId}
      inputs={inputs}
    />
  );
}, (prev, next) => {
  // Only re-render if code content, glyphId, or inputs actually changed
  return prev.code === next.code && prev.glyphId === next.glyphId && prev.inputs === next.inputs;
});

const BackgroundWidgetContainer = memo(function BackgroundWidgetContainer({
  widget,
  registerDisposer,
}: {
  widget: BackgroundWidget;
  registerDisposer?: (id: string, disposer: () => void) => (() => void) | void;
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
    // Transparent background - let the glyph content show through
    background: 'transparent',
  }), [widget.x, widget.y, widget.width, widget.height]);

  return (
    <div ref={containerRef} style={containerStyle}>
      <MemoizedGlyphIframe
        code={widget.code}
        glyphId={widget.glyphId}
        inputs={widget.inputs}
        widgetId={widget.id}
        registerDisposer={registerDisposer}
      />
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
    prev.widget.glyphId === next.widget.glyphId &&
    prev.widget.inputs === next.widget.inputs
  );
});

export default function BackgroundWidgetLayer() {
  const [widgets, setWidgets] = useState<BackgroundWidget[]>([]);
  const widgetTokenMap = useRef(new Map<string, object>());
  const widgetDisposerMap = useRef(new WeakMap<object, () => void>());

  const registerWidgetDisposer = useCallback((widgetId: string, disposer: () => void) => {
    let token = widgetTokenMap.current.get(widgetId);
    if (!token) {
      token = {};
      widgetTokenMap.current.set(widgetId, token);
    }
    widgetDisposerMap.current.set(token, disposer);
    return () => {
      widgetDisposerMap.current.delete(token!);
    };
  }, []);

  const invokeWidgetDisposer = useCallback((widgetId: string) => {
    const token = widgetTokenMap.current.get(widgetId);
    if (!token) return;
    const disposer = widgetDisposerMap.current.get(token);
    if (disposer) {
      disposer();
      widgetDisposerMap.current.delete(token);
    }
    widgetTokenMap.current.delete(widgetId);
  }, []);

  useEffect(() => {
    if (!window.loom) {
      console.log('[BackgroundWidgetLayer] ⚠️ window.loom not available');
      return;
    }

    console.log('[BackgroundWidgetLayer] 🎧 Registering widget listeners');
    const unsubs: Array<(() => void) | undefined> = [];

    const widgetLayerUnsub = window.loom.onWidgetLayerUpdate?.(({ widgetId, widgetData }) => {
      if (!widgetData || widgetData.layer !== 'background') {
        setWidgets((prev) => {
          if (!prev.some((w) => w.id === widgetId)) {
            return prev;
          }
          invokeWidgetDisposer(widgetId);
          return prev.filter((w) => w.id !== widgetId);
        });
        return;
      }

      setWidgets((prev) => {
        const existingIndex = prev.findIndex((w) => w.id === widgetId);

        if (existingIndex >= 0) {
          const existing = prev[existingIndex];
          const positionChanged =
            existing.x !== widgetData.x ||
            existing.y !== widgetData.y ||
            existing.width !== widgetData.width ||
            existing.height !== widgetData.height;
          const codeChanged = existing.code !== widgetData.code;
          const glyphIdChanged = existing.glyphId !== widgetData.glyphId;
          const inputsChanged = existing.inputs !== widgetData.inputs;

          if (!positionChanged && !codeChanged && !glyphIdChanged && !inputsChanged) {
            return prev;
          }

          const clone = [...prev];
          clone[existingIndex] = {
            id: widgetId,
            glyphId: glyphIdChanged ? widgetData.glyphId : existing.glyphId,
            code: codeChanged ? widgetData.code : existing.code,
            x: widgetData.x,
            y: widgetData.y,
            width: widgetData.width,
            height: widgetData.height,
            inputs: inputsChanged ? widgetData.inputs : existing.inputs,
          };
          return clone;
        }

        const newWidget: BackgroundWidget = {
          id: widgetId,
          glyphId: widgetData.glyphId,
          code: widgetData.code,
          x: widgetData.x,
          y: widgetData.y,
          width: widgetData.width,
          height: widgetData.height,
          inputs: widgetData.inputs,
        };
        return [...prev, newWidget];
      });
    });

    const glyphUpdatedUnsub = window.loom.onGlyphUpdated?.((data: {
      glyphId: string;
      code: string;
      inputs?: Record<string, unknown>;
      changedFile: string;
    }) => {
      setWidgets((prev) => {
        const hasMatchingWidget = prev.some((w) => w.glyphId === data.glyphId);
        if (!hasMatchingWidget) return prev;

        return prev.map((widget) => {
          if (widget.glyphId === data.glyphId) {
            return {
              ...widget,
              code: data.code,
              inputs: data.inputs ?? widget.inputs,
            };
          }
          return widget;
        });
      });
    });

    unsubs.push(widgetLayerUnsub, glyphUpdatedUnsub);

    return () => {
      unsubs.forEach((unsub) => {
        try {
          unsub && unsub();
        } catch (err) {
          console.error('[BackgroundWidgetLayer] ⚠️ Failed to remove listener', err);
        }
      });
    };
  }, [invokeWidgetDisposer]);

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
        <BackgroundWidgetContainer
          key={widget.id}
          widget={widget}
          registerDisposer={registerWidgetDisposer}
        />
      ))}
    </div>
  );
}

