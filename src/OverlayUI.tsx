/**
 * LOOM OVERLAY UI — SUMMONER v2
 * The interaction layer - sits above everything, captures UI input
 * This is a separate window from the Three.js background
 * 
 * ✨ TYPE ANYTHING → MANIFEST REALITY ✨
 * 🔮 Press Ctrl+Alt+L to open the Loom Panel
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import LoomPanel from './components/LoomPanel';
import GlyphIframe from './components/GlyphIframe';
import UpdaterView from './components/views/UpdaterView';
import type { CodeEditorState, LoomPanelState, OverlayUiState, PersistedWidgetState, WidgetLayer } from './types/ui-state';
import { loadUiState, queueUiStatePatch } from './utils/uiState';


// Widget glyph for desktop placement
type WidgetGlyph = PersistedWidgetState;

interface SummonState {
  phase: 'idle' | 'streaming' | 'compiling' | 'injecting' | 'complete' | 'error' | 'refining';
  provider?: string;
  error?: string;
  attempt?: number;
}

interface AIModel {
  id: string;
  name: string;
  provider: string;
  available: boolean;
  icon: string;
}

interface PendingRefinement {
  error: string;
  code: string;
  attempt: number;
  prompt: string;
}

// Constants for refinement loop
const SHOW_CANCEL_AFTER_ATTEMPTS = 2;

// ═══════════════════════════════════════════════════════════════════════════
// 🪟 WIDGET CONTAINER — Draggable & Resizable desktop widget
// ═══════════════════════════════════════════════════════════════════════════

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null;

interface WidgetContainerProps {
  widget: WidgetGlyph;
  onUpdate: (id: string, updates: Partial<WidgetGlyph>) => void;
  onRemove: (id: string) => void;
  onLayerToggle: (id: string) => void; // Toggle between foreground/background
  onFocus: (id: string) => void;
}

function WidgetContainer({ widget, onUpdate, onRemove, onLayerToggle, onFocus }: WidgetContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [editMode, setEditMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [resizeDir, setResizeDir] = useState<ResizeDirection>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, w: 0, h: 0, wx: 0, wy: 0 });
  const [showEditButton, setShowEditButton] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  
  // Check if widget is in foreground (interactive, above icons)
  const isInForeground = widget.layer === 'foreground';

  // Show edit button immediately on hover (no delay)
  useEffect(() => {
    if (isHovering && !editMode) {
      setShowEditButton(true);
    } else if (!isHovering && !editMode) {
      setShowEditButton(false);
    }
  }, [isHovering, editMode]);

  // Handle F4 key to toggle edit mode when hovering
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F4' && isHovering) {
        e.preventDefault();
        setEditMode(prev => !prev);
        setShowEditButton(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHovering]);

  // Notify overlay that mouse is over interactive widget (disables click-through)
  const handleWidgetMouseEnter = useCallback(() => {
    setIsHovering(true);
    window.loom?.mouseEnterUI();
  }, []);

  const handleWidgetMouseLeave = useCallback(() => {
    setIsHovering(false);
    window.loom?.mouseLeaveUI();
  }, []);

  // Drag handler - only active in edit mode
  const handleDragStart = (e: React.MouseEvent) => {
    if (!editMode) return;
    if ((e.target as HTMLElement).closest('.widget-resize-edge')) return;
    if ((e.target as HTMLElement).closest('.widget-controls')) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - widget.x, y: e.clientY - widget.y });
  };

  // Resize handler - only active in edit mode
  const handleResizeStart = (e: React.MouseEvent, dir: ResizeDirection) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    setResizeDir(dir);
    setResizeStart({ 
      x: e.clientX, 
      y: e.clientY, 
      w: widget.width, 
      h: widget.height,
      wx: widget.x,
      wy: widget.y,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        onUpdate(widget.id, {
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      }
      if (resizeDir) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;
        const updates: Partial<WidgetGlyph> = {};
        const minSize = 150;

        // Handle horizontal resize
        if (resizeDir.includes('e')) {
          updates.width = Math.max(minSize, resizeStart.w + deltaX);
        }
        if (resizeDir.includes('w')) {
          const newWidth = Math.max(minSize, resizeStart.w - deltaX);
          const widthDiff = resizeStart.w - newWidth;
          updates.width = newWidth;
          updates.x = resizeStart.wx + widthDiff;
        }

        // Handle vertical resize
        if (resizeDir.includes('s')) {
          updates.height = Math.max(minSize, resizeStart.h + deltaY);
        }
        if (resizeDir.includes('n')) {
          const newHeight = Math.max(minSize, resizeStart.h - deltaY);
          const heightDiff = resizeStart.h - newHeight;
          updates.height = newHeight;
          updates.y = resizeStart.wy + heightDiff;
        }

        onUpdate(widget.id, updates);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setResizeDir(null);
    };

    if (isDragging || resizeDir) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, resizeDir, dragStart, resizeStart, widget.id, onUpdate]);

  // Resize edge style helper - subtle magenta glow in edit mode
  const edgeStyle = (cursor: string): React.CSSProperties => ({
    position: 'absolute',
    background: editMode ? 'rgba(255, 0, 100, 0.15)' : 'transparent',
    opacity: editMode ? 1 : 0,
    transition: 'opacity 0.2s, background 0.2s',
    cursor: editMode ? cursor : 'default',
    pointerEvents: editMode ? 'auto' : 'none',
  });

  return (
    <div
      ref={containerRef}
      onMouseDownCapture={() => onFocus(widget.id)}
      onMouseEnter={handleWidgetMouseEnter}
      onMouseLeave={handleWidgetMouseLeave}
      className="ui-interactive"
      style={{
        position: 'absolute',
        left: widget.x,
        top: widget.y,
        width: widget.width,
        height: widget.height,
        // Transparent background - let glyph content show through
        background: 'transparent',
        borderRadius: '12px',
        overflow: 'visible',
        cursor: editMode ? (isDragging ? 'grabbing' : 'grab') : 'default',
        zIndex: widget.zIndex ?? 1000,
      }}
    >
      {/* Main content container */}
      {isInForeground ? (
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '12px',
            overflow: 'hidden',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <GlyphIframe
            code={widget.code}
            glyphId={widget.glyphId}
            glyphType="widget"
            title={widget.prompt}
            allowPointerEvents={!editMode}
            allowExternalUrls={widget.code.includes('iframe') || widget.code.includes('src=')}
            inputs={widget.inputs}
          />
        </div>
      ) : (
        /* Background: Transparent container - actual content renders in LoomScene */
        /* This is just for drag handles and edit controls */
        <div style={{
          width: '100%',
          height: '100%',
          borderRadius: '12px',
          border: editMode ? '2px dashed rgba(180, 100, 255, 0.4)' : 'none',
          background: 'transparent',
          pointerEvents: 'auto',
          position: 'relative',
          zIndex: 1,
        }} />
      )}

      {editMode && (
        <div
          onMouseDown={handleDragStart}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: '12px',
            cursor: isDragging ? 'grabbing' : 'grab',
            pointerEvents: 'auto',
            zIndex: 10,
            background: 'transparent',
          }}
        />
      )}

      {/* Edit mode controls - layer toggle and close button */}
      {editMode && (
        <>
          {/* Layer toggle button - send to background/foreground */}
          <button
            className="widget-controls"
            onClick={(e) => {
              e.stopPropagation();
              onLayerToggle(widget.id);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: 8,
              right: 44, // Positioned left of close button
              width: 28,
              height: 28,
              background: isInForeground 
                ? 'linear-gradient(135deg, rgba(0, 200, 255, 0.15), rgba(0, 150, 200, 0.25))' 
                : 'linear-gradient(135deg, rgba(180, 100, 255, 0.15), rgba(150, 80, 200, 0.25))',
              border: isInForeground 
                ? '1px solid rgba(0, 200, 255, 0.5)' 
                : '1px solid rgba(180, 100, 255, 0.5)',
              borderRadius: '6px',
              color: isInForeground ? '#00d4ff' : '#c088ff',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
              pointerEvents: 'auto',
              boxShadow: isInForeground 
                ? '0 0 14px rgba(0, 200, 255, 0.35), inset 0 1px 0 rgba(255,255,255,0.1)' 
                : '0 0 14px rgba(180, 100, 255, 0.35), inset 0 1px 0 rgba(255,255,255,0.1)',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              backdropFilter: 'blur(8px)',
            }}
            title={isInForeground 
              ? '◈ Send to background layer (behind desktop)' 
              : '◇ Bring to overlay layer (interactive)'}
          >
            {/* Layer indicator icons - filled for foreground, hollow for background */}
            <span style={{ 
              fontFamily: 'system-ui', 
              fontWeight: 600,
              textShadow: isInForeground 
                ? '0 0 8px rgba(0, 200, 255, 0.6)' 
                : '0 0 8px rgba(180, 100, 255, 0.6)',
            }}>
              {isInForeground ? '◈' : '◇'}
            </span>
          </button>
          
          {/* Close button */}
          <button
            className="widget-controls"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(widget.id);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              width: 28,
              height: 28,
              background: 'linear-gradient(135deg, rgba(255, 50, 100, 0.15), rgba(200, 30, 80, 0.25))',
              border: '1px solid rgba(255, 50, 100, 0.5)',
              borderRadius: '6px',
              color: '#ff3366',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
              pointerEvents: 'auto',
              boxShadow: '0 0 14px rgba(255, 50, 100, 0.35), inset 0 1px 0 rgba(255,255,255,0.1)',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              backdropFilter: 'blur(8px)',
            }}
            title="Close widget"
          >
            ✕
          </button>
        </>
      )}

      {/* Magic wand toggle button - bottom left, shows after 3s hover or F1 */}
      {(showEditButton || editMode) && (
        <button
          className="widget-controls"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setEditMode(!editMode);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            width: 28,
            height: 28,
            background: editMode ? 'rgba(255, 0, 100, 0.3)' : 'rgba(20, 0, 30, 0.85)',
            border: editMode ? '1px solid rgba(255, 0, 100, 0.7)' : '1px solid rgba(180, 100, 255, 0.4)',
            borderRadius: '6px',
            color: editMode ? '#ff0066' : '#c088ff',
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            zIndex: 100,
            pointerEvents: 'auto',
            boxShadow: editMode 
              ? '0 0 16px rgba(255, 0, 100, 0.5)' 
              : '0 4px 12px rgba(0, 0, 0, 0.5), 0 0 8px rgba(180, 100, 255, 0.2)',
            opacity: editMode ? 1 : 0.9,
            transform: editMode ? 'scale(1.05)' : 'scale(1)',
          }}
          title={editMode ? 'Exit edit mode (F4)' : 'Edit mode - drag & resize (F4)'}
        >
          {editMode ? '✕' : '✎'}
        </button>
      )}

      {/* Resize edges - only active in edit mode */}
      {/* Top edge */}
      <div 
        className="widget-resize-edge"
        onMouseDown={(e) => handleResizeStart(e, 'n')}
        style={{ ...edgeStyle('ns-resize'), top: -4, left: 12, right: 12, height: 8 }}
      />
      {/* Bottom edge */}
      <div 
        className="widget-resize-edge"
        onMouseDown={(e) => handleResizeStart(e, 's')}
        style={{ ...edgeStyle('ns-resize'), bottom: -4, left: 12, right: 12, height: 8 }}
      />
      {/* Left edge */}
      <div 
        className="widget-resize-edge"
        onMouseDown={(e) => handleResizeStart(e, 'w')}
        style={{ ...edgeStyle('ew-resize'), left: -4, top: 12, bottom: 12, width: 8 }}
      />
      {/* Right edge */}
      <div 
        className="widget-resize-edge"
        onMouseDown={(e) => handleResizeStart(e, 'e')}
        style={{ ...edgeStyle('ew-resize'), right: -4, top: 12, bottom: 12, width: 8 }}
      />
      {/* Corners */}
      <div 
        className="widget-resize-edge"
        onMouseDown={(e) => handleResizeStart(e, 'nw')}
        style={{ ...edgeStyle('nwse-resize'), top: -4, left: -4, width: 16, height: 16, borderRadius: '6px 0 0 0' }}
      />
      <div 
        className="widget-resize-edge"
        onMouseDown={(e) => handleResizeStart(e, 'ne')}
        style={{ ...edgeStyle('nesw-resize'), top: -4, right: -4, width: 16, height: 16, borderRadius: '0 6px 0 0' }}
      />
      <div 
        className="widget-resize-edge"
        onMouseDown={(e) => handleResizeStart(e, 'sw')}
        style={{ ...edgeStyle('nesw-resize'), bottom: -4, left: -4, width: 16, height: 16, borderRadius: '0 0 0 6px' }}
      />
      <div 
        className="widget-resize-edge"
        onMouseDown={(e) => handleResizeStart(e, 'se')}
        style={{ ...edgeStyle('nwse-resize'), bottom: -4, right: -4, width: 16, height: 16, borderRadius: '0 0 6px 0' }}
      />
    </div>
  );
}

