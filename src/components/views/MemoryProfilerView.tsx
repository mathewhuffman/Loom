/**
 * LOOM MEMORY PROFILER — Deep RAM Analysis Tool
 * Press Ctrl+Shift+P to toggle this view
 * 
 * Displays comprehensive memory usage across all app processes:
 * - Main process (Electron core)
 * - Renderer processes (UI, glyphs)
 * - GPU process
 * - Utility processes
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface MemoryEntry {
  id: string;
  name: string;
  type: 'main-process' | 'renderer' | 'webview' | 'gpu' | 'utility' | 'shared';
  category: string;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  details: string;
  processId?: number;
  windowTitle?: string;
  url?: string;
}

interface MemorySnapshot {
  timestamp: number;
  entries: MemoryEntry[];
  totalHeap: number;
  totalRss: number;
  systemFreeMemory: number;
  systemTotalMemory: number;
}

interface HeapStats {
  total_heap_size: number;
  total_heap_size_executable: number;
  total_physical_size: number;
  total_available_size: number;
  used_heap_size: number;
  heap_size_limit: number;
  malloced_memory: number;
  peak_malloced_memory: number;
  does_zap_garbage: number;
  number_of_native_contexts: number;
  number_of_detached_contexts: number;
}

interface HeapSpace {
  space_name: string;
  space_size: number;
  space_used_size: number;
  space_available_size: number;
  physical_space_size: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
  container: {
    position: 'fixed' as const,
    inset: 0,
    background: 'linear-gradient(135deg, #0a0a0f 0%, #12121a 50%, #0d0d14 100%)',
    color: '#e0e0e8',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    fontSize: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    background: 'linear-gradient(180deg, rgba(20, 20, 30, 0.95) 0%, rgba(15, 15, 22, 0.9) 100%)',
    borderBottom: '1px solid rgba(100, 200, 255, 0.15)',
    WebkitAppRegion: 'drag' as any,
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '16px',
    fontWeight: 600,
    color: '#64d8ff',
    textShadow: '0 0 20px rgba(100, 216, 255, 0.4)',
  },
  headerActions: {
    display: 'flex',
    gap: '10px',
    WebkitAppRegion: 'no-drag' as any,
  },
  button: {
    padding: '8px 16px',
    background: 'linear-gradient(135deg, rgba(100, 200, 255, 0.15) 0%, rgba(100, 200, 255, 0.08) 100%)',
    border: '1px solid rgba(100, 200, 255, 0.3)',
    borderRadius: '6px',
    color: '#64d8ff',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 500,
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
  buttonDanger: {
    background: 'linear-gradient(135deg, rgba(255, 100, 100, 0.15) 0%, rgba(255, 100, 100, 0.08) 100%)',
    border: '1px solid rgba(255, 100, 100, 0.3)',
    color: '#ff6b6b',
  },
  buttonClose: {
    background: 'transparent',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: '20px',
    padding: '4px 8px',
    lineHeight: 1,
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '20px',
    gap: '16px',
    overflow: 'auto',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '12px',
  },
  statCard: {
    padding: '16px 20px',
    background: 'linear-gradient(135deg, rgba(30, 30, 45, 0.8) 0%, rgba(20, 20, 32, 0.8) 100%)',
    border: '1px solid rgba(100, 200, 255, 0.1)',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  statLabel: {
    fontSize: '10px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#888',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#fff',
  },
  statSubtext: {
    fontSize: '10px',
    color: '#666',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#64d8ff',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  entriesGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  entryCard: {
    padding: '14px 18px',
    background: 'linear-gradient(135deg, rgba(25, 25, 38, 0.9) 0%, rgba(18, 18, 28, 0.9) 100%)',
    border: '1px solid rgba(100, 200, 255, 0.08)',
    borderRadius: '8px',
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: '12px',
    alignItems: 'center',
    transition: 'all 0.2s ease',
  },
  entryInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  entryName: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#e0e0e8',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  entryDetails: {
    fontSize: '10px',
    color: '#666',
    maxWidth: '500px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  entryMeta: {
    fontSize: '10px',
    color: '#555',
    display: 'flex',
    gap: '12px',
    marginTop: '4px',
  },
  entryMemory: {
    textAlign: 'right' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  memoryValue: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#fff',
  },
  memoryBar: {
    width: '120px',
    height: '4px',
    background: 'rgba(100, 200, 255, 0.1)',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  memoryBarFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.3s ease',
  },
  badge: {
    display: 'inline-flex',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '9px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
  },
  heapSection: {
    marginTop: '16px',
    padding: '16px',
    background: 'rgba(20, 20, 30, 0.5)',
    borderRadius: '10px',
    border: '1px solid rgba(100, 200, 255, 0.08)',
  },
  heapGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '8px',
    marginTop: '12px',
  },
  heapSpace: {
    padding: '10px 14px',
    background: 'rgba(30, 30, 45, 0.5)',
    borderRadius: '6px',
    border: '1px solid rgba(100, 200, 255, 0.05)',
  },
  refreshIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '10px',
    color: '#555',
  },
  timestamp: {
    fontSize: '10px',
    color: '#444',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function formatBytes(bytes: number): string {
  if (bytes < 0) return '0 B';
  if (bytes < 1024) return bytes.toFixed(0) + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function getTypeColor(type: MemoryEntry['type']): string {
  switch (type) {
    case 'main-process': return '#64d8ff';
    case 'renderer': return '#a855f7';
    case 'gpu': return '#22c55e';
    case 'utility': return '#f59e0b';
    case 'shared': return '#6b7280';
    case 'webview': return '#ec4899';
    default: return '#888';
  }
}

function getCategoryColor(category: string): string {
  switch (category) {
    case 'Core': return '#64d8ff';
    case 'UI': return '#a855f7';
    case 'Wallpaper': return '#22c55e';
    case 'Glyph': return '#f472b6';
    case 'Graphics': return '#f59e0b';
    case 'Debug': return '#6b7280';
    default: return '#888';
  }
}

function getTypeLabel(type: MemoryEntry['type']): string {
  switch (type) {
    case 'main-process': return 'MAIN';
    case 'renderer': return 'RENDERER';
    case 'gpu': return 'GPU';
    case 'utility': return 'UTILITY';
    case 'shared': return 'SHARED';
    case 'webview': return 'WEBVIEW';
    default: return type.toUpperCase();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧠 MEMORY PROFILER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function MemoryProfilerView() {
  const [snapshot, setSnapshot] = useState<MemorySnapshot | null>(null);
  const [heapStats, setHeapStats] = useState<HeapStats | null>(null);
  const [heapSpaces, setHeapSpaces] = useState<HeapSpace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(2000);
  const [showHeapDetails, setShowHeapDetails] = useState(false);
  const [gcStatus, setGcStatus] = useState<'idle' | 'running' | 'done' | 'unavailable'>('idle');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [history, setHistory] = useState<{ timestamp: number; totalRss: number }[]>([]);

  const fetchSnapshot = useCallback(async () => {
    try {
      const result = await (window as any).loom?.getMemorySnapshot?.();
      if (result?.success && result.snapshot) {
        setSnapshot(result.snapshot);
        setHistory(prev => {
          const newHistory = [...prev, { timestamp: result.snapshot.timestamp, totalRss: result.snapshot.totalRss }];
          // Keep last 60 data points (2 minutes at 2s interval)
          return newHistory.slice(-60);
        });
      }
    } catch (err) {
      console.error('[MemoryProfiler] Failed to fetch snapshot:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchHeapStats = useCallback(async () => {
    try {
      const result = await (window as any).loom?.getHeapStats?.();
      if (result?.success) {
        setHeapStats(result.stats);
        setHeapSpaces(result.spaces || []);
      }
    } catch (err) {
      console.error('[MemoryProfiler] Failed to fetch heap stats:', err);
    }
  }, []);

  const forceGC = useCallback(async () => {
    setGcStatus('running');
    try {
      const result = await (window as any).loom?.forceGarbageCollection?.();
      if (result?.success) {
        setGcStatus('done');
        // Refresh snapshot after GC
        setTimeout(fetchSnapshot, 500);
        setTimeout(() => setGcStatus('idle'), 2000);
      } else {
        setGcStatus('unavailable');
        setTimeout(() => setGcStatus('idle'), 3000);
      }
    } catch (err) {
      setGcStatus('unavailable');
      setTimeout(() => setGcStatus('idle'), 3000);
    }
  }, [fetchSnapshot]);

  // Initial fetch
  useEffect(() => {
    fetchSnapshot();
    fetchHeapStats();
  }, [fetchSnapshot, fetchHeapStats]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchSnapshot, refreshInterval);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, refreshInterval, fetchSnapshot]);

  const handleClose = () => {
    window.close();
  };

  const maxRss = snapshot?.entries.reduce((max, e) => Math.max(max, e.rss), 0) || 1;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.title}>
          <span style={{ fontSize: '24px' }}>🧠</span>
          <span>Memory Profiler</span>
          <span style={{ fontSize: '10px', color: '#555', fontWeight: 400 }}>Ctrl+Shift+P to toggle</span>
        </div>
        <div style={styles.headerActions}>
          <div style={styles.refreshIndicator}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Auto-refresh</span>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              style={{
                background: 'rgba(30, 30, 45, 0.8)',
                border: '1px solid rgba(100, 200, 255, 0.2)',
                color: '#aaa',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '10px',
              }}
            >
              <option value={1000}>1s</option>
              <option value={2000}>2s</option>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
            </select>
          </div>
          <button
            style={styles.button}
            onClick={fetchSnapshot}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(100, 200, 255, 0.25) 0%, rgba(100, 200, 255, 0.15) 100%)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(100, 200, 255, 0.15) 0%, rgba(100, 200, 255, 0.08) 100%)';
            }}
          >
            ⟳ Refresh Now
          </button>
          <button
            style={{ ...styles.button, ...styles.buttonDanger }}
            onClick={forceGC}
            disabled={gcStatus === 'running'}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 100, 100, 0.25) 0%, rgba(255, 100, 100, 0.15) 100%)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 100, 100, 0.15) 0%, rgba(255, 100, 100, 0.08) 100%)';
            }}
          >
            {gcStatus === 'running' ? '⏳ Running...' : 
             gcStatus === 'done' ? '✓ GC Complete' :
             gcStatus === 'unavailable' ? '⚠ Not Available' : '🗑️ Force GC'}
          </button>
          <button
            style={styles.buttonClose}
            onClick={handleClose}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ff6b6b'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', color: '#555' }}>
            Loading memory data...
          </div>
        ) : snapshot ? (
          <>
            {/* Summary Stats */}
            <div style={styles.statsRow}>
              <div style={styles.statCard}>
                <span style={styles.statLabel}>Total Memory Used</span>
                <span style={{ ...styles.statValue, color: '#64d8ff' }}>{formatBytes(snapshot.totalRss)}</span>
                <span style={styles.statSubtext}>Resident Set Size (all processes)</span>
              </div>
              <div style={styles.statCard}>
                <span style={styles.statLabel}>Heap Memory</span>
                <span style={{ ...styles.statValue, color: '#a855f7' }}>{formatBytes(snapshot.totalHeap)}</span>
                <span style={styles.statSubtext}>JavaScript heap allocations</span>
              </div>
              <div style={styles.statCard}>
                <span style={styles.statLabel}>System Free</span>
                <span style={{ ...styles.statValue, color: '#22c55e' }}>{formatBytes(snapshot.systemFreeMemory)}</span>
                <span style={styles.statSubtext}>Available system RAM</span>
              </div>
              <div style={styles.statCard}>
                <span style={styles.statLabel}>Process Count</span>
                <span style={{ ...styles.statValue, color: '#f59e0b' }}>{snapshot.entries.length}</span>
                <span style={styles.statSubtext}>Active Electron processes</span>
              </div>
            </div>

            {/* Memory Trend Mini Chart */}
            {history.length > 2 && (
              <div style={{ 
                padding: '12px 16px',
                background: 'rgba(20, 20, 30, 0.5)',
                borderRadius: '8px',
                border: '1px solid rgba(100, 200, 255, 0.08)',
              }}>
                <div style={{ fontSize: '10px', color: '#666', marginBottom: '8px' }}>
                  Memory Trend (last {Math.min(history.length, 60)} samples)
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', height: '40px', gap: '2px' }}>
                  {history.map((point, i) => {
                    const maxVal = Math.max(...history.map(h => h.totalRss));
                    const minVal = Math.min(...history.map(h => h.totalRss));
                    const range = maxVal - minVal || 1;
                    const heightPercent = ((point.totalRss - minVal) / range) * 100;
                    return (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          minWidth: '3px',
                          maxWidth: '8px',
                          height: `${Math.max(10, heightPercent)}%`,
                          background: i === history.length - 1 
                            ? 'linear-gradient(180deg, #64d8ff 0%, #4aa8cc 100%)'
                            : 'linear-gradient(180deg, rgba(100, 200, 255, 0.4) 0%, rgba(100, 200, 255, 0.2) 100%)',
                          borderRadius: '2px 2px 0 0',
                        }}
                        title={`${formatBytes(point.totalRss)} at ${new Date(point.timestamp).toLocaleTimeString()}`}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Process List */}
            <div>
              <div style={styles.sectionTitle}>
                <span>📊</span>
                <span>Process Memory Breakdown</span>
                <span style={styles.timestamp}>
                  Last updated: {new Date(snapshot.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div style={styles.entriesGrid}>
                {snapshot.entries.map((entry) => {
                  const percentage = (entry.rss / maxRss) * 100;
                  const typeColor = getTypeColor(entry.type);
                  const categoryColor = getCategoryColor(entry.category);
                  
                  return (
                    <div
                      key={entry.id}
                      style={styles.entryCard}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(100, 200, 255, 0.2)';
                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(30, 30, 45, 0.9) 0%, rgba(22, 22, 35, 0.9) 100%)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(100, 200, 255, 0.08)';
                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(25, 25, 38, 0.9) 0%, rgba(18, 18, 28, 0.9) 100%)';
                      }}
                    >
                      <div style={styles.entryInfo}>
                        <div style={styles.entryName}>
                          <span
                            style={{
                              ...styles.badge,
                              background: `${typeColor}20`,
                              color: typeColor,
                              border: `1px solid ${typeColor}40`,
                            }}
                          >
                            {getTypeLabel(entry.type)}
                          </span>
                          <span
                            style={{
                              ...styles.badge,
                              background: `${categoryColor}15`,
                              color: categoryColor,
                              border: `1px solid ${categoryColor}30`,
                            }}
                          >
                            {entry.category}
                          </span>
                          <span>{entry.name}</span>
                        </div>
                        <div style={styles.entryDetails}>
                          💡 {entry.details}
                        </div>
                        <div style={styles.entryMeta}>
                          {entry.processId && <span>PID: {entry.processId}</span>}
                          {entry.url && <span title={entry.url}>URL: {entry.url.slice(0, 40)}...</span>}
                        </div>
                      </div>
                      <div style={styles.entryMemory}>
                        <div style={styles.memoryValue}>{formatBytes(entry.rss)}</div>
                        <div style={styles.memoryBar}>
                          <div
                            style={{
                              ...styles.memoryBarFill,
                              width: `${percentage}%`,
                              background: `linear-gradient(90deg, ${typeColor} 0%, ${typeColor}88 100%)`,
                            }}
                          />
                        </div>
                              <div style={{ fontSize: '9px', color: '#555', marginTop: '2px' }}>
                                {entry.arrayBuffers > 0 ? (
                                  <>Private: {formatBytes(entry.arrayBuffers)}</>
                                ) : (
                                  <>Heap: {formatBytes(entry.heapUsed)} / {formatBytes(entry.heapTotal)}</>
                                )}
                              </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* V8 Heap Details (Collapsible) */}
            <div style={styles.heapSection}>
              <div
                style={{ ...styles.sectionTitle, cursor: 'pointer' }}
                onClick={() => {
                  setShowHeapDetails(!showHeapDetails);
                  if (!showHeapDetails && !heapStats) {
                    fetchHeapStats();
                  }
                }}
              >
                <span>{showHeapDetails ? '▼' : '▶'}</span>
                <span>🔬 V8 Heap Details (Main Process)</span>
                <span style={{ fontSize: '10px', color: '#555', fontWeight: 400 }}>
                  Click to {showHeapDetails ? 'collapse' : 'expand'}
                </span>
              </div>
              
              {showHeapDetails && heapStats && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginTop: '12px' }}>
                    <div style={{ padding: '10px', background: 'rgba(30, 30, 45, 0.5)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '10px', color: '#666' }}>Used Heap Size</div>
                      <div style={{ fontSize: '18px', fontWeight: 600, color: '#64d8ff' }}>
                        {formatBytes(heapStats.used_heap_size)}
                      </div>
                    </div>
                    <div style={{ padding: '10px', background: 'rgba(30, 30, 45, 0.5)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '10px', color: '#666' }}>Total Heap Size</div>
                      <div style={{ fontSize: '18px', fontWeight: 600, color: '#a855f7' }}>
                        {formatBytes(heapStats.total_heap_size)}
                      </div>
                    </div>
                    <div style={{ padding: '10px', background: 'rgba(30, 30, 45, 0.5)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '10px', color: '#666' }}>Heap Size Limit</div>
                      <div style={{ fontSize: '18px', fontWeight: 600, color: '#22c55e' }}>
                        {formatBytes(heapStats.heap_size_limit)}
                      </div>
                    </div>
                    <div style={{ padding: '10px', background: 'rgba(30, 30, 45, 0.5)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '10px', color: '#666' }}>Malloced Memory</div>
                      <div style={{ fontSize: '18px', fontWeight: 600, color: '#f59e0b' }}>
                        {formatBytes(heapStats.malloced_memory)}
                      </div>
                    </div>
                    <div style={{ padding: '10px', background: 'rgba(30, 30, 45, 0.5)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '10px', color: '#666' }}>Native Contexts</div>
                      <div style={{ fontSize: '18px', fontWeight: 600, color: '#ec4899' }}>
                        {heapStats.number_of_native_contexts}
                      </div>
                    </div>
                    <div style={{ padding: '10px', background: 'rgba(30, 30, 45, 0.5)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '10px', color: '#666' }}>Detached Contexts</div>
                      <div style={{ fontSize: '18px', fontWeight: 600, color: heapStats.number_of_detached_contexts > 0 ? '#ff6b6b' : '#22c55e' }}>
                        {heapStats.number_of_detached_contexts}
                        {heapStats.number_of_detached_contexts > 0 && (
                          <span style={{ fontSize: '10px', color: '#ff6b6b', marginLeft: '6px' }}>⚠ Potential leak!</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Heap Spaces */}
                  {heapSpaces.length > 0 && (
                    <>
                      <div style={{ fontSize: '11px', color: '#888', marginTop: '16px', marginBottom: '8px' }}>
                        Heap Space Breakdown
                      </div>
                      <div style={styles.heapGrid}>
                        {heapSpaces.map((space) => {
                          const usagePercent = space.space_size > 0 
                            ? (space.space_used_size / space.space_size) * 100 
                            : 0;
                          const isHighUsage = usagePercent > 80;
                          
                          return (
                            <div key={space.space_name} style={styles.heapSpace}>
                              <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>
                                {space.space_name.replace(/_/g, ' ').replace('space', '').trim()}
                              </div>
                              <div style={{ fontSize: '14px', fontWeight: 600, color: isHighUsage ? '#f59e0b' : '#e0e0e8' }}>
                                {formatBytes(space.space_used_size)}
                              </div>
                              <div style={{ 
                                width: '100%', 
                                height: '3px', 
                                background: 'rgba(100, 200, 255, 0.1)',
                                borderRadius: '2px',
                                marginTop: '4px',
                                overflow: 'hidden',
                              }}>
                                <div style={{
                                  width: `${usagePercent}%`,
                                  height: '100%',
                                  background: isHighUsage 
                                    ? 'linear-gradient(90deg, #f59e0b 0%, #ef4444 100%)'
                                    : 'linear-gradient(90deg, #64d8ff 0%, #a855f7 100%)',
                                  borderRadius: '2px',
                                }} />
                              </div>
                              <div style={{ fontSize: '9px', color: '#555', marginTop: '2px' }}>
                                {usagePercent.toFixed(1)}% of {formatBytes(space.space_size)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Tips Section */}
            <div style={{
              padding: '16px 20px',
              background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.03) 100%)',
              border: '1px solid rgba(34, 197, 94, 0.15)',
              borderRadius: '10px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#22c55e', marginBottom: '10px' }}>
                💡 Troubleshooting Tips
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#888', fontSize: '11px', lineHeight: '1.8' }}>
                <li><strong>High Renderer Memory:</strong> Too many glyphs running? Try closing unused glyph windows or simplifying complex animations.</li>
                <li><strong>GPU Memory High:</strong> WebGL shaders and textures accumulate. Restart the app or reduce glyph complexity.</li>
                <li><strong>Main Process Growing:</strong> Check for memory leaks in IPC handlers. Watch for detached contexts above.</li>
                <li><strong>Detached Contexts &gt; 0:</strong> Indicates potential memory leak from closures or event listeners not being cleaned up.</li>
                <li><strong>Force GC:</strong> Only works if app was started with --expose-gc flag. Useful for testing if memory is reclaimable.</li>
              </ul>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', color: '#555' }}>
            No memory data available
          </div>
        )}
      </div>
    </div>
  );
}

