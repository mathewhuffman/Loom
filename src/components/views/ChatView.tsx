/**
 * CHAT VIEW — Summon anything into existence or just converse with AI
 * Main AI chat interface for generating glyphs OR having conversations
 * 
 * Features:
 * - Create new glyphs with "summon" intent
 * - Chat with AI without creating anything
 * - API key selection for glyph generation
 * - Streaming responses with code preview
 * - Collapsible chat history sidebar with goopy animations
 * - Inline glyph preview embeds with hover-reveal title bar
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { ChatMessage, ChatConversation, ChatGlyphAttachment, ChatMode } from '../../types/ui-state';

// ═══════════════════════════════════════════════════════════════════════════
// 🔮 SUMMON MESSAGE — Generating box that transforms into glyph preview
// ═══════════════════════════════════════════════════════════════════════════

interface SummonMessageProps {
  isGenerating: boolean;
  glyphEmbed?: {
    code: string;
    glyphId: string;
    glyphName: string;
  } | null;
  onOpenEditor: (glyphId: string, code: string) => void;
}

function SummonMessage({ isGenerating, glyphEmbed, onOpenEditor }: SummonMessageProps) {
  // Initialize phase based on current state - if we have embed and not generating, start complete
  // This prevents animation flash when loading from history
  const [phase, setPhase] = useState<'generating' | 'transitioning' | 'complete'>(() => {
    if (glyphEmbed && !isGenerating) return 'complete';
    return 'generating';
  });
  const [isHovered, setIsHovered] = useState(false);
  const [isTitleHovered, setIsTitleHovered] = useState(false);
  const blobUrlRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasTransitionedRef = useRef(glyphEmbed && !isGenerating); // Track if we've already shown the embed

  // Handle phase transitions with goopy animation timing
  useEffect(() => {
    if (glyphEmbed && !isGenerating) {
      // If we're coming from generating state, do the goopy transition
      if (!hasTransitionedRef.current) {
        hasTransitionedRef.current = true;
        setPhase('transitioning');
        
        // After the scale-up animation, show the complete state
        const timer = setTimeout(() => {
          setPhase('complete');
        }, 600); // Match the animation duration
        
        return () => clearTimeout(timer);
      } else {
        // Already transitioned or loaded from history - just show complete
        setPhase('complete');
      }
    } else if (isGenerating) {
      hasTransitionedRef.current = false;
      setPhase('generating');
    }
  }, [glyphEmbed, isGenerating]);

  // Create blob URL for iframe when we have code
  useEffect(() => {
    if (glyphEmbed?.code) {
      const blob = new Blob([glyphEmbed.code], { type: 'text/html' });
      blobUrlRef.current = URL.createObjectURL(blob);
      
      return () => {
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }
      };
    }
  }, [glyphEmbed?.code]);

  // Determine animation class based on phase
  const getContainerStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      position: 'relative',
      width: '100%',
      maxWidth: phase === 'generating' ? '400px' : '500px',
      borderRadius: '16px',
      overflow: 'hidden',
      background: phase === 'generating' 
        ? 'linear-gradient(135deg, rgba(255, 0, 255, 0.08) 0%, rgba(0, 255, 255, 0.08) 100%)'
        : 'rgba(8, 8, 18, 0.95)',
      border: phase === 'generating'
        ? '1px solid rgba(255, 0, 255, 0.25)'
        : '1px solid rgba(0, 255, 255, 0.3)',
      boxShadow: phase === 'complete'
        ? '0 12px 48px rgba(0, 0, 0, 0.5), 0 0 60px rgba(0, 255, 255, 0.1)'
        : '0 8px 32px rgba(0, 0, 0, 0.3)',
    };

    if (phase === 'transitioning') {
      return {
        ...baseStyle,
        animation: 'goopyExpand 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      };
    }

    return baseStyle;
  };

  // Generating state
  if (phase === 'generating') {
    return (
      <div ref={containerRef} style={getContainerStyle()}>
        <div style={summonStyles.generatingContent}>
          <div style={summonStyles.generatingOrb}>
            <span style={summonStyles.generatingOrbInner}>🔮</span>
          </div>
          <div style={summonStyles.generatingTextContainer}>
            <span style={summonStyles.generatingTitle}>Generating</span>
            <span style={summonStyles.generatingDots}>
              <span className="dot dot1">.</span>
              <span className="dot dot2">.</span>
              <span className="dot dot3">.</span>
            </span>
          </div>
          <div style={summonStyles.generatingSubtext}>
            Manifesting your creation...
          </div>
        </div>
        
        {/* Animated gradient border */}
        <div style={summonStyles.animatedBorder} />
      </div>
    );
  }

  // Transitioning or Complete state - show the preview
  return (
    <div 
      ref={containerRef}
      style={getContainerStyle()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Hover-reveal title bar - drops down from top */}
      <div 
        style={{
          ...summonStyles.titleBar,
          transform: isHovered ? 'translateY(0)' : 'translateY(-100%)',
          opacity: isHovered ? 1 : 0,
        }}
        onMouseEnter={() => setIsTitleHovered(true)}
        onMouseLeave={() => setIsTitleHovered(false)}
      >
        <div style={summonStyles.titleBarContent}>
          <span style={summonStyles.glyphIcon}>✨</span>
          <span style={summonStyles.glyphName}>{glyphEmbed?.glyphName || 'Unnamed Glyph'}</span>
        </div>
        <button
          onClick={() => glyphEmbed && onOpenEditor(glyphEmbed.glyphId, glyphEmbed.code)}
          style={{
            ...summonStyles.openEditorBtn,
            background: isTitleHovered 
              ? 'rgba(0, 255, 255, 0.25)' 
              : 'rgba(0, 255, 255, 0.15)',
            transform: isTitleHovered ? 'scale(1.05)' : 'scale(1)',
          }}
        >
          <span style={summonStyles.editorIcon}>⌨️</span>
          <span>Open Editor</span>
        </button>
      </div>

      {/* Glyph preview iframe */}
      <div style={{
        ...summonStyles.iframeWrapper,
        opacity: phase === 'complete' ? 1 : 0,
        transition: 'opacity 0.4s ease 0.3s',
      }}>
        {blobUrlRef.current && (
          <iframe
            src={blobUrlRef.current}
            style={summonStyles.iframe}
            sandbox="allow-scripts allow-same-origin"
            title={`Glyph: ${glyphEmbed?.glyphName}`}
          />
        )}
        
        {/* Subtle overlay that shows on hover */}
        <div 
          style={{
            ...summonStyles.hoverOverlay,
            opacity: isHovered ? 1 : 0,
          }}
        />
      </div>

      {/* Success celebration particles */}
      {phase === 'transitioning' && (
        <div style={summonStyles.celebrationContainer}>
          <div className="particle p1">✨</div>
          <div className="particle p2">🔮</div>
          <div className="particle p3">⚡</div>
          <div className="particle p4">💫</div>
        </div>
      )}

      {/* Bottom glow accent */}
      <div style={{
        ...summonStyles.bottomGlow,
        opacity: phase === 'complete' ? (isHovered ? 0.8 : 0.5) : 0,
      }} />
    </div>
  );
}

// Summon message specific styles
const summonStyles: Record<string, React.CSSProperties> = {
  generatingContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 24px',
    gap: '16px',
  },
  generatingOrb: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(255, 0, 255, 0.3) 0%, rgba(0, 255, 255, 0.2) 50%, transparent 70%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'orbPulse 2s ease-in-out infinite',
    boxShadow: '0 0 40px rgba(255, 0, 255, 0.3), 0 0 80px rgba(0, 255, 255, 0.2)',
  },
  generatingOrbInner: {
    fontSize: '28px',
    animation: 'orbSpin 3s linear infinite',
    filter: 'drop-shadow(0 0 12px rgba(255, 0, 255, 0.8))',
  },
  generatingTextContainer: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '2px',
  },
  generatingTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: 'rgba(255, 255, 255, 0.95)',
    fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
    letterSpacing: '0.02em',
  },
  generatingDots: {
    display: 'flex',
    gap: '2px',
    fontSize: '18px',
    color: '#ff00ff',
    fontWeight: 700,
  },
  generatingSubtext: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.4)',
    fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
    letterSpacing: '0.03em',
  },
  animatedBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: '16px',
    border: '2px solid transparent',
    background: 'linear-gradient(90deg, rgba(255,0,255,0.5), rgba(0,255,255,0.5), rgba(255,0,255,0.5)) border-box',
    WebkitMask: 'linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)',
    WebkitMaskComposite: 'xor',
    maskComposite: 'exclude',
    animation: 'borderRotate 2s linear infinite',
    pointerEvents: 'none',
  },
  titleBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: 'linear-gradient(180deg, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.8) 100%)',
    backdropFilter: 'blur(16px)',
    borderBottom: '1px solid rgba(0, 255, 255, 0.25)',
    transition: 'transform 0.5s cubic-bezier(0.68, -0.15, 0.32, 1.15), opacity 0.3s ease',
  },
  titleBarContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  glyphIcon: {
    fontSize: '16px',
    filter: 'drop-shadow(0 0 6px rgba(255, 0, 255, 0.5))',
  },
  glyphName: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.9)',
    fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
    letterSpacing: '0.02em',
  },
  openEditorBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 14px',
    background: 'rgba(0, 255, 255, 0.15)',
    border: '1px solid rgba(0, 255, 255, 0.4)',
    borderRadius: '10px',
    color: '#00ffff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
    transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
    boxShadow: '0 2px 12px rgba(0, 255, 255, 0.2)',
  },
  editorIcon: {
    fontSize: '14px',
  },
  iframeWrapper: {
    position: 'relative',
    width: '100%',
    height: '300px',
    background: '#0a0a14',
    overflow: 'hidden',
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
    background: '#0a0a14',
  },
  hoverOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'linear-gradient(180deg, rgba(0, 255, 255, 0.05) 0%, transparent 30%)',
    pointerEvents: 'none',
    transition: 'opacity 0.4s ease',
  },
  celebrationContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
    overflow: 'hidden',
  },
  bottomGlow: {
    position: 'absolute',
    bottom: 0,
    left: '10%',
    right: '10%',
    height: '3px',
    background: 'linear-gradient(90deg, transparent, #00ffff, #ff00ff, #00ffff, transparent)',
    borderRadius: '3px',
    filter: 'blur(1px)',
    transition: 'opacity 0.6s ease',
  },
};

