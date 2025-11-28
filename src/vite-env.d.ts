/// <reference types="vite/client" />

// LOOM IPC Bridge — SUMMONER v1 (exposed from preload.ts)
// API keys are NEVER exposed to renderer - all LLM calls go through main process

interface AIModelInfo {
  id: string;
  name: string;
  provider: string;
  available: boolean;
  icon: string;
}

interface GlyphBundleInfo {
  id: string;
  name: string;
  type?: string; // Optional - no longer enforced
  locations: string[];
}

interface BackgroundInteractionConfig {
  enabled: boolean;
  toggleKey: string;
}

// Folder-based organization
interface GlyphFolder {
  id: string;
  name: string;
  icon: string;
  collapsed: boolean;
  glyphIds: string[];
  createdAt: number;
}

interface GlyphFoldersState {
  folders: GlyphFolder[];
  unassignedGlyphIds: string[];
}

interface LoomAPI {
  // ═══════════════════════════════════════════════════════════════════════════
  // 🧙 SUMMONER v1 — Secure LLM streaming (keys in main process)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Request a summon from main process (secure, keys never exposed)
  summonRequest: (prompt: string, model?: string) => void;
  
  // Get available AI models
  getAvailableModels: () => Promise<AIModelInfo[]>;
  
  // Inject compiled glyph into background
  summonInject: (
    payload: { code: string; prompt?: string; type?: string; glyphId?: string; mode?: 'background' | 'widget' } | string,
    prompt?: string
  ) => void;
  
  // Listen for streaming chunks from main process
  onSummonChunk: (callback: (data: { chunk: string; fullCode: string; attempt?: number }) => void) => () => void;
  
  // Listen for summon completion
  onSummonComplete: (callback: (data: { 
    code: string; 
    fallback?: boolean;
    type?: string;
    attempt?: number;
    manifest?: { name: string; type: string } | null;
    bundle?: GlyphBundleInfo | null;
  }) => void) => () => void;
  
  // Listen for summon errors
  onSummonError: (callback: (data: { error: string }) => void) => () => void;
  
  // Listen for provider switch (Grok → Gemini → OpenAI fallback)
  onSummonProvider: (callback: (data: { provider: string; attempt?: number; isRefinement?: boolean }) => void) => () => void;
  
  // Listen for summon start (background receives this)
  onSummonStart?: (callback: (data: { prompt: string }) => void) => () => void;
  
  // Listen for glyph injection (background renders iframe)
  onSummonInject?: (callback: (data: { code: string; prompt: string; type?: string; glyphId?: string; mode?: 'background' | 'widget' }) => void) => () => void;
  
  // Request LLM refinement to fix errors
  summonRefine?: (data: { prompt: string; code: string; error: string; attempt: number; model?: string }) => void;
  
  // Listen for refinement status (background receives)
  onSummonRefining?: (callback: (data: { attempt: number; error: string }) => void) => () => void;
  
  // Report compilation/runtime error from background (for auto-refinement)
  reportGlyphError?: (data: { prompt: string; code: string; error: string }) => void;

  // ═══════════════════════════════════════════════════════════════════════════
  // 🖱️ MOUSE CAPTURE — Toggle click-through for UI hover
  // ═══════════════════════════════════════════════════════════════════════════
  
  mouseEnterUI: () => void;
  mouseLeaveUI: () => void;
  
  getBackgroundInteraction?: () => Promise<BackgroundInteractionConfig>;
  toggleBackgroundInteraction?: (reason?: string) => Promise<BackgroundInteractionConfig>;
  onBackgroundInteractionUpdate?: (callback: (state: BackgroundInteractionConfig) => void) => () => void;

  // Background window mouse capture (for interactive glyphs)
  backgroundMouseEnter: () => void;
  backgroundMouseLeave: () => void;

  // ═══════════════════════════════════════════════════════════════════════════
  // 🎨 GLYPH MANAGEMENT — Loom Panel glyph CRUD
  // ═══════════════════════════════════════════════════════════════════════════
  
  loadGlyphs: () => Promise<Array<{
    id: string;
    name: string;
    type?: string; // Optional - no longer enforced
    prompt?: string;
    savedAt?: string;
    files?: string[];
    entry?: string;
    icon?: string;
    folderId?: string; // For folder-based organization
    inputs?: Array<{
      id: string;
      type: 'string' | 'apiKey' | 'file' | 'toggle' | 'select' | 'multiselect' | 'range' | 'color';
      label: string;
      description?: string;
      required?: boolean;
      value?: unknown;
      defaultValue?: unknown;
      // Type-specific
      inputType?: string;
      placeholder?: string;
      options?: Array<{ value: string; label: string }>;
      min?: number;
      max?: number;
      step?: number;
      unit?: string;
      accept?: string;
      multiple?: boolean;
      service?: string;
      onLabel?: string;
      offLabel?: string;
    }>;
  }>>;
  
  readGlyphFile: (glyphId: string, fileName: string) => Promise<string>;
  saveGlyphFile: (glyphId: string, fileName: string, content: string) => Promise<{ success: boolean }>;
  
  // Folder organization
  loadGlyphFolders: () => Promise<{
    folders: Array<{
      id: string;
      name: string;
      icon: string;
      collapsed?: boolean;
      glyphIds: string[];
      createdAt: string;
    }>;
    unassignedOrder: string[];
  }>;
  saveGlyphFolders: (data: {
    folders: Array<{
      id: string;
      name: string;
      icon: string;
      collapsed?: boolean;
      glyphIds: string[];
      createdAt: string;
    }>;
    unassignedOrder: string[];
  }) => Promise<{ success: boolean; error?: string }>;
  
