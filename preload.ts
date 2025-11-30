// preload.ts — LOOM
// Secure IPC bridge for overlay↔main↔background communication
// API keys NEVER leave the main process

import { contextBridge, ipcRenderer } from 'electron';
import type { LoomUiStatePatch, ChatMessage } from './src/types/ui-state';

// Detect which layer we're in
const params = new URLSearchParams(window.location.search);
const layer = params.get('layer') || 'background';

// Detect if running in dev mode (check URL - dev uses localhost)
const isDev = window.location.protocol === 'http:' || window.location.hostname === 'localhost';

type BackgroundInteractionConfig = {
  enabled: boolean;
  toggleKey: string;
};

console.log(`🔮 Loom preload ready [${layer}]`);
console.log('⌨️  Press Ctrl+Alt+S to toggle Summoner');
console.log('⌨️  Press Ctrl+Alt+L to open Loom Panel');
console.log('🧙 LOOM SUMMONER v2 — Manifest reality');

// Debug: Log ALL incoming IPC events
ipcRenderer.on('summon-inject', (_event, data) => {
  console.log(`[${layer}] 📥 IPC RECEIVED: summon-inject`, data?.prompt, data?.code?.length + ' chars');
});

// Test ping from main process
ipcRenderer.on('test-ping', (_event, data) => {
  console.log(`[${layer}] 🏓 TEST PING RECEIVED:`, data);
});

// Log all IPC events for debugging
ipcRenderer.on('summon-start', (_event, data) => {
  console.log(`[${layer}] 📥 IPC RECEIVED: summon-start`, data?.prompt);
});

// Expose diagnostic API
contextBridge.exposeInMainWorld('electronAPI', {
  // Diagnostics
  getAllWindows: () => ipcRenderer.invoke('get-all-windows'),
  
  // SUMMONER — direct invoke method
  summon: (prompt: string) => ipcRenderer.invoke('summon-glyph-direct', prompt),
  
  // Save dynamic glyph to file system
  saveDynamicGlyph: (fileName: string, code: string) => 
    ipcRenderer.invoke('save-dynamic-glyph', fileName, code),
});

