/**
 * CODE EDITOR VIEW — Refine your digital creations
 * File browser, code editor with linting, and AI chat for refinements
 * Now with resizable glyph preview panel!
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import * as Diff from 'diff';
import GlyphIframe from '../GlyphIframe';
import type { CodeEditorState } from '../../types/ui-state';

/**
 * Extract HTML content from streaming JSON manifest
 * The LLM generates: {"name": "...", "files": {"index.html": "<!DOCTYPE html>..."}}
 * We want to extract just the HTML content as it streams in
 */
interface ExtractedManifestData {
  html: string;
  glyphName: string;
  isComplete: boolean;
  icon?: string;
  inputs?: Array<{
    id: string;
    type: string;
    label: string;
    description?: string;
    required?: boolean;
    service?: string;
    defaultValue?: unknown;
    placeholder?: string;
    options?: Array<{ value: string; label: string }>;
  }>;
  entry?: string;
  isMarkerFormat?: boolean;
}

function extractFromStreamingResponse(rawResponse: string): ExtractedManifestData {
  let html = '';
  let glyphName = '';
  let isComplete = false;
  let icon: string | undefined;
  let inputs: ExtractedManifestData['inputs'] | undefined;
  let entry: string | undefined;
  let isMarkerFormat = false;
  
  // Check if this is the new marker-based format
  if (rawResponse.includes('<<<MANIFEST>>>')) {
    isMarkerFormat = true;
    
    // Extract manifest JSON
    const manifestMatch = rawResponse.match(/<<<MANIFEST>>>([\s\S]*?)<<<END_MANIFEST>>>/);
    if (manifestMatch) {
      try {
        const manifest = JSON.parse(manifestMatch[1].trim());
        glyphName = manifest.name || '';
        icon = manifest.icon;
        entry = manifest.entry;
        inputs = manifest.inputs;
      } catch {
        // Manifest might be incomplete during streaming
        // Try to extract name at least
        const nameMatch = manifestMatch[1].match(/"name"\s*:\s*"([^"]+)"/);
        if (nameMatch) glyphName = nameMatch[1];
      }
    } else {
      // Manifest section still streaming - try partial extraction
      const partialManifest = rawResponse.slice(rawResponse.indexOf('<<<MANIFEST>>>') + 14);
      const nameMatch = partialManifest.match(/"name"\s*:\s*"([^"]+)"/);
      if (nameMatch) glyphName = nameMatch[1];
    }
    
    // Extract HTML file content
    const htmlFileMatch = rawResponse.match(/<<<FILE:index\.html>>>([\s\S]*?)(?:<<<END_FILE>>>|$)/);
    if (htmlFileMatch) {
      html = htmlFileMatch[1];
      isComplete = rawResponse.includes('<<<END_FILE>>>') && rawResponse.includes('<<<END>>>');
    }
    
    return { html, glyphName, isComplete, icon, inputs, entry, isMarkerFormat };
  }
  
  // Legacy JSON format parsing
  // Try to extract glyph name
  const nameMatch = rawResponse.match(/"name"\s*:\s*"([^"]+)"/);
  if (nameMatch) {
    glyphName = nameMatch[1];
  }
  
  // Try to extract icon
  const iconMatch = rawResponse.match(/"icon"\s*:\s*"([^"]+)"/);
  if (iconMatch) {
    icon = iconMatch[1];
  }
  
  // Try to extract entry
  const entryMatch = rawResponse.match(/"entry"\s*:\s*"([^"]+)"/);
  if (entryMatch) {
    entry = entryMatch[1];
  }
  
  // Try to extract inputs array - look for complete inputs array
  const inputsMatch = rawResponse.match(/"inputs"\s*:\s*(\[[\s\S]*?\])\s*(?:,|\})/);
  if (inputsMatch) {
    try {
      inputs = JSON.parse(inputsMatch[1]);
    } catch {
      // Inputs array might be incomplete during streaming, ignore parse errors
    }
  }
  
  // Look for the index.html content start
  const htmlStartPatterns = [
    /"index\.html"\s*:\s*"/,
    /"index\.html":\s*"/,
    /files"\s*:\s*\{\s*"index\.html"\s*:\s*"/,
  ];
  
  let htmlStartIndex = -1;
  for (const pattern of htmlStartPatterns) {
    const match = rawResponse.match(pattern);
    if (match && match.index !== undefined) {
      htmlStartIndex = match.index + match[0].length;
      break;
    }
  }
  
  if (htmlStartIndex === -1) {
    // Haven't reached the HTML content yet - show what we have
    return { html: '', glyphName, isComplete: false, icon, inputs, entry, isMarkerFormat: false };
  }
  
  // Extract everything after the pattern
  let htmlContent = rawResponse.slice(htmlStartIndex);
  
  // Check if the JSON is complete (ends with proper closing)
  if (htmlContent.endsWith('"}}') || htmlContent.endsWith('"}}\n')) {
    isComplete = true;
    // Remove the closing
    htmlContent = htmlContent.replace(/"\s*\}\s*\}\s*$/, '');
  } else if (htmlContent.endsWith('"}')) {
    // Might be at the end
    htmlContent = htmlContent.replace(/"\s*\}\s*$/, '');
  }
  
  // Unescape JSON string escapes
  try {
    // Handle common JSON escapes
    html = htmlContent
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  } catch {
    html = htmlContent;
  }
  
  return { html, glyphName, isComplete, icon, inputs, entry, isMarkerFormat: false };
}

interface GlyphManifest {
  id: string;
  name: string;
  type?: string; // Optional - no longer enforced
  prompt?: string;
  savedAt?: string;
  files?: string[];
  entry?: string;
  model?: string; // Model used to generate this glyph
  icon?: string; // Custom glyph icon
  linkedKeys?: string[]; // IDs of linked keys from user's vault
  inputs?: Array<{
    id: string;
    type: string;
    label: string;
    description?: string;
    required?: boolean;
    value?: unknown;
    defaultValue?: unknown;
    service?: string;
    placeholder?: string;
  }>;
}

interface AIModel {
  id: string;
  name: string;
  provider: string;
  available: boolean;
  icon: string;
}

interface GlyphFolder {
  id: string;
  name: string;
  icon: string;
  collapsed?: boolean;
  glyphIds: string[];
  createdAt: string;
}

// FileNode interface for future tree view implementation
// interface FileNode {
//   name: string;
//   path: string;
//   isDirectory: boolean;
//   children?: FileNode[];
// }

interface EditorError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

interface DiffBlock {
  type: 'unchanged' | 'added' | 'removed';
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

// Generate grouped diff blocks from original and new code using proper diff algorithm
function generateDiffBlocks(originalCode: string, newCode: string): DiffBlock[] {
  const diffResult = Diff.diffLines(originalCode, newCode);
  const blocks: DiffBlock[] = [];
  
  let oldLine = 1;
  let newLine = 1;
  
  for (const part of diffResult) {
    const lines = part.value.split('\n');
    // Remove trailing empty string from split if the value ends with newline
    if (lines[lines.length - 1] === '') {
      lines.pop();
    }
    
    const lineCount = lines.length;
    
    if (part.added) {
      blocks.push({
        type: 'added',
        oldStart: oldLine,
        oldCount: 0,
        newStart: newLine,
        newCount: lineCount,
        lines,
      });
      newLine += lineCount;
    } else if (part.removed) {
      blocks.push({
        type: 'removed',
        oldStart: oldLine,
        oldCount: lineCount,
        newStart: newLine,
        newCount: 0,
        lines,
      });
      oldLine += lineCount;
    } else {
      // Unchanged - we'll collapse large unchanged sections
      if (lineCount > 6) {
        // Show first 3 lines
        blocks.push({
          type: 'unchanged',
          oldStart: oldLine,
          oldCount: 3,
          newStart: newLine,
          newCount: 3,
          lines: lines.slice(0, 3),
        });
        
        // Add a collapse marker (empty unchanged block with special flag)
        const hiddenCount = lineCount - 6;
        blocks.push({
          type: 'unchanged',
          oldStart: oldLine + 3,
          oldCount: hiddenCount,
          newStart: newLine + 3,
          newCount: hiddenCount,
          lines: [`... ${hiddenCount} unchanged lines ...`],
        });
        
        // Show last 3 lines
        blocks.push({
          type: 'unchanged',
          oldStart: oldLine + lineCount - 3,
          oldCount: 3,
          newStart: newLine + lineCount - 3,
          newCount: 3,
          lines: lines.slice(-3),
        });
      } else {
        blocks.push({
          type: 'unchanged',
          oldStart: oldLine,
          oldCount: lineCount,
          newStart: newLine,
          newCount: lineCount,
          lines,
        });
      }
      oldLine += lineCount;
      newLine += lineCount;
    }
  }
  
  return blocks;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  type?: 'generation' | 'refinement' | 'info';
}

interface PendingRefinementEntry {
  originalCode: string;
  newCode: string;
  edits: Array<{
    type: 'replace' | 'insert' | 'delete';
    startLine: number;
    endLine?: number;
    newContent?: string;
    explanation?: string;
  }>;
  debugId?: string;
  source?: 'manual' | 'autofix';
  createdAt: number;
  model?: string;
  mode?: 'surgical' | 'full';
  errors?: string[];
}

const createRefinementDebugId = (scope: string) =>
  `${scope}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const logRefinementEvent = (
  debugId: string | undefined,
  stage: string,
  payload?: Record<string, unknown>
) => {
  const id = debugId || 'refine-unknown';
  if (payload) {
    console.log(`[Refine][${id}] ${stage}`, {
      ...payload,
      ts: new Date().toISOString(),
    });
  } else {
    console.log(`[Refine][${id}] ${stage}`);
  }
};

interface CodeEditorViewProps {
  initialGlyphId?: string;
  streamingCode?: string;
  isStreaming?: boolean;
  persistedState?: CodeEditorState;
  onStateChange?: (state: CodeEditorState) => void;
}

export default function CodeEditorView({ 
  initialGlyphId,
  streamingCode: externalStreamingCode,
  isStreaming: externalIsStreaming,
  persistedState,
  onStateChange,
}: CodeEditorViewProps) {
  const [glyphs, setGlyphs] = useState<GlyphManifest[]>([]);
  const [folders, setFolders] = useState<GlyphFolder[]>([]);
  const [unassignedOrder, setUnassignedOrder] = useState<string[]>([]);
  const [selectedGlyph, setSelectedGlyph] = useState<GlyphManifest | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(persistedState?.selectedFile ?? null);
  const [fileContent, setFileContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [errors, setErrors] = useState<EditorError[]>([]);
  const [isModified, setIsModified] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [isChatInputFocused, setIsChatInputFocused] = useState(false);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  
  // Refinement pending state - tracked per file
  const [pendingRefinements, setPendingRefinements] = useState<Record<string, PendingRefinementEntry>>({});
  // Get pending refinement for current file
  const currentPendingRefinement = selectedFile ? pendingRefinements[selectedFile] : null;
  
  // Model selection for refinement
  const [availableModels, setAvailableModels] = useState<AIModel[]>([]);
  const [selectedRefineModel, setSelectedRefineModel] = useState<string>('');
  const [showModelMenu, setShowModelMenu] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  
  // Preview panel state
  const [previewHeight, setPreviewHeight] = useState(persistedState?.previewHeight ?? 250); // Default preview height
  const [isResizingPreview, setIsResizingPreview] = useState(false);
  const [previewTab, setPreviewTab] = useState<'preview' | 'errors' | 'devtools'>(persistedState?.previewTab ?? 'preview');
  const [estimatedRam, setEstimatedRam] = useState<string>('--');
  
  // Resolved inputs for glyph preview (includes linked keys)
  const [resolvedInputs, setResolvedInputs] = useState<Record<string, unknown>>({});
  
  // DevTools state
  const [consoleLogs, setConsoleLogs] = useState<Array<{ type: 'log' | 'warn' | 'error' | 'info'; message: string; timestamp: number }>>([]);
  const [networkRequests, setNetworkRequests] = useState<Array<{ url: string; status: number | 'pending' | 'error'; method: string; timestamp: number }>>([]);
  
  // Glyph error state (separate from editor syntax errors)
  const [glyphErrors, setGlyphErrors] = useState<string[]>([]);
  const [isAutoFixing, setIsAutoFixing] = useState(false);
  const [autoFixAttempts, setAutoFixAttempts] = useState(0);
  const MAX_AUTO_FIX_ATTEMPTS = 3;
  const [previewCode, setPreviewCode] = useState('');
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);
  
  // Sidebar resize state
  const [glyphSidebarWidth, setGlyphSidebarWidth] = useState(persistedState?.glyphSidebarWidth ?? 180);
  const [fileSidebarWidth, setFileSidebarWidth] = useState(persistedState?.fileSidebarWidth ?? 150);
  const [chatSidebarWidth, setChatSidebarWidth] = useState(persistedState?.chatSidebarWidth ?? 320); // Increased by ~15%
  const [isResizingGlyphSidebar, setIsResizingGlyphSidebar] = useState(false);
  const [isResizingFileSidebar, setIsResizingFileSidebar] = useState(false);
  const [isResizingChatSidebar, setIsResizingChatSidebar] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);
  
  // Editor open/close state
  const [isEditorOpen, setIsEditorOpen] = useState(persistedState?.isEditorOpen ?? true);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const persistedGlyphIdRef = useRef<string | null>(persistedState?.selectedGlyphId ?? null);
  const persistedFileRef = useRef<string | null>(persistedState?.selectedFile ?? null);
  const persistedStateAppliedRef = useRef(false);

  useEffect(() => {
    if (persistedStateAppliedRef.current) return;
    if (!persistedState) return;
    if (persistedState.selectedFile) {
      setSelectedFile(persistedState.selectedFile);
    }
    if (typeof persistedState.glyphSidebarWidth === 'number') {
      setGlyphSidebarWidth(persistedState.glyphSidebarWidth);
    }
    if (typeof persistedState.fileSidebarWidth === 'number') {
      setFileSidebarWidth(persistedState.fileSidebarWidth);
    }
    if (typeof persistedState.chatSidebarWidth === 'number') {
      setChatSidebarWidth(persistedState.chatSidebarWidth);
    }
    if (typeof persistedState.previewHeight === 'number') {
      setPreviewHeight(persistedState.previewHeight);
    }
    if (persistedState.previewTab) {
      setPreviewTab(persistedState.previewTab);
    }
    if (typeof persistedState.isEditorOpen === 'boolean') {
      setIsEditorOpen(persistedState.isEditorOpen);
    }
    persistedGlyphIdRef.current = persistedState.selectedGlyphId ?? null;
    persistedFileRef.current = persistedState.selectedFile ?? null;
    persistedStateAppliedRef.current = true;
  }, [persistedState]);

  // Create a lookup map for glyphs
  const glyphMap = useMemo(() => {
    const map = new Map<string, GlyphManifest>();
    glyphs.forEach(g => map.set(g.id, g));
    return map;
  }, [glyphs]);
  
  // Get all glyph IDs that are in folders
  const assignedGlyphIds = useMemo(() => {
    const ids = new Set<string>();
    folders.forEach(f => f.glyphIds.forEach(id => ids.add(id)));
    return ids;
  }, [folders]);
  
  // Get unassigned glyphs (not in any folder) - sorted by order or savedAt
  const unassignedGlyphs = useMemo(() => {
    const unassigned = glyphs.filter(g => !assignedGlyphIds.has(g.id));
    // Sort by unassignedOrder if available, otherwise by savedAt
    if (unassignedOrder.length > 0) {
      const orderMap = new Map(unassignedOrder.map((id, i) => [id, i]));
      return [...unassigned].sort((a, b) => {
        const orderA = orderMap.get(a.id) ?? Infinity;
        const orderB = orderMap.get(b.id) ?? Infinity;
        if (orderA === Infinity && orderB === Infinity) {
          return new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime();
        }
        return orderA - orderB;
      });
    }
    return unassigned;
  }, [glyphs, assignedGlyphIds, unassignedOrder]);

  // Toggle folder collapsed state with persistence
  const handleToggleFolderCollapse = useCallback(async (folderId: string) => {
    const updated = folders.map(f => 
      f.id === folderId ? { ...f, collapsed: !f.collapsed } : f
    );
    setFolders(updated);
    // Persist to disk
    try {
      await window.loom?.saveGlyphFolders?.({
        folders: updated,
        unassignedOrder,
      });
    } catch (error) {
      console.error('Failed to save folder state:', error);
    }
  }, [folders, unassignedOrder]);

  // Handler for selecting a glyph (shared between folder and flat views)
  const handleGlyphSelect = useCallback(async (glyph: GlyphManifest, preferredFile?: string | null) => {
    setSelectedGlyph(glyph);
    setIsEditorOpen(true); // Open editor when selecting glyph
    // Clear any pending refinements from previous glyph
    setPendingRefinements({});
    // Clear devtools state
    setConsoleLogs([]);
    setNetworkRequests([]);
    setResolvedInputs({});
    
    // Default to index.html for editing/preview, fallback to first file
    const defaultFile = preferredFile && glyph.files?.includes(preferredFile)
      ? preferredFile
      : glyph.files?.includes('index.html')
        ? 'index.html'
        : glyph.files?.[0] || 'index.html';
    setSelectedFile(defaultFile);
    
    // Load chat history for this glyph
    try {
      const history = await window.loom?.loadGlyphChatHistory?.(glyph.id) || [];
      setChatMessages(history);
    } catch (err) {
      console.error('Failed to load chat history:', err);
      setChatMessages([]);
    }
    
    // 🔐 Resolve inputs: manifest values + linked keys from vault
    try {
      const inputs: Record<string, unknown> = {};
      
      // First, extract values from manifest inputs (defaults and saved values)
      if (glyph.inputs && Array.isArray(glyph.inputs)) {
        for (const input of glyph.inputs) {
          if ((input as any).value !== undefined) {
            inputs[input.id] = (input as any).value;
          } else if ((input as any).defaultValue !== undefined) {
            inputs[input.id] = (input as any).defaultValue;
          }
        }
      }
      
      // Then, resolve linked keys from the secure vault
      if (glyph.linkedKeys && glyph.linkedKeys.length > 0) {
        const result = await window.loom?.getGlyphResolvedKeys?.(glyph.id);
        if (result?.success && result.keys) {
          // Get apiKey inputs from manifest for smart matching
          const apiKeyInputs = (glyph.inputs || []).filter(i => i.type === 'apiKey');
          
          for (const [, keyData] of Object.entries(result.keys) as [string, { name: string; value: string }][]) {
            const keyName = keyData.name;
            const keyNameLower = keyName.toLowerCase().replace(/\s+/g, '');
            
            // Try to find a matching apiKey input in the manifest
            let matchedInputId: string | null = null;
            
            for (const apiInput of apiKeyInputs) {
              const inputIdLower = apiInput.id.toLowerCase();
              const inputLabelLower = (apiInput.label || '').toLowerCase().replace(/\s+/g, '');
              const inputService = ((apiInput as any).service || '').toLowerCase();
              
              // Match by: input id contains key name, or key name contains input id,
              // or service matches, or label matches
              if (inputIdLower.includes(keyNameLower) || 
                  keyNameLower.includes(inputIdLower) ||
                  keyNameLower.includes(inputService) ||
                  inputService && keyNameLower.includes(inputService) ||
                  inputLabelLower.includes(keyNameLower) ||
                  keyNameLower.includes(inputLabelLower)) {
                matchedInputId = apiInput.id;
                break;
              }
            }
            
            // Use matched input ID, or fall back to key name
            const inputKey = matchedInputId || keyNameLower;
            inputs[inputKey] = keyData.value;
            console.log(`🔐 [Preview] Resolved key: ${keyName} → ${inputKey}`);
          }
        }
      }
      
      setResolvedInputs(inputs);
      console.log(`📦 [Preview] Resolved ${Object.keys(inputs).length} inputs for preview`);
    } catch (err) {
      console.error('Failed to resolve glyph inputs:', err);
      setResolvedInputs({});
    }
    
    // Always try to load index.html for preview (it's the main render file)
    const previewFile = glyph.files?.includes('index.html') ? 'index.html' : null;
    if (previewFile) {
      window.loom?.readGlyphFile?.(glyph.id, previewFile).then((content: string) => {
        setPreviewCode(content || '');
        setOriginalContent(content || '');
        // Also set file content if we're viewing the preview file
        if (defaultFile === previewFile) {
          setFileContent(content || '');
        }
      });
    }
  }, []);

  // Load glyphs and folder organization
  useEffect(() => {
    const loadGlyphsAndFolders = async () => {
      try {
        // Load glyphs and folder data in parallel
        const [loadedGlyphs, folderData] = await Promise.all([
          window.loom?.loadGlyphs?.() || [],
          window.loom?.loadGlyphFolders?.() || { folders: [], unassignedOrder: [] },
        ]);
        
        setGlyphs(loadedGlyphs);
        setFolders(folderData.folders || []);
        setUnassignedOrder(folderData.unassignedOrder || []);
        
        // Auto-select initial glyph if provided AND not currently streaming
        // (we don't want to interrupt the streaming display)
        if (initialGlyphId && !externalIsStreaming) {
          const targetGlyph = loadedGlyphs.find((g: GlyphManifest) => g.id === initialGlyphId);
          if (targetGlyph) {
            console.log('[CodeEditorView] 📂 Auto-selecting glyph:', targetGlyph.name);
            await handleGlyphSelect(targetGlyph);
          }
        } else if (persistedGlyphIdRef.current && !externalIsStreaming && !externalStreamingCode) {
          // Only restore persisted glyph if NOT streaming a new one
          const targetGlyph = loadedGlyphs.find((g: GlyphManifest) => g.id === persistedGlyphIdRef.current);
          if (targetGlyph) {
            await handleGlyphSelect(targetGlyph, persistedFileRef.current);
          }
          persistedGlyphIdRef.current = null;
          persistedFileRef.current = null;
        }
      } catch (error) {
        console.error('Failed to load glyphs:', error);
      }
    };
    loadGlyphsAndFolders();
  }, [initialGlyphId, externalIsStreaming, handleGlyphSelect]);
  
  // Load available AI models
  useEffect(() => {
    if (window.loom?.getAvailableModels) {
      window.loom.getAvailableModels().then((models) => {
        setAvailableModels(models);
      }).catch(console.error);
    }
  }, []);
  
  // Update selected model when glyph changes (use the model that generated it)
  useEffect(() => {
    if (selectedGlyph?.model) {
      setSelectedRefineModel(selectedGlyph.model);
    } else {
      // Default to Gemini 3 Pro as the best model for refinement
      const defaultModel = availableModels.find(m => m.available && m.id === 'gemini-3')
        || availableModels.find(m => m.available);
      if (defaultModel) {
        setSelectedRefineModel(defaultModel.id);
      }
    }
  }, [selectedGlyph, availableModels]);
  
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
  
  // Track streaming state
  const [streamingPhase, setStreamingPhase] = useState<'manifest' | 'html' | 'complete'>('manifest');
  const [extractedGlyphName, setExtractedGlyphName] = useState('');
  const [rawStreamingJson, setRawStreamingJson] = useState('');
  
  // Track which file to view during streaming (manifest.json or index.html)
  const [streamingViewFile, setStreamingViewFile] = useState<'manifest.json' | 'index.html'>('index.html');
  
  
  // Handle external streaming code (from summon bar)
  // The LLM generates either:
  //   1. New marker format: <<<MANIFEST>>>...<<<END_MANIFEST>>><<<FILE:index.html>>>...<<<END_FILE>>><<<END>>>
  //   2. Legacy JSON format: {"name": "...", "files": {"index.html": "..."}}
  // We show the appropriate content for each file being viewed
  useEffect(() => {
    if (externalStreamingCode) {
      setRawStreamingJson(externalStreamingCode);
      
      // Extract HTML and manifest data from the streaming response
      const { html, glyphName, isComplete, isMarkerFormat } = extractFromStreamingResponse(externalStreamingCode);
      
      if (glyphName && glyphName !== extractedGlyphName) {
        setExtractedGlyphName(glyphName);
        console.log('[CodeEditorView] 📛 Glyph name extracted:', glyphName);
      }
      
      if (html) {
        // We have HTML content - show it in the editor
        setStreamingPhase(isComplete ? 'complete' : 'html');
        console.log('[CodeEditorView] 📡 HTML streaming:', html.length, 'chars', isComplete ? '(complete)' : '(streaming)');
        
        // Update displayed content based on which file is being viewed
        if (streamingViewFile === 'index.html') {
          setFileContent(html);
          setPreviewCode(html);
        } else {
          // Show ONLY the manifest section for manifest.json, not the whole response
          if (isMarkerFormat) {
            // Extract just the manifest JSON from marker format
            const manifestMatch = externalStreamingCode.match(/<<<MANIFEST>>>([\s\S]*?)(?:<<<END_MANIFEST>>>|$)/);
            if (manifestMatch) {
              const manifestJson = manifestMatch[1].trim();
              setFileContent(manifestJson);
            } else {
              setFileContent('// Waiting for manifest data...');
            }
          } else {
            // For legacy JSON format, extract just the manifest part (without file contents)
            try {
              const jsonMatch = externalStreamingCode.match(/\{[\s\S]*?"files"\s*:/);
              if (jsonMatch) {
                // Show everything up to and including "files": { but not the actual file contents
                const manifestPart = jsonMatch[0] + ' { /* streaming... */ }';
                setFileContent(manifestPart);
              } else {
                setFileContent(externalStreamingCode.slice(0, 500) + '\n// ...(streaming)');
              }
            } catch {
              setFileContent(externalStreamingCode.slice(0, 500) + '\n// ...(streaming)');
            }
          }
        }
      } else {
        // Still in the manifest header portion - show raw streaming data directly
        setStreamingPhase('manifest');
        // Show the raw LLM response as-is (it's just manifest data, no file content yet)
        setFileContent(externalStreamingCode);
      }
    }
  }, [externalStreamingCode, extractedGlyphName, streamingViewFile]);
  
  // When streaming completes, keep the content but allow glyph selection
  useEffect(() => {
    if (!externalIsStreaming && externalStreamingCode && initialGlyphId) {
      // Streaming just completed - reload glyphs to get the new one
      console.log('[CodeEditorView] ✅ Streaming complete, reloading glyphs for:', initialGlyphId);
      const reloadGlyphs = async () => {
        try {
          // Reload glyphs and folder data
          const [loadedGlyphs, folderData] = await Promise.all([
            window.loom?.loadGlyphs?.() || [],
            window.loom?.loadGlyphFolders?.() || { folders: [], unassignedOrder: [] },
          ]);
          setGlyphs(loadedGlyphs);
          setFolders(folderData.folders || []);
          setUnassignedOrder(folderData.unassignedOrder || []);
          const targetGlyph = loadedGlyphs.find((g: GlyphManifest) => g.id === initialGlyphId);
          if (targetGlyph) {
            setSelectedGlyph(targetGlyph);
            setSelectedFile(targetGlyph.files?.[0] || 'index.html');
            // Reset streaming state
            setStreamingPhase('manifest');
            setExtractedGlyphName('');
            setRawStreamingJson('');
          }
        } catch (error) {
          console.error('Failed to reload glyphs:', error);
        }
      };
      reloadGlyphs();
    }
  }, [externalIsStreaming, initialGlyphId]);
  
  // Reset streaming state when panel closes or streaming ends completely
  useEffect(() => {
    if (!externalStreamingCode && !externalIsStreaming) {
      setStreamingPhase('manifest');
      setExtractedGlyphName('');
      setRawStreamingJson('');
    }
  }, [externalStreamingCode, externalIsStreaming]);
  
  // Clear selected glyph when starting a new streaming session
  // This ensures we don't show an old glyph while generating a new one
  useEffect(() => {
    if (externalIsStreaming && externalStreamingCode && !initialGlyphId) {
      // New streaming started - clear any previously selected glyph
      console.log('[CodeEditorView] 🆕 New streaming session started, clearing selected glyph');
      setSelectedGlyph(null);
      setSelectedFile(null);
    }
  }, [externalIsStreaming, externalStreamingCode, initialGlyphId]);
  
  // Update preview code LIVE when file content changes or when viewing HTML
  // This provides instant preview feedback without needing to save
  useEffect(() => {
    // Priority 1: If current file has pending refinement, show the new code
    if (selectedFile && pendingRefinements[selectedFile] && selectedFile.endsWith('.html')) {
      setPreviewCode(pendingRefinements[selectedFile].newCode);
      return;
    }
    
    // Priority 2: If viewing an HTML file, use current editor content (even unsaved)
    if (selectedFile?.endsWith('.html') && fileContent) {
      setPreviewCode(fileContent);
      return;
    }
    
    // Priority 3: If viewing a non-HTML file but index.html exists, try to get index.html
    // Check pending refinements first, then fall back to saved file
    if (selectedGlyph && selectedFile && !selectedFile.endsWith('.html')) {
      if (pendingRefinements['index.html']) {
        setPreviewCode(pendingRefinements['index.html'].newCode);
      } else if (selectedGlyph.files?.includes('index.html')) {
        window.loom?.readGlyphFile?.(selectedGlyph.id, 'index.html').then((content: string) => {
          if (content) setPreviewCode(content);
        });
      }
    }
  }, [fileContent, selectedFile, selectedGlyph, pendingRefinements]);
  
  // Estimate RAM usage based on code complexity
  useEffect(() => {
    if (!previewCode) {
      setEstimatedRam('--');
      return;
    }
    
    // Calculate estimated RAM based on various factors
    const codeSize = new Blob([previewCode]).size; // Actual byte size
    
    // Base memory for iframe and DOM
    let totalMemory = 5 * 1024 * 1024; // 5MB base for iframe + DOM
    
    // Code size impact (roughly 3x for parsed DOM + JS heap)
    totalMemory += codeSize * 3;
    
    // Check for memory-intensive patterns
    const hasThreeJS = /three|THREE/i.test(previewCode);
    const hasCanvas = /<canvas/i.test(previewCode);
    const hasWebGL = /webgl|getContext\s*\(\s*['"]webgl/i.test(previewCode);
    const hasWebGL2 = /webgl2|getContext\s*\(\s*['"]webgl2/i.test(previewCode);
    
    // Geometry complexity indicators
    const geometryMatches = previewCode.match(/new\s+THREE\.\w*Geometry/gi) || [];
    const geometryCount = geometryMatches.length;
    
    // Texture/material indicators
    const textureMatches = previewCode.match(/TextureLoader|\.load\s*\(/gi) || [];
    const textureCount = textureMatches.length;
    
    // Buffer/array size indicators
    const largeArrayMatches = previewCode.match(/new\s+(Float32Array|Uint8Array|Uint16Array|ArrayBuffer)\s*\(\s*(\d+)/gi) || [];
    let totalArraySize = 0;
    largeArrayMatches.forEach(match => {
      const sizeMatch = match.match(/\(\s*(\d+)/);
      if (sizeMatch) {
        totalArraySize += parseInt(sizeMatch[1]) * 4; // Assume 4 bytes per element avg
      }
    });
    
    // Render target / framebuffer
    const hasRenderTarget = /RenderTarget|FrameBuffer/i.test(previewCode);
    
    // Post-processing / effects
    const hasPostProcessing = /EffectComposer|ShaderPass|RenderPass|BloomPass|UnrealBloom/i.test(previewCode);
    
    // Animation complexity
    const hasAnimationLoop = /requestAnimationFrame|animate\s*\(|render\s*\(/i.test(previewCode);
    const hasParticles = /particle|Points|PointsMaterial|BufferAttribute/i.test(previewCode);
    const particleCountMatch = previewCode.match(/(\d{3,})\s*[,)]/g);
    let estimatedParticles = 0;
    if (particleCountMatch) {
      particleCountMatch.forEach(m => {
        const num = parseInt(m);
        if (num > 100 && num < 10000000) estimatedParticles = Math.max(estimatedParticles, num);
      });
    }
    
    // Orbit controls / interaction
    const hasControls = /OrbitControls|TrackballControls|FlyControls/i.test(previewCode);
    
    // Calculate memory additions
    if (hasThreeJS) {
      totalMemory += 25 * 1024 * 1024; // Three.js library ~25MB
      
      if (hasWebGL2) {
        totalMemory += 20 * 1024 * 1024; // WebGL2 context ~20MB
      } else if (hasWebGL) {
        totalMemory += 15 * 1024 * 1024; // WebGL context ~15MB
      }
      
      // Geometry memory (each geometry ~1-5MB depending on complexity)
      totalMemory += geometryCount * 3 * 1024 * 1024;
      
      // Texture memory (each texture ~4-16MB for 1024x1024 RGBA)
      totalMemory += textureCount * 8 * 1024 * 1024;
      
      // Particle systems can use massive amounts of memory
      if (hasParticles && estimatedParticles > 0) {
        // Each particle needs position (3 floats), color (3 floats), etc.
        totalMemory += estimatedParticles * 32; // ~32 bytes per particle
      } else if (hasParticles) {
        totalMemory += 15 * 1024 * 1024; // Default particle estimate
      }
      
      if (hasRenderTarget) totalMemory += 20 * 1024 * 1024;
      if (hasPostProcessing) totalMemory += 30 * 1024 * 1024;
      if (hasControls) totalMemory += 2 * 1024 * 1024;
    } else {
      // Non-Three.js but has canvas/WebGL
      if (hasWebGL) totalMemory += 10 * 1024 * 1024;
      if (hasCanvas) totalMemory += 5 * 1024 * 1024;
    }
    
    // Add explicit array allocations
    totalMemory += totalArraySize;
    
    // Images
    const imageMatches = previewCode.match(/<img[^>]+src/gi) || [];
    totalMemory += imageMatches.length * 4 * 1024 * 1024; // ~4MB per image
    
    // SVG (can be memory intensive)
    const hasSVG = /<svg/i.test(previewCode);
    if (hasSVG) totalMemory += 5 * 1024 * 1024;
    
    // Animation overhead
    if (hasAnimationLoop) totalMemory += 3 * 1024 * 1024;
    
    // Format the output
    if (totalMemory < 1024 * 1024) {
      setEstimatedRam(`~${Math.round(totalMemory / 1024)}KB`);
    } else if (totalMemory < 1024 * 1024 * 1024) {
      setEstimatedRam(`~${Math.round(totalMemory / (1024 * 1024))}MB`);
    } else {
      setEstimatedRam(`~${(totalMemory / (1024 * 1024 * 1024)).toFixed(1)}GB`);
    }
  }, [previewCode]);
  
  // Preview panel resize handlers
  const handlePreviewResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingPreview(true);
    resizeStartY.current = e.clientY;
    resizeStartHeight.current = previewHeight;
  }, [previewHeight]);
  
  useEffect(() => {
    if (!isResizingPreview) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = resizeStartY.current - e.clientY;
      // Allow expanding up to 90% of container height (no hard limit)
      const maxHeight = window.innerHeight * 0.8;
      const newHeight = Math.max(80, Math.min(maxHeight, resizeStartHeight.current + deltaY));
      setPreviewHeight(newHeight);
    };
    
    const handleMouseUp = () => {
      setIsResizingPreview(false);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingPreview]);
  
  // Glyph sidebar resize handler
  const handleGlyphSidebarResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingGlyphSidebar(true);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = glyphSidebarWidth;
  }, [glyphSidebarWidth]);
  
  // File sidebar resize handler
  const handleFileSidebarResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingFileSidebar(true);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = fileSidebarWidth;
  }, [fileSidebarWidth]);
  
  // Chat sidebar resize handler (resizes from left border, so delta is reversed)
  const handleChatSidebarResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingChatSidebar(true);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = chatSidebarWidth;
  }, [chatSidebarWidth]);
  
  // Sidebar resize effect
  useEffect(() => {
    if (!isResizingGlyphSidebar && !isResizingFileSidebar && !isResizingChatSidebar) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStartX.current;
      
      if (isResizingGlyphSidebar) {
        const newWidth = Math.max(100, Math.min(400, resizeStartWidth.current + deltaX));
        setGlyphSidebarWidth(newWidth);
      } else if (isResizingFileSidebar) {
        const newWidth = Math.max(100, Math.min(400, resizeStartWidth.current + deltaX));
        setFileSidebarWidth(newWidth);
      } else if (isResizingChatSidebar) {
        // Chat sidebar resizes from left, so subtract delta
        const newWidth = Math.max(200, Math.min(600, resizeStartWidth.current - deltaX));
        setChatSidebarWidth(newWidth);
      }
    };
    
    const handleMouseUp = () => {
      setIsResizingGlyphSidebar(false);
      setIsResizingFileSidebar(false);
      setIsResizingChatSidebar(false);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingGlyphSidebar, isResizingFileSidebar, isResizingChatSidebar]);

  // Load file content when file is selected
  useEffect(() => {
    if (selectedGlyph && selectedFile) {
      const loadFile = async () => {
        try {
          const content = await window.loom?.readGlyphFile?.(selectedGlyph.id, selectedFile) || '';
          setFileContent(content);
          setOriginalContent(content);
          setIsModified(false);
          
          // Load chat history for this glyph
          const history = await window.loom?.loadGlyphChatHistory?.(selectedGlyph.id) || [];
          setChatMessages(history);
        } catch (error) {
          console.error('Failed to load file:', error);
        }
      };
      loadFile();
    }
  }, [selectedGlyph, selectedFile]);

  // Simple TypeScript error detection (basic)
  useEffect(() => {
    if (!fileContent || !selectedFile?.endsWith('.tsx')) {
      setErrors([]);
      return;
    }

    const detectedErrors: EditorError[] = [];
    const lines = fileContent.split('\n');
    
    lines.forEach((line, index) => {
      // Check for missing semicolons on specific patterns
      if (line.trim().endsWith('const ') || line.trim().endsWith('let ')) {
        detectedErrors.push({
          line: index + 1,
          column: line.length,
          message: 'Incomplete variable declaration',
          severity: 'error',
        });
      }
    });
    
    setErrors(detectedErrors);
  }, [fileContent, selectedFile]);

  // Track modifications
  useEffect(() => {
    setIsModified(fileContent !== originalContent);
  }, [fileContent, originalContent]);
  
  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSave = useCallback(async () => {
    if (!selectedGlyph || !selectedFile || !isModified) return;
    
    setIsSaving(true);
    try {
      await window.loom?.saveGlyphFile?.(selectedGlyph.id, selectedFile, fileContent);
      setOriginalContent(fileContent);
      setIsModified(false);
    } catch (error) {
      console.error('Failed to save file:', error);
    }
    setIsSaving(false);
  }, [selectedGlyph, selectedFile, fileContent, isModified]);

  const handleRefine = useCallback(async () => {
    const trimmedInput = chatInput.trim();
    if (!trimmedInput || !selectedGlyph || isRefining) return;
    
    const debugId = createRefinementDebugId('manual');
    // Always refine index.html for code changes (not manifest.json)
    // Manifest edits are rarely what users want when asking for visual/behavioral changes
    const targetFileName = (selectedFile === 'manifest.json') ? 'index.html' : (selectedFile || 'index.html');
    
    // Get the correct file content - if we're switching to index.html, load that content
    let codeToRefine = fileContent;
    if (selectedFile === 'manifest.json' && targetFileName === 'index.html') {
      // Load index.html content since we're refining that instead
      try {
        const indexContent = await window.loom?.readGlyphFile?.(selectedGlyph.id, 'index.html');
        if (indexContent) {
          codeToRefine = indexContent;
        }
      } catch (err) {
        console.warn('Failed to load index.html for refinement, using preview code:', err);
        // Fallback to previewCode which should be index.html content
        if (previewCode) {
          codeToRefine = previewCode;
        }
      }
    }
    
    logRefinementEvent(debugId, 'Request initialized', {
      glyphId: selectedGlyph.id,
      fileName: targetFileName,
      hasExplicitFile: !!selectedFile,
      requestChars: trimmedInput.length,
      codeChars: codeToRefine.length,
      codeLines: codeToRefine.split('\n').length,
      chatHistory: chatMessages.length,
      model: selectedRefineModel || 'auto',
      pendingExists: !!currentPendingRefinement,
    });
    
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: trimmedInput,
      timestamp: Date.now(),
      type: 'refinement' as const,
    };
    
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsRefining(true);
    
    try {
      await window.loom?.saveGlyphChatMessage?.(selectedGlyph.id, userMessage);
    } catch (err) {
      logRefinementEvent(debugId, 'Failed to persist user chat message', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    
    const assistantId = `msg-${Date.now()}-assistant`;
    setChatMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '🔧 Analyzing code and generating surgical edits...',
      timestamp: Date.now(),
    }]);
    
    try {
      logRefinementEvent(debugId, 'Invoking refine-glyph-surgical', {
        glyphId: selectedGlyph.id,
        fileName: targetFileName,
        model: selectedRefineModel || 'auto',
      });
      
      const response = await window.loom?.refineGlyphSurgical?.({
        glyphId: selectedGlyph.id,
        fileName: targetFileName,
        currentCode: codeToRefine,
        originalPrompt: selectedGlyph.prompt || '',
        refinementRequest: trimmedInput,
        chatHistory: chatMessages,
        model: selectedRefineModel || undefined,
        debugId,
        source: 'manual',
      });
      
      const responseDebugId = response?.debugId || debugId;
      logRefinementEvent(responseDebugId, 'Response received', {
        success: response?.success ?? false,
        hasNewCode: !!response?.newCode,
        hasOriginalCode: !!response?.originalCode,
        error: response?.error,
        model: response?.model,
        mode: response?.mode,
        promptChars: response?.promptChars,
        responseChars: response?.responseChars,
        chunkCount: response?.chunkCount,
      });
      
      if (response?.success && response?.newCode && targetFileName) {
        const pendingEntry: PendingRefinementEntry = {
          originalCode: response.originalCode || codeToRefine,
          newCode: response.newCode,
          edits: response.edits || [],
          debugId: responseDebugId,
          source: 'manual',
          createdAt: Date.now(),
          model: response.model,
          mode: response.mode,
          errors: response.errors || [],
        };
        
        // If we switched files for refinement, switch the view to show the refinement
        if (targetFileName !== selectedFile) {
          setSelectedFile(targetFileName);
          // Load the original content for the target file
          const targetContent = await window.loom?.readGlyphFile?.(selectedGlyph.id, targetFileName);
          if (targetContent) {
            setFileContent(targetContent);
            setOriginalContent(targetContent);
          }
        }
        
        setPendingRefinements(prev => ({
          ...prev,
          [targetFileName]: pendingEntry,
        }));
        if (targetFileName.endsWith('.html')) {
          setPreviewCode(response.newCode);
        }
        logRefinementEvent(responseDebugId, 'Pending refinement stored', {
          fileName: targetFileName,
          edits: pendingEntry.edits.length,
          htmlPreview: targetFileName.endsWith('.html'),
        });
        
        const editsSummary = pendingEntry.edits.map((e: { type: string; startLine: number; endLine?: number; explanation?: string }) => 
          `• ${e.type.toUpperCase()} line${e.endLine && e.endLine !== e.startLine ? `s ${e.startLine}-${e.endLine}` : ` ${e.startLine}`}: ${e.explanation || 'Modified'}`
        ).join('\n') || 'Changes applied';
        
        const assistantMessage: ChatMessage = {
          id: assistantId,
          role: 'assistant',
          content: `✨ Refinement ready for ${targetFileName}!\n\n${editsSummary}\n\n👆 Review the diff and **Save** or **Discard** the changes.`,
          timestamp: Date.now(),
          type: 'refinement' as const,
        };
        
        setChatMessages(prev => prev.map(msg => 
          msg.id === assistantId ? assistantMessage : msg
        ));
        
        await window.loom?.saveGlyphChatMessage?.(selectedGlyph.id, assistantMessage);
      } else {
        const errorMsg = response?.error || (!selectedFile ? 'No file selected for refinement' : 'Unknown error during refinement');
        logRefinementEvent(responseDebugId, 'Response missing new code', {
          error: errorMsg,
          hasSelectedFile: !!selectedFile,
        });
        setChatMessages(prev => prev.map(msg => 
          msg.id === assistantId 
            ? { ...msg, content: `❌ Error: ${errorMsg}` }
            : msg
        ));
      }
    } catch (error) {
      logRefinementEvent(debugId, 'Refinement request threw', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      setChatMessages(prev => prev.map(msg => 
        msg.id === assistantId 
          ? { ...msg, content: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}` }
          : msg
      ));
    }
    
    setIsRefining(false);
    logRefinementEvent(debugId, 'Request finalized');
  }, [chatInput, selectedGlyph, selectedFile, fileContent, previewCode, isRefining, chatMessages, selectedRefineModel, currentPendingRefinement]);

  // Accept pending refinement for current file
  const handleAcceptRefinement = useCallback(async () => {
    if (!currentPendingRefinement || !selectedGlyph || !selectedFile) return;
    
    const debugId = currentPendingRefinement.debugId || createRefinementDebugId('save-single');
    const codeToSave = currentPendingRefinement.newCode;
    logRefinementEvent(debugId, 'Accept refinement triggered', {
      glyphId: selectedGlyph.id,
      fileName: selectedFile,
      codeChars: codeToSave.length,
      edits: currentPendingRefinement.edits.length,
      source: currentPendingRefinement.source || 'manual',
    });
    setFileContent(codeToSave);
    if (selectedFile.endsWith('.html')) {
      setPreviewCode(codeToSave);
    }
    
    try {
      await window.loom?.saveGlyphFile?.(selectedGlyph.id, selectedFile, codeToSave);
      setOriginalContent(codeToSave);
      setIsModified(false);
      logRefinementEvent(debugId, 'File saved successfully', {
        glyphId: selectedGlyph.id,
        fileName: selectedFile,
      });
      
      const confirmMsg: ChatMessage = {
        id: `msg-${Date.now()}-confirm`,
        role: 'system',
        content: `✅ ${selectedFile} saved successfully!`,
        timestamp: Date.now(),
        type: 'info' as const,
      };
      setChatMessages(prev => [...prev, confirmMsg]);
      await window.loom?.saveGlyphChatMessage?.(selectedGlyph.id, confirmMsg);
    } catch (err) {
      logRefinementEvent(debugId, 'Failed to save refinement', {
        error: err instanceof Error ? err.message : String(err),
      });
      console.error('Failed to save refinement:', err);
    }
    
    setPendingRefinements(prev => {
      const newState = { ...prev };
      delete newState[selectedFile];
      return newState;
    });
    logRefinementEvent(debugId, 'Pending refinement cleared', {
      glyphId: selectedGlyph.id,
      fileName: selectedFile,
    });
  }, [currentPendingRefinement, selectedGlyph, selectedFile]);

  // Accept ALL pending refinements
  const handleAcceptAllRefinements = useCallback(async () => {
    if (!selectedGlyph || Object.keys(pendingRefinements).length === 0) return;
    
    const bulkDebugId = createRefinementDebugId('bulk-save');
    logRefinementEvent(bulkDebugId, 'Accept all triggered', {
      glyphId: selectedGlyph.id,
      pendingCount: Object.keys(pendingRefinements).length,
      currentFile: selectedFile,
    });
    try {
      for (const [fileName, refinement] of Object.entries(pendingRefinements)) {
        const entryDebugId = refinement.debugId || `${bulkDebugId}-${fileName}`;
        logRefinementEvent(entryDebugId, 'Saving file via Accept All', {
          glyphId: selectedGlyph.id,
          fileName,
          codeChars: refinement.newCode.length,
          source: refinement.source || 'manual',
        });
        await window.loom?.saveGlyphFile?.(selectedGlyph.id, fileName, refinement.newCode);
        logRefinementEvent(entryDebugId, 'File saved via Accept All', {
          glyphId: selectedGlyph.id,
          fileName,
        });
      }
      logRefinementEvent(bulkDebugId, 'All pending refinements saved', {
        savedFiles: Object.keys(pendingRefinements),
      });
      
      // Update current file content if it had changes
      if (selectedFile && pendingRefinements[selectedFile]) {
        const updatedCode = pendingRefinements[selectedFile].newCode;
        setFileContent(updatedCode);
        setOriginalContent(updatedCode);
        if (selectedFile.endsWith('.html')) {
          setPreviewCode(updatedCode);
        }
      }
      
      // Add confirmation message
      const confirmMsg: ChatMessage = {
        id: `msg-${Date.now()}-confirm`,
        role: 'system',
        content: `✅ Saved all changes (${Object.keys(pendingRefinements).length} files)!`,
        timestamp: Date.now(),
        type: 'info' as const,
      };
      setChatMessages(prev => [...prev, confirmMsg]);
      
      // Clear all pending refinements
      setPendingRefinements({});
      setIsModified(false);
      logRefinementEvent(bulkDebugId, 'Pending refinements cleared after save');
    } catch (err) {
      logRefinementEvent(bulkDebugId, 'Failed to save all refinements', {
        error: err instanceof Error ? err.message : String(err),
      });
      console.error('Failed to save refinements:', err);
    }
  }, [pendingRefinements, selectedFile, selectedGlyph]);

  // Discard pending refinement for current file
  const handleDiscardRefinement = useCallback(() => {
    if (!currentPendingRefinement || !selectedFile) return;
    
    const debugId = currentPendingRefinement.debugId || createRefinementDebugId('discard');
    logRefinementEvent(debugId, 'Discard triggered', {
      fileName: selectedFile,
      edits: currentPendingRefinement.edits.length,
      source: currentPendingRefinement.source || 'manual',
    });
    // Revert to original code
    setFileContent(currentPendingRefinement.originalCode);
    if (selectedFile.endsWith('.html')) {
      setPreviewCode(currentPendingRefinement.originalCode);
    }
    
    // Add discard message to chat
    const discardMsg: ChatMessage = {
      id: `msg-${Date.now()}-discard`,
      role: 'system',
      content: `🔙 Changes to ${selectedFile} discarded.`,
      timestamp: Date.now(),
      type: 'info' as const,
    };
    setChatMessages(prev => [...prev, discardMsg]);
    
    // Clear pending state for this file only
    setPendingRefinements(prev => {
      const newState = { ...prev };
      delete newState[selectedFile];
      return newState;
    });
    logRefinementEvent(debugId, 'Pending refinement discarded', {
      fileName: selectedFile,
    });
  }, [currentPendingRefinement, selectedFile]);

  // Handle glyph error from preview iframe
  const handleGlyphError = useCallback((error: string | null) => {
    if (error) {
      setGlyphErrors(prev => {
        // Avoid duplicates
        if (prev.includes(error)) return prev;
        return [...prev, error];
      });
      setPreviewTab('errors');
    } else {
      // Clear errors when code works
      setGlyphErrors([]);
      if (previewTab === 'errors') {
        setPreviewTab('preview');
      }
    }
  }, [previewTab]);
  
  // Auto-fix errors function
  const handleAutoFixErrors = useCallback(async () => {
    if (!selectedGlyph || !selectedFile || isAutoFixing || glyphErrors.length === 0) return;
    
    if (autoFixAttempts >= MAX_AUTO_FIX_ATTEMPTS) {
      setChatMessages(prev => [...prev, {
        id: `msg-${Date.now()}-maxattempts`,
        role: 'system',
        content: `❌ Max auto-fix attempts reached (${MAX_AUTO_FIX_ATTEMPTS}). Please manually review the code.`,
        timestamp: Date.now(),
        type: 'info' as const,
      }]);
      return;
    }
    
    setIsAutoFixing(true);
    setAutoFixAttempts(prev => prev + 1);
    
    const errorSummary = glyphErrors.join('\n');
    const fixRequest = `Fix the following errors in the code:\n\n${errorSummary}`;
    const debugId = createRefinementDebugId('autofix');
    logRefinementEvent(debugId, 'Auto-fix initialized', {
      glyphId: selectedGlyph.id,
      fileName: selectedFile,
      attempt: autoFixAttempts + 1,
      errorsReported: glyphErrors.length,
    });
    
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-autofix`,
      role: 'user',
      content: `🔧 Auto-fix attempt ${autoFixAttempts + 1}/${MAX_AUTO_FIX_ATTEMPTS}:\n${fixRequest}`,
      timestamp: Date.now(),
      type: 'refinement' as const,
    };
    
    setChatMessages(prev => [...prev, userMessage]);
    
    try {
      await window.loom?.saveGlyphChatMessage?.(selectedGlyph.id, userMessage);
    } catch (err) {
      logRefinementEvent(debugId, 'Failed to persist auto-fix chat message', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    
    const assistantId = `msg-${Date.now()}-assistant`;
    setChatMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '🔧 Analyzing errors and generating fix...',
      timestamp: Date.now(),
    }]);
    
    try {
      logRefinementEvent(debugId, 'Invoking refine-glyph-surgical (auto-fix)', {
        glyphId: selectedGlyph.id,
        fileName: selectedFile,
      });
      const response = await window.loom?.refineGlyphSurgical?.({
        glyphId: selectedGlyph.id,
        fileName: selectedFile,
        currentCode: fileContent,
        originalPrompt: selectedGlyph.prompt || '',
        refinementRequest: fixRequest,
        chatHistory: chatMessages,
        model: selectedRefineModel || undefined,
        debugId,
        source: 'autofix',
      });
      
      const responseDebugId = response?.debugId || debugId;
      logRefinementEvent(responseDebugId, 'Auto-fix response received', {
        success: response?.success ?? false,
        hasOriginalCode: !!response?.originalCode,
        hasNewCode: !!response?.newCode,
        error: response?.error,
        mode: response?.mode,
        chunkCount: response?.chunkCount,
      });
      
      if (response?.success && response?.newCode && response?.originalCode && selectedFile) {
        const edits = response.edits || [];
        const pendingEntry: PendingRefinementEntry = {
          originalCode: response.originalCode,
          newCode: response.newCode,
          edits,
          debugId: responseDebugId,
          source: 'autofix',
          createdAt: Date.now(),
          model: response.model,
          mode: response.mode,
          errors: response.errors || [],
        };
        setPendingRefinements(prev => ({
          ...prev,
          [selectedFile]: pendingEntry,
        }));
        if (selectedFile.endsWith('.html')) {
          setPreviewCode(response.newCode);
        }
        setPreviewTab('errors');
        logRefinementEvent(responseDebugId, 'Auto-fix pending refinement stored', {
          fileName: selectedFile,
          edits: edits.length,
        });
        
        const editsSummary = edits.map((e: { type: string; startLine: number; endLine?: number; explanation?: string }) => 
          `• ${e.type.toUpperCase()} line${e.endLine && e.endLine !== e.startLine ? `s ${e.startLine}-${e.endLine}` : ` ${e.startLine}`}: ${e.explanation || 'Modified'}`
        ).join('\n') || 'Changes applied';
        
        const assistantMessage: ChatMessage = {
          id: assistantId,
          role: 'assistant',
          content: `✨ Fix ready!\n\n${editsSummary}\n\n👆 Review the diff and **Save** to apply or **Discard** to revert.`,
          timestamp: Date.now(),
          type: 'refinement' as const,
        };
        
        setChatMessages(prev => prev.map(msg => 
          msg.id === assistantId ? assistantMessage : msg
        ));
        
        await window.loom?.saveGlyphChatMessage?.(selectedGlyph.id, assistantMessage);
      } else {
        const errorMsg = response?.error || 'Failed to generate fix';
        logRefinementEvent(responseDebugId, 'Auto-fix response missing new code', {
          error: errorMsg,
        });
        setChatMessages(prev => prev.map(msg => 
          msg.id === assistantId 
            ? { ...msg, content: `❌ ${errorMsg}` }
            : msg
        ));
      }
    } catch (error) {
      logRefinementEvent(debugId, 'Auto-fix request threw', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      setChatMessages(prev => prev.map(msg => 
        msg.id === assistantId 
          ? { ...msg, content: `❌ ${error instanceof Error ? error.message : 'Unknown error'}` }
          : msg
      ));
    }
    
    setIsAutoFixing(false);
    logRefinementEvent(debugId, 'Auto-fix finalized');
  }, [selectedGlyph, selectedFile, isAutoFixing, glyphErrors, autoFixAttempts, fileContent, chatMessages, selectedRefineModel]);
  
  // Delete glyph function
  const handleDeleteGlyph = useCallback(async () => {
    if (!selectedGlyph) return;
    
    if (confirm(`Are you sure you want to delete "${selectedGlyph.name}"?`)) {
      try {
        await window.loom?.deleteGlyph?.(selectedGlyph.id);
        setSelectedGlyph(null);
        setSelectedFile(null);
        setFileContent('');
        setGlyphErrors([]);
        // Reload glyphs and folder data
        const [loadedGlyphs, folderData] = await Promise.all([
          window.loom?.loadGlyphs?.() || [],
          window.loom?.loadGlyphFolders?.() || { folders: [], unassignedOrder: [] },
        ]);
        setGlyphs(loadedGlyphs);
        setFolders(folderData.folders || []);
        setUnassignedOrder(folderData.unassignedOrder || []);
      } catch (err) {
        console.error('Failed to delete glyph:', err);
      }
    }
  }, [selectedGlyph]);
  
  // Clear glyph errors when selecting a new glyph
  useEffect(() => {
    if (selectedGlyph) {
      setGlyphErrors([]);
      setAutoFixAttempts(0);
      setPreviewTab('preview');
    }
  }, [selectedGlyph?.id]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case 'background': return '🌌';
      case 'hud': return '📊';
      default: return '🔮';
    }
  };

  useEffect(() => {
    if (!onStateChange) return;
    const nextState: CodeEditorState = {
      selectedGlyphId: selectedGlyph?.id ?? null,
      selectedFile,
      glyphSidebarWidth,
      fileSidebarWidth,
      chatSidebarWidth,
      previewHeight,
      previewTab,
      isEditorOpen,
    };
    onStateChange(nextState);
  }, [
    selectedGlyph?.id,
    selectedFile,
    glyphSidebarWidth,
    fileSidebarWidth,
    chatSidebarWidth,
    previewHeight,
    previewTab,
    isEditorOpen,
    onStateChange,
  ]);

  return (
    <div style={styles.container} ref={containerRef}>
      {/* Main editor area with preview below */}
      <div style={styles.mainWrapper}>
        {/* Top section: sidebars + editor - sidebars have fixed widths */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          overflow: 'hidden',
          minHeight: 0,
          minWidth: 0, // Allow flex children to calculate properly
        }}>
          {/* Glyph selector sidebar - resizable, NEVER collapses */}
          <div style={{
            ...styles.glyphSidebar,
            width: glyphSidebarWidth,
            minWidth: glyphSidebarWidth, // Prevent collapsing
            maxWidth: glyphSidebarWidth, // Lock to exact width
            flexShrink: 0, // Never shrink
            position: 'relative',
          }}>
            <div style={styles.sidebarHeader}>
              <span style={styles.sidebarTitle}>📁 Glyphs</span>
            </div>
            <div style={styles.glyphList}>
              {/* Show pending glyph at top during streaming */}
              {(externalIsStreaming || (externalStreamingCode && !selectedGlyph)) && (
                <div
                  style={{
                    ...styles.glyphItem,
                    ...styles.glyphItemSelected,
                    background: streamingPhase === 'complete'
                      ? 'linear-gradient(135deg, rgba(0, 255, 128, 0.15), rgba(0, 255, 255, 0.1))'
                      : 'linear-gradient(135deg, rgba(255, 0, 255, 0.15), rgba(0, 255, 255, 0.1))',
                    borderColor: streamingPhase === 'complete' 
                      ? 'rgba(0, 255, 128, 0.4)' 
                      : 'rgba(255, 0, 255, 0.4)',
                  }}
                >
                  <span style={styles.glyphIcon}>
                    {streamingPhase === 'complete' ? '✅' : '✨'}
                  </span>
                  <span style={{
                    ...styles.glyphName,
                    color: streamingPhase === 'complete' ? '#00ff80' : '#ff00ff',
                  }}>
                    {extractedGlyphName || (externalIsStreaming ? 'Creating...' : 'New Glyph')}
                  </span>
                  {externalIsStreaming && (
                    <span style={{
                      marginLeft: 'auto',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#ff00ff',
                      boxShadow: '0 0 8px rgba(255, 0, 255, 0.5)',
                    }} />
                  )}
                </div>
              )}
              
              {/* Folders with their glyphs */}
              {folders.map((folder) => {
                const folderGlyphs = folder.glyphIds
                  .map(id => glyphMap.get(id))
                  .filter((g): g is GlyphManifest => g !== undefined);
                
                return (
                  <div key={folder.id} style={styles.folderSection}>
                    {/* Folder header */}
                    <button
                      onClick={() => handleToggleFolderCollapse(folder.id)}
                      style={styles.folderHeader}
                    >
                      <span style={styles.folderCollapse}>
                        {folder.collapsed ? '▶' : '▼'}
                      </span>
                      <span style={styles.folderIcon}>{folder.icon}</span>
                      <span style={styles.folderName}>{folder.name}</span>
                      <span style={styles.folderCount}>{folderGlyphs.length}</span>
                    </button>
                    
                    {/* Folder contents */}
                    {!folder.collapsed && folderGlyphs.map((glyph) => (
                      <button
                        key={glyph.id}
                        onClick={() => handleGlyphSelect(glyph)}
                        style={{
                          ...styles.glyphItem,
                          ...styles.glyphItemIndented,
                          ...(selectedGlyph?.id === glyph.id ? styles.glyphItemSelected : {}),
                        }}
                      >
                        <span style={styles.glyphIcon}>{glyph.icon || getTypeIcon(glyph.type)}</span>
                        <span style={styles.glyphName}>{glyph.name}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
              
              {/* Unassigned glyphs */}
              {unassignedGlyphs.length > 0 && (
                <div style={styles.folderSection}>
                  {folders.length > 0 && (
                    <div style={styles.unassignedHeader}>
                      <span style={styles.folderIcon}>📥</span>
                      <span style={styles.folderName}>Unassigned</span>
                      <span style={styles.folderCount}>{unassignedGlyphs.length}</span>
                    </div>
                  )}
                  {unassignedGlyphs.map((glyph) => (
                    <button
                      key={glyph.id}
                      onClick={() => handleGlyphSelect(glyph)}
                      style={{
                        ...styles.glyphItem,
                        ...(folders.length > 0 ? styles.glyphItemIndented : {}),
                        ...(selectedGlyph?.id === glyph.id ? styles.glyphItemSelected : {}),
                      }}
                    >
                      <span style={styles.glyphIcon}>{glyph.icon || getTypeIcon(glyph.type)}</span>
                      <span style={styles.glyphName}>{glyph.name}</span>
                    </button>
                  ))}
                </div>
              )}
              
              {glyphs.length === 0 && !externalIsStreaming && !externalStreamingCode && (
                <div style={styles.emptyState}>
                  <p>No glyphs yet</p>
                </div>
              )}
            </div>
            {/* Resize handle for glyph sidebar */}
            <div
              onMouseDown={handleGlyphSidebarResizeStart}
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: '6px',
                cursor: 'ew-resize',
                background: isResizingGlyphSidebar ? 'rgba(0, 255, 255, 0.3)' : 'transparent',
                transition: 'background 0.2s ease',
                zIndex: 10,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0, 255, 255, 0.2)';
              }}
              onMouseLeave={(e) => {
                if (!isResizingGlyphSidebar) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            />
          </div>

      {/* File tree - show streaming files during creation OR selected glyph files */}
      {(selectedGlyph || externalIsStreaming || externalStreamingCode) && (
        <div style={{
          ...styles.fileSidebar,
          width: fileSidebarWidth,
          minWidth: fileSidebarWidth, // Prevent collapsing
          maxWidth: fileSidebarWidth, // Lock to exact width
          flexShrink: 0, // Never shrink
          position: 'relative',
        }}>
          <div style={styles.sidebarHeader}>
            <span style={styles.sidebarTitle}>📄 Files</span>
          </div>
          <div style={styles.fileList}>
            {/* During streaming, show the file being created - CLICKABLE */}
            {(externalIsStreaming || (externalStreamingCode && !selectedGlyph)) ? (
              <>
                {/* Manifest.json - shown first during streaming - CLICKABLE */}
                <button
                  onClick={() => setStreamingViewFile('manifest.json')}
                  style={{
                    ...styles.fileItem,
                    ...(streamingViewFile === 'manifest.json' ? styles.fileItemSelected : {}),
                    background: streamingViewFile === 'manifest.json' ? 'rgba(255, 200, 0, 0.15)' : 'transparent',
                    cursor: 'pointer',
                    border: 'none',
                    width: '100%',
                    textAlign: 'left',
                  }}
                >
                  <span style={styles.fileIcon}>📋</span>
                  <span style={{
                    ...styles.fileName,
                    color: streamingViewFile === 'manifest.json' ? '#ffc800' : 'rgba(255, 255, 255, 0.7)',
                  }}>
                    manifest.json
                  </span>
                  {streamingPhase === 'manifest' && externalIsStreaming && (
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: '10px',
                      color: '#ffc800',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}>
                      <span style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        background: '#ffc800',
                      }} />
                      parsing
                    </span>
                  )}
                  {streamingPhase !== 'manifest' && (
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: '9px',
                      color: '#00ff80',
                    }}>
                      ✓
                    </span>
                  )}
                </button>
                
                {/* index.html - main file being written - CLICKABLE */}
                <button
                  onClick={() => setStreamingViewFile('index.html')}
                  style={{
                    ...styles.fileItem,
                    ...(streamingViewFile === 'index.html' ? styles.fileItemSelected : {}),
                    background: streamingViewFile === 'index.html' 
                      ? (streamingPhase === 'complete' ? 'rgba(0, 255, 128, 0.15)' : 'rgba(0, 255, 255, 0.15)')
                      : 'transparent',
                    cursor: 'pointer',
                    border: 'none',
                    width: '100%',
                    textAlign: 'left',
                  }}
                >
                  <span style={styles.fileIcon}>📄</span>
                  <span style={{
                    ...styles.fileName,
                    color: streamingViewFile === 'index.html' 
                      ? (streamingPhase === 'complete' ? '#00ff80' : '#00ffff')
                      : 'rgba(255, 255, 255, 0.7)',
                  }}>
                    index.html
                  </span>
                  {streamingPhase === 'html' && externalIsStreaming && (
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: '10px',
                      color: '#ff00ff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}>
                      <span style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        background: '#ff00ff',
                      }} />
                      writing
                    </span>
                  )}
                  {streamingPhase === 'complete' && (
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: '9px',
                      color: '#00ff80',
                    }}>
                      ✓ done
                    </span>
                  )}
                  {streamingPhase === 'manifest' && (
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: '9px',
                      color: 'rgba(255, 255, 255, 0.4)',
                    }}>
                      pending
                    </span>
                  )}
                </button>
              </>
            ) : selectedGlyph?.files?.map((file) => (
              <button
                key={file}
                onClick={() => {
                  setSelectedFile(file);
                  setIsEditorOpen(true); // Open editor when selecting a file
                }}
                style={{
                  ...styles.fileItem,
                  ...(selectedFile === file ? styles.fileItemSelected : {}),
                }}
              >
                <span style={styles.fileIcon}>
                  {file.endsWith('.tsx') ? '⚛️' : file.endsWith('.json') ? '📋' : '📄'}
                </span>
                <span style={styles.fileName}>{file}</span>
              </button>
            ))}
          </div>
          {/* Resize handle for file sidebar */}
          <div
            onMouseDown={handleFileSidebarResizeStart}
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: '6px',
              cursor: 'ew-resize',
              background: isResizingFileSidebar ? 'rgba(255, 0, 255, 0.3)' : 'transparent',
              transition: 'background 0.2s ease',
              zIndex: 10,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 0, 255, 0.2)';
            }}
            onMouseLeave={(e) => {
              if (!isResizingFileSidebar) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          />
        </div>
      )}

      {/* Editor area - animates in/out with ultra goopy transition */}
      <div 
        style={{
          ...styles.editorArea,
          width: isEditorOpen ? 'auto' : '0px',
          flex: isEditorOpen ? 1 : 0,
          opacity: isEditorOpen ? 1 : 0,
          overflow: 'hidden',
          // Ultra goopy spring animation - slightly slower with more bounce
          transition: 'flex 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55), opacity 0.4s ease-in-out, width 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        }}
      >
          {selectedGlyph && selectedFile ? (
            <>
              {/* Editor header */}
            <div style={styles.editorHeader}>
              <div style={styles.editorPath}>
                <span style={styles.pathGlyph}>{selectedGlyph.name}</span>
                <span style={styles.pathSeparator}>/</span>
                <span style={styles.pathFile}>{selectedFile}</span>
                {isModified && <span style={styles.modifiedDot}>●</span>}
              </div>
              <div style={styles.editorActions}>
                {errors.length > 0 && (
                  <span style={styles.errorCount}>
                    ⚠️ {errors.length} {errors.length === 1 ? 'issue' : 'issues'}
                  </span>
                )}
                {/* Only show save button when there are changes */}
                {isModified && !currentPendingRefinement && (
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    style={styles.saveBtn}
                  >
                    {isSaving ? '💾 Saving...' : '💾 Save'}
                  </button>
                )}
                {Object.keys(pendingRefinements).length > 1 && (
                  <button
                    onClick={handleAcceptAllRefinements}
                    style={{
                      ...styles.saveBtn,
                      background: 'linear-gradient(135deg, rgba(0, 255, 128, 0.2), rgba(0, 200, 100, 0.2))',
                      border: '1px solid rgba(0, 255, 128, 0.5)',
                      color: '#00ff80',
                    }}
                  >
                    💾 Save All ({Object.keys(pendingRefinements).length})
                  </button>
                )}
                {/* Save & Close button - only show when there are changes to save/confirm */}
                {(isModified || Object.keys(pendingRefinements).length > 0 || currentPendingRefinement) && (
                <button
                  onClick={async () => {
                    // Accept any pending refinement first
                    if (currentPendingRefinement && selectedGlyph && selectedFile) {
                      setIsSaving(true);
                      try {
                        await window.loom?.saveGlyphFile?.(selectedGlyph.id, selectedFile, currentPendingRefinement.newCode);
                        setFileContent(currentPendingRefinement.newCode);
                        setOriginalContent(currentPendingRefinement.newCode);
                        setPendingRefinements(prev => {
                          const updated = { ...prev };
                          delete updated[selectedFile];
                          return updated;
                        });
                        setIsModified(false);
                      } catch (error) {
                        console.error('Failed to save file:', error);
                      }
                      setIsSaving(false);
                    }
                    // Save if modified
                    else if (isModified && selectedGlyph && selectedFile) {
                      setIsSaving(true);
                      try {
                        await window.loom?.saveGlyphFile?.(selectedGlyph.id, selectedFile, fileContent);
                        setOriginalContent(fileContent);
                        setIsModified(false);
                      } catch (error) {
                        console.error('Failed to save file:', error);
                      }
                      setIsSaving(false);
                    }
                    // Close editor and return to glyph view
                    setIsEditorOpen(false);
                  }}
                  style={{
                    padding: '6px 12px',
                    background: 'rgba(0, 255, 128, 0.1)',
                    border: '1px solid rgba(0, 255, 128, 0.3)',
                    borderRadius: '6px',
                    color: '#00ff80',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                  title="Save and close editor"
                >
                  ✓ Done
                </button>
                )}
                {/* Close editor button - keeps selectedFile so refinements still work */}
                <button
                  onClick={() => {
                    setIsEditorOpen(false);
                    // DON'T set selectedFile to null - keep it so refinements still work
                  }}
                  style={{
                    padding: '6px 10px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: 'rgba(255, 255, 255, 0.6)',
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Close editor"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Code editor - show diff view if pending refinement */}
            {currentPendingRefinement ? (
              <div style={{
                ...styles.editorWrapper,
                flexDirection: 'column',
              }}>
                {/* Diff info bar */}
                {(() => {
                  const blocks = generateDiffBlocks(currentPendingRefinement.originalCode, currentPendingRefinement.newCode);
                  const removedLines = blocks.filter(b => b.type === 'removed').reduce((sum, b) => sum + b.lines.length, 0);
                  const addedLines = blocks.filter(b => b.type === 'added').reduce((sum, b) => sum + b.lines.length, 0);
                  
                  return (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '8px 12px',
                  background: 'rgba(255, 0, 255, 0.1)',
                  borderBottom: '1px solid rgba(255, 0, 255, 0.2)',
                }}>
                  <span style={{ fontSize: '11px', color: '#ff00ff', fontWeight: 600 }}>
                    📝 Pending Changes
                  </span>
                  <span style={{ fontSize: '10px', color: '#ff5050' }}>
                    − {removedLines} line{removedLines !== 1 ? 's' : ''} removed
                  </span>
                  <span style={{ fontSize: '10px', color: '#00ff80' }}>
                    + {addedLines} line{addedLines !== 1 ? 's' : ''} added
                  </span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    <button
                      onClick={handleDiscardRefinement}
                      style={{
                        padding: '4px 12px',
                        background: 'rgba(255, 80, 80, 0.15)',
                        border: '1px solid rgba(255, 80, 80, 0.4)',
                        borderRadius: '4px',
                        color: '#ff5050',
                        fontSize: '10px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      ✕ Discard
                    </button>
                    <button
                      onClick={handleAcceptRefinement}
                      style={{
                        padding: '4px 12px',
                        background: 'linear-gradient(135deg, rgba(0, 255, 128, 0.2), rgba(0, 200, 100, 0.2))',
                        border: '1px solid rgba(0, 255, 128, 0.5)',
                        borderRadius: '4px',
                        color: '#00ff80',
                        fontSize: '10px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      ✓ Save Changes
                    </button>
                  </div>
                </div>
                  );
                })()}
                
                {/* Monaco Diff Editor with syntax highlighting */}
                <div style={{ flex: 1, minHeight: 0 }}>
                  <DiffEditor
                    height="100%"
                    language={selectedFile?.endsWith('.tsx') ? 'typescript' : 
                             selectedFile?.endsWith('.ts') ? 'typescript' :
                             selectedFile?.endsWith('.json') ? 'json' :
                             selectedFile?.endsWith('.css') ? 'css' :
                             selectedFile?.endsWith('.html') ? 'html' : 'plaintext'}
                    original={currentPendingRefinement.originalCode}
                    modified={currentPendingRefinement.newCode}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      fontSize: 13,
                      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                      minimap: { enabled: true, scale: 0.8 },
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      padding: { top: 8, bottom: 8 },
                      renderSideBySide: true,
                      enableSplitViewResizing: true,
                      ignoreTrimWhitespace: false,
                      renderIndicators: true,
                      renderMarginRevertIcon: false,
                      originalEditable: false,
                      diffWordWrap: 'off',
                      scrollbar: {
                        verticalScrollbarSize: 10,
                        horizontalScrollbarSize: 10,
                      },
                      bracketPairColorization: { enabled: true },
                      guides: { 
                        indentation: true,
                        bracketPairs: true,
                      },
                      folding: true,
                      foldingHighlight: true,
                      showFoldingControls: 'mouseover',
                    }}
                    beforeMount={(monaco) => {
                      // Define custom cyberpunk diff theme
                      monaco.editor.defineTheme('cyberpunk-diff', {
                        base: 'vs-dark',
                        inherit: true,
                        rules: [
                          { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
                          { token: 'keyword', foreground: 'ff00ff' },
                          { token: 'string', foreground: '00ffff' },
                          { token: 'number', foreground: 'ffaa00' },
                          { token: 'type', foreground: '00ff80' },
                          { token: 'function', foreground: 'ffc800' },
                          { token: 'variable', foreground: 'e0e0e0' },
                          { token: 'tag', foreground: 'ff5050' },
                          { token: 'attribute.name', foreground: 'ffaa00' },
                          { token: 'attribute.value', foreground: '00ffff' },
                        ],
                        colors: {
                          'editor.background': '#0a0a12',
                          'editor.foreground': '#e0e0e0',
                          'editor.lineHighlightBackground': '#1a1a2e',
                          'editor.selectionBackground': '#ff00ff30',
                          'editorCursor.foreground': '#00ffff',
                          'editorLineNumber.foreground': '#444466',
                          'editorLineNumber.activeForeground': '#00ffff',
                          'editorIndentGuide.background': '#2a2a3e',
                          'editorIndentGuide.activeBackground': '#ff00ff40',
                          'editorBracketMatch.background': '#ff00ff30',
                          'editorBracketMatch.border': '#ff00ff',
                          'minimap.background': '#050508',
                          'scrollbar.shadow': '#00000050',
                          'scrollbarSlider.background': '#ff00ff20',
                          'scrollbarSlider.hoverBackground': '#ff00ff40',
                          'scrollbarSlider.activeBackground': '#ff00ff60',
                          // Diff-specific colors
                          'diffEditor.insertedTextBackground': '#00ff8020',
                          'diffEditor.insertedLineBackground': '#00ff8015',
                          'diffEditor.removedTextBackground': '#ff505020',
                          'diffEditor.removedLineBackground': '#ff505015',
                          'diffEditor.border': '#ff00ff40',
                          'diffEditorGutter.insertedLineBackground': '#00ff8030',
                          'diffEditorGutter.removedLineBackground': '#ff505030',
                          'diffEditorOverview.insertedForeground': '#00ff80',
                          'diffEditorOverview.removedForeground': '#ff5050',
                        },
                      });
                    }}
                    onMount={(_editor, monaco) => {
                      monaco.editor.setTheme('cyberpunk-diff');
                    }}
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <div style={{ ...styles.editorWrapper, position: 'relative' }}>
                  {/* Monaco Editor */}
                  <Editor
                    height="100%"
                    language={selectedFile?.endsWith('.tsx') ? 'typescript' : 
                             selectedFile?.endsWith('.ts') ? 'typescript' :
                             selectedFile?.endsWith('.json') ? 'json' :
                             selectedFile?.endsWith('.css') ? 'css' :
                             selectedFile?.endsWith('.html') ? 'html' : 'plaintext'}
                    value={fileContent}
                    onChange={(value) => setFileContent(value || '')}
                    theme="vs-dark"
                    options={{
                      fontSize: 13,
                      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                      minimap: { enabled: true, scale: 0.8 },
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      wordWrap: 'off',
                      automaticLayout: true,
                      padding: { top: 8, bottom: 8 },
                      renderLineHighlight: 'all',
                      cursorBlinking: 'smooth',
                      cursorSmoothCaretAnimation: 'on',
                      smoothScrolling: true,
                      bracketPairColorization: { enabled: true },
                      guides: { 
                        indentation: true,
                        bracketPairs: true,
                      },
                      folding: true,
                      foldingHighlight: true,
                      showFoldingControls: 'mouseover',
                      tabSize: 2,
                      insertSpaces: true,
                      formatOnPaste: true,
                      formatOnType: true,
                    }}
                    beforeMount={(monaco) => {
                      // Define custom cyberpunk theme
                      monaco.editor.defineTheme('cyberpunk', {
                        base: 'vs-dark',
                        inherit: true,
                        rules: [
                          { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
                          { token: 'keyword', foreground: 'ff00ff' },
                          { token: 'string', foreground: '00ffff' },
                          { token: 'number', foreground: 'ffaa00' },
                          { token: 'type', foreground: '00ff80' },
                          { token: 'function', foreground: 'ffc800' },
                          { token: 'variable', foreground: 'e0e0e0' },
                          { token: 'tag', foreground: 'ff5050' },
                          { token: 'attribute.name', foreground: 'ffaa00' },
                          { token: 'attribute.value', foreground: '00ffff' },
                        ],
                        colors: {
                          'editor.background': '#0a0a12',
                          'editor.foreground': '#e0e0e0',
                          'editor.lineHighlightBackground': '#1a1a2e',
                          'editor.selectionBackground': '#ff00ff30',
                          'editorCursor.foreground': '#00ffff',
                          'editorLineNumber.foreground': '#444466',
                          'editorLineNumber.activeForeground': '#00ffff',
                          'editor.inactiveSelectionBackground': '#ff00ff15',
                          'editorIndentGuide.background': '#2a2a3e',
                          'editorIndentGuide.activeBackground': '#ff00ff40',
                          'editorBracketMatch.background': '#ff00ff30',
                          'editorBracketMatch.border': '#ff00ff',
                          'minimap.background': '#050508',
                          'scrollbar.shadow': '#00000050',
                          'scrollbarSlider.background': '#ff00ff20',
                          'scrollbarSlider.hoverBackground': '#ff00ff40',
                          'scrollbarSlider.activeBackground': '#ff00ff60',
                        },
                      });
                    }}
                    onMount={(editor, monaco) => {
                      // Use the cyberpunk theme
                      monaco.editor.setTheme('cyberpunk');
                      
                      // Focus the editor
                      editor.focus();
                      
                      // Add keyboard shortcut for save
                      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                        handleSave();
                      });
                    }}
                  />
                </div>
              </div>
            )}
          </>
        ) : externalIsStreaming || externalStreamingCode ? (
          /* STREAMING MODE - show code as it comes in without a selected glyph */
          <>
            {/* Streaming header */}
            <div style={styles.editorHeader}>
              <div style={styles.editorPath}>
                <span style={{
                  ...styles.pathGlyph,
                  color: streamingPhase === 'manifest' ? '#ffc800' : '#ff00ff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: streamingPhase === 'complete' ? '#00ff80' :
                               streamingPhase === 'html' ? '#ff00ff' : '#ffc800',
                    boxShadow: streamingPhase === 'complete' 
                      ? '0 0 10px rgba(0, 255, 128, 0.5)' 
                      : '0 0 10px rgba(255, 0, 255, 0.5)',
                  }} />
                  {extractedGlyphName || (externalIsStreaming ? 'Creating Glyph...' : 'New Glyph')}
                </span>
                <span style={styles.pathSeparator}>/</span>
                <span style={{
                  ...styles.pathFile,
                  color: streamingPhase === 'manifest' ? '#ffc800' : '#00ffff',
                }}>
                  {streamingPhase === 'manifest' ? 'manifest.json' : 'index.html'}
                </span>
                {externalIsStreaming && (
                  <span style={{
                    ...styles.streamingBadge,
                    marginLeft: '12px',
                    background: streamingPhase === 'manifest' 
                      ? 'rgba(255, 200, 0, 0.15)' 
                      : 'rgba(255, 0, 255, 0.15)',
                    borderColor: streamingPhase === 'manifest'
                      ? 'rgba(255, 200, 0, 0.3)'
                      : 'rgba(255, 0, 255, 0.3)',
                    color: streamingPhase === 'manifest' ? '#ffc800' : '#ff00ff',
                  }}>
                    <span style={{
                      ...styles.streamingDotSmall,
                      background: streamingPhase === 'manifest' ? '#ffc800' : '#ff00ff',
                    }} />
                    {streamingPhase === 'manifest' ? 'Parsing manifest' : 'Writing HTML'}
                  </span>
                )}
                {streamingPhase === 'complete' && !externalIsStreaming && (
                  <span style={{
                    marginLeft: '12px',
                    padding: '4px 10px',
                    background: 'rgba(0, 255, 128, 0.15)',
                    border: '1px solid rgba(0, 255, 128, 0.3)',
                    borderRadius: '12px',
                    fontSize: '11px',
                    color: '#00ff80',
                    fontWeight: 500,
                  }}>
                    ✓ Complete
                  </span>
                )}
              </div>
              <div style={styles.editorActions}>
                <span style={{ 
                  fontSize: '12px', 
                  color: externalIsStreaming ? '#00ffff' : 'rgba(255, 255, 255, 0.5)',
                  fontWeight: externalIsStreaming ? 600 : 400,
                  marginRight: '12px',
                }}>
                  {streamingPhase === 'manifest' 
                    ? `${rawStreamingJson.length.toLocaleString()} chars received`
                    : `${fileContent.length.toLocaleString()} chars • ${fileContent.split('\n').length} lines`
                  }
                </span>
                
                {/* Save & Open button - appears when streaming is complete */}
                {streamingPhase === 'complete' && !externalIsStreaming && initialGlyphId && (
                  <button
                    onClick={async () => {
                      // Reload glyphs/folders and select the newly created one
                      try {
                        const [loadedGlyphs, folderData] = await Promise.all([
                          window.loom?.loadGlyphs?.() || [],
                          window.loom?.loadGlyphFolders?.() || { folders: [], unassignedOrder: [] },
                        ]);
                        setGlyphs(loadedGlyphs);
                        setFolders(folderData.folders || []);
                        setUnassignedOrder(folderData.unassignedOrder || []);
                        const targetGlyph = loadedGlyphs.find((g: GlyphManifest) => g.id === initialGlyphId);
                        if (targetGlyph) {
                          setSelectedGlyph(targetGlyph);
                          setSelectedFile(targetGlyph.files?.includes('index.html') ? 'index.html' : targetGlyph.files?.[0] || 'index.html');
                          // Reset streaming state
                          setStreamingPhase('manifest');
                          setExtractedGlyphName('');
                          setRawStreamingJson('');
                          setStreamingViewFile('index.html');
                          // Load chat history
                          const history = await window.loom?.loadGlyphChatHistory?.(targetGlyph.id) || [];
                          setChatMessages(history);
                        }
                      } catch (error) {
                        console.error('Failed to open glyph:', error);
                      }
                    }}
                    style={{
                      padding: '6px 14px',
                      background: 'linear-gradient(135deg, rgba(0, 255, 128, 0.2), rgba(0, 200, 100, 0.2))',
                      border: '1px solid rgba(0, 255, 128, 0.5)',
                      borderRadius: '6px',
                      color: '#00ff80',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s ease',
                    }}
                    title="Save and open in editor"
                  >
                    💾 Save & Edit
                  </button>
                )}
              </div>
            </div>

            {/* Streaming code editor - Monaco read-only */}
            <div style={{ ...styles.editorWrapper, position: 'relative' }}>
              <Editor
                height="100%"
                language="html"
                value={fileContent}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                  minimap: { enabled: true, scale: 0.8 },
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  wordWrap: 'off',
                  automaticLayout: true,
                  padding: { top: 8, bottom: 8 },
                  renderLineHighlight: 'none',
                  cursorBlinking: 'smooth',
                  smoothScrolling: true,
                  bracketPairColorization: { enabled: true },
                  guides: { 
                    indentation: true,
                    bracketPairs: true,
                  },
                  folding: true,
                  tabSize: 2,
                }}
                beforeMount={(monaco) => {
                  // Define custom cyberpunk theme if not already defined
                  monaco.editor.defineTheme('cyberpunk-streaming', {
                    base: 'vs-dark',
                    inherit: true,
                    rules: [
                      { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
                      { token: 'keyword', foreground: 'ff00ff' },
                      { token: 'string', foreground: '00ffff' },
                      { token: 'number', foreground: 'ffaa00' },
                      { token: 'type', foreground: '00ff80' },
                      { token: 'function', foreground: 'ffc800' },
                      { token: 'variable', foreground: 'e0e0e0' },
                      { token: 'tag', foreground: 'ff5050' },
                      { token: 'attribute.name', foreground: 'ffaa00' },
                      { token: 'attribute.value', foreground: '00ffff' },
                    ],
                    colors: {
                      'editor.background': '#0a0a12',
                      'editor.foreground': externalIsStreaming ? '#00ffff' : '#e0e0e0',
                      'editor.lineHighlightBackground': '#1a1a2e',
                      'editorCursor.foreground': '#00ffff',
                      'editorLineNumber.foreground': '#444466',
                      'editorLineNumber.activeForeground': '#00ffff',
                      'editorIndentGuide.background': '#2a2a3e',
                      'minimap.background': '#050508',
                      'scrollbar.shadow': '#00000050',
                      'scrollbarSlider.background': '#00ffff20',
                      'scrollbarSlider.hoverBackground': '#00ffff40',
                    },
                  });
                }}
                onMount={(editor, monaco) => {
                  monaco.editor.setTheme('cyberpunk-streaming');
                  
                  // Auto-scroll to bottom while streaming
                  if (externalIsStreaming) {
                    const lineCount = editor.getModel()?.getLineCount() || 0;
                    editor.revealLine(lineCount);
                  }
                }}
              />
            </div>
          </>
        ) : (
          <div style={styles.placeholder}>
            <span style={styles.placeholderIcon}>⌨️</span>
            <p style={styles.placeholderText}>Select a glyph to start editing</p>
          </div>
        )}
      </div>

      {/* Chat sidebar for refinements - shows for selected glyph OR during/after streaming */}
      {(selectedGlyph || (streamingPhase === 'complete' && !externalIsStreaming)) && (
        <div 
          style={{
            ...styles.chatSidebar,
            width: isEditorOpen ? chatSidebarWidth : 'auto',
            flex: isEditorOpen ? 'none' : 1, // Take full remaining space when editor is closed
            minWidth: isEditorOpen ? '200px' : 0,
            maxWidth: isEditorOpen ? '600px' : '100%',
            // Ultra goopy spring animation with bounce and elastic feel - but INSTANT during resize
            transition: isResizingChatSidebar 
              ? 'none' 
              : 'width 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55), flex 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55), min-width 0.6s ease-out, max-width 0.6s ease-out',
          }}
        >
          {/* Resize handle on left border - only show when editor is open */}
          {isEditorOpen && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: '4px',
                cursor: 'ew-resize',
                background: isResizingChatSidebar ? 'rgba(0, 255, 255, 0.3)' : 'transparent',
                transition: 'background 0.2s ease',
                zIndex: 10,
              }}
              onMouseDown={handleChatSidebarResizeStart}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0, 255, 255, 0.2)')}
              onMouseLeave={(e) => !isResizingChatSidebar && (e.currentTarget.style.background = 'transparent')}
            />
          )}
          <div style={styles.sidebarHeader}>
            <span style={styles.sidebarTitle}>
              {selectedGlyph ? '💬 Refine with AI' : '✨ Glyph Created'}
            </span>
          </div>
          
          {/* Chat messages */}
          <div style={{
            ...styles.chatMessages,
            // Ensure container constrains width properly when expanded
            maxWidth: '100%',
            width: '100%',
          }}>
            {chatMessages.length === 0 && !selectedGlyph && (
              <div style={styles.chatEmpty}>
                <p style={{ color: '#00ff80', marginBottom: '12px' }}>🎉 Your glyph is ready!</p>
                <p>Click <strong>"💾 Save & Edit"</strong> above to open the editor and start refining.</p>
                <p style={styles.chatHint}>You'll be able to chat with AI to modify your creation.</p>
              </div>
            )}
            {chatMessages.length === 0 && selectedGlyph && (
              <div style={styles.chatEmpty}>
                <p>Ask the AI to modify your glyph</p>
                <p style={styles.chatHint}>e.g. "Make it spin faster" or "Add more particles"</p>
              </div>
            )}
            
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  ...styles.chatMessage,
                  ...(msg.role === 'user' ? styles.chatMessageUser : styles.chatMessageAssistant),
                  // Ensure messages don't overflow container
                  maxWidth: 'calc(75% - 24px)', // Account for padding
                }}
              >
                <span style={styles.chatRole}>
                  {msg.role === 'user' ? '👤' : '🤖'}
                </span>
                <p style={{
                  ...styles.chatContent,
                  // Force text to wrap
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                  hyphens: 'auto',
                }}>{msg.content}</p>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          
          {/* Chat input - only show when we have a selected glyph (can actually refine) */}
          {selectedGlyph ? (
          <div style={styles.chatInputWrapper}>
            {/* Model selector */}
            <div style={{ position: 'relative', display: 'flex' }} ref={modelMenuRef}>
              <button
                onClick={() => setShowModelMenu(!showModelMenu)}
                style={{
                  height: '40px',
                  padding: isChatInputFocused ? '0 10px' : '0 10px',
                  background: 'rgba(255, 0, 255, 0.1)',
                  border: '1px solid rgba(255, 0, 255, 0.3)',
                  borderRadius: '8px',
                  color: '#ff00ff',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: isChatInputFocused ? '0' : '4px',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                }}
                title={`Using: ${availableModels.find(m => m.id === selectedRefineModel)?.name || 'Auto'}`}
              >
                <span style={{ flexShrink: 0 }}>{availableModels.find(m => m.id === selectedRefineModel)?.icon || '🤖'}</span>
                <span style={{ 
                  fontSize: '10px', 
                  opacity: isChatInputFocused ? 0 : 0.6,
                  width: isChatInputFocused ? 0 : 'auto',
                  overflow: 'hidden',
                  transition: 'opacity 0.2s ease, width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                }}>{showModelMenu ? '▲' : '▼'}</span>
              </button>
              
              {showModelMenu && (
                <div style={{
                  position: 'absolute',
                  bottom: '45px',
                  left: 0,
                  background: 'rgba(12, 12, 24, 0.98)',
                  backdropFilter: 'blur(24px)',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 0, 255, 0.4)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                  padding: '8px',
                  minWidth: '200px',
                  zIndex: 100,
                }}>
                  <div style={{
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontSize: '9px',
                    fontWeight: 700,
                    letterSpacing: '1px',
                    padding: '6px 10px',
                    textTransform: 'uppercase',
                  }}>
                    Select Model
                  </div>
                  {['gemini', 'grok', 'openai'].map(provider => {
                    const providerModels = availableModels.filter(m => m.provider === provider && m.available);
                    if (providerModels.length === 0) return null;
                    const providerLabels: Record<string, string> = {
                      gemini: '✨ Gemini',
                      grok: '🤖 Grok',
                      openai: '🧠 OpenAI',
                    };
                    return (
                      <div key={provider}>
                        <div style={{
                          color: 'rgba(255, 255, 255, 0.4)',
                          fontSize: '8px',
                          fontWeight: 600,
                          letterSpacing: '0.5px',
                          padding: '8px 10px 4px',
                          textTransform: 'uppercase',
                          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                          marginTop: '4px',
                        }}>
                          {providerLabels[provider]}
                        </div>
                        {providerModels.map((model) => (
                          <button
                            key={model.id}
                            onClick={() => {
                              setSelectedRefineModel(model.id);
                              setShowModelMenu(false);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              width: '100%',
                              padding: '8px 10px',
                              background: selectedRefineModel === model.id ? 'rgba(255, 0, 255, 0.15)' : 'transparent',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              fontFamily: 'inherit',
                              textAlign: 'left',
                            }}
                          >
                            <span style={{ fontSize: '12px' }}>{model.icon}</span>
                            <span style={{ 
                              color: selectedRefineModel === model.id ? '#ff00ff' : 'rgba(255, 255, 255, 0.8)', 
                              fontSize: '11px',
                              flex: 1,
                            }}>
                              {model.name}
                            </span>
                            {selectedRefineModel === model.id && (
                              <span style={{ color: '#ff00ff', fontSize: '12px' }}>✓</span>
                            )}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            <textarea
              ref={chatInputRef}
              value={chatInput}
              onChange={(e) => {
                const value = e.target.value.slice(0, 500); // Cap at 500 chars
                setChatInput(value);
                // Auto-resize textarea while focused
                if (isChatInputFocused) {
                  const textarea = e.target;
                  textarea.style.height = 'auto';
                  textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleRefine();
                }
              }}
              onFocus={(e) => {
                setIsChatInputFocused(true);
                // Auto-resize on focus if there's content
                const textarea = e.target;
                textarea.style.height = 'auto';
                textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
              }}
              onBlur={(e) => {
                setIsChatInputFocused(false);
                // Reset height back to single line
                e.target.style.height = '40px';
              }}
              placeholder="Refine..."
              maxLength={500}
              style={{
                ...styles.chatInput,
                height: '40px',
                minHeight: '40px',
                maxHeight: isChatInputFocused ? '150px' : '40px',
                overflowY: isChatInputFocused && chatInput.length > 200 ? 'auto' : 'hidden',
                transition: 'border-color 0.2s ease, box-shadow 0.2s ease, max-height 0.25s ease',
                borderColor: isChatInputFocused ? 'rgba(0, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.1)',
                boxShadow: isChatInputFocused ? '0 0 0 2px rgba(0, 255, 255, 0.1)' : 'none',
              }}
              rows={1}
            />
            <button
              onClick={handleRefine}
              disabled={!chatInput.trim() || isRefining}
              style={{
                ...styles.chatSendBtn,
                opacity: chatInput.trim() && !isRefining ? 1 : 0.4,
              }}
            >
              {isRefining ? '◌' : '→'}
            </button>
          </div>
          ) : (
            /* Prompt to save & edit when glyph just created but not yet saved */
            <div style={{
              ...styles.chatInputWrapper,
              justifyContent: 'center',
              padding: '16px',
            }}>
              <span style={{ 
                color: 'rgba(255, 255, 255, 0.5)', 
                fontSize: '12px',
                textAlign: 'center',
              }}>
                Save the glyph to enable refinement chat
              </span>
            </div>
          )}
        </div>
      )}
        </div>
        
        {/* Preview Panel - Resizable from top */}
        <div style={{
          ...styles.previewPanel,
          height: previewHeight,
        }}>
          {/* Resize handle */}
          <div 
            className="preview-resize-handle"
            style={{
              ...styles.previewResizeHandle,
              cursor: 'ns-resize',
              background: isResizingPreview ? 'rgba(0, 255, 255, 0.1)' : 'transparent',
            }}
            onMouseDown={handlePreviewResizeStart}
          >
            <div 
              className="preview-resize-bar"
              style={{
                ...styles.previewResizeBar,
                transform: isResizingPreview ? 'scaleX(1.5)' : 'scaleX(1)',
                background: isResizingPreview 
                  ? 'linear-gradient(90deg, rgba(0, 255, 255, 0.8), rgba(255, 0, 255, 0.8))'
                  : 'linear-gradient(90deg, rgba(0, 255, 255, 0.3), rgba(255, 0, 255, 0.3))',
              }}
            />
          </div>
          
          {/* Preview header */}
          <div style={styles.previewHeader}>
            {/* Preview tabs */}
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => setPreviewTab('preview')}
                style={{
                  padding: '6px 12px',
                  background: previewTab === 'preview' ? 'rgba(0, 255, 255, 0.15)' : 'transparent',
                  border: 'none',
                  borderBottom: previewTab === 'preview' ? '2px solid #00ffff' : '2px solid transparent',
                  color: previewTab === 'preview' ? '#00ffff' : 'rgba(255, 255, 255, 0.6)',
                  fontSize: '11px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  fontFamily: 'inherit',
                }}
              >
                👁️ Preview
              </button>
              {/* Always show errors tab */}
              <button
                onClick={() => setPreviewTab('errors')}
                style={{
                  padding: '6px 12px',
                  background: previewTab === 'errors' ? 'rgba(255, 80, 80, 0.15)' : 'transparent',
                  border: 'none',
                  borderBottom: previewTab === 'errors' ? '2px solid #ff5050' : '2px solid transparent',
                  color: glyphErrors.length > 0 ? '#ff5050' : 
                         previewTab === 'errors' ? '#ff5050' : 'rgba(255, 255, 255, 0.6)',
                  fontSize: '11px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {glyphErrors.length > 0 ? '⚠️' : '✓'} Errors {glyphErrors.length > 0 && `(${glyphErrors.length})`}
              </button>
              {/* DevTools tab */}
              <button
                onClick={() => setPreviewTab('devtools')}
                style={{
                  padding: '6px 12px',
                  background: previewTab === 'devtools' ? 'rgba(180, 100, 255, 0.15)' : 'transparent',
                  border: 'none',
                  borderBottom: previewTab === 'devtools' ? '2px solid #b464ff' : '2px solid transparent',
                  color: previewTab === 'devtools' ? '#b464ff' : 'rgba(255, 255, 255, 0.6)',
                  fontSize: '11px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                🔧 DevTools
              </button>
            </div>
            
            <span style={styles.previewGlyphName}>
              {selectedGlyph?.name || 'No glyph selected'}
            </span>
            
            {externalIsStreaming && (
              <span style={styles.streamingIndicator}>
                <span style={styles.streamingDot} />
                Streaming
              </span>
            )}
            
            {/* RAM Usage Estimator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}>
              <span style={{
                fontSize: '12px',
                color: 'rgba(255, 255, 255, 0.5)',
              }}>
                💾
              </span>
              <span style={{
                fontSize: '11px',
                fontWeight: 500,
                color: estimatedRam.includes('MB') && parseFloat(estimatedRam) > 30 
                  ? '#ff5050' 
                  : estimatedRam.includes('MB') && parseFloat(estimatedRam) > 15 
                    ? '#ffaa00' 
                    : '#00ff80',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {estimatedRam}
              </span>
              <span style={{
                fontSize: '9px',
                color: 'rgba(255, 255, 255, 0.4)',
                textTransform: 'uppercase',
              }}>
                RAM
              </span>
            </div>
            
            {/* Error state with action buttons */}
            {glyphErrors.length > 0 && !currentPendingRefinement && (
              <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', alignItems: 'center' }}>
                <span style={{ 
                  fontSize: '11px', 
                  color: '#ff5050',
                  fontWeight: 500,
                }}>
                  ❌ Errors Found
                </span>
                <button
                  onClick={handleAutoFixErrors}
                  disabled={isAutoFixing}
                  style={{
                    padding: '6px 14px',
                    background: 'linear-gradient(135deg, rgba(0, 255, 128, 0.2), rgba(0, 200, 100, 0.2))',
                    border: '1px solid rgba(0, 255, 128, 0.5)',
                    borderRadius: '6px',
                    color: '#00ff80',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: isAutoFixing ? 'wait' : 'pointer',
                    transition: 'all 0.2s ease',
                    fontFamily: 'inherit',
                    opacity: isAutoFixing ? 0.6 : 1,
                  }}
                >
                  {isAutoFixing ? '◌ Fixing...' : '🔧 Fix Errors'}
                </button>
                <button
                  onClick={handleDeleteGlyph}
                  style={{
                    padding: '6px 14px',
                    background: 'rgba(255, 80, 80, 0.15)',
                    border: '1px solid rgba(255, 80, 80, 0.4)',
                    borderRadius: '6px',
                    color: '#ff5050',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    fontFamily: 'inherit',
                  }}
                >
                  🗑️ Delete Glyph
                </button>
              </div>
            )}
            
            {/* Pending refinement controls */}
            {currentPendingRefinement && (
              <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', alignItems: 'center' }}>
                <button
                  onClick={handleDiscardRefinement}
                  style={{
                    padding: '6px 14px',
                    background: 'rgba(255, 80, 80, 0.15)',
                    border: '1px solid rgba(255, 80, 80, 0.4)',
                    borderRadius: '6px',
                    color: '#ff5050',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    fontFamily: 'inherit',
                  }}
                >
                  ✕ Discard
                </button>
                <button
                  onClick={handleAcceptRefinement}
                  style={{
                    padding: '6px 14px',
                    background: 'linear-gradient(135deg, rgba(0, 255, 128, 0.2), rgba(0, 200, 100, 0.2))',
                    border: '1px solid rgba(0, 255, 128, 0.5)',
                    borderRadius: '6px',
                    color: '#00ff80',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    fontFamily: 'inherit',
                    boxShadow: '0 2px 8px rgba(0, 255, 128, 0.2)',
                  }}
                >
                  ✓ Save
                </button>
              </div>
            )}
          </div>
          
          {/* Preview content */}
          <div style={{ 
            ...styles.previewContent,
            height: previewHeight - 48, // Subtract header height
          }}>
            {(() => {
              // Show errors tab
              if (previewTab === 'errors') {
                return (
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'auto',
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '0 0 12px 12px',
                    padding: '16px',
                  }}>
                    {glyphErrors.length === 0 ? (
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: 1,
                        gap: '12px',
                      }}>
                        <span style={{ fontSize: '32px' }}>✅</span>
                        <p style={{ color: '#00ff80', fontSize: '14px', margin: 0 }}>No errors detected!</p>
                      </div>
                    ) : (
                      <>
                        <div style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#ff5050',
                          marginBottom: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}>
                          <span>⚠️</span>
                          {glyphErrors.length} error{glyphErrors.length !== 1 ? 's' : ''} found
                          {autoFixAttempts > 0 && (
                            <span style={{ 
                              fontSize: '10px', 
                              color: 'rgba(255, 255, 255, 0.5)',
                              marginLeft: '8px',
                            }}>
                              (Auto-fix attempts: {autoFixAttempts}/{MAX_AUTO_FIX_ATTEMPTS})
                            </span>
                          )}
                        </div>
                        {glyphErrors.map((error, i) => (
                          <div key={i} style={{
                            background: 'rgba(255, 80, 80, 0.1)',
                            border: '1px solid rgba(255, 80, 80, 0.3)',
                            borderRadius: '8px',
                            padding: '12px',
                            marginBottom: '8px',
                          }}>
                            <pre style={{
                              margin: 0,
                              fontSize: '11px',
                              color: '#ff5050',
                              fontFamily: "'JetBrains Mono', monospace",
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all',
                            }}>
                              {error}
                            </pre>
                          </div>
                        ))}
                        <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                          <button
                            onClick={handleAutoFixErrors}
                            disabled={isAutoFixing || autoFixAttempts >= MAX_AUTO_FIX_ATTEMPTS}
                            style={{
                              padding: '10px 20px',
                              background: 'linear-gradient(135deg, rgba(0, 255, 128, 0.2), rgba(0, 200, 100, 0.2))',
                              border: '1px solid rgba(0, 255, 128, 0.5)',
                              borderRadius: '8px',
                              color: '#00ff80',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: (isAutoFixing || autoFixAttempts >= MAX_AUTO_FIX_ATTEMPTS) ? 'not-allowed' : 'pointer',
                              transition: 'all 0.2s ease',
                              fontFamily: 'inherit',
                              opacity: (isAutoFixing || autoFixAttempts >= MAX_AUTO_FIX_ATTEMPTS) ? 0.5 : 1,
                            }}
                          >
                            {isAutoFixing ? '◌ Fixing...' : autoFixAttempts >= MAX_AUTO_FIX_ATTEMPTS ? 'Max attempts reached' : '🔧 Auto-Fix with AI'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              }
              
              // Show DevTools tab
              if (previewTab === 'devtools') {
                return (
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    background: 'rgba(0, 0, 0, 0.4)',
                    borderRadius: '0 0 12px 12px',
                  }}>
                    {/* Resolved Inputs Section */}
                    <div style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    }}>
                      <div style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#b464ff',
                        marginBottom: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}>
                        🔐 Resolved Inputs ({Object.keys(resolvedInputs).length})
                      </div>
                      {Object.keys(resolvedInputs).length === 0 ? (
                        <div style={{ 
                          fontSize: '11px', 
                          color: 'rgba(255, 255, 255, 0.4)',
                          fontStyle: 'italic',
                        }}>
                          No inputs resolved. Link keys in Glyphs panel.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {Object.entries(resolvedInputs).map(([key, value]) => (
                            <div key={key} style={{
                              padding: '4px 8px',
                              background: 'rgba(180, 100, 255, 0.1)',
                              border: '1px solid rgba(180, 100, 255, 0.3)',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontFamily: 'monospace',
                            }}>
                              <span style={{ color: '#b464ff' }}>{key}</span>
                              <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}> = </span>
                              <span style={{ color: '#00ff80' }}>
                                {typeof value === 'string' && value.length > 20 
                                  ? `"${value.slice(0, 8)}...${value.slice(-4)}"` 
                                  : JSON.stringify(value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* Console Section */}
                    <div style={{
                      flex: 1,
                      overflow: 'auto',
                      padding: '12px 16px',
                    }}>
                      <div style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#00ffff',
                        marginBottom: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          📋 Console ({consoleLogs.length})
                        </span>
                        {consoleLogs.length > 0 && (
                          <button
                            onClick={() => setConsoleLogs([])}
                            style={{
                              padding: '2px 8px',
                              background: 'transparent',
                              border: '1px solid rgba(255, 255, 255, 0.2)',
                              borderRadius: '4px',
                              color: 'rgba(255, 255, 255, 0.5)',
                              fontSize: '9px',
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                            }}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      {consoleLogs.length === 0 ? (
                        <div style={{ 
                          fontSize: '11px', 
                          color: 'rgba(255, 255, 255, 0.4)',
                          fontStyle: 'italic',
                          textAlign: 'center',
                          padding: '20px',
                        }}>
                          Console output will appear here when the glyph runs.
                          <br />
                          <span style={{ fontSize: '10px', opacity: 0.7 }}>
                            (Note: iframe console is sandboxed)
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {consoleLogs.map((log, i) => (
                            <div key={i} style={{
                              padding: '4px 8px',
                              background: log.type === 'error' ? 'rgba(255, 80, 80, 0.1)' :
                                         log.type === 'warn' ? 'rgba(255, 200, 0, 0.1)' :
                                         'rgba(255, 255, 255, 0.03)',
                              borderLeft: `2px solid ${
                                log.type === 'error' ? '#ff5050' :
                                log.type === 'warn' ? '#ffc800' :
                                log.type === 'info' ? '#00bfff' : '#888'
                              }`,
                              borderRadius: '0 4px 4px 0',
                              fontSize: '10px',
                              fontFamily: 'monospace',
                              color: log.type === 'error' ? '#ff5050' :
                                     log.type === 'warn' ? '#ffc800' : 
                                     'rgba(255, 255, 255, 0.8)',
                            }}>
                              {log.message}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* Linked Keys Info */}
                    <div style={{
                      padding: '12px 16px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                      fontSize: '10px',
                      color: 'rgba(255, 255, 255, 0.4)',
                    }}>
                      {selectedGlyph?.linkedKeys?.length ? (
                        <span>🔗 {selectedGlyph.linkedKeys.length} key(s) linked to this glyph</span>
                      ) : (
                        <span>💡 Tip: Link keys in the Glyphs panel → Linked Keys section</span>
                      )}
                    </div>
                  </div>
                );
              }
              
              // Show new code preview if pending refinement for current file
              const codeToPreview = currentPendingRefinement ? currentPendingRefinement.newCode : previewCode;
              
              // Check if HTML is complete enough to render (has closing tag)
              const isHtmlComplete = codeToPreview && (
                codeToPreview.includes('</html>') || 
                codeToPreview.includes('</body>') ||
                codeToPreview.includes('</svg>')
              );
              
              if (codeToPreview && isHtmlComplete) {
                return (
                  <GlyphIframe
                    code={codeToPreview}
                    glyphId={selectedGlyph?.id || 'preview'}
                    glyphType={selectedGlyph?.type || 'object'}
                    title={selectedGlyph?.name || 'Preview'}
                    allowPointerEvents={true}
                    style={{ borderRadius: '0 0 12px 12px' }}
                    onError={handleGlyphError}
                    inputs={resolvedInputs}
                  />
                );
              } else if (externalIsStreaming) {
                return (
                  <div style={styles.previewPlaceholder}>
                    <span style={styles.previewPlaceholderIcon}>⏳</span>
                    <p style={styles.previewPlaceholderText}>
                      Waiting for complete code...
                    </p>
                    <p style={{ ...styles.previewPlaceholderText, fontSize: '11px', opacity: 0.5 }}>
                      {previewCode ? `${previewCode.length} chars received` : 'Starting...'}
                    </p>
                  </div>
                );
              } else {
                return (
                  <div style={styles.previewPlaceholder}>
                    <span style={styles.previewPlaceholderIcon}>🔮</span>
                    <p style={styles.previewPlaceholderText}>
                      Select a glyph to preview
                    </p>
                  </div>
                );
              }
            })()}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        textarea::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }
        textarea::-webkit-scrollbar {
          width: 8px;
        }
        textarea::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.2);
        }
        textarea::-webkit-scrollbar-thumb {
          background: rgba(0, 255, 255, 0.2);
          border-radius: 4px;
        }
        textarea::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 255, 255, 0.3);
        }
        .preview-resize-handle:hover .preview-resize-bar {
          background: linear-gradient(90deg, rgba(0, 255, 255, 0.6), rgba(255, 0, 255, 0.6));
          transform: scaleX(1.2);
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
  mainWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minHeight: 0,
  },
  
  // Glyph sidebar
  glyphSidebar: {
    width: '180px',
    borderRight: '1px solid rgba(255, 255, 255, 0.06)',
    background: 'rgba(0, 0, 0, 0.15)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0, // NEVER shrink
    flexGrow: 0, // NEVER grow
    overflow: 'hidden',
  },
  sidebarHeader: {
    padding: '14px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  },
  sidebarTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.5)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  glyphList: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px',
  },
  glyphItem: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 12px',
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
    textAlign: 'left',
  },
  glyphItemSelected: {
    background: 'rgba(0, 255, 255, 0.1)',
  },
  glyphIcon: {
    fontSize: '16px',
  },
  glyphName: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.8)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  glyphItemIndented: {
    paddingLeft: '20px',
  },
  
  // Folder styles
  folderSection: {
    marginBottom: '4px',
  },
  folderHeader: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 10px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
    textAlign: 'left',
    marginBottom: '2px',
  },
  folderCollapse: {
    fontSize: '8px',
    color: 'rgba(255, 255, 255, 0.4)',
    width: '12px',
    textAlign: 'center',
  },
  folderIcon: {
    fontSize: '14px',
  },
  folderName: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.7)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  folderCount: {
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.4)',
    padding: '2px 6px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
  },
  unassignedHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 10px',
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.5)',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    marginTop: '8px',
    marginBottom: '4px',
  },
  
  // File sidebar
  fileSidebar: {
    width: '150px',
    borderRight: '1px solid rgba(255, 255, 255, 0.06)',
    background: 'rgba(0, 0, 0, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0, // NEVER shrink
    flexGrow: 0, // NEVER grow
    overflow: 'hidden',
  },
  fileList: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px',
  },
  fileItem: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    background: 'transparent',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
    textAlign: 'left',
  },
  fileItemSelected: {
    background: 'rgba(255, 0, 255, 0.1)',
  },
  fileIcon: {
    fontSize: '14px',
  },
  fileName: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.7)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  
  emptyState: {
    padding: '20px',
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: '12px',
  },
  
  // Editor area
  editorArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0,
  },
  editorHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    background: 'rgba(0, 0, 0, 0.2)',
  },
  editorPath: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
  },
  pathGlyph: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  pathSeparator: {
    color: 'rgba(255, 255, 255, 0.3)',
  },
  pathFile: {
    color: '#00ffff',
    fontWeight: 500,
  },
  modifiedDot: {
    color: '#ff00ff',
    marginLeft: '4px',
  },
  editorActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  errorCount: {
    fontSize: '11px',
    color: '#ffa500',
  },
  saveBtn: {
    padding: '8px 16px',
    background: 'rgba(0, 255, 255, 0.1)',
    border: '1px solid rgba(0, 255, 255, 0.3)',
    borderRadius: '8px',
    color: '#00ffff',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
  
  editorWrapper: {
    flex: 1,
    position: 'relative',
    display: 'flex',
    overflow: 'hidden',
  },
  lineNumbers: {
    width: '50px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRight: '1px solid rgba(255, 255, 255, 0.06)',
    padding: '12px 0',
    overflowY: 'auto',
    userSelect: 'none',
    scrollbarWidth: 'none', // Firefox
    msOverflowStyle: 'none', // IE/Edge
  },
  lineNumber: {
    height: '21px',
    lineHeight: '21px',
    textAlign: 'right',
    paddingRight: '12px',
    fontSize: '12px',
    color: '#ffffff',
    fontFamily: "'JetBrains Mono', monospace",
  },
  editor: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#e0e0e0',
    fontSize: '13px',
    lineHeight: '21px',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    padding: '12px 16px',
    resize: 'none',
    whiteSpace: 'pre',
    overflowX: 'auto',
    tabSize: 2,
  },
  errorHighlight: {
    position: 'absolute',
    left: '50px',
    right: 0,
    height: '21px',
    background: 'rgba(255, 80, 80, 0.1)',
    borderLeft: '2px solid #ff5050',
    pointerEvents: 'none',
  },
  
  errorPanel: {
    maxHeight: '120px',
    overflowY: 'auto',
    borderTop: '1px solid rgba(255, 80, 80, 0.2)',
    background: 'rgba(255, 80, 80, 0.05)',
    padding: '8px',
  },
  errorItem: {
    display: 'flex',
    gap: '12px',
    padding: '6px 8px',
    fontSize: '11px',
  },
  errorLine: {
    color: '#ff5050',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  errorMessage: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  
  placeholder: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
  },
  placeholderIcon: {
    fontSize: '48px',
    opacity: 0.3,
  },
  placeholderText: {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.4)',
    margin: 0,
  },
  
  // Chat sidebar
  chatSidebar: {
    width: '320px',
    borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
    background: 'rgba(0, 0, 0, 0.15)',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative', // For resize handle positioning
    overflow: 'hidden',
    minWidth: 0, // Critical for flex children to respect container bounds
    boxSizing: 'border-box',
  },
  chatMessages: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden', // Prevent horizontal overflow
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '100%',
    boxSizing: 'border-box',
  },
  chatEmpty: {
    textAlign: 'center',
    padding: '40px 20px',
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: '12px',
  },
  chatHint: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.25)',
    marginTop: '8px',
  },
  chatMessage: {
    display: 'flex',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: '10px',
    animation: 'fadeIn 0.3s ease',
    maxWidth: '75%',
    minWidth: 0, // Allow shrinking
    boxSizing: 'border-box',
  },
  chatMessageUser: {
    background: 'rgba(0, 255, 255, 0.08)',
    marginLeft: 'auto', // Push to right side
    flexDirection: 'row-reverse', // Icon on right for user
  },
  chatMessageAssistant: {
    background: 'rgba(255, 0, 255, 0.08)',
    marginRight: 'auto', // Keep on left side
  },
  chatRole: {
    fontSize: '16px',
    flexShrink: 0,
  },
  chatContent: {
    margin: 0,
    fontSize: '12px',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
    whiteSpace: 'pre-wrap',
    overflow: 'hidden',
    minWidth: 0, // Critical for text wrapping in flex
    flex: 1,
    lineHeight: 1.5,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  
  chatInputWrapper: {
    padding: '12px',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    display: 'flex',
    alignItems: 'flex-end', // Buttons stay at bottom when textarea grows
    gap: '8px',
  },
  chatInput: {
    flex: 1,
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    padding: '10px 12px',
    color: '#ffffff',
    fontSize: '12px',
    fontFamily: 'inherit',
    resize: 'none',
    outline: 'none',
    boxSizing: 'border-box',
    lineHeight: 1.4,
  },
  chatSendBtn: {
    width: '40px',
    height: '40px',
    background: 'linear-gradient(135deg, #00ffff, #ff00ff)',
    border: 'none',
    borderRadius: '8px',
    color: '#000',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  
  // Preview Panel Styles
  previewPanel: {
    borderTop: '1px solid rgba(0, 255, 255, 0.2)',
    background: 'linear-gradient(180deg, rgba(0, 20, 30, 0.9) 0%, rgba(5, 10, 20, 0.95) 100%)',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    flexShrink: 0,
  },
  previewResizeHandle: {
    position: 'absolute',
    top: '-4px',
    left: 0,
    right: 0,
    height: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  previewResizeBar: {
    width: '60px',
    height: '4px',
    background: 'linear-gradient(90deg, rgba(0, 255, 255, 0.3), rgba(255, 0, 255, 0.3))',
    borderRadius: '2px',
    transition: 'all 0.2s ease',
  },
  previewHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    background: 'rgba(0, 0, 0, 0.3)',
  },
  previewTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#00ffff',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  previewGlyphName: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.5)',
    flex: 1,
  },
  streamingIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    color: '#ff00ff',
    fontWeight: 500,
  },
  streamingDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#ff00ff',
    boxShadow: '0 0 10px rgba(255, 0, 255, 0.5)',
  },
  streamingBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    background: 'rgba(255, 0, 255, 0.15)',
    border: '1px solid rgba(255, 0, 255, 0.3)',
    borderRadius: '12px',
    fontSize: '11px',
    color: '#ff00ff',
    fontWeight: 500,
  },
  streamingDotSmall: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    background: '#ff00ff',
    boxShadow: '0 0 8px rgba(255, 0, 255, 0.6)',
  },
  previewContent: {
    flex: 1,
    overflow: 'hidden',
    background: 'rgba(5, 5, 15, 0.8)',
  },
  previewPlaceholder: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
  },
  previewPlaceholderIcon: {
    fontSize: '40px',
    opacity: 0.4,
  },
  previewPlaceholderText: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.4)',
    margin: 0,
  },
};

