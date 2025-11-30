import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { buildGlyphIframe } from '../ai/GlyphCompiler';

export interface GlyphIframeProps {
  code: string;
  glyphId?: string;
  glyphType?: string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
  background?: string;
  allowPointerEvents?: boolean;
  inputs?: Record<string, unknown>;
  onError?: (error: string | null) => void;
  onLoad?: () => void;
  allowExternalUrls?: boolean;
}

export interface GlyphIframeHandle {
  dispose: (reason?: string) => void;
  element: () => HTMLIFrameElement | null;
}

const hashString = (input: string) => {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
};

const GlyphIframe = forwardRef<GlyphIframeHandle, GlyphIframeProps>(function GlyphIframe(
  {
    code,
    glyphId,
    glyphType,
    title,
    className,
    style,
    background,
    allowPointerEvents = true,
    inputs,
    onError,
    onLoad,
    allowExternalUrls = false,
  },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeDoc = useMemo(
    () => buildGlyphIframe(code, { glyphId, glyphType, background, inputs }),
    [code, glyphId, glyphType, background, inputs],
  );
  const codeHash = useMemo(
    () => hashString(iframeDoc.srcDoc || code || ''),
    [iframeDoc.srcDoc, code],
  );

  const disposeFrame = useCallback(
    (frame: HTMLIFrameElement | null, reason: 'update' | 'unmount' | 'external' = 'update') => {
      if (!frame) return;
      try {
        frame.contentWindow?.postMessage({ type: 'glyph-dispose', reason }, '*');
      } catch {
        // Ignore cross-origin errors (cross-origin src)
      }
      try {
        frame.srcdoc = 'about:blank';
      } catch {
        // Ignore assignment errors (detached frame)
      }
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      dispose: (reason?: string) => disposeFrame(iframeRef.current, (reason as any) ?? 'external'),
      element: () => iframeRef.current,
    }),
    [disposeFrame],
  );

  // Use a mounted ref to detect React StrictMode double-mount
  // StrictMode unmounts/remounts synchronously, so we delay disposal
  const isMountedRef = useRef(true);
  
  useEffect(() => {
    isMountedRef.current = true;
    const frame = iframeRef.current;
    
    return () => {
      isMountedRef.current = false;
      
      // Delay disposal to avoid wiping content during StrictMode remount
      // StrictMode's remount happens synchronously, so a microtask delay is enough
      Promise.resolve().then(() => {
        // Only dispose if the component didn't immediately remount
        if (!isMountedRef.current && frame) {
          disposeFrame(frame, 'unmount');
        }
      });
    };
  }, [disposeFrame]);

  useEffect(() => {
    if (!import.meta.env?.DEV) return;
    const docLen = iframeDoc.srcDoc?.length ?? 0;
    console.log(
      `[GlyphIframe] render glyphId=${glyphId || 'unknown'} type=${glyphType || 'html'} len=${docLen}`,
    );
    return () => {
      console.log(`[GlyphIframe] dispose glyphId=${glyphId || 'unknown'} type=${glyphType || 'html'}`);
    };
  }, [glyphId, glyphType, iframeDoc.srcDoc]);

  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) {
        return;
      }
      const data = event.data;
      if (!data || data.type !== 'loom-request') {
        return;
      }

      const { id, method, args } = data;
      let result: unknown = { success: false, error: 'Method not available' };

      try {
        if (window.loom) {
          switch (method) {
            case 'readLocalFile':
              if (window.loom.readLocalFile) {
                result = await window.loom.readLocalFile(args[0]);
              }
              break;
            case 'listDirectory':
              if (window.loom.listDirectory) {
                result = await window.loom.listDirectory(args[0]);
              }
              break;
            case 'getSystemPaths':
              if (window.loom.getSystemPaths) {
                result = await window.loom.getSystemPaths();
              }
              break;
            case 'readGlyphFile':
              if (window.loom.readGlyphFile) {
                result = await window.loom.readGlyphFile(args[0], args[1]);
              }
              break;
            case 'saveGlyphFile':
              if (window.loom.saveGlyphFile) {
                result = await window.loom.saveGlyphFile(args[0], args[1], args[2]);
              }
              break;
            default:
              result = { success: false, error: `Unknown method: ${method}` };
          }
        } else {
          result = { success: false, error: 'Loom API not available in parent context' };
        }
      } catch (err) {
        result = { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }

      iframeRef.current?.contentWindow?.postMessage(
        {
          type: 'loom-response',
          id,
          result,
        },
        '*',
      );
    },
    [iframeRef],
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  useEffect(() => {
    if (iframeDoc.error) {
      onError?.(iframeDoc.error);
    } else if (iframeDoc.srcDoc) {
      onError?.(null);
      onLoad?.();
    }
  }, [iframeDoc.error, iframeDoc.srcDoc, onError, onLoad]);

  if (!iframeDoc.srcDoc || iframeDoc.error) {
    return (
      <div
        className={className}
        style={{
          ...style,
          width: '100%',
          height: '100%',
          borderRadius: 12,
          border: '1px dashed rgba(255, 0, 100, 0.4)',
          background: 'rgba(10, 0, 15, 0.8)',
          color: '#ff0066',
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: 16,
        }}
      >
        {iframeDoc.error ? `Glyph failed: ${iframeDoc.error}` : 'Glyph unavailable'}
      </div>
    );
  }

  const sandboxValue = allowExternalUrls
    ? undefined
    : 'allow-scripts allow-pointer-lock allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-top-navigation allow-top-navigation-by-user-activation allow-presentation';

  return (
    <iframe
      key={`${glyphId || 'glyph'}-${iframeDoc.mode}-${codeHash}`}
      ref={iframeRef}
      srcDoc={iframeDoc.srcDoc}
      title={title || glyphId || 'glyph'}
      className={className}
      style={{
        border: 'none',
        width: '100%',
        height: '100%',
        background: background || 'transparent',
        pointerEvents: allowPointerEvents ? 'auto' : 'none',
        ...style,
      }}
      sandbox={sandboxValue}
      allow="accelerometer; autoplay; camera; clipboard-read; clipboard-write; display-capture; encrypted-media; fullscreen; geolocation; gyroscope; microphone"
      allowFullScreen
      loading="lazy"
    />
  );
});

export default GlyphIframe;
