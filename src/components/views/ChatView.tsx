/**
 * CHAT VIEW — Summon anything into existence
 * Main AI chat interface for generating and discussing glyphs
 */

import { useState, useRef, useEffect, useCallback } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

interface AIModel {
  id: string;
  name: string;
  provider: string;
  available: boolean;
  icon: string;
}

export default function ChatView() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'system',
      content: '🔮 Welcome to LOOM. Type anything to summon it into existence.',
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('grok');
  const [availableModels, setAvailableModels] = useState<AIModel[]>([]);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  // Load available models
  useEffect(() => {
    if (window.loom?.getAvailableModels) {
      window.loom.getAvailableModels().then((models) => {
        setAvailableModels(models);
        const firstAvailable = models.find(m => m.available);
        if (firstAvailable) setSelectedModel(firstAvailable.id);
      }).catch(console.error);
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close model menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    };
    
    inputRef.current?.addEventListener('keydown', handleKeyDown);
    return () => inputRef.current?.removeEventListener('keydown', handleKeyDown);
  }, [input]);

  const handleSubmit = useCallback(() => {
    if (!input.trim() || isGenerating) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsGenerating(true);

    // Add streaming placeholder
    const assistantId = `msg-${Date.now()}-assistant`;
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    }]);

    // Start summon request
    if (window.loom?.summonRequest) {
      window.loom.summonRequest(userMessage.content, selectedModel);
    }
  }, [input, isGenerating, selectedModel]);

  // Setup IPC listeners for streaming
  useEffect(() => {
    if (!window.loom) return;

    const handleChunk = (data: { fullCode: string }) => {
      setMessages(prev => prev.map(msg => 
        msg.isStreaming 
          ? { ...msg, content: data.fullCode }
          : msg
      ));
    };

    const handleComplete = (data: { code: string; type?: string; attempt?: number }) => {
      setMessages(prev => {
        // Simply mark the message as complete - no auto-render to desktop
        // User can manually invoke the glyph from the Glyphs view when ready
        return prev.map(msg => 
          msg.isStreaming 
            ? { ...msg, content: data.code, isStreaming: false }
            : msg
        );
      });
      setIsGenerating(false);
    };

    const handleError = (data: { error: string }) => {
      setMessages(prev => prev.map(msg => 
        msg.isStreaming 
          ? { ...msg, content: `❌ Error: ${data.error}`, isStreaming: false }
          : msg
      ));
      setIsGenerating(false);
    };

    const chunkUnsub = window.loom.onSummonChunk?.((data) => {
      console.log('[ChatView] 📡 summon-chunk update', { fullLength: data.fullCode?.length || 0 });
      handleChunk(data);
    });
    const completeUnsub = window.loom.onSummonComplete?.((data) => {
      console.log('[ChatView] ✅ summon-complete update', { codeLength: data.code?.length || 0, attempt: data.attempt });
      handleComplete(data);
    });
    const errorUnsub = window.loom.onSummonError?.((data) => {
      console.log('[ChatView] ❌ summon-error update', data.error);
      handleError(data);
    });

    return () => {
      chunkUnsub?.();
      completeUnsub?.();
      errorUnsub?.();
    };
  }, []);

  const getCurrentModel = () => availableModels.find(m => m.id === selectedModel);

  return (
    <div style={styles.container}>
      {/* Messages area */}
      <div style={styles.messagesContainer}>
        {messages.map((msg, index) => (
          <div
            key={msg.id}
            style={{
              ...styles.message,
              ...(msg.role === 'user' ? styles.userMessage : {}),
              ...(msg.role === 'system' ? styles.systemMessage : {}),
              ...(msg.role === 'assistant' ? styles.assistantMessage : {}),
              animationDelay: `${index * 50}ms`,
            }}
          >
            <div style={styles.messageHeader}>
              <span style={styles.messageRole}>
                {msg.role === 'user' ? '👤 You' : msg.role === 'system' ? '🔮 System' : '🤖 LOOM'}
              </span>
              <span style={styles.messageTime}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div style={styles.messageContent}>
              {msg.role === 'assistant' && msg.content ? (
                <pre style={styles.codeBlock}>
                  {msg.content.slice(-2000)}
                  {msg.isStreaming && <span style={styles.cursor}>▌</span>}
                </pre>
              ) : (
                <p style={styles.messageText}>{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={styles.inputArea}>
        <div style={styles.inputWrapper}>
          {/* Glow effect */}
          <div style={styles.inputGlow} />
          
          {/* Icon */}
          <span style={styles.inputIcon}>
            {isGenerating ? '⚡' : '✨'}
          </span>
          
          {/* Textarea */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isGenerating ? 'Channeling reality...' : 'Summon anything into existence...'}
            disabled={isGenerating}
            style={styles.input}
            rows={1}
          />
          
          {/* Model selector */}
          <div style={styles.modelSelector} ref={modelMenuRef}>
            <button
              onClick={() => setShowModelMenu(!showModelMenu)}
              style={styles.modelBtn}
              title={`Using: ${getCurrentModel()?.name || 'Auto'}`}
            >
              <span style={styles.modelIcon}>{getCurrentModel()?.icon || '🤖'}</span>
            </button>
            
            {showModelMenu && (
              <div style={styles.modelMenu}>
                <div style={styles.modelMenuTitle}>SELECT AI MODEL</div>
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
                          onClick={() => {
                            setSelectedModel(model.id);
                            setShowModelMenu(false);
                          }}
                          disabled={!model.available}
                          style={{
                            ...styles.modelMenuItem,
                            opacity: model.available ? 1 : 0.4,
                            background: selectedModel === model.id ? 'rgba(255, 0, 255, 0.2)' : 'transparent',
                          }}
                        >
                          <span style={styles.modelItemIcon}>{model.icon}</span>
                          <span style={styles.modelName}>{model.name}</span>
                          {selectedModel === model.id && <span style={styles.modelCheck}>✓</span>}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isGenerating}
            style={{
              ...styles.submitBtn,
              opacity: input.trim() && !isGenerating ? 1 : 0.3,
            }}
          >
            {isGenerating ? <span style={styles.spinner}>◌</span> : '→'}
          </button>
        </div>
        
        {/* Hints */}
        {!isGenerating && !input && (
          <div style={styles.hints}>
            {['cyberpunk city background', 'floating crystal', 'particle galaxy', 'neon mandala'].map((hint, i) => (
              <button
                key={i}
                onClick={() => setInput(hint)}
                style={styles.hint}
              >
                {hint}
              </button>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes blink {
          50% { opacity: 0; }
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
    flexDirection: 'column',
    overflow: 'hidden',
  },
  
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  
  message: {
    animation: 'fadeIn 0.3s ease forwards',
    opacity: 0,
  },
  userMessage: {
    marginLeft: 'auto',
    maxWidth: '70%',
  },
  systemMessage: {
    alignSelf: 'center',
    maxWidth: '80%',
  },
  assistantMessage: {
    marginRight: 'auto',
    maxWidth: '85%',
  },
  messageHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
    gap: '12px',
  },
  messageRole: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.5px',
    color: 'rgba(255, 255, 255, 0.6)',
    textTransform: 'uppercase',
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
    maxHeight: '300px',
    overflowY: 'auto',
  },
  cursor: {
    color: '#ff00ff',
    animation: 'blink 0.8s step-end infinite',
  },
  
  inputArea: {
    padding: '20px 24px',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    background: 'rgba(0, 0, 0, 0.2)',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '16px 20px',
    background: 'rgba(8, 8, 18, 0.9)',
    backdropFilter: 'blur(20px)',
    borderRadius: '16px',
    border: '1px solid rgba(0, 255, 255, 0.2)',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  },
  inputGlow: {
    position: 'absolute',
    top: '-50%',
    left: '-10%',
    right: '-10%',
    bottom: '-50%',
    background: 'radial-gradient(ellipse at center, rgba(0, 255, 255, 0.15) 0%, transparent 70%)',
    pointerEvents: 'none',
    opacity: 0.5,
  },
  inputIcon: {
    fontSize: '20px',
    zIndex: 1,
    filter: 'drop-shadow(0 0 6px currentColor)',
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
    maxHeight: '120px',
    overflowY: 'auto',
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