interface GlyphAttachmentBubbleProps {
  attachment: ChatGlyphAttachment;
  align: 'left' | 'right';
  onRemove?: () => void;
}

function GlyphAttachmentBubble({ attachment, align, onRemove }: GlyphAttachmentBubbleProps) {
  const blobUrlRef = useRef<string | null>(null);
  const attachedTimestamp = attachment.attachedAt || Date.now();

  useEffect(() => {
    if (attachment.previewHtml) {
      const blob = new Blob([attachment.previewHtml], { type: 'text/html' });
      blobUrlRef.current = URL.createObjectURL(blob);
      return () => {
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }
      };
    }
    return () => undefined;
  }, [attachment.previewHtml]);

  const cardStyles = align === 'right'
    ? { ...styles.attachmentCard, ...styles.attachmentCardRight }
    : { ...styles.attachmentCard, ...styles.attachmentCardLeft };

  return (
    <div style={cardStyles}>
      <div style={styles.attachmentHeader}>
        <span style={styles.attachmentIcon}>{attachment.icon || '🌀'}</span>
        <span style={styles.attachmentName}>{attachment.name || attachment.glyphId}</span>
        {onRemove && (
          <button
            onClick={onRemove}
            style={styles.attachmentRemoveBtn}
            title="Remove attachment"
          >
            ✕
          </button>
        )}
      </div>
      <div style={styles.attachmentPreview}>
        {blobUrlRef.current ? (
          <iframe
            src={blobUrlRef.current}
            style={styles.attachmentIframe}
            sandbox="allow-scripts allow-same-origin"
            title={`Glyph attachment: ${attachment.name}`}
          />
        ) : (
          <div style={styles.attachmentPlaceholder}>Glyph preview unavailable</div>
        )}
        <div style={styles.attachmentGlow} />
      </div>
      <div style={styles.attachmentFooter}>
        Shared glyph • {new Date(attachedTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}

interface AttachmentPanelProps {
  title: string;
  attachments: ChatGlyphAttachment[];
  allowRemove?: boolean;
  onRemove?: (attachmentId: string) => void;
  onClose: () => void;
  panelRef?: React.RefObject<HTMLDivElement>;
  styleOverride?: React.CSSProperties;
}

function AttachmentPanel({
  title,
  attachments,
  allowRemove,
  onRemove,
  onClose,
  panelRef,
  styleOverride,
}: AttachmentPanelProps) {
  return (
    <div style={{ ...styles.attachmentPanel, ...styleOverride }} ref={panelRef ?? undefined}>
      <div style={styles.attachmentPanelHeader}>
        <span style={styles.attachmentPanelTitle}>{title}</span>
        <button style={styles.attachmentPanelClose} onClick={onClose}>×</button>
      </div>
      {attachments.length === 0 ? (
        <div style={styles.glyphPickerEmpty}>No glyphs attached</div>
      ) : (
        <div style={styles.attachmentPanelList}>
          {attachments.map((attachment) => (
            <GlyphAttachmentBubble
              key={attachment.attachmentId || `${attachment.glyphId}-${attachment.attachedAt || 'attachment'}`}
              attachment={attachment}
              align="left"
              onRemove={
                allowRemove && attachment.attachmentId && onRemove
                  ? () => onRemove(attachment.attachmentId!)
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface StoredKey {
  id: string;
  name: string;
  category?: string;
}

interface ChatViewProps {
  onGlyphCreated?: (glyphId: string, streamingCode: string) => void;
  chatLLM?: string;       // LLM for chat conversations (from LoomPanel)
  generationLLM?: string; // LLM for glyph generation (from LoomPanel)
  chatMode?: ChatMode;
  onChatModeChange?: (mode: ChatMode) => void;
}

interface GlyphManifestSummary {
  id: string;
  name: string;
  icon?: string;
  type?: string;
  entry?: string;
  files?: string[];
  prompt?: string;
}

const MAX_HISTORY_MESSAGES_TO_SEND = 40;

// Helper to get relative time string
function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function ChatView({ onGlyphCreated, chatLLM, generationLLM, chatMode: controlledChatMode, onChatModeChange }: ChatViewProps) {
  // Chat history state
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  
  // Message state for current conversation
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  // Use LLM props from LoomPanel, fallback to grok
  const selectedChatModel = chatLLM || 'grok';
  const selectedGenerationModel = generationLLM || 'grok';
  const isChatModeControlled = typeof controlledChatMode !== 'undefined';
  const [internalChatMode, setInternalChatMode] = useState<ChatMode>(controlledChatMode ?? 'summon');
  const chatMode = isChatModeControlled ? (controlledChatMode as ChatMode) : internalChatMode;
  
  useEffect(() => {
    if (typeof controlledChatMode !== 'undefined') {
      setInternalChatMode(controlledChatMode);
    }
  }, [controlledChatMode]);

  const handleChatModeChange = useCallback((mode: ChatMode) => {
    if (!isChatModeControlled) {
      setInternalChatMode(mode);
    }
    onChatModeChange?.(mode);
  }, [isChatModeControlled, onChatModeChange]);

  // API Key selection
  const [availableKeys, setAvailableKeys] = useState<StoredKey[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [showKeysMenu, setShowKeysMenu] = useState(false);
  const [availableGlyphs, setAvailableGlyphs] = useState<GlyphManifestSummary[]>([]);
  const [glyphPickerOpen, setGlyphPickerOpen] = useState(false);
  const [glyphPickerLoading, setGlyphPickerLoading] = useState(false);
  const [glyphSearch, setGlyphSearch] = useState('');
  const [glyphAttachError, setGlyphAttachError] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<ChatGlyphAttachment[]>([]);
  const [openAttachmentContext, setOpenAttachmentContext] = useState<{ type: 'pending' | 'message'; messageId?: string } | null>(null);
  
  // Hover state for history items
  const [hoveredConversationId, setHoveredConversationId] = useState<string | null>(null);
  const filteredGlyphs = useMemo(() => {
    const query = glyphSearch.trim().toLowerCase();
    if (!query) return availableGlyphs;
    return availableGlyphs.filter((glyph) => {
      const haystacks = [
        glyph.name || '',
        glyph.id || '',
        glyph.type || '',
        glyph.prompt || '',
      ];
      return haystacks.some(str => str.toLowerCase().includes(query));
    });
  }, [availableGlyphs, glyphSearch]);

  const hasInputText = input.trim().length > 0;
  const hasAttachments = pendingAttachments.length > 0;
  const submitEnabled = (hasInputText || hasAttachments) && !isGenerating;
  
  // Debug: log whenever conversations or messages change
  useEffect(() => {
    console.log('[ChatView] 📊 Conversations state updated:', {
      count: conversations.length,
      ids: conversations.map(c => c.id),
      activeId: activeConversationId,
    });
  }, [conversations, activeConversationId]);
  
  // Debug: log whenever messages change
  useEffect(() => {
    console.log('[ChatView] 💬 Messages state updated:', {
      count: messages.length,
      messageIds: messages.map(m => m.id),
      firstMsg: messages[0]?.content?.slice(0, 50),
      lastMsg: messages[messages.length - 1]?.content?.slice(0, 50),
    });
  }, [messages]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const keysMenuRef = useRef<HTMLDivElement>(null);
  const glyphPickerRef = useRef<HTMLDivElement>(null);
  const attachmentPanelRef = useRef<HTMLDivElement>(null);
  const inlineToolsRef = useRef<HTMLDivElement>(null);
  const currentStreamingIdRef = useRef<string | null>(null);
  const lastBundleIdRef = useRef<string | null>(null);
  const activeConversationIdRef = useRef<string | null>(null); // Sync ref for IPC callbacks
  const glyphsLoadedRef = useRef(false);
  const streamingConversationIdRef = useRef<string | null>(null);
  
  // Keep ref in sync with state
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const updateMessagesForConversation = useCallback((
    conversationId: string | null,
    updater: (messages: ChatMessage[]) => ChatMessage[]
  ) => {
    if (!conversationId) return;

    if (activeConversationIdRef.current === conversationId) {
      setMessages(prev => updater([...prev]));
    }

    setConversations(prev => prev.map(conv => {
      if (conv.id !== conversationId) {
        return conv;
      }
      const baseMessages = conv.messages ? [...conv.messages] : [];
      return {
        ...conv,
        messages: updater(baseMessages),
        updatedAt: Date.now(),
      };
    }));
  }, [setConversations, setMessages]);

  // Load chat history on mount
  useEffect(() => {
    const loadHistory = async () => {
      console.log('[ChatView] 📜 Loading chat history...');
      console.log('[ChatView] window.loom exists:', !!window.loom);
      console.log('[ChatView] loadChatHistory available:', !!window.loom?.loadChatHistory);
      
      if (window.loom?.loadChatHistory) {
        try {
          const history = await window.loom.loadChatHistory();
          console.log('[ChatView] 📜 Loaded history:', {
            conversationCount: history?.conversations?.length || 0,
            activeId: history?.activeConversationId,
            raw: history,
          });
          
          if (history && history.conversations) {
            setConversations(history.conversations);
            
            // Set active conversation if there is one
            if (history.activeConversationId) {
              setActiveConversationId(history.activeConversationId);
              activeConversationIdRef.current = history.activeConversationId; // Update ref immediately
              const activeConv = history.conversations.find((c: ChatConversation) => c.id === history.activeConversationId);
              if (activeConv && activeConv.messages && activeConv.messages.length > 0) {
                console.log('[ChatView] 📜 Restored active conversation:', activeConv.id, 'with', activeConv.messages.length, 'messages');
                // Create a new array to ensure React detects the change
                setMessages([...activeConv.messages]);
              } else {
                console.log('[ChatView] 📜 Active conversation has no messages');
                setMessages([]);
              }
            } else {
              console.log('[ChatView] 📜 No active conversation ID in history');
            }
          } else {
            console.log('[ChatView] 📜 No history data returned');
          }
          setIsHistoryLoaded(true);
        } catch (err) {
          console.error('[ChatView] ❌ Failed to load history:', err);
          setIsHistoryLoaded(true);
        }
      } else {
        console.warn('[ChatView] ⚠️ loadChatHistory not available on window.loom - IPC not ready');
        console.warn('[ChatView] ⚠️ Available loom methods:', window.loom ? Object.keys(window.loom) : 'window.loom is undefined');
        setIsHistoryLoaded(true);
      }
    };
    
    // Load immediately - IPC should be ready since we're in an Electron renderer
    loadHistory();
  }, []);

  // Load available keys
  useEffect(() => {
    const loadKeys = async () => {
      if (window.loom?.getStoredKeys) {
        try {
          const keys = await window.loom.getStoredKeys();
          setAvailableKeys(keys.map((k: any) => ({ id: k.id, name: k.name, category: k.category })));
        } catch (err) {
          console.error('[ChatView] Failed to load keys:', err);
        }
      }
    };
    loadKeys();
    if (showKeysMenu) loadKeys();
  }, [showKeysMenu]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (keysMenuRef.current && !keysMenuRef.current.contains(e.target as Node)) {
        setShowKeysMenu(false);
      }
      if (glyphPickerRef.current && !glyphPickerRef.current.contains(e.target as Node)) {
        setGlyphPickerOpen(false);
      }
      if (
        attachmentPanelRef.current &&
        !attachmentPanelRef.current.contains(e.target as Node) &&
        (!inlineToolsRef.current || !inlineToolsRef.current.contains(e.target as Node))
      ) {
        setOpenAttachmentContext(prev => (prev?.type === 'pending' ? null : prev));
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!glyphPickerOpen || glyphsLoadedRef.current) return;
    const loadGlyphs = async () => {
      if (!window.loom?.loadGlyphs) return;
      setGlyphPickerLoading(true);
      setGlyphAttachError(null);
      try {
        const glyphs = await window.loom.loadGlyphs();
        setAvailableGlyphs(Array.isArray(glyphs) ? glyphs : []);
        glyphsLoadedRef.current = true;
      } catch (err) {
        console.error('[ChatView] ❌ Failed to load glyphs:', err);
        setGlyphAttachError('Failed to load glyphs');
      } finally {
        setGlyphPickerLoading(false);
      }
    };
    loadGlyphs();
  }, [glyphPickerOpen]);

  useEffect(() => {
    setPendingAttachments([]);
  setOpenAttachmentContext(prev => (prev?.type === 'pending' ? null : prev));
  }, [activeConversationId]);

useEffect(() => {
  if (!glyphPickerOpen && !openAttachmentContext) return;
  const handleEsc = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (glyphPickerOpen) setGlyphPickerOpen(false);
      if (openAttachmentContext) setOpenAttachmentContext(null);
    }
  };
  window.addEventListener('keydown', handleEsc);
  return () => window.removeEventListener('keydown', handleEsc);
}, [glyphPickerOpen, openAttachmentContext]);

  // Handle key toggle
  const handleKeyToggle = useCallback((keyId: string) => {
    setSelectedKeys(prev => 
      prev.includes(keyId) 
        ? prev.filter(id => id !== keyId)
        : [...prev, keyId]
    );
  }, []);

  const handleRemoveAttachment = useCallback((attachmentId: string) => {
    setPendingAttachments(prev => {
      const next = prev.filter(att => att.attachmentId !== attachmentId);
      if (next.length === 0 && openAttachmentContext?.type === 'pending') {
        setOpenAttachmentContext(null);
      }
      return next;
    });
  }, [openAttachmentContext]);

  const handleAttachGlyph = useCallback(async (glyph: GlyphManifestSummary) => {
    if (!glyph?.id) return;
    if (!window.loom?.readGlyphFile) {
      setGlyphAttachError('Glyph file API unavailable');
      return;
    }
    setGlyphAttachError(null);
    setGlyphPickerLoading(true);
    try {
      const filesToLoad = Array.isArray(glyph.files) && glyph.files.length > 0
        ? glyph.files.filter(file => file !== 'manifest.json')
        : ['index.html'];
      const files: Record<string, string> = {};
      for (const fileName of filesToLoad) {
        try {
          const content = await window.loom.readGlyphFile(glyph.id, fileName);
          files[fileName] = content;
        } catch (err) {
          console.error('[ChatView] ⚠️ Failed to read glyph file:', glyph.id, fileName, err);
        }
      }
      if (Object.keys(files).length === 0) {
        throw new Error('No glyph files could be read');
      }
      const entryFile = glyph.entry || 'index.html';
      const previewHtml = files[entryFile] || Object.values(files)[0];
      const payloadManifest = {
        ...glyph,
        files: Object.keys(files),
      };
      const payloadSections = [
        '<<<MANIFEST>>>',
        JSON.stringify(payloadManifest, null, 2),
        '<<<END_MANIFEST>>>',
        ...Object.entries(files).map(([fileName, content]) => 
          `<<<FILE:${fileName}>>>\n${content}\n<<<END_FILE>>>`
        ),
        '<<<END>>>',
      ];
      const attachment: ChatGlyphAttachment = {
        attachmentId: `attach-${glyph.id}-${Date.now()}`,
        glyphId: glyph.id,
        name: glyph.name || glyph.id,
        icon: glyph.icon,
        previewHtml,
        llmPayload: payloadSections.join('\n'),
        attachedAt: Date.now(),
      };
      setPendingAttachments(prev => [...prev, attachment]);
      setGlyphPickerOpen(false);
      setGlyphSearch('');
    } catch (err) {
      console.error('[ChatView] ❌ Failed to attach glyph:', err);
      setGlyphAttachError('Failed to attach glyph');
    } finally {
      setGlyphPickerLoading(false);
    }
  }, []);

  const toggleAttachmentPanel = useCallback((context: { type: 'pending' | 'message'; messageId?: string }) => {
    setOpenAttachmentContext(prev => {
      if (prev && prev.type === context.type && prev.messageId === context.messageId) {
        return null;
      }
      return context;
    });
  }, []);

  // Create a new conversation
  const handleNewChat = useCallback(async () => {
    console.log('[ChatView] ✨ Creating new conversation...');
    console.log('[ChatView] createConversation available:', !!window.loom?.createConversation);
    
    if (window.loom?.createConversation) {
      try {
        const newConv = await window.loom.createConversation();
        console.log('[ChatView] ✨ Created conversation:', newConv.id);
        setConversations(prev => [newConv, ...prev]);
        setActiveConversationId(newConv.id);
        activeConversationIdRef.current = newConv.id; // Update ref immediately
        setMessages([]);
        inputRef.current?.focus();
      } catch (err) {
        console.error('[ChatView] ❌ Failed to create conversation:', err);
      }
    } else {
      console.warn('[ChatView] ⚠️ createConversation not available');
    }
  }, []);

  // Switch to a conversation
  const handleSelectConversation = useCallback(async (conversationId: string) => {
    const conv = conversations.find(c => c.id === conversationId);
    if (conv) {
      setActiveConversationId(conversationId);
      activeConversationIdRef.current = conversationId; // Update ref immediately
      setMessages(conv.messages || []);
      
      // Update active in storage
      if (window.loom?.setActiveConversation) {
        await window.loom.setActiveConversation(conversationId);
      }
    }
  }, [conversations]);

  // Delete a conversation
  const handleDeleteConversation = useCallback(async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    
    if (window.loom?.deleteConversation) {
      try {
        await window.loom.deleteConversation(conversationId);
        setConversations(prev => prev.filter(c => c.id !== conversationId));
        
        // If we deleted the active conversation, switch to the next one
        if (activeConversationId === conversationId) {
          const remaining = conversations.filter(c => c.id !== conversationId);
          if (remaining.length > 0) {
            handleSelectConversation(remaining[0].id);
          } else {
            setActiveConversationId(null);
            setMessages([]);
          }
        }
      } catch (err) {
        console.error('[ChatView] Failed to delete conversation:', err);
      }
    }
  }, [activeConversationId, conversations, handleSelectConversation]);

  // Handle submit
  const handleSubmit = useCallback(async () => {
    if ((input.trim().length === 0 && pendingAttachments.length === 0) || isGenerating) return;

    console.log('[ChatView] 📤 Submitting message...');
    console.log('[ChatView] Active conversation:', activeConversationId);
    
    // Create conversation if none exists
    let convId = activeConversationId;
    if (!convId) {
      console.log('[ChatView] 📝 No active conversation, creating new one...');
      console.log('[ChatView] createConversation available:', !!window.loom?.createConversation);
      
      if (window.loom?.createConversation) {
        try {
          const newConv = await window.loom.createConversation();
          console.log('[ChatView] ✅ Created conversation:', newConv.id);
          setConversations(prev => [newConv, ...prev]);
          convId = newConv.id;
          setActiveConversationId(convId);
          // IMPORTANT: Update ref immediately so IPC callbacks have correct ID
          activeConversationIdRef.current = convId;
        } catch (err) {
          console.error('[ChatView] ❌ Failed to create conversation:', err);
          return;
        }
      } else {
        console.warn('[ChatView] ⚠️ createConversation not available - messages will not persist');
      }
    }

    if (!convId) {
      console.error('[ChatView] ❌ Unable to determine conversation ID for submission');
      return;
    }

    const attachmentsForMessage = pendingAttachments.map(att => ({ ...att }));

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
      isSummoning: chatMode === 'summon',
      glyphAttachments: attachmentsForMessage.length > 0 ? attachmentsForMessage : undefined,
    };

    const historyForRequest = (() => {
      const combined = [...messages, userMessage];
      const trimmed = combined.slice(-MAX_HISTORY_MESSAGES_TO_SEND);
      return trimmed
        .filter(msg => {
          if (msg.isSummoning && msg.role === 'assistant' && msg.glyphEmbed?.code) {
            return true;
          }
          if (msg.glyphAttachments && msg.glyphAttachments.length > 0) {
            return true;
          }
          return !!msg.content && msg.content.trim().length > 0;
        })
        .map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          isSummoning: msg.isSummoning,
          glyphId: msg.glyphId,
          glyphEmbed: msg.glyphEmbed ? { ...msg.glyphEmbed } : undefined,
          glyphAttachments: msg.glyphAttachments
            ? msg.glyphAttachments.map(att => ({ ...att }))
            : undefined,
        }));
    })();

    // Add to local state
    updateMessagesForConversation(convId, msgs => [...msgs, userMessage]);
    setInput('');
    setPendingAttachments([]);
    if (openAttachmentContext?.type === 'pending') {
      setOpenAttachmentContext(null);
    }
    setIsGenerating(true);

    // Persist message
    if (convId && window.loom?.addMessageToConversation) {
      console.log('[ChatView] 💾 Persisting user message to conversation:', convId);
      try {
        const updatedConv = await window.loom.addMessageToConversation(convId, userMessage);
        console.log('[ChatView] ✅ Message persisted, conversation now has', updatedConv?.messages?.length, 'messages');
        
        // Update metadata (like auto-titled conversation) without disrupting streaming state
        setConversations(prev => prev.map(c => 
          c.id === convId 
            ? { ...c, title: updatedConv?.title || c.title, updatedAt: Date.now() }
            : c
        ));
      } catch (err) {
        console.error('[ChatView] ❌ Failed to persist message:', err);
      }
    } else {
      console.warn('[ChatView] ⚠️ Cannot persist message:', { convId, hasAddMessage: !!window.loom?.addMessageToConversation });
    }

    // Add streaming placeholder
    const assistantId = `msg-${Date.now()}-assistant`;
    currentStreamingIdRef.current = assistantId;
    
    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isSummoning: chatMode === 'summon',
    };
    
    updateMessagesForConversation(convId, msgs => [...msgs, assistantPlaceholder]);
    streamingConversationIdRef.current = convId;

    if (chatMode === 'summon') {
      console.log('[ChatView] 🔮 Starting summon request:', userMessage.content, '(model:', selectedGenerationModel, ')');
      if (window.loom?.summonRequest) {
        window.loom.summonRequest(
          userMessage.content, 
          selectedGenerationModel, 
          selectedKeys.length > 0 ? selectedKeys : undefined
        );
      } else {
        console.error('[ChatView] summonRequest not available!');
        updateMessagesForConversation(convId, msgs => 
          msgs.map(msg => 
            msg.id === assistantId && msg.isSummoning
              ? { ...msg, content: '❌ Summon API not available' }
              : msg
          )
        );
        setIsGenerating(false);
        streamingConversationIdRef.current = null;
        currentStreamingIdRef.current = null;
      }
    } else {
      console.log('[ChatView] 💬 Starting chat request:', userMessage.content, '(model:', selectedChatModel, ')');
      if (window.loom?.chatRequest) {
        window.loom.chatRequest(userMessage.content, selectedChatModel, historyForRequest);
      } else {
        console.error('[ChatView] chatRequest not available!');
        updateMessagesForConversation(convId, msgs => 
          msgs.map(msg => 
            msg.id === assistantId && !msg.isSummoning
              ? { ...msg, content: '❌ Chat API not available' }
              : msg
          )
        );
        setIsGenerating(false);
        streamingConversationIdRef.current = null;
        currentStreamingIdRef.current = null;
      }
    }
  }, [input, pendingAttachments, isGenerating, selectedChatModel, selectedGenerationModel, chatMode, selectedKeys, activeConversationId, messages, openAttachmentContext]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    };
    
    const textarea = inputRef.current;
    textarea?.addEventListener('keydown', handleKeyDown);
    return () => textarea?.removeEventListener('keydown', handleKeyDown);
  }, [handleSubmit]);

  // Setup IPC listeners for streaming
  useEffect(() => {
    if (!window.loom) return;

    const handleSummonChunk = (data: { fullCode: string }) => {
      const convId = streamingConversationIdRef.current;
      const assistantId = currentStreamingIdRef.current;
      if (!convId || !assistantId) return;

      updateMessagesForConversation(convId, msgs => 
        msgs.map(msg => 
          msg.id === assistantId && msg.isSummoning
            ? { ...msg, content: data.fullCode }
            : msg
        )
      );
    };

    const handleSummonComplete = async (data: { 
      code: string; 
      type?: string; 
      attempt?: number;
      bundle?: { id: string; name: string; type?: string; locations: string[] } | null;
    }) => {
      console.log('[ChatView] ✅ summon-complete', { 
        codeLength: data.code?.length, 
        bundleId: data.bundle?.id 
      });
      
      const assistantId = currentStreamingIdRef.current;
      const convId = streamingConversationIdRef.current;
      if (!assistantId || !convId) return;
      
      // Update the assistant message with the glyph embed data
      // The SummonMessage component will handle the goopy transition
      if (data.bundle?.id && data.bundle.id !== lastBundleIdRef.current) {
        lastBundleIdRef.current = data.bundle.id;
        
        updateMessagesForConversation(convId, msgs => 
          msgs.map(msg => 
            msg.id === assistantId && msg.isSummoning
              ? { 
                  ...msg, 
                  content: data.code, 
                  glyphId: data.bundle?.id,
                  glyphEmbed: {
                    code: data.code,
                    glyphId: data.bundle!.id,
                    glyphName: data.bundle!.name || 'Unnamed Glyph',
                  },
                }
              : msg
          )
        );
      } else {
        // No bundle, just update content
        updateMessagesForConversation(convId, msgs => 
          msgs.map(msg => 
            msg.id === assistantId && msg.isSummoning
              ? { ...msg, content: data.code, glyphId: data.bundle?.id }
              : msg
          )
        );
      }
      
      setIsGenerating(false);
      
      // Persist assistant message to the conversation that initiated the stream
      console.log('[ChatView] 💾 Persisting assistant message to:', convId);
      if (window.loom?.addMessageToConversation) {
        try {
          await window.loom.addMessageToConversation(convId, {
            id: assistantId,
            role: 'assistant',
            content: data.code,
            timestamp: Date.now(),
            isSummoning: true,
            glyphId: data.bundle?.id,
            glyphEmbed: data.bundle ? {
              code: data.code,
              glyphId: data.bundle.id,
              glyphName: data.bundle.name || 'Unnamed Glyph',
            } : undefined,
          });
          console.log('[ChatView] ✅ Assistant message persisted');
        } catch (err) {
          console.error('[ChatView] ❌ Failed to persist assistant message:', err);
        }
      } else {
        console.warn('[ChatView] ⚠️ Cannot persist assistant message:', { convId, hasMethod: !!window.loom?.addMessageToConversation });
      }
      
      streamingConversationIdRef.current = null;
      currentStreamingIdRef.current = null;

      // User stays in chat - no auto-navigation to editor
    };

    const handleSummonError = (data: { error: string }) => {
      const convId = streamingConversationIdRef.current;
      const assistantId = currentStreamingIdRef.current;
      if (!convId || !assistantId) return;

      updateMessagesForConversation(convId, msgs => 
        msgs.map(msg => 
          msg.id === assistantId && msg.isSummoning
            ? { ...msg, content: `❌ Error: ${data.error}` }
            : msg
        )
      );
      setIsGenerating(false);
      streamingConversationIdRef.current = null;
      currentStreamingIdRef.current = null;
    };

    const handleChatChunk = (data: { fullResponse: string }) => {
      const convId = streamingConversationIdRef.current;
      const assistantId = currentStreamingIdRef.current;
      if (!convId || !assistantId) return;

      updateMessagesForConversation(convId, msgs => 
        msgs.map(msg => 
          msg.id === assistantId && !msg.isSummoning
            ? { ...msg, content: data.fullResponse }
            : msg
        )
      );
    };

    const handleChatComplete = async (data: { response: string }) => {
      console.log('[ChatView] ✅ chat-complete', { responseLength: data.response?.length });
      
      const assistantId = currentStreamingIdRef.current;
      const convId = streamingConversationIdRef.current;
      if (!assistantId || !convId) return;
      
      updateMessagesForConversation(convId, msgs => 
        msgs.map(msg => 
          msg.id === assistantId && !msg.isSummoning
            ? { ...msg, content: data.response }
            : msg
        )
      );
      setIsGenerating(false);
      
      console.log('[ChatView] 💾 Persisting chat response to:', convId);
      if (window.loom?.addMessageToConversation) {
        try {
          await window.loom.addMessageToConversation(convId, {
            id: assistantId,
            role: 'assistant',
            content: data.response,
            timestamp: Date.now(),
            isSummoning: false,
          });
          console.log('[ChatView] ✅ Chat response persisted');
        } catch (err) {
          console.error('[ChatView] ❌ Failed to persist chat response:', err);
        }
      } else {
        console.warn('[ChatView] ⚠️ Cannot persist chat response:', { convId, hasMethod: !!window.loom?.addMessageToConversation });
      }

      streamingConversationIdRef.current = null;
      currentStreamingIdRef.current = null;
    };

    const handleChatError = (data: { error: string }) => {
      const convId = streamingConversationIdRef.current;
      const assistantId = currentStreamingIdRef.current;
      if (!convId || !assistantId) return;

      updateMessagesForConversation(convId, msgs => 
        msgs.map(msg => 
          msg.id === assistantId && !msg.isSummoning
            ? { ...msg, content: `❌ Error: ${data.error}` }
            : msg
        )
      );
      setIsGenerating(false);
      streamingConversationIdRef.current = null;
      currentStreamingIdRef.current = null;
    };

    // Subscribe to events
    const unsubs = [
      window.loom.onSummonChunk?.(handleSummonChunk),
      window.loom.onSummonComplete?.(handleSummonComplete),
      window.loom.onSummonError?.(handleSummonError),
      window.loom.onChatChunk?.(handleChatChunk),
      window.loom.onChatComplete?.(handleChatComplete),
      window.loom.onChatError?.(handleChatError),
    ];

    return () => {
      unsubs.forEach(unsub => unsub?.());
    };
  }, [onGlyphCreated]); // Use ref for activeConversationId, so no need to re-register on ID change

  return (
    <div style={styles.container}>
      {/* Collapsible History Sidebar */}
      <div 
        style={{
          ...styles.historySidebar,
          width: historyCollapsed ? '0px' : '280px',
          minWidth: historyCollapsed ? '0px' : '280px',
          opacity: historyCollapsed ? 0 : 1,
          padding: historyCollapsed ? '0' : '16px',
          borderRight: historyCollapsed ? 'none' : '1px solid rgba(255, 255, 255, 0.06)',
          // Goopy transition
          transition: `
            width 0.5s cubic-bezier(0.68, -0.15, 0.32, 1.15),
            min-width 0.5s cubic-bezier(0.68, -0.15, 0.32, 1.15),
            opacity 0.3s ease ${historyCollapsed ? '0s' : '0.2s'},
            padding 0.5s cubic-bezier(0.68, -0.15, 0.32, 1.15),
            border 0.3s ease
          `,
          transform: historyCollapsed ? 'translateX(-20px)' : 'translateX(0)',
          filter: historyCollapsed ? 'blur(4px)' : 'blur(0)',
        }}
      >
        <div style={{
          ...styles.historyContent,
          opacity: historyCollapsed ? 0 : 1,
          transform: historyCollapsed ? 'scale(0.9)' : 'scale(1)',
          transition: 'opacity 0.2s ease, transform 0.3s cubic-bezier(0.68, -0.15, 0.32, 1.15)',
          pointerEvents: historyCollapsed ? 'none' : 'auto',
        }}>
          {/* New Chat Button */}
          <button
            onClick={handleNewChat}
            style={styles.newChatBtn}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0, 255, 255, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(0, 255, 255, 0.4)';
              e.currentTarget.style.transform = 'scale(1.02)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0, 255, 255, 0.08)';
              e.currentTarget.style.borderColor = 'rgba(0, 255, 255, 0.25)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <span style={styles.newChatIcon}>✨</span>
            <span>New Chat</span>
          </button>

          {/* History Label */}
          <div style={styles.historyLabel}>
            <span style={styles.historyLabelIcon}>📜</span>
            <span>HISTORY</span>
            <span style={{
              ...styles.historyCount,
              background: conversations.length > 0 ? 'rgba(0, 255, 200, 0.2)' : 'rgba(255, 255, 255, 0.1)',
              color: conversations.length > 0 ? '#00ffc8' : 'rgba(255, 255, 255, 0.5)',
            }}>{conversations.length}</span>
          </div>

          {/* Conversation List */}
          <div style={styles.conversationList}>
            {!isHistoryLoaded ? (
              <div style={styles.historyLoading}>
                <span style={styles.loadingSpinner}>◌</span>
                <span>Loading...</span>
              </div>
            ) : conversations.length === 0 ? (
              <div style={styles.historyEmpty}>
                <span style={styles.emptyIcon}>💭</span>
                <span style={styles.emptyText}>No conversations yet</span>
                <span style={styles.emptyHint}>Start a new chat!</span>
              </div>
            ) : (
              conversations.map((conv, index) => (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  onMouseEnter={() => setHoveredConversationId(conv.id)}
                  onMouseLeave={() => setHoveredConversationId(null)}
                  style={{
                    ...styles.conversationItem,
                    background: activeConversationId === conv.id 
                      ? 'rgba(0, 255, 255, 0.12)' 
                      : hoveredConversationId === conv.id
                        ? 'rgba(255, 255, 255, 0.05)'
                        : 'transparent',
                    borderColor: activeConversationId === conv.id 
                      ? 'rgba(0, 255, 255, 0.3)' 
                      : 'rgba(255, 255, 255, 0.06)',
                    animation: `slideInLeft 0.3s ease ${index * 50}ms both`,
                  }}
                >
                  <div style={styles.convIcon}>
                    {conv.mode === 'summon' ? '✨' : '💬'}
                  </div>
                  <div style={styles.convContent}>
                    <div style={styles.convTitle}>{conv.title}</div>
                    <div style={styles.convMeta}>
                      <span>{getRelativeTime(conv.updatedAt)}</span>
                      <span>•</span>
                      <span>{conv.messages?.length || 0} msgs</span>
                    </div>
                  </div>
                  {/* Delete button - only show on hover */}
                  {hoveredConversationId === conv.id && (
                    <button
                      onClick={(e) => handleDeleteConversation(e, conv.id)}
                      style={styles.deleteBtn}
                      title="Delete conversation"
                    >
                      ×
                    </button>
                  )}
                  {/* Active indicator */}
                  {activeConversationId === conv.id && (
                    <div style={styles.activeIndicator} />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Collapse Toggle Button - Always visible */}
      <button
        onClick={() => setHistoryCollapsed(!historyCollapsed)}
        style={{
          ...styles.collapseBtn,
          left: historyCollapsed ? '8px' : '268px',
          transform: historyCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
          // Goopy bounce transition
          transition: `
            left 0.5s cubic-bezier(0.68, -0.15, 0.32, 1.15),
            transform 0.4s cubic-bezier(0.68, -0.55, 0.27, 1.55),
            background 0.2s ease,
            box-shadow 0.3s ease
          `,
        }}
        title={historyCollapsed ? 'Show history' : 'Hide history'}
      >
        <span style={styles.collapseIcon}>›</span>
      </button>

      {/* Main Chat Area */}
      <div style={styles.chatArea}>
        {/* Messages area */}
        <div style={styles.messagesContainer}>
          {messages.length === 0 ? (
            <div style={styles.welcomeMessage}>
              <div style={styles.welcomeIcon}>🔮</div>
              <div style={styles.welcomeTitle}>Welcome to LOOM</div>
              <div style={styles.welcomeSubtitle}>
                Type anything to chat, or use summon mode to create glyphs
              </div>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div
                key={msg.id}
                style={{
                  ...styles.messageWrapper,
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  animationDelay: `${index * 50}ms`,
                }}
              >
                <div
                  style={{
                    ...styles.message,
                    ...(msg.role === 'user' ? styles.userMessage : {}),
                    ...(msg.role === 'system' ? styles.systemMessage : {}),
                    ...(msg.role === 'assistant' ? styles.assistantMessage : {}),
                  }}
                >
                  <div style={{
                    ...styles.messageHeader,
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}>
                    <span style={styles.messageRole}>
                      {msg.role === 'user' ? '👤 You' : msg.role === 'system' ? '🔮 System' : '🤖 LOOM'}
                      {msg.isSummoning && msg.role !== 'system' && (
                        <span style={styles.summonBadge}>✨ Summon</span>
                      )}
                    </span>
                    <span style={styles.messageTime}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {/* Summoning messages use special SummonMessage component with goopy transitions */}
                  {msg.role === 'assistant' && msg.isSummoning ? (
                    <SummonMessage
                      isGenerating={isGenerating && msg.id === currentStreamingIdRef.current}
                      glyphEmbed={msg.glyphEmbed}
                      onOpenEditor={(glyphId, code) => {
                        // Open editor with this glyph
                        onGlyphCreated?.(glyphId, code);
                      }}
                    />
                  ) : msg.content ? (
                    <div style={styles.messageContent}>
                      {msg.role === 'assistant' && msg.content ? (
                        <div style={styles.chatText}>
                          {msg.content}
                          {isGenerating && msg.id === currentStreamingIdRef.current && <span style={styles.cursor}>▌</span>}
                        </div>
                      ) : (
                        <p style={styles.messageText}>{msg.content}</p>
                      )}
                    </div>
                  ) : null}
                  
                  {msg.glyphAttachments && msg.glyphAttachments.length > 0 && (
                    <div style={styles.messageAttachmentToggleRow}>
                      <button
                        style={{
                          ...styles.attachmentToggleInline,
                          ...(openAttachmentContext?.type === 'message' && openAttachmentContext.messageId === msg.id
                            ? styles.attachmentToggleActive
                            : {}),
                        }}
                        onClick={() => toggleAttachmentPanel({ type: 'message', messageId: msg.id })}
                      >
                        🌀 View glyphs ({msg.glyphAttachments.length})
                      </button>
                      {openAttachmentContext?.type === 'message' && openAttachmentContext.messageId === msg.id && (
                        <AttachmentPanel
                          title="Message Glyphs"
                          attachments={msg.glyphAttachments}
                          onClose={() => setOpenAttachmentContext(null)}
                          styleOverride={styles.messageAttachmentPanel}
                        />
                      )}
                    </div>
                  )}

                  {/* Legacy glyph badge for messages without embed */}
                  {msg.glyphId && !msg.glyphEmbed && !msg.isSummoning && (
                    <div style={styles.glyphBadge}>
                      🎯 Glyph: {msg.glyphId.slice(0, 20)}...
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div style={styles.inputArea}>
          {/* Mode toggle and hints */}
          <div style={styles.inputToolbar}>
            <div style={styles.modeToggle}>
              <button
                onClick={() => handleChatModeChange('chat')}
                style={{
                  ...styles.modeBtn,
                  ...(chatMode === 'chat' ? styles.modeBtnActive : {}),
                }}
              >
                💬 Chat
              </button>
              <button
                onClick={() => handleChatModeChange('summon')}
                style={{
                  ...styles.modeBtn,
                  ...(chatMode === 'summon' ? styles.modeBtnActiveSummon : {}),
                }}
              >
                ✨ Summon
              </button>
            </div>
            
            <div style={styles.toolbarHint}>
              {chatMode === 'summon' 
                ? 'Creates a new glyph from your prompt'
                : 'Just chat - no glyph generation'}
            </div>
          </div>

          <div style={styles.inputWrapper}>
            <div style={{
              ...styles.inputGlow,
              background: chatMode === 'summon' 
                ? 'radial-gradient(ellipse at center, rgba(255, 0, 255, 0.15) 0%, transparent 70%)'
                : 'radial-gradient(ellipse at center, rgba(0, 255, 255, 0.15) 0%, transparent 70%)',
            }} />
            
            <span style={styles.inputIcon}>
              {isGenerating ? '⚡' : chatMode === 'summon' ? '✨' : '💬'}
            </span>
            
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
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
                  if ((input.trim() || hasAttachments) && !isGenerating) {
                    handleSubmit();
                  }
                }
              }}
              placeholder={
                isGenerating 
                  ? 'Generating...' 
                  : chatMode === 'summon'
                    ? 'Describe the glyph you want to create...'
                    : 'Ask anything...'
              }
              disabled={isGenerating}
              style={{
                ...styles.input,
                overflowY: input.length > 600 ? 'auto' : 'hidden',
              }}
              rows={1}
            />
            
            <div style={styles.inlineTools} ref={inlineToolsRef}>
              {chatMode === 'summon' && (
                <div style={styles.keysSelector} ref={keysMenuRef}>
                  <button
                    onClick={() => setShowKeysMenu(!showKeysMenu)}
                    style={{
                      ...styles.keysBtn,
                      borderColor: selectedKeys.length > 0 
                        ? 'rgba(0, 255, 200, 0.5)' 
                        : 'rgba(255, 255, 255, 0.15)',
                      background: selectedKeys.length > 0 
                        ? 'rgba(0, 255, 200, 0.1)' 
                        : 'rgba(255, 255, 255, 0.05)',
                    }}
                    title="Attach API keys to glyph"
                  >
                    🔑 {selectedKeys.length > 0 && <span style={styles.keyCount}>{selectedKeys.length}</span>}
                  </button>
                  
                  {showKeysMenu && (
                    <div style={styles.keysMenu}>
                      <div style={styles.keysMenuTitle}>ATTACH KEYS TO GLYPH</div>
                      <div style={styles.keysMenuDescription}>
                        Selected keys will be linked to the generated glyph
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
                                <span style={styles.keyCheck}>✓</span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={styles.attachmentSelector} ref={glyphPickerRef}>
                <button
                  onClick={() => setGlyphPickerOpen(prev => !prev)}
                  style={{
                    ...styles.attachmentBtn,
                    borderColor: hasAttachments 
                      ? 'rgba(0, 255, 255, 0.5)'
                      : 'rgba(255, 255, 255, 0.15)',
                    background: hasAttachments
                      ? 'rgba(0, 255, 255, 0.12)'
                      : 'rgba(255, 255, 255, 0.05)',
                  }}
                  title="Attach an existing glyph"
                >
                  🌀 {hasAttachments && <span style={styles.attachmentCount}>{pendingAttachments.length}</span>}
                </button>

                {glyphPickerOpen && (
                  <div style={styles.glyphPicker}>
                    <div style={styles.glyphPickerHeader}>
                      <span>ATTACH GLYPH</span>
                      <button style={styles.glyphPickerClose} onClick={() => setGlyphPickerOpen(false)}>×</button>
                    </div>
                    <input
                      style={styles.glyphPickerSearch}
                      placeholder="Search saved glyphs..."
                      value={glyphSearch}
                      onChange={(e) => setGlyphSearch(e.target.value)}
                    />
                    <div style={styles.glyphPickerGrid}>
                      {glyphPickerLoading ? (
                        <div style={styles.glyphPickerEmpty}>Loading glyphs...</div>
                      ) : filteredGlyphs.length === 0 ? (
                        <div style={styles.glyphPickerEmpty}>No glyphs found</div>
                      ) : (
                        filteredGlyphs.map((glyph) => (
                          <button
                            key={glyph.id}
                            style={styles.glyphPickerCard}
                            onClick={() => handleAttachGlyph(glyph)}
                          >
                            <div style={styles.glyphPickerIcon}>{glyph.icon || '✨'}</div>
                            <div style={styles.glyphPickerName}>{glyph.name || glyph.id}</div>
                            <div style={styles.glyphPickerMeta}>
                              {glyph.type || 'Custom glyph'}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                    {glyphAttachError && (
                      <div style={styles.glyphPickerError}>{glyphAttachError}</div>
                    )}
                  </div>
                )}
              </div>

              {pendingAttachments.length > 0 && (
                <button
                  style={{
                    ...styles.attachmentToggle,
                    ...(openAttachmentContext?.type === 'pending' ? styles.attachmentToggleActive : {}),
                  }}
                  onClick={() => toggleAttachmentPanel({ type: 'pending' })}
                >
                  🌀 Glyphs ({pendingAttachments.length})
                </button>
              )}
            </div>

            {openAttachmentContext?.type === 'pending' && (
              <AttachmentPanel
                title="Attached Glyphs"
                attachments={pendingAttachments}
                allowRemove
                onRemove={handleRemoveAttachment}
                onClose={() => setOpenAttachmentContext(null)}
                panelRef={attachmentPanelRef}
                styleOverride={styles.pendingAttachmentPanel}
              />
            )}

            {pendingAttachments.length > 0 && (
              <div style={styles.pendingAttachmentChips}>
                {pendingAttachments.map(att => (
                  <div key={att.attachmentId} style={styles.attachmentChip}>
                    <span style={styles.attachmentChipIcon}>{att.icon || '🌀'}</span>
                    <span style={styles.attachmentChipLabel}>{att.name || att.glyphId}</span>
                    <button
                      style={styles.attachmentChipRemove}
                      onClick={() => handleRemoveAttachment(att.attachmentId)}
                      title="Remove glyph"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <button
              onClick={handleSubmit}
              disabled={!submitEnabled}
              style={{
                ...styles.submitBtn,
                opacity: submitEnabled ? 1 : 0.3,
                background: chatMode === 'summon'
                  ? 'linear-gradient(135deg, #ff00ff 0%, #00ffff 100%)'
                  : 'linear-gradient(135deg, #00ffff 0%, #00ff88 100%)',
              }}
            >
              {isGenerating ? <span style={styles.spinner}>◌</span> : '→'}
            </button>
          </div>
          
          {/* Hints */}
          {!isGenerating && !input && (
            <div style={styles.hints}>
              {chatMode === 'summon' ? (
                ['cyberpunk city background', 'floating crystal', 'particle galaxy', 'neon mandala'].map((hint, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(hint)}
                    style={styles.hint}
                  >
                    {hint}
                  </button>
                ))
              ) : (
                ['How do I use LOOM?', 'What can glyphs do?', 'Explain the editor'].map((hint, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(hint)}
                    style={styles.hint}
                  >
                    {hint}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          0% { opacity: 0.3; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes blink {
          50% { opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes goopyPulse {
          0%, 100% { 
            transform: scale(1);
            filter: blur(0);
          }
          50% { 
            transform: scale(1.02);
            filter: blur(0.5px);
          }
        }
        
        /* === SUMMON MESSAGE ANIMATIONS === */
        
        /* Goopy expand animation when transitioning from generating to preview */
        @keyframes goopyExpand {
          0% {
            transform: scale(1);
            max-width: 400px;
            filter: blur(0);
          }
          20% {
            transform: scale(0.95);
            filter: blur(2px);
          }
          40% {
            transform: scale(1.08);
            max-width: 520px;
            filter: blur(1px);
          }
          60% {
            transform: scale(0.98);
            filter: blur(0);
          }
          80% {
            transform: scale(1.02);
            max-width: 500px;
          }
          100% {
            transform: scale(1);
            max-width: 500px;
            filter: blur(0);
          }
        }
        
        /* Orb pulsing animation */
        @keyframes orbPulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 40px rgba(255, 0, 255, 0.3), 0 0 80px rgba(0, 255, 255, 0.2);
          }
          50% {
            transform: scale(1.1);
            box-shadow: 0 0 60px rgba(255, 0, 255, 0.5), 0 0 100px rgba(0, 255, 255, 0.3);
          }
        }
        
        /* Orb spinning animation */
        @keyframes orbSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        /* Animated border rotation */
        @keyframes borderRotate {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        
        /* Celebration particle animations */
        .particle {
          position: absolute;
          font-size: 20px;
          animation: particleBurst 0.8s ease-out forwards;
          opacity: 0;
        }
        .p1 { top: 50%; left: 50%; animation-delay: 0s; }
        .p2 { top: 50%; left: 50%; animation-delay: 0.1s; }
        .p3 { top: 50%; left: 50%; animation-delay: 0.2s; }
        .p4 { top: 50%; left: 50%; animation-delay: 0.3s; }
        
        @keyframes particleBurst {
          0% {
            transform: translate(-50%, -50%) scale(0);
            opacity: 1;
          }
          20% {
            opacity: 1;
          }
          100% {
            transform: translate(var(--tx, 100px), var(--ty, -100px)) scale(1.2);
            opacity: 0;
          }
        }
        
        .p1 { --tx: -80px; --ty: -60px; }
        .p2 { --tx: 80px; --ty: -50px; }
        .p3 { --tx: -60px; --ty: 60px; }
        .p4 { --tx: 70px; --ty: 70px; }
        
        /* Generating dots animation */
        .dot {
          display: inline-block;
          animation: dotWave 1.4s ease-in-out infinite;
        }
        .dot1 { animation-delay: 0s; }
        .dot2 { animation-delay: 0.2s; }
        .dot3 { animation-delay: 0.4s; }
        
        @keyframes dotWave {
          0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.4;
          }
          30% {
            transform: translateY(-8px);
            opacity: 1;
          }
        }
        
        textarea::placeholder {
          color: rgba(255, 255, 255, 0.35);
        }
        textarea::-webkit-scrollbar {
          width: 6px;
        }
        textarea::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.2);
        }
        textarea::-webkit-scrollbar-thumb {
          background: rgba(0, 255, 255, 0.3);
          border-radius: 3px;
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative',
  },
  
  // History Sidebar
  historySidebar: {
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(0, 0, 0, 0.2)',
    overflow: 'hidden',
    position: 'relative',
  },
  
  historyContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    height: '100%',
    overflow: 'hidden',
  },
  
  newChatBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '14px 20px',
    background: 'rgba(0, 255, 255, 0.08)',
    border: '1px solid rgba(0, 255, 255, 0.25)',
    borderRadius: '12px',
    color: '#00ffff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
    fontFamily: 'inherit',
    flexShrink: 0,
  },
  
  newChatIcon: {
    fontSize: '16px',
    filter: 'drop-shadow(0 0 6px rgba(0, 255, 255, 0.5))',
  },
  
  historyLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '1.5px',
    color: 'rgba(255, 255, 255, 0.4)',
    textTransform: 'uppercase',
    padding: '0 4px',
  },
  
  historyLabelIcon: {
    fontSize: '12px',
  },
  
  historyCount: {
    marginLeft: 'auto',
    background: 'rgba(255, 255, 255, 0.1)',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '10px',
  },
  
  conversationList: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    paddingRight: '4px',
  },
  
  conversationItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px',
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    position: 'relative',
    overflow: 'hidden',
  },
  
  convIcon: {
    fontSize: '16px',
    flexShrink: 0,
  },
  
  convContent: {
    flex: 1,
    overflow: 'hidden',
  },
  
  convTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.85)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  
  convMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.35)',
    marginTop: '4px',
  },
  
  deleteBtn: {
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255, 80, 80, 0.2)',
    border: '1px solid rgba(255, 80, 80, 0.3)',
    borderRadius: '6px',
    color: '#ff6b6b',
    fontSize: '16px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    flexShrink: 0,
  },
  
  activeIndicator: {
    position: 'absolute',
    left: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    width: '3px',
    height: '20px',
    background: 'linear-gradient(180deg, #00ffff, #ff00ff)',
    borderRadius: '0 3px 3px 0',
    boxShadow: '0 0 8px rgba(0, 255, 255, 0.5)',
  },
  
  historyLoading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '40px 20px',
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: '12px',
  },
  
  loadingSpinner: {
    animation: 'spin 1s linear infinite',
    fontSize: '18px',
  },
  
  historyEmpty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    gap: '8px',
    textAlign: 'center',
  },
  
  emptyIcon: {
    fontSize: '32px',
    opacity: 0.4,
  },
  
  emptyText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '13px',
  },
  
  emptyHint: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: '11px',
  },
  
  // Collapse Button
  collapseBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: '-20px',
    width: '28px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 255, 255, 0.1)',
    border: '1px solid rgba(0, 255, 255, 0.3)',
    borderRadius: '0 8px 8px 0',
    color: '#00ffff',
    fontSize: '18px',
    fontWeight: 'bold',
    cursor: 'pointer',
    zIndex: 10,
    boxShadow: '2px 0 12px rgba(0, 255, 255, 0.15)',
  },
  
  collapseIcon: {
    display: 'inline-block',
  },
  
  // Chat Area
  chatArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  
  welcomeMessage: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: '16px',
    textAlign: 'center',
    padding: '40px',
  },
  
  welcomeIcon: {
    fontSize: '48px',
    filter: 'drop-shadow(0 0 20px rgba(255, 0, 255, 0.5))',
    animation: 'goopyPulse 3s ease-in-out infinite',
  },
  
  welcomeTitle: {
    fontSize: '24px',
    fontWeight: 700,
    background: 'linear-gradient(90deg, #00ffff, #ff00ff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    letterSpacing: '2px',
  },
  
  welcomeSubtitle: {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.5)',
    maxWidth: '400px',
    lineHeight: 1.6,
  },
  
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  
  messageWrapper: {
    display: 'flex',
    width: '100%',
    animation: 'fadeIn 0.3s ease forwards',
    // Don't set opacity: 0 here - messages should be visible even if animation fails
  },
  
  message: {
    maxWidth: '75%',
    minWidth: '200px',
  },
  
  userMessage: {},
  systemMessage: {
    maxWidth: '80%',
    alignSelf: 'center',
  },
  assistantMessage: {},
  
  messageHeader: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '8px',
    gap: '12px',
  },
  
  messageRole: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.5px',
    color: 'rgba(255, 255, 255, 0.6)',
    textTransform: 'uppercase',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  
  summonBadge: {
    fontSize: '9px',
    padding: '2px 6px',
    background: 'rgba(255, 0, 255, 0.2)',
    border: '1px solid rgba(255, 0, 255, 0.3)',
    borderRadius: '8px',
    color: '#ff66ff',
  },
  
  messageTime: {
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.3)',
  },
  
  messageContent: {
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    padding: '14px 18px',
  },
  
  messageText: {
    margin: 0,
    fontSize: '14px',
    lineHeight: 1.6,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  
  codeBlock: {
    margin: 0,
    fontSize: '11px',
    lineHeight: 1.5,
    color: '#00ffff',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    fontFamily: "'JetBrains Mono', monospace",
    maxHeight: '400px',
    overflowY: 'auto',
  },
  
  chatText: {
    margin: 0,
    fontSize: '14px',
    lineHeight: 1.7,
    color: 'rgba(255, 255, 255, 0.9)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  
  cursor: {
    color: '#ff00ff',
    animation: 'blink 0.8s step-end infinite',
  },
  
  glyphBadge: {
    marginTop: '8px',
    fontSize: '10px',
    color: 'rgba(0, 255, 200, 0.8)',
    padding: '4px 8px',
    background: 'rgba(0, 255, 200, 0.1)',
    borderRadius: '6px',
    border: '1px solid rgba(0, 255, 200, 0.2)',
  },
  
  inputArea: {
    padding: '16px 24px 20px',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    background: 'rgba(0, 0, 0, 0.2)',
  },
  
  inputToolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  
  modeToggle: {
    display: 'flex',
    gap: '4px',
    padding: '4px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '10px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
  },
  
  modeBtn: {
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: 500,
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    color: 'rgba(255, 255, 255, 0.5)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
  
  modeBtnActive: {
    background: 'rgba(0, 255, 255, 0.15)',
    color: '#00ffff',
    boxShadow: '0 0 10px rgba(0, 255, 255, 0.2)',
  },
  
  modeBtnActiveSummon: {
    background: 'rgba(255, 0, 255, 0.15)',
    color: '#ff66ff',
    boxShadow: '0 0 10px rgba(255, 0, 255, 0.2)',
  },
  
  toolbarHint: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.35)',
  },
  
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '14px',
    padding: '16px 20px',
    background: 'rgba(8, 8, 18, 0.9)',
    backdropFilter: 'blur(20px)',
    borderRadius: '16px',
    border: '1px solid rgba(0, 255, 255, 0.2)',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
    minHeight: '56px',
  },
  
  inputGlow: {
    position: 'absolute',
    top: '-50%',
    left: '-10%',
    right: '-10%',
    bottom: '-50%',
    pointerEvents: 'none',
    opacity: 0.5,
  },
  
  inputIcon: {
    fontSize: '20px',
    zIndex: 1,
    filter: 'drop-shadow(0 0 6px currentColor)',
    paddingTop: '4px',
    flexShrink: 0,
  },
  
  input: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#ffffff',
    fontSize: '15px',
    fontFamily: 'inherit',
    resize: 'none',
    zIndex: 1,
    minHeight: '24px',
    maxHeight: '180px',
    lineHeight: '1.4',
  },
  
  keysSelector: {
    position: 'relative',
    zIndex: 100,
  },
  inlineTools: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginTop: '6px',
    zIndex: 90,
  },
  
  keysBtn: {
    width: '40px',
    height: '40px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    fontSize: '16px',
    position: 'relative',
  },
  
  keyCount: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    width: '16px',
    height: '16px',
    background: 'linear-gradient(135deg, #00ff88 0%, #00ffcc 100%)',
    borderRadius: '50%',
    fontSize: '10px',
    fontWeight: 'bold',
    color: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  keysMenu: {
    position: 'absolute',
    bottom: '50px',
    right: 0,
    background: 'rgba(12, 12, 24, 0.98)',
    backdropFilter: 'blur(24px)',
    borderRadius: '14px',
    border: '1px solid rgba(0, 255, 200, 0.3)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
    padding: '12px',
    minWidth: '240px',
    animation: 'fadeIn 0.2s ease',
  },
  
  keysMenuTitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '1px',
    padding: '4px 8px 8px',
    textTransform: 'uppercase',
  },
  
  keysMenuDescription: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: '10px',
    padding: '0 8px 8px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    marginBottom: '8px',
  },
  
  keysMenuScroll: {
    maxHeight: '200px',
    overflowY: 'auto',
  },
  
  keysEmpty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px 10px',
    gap: '6px',
  },
  
  keysEmptyIcon: {
    fontSize: '24px',
    opacity: 0.5,
  },
  
  keysEmptyText: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  
  keysEmptyHint: {
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.3)',
  },
  
  keyMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '10px 12px',
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
    textAlign: 'left',
    marginBottom: '4px',
  },
  
  keyMenuIcon: {
    fontSize: '14px',
  },
  
  keyMenuName: {
    color: '#ffffff',
    fontSize: '12px',
    flex: 1,
  },
  
  keyCheck: {
    color: '#00ffcc',
    fontSize: '14px',
    fontWeight: 'bold',
  },
  attachmentSelector: {
    position: 'relative',
    zIndex: 90,
  },
  attachmentBtn: {
    width: '40px',
    height: '40px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    fontSize: '18px',
    color: '#00ffff',
    position: 'relative',
  },
  attachmentCount: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    width: '18px',
    height: '18px',
    background: 'linear-gradient(135deg, #00ffff 0%, #ff00ff 100%)',
    borderRadius: '50%',
    fontSize: '10px',
    fontWeight: 700,
    color: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 8px rgba(0, 255, 255, 0.4)',
  },
  glyphPicker: {
    position: 'absolute',
    bottom: '50px',
    right: 0,
    background: 'rgba(10, 12, 24, 0.98)',
    border: '1px solid rgba(0, 255, 255, 0.3)',
    borderRadius: '16px',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
    padding: '14px',
    width: '320px',
    animation: 'fadeIn 0.25s ease',
    backdropFilter: 'blur(18px)',
  },
  glyphPickerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '11px',
    fontWeight: 700,
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: '1px',
    textTransform: 'uppercase',
    paddingBottom: '6px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    marginBottom: '10px',
  },
  glyphPickerClose: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    width: '22px',
    height: '22px',
    color: '#fff',
    cursor: 'pointer',
  },
  glyphPickerSearch: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.03)',
    color: '#fff',
    fontFamily: 'inherit',
    marginBottom: '12px',
  },
  glyphPickerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '10px',
    maxHeight: '260px',
    overflowY: 'auto',
    paddingRight: '4px',
  },
  glyphPickerCard: {
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.02)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    cursor: 'pointer',
    color: '#fff',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
  glyphPickerIcon: {
    fontSize: '20px',
  },
  glyphPickerName: {
    fontSize: '12px',
    fontWeight: 600,
  },
  glyphPickerMeta: {
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  glyphPickerEmpty: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: '12px',
    padding: '20px 0',
  },
  glyphPickerError: {
    marginTop: '10px',
    fontSize: '11px',
    color: '#ff7b7b',
    textAlign: 'center',
  },
  pendingAttachmentChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '12px',
  },
  attachmentChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    borderRadius: '999px',
    border: '1px solid rgba(0, 255, 255, 0.25)',
    background: 'rgba(0, 255, 255, 0.08)',
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: '12px',
  },
  attachmentChipIcon: {
    fontSize: '12px',
  },
  attachmentChipLabel: {
    maxWidth: '120px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  attachmentChipRemove: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.6)',
    cursor: 'pointer',
    fontSize: '12px',
  },
  attachmentToggle: {
    padding: '8px 14px',
    borderRadius: '999px',
    border: '1px solid rgba(0, 255, 255, 0.3)',
    background: 'rgba(0, 255, 255, 0.08)',
    color: '#00ffff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  attachmentToggleInline: {
    padding: '6px 10px',
    borderRadius: '10px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: '11px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  attachmentToggleActive: {
    borderColor: 'rgba(255, 0, 255, 0.5)',
    background: 'rgba(255, 0, 255, 0.1)',
    color: '#ff7bff',
    boxShadow: '0 0 12px rgba(255, 0, 255, 0.25)',
  },
  pendingAttachmentPanel: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '12px',
    zIndex: 120,
  },
  messageAttachmentPanel: {
    position: 'relative',
    marginTop: '10px',
  },
  messageAttachmentToggleRow: {
    marginTop: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  attachmentPanel: {
    background: 'rgba(10, 12, 24, 0.96)',
    border: '1px solid rgba(0, 255, 255, 0.2)',
    borderRadius: '16px',
    padding: '14px',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.55)',
    backdropFilter: 'blur(18px)',
    width: '320px',
  },
  attachmentPanelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '10px',
  },
  attachmentPanelTitle: {
    fontSize: '11px',
    letterSpacing: '1px',
    textTransform: 'uppercase',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  attachmentPanelClose: {
    width: '22px',
    height: '22px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    background: 'rgba(255, 255, 255, 0.08)',
    color: '#fff',
    cursor: 'pointer',
  },
  attachmentPanelList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxHeight: '320px',
    overflowY: 'auto',
    paddingRight: '4px',
  },
  attachmentCard: {
    background: 'rgba(8, 12, 24, 0.9)',
    border: '1px solid rgba(0, 255, 255, 0.15)',
    borderRadius: '14px',
    padding: '12px',
    position: 'relative',
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
    animation: 'fadeIn 0.3s ease',
  },
  attachmentCardLeft: {},
  attachmentCardRight: {
    alignSelf: 'flex-end',
  },
  attachmentHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    marginBottom: '10px',
  },
  attachmentIcon: {
    fontSize: '16px',
  },
  attachmentName: {
    flex: 1,
    fontSize: '13px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  attachmentRemoveBtn: {
    width: '24px',
    height: '24px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 80, 120, 0.4)',
    background: 'rgba(255, 80, 120, 0.15)',
    color: '#ff7f9c',
    cursor: 'pointer',
  },
  attachmentPreview: {
    position: 'relative',
    borderRadius: '10px',
    overflow: 'hidden',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    minHeight: '120px',
    background: 'rgba(0, 0, 0, 0.5)',
  },
  attachmentIframe: {
    width: '100%',
    height: '180px',
    border: 'none',
    background: '#05070f',
  },
  attachmentPlaceholder: {
    padding: '20px',
    textAlign: 'center',
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  attachmentGlow: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    background: 'linear-gradient(135deg, rgba(0, 255, 255, 0.15), rgba(255, 0, 255, 0.15))',
    opacity: 0.2,
  },
  attachmentFooter: {
    marginTop: '8px',
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'right',
  },
  
  modelSelector: {
    position: 'relative',
    zIndex: 100,
  },
  
  modelBtn: {
    width: '40px',
    height: '40px',
    background: 'rgba(255, 0, 255, 0.1)',
    border: '1px solid rgba(255, 0, 255, 0.3)',
    borderRadius: '10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  },
  
  modelIcon: {
    fontSize: '18px',
  },
  
  modelMenu: {
    position: 'absolute',
    bottom: '50px',
    right: 0,
    background: 'rgba(12, 12, 24, 0.98)',
    backdropFilter: 'blur(24px)',
    borderRadius: '14px',
    border: '1px solid rgba(255, 0, 255, 0.4)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
    padding: '8px',
    minWidth: '220px',
    animation: 'fadeIn 0.2s ease',
  },
  
  modelMenuTitle: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '1px',
    padding: '8px 12px 6px',
    textTransform: 'uppercase',
  },
  
  providerLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '1px',
    padding: '10px 12px 4px',
    textTransform: 'uppercase',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    marginTop: '4px',
  },
  
  modelMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '10px 12px',
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
    textAlign: 'left',
  },
  
  modelItemIcon: {
    fontSize: '14px',
  },
  
  modelName: {
    color: '#ffffff',
    fontSize: '12px',
    flex: 1,
  },
  
  modelCheck: {
    color: '#ff00ff',
    fontSize: '14px',
    fontWeight: 'bold',
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
  
  hints: {
    display: 'flex',
    gap: '8px',
    marginTop: '12px',
    flexWrap: 'wrap',
  },
  
  hint: {
    padding: '8px 14px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '20px',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '11px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
};