  invokeGlyph: (glyphId: string, mode?: 'background' | 'widget') => void;
  deleteGlyph: (glyphId: string) => Promise<{ success: boolean }>;
  openGlyphInEditor: (glyphId: string) => void;
  loadGlyphChatHistory: (glyphId: string) => Promise<Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    type?: 'generation' | 'refinement' | 'info';
  }>>;
  saveGlyphChatMessage: (glyphId: string, message: {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    type?: 'generation' | 'refinement' | 'info';
  }) => Promise<{ success: boolean; messageCount?: number; error?: string }>;
  saveGlyphChatHistory: (glyphId: string, messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    type?: 'generation' | 'refinement' | 'info';
  }>) => Promise<{ success: boolean }>;
  
  refineGlyph: (data: {
    glyphId: string;
    file: string;
    currentCode: string;
    prompt: string;
    originalPrompt: string;
  }) => Promise<{ code: string; success: boolean; error?: string }>;

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔐 SECURE API KEY STORAGE FOR GLYPHS
  // ═══════════════════════════════════════════════════════════════════════════
  
  saveGlyphApiKey: (glyphId: string, keyName: string, keyValue: string) => Promise<{ success: boolean }>;
  getGlyphApiKey: (glyphId: string, keyName: string) => Promise<{ exists: boolean; masked: string }>;
  getGlyphApiKeyValue: (glyphId: string, keyName: string) => Promise<string | null>;
  deleteGlyphApiKey: (glyphId: string, keyName: string) => Promise<{ success: boolean }>;

  // ═══════════════════════════════════════════════════════════════════════════
  // 📁 GLYPH FILE UPLOAD HANDLING
  // ═══════════════════════════════════════════════════════════════════════════
  
  uploadGlyphFile: (glyphId: string, fileName: string, base64Data: string, mimeType: string) => Promise<{
    success: boolean;
    path?: string;
    size?: number;
    mimeType?: string;
    error?: string;
  }>;
  readGlyphUpload: (glyphId: string, relativePath: string) => Promise<{
    success: boolean;
    data?: string;
    size?: number;
    error?: string;
  }>;
  deleteGlyphUpload: (glyphId: string, relativePath: string) => Promise<{ success: boolean; error?: string }>;
  
  refineGlyphSurgical: (data: {
    glyphId: string;
    fileName: string;
    currentCode: string;
    originalPrompt: string;
    refinementRequest: string;
    chatHistory: Array<{
      id: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      timestamp: number;
      type?: 'generation' | 'refinement' | 'info';
    }>;
    model?: string;
    debugId?: string;
    source?: 'manual' | 'autofix';
  }) => Promise<{
    success: boolean;
    originalCode?: string;
    newCode?: string;
    edits?: Array<{
      type: 'replace' | 'insert' | 'delete';
      startLine: number;
      endLine?: number;
      newContent?: string;
      explanation?: string;
    }>;
    errors?: string[];
    model?: string;
    error?: string;
    rawResponse?: string;
    mode?: 'surgical' | 'full';
    debugId?: string;
    chunkCount?: number;
    promptChars?: number;
    responseChars?: number;
  }>;
  
  // Widget layer management
  sendWidgetToLayer: (widgetId: string, widgetData: {
    id: string;
    glyphId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    prompt: string;
    code: string;
    layer: 'foreground' | 'background';
  } | null) => void;
  
  onWidgetLayerUpdate: (callback: (data: { 
    widgetId: string; 
    widgetData: { id: string; glyphId: string; code: string; x: number; y: number; width: number; height: number; layer: 'foreground' | 'background' } | null 
  }) => void) => () => void;
  
  onWidgetInject: (callback: (data: { code: string; prompt: string; glyphId: string }) => void) => () => void;

  // ═══════════════════════════════════════════════════════════════════════════
  // 🎛️ LOOM PANEL CONTROLS
  // ═══════════════════════════════════════════════════════════════════════════
  
  onToggleLoomPanel: (callback: () => void) => () => void;
  onOpenLoomPanel?: (callback: () => void) => () => void;
  notifyLoomPanelClosed: () => void;

  // ═══════════════════════════════════════════════════════════════════════════
  // 📡 LEGACY IPC — For backwards compatibility
  // ═══════════════════════════════════════════════════════════════════════════
  
  summonGlyph: (prompt: string) => void;
  sendSummonStatus: (status: { generating: boolean; error?: string }) => void;
  sendSummonStream: (code: string) => void;
  onSummonGlyph?: (callback: (data: { prompt: string }) => void) => () => void;
  onSummonStatus: (callback: (status: { generating: boolean; error?: string }) => void) => () => void;
  onSummonStream: (callback: (data: { code: string }) => void) => () => void;
  onInteractionState: (callback: (state: { enabled: boolean }) => void) => () => void;
  removeAllListeners: () => void;
}

// Diagnostic API
interface ElectronAPI {
  getAllWindows: () => Promise<Array<{
    id: number;
    title: string;
    focused: boolean;
    visible: boolean;
    bounds: { x: number; y: number; width: number; height: number };
  }>>;
  summon: (prompt: string) => Promise<string>;
  saveDynamicGlyph: (fileName: string, code: string) => Promise<{ success: boolean; path: string }>;
}

declare global {
  interface Window {
    loom?: LoomAPI;
    electronAPI?: ElectronAPI;
  }
}

export {};
