import type { LoomUIState, LoomUiStatePatch } from './ui-state';

declare global {
  interface LoomAPI {
    loadUIState: () => Promise<LoomUIState | undefined>;
    saveUIState: (patch: LoomUiStatePatch) => Promise<LoomUIState>;
  }
}

export {};