export default function OverlayUI() {
  const [prompt, setPrompt] = useState('');
  const [summonState, setSummonState] = useState<SummonState>({ phase: 'idle', attempt: 0 });
  const [streamingCode, setStreamingCode] = useState('');
  const [interactionEnabled, setInteractionEnabled] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [recentGlyphs, setRecentGlyphs] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('grok');
  const [availableModels, setAvailableModels] = useState<AIModel[]>([]);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showKeysMenu, setShowKeysMenu] = useState(false); // Key selector visibility
  const [availableKeys, setAvailableKeys] = useState<Array<{ id: string; name: string; category?: string }>>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]); // Selected key IDs to include in prompt
  const [lastError, setLastError] = useState<string | null>(null);
  const [canCancel, setCanCancel] = useState(false);
  const [showLoomPanel, setShowLoomPanel] = useState(false); // Loom Panel visibility
  const [widgets, setWidgets] = useState<WidgetGlyph[]>([]); // Desktop widgets
  const [loomTransition, setLoomTransition] = useState<'idle' | 'morphing' | 'complete'>('idle'); // Goopy transition state
  const [loomInitialGlyphId, setLoomInitialGlyphId] = useState<string | undefined>(undefined); // Glyph to open in editor
  const [loomStreamingCode, setLoomStreamingCode] = useState(''); // Code streaming to editor
  const [loomIsStreaming, setLoomIsStreaming] = useState(false); // Is code being streamed
  const widgetCountRef = useRef(0);
  const lastWidgetInjectRef = useRef({ glyphId: '', time: 0 }); // Deduplication tracker
  const widgetListenerRegistered = useRef(false); // Prevent duplicate listener registration
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const promptRef = useRef(''); // Ref to capture prompt for async callbacks
  const originalPromptRef = useRef(''); // PRESERVED prompt for entire summon session (survives errors/refinements)
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const keysMenuRef = useRef<HTMLDivElement>(null);
  const currentCodeRef = useRef(''); // Track current code for refinement
  const attemptRef = useRef(0); // Track current refinement attempt
  const selectedModelRef = useRef(selectedModel);
  const isStreamingRef = useRef(false);
  const pendingRefinementRef = useRef<PendingRefinement | null>(null);
  const pendingRefinementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awaitingCompileRef = useRef(false); // Track if we're waiting for background to compile
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Success timeout handle
  const widgetSyncFrameRef = useRef<Map<string, number>>(new Map()); // Throttle widget sync to animation frames
  const widgetSyncLatestRef = useRef<Map<string, WidgetGlyph>>(new Map()); // Track latest widget state per id for syncing
  const zStackCounterRef = useRef(2000);
  const [loomPanelZ, setLoomPanelZ] = useState(() => zStackCounterRef.current++);
  const summonBarRef = useRef<HTMLDivElement>(null); // Reference to summon bar for animation
  const editorOpenedForStreamRef = useRef(false); // Track if we've opened editor for current stream session
  const [storedPanelState, setStoredPanelState] = useState<LoomPanelState | undefined>(undefined);
  const [storedEditorState, setStoredEditorState] = useState<CodeEditorState | undefined>(undefined);
  const hasHydratedStateRef = useRef(false);
  
  // Auto-updater state
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);

  const persistOverlayState = useCallback((patch: Partial<OverlayUiState>) => {
    if (!hasHydratedStateRef.current) {
      return;
    }
    queueUiStatePatch({ overlay: patch });
  }, []);

  const allocateZIndex = useCallback(() => {
    const next = zStackCounterRef.current++;
    persistOverlayState({ zIndexCounter: zStackCounterRef.current });
    return next;
  }, [persistOverlayState]);

  const handlePanelStateChange = useCallback(
    (state: LoomPanelState) => {
      setStoredPanelState(state);
      persistOverlayState({ loomPanel: state });
    },
    [persistOverlayState]
  );

  const handleEditorStateChange = useCallback(
    (state: CodeEditorState) => {
      setStoredEditorState(state);
      persistOverlayState({ codeEditor: state });
    },
    [persistOverlayState]
  );
  const bringLoomPanelToFront = useCallback(() => {
    setLoomPanelZ(allocateZIndex());
  }, [allocateZIndex]);

  const bringWidgetToFront = useCallback(
    (id: string) => {
      const nextZ = allocateZIndex();
      setWidgets(prev => prev.map(w => (w.id === id ? { ...w, zIndex: nextZ } : w)));
    },
    [allocateZIndex]
  );

  useEffect(() => {
    setWidgets(prev => prev.map(w => (w.zIndex !== undefined ? w : { ...w, zIndex: allocateZIndex() })));
  }, [allocateZIndex]);

  useEffect(() => {
    if (showLoomPanel) {
      bringLoomPanelToFront();
    }
  }, [showLoomPanel, bringLoomPanelToFront]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const storedState = await loadUiState();
      if (!mounted) return;
      const overlayState = storedState?.overlay;
      if (overlayState) {
        if (typeof overlayState.prompt === 'string') {
          setPrompt(overlayState.prompt);
          promptRef.current = overlayState.prompt;
        }
        if (overlayState.selectedModel) {
          setSelectedModel(overlayState.selectedModel);
          selectedModelRef.current = overlayState.selectedModel;
        }
        if (Array.isArray(overlayState.recentGlyphs)) {
          setRecentGlyphs(overlayState.recentGlyphs);
        }
        if (typeof overlayState.showLoomPanel === 'boolean') {
          setShowLoomPanel(overlayState.showLoomPanel);
        }
        if (Array.isArray(overlayState.widgets) && overlayState.widgets.length > 0) {
          widgetCountRef.current = overlayState.widgets.length;
          const rehydrated: WidgetGlyph[] = overlayState.widgets.map(widget => ({
            ...widget,
            createdAt: widget.createdAt || Date.now(),
          }));
          setWidgets(rehydrated);
          rehydrated
            .filter(widget => widget.layer === 'background')
            .forEach(widget => {
              window.loom?.sendWidgetToLayer?.(widget.id, {
                id: widget.id,
                glyphId: widget.glyphId,
                x: widget.x,
                y: widget.y,
                width: widget.width,
                height: widget.height,
                prompt: widget.prompt,
                code: widget.code,
                layer: widget.layer,
                inputs: widget.inputs,
              });
            });
        }
        if (typeof overlayState.zIndexCounter === 'number') {
          zStackCounterRef.current = overlayState.zIndexCounter;
          setLoomPanelZ(allocateZIndex());
        }
        if (overlayState.loomPanel) {
          setStoredPanelState(overlayState.loomPanel);
        }
        if (overlayState.codeEditor) {
          setStoredEditorState(overlayState.codeEditor);
        }
      }
      hasHydratedStateRef.current = true;
    })();
    return () => {
      mounted = false;
    };
  }, [allocateZIndex]);

  useEffect(() => {
    persistOverlayState({ prompt });
  }, [prompt, persistOverlayState]);

  useEffect(() => {
    persistOverlayState({ selectedModel });
  }, [selectedModel, persistOverlayState]);

  useEffect(() => {
    persistOverlayState({ recentGlyphs });
  }, [recentGlyphs, persistOverlayState]);

  useEffect(() => {
    persistOverlayState({ showLoomPanel });
  }, [showLoomPanel, persistOverlayState]);

  useEffect(() => {
    persistOverlayState({ widgets });
  }, [widgets, persistOverlayState]);

  // Listen for auto-update state changes
  useEffect(() => {
    const unsubscribe = window.loom?.onUpdaterState?.((state: { available: boolean; downloaded: boolean }) => {
      // Auto-show dialog when update is available or downloaded
      if (state.available || state.downloaded) {
        setShowUpdateDialog(true);
      }
    });
    
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const clearPendingRefinementTimer = useCallback(() => {
    if (pendingRefinementTimerRef.current) {
      clearTimeout(pendingRefinementTimerRef.current);
      pendingRefinementTimerRef.current = null;
    }
  }, []);

  const scheduleQueuedRefinement = useCallback(() => {
    if (!pendingRefinementRef.current) return;
    if (isStreamingRef.current) {
      console.log('[Overlay] ⏳ Stream still in progress — waiting before auto-refinement...');
      return;
    }

    const { error, code, attempt, prompt } = pendingRefinementRef.current;
    if (!code || !prompt) {
      pendingRefinementRef.current = null;
      return;
    }

    clearPendingRefinementTimer();
    console.log(`[Overlay] 🔄 Scheduling auto-refinement (attempt ${attempt + 1})...`);

    pendingRefinementTimerRef.current = setTimeout(() => {
      pendingRefinementRef.current = null;
      attemptRef.current = attempt + 1;
      setCanCancel(attemptRef.current >= SHOW_CANCEL_AFTER_ATTEMPTS);
      setSummonState({ phase: 'refining', attempt: attemptRef.current, error });
      console.log(`[Overlay] 🔄 Auto-triggering refinement (attempt ${attemptRef.current})...`);
      isStreamingRef.current = true;
      window.loom?.summonRefine?.({
        prompt,
        code,
        error,
        attempt: attemptRef.current - 1,
        model: selectedModelRef.current
      });
    }, 1500);
  }, [clearPendingRefinementTimer, setCanCancel, setSummonState]);

  const queueAutoRefinement = useCallback((error: string) => {
    const codeSnapshot = currentCodeRef.current;
    const promptSnapshot = originalPromptRef.current || promptRef.current;

    if (!codeSnapshot || !promptSnapshot) {
      console.log('[Overlay] ❌ Cannot queue auto-refinement — missing prompt or code snapshot');
      setSummonState({ phase: 'idle', attempt: 0 });
      originalPromptRef.current = '';
      return;
    }

    pendingRefinementRef.current = {
      error,
      code: codeSnapshot,
      attempt: attemptRef.current,
      prompt: promptSnapshot,
    };

    setLastError(error);
    setSummonState({ phase: 'error', error, attempt: attemptRef.current });
    setCanCancel(attemptRef.current >= SHOW_CANCEL_AFTER_ATTEMPTS);

    if (isStreamingRef.current) {
      console.log('[Overlay] ⏳ LLM still streaming — delaying auto-refinement until stream completes...');
    }

    scheduleQueuedRefinement();
  }, [scheduleQueuedRefinement, setCanCancel, setSummonState, setLastError]);
  
  // Keep promptRef in sync with prompt state (but not originalPromptRef!)
  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  // Load available AI models on mount
  useEffect(() => {
    if (window.loom?.getAvailableModels) {
      window.loom.getAvailableModels().then((models) => {
        setAvailableModels(models);
        // Select first available model by default
        const firstAvailable = models.find(m => m.available);
        if (firstAvailable) {
          setSelectedModel(firstAvailable.id);
        }
      }).catch(console.error);
    }
  }, []);

  // Close model menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false);
      }
      if (keysMenuRef.current && !keysMenuRef.current.contains(e.target as Node)) {
        setShowKeysMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load available keys on mount and when keys menu opens
  useEffect(() => {
    const loadKeys = async () => {
      if (window.loom?.getStoredKeys) {
        try {
          const keys = await window.loom.getStoredKeys();
          setAvailableKeys(keys.map((k: any) => ({ id: k.id, name: k.name, category: k.category })));
        } catch (err) {
          console.error('[Overlay] Failed to load keys:', err);
        }
      }
    };
    loadKeys();
    // Refresh keys whenever keys menu opens
    if (showKeysMenu) {
      loadKeys();
    }
  }, [showKeysMenu]);

  useEffect(() => {
    return () => {
      clearPendingRefinementTimer();
      pendingRefinementRef.current = null;
    };
  }, [clearPendingRefinementTimer]);

  // Cancel the current summon
  const handleCancel = useCallback(() => {
    console.log('[Overlay] ❌ User cancelled summon');
    setSummonState({ phase: 'idle', attempt: 0 });
    setStreamingCode('');
    setLastError(null);
    setCanCancel(false);
    attemptRef.current = 0;
    currentCodeRef.current = '';
    originalPromptRef.current = ''; // Clear preserved prompt on cancel
    clearPendingRefinementTimer();
    pendingRefinementRef.current = null;
    isStreamingRef.current = false;
  }, [clearPendingRefinementTimer]);

  // Setup IPC listeners for SUMMONER v1
  useEffect(() => {
    if (!window.loom) {
      console.warn('Loom IPC not available - running in browser mode?');
      return;
    }

    console.log('[Overlay] 🔁 Rebinding IPC listeners');
    const unsubscribes: Array<() => void> = [];
    const addUnsub = (fn?: (() => void) | void) => {
      if (typeof fn === 'function') {
        unsubscribes.push(fn);
      }
    };

    // Streaming chunks from main process - stream directly to editor
    addUnsub(window.loom.onSummonChunk((data: { fullCode: string; attempt?: number; chunk?: string }) => {
      console.log('[Overlay] 📡 summon-chunk event', {
        chunkLength: data.chunk?.length || 0,
        fullLength: data.fullCode?.length || 0,
        attempt: data.attempt,
      });
      isStreamingRef.current = true;
      currentCodeRef.current = data.fullCode;
      
      // Stream code directly to the editor
      setLoomStreamingCode(data.fullCode);
      setLoomIsStreaming(true);
      
      setSummonState(s => ({ 
        ...s, 
        phase: s.phase === 'refining' ? 'refining' : 'streaming',
        attempt: data.attempt || s.attempt 
      }));
    }));

    // Summon complete - Finalize the editor view (panel already open from streaming)
    addUnsub(window.loom.onSummonComplete((data: { 
      code: string; 
      fallback?: boolean; 
      attempt?: number;
      manifest?: { name: string; type?: string } | null;
      bundle?: { id: string; name: string; type?: string; locations: string[] } | null;
    }) => {
      isStreamingRef.current = false;
      setLoomIsStreaming(false);
      scheduleQueuedRefinement();
      const currentPrompt = originalPromptRef.current || promptRef.current;
      console.log('[Overlay] ✅ summon-complete event', {
        attempt: data.attempt || 1,
        codeLength: data.code?.length,
        bundleId: data.bundle?.id,
        manifest: data.manifest?.name,
      });
      
      currentCodeRef.current = data.code;
      setLoomStreamingCode(data.code);
      setSummonState(s => ({ ...s, phase: 'compiling', attempt: data.attempt || s.attempt }));
      console.log('[Overlay] ⚙️ State → compiling');
      
      // Always clean up and reset to idle - don't leave in a stuck state
      const cleanupAndReset = (delay: number = 500) => {
        setTimeout(() => {
          setPrompt('');
          console.log('[Overlay] 🧹 Clearing state and resetting to idle');
          originalPromptRef.current = '';
          setLastError(null);
          setCanCancel(false);
          attemptRef.current = 0;
          clearPendingRefinementTimer();
          pendingRefinementRef.current = null;
          setSummonState({ phase: 'idle', attempt: 0 });
        }, delay);
      };
      
      if (data.manifest) {
        console.log(`[Overlay] 📦 Bundle: ${data.manifest.name} (${data.manifest.type})`);
      }
      if (data.bundle) {
        console.log('[Overlay] 💾 Saved glyph bundle:', data.bundle.name, '| id:', data.bundle.id);
        data.bundle.locations.forEach((loc, idx) => {
          console.log(`   [${idx + 1}] ${loc}`);
        });
        
        // Set the glyph ID so editor can load the saved file
        setLoomInitialGlyphId(data.bundle.id);
        
        // Clean up summon state (panel is already open from streaming)
        console.log('[Overlay] ✨ Streaming complete, finalizing editor...');
        setRecentGlyphs(p => [currentPrompt, ...p.slice(0, 4)]);
        
        cleanupAndReset(500);
        return; // Skip the old injection flow
      }
      
      // No bundle - still clean up after a timeout to prevent stuck state
      console.log('[Overlay] ⚠️ No bundle received, cleaning up');
      setRecentGlyphs(p => [currentPrompt, ...p.slice(0, 4)]);
      cleanupAndReset(1000);
    }));

    // Error handling - THIS IS WHERE REFINEMENT KICKS IN
    addUnsub(window.loom.onSummonError((data: { error: string }) => {
      console.log('[Overlay] ❌ summon-error event', { error: data.error });
      console.log('[Overlay] ❌ awaitingCompileRef:', awaitingCompileRef.current);
      
      if (successTimeoutRef.current) {
        console.log('[Overlay] ❌ Cancelling success timeout - error received!');
        clearTimeout(successTimeoutRef.current);
        successTimeoutRef.current = null;
      }
      
      awaitingCompileRef.current = false;
      isStreamingRef.current = false;
      console.log('[Overlay] ⚠️ Background reported an error; scheduling refinement...');
      
      const currentPrompt = originalPromptRef.current;
      console.log('[Overlay] ❌ originalPromptRef:', currentPrompt ? `"${currentPrompt.slice(0, 80)}..."` : '(empty!)');
      console.log('[Overlay] ❌ currentCodeRef length:', currentCodeRef.current?.length || 0);
      
      if (currentCodeRef.current && currentPrompt) {
        console.log('[Overlay] ✅ Have code + prompt - QUEUING AUTO-REFINEMENT');
        queueAutoRefinement(data.error);
      } else {
        console.log('[Overlay] ❌ CANNOT REFINE - missing prompt or code!');
        setSummonState({ phase: 'idle', attempt: 0 });
        setLastError(null);
        setCanCancel(false);
        originalPromptRef.current = '';
        clearPendingRefinementTimer();
        pendingRefinementRef.current = null;
      }
    }));

    // Provider switch notification
    addUnsub(window.loom.onSummonProvider((data: { provider: string; attempt?: number; isRefinement?: boolean }) => {
      console.log('[Overlay] 🛰️ Provider update', data);
      setSummonState(s => ({ 
        ...s, 
        provider: data.provider,
        phase: data.isRefinement ? 'refining' : s.phase,
        attempt: data.attempt || s.attempt
      }));
    }));

    // Interaction state changes
    addUnsub(window.loom.onInteractionState((state: { enabled: boolean }) => {
      console.log('[Overlay] 🎚️ Interaction state changed', state);
      setInteractionEnabled(state.enabled);
      if (state.enabled && inputRef.current) {
        inputRef.current.focus();
      }
    }));

    // Widget injection - compile and render as draggable widget
    // Only register once to prevent duplicates from React StrictMode
    if (!widgetListenerRegistered.current) {
      widgetListenerRegistered.current = true;
      
      window.loom.onWidgetInject?.((data: { code: string; prompt: string; glyphId: string; inputs?: Record<string, unknown> }) => {
        console.log('[Overlay] 🔮 Widget inject received:', data.prompt);
        
        // Prevent duplicate injections within 1000ms (double-click / StrictMode protection)
        const now = Date.now();
        if (data.glyphId === lastWidgetInjectRef.current.glyphId && 
            now - lastWidgetInjectRef.current.time < 1000) {
          console.log('[Overlay] ⚠️ Skipping duplicate widget injection');
          return;
        }
        lastWidgetInjectRef.current = { glyphId: data.glyphId, time: now };
        
        // Create widget with offset position for stacking
        const offsetX = (widgetCountRef.current % 5) * 40;
        const offsetY = (widgetCountRef.current % 5) * 40;
        
        const newWidget: WidgetGlyph = {
          id: `widget-${Date.now()}-${widgetCountRef.current++}`,
          glyphId: data.glyphId,
          x: 100 + offsetX,
          y: 100 + offsetY,
          width: 400,
          height: 350,
          prompt: data.prompt,
          code: data.code,
          createdAt: Date.now(),
          layer: 'foreground', // Default: overlay layer (interactive, above desktop)
          zIndex: allocateZIndex(),
          inputs: data.inputs, // Include resolved inputs (API keys, etc.)
        };
        
        // No need to sync to background window since default layer is 'foreground'
        // Widget renders in the overlay layer by default
        
        setWidgets(prev => [...prev, newWidget]);
        console.log('[Overlay] ✨ Widget created:', newWidget.id, '(overlay layer)');
      });
      
      // Listen for glyph code updates - auto-refresh widgets when glyph is saved
      window.loom.onGlyphUpdated?.((data: { 
        glyphId: string; 
        code: string; 
        inputs?: Record<string, unknown>;
        changedFile: string;
      }) => {
        console.log('[Overlay] 🔄 Glyph updated:', data.glyphId, data.changedFile);
        
        // Update all widgets that use this glyph
        setWidgets(prev => {
          const hasMatchingWidget = prev.some(w => w.glyphId === data.glyphId);
          if (!hasMatchingWidget) return prev;
          
          console.log('[Overlay] 🔄 Refreshing widgets for glyph:', data.glyphId);
          return prev.map(widget => {
            if (widget.glyphId === data.glyphId) {
              const updatedWidget = {
                ...widget,
                code: data.code,
                inputs: data.inputs ?? widget.inputs,
              };
              
              // If widget is in background layer, sync the update to background window
              if (widget.layer === 'background') {
                window.loom?.sendWidgetToLayer?.(widget.id, {
                  id: widget.id,
                  glyphId: widget.glyphId,
                  x: widget.x,
                  y: widget.y,
                  width: widget.width,
                  height: widget.height,
                  prompt: widget.prompt,
                  code: data.code,
                  layer: widget.layer,
                  inputs: data.inputs ?? widget.inputs,
                });
              }
              
              return updatedWidget;
            }
            return widget;
          });
        });
      });
    }

    return () => {
      console.log('[Overlay] 🔌 Cleaning up IPC listeners');
      unsubscribes.forEach((fn) => {
        try {
          fn();
        } catch (err) {
          console.error('[Overlay] ⚠️ Failed to remove listener', err);
        }
      });
    };
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsFocused(true);
      }
      if (e.key === 'Escape') {
        if (showLoomPanel) {
          setShowLoomPanel(false);
          // Notify main process so it can sync state
          window.loom?.notifyLoomPanelClosed?.();
        } else {
          inputRef.current?.blur();
          setIsFocused(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showLoomPanel]);

  // Listen for Loom Panel toggle/open from main process
  // Use a ref to prevent duplicate listener registration (React StrictMode runs effects twice)
  const panelListenersRegistered = useRef(false);
  
  useEffect(() => {
    if (!window.loom) {
      console.log('[Overlay] ⚠️ window.loom not available for panel listeners');
      return;
    }
    
    // Prevent duplicate registration
    if (panelListenersRegistered.current) {
      console.log('[Overlay] 🔮 Panel listeners already registered, skipping');
      return;
    }
    panelListenersRegistered.current = true;
    
    console.log('[Overlay] 🔮 Setting up Loom Panel listeners (first time only)');
    
    // Toggle: flip the state
    window.loom.onToggleLoomPanel?.(() => {
      console.log('[Overlay] 🔮 Toggle Loom Panel triggered!');
      setShowLoomPanel(prev => {
        const newState = !prev;
        // If closing, notify main process
        if (!newState) {
          window.loom?.notifyLoomPanelClosed?.();
        }
        return newState;
      });
    });
    
    // Open: always show
    window.loom.onOpenLoomPanel?.(() => {
      console.log('[Overlay] 🔮 Open Loom Panel triggered!');
      setShowLoomPanel(true);
    });
    
    // Don't clean up - we want these listeners to persist
  }, []);

  // Callback to close Loom Panel
  const handleCloseLoomPanel = useCallback(() => {
    setShowLoomPanel(false);
    // Reset transition state and glyph selection
    setLoomTransition('idle');
    setLoomInitialGlyphId(undefined);
    setLoomStreamingCode('');
    setLoomIsStreaming(false);
    editorOpenedForStreamRef.current = false; // Reset for next summon
    // Notify main process so it can sync state and restore mouse-through
    window.loom?.notifyLoomPanelClosed?.();
  }, []);

  // Widget management
  const queueWidgetLayerSync = useCallback((widget: WidgetGlyph) => {
    if (!window.loom?.sendWidgetToLayer) return;

    widgetSyncLatestRef.current.set(widget.id, widget);

    if (widgetSyncFrameRef.current.has(widget.id)) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      widgetSyncFrameRef.current.delete(widget.id);
      const latest = widgetSyncLatestRef.current.get(widget.id);
      if (!latest) return;
      widgetSyncLatestRef.current.delete(widget.id);

      window.loom?.sendWidgetToLayer?.(widget.id, {
        id: latest.id,
        glyphId: latest.glyphId,
        x: latest.x,
        y: latest.y,
        width: latest.width,
        height: latest.height,
        prompt: latest.prompt,
        code: latest.code,
        layer: latest.layer,
        inputs: latest.inputs,
      });
    });

    widgetSyncFrameRef.current.set(widget.id, frameId);
  }, []);

  const updateWidget = useCallback((id: string, updates: Partial<WidgetGlyph>) => {
    setWidgets(prev => {
      const updated = prev.map(w => {
        if (w.id !== id) return w;
        const newWidget = { ...w, ...updates };
        
        // If this is a background widget and position/size changed, sync to background window
        if (newWidget.layer === 'background' && 
            (updates.x !== undefined || updates.y !== undefined || 
             updates.width !== undefined || updates.height !== undefined)) {
          queueWidgetLayerSync(newWidget);
        }
        
        return newWidget;
      });
      return updated;
    });
  }, [queueWidgetLayerSync]);

  useEffect(() => {
    return () => {
      widgetSyncFrameRef.current.forEach((frameId) => cancelAnimationFrame(frameId));
      widgetSyncFrameRef.current.clear();
      widgetSyncLatestRef.current.clear();
    };
  }, []);

  const removeWidget = useCallback((id: string) => {
    // Also notify background to remove if it was there
    const widget = widgets.find(w => w.id === id);
    if (widget?.layer === 'background') {
      window.loom?.sendWidgetToLayer?.(id, null); // null = remove
    }
    setWidgets(prev => prev.filter(w => w.id !== id));
  }, [widgets]);

  // Toggle widget between foreground (overlay) and background (wallpaper level)
  const toggleWidgetLayer = useCallback((id: string) => {
    setWidgets(prev => {
      const updated = prev.map(w => {
        if (w.id !== id) return w;
        
        const newLayer: WidgetLayer = w.layer === 'foreground' ? 'background' : 'foreground';
        console.log(`[Overlay] 🔄 Widget ${id} layer: ${w.layer} → ${newLayer}`);
        
        // Notify main process to handle layer change
        const widgetData = {
          id: w.id,
          glyphId: w.glyphId,
          x: w.x,
          y: w.y,
          width: w.width,
          height: w.height,
          prompt: w.prompt,
          code: w.code,
          layer: newLayer,
          inputs: w.inputs,
        };
        window.loom?.sendWidgetToLayer?.(id, widgetData);
        
        return { 
          ...w, 
          layer: newLayer,
          zIndex: newLayer === 'foreground' ? allocateZIndex() : w.zIndex,
        };
      });
      return updated;
    });
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && summonState.phase === 'idle' && window.loom) {
      // Reset state for new summon
      attemptRef.current = 0;
      currentCodeRef.current = '';
      editorOpenedForStreamRef.current = true; // Mark as opened (we're opening NOW)
      setLastError(null);
      setCanCancel(false);
      clearPendingRefinementTimer();
      pendingRefinementRef.current = null;
      isStreamingRef.current = true;
      setLoomStreamingCode(''); // Clear any previous streaming code
      setLoomInitialGlyphId(undefined); // Clear previous glyph selection
      
      // Build prompt with selected key names (not values!)
      let finalPrompt = prompt.trim();
      if (selectedKeys.length > 0) {
        const keyNames = selectedKeys
          .map(keyId => availableKeys.find(k => k.id === keyId)?.name)
          .filter(Boolean);
        if (keyNames.length > 0) {
          finalPrompt += `\n\n[User has provided these credentials/keys: ${keyNames.join(', ')}. Use window.GLYPH_INPUTS to access them by their input ID.]`;
        }
      }
      
      originalPromptRef.current = finalPrompt; // PRESERVE original prompt for entire session
      
      console.log('[Overlay] 🚀 Starting summon with prompt:', originalPromptRef.current);
      if (selectedKeys.length > 0) {
        console.log('[Overlay] 🔑 Selected keys:', selectedKeys.map(id => availableKeys.find(k => k.id === id)?.name));
      }
      
      // IMMEDIATELY open the editor with goopy animation - don't wait for first chunk
      console.log('[Overlay] 🌊 Opening editor IMMEDIATELY on submit...');
      setLoomTransition('morphing');
      setLoomIsStreaming(true);
      
      // Start goopy animation then show panel in EDITOR mode
      setTimeout(() => {
        setShowLoomPanel(true);
        setLoomTransition('complete');
        setTimeout(() => setLoomTransition('idle'), 500);
      }, 300); // Faster transition since user is waiting
      
      // Start secure summon via main process with selected model
      // Pass selectedKeys so they get linked to the glyph when it's created
      const keysToLink = selectedKeys.length > 0 ? [...selectedKeys] : undefined;
      window.loom.summonRequest(finalPrompt, selectedModel, keysToLink);
      setSummonState({ phase: 'streaming', attempt: 1 });
      setShowModelMenu(false);
      setShowKeysMenu(false);
      
      // Clear selected keys after generation starts so they don't persist to future generations
      setSelectedKeys([]);
    }
  }, [prompt, summonState.phase, selectedModel, selectedKeys, availableKeys, clearPendingRefinementTimer]);

  const handleModelSelect = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    setShowModelMenu(false);
  }, []);

  const handleKeyToggle = useCallback((keyId: string) => {
    setSelectedKeys(prev => 
      prev.includes(keyId) 
        ? prev.filter(k => k !== keyId)
        : [...prev, keyId]
    );
  }, []);

  const getCurrentModel = useCallback(() => {
    return availableModels.find(m => m.id === selectedModel);
  }, [availableModels, selectedModel]);

  const handleClear = useCallback(() => {
    setPrompt('');
    setStreamingCode('');
    inputRef.current?.focus();
  }, []);

  const handleHintClick = useCallback((hint: string) => {
    setPrompt(hint);
    inputRef.current?.focus();
  }, []);

  // Handle mouse enter/leave to toggle click-through
  const handleMouseEnter = useCallback(() => {
    window.loom?.mouseEnterUI();
  }, []);

  const handleMouseLeave = useCallback(() => {
    window.loom?.mouseLeaveUI();
  }, []);

  const isActive = summonState.phase !== 'idle';
  const showPreview = isActive || streamingCode;
  const isRefining = summonState.phase === 'refining';
  const currentAttempt = summonState.attempt || attemptRef.current || 1;

  // Phase-specific messages
  const getPhaseMessage = () => {
    const attemptInfo = currentAttempt > 1 ? ` (attempt ${currentAttempt})` : '';
    
    switch (summonState.phase) {
      case 'streaming': 
        return `🔮 Channeling${summonState.provider ? ` via ${summonState.provider}` : ''}${attemptInfo}...`;
      case 'refining':
        return `🔄 Auto-fixing error${attemptInfo}... ${lastError ? `"${lastError.slice(0, 50)}..."` : ''}`;
      case 'compiling': 
        return '⚡ Compiling reality...';
      case 'injecting': 
        return '💉 Injecting into the void...';
      case 'complete': 
        return '✨ MANIFESTED';
      case 'error': 
        return `❌ ${summonState.error || 'Summon failed'} — retrying...`;
      default: 
        return '';
    }
  };

  return (
    <>
      {/* Desktop Widgets - All widgets render controls in overlay */}
      {/* Foreground: full render here, Background: ghost controls here + content in LoomScene */}
      {widgets.map(widget => (
        <WidgetContainer
          key={widget.id}
          widget={widget}
          onUpdate={updateWidget}
          onRemove={removeWidget}
          onLayerToggle={toggleWidgetLayer}
          onFocus={bringWidgetToFront}
        />
      ))}

      {/* Loom Panel - Full control center */}
      {showLoomPanel && (
        <LoomPanel 
          onClose={handleCloseLoomPanel}
          // Only force editor when opening panel from summon bar (morphing transition)
          // If panel is already open (e.g. user summoning from chat), stay in current section
          initialSection={
            (loomTransition === 'morphing' || loomTransition === 'complete') && (loomIsStreaming || loomInitialGlyphId) 
              ? 'editor' 
              : 'chat'
          }
          initialGlyphId={loomInitialGlyphId}
          streamingCode={loomStreamingCode}
          isStreaming={loomIsStreaming}
          transitionFromSummonBar={loomTransition === 'morphing' || loomTransition === 'complete'}
          zIndex={loomPanelZ}
          onRequestFront={bringLoomPanelToFront}
          initialState={storedPanelState}
          onStateChange={handlePanelStateChange}
          editorState={storedEditorState}
          onEditorStateChange={handleEditorStateChange}
        />
      )}

      {/* Auto-Update Dialog - Goopy changelog viewer */}
      {showUpdateDialog && (
        <div 
          className="ui-interactive"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'none',
            animation: 'fadeIn 0.3s ease',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowUpdateDialog(false);
            }
          }}
        >
          <div style={{
            width: 'min(90vw, 540px)',
            height: 'min(85vh, 680px)',
            animation: 'goopyModalIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
          }}>
            <UpdaterView onClose={() => setShowUpdateDialog(false)} />
          </div>
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes goopyModalIn {
              0% {
                transform: scale(0.5) translateY(100px);
                opacity: 0;
                filter: blur(20px);
              }
              50% {
                transform: scale(1.05) translateY(-10px);
                opacity: 0.9;
                filter: blur(2px);
              }
              100% {
                transform: scale(1) translateY(0);
                opacity: 1;
                filter: blur(0);
              }
            }
          `}</style>
        </div>
      )}

      {/* Summon Bar UI - with goopy morph transition */}
      <div 
        ref={summonBarRef}
        style={{
          ...styles.container,
          // Goopy morph animation when transitioning to loom panel
          opacity: loomTransition === 'morphing' ? 0 : (showLoomPanel ? 0 : 1),
          pointerEvents: showLoomPanel || loomTransition === 'morphing' ? 'none' : 'auto',
          transform: loomTransition === 'morphing' 
            ? 'translateX(-50%) scale(1.5) translateY(-200px)' 
            : 'translateX(-50%)',
          filter: loomTransition === 'morphing' ? 'blur(20px)' : 'none',
          transition: loomTransition === 'morphing'
            ? 'all 0.6s cubic-bezier(0.68, -0.6, 0.32, 1.6)'
            : 'opacity 0.3s ease',
        }} 
        className="ui-interactive"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
      {/* Status indicator */}
      <div style={{
        ...styles.statusBadge,
        background: interactionEnabled 
          ? 'rgba(0, 255, 128, 0.15)' 
          : 'rgba(255, 255, 255, 0.05)',
        borderColor: interactionEnabled 
          ? 'rgba(0, 255, 128, 0.4)' 
          : 'rgba(255, 255, 255, 0.15)',
        boxShadow: interactionEnabled
          ? '0 0 20px rgba(0, 255, 128, 0.2)'
          : 'none',
      }}>
        <span style={styles.statusDot(interactionEnabled)} />
        {interactionEnabled ? 'SUMMONER ACTIVE' : 'Press Ctrl+Alt+S'}
      </div>

      {/* Main input bar with external model selector */}
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.inputRow}>
          <div 
            style={{
              ...styles.inputWrapper,
              ...(isFocused ? styles.inputWrapperFocused : {}),
              ...(isActive ? styles.inputWrapperActive : {}),
            }}
            onClick={() => inputRef.current?.focus()}
          >
            {/* Animated glow effect */}
            <div style={{
              ...styles.glow,
              opacity: isFocused || isActive ? 1 : 0,
              background: isActive 
                ? 'radial-gradient(ellipse at center, rgba(255,0,255,0.4) 0%, transparent 70%)'
                : 'radial-gradient(ellipse at center, rgba(0,255,255,0.3) 0%, transparent 70%)',
              animation: isActive ? 'pulse 2s ease-in-out infinite' : 'none',
            }} />
            
            {/* Icon */}
            <span style={styles.icon}>
              {isActive ? '⚡' : '✨'}
            </span>
            
            {/* Input */}
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                // Auto-resize textarea
                const textarea = e.target;
                textarea.style.height = 'auto';
                const maxHeight = e.target.value.length > 600 ? 180 : 120;
                textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
                textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
              }}
              onKeyDown={(e) => {
                // Submit on Enter (without Shift), new line on Shift+Enter
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (prompt.trim() && !isActive) {
                    handleSubmit(e as unknown as React.FormEvent);
                  }
                }
              }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={isActive ? getPhaseMessage() : 'Summon anything into existence...'}
              disabled={isActive}
              style={{
                ...styles.input,
                resize: 'none',
                overflowY: prompt.length > 600 ? 'auto' : 'hidden',
              }}
              autoComplete="off"
              spellCheck={false}
              rows={1}
            />
            
            {/* Clear button */}
            {prompt && !isActive && (
              <button type="button" onClick={handleClear} style={styles.clearBtn}>
                ✕
              </button>
            )}
            
            {/* Submit button */}
            <button 
              type="submit" 
              disabled={!prompt.trim() || isActive}
              style={{
                ...styles.submitBtn,
                opacity: prompt.trim() && !isActive ? 1 : 0.3,
                transform: isActive ? 'scale(1.1)' : 'scale(1)',
              }}
            >
              {isActive ? (
                <span style={styles.spinner}>◌</span>
              ) : (
                '→'
              )}
            </button>
          </div>
          
          {/* Key selector - Select credentials to provide to AI */}
          <div style={styles.keySelectorWrapper} ref={keysMenuRef}>
            <button 
              type="button" 
              onClick={() => setShowKeysMenu(!showKeysMenu)}
              style={{
                ...styles.keyBtn,
                borderColor: showKeysMenu || selectedKeys.length > 0 
                  ? 'rgba(0, 255, 200, 0.6)' 
                  : 'rgba(0, 255, 200, 0.25)',
                background: showKeysMenu || selectedKeys.length > 0 
                  ? 'rgba(0, 255, 200, 0.15)' 
                  : 'rgba(0, 255, 200, 0.05)',
              }}
              title={selectedKeys.length > 0 
                ? `${selectedKeys.length} key(s) selected` 
                : 'Select keys to provide'}
            >
              <span style={styles.keyIcon}>🔑</span>
              {selectedKeys.length > 0 && (
                <span style={styles.keyBadge}>{selectedKeys.length}</span>
              )}
            </button>
            
            {/* Keys dropdown menu - opens UPWARD */}
            {showKeysMenu && (
              <div style={styles.keysMenu}>
                <div style={styles.keysMenuTitle}>PROVIDE KEYS TO AI</div>
                <div style={styles.keysMenuDescription}>
                  Select credentials to include. Only names are shared with AI.
                </div>
                <div style={styles.keysMenuScroll}>
                  {availableKeys.length === 0 ? (
                    <div style={styles.keysEmpty}>
                      <span style={styles.keysEmptyIcon}>🔐</span>
                      <span style={styles.keysEmptyText}>No keys stored</span>
                      <span style={styles.keysEmptyHint}>Add keys in Settings → Keys</span>
                    </div>
                  ) : (
                    availableKeys.map((key) => (
                      <button
                        key={key.id}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleKeyToggle(key.id);
                        }}
                        style={{
                          ...styles.keyMenuItem,
                          background: selectedKeys.includes(key.id)
                            ? 'rgba(0, 255, 200, 0.15)'
                            : 'transparent',
                          borderColor: selectedKeys.includes(key.id)
                            ? 'rgba(0, 255, 200, 0.4)'
                            : 'rgba(255, 255, 255, 0.08)',
                        }}
                      >
                        <span style={styles.keyMenuIcon}>
                          {key.category === 'api' ? '🔑' : 
                           key.category === 'token' ? '🎫' :
                           key.category === 'password' ? '🔒' :
                           key.category === 'credential' ? '👤' : '📦'}
                        </span>
                        <span style={styles.keyMenuName}>{key.name}</span>
                        {selectedKeys.includes(key.id) && (
                          <span style={styles.keyMenuCheck}>✓</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
                {selectedKeys.length > 0 && (
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedKeys([]);
                    }}
                    style={styles.clearKeysBtn}
                  >
                    Clear selection
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Model selector - OUTSIDE input wrapper */}
          <div style={styles.modelSelectorWrapper} ref={modelMenuRef}>
            <button 
              type="button" 
              onClick={() => setShowModelMenu(!showModelMenu)}
              style={{
                ...styles.modelBtn,
                borderColor: showModelMenu ? 'rgba(255, 0, 255, 0.6)' : 'rgba(255, 0, 255, 0.3)',
                background: showModelMenu ? 'rgba(255, 0, 255, 0.15)' : 'rgba(255, 0, 255, 0.08)',
              }}
              title={`Using: ${getCurrentModel()?.name || 'Auto'}`}
            >
              <span style={styles.robotIcon}>🤖</span>
            </button>
            
            {/* Model dropdown menu - opens UPWARD */}
            {showModelMenu && (
              <div style={styles.modelMenu}>
                <div style={styles.modelMenuTitle}>SELECT AI MODEL</div>
                <div style={styles.modelMenuScroll}>
                  {/* Group by provider */}
                  {['grok', 'gemini', 'openai'].map(provider => {
                    const providerModels = availableModels.filter(m => m.provider === provider);
                    if (providerModels.length === 0) return null;
                    const providerLabels: Record<string, string> = {
                      grok: '🤖 xAI GROK',
                      gemini: '✨ GOOGLE GEMINI',
                      openai: '🧠 OPENAI',
                    };
                    return (
                      <div key={provider}>
                        <div style={styles.providerLabel}>{providerLabels[provider]}</div>
                        {providerModels.map((model) => (
                          <button
                            key={model.id}
                            onClick={() => handleModelSelect(model.id)}
                            disabled={!model.available}
                            style={{
                              ...styles.modelMenuItem,
                              opacity: model.available ? 1 : 0.4,
                              background: selectedModel === model.id 
                                ? 'rgba(255, 0, 255, 0.2)' 
                                : 'transparent',
                              borderColor: selectedModel === model.id
                                ? 'rgba(255, 0, 255, 0.5)'
                                : 'rgba(255, 255, 255, 0.08)',
                            }}
                          >
                            <span style={styles.modelIcon}>{model.icon}</span>
                            <span style={styles.modelName}>{model.name}</span>
                            {selectedModel === model.id && (
                              <span style={styles.modelCheck}>✓</span>
                            )}
                            {!model.available && (
                              <span style={styles.modelUnavailable}>No key</span>
                            )}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </form>

      {/* Status indicator when streaming (code now streams directly to editor) */}
      {isActive && !showLoomPanel && (
        <div style={{
          ...styles.preview,
          borderColor: isRefining ? 'rgba(255, 165, 0, 0.4)' : 'rgba(255, 0, 255, 0.4)',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
        }}>
          <span style={{ color: isRefining ? '#ffa500' : '#ff00ff', fontSize: '13px' }}>
            {isRefining ? '🔄 Auto-fixing...' : '🔮 Opening editor...'}
          </span>
          {canCancel && (
            <button
              onClick={handleCancel}
              style={styles.cancelBtn}
              title="Cancel generation"
            >
              ✕ Cancel
            </button>
          )}
        </div>
      )}

      {/* Hints and suggestions */}
      {!isActive && !showPreview && isFocused && (
        <div style={styles.hints}>
          <div style={styles.hintsTitle}>✨ Try summoning:</div>
          <div style={styles.hintsGrid}>
            {[
              'cyberpunk city with neon rain',
              'floating bitcoin price ticker',
              'particle galaxy with nebula',
              'geometric sacred mandala',
              'glowing crystal formation',
              'retro synthwave sun',
            ].map((hint, i) => (
              <button 
                key={i} 
                style={styles.hint}
                onClick={() => handleHintClick(hint)}
              >
                {hint}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent glyphs */}
      {recentGlyphs.length > 0 && !isActive && !showPreview && !isFocused && (
        <div style={styles.recentGlyphs}>
          <span style={styles.recentLabel}>Recent:</span>
          {recentGlyphs.map((g, i) => (
            <button 
              key={i} 
              style={styles.recentItem}
              onClick={() => handleHintClick(g)}
            >
              {g.slice(0, 25)}{g.length > 25 ? '...' : ''}
            </button>
          ))}
        </div>
      )}

      {/* CSS Keyframes */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes blink {
          50% { opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        input::placeholder {
          color: rgba(255, 255, 255, 0.35);
        }
        button:hover {
          filter: brightness(1.2);
        }
        .hint-btn:hover {
          background: rgba(0, 255, 255, 0.15) !important;
          border-color: rgba(0, 255, 255, 0.4) !important;
        }
      `}</style>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 STYLES — Cyberpunk aesthetic
