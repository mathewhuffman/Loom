/**
 * LOOM PANEL — The Command Center for Digital Manifestation
 * A gorgeous, goopy interface to manage glyphs, chat with AI, and edit code
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { CodeEditorState, LoomPanelState, ChatMode } from '../types/ui-state';
import ChatView from './views/ChatView';
import GlyphsView from './views/GlyphsView';
import CodeEditorView from './views/CodeEditorView';
import SettingsView from './views/SettingsView';

type NavSection = 'chat' | 'glyphs' | 'editor' | 'settings';

interface AIModel {
  id: string;
  name: string;
  provider: string;
  available: boolean;
  icon: string;
}

// Track glyph created from chat for editor transition
interface ChatGlyphCreation {
  glyphId: string;
  streamingCode: string;
}

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
  const [mountedSections, setMountedSections] = useState<NavSection[]>(() => [derivedInitialSection]);
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(initialState?.navCollapsed ?? false); // Nav collapsed state (open by default)
  const hasAutoSwitchedToEditor = useRef(false); // Track if we've auto-switched to editor
  
  // Window controls state
  const [isMaximized, setIsMaximized] = useState(false);
  const [hoveredControl, setHoveredControl] = useState<'close' | 'minimize' | 'maximize' | null>(null);
  
  // LLM selector state
  const [availableModels, setAvailableModels] = useState<AIModel[]>([]);
  const [chatLLM, setChatLLM] = useState<string>(initialState?.chatLLM ?? 'grok');
  const [generationLLM, setGenerationLLM] = useState<string>(initialState?.generationLLM ?? 'grok');
  const [chatModeState, setChatModeState] = useState<ChatMode>(initialState?.chatMode ?? 'summon');
  const [showChatLLMMenu, setShowChatLLMMenu] = useState(false);
  const [showGenerationLLMMenu, setShowGenerationLLMMenu] = useState(false);
  const chatLLMMenuRef = useRef<HTMLDivElement>(null);
  const generationLLMMenuRef = useRef<HTMLDivElement>(null);
  
  // Track glyph created from chat view for seamless editor transition
  const [chatGlyphCreation, setChatGlyphCreation] = useState<ChatGlyphCreation | null>(null);
  
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
    if (initialState.chatLLM) {
      setChatLLM(initialState.chatLLM);
    }
    if (initialState.generationLLM) {
      setGenerationLLM(initialState.generationLLM);
    }
    if (initialState.chatMode) {
      setChatModeState(initialState.chatMode);
    }
    initialStateAppliedRef.current = true;
  }, [initialState, initialSection]);

  useEffect(() => {
    setMountedSections(prev =>
      prev.includes(activeSection) ? prev : [...prev, activeSection]
    );
  }, [activeSection]);

  // Load available AI models
  useEffect(() => {
    if (window.loom?.getAvailableModels) {
      window.loom.getAvailableModels().then((models) => {
        setAvailableModels(models);
      }).catch(console.error);
    }
  }, []);

  // Close LLM menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (chatLLMMenuRef.current && !chatLLMMenuRef.current.contains(e.target as Node)) {
        setShowChatLLMMenu(false);
      }
      if (generationLLMMenuRef.current && !generationLLMMenuRef.current.contains(e.target as Node)) {
        setShowGenerationLLMMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
  
  // NOTE: We no longer auto-switch to editor when streaming starts.
  // The user should stay in chat and see the preview there.
  // Only switch to editor when user explicitly clicks "Open Editor"
  
  // Reset tracking refs when glyph ID is cleared (for next generation)
  useEffect(() => {
    if (!initialGlyphId) {
      hasAutoSwitchedToEditor.current = false;
      lastAutoSwitchGlyphId.current = null;
    }
  }, [initialGlyphId]);

  // Clear chat glyph creation when switching away from editor
  // Use a ref to track current section for timeout callback
  const activeSectionRef = useRef(activeSection);
  activeSectionRef.current = activeSection;
  
  useEffect(() => {
    if (activeSection !== 'editor' && chatGlyphCreation) {
      // Keep it for a moment in case user accidentally switched
      const timer = setTimeout(() => {
        if (activeSectionRef.current !== 'editor') {
          setChatGlyphCreation(null);
        }
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [activeSection, chatGlyphCreation]);

  // Handle glyph created from ChatView - NOW ONLY switches to editor when user explicitly clicks
  // This is called when user clicks "Open Editor" button on the chat embed preview
  const handleChatGlyphCreated = useCallback((glyphId: string, streamingCode: string) => {
    console.log('[LoomPanel] 🎉 User requested editor for glyph:', glyphId);
    setChatGlyphCreation({ glyphId, streamingCode });
    setActiveSection('editor'); // Only switch because user explicitly clicked
    hasAutoSwitchedToEditor.current = true;
  }, []);

  const renderSectionContent = (section: NavSection) => {
    switch (section) {
      case 'chat':
        return (
          <ChatView
            onGlyphCreated={handleChatGlyphCreated}
            chatLLM={chatLLM}
            generationLLM={generationLLM}
            chatMode={chatModeState}
            onChatModeChange={setChatModeState}
          />
        );
      case 'glyphs':
        return <GlyphsView />;
      case 'editor':
        return (
          <CodeEditorView
            initialGlyphId={chatGlyphCreation?.glyphId || initialGlyphId}
            streamingCode={chatGlyphCreation?.streamingCode || streamingCode}
            isStreaming={isStreaming}
            persistedState={editorState}
            onStateChange={onEditorStateChange}
          />
        );
      case 'settings':
        return <SettingsView />;
      default:
        return null;
    }
  };

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
      chatLLM,
      generationLLM,
      chatMode: chatModeState,
    };
    onStateChange(nextState);
  }, [size, panelPosition, navCollapsed, activeSection, chatLLM, generationLLM, chatModeState, onStateChange]);
  
  // Window control handlers
  const handleWindowClose = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      onClose?.();
    }, 400);
  }, [onClose]);
  
  const handleWindowMinimize = useCallback(async () => {
    if (window.loom?.windowControl) {
      await window.loom.windowControl('minimize');
    }
  }, []);
  
  const handleWindowMaximize = useCallback(async () => {
    if (window.loom?.windowControl) {
      const result = await window.loom.windowControl('maximize');
      if (result.success && typeof result.isMaximized === 'boolean') {
        setIsMaximized(result.isMaximized);
      }
    }
  }, []);
  
  // Get model by ID
  const getModelById = useCallback((modelId: string) => {
    return availableModels.find(m => m.id === modelId);
  }, [availableModels]);

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
            {/* Mac-style window controls */}
            <div style={styles.macControls} onMouseDown={(e) => e.stopPropagation()}>
              {/* Close button - Red */}
              <button
                style={{
                  ...styles.macBtn,
                  background: hoveredControl === 'close' 
                    ? 'linear-gradient(135deg, #ff6b6b 0%, #ff5f5f 100%)' 
                    : 'linear-gradient(135deg, #ff5f5f 0%, #ee4d4d 100%)',
                  boxShadow: hoveredControl === 'close'
                    ? '0 0 12px rgba(255, 95, 95, 0.6), inset 0 1px 0 rgba(255,255,255,0.3)'
                    : '0 2px 6px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
                  transform: hoveredControl === 'close' ? 'scale(1.15)' : 'scale(1)',
                }}
                onClick={handleWindowClose}
                onMouseEnter={() => setHoveredControl('close')}
                onMouseLeave={() => setHoveredControl(null)}
                title="Close"
              >
                {hoveredControl === 'close' && <span style={styles.macBtnIcon}>×</span>}
              </button>
              
              {/* Minimize button - Yellow */}
              <button
                style={{
                  ...styles.macBtn,
                  background: hoveredControl === 'minimize'
                    ? 'linear-gradient(135deg, #ffda6b 0%, #ffc107 100%)'
                    : 'linear-gradient(135deg, #ffc107 0%, #e6ac00 100%)',
                  boxShadow: hoveredControl === 'minimize'
                    ? '0 0 12px rgba(255, 193, 7, 0.6), inset 0 1px 0 rgba(255,255,255,0.3)'
                    : '0 2px 6px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
                  transform: hoveredControl === 'minimize' ? 'scale(1.15)' : 'scale(1)',
                }}
                onClick={handleWindowMinimize}
                onMouseEnter={() => setHoveredControl('minimize')}
                onMouseLeave={() => setHoveredControl(null)}
                title="Minimize"
              >
                {hoveredControl === 'minimize' && <span style={styles.macBtnIcon}>−</span>}
              </button>
              
              {/* Maximize button - Green */}
              <button
                style={{
                  ...styles.macBtn,
                  background: hoveredControl === 'maximize'
                    ? 'linear-gradient(135deg, #6bff8e 0%, #28c940 100%)'
                    : 'linear-gradient(135deg, #28c940 0%, #1db636 100%)',
                  boxShadow: hoveredControl === 'maximize'
                    ? '0 0 12px rgba(40, 201, 64, 0.6), inset 0 1px 0 rgba(255,255,255,0.3)'
                    : '0 2px 6px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
                  transform: hoveredControl === 'maximize' ? 'scale(1.15)' : 'scale(1)',
                }}
                onClick={handleWindowMaximize}
                onMouseEnter={() => setHoveredControl('maximize')}
                onMouseLeave={() => setHoveredControl(null)}
                title={isMaximized ? 'Restore' : 'Maximize'}
              >
                {hoveredControl === 'maximize' && (
                  <span style={styles.macBtnIcon}>{isMaximized ? '⊖' : '+'}</span>
                )}
              </button>
            </div>
            
            {/* LOOM Title */}
            <div style={styles.titleGroup}>
              <span style={styles.titleIcon}>🔮</span>
              <span style={styles.titleText}>L O O M</span>
            </div>
          </div>
          
          {/* LLM Selectors - Far right */}
          <div style={styles.titleBarRight} onMouseDown={(e) => e.stopPropagation()}>
            {/* Chat LLM Selector */}
            <div style={styles.llmSelectorWrapper} ref={chatLLMMenuRef}>
              <button
                onClick={() => {
                  setShowChatLLMMenu(!showChatLLMMenu);
                  setShowGenerationLLMMenu(false);
                }}
                style={{
                  ...styles.llmBtnCompact,
                  borderColor: showChatLLMMenu ? 'rgba(0, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.12)',
                  background: showChatLLMMenu ? 'rgba(0, 255, 255, 0.08)' : 'transparent',
                }}
                title={`Chat LLM: ${getModelById(chatLLM)?.name || 'Auto'}`}
              >
                <span style={styles.llmBtnIconSmall}>💬</span>
                <span style={styles.llmBtnLabelDark}>{getModelById(chatLLM)?.name || 'Chat'}</span>
                <span style={styles.llmBtnArrowDark}>▾</span>
              </button>
              
              {showChatLLMMenu && (
                <div style={styles.llmMenuRight}>
                  <div style={styles.llmMenuTitle}>CHAT LLM</div>
                  <div style={styles.llmMenuScroll}>
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
                          <div style={styles.llmProviderLabel}>{providerLabels[provider]}</div>
                          {providerModels.map((model) => (
                            <button
                              key={model.id}
                              onClick={() => {
                                setChatLLM(model.id);
                                setShowChatLLMMenu(false);
                              }}
                              disabled={!model.available}
                              style={{
                                ...styles.llmMenuItem,
                                opacity: model.available ? 1 : 0.4,
                                background: chatLLM === model.id ? 'rgba(0, 255, 255, 0.15)' : 'transparent',
                                borderColor: chatLLM === model.id ? 'rgba(0, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.08)',
                              }}
                            >
                              <span style={styles.llmItemIcon}>{model.icon}</span>
                              <span style={styles.llmItemName}>{model.name}</span>
                              {chatLLM === model.id && <span style={styles.llmCheck}>✓</span>}
                              {!model.available && <span style={styles.llmUnavailable}>No key</span>}
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            
            {/* Generation LLM Selector */}
            <div style={styles.llmSelectorWrapper} ref={generationLLMMenuRef}>
              <button
                onClick={() => {
                  setShowGenerationLLMMenu(!showGenerationLLMMenu);
                  setShowChatLLMMenu(false);
                }}
                style={{
                  ...styles.llmBtnCompact,
                  borderColor: showGenerationLLMMenu ? 'rgba(255, 0, 255, 0.5)' : 'rgba(255, 255, 255, 0.12)',
                  background: showGenerationLLMMenu ? 'rgba(255, 0, 255, 0.08)' : 'transparent',
                }}
                title={`Generation LLM: ${getModelById(generationLLM)?.name || 'Auto'}`}
              >
                <span style={styles.llmBtnIconSmall}>✨</span>
                <span style={styles.llmBtnLabelDark}>{getModelById(generationLLM)?.name || 'Generate'}</span>
                <span style={styles.llmBtnArrowDark}>▾</span>
              </button>
              
              {showGenerationLLMMenu && (
                <div style={styles.llmMenuRight}>
                  <div style={styles.llmMenuTitle}>GENERATION LLM</div>
                  <div style={styles.llmMenuScroll}>
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
                          <div style={styles.llmProviderLabel}>{providerLabels[provider]}</div>
                          {providerModels.map((model) => (
                            <button
                              key={model.id}
                              onClick={() => {
                                setGenerationLLM(model.id);
                                setShowGenerationLLMMenu(false);
                              }}
                              disabled={!model.available}
                              style={{
                                ...styles.llmMenuItem,
                                opacity: model.available ? 1 : 0.4,
                                background: generationLLM === model.id ? 'rgba(255, 0, 255, 0.15)' : 'transparent',
                                borderColor: generationLLM === model.id ? 'rgba(255, 0, 255, 0.4)' : 'rgba(255, 255, 255, 0.08)',
                              }}
                            >
                              <span style={styles.llmItemIcon}>{model.icon}</span>
                              <span style={styles.llmItemName}>{model.name}</span>
                              {generationLLM === model.id && <span style={{...styles.llmCheck, color: '#ff66ff'}}>✓</span>}
                              {!model.available && <span style={styles.llmUnavailable}>No key</span>}
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
            {mountedSections.map(section => (
              <div
                key={section}
                style={{
                  ...styles.sectionWrapper,
                  display: section === activeSection ? 'flex' : 'none',
                }}
                aria-hidden={section === activeSection ? undefined : true}
              >
                {renderSectionContent(section)}
              </div>
            ))}
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
        
        @keyframes fadeInDown {
          from {
            opacity: 0;
            transform: translateY(-10px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
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
    gap: '8px',
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
  
  // Mac-style window controls
  macControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginRight: '20px',
  },
  macBtn: {
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
    position: 'relative' as const,
  },
  macBtnIcon: {
    fontSize: '10px',
    fontWeight: 'bold',
    color: 'rgba(0, 0, 0, 0.5)',
    lineHeight: 1,
  },
  
  // Title group (icon + text)
  titleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginRight: '20px',
  },
  
  // LLM Selectors
  llmSelectors: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  llmSelectorWrapper: {
    position: 'relative' as const,
    zIndex: 200,
  },
  llmBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 14px',
    background: 'rgba(0, 255, 255, 0.05)',
    border: '1px solid rgba(0, 255, 255, 0.25)',
    borderRadius: '10px',
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
    fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
    letterSpacing: '0.01em',
  },
  // Compact LLM button style for header bar (darker, matches history title font)
  llmBtnCompact: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
    fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  llmBtnIconSmall: {
    fontSize: '12px',
    opacity: 0.7,
  },
  llmBtnLabelDark: {
    maxWidth: '90px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontWeight: 500,
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.5)', // Darker font color
    fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
    letterSpacing: '0.01em',
  },
  llmBtnArrowDark: {
    fontSize: '8px',
    opacity: 0.4,
    marginLeft: '2px',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  llmBtnIcon: {
    fontSize: '13px',
  },
  llmBtnLabel: {
    maxWidth: '100px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontWeight: 500,
  },
  llmBtnArrow: {
    fontSize: '9px',
    opacity: 0.5,
    marginLeft: '2px',
  },
  llmMenu: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    marginTop: '8px',
    background: 'rgba(12, 12, 24, 0.98)',
    backdropFilter: 'blur(24px)',
    borderRadius: '12px',
    border: '1px solid rgba(0, 255, 255, 0.3)',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), 0 0 60px rgba(0, 255, 255, 0.1)',
    padding: '8px',
    minWidth: '200px',
    animation: 'fadeInDown 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  // Right-aligned dropdown menu (opens downward to the left)
  llmMenuRight: {
    position: 'absolute' as const,
    top: '100%',
    right: 0,
    marginTop: '8px',
    background: 'rgba(12, 12, 24, 0.98)',
    backdropFilter: 'blur(24px)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
    padding: '8px',
    minWidth: '200px',
    animation: 'fadeInDown 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
    zIndex: 300,
  },
  llmMenuTitle: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '1px',
    padding: '6px 10px 4px',
    textTransform: 'uppercase' as const,
  },
  llmMenuScroll: {
    maxHeight: '280px',
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
  },
  llmProviderLabel: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: '8px',
    fontWeight: 700,
    letterSpacing: '1px',
    padding: '8px 10px 4px',
    textTransform: 'uppercase' as const,
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    marginTop: '4px',
  },
  llmMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '8px 10px',
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
    textAlign: 'left' as const,
  },
  llmItemIcon: {
    fontSize: '13px',
  },
  llmItemName: {
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 500,
    flex: 1,
  },
  llmCheck: {
    color: '#00ffff',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  llmUnavailable: {
    color: 'rgba(255, 100, 100, 0.7)',
    fontSize: '9px',
    fontStyle: 'italic' as const,
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
  sectionWrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
};

