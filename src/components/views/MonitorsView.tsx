/**
 * MONITORS VIEW — Multi-display background management
 * Set a different background glyph for each connected monitor
 * Beautiful goopy animations that match Loom's aesthetic
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import GlyphIframe from '../GlyphIframe';

interface MonitorDisplay {
  id: string;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  isPrimary: boolean;
  rotation: number;
}

interface MonitorBackground {
  displayId: string;
  glyphId?: string;
  code?: string;
  prompt?: string;
  type?: string;
}

interface GlyphManifest {
  id: string;
  name: string;
  type?: string;
  prompt?: string;
  savedAt?: string;
  files?: string[];
  entry?: string;
  icon?: string;
}

// Cache for glyph preview codes
const previewCodeCache = new Map<string, string>();

export default function MonitorsView() {
  const [displays, setDisplays] = useState<MonitorDisplay[]>([]);
  const [backgrounds, setBackgrounds] = useState<MonitorBackground[]>([]);
  const [selectedMonitors, setSelectedMonitors] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [glyphs, setGlyphs] = useState<GlyphManifest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isGlyphPickerOpen, setIsGlyphPickerOpen] = useState(false);
  const [hoveredGlyphId, setHoveredGlyphId] = useState<string | null>(null);
  const [hoveredPreviewCode, setHoveredPreviewCode] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previewLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load displays and backgrounds on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Load all displays
        const allDisplays = await window.loom?.getAllDisplays?.() || [];
        setDisplays(allDisplays);
        
        // Load saved backgrounds
        const bgState = await window.loom?.getMonitorBackgrounds?.();
        if (bgState) {
          setBackgrounds(bgState.backgrounds || []);
        }
        
        // Load available glyphs
        const loadedGlyphs = await window.loom?.loadGlyphs?.() || [];
        setGlyphs(loadedGlyphs as GlyphManifest[]);
        
        // Auto-select all monitors by default
        setSelectedMonitors(new Set(allDisplays.map(d => d.id)));
      } catch (error) {
        console.error('Failed to load monitors:', error);
      }
      setIsLoading(false);
    };
    
    loadData();
    
    return () => {
      if (previewLoadTimeoutRef.current) {
        clearTimeout(previewLoadTimeoutRef.current);
      }
    };
  }, []);

  // Get background for a specific display
  const getBackgroundForDisplay = useCallback((displayId: string) => {
    return backgrounds.find(b => b.displayId === displayId);
  }, [backgrounds]);

  // Get glyph by ID
  const getGlyphById = useCallback((glyphId: string) => {
    return glyphs.find(g => g.id === glyphId);
  }, [glyphs]);

  // Get all active backgrounds with their glyphs
  const activeBackgrounds = useMemo(() => {
    return backgrounds
      .map(bg => ({
        ...bg,
        glyph: bg.glyphId ? getGlyphById(bg.glyphId) : null,
        display: displays.find(d => d.id === bg.displayId),
      }))
      .filter(bg => bg.glyph && bg.display);
  }, [backgrounds, getGlyphById, displays]);

  // Load preview code for a glyph (with caching)
  const loadGlyphPreview = useCallback(async (glyphId: string) => {
    // Check cache first
    if (previewCodeCache.has(glyphId)) {
      setHoveredPreviewCode(previewCodeCache.get(glyphId) || null);
      return;
    }
    
    try {
      const glyph = getGlyphById(glyphId);
      if (!glyph) return;
      
      const entryFile = glyph.entry || glyph.files?.find(f => f.endsWith('.html')) || 'index.html';
      const code = await window.loom?.readGlyphFile?.(glyphId, entryFile);
      if (code) {
        previewCodeCache.set(glyphId, code);
        setHoveredPreviewCode(code);
      }
    } catch (error) {
      console.error('Failed to load glyph preview:', error);
      setHoveredPreviewCode(null);
    }
  }, [getGlyphById]);

  // Handle glyph hover with delayed preview loading
  const handleGlyphHover = useCallback((glyphId: string | null) => {
    if (previewLoadTimeoutRef.current) {
      clearTimeout(previewLoadTimeoutRef.current);
    }
    
    setHoveredGlyphId(glyphId);
    
    if (glyphId) {
      // Small delay to avoid loading previews for quick mouse movements
      previewLoadTimeoutRef.current = setTimeout(() => {
        loadGlyphPreview(glyphId);
      }, 100);
    } else {
      setHoveredPreviewCode(null);
    }
  }, [loadGlyphPreview]);

  // Toggle monitor selection
  const toggleMonitorSelection = useCallback((displayId: string) => {
    setSelectedMonitors(prev => {
      const next = new Set(prev);
      if (next.has(displayId)) {
        next.delete(displayId);
      } else {
        next.add(displayId);
      }
      return next;
    });
  }, []);

  // Select all monitors
  const selectAllMonitors = useCallback(() => {
    setSelectedMonitors(new Set(displays.map(d => d.id)));
  }, [displays]);

  // Apply background to selected monitors
  const applyBackgroundToMonitors = useCallback(async (glyphId: string) => {
    if (selectedMonitors.size === 0) return;
    
    setIsApplying(true);
    try {
      const glyph = getGlyphById(glyphId);
      if (!glyph) return;
      
      // Load the glyph code
      const entryFile = glyph.entry || glyph.files?.find(f => f.endsWith('.html')) || 'index.html';
      const code = await window.loom?.readGlyphFile?.(glyphId, entryFile);
      
      if (!code) {
        console.error('Failed to load glyph code');
        return;
      }
      
      // Apply to all selected monitors (each monitor has its own background window)
      const newBackgrounds: MonitorBackground[] = [];
      const promises = Array.from(selectedMonitors).map(async (displayId) => {
        await window.loom?.setMonitorBackground?.({
          displayId,
          glyphId,
          code,
          prompt: glyph.prompt || glyph.name,
          type: glyph.type,
        });
        
        newBackgrounds.push({
          displayId,
          glyphId,
          code,
          prompt: glyph.prompt || glyph.name,
          type: glyph.type,
        });
      });
      
      // Wait for all monitors to update in parallel
      await Promise.all(promises);
      
      // Update local state
      setBackgrounds(prev => {
        const updated = prev.filter(b => !selectedMonitors.has(b.displayId));
        return [...updated, ...newBackgrounds];
      });
      
      setApplySuccess(glyphId);
      setTimeout(() => setApplySuccess(null), 2000);
      setIsGlyphPickerOpen(false);
    } catch (error) {
      console.error('Failed to apply background:', error);
    }
    setIsApplying(false);
  }, [selectedMonitors, getGlyphById]);

  // Clear background from a specific monitor
  const clearMonitorBackground = useCallback(async (displayId: string) => {
    setIsApplying(true);
    try {
      await window.loom?.clearMonitorBackground?.(displayId);
      setBackgrounds(prev => prev.filter(b => b.displayId !== displayId));
    } catch (error) {
      console.error('Failed to clear background:', error);
    }
    setIsApplying(false);
  }, []);

  // Clear all backgrounds
  const clearAllBackgrounds = useCallback(async () => {
    setIsApplying(true);
    try {
      // Use the new clear-all IPC which clears all windows at once
      await window.loom?.clearAllMonitorBackgrounds?.();
      setBackgrounds([]);
    } catch (error) {
      console.error('Failed to clear backgrounds:', error);
    }
    setIsApplying(false);
  }, []);

  // Filter glyphs by search
  const filteredGlyphs = glyphs.filter(g => {
    const query = searchQuery.toLowerCase();
    return (
      g.name.toLowerCase().includes(query) ||
      g.prompt?.toLowerCase().includes(query) ||
      g.type?.toLowerCase().includes(query)
    );
  });

  // Calculate relative monitor positions for visualization
  const getMonitorLayout = useCallback(() => {
    if (displays.length === 0) return { monitors: [], scale: 1, offsetX: 0, offsetY: 0 };
    
    // Find bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    displays.forEach(d => {
      minX = Math.min(minX, d.bounds.x);
      minY = Math.min(minY, d.bounds.y);
      maxX = Math.max(maxX, d.bounds.x + d.bounds.width);
      maxY = Math.max(maxY, d.bounds.y + d.bounds.height);
    });
    
    const totalWidth = maxX - minX;
    const totalHeight = maxY - minY;
    const containerWidth = 800;
    const containerHeight = 180;
    
    const scaleX = (containerWidth - 40) / totalWidth;
    const scaleY = (containerHeight - 40) / totalHeight;
    const scale = Math.min(scaleX, scaleY, 0.12);
    
    return {
      monitors: displays.map(d => ({
        ...d,
        relX: (d.bounds.x - minX) * scale + 20,
        relY: (d.bounds.y - minY) * scale + 20,
        relWidth: d.bounds.width * scale,
        relHeight: d.bounds.height * scale,
      })),
      scale,
      offsetX: minX,
      offsetY: minY,
    };
  }, [displays]);

  const layout = getMonitorLayout();

  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingContainer}>
          <div style={styles.loadingSpinner}>
            <div style={styles.spinnerOrb} />
            <div style={styles.spinnerRing} />
          </div>
          <span style={styles.loadingText}>Detecting displays...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerIcon}>🖥️</span>
          <h2 style={styles.headerTitle}>Monitors</h2>
          <span style={styles.headerSubtitle}>{displays.length} display{displays.length !== 1 ? 's' : ''} detected</span>
        </div>
        <div style={styles.headerActions}>
          <button
            onClick={() => setIsGlyphPickerOpen(true)}
            style={styles.addBgBtn}
          >
            <span>+</span> Set Background
          </button>
        </div>
      </div>

      {/* Main content - full width scrollable */}
      <div style={styles.mainContent}>
        {/* Monitor Layout Visualization */}
        <div style={styles.layoutSection}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>Display Layout</span>
            <div style={styles.selectionControls}>
              <span style={styles.selectionCount}>
                {selectedMonitors.size} of {displays.length} selected
              </span>
              <button
                onClick={selectAllMonitors}
                style={styles.selectAllBtn}
              >
                Select All
              </button>
            </div>
          </div>
          <div style={styles.layoutContainer}>
            {layout.monitors.map((monitor, index) => {
              const bg = getBackgroundForDisplay(monitor.id);
              const glyph = bg?.glyphId ? getGlyphById(bg.glyphId) : null;
              const isSelected = selectedMonitors.has(monitor.id);
              
              return (
                <button
                  key={monitor.id}
                  onClick={() => toggleMonitorSelection(monitor.id)}
                  style={{
                    ...styles.monitorBox,
                    left: monitor.relX,
                    top: monitor.relY,
                    width: Math.max(monitor.relWidth, 80),
                    height: Math.max(monitor.relHeight, 50),
                    borderColor: isSelected 
                      ? 'rgba(0, 255, 255, 0.8)' 
                      : monitor.isPrimary 
                        ? 'rgba(255, 0, 255, 0.4)' 
                        : 'rgba(255, 255, 255, 0.2)',
                    background: isSelected
                      ? 'linear-gradient(135deg, rgba(0, 255, 255, 0.2), rgba(0, 200, 255, 0.1))'
                      : bg?.glyphId
                        ? 'linear-gradient(135deg, rgba(180, 100, 255, 0.15), rgba(120, 60, 180, 0.1))'
                        : 'rgba(20, 15, 30, 0.6)',
                    boxShadow: isSelected
                      ? '0 0 30px rgba(0, 255, 255, 0.4), inset 0 0 20px rgba(0, 255, 255, 0.08)'
                      : '0 4px 20px rgba(0, 0, 0, 0.3)',
                    transform: isSelected ? 'scale(1.03)' : 'scale(1)',
                  }}
                >
                  <div style={styles.monitorContent}>
                    <div style={styles.monitorLabel}>
                      <span style={styles.monitorNumber}>{index + 1}</span>
                      {monitor.isPrimary && <span style={styles.primaryBadge}>★</span>}
                      {isSelected && <span style={styles.selectedCheck}>✓</span>}
                    </div>
                    {glyph && (
                      <div style={styles.monitorGlyphPreview}>
                        <span style={styles.glyphIcon}>{glyph.icon || '✨'}</span>
                      </div>
                    )}
                    <div style={styles.monitorRes}>
                      {monitor.bounds.width}×{monitor.bounds.height}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Backgrounds Section */}
        <div style={styles.backgroundsSection}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>
              Active Backgrounds
              {activeBackgrounds.length > 0 && (
                <span style={styles.countBadge}>{activeBackgrounds.length}</span>
              )}
            </span>
            {activeBackgrounds.length > 0 && (
              <button
                onClick={clearAllBackgrounds}
                style={styles.clearAllBtn}
                disabled={isApplying}
              >
                Clear All
              </button>
            )}
          </div>
          
          {activeBackgrounds.length === 0 ? (
            <div style={styles.emptyBackgrounds}>
              <span style={styles.emptyBgIcon}>🌌</span>
              <span style={styles.emptyBgText}>No active backgrounds</span>
              <span style={styles.emptyBgHint}>Select monitors above and choose a glyph to set as background</span>
            </div>
          ) : (
            <div style={styles.backgroundsGrid}>
              {activeBackgrounds.map((bg, index) => (
                <div 
                  key={bg.displayId} 
                  style={{
                    ...styles.bgCard,
                    animationDelay: `${index * 0.1}s`,
                  }}
                >
                  <div style={styles.bgCardHeader}>
                    <div style={styles.bgCardMonitor}>
                      <span style={styles.bgCardMonitorIcon}>🖥️</span>
                      <span style={styles.bgCardMonitorName}>
                        {bg.display?.label || `Display ${bg.displayId}`}
                      </span>
                      {bg.display?.isPrimary && (
                        <span style={styles.bgCardPrimaryBadge}>Primary</span>
                      )}
                    </div>
                    <button
                      onClick={() => clearMonitorBackground(bg.displayId)}
                      style={styles.bgCardCloseBtn}
                      disabled={isApplying}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={styles.bgCardContent}>
                    <div style={styles.bgCardGlyph}>
                      <span style={styles.bgCardGlyphIcon}>{bg.glyph?.icon || '✨'}</span>
                      <div style={styles.bgCardGlyphInfo}>
                        <span style={styles.bgCardGlyphName}>{bg.glyph?.name}</span>
                        {bg.glyph?.type && (
                          <span style={styles.bgCardGlyphType}>{bg.glyph.type}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Glyph Picker Modal */}
      {isGlyphPickerOpen && (
        <div style={styles.pickerOverlay} onClick={() => setIsGlyphPickerOpen(false)}>
          <div 
            style={styles.pickerModal}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.pickerHeader}>
              <div style={styles.pickerHeaderLeft}>
                <h3 style={styles.pickerTitle}>Choose Background Glyph</h3>
                <span style={styles.pickerSubtitle}>
                  Will apply to {selectedMonitors.size} monitor{selectedMonitors.size !== 1 ? 's' : ''}
                </span>
              </div>
              <button
                onClick={() => setIsGlyphPickerOpen(false)}
                style={styles.pickerCloseBtn}
              >
                ✕
              </button>
            </div>
            
            {/* Search */}
            <div style={styles.searchContainer}>
              <span style={styles.searchIcon}>🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search glyphs..."
                style={styles.searchInput}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={styles.searchClear}
                >
                  ✕
                </button>
              )}
            </div>
            
            {/* Glyph Grid with Preview */}
            <div ref={scrollRef} style={styles.glyphGridContainer}>
              {filteredGlyphs.length === 0 ? (
                <div style={styles.emptyState}>
                  <span style={styles.emptyStateIcon}>🔮</span>
                  <span style={styles.emptyStateText}>
                    {searchQuery ? 'No glyphs match your search' : 'No glyphs found'}
                  </span>
                </div>
              ) : (
                <div style={styles.glyphGrid}>
                  {filteredGlyphs.map((glyph) => {
                    const isHovered = hoveredGlyphId === glyph.id;
                    const isSuccess = applySuccess === glyph.id;
                    
                    return (
                      <div
                        key={glyph.id}
                        style={{
                          ...styles.glyphCardWrapper,
                          zIndex: isHovered ? 100 : 1,
                        }}
                      >
                        <button
                          onClick={() => applyBackgroundToMonitors(glyph.id)}
                          onMouseEnter={() => handleGlyphHover(glyph.id)}
                          onMouseLeave={() => handleGlyphHover(null)}
                          disabled={isApplying}
                          style={{
                            ...styles.glyphCard,
                            ...(isHovered ? styles.glyphCardHovered : {}),
                            ...(isSuccess ? styles.glyphCardSuccess : {}),
                          }}
                        >
                          {/* Success overlay */}
                          {isSuccess && (
                            <div style={styles.successOverlay}>
                              <span style={styles.successIcon}>✓</span>
                            </div>
                          )}
                          
                          {/* Preview iframe - shows on hover */}
                          {isHovered && hoveredPreviewCode && (
                            <div style={styles.glyphPreviewContainer}>
                              <GlyphIframe
                                code={hoveredPreviewCode}
                                glyphId={glyph.id}
                                glyphType="background"
                                title={glyph.name}
                                allowPointerEvents={false}
                              />
                              <div style={styles.glyphPreviewOverlay} />
                            </div>
                          )}
                          
                          {/* Glyph info */}
                          <div style={{
                            ...styles.glyphCardInner,
                            ...(isHovered && hoveredPreviewCode ? styles.glyphCardInnerWithPreview : {}),
                          }}>
                            <div style={styles.glyphCardIcon}>
                              {glyph.icon || '✨'}
                            </div>
                            <div style={styles.glyphCardInfo}>
                              <span style={styles.glyphCardName}>{glyph.name}</span>
                              {glyph.type && (
                                <span style={styles.glyphCardType}>{glyph.type}</span>
                              )}
                            </div>
                            {isHovered && (
                              <div style={styles.glyphCardHint}>
                                Click to apply
                              </div>
                            )}
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes monitorPulse {
          0%, 100% {
            box-shadow: 0 0 30px rgba(0, 255, 255, 0.3), inset 0 0 20px rgba(0, 255, 255, 0.05);
          }
          50% {
            box-shadow: 0 0 50px rgba(0, 255, 255, 0.5), inset 0 0 30px rgba(0, 255, 255, 0.1);
          }
        }
        
        @keyframes goopySlideIn {
          0% {
            opacity: 0;
            transform: translateY(30px) scale(0.9);
            filter: blur(10px);
          }
          40% {
            opacity: 0.8;
            transform: translateY(-5px) scale(1.02);
            filter: blur(2px);
          }
          70% {
            transform: translateY(3px) scale(0.99);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }
        
        @keyframes goopyModalIn {
          0% {
            opacity: 0;
            transform: scale(0.5) translateY(50px);
            filter: blur(20px);
          }
          50% {
            opacity: 0.9;
            transform: scale(1.05) translateY(-10px);
            filter: blur(3px);
          }
          75% {
            transform: scale(0.98) translateY(5px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
            filter: blur(0);
          }
        }
        
        @keyframes goopyExpand {
          0% {
            height: 120px;
            transform: scale(1);
            filter: blur(0);
          }
          30% {
            height: 200px;
            transform: scale(1.08);
            filter: blur(2px);
          }
          60% {
            height: 280px;
            transform: scale(1.02);
            filter: blur(0);
          }
          80% {
            height: 295px;
            transform: scale(0.99);
          }
          100% {
            height: 300px;
            transform: scale(1);
            filter: blur(0);
          }
        }
        
        @keyframes goopyCollapse {
          0% {
            height: 300px;
            transform: scale(1);
          }
          30% {
            height: 180px;
            transform: scale(1.05);
            filter: blur(1px);
          }
          60% {
            height: 100px;
            transform: scale(0.98);
          }
          100% {
            height: 120px;
            transform: scale(1);
            filter: blur(0);
          }
        }
        
        @keyframes previewFadeIn {
          0% {
            opacity: 0;
            transform: scale(0.8);
            filter: blur(10px);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.05);
            filter: blur(2px);
          }
          100% {
            opacity: 1;
            transform: scale(1);
            filter: blur(0);
          }
        }
        
        @keyframes spinnerPulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.8;
          }
          50% {
            transform: scale(1.2);
            opacity: 1;
          }
        }
        
        @keyframes spinnerRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes successPop {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          50% {
            transform: scale(1.3);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        
        @keyframes bgCardIn {
          0% {
            opacity: 0;
            transform: translateY(20px) scale(0.9);
            filter: blur(8px);
          }
          50% {
            opacity: 0.8;
            transform: translateY(-3px) scale(1.02);
            filter: blur(2px);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 STYLES — Matching Loom's cyberpunk aesthetic
// ═══════════════════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    background: 'linear-gradient(180deg, rgba(12, 8, 24, 0.98) 0%, rgba(8, 5, 18, 0.99) 100%)',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    color: '#fff',
    overflow: 'hidden',
  },
  
  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  headerIcon: {
    fontSize: '24px',
    filter: 'drop-shadow(0 0 10px rgba(0, 255, 255, 0.5))',
  },
  headerTitle: {
    fontSize: '18px',
    fontWeight: 700,
    margin: 0,
    background: 'linear-gradient(135deg, #00ffff, #ff00ff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    letterSpacing: '1px',
  },
  headerSubtitle: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
    marginLeft: '8px',
  },
  headerActions: {
    display: 'flex',
    gap: '10px',
  },
  addBgBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 18px',
    background: 'linear-gradient(135deg, rgba(0, 255, 255, 0.15), rgba(0, 200, 255, 0.1))',
    border: '1px solid rgba(0, 255, 255, 0.4)',
    borderRadius: '10px',
    color: '#00ffff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
    fontFamily: 'inherit',
  },
  
  // Main content
  mainContent: {
    flex: 1,
    overflow: 'auto',
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  
  // Section styling
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: 'rgba(255, 255, 255, 0.6)',
    textTransform: 'uppercase',
    letterSpacing: '1.5px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  countBadge: {
    padding: '2px 8px',
    background: 'rgba(0, 255, 255, 0.15)',
    border: '1px solid rgba(0, 255, 255, 0.3)',
    borderRadius: '10px',
    fontSize: '10px',
    color: '#00ffff',
  },
  
  // Layout section
  layoutSection: {
    animation: 'goopySlideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
  },
  selectionControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  selectionCount: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  selectAllBtn: {
    padding: '6px 12px',
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '6px',
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: '11px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
  layoutContainer: {
    position: 'relative',
    width: '100%',
    height: '180px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  monitorBox: {
    position: 'absolute',
    border: '2px solid',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'inherit',
  },
  monitorContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  monitorLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  monitorNumber: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  primaryBadge: {
    color: '#ff00ff',
    fontSize: '10px',
    filter: 'drop-shadow(0 0 4px rgba(255, 0, 255, 0.5))',
  },
  selectedCheck: {
    color: '#00ffff',
    fontSize: '12px',
    fontWeight: 700,
    filter: 'drop-shadow(0 0 4px rgba(0, 255, 255, 0.5))',
  },
  monitorGlyphPreview: {
    fontSize: '14px',
  },
  glyphIcon: {
    filter: 'drop-shadow(0 0 4px rgba(180, 100, 255, 0.5))',
  },
  monitorRes: {
    fontSize: '9px',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  
  // Backgrounds section
  backgroundsSection: {
    animation: 'goopySlideIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
    animationDelay: '0.1s',
    opacity: 0,
    animationFillMode: 'forwards',
  },
  clearAllBtn: {
    padding: '6px 12px',
    background: 'rgba(255, 50, 50, 0.1)',
    border: '1px solid rgba(255, 50, 50, 0.3)',
    borderRadius: '6px',
    color: 'rgba(255, 100, 100, 0.8)',
    fontSize: '11px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
  emptyBackgrounds: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    padding: '40px',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: '16px',
    border: '2px dashed rgba(255, 255, 255, 0.1)',
  },
  emptyBgIcon: {
    fontSize: '40px',
    opacity: 0.4,
  },
  emptyBgText: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  emptyBgHint: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.3)',
    textAlign: 'center',
  },
  backgroundsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '12px',
  },
  bgCard: {
    background: 'linear-gradient(135deg, rgba(180, 100, 255, 0.08), rgba(120, 60, 180, 0.05))',
    border: '1px solid rgba(180, 100, 255, 0.25)',
    borderRadius: '12px',
    overflow: 'hidden',
    animation: 'bgCardIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
    opacity: 0,
    animationFillMode: 'forwards',
  },
  bgCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    background: 'rgba(0, 0, 0, 0.2)',
  },
  bgCardMonitor: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  bgCardMonitorIcon: {
    fontSize: '14px',
  },
  bgCardMonitorName: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  bgCardPrimaryBadge: {
    fontSize: '9px',
    padding: '2px 6px',
    background: 'rgba(255, 0, 255, 0.15)',
    border: '1px solid rgba(255, 0, 255, 0.3)',
    borderRadius: '8px',
    color: '#ff66ff',
  },
  bgCardCloseBtn: {
    width: '24px',
    height: '24px',
    background: 'rgba(255, 50, 50, 0.1)',
    border: '1px solid rgba(255, 50, 50, 0.3)',
    borderRadius: '6px',
    color: 'rgba(255, 100, 100, 0.8)',
    fontSize: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  },
  bgCardContent: {
    padding: '12px',
  },
  bgCardGlyph: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  bgCardGlyphIcon: {
    fontSize: '24px',
    filter: 'drop-shadow(0 0 6px rgba(180, 100, 255, 0.4))',
  },
  bgCardGlyphInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  bgCardGlyphName: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#fff',
  },
  bgCardGlyphType: {
    fontSize: '10px',
    color: 'rgba(180, 100, 255, 0.7)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  
  // Glyph Picker Modal
  pickerOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.8)',
    backdropFilter: 'blur(12px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    animation: 'fadeIn 0.3s ease',
  },
  pickerModal: {
    width: 'min(95%, 900px)',
    maxHeight: '85vh',
    background: 'linear-gradient(135deg, rgba(20, 15, 35, 0.98), rgba(12, 8, 24, 0.99))',
    borderRadius: '24px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 30px 100px rgba(0, 0, 0, 0.6), 0 0 80px rgba(180, 100, 255, 0.15)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    animation: 'goopyModalIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
  },
  pickerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  pickerHeaderLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  pickerTitle: {
    fontSize: '18px',
    fontWeight: 700,
    margin: 0,
    background: 'linear-gradient(135deg, #00ffff, #ff00ff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  pickerSubtitle: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  pickerCloseBtn: {
    width: '36px',
    height: '36px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '10px',
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: '16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  },
  
  // Search
  searchContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    background: 'rgba(0, 0, 0, 0.2)',
  },
  searchIcon: {
    fontSize: '16px',
    opacity: 0.5,
  },
  searchInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#fff',
    fontSize: '14px',
    fontFamily: 'inherit',
  },
  searchClear: {
    width: '24px',
    height: '24px',
    background: 'transparent',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: '12px',
    cursor: 'pointer',
    borderRadius: '6px',
  },
  
  // Glyph Grid
  glyphGridContainer: {
    flex: 1,
    overflow: 'auto',
    padding: '20px',
  },
  glyphGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '16px',
  },
  glyphCardWrapper: {
    position: 'relative',
  },
  glyphCard: {
    position: 'relative',
    width: '100%',
    height: '120px',
    padding: '0',
    borderRadius: '14px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(20, 15, 30, 0.6)',
    cursor: 'pointer',
    transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
    fontFamily: 'inherit',
    overflow: 'hidden',
  },
  glyphCardHovered: {
    height: '300px',
    borderColor: 'rgba(0, 255, 255, 0.5)',
    background: 'linear-gradient(135deg, rgba(0, 255, 255, 0.1), rgba(0, 200, 255, 0.05))',
    boxShadow: '0 20px 60px rgba(0, 255, 255, 0.25), 0 0 40px rgba(0, 255, 255, 0.1)',
    transform: 'translateY(-8px)',
    animation: 'goopyExpand 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  glyphCardSuccess: {
    borderColor: 'rgba(0, 255, 128, 0.6)',
    background: 'linear-gradient(135deg, rgba(0, 255, 128, 0.15), rgba(0, 200, 100, 0.08))',
  },
  glyphPreviewContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '180px',
    borderRadius: '12px 12px 0 0',
    overflow: 'hidden',
    animation: 'previewFadeIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  glyphPreviewOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, transparent 60%, rgba(12, 8, 24, 0.95) 100%)',
    pointerEvents: 'none',
  },
  glyphCardInner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    background: 'transparent',
    transition: 'all 0.3s ease',
  },
  glyphCardInnerWithPreview: {
    background: 'linear-gradient(180deg, transparent, rgba(12, 8, 24, 0.95) 30%)',
    paddingTop: '30px',
  },
  glyphCardIcon: {
    fontSize: '32px',
    filter: 'drop-shadow(0 0 8px rgba(180, 100, 255, 0.4))',
    transition: 'all 0.3s ease',
  },
  glyphCardInfo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  glyphCardName: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#fff',
    textAlign: 'center',
  },
  glyphCardType: {
    fontSize: '10px',
    color: 'rgba(180, 100, 255, 0.7)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  glyphCardHint: {
    fontSize: '10px',
    color: 'rgba(0, 255, 255, 0.7)',
    fontWeight: 600,
    marginTop: '4px',
  },
  successOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0, 255, 128, 0.2)',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'successPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
    zIndex: 10,
  },
  successIcon: {
    fontSize: '48px',
    color: '#00ff80',
    filter: 'drop-shadow(0 0 15px rgba(0, 255, 128, 0.6))',
  },
  
  // Empty state
  emptyState: {
    gridColumn: '1 / -1',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '60px',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  emptyStateIcon: {
    fontSize: '48px',
    opacity: 0.5,
  },
  emptyStateText: {
    fontSize: '14px',
  },
  
  // Loading
  loadingContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '20px',
  },
  loadingSpinner: {
    position: 'relative',
    width: '60px',
    height: '60px',
  },
  spinnerOrb: {
    position: 'absolute',
    inset: '15px',
    background: 'radial-gradient(circle, rgba(0, 255, 255, 0.8), rgba(180, 100, 255, 0.6))',
    borderRadius: '50%',
    animation: 'spinnerPulse 1.5s ease-in-out infinite',
  },
  spinnerRing: {
    position: 'absolute',
    inset: 0,
    border: '3px solid transparent',
    borderTopColor: 'rgba(0, 255, 255, 0.6)',
    borderRightColor: 'rgba(255, 0, 255, 0.4)',
    borderRadius: '50%',
    animation: 'spinnerRotate 1s linear infinite',
  },
  loadingText: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: '1px',
  },
};
