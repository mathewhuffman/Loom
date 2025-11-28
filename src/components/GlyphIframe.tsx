import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import { buildGlyphIframe } from '../ai/GlyphCompiler';

interface GlyphIframeProps {
  code: string;
  glyphId?: string;
  glyphType?: string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
  background?: string;
  allowPointerEvents?: boolean;
  inputs?: Record<string, unknown>; // Dynamic input values to inject
  onError?: (error: string | null) => void;
  onLoad?: () => void;
  allowExternalUrls?: boolean; // Allow loading external URLs (removes sandbox restrictions)
}

// Type for window.loom API
declare global {
  interface Window {
    loom?: {
      readLocalFile?: (path: string) => Promise<unknown>;
      listDirectory?: (path: string) => Promise<unknown>;
      getSystemPaths?: () => Promise<unknown>;
      readGlyphFile?: (glyphId: string, fileName: string) => Promise<unknown>;
      saveGlyphFile?: (glyphId: string, fileName: string, content: string) => Promise<unknown>;
    };
  }
}

export default function GlyphIframe({
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
}: GlyphIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  const iframeDoc = useMemo(
    () => buildGlyphIframe(code, { glyphId, glyphType, background, inputs }),
    [code, glyphId, glyphType, background, inputs]
  );
  
  // Handle loom API requests from iframe via postMessage
  const handleMessage = useCallback(async (event: MessageEvent) => {
    // Only handle messages from our iframe
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
      // Check if we have access to the real loom API
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
    
    // Send response back to iframe
    iframeRef.current?.contentWindow?.postMessage({
      type: 'loom-response',
      id,
      result,
    }, '*');
  }, []);
  
  // Listen for messages from iframe
  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);
  
  // Report errors to parent
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
    : "allow-scripts allow-pointer-lock allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-top-navigation allow-top-navigation-by-user-activation allow-presentation";

  return (
    <iframe
      ref={iframeRef}
      key={`${glyphId || 'glyph'}-${iframeDoc.mode}-${code.length}`}
      srcDoc={iframeDoc.srcDoc}
      title={title || glyphId || 'glyph'}
      className={className}
      style={{
        border: 'none',
        width: '100%',
        height: '100%',
        background: 'transparent',
        pointerEvents: allowPointerEvents ? 'auto' : 'none',
        ...style,
      }}
      sandbox={sandboxValue}
      allow="accelerometer; autoplay; camera; clipboard-read; clipboard-write; display-capture; encrypted-media; fullscreen; geolocation; gyroscope; microphone"
      allowFullScreen
      loading="lazy"
    />
  );
}

