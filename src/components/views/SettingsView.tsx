/**
 * LOOM SETTINGS VIEW — The Control Panel for Digital Reality
 * Manage keys, appearance, and system settings with a goopy, satisfying feel
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 TYPES
// ═══════════════════════════════════════════════════════════════════════════

type SettingsTab = 'general' | 'keys' | 'appearance' | 'about';

interface StoredKey {
  id: string;
  name: string;
  description?: string;
  category?: string;
  createdAt: number;
  updatedAt: number;
}

interface LlmApiKeyStatus {
  configured: boolean;
  masked: string | null;
}

interface LlmApiKeysStatus {
  grok: LlmApiKeyStatus;
  gemini: LlmApiKeyStatus;
  openai: LlmApiKeyStatus;
}

interface SettingsViewProps {
  onClose?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 SETTINGS VIEW COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function SettingsView({ onClose }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('keys');
  const [isVisible, setIsVisible] = useState(false);
  const [keys, setKeys] = useState<StoredKey[]>([]);
  const [isAddingKey, setIsAddingKey] = useState(false);
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyDescription, setNewKeyDescription] = useState('');
  const [newKeyCategory, setNewKeyCategory] = useState('api');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
  // LLM API Keys state
  const [llmApiKeys, setLlmApiKeys] = useState<LlmApiKeysStatus>({
    grok: { configured: false, masked: null },
    gemini: { configured: false, masked: null },
    openai: { configured: false, masked: null },
  });
  const [editingLlmKey, setEditingLlmKey] = useState<'grok' | 'gemini' | 'openai' | null>(null);
  const [newLlmKeyValue, setNewLlmKeyValue] = useState('');
  const [llmSaveStatus, setLlmSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showLlmDeleteConfirm, setShowLlmDeleteConfirm] = useState<'grok' | 'gemini' | 'openai' | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const llmInputRef = useRef<HTMLInputElement>(null);

  // Entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Load stored keys and LLM API keys on mount
  useEffect(() => {
    loadStoredKeys();
    loadLlmApiKeys();
  }, []);

  const loadStoredKeys = useCallback(async () => {
    try {
      const storedKeys = await (window as any).loom?.getStoredKeys?.();
      if (Array.isArray(storedKeys)) {
        setKeys(storedKeys);
      }
    } catch (err) {
      console.error('[Settings] Failed to load keys:', err);
    }
  }, []);

  const loadLlmApiKeys = useCallback(async () => {
    try {
      const result = await (window as any).loom?.getLlmApiKeysStatus?.();
      if (result?.success && result.keys) {
        setLlmApiKeys(result.keys);
      }
    } catch (err) {
      console.error('[Settings] Failed to load LLM API keys:', err);
    }
  }, []);

  const handleSaveKey = useCallback(async () => {
    if (!newKeyName.trim() || !newKeyValue.trim()) return;

    setSaveStatus('saving');
    try {
      const keyId = editingKeyId || `key-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      
      await (window as any).loom?.saveSecureKey?.(keyId, {
        name: newKeyName.trim(),
        value: newKeyValue,
        description: newKeyDescription.trim(),
        category: newKeyCategory,
      });

      // Update local state
      const newKey: StoredKey = {
        id: keyId,
        name: newKeyName.trim(),
        description: newKeyDescription.trim(),
        category: newKeyCategory,
        createdAt: editingKeyId ? (keys.find(k => k.id === editingKeyId)?.createdAt || Date.now()) : Date.now(),
        updatedAt: Date.now(),
      };

      if (editingKeyId) {
        setKeys(prev => prev.map(k => k.id === editingKeyId ? newKey : k));
      } else {
        setKeys(prev => [...prev, newKey]);
      }

      // Reset form
      setNewKeyName('');
      setNewKeyValue('');
      setNewKeyDescription('');
      setNewKeyCategory('api');
      setIsAddingKey(false);
      setEditingKeyId(null);
      setSaveStatus('saved');

      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('[Settings] Failed to save key:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, [newKeyName, newKeyValue, newKeyDescription, newKeyCategory, editingKeyId, keys]);

  const handleEditKey = useCallback(async (key: StoredKey) => {
    setEditingKeyId(key.id);
    setNewKeyName(key.name);
    setNewKeyDescription(key.description || '');
    setNewKeyCategory(key.category || 'api');
    setNewKeyValue(''); // User must re-enter value for security
    setIsAddingKey(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleDeleteKey = useCallback(async (keyId: string) => {
    try {
      await (window as any).loom?.deleteSecureKey?.(keyId);
      setKeys(prev => prev.filter(k => k.id !== keyId));
      setShowDeleteConfirm(null);
    } catch (err) {
      console.error('[Settings] Failed to delete key:', err);
    }
  }, []);

  const handleCancelAdd = useCallback(() => {
    setIsAddingKey(false);
    setEditingKeyId(null);
    setNewKeyName('');
    setNewKeyValue('');
    setNewKeyDescription('');
    setNewKeyCategory('api');
  }, []);

  // LLM API Key handlers
  const handleSaveLlmKey = useCallback(async () => {
    if (!editingLlmKey || !newLlmKeyValue.trim()) return;

    setLlmSaveStatus('saving');
    try {
      const result = await (window as any).loom?.saveLlmApiKey?.(editingLlmKey, newLlmKeyValue.trim());
      
      if (result?.success) {
        // Reload to get new masked value
        await loadLlmApiKeys();
        setEditingLlmKey(null);
        setNewLlmKeyValue('');
        setLlmSaveStatus('saved');
        setTimeout(() => setLlmSaveStatus('idle'), 2000);
      } else {
        console.error('[Settings] Failed to save LLM API key:', result?.error);
        setLlmSaveStatus('error');
        setTimeout(() => setLlmSaveStatus('idle'), 3000);
      }
    } catch (err) {
      console.error('[Settings] Failed to save LLM API key:', err);
      setLlmSaveStatus('error');
      setTimeout(() => setLlmSaveStatus('idle'), 3000);
    }
  }, [editingLlmKey, newLlmKeyValue, loadLlmApiKeys]);

  const handleDeleteLlmKey = useCallback(async (provider: 'grok' | 'gemini' | 'openai') => {
    try {
      const result = await (window as any).loom?.deleteLlmApiKey?.(provider);
      
      if (result?.success) {
        // Update local state
        setLlmApiKeys(prev => ({
          ...prev,
          [provider]: { configured: false, masked: null },
        }));
        setShowLlmDeleteConfirm(null);
      } else {
        console.error('[Settings] Failed to delete LLM API key:', result?.error);
      }
    } catch (err) {
      console.error('[Settings] Failed to delete LLM API key:', err);
    }
  }, []);

  const handleEditLlmKey = useCallback((provider: 'grok' | 'gemini' | 'openai') => {
    setEditingLlmKey(provider);
    setNewLlmKeyValue('');
    setTimeout(() => llmInputRef.current?.focus(), 100);
  }, []);

  const handleCancelLlmEdit = useCallback(() => {
    setEditingLlmKey(null);
    setNewLlmKeyValue('');
  }, []);

  const tabs: Array<{ id: SettingsTab; icon: string; label: string }> = [
    { id: 'general', icon: '⚡', label: 'General' },
    { id: 'keys', icon: '🔐', label: 'Keys' },
    { id: 'appearance', icon: '🎨', label: 'Appearance' },
    { id: 'about', icon: '✨', label: 'About' },
  ];

  const categoryIcons: Record<string, string> = {
    api: '🔑',
    password: '🔒',
    token: '🎫',
    credential: '👤',
    other: '📦',
  };

  return (
    <div style={{
      ...styles.container,
      opacity: isVisible ? 1 : 0,
      transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(20px)',
    }}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <span style={styles.headerIcon}>⚙️</span>
          <span style={styles.headerText}>Settings</span>
        </div>
        <button style={styles.closeButton} onClick={onClose} title="Close">✕</button>
      </div>

      {/* Tab Navigation */}
      <div style={styles.tabBar}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.tabActive : {}),
              animationDelay: `${index * 50}ms`,
            }}
          >
            <span style={styles.tabIcon}>{tab.icon}</span>
            <span style={styles.tabLabel}>{tab.label}</span>
            {activeTab === tab.id && <div style={styles.tabIndicator} />}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div style={styles.content}>
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* KEYS TAB */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'keys' && (
          <div style={styles.keysContainer}>
            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* LLM API KEYS SECTION */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div style={styles.llmSection}>
              <div style={styles.keysHeader}>
                <div>
                  <h3 style={styles.sectionTitle}>🤖 AI Provider API Keys</h3>
                  <p style={styles.sectionDescription}>
                    Configure your API keys for AI providers. These power glyph generation and chat.
                    Keys are encrypted with Windows DPAPI and never leave your machine.
                  </p>
                </div>
              </div>

              <div style={styles.llmKeysList}>
                {/* Grok/xAI */}
                <div style={styles.llmKeyCard}>
                  <div style={styles.llmKeyLeft}>
                    <span style={styles.llmKeyIcon}>⚡</span>
                    <div style={styles.llmKeyInfo}>
                      <span style={styles.llmKeyName}>Grok (xAI)</span>
                      <span style={styles.llmKeyDescription}>Fast and capable, great for glyph generation</span>
                    </div>
                  </div>
                  <div style={styles.llmKeyRight}>
                    {editingLlmKey === 'grok' ? (
                      <div style={styles.llmKeyEditForm}>
                        <input
                          ref={llmInputRef}
                          type="password"
                          value={newLlmKeyValue}
                          onChange={(e) => setNewLlmKeyValue(e.target.value)}
                          placeholder="Enter Grok API key..."
                          style={styles.llmKeyInput}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveLlmKey();
                            if (e.key === 'Escape') handleCancelLlmEdit();
                          }}
                        />
                        <button
                          style={styles.llmKeySaveBtn}
                          onClick={handleSaveLlmKey}
                          disabled={!newLlmKeyValue.trim() || llmSaveStatus === 'saving'}
                        >
                          {llmSaveStatus === 'saving' ? '⏳' : '✓'}
                        </button>
                        <button style={styles.llmKeyCancelBtn} onClick={handleCancelLlmEdit}>✕</button>
                      </div>
                    ) : (
                      <>
                        <span style={{
                          ...styles.llmKeyStatus,
                          color: llmApiKeys.grok.configured ? '#00ff88' : 'rgba(255, 255, 255, 0.3)',
                        }}>
                          {llmApiKeys.grok.configured ? (
                            <>{llmApiKeys.grok.masked}</>
                          ) : (
                            'Not configured'
                          )}
                        </span>
                        <div style={styles.llmKeyActions}>
                          <button
                            style={styles.keyActionBtn}
                            onClick={() => handleEditLlmKey('grok')}
                            title={llmApiKeys.grok.configured ? 'Update key' : 'Add key'}
                          >
                            {llmApiKeys.grok.configured ? '✏️' : '➕'}
                          </button>
                          {llmApiKeys.grok.configured && (
                            <button
                              style={{ ...styles.keyActionBtn, ...styles.deleteBtn }}
                              onClick={() => setShowLlmDeleteConfirm('grok')}
                              title="Delete key"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  {showLlmDeleteConfirm === 'grok' && (
                    <div style={styles.deleteConfirm}>
                      <span>Delete Grok API key?</span>
                      <div style={styles.deleteConfirmActions}>
                        <button style={styles.deleteConfirmNo} onClick={() => setShowLlmDeleteConfirm(null)}>Cancel</button>
                        <button style={styles.deleteConfirmYes} onClick={() => handleDeleteLlmKey('grok')}>Delete</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Gemini/Google */}
                <div style={styles.llmKeyCard}>
                  <div style={styles.llmKeyLeft}>
                    <span style={styles.llmKeyIcon}>✨</span>
                    <div style={styles.llmKeyInfo}>
                      <span style={styles.llmKeyName}>Gemini (Google)</span>
                      <span style={styles.llmKeyDescription}>Google's multimodal AI, excellent reasoning</span>
                    </div>
                  </div>
                  <div style={styles.llmKeyRight}>
                    {editingLlmKey === 'gemini' ? (
                      <div style={styles.llmKeyEditForm}>
                        <input
                          ref={editingLlmKey === 'gemini' ? llmInputRef : undefined}
                          type="password"
                          value={newLlmKeyValue}
                          onChange={(e) => setNewLlmKeyValue(e.target.value)}
                          placeholder="Enter Gemini API key..."
                          style={styles.llmKeyInput}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveLlmKey();
                            if (e.key === 'Escape') handleCancelLlmEdit();
                          }}
                        />
                        <button
                          style={styles.llmKeySaveBtn}
                          onClick={handleSaveLlmKey}
                          disabled={!newLlmKeyValue.trim() || llmSaveStatus === 'saving'}
                        >
                          {llmSaveStatus === 'saving' ? '⏳' : '✓'}
                        </button>
                        <button style={styles.llmKeyCancelBtn} onClick={handleCancelLlmEdit}>✕</button>
                      </div>
                    ) : (
                      <>
                        <span style={{
                          ...styles.llmKeyStatus,
                          color: llmApiKeys.gemini.configured ? '#00ff88' : 'rgba(255, 255, 255, 0.3)',
                        }}>
                          {llmApiKeys.gemini.configured ? (
                            <>{llmApiKeys.gemini.masked}</>
                          ) : (
                            'Not configured'
                          )}
                        </span>
                        <div style={styles.llmKeyActions}>
                          <button
                            style={styles.keyActionBtn}
                            onClick={() => handleEditLlmKey('gemini')}
                            title={llmApiKeys.gemini.configured ? 'Update key' : 'Add key'}
                          >
                            {llmApiKeys.gemini.configured ? '✏️' : '➕'}
                          </button>
                          {llmApiKeys.gemini.configured && (
                            <button
                              style={{ ...styles.keyActionBtn, ...styles.deleteBtn }}
                              onClick={() => setShowLlmDeleteConfirm('gemini')}
                              title="Delete key"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  {showLlmDeleteConfirm === 'gemini' && (
                    <div style={styles.deleteConfirm}>
                      <span>Delete Gemini API key?</span>
                      <div style={styles.deleteConfirmActions}>
                        <button style={styles.deleteConfirmNo} onClick={() => setShowLlmDeleteConfirm(null)}>Cancel</button>
                        <button style={styles.deleteConfirmYes} onClick={() => handleDeleteLlmKey('gemini')}>Delete</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* OpenAI */}
                <div style={styles.llmKeyCard}>
                  <div style={styles.llmKeyLeft}>
                    <span style={styles.llmKeyIcon}>🧠</span>
                    <div style={styles.llmKeyInfo}>
                      <span style={styles.llmKeyName}>OpenAI</span>
                      <span style={styles.llmKeyDescription}>GPT models, reliable and versatile</span>
                    </div>
                  </div>
                  <div style={styles.llmKeyRight}>
                    {editingLlmKey === 'openai' ? (
                      <div style={styles.llmKeyEditForm}>
                        <input
                          ref={editingLlmKey === 'openai' ? llmInputRef : undefined}
                          type="password"
                          value={newLlmKeyValue}
                          onChange={(e) => setNewLlmKeyValue(e.target.value)}
                          placeholder="Enter OpenAI API key..."
                          style={styles.llmKeyInput}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveLlmKey();
                            if (e.key === 'Escape') handleCancelLlmEdit();
                          }}
                        />
                        <button
                          style={styles.llmKeySaveBtn}
                          onClick={handleSaveLlmKey}
                          disabled={!newLlmKeyValue.trim() || llmSaveStatus === 'saving'}
                        >
                          {llmSaveStatus === 'saving' ? '⏳' : '✓'}
                        </button>
                        <button style={styles.llmKeyCancelBtn} onClick={handleCancelLlmEdit}>✕</button>
                      </div>
                    ) : (
                      <>
                        <span style={{
                          ...styles.llmKeyStatus,
                          color: llmApiKeys.openai.configured ? '#00ff88' : 'rgba(255, 255, 255, 0.3)',
                        }}>
                          {llmApiKeys.openai.configured ? (
                            <>{llmApiKeys.openai.masked}</>
                          ) : (
                            'Not configured'
                          )}
                        </span>
                        <div style={styles.llmKeyActions}>
                          <button
                            style={styles.keyActionBtn}
                            onClick={() => handleEditLlmKey('openai')}
                            title={llmApiKeys.openai.configured ? 'Update key' : 'Add key'}
                          >
                            {llmApiKeys.openai.configured ? '✏️' : '➕'}
                          </button>
                          {llmApiKeys.openai.configured && (
                            <button
                              style={{ ...styles.keyActionBtn, ...styles.deleteBtn }}
                              onClick={() => setShowLlmDeleteConfirm('openai')}
                              title="Delete key"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  {showLlmDeleteConfirm === 'openai' && (
                    <div style={styles.deleteConfirm}>
                      <span>Delete OpenAI API key?</span>
                      <div style={styles.deleteConfirmActions}>
                        <button style={styles.deleteConfirmNo} onClick={() => setShowLlmDeleteConfirm(null)}>Cancel</button>
                        <button style={styles.deleteConfirmYes} onClick={() => handleDeleteLlmKey('openai')}>Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {llmSaveStatus === 'saved' && (
                <div style={styles.statusMessage}>✅ API key saved securely!</div>
              )}
              {llmSaveStatus === 'error' && (
                <div style={{ ...styles.statusMessage, color: '#ff4444' }}>❌ Failed to save API key</div>
              )}
            </div>

            {/* Divider between sections */}
            <div style={styles.sectionDivider} />

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* GLYPH KEYS SECTION (existing) */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div style={styles.keysHeader}>
              <div>
                <h3 style={styles.sectionTitle}>🔐 Glyph Credentials Vault</h3>
                <p style={styles.sectionDescription}>
                  Store API keys, tokens, and credentials for use in your glyphs.
                  Only key names are shared with AI — never the actual values.
                </p>
              </div>
              {!isAddingKey && (
                <button
                  style={styles.addButton}
                  onClick={() => {
                    setIsAddingKey(true);
                    setTimeout(() => inputRef.current?.focus(), 100);
                  }}
                >
                  <span>+</span> Add Key
                </button>
              )}
            </div>

            {/* Add/Edit Key Form */}
            {isAddingKey && (
              <div style={styles.keyForm}>
                <div style={styles.formHeader}>
                  <span style={styles.formTitle}>
                    {editingKeyId ? '✏️ Edit Key' : '🔑 New Secure Key'}
                  </span>
                </div>
                
                <div style={styles.formGrid}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Name *</label>
                    <input
                      ref={inputRef}
                      type="text"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g., OpenAI API Key"
                      style={styles.formInput}
                    />
                  </div>
                  
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Category</label>
                    <select
                      value={newKeyCategory}
                      onChange={(e) => setNewKeyCategory(e.target.value)}
                      style={styles.formSelect}
                    >
                      <option value="api">🔑 API Key</option>
                      <option value="token">🎫 Token</option>
                      <option value="password">🔒 Password</option>
                      <option value="credential">👤 Credential</option>
                      <option value="other">📦 Other</option>
                    </select>
                  </div>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>
                    Secret Value * {editingKeyId && <span style={styles.formHint}>(re-enter to update)</span>}
                  </label>
                  <input
                    type="password"
                    value={newKeyValue}
                    onChange={(e) => setNewKeyValue(e.target.value)}
                    placeholder="Enter the secret value..."
                    style={styles.formInput}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Description <span style={styles.formHint}>(optional)</span></label>
                  <input
                    type="text"
                    value={newKeyDescription}
                    onChange={(e) => setNewKeyDescription(e.target.value)}
                    placeholder="What is this key used for?"
                    style={styles.formInput}
                  />
                </div>

                <div style={styles.formActions}>
                  <button style={styles.cancelButton} onClick={handleCancelAdd}>
                    Cancel
                  </button>
                  <button
                    style={{
                      ...styles.saveButton,
                      opacity: newKeyName.trim() && newKeyValue.trim() ? 1 : 0.5,
                    }}
                    onClick={handleSaveKey}
                    disabled={!newKeyName.trim() || !newKeyValue.trim() || saveStatus === 'saving'}
                  >
                    {saveStatus === 'saving' ? '⏳ Saving...' : editingKeyId ? '💾 Update Key' : '💾 Save Key'}
                  </button>
                </div>

                {saveStatus === 'saved' && (
                  <div style={styles.statusMessage}>✅ Key saved securely!</div>
                )}
                {saveStatus === 'error' && (
                  <div style={{ ...styles.statusMessage, color: '#ff4444' }}>❌ Failed to save key</div>
                )}
              </div>
            )}

            {/* Keys List */}
            <div style={styles.keysList}>
              {keys.length === 0 && !isAddingKey ? (
                <div style={styles.emptyState}>
                  <span style={styles.emptyIcon}>🔐</span>
                  <p style={styles.emptyText}>No keys stored yet</p>
                  <p style={styles.emptySubtext}>
                    Add API keys and credentials to use them securely in your prompts
                  </p>
                </div>
              ) : (
                keys.map((key, index) => (
                  <div
                    key={key.id}
                    style={{
                      ...styles.keyCard,
                      animationDelay: `${index * 50}ms`,
                    }}
                  >
                    <div style={styles.keyCardLeft}>
                      <span style={styles.keyIcon}>{categoryIcons[key.category || 'api']}</span>
                      <div style={styles.keyInfo}>
                        <span style={styles.keyName}>{key.name}</span>
                        {key.description && (
                          <span style={styles.keyDescription}>{key.description}</span>
                        )}
                        <span style={styles.keyMeta}>
                          Updated {new Date(key.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div style={styles.keyCardRight}>
                      <span style={styles.keyValue}>••••••••••••</span>
                      <div style={styles.keyActions}>
                        <button
                          style={styles.keyActionBtn}
                          onClick={() => handleEditKey(key)}
                          title="Edit key"
                        >
                          ✏️
                        </button>
                        <button
                          style={{ ...styles.keyActionBtn, ...styles.deleteBtn }}
                          onClick={() => setShowDeleteConfirm(key.id)}
                          title="Delete key"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    {/* Delete Confirmation */}
                    {showDeleteConfirm === key.id && (
                      <div style={styles.deleteConfirm}>
                        <span>Delete "{key.name}"?</span>
                        <div style={styles.deleteConfirmActions}>
                          <button
                            style={styles.deleteConfirmNo}
                            onClick={() => setShowDeleteConfirm(null)}
                          >
                            Cancel
                          </button>
                          <button
                            style={styles.deleteConfirmYes}
                            onClick={() => handleDeleteKey(key.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Security Notice */}
            <div style={styles.securityNotice}>
              <span style={styles.securityIcon}>🛡️</span>
              <div style={styles.securityText}>
                <strong>Secure Storage</strong>
                <p>Keys are encrypted using Windows DPAPI and stored locally. They never leave your machine unencrypted.</p>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* GENERAL TAB */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'general' && (
          <div style={styles.generalContainer}>
            <h3 style={styles.sectionTitle}>⚡ General Settings</h3>
            
            <div style={styles.settingGroup}>
              <div style={styles.settingRow}>
                <div style={styles.settingInfo}>
                  <span style={styles.settingLabel}>Auto-start on login</span>
                  <span style={styles.settingDescription}>Launch Loom automatically when Windows starts</span>
                </div>
                <button style={styles.toggleOff}>Off</button>
              </div>

              <div style={styles.settingRow}>
                <div style={styles.settingInfo}>
                  <span style={styles.settingLabel}>Background interaction</span>
                  <span style={styles.settingDescription}>Allow clicking through to desktop widgets</span>
                </div>
                <button style={styles.toggleOff}>Off</button>
              </div>

              <div style={styles.settingRow}>
                <div style={styles.settingInfo}>
                  <span style={styles.settingLabel}>Show in system tray</span>
                  <span style={styles.settingDescription}>Keep Loom accessible from the system tray</span>
                </div>
                <button style={styles.toggleOn}>On</button>
              </div>
            </div>

            <h3 style={{ ...styles.sectionTitle, marginTop: '32px' }}>⌨️ Keyboard Shortcuts</h3>
            
            <div style={styles.shortcutList}>
              <div style={styles.shortcutRow}>
                <span style={styles.shortcutAction}>Toggle Summoner</span>
                <span style={styles.shortcutKeys}>Ctrl + Alt + S</span>
              </div>
              <div style={styles.shortcutRow}>
                <span style={styles.shortcutAction}>Open Loom Panel</span>
                <span style={styles.shortcutKeys}>Ctrl + Alt + L</span>
              </div>
              <div style={styles.shortcutRow}>
                <span style={styles.shortcutAction}>Background Interaction</span>
                <span style={styles.shortcutKeys}>`</span>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* APPEARANCE TAB */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'appearance' && (
          <div style={styles.appearanceContainer}>
            <h3 style={styles.sectionTitle}>🎨 Appearance</h3>
            
            <div style={styles.settingGroup}>
              <div style={styles.settingRow}>
                <div style={styles.settingInfo}>
                  <span style={styles.settingLabel}>Theme</span>
                  <span style={styles.settingDescription}>Choose your visual style</span>
                </div>
                <select style={styles.selectInput}>
                  <option value="cyberpunk">🌆 Cyberpunk</option>
                  <option value="dark">🌙 Dark</option>
                  <option value="light">☀️ Light</option>
                </select>
              </div>

              <div style={styles.settingRow}>
                <div style={styles.settingInfo}>
                  <span style={styles.settingLabel}>Accent Color</span>
                  <span style={styles.settingDescription}>Primary color for UI elements</span>
                </div>
                <div style={styles.colorPicker}>
                  <div style={{ ...styles.colorSwatch, background: '#00ffff' }} />
                  <div style={{ ...styles.colorSwatch, background: '#ff00ff' }} />
                  <div style={{ ...styles.colorSwatch, background: '#00ff88' }} />
                  <div style={{ ...styles.colorSwatch, background: '#ffff00' }} />
                </div>
              </div>

              <div style={styles.settingRow}>
                <div style={styles.settingInfo}>
                  <span style={styles.settingLabel}>Animation intensity</span>
                  <span style={styles.settingDescription}>Control the goopiness of transitions</span>
                </div>
                <input type="range" min="0" max="100" defaultValue="80" style={styles.rangeInput} />
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* ABOUT TAB */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'about' && (
          <div style={styles.aboutContainer}>
            <div style={styles.aboutLogo}>
              <span style={styles.aboutLogoIcon}>🔮</span>
              <span style={styles.aboutLogoText}>L O O M</span>
            </div>
            <p style={styles.aboutTagline}>Manifest Digital Reality</p>
            <p style={styles.aboutVersion}>Version 0.1.0</p>
            
            <div style={styles.aboutLinks}>
              <a href="#" style={styles.aboutLink}>📖 Documentation</a>
              <a href="#" style={styles.aboutLink}>🐙 GitHub</a>
              <a href="#" style={styles.aboutLink}>💬 Discord</a>
            </div>

            <div style={styles.aboutCredits}>
              <p>Built with ❤️ using Electron, React, and Three.js</p>
              <p style={styles.aboutCopyright}>© 2024 The Coding Dojo</p>
            </div>
          </div>
        )}
      </div>

      {/* Goopy animation keyframes */}
      <style>{`
        @keyframes settingsSlideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes keyCardIn {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        @keyframes pulseGlow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(0, 255, 255, 0.2);
          }
          50% {
            box-shadow: 0 0 30px rgba(0, 255, 255, 0.4);
          }
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
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'linear-gradient(180deg, rgba(10, 10, 25, 0.98) 0%, rgba(5, 5, 15, 0.98) 100%)',
    color: '#ffffff',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
    overflow: 'hidden',
  },

  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px',
    borderBottom: '1px solid rgba(0, 255, 255, 0.1)',
    background: 'rgba(0, 0, 0, 0.3)',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  headerIcon: {
    fontSize: '28px',
    filter: 'drop-shadow(0 0 8px rgba(0, 255, 255, 0.5))',
  },
  headerText: {
    fontSize: '20px',
    fontWeight: 700,
    letterSpacing: '2px',
    background: 'linear-gradient(90deg, #00ffff, #ff00ff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  closeButton: {
    width: '36px',
    height: '36px',
    border: 'none',
    background: 'rgba(255, 50, 50, 0.1)',
    color: 'rgba(255, 100, 100, 0.8)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    transition: 'all 0.2s ease',
  },

  // Tab Bar
  tabBar: {
    display: 'flex',
    gap: '4px',
    padding: '16px 24px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    border: 'none',
    background: 'transparent',
    color: 'rgba(255, 255, 255, 0.5)',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    position: 'relative',
    fontFamily: 'inherit',
    animation: 'settingsSlideIn 0.4s ease forwards',
  },
  tabActive: {
    background: 'rgba(0, 255, 255, 0.1)',
    color: '#00ffff',
  },
  tabIcon: {
    fontSize: '18px',
  },
  tabLabel: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.5px',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: '0',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '40px',
    height: '3px',
    background: 'linear-gradient(90deg, #00ffff, #ff00ff)',
    borderRadius: '3px 3px 0 0',
  },

  // Content
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '24px',
  },

  // Keys Tab
  keysContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  keysHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
  },

  // LLM API Keys Section
  llmSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  llmKeysList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  llmKeyCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    background: 'linear-gradient(135deg, rgba(0, 255, 200, 0.03), rgba(255, 0, 255, 0.02))',
    border: '1px solid rgba(0, 255, 200, 0.15)',
    borderRadius: '12px',
    transition: 'all 0.2s ease',
    position: 'relative',
  },
  llmKeyLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  llmKeyIcon: {
    fontSize: '28px',
    width: '48px',
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 255, 200, 0.1)',
    borderRadius: '12px',
  },
  llmKeyInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  llmKeyName: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#ffffff',
  },
  llmKeyDescription: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  llmKeyRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  llmKeyStatus: {
    fontSize: '13px',
    fontFamily: 'monospace',
    letterSpacing: '0.5px',
  },
  llmKeyActions: {
    display: 'flex',
    gap: '8px',
  },
  llmKeyEditForm: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  llmKeyInput: {
    padding: '10px 14px',
    background: 'rgba(0, 0, 0, 0.4)',
    border: '1px solid rgba(0, 255, 200, 0.3)',
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '13px',
    fontFamily: 'monospace',
    width: '240px',
    outline: 'none',
    transition: 'border-color 0.2s ease',
  },
  llmKeySaveBtn: {
    width: '36px',
    height: '36px',
    border: 'none',
    background: 'linear-gradient(135deg, #00ffc8, #00cc99)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    color: '#000',
    fontWeight: 'bold',
  },
  llmKeyCancelBtn: {
    width: '36px',
    height: '36px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    background: 'transparent',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  sectionDivider: {
    height: '1px',
    background: 'linear-gradient(90deg, transparent, rgba(0, 255, 200, 0.2), transparent)',
    margin: '12px 0',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#00ffff',
    margin: '0 0 8px 0',
    letterSpacing: '1px',
  },
  sectionDescription: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.5)',
    lineHeight: 1.5,
    margin: 0,
    maxWidth: '500px',
  },
  addButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    background: 'linear-gradient(135deg, rgba(0, 255, 255, 0.2), rgba(255, 0, 255, 0.2))',
    border: '1px solid rgba(0, 255, 255, 0.4)',
    borderRadius: '10px',
    color: '#00ffff',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'inherit',
    transition: 'all 0.3s ease',
    whiteSpace: 'nowrap',
  },

  // Key Form
  keyForm: {
    background: 'rgba(0, 255, 255, 0.05)',
    border: '1px solid rgba(0, 255, 255, 0.2)',
    borderRadius: '16px',
    padding: '20px',
    animation: 'settingsSlideIn 0.3s ease forwards',
  },
  formHeader: {
    marginBottom: '20px',
  },
  formTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#00ffff',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 200px',
    gap: '16px',
    marginBottom: '16px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '16px',
  },
  formLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.7)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  formHint: {
    fontWeight: 400,
    color: 'rgba(255, 255, 255, 0.4)',
    textTransform: 'none',
  },
  formInput: {
    padding: '12px 16px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '14px',
    fontFamily: 'inherit',
    transition: 'all 0.2s ease',
    outline: 'none',
  },
  formSelect: {
    padding: '12px 16px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '14px',
    fontFamily: 'inherit',
    cursor: 'pointer',
    outline: 'none',
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '20px',
    paddingTop: '16px',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
  },
  cancelButton: {
    padding: '10px 20px',
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '8px',
    color: 'rgba(255, 255, 255, 0.6)',
    cursor: 'pointer',
    fontSize: '13px',
    fontFamily: 'inherit',
    transition: 'all 0.2s ease',
  },
  saveButton: {
    padding: '10px 24px',
    background: 'linear-gradient(135deg, #00ffff, #00cc99)',
    border: 'none',
    borderRadius: '8px',
    color: '#000000',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'inherit',
    transition: 'all 0.2s ease',
  },
  statusMessage: {
    textAlign: 'center',
    marginTop: '12px',
    fontSize: '13px',
    color: '#00ff88',
    animation: 'settingsSlideIn 0.2s ease forwards',
  },

  // Keys List
  keysList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '16px',
    opacity: 0.5,
  },
  emptyText: {
    fontSize: '16px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.6)',
    margin: '0 0 8px 0',
  },
  emptySubtext: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.4)',
    margin: 0,
    maxWidth: '300px',
  },
  keyCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    transition: 'all 0.2s ease',
    animation: 'keyCardIn 0.3s ease forwards',
    position: 'relative',
  },
  keyCardLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  keyIcon: {
    fontSize: '24px',
    width: '44px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 255, 255, 0.1)',
    borderRadius: '10px',
  },
  keyInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  keyName: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#ffffff',
  },
  keyDescription: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  keyMeta: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.3)',
  },
  keyCardRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  keyValue: {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.3)',
    fontFamily: 'monospace',
    letterSpacing: '2px',
  },
  keyActions: {
    display: 'flex',
    gap: '8px',
  },
  keyActionBtn: {
    width: '36px',
    height: '36px',
    border: 'none',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    background: 'rgba(255, 50, 50, 0.1)',
  },
  deleteConfirm: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    background: 'rgba(20, 0, 30, 0.95)',
    borderRadius: '12px',
    animation: 'settingsSlideIn 0.2s ease forwards',
  },
  deleteConfirmActions: {
    display: 'flex',
    gap: '8px',
  },
  deleteConfirmNo: {
    padding: '8px 16px',
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '6px',
    color: 'rgba(255, 255, 255, 0.6)',
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: 'inherit',
  },
  deleteConfirmYes: {
    padding: '8px 16px',
    background: 'rgba(255, 50, 50, 0.2)',
    border: '1px solid rgba(255, 50, 50, 0.5)',
    borderRadius: '6px',
    color: '#ff6666',
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: 'inherit',
  },

  // Security Notice
  securityNotice: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    padding: '16px 20px',
    background: 'rgba(0, 255, 136, 0.05)',
    border: '1px solid rgba(0, 255, 136, 0.2)',
    borderRadius: '12px',
    marginTop: '20px',
  },
  securityIcon: {
    fontSize: '24px',
  },
  securityText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.7)',
  },

  // General Tab
  generalContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  settingGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: '12px',
    padding: '16px',
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
  settingRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  settingInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  settingLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#ffffff',
  },
  settingDescription: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  toggleOn: {
    padding: '8px 16px',
    background: 'rgba(0, 255, 136, 0.2)',
    border: '1px solid rgba(0, 255, 136, 0.5)',
    borderRadius: '6px',
    color: '#00ff88',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'inherit',
  },
  toggleOff: {
    padding: '8px 16px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    color: 'rgba(255, 255, 255, 0.4)',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'inherit',
  },
  shortcutList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: '12px',
    padding: '16px',
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
  shortcutRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 0',
  },
  shortcutAction: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  shortcutKeys: {
    padding: '6px 12px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    fontSize: '12px',
    fontFamily: 'monospace',
    color: '#00ffff',
  },

  // Appearance Tab
  appearanceContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  selectInput: {
    padding: '10px 16px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '13px',
    fontFamily: 'inherit',
    cursor: 'pointer',
    outline: 'none',
    minWidth: '150px',
  },
  colorPicker: {
    display: 'flex',
    gap: '8px',
  },
  colorSwatch: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    cursor: 'pointer',
    border: '2px solid transparent',
    transition: 'all 0.2s ease',
  },
  rangeInput: {
    width: '150px',
    accentColor: '#00ffff',
  },

  // About Tab
  aboutContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    textAlign: 'center',
    gap: '16px',
  },
  aboutLogo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  aboutLogoIcon: {
    fontSize: '64px',
    filter: 'drop-shadow(0 0 20px rgba(255, 0, 255, 0.5))',
    animation: 'pulseGlow 2s ease-in-out infinite',
  },
  aboutLogoText: {
    fontSize: '32px',
    fontWeight: 700,
    letterSpacing: '8px',
    background: 'linear-gradient(90deg, #00ffff, #ff00ff, #00ffff)',
    backgroundSize: '200% 100%',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  aboutTagline: {
    fontSize: '16px',
    color: 'rgba(255, 255, 255, 0.6)',
    fontStyle: 'italic',
  },
  aboutVersion: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.4)',
    padding: '6px 16px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '20px',
  },
  aboutLinks: {
    display: 'flex',
    gap: '16px',
    marginTop: '24px',
  },
  aboutLink: {
    padding: '10px 20px',
    background: 'rgba(0, 255, 255, 0.1)',
    border: '1px solid rgba(0, 255, 255, 0.3)',
    borderRadius: '8px',
    color: '#00ffff',
    textDecoration: 'none',
    fontSize: '13px',
    transition: 'all 0.2s ease',
  },
  aboutCredits: {
    marginTop: '40px',
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.4)',
    lineHeight: 1.8,
  },
  aboutCopyright: {
    marginTop: '8px',
    color: 'rgba(255, 255, 255, 0.3)',
  },
};

