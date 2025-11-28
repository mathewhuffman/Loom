/**
 * LOOM SUMMON BAR — The gateway to digital manifestation
 * Press Ctrl+Alt+S to awaken, type your will, press again to sleep
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';

interface SummonBarProps {
  onSummon: (prompt: string) => void;
  isGenerating: boolean;
  streamingCode: string;
}

export default function SummonBar({ onSummon, isGenerating, streamingCode }: SummonBarProps) {
  const [prompt, setPrompt] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { viewport } = useThree();

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to focus input
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsFocused(true);
      }
      // Escape to blur
      if (e.key === 'Escape') {
        inputRef.current?.blur();
        setIsFocused(false);
        setShowPreview(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && !isGenerating) {
      onSummon(prompt.trim());
      setShowPreview(true);
    }
  }, [prompt, isGenerating, onSummon]);

  const handleClear = useCallback(() => {
    setPrompt('');
    setShowPreview(false);
    inputRef.current?.focus();
  }, []);

  return (
    <Html
      position={[0, -viewport.height / 2 + 200, 200]}
      center
      style={{ pointerEvents: 'auto' }}
    >
      <div style={styles.container}>
        {/* Shortcut hint */}
        <div style={styles.shortcutHint}>
          ⌨️ Ctrl+Alt+S to toggle interaction
        </div>

        {/* Main input bar */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <div 
            style={{
              ...styles.inputWrapper,
              ...(isFocused ? styles.inputWrapperFocused : {}),
              ...(isGenerating ? styles.inputWrapperGenerating : {}),
            }}
            onClick={() => inputRef.current?.focus()}
          >
            {/* Glow effect */}
            <div style={{
              ...styles.glow,
              opacity: isFocused || isGenerating ? 1 : 0,
              background: isGenerating 
                ? 'radial-gradient(ellipse at center, rgba(255,0,255,0.3) 0%, transparent 70%)'
                : 'radial-gradient(ellipse at center, rgba(0,255,255,0.3) 0%, transparent 70%)',
            }} />
            
            {/* Icon */}
            <span style={styles.icon}>
              {isGenerating ? '⚡' : '✨'}
            </span>
            
            {/* Input */}
            <input
              ref={inputRef}
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={isGenerating ? 'Manifesting reality...' : 'Summon anything...'}
              disabled={isGenerating}
              style={styles.input}
            />
            
            {/* Clear button */}
            {prompt && !isGenerating && (
              <button type="button" onClick={handleClear} style={styles.clearBtn}>
                ✕
              </button>
            )}
            
            {/* Submit button */}
            <button 
              type="submit" 
              disabled={!prompt.trim() || isGenerating}
              style={{
                ...styles.submitBtn,
                opacity: prompt.trim() && !isGenerating ? 1 : 0.3,
              }}
            >
              {isGenerating ? (
                <span style={styles.spinner}>◌</span>
              ) : (
                '→'
              )}
            </button>
          </div>
        </form>

        {/* Streaming code preview */}
        {showPreview && streamingCode && (
          <div style={styles.preview}>
            <div style={styles.previewHeader}>
              <span style={styles.previewTitle}>
                {isGenerating ? '🔮 Channeling...' : '✓ Manifested'}
              </span>
              <span style={styles.previewLines}>
                {streamingCode.split('\n').length} lines
              </span>
            </div>
            <pre style={styles.previewCode}>
              {streamingCode.slice(-500)}
              {isGenerating && <span style={styles.cursor}>▌</span>}
            </pre>
          </div>
        )}

        {/* Hint text */}
        {!isGenerating && !showPreview && isFocused && (
          <div style={styles.hints}>
            <span style={styles.hint}>Try: "cyberpunk city with rain"</span>
            <span style={styles.hint}>Or: "floating bitcoin price tracker"</span>
            <span style={styles.hint}>Or: "particle galaxy with stars"</span>
          </div>
        )}
      </div>
    </Html>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
  },
  shortcutHint: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '11px',
    padding: '4px 12px',
    background: 'rgba(0, 0, 0, 0.5)',
    borderRadius: '12px',
    marginBottom: '4px',
  },
  form: {
    width: '100%',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 20px',
    background: 'rgba(10, 10, 20, 0.85)',
    backdropFilter: 'blur(20px)',
    borderRadius: '16px',
    border: '1px solid rgba(0, 255, 255, 0.2)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
    transition: 'all 0.3s ease',
    width: '500px',
    overflow: 'hidden',
    cursor: 'text',
    minHeight: '72px',
  },
  inputWrapperFocused: {
    border: '1px solid rgba(0, 255, 255, 0.5)',
    boxShadow: '0 8px 32px rgba(0, 255, 255, 0.15), inset 0 1px 0 rgba(255,255,255,0.05)',
  },
  inputWrapperGenerating: {
    border: '1px solid rgba(255, 0, 255, 0.5)',
    boxShadow: '0 8px 32px rgba(255, 0, 255, 0.15), inset 0 1px 0 rgba(255,255,255,0.05)',
  },
  glow: {
    position: 'absolute',
    top: '-50%',
    left: '-10%',
    right: '-10%',
    bottom: '-50%',
    transition: 'opacity 0.3s ease',
    pointerEvents: 'none',
  },
  icon: {
    fontSize: '20px',
    zIndex: 1,
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
  },
  clearBtn: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.4)',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '4px 8px',
    borderRadius: '4px',
    transition: 'all 0.2s ease',
    zIndex: 1,
  },
  submitBtn: {
    background: 'linear-gradient(135deg, #00ffff, #ff00ff)',
    border: 'none',
    borderRadius: '10px',
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: '18px',
    color: '#000',
    fontWeight: 'bold',
    transition: 'all 0.2s ease',
    zIndex: 1,
  },
  spinner: {
    display: 'inline-block',
    animation: 'spin 1s linear infinite',
  },
  preview: {
    width: '500px',
    background: 'rgba(10, 10, 20, 0.9)',
    backdropFilter: 'blur(20px)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 0, 255, 0.3)',
    overflow: 'hidden',
  },
  previewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 0, 255, 0.1)',
  },
  previewTitle: {
    color: '#ff00ff',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  previewLines: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '11px',
  },
  previewCode: {
    margin: 0,
    padding: '12px 16px',
    color: '#00ffff',
    fontSize: '11px',
    lineHeight: '1.4',
    maxHeight: '150px',
    overflowY: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  cursor: {
    color: '#ff00ff',
    animation: 'blink 1s step-end infinite',
  },
  hints: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  hint: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: '12px',
    padding: '6px 12px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '20px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
};

// Add CSS keyframes
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes blink {
    50% { opacity: 0; }
  }
  input::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }
`;
document.head.appendChild(styleSheet);
