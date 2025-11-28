/**
 * LOOM PANEL — The Command Center for Digital Manifestation
 * A gorgeous, goopy interface to manage glyphs, chat with AI, and edit code
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { CodeEditorState, LoomPanelState } from '../types/ui-state';
import ChatView from './views/ChatView';
import GlyphsView from './views/GlyphsView';
import CodeEditorView from './views/CodeEditorView';
import SettingsView from './views/SettingsView';

type NavSection = 'chat' | 'glyphs' | 'editor' | 'settings';

interface NavItem {
  id: NavSection;
  icon: string;
  label: string;
}

interface LoomPanelProps {
  onClose?: () => void;
  initialSection?: NavSection;
  initialGlyphId?: string;
  streamingCode?: string;
  isStreaming?: boolean;
  transitionFromSummonBar?: boolean; // For goopy morph animation
  zIndex?: number;
  onRequestFront?: () => void;
  initialState?: LoomPanelState;
  onStateChange?: (state: LoomPanelState) => void;
  editorState?: CodeEditorState;
  onEditorStateChange?: (state: CodeEditorState) => void;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'chat', icon: '💬', label: 'Chat' },
  { id: 'glyphs', icon: '✨', label: 'Glyphs' },
  { id: 'editor', icon: '⌨️', label: 'Editor' },
];

export default function LoomPanel({ 
  onClose, 
  initialSection = 'chat', 
  initialGlyphId,
  streamingCode,
  isStreaming,
  transitionFromSummonBar = false,
  zIndex,
  onRequestFront,
  initialState,
  onStateChange,
  editorState,
  onEditorStateChange,
}: LoomPanelProps) {
  const derivedInitialSection: NavSection =
    initialSection !== 'chat' ? initialSection : initialState?.activeSection ?? initialSection;
  const [activeSection, setActiveSection] = useState<NavSection>(derivedInitialSection);
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(initialState?.navCollapsed ?? false); // Nav collapsed state (open by default)
  const hasAutoSwitchedToEditor = useRef(false); // Track if we've auto-switched to editor
  
  // Panel position (absolute top-left coordinates)
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number } | null>(
    initialState?.position ?? null
  );
  
  // Resize state
  const [size, setSize] = useState(initialState?.size ?? { width: 1400, height: 900 }); // Default size
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDir, setResizeDir] = useState<string | null>(null);
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0 });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  
  const initialStateAppliedRef = useRef(false);

  useEffect(() => {
    if (initialStateAppliedRef.current) return;
    if (!initialState) return;
    if (initialSection === 'chat' && initialState.activeSection) {
      setActiveSection(initialState.activeSection);
    }
    if (typeof initialState.navCollapsed === 'boolean') {
      setNavCollapsed(initialState.navCollapsed);
    }
    if (initialState.position) {
      setPanelPosition(initialState.position);
    }
    if (initialState.size) {
      setSize(initialState.size);
    }
    initialStateAppliedRef.current = true;
  }, [initialState, initialSection]);

  // Initialize panel position to center it
  useEffect(() => {
    if (panelPosition === null) {
      const centerTop = (window.innerHeight - size.height) / 2;
      const centerLeft = (window.innerWidth - size.width) / 2;
      setPanelPosition({ top: centerTop, left: centerLeft });
    }
  }, [size, panelPosition]);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // Trigger goopy entrance animation on mount
  useEffect(() => {
    // Small delay for dramatic effect
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);
  
  // Track the last glyph ID we auto-switched for
  const lastAutoSwitchGlyphId = useRef<string | null>(null);
  
  // Switch to editor view when streaming starts (only once per streaming session)
  useEffect(() => {
    if (isStreaming && !hasAutoSwitchedToEditor.current) {
      console.log('[LoomPanel] 🔄 Switching to editor for streaming');
      setActiveSection('editor');
      hasAutoSwitchedToEditor.current = true;
    }
  }, [isStreaming]);
  
  // Switch to editor when initial glyph ID changes (only for NEW glyph IDs)
  useEffect(() => {
    if (initialGlyphId && initialGlyphId !== lastAutoSwitchGlyphId.current) {
      console.log('[LoomPanel] 🔄 Switching to editor for glyph:', initialGlyphId);
      setActiveSection('editor');
      lastAutoSwitchGlyphId.current = initialGlyphId;
      hasAutoSwitchedToEditor.current = true;
    }
    // Reset auto-switch flag when glyph ID is cleared (for next generation)
    if (!initialGlyphId) {
      hasAutoSwitchedToEditor.current = false;
      lastAutoSwitchGlyphId.current = null;
    }
  }, [initialGlyphId]);

  // Handle window close with exit animation
  const handleClose = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      onClose?.();
    }, 400);
  }, [onClose]);

  // Dragging functionality
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    // Only start drag from title bar
    if ((e.target as HTMLElement).closest('[data-drag-handle]')) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: panelPosition?.left || 0,
        posY: panelPosition?.top || 0,
      };
      e.preventDefault();
    }
  }, [panelPosition]);

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    
    setPanelPosition({
      left: dragStartRef.current.posX + deltaX,
      top: dragStartRef.current.posY + deltaY,
    });
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeDir(direction);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
      top: panelPosition?.top || 0,
      left: panelPosition?.left || 0,
    };
  }, [size, panelPosition]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !resizeDir) return;
    
    const deltaX = e.clientX - resizeStartRef.current.x;
    const deltaY = e.clientY - resizeStartRef.current.y;
    const minWidth = 600;
    const minHeight = 400;
    const maxWidth = window.innerWidth - 100;
    const maxHeight = window.innerHeight - 100;
    
    let newWidth = resizeStartRef.current.width;
    let newHeight = resizeStartRef.current.height;
    let newTop = resizeStartRef.current.top;
    let newLeft = resizeStartRef.current.left;
    
    // Handle horizontal resize - only the dragged edge moves
    if (resizeDir.includes('e')) {
      // East: expand width to the right only (left edge stays fixed)
      newWidth = Math.max(minWidth, Math.min(maxWidth, resizeStartRef.current.width + deltaX));
      // Left position stays the same
    }
    if (resizeDir.includes('w')) {
      // West: expand width to the left (right edge stays fixed)
      const potentialWidth = resizeStartRef.current.width - deltaX;
      newWidth = Math.max(minWidth, Math.min(maxWidth, potentialWidth));
      // Move left edge by the change in width
      newLeft = resizeStartRef.current.left + (resizeStartRef.current.width - newWidth);
    }
    
    // Handle vertical resize - only the dragged edge moves
    if (resizeDir.includes('s')) {
      // South: expand height downward only (top edge stays fixed)
      newHeight = Math.max(minHeight, Math.min(maxHeight, resizeStartRef.current.height + deltaY));
      // Top position stays the same
    }
    if (resizeDir.includes('n')) {
      // North: expand height upward (bottom edge stays fixed)
      const potentialHeight = resizeStartRef.current.height - deltaY;
      newHeight = Math.max(minHeight, Math.min(maxHeight, potentialHeight));
      // Move top edge by the change in height
      newTop = resizeStartRef.current.top + (resizeStartRef.current.height - newHeight);
    }
    
    setSize({ width: newWidth, height: newHeight });
    setPanelPosition({ top: newTop, left: newLeft });
  }, [isResizing, resizeDir]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    setResizeDir(null);
  }, []);

  // Add global mouse listeners for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Add global mouse listeners for resizing
  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
      return () => {
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  // Handle mouse enter/leave to enable clicking only when hovering over panel
  const handleMouseEnter = useCallback(() => {
    (window as any).loom?.mouseEnterUI?.();
  }, []);

  const handleMouseLeave = useCallback((event: React.MouseEvent) => {
    if (panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect();
      const { clientX, clientY } = event;
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        return;
      }
    }
    // Only restore click-through if not dragging
    if (!isDragging) {
      (window as any).loom?.mouseLeaveUI?.();
    }
  }, [isDragging]);

  useEffect(() => {
    if (!onStateChange) return;
    const nextState: LoomPanelState = {
      size,
      position: panelPosition ?? undefined,
      navCollapsed,
      activeSection,
    };
    onStateChange(nextState);
  }, [size, panelPosition, navCollapsed, activeSection, onStateChange]);

  return (
    <div 
      ref={containerRef}
      className="loom-panel ui-interactive"
      style={{
        ...styles.container,
        zIndex,
        opacity: isExiting ? 0 : 1,
        transform: isExiting ? 'scale(0.9) translateY(20px)' : 'none',
      }}
    >
      {/* Main panel with goopy animation - enhanced for summon bar transition */}
      <div 
        style={{
          ...styles.panel,
          width: size.width,
          height: size.height,
          top: panelPosition?.top ?? '50%',
          left: panelPosition?.left ?? '50%',
          // Use margin-based centering as fallback before position is calculated
          marginTop: panelPosition ? 0 : -size.height / 2,
          marginLeft: panelPosition ? 0 : -size.width / 2,
          opacity: isVisible && !isExiting ? 1 : 0,
          transform: isVisible && !isExiting 
            ? 'scale(1)' 
            : transitionFromSummonBar 
              ? 'scale(0.3) translateY(300px)'
              : 'scale(0.85) translateY(40px)',
          filter: isVisible && !isExiting ? 'blur(0)' : 'blur(12px)',
          cursor: isDragging ? 'grabbing' : isResizing ? 'default' : 'default',
          // Enhanced goopy transition from summon bar
          animation: transitionFromSummonBar && isVisible ? 'goopyMorphIn 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' : undefined,
          pointerEvents: 'auto',
        }}
        ref={panelRef}
        onMouseDown={handleDragStart}
        onMouseDownCapture={onRequestFront}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Resize handles */}
        {/* Edges */}
        <div 
          style={{ ...styles.resizeEdge, top: 0, left: 20, right: 20, height: 6, cursor: 'ns-resize' }}
          onMouseDown={(e) => handleResizeStart(e, 'n')}
        />
        <div 
          style={{ ...styles.resizeEdge, bottom: 0, left: 20, right: 20, height: 6, cursor: 'ns-resize' }}
          onMouseDown={(e) => handleResizeStart(e, 's')}
        />
        <div 
          style={{ ...styles.resizeEdge, left: 0, top: 20, bottom: 20, width: 6, cursor: 'ew-resize' }}
          onMouseDown={(e) => handleResizeStart(e, 'w')}
        />
        <div 
          style={{ ...styles.resizeEdge, right: 0, top: 20, bottom: 20, width: 6, cursor: 'ew-resize' }}
          onMouseDown={(e) => handleResizeStart(e, 'e')}
        />
        {/* Corners */}
        <div 
          style={{ ...styles.resizeCorner, top: 0, left: 0, cursor: 'nwse-resize' }}
          onMouseDown={(e) => handleResizeStart(e, 'nw')}
        />
        <div 
          style={{ ...styles.resizeCorner, top: 0, right: 0, cursor: 'nesw-resize' }}
          onMouseDown={(e) => handleResizeStart(e, 'ne')}
        />
        <div 
          style={{ ...styles.resizeCorner, bottom: 0, left: 0, cursor: 'nesw-resize' }}
          onMouseDown={(e) => handleResizeStart(e, 'sw')}
        />
        <div 
          style={{ ...styles.resizeCorner, bottom: 0, right: 0, cursor: 'nwse-resize' }}
          onMouseDown={(e) => handleResizeStart(e, 'se')}
        />
        {/* Window chrome / title bar - DRAGGABLE */}
        <div style={styles.titleBar} data-drag-handle>
          <div style={styles.titleBarLeft}>
            <span style={styles.titleIcon}>🔮</span>
            <span style={styles.titleText}>L O O M</span>
          </div>
          <div style={styles.titleBarRight}>
            <span style={styles.shortcutHint}>Drag to move • ESC to close</span>
            <button 
              style={{...styles.windowBtn, ...styles.closeBtn}} 
              onClick={handleClose}
              onMouseDown={(e) => e.stopPropagation()} // Don't trigger drag
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 50, 50, 0.3)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Main content area */}
        <div style={styles.content}>
          {/* Left vertical navigation - Collapsible */}
          <nav style={{
            ...styles.nav,
            width: navCollapsed ? '48px' : '80px',
            transition: 'width 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}>
            {/* Collapse toggle button */}
            <button
              onClick={() => setNavCollapsed(!navCollapsed)}
              style={{
                ...styles.navCollapseBtn,
                opacity: isVisible ? 1 : 0,
                transform: isVisible 
                  ? `translateX(0) rotate(${navCollapsed ? '180deg' : '0deg'})` 
                  : 'translateX(-20px)',
              }}
              title={navCollapsed ? 'Expand menu' : 'Collapse menu'}
            >
              ‹
            </button>
            
            {NAV_ITEMS.map((item, index) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                style={{
                  ...styles.navItem,
                  ...(activeSection === item.id ? styles.navItemActive : {}),
                  animationDelay: `${index * 80 + 200}ms`,
                  opacity: isVisible ? 1 : 0,
                  transform: isVisible ? 'translateX(0)' : 'translateX(-20px)',
                  width: navCollapsed ? '40px' : '64px',
                  padding: navCollapsed ? '14px 4px' : '14px 8px',
                }}
                title={navCollapsed ? item.label : undefined}
              >
                <span style={styles.navIcon}>{item.icon}</span>
                {!navCollapsed && <span style={styles.navLabel}>{item.label}</span>}
                {activeSection === item.id && (
                  <div style={styles.navIndicator} />
                )}
              </button>
            ))}
            
            {/* Spacer */}
            <div style={{ flex: 1 }} />
            
            {/* Settings button at bottom */}
            <button
              onClick={() => setActiveSection('settings')}
              style={{
                ...styles.navItem,
                ...(activeSection === 'settings' ? styles.navItemActive : {}),
                opacity: isVisible ? (activeSection === 'settings' ? 1 : 0.6) : 0,
                transform: isVisible ? 'translateX(0)' : 'translateX(-20px)',
                animationDelay: '400ms',
                width: navCollapsed ? '40px' : '64px',
                padding: navCollapsed ? '14px 4px' : '14px 8px',
              }}
              onMouseEnter={(e) => { if (activeSection !== 'settings') e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={(e) => { if (activeSection !== 'settings') e.currentTarget.style.opacity = '0.6'; }}
              title={navCollapsed ? 'Settings' : undefined}
            >
              <span style={styles.navIcon}>⚙️</span>
              {!navCollapsed && <span style={styles.navLabel}>Settings</span>}
              {activeSection === 'settings' && (
                <div style={styles.navIndicator} />
              )}
            </button>
          </nav>

          {/* Main view area */}
          <div style={styles.viewContainer}>
            {activeSection === 'chat' && <ChatView />}
            {activeSection === 'glyphs' && <GlyphsView />}
            {activeSection === 'editor' && (
              <CodeEditorView 
                initialGlyphId={initialGlyphId}
                streamingCode={streamingCode}
                isStreaming={isStreaming}
                persistedState={editorState}
                onStateChange={onEditorStateChange}
              />
            )}
            {activeSection === 'settings' && <SettingsView />}
          </div>
        </div>
      </div>

      {/* CSS Keyframes for animations */}
      <style>{`
        @keyframes goopyIn {
          0% {
            transform: scale(0.6) translateY(60px);
            opacity: 0;
            filter: blur(20px);
          }
          40% {
            transform: scale(1.05) translateY(-10px);
            opacity: 0.8;
            filter: blur(2px);
          }
          70% {
            transform: scale(0.98) translateY(5px);
            opacity: 0.95;
            filter: blur(0);
          }
          100% {
            transform: scale(1) translateY(0);
            opacity: 1;
            filter: blur(0);
          }
        }
        
        @keyframes goopyMorphIn {
          0% {
            transform: scale(0.2) translateY(350px);
            opacity: 0;
            filter: blur(30px);
            border-radius: 50px;
          }
          15% {
            transform: scale(0.4) translateY(250px);
            opacity: 0.3;
            filter: blur(20px);
            border-radius: 40px;
          }
          35% {
            transform: scale(0.8) translateY(100px);
            opacity: 0.6;
            filter: blur(10px);
            border-radius: 30px;
          }
          55% {
            transform: scale(1.08) translateY(-20px);
            opacity: 0.9;
            filter: blur(3px);
            border-radius: 26px;
          }
          75% {
            transform: scale(0.97) translateY(10px);
            opacity: 0.98;
            filter: blur(0);
            border-radius: 24px;
          }
          90% {
            transform: scale(1.02) translateY(-5px);
            opacity: 1;
            filter: blur(0);
            border-radius: 24px;
          }
          100% {
            transform: scale(1) translateY(0);
            opacity: 1;
            filter: blur(0);
            border-radius: 24px;
          }
        }
        
        @keyframes floatGlow {
          0%, 100% {
            box-shadow: 0 0 60px rgba(0, 255, 255, 0.15),
                        0 0 120px rgba(255, 0, 255, 0.1),
                        inset 0 1px 0 rgba(255, 255, 255, 0.08);
          }
          50% {
            box-shadow: 0 0 80px rgba(0, 255, 255, 0.2),
                        0 0 160px rgba(255, 0, 255, 0.15),
                        inset 0 1px 0 rgba(255, 255, 255, 0.12);
          }
        }
        
        @keyframes bgShift1 {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(10px, -10px) rotate(1deg); }
          50% { transform: translate(-5px, 5px) rotate(-0.5deg); }
          75% { transform: translate(5px, 10px) rotate(0.5deg); }
        }
        
        @keyframes bgShift2 {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          33% { transform: translate(-15px, 10px) rotate(-1deg); }
          66% { transform: translate(10px, -5px) rotate(1deg); }
        }
        
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 STYLES — Cyberpunk aesthetic with glass morphism
// ═══════════════════════════════════════════════════════════════════════════

type LoomStyle = React.CSSProperties & { WebkitAppRegion?: string };

const styles: Record<string, LoomStyle> = {
  container: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', monospace",
    transition: 'opacity 0.4s ease, transform 0.4s ease',
    // No flex centering - we'll position the panel absolutely
    pointerEvents: 'none',
  },
  
  panel: {
    position: 'absolute',
    background: 'linear-gradient(135deg, #0a0a19 0%, #0f0f23 100%)',
    borderRadius: '24px',
    border: '1px solid rgba(0, 255, 255, 0.15)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    transition: 'opacity 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.4s ease',
    animation: 'floatGlow 4s ease-in-out infinite',
    boxShadow: '0 25px 80px rgba(0, 0, 0, 0.8), 0 0 60px rgba(0, 255, 255, 0.08)',
  },
  
  // Resize handles
  resizeEdge: {
    position: 'absolute',
    background: 'transparent',
    zIndex: 100,
    transition: 'background 0.2s ease',
  },
  resizeCorner: {
    position: 'absolute',
    width: '20px',
    height: '20px',
    background: 'transparent',
    zIndex: 101,
    transition: 'background 0.2s ease',
  },
  
  titleBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    userSelect: 'none',
    cursor: 'grab',
  },
  titleBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  titleIcon: {
    fontSize: '24px',
    filter: 'drop-shadow(0 0 8px rgba(255, 0, 255, 0.5))',
  },
  titleText: {
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '4px',
    background: 'linear-gradient(90deg, #00ffff, #ff00ff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    textShadow: '0 0 20px rgba(0, 255, 255, 0.3)',
  },
  titleBarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    WebkitAppRegion: 'no-drag',
  },
  shortcutHint: {
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.3)',
    letterSpacing: '0.5px',
  },
  windowBtn: {
    width: '32px',
    height: '32px',
    border: 'none',
    background: 'transparent',
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: '14px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    color: 'rgba(255, 100, 100, 0.8)',
  },
  
  content: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  
  nav: {
    width: '80px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '12px 0 20px 0',
    gap: '8px',
    borderRight: '1px solid rgba(255, 255, 255, 0.06)',
    background: 'rgba(0, 0, 0, 0.2)',
    overflow: 'hidden',
  },
  navCollapseBtn: {
    width: '32px',
    height: '24px',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'rgba(255, 255, 255, 0.05)',
    color: 'rgba(255, 255, 255, 0.4)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
    transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  navItem: {
    width: '64px',
    padding: '14px 8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    border: 'none',
    background: 'transparent',
    color: 'rgba(255, 255, 255, 0.5)',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
    position: 'relative',
    animation: 'slideIn 0.5s ease forwards',
  },
  navItemActive: {
    background: 'rgba(0, 255, 255, 0.1)',
    color: '#00ffff',
    boxShadow: '0 0 20px rgba(0, 255, 255, 0.15)',
  },
  navIcon: {
    fontSize: '22px',
  },
  navLabel: {
    fontSize: '9px',
    fontWeight: 600,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  },
  navIndicator: {
    position: 'absolute',
    left: '0',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '3px',
    height: '24px',
    background: 'linear-gradient(180deg, #00ffff, #ff00ff)',
    borderRadius: '0 3px 3px 0',
    boxShadow: '0 0 10px rgba(0, 255, 255, 0.5)',
  },
  
  viewContainer: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
};

