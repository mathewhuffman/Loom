export type WidgetLayer = 'foreground' | 'background';
export type ChatMode = 'chat' | 'summon';

// ═══════════════════════════════════════════════════════════════════════════
// 💬 CHAT HISTORY — Persistent conversation storage
// ═══════════════════════════════════════════════════════════════════════════

export interface GlyphEmbedData {
  code: string;
  glyphId: string;
  glyphName: string;
}

export interface ChatGlyphAttachment {
  attachmentId: string;
  glyphId: string;
  name: string;
  icon?: string;
  llmPayload: string;
  previewHtml?: string;
  attachedAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isSummoning?: boolean;
  glyphId?: string;
  glyphEmbed?: GlyphEmbedData; // Inline glyph preview embed data
  glyphAttachments?: ChatGlyphAttachment[];
}

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  model?: string;
  mode?: 'chat' | 'summon';
}

export interface ChatHistoryState {
  conversations: ChatConversation[];
  activeConversationId?: string;
  sidebarCollapsed?: boolean;
}

export interface PersistedWidgetState {
  id: string;
  glyphId: string;
  prompt: string;
  code: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layer: WidgetLayer;
  zIndex?: number;
  createdAt: number;
  inputs?: Record<string, unknown>; // Resolved inputs (including linked keys)
}

export type NavSection = 'chat' | 'glyphs' | 'editor' | 'monitors' | 'settings';

export interface LoomPanelState {
  size?: { width: number; height: number };
  position?: { top: number; left: number };
  navCollapsed?: boolean;
  activeSection?: NavSection;
  chatLLM?: string;        // LLM for chat conversations
  generationLLM?: string;  // LLM for glyph generation
  chatMode?: ChatMode;
}

export interface CodeEditorState {
  selectedGlyphId?: string | null;
  selectedFile?: string | null;
  glyphSidebarWidth?: number;
  fileSidebarWidth?: number;
  chatSidebarWidth?: number;
  previewHeight?: number;
  previewTab?: 'preview' | 'errors' | 'devtools';
  isEditorOpen?: boolean;
}

export interface OverlayUiState {
  prompt?: string;
  selectedModel?: string;
  recentGlyphs?: string[];
  showLoomPanel?: boolean;
  widgets?: PersistedWidgetState[];
  zIndexCounter?: number;
  loomPanel?: LoomPanelState;
  codeEditor?: CodeEditorState;
}

export interface PersistedWallpaperState {
  glyphId?: string;
  prompt?: string;
  code: string;
  type?: string;
  persistedAt: number;
  inputs?: Record<string, unknown>; // Resolved inputs (including linked keys)
}

export interface BackgroundUiState {
  wallpaper?: PersistedWallpaperState | null;
}

export interface LoomUIState {
  overlay?: OverlayUiState;
  background?: BackgroundUiState;
  chatHistory?: ChatHistoryState;
}

export type LoomUiStatePatch = Partial<LoomUIState>;

