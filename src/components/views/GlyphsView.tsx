/**
 * GLYPHS VIEW — Browse and invoke your digital creations
 * Folder-based organization with drag & drop via dnd-kit
 * Dynamic input fields, editable names/icons, and live preview
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  CollisionDetection,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createPortal } from 'react-dom';
import GlyphIframe from '../GlyphIframe';
import type { GlyphInput, GlyphFileRef } from '../../types/glyphInputs';
import { GLYPH_ICON_OPTIONS } from '../../types/glyphInputs';

interface GlyphManifest {
  id: string;
  name: string;
  type?: string; // Optional - no longer enforced
  prompt?: string;
  savedAt?: string;
  files?: string[];
  entry?: string;
  icon?: string;
  inputs?: GlyphInput[];
  linkedKeys?: string[]; // IDs of linked keys from user's vault
}

interface LinkedKeyInfo {
  id: string;
  name: string;
  description?: string;
  category?: string;
}

interface GlyphFolder {
  id: string;
  name: string;
  icon: string;
  collapsed?: boolean;
  glyphIds: string[];
  createdAt: string;
}

// Folder icon options
const FOLDER_ICONS = ['📁', '⭐', '🌌', '🔮', '💎', '🎮', '🎨', '🎵', '🌙', '☀️', '🔥', '❄️', '⚡', '🌈', '🎯', '🚀', '💡', '🧪', '🛠️', '📊'];

const GLYPH_ENTRY_PREFERENCES = [
  'index.html',
  'index.tsx',
  'index.jsx',
  'index.js',
  'main.tsx',
  'main.jsx',
  'main.js',
];

function resolveGlyphEntryFile(glyph?: GlyphManifest | null) {
  if (!glyph) return null;
  if (glyph.entry) return glyph.entry;
  if (glyph.files && glyph.files.length > 0) {
    for (const preferred of GLYPH_ENTRY_PREFERENCES) {
      if (glyph.files.includes(preferred)) {
        return preferred;
      }
    }

    const fallback = glyph.files.find((file) => /\.(tsx|ts|jsx|js|html)$/i.test(file));
    if (fallback) {
      return fallback;
    }
  }
  return null;
}

const CARD_PROMPT_CHAR_LIMIT = 200;
const DETAIL_PROMPT_CHAR_LIMIT = 350;

export default function GlyphsView() {
  const [glyphs, setGlyphs] = useState<GlyphManifest[]>([]);
  const [folders, setFolders] = useState<GlyphFolder[]>([]);
  const [unassignedOrder, setUnassignedOrder] = useState<string[]>([]);
  const [selectedGlyph, setSelectedGlyph] = useState<GlyphManifest | null>(null);
  const glyphMap = useMemo(() => new Map(glyphs.map(g => [g.id, g])), [glyphs]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewEntryFile, setPreviewEntryFile] = useState<string | null>(null);
  const [isDetailPromptExpanded, setIsDetailPromptExpanded] = useState(false);
  
  // Editable glyph state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [inputValues, setInputValues] = useState<Record<string, unknown>>({});
  const [isSavingManifest, setIsSavingManifest] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Folder editing state
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [folderIconPickerOpen, setFolderIconPickerOpen] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderIcon, setNewFolderIcon] = useState('📁');
  
  // Linked keys state
  const [linkedKeys, setLinkedKeys] = useState<LinkedKeyInfo[]>([]);
  const [availableKeys, setAvailableKeys] = useState<LinkedKeyInfo[]>([]);
  const [isKeyPickerOpen, setIsKeyPickerOpen] = useState(false);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  
  // Bundled glyph state
  const [isBundled, setIsBundled] = useState(false);
  const [isBundleLoading, setIsBundleLoading] = useState(false);
  
  // Resolved inputs for preview (includes API keys and input values)
  const [resolvedPreviewInputs, setResolvedPreviewInputs] = useState<Record<string, unknown>>({});
  
  // Quick edit panel state
  const [quickEditGlyphId, setQuickEditGlyphId] = useState<string | null>(null);
  const [quickEditValues, setQuickEditValues] = useState<Record<string, unknown>>({});
  const [quickEditAnchor, setQuickEditAnchor] = useState<{ x: number; y: number } | null>(null);
  const [isQuickSaving, setIsQuickSaving] = useState(false);
  const quickEditPanelRef = useRef<HTMLDivElement | null>(null);
  const quickEditSaveTimerRef = useRef<number | null>(null);
  const quickEditPendingUpdatesRef = useRef<{ glyphId: string; updates: Record<string, unknown> } | null>(null);
  const quickEditSaveInFlightRef = useRef(0);

const buildInputValueMap = useCallback((glyph?: GlyphManifest | null) => {
  if (!glyph?.inputs || glyph.inputs.length === 0) return {};
  const values: Record<string, unknown> = {};
  for (const input of glyph.inputs) {
    if ('value' in input && input.value !== undefined) {
      values[input.id] = input.value;
    } else if ('defaultValue' in input && input.defaultValue !== undefined) {
      values[input.id] = input.defaultValue;
    }
  }
  return values;
}, []);
  
  // Drag and drop state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'glyph' | 'folder' | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  
  // dnd-kit sensors with better activation constraints
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { 
        distance: 5, // Start drag after 5px movement
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );


  // Load glyphs and folders from file system
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Load glyphs
        const loadedGlyphs = await window.loom?.loadGlyphs?.() || [];
        setGlyphs(loadedGlyphs as GlyphManifest[]);
        
        // Load folder organization
        const folderData = await window.loom?.loadGlyphFolders?.();
        if (folderData) {
          setFolders(folderData.folders || []);
          setUnassignedOrder(folderData.unassignedOrder || []);
        }
      } catch (error) {
        console.error('Failed to load glyphs:', error);
      }
      setIsLoading(false);
    };
    
    loadData();
  }, []);
  
  // Listen for glyph list changes (new glyphs created) and auto-refresh
  useEffect(() => {
    const unsubscribe = window.loom?.onGlyphListChanged?.(async (data) => {
      console.log('[GlyphsView] 🔄 Glyph list changed, refreshing...', data.glyphId);
      try {
        // Reload glyphs
        const loadedGlyphs = await window.loom?.loadGlyphs?.() || [];
        setGlyphs(loadedGlyphs as GlyphManifest[]);
        console.log('[GlyphsView] ✅ Glyphs refreshed, count:', loadedGlyphs.length);
      } catch (error) {
        console.error('[GlyphsView] Failed to refresh glyphs:', error);
      }
    });
    
    return () => {
      unsubscribe?.();
    };
  }, []);
  
  // Save folders whenever they change
  const saveFolders = useCallback(async (newFolders: GlyphFolder[], newUnassignedOrder: string[]) => {
    try {
      await window.loom?.saveGlyphFolders?.({
        folders: newFolders,
        unassignedOrder: newUnassignedOrder,
      });
    } catch (error) {
      console.error('Failed to save folders:', error);
    }
  }, []);

  const quickEditGlyph = quickEditGlyphId ? glyphMap.get(quickEditGlyphId) ?? null : null;

  useEffect(() => {
    return () => {
      if (quickEditSaveTimerRef.current) {
        window.clearTimeout(quickEditSaveTimerRef.current);
        quickEditSaveTimerRef.current = null;
      }
    };
  }, []);

  // Load preview code when selection changes
  useEffect(() => {
    setPreviewCode(null);
    setPreviewError(null);
    setPreviewEntryFile(null);
    setIsDetailPromptExpanded(false);
    setIsEditingName(false);
    setIsIconPickerOpen(false);
    setIsKeyPickerOpen(false);
    setLinkedKeys([]);
    setResolvedPreviewInputs({});

    if (!selectedGlyph) {
      setIsPreviewLoading(false);
      setInputValues({});
      return;
    }

    // Initialize input values from glyph manifest
    const initialValues = buildInputValueMap(selectedGlyph);
    setInputValues(initialValues);
    // Also initialize resolved preview inputs with the same values
    setResolvedPreviewInputs(prev => ({ ...prev, ...initialValues }));
    setEditedName(selectedGlyph.name);

    const entryFile = resolveGlyphEntryFile(selectedGlyph);
    setPreviewEntryFile(entryFile);

    if (!entryFile) {
      setPreviewError('No previewable entry file found.');
      setIsPreviewLoading(false);
      return;
    }

    const readGlyphFile = window.loom?.readGlyphFile;
    if (!readGlyphFile) {
      setPreviewError('Preview unavailable in this environment.');
      setIsPreviewLoading(false);
      return;
    }

    let isCancelled = false;

    const loadPreview = async () => {
      setIsPreviewLoading(true);
      try {
        const code = await readGlyphFile(selectedGlyph.id, entryFile);
        if (isCancelled) return;
        setPreviewCode(code);
        setPreviewError(null);
      } catch (error) {
        if (isCancelled) return;
        console.error('Failed to load glyph preview:', error);
        setPreviewCode(null);
        setPreviewError('Failed to load preview.');
      } finally {
        if (isCancelled) return;
        setIsPreviewLoading(false);
      }
    };

    // Load linked keys for this glyph and resolve their values for preview
    const loadLinkedKeys = async () => {
      setIsLoadingKeys(true);
      try {
        const result = await window.loom?.getGlyphLinkedKeys?.(selectedGlyph.id);
        if (isCancelled) return;
        if (result?.success && result.linkedKeys) {
          setLinkedKeys(result.linkedKeys);
        }
        
        // Also resolve the actual key values for preview
        const resolvedResult = await window.loom?.getGlyphResolvedKeys?.(selectedGlyph.id);
        if (isCancelled) return;
        
        if (resolvedResult?.success && resolvedResult.keys) {
          const apiKeyInputs = (selectedGlyph.inputs || []).filter(i => i.type === 'apiKey');
          const resolvedInputs: Record<string, unknown> = {};
          
          for (const [, keyData] of Object.entries(resolvedResult.keys) as [string, { name: string; value: string }][]) {
            const keyName = keyData.name;
            const keyNameLower = keyName.toLowerCase().replace(/\s+/g, '');
            
            // Try to find a matching apiKey input in the manifest
            let matchedInputId: string | null = null;
            
            for (const apiInput of apiKeyInputs) {
              const inputIdLower = apiInput.id.toLowerCase();
              const inputLabelLower = (apiInput.label || '').toLowerCase().replace(/\s+/g, '');
              const inputService = ((apiInput as any).service || '').toLowerCase();
              
              if (inputIdLower.includes(keyNameLower) || 
                  keyNameLower.includes(inputIdLower) ||
                  keyNameLower.includes(inputService) ||
                  (inputService && keyNameLower.includes(inputService)) ||
                  inputLabelLower.includes(keyNameLower) ||
                  keyNameLower.includes(inputLabelLower)) {
                matchedInputId = apiInput.id;
                break;
              }
            }
            
            const inputKey = matchedInputId || keyNameLower;
            resolvedInputs[inputKey] = keyData.value;
            console.log(`🔐 [GlyphsView] Resolved key: ${keyName} → ${inputKey}`);
          }
          
          setResolvedPreviewInputs(prev => ({ ...prev, ...resolvedInputs }));
        }
      } catch (error) {
        console.error('Failed to load linked keys:', error);
      } finally {
        if (!isCancelled) setIsLoadingKeys(false);
      }
    };

    // Check if glyph is bundled
    const checkBundledStatus = async () => {
      try {
        const result = await window.loom?.isGlyphBundled?.(selectedGlyph.id);
        if (isCancelled) return;
        setIsBundled(result?.isBundled ?? false);
      } catch (error) {
        console.error('Failed to check bundled status:', error);
        setIsBundled(false);
      }
    };

    loadPreview();
    loadLinkedKeys();
    checkBundledStatus();

    return () => {
      isCancelled = true;
    };
  }, [selectedGlyph]);

  // Get all glyph IDs that are in folders
  const assignedGlyphIds = useMemo(() => {
    const ids = new Set<string>();
    folders.forEach(f => f.glyphIds.forEach(id => ids.add(id)));
    return ids;
  }, [folders]);
  
  // Get unassigned glyphs (not in any folder)
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

  // Filter folders and their contents based on search
  const displayFolders = useMemo(() => {
    if (!searchQuery) return folders;
    const query = searchQuery.toLowerCase();
    return folders.map(folder => {
      const matchingGlyphIds = folder.glyphIds.filter(id => {
        const glyph = glyphMap.get(id);
        return glyph && (
          glyph.name.toLowerCase().includes(query) ||
          glyph.prompt?.toLowerCase().includes(query)
        );
      });
      return { ...folder, glyphIds: matchingGlyphIds };
    }).filter(f => f.glyphIds.length > 0 || f.name.toLowerCase().includes(query));
  }, [folders, searchQuery, glyphMap]);

  const displayUnassigned = useMemo(() => {
    if (!searchQuery) return unassignedGlyphs;
    const query = searchQuery.toLowerCase();
    return unassignedGlyphs.filter(g =>
      g.name.toLowerCase().includes(query) ||
      g.prompt?.toLowerCase().includes(query)
    );
  }, [unassignedGlyphs, searchQuery]);

  // Custom collision detection - use closest center for better sorting
  const customCollisionDetection: CollisionDetection = useCallback((args) => {
    // Get all collisions using closest center (best for sorting)
    const closestCollisions = closestCenter(args);
    
    // Get pointer collisions for drop zones
    const pointerCollisions = pointerWithin(args);
    
    // Check if we're dragging a folder (use closest center for folder reordering)
    const activeIdStr = String(args.active.id);
    const isDraggingFolder = activeIdStr.startsWith('folder-') && !activeIdStr.endsWith('-drop') && !glyphMap.has(activeIdStr);
    
    if (isDraggingFolder) {
      // For folder dragging, use closest center to find other folders
      const folderCollision = closestCollisions.find(
        c => String(c.id).startsWith('folder-') && !String(c.id).endsWith('-drop')
      );
      if (folderCollision) {
        console.log('🎯 [Collision] Folder reorder:', folderCollision.id);
        return [folderCollision];
      }
      return closestCollisions;
    }
    
    // For glyph dragging:
    // 1. First check if we're directly over a drop zone (folder header or unassigned zone)
    const dropZoneCollision = pointerCollisions.find(
      c => String(c.id).endsWith('-drop') || c.id === 'unassigned-drop-zone'
    );
    
    // 2. Check if we're over a glyph (for reordering)
    const glyphCollision = closestCollisions.find(c => glyphMap.has(String(c.id)));
    
    // Prefer glyph collisions for sorting, unless we're directly over a drop zone
    if (glyphCollision && !dropZoneCollision) {
      console.log('🎯 [Collision] Glyph:', glyphCollision.id);
      return [glyphCollision];
    }
    
    if (dropZoneCollision) {
      console.log('🎯 [Collision] Drop zone:', dropZoneCollision.id);
      return [dropZoneCollision];
    }
    
    // Fallback to closest center
    if (closestCollisions.length > 0) {
      console.log('🎯 [Collision] Fallback closest:', closestCollisions[0]?.id);
    }
    
    return closestCollisions.length > 0 ? closestCollisions : pointerCollisions;
  }, [glyphMap]);

  // Invoke glyph as full-screen background
  const handleInvokeAsBackground = useCallback((glyph: GlyphManifest) => {
    console.log('🌌 Invoking glyph as background:', glyph.name);
    window.loom?.invokeGlyph?.(glyph.id, 'background');
  }, []);

  // Invoke glyph as movable/resizable widget
  const handleInvokeAsWidget = useCallback((glyph: GlyphManifest) => {
    console.log('🔮 Invoking glyph as widget:', glyph.name);
    window.loom?.invokeGlyph?.(glyph.id, 'widget');
  }, []);

  // Open in editor
  const handleEditGlyph = useCallback((glyph: GlyphManifest) => {
    console.log('✏️ Opening glyph in editor:', glyph.name);
    window.loom?.openGlyphInEditor?.(glyph.id);
  }, []);

  // Delete glyph
  const handleDeleteGlyph = useCallback((glyph: GlyphManifest) => {
    if (window.confirm(`Delete "${glyph.name}"? This cannot be undone.`)) {
      window.loom?.deleteGlyph?.(glyph.id);
      setGlyphs(prev => prev.filter(g => g.id !== glyph.id));
      if (selectedGlyph?.id === glyph.id) setSelectedGlyph(null);
    }
  }, [selectedGlyph]);

  // Toggle bundle status
  const handleToggleBundled = useCallback(async () => {
    if (!selectedGlyph || isBundleLoading) return;
    
    setIsBundleLoading(true);
    try {
      if (isBundled) {
        // Unbundle
        const result = await window.loom?.unbundleGlyph?.(selectedGlyph.id);
        if (result?.success) {
          setIsBundled(false);
          console.log('📦 Glyph unbundled:', selectedGlyph.name);
        } else {
          console.error('Failed to unbundle:', result?.error);
        }
      } else {
        // Bundle
        const result = await window.loom?.bundleGlyph?.(selectedGlyph.id);
        if (result?.success) {
          setIsBundled(true);
          console.log('📦 Glyph bundled:', selectedGlyph.name);
        } else {
          console.error('Failed to bundle:', result?.error);
        }
      }
    } catch (error) {
      console.error('Failed to toggle bundle status:', error);
    } finally {
      setIsBundleLoading(false);
    }
  }, [selectedGlyph, isBundled, isBundleLoading]);

  // Save manifest changes (name, icon, inputs)
  const saveManifestChanges = useCallback(async (updates: Partial<GlyphManifest>) => {
    if (!selectedGlyph) return;
    
    setIsSavingManifest(true);
    try {
      // Read current manifest
      const manifestContent = await window.loom?.readGlyphFile?.(selectedGlyph.id, 'manifest.json');
      if (!manifestContent) throw new Error('Could not read manifest');
      
      const manifest = JSON.parse(manifestContent);
      const updatedManifest = { ...manifest, ...updates };
      
      // Save updated manifest
      await window.loom?.saveGlyphFile?.(
        selectedGlyph.id, 
        'manifest.json', 
        JSON.stringify(updatedManifest, null, 2)
      );
      
      // Update local state
      const updatedGlyph = { ...selectedGlyph, ...updates };
      setSelectedGlyph(updatedGlyph);
      setGlyphs(prev => prev.map(g => g.id === selectedGlyph.id ? updatedGlyph : g));
      
      console.log('✅ Manifest saved:', updates);
    } catch (error) {
      console.error('Failed to save manifest:', error);
    } finally {
      setIsSavingManifest(false);
    }
  }, [selectedGlyph]);

  const saveInputsForGlyph = useCallback(async (glyphId: string, valueUpdates: Record<string, unknown>, options: { replace?: boolean } = {}) => {
    const { replace = false } = options;
    try {
      const manifestContent = await window.loom?.readGlyphFile?.(glyphId, 'manifest.json');
      if (!manifestContent) {
        throw new Error('Could not read manifest');
      }

      const manifest = JSON.parse(manifestContent);
      if (!Array.isArray(manifest.inputs)) {
        return;
      }

      const updatedInputs = manifest.inputs.map((input: GlyphInput) => {
        const updated = { ...input };
        const hasValue = Object.prototype.hasOwnProperty.call(valueUpdates, input.id);
        if (replace) {
          if (hasValue) {
            const nextValue = valueUpdates[input.id];
            if (nextValue === undefined || nextValue === null) {
              delete (updated as Record<string, unknown>).value;
            } else {
              (updated as Record<string, unknown>).value = nextValue;
            }
          } else {
            delete (updated as Record<string, unknown>).value;
          }
        } else if (hasValue) {
          const nextValue = valueUpdates[input.id];
          if (nextValue === undefined || nextValue === null) {
            delete (updated as Record<string, unknown>).value;
          } else {
            (updated as Record<string, unknown>).value = nextValue;
          }
        }
        return updated;
      });

      manifest.inputs = updatedInputs;

      await window.loom?.saveGlyphFile?.(
        glyphId,
        'manifest.json',
        JSON.stringify(manifest, null, 2)
      );

      setGlyphs(prev => prev.map(g => g.id === glyphId ? { ...g, inputs: updatedInputs } : g));
      if (selectedGlyph?.id === glyphId) {
        setSelectedGlyph(prev => prev ? { ...prev, inputs: updatedInputs } : prev);
        if (replace) {
          setInputValues({ ...valueUpdates });
        } else {
          setInputValues(prev => ({ ...prev, ...valueUpdates }));
        }
        setResolvedPreviewInputs(prev => ({ ...prev, ...valueUpdates }));
      }
    } catch (error) {
      console.error('Failed to save glyph inputs:', error);
      throw error;
    }
  }, [selectedGlyph]);

  const uploadGlyphInputFile = useCallback((glyphId: string, inputId: string, files: FileList, onValue?: (fileRef: GlyphFileRef) => void) => {
    if (!files.length) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(',')[1];
        const result = await window.loom?.uploadGlyphFile?.(
          glyphId,
          file.name,
          base64,
          file.type
        );
        
        if (result?.success) {
          const fileRef: GlyphFileRef = {
            name: file.name,
            path: result.path || `uploads/${file.name}`,
            size: result.size || file.size,
            mimeType: file.type,
            uploadedAt: new Date().toISOString(),
          };
          
          onValue?.(fileRef);
          await saveInputsForGlyph(glyphId, { [inputId]: fileRef });
        } else {
          console.error('Failed to upload file:', result?.error);
        }
      } catch (error) {
        console.error('Failed to upload file:', error);
      }
    };
    reader.readAsDataURL(file);
  }, [saveInputsForGlyph]);

  // Handle name edit
  const handleNameSave = useCallback(() => {
    if (!editedName.trim() || editedName === selectedGlyph?.name) {
      setIsEditingName(false);
      return;
    }
    saveManifestChanges({ name: editedName.trim() });
    setIsEditingName(false);
  }, [editedName, selectedGlyph, saveManifestChanges]);

  // Handle icon change
  const handleIconChange = useCallback((icon: string) => {
    saveManifestChanges({ icon });
    setIsIconPickerOpen(false);
  }, [saveManifestChanges]);

  // Handle input value change
  const handleInputChange = useCallback((inputId: string, value: unknown) => {
    setInputValues(prev => ({ ...prev, [inputId]: value }));
    // Also update resolved preview inputs for immediate preview refresh
    setResolvedPreviewInputs(prev => ({ ...prev, [inputId]: value }));
  }, []);

  // Save input values to manifest
  const saveInputValues = useCallback(async () => {
    if (!selectedGlyph?.inputs) return;
    setIsSavingManifest(true);
    try {
      await saveInputsForGlyph(selectedGlyph.id, inputValues, { replace: true });
    } catch (error) {
      console.error('Failed to save inputs:', error);
    } finally {
      setIsSavingManifest(false);
    }
  }, [selectedGlyph, inputValues, saveInputsForGlyph]);

  // Add new input field
  const handleAddInput = useCallback(() => {
    if (!selectedGlyph) return;
    
    const newInput: GlyphInput = {
      id: `input_${Date.now()}`,
      type: 'string',
      label: 'New Input',
      description: 'Enter a value',
    };
    
    const currentInputs = selectedGlyph.inputs || [];
    saveManifestChanges({ inputs: [...currentInputs, newInput] });
  }, [selectedGlyph, saveManifestChanges]);

  // Remove input field
  const handleRemoveInput = useCallback((inputId: string) => {
    if (!selectedGlyph?.inputs) return;
    
    const updatedInputs = selectedGlyph.inputs.filter(i => i.id !== inputId);
    saveManifestChanges({ inputs: updatedInputs });
    setInputValues(prev => {
      const next = { ...prev };
      delete next[inputId];
      return next;
    });
  }, [selectedGlyph, saveManifestChanges]);

  // Handle file upload
  const handleFileUpload = useCallback((inputId: string, files: FileList) => {
    if (!selectedGlyph) return;
    uploadGlyphInputFile(selectedGlyph.id, inputId, files, (fileRef) => {
      handleInputChange(inputId, fileRef);
    });
  }, [selectedGlyph, uploadGlyphInputFile, handleInputChange]);

  const handleQuickFileUpload = useCallback((glyphId: string, inputId: string, files: FileList) => {
    uploadGlyphInputFile(glyphId, inputId, files, (fileRef) => {
      setQuickEditValues(prev => ({ ...prev, [inputId]: fileRef }));
    });
  }, [uploadGlyphInputFile]);

  const flushQuickEditUpdates = useCallback(async () => {
    if (!quickEditPendingUpdatesRef.current) {
      quickEditSaveTimerRef.current = null;
      return;
    }
    const payload = quickEditPendingUpdatesRef.current;
    quickEditPendingUpdatesRef.current = null;
    quickEditSaveTimerRef.current = null;
    try {
      quickEditSaveInFlightRef.current += 1;
      setIsQuickSaving(true);
      await saveInputsForGlyph(payload.glyphId, payload.updates);
    } catch (error) {
      console.error('Failed to save quick inputs:', error);
    } finally {
      quickEditSaveInFlightRef.current -= 1;
      if (quickEditSaveInFlightRef.current <= 0) {
        setIsQuickSaving(false);
      }
    }
  }, [saveInputsForGlyph]);

  const scheduleQuickSave = useCallback((glyphId: string, updates: Record<string, unknown>) => {
    const previous = quickEditPendingUpdatesRef.current;
    const mergedUpdates =
      previous && previous.glyphId === glyphId
        ? { ...previous.updates, ...updates }
        : { ...updates };

    quickEditPendingUpdatesRef.current = {
      glyphId,
      updates: mergedUpdates,
    };

    if (quickEditSaveTimerRef.current) {
      window.clearTimeout(quickEditSaveTimerRef.current);
    }
    quickEditSaveTimerRef.current = window.setTimeout(() => {
      flushQuickEditUpdates();
    }, 200);
  }, [flushQuickEditUpdates]);

  const closeQuickEdit = useCallback(() => {
    if (quickEditSaveTimerRef.current) {
      window.clearTimeout(quickEditSaveTimerRef.current);
      quickEditSaveTimerRef.current = null;
    }
    if (quickEditPendingUpdatesRef.current) {
      flushQuickEditUpdates();
    }
    setQuickEditGlyphId(null);
    setQuickEditAnchor(null);
  }, [flushQuickEditUpdates]);

  const handleQuickInputChange = useCallback((glyphId: string, inputId: string, value: unknown) => {
    setQuickEditValues(prev => ({ ...prev, [inputId]: value }));
    scheduleQuickSave(glyphId, { [inputId]: value });
  }, [scheduleQuickSave]);

  const handleQuickEditToggle = useCallback((glyph: GlyphManifest, anchorRect: DOMRect) => {
    if (!glyph.inputs || glyph.inputs.length === 0) return;
    if (quickEditGlyphId === glyph.id) {
      closeQuickEdit();
      return;
    }
    if (quickEditGlyphId && quickEditGlyphId !== glyph.id) {
      flushQuickEditUpdates();
    }
    const values = buildInputValueMap(glyph);
    const panelWidth = 300;
    const estimatedHeight = Math.min(window.innerHeight - 40, 140 + glyph.inputs.length * 90);
    const left = Math.min(anchorRect.right + 12, window.innerWidth - panelWidth - 12);
    const top = Math.min(Math.max(anchorRect.top - 20, 20), window.innerHeight - estimatedHeight);
    setQuickEditValues(values);
    setQuickEditAnchor({ x: left, y: top });
    setQuickEditGlyphId(glyph.id);
  }, [quickEditGlyphId, buildInputValueMap, closeQuickEdit, flushQuickEditUpdates]);

  useEffect(() => {
    if (!quickEditGlyphId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeQuickEdit();
      }
    };
    const handleMouseDown = (event: MouseEvent) => {
      if (!quickEditPanelRef.current) return;
      if (!quickEditPanelRef.current.contains(event.target as Node)) {
        closeQuickEdit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [quickEditGlyphId, closeQuickEdit]);

  useEffect(() => {
    if (!quickEditGlyphId) return;
    const glyph = glyphMap.get(quickEditGlyphId);
    if (!glyph || !glyph.inputs || glyph.inputs.length === 0) {
      closeQuickEdit();
    }
  }, [quickEditGlyphId, glyphMap, closeQuickEdit]);

  // Load available keys from vault (for key picker)
  const loadAvailableKeys = useCallback(async () => {
    try {
      const storedKeys = await window.loom?.getStoredKeys?.();
      if (Array.isArray(storedKeys)) {
        setAvailableKeys(storedKeys);
      }
    } catch (error) {
      console.error('Failed to load available keys:', error);
    }
  }, []);

  // Open key picker
  const handleOpenKeyPicker = useCallback(() => {
    loadAvailableKeys();
    setIsKeyPickerOpen(true);
  }, [loadAvailableKeys]);

  // Link a key to the glyph
  const handleLinkKey = useCallback(async (keyId: string) => {
    if (!selectedGlyph) return;
    
    try {
      const result = await window.loom?.linkKeyToGlyph?.(selectedGlyph.id, keyId);
      if (result?.success) {
        // Add to local state
        const keyInfo = availableKeys.find(k => k.id === keyId);
        if (keyInfo) {
          setLinkedKeys(prev => [...prev, keyInfo]);
        }
        setIsKeyPickerOpen(false);
        
        // Update the glyph in local state to include the linked key
        setGlyphs(prev => prev.map(g => {
          if (g.id === selectedGlyph.id) {
            return { ...g, linkedKeys: [...(g.linkedKeys || []), keyId] };
          }
          return g;
        }));
        setSelectedGlyph(prev => prev ? { ...prev, linkedKeys: [...(prev.linkedKeys || []), keyId] } : null);
      }
    } catch (error) {
      console.error('Failed to link key:', error);
    }
  }, [selectedGlyph, availableKeys]);

  // Unlink a key from the glyph
  const handleUnlinkKey = useCallback(async (keyId: string) => {
    if (!selectedGlyph) return;
    
    try {
      const result = await window.loom?.unlinkKeyFromGlyph?.(selectedGlyph.id, keyId);
      if (result?.success) {
        // Remove from local state
        setLinkedKeys(prev => prev.filter(k => k.id !== keyId));
        
        // Update the glyph in local state
        setGlyphs(prev => prev.map(g => {
          if (g.id === selectedGlyph.id) {
            return { ...g, linkedKeys: (g.linkedKeys || []).filter(id => id !== keyId) };
          }
          return g;
        }));
        setSelectedGlyph(prev => prev ? { ...prev, linkedKeys: (prev.linkedKeys || []).filter(id => id !== keyId) } : null);
      }
    } catch (error) {
      console.error('Failed to unlink key:', error);
    }
  }, [selectedGlyph]);

  const handleGlyphSelection = useCallback((glyph: GlyphManifest) => {
    setSelectedGlyph((current) => (current?.id === glyph.id ? null : glyph));
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // 📁 FOLDER MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  const handleCreateFolder = useCallback(() => {
    if (!newFolderName.trim()) return;
    
    const newFolder: GlyphFolder = {
      id: `folder-${Date.now()}`,
      name: newFolderName.trim(),
      icon: newFolderIcon,
      collapsed: false,
      glyphIds: [],
      createdAt: new Date().toISOString(),
    };
    
    const updated = [...folders, newFolder];
    setFolders(updated);
    saveFolders(updated, unassignedOrder);
    setNewFolderName('');
    setNewFolderIcon('📁');
    setIsCreatingFolder(false);
  }, [newFolderName, newFolderIcon, folders, unassignedOrder, saveFolders]);

  const handleDeleteFolder = useCallback((folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    
    if (!window.confirm(`Delete folder "${folder.name}"? Glyphs will be moved to Unassigned.`)) return;
    
    // Move glyphs to unassigned
    const newUnassigned = [...folder.glyphIds, ...unassignedOrder];
    const updated = folders.filter(f => f.id !== folderId);
    
    setFolders(updated);
    setUnassignedOrder(newUnassigned);
    saveFolders(updated, newUnassigned);
  }, [folders, unassignedOrder, saveFolders]);

  const handleToggleFolderCollapse = useCallback((folderId: string) => {
    const updated = folders.map(f => 
      f.id === folderId ? { ...f, collapsed: !f.collapsed } : f
    );
    setFolders(updated);
    saveFolders(updated, unassignedOrder);
  }, [folders, unassignedOrder, saveFolders]);

  const handleFolderNameSave = useCallback((folderId: string) => {
    if (!editingFolderName.trim()) {
      setEditingFolderId(null);
      return;
    }
    
    const updated = folders.map(f => 
      f.id === folderId ? { ...f, name: editingFolderName.trim() } : f
    );
    setFolders(updated);
    saveFolders(updated, unassignedOrder);
    setEditingFolderId(null);
  }, [editingFolderName, folders, unassignedOrder, saveFolders]);

  const handleFolderIconChange = useCallback((folderId: string, icon: string) => {
    const updated = folders.map(f => 
      f.id === folderId ? { ...f, icon } : f
    );
    setFolders(updated);
    saveFolders(updated, unassignedOrder);
    setFolderIconPickerOpen(null);
  }, [folders, unassignedOrder, saveFolders]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 🎯 DRAG AND DROP HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  // Helper to find which container a glyph is in
  const findGlyphContainer = useCallback((glyphId: string): { type: 'folder' | 'unassigned'; folderId?: string } | null => {
    for (const folder of folders) {
      if (folder.glyphIds.includes(glyphId)) {
        return { type: 'folder', folderId: folder.id };
      }
    }
    if (unassignedOrder.includes(glyphId) || glyphs.some(g => g.id === glyphId && !folders.some(f => f.glyphIds.includes(glyphId)))) {
      return { type: 'unassigned' };
    }
    return null;
  }, [folders, unassignedOrder, glyphs]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id);
    const isFolder = id.startsWith('folder-') && !glyphMap.has(id);
    const isGlyph = glyphMap.has(id);
    
    console.log('🎯 [DND] DRAG START:', {
      activeId: id,
      isFolder,
      isGlyph,
      activeData: event.active.data.current,
    });
    
    setActiveId(id);
    setActiveType(isFolder ? 'folder' : isGlyph ? 'glyph' : null);
  }, [glyphMap]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    const activeIdStr = String(active.id);
    const overIdStr = over ? String(over.id) : null;
    
    // Only log occasionally to avoid spam
    if (Math.random() < 0.1) {
      console.log('🔄 [DND] DRAG OVER:', {
        activeId: activeIdStr,
        overId: overIdStr,
        isGlyphTarget: overIdStr ? glyphMap.has(overIdStr) : false,
      });
    }
    
    setOverId(overIdStr);
  }, [glyphMap]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    console.log('🏁 [DND] DRAG END:', {
      activeId: active?.id,
      overId: over?.id,
      activeType,
      activeData: active?.data?.current,
      overData: over?.data?.current,
    });
    
    setActiveId(null);
    setActiveType(null);
    setOverId(null);
    
    if (!over) {
      console.log('❌ [DND] No drop target');
      return;
    }
    
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    
    // Same item - no change needed
    if (activeIdStr === overIdStr) {
      console.log('⏸️ [DND] Same item, no change');
      return;
    }
    
    // Determine what's being dragged and where
    const activeIsGlyph = glyphMap.has(activeIdStr);
    const activeIsFolder = activeIdStr.startsWith('folder-') && !glyphMap.has(activeIdStr) && !activeIdStr.includes('-drop');
    const overIsFolder = (overIdStr.startsWith('folder-') && !glyphMap.has(overIdStr) && !overIdStr.includes('-drop'));
    const overIsFolderDrop = overIdStr.endsWith('-drop'); // Dropping glyph onto folder
    const overIsUnassigned = overIdStr === 'unassigned-drop-zone';
    const overIsGlyph = glyphMap.has(overIdStr);
    
    // Extract actual folder ID from folder-drop targets
    const overFolderId = overIsFolderDrop ? overIdStr.replace('-drop', '') : overIdStr;
    
    console.log('🔍 [DND] Analysis:', {
      activeIsGlyph,
      activeIsFolder,
      overIsFolder,
      overIsFolderDrop,
      overIsUnassigned,
      overIsGlyph,
      overFolderId,
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // FOLDER REORDERING - Dragging a folder onto another folder
    // ═══════════════════════════════════════════════════════════════════════════
    if (activeIsFolder && (overIsFolder || (overIsFolderDrop && !activeIsGlyph))) {
      const activeFolder = folders.find(f => f.id === activeIdStr);
      const overFolder = folders.find(f => f.id === overFolderId);
      
      if (activeFolder && overFolder) {
        const oldIndex = folders.findIndex(f => f.id === activeIdStr);
        const newIndex = folders.findIndex(f => f.id === overIdStr);
        
        if (oldIndex !== -1 && newIndex !== -1) {
          const newFolders = arrayMove(folders, oldIndex, newIndex);
          console.log('✅ [DND] Reordered folders:', newFolders.map(f => f.name));
          setFolders(newFolders);
          saveFolders(newFolders, unassignedOrder);
        }
      }
      return;
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // GLYPH OPERATIONS
    // ═══════════════════════════════════════════════════════════════════════════
    if (!activeIsGlyph) {
      console.log('❌ [DND] Active item is not a glyph');
      return;
    }
    
    // Find source container
    const sourceContainer = findGlyphContainer(activeIdStr);
    console.log('📦 [DND] Source container:', sourceContainer);
    
    // CASE 1: Dropping onto a folder header (move to that folder)
    if (overIsFolder || overIsFolderDrop) {
      const targetFolder = folders.find(f => f.id === overFolderId);
      if (!targetFolder) {
        console.log('❌ [DND] Target folder not found');
        return;
      }
      
      // Already in this folder?
      if (sourceContainer?.folderId === targetFolder.id) {
        console.log('⏸️ [DND] Already in target folder');
        return;
      }
      
      console.log('📁 [DND] Moving to folder:', targetFolder.name);
      
      let newFolders = [...folders];
      let newUnassigned = [...unassignedOrder];
      
      // Remove from source
      if (sourceContainer?.type === 'folder' && sourceContainer.folderId) {
        newFolders = newFolders.map(f => 
          f.id === sourceContainer.folderId 
            ? { ...f, glyphIds: f.glyphIds.filter(id => id !== activeIdStr) }
            : f
        );
      } else {
        newUnassigned = newUnassigned.filter(id => id !== activeIdStr);
      }
      
      // Add to target folder
      newFolders = newFolders.map(f =>
        f.id === targetFolder.id
          ? { ...f, glyphIds: [...f.glyphIds, activeIdStr] }
          : f
      );
      
      console.log('✅ [DND] New state:', { newFolders, newUnassigned });
      setFolders(newFolders);
      setUnassignedOrder(newUnassigned);
      saveFolders(newFolders, newUnassigned);
      return;
    }
    
    // CASE 2: Dropping onto the unassigned zone
    if (overIsUnassigned) {
      if (sourceContainer?.type === 'unassigned') {
        console.log('⏸️ [DND] Already unassigned');
        return;
      }
      
      console.log('📥 [DND] Moving to unassigned');
      
      let newFolders = folders.map(f => 
        f.id === sourceContainer?.folderId
          ? { ...f, glyphIds: f.glyphIds.filter(id => id !== activeIdStr) }
          : f
      );
      const newUnassigned = [...unassignedOrder, activeIdStr];
      
      console.log('✅ [DND] New state:', { newFolders, newUnassigned });
      setFolders(newFolders);
      setUnassignedOrder(newUnassigned);
      saveFolders(newFolders, newUnassigned);
      return;
    }
    
    // CASE 3: Dropping onto another glyph (reorder within same container or move to target's container)
    if (overIsGlyph) {
      const targetContainer = findGlyphContainer(overIdStr);
      console.log('🎴 [DND] Dropping on glyph, target container:', targetContainer);
      
      // Same container? Reorder
      if (sourceContainer?.type === targetContainer?.type && 
          sourceContainer?.folderId === targetContainer?.folderId) {
        console.log('🔄 [DND] Reordering within same container');
        
        if (sourceContainer?.type === 'folder' && sourceContainer.folderId) {
          const folder = folders.find(f => f.id === sourceContainer.folderId);
          if (folder) {
            const oldIndex = folder.glyphIds.indexOf(activeIdStr);
            const newIndex = folder.glyphIds.indexOf(overIdStr);
            
            if (oldIndex !== -1 && newIndex !== -1) {
              const newGlyphIds = arrayMove(folder.glyphIds, oldIndex, newIndex);
              const newFolders = folders.map(f =>
                f.id === folder.id ? { ...f, glyphIds: newGlyphIds } : f
              );
              console.log('✅ [DND] Reordered in folder:', newGlyphIds);
              setFolders(newFolders);
              saveFolders(newFolders, unassignedOrder);
            }
          }
        } else {
          // Reorder in unassigned
          const allUnassignedIds = unassignedGlyphs.map(g => g.id);
          const oldIndex = allUnassignedIds.indexOf(activeIdStr);
          const newIndex = allUnassignedIds.indexOf(overIdStr);
          
          if (oldIndex !== -1 && newIndex !== -1) {
            const newOrder = arrayMove(allUnassignedIds, oldIndex, newIndex);
            console.log('✅ [DND] Reordered in unassigned:', newOrder);
            setUnassignedOrder(newOrder);
            saveFolders(folders, newOrder);
          }
        }
        return;
      }
      
      // Different container - move to target's container at that position
      console.log('➡️ [DND] Moving to different container');
      
      let newFolders = [...folders];
      let newUnassigned = [...unassignedOrder];
      
      // Remove from source
      if (sourceContainer?.type === 'folder' && sourceContainer.folderId) {
        newFolders = newFolders.map(f => 
          f.id === sourceContainer.folderId 
            ? { ...f, glyphIds: f.glyphIds.filter(id => id !== activeIdStr) }
            : f
        );
      } else {
        newUnassigned = newUnassigned.filter(id => id !== activeIdStr);
      }
      
      // Add to target container
      if (targetContainer?.type === 'folder' && targetContainer.folderId) {
        newFolders = newFolders.map(f => {
          if (f.id === targetContainer.folderId) {
            const insertIndex = f.glyphIds.indexOf(overIdStr);
            const newGlyphIds = [...f.glyphIds];
            newGlyphIds.splice(insertIndex, 0, activeIdStr);
            return { ...f, glyphIds: newGlyphIds };
          }
          return f;
        });
      } else {
        const insertIndex = newUnassigned.indexOf(overIdStr);
        if (insertIndex !== -1) {
          newUnassigned.splice(insertIndex, 0, activeIdStr);
        } else {
          newUnassigned.push(activeIdStr);
        }
      }
      
      console.log('✅ [DND] New state:', { newFolders, newUnassigned });
      setFolders(newFolders);
      setUnassignedOrder(newUnassigned);
      saveFolders(newFolders, newUnassigned);
    }
  }, [folders, unassignedOrder, glyphMap, unassignedGlyphs, saveFolders, findGlyphContainer]);

  // Get active glyph for drag overlay
  const activeGlyph = activeId ? glyphMap.get(activeId) : null;

  return (
    <div style={styles.container}>
      {/* Header with search and folder creation */}
      <div style={styles.header}>
        <div style={styles.searchWrapper}>
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
              style={styles.clearBtn}
            >
              ✕
            </button>
          )}
        </div>
        
        <div style={styles.headerActions}>
          <span style={styles.glyphCount}>
            {glyphs.length} glyph{glyphs.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setIsCreatingFolder(true)}
            style={styles.createFolderBtn}
          >
            + New Folder
          </button>
        </div>
      </div>

      {/* Main content - Split view */}
      <div style={styles.content}>
        {/* Glyphs list with drag and drop */}
        <div style={styles.glyphsList}>
          {isLoading ? (
            <div style={styles.loadingState}>
              <span style={styles.spinner}>◌</span>
              <p>Loading glyphs...</p>
            </div>
          ) : glyphs.length === 0 ? (
            <div style={styles.emptyState}>
              <span style={styles.emptyIcon}>🔮</span>
              <p style={styles.emptyText}>No glyphs found</p>
              <p style={styles.emptyHint}>Summon something in the Chat tab!</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={customCollisionDetection}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              {/* New Folder Creation */}
              {isCreatingFolder && (
                <div style={styles.newFolderForm}>
                  <button
                    style={styles.newFolderIconBtn}
                    onClick={() => setFolderIconPickerOpen('new')}
                  >
                    {newFolderIcon}
                  </button>
                  {folderIconPickerOpen === 'new' && (
                    <div style={styles.folderIconPicker}>
                      {FOLDER_ICONS.map(icon => (
                        <button
                          key={icon}
                          style={styles.folderIconOption}
                          onClick={() => {
                            setNewFolderIcon(icon);
                            setFolderIconPickerOpen(null);
                          }}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                  )}
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Folder name..."
                    style={styles.newFolderInput}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateFolder();
                      if (e.key === 'Escape') setIsCreatingFolder(false);
                    }}
                  />
                  <button style={styles.newFolderSaveBtn} onClick={handleCreateFolder}>
                    ✓
                  </button>
                  <button style={styles.newFolderCancelBtn} onClick={() => setIsCreatingFolder(false)}>
                    ✕
                  </button>
                </div>
              )}

              {/* Folders - wrapped in SortableContext for reordering */}
              <SortableContext
                items={displayFolders.map(f => f.id)}
                strategy={verticalListSortingStrategy}
              >
                {displayFolders.map((folder) => (
                  <FolderSection
                    key={folder.id}
                    folder={folder}
                    glyphMap={glyphMap}
                    selectedGlyphId={selectedGlyph?.id}
                    onGlyphSelect={handleGlyphSelection}
                    onInvokeBackground={handleInvokeAsBackground}
                    onInvokeWidget={handleInvokeAsWidget}
                    onQuickEditToggle={handleQuickEditToggle}
                    quickEditGlyphId={quickEditGlyphId}
                    isEditing={editingFolderId === folder.id}
                    editingName={editingFolderName}
                    onStartEdit={(name) => {
                      setEditingFolderId(folder.id);
                      setEditingFolderName(name);
                    }}
                    onEditNameChange={setEditingFolderName}
                    onSaveName={() => handleFolderNameSave(folder.id)}
                    onCancelEdit={() => setEditingFolderId(null)}
                    onToggleCollapse={() => handleToggleFolderCollapse(folder.id)}
                    onDelete={() => handleDeleteFolder(folder.id)}
                    iconPickerOpen={folderIconPickerOpen === folder.id}
                    onToggleIconPicker={() => setFolderIconPickerOpen(
                      folderIconPickerOpen === folder.id ? null : folder.id
                    )}
                  onIconChange={(icon) => handleFolderIconChange(folder.id, icon)}
                  isOver={overId === folder.id || overId === `${folder.id}-drop`}
                />
                ))}
              </SortableContext>

              {/* Unassigned Section */}
              <UnassignedSection
                glyphs={displayUnassigned}
                selectedGlyphId={selectedGlyph?.id}
                onGlyphSelect={handleGlyphSelection}
                onInvokeBackground={handleInvokeAsBackground}
                onInvokeWidget={handleInvokeAsWidget}
                onQuickEditToggle={handleQuickEditToggle}
                quickEditGlyphId={quickEditGlyphId}
                isOver={overId === 'unassigned-drop-zone'}
              />

              {/* Drag Overlay - rendered via portal to avoid positioning issues */}
              {createPortal(
                <DragOverlay 
                  dropAnimation={{
                    duration: 250,
                    easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
                  }}
                  style={{ cursor: 'grabbing' }}
                >
                  {activeType === 'glyph' && activeGlyph && (
                    <GlyphCard
                      glyph={activeGlyph}
                      isSelected={false}
                      onClick={() => {}}
                      onInvokeBackground={() => {}}
                      onInvokeWidget={() => {}}
                      onQuickEditToggle={undefined}
                      hasInputs={Boolean(activeGlyph.inputs?.length)}
                      isQuickEditing={false}
                      delay={0}
                      isDragOverlay
                    />
                  )}
                  {activeType === 'folder' && activeId && (
                    <FolderDragPreview folder={folders.find(f => f.id === activeId)} />
                  )}
                </DragOverlay>,
                document.body
              )}
            </DndContext>
          )}
        </div>

        {/* Detail panel */}
        {selectedGlyph && (
          <div style={styles.detailPanel}>
            <button
              aria-label="Close glyph inspector"
              style={styles.detailCloseBtn}
              onClick={() => setSelectedGlyph(null)}
            >
              ✕
            </button>
            <div style={styles.detailHeader}>
              {/* Clickable icon with picker */}
              <div style={{ position: 'relative' }}>
                <button
                  style={styles.iconButton}
                  onClick={() => setIsIconPickerOpen(!isIconPickerOpen)}
                  title="Click to change icon"
                >
                  {selectedGlyph.icon || '🔮'}
                </button>
                {isIconPickerOpen && (
                  <div style={styles.iconPicker}>
                    <div style={styles.iconPickerHeader}>Choose Icon</div>
                    <div style={styles.iconGrid}>
                      {GLYPH_ICON_OPTIONS.map(icon => (
                        <button
                          key={icon}
                          style={{
                            ...styles.iconOption,
                            ...(selectedGlyph.icon === icon ? styles.iconOptionSelected : {}),
                          }}
                          onClick={() => handleIconChange(icon)}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                {/* Editable name */}
                {isEditingName ? (
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    onBlur={handleNameSave}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleNameSave();
                      if (e.key === 'Escape') {
                        setEditedName(selectedGlyph.name);
                        setIsEditingName(false);
                      }
                    }}
                    style={styles.nameInput}
                    autoFocus
                  />
                ) : (
                  <h2 
                    style={styles.detailTitle}
                    onClick={() => {
                      setEditedName(selectedGlyph.name);
                      setIsEditingName(true);
                    }}
                    title="Click to edit name"
                  >
                    {selectedGlyph.name}
                    <span style={styles.editHint}>✏️</span>
                  </h2>
                )}
                {selectedGlyph.savedAt && (
                  <span style={styles.detailType}>
                    {new Date(selectedGlyph.savedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            
            {selectedGlyph.prompt && (
              <div style={styles.detailSection}>
                <h3 style={styles.sectionTitle}>Original Prompt</h3>
            <p
              style={{
                ...styles.prompt,
                ...(selectedGlyph.prompt && selectedGlyph.prompt.length > DETAIL_PROMPT_CHAR_LIMIT
                  ? styles.promptCollapsible
                  : {}),
              }}
              onClick={() => {
                if ((selectedGlyph.prompt || '').length <= DETAIL_PROMPT_CHAR_LIMIT) return;
                setIsDetailPromptExpanded(prev => !prev);
              }}
            >
              {(() => {
                const promptText = selectedGlyph.prompt || '';
                if (!promptText) return null;
                if (promptText.length <= DETAIL_PROMPT_CHAR_LIMIT || isDetailPromptExpanded) {
                  return promptText;
                }
                return `${promptText.slice(0, DETAIL_PROMPT_CHAR_LIMIT).trimEnd()}…`;
              })()}
              {(selectedGlyph.prompt || '').length > DETAIL_PROMPT_CHAR_LIMIT && (
                <span style={styles.promptToggle}>
                  {isDetailPromptExpanded ? 'Show less' : 'Show more'}
                </span>
              )}
            </p>
              </div>
            )}

            <div style={styles.detailSection}>
              <h3 style={styles.sectionTitle}>Preview</h3>
              <div style={styles.previewContainer}>
                {isPreviewLoading && (
                  <div style={styles.previewStatus}>Loading preview...</div>
                )}
                {!isPreviewLoading && previewError && (
                  <div style={styles.previewStatus}>{previewError}</div>
                )}
                {!isPreviewLoading && !previewError && previewCode && (
                  <div style={styles.previewFrame}>
                    <GlyphIframe
                      code={previewCode}
                      glyphId={selectedGlyph.id}
                      glyphType={selectedGlyph.type}
                      allowPointerEvents={false}
                      style={styles.previewIframe}
                      inputs={{ ...inputValues, ...resolvedPreviewInputs }}
                    />
                  </div>
                )}
              </div>
              {previewEntryFile && (
                <div style={styles.previewMeta}>Source: {previewEntryFile}</div>
              )}
            </div>
            
            {selectedGlyph.files && (
              <div style={styles.detailSection}>
                <h3 style={styles.sectionTitle}>Files</h3>
                <div style={styles.filesList}>
                  {selectedGlyph.files.map(file => (
                    <div key={file} style={styles.fileItem}>
                      <span style={styles.fileIcon}>📄</span>
                      {file}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {selectedGlyph.savedAt && (
              <div style={styles.detailMeta}>
                Created: {new Date(selectedGlyph.savedAt).toLocaleString()}
              </div>
            )}

            {/* Bundle Toggle - Only shown in dev mode */}
            {window.loom?.isDev && (
              <div style={styles.detailSection}>
                <div style={styles.bundleToggleRow}>
                  <div style={styles.bundleInfo}>
                    <span style={styles.bundleIcon}>📦</span>
                    <div>
                      <span style={styles.bundleLabel}>Include in App Bundle</span>
                      <span style={styles.bundleDescription}>
                        {isBundled 
                          ? 'This glyph will be included when you build the app' 
                          : 'Toggle to include this glyph in all builds'}
                      </span>
                    </div>
                  </div>
                  <button
                    style={{
                      ...styles.bundleToggle,
                      ...(isBundled ? styles.bundleToggleOn : styles.bundleToggleOff),
                      opacity: isBundleLoading ? 0.6 : 1,
                      cursor: isBundleLoading ? 'wait' : 'pointer',
                    }}
                    onClick={handleToggleBundled}
                    disabled={isBundleLoading}
                    title={isBundled ? 'Remove from app bundle' : 'Add to app bundle'}
                  >
                    {isBundleLoading ? '...' : isBundled ? 'BUNDLED' : 'NOT BUNDLED'}
                  </button>
                </div>
              </div>
            )}

            {/* Dynamic Inputs Section */}
            <div style={styles.detailSection}>
              <div style={styles.inputsHeader}>
                <h3 style={styles.sectionTitle}>Configuration</h3>
                <button
                  style={styles.addInputBtn}
                  onClick={handleAddInput}
                  title="Add new input field"
                >
                  + Add Input
                </button>
              </div>
              
              {(!selectedGlyph.inputs || selectedGlyph.inputs.length === 0) ? (
                <div style={styles.noInputs}>
                  No configuration inputs defined.
                  <br />
                  <span style={styles.noInputsHint}>
                    Click "Add Input" or refine the glyph to add configurable fields.
                  </span>
                </div>
              ) : (
                <div style={styles.inputsList}>
                  {selectedGlyph.inputs.map(input => (
                    <GlyphInputField
                      key={input.id}
                      input={input}
                      value={inputValues[input.id]}
                      onChange={(val) => handleInputChange(input.id, val)}
                      onRemove={() => handleRemoveInput(input.id)}
                      onFileUpload={(files) => handleFileUpload(input.id, files)}
                    />
                  ))}
                  
                  {Object.keys(inputValues).length > 0 && (
                    <button
                      style={styles.saveInputsBtn}
                      onClick={saveInputValues}
                      disabled={isSavingManifest}
                    >
                      {isSavingManifest ? 'Saving...' : '💾 Save Configuration'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Linked Keys Section */}
            <div style={styles.detailSection}>
              <div style={styles.inputsHeader}>
                <h3 style={styles.sectionTitle}>🔐 Linked Keys</h3>
                <button
                  style={styles.addInputBtn}
                  onClick={handleOpenKeyPicker}
                  title="Link a key from your vault"
                >
                  + Link Key
                </button>
              </div>
              
              {isLoadingKeys ? (
                <div style={styles.noInputs}>Loading keys...</div>
              ) : linkedKeys.length === 0 ? (
                <div style={styles.noInputs}>
                  No keys linked to this glyph.
                  <br />
                  <span style={styles.noInputsHint}>
                    Link keys from your vault to provide API access.
                  </span>
                </div>
              ) : (
                <div style={styles.inputsList}>
                  {linkedKeys.map(key => (
                    <div key={key.id} style={linkedKeyStyles.keyItem}>
                      <div style={linkedKeyStyles.keyInfo}>
                        <span style={linkedKeyStyles.keyIcon}>🔑</span>
                        <div style={linkedKeyStyles.keyDetails}>
                          <span style={linkedKeyStyles.keyName}>{key.name}</span>
                          {key.description && (
                            <span style={linkedKeyStyles.keyDescription}>{key.description}</span>
                          )}
                        </div>
                      </div>
                      <button
                        style={linkedKeyStyles.unlinkBtn}
                        onClick={() => handleUnlinkKey(key.id)}
                        title="Unlink this key"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Key Picker Dropdown */}
              {isKeyPickerOpen && (
                <div style={linkedKeyStyles.keyPicker}>
                  <div style={linkedKeyStyles.keyPickerHeader}>
                    <span>Select a key to link</span>
                    <button
                      style={linkedKeyStyles.keyPickerClose}
                      onClick={() => setIsKeyPickerOpen(false)}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={linkedKeyStyles.keyPickerList}>
                    {availableKeys.filter(k => !linkedKeys.some(lk => lk.id === k.id)).length === 0 ? (
                      <div style={linkedKeyStyles.noKeysAvailable}>
                        {availableKeys.length === 0 
                          ? 'No keys in vault. Add keys in Settings → Keys.'
                          : 'All keys are already linked.'}
                      </div>
                    ) : (
                      availableKeys
                        .filter(k => !linkedKeys.some(lk => lk.id === k.id))
                        .map(key => (
                          <button
                            key={key.id}
                            style={linkedKeyStyles.keyOption}
                            onClick={() => handleLinkKey(key.id)}
                          >
                            <span style={linkedKeyStyles.keyIcon}>🔑</span>
                            <span style={linkedKeyStyles.keyName}>{key.name}</span>
                            {key.category && (
                              <span style={linkedKeyStyles.keyCategory}>{key.category}</span>
                            )}
                          </button>
                        ))
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <div style={styles.detailActions}>
              <div style={styles.invokeButtons}>
                <button 
                  onClick={() => handleInvokeAsBackground(selectedGlyph)}
                  style={styles.backgroundBtn}
                  title="Set as full-screen background"
                >
                  🌌 Background
                </button>
                <button 
                  onClick={() => handleInvokeAsWidget(selectedGlyph)}
                  style={styles.widgetBtn}
                  title="Add as movable widget"
                >
                  🔮 Widget
                </button>
              </div>
              <button 
                onClick={() => handleEditGlyph(selectedGlyph)}
                style={styles.secondaryBtn}
              >
                ⌨️ Edit Code
              </button>
              <button 
                onClick={() => handleDeleteGlyph(selectedGlyph)}
                style={styles.dangerBtn}
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {quickEditGlyph && quickEditGlyph.inputs?.length && quickEditAnchor && (
        <div
          ref={quickEditPanelRef}
          style={{
            ...quickEditStyles.panel,
            left: quickEditAnchor.x,
            top: quickEditAnchor.y,
          }}
        >
          <div style={quickEditStyles.header}>
            <div style={quickEditStyles.headerText}>
              <span style={quickEditStyles.headerTitle}>⚙️ {quickEditGlyph.name}</span>
              <span style={quickEditStyles.headerSubtitle}>Live configuration</span>
            </div>
            <button style={quickEditStyles.closeBtn} onClick={closeQuickEdit}>
              ×
            </button>
          </div>
          <div>
            {quickEditGlyph.inputs.map(input => (
              <GlyphInputField
                key={input.id}
                input={input}
                value={quickEditValues[input.id]}
                onChange={(val) => handleQuickInputChange(quickEditGlyph.id, input.id, val)}
                onFileUpload={(files) => handleQuickFileUpload(quickEditGlyph.id, input.id, files)}
              />
            ))}
          </div>
          <div style={quickEditStyles.footer}>
            {isQuickSaving ? 'Saving…' : 'Changes synced'}
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        input::placeholder {
          color: rgba(255, 255, 255, 0.35);
        }
        button:hover {
          filter: brightness(1.1);
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎛️ GLYPH INPUT FIELD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface GlyphInputFieldProps {
  input: GlyphInput;
  value: unknown;
  onChange: (value: unknown) => void;
  onRemove?: () => void;
  onFileUpload?: (files: FileList) => void;
}

function GlyphInputField({ input, value, onChange, onRemove, onFileUpload }: GlyphInputFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const renderInput = () => {
    switch (input.type) {
      case 'string':
        if (input.inputType === 'textarea') {
          return (
            <textarea
              value={(value as string) || ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder={input.placeholder}
              style={inputFieldStyles.textarea}
            />
          );
        }
        return (
          <input
            type={input.inputType || 'text'}
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={input.placeholder}
            style={inputFieldStyles.input}
          />
        );

      case 'apiKey':
        return (
          <div style={inputFieldStyles.apiKeyWrapper}>
            <input
              type="password"
              value={(value as string) || ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder={input.placeholder || 'Enter API key...'}
              style={inputFieldStyles.input}
            />
            <span style={inputFieldStyles.apiKeyIcon}>🔐</span>
          </div>
        );

      case 'toggle':
        return (
          <button
            style={{
              ...inputFieldStyles.toggle,
              ...(value ? inputFieldStyles.toggleOn : inputFieldStyles.toggleOff),
            }}
            onClick={() => onChange(!value)}
          >
            {value ? (input.onLabel || 'On') : (input.offLabel || 'Off')}
          </button>
        );

      case 'select':
        return (
          <select
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            style={inputFieldStyles.select}
          >
            <option value="">Select...</option>
            {input.options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        );

      case 'multiselect':
        const selectedValues = (value as string[]) || [];
        return (
          <div style={inputFieldStyles.multiselect}>
            {input.options.map(opt => (
              <label key={opt.value} style={inputFieldStyles.multiselectOption}>
                <input
                  type="checkbox"
                  checked={selectedValues.includes(opt.value)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onChange([...selectedValues, opt.value]);
                    } else {
                      onChange(selectedValues.filter(v => v !== opt.value));
                    }
                  }}
                />
                {opt.label}
              </label>
            ))}
          </div>
        );

      case 'range':
        return (
          <div style={inputFieldStyles.rangeWrapper}>
            <input
              type="range"
              min={input.min}
              max={input.max}
              step={input.step || 1}
              value={(value as number) || input.defaultValue || input.min}
              onChange={(e) => onChange(Number(e.target.value))}
              style={inputFieldStyles.range}
            />
            <span style={inputFieldStyles.rangeValue}>
              {String(value ?? input.defaultValue ?? input.min)}{input.unit || ''}
            </span>
          </div>
        );

      case 'color':
        return (
          <div style={inputFieldStyles.colorWrapper}>
            <input
              type="color"
              value={(value as string) || input.defaultValue || '#00ffff'}
              onChange={(e) => onChange(e.target.value)}
              style={inputFieldStyles.colorInput}
            />
            <span style={inputFieldStyles.colorValue}>{String(value || input.defaultValue || '')}</span>
          </div>
        );

      case 'file':
        if (!onFileUpload) {
          return (
            <div style={inputFieldStyles.fileUnavailable}>
              File uploads are only available in the detailed inspector.
            </div>
          );
        }
        const fileRef = value as GlyphFileRef | undefined;
        return (
          <div style={inputFieldStyles.fileWrapper}>
            <input
              ref={fileInputRef}
              type="file"
              accept={input.accept}
              multiple={input.multiple}
              onChange={(e) => e.target.files && onFileUpload(e.target.files)}
              style={{ display: 'none' }}
            />
            <button
              style={inputFieldStyles.fileBtn}
              onClick={() => fileInputRef.current?.click()}
            >
              📁 {fileRef ? fileRef.name : 'Choose File'}
            </button>
            {fileRef && (
              <span style={inputFieldStyles.fileMeta}>
                {(fileRef.size / 1024).toFixed(1)} KB
              </span>
            )}
          </div>
        );

      default:
        return <span style={{ color: 'rgba(255,255,255,0.4)' }}>Unknown input type</span>;
    }
  };

  return (
    <div style={inputFieldStyles.container}>
      <div style={inputFieldStyles.header}>
        <label style={inputFieldStyles.label}>
          {input.label}
          {input.required && <span style={inputFieldStyles.required}>*</span>}
        </label>
        {onRemove && (
          <button
            style={inputFieldStyles.removeBtn}
            onClick={onRemove}
            title="Remove input"
          >
            ×
          </button>
        )}
      </div>
      {input.description && (
        <p style={inputFieldStyles.description}>{input.description}</p>
      )}
      {renderInput()}
    </div>
  );
}

const inputFieldStyles: Record<string, React.CSSProperties> = {
  container: {
    marginBottom: '16px',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  required: {
    color: '#ff6b6b',
    marginLeft: '4px',
  },
  description: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
    margin: '0 0 8px 0',
  },
  removeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '13px',
    fontFamily: 'inherit',
    outline: 'none',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '13px',
    fontFamily: 'inherit',
    outline: 'none',
    minHeight: '80px',
    resize: 'vertical',
  },
  apiKeyWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  apiKeyIcon: {
    position: 'absolute',
    right: '12px',
    fontSize: '14px',
    opacity: 0.5,
  },
  toggle: {
    padding: '8px 16px',
    borderRadius: '20px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
  toggleOn: {
    background: 'rgba(0, 255, 128, 0.2)',
    color: '#00ff80',
  },
  toggleOff: {
    background: 'rgba(255, 255, 255, 0.1)',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '13px',
    fontFamily: 'inherit',
    outline: 'none',
    cursor: 'pointer',
  },
  multiselect: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  multiselectOption: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.7)',
    cursor: 'pointer',
  },
  rangeWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  range: {
    flex: 1,
    accentColor: '#00ffff',
  },
  rangeValue: {
    fontSize: '12px',
    color: '#00ffff',
    minWidth: '50px',
    textAlign: 'right',
  },
  colorWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  colorInput: {
    width: '40px',
    height: '40px',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    background: 'transparent',
  },
  colorValue: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: 'monospace',
  },
  fileWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  fileUnavailable: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.5)',
    fontStyle: 'italic',
  },
  fileBtn: {
    padding: '10px 16px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px dashed rgba(255, 255, 255, 0.2)',
    borderRadius: '8px',
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  fileMeta: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 LINKED KEY STYLES
// ═══════════════════════════════════════════════════════════════════════════

const linkedKeyStyles: Record<string, React.CSSProperties> = {
  keyItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    background: 'rgba(0, 255, 255, 0.03)',
    borderRadius: '8px',
    border: '1px solid rgba(0, 255, 255, 0.1)',
    marginBottom: '8px',
  },
  keyInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flex: 1,
  },
  keyIcon: {
    fontSize: '16px',
    opacity: 0.8,
  },
  keyDetails: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  keyName: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  keyDescription: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  keyCategory: {
    fontSize: '10px',
    padding: '2px 6px',
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '4px',
    color: 'rgba(255, 255, 255, 0.5)',
    marginLeft: 'auto',
  },
  unlinkBtn: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255, 100, 100, 0.6)',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
    transition: 'all 0.2s',
  },
  keyPicker: {
    marginTop: '12px',
    background: 'rgba(0, 0, 0, 0.4)',
    borderRadius: '10px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  keyPickerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    fontSize: '12px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  keyPickerClose: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '2px 6px',
  },
  keyPickerList: {
    maxHeight: '200px',
    overflowY: 'auto' as const,
  },
  keyOption: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '10px 12px',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'background 0.2s',
    textAlign: 'left' as const,
  },
  noKeysAvailable: {
    padding: '16px',
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center' as const,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 🃏 GLYPH CARD COMPONENT (with drag support)
// ═══════════════════════════════════════════════════════════════════════════

interface GlyphCardProps {
  glyph: GlyphManifest;
  isSelected: boolean;
  onClick: () => void;
  onInvokeBackground: () => void;
  onInvokeWidget: () => void;
  onQuickEditToggle?: (glyph: GlyphManifest, anchorRect: DOMRect) => void;
  hasInputs: boolean;
  isQuickEditing: boolean;
  delay: number;
  isDragOverlay?: boolean;
}

function GlyphCard({
  glyph,
  isSelected,
  onClick,
  onInvokeBackground,
  onInvokeWidget,
  onQuickEditToggle,
  hasInputs,
  isQuickEditing,
  delay: _delay,
  isDragOverlay,
}: GlyphCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: glyph.id, 
    disabled: isDragOverlay,
    data: { type: 'glyph', glyphId: glyph.id },
  });

  // For drag overlay, don't apply transform - it's positioned by DragOverlay
  // Use CSS.Translate for grid layouts (avoids scaleX/scaleY issues with grid)
  const style: React.CSSProperties = isDragOverlay ? {
    ...cardStyles.card,
    ...cardStyles.cardDragOverlay,
    width: '200px', // Fixed width for overlay
  } : {
    ...cardStyles.card,
    ...(isSelected ? cardStyles.cardSelected : {}),
    ...(isQuickEditing ? cardStyles.cardQuickEditing : {}),
    borderColor: isSelected ? '#00ffff' : 'rgba(255, 255, 255, 0.08)',
    transform: CSS.Translate.toString(transform),
    transition: transition || 'transform 200ms ease',
    opacity: isDragging ? 0.4 : 1, // More obvious when dragging
    cursor: isDragging ? 'grabbing' : 'grab',
    zIndex: isDragging ? 1 : 'auto',
    willChange: 'transform', // Optimize for animations
  };

  const promptText = glyph.prompt || '';
  const visiblePrompt = promptText
    ? `${promptText.slice(0, CARD_PROMPT_CHAR_LIMIT).trimEnd()}${promptText.length > CARD_PROMPT_CHAR_LIMIT ? '…' : ''}`
    : '';

  // Log drag state and transform for debugging
  if (isDragging) {
    console.log(`🎴 [GlyphCard] ${glyph.name} isDragging:`, { transform, transition });
  }
  // Log when transform is applied (other items making room)
  if (transform && !isDragging && (transform.x !== 0 || transform.y !== 0)) {
    console.log(`📐 [GlyphCard] ${glyph.name} transform applied:`, { 
      x: transform.x, 
      y: transform.y,
      scaleX: transform.scaleX,
      scaleY: transform.scaleY 
    });
  }

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={style}
      {...(isDragOverlay ? {} : attributes)}
      {...(isDragOverlay ? {} : listeners)}
      onClick={isDragOverlay ? undefined : onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={cardStyles.cardHeader}>
        <span style={cardStyles.cardIcon}>{glyph.icon || '🔮'}</span>
        <span style={cardStyles.cardTitle}>{glyph.name}</span>
      </div>
      
      {glyph.prompt && (
        <p style={cardStyles.cardPrompt}>{visiblePrompt}</p>
      )}
      
      {!isDragOverlay && (
        <div style={cardStyles.cardActions}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInvokeBackground();
            }}
            style={cardStyles.bgBtn}
            title="Set as background"
          >
            🌌
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInvokeWidget();
            }}
            style={cardStyles.widgetBtn}
            title="Add as widget"
          >
            🔮
          </button>
            {hasInputs && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                  onQuickEditToggle?.(glyph, rect);
                }}
                style={{
                  ...cardStyles.quickEditBtn,
                  opacity: isHovered || isQuickEditing ? 1 : 0,
                  transform: isQuickEditing ? 'scale(1.05)' : undefined,
                }}
                title="Live edit inputs"
              >
                ⚙️
              </button>
            )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📁 FOLDER DRAG PREVIEW COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

// Base font family to use across drag overlays (matches app)
const DRAG_OVERLAY_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function FolderDragPreview({ folder }: { folder?: GlyphFolder }) {
  if (!folder) return null;
  
  return (
    <div style={{
      padding: '12px 20px',
      background: 'rgba(0, 255, 255, 0.15)',
      border: '2px solid rgba(0, 255, 255, 0.6)',
      borderRadius: '12px',
      boxShadow: '0 20px 40px rgba(0, 255, 255, 0.3)',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      cursor: 'grabbing',
      minWidth: '200px',
      fontFamily: DRAG_OVERLAY_FONT,
    }}>
      <span style={{ fontSize: '20px' }}>{folder.icon}</span>
      <span style={{ color: '#fff', fontWeight: 600, fontSize: '13px' }}>{folder.name}</span>
      <span style={{
        padding: '2px 8px',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '10px',
        fontSize: '11px',
        color: 'rgba(255, 255, 255, 0.6)',
      }}>
        {folder.glyphIds.length}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📁 FOLDER SECTION COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface FolderSectionProps {
  folder: GlyphFolder;
  glyphMap: Map<string, GlyphManifest>;
  selectedGlyphId?: string;
  onGlyphSelect: (glyph: GlyphManifest) => void;
  onInvokeBackground: (glyph: GlyphManifest) => void;
  onInvokeWidget: (glyph: GlyphManifest) => void;
  onQuickEditToggle: (glyph: GlyphManifest, anchorRect: DOMRect) => void;
  quickEditGlyphId?: string | null;
  isEditing: boolean;
  editingName: string;
  onStartEdit: (name: string) => void;
  onEditNameChange: (name: string) => void;
  onSaveName: () => void;
  onCancelEdit: () => void;
  onToggleCollapse: () => void;
  onDelete: () => void;
  iconPickerOpen: boolean;
  onToggleIconPicker: () => void;
  onIconChange: (icon: string) => void;
  isOver: boolean;
}

function FolderSection({
  folder,
  glyphMap,
  selectedGlyphId,
  onGlyphSelect,
  onInvokeBackground,
  onInvokeWidget,
  onQuickEditToggle,
  quickEditGlyphId,
  isEditing,
  editingName,
  onStartEdit,
  onEditNameChange,
  onSaveName,
  onCancelEdit,
  onToggleCollapse,
  onDelete,
  iconPickerOpen,
  onToggleIconPicker,
  onIconChange,
  isOver,
}: FolderSectionProps) {
  // Use sortable for folder reordering (the whole folder is draggable via drag handle)
  const {
    attributes: sortableAttributes,
    listeners: sortableListeners,
    setNodeRef: setSortableRef,
    transform: sortableTransform,
    transition: sortableTransition,
    isDragging: isFolderDragging,
  } = useSortable({
    id: folder.id,
    data: { type: 'folder', folderId: folder.id },
  });
  
  // Use droppable for accepting glyph drops onto the folder header
  const { setNodeRef: setDropRef, isOver: isOverDropZone } = useDroppable({
    id: `${folder.id}-drop`,
    data: { type: 'folder-drop', folderId: folder.id },
  });
  
  const [isHovering, setIsHovering] = useState(false);
  
  const folderGlyphs = folder.glyphIds
    .map(id => glyphMap.get(id))
    .filter((g): g is GlyphManifest => g !== undefined);

  const showDropHighlight = isOver || isOverDropZone;

  const containerStyle: React.CSSProperties = {
    ...folderStyles.container,
    ...(showDropHighlight ? folderStyles.containerOver : {}),
    transform: CSS.Translate.toString(sortableTransform),
    transition: sortableTransition || 'transform 200ms ease',
    opacity: isFolderDragging ? 0.4 : 1,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    willChange: 'transform',
  };

  return (
    <div
      ref={setSortableRef}
      style={containerStyle}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Folder header - droppable zone + sortable handle */}
      <div 
        ref={setDropRef}
        style={{
          ...folderStyles.header,
          ...(showDropHighlight ? { background: 'rgba(0, 255, 255, 0.1)' } : {}),
        }}
      >
        {/* Drag handle for folder reordering */}
        <div 
          {...sortableAttributes}
          {...sortableListeners}
          style={folderStyles.dragHandle}
          title="Drag to reorder folder"
        >
          ⋮⋮
        </div>
        
        <button
          style={folderStyles.collapseBtn}
          onClick={onToggleCollapse}
        >
          {folder.collapsed ? '▶' : '▼'}
        </button>
        
        <div style={{ position: 'relative' }}>
          <button
            style={folderStyles.iconBtn}
            onClick={onToggleIconPicker}
            title="Change folder icon"
          >
            {folder.icon}
          </button>
          {iconPickerOpen && (
            <div style={folderStyles.iconPicker}>
              {FOLDER_ICONS.map(icon => (
                <button
                  key={icon}
                  style={folderStyles.iconOption}
                  onClick={() => onIconChange(icon)}
                >
                  {icon}
                </button>
              ))}
            </div>
          )}
        </div>
        
        {isEditing ? (
          <input
            type="text"
            value={editingName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onBlur={onSaveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveName();
              if (e.key === 'Escape') onCancelEdit();
            }}
            style={folderStyles.nameInput}
            autoFocus
          />
        ) : (
          <span
            style={folderStyles.name}
            onClick={() => onStartEdit(folder.name)}
            title="Click to edit"
          >
            {folder.name}
            {isHovering && <span style={folderStyles.editIcon}>✏️</span>}
          </span>
        )}
        
        <span style={folderStyles.count}>{folderGlyphs.length}</span>
        
        {isHovering && (
          <button
            style={folderStyles.deleteBtn}
            onClick={onDelete}
            title="Delete folder"
          >
            🗑️
          </button>
        )}
      </div>
      
      {/* Folder contents - sortable glyphs */}
      {!folder.collapsed && (
        <SortableContext
          items={folderGlyphs.map(g => g.id)}
          strategy={rectSortingStrategy}
        >
          <div style={folderStyles.glyphs}>
            {folderGlyphs.length === 0 ? (
              <div style={folderStyles.emptyFolder}>
                Drop glyphs here
              </div>
            ) : (
              folderGlyphs.map((glyph, index) => (
                <GlyphCard
                  key={glyph.id}
                  glyph={glyph}
                  isSelected={selectedGlyphId === glyph.id}
                  onClick={() => onGlyphSelect(glyph)}
                  onInvokeBackground={() => onInvokeBackground(glyph)}
                  onInvokeWidget={() => onInvokeWidget(glyph)}
                onQuickEditToggle={onQuickEditToggle}
                hasInputs={Boolean(glyph.inputs?.length)}
                isQuickEditing={quickEditGlyphId === glyph.id}
                  delay={index * 30}
                />
              ))
            )}
          </div>
        </SortableContext>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📦 UNASSIGNED SECTION COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface UnassignedSectionProps {
  glyphs: GlyphManifest[];
  selectedGlyphId?: string;
  onGlyphSelect: (glyph: GlyphManifest) => void;
  onInvokeBackground: (glyph: GlyphManifest) => void;
  onInvokeWidget: (glyph: GlyphManifest) => void;
  onQuickEditToggle: (glyph: GlyphManifest, anchorRect: DOMRect) => void;
  quickEditGlyphId?: string | null;
  isOver: boolean;
}

function UnassignedSection({
  glyphs,
  selectedGlyphId,
  onGlyphSelect,
  onInvokeBackground,
  onInvokeWidget,
  onQuickEditToggle,
  quickEditGlyphId,
  isOver,
}: UnassignedSectionProps) {
  // Use droppable for the unassigned header
  const { setNodeRef: setDropRef, isOver: isOverDropZone } = useDroppable({
    id: 'unassigned-drop-zone',
    data: { type: 'unassigned' },
  });
  
  const [isCollapsed, setIsCollapsed] = useState(false);
  const showDropHighlight = isOver || isOverDropZone;

  console.log(`📥 [UnassignedSection] render:`, {
    glyphCount: glyphs.length,
    isOver,
    isOverDropZone,
    collapsed: isCollapsed,
  });

  return (
    <div
      style={{
        ...folderStyles.container,
        ...(showDropHighlight ? folderStyles.containerOver : {}),
        borderStyle: 'dashed',
      }}
    >
      {/* Header - droppable zone */}
      <div 
        ref={setDropRef}
        style={{
          ...folderStyles.header,
          ...(showDropHighlight ? { background: 'rgba(0, 255, 255, 0.1)' } : {}),
        }}
      >
        <button
          style={folderStyles.collapseBtn}
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {isCollapsed ? '▶' : '▼'}
        </button>
        <span style={folderStyles.iconBtn}>📥</span>
        <span style={folderStyles.name}>Unassigned</span>
        <span style={folderStyles.count}>{glyphs.length}</span>
      </div>
      
      {/* Contents - sortable glyphs */}
      {!isCollapsed && (
        <SortableContext
          items={glyphs.map(g => g.id)}
          strategy={rectSortingStrategy}
        >
          <div style={folderStyles.glyphs}>
            {glyphs.length === 0 ? (
              <div style={folderStyles.emptyFolder}>
                All glyphs are organized into folders
              </div>
            ) : (
              glyphs.map((glyph, index) => (
                <GlyphCard
                  key={glyph.id}
                  glyph={glyph}
                  isSelected={selectedGlyphId === glyph.id}
                  onClick={() => onGlyphSelect(glyph)}
                  onInvokeBackground={() => onInvokeBackground(glyph)}
                  onInvokeWidget={() => onInvokeWidget(glyph)}
                  onQuickEditToggle={onQuickEditToggle}
                  hasInputs={Boolean(glyph.inputs?.length)}
                  isQuickEditing={quickEditGlyphId === glyph.id}
                  delay={index * 30}
                />
              ))
            )}
          </div>
        </SortableContext>
      )}
    </div>
  );
}

const folderStyles: Record<string, React.CSSProperties> = {
  container: {
    marginBottom: '16px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    background: 'rgba(255, 255, 255, 0.02)',
    overflow: 'hidden',
    transition: 'all 0.2s ease',
  },
  containerOver: {
    borderColor: '#00ffff',
    background: 'rgba(0, 255, 255, 0.05)',
    boxShadow: '0 0 20px rgba(0, 255, 255, 0.15)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 16px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  },
  dragHandle: {
    cursor: 'grab',
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: '12px',
    padding: '4px',
    userSelect: 'none',
    touchAction: 'none',
    transition: 'color 0.2s ease',
    letterSpacing: '-2px',
  },
  collapseBtn: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '10px',
    cursor: 'pointer',
    padding: '4px',
    transition: 'color 0.2s ease',
  },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '6px',
    transition: 'background 0.2s ease',
  },
  iconPicker: {
    position: 'absolute',
    top: '100%',
    left: 0,
    zIndex: 100,
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '4px',
    padding: '8px',
    background: 'rgba(15, 10, 25, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '10px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
  },
  iconOption: {
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: '6px',
    padding: '6px',
    fontSize: '16px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  name: {
    flex: 1,
    fontSize: '13px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.85)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  editIcon: {
    fontSize: '11px',
    opacity: 0.4,
  },
  nameInput: {
    flex: 1,
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(0, 255, 255, 0.4)',
    borderRadius: '6px',
    padding: '6px 10px',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    outline: 'none',
    fontFamily: 'inherit',
  },
  count: {
    padding: '2px 8px',
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  deleteBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '4px',
    opacity: 0.5,
    transition: 'opacity 0.2s ease',
  },
  glyphs: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '12px',
    padding: '16px',
    position: 'relative', // Required for proper sorting animation
  },
  emptyFolder: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: '32px 20px',
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: '13px',
    fontStyle: 'italic',
    border: '1px dashed rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
  },
};

const cardStyles: Record<string, React.CSSProperties> = {
  card: {
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    padding: '14px',
    cursor: 'grab',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '120px',
    touchAction: 'none',
    userSelect: 'none',
    // Note: transform and transition are set dynamically via useSortable
  },
  cardDragOverlay: {
    background: 'rgba(0, 255, 255, 0.15)',
    border: '2px solid rgba(0, 255, 255, 0.6)',
    boxShadow: '0 20px 40px rgba(0, 255, 255, 0.3), 0 0 30px rgba(0, 255, 255, 0.2)',
    transform: 'scale(1.05) rotate(2deg)',
    cursor: 'grabbing',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  cardSelected: {
    background: 'rgba(0, 255, 255, 0.05)',
    boxShadow: '0 0 20px rgba(0, 255, 255, 0.1)',
  },
  cardQuickEditing: {
    boxShadow: '0 0 20px rgba(255, 255, 255, 0.3)',
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  cardIcon: {
    fontSize: '18px',
    filter: 'drop-shadow(0 0 4px currentColor)',
  },
  cardTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#ffffff',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  cardPrompt: {
    fontSize: '11px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    color: 'rgba(255, 255, 255, 0.45)',
    margin: '0 0 12px 0',
    lineHeight: 1.4,
  },
  cardActions: {
    display: 'flex',
    gap: '6px',
    marginTop: 'auto',
  },
  bgBtn: {
    flex: 1,
    padding: '8px 10px',
    background: 'rgba(0, 255, 255, 0.1)',
    border: '1px solid rgba(0, 255, 255, 0.3)',
    borderRadius: '8px',
    color: '#00ffff',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
  widgetBtn: {
    flex: 1,
    padding: '8px 10px',
    background: 'rgba(255, 0, 255, 0.1)',
    border: '1px solid rgba(255, 0, 255, 0.3)',
    borderRadius: '8px',
    color: '#ff00ff',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
  quickEditBtn: {
    width: '42px',
    height: '38px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#ffffff',
    fontSize: '16px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
};

const quickEditStyles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'fixed',
    width: 300,
    maxHeight: 420,
    overflowY: 'auto',
    background: 'rgba(10, 10, 20, 0.95)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '16px',
    padding: '16px',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.45)',
    backdropFilter: 'blur(12px)',
    zIndex: 9999,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
    gap: '12px',
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  headerTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  closeBtn: {
    border: 'none',
    background: 'rgba(255, 255, 255, 0.08)',
    color: '#ffffff',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    cursor: 'pointer',
    fontSize: '14px',
    lineHeight: 1,
  },
  footer: {
    marginTop: '8px',
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'right' as const,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 MAIN STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  
  header: {
    padding: '20px 24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  searchWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
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
    color: '#ffffff',
    fontSize: '14px',
    fontFamily: 'inherit',
  },
  clearBtn: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.4)',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '4px',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },
  glyphCount: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  createFolderBtn: {
    padding: '8px 16px',
    background: 'linear-gradient(135deg, rgba(0, 255, 255, 0.1), rgba(255, 0, 255, 0.1))',
    border: '1px solid rgba(0, 255, 255, 0.3)',
    borderRadius: '20px',
    color: '#00ffff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
  newFolderForm: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 16px',
    marginBottom: '16px',
    background: 'rgba(0, 255, 255, 0.05)',
    border: '1px solid rgba(0, 255, 255, 0.2)',
    borderRadius: '12px',
    position: 'relative',
  },
  newFolderIconBtn: {
    background: 'transparent',
    border: '1px dashed rgba(255, 255, 255, 0.3)',
    borderRadius: '8px',
    padding: '8px',
    fontSize: '20px',
    cursor: 'pointer',
  },
  folderIconPicker: {
    position: 'absolute',
    top: '100%',
    left: 0,
    zIndex: 100,
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '4px',
    padding: '10px',
    background: 'rgba(15, 10, 25, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '10px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
    marginTop: '4px',
  },
  folderIconOption: {
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: '6px',
    padding: '8px',
    fontSize: '18px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  newFolderInput: {
    flex: 1,
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(0, 255, 255, 0.3)',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
    fontFamily: 'inherit',
  },
  newFolderSaveBtn: {
    background: 'rgba(0, 255, 128, 0.2)',
    border: '1px solid rgba(0, 255, 128, 0.4)',
    borderRadius: '8px',
    padding: '8px 14px',
    color: '#00ff80',
    fontSize: '16px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  newFolderCancelBtn: {
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '8px',
    padding: '8px 14px',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '16px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  
  content: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  
  glyphsList: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 24px',
  },
  
  loadingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '200px',
    color: 'rgba(255, 255, 255, 0.5)',
    gap: '12px',
  },
  spinner: {
    fontSize: '32px',
    animation: 'spin 1s linear infinite',
  },
  
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '300px',
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '16px',
    opacity: 0.5,
  },
  emptyText: {
    fontSize: '16px',
    color: 'rgba(255, 255, 255, 0.6)',
    margin: '0 0 8px 0',
  },
  emptyHint: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.35)',
    margin: 0,
  },
  
  // Detail panel
  detailPanel: {
    width: '320px',
    borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
    background: 'rgba(0, 0, 0, 0.2)',
    padding: '24px',
    overflowY: 'auto',
    animation: 'fadeIn 0.3s ease',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
  },
  detailCloseBtn: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    background: 'rgba(0, 0, 0, 0.4)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '16px',
    lineHeight: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    marginBottom: '24px',
    paddingRight: '40px',
  },
  iconButton: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '2px dashed rgba(255, 255, 255, 0.2)',
    borderRadius: '12px',
    width: '52px',
    height: '52px',
    fontSize: '28px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    filter: 'drop-shadow(0 0 8px currentColor)',
  },
  iconPicker: {
    position: 'absolute',
    top: '60px',
    left: '0',
    background: 'rgba(15, 5, 25, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '12px',
    padding: '12px',
    zIndex: 100,
    width: '220px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
  },
  iconPickerHeader: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.5)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '10px',
  },
  iconGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '6px',
  },
  iconOption: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid transparent',
    borderRadius: '8px',
    width: '36px',
    height: '36px',
    fontSize: '18px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOptionSelected: {
    background: 'rgba(0, 255, 255, 0.2)',
    borderColor: '#00ffff',
  },
  detailIcon: {
    fontSize: '32px',
    filter: 'drop-shadow(0 0 10px currentColor)',
  },
  detailTitle: {
    margin: '0 0 4px 0',
    fontSize: '18px',
    fontWeight: 600,
    color: '#ffffff',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
  editHint: {
    fontSize: '12px',
    opacity: 0.3,
    transition: 'opacity 0.2s ease',
  },
  nameInput: {
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(0, 255, 255, 0.4)',
    borderRadius: '6px',
    padding: '8px 12px',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 600,
    width: '100%',
    outline: 'none',
    fontFamily: 'inherit',
  },
  detailType: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.5)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  detailSection: {
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.4)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    margin: '0 0 8px 0',
  },
  prompt: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 1.6,
    margin: 0,
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
  },
  promptCollapsible: {
    cursor: 'pointer',
    userSelect: 'none',
  },
  promptToggle: {
    display: 'inline-block',
    marginLeft: '8px',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#00ffff',
  },
  previewContainer: {
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    background: 'rgba(0, 0, 0, 0.2)',
    overflow: 'hidden',
    minHeight: '120px',
  },
  previewFrame: {
    width: '100%',
    height: '260px',
  },
  previewIframe: {
    width: '100%',
    height: '100%',
    borderRadius: '12px',
    background: 'rgba(6, 0, 10, 0.6)',
  },
  previewStatus: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    padding: '32px 12px',
  },
  previewMeta: {
    marginTop: '8px',
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.35)',
  },
  filesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.6)',
    padding: '8px 12px',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: '6px',
  },
  fileIcon: {
    fontSize: '14px',
    opacity: 0.6,
  },
  detailMeta: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.35)',
    marginBottom: '20px',
  },
  bundleToggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '10px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
  },
  bundleInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  bundleIcon: {
    fontSize: '20px',
    filter: 'drop-shadow(0 0 4px rgba(255, 200, 0, 0.3))',
  },
  bundleLabel: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: '2px',
  },
  bundleDescription: {
    display: 'block',
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  bundleToggle: {
    padding: '8px 14px',
    borderRadius: '6px',
    border: 'none',
    fontSize: '10px',
    fontWeight: 700,
    fontFamily: 'inherit',
    letterSpacing: '0.5px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  bundleToggleOn: {
    background: 'rgba(0, 255, 136, 0.2)',
    color: '#00ff88',
    border: '1px solid rgba(0, 255, 136, 0.4)',
    boxShadow: '0 0 12px rgba(0, 255, 136, 0.2)',
  },
  bundleToggleOff: {
    background: 'rgba(255, 255, 255, 0.05)',
    color: 'rgba(255, 255, 255, 0.4)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  inputsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  addInputBtn: {
    background: 'rgba(0, 255, 128, 0.1)',
    border: '1px solid rgba(0, 255, 128, 0.3)',
    borderRadius: '6px',
    padding: '6px 12px',
    color: '#00ff80',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  inputsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  noInputs: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
    padding: '20px',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: '8px',
    border: '1px dashed rgba(255, 255, 255, 0.1)',
  },
  noInputsHint: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.25)',
    marginTop: '8px',
    display: 'block',
  },
  saveInputsBtn: {
    marginTop: '12px',
    padding: '12px',
    background: 'linear-gradient(135deg, rgba(0, 255, 128, 0.15), rgba(0, 200, 100, 0.1))',
    border: '1px solid rgba(0, 255, 128, 0.4)',
    borderRadius: '8px',
    color: '#00ff80',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s ease',
  },
  detailActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: 'auto',
  },
  invokeButtons: {
    display: 'flex',
    gap: '8px',
  },
  backgroundBtn: {
    flex: 1,
    padding: '14px',
    background: 'linear-gradient(135deg, rgba(0, 255, 255, 0.15), rgba(0, 200, 255, 0.1))',
    border: '1px solid rgba(0, 255, 255, 0.4)',
    borderRadius: '12px',
    color: '#00ffff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
  widgetBtn: {
    flex: 1,
    padding: '14px',
    background: 'linear-gradient(135deg, rgba(255, 0, 255, 0.15), rgba(200, 0, 255, 0.1))',
    border: '1px solid rgba(255, 0, 255, 0.4)',
    borderRadius: '12px',
    color: '#ff00ff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
  secondaryBtn: {
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '10px',
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
  dangerBtn: {
    padding: '12px',
    background: 'transparent',
    border: '1px solid rgba(255, 80, 80, 0.3)',
    borderRadius: '10px',
    color: 'rgba(255, 80, 80, 0.7)',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
};

