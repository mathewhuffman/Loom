/**
 * LOOM UPDATER VIEW — The Changelog Portal
 * Beautiful, goopy auto-update interface with version history
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// 🔄 TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ChangelogSection {
  type: 'features' | 'improvements' | 'bugfixes' | 'breaking';
  icon: string;
  title: string;
  items: string[];
}

interface ChangelogEntry {
  version: string;
  date: string;
  sections: ChangelogSection[];
}

interface UpdaterState {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  progress: number;
  error: string | null;
  currentVersion: string;
  updateInfo: {
    version: string;
    releaseDate?: string;
    releaseNotes?: string;
  } | null;
  changelog: ChangelogEntry[];
}

interface UpdaterViewProps {
  onClose?: () => void;
  showOnlyChangelog?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 UPDATER VIEW COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function UpdaterView({ onClose, showOnlyChangelog = false }: UpdaterViewProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [state, setState] = useState<UpdaterState>({
    checking: false,
    available: false,
    downloading: false,
    downloaded: false,
    progress: 0,
    error: null,
    currentVersion: '0.0.0',
    updateInfo: null,
    changelog: [],
  });
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [showAllVersions, setShowAllVersions] = useState(showOnlyChangelog);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Load initial state and listen for updates
  useEffect(() => {
    const loadState = async () => {
      try {
        const updaterState = await (window as any).loom?.getUpdaterState?.();
        if (updaterState) {
          setState(updaterState);
          // Auto-expand the new version if update is available
          if (updaterState.available && updaterState.updateInfo?.version) {
            setExpandedVersion(updaterState.updateInfo.version);
          }
        }
      } catch (err) {
        console.error('[Updater] Failed to load state:', err);
      }
    };

    loadState();

    // Subscribe to state updates
    const unsubscribe = (window as any).loom?.onUpdaterState?.((newState: UpdaterState) => {
      setState(newState);
      if (newState.available && newState.updateInfo?.version && !expandedVersion) {
        setExpandedVersion(newState.updateInfo.version);
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const handleCheckForUpdates = useCallback(async () => {
    try {
      await (window as any).loom?.checkForUpdates?.();
    } catch (err) {
      console.error('[Updater] Check failed:', err);
    }
  }, []);

  const handleDownload = useCallback(async () => {
    try {
      await (window as any).loom?.downloadUpdate?.();
    } catch (err) {
      console.error('[Updater] Download failed:', err);
    }
  }, []);

  const handleInstall = useCallback(async () => {
    try {
      await (window as any).loom?.installUpdate?.();
    } catch (err) {
      console.error('[Updater] Install failed:', err);
    }
  }, []);

  const handleDismiss = useCallback(async () => {
    try {
      await (window as any).loom?.dismissUpdate?.();
      onClose?.();
    } catch (err) {
      console.error('[Updater] Dismiss failed:', err);
    }
  }, [onClose]);

  const isCurrentVersion = (version: string) => version === state.currentVersion;
  const isNewVersion = (version: string) => state.updateInfo?.version === version;

  // Render version badge
  const renderVersionBadge = (version: string) => {
    if (isNewVersion(version) && state.available) {
      return <span style={styles.newBadge}>NEW</span>;
    }
    if (isCurrentVersion(version)) {
      return <span style={styles.currentBadge}>CURRENT</span>;
    }
    return null;
  };

  // Render a single changelog entry
  const renderChangelogEntry = (entry: ChangelogEntry, index: number) => {
    const isExpanded = expandedVersion === entry.version;
    const isCurrent = isCurrentVersion(entry.version);
    const isNew = isNewVersion(entry.version) && state.available;

    return (
      <div
        key={entry.version}
        style={{
          ...styles.changelogEntry,
          ...(isNew ? styles.changelogEntryNew : {}),
          ...(isCurrent ? styles.changelogEntryCurrent : {}),
          animationDelay: `${index * 80}ms`,
        }}
      >
        <button
          style={styles.changelogHeader}
          onClick={() => setExpandedVersion(isExpanded ? null : entry.version)}
        >
          <div style={styles.changelogHeaderLeft}>
            <span style={styles.versionNumber}>v{entry.version}</span>
            {renderVersionBadge(entry.version)}
            <span style={styles.versionDate}>{entry.date}</span>
          </div>
          <span style={{
            ...styles.expandIcon,
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}>
            ▼
          </span>
        </button>

        <div style={{
          ...styles.changelogContent,
          maxHeight: isExpanded ? '2000px' : '0',
          opacity: isExpanded ? 1 : 0,
          padding: isExpanded ? '16px 20px 20px' : '0 20px',
        }}>
          {entry.sections.map((section, sIndex) => (
            <div key={section.type} style={{
              ...styles.changelogSection,
              animationDelay: `${sIndex * 50}ms`,
            }}>
              <h4 style={styles.sectionTitle}>
                <span style={styles.sectionIcon}>{section.icon}</span>
                {section.title}
              </h4>
              <ul style={styles.itemList}>
                {section.items.map((item, iIndex) => (
                  <li key={iIndex} style={styles.itemEntry}>
                    <span style={styles.itemBullet}>◆</span>
                    <span dangerouslySetInnerHTML={{ 
                      __html: item.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
                    }} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Filter changelog for display
  const displayedChangelog = showAllVersions 
    ? state.changelog 
    : state.changelog.filter(entry => 
        isNewVersion(entry.version) || isCurrentVersion(entry.version)
      ).slice(0, 2);

  return (
    <div style={{
      ...styles.container,
      opacity: isVisible ? 1 : 0,
      transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)',
    }}>
      {/* Animated background blobs */}
      <div style={styles.blobContainer}>
        <div style={{...styles.blob, ...styles.blob1}} />
        <div style={{...styles.blob, ...styles.blob2}} />
        <div style={{...styles.blob, ...styles.blob3}} />
      </div>

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerIcon}>
            {state.available ? '🆕' : state.downloaded ? '✅' : '🔄'}
          </span>
          <div style={styles.headerText}>
            <h2 style={styles.title}>
              {showOnlyChangelog 
                ? 'Version History' 
                : state.available 
                  ? 'Update Available!' 
                  : state.downloaded 
                    ? 'Ready to Install' 
                    : 'Software Update'}
            </h2>
            <span style={styles.subtitle}>
              {showOnlyChangelog
                ? `Currently on v${state.currentVersion}`
                : state.available 
                  ? `v${state.currentVersion} → v${state.updateInfo?.version}` 
                  : state.downloaded
                    ? `v${state.updateInfo?.version} downloaded`
                    : `v${state.currentVersion}`}
            </span>
          </div>
        </div>
        <button style={styles.closeButton} onClick={onClose} title="Close">✕</button>
      </div>

      {/* Download Progress */}
      {state.downloading && (
        <div style={styles.progressContainer}>
          <div style={styles.progressHeader}>
            <span style={styles.progressLabel}>Downloading update...</span>
            <span style={styles.progressPercent}>{Math.round(state.progress)}%</span>
          </div>
          <div style={styles.progressTrack}>
            <div 
              ref={progressBarRef}
              style={{
                ...styles.progressBar,
                width: `${state.progress}%`,
              }} 
            />
            <div style={{
              ...styles.progressGlow,
              width: `${state.progress}%`,
            }} />
          </div>
        </div>
      )}

      {/* Error Message */}
      {state.error && (
        <div style={styles.errorContainer}>
          <span style={styles.errorIcon}>⚠️</span>
          <span style={styles.errorText}>{state.error}</span>
        </div>
      )}

      {/* Changelog */}
      <div style={styles.changelogContainer}>
        <div style={styles.changelogScroll}>
          {displayedChangelog.length > 0 ? (
            displayedChangelog.map((entry, index) => renderChangelogEntry(entry, index))
          ) : (
            <div style={styles.noChangelog}>
              <span style={styles.noChangelogIcon}>📝</span>
              <span>No changelog available</span>
            </div>
          )}
        </div>

        {!showAllVersions && state.changelog.length > 2 && (
          <button 
            style={styles.showAllButton}
            onClick={() => setShowAllVersions(true)}
          >
            <span>Show all {state.changelog.length} versions</span>
            <span style={styles.showAllIcon}>▼</span>
          </button>
        )}
      </div>

      {/* Actions */}
      {!showOnlyChangelog && (
        <div style={styles.actions}>
          {state.checking && (
            <div style={styles.checkingStatus}>
              <span style={styles.spinnerIcon}>⟳</span>
              <span>Checking for updates...</span>
            </div>
          )}

          {!state.available && !state.downloaded && !state.checking && (
            <button style={styles.checkButton} onClick={handleCheckForUpdates}>
              <span style={styles.buttonIcon}>🔍</span>
              Check for Updates
            </button>
          )}

          {state.available && !state.downloading && !state.downloaded && (
            <div style={styles.actionButtons}>
              <button style={styles.laterButton} onClick={handleDismiss}>
                Later
              </button>
              <button style={styles.downloadButton} onClick={handleDownload}>
                <span style={styles.buttonIcon}>⬇️</span>
                Download Update
              </button>
            </div>
          )}

          {state.downloaded && (
            <div style={styles.actionButtons}>
              <button style={styles.laterButton} onClick={handleDismiss}>
                Install Later
              </button>
              <button style={styles.installButton} onClick={handleInstall}>
                <span style={styles.buttonIcon}>🚀</span>
                Install & Restart
              </button>
            </div>
          )}
        </div>
      )}

      {/* CSS Keyframes */}
      <style>{`
        @keyframes goopyEntrance {
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

        @keyframes blobFloat {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          25% {
            transform: translate(20px, -30px) scale(1.1);
          }
          50% {
            transform: translate(-10px, 20px) scale(0.95);
          }
          75% {
            transform: translate(-30px, -10px) scale(1.05);
          }
        }

        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }

        @keyframes pulseGlow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(0, 255, 255, 0.3),
                        0 0 40px rgba(255, 0, 255, 0.2);
          }
          50% {
            box-shadow: 0 0 30px rgba(0, 255, 255, 0.5),
                        0 0 60px rgba(255, 0, 255, 0.3);
          }
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes progressPulse {
          0%, 100% {
            opacity: 0.6;
          }
          50% {
            opacity: 1;
          }
        }

        @keyframes newBadgePulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 10px rgba(0, 255, 136, 0.5);
          }
          50% {
            transform: scale(1.05);
            box-shadow: 0 0 20px rgba(0, 255, 136, 0.8);
          }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 STYLES — Cyberpunk aesthetic with goopy animations
// ═══════════════════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    height: '100%',
    background: 'linear-gradient(135deg, rgba(10, 10, 25, 0.98) 0%, rgba(15, 10, 30, 0.98) 100%)',
    borderRadius: '20px',
    overflow: 'hidden',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', monospace",
    transition: 'opacity 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
    display: 'flex',
    flexDirection: 'column',
  },

  // Animated background blobs
  blobContainer: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    opacity: 0.4,
  },
  blob: {
    position: 'absolute',
    borderRadius: '50%',
    filter: 'blur(60px)',
    animation: 'blobFloat 12s ease-in-out infinite',
  },
  blob1: {
    width: '300px',
    height: '300px',
    background: 'radial-gradient(circle, rgba(0, 255, 255, 0.4) 0%, transparent 70%)',
    top: '-100px',
    right: '-50px',
    animationDelay: '0s',
  },
  blob2: {
    width: '250px',
    height: '250px',
    background: 'radial-gradient(circle, rgba(255, 0, 255, 0.3) 0%, transparent 70%)',
    bottom: '-80px',
    left: '-30px',
    animationDelay: '-4s',
  },
  blob3: {
    width: '200px',
    height: '200px',
    background: 'radial-gradient(circle, rgba(0, 255, 136, 0.25) 0%, transparent 70%)',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    animationDelay: '-8s',
  },

  // Header
  header: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(0, 0, 0, 0.3)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  headerIcon: {
    fontSize: '32px',
    filter: 'drop-shadow(0 0 12px rgba(0, 255, 255, 0.5))',
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 700,
    letterSpacing: '2px',
    background: 'linear-gradient(90deg, #00ffff, #ff00ff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: '1px',
  },
  closeButton: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '10px',
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: '16px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },

  // Progress bar
  progressContainer: {
    position: 'relative',
    zIndex: 10,
    padding: '16px 24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(0, 0, 0, 0.2)',
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '10px',
  },
  progressLabel: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.7)',
    letterSpacing: '0.5px',
  },
  progressPercent: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#00ffff',
  },
  progressTrack: {
    position: 'relative',
    height: '8px',
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    background: 'linear-gradient(90deg, #00ffff, #ff00ff, #00ffff)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 2s linear infinite',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  progressGlow: {
    position: 'absolute',
    top: '-4px',
    left: 0,
    height: '16px',
    background: 'linear-gradient(90deg, rgba(0, 255, 255, 0.3), rgba(255, 0, 255, 0.3))',
    filter: 'blur(8px)',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
    animation: 'progressPulse 1.5s ease-in-out infinite',
  },

  // Error
  errorContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 24px',
    background: 'rgba(255, 50, 50, 0.1)',
    borderBottom: '1px solid rgba(255, 50, 50, 0.3)',
  },
  errorIcon: {
    fontSize: '18px',
  },
  errorText: {
    fontSize: '12px',
    color: '#ff6666',
  },

  // Changelog
  changelogContainer: {
    position: 'relative',
    zIndex: 10,
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  changelogScroll: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  changelogEntry: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    overflow: 'hidden',
    animation: 'slideIn 0.4s ease forwards',
    opacity: 0,
  },
  changelogEntryNew: {
    border: '1px solid rgba(0, 255, 136, 0.4)',
    background: 'rgba(0, 255, 136, 0.05)',
    animation: 'slideIn 0.4s ease forwards, pulseGlow 2s ease-in-out infinite',
  },
  changelogEntryCurrent: {
    border: '1px solid rgba(0, 255, 255, 0.3)',
    background: 'rgba(0, 255, 255, 0.03)',
  },
  changelogHeader: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    transition: 'background 0.2s ease',
  },
  changelogHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  versionNumber: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: '1px',
  },
  versionDate: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  newBadge: {
    padding: '3px 8px',
    background: 'rgba(0, 255, 136, 0.2)',
    border: '1px solid rgba(0, 255, 136, 0.5)',
    borderRadius: '6px',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '1px',
    color: '#00ff88',
    animation: 'newBadgePulse 2s ease-in-out infinite',
  },
  currentBadge: {
    padding: '3px 8px',
    background: 'rgba(0, 255, 255, 0.15)',
    border: '1px solid rgba(0, 255, 255, 0.4)',
    borderRadius: '6px',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '1px',
    color: '#00ffff',
  },
  expandIcon: {
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.4)',
    transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  changelogContent: {
    overflow: 'hidden',
    transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
  },
  changelogSection: {
    animation: 'slideIn 0.3s ease forwards',
    opacity: 0,
  },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    margin: '0 0 8px 0',
    fontSize: '12px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.8)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  sectionIcon: {
    fontSize: '14px',
  },
  itemList: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  itemEntry: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 1.5,
  },
  itemBullet: {
    color: '#00ffff',
    fontSize: '8px',
    marginTop: '5px',
    flexShrink: 0,
  },
  noChangelog: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '40px',
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: '14px',
  },
  noChangelogIcon: {
    fontSize: '32px',
    opacity: 0.5,
  },
  showAllButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px',
    margin: '0 20px 16px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  showAllIcon: {
    fontSize: '10px',
    opacity: 0.6,
  },

  // Actions
  actions: {
    position: 'relative',
    zIndex: 10,
    padding: '16px 24px 20px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(0, 0, 0, 0.3)',
    display: 'flex',
    justifyContent: 'center',
  },
  checkingStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 20px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '10px',
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  spinnerIcon: {
    fontSize: '16px',
    animation: 'spin 1s linear infinite',
    display: 'inline-block',
  },
  actionButtons: {
    display: 'flex',
    gap: '12px',
  },
  checkButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 24px',
    background: 'rgba(0, 255, 255, 0.1)',
    border: '1px solid rgba(0, 255, 255, 0.4)',
    borderRadius: '10px',
    color: '#00ffff',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  laterButton: {
    padding: '12px 24px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '10px',
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: '13px',
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  downloadButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 24px',
    background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.2) 0%, rgba(0, 200, 136, 0.2) 100%)',
    border: '1px solid rgba(0, 255, 136, 0.5)',
    borderRadius: '10px',
    color: '#00ff88',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  installButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 24px',
    background: 'linear-gradient(135deg, rgba(255, 0, 255, 0.2) 0%, rgba(200, 0, 255, 0.2) 100%)',
    border: '1px solid rgba(255, 0, 255, 0.5)',
    borderRadius: '10px',
    color: '#ff00ff',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    animation: 'pulseGlow 2s ease-in-out infinite',
  },
  buttonIcon: {
    fontSize: '16px',
  },
};