// Expose typed API to renderer
contextBridge.exposeInMainWorld('loom', {
  // ═══════════════════════════════════════════════════════════════════════════
  // 🔧 ENVIRONMENT INFO
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Whether running in development mode (npm run dev)
  isDev,
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 🧙 SUMMONER v1 — Secure LLM streaming (keys in main process)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Request a summon from main process (secure, keys never exposed)
  summonRequest: (prompt: string, model?: string, linkedKeys?: string[]) => {
    console.log(`[${layer}] 📤 IPC SEND: summon-request`, prompt, model ? `(model: ${model})` : '(auto)', linkedKeys?.length ? `(${linkedKeys.length} linked keys)` : '');
    ipcRenderer.send('summon-request', { prompt, model, linkedKeys });
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 💬 CHAT — Conversational mode (no glyph generation)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Request a chat response from main process (no glyph creation)
  chatRequest: (message: string, model?: string, history?: ChatMessage[]) => {
    console.log(
      `[${layer}] 📤 IPC SEND: chat-request`,
      message.slice(0, 50),
      model ? `(model: ${model})` : '(auto)',
      history?.length ? `(+${history.length} history msgs)` : ''
    );
    ipcRenderer.send('chat-request', { message, model, history });
  },
  
  // Listen for chat streaming chunks
  onChatChunk: (callback: (data: { chunk: string; fullResponse: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { chunk: string; fullResponse: string }) => {
      callback(data);
    };
    ipcRenderer.on('chat-chunk', listener);
    return () => ipcRenderer.removeListener('chat-chunk', listener);
  },
  
  // Listen for chat completion
  onChatComplete: (callback: (data: { response: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { response: string }) => {
      console.log(`[${layer}] 📥 IPC RECEIVED: chat-complete`, data?.response?.length + ' chars');
      callback(data);
    };
    ipcRenderer.on('chat-complete', listener);
    return () => ipcRenderer.removeListener('chat-complete', listener);
  },
  
  // Listen for chat errors
  onChatError: (callback: (data: { error: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { error: string }) => {
      console.log(`[${layer}] 📥 IPC RECEIVED: chat-error`, data?.error);
      callback(data);
    };
    ipcRenderer.on('chat-error', listener);
    return () => ipcRenderer.removeListener('chat-error', listener);
  },
  
  // Get available AI models
  getAvailableModels: () => ipcRenderer.invoke('get-available-models'),
  loadUIState: () => ipcRenderer.invoke('ui-state:load'),
  saveUIState: (patch: LoomUiStatePatch) => ipcRenderer.invoke('ui-state:save', patch),
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 💬 CHAT HISTORY — Persistent conversation storage
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Load all chat conversations
  loadChatHistory: () => ipcRenderer.invoke('chat-history:load'),
  
  // Create a new conversation
  createConversation: (title?: string) => ipcRenderer.invoke('chat-history:create', title),
  
  // Update a conversation
  updateConversation: (conversationId: string, updates: Record<string, unknown>) => 
    ipcRenderer.invoke('chat-history:update', conversationId, updates),
  
  // Add a message to a conversation
  addMessageToConversation: (conversationId: string, message: ChatMessage) =>
    ipcRenderer.invoke('chat-history:add-message', conversationId, message),
  
  // Update a specific message in a conversation
  updateMessage: (conversationId: string, messageId: string, updates: Record<string, unknown>) => 
    ipcRenderer.invoke('chat-history:update-message', conversationId, messageId, updates),
  
  // Delete a conversation
  deleteConversation: (conversationId: string) => ipcRenderer.invoke('chat-history:delete', conversationId),
  
  // Set active conversation
  setActiveConversation: (conversationId: string) => ipcRenderer.invoke('chat-history:set-active', conversationId),
  
  // Inject compiled glyph into background
  summonInject: (
    payload: string | { code: string; prompt?: string; type?: string; glyphId?: string; mode?: 'background' | 'widget' },
    legacyPrompt?: string
  ) => {
    const data = typeof payload === 'string'
      ? { code: payload, prompt: legacyPrompt }
      : payload;

    const resolvedPrompt = data.prompt && data.prompt.trim()
      ? data.prompt.trim()
      : legacyPrompt && legacyPrompt.trim()
        ? legacyPrompt.trim()
        : 'Untitled Glyph';

    const message = {
      ...data,
      prompt: resolvedPrompt,
    };

    console.log(
      `[${layer}] 📤 IPC SEND: summon-inject`,
      message.prompt,
      message.code.length + ' chars',
      message.type ? `(type: ${message.type})` : ''
    );
    ipcRenderer.send('summon-inject', message);
  },
  
  // Listen for streaming chunks from main process
  onSummonChunk: (callback: (data: { chunk: string; fullCode: string; attempt?: number }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { chunk: string; fullCode: string; attempt?: number }) => {
      callback(data);
    };
    ipcRenderer.on('summon-chunk', listener);
    return () => ipcRenderer.removeListener('summon-chunk', listener);
  },
  
  // Listen for summon completion
  onSummonComplete: (callback: (data: { 
    code: string; 
    fallback?: boolean;
    type?: string;
    attempt?: number;
    manifest?: { name: string; type: string } | null;
    bundle?: { id: string; name: string; type: string; locations: string[] } | null;
  }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { 
      code: string; 
      fallback?: boolean;
      type?: string;
      attempt?: number;
      manifest?: { name: string; type: string } | null;
      bundle?: { id: string; name: string; type: string; locations: string[] } | null;
    }) => {
      console.log(`[${layer}] 📥 IPC RECEIVED: summon-complete`, data?.code?.length + ' chars', `(attempt ${data?.attempt})`);
      callback(data);
    };
    ipcRenderer.on('summon-complete', listener);
    return () => ipcRenderer.removeListener('summon-complete', listener);
  },
  
  // Listen for summon errors
  onSummonError: (callback: (data: { error: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { error: string }) => callback(data);
    ipcRenderer.on('summon-error', listener);
    return () => ipcRenderer.removeListener('summon-error', listener);
  },
  
  // Listen for provider switch (Grok → Gemini → OpenAI fallback)
  onSummonProvider: (callback: (data: { provider: string; attempt?: number; isRefinement?: boolean }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { provider: string; attempt?: number; isRefinement?: boolean }) => callback(data);
    ipcRenderer.on('summon-provider', listener);
    return () => ipcRenderer.removeListener('summon-provider', listener);
  },
  
  // Request LLM refinement to fix errors
  summonRefine: (data: { prompt: string; code: string; error: string; attempt: number; model?: string }) => {
    console.log(`[${layer}] 📤 IPC SEND: summon-refine`, data.prompt, `(attempt ${data.attempt + 1})`);
    ipcRenderer.send('summon-refine', data);
  },
  
  // Listen for refinement status (background receives)
  onSummonRefining: (callback: (data: { attempt: number; error: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { attempt: number; error: string }) => {
      console.log(`[${layer}] 📥 IPC RECEIVED: summon-refining`, `(attempt ${data?.attempt})`);
      callback(data);
    };
    ipcRenderer.on('summon-refining', listener);
    return () => ipcRenderer.removeListener('summon-refining', listener);
  },
  
  // Report compilation/runtime error from background (for auto-refinement)
  reportGlyphError: (data: { prompt: string; code: string; error: string }) => {
    console.log(`[${layer}] 📤 IPC SEND: glyph-error`, data.error.slice(0, 50));
    ipcRenderer.send('glyph-error', data);
  },
  
  // Listen for summon start (background receives this)
  onSummonStart: (callback: (data: { prompt: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { prompt: string }) => {
      console.log(`[${layer}] 📥 IPC RECEIVED: summon-start`, data?.prompt);
      callback(data);
    };
    ipcRenderer.on('summon-start', listener);
    return () => ipcRenderer.removeListener('summon-start', listener);
  },
  
  // Listen for glyph injection (background compiles and renders)
  onSummonInject: (callback: (data: { code: string; prompt: string; mode?: 'background' | 'widget'; glyphId?: string }) => void) => {
    console.log(`[${layer}] 🎧 Registering listener: summon-inject`);
    const listener = (_event: Electron.IpcRendererEvent, data: { code: string; prompt: string; mode?: 'background' | 'widget'; glyphId?: string }) => {
      console.log(`[${layer}] 📥 CALLBACK: summon-inject`, data?.prompt, `mode: ${data?.mode || 'background'}`);
      callback(data);
    };
    ipcRenderer.on('summon-inject', listener);
    return () => ipcRenderer.removeListener('summon-inject', listener);
  },
  
  // Listen for summon clear (background clears glyph)
  onSummonClear: (callback: () => void) => {
    console.log(`[${layer}] 🎧 Registering listener: summon-clear`);
    const listener = () => {
      console.log(`[${layer}] 📥 CALLBACK: summon-clear`);
      callback();
    };
    ipcRenderer.on('summon-clear', listener);
    return () => ipcRenderer.removeListener('summon-clear', listener);
  },

  // Listen for widget injection (overlay renders draggable widgets)
  onWidgetInject: (callback: (data: { code: string; prompt: string; glyphId: string; inputs?: Record<string, unknown> }) => void) => {
    console.log(`[${layer}] 🎧 Registering listener: widget-inject`);
    const listener = (_event: Electron.IpcRendererEvent, data: { code: string; prompt: string; glyphId: string; inputs?: Record<string, unknown> }) => {
      console.log(`[${layer}] 📥 CALLBACK: widget-inject`, data?.prompt);
      callback(data);
    };
    ipcRenderer.on('widget-inject', listener);
    return () => ipcRenderer.removeListener('widget-inject', listener);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 🪟 WINDOW CONTROLS — Mac-style minimize, maximize, close
  // ═══════════════════════════════════════════════════════════════════════════
  
  windowControl: (action: 'close' | 'minimize' | 'maximize') => 
    ipcRenderer.invoke('window-control', action),
  
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // ═══════════════════════════════════════════════════════════════════════════
  // 🖱️ MOUSE CAPTURE — Toggle click-through for UI hover
  // ═══════════════════════════════════════════════════════════════════════════
  
  mouseEnterUI: () => {
    ipcRenderer.send('overlay-mouse-enter');
  },
  
  mouseLeaveUI: () => {
    ipcRenderer.send('overlay-mouse-leave');
  },

  getBackgroundInteraction: () => ipcRenderer.invoke('background-interaction:get'),

  toggleBackgroundInteraction: (reason?: string) =>
    ipcRenderer.invoke('background-interaction:toggle', { reason: reason || 'renderer-request' }),

  onBackgroundInteractionUpdate: (callback: (data: BackgroundInteractionConfig) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: BackgroundInteractionConfig) => callback(data);
    ipcRenderer.on('background-interaction-update', listener);
    return () => ipcRenderer.removeListener('background-interaction-update', listener);
  },
  
  // Background window mouse capture (for interactive glyphs)
  backgroundMouseEnter: () => {
    console.log(`[${layer}] 🎯 Background mouse enter - requesting capture`);
    ipcRenderer.send('background-mouse-enter');
  },
  
  backgroundMouseLeave: () => {
    console.log(`[${layer}] 🎯 Background mouse leave - releasing capture`);
    ipcRenderer.send('background-mouse-leave');
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 📡 LEGACY IPC — For backwards compatibility
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Send summon request (overlay → main → background) - LEGACY
  summonGlyph: (prompt: string) => {
    ipcRenderer.send('summon-glyph', { prompt });
  },
  
  // Send status update (background → main → overlay) - LEGACY
  sendSummonStatus: (status: { generating: boolean; error?: string }) => {
    ipcRenderer.send('summon-status', status);
  },
  
  // Send streaming code (background → main → overlay) - LEGACY
  sendSummonStream: (code: string) => {
    ipcRenderer.send('summon-stream', { code });
  },
  
  // Listen for summon requests (background listens) - LEGACY
  onSummonGlyph: (callback: (data: { prompt: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { prompt: string }) => callback(data);
    ipcRenderer.on('summon-glyph', listener);
    return () => ipcRenderer.removeListener('summon-glyph', listener);
  },
  
  // Listen for status updates (overlay listens) - LEGACY
  onSummonStatus: (callback: (status: { generating: boolean; error?: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: { generating: boolean; error?: string }) => callback(status);
    ipcRenderer.on('summon-status', listener);
    return () => ipcRenderer.removeListener('summon-status', listener);
  },
  
  // Listen for streaming code (overlay listens) - LEGACY
  onSummonStream: (callback: (data: { code: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { code: string }) => callback(data);
    ipcRenderer.on('summon-stream', listener);
    return () => ipcRenderer.removeListener('summon-stream', listener);
  },
  
  // Listen for interaction state changes
  onInteractionState: (callback: (state: { enabled: boolean }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: { enabled: boolean }) => callback(state);
    ipcRenderer.on('interaction-state', listener);
    return () => ipcRenderer.removeListener('interaction-state', listener);
  },
  
  // Listen for Loom Panel toggle
  onToggleLoomPanel: (callback: () => void) => {
    const listener = () => {
      console.log(`[${layer}] 📥 IPC RECEIVED: toggle-loom-panel`);
      callback();
    };
    ipcRenderer.on('toggle-loom-panel', listener);
    return () => ipcRenderer.removeListener('toggle-loom-panel', listener);
  },
  
  // Listen for Loom Panel open (used for initial launch)
  onOpenLoomPanel: (callback: () => void) => {
    const listener = () => {
      console.log(`[${layer}] 📥 IPC RECEIVED: open-loom-panel`);
      callback();
    };
    ipcRenderer.on('open-loom-panel', listener);
    return () => ipcRenderer.removeListener('open-loom-panel', listener);
  },
  
  // Notify main process that panel was closed from renderer
  notifyLoomPanelClosed: () => {
    console.log(`[${layer}] 📤 IPC SEND: loom-panel-closed`);
    ipcRenderer.send('loom-panel-closed');
  },
  
  // Remove summon-related listeners (cleanup) - NOT the toggle-loom-panel listener!
  removeAllListeners: () => {
    console.log(`[${layer}] 🔌 Removing summon IPC listeners (keeping toggle-loom-panel)`);
    ipcRenderer.removeAllListeners('summon-chunk');
    ipcRenderer.removeAllListeners('summon-complete');
    ipcRenderer.removeAllListeners('summon-error');
    ipcRenderer.removeAllListeners('summon-provider');
    ipcRenderer.removeAllListeners('summon-start');
    ipcRenderer.removeAllListeners('summon-inject');
    ipcRenderer.removeAllListeners('summon-glyph');
    ipcRenderer.removeAllListeners('summon-status');
    ipcRenderer.removeAllListeners('summon-stream');
    ipcRenderer.removeAllListeners('interaction-state');
    // NOTE: Not removing toggle-loom-panel - it should persist
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔮 LOOM PANEL — Glyph management and code editing
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Load all glyphs from file system
  loadGlyphs: () => ipcRenderer.invoke('load-glyphs'),
  
  // Load glyph folder organization
  loadGlyphFolders: () => ipcRenderer.invoke('load-glyph-folders'),
  
  // Save glyph folder organization
  saveGlyphFolders: (data: { 
    folders: Array<{ id: string; name: string; icon: string; collapsed?: boolean; glyphIds: string[]; createdAt: string }>; 
    unassignedOrder: string[] 
  }) => ipcRenderer.invoke('save-glyph-folders', data),
  
  // Read a specific file from a glyph
  readGlyphFile: (glyphId: string, fileName: string) => 
    ipcRenderer.invoke('read-glyph-file', glyphId, fileName),
  
  // Save a file to a glyph
  saveGlyphFile: (glyphId: string, fileName: string, content: string) => 
    ipcRenderer.invoke('save-glyph-file', glyphId, fileName, content),
  
  // Invoke a glyph to the screen (as background or widget)
  invokeGlyph: (glyphId: string, mode: 'background' | 'widget' = 'background') => {
    console.log(`[${layer}] 📤 IPC SEND: invoke-glyph`, glyphId, `mode: ${mode}`);
    ipcRenderer.send('invoke-glyph', { glyphId, mode });
  },
  
  // Send widget to a specific layer (foreground/background) or remove (null)
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
    inputs?: Record<string, unknown>;
  } | null) => {
    console.log(`[${layer}] 📤 IPC SEND: widget-layer-change`, widgetId, widgetData?.layer || 'remove');
    ipcRenderer.send('widget-layer-change', { widgetId, widgetData });
  },
  
  // Listen for widget layer updates (background window receives this)
  onWidgetLayerUpdate: (callback: (data: { 
    widgetId: string; 
    widgetData: { id: string; glyphId: string; code: string; x: number; y: number; width: number; height: number; layer: 'foreground' | 'background'; inputs?: Record<string, unknown> } | null 
  }) => void) => {
    console.log(`[${layer}] 🎧 Registering listener: widget-layer-update`);
    const listener = (_event: Electron.IpcRendererEvent, data: { 
      widgetId: string; 
      widgetData: { id: string; glyphId: string; code: string; x: number; y: number; width: number; height: number; layer: 'foreground' | 'background'; inputs?: Record<string, unknown> } | null 
    }) => {
      console.log(`[${layer}] 📥 CALLBACK: widget-layer-update`, data?.widgetId, data?.widgetData?.layer || 'remove');
      callback(data);
    };
    ipcRenderer.on('widget-layer-update', listener);
    return () => ipcRenderer.removeListener('widget-layer-update', listener);
  },
  
  // Listen for glyph code updates (auto-refresh when glyph is saved)
  onGlyphUpdated: (callback: (data: { 
    glyphId: string; 
    code: string; 
    inputs?: Record<string, unknown>;
    changedFile: string;
    manifest?: { name: string; prompt?: string };
  }) => void) => {
    console.log(`[${layer}] 🎧 Registering listener: glyph-updated`);
    const listener = (_event: Electron.IpcRendererEvent, data: { 
      glyphId: string; 
      code: string; 
      inputs?: Record<string, unknown>;
      changedFile: string;
      manifest?: { name: string; prompt?: string };
    }) => {
      console.log(`[${layer}] 📥 CALLBACK: glyph-updated`, data?.glyphId, data?.changedFile);
      callback(data);
    };
    ipcRenderer.on('glyph-updated', listener);
    return () => ipcRenderer.removeListener('glyph-updated', listener);
  },
  
  // Listen for glyph list changes (new glyph created)
  onGlyphListChanged: (callback: (data: { glyphId: string }) => void) => {
    console.log(`[${layer}] 🎧 Registering listener: glyph-list-changed`);
    const listener = (_event: Electron.IpcRendererEvent, data: { glyphId: string }) => {
      console.log(`[${layer}] 📥 CALLBACK: glyph-list-changed`, data?.glyphId);
      callback(data);
    };
    ipcRenderer.on('glyph-list-changed', listener);
    return () => ipcRenderer.removeListener('glyph-list-changed', listener);
  },
  
  // Delete a glyph
  deleteGlyph: (glyphId: string) => ipcRenderer.invoke('delete-glyph', glyphId),
  
  // Open glyph in editor (switches to editor tab)
  openGlyphInEditor: (glyphId: string) => {
    // This is handled in the renderer - just emit an event
    console.log(`[${layer}] 📤 Open glyph in editor:`, glyphId);
  },
  
  // Load chat history for a glyph
  loadGlyphChatHistory: (glyphId: string) => 
    ipcRenderer.invoke('load-glyph-chat-history', glyphId),
  
  // Save a message to glyph chat history
  saveGlyphChatMessage: (glyphId: string, message: {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    type?: 'generation' | 'refinement' | 'info';
  }) => ipcRenderer.invoke('save-glyph-chat-message', glyphId, message),
  
  // Refine glyph with AI (legacy - full code replacement)
  refineGlyph: (data: { 
    glyphId: string; 
    file: string; 
    currentCode: string; 
    prompt: string; 
    originalPrompt: string;
  }) => ipcRenderer.invoke('refine-glyph', data),
  
  // Surgical refinement with line-based edits
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
  }) => {
    const debugId = data?.debugId || `refine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const payload = { ...data, debugId };
    console.log(`[${layer}] 📤 IPC INVOKE: refine-glyph-surgical`, {
      debugId,
      glyphId: data.glyphId,
      fileName: data.fileName,
      model: data.model || 'auto',
      source: data.source || 'manual',
      requestChars: data.refinementRequest?.length || 0,
      codeChars: data.currentCode?.length || 0,
      chatHistory: data.chatHistory?.length || 0,
    });
    return ipcRenderer.invoke('refine-glyph-surgical', payload);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔐 SECURE API KEY STORAGE FOR GLYPHS
  // ═══════════════════════════════════════════════════════════════════════════
  
  saveGlyphApiKey: (glyphId: string, keyName: string, keyValue: string) =>
    ipcRenderer.invoke('save-glyph-api-key', glyphId, keyName, keyValue),
  
  getGlyphApiKey: (glyphId: string, keyName: string) =>
    ipcRenderer.invoke('get-glyph-api-key', glyphId, keyName),
  
  getGlyphApiKeyValue: (glyphId: string, keyName: string) =>
    ipcRenderer.invoke('get-glyph-api-key-value', glyphId, keyName),
  
  deleteGlyphApiKey: (glyphId: string, keyName: string) =>
    ipcRenderer.invoke('delete-glyph-api-key', glyphId, keyName),

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔐 SECURE USER KEY STORAGE — Windows DPAPI encrypted
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Get all stored keys (metadata only, no values)
  getStoredKeys: () => ipcRenderer.invoke('get-stored-keys'),
  
  // Save a secure key (name, value, description, category)
  saveSecureKey: (keyId: string, keyData: {
    name: string;
    value: string;
    description?: string;
    category?: string;
  }) => ipcRenderer.invoke('save-secure-key', keyId, keyData),
  
  // Get a specific key value (decrypted) - USE WITH CAUTION
  getSecureKeyValue: (keyId: string) => ipcRenderer.invoke('get-secure-key-value', keyId),
  
  // Get multiple key values at once (for prompt context)
  getSecureKeyValuesBatch: (keyIds: string[]) => ipcRenderer.invoke('get-secure-key-values-batch', keyIds),
  
  // Delete a secure key
  deleteSecureKey: (keyId: string) => ipcRenderer.invoke('delete-secure-key', keyId),

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔑 LLM API KEY MANAGEMENT — Grok, Gemini, OpenAI
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Get LLM API key status (configured/not, masked values)
  getLlmApiKeysStatus: () => ipcRenderer.invoke('get-llm-api-keys-status'),
  
  // Save an LLM API key (encrypts with Windows DPAPI)
  saveLlmApiKey: (provider: 'grok' | 'gemini' | 'openai', apiKey: string) =>
    ipcRenderer.invoke('save-llm-api-key', provider, apiKey),
  
  // Delete an LLM API key
  deleteLlmApiKey: (provider: 'grok' | 'gemini' | 'openai') =>
    ipcRenderer.invoke('delete-llm-api-key', provider),

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔄 AUTO-UPDATER — Check for updates and manage installation
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Check for updates
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  
  // Download available update
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  
  // Install downloaded update (quits app and installs)
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  
  // Get current updater state
  getUpdaterState: () => ipcRenderer.invoke('updater:get-state'),
  
  // Get changelog only
  getChangelog: () => ipcRenderer.invoke('updater:get-changelog'),
  
  // Dismiss update notification
  dismissUpdate: () => ipcRenderer.invoke('updater:dismiss'),
  
  // Listen for updater state changes
  onUpdaterState: (callback: (state: {
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
    changelog: Array<{
      version: string;
      date: string;
      sections: Array<{
        type: 'features' | 'improvements' | 'bugfixes' | 'breaking';
        icon: string;
        title: string;
        items: string[];
      }>;
    }>;
  }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: any) => {
      callback(state);
    };
    ipcRenderer.on('updater-state', listener);
    return () => ipcRenderer.removeListener('updater-state', listener);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 🖥️ MULTI-MONITOR MANAGEMENT — Set backgrounds per monitor
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Get all connected displays with metadata
  getAllDisplays: () => ipcRenderer.invoke('get-all-displays'),
  
  // Get primary display info
  getPrimaryDisplay: () => ipcRenderer.invoke('get-primary-display'),
  
  // Move background window to specific display
  setBackgroundDisplay: (displayId: string) => ipcRenderer.invoke('set-background-display', displayId),
  
  // Get current background display info
  getBackgroundDisplay: () => ipcRenderer.invoke('get-background-display'),
  
  // Get saved backgrounds for all monitors
  getMonitorBackgrounds: () => ipcRenderer.invoke('get-monitor-backgrounds'),
  
  // Set background glyph for specific monitor
  setMonitorBackground: (config: {
    displayId: string;
    glyphId?: string;
    code?: string;
    prompt?: string;
    type?: string;
  }) => ipcRenderer.invoke('set-monitor-background', config),
  
  // Clear background for specific monitor
  clearMonitorBackground: (displayId: string) => ipcRenderer.invoke('clear-monitor-background', displayId),
  
  // Clear ALL monitor backgrounds
  clearAllMonitorBackgrounds: () => ipcRenderer.invoke('clear-all-monitor-backgrounds'),
  
  // Get total bounds spanning all displays (for overlay coordinate system)
  getAllDisplaysBounds: () => ipcRenderer.invoke('get-all-displays-bounds'),

  // ═══════════════════════════════════════════════════════════════════════════
  // 📦 BUNDLED GLYPHS — Mark glyphs to include in app distribution
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Check if a glyph is marked for bundling
  isGlyphBundled: (glyphId: string) => ipcRenderer.invoke('glyph:is-bundled', glyphId),
  
  // Bundle a glyph (copy to bundled-glyphs folder)
  bundleGlyph: (glyphId: string) => ipcRenderer.invoke('glyph:bundle', glyphId),
  
  // Unbundle a glyph (remove from bundled-glyphs folder)
  unbundleGlyph: (glyphId: string) => ipcRenderer.invoke('glyph:unbundle', glyphId),
  
  // Get list of all bundled glyph IDs
  getBundledGlyphs: () => ipcRenderer.invoke('glyph:get-bundled-list'),

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔗 GLYPH KEY LINKING — Connect vault keys to glyphs
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Get linked keys for a glyph (metadata only)
  getGlyphLinkedKeys: (glyphId: string) => 
    ipcRenderer.invoke('get-glyph-linked-keys', glyphId),
  
  // Link a key from the vault to a glyph
  linkKeyToGlyph: (glyphId: string, keyId: string) => 
    ipcRenderer.invoke('link-key-to-glyph', glyphId, keyId),
  
  // Unlink a key from a glyph
  unlinkKeyFromGlyph: (glyphId: string, keyId: string) => 
    ipcRenderer.invoke('unlink-key-from-glyph', glyphId, keyId),
  
  // Get resolved key values for a glyph (used when invoking)
  getGlyphResolvedKeys: (glyphId: string) => 
    ipcRenderer.invoke('get-glyph-resolved-keys', glyphId),

  // ═══════════════════════════════════════════════════════════════════════════
  // 📁 GLYPH FILE UPLOAD HANDLING
  // ═══════════════════════════════════════════════════════════════════════════
  
  uploadGlyphFile: (glyphId: string, fileName: string, base64Data: string, mimeType: string) =>
    ipcRenderer.invoke('upload-glyph-file', glyphId, fileName, base64Data, mimeType),
  
  readGlyphUpload: (glyphId: string, relativePath: string) =>
    ipcRenderer.invoke('read-glyph-upload', glyphId, relativePath),
  
  deleteGlyphUpload: (glyphId: string, relativePath: string) =>
    ipcRenderer.invoke('delete-glyph-upload', glyphId, relativePath),

  // ═══════════════════════════════════════════════════════════════════════════
  // 📂 LOCAL FILE SYSTEM ACCESS FOR GLYPHS
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Read a local file or directory
  readLocalFile: (filePath: string) =>
    ipcRenderer.invoke('read-local-file', filePath),
  
  // List directory contents
  listDirectory: (dirPath: string) =>
    ipcRenderer.invoke('list-directory', dirPath),
  
  // Get common system paths (home, desktop, documents, etc.)
  getSystemPaths: () =>
    ipcRenderer.invoke('get-system-paths'),
  
});

// Type declaration for the exposed API
declare global {
  interface Window {
    loom: {
      // Summoner v1 (secure)
      summonRequest: (prompt: string, model?: string, linkedKeys?: string[]) => void;
      getAvailableModels: () => Promise<Array<{ id: string; name: string; provider: string; available: boolean; icon: string }>>;
      summonInject: (payload: { code: string; prompt: string; type?: string; glyphId?: string; mode?: 'background' | 'widget' } | string, prompt?: string) => void;
      onSummonChunk: (callback: (data: { chunk: string; fullCode: string }) => void) => (() => void) | void;
      onSummonComplete: (callback: (data: { code: string; fallback?: boolean; bundle?: { id: string; name: string; type?: string; locations: string[] } | null }) => void) => (() => void) | void;
      onSummonError: (callback: (data: { error: string }) => void) => (() => void) | void;
      onSummonProvider: (callback: (data: { provider: string }) => void) => (() => void) | void;
      onSummonStart: (callback: (data: { prompt: string }) => void) => (() => void) | void;
      onSummonInject: (callback: (data: { code: string; prompt: string; mode?: 'background' | 'widget'; glyphId?: string }) => void) => (() => void) | void;
      onSummonClear: (callback: () => void) => (() => void) | void;
      onWidgetInject: (callback: (data: { code: string; prompt: string; glyphId: string; inputs?: Record<string, unknown> }) => void) => (() => void) | void;
      summonRefine: (data: { prompt: string; code: string; error: string; attempt: number; model?: string }) => void;
      onSummonRefining: (callback: (data: { attempt: number; error: string }) => void) => (() => void) | void;
      reportGlyphError: (data: { prompt: string; code: string; error: string }) => void;
      
      // Chat (conversational, no glyph generation)
      chatRequest: (message: string, model?: string, history?: ChatMessage[]) => void;
      onChatChunk: (callback: (data: { chunk: string; fullResponse: string }) => void) => (() => void) | void;
      onChatComplete: (callback: (data: { response: string }) => void) => (() => void) | void;
      onChatError: (callback: (data: { error: string }) => void) => (() => void) | void;
      
      // Mouse capture (overlay)
      mouseEnterUI: () => void;
      mouseLeaveUI: () => void;
      
      // Mouse capture (background - for interactive glyphs)
      backgroundMouseEnter: () => void;
      backgroundMouseLeave: () => void;
      
      // Legacy
      summonGlyph: (prompt: string) => void;
      sendSummonStatus: (status: { generating: boolean; error?: string }) => void;
      sendSummonStream: (code: string) => void;
      onSummonGlyph: (callback: (data: { prompt: string }) => void) => void;
      onSummonStatus: (callback: (status: { generating: boolean; error?: string }) => void) => void;
      onSummonStream: (callback: (data: { code: string }) => void) => void;
      onInteractionState: (callback: (state: { enabled: boolean }) => void) => void;
      onToggleLoomPanel: (callback: () => void) => void;
      onOpenLoomPanel: (callback: () => void) => void;
      notifyLoomPanelClosed: () => void;
      removeAllListeners: () => void;
      
      // Loom Panel - Glyph management
      loadGlyphs: () => Promise<Array<{
        id: string;
        name: string;
        type: 'background' | 'object' | 'hud';
        prompt?: string;
        savedAt?: string;
        files?: string[];
      }>>;
      readGlyphFile: (glyphId: string, fileName: string) => Promise<string>;
      saveGlyphFile: (glyphId: string, fileName: string, content: string) => Promise<{ success: boolean }>;
      invokeGlyph: (glyphId: string, mode?: 'background' | 'widget') => void;
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
        widgetData: { id: string; glyphId: string; code: string; x: number; y: number; width: number; height: number; layer: 'foreground' | 'background'; inputs?: Record<string, unknown> } | null 
      }) => void) => void;
      deleteGlyph: (glyphId: string) => Promise<{ success: boolean }>;
      openGlyphInEditor: (glyphId: string) => void;
      loadGlyphChatHistory: (glyphId: string) => Promise<Array<{
        id: string;
        role: 'user' | 'assistant';
        content: string;
        timestamp: number;
      }>>;
      refineGlyph: (data: {
        glyphId: string;
        file: string;
        currentCode: string;
        prompt: string;
        originalPrompt: string;
      }) => Promise<{ code: string } | null>;
      
      // Local file system access
      readLocalFile: (filePath: string) => Promise<{
        success: boolean;
        error?: string;
        isDirectory?: boolean;
        content?: string;
        encoding?: 'base64';
        path?: string;
        size?: number;
        modified?: string;
        extension?: string;
        files?: Array<{
          name: string;
          path: string;
          isDirectory: boolean;
          size: number;
          modified: string;
        }>;
      }>;
      listDirectory: (dirPath: string) => Promise<{
        success: boolean;
        error?: string;
        path?: string;
        parent?: string;
        files?: Array<{
          name: string;
          path: string;
          isDirectory: boolean;
          size: number;
          modified: string;
        }>;
      }>;
      getSystemPaths: () => Promise<{
        home: string;
        cwd: string;
        desktop: string;
        documents: string;
        downloads: string;
      }>;
      
      // Secure user key storage
      getStoredKeys: () => Promise<Array<{
        id: string;
        name: string;
        description?: string;
        category?: string;
        createdAt: number;
        updatedAt: number;
      }>>;
      saveSecureKey: (keyId: string, keyData: {
        name: string;
        value: string;
        description?: string;
        category?: string;
      }) => Promise<{ success: boolean; error?: string }>;
      getSecureKeyValue: (keyId: string) => Promise<{ success: boolean; value?: string; error?: string }>;
      getSecureKeyValuesBatch: (keyIds: string[]) => Promise<{ 
        success: boolean; 
        keys?: Record<string, { name: string; value: string }>; 
        error?: string 
      }>;
      deleteSecureKey: (keyId: string) => Promise<{ success: boolean; error?: string }>;
      
      // LLM API Key management
      getLlmApiKeysStatus: () => Promise<{
        success: boolean;
        keys?: {
          grok: { configured: boolean; masked: string | null };
          gemini: { configured: boolean; masked: string | null };
          openai: { configured: boolean; masked: string | null };
        };
        error?: string;
      }>;
      saveLlmApiKey: (provider: 'grok' | 'gemini' | 'openai', apiKey: string) => Promise<{ success: boolean; error?: string }>;
      deleteLlmApiKey: (provider: 'grok' | 'gemini' | 'openai') => Promise<{ success: boolean; error?: string }>;
      
      // Auto-Updater
      checkForUpdates: () => Promise<{ success: boolean; result?: unknown; error?: string }>;
      downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
      installUpdate: () => Promise<{ success: boolean }>;
      getUpdaterState: () => Promise<{
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
        changelog: Array<{
          version: string;
          date: string;
          sections: Array<{
            type: 'features' | 'improvements' | 'bugfixes' | 'breaking';
            icon: string;
            title: string;
            items: string[];
          }>;
        }>;
      }>;
      getChangelog: () => Promise<{
        changelog: Array<{
          version: string;
          date: string;
          sections: Array<{
            type: 'features' | 'improvements' | 'bugfixes' | 'breaking';
            icon: string;
            title: string;
            items: string[];
          }>;
        }>;
        currentVersion: string;
      }>;
      dismissUpdate: () => Promise<{ success: boolean }>;
      onUpdaterState: (callback: (state: {
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
        changelog: Array<{
          version: string;
          date: string;
          sections: Array<{
            type: 'features' | 'improvements' | 'bugfixes' | 'breaking';
            icon: string;
            title: string;
            items: string[];
          }>;
        }>;
      }) => void) => (() => void) | void;
      
      // Multi-Monitor Management
      getAllDisplays: () => Promise<Array<{
        id: string;
        label: string;
        bounds: { x: number; y: number; width: number; height: number };
        workArea: { x: number; y: number; width: number; height: number };
        scaleFactor: number;
        isPrimary: boolean;
        rotation: number;
      }>>;
      getPrimaryDisplay: () => Promise<{
        id: string;
        label: string;
        bounds: { x: number; y: number; width: number; height: number };
        workArea: { x: number; y: number; width: number; height: number };
        scaleFactor: number;
        isPrimary: boolean;
        rotation: number;
      }>;
      setBackgroundDisplay: (displayId: string) => Promise<{ success: boolean; error?: string }>;
      getBackgroundDisplay: () => Promise<{ displayId: string | null; bounds: { x: number; y: number; width: number; height: number } | null }>;
      getMonitorBackgrounds: () => Promise<{
        backgrounds: Array<{
          displayId: string;
          glyphId?: string;
          code?: string;
          prompt?: string;
          type?: string;
        }>;
        activeDisplayId?: string;
      }>;
      setMonitorBackground: (config: {
        displayId: string;
        glyphId?: string;
        code?: string;
        prompt?: string;
        type?: string;
      }) => Promise<{ success: boolean }>;
      clearMonitorBackground: (displayId: string) => Promise<{ success: boolean }>;
      clearAllMonitorBackgrounds: () => Promise<{ success: boolean }>;
      getAllDisplaysBounds: () => Promise<{ x: number; y: number; width: number; height: number }>;
    };
  }
}
