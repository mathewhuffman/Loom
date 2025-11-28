import type { LoomUIState, LoomUiStatePatch } from '../types/ui-state';

type MergeTarget = Record<string, unknown>;

const isPlainObject = (value: unknown): value is MergeTarget => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const mergePatch = (target: MergeTarget | undefined, patch: MergeTarget): MergeTarget => {
  const base: MergeTarget = isPlainObject(target) ? { ...target } : {};
  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    if (isPlainObject(value)) {
      base[key] = mergePatch(base[key] as MergeTarget | undefined, value);
    } else {
      base[key] = value;
    }
  });
  return base;
};

let pendingPatch: LoomUiStatePatch | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export async function loadUiState(): Promise<LoomUIState | undefined> {
  try {
    if (!window.loom?.loadUIState) {
      return undefined;
    }
    return await window.loom.loadUIState();
  } catch (error) {
    console.error('[UIState] Failed to load UI state', error);
    return undefined;
  }
}

export function queueUiStatePatch(patch: LoomUiStatePatch, debounceMs = 200) {
  if (!window.loom?.saveUIState || !patch) {
    return;
  }

  pendingPatch = pendingPatch
    ? (mergePatch(pendingPatch as MergeTarget, patch as MergeTarget) as LoomUiStatePatch)
    : patch;

  if (flushTimer) {
    clearTimeout(flushTimer);
  }

  flushTimer = setTimeout(() => {
    if (pendingPatch) {
      window.loom!.saveUIState(pendingPatch);
      pendingPatch = null;
    }
    flushTimer = null;
  }, debounceMs);
}