// ═══════════════════════════════════════════════════════════════════════════

const styles: Record<string, any> = {
  container: {
    position: 'fixed',
    bottom: '100px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', monospace",
    zIndex: 9999,
  },
  statusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.5px',
    padding: '8px 16px',
    borderRadius: '20px',
    border: '1px solid',
    marginBottom: '4px',
    transition: 'all 0.4s ease',
    textTransform: 'uppercase',
  },
  statusDot: (active: boolean): React.CSSProperties => ({
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: active ? '#00ff80' : 'rgba(255, 255, 255, 0.3)',
    boxShadow: active ? '0 0 10px #00ff80' : 'none',
    animation: active ? 'pulse 1.5s ease-in-out infinite' : 'none',
  }),
  form: {
    width: '100%',
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  inputWrapper: {
    flex: 1,
    position: 'relative',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '14px',
    padding: '18px 22px',
    background: 'rgba(8, 8, 18, 0.92)',
    backdropFilter: 'blur(24px)',
    borderRadius: '18px',
    border: '1px solid rgba(0, 255, 255, 0.2)',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
    transition: 'all 0.3s ease',
    minWidth: '500px',
    overflow: 'hidden',
    cursor: 'text',
    minHeight: '56px',
  },
  inputWrapperFocused: {
    border: '1px solid rgba(0, 255, 255, 0.5)',
    boxShadow: '0 8px 40px rgba(0, 255, 255, 0.12), 0 0 60px rgba(0, 255, 255, 0.08), inset 0 1px 0 rgba(255,255,255,0.05)',
  },
  inputWrapperActive: {
    border: '1px solid rgba(255, 0, 255, 0.5)',
    boxShadow: '0 8px 40px rgba(255, 0, 255, 0.15), 0 0 80px rgba(255, 0, 255, 0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
  },
  glow: {
    position: 'absolute',
    top: '-60%',
    left: '-15%',
    right: '-15%',
    bottom: '-60%',
    transition: 'opacity 0.4s ease',
    pointerEvents: 'none',
  },
  icon: {
    fontSize: '22px',
    zIndex: 1,
    filter: 'drop-shadow(0 0 8px currentColor)',
    paddingTop: '2px',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#ffffff',
    fontSize: '16px',
    fontFamily: 'inherit',
    zIndex: 1,
    letterSpacing: '0.3px',
    resize: 'none',
    minHeight: '24px',
    maxHeight: '180px',
    lineHeight: '1.4',
  },
  clearBtn: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.4)',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '6px 10px',
    borderRadius: '6px',
    transition: 'all 0.2s ease',
    zIndex: 1,
  },
  submitBtn: {
    background: 'linear-gradient(135deg, #00ffff 0%, #ff00ff 100%)',
    border: 'none',
    borderRadius: '12px',
    width: '44px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: '20px',
    color: '#000',
    fontWeight: 'bold',
    transition: 'all 0.3s ease',
    zIndex: 1,
    boxShadow: '0 4px 15px rgba(0, 255, 255, 0.3)',
  },
  spinner: {
    display: 'inline-block',
    animation: 'spin 1s linear infinite',
    fontSize: '22px',
  },
  preview: {
    width: '560px',
    background: 'rgba(8, 8, 18, 0.95)',
    backdropFilter: 'blur(24px)',
    borderRadius: '14px',
    border: '1px solid',
    overflow: 'hidden',
    transition: 'all 0.3s ease',
  },
  previewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 18px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  previewTitle: {
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.5px',
  },
  previewLines: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: '11px',
  },
  previewCode: {
    margin: 0,
    padding: '14px 18px',
    color: '#00ffff',
    fontSize: '11px',
    lineHeight: '1.5',
    maxHeight: '180px',
    overflowY: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    fontFamily: 'inherit',
  },
  cursor: {
    color: '#ff00ff',
    animation: 'blink 0.8s step-end infinite',
  },
  cancelBtn: {
    background: 'rgba(255, 50, 50, 0.15)',
    border: '1px solid rgba(255, 50, 50, 0.4)',
    borderRadius: '6px',
    color: '#ff5050',
    fontSize: '11px',
    fontWeight: 600,
    padding: '6px 12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
    letterSpacing: '0.3px',
  },
  errorBanner: {
    background: 'rgba(255, 165, 0, 0.1)',
    borderBottom: '1px solid rgba(255, 165, 0, 0.2)',
    padding: '10px 18px',
    color: '#ffa500',
    fontSize: '11px',
    lineHeight: 1.4,
    fontFamily: 'inherit',
  },
  hints: {
    width: '560px',
    padding: '16px',
    background: 'rgba(8, 8, 18, 0.85)',
    backdropFilter: 'blur(20px)',
    borderRadius: '14px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  hintsTitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: '11px',
    fontWeight: 600,
    marginBottom: '12px',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  hintsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
  },
  hint: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: '12px',
    padding: '10px 14px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textAlign: 'left',
    fontFamily: 'inherit',
  },
  recentGlyphs: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: '560px',
  },
  recentLabel: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  recentItem: {
    color: 'rgba(0, 255, 255, 0.7)',
    fontSize: '11px',
    padding: '6px 12px',
    background: 'rgba(0, 255, 255, 0.05)',
    border: '1px solid rgba(0, 255, 255, 0.2)',
    borderRadius: '16px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
  // Key selector styles - positioned outside input container
  keySelectorWrapper: {
    position: 'relative',
    zIndex: 101,
    flexShrink: 0,
  },
  keyBtn: {
    background: 'rgba(8, 8, 18, 0.92)',
    backdropFilter: 'blur(24px)',
    border: '1px solid rgba(0, 255, 200, 0.25)',
    borderRadius: '14px',
    width: '56px',
    height: '56px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
    position: 'relative',
  },
  keyIcon: {
    fontSize: '24px',
    filter: 'drop-shadow(0 0 6px rgba(0, 255, 200, 0.5))',
  },
  keyBadge: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    width: '20px',
    height: '20px',
    background: 'linear-gradient(135deg, #00ffc8, #00cc99)',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 700,
    color: '#000',
    boxShadow: '0 2px 8px rgba(0, 255, 200, 0.4)',
  },
  keysMenu: {
    position: 'absolute',
    bottom: '65px',
    right: '0',
    background: 'rgba(12, 12, 24, 0.98)',
    backdropFilter: 'blur(24px)',
    borderRadius: '14px',
    border: '1px solid rgba(0, 255, 200, 0.4)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 60px rgba(0, 255, 200, 0.1)',
    padding: '12px',
    minWidth: '260px',
    animation: 'fadeIn 0.2s ease',
  },
  keysMenuTitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '1px',
    textTransform: 'uppercase',
    marginBottom: '4px',
  },
  keysMenuDescription: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: '11px',
    lineHeight: 1.4,
    marginBottom: '12px',
    paddingBottom: '10px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  keysMenuScroll: {
    maxHeight: '250px',
    overflowY: 'auto',
    overflowX: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  keysEmpty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px',
    gap: '8px',
  },
  keysEmptyIcon: {
    fontSize: '28px',
    opacity: 0.4,
  },
  keysEmptyText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '13px',
    fontWeight: 500,
  },
  keysEmptyHint: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: '11px',
  },
  keyMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '10px 12px',
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
    textAlign: 'left',
  },
  keyMenuIcon: {
    fontSize: '16px',
  },
  keyMenuName: {
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 500,
    flex: 1,
  },
  keyMenuCheck: {
    color: '#00ffc8',
    fontSize: '14px',
    fontWeight: 'bold',
  },
  clearKeysBtn: {
    marginTop: '10px',
    padding: '8px 12px',
    background: 'transparent',
    border: '1px solid rgba(255, 100, 100, 0.3)',
    borderRadius: '8px',
    color: 'rgba(255, 100, 100, 0.7)',
    fontSize: '11px',
    cursor: 'pointer',
    width: '100%',
    fontFamily: 'inherit',
    transition: 'all 0.2s ease',
  },

  // Model selector styles - positioned outside input container
  modelSelectorWrapper: {
    position: 'relative',
    zIndex: 100,
    flexShrink: 0,
  },
  modelBtn: {
    background: 'rgba(8, 8, 18, 0.92)',
    backdropFilter: 'blur(24px)',
    border: '1px solid rgba(255, 0, 255, 0.3)',
    borderRadius: '14px',
    width: '56px',
    height: '56px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
  },
  robotIcon: {
    fontSize: '24px',
    filter: 'drop-shadow(0 0 6px rgba(255, 0, 255, 0.6))',
  },
  modelMenu: {
    position: 'absolute',
    bottom: '65px',
    right: '0',
    background: 'rgba(12, 12, 24, 0.98)',
    backdropFilter: 'blur(24px)',
    borderRadius: '14px',
    border: '1px solid rgba(255, 0, 255, 0.4)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 60px rgba(255, 0, 255, 0.15)',
    padding: '8px',
    minWidth: '220px',
    animation: 'fadeIn 0.2s ease',
  },
  modelMenuScroll: {
    maxHeight: '350px',
    overflowY: 'auto',
    overflowX: 'hidden',
    paddingRight: '4px',
  },
  providerLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '1.2px',
    padding: '10px 12px 4px',
    textTransform: 'uppercase',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    marginTop: '4px',
  },
  modelMenuTitle: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '1px',
    padding: '8px 12px 6px',
    textTransform: 'uppercase',
  },
  modelMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '10px 12px',
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
    textAlign: 'left',
  },
  modelIcon: {
    fontSize: '16px',
  },
  modelName: {
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 500,
    flex: 1,
  },
  modelCheck: {
    color: '#ff00ff',
    fontSize: '14px',
    fontWeight: 'bold',
  },
  modelUnavailable: {
    color: 'rgba(255, 100, 100, 0.7)',
    fontSize: '10px',
    fontStyle: 'italic',
  },
};
