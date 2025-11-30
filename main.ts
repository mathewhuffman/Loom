// main.ts — LOOM Spatial Shell
// THREE-LAYER ARCHITECTURE: Background (Three.js wallpaper) + Overlay (UI) + Loom Panel (Control Center)
// Ctrl+Alt+S to awaken the Summoner
// Ctrl+Alt+L to open the Loom Panel
// SECURE: All API keys live here, never exposed to renderer

import { app, BrowserWindow, screen, globalShortcut, ipcMain, IpcMainInvokeEvent, Tray, Menu, nativeImage, safeStorage, dialog } from 'electron';
import path from 'path';
import { attach, detach } from 'electron-as-wallpaper';
import fs from 'fs';
import type { LoomUIState, LoomUiStatePatch } from './src/types/ui-state';
import { autoUpdater, UpdateInfo } from 'electron-updater';

// ════════════════════════════════════════════════════════════════════════════
// 🔄 AUTO-UPDATER CONFIGURATION
// ════════════════════════════════════════════════════════════════════════════

interface ChangelogEntry {
  version: string;
  date: string;
  sections: {
    type: 'features' | 'improvements' | 'bugfixes' | 'breaking';
    icon: string;
    title: string;
    items: string[];
  }[];
}

interface UpdateState {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  progress: number;
  error: string | null;
  updateInfo: UpdateInfo | null;
  changelog: ChangelogEntry[];
}

let updateState: UpdateState = {
  checking: false,
  available: false,
  downloading: false,
  downloaded: false,
  progress: 0,
  error: null,
  updateInfo: null,
  changelog: [],
};

// Configure auto-updater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowDowngrade = false;

// Set the feed URL explicitly for GitHub releases
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'mathewhuffman',
  repo: 'Loom',
});

function parseChangelog(): ChangelogEntry[] {
  try {
    // Try to read CHANGELOG.md from the app directory
    const changelogPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'CHANGELOG.md')
      : path.join(__dirname, '..', 'CHANGELOG.md');
    
    if (!fs.existsSync(changelogPath)) {
      log('[Updater] CHANGELOG.md not found at:', changelogPath);
      return [];
    }
    
    const content = fs.readFileSync(changelogPath, 'utf-8');
    const entries: ChangelogEntry[] = [];
    
    // Split by version headers (## [X.X.X])
    const versionRegex = /^## \[(\d+\.\d+\.\d+)\]\s*-?\s*(\d{4}-\d{2}-\d{2})?/gm;
    const matches = [...content.matchAll(versionRegex)];
    
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const version = match[1];
      const date = match[2] || 'Unknown';
      const startIndex = match.index! + match[0].length;
      const endIndex = matches[i + 1]?.index ?? content.length;
      const sectionContent = content.slice(startIndex, endIndex);
      
      const entry: ChangelogEntry = {
        version,
        date,
        sections: [],
      };
      
      // Parse sections (### ✨ New Features, etc.)
      const sectionPatterns = [
        { regex: /### ✨ New Features\n([\s\S]*?)(?=###|$)/i, type: 'features' as const, icon: '✨', title: 'New Features' },
        { regex: /### 🔧 Improvements\n([\s\S]*?)(?=###|$)/i, type: 'improvements' as const, icon: '🔧', title: 'Improvements' },
        { regex: /### 🐛 Bug Fixes\n([\s\S]*?)(?=###|$)/i, type: 'bugfixes' as const, icon: '🐛', title: 'Bug Fixes' },
        { regex: /### 💀 Breaking Changes\n([\s\S]*?)(?=###|$)/i, type: 'breaking' as const, icon: '💀', title: 'Breaking Changes' },
      ];
      
      for (const pattern of sectionPatterns) {
        const sectionMatch = sectionContent.match(pattern.regex);
        if (sectionMatch) {
          const items = sectionMatch[1]
            .split('\n')
            .map(line => line.replace(/^-\s*/, '').trim())
            .filter(line => line.length > 0 && !line.startsWith('#'));
          
          if (items.length > 0) {
            entry.sections.push({
              type: pattern.type,
              icon: pattern.icon,
              title: pattern.title,
              items,
            });
          }
        }
      }
      
      if (entry.sections.length > 0) {
        entries.push(entry);
      }
    }
    
    log('[Updater] Parsed changelog:', entries.length, 'versions');
    return entries;
  } catch (error) {
    log('[Updater] Failed to parse changelog:', error);
    return [];
  }
}

function broadcastUpdateState() {
  const state = {
    ...updateState,
    currentVersion: app.getVersion(),
  };
  
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('updater-state', state);
  }
}

// Auto-updater event handlers
autoUpdater.on('checking-for-update', () => {
  log('[Updater] 🔍 Checking for updates...');
  updateState = { ...updateState, checking: true, error: null };
  broadcastUpdateState();
});

autoUpdater.on('update-available', (info: UpdateInfo) => {
  log('[Updater] 🆕 Update available:', info.version);
  updateState = {
    ...updateState,
    checking: false,
    available: true,
    updateInfo: info,
    changelog: parseChangelog(),
  };
  broadcastUpdateState();
});

autoUpdater.on('update-not-available', (info: UpdateInfo) => {
  log('[Updater] ✅ Already on latest version:', info.version);
  updateState = {
    ...updateState,
    checking: false,
    available: false,
    updateInfo: info,
    changelog: parseChangelog(),
  };
  broadcastUpdateState();
});

autoUpdater.on('download-progress', (progress: { percent: number; bytesPerSecond: number; total: number; transferred: number }) => {
  log('[Updater] ⬇️  Download progress:', Math.round(progress.percent) + '%');
  updateState = {
    ...updateState,
    downloading: true,
    progress: progress.percent,
  };
  broadcastUpdateState();
});

autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
  log('[Updater] ✅ Update downloaded:', info.version);
  updateState = {
    ...updateState,
    downloading: false,
    downloaded: true,
    progress: 100,
    updateInfo: info,
  };
  broadcastUpdateState();
});

autoUpdater.on('error', (error: Error) => {
  log('[Updater] ❌ Error:', error.message);
  updateState = {
    ...updateState,
    checking: false,
    downloading: false,
    error: error.message,
  };
  broadcastUpdateState();
});

// IPC handlers for updater
ipcMain.handle('updater:check', async () => {
  log('[Updater] Manual check triggered');
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, result };
  } catch (error: any) {
    log('[Updater] Check failed:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('updater:download', async () => {
  log('[Updater] Download triggered');
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error: any) {
    log('[Updater] Download failed:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('updater:install', async () => {
  log('[Updater] Install triggered - quitting and installing...');
  // Detach wallpaper before quitting
  detachBackgroundFromDesktop();
  autoUpdater.quitAndInstall(false, true);
  return { success: true };
});

ipcMain.handle('updater:get-state', async () => {
  return {
    ...updateState,
    currentVersion: app.getVersion(),
    changelog: parseChangelog(),
  };
});

ipcMain.handle('updater:get-changelog', async () => {
  return {
    changelog: parseChangelog(),
    currentVersion: app.getVersion(),
  };
});

ipcMain.handle('updater:dismiss', async () => {
  log('[Updater] Update dismissed by user');
  updateState = {
    ...updateState,
    available: false,
  };
  broadcastUpdateState();
  return { success: true };
});

// ════════════════════════════════════════════════════════════════════════════
// 📁 DYNAMIC GLYPH FILE SYSTEM
// ════════════════════════════════════════════════════════════════════════════

const isDev = !app.isPackaged;
const publicPath = path.join(__dirname, '..', isDev ? 'public' : 'dist');

// Path to bundled glyphs in dist (read-only in production, for glyphs shipped with the app)
const distGlyphsPath = path.join(publicPath, 'glyphs', 'dynamic');

function resolveDynamicGlyphPath() {
  if (isDev) {
    return path.join(publicPath, 'glyphs', 'dynamic');
  }
  return path.join(app.getPath('userData'), 'glyphs', 'dynamic');
}

// Ensure dynamic glyph folder exists (must be writable in production)
const dynamicGlyphPath = resolveDynamicGlyphPath();
if (!fs.existsSync(dynamicGlyphPath)) {
  fs.mkdirSync(dynamicGlyphPath, { recursive: true });
  console.log('[LOOM] 📁 Created dynamic glyph directory:', dynamicGlyphPath);
}

// Persistent user-facing glyph library (Documents/LOOM/Glyphs)
function resolveGlyphLibraryPath() {
  try {
    return path.join(app.getPath('documents'), 'LOOM', 'Glyphs');
  } catch (error) {
    console.warn('[LOOM] ⚠️  Failed to resolve Documents path, using userData instead:', error);
    return path.join(app.getPath('userData'), 'Glyphs');
  }
}

const glyphLibraryPath = resolveGlyphLibraryPath();
if (!fs.existsSync(glyphLibraryPath)) {
  fs.mkdirSync(glyphLibraryPath, { recursive: true });
  console.log('[LOOM] 📁 Created glyph library:', glyphLibraryPath);
}

// Log all glyph paths at startup for debugging
console.log('[LOOM] 📁 Glyph paths configured:');
console.log('[LOOM]    dynamicGlyphPath:', dynamicGlyphPath);
console.log('[LOOM]    glyphLibraryPath:', glyphLibraryPath);
console.log('[LOOM]    distGlyphsPath:', distGlyphsPath);
console.log('[LOOM]    isDev:', isDev);

// Log what's in the dist glyphs folder (for debugging production issues)
if (!isDev && fs.existsSync(distGlyphsPath)) {
  try {
    const distGlyphsList = fs.readdirSync(distGlyphsPath);
    console.log(`[LOOM] 📁 Dist glyphs available for migration: ${distGlyphsList.length} items`);
    distGlyphsList.slice(0, 5).forEach(g => console.log(`[LOOM]    - ${g}`));
    if (distGlyphsList.length > 5) {
      console.log(`[LOOM]    ... and ${distGlyphsList.length - 5} more`);
    }
  } catch (err) {
    console.log('[LOOM] ⚠️ Could not list dist glyphs:', err);
  }
} else if (!isDev) {
  console.log('[LOOM] ⚠️ Dist glyphs path does not exist:', distGlyphsPath);
}

// Migration: Copy glyphs from dist to userData on first run (production only)
// This ensures glyphs bundled with the app are available and editable
function migrateDistGlyphsToUserData() {
  if (isDev) return; // Only in production
  
  // Check if dist glyphs folder exists and has content
  if (!fs.existsSync(distGlyphsPath)) {
    console.log('[LOOM] 📁 No dist glyphs to migrate');
    return;
  }
  
  try {
    const distGlyphs = fs.readdirSync(distGlyphsPath, { withFileTypes: true })
      .filter(d => d.isDirectory());
    
    let migratedCount = 0;
    let filesAddedCount = 0;
    
    for (const glyphDir of distGlyphs) {
      const sourceDir = path.join(distGlyphsPath, glyphDir.name);
      const targetDir = path.join(dynamicGlyphPath, glyphDir.name);
      
      // If folder doesn't exist, copy everything
      if (!fs.existsSync(targetDir)) {
        try {
          fs.cpSync(sourceDir, targetDir, { recursive: true });
          migratedCount++;
          console.log(`[LOOM] 📦 Migrated glyph: ${glyphDir.name}`);
        } catch (err) {
          console.warn(`[LOOM] ⚠️ Failed to migrate glyph ${glyphDir.name}:`, err);
        }
      } else {
        // Folder exists - check for missing files (like index.html)
        // This handles the case where manifest was saved but entry file is missing
        try {
          const sourceFiles = fs.readdirSync(sourceDir);
          for (const file of sourceFiles) {
            const sourceFile = path.join(sourceDir, file);
            const targetFile = path.join(targetDir, file);
            
            // Only copy if target file doesn't exist
            if (!fs.existsSync(targetFile) && fs.statSync(sourceFile).isFile()) {
              fs.copyFileSync(sourceFile, targetFile);
              filesAddedCount++;
              console.log(`[LOOM] 📄 Added missing file: ${glyphDir.name}/${file}`);
            }
          }
        } catch (err) {
          console.warn(`[LOOM] ⚠️ Failed to check missing files for ${glyphDir.name}:`, err);
        }
      }
    }
    
    if (migratedCount > 0 || filesAddedCount > 0) {
      console.log(`[LOOM] ✅ Migration complete: ${migratedCount} glyphs migrated, ${filesAddedCount} missing files added`);
    }
  } catch (err) {
    console.warn('[LOOM] ⚠️ Failed to migrate dist glyphs:', err);
  }
}

// Run migration on startup
migrateDistGlyphsToUserData();

// ════════════════════════════════════════════════════════════════════════════
// 🚀 AUTO-START ON LOGIN (AUTO-LAUNCH)
// ════════════════════════════════════════════════════════════════════════════

function getAutoLaunchState() {
  const loginSettings = process.platform === 'win32'
    ? app.getLoginItemSettings({ path: process.execPath })
    : app.getLoginItemSettings();

  return {
    enabled: !!loginSettings.openAtLogin,
    wasOpenedAtLogin: !!loginSettings.wasOpenedAtLogin,
  };
}

ipcMain.handle('auto-launch:get-state', async () => {
  try {
    return { success: true, ...getAutoLaunchState() };
  } catch (error) {
    console.error('[AutoLaunch] Failed to read state:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('auto-launch:set-state', async (_event, enabled: boolean) => {
  try {
    const loginSettings: Electron.Settings = {
      openAtLogin: !!enabled,
      openAsHidden: true,
    };

    if (process.platform === 'win32') {
      loginSettings.path = process.execPath;
    }

    app.setLoginItemSettings(loginSettings);
    const state = getAutoLaunchState();
    console.log(`[AutoLaunch] ${state.enabled ? 'Enabled' : 'Disabled'} (path: ${process.execPath})`);
    return { success: true, ...state };
  } catch (error) {
    console.error('[AutoLaunch] Failed to update state:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 📦 BUNDLED GLYPHS — Pre-installed glyphs that ship with the app
// ════════════════════════════════════════════════════════════════════════════

const bundledGlyphsPath = isDev
  ? path.join(__dirname, '..', 'bundled-glyphs')
  : path.join(process.resourcesPath, 'bundled-glyphs');

const installedBundledGlyphsPath = path.join(app.getPath('userData'), 'installed-bundled-glyphs.json');

interface BundledGlyphManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  bundled: true;
}

function getInstalledBundledGlyphs(): Record<string, string> {
  try {
    if (fs.existsSync(installedBundledGlyphsPath)) {
      return JSON.parse(fs.readFileSync(installedBundledGlyphsPath, 'utf-8'));
    }
  } catch (err) {
    console.warn('[LOOM] ⚠️ Failed to read installed bundled glyphs:', err);
  }
  return {};
}

function saveInstalledBundledGlyphs(installed: Record<string, string>) {
  try {
    fs.writeFileSync(installedBundledGlyphsPath, JSON.stringify(installed, null, 2));
  } catch (err) {
    console.warn('[LOOM] ⚠️ Failed to save installed bundled glyphs:', err);
  }
}

function installBundledGlyphs() {
  if (!fs.existsSync(bundledGlyphsPath)) {
    console.log('[LOOM] 📦 No bundled glyphs folder found');
    return;
  }

  const installedVersions = getInstalledBundledGlyphs();
  let installedCount = 0;
  let updatedCount = 0;

  try {
    const bundledFolders = fs.readdirSync(bundledGlyphsPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const folderName of bundledFolders) {
      const bundledGlyphDir = path.join(bundledGlyphsPath, folderName);
      const manifestPath = path.join(bundledGlyphDir, 'manifest.json');

      if (!fs.existsSync(manifestPath)) {
        console.warn(`[LOOM] ⚠️ Bundled glyph ${folderName} has no manifest.json, skipping`);
        continue;
      }

      try {
        const manifest: BundledGlyphManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const glyphId = manifest.id || `bundled-${folderName}`;
        const currentVersion = manifest.version || '1.0.0';
        const installedVersion = installedVersions[glyphId];

        // Skip if same version already installed
        if (installedVersion === currentVersion) {
          continue;
        }

        // Copy the glyph to user's library
        const targetDir = path.join(glyphLibraryPath, glyphId);
        
        // Remove old version if exists
        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true, force: true });
          updatedCount++;
        } else {
          installedCount++;
        }

        // Copy all files from bundled glyph
        fs.mkdirSync(targetDir, { recursive: true });
        const files = fs.readdirSync(bundledGlyphDir);
        for (const file of files) {
          const srcPath = path.join(bundledGlyphDir, file);
          const destPath = path.join(targetDir, file);
          
          if (fs.statSync(srcPath).isDirectory()) {
            // Recursively copy directories
            fs.cpSync(srcPath, destPath, { recursive: true });
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        }

        // Mark as bundled in the manifest (ensure the flag is set)
        const targetManifestPath = path.join(targetDir, 'manifest.json');
        const targetManifest = JSON.parse(fs.readFileSync(targetManifestPath, 'utf-8'));
        targetManifest.bundled = true;
        targetManifest.bundledVersion = currentVersion;
        fs.writeFileSync(targetManifestPath, JSON.stringify(targetManifest, null, 2));

        installedVersions[glyphId] = currentVersion;
        console.log(`[LOOM] 📦 ${installedVersion ? 'Updated' : 'Installed'} bundled glyph: ${manifest.name} v${currentVersion}`);

      } catch (err) {
        console.error(`[LOOM] ❌ Failed to install bundled glyph ${folderName}:`, err);
      }
    }

    saveInstalledBundledGlyphs(installedVersions);

    if (installedCount > 0 || updatedCount > 0) {
      console.log(`[LOOM] 📦 Bundled glyphs: ${installedCount} installed, ${updatedCount} updated`);
    }

  } catch (err) {
    console.error('[LOOM] ❌ Failed to read bundled glyphs folder:', err);
  }
}

// IPC: Check if a glyph is bundled (exists in bundled-glyphs folder)
ipcMain.handle('glyph:is-bundled', async (_event, glyphId: string) => {
  try {
    // Check if glyph exists in bundled-glyphs folder
    const bundledDir = path.join(bundledGlyphsPath, glyphId);
    const isBundled = fs.existsSync(bundledDir) && fs.existsSync(path.join(bundledDir, 'manifest.json'));
    return { success: true, isBundled };
  } catch (err: any) {
    log('⚠️ Failed to check bundled status:', err);
    return { success: false, isBundled: false, error: err.message };
  }
});

// IPC: Bundle a glyph (copy from user library to bundled-glyphs)
ipcMain.handle('glyph:bundle', async (_event, glyphId: string) => {
  try {
    // Find the glyph in the user's library
    const searchPaths = [glyphLibraryPath, dynamicGlyphPath];
    let sourceDir: string | null = null;
    
    for (const basePath of searchPaths) {
      const glyphDir = path.join(basePath, glyphId);
      if (fs.existsSync(glyphDir) && fs.existsSync(path.join(glyphDir, 'manifest.json'))) {
        sourceDir = glyphDir;
        break;
      }
    }
    
    if (!sourceDir) {
      return { success: false, error: 'Glyph not found in user library' };
    }
    
    // Ensure bundled-glyphs folder exists
    if (!fs.existsSync(bundledGlyphsPath)) {
      fs.mkdirSync(bundledGlyphsPath, { recursive: true });
    }
    
    // Copy glyph to bundled-glyphs folder
    const targetDir = path.join(bundledGlyphsPath, glyphId);
    
    // Remove existing if present
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    
    // Copy the entire glyph folder
    fs.cpSync(sourceDir, targetDir, { recursive: true });
    
    // Update the manifest to mark as bundled with version
    const manifestPath = path.join(targetDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    manifest.bundled = true;
    manifest.version = manifest.version || '1.0.0';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    
    log(`📦 Bundled glyph: ${manifest.name} (${glyphId})`);
    return { success: true, bundledPath: targetDir };
    
  } catch (err: any) {
    log('❌ Failed to bundle glyph:', err);
    return { success: false, error: err.message };
  }
});

// IPC: Unbundle a glyph (remove from bundled-glyphs folder)
ipcMain.handle('glyph:unbundle', async (_event, glyphId: string) => {
  try {
    const bundledDir = path.join(bundledGlyphsPath, glyphId);
    
    if (!fs.existsSync(bundledDir)) {
      return { success: true }; // Already not bundled
    }
    
    // Get name before deleting for logging
    let glyphName = glyphId;
    try {
      const manifestPath = path.join(bundledDir, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        glyphName = manifest.name || glyphId;
      }
    } catch {}
    
    // Remove from bundled-glyphs
    fs.rmSync(bundledDir, { recursive: true, force: true });
    
    log(`📦 Unbundled glyph: ${glyphName} (${glyphId})`);
    return { success: true };
    
  } catch (err: any) {
    log('❌ Failed to unbundle glyph:', err);
    return { success: false, error: err.message };
  }
});

// IPC: Get list of all bundled glyphs
ipcMain.handle('glyph:get-bundled-list', async () => {
  try {
    if (!fs.existsSync(bundledGlyphsPath)) {
      return { success: true, glyphIds: [] };
    }
    
    const folders = fs.readdirSync(bundledGlyphsPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .filter(dirent => fs.existsSync(path.join(bundledGlyphsPath, dirent.name, 'manifest.json')))
      .map(dirent => dirent.name);
    
    return { success: true, glyphIds: folders };
  } catch (err: any) {
    log('⚠️ Failed to get bundled glyphs list:', err);
    return { success: false, glyphIds: [], error: err.message };
  }
});

function ensureDirectoryExists(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function resolveGlyphFilePath(baseDir: string, relativePath: string): string {
  if (!relativePath || typeof relativePath !== 'string') {
    throw new Error('Invalid glyph file path');
  }

  const normalizedBase = path.resolve(baseDir);
  const sanitizedRelative = relativePath.replace(/^[\\/]+/, '');
  const normalizedRelative = path.normalize(sanitizedRelative);
  const resolvedPath = path.resolve(normalizedBase, normalizedRelative);

  const baseLower = normalizedBase.toLowerCase();
  const resolvedLower = resolvedPath.toLowerCase();
  if (!resolvedLower.startsWith(baseLower)) {
    throw new Error(`Invalid glyph file path (path traversal): ${relativePath}`);
  }

  ensureDirectoryExists(path.dirname(resolvedPath));
  return resolvedPath;
}

function slugifyGlyphName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function createGlyphId(manifest: GlyphManifest): string {
  const slug = slugifyGlyphName(manifest.name);
  return slug ? `glyph-${Date.now()}-${slug}` : `glyph-${Date.now()}`;
}

// IPC: Save dynamic glyph to file system
ipcMain.handle('save-dynamic-glyph', async (event, fileName: string, code: string) => {
  const filePath = resolveGlyphFilePath(dynamicGlyphPath, fileName);
  console.log('[LOOM] 📝 Saving dynamic glyph:', filePath);
  fs.writeFileSync(filePath, code);
  return { success: true, path: filePath };
});

// Multi-monitor background windows - one per display
const backgroundWindows: Map<string, BrowserWindow> = new Map();
const backgroundWindowsReady: Map<string, boolean> = new Map();
const backgroundWindowsAttached: Map<string, boolean> = new Map();

let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let interactionEnabled = false;

// Legacy single-window compatibility - points to primary display's background window
let backgroundWindow: BrowserWindow | null = null;
let backgroundDisplayId: string | null = null;
let backgroundDisplayBounds: Electron.Rectangle | null = null;
let backgroundReadyForAttach = false;
let wallpaperAttached = false;

interface BackgroundInteractionConfig {
  enabled: boolean;
  toggleKey: string;
}

interface LoomSettings {
  backgroundInteraction?: Partial<BackgroundInteractionConfig>;
}

const settingsPath = path.join(app.getPath('userData'), 'loom-settings.json');
const DEFAULT_BACKGROUND_INTERACTION: BackgroundInteractionConfig = {
  enabled: false,
  toggleKey: '`',
};
const BACKGROUND_TOGGLE_DEBOUNCE_MS = 250;

let settingsCache: LoomSettings | null = null;
let backgroundInteractionState: BackgroundInteractionConfig = DEFAULT_BACKGROUND_INTERACTION;
let lastBackgroundToggleTs = 0;
let registeredBackgroundAccelerator: string | null = null;
let backgroundMouseCaptured = false;
let backgroundMouseLeaveTimer: ReturnType<typeof setTimeout> | null = null;
const MOUSE_LEAVE_DEBOUNCE_MS = 150;

const log = (...args: any[]) => console.log('[LOOM]', ...args);

function readSettingsFromDisk(): LoomSettings {
  try {
    if (!fs.existsSync(settingsPath)) {
      return {};
    }
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch (error) {
    log('⚠️ Failed to read settings file:', error);
    return {};
  }
}

function getSettings(): LoomSettings {
  if (!settingsCache) {
    settingsCache = readSettingsFromDisk();
  }
  return settingsCache;
}

function persistSettings(next: LoomSettings) {
  try {
    ensureDirectoryExists(path.dirname(settingsPath));
    fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2));
    settingsCache = next;
  } catch (error) {
    log('⚠️ Failed to write settings file:', error);
  }
}

function updateSettings(patch: Partial<LoomSettings>): LoomSettings {
  const updated = { ...getSettings(), ...patch };
  persistSettings(updated);
  return updated;
}

// ════════════════════════════════════════════════════════════════════════════
// 💾 UI STATE PERSISTENCE
// ════════════════════════════════════════════════════════════════════════════

const uiStatePath = path.join(app.getPath('userData'), 'loom-ui-state.json');
let uiStateCache: LoomUIState | null = null;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMergeUiState(target: unknown, patch: unknown): unknown {
  if (Array.isArray(patch)) {
    return patch.map(item => (isPlainObject(item) ? deepMergeUiState({}, item) : item));
  }
  if (isPlainObject(patch)) {
    const base: Record<string, unknown> = isPlainObject(target) ? { ...target } : {};
    Object.entries(patch).forEach(([key, value]) => {
      if (value === undefined) {
        return;
      }
      base[key] = deepMergeUiState(base[key], value);
    });
    return base;
  }
  return patch;
}

function readUiStateFromDisk(): LoomUIState {
  try {
    if (!fs.existsSync(uiStatePath)) {
      return {};
    }
    const raw = fs.readFileSync(uiStatePath, 'utf-8');
    if (!raw.trim()) {
      return {};
    }
    return JSON.parse(raw);
  } catch (error) {
    log('⚠️ Failed to read UI state file:', error);
    return {};
  }
}

function getUiStateSnapshot(): LoomUIState {
  if (!uiStateCache) {
    uiStateCache = readUiStateFromDisk();
  }
  return uiStateCache;
}

function persistUiState(next: LoomUIState) {
  try {
    ensureDirectoryExists(path.dirname(uiStatePath));
    fs.writeFileSync(uiStatePath, JSON.stringify(next, null, 2));
    uiStateCache = next;
  } catch (error) {
    log('⚠️ Failed to write UI state file:', error);
  }
}

function mergeUiState(patch: LoomUiStatePatch | undefined): LoomUIState {
  const current = getUiStateSnapshot();
  const merged = patch ? (deepMergeUiState(current, patch) as LoomUIState) : current;
  persistUiState(merged);
  return merged;
}

function getPersistedWallpaper() {
  return getUiStateSnapshot().background?.wallpaper || null;
}

function restoreBackgroundWallpaper() {
  const wallpaper = getPersistedWallpaper();
  if (
    !wallpaper ||
    !wallpaper.code ||
    !backgroundWindow ||
    backgroundWindow.isDestroyed()
  ) {
    return;
  }
  
  // Load fresh inputs from manifest to ensure config changes persist
  let inputs: Record<string, unknown> = wallpaper.inputs || {};
  let freshCode = wallpaper.code;
  if (wallpaper.glyphId) {
    const freshData = loadFreshGlyphData(wallpaper.glyphId);
    if (freshData) {
      inputs = freshData.inputs;
      freshCode = freshData.code; // Use fresh code too in case it was updated
      log(`📦 [RestoreWallpaper] Loaded fresh inputs for ${wallpaper.glyphId}: ${Object.keys(inputs).length} inputs`);
    }
  }
  
  backgroundWindow.webContents.send('summon-inject', {
    code: freshCode,
    prompt: wallpaper.prompt,
    glyphId: wallpaper.glyphId,
    type: wallpaper.type,
    mode: 'background' as const,
    inputs,
  });
  log('[UIState] Restored persisted wallpaper');
}

function persistWallpaperState(payload: { code: string; prompt?: string; glyphId?: string; type?: string; inputs?: Record<string, unknown> }) {
  if (!payload.code) {
    return;
  }
  mergeUiState({
    background: {
      wallpaper: {
        code: payload.code,
        prompt: payload.prompt,
        glyphId: payload.glyphId,
        type: payload.type,
        inputs: payload.inputs,
        persistedAt: Date.now(),
      },
    },
  });
}

function clearPersistedWallpaper() {
  log('[UIState] Clearing persisted wallpaper');
  mergeUiState({
    background: {
      wallpaper: null,
    },
  });
}

function normalizeBackgroundInteractionConfig(raw?: Partial<BackgroundInteractionConfig>): BackgroundInteractionConfig {
  return {
    enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : DEFAULT_BACKGROUND_INTERACTION.enabled,
    toggleKey:
      typeof raw?.toggleKey === 'string' && raw.toggleKey.trim().length > 0
        ? raw.toggleKey.trim()
        : DEFAULT_BACKGROUND_INTERACTION.toggleKey,
  };
}

backgroundInteractionState = normalizeBackgroundInteractionConfig(getSettings().backgroundInteraction);

function keyToAccelerator(rawKey?: string | null): string | null {
  const normalized = (rawKey || '').trim().toLowerCase();
  if (!normalized) return null;
  const alias: Record<string, string> = {
    '`': '`',
    backquote: '`',
    tilde: '`',
  };
  if (alias[normalized]) return alias[normalized];
  if (normalized.length === 1 && /[a-z]/.test(normalized)) {
    return normalized.toUpperCase();
  }
  return rawKey || null;
}

function refreshBackgroundShortcutBinding() {
  if (!app || !app.isReady()) return;
  if (!globalShortcut) return;
  if (registeredBackgroundAccelerator) {
    globalShortcut.unregister(registeredBackgroundAccelerator);
    registeredBackgroundAccelerator = null;
  }
  const accelerator = keyToAccelerator(backgroundInteractionState.toggleKey);
  if (!accelerator) return;
  try {
    const success = globalShortcut.register(accelerator, () => {
      log('[BackgroundInteraction] global shortcut pressed');
      toggleBackgroundInteraction({ reason: 'global-shortcut' });
    });
    if (success) {
      registeredBackgroundAccelerator = accelerator;
      log('[BackgroundInteraction] shortcut registered', accelerator);
    } else {
      log('⚠️ Failed to register background interaction shortcut', accelerator);
    }
  } catch (error) {
    log('⚠️ Error registering background shortcut', { accelerator, error });
  }
}

// Legacy attach function - now uses multi-window system
function attachBackgroundToDesktop({ force = false }: { force?: boolean } = {}) {
  if (process.platform !== 'win32') return;
  
  // Attach all background windows
  for (const displayId of backgroundWindows.keys()) {
    attachBackgroundWindowToDesktop(displayId, { force });
  }
}

// Legacy detach function - now uses multi-window system
function detachBackgroundFromDesktop() {
  if (process.platform !== 'win32') return;
  
  // Detach all background windows
  for (const displayId of backgroundWindows.keys()) {
    detachBackgroundWindowFromDesktop(displayId);
  }
}

function broadcastBackgroundInteractionState() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('background-interaction-update', backgroundInteractionState);
  }
  // Broadcast to ALL background windows
  for (const win of backgroundWindows.values()) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('background-interaction-update', backgroundInteractionState);
    }
  }
}

function applyBackgroundInteractionState({ reason }: { reason?: string } = {}) {
  const enabled = backgroundInteractionState.enabled;
  log('[BackgroundInteraction] apply', { enabled, reason });

  // Apply to ALL background windows
  for (const win of backgroundWindows.values()) {
    if (win && !win.isDestroyed()) {
      try {
        if (enabled) {
          win.setIgnoreMouseEvents(false);
          if (typeof win.setFocusable === 'function') {
            win.setFocusable(true);
          }
          win.webContents.focus();
        } else {
          win.setIgnoreMouseEvents(true, { forward: true });
          if (typeof win.setFocusable === 'function') {
            win.setFocusable(false);
          }
          if (win.isFocused()) {
            win.blur();
          }
        }
      } catch (error) {
        log('⚠️ Failed to apply background interaction state', error);
      }
    }
  }
  
  // Re-attach all windows
  attachBackgroundToDesktop({ force: true });

  if (backgroundMouseLeaveTimer) {
    clearTimeout(backgroundMouseLeaveTimer);
    backgroundMouseLeaveTimer = null;
  }
  backgroundMouseCaptured = enabled;

  broadcastBackgroundInteractionState();
}

function setBackgroundInteractionConfig(
  next: BackgroundInteractionConfig,
  { reason }: { reason?: string } = {}
) {
  backgroundInteractionState = next;
  updateSettings({ backgroundInteraction: next });
  applyBackgroundInteractionState({ reason });
  refreshBackgroundShortcutBinding();
  return backgroundInteractionState;
}

function updateBackgroundInteractionConfig(
  patch: Partial<BackgroundInteractionConfig>,
  { reason }: { reason?: string } = {}
) {
  const next = normalizeBackgroundInteractionConfig({ ...backgroundInteractionState, ...patch });
  return setBackgroundInteractionConfig(next, { reason });
}

function setBackgroundInteractionEnabledFlag(enabled: boolean, { reason }: { reason?: string } = {}) {
  return updateBackgroundInteractionConfig({ enabled }, { reason });
}

function toggleBackgroundInteraction({ reason }: { reason?: string } = {}) {
  const now = Date.now();
  if (now - lastBackgroundToggleTs < BACKGROUND_TOGGLE_DEBOUNCE_MS) {
    log('[BackgroundInteraction] toggle ignored (debounce)', { reason });
    return backgroundInteractionState;
  }
  lastBackgroundToggleTs = now;
  return setBackgroundInteractionEnabledFlag(!backgroundInteractionState.enabled, { reason });
}

// ════════════════════════════════════════════════════════════════════════════
// 🔧 DIAGNOSTIC IPC HANDLERS
// ════════════════════════════════════════════════════════════════════════════

ipcMain.handle('get-all-windows', () => {
  return BrowserWindow.getAllWindows().map(w => ({
    id: w.id,
    title: w.getTitle(),
    focused: w.isFocused(),
    visible: w.isVisible(),
    bounds: w.getBounds(),
  }));
});

// Direct summon endpoint (invoke-style, returns result)
ipcMain.handle('summon-glyph-direct', async (event: IpcMainInvokeEvent, prompt: string) => {
  log('🎯 summon-glyph-direct invoked:', prompt);
  
  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKeys.grok || ''}`
      },
      body: JSON.stringify({
        model: 'grok-3-fast',
        messages: [
          { role: 'system', content: GLYPH_SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(prompt) }
        ],
        stream: false
      })
    });
    
    const data = await response.json();
    log('🎯 Direct summon response received');
    return data.choices?.[0]?.message?.content || 'No response';
  } catch (error) {
    log('❌ Direct summon error:', error);
    return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 🔐 API KEY MANAGEMENT — Secure storage in main process
// ════════════════════════════════════════════════════════════════════════════

interface ApiKeys {
  grok?: string;
  gemini?: string;
  openai?: string;
}

function loadApiKeys(): ApiKeys {
  // Try loading from environment variables first
  const keys: ApiKeys = {
    grok: process.env.GROK_API_KEY || process.env.XAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  };

  // Priority 1: Load from secure storage (Windows DPAPI encrypted) - HIGHEST PRIORITY
  // This is the recommended way to store API keys via Settings UI
  try {
    const secureKeys = loadLlmApiKeysFromSecureStorage();
    if (secureKeys.grok) keys.grok = secureKeys.grok;
    if (secureKeys.gemini) keys.gemini = secureKeys.gemini;
    if (secureKeys.openai) keys.openai = secureKeys.openai;
  } catch (err) {
    log('⚠️ Failed to load from secure storage:', err);
  }

  // Priority 2: Try loading from a local config file (gitignored) - fallback
  const configPath = path.join(app.getPath('userData'), 'api-keys.json');
  if (fs.existsSync(configPath)) {
    try {
      const fileKeys = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      // Only use file keys if secure storage didn't have them
      if (!keys.grok && fileKeys.grok) keys.grok = fileKeys.grok;
      if (!keys.gemini && fileKeys.gemini) keys.gemini = fileKeys.gemini;
      if (!keys.openai && fileKeys.openai) keys.openai = fileKeys.openai;
      log('🔑 Loaded API keys from config file (fallback)');
    } catch (err) {
      log('⚠️ Failed to load API keys config:', err);
    }
  }

  // Priority 3: Also try loading from project root .env or api-keys.json - development fallback
  const projectConfigPath = path.join(__dirname, '..', 'api-keys.json');
  if (fs.existsSync(projectConfigPath)) {
    try {
      const fileKeys = JSON.parse(fs.readFileSync(projectConfigPath, 'utf-8'));
      // Only use file keys if not already set
      if (!keys.grok && fileKeys.grok) keys.grok = fileKeys.grok;
      if (!keys.gemini && fileKeys.gemini) keys.gemini = fileKeys.gemini;
      if (!keys.openai && fileKeys.openai) keys.openai = fileKeys.openai;
      log('🔑 Loaded API keys from project config (fallback)');
    } catch (err) {
      log('⚠️ Failed to load project API keys config:', err);
    }
  }

  return keys;
}

// API keys will be loaded after app is ready (needs safeStorage)
let apiKeys: ApiKeys = {};

// ════════════════════════════════════════════════════════════════════════════
// 🔑 LLM API KEY SECURE STORAGE — Windows DPAPI encrypted
// ════════════════════════════════════════════════════════════════════════════

const llmApiKeysPath = path.join(app.getPath('userData'), 'llm-api-keys.enc');

function loadLlmApiKeysFromSecureStorage(): ApiKeys {
  try {
    if (fs.existsSync(llmApiKeysPath) && safeStorage.isEncryptionAvailable()) {
      const encryptedBuffer = fs.readFileSync(llmApiKeysPath);
      const decrypted = safeStorage.decryptString(encryptedBuffer);
      const keys = JSON.parse(decrypted);
      log('🔐 Loaded LLM API keys from secure storage');
      return keys;
    }
  } catch (err) {
    log('⚠️ Failed to load LLM API keys from secure storage:', err);
  }
  return {};
}

function saveLlmApiKeysToSecureStorage(keys: ApiKeys): boolean {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      log('⚠️ safeStorage encryption not available for LLM API keys');
      return false;
    }
    const encrypted = safeStorage.encryptString(JSON.stringify(keys));
    fs.writeFileSync(llmApiKeysPath, encrypted);
    log('🔐 LLM API keys encrypted and saved to secure storage');
    return true;
  } catch (err) {
    log('❌ Failed to save LLM API keys to secure storage:', err);
    return false;
  }
}

// Reload API keys (called when keys are updated from UI)
function reloadApiKeys(): void {
  apiKeys = loadApiKeys();
  log('🔑 API keys reloaded', {
    grok: apiKeys.grok ? '✓' : '✗',
    gemini: apiKeys.gemini ? '✓' : '✗',
    openai: apiKeys.openai ? '✓' : '✗',
  });
}

// ════════════════════════════════════════════════════════════════════════════
// 🧙 SUMMONER ENGINE — LLM streaming in main process
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// 🧙 GLYPH BUNDLE SYSTEM — Multi-file manifest with auto-refinement
// ════════════════════════════════════════════════════════════════════════════

interface GlyphInput {
  id: string;
  type: 'string' | 'apiKey' | 'file' | 'toggle' | 'select' | 'multiselect' | 'range' | 'color';
  label: string;
  description?: string;
  required?: boolean;
  // Type-specific properties
  inputType?: string;
  placeholder?: string;
  defaultValue?: unknown;
  value?: unknown;
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
}

interface GlyphManifest {
  name: string;
  type?: string; // Optional - no longer enforced, kept for backwards compatibility
  entry?: string;
  prompt?: string;
  icon?: string;
  inputs?: GlyphInput[];
  files: Record<string, string>;
  folderId?: string; // For folder-based organization
  linkedKeys?: string[]; // IDs of user keys linked to this glyph (from secure key vault)
}

// ════════════════════════════════════════════════════════════════════════════
// 💬 CHAT SYSTEM PROMPT — For conversational mode (no glyph generation)
// ════════════════════════════════════════════════════════════════════════════

const CHAT_SYSTEM_PROMPT = `You are LOOM — a helpful AI assistant for creative coding and desktop customization.

You are embedded in the LOOM application, which allows users to:
- Create visual "glyphs" (interactive HTML/CSS/JS widgets) for their desktop
- Customize their desktop wallpaper with animated backgrounds
- Manage API keys securely for their glyphs to use

In this chat mode, you are having a CONVERSATION. Do NOT generate code or glyphs.
Instead, be helpful, friendly, and informative. Answer questions about:
- How LOOM works and what features it has
- Creative coding concepts (HTML, CSS, JavaScript, WebGL, Canvas, Three.js)
- Ideas for glyphs and visualizations
- Troubleshooting and debugging help
- General programming questions

If the user attaches glyphs, you'll receive metadata blocks in the format:
<<<ATTACHMENT_META>>>
{ "glyphId": "...", "name": "..." }
<<<END_ATTACHMENT_META>>>
followed by manifest/file sections. Use these attachments as shared context when reasoning about existing glyphs.

Keep responses conversational and concise. Use markdown formatting when helpful.
If the user wants to CREATE something, suggest they switch to "Summon" mode.`;

const GLYPH_SYSTEM_PROMPT = `You are LOOM — a code generator for standalone HTML/CSS/JS glyphs that run inside sandboxed iframes.

═══════════════════════════════════════════════════════════════════════════════
📋 OUTPUT FORMAT — Use these exact markers to structure your output:
═══════════════════════════════════════════════════════════════════════════════

You MUST output in this EXACT format with these markers. NO JSON wrapper, NO markdown.

1. Start with <<<MANIFEST>>> containing the glyph metadata as JSON
2. Then output each file with <<<FILE:filename>>> markers
3. End with <<<END>>>

EXAMPLE OUTPUT:
<<<MANIFEST>>>
{
  "name": "Cyber Particles",
  "icon": "✨",
  "entry": "index.html",
  "inputs": [
    {"id": "particleCount", "type": "range", "label": "Particles", "min": 100, "max": 5000, "defaultValue": 1000}
  ]
}
<<<END_MANIFEST>>>
<<<FILE:index.html>>>
<!DOCTYPE html>
<html>
<head>...</head>
<body>...</body>
</html>
<<<END_FILE>>>
<<<END>>>

CRITICAL RULES:
- Start IMMEDIATELY with <<<MANIFEST>>> - no preamble text
- Put ALL metadata (name, icon, inputs, entry) in the MANIFEST section as valid JSON
- Each file gets its own <<<FILE:filename>>> section
- End EVERY output with <<<END>>>
- NO markdown code fences, NO explanatory text outside the markers

DESIGN CONSIDERATIONS:
- Glyphs should be designed to work as BOTH full-screen backgrounds AND resizable widgets.
- Use responsive design: scale with window.innerWidth/Height so content adapts to any size.
- Use percentage-based layouts or viewport units (vw, vh) for flexibility.

═══════════════════════════════════════════════════════════════════════════════
⚠️ CRITICAL: DYNAMIC INPUTS — YOU MUST DEFINE INPUTS IN THE MANIFEST!
═══════════════════════════════════════════════════════════════════════════════

When the user requests ANY configurable value, API key, token, setting, or external service:
1. You MUST add an entry to the "inputs" array in the manifest
2. The code accesses these via window.GLYPH_INPUTS
3. NEVER leave inputs as an empty array if the glyph needs configuration!

INPUT TYPES (choose the appropriate one):
- "apiKey": For API keys, tokens, secrets (REQUIRED for GitHub, OpenWeather, Spotify, etc.)
  Example: { "id": "githubToken", "type": "apiKey", "label": "GitHub Token", "service": "github", "required": true }
  
- "string": Text input (inputType: "text"|"textarea"|"url"|"email"|"number")
  Example: { "id": "repository", "type": "string", "label": "Repository", "placeholder": "owner/repo", "defaultValue": "facebook/react" }
  
- "select": Single-select dropdown
  Example: { "id": "prState", "type": "select", "label": "PR State", "options": [{"value": "open", "label": "Open"}, {"value": "closed", "label": "Closed"}], "defaultValue": "open" }
  
- "toggle": Boolean on/off switch
  Example: { "id": "showDrafts", "type": "toggle", "label": "Show Drafts", "defaultValue": false }
  
- "range": Numeric slider (min, max, step, unit)
  Example: { "id": "refreshInterval", "type": "range", "label": "Refresh (sec)", "min": 30, "max": 300, "defaultValue": 60 }
  
- "color": Color picker
  Example: { "id": "accentColor", "type": "color", "label": "Accent Color", "defaultValue": "#00ffff" }
  
- "file": File upload (accept: MIME types)
  Example: { "id": "configFile", "type": "file", "label": "Config File", "accept": ".json" }
  
- "multiselect": Multi-select dropdown
  Example: { "id": "labels", "type": "multiselect", "label": "Filter Labels", "options": [...] }

EXAMPLE — GitHub PR Widget manifest with REQUIRED inputs:
{
  "name": "GitHub PRs",
  "icon": "🐙",
  "inputs": [
    { "id": "githubToken", "type": "apiKey", "label": "GitHub Token", "service": "github", "required": true, "description": "Personal access token with repo scope" },
    { "id": "repository", "type": "string", "label": "Repository", "placeholder": "owner/repo", "defaultValue": "facebook/react" },
    { "id": "prState", "type": "select", "label": "PR State", "options": [{"value": "open", "label": "Open"}, {"value": "closed", "label": "Closed"}, {"value": "all", "label": "All"}], "defaultValue": "open" }
  ],
  "entry": "index.html",
  "files": { "index.html": "..." }
}

USING INPUTS IN CODE — Access via window.GLYPH_INPUTS:
  const inputs = window.GLYPH_INPUTS || {};
  const TOKEN = inputs.githubToken;  // Will be the actual token value
  const REPO = inputs.repository || 'facebook/react';
  
  if (!TOKEN) {
    // Show error state - user hasn't configured the token yet
  }

═══════════════════════════════════════════════════════════════════════════════

RULES FOR index.html:
1. Provide a COMPLETE HTML document with <head>, <style>, and <body>.
2. Set body/html to margin:0; padding:0; width/height:100%; background transparent.
3. Use inline CSS + JavaScript; no build tools, no React, no bundlers.
4. You may import CDN modules inside <script type="module">. Example:
   <script type="module">
     import * as THREE from 'https://esm.sh/three@0.168.0';
   </script>
5. Prefer WebGL/Canvas/Shader/Tween effects. For UI glyphs you can use DOM + CSS animations.
6. Keep all assets self-contained (SVG gradients, noise shaders, etc.) or load from public HTTPS URLs only.
7. If interactivity is requested, add real event listeners (mousemove, keydown, etc.) with cleanup.
8. Ensure the experience scales with window.innerWidth/Height so the iframe can be resized.

═══════════════════════════════════════════════════════════════════════════════
📂 FILE SYSTEM ACCESS — Read local files and directories
═══════════════════════════════════════════════════════════════════════════════

Glyphs can read files from the user's computer using these APIs (available on window.loom):

1. READ A FILE:
   const result = await window.loom.readLocalFile('C:/path/to/file.txt');
   if (result.success) {
     if (result.isDirectory) {
       // It's a directory - result.files contains the listing
       console.log(result.files); // [{name, path, isDirectory, size, modified}, ...]
     } else {
       // It's a file - result.content contains the text (or base64 for binary)
       console.log(result.content);
       console.log(result.extension); // '.txt', '.json', etc.
       console.log(result.size);
       console.log(result.modified);
     }
   } else {
     console.error(result.error);
   }

2. LIST A DIRECTORY:
   const dir = await window.loom.listDirectory('C:/Users/Documents');
   if (dir.success) {
     console.log(dir.path);   // Full path
     console.log(dir.parent); // Parent directory path (for navigation)
     console.log(dir.files);  // [{name, path, isDirectory, size, modified}, ...]
   }

3. GET COMMON PATHS:
   const paths = await window.loom.getSystemPaths();
   // paths.home     - User's home directory
   // paths.desktop  - Desktop folder
   // paths.documents - Documents folder  
   // paths.downloads - Downloads folder
   // paths.cwd      - Current working directory

USE CASES:
- File browsers / explorers
- Code viewers / editors
- Log file viewers
- Document preview widgets
- Directory tree visualizers
- Any glyph that needs to read user files

IMPORTANT: These APIs bypass CORS restrictions since they go through Electron's main process.
Do NOT use fetch() for local files - use window.loom.readLocalFile() instead.

═══════════════════════════════════════════════════════════════════════════════
🔐 USER KEY VAULT — Secure API keys and credentials linked to glyphs
═══════════════════════════════════════════════════════════════════════════════

Users have a secure key vault where they store API keys, tokens, and credentials.
When creating glyphs that need external API access (GitHub, OpenWeather, Spotify, etc.):

1. ADD AN INPUT OF TYPE "apiKey" in the manifest for each key the glyph needs
2. If the user mentions they want to use a specific key from their vault, 
   we will automatically link it and inject it into window.GLYPH_INPUTS

The manifest supports a "linkedKeys" array that references user vault key IDs:
{
  "name": "GitHub Dashboard",
  "linkedKeys": ["github-token", "backup-token"],  // Keys from user's vault
  "inputs": [
    { "id": "githubToken", "type": "apiKey", "label": "GitHub Token", "service": "github", "required": true }
  ],
  ...
}

IMPORTANT RULES FOR API KEYS:
- Always create an apiKey input in the "inputs" array for any secret/token
- The input ID should be descriptive (e.g., "githubToken", "openweatherKey")
- Set "required": true for essential API keys
- Include a "description" explaining what scope/permissions are needed
- Access in code via: const token = window.GLYPH_INPUTS.githubToken;

Example with multiple keys:
{
  "inputs": [
    { "id": "githubToken", "type": "apiKey", "label": "GitHub Token", "service": "github", "required": true, "description": "Personal access token with repo scope" },
    { "id": "slackWebhook", "type": "apiKey", "label": "Slack Webhook", "service": "slack", "description": "Webhook URL for notifications" }
  ]
}

═══════════════════════════════════════════════════════════════════════════════
🚫 SANDBOXED ENVIRONMENT — All functionality MUST stay inside the iframe
═══════════════════════════════════════════════════════════════════════════════

Glyphs run in sandboxed iframes. You MUST NOT attempt to break out of the iframe context:

❌ FORBIDDEN — Never use any of these:
- window.open() or any method that opens new browser windows/tabs
- Links with target="_blank" or any target that opens external windows
- window.location.href = ... or any navigation that leaves the iframe
- window.parent navigation or attempts to control the parent window
- Popups, alerts that block the UI, or confirm dialogs
- Any external redirects or navigation away from the glyph

✅ REQUIRED — All functionality must:
- Render entirely within the iframe's boundaries
- Handle all interactions (clicks, forms, etc.) without leaving the iframe
- Display results, errors, and feedback inline within the glyph itself
- Use fetch() for API calls and display results in the glyph UI

If you need to show a link or reference an external URL, display it as text the user can copy,
or style it as a non-functional visual element. NEVER make it clickable to open a new window.

═══════════════════════════════════════════════════════════════════════════════

Be bold, animated, and optimized for real-time rendering.`;
const INTERACTIVE_KEYWORDS = [
  'interactive',
  'interact',
  'control',
  'controls',
  'wasd',
  'keyboard',
  'mouse',
  'click',
  'drag',
  'pan',
  'zoom',
  'orbit',
  'drive',
  'move around',
  'fly',
  'game',
  'playable',
  'input',
];

function buildUserPrompt(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase();
  const needsInteractivity = INTERACTIVE_KEYWORDS.some(keyword => lowerPrompt.includes(keyword));
  
  const interactivityInstructions = needsInteractivity
    ? `
IMPORTANT: The user explicitly asked for interactivity. Implement real input handling:
- Add keyboard/mouse listeners inside <script> with addEventListener + cleanup.
- Track mutable state (keys pressed, pointer positions) in module-level variables.
- Animate the scene responsively (move camera/meshes/shaders) in response to that state.
- Provide clear visual feedback that the controls are active.`
    : '';
  
  return `Create a glyph for: "${prompt}"
${interactivityInstructions}

Return ONLY the JSON manifest with entry "index.html" and full HTML content.`;
}

function buildRefinementPrompt(originalPrompt: string, code: string, error: string): string {
  return `The previous code had an error. Fix it.

ORIGINAL REQUEST: "${originalPrompt}"

ERROR: ${error}

BROKEN CODE:
${code.slice(0, 1500)}

Return the FIXED JSON manifest. Make sure the HTML document is complete (doctype, head, styles, scripts), all variables are defined before use, and any external imports use valid HTTPS CDNs.

Return ONLY the corrected JSON manifest.`;
}

// ════════════════════════════════════════════════════════════════════════════
// 🤖 AI MODELS CONFIGURATION
// ════════════════════════════════════════════════════════════════════════════

interface AIModelConfig {
  id: string;
  provider: 'grok' | 'gemini' | 'openai';
  label: string;
  modelName: string;
  icon: string;
}

const AI_MODELS: Record<string, AIModelConfig> = {
  // xAI Grok models
  'grok-4.1-fast-reasoning':   { id: 'grok-4.1-fast-reasoning',   provider: 'grok', label: 'Grok 4.1 Fast Reasoning',   modelName: 'grok-4.1-fast-reasoning', icon: '🚀' },
  'grok-code-fast-1':          { id: 'grok-code-fast-1',          provider: 'grok', label: 'Grok Code Fast',            modelName: 'grok-code-fast-1', icon: '💻' },
  'grok-4-fast-reasoning':     { id: 'grok-4-fast-reasoning',     provider: 'grok', label: 'Grok 4 Fast Reasoning',     modelName: 'grok-4-fast-reasoning', icon: '⚡' },
  'grok-4-fast-non-reasoning': { id: 'grok-4-fast-non-reasoning', provider: 'grok', label: 'Grok 4 Fast',               modelName: 'grok-4-fast-non-reasoning', icon: '🏎️' },
  'grok-3-mini':               { id: 'grok-3-mini',               provider: 'grok', label: 'Grok 3 Mini',               modelName: 'grok-3-mini', icon: '🤖' },
  'grok-3':                    { id: 'grok-3',                    provider: 'grok', label: 'Grok 3',                    modelName: 'grok-3', icon: '🤖' },
  
  // Gemini (Google) models
  'gemini-3':                  { id: 'gemini-3',                  provider: 'gemini', label: 'Gemini 3 Pro',            modelName: 'gemini-3-pro-preview', icon: '🌟' },
  'gemini-2.0-flash':          { id: 'gemini-2.0-flash',          provider: 'gemini', label: 'Gemini 2.0 Flash',        modelName: 'gemini-2.0-flash', icon: '✨' },
  'gemini-1.5-pro':            { id: 'gemini-1.5-pro',            provider: 'gemini', label: 'Gemini 1.5 Pro',          modelName: 'gemini-1.5-pro', icon: '💎' },
  
  // OpenAI / GPT models
  'gpt-4o':                    { id: 'gpt-4o',                    provider: 'openai', label: 'GPT-4o',                  modelName: 'gpt-4o', icon: '🧠' },
  'gpt-4o-mini':               { id: 'gpt-4o-mini',               provider: 'openai', label: 'GPT-4o Mini',             modelName: 'gpt-4o-mini', icon: '🧠' },
  'gpt-4-turbo':               { id: 'gpt-4-turbo',               provider: 'openai', label: 'GPT-4 Turbo',             modelName: 'gpt-4-turbo', icon: '🚀' },
  'o1':                        { id: 'o1',                        provider: 'openai', label: 'o1 (Reasoning)',          modelName: 'o1', icon: '🔮' },
  'o1-mini':                   { id: 'o1-mini',                   provider: 'openai', label: 'o1 Mini',                 modelName: 'o1-mini', icon: '🔮' },
};

// Default models for each provider (used for fallback)
const DEFAULT_MODELS = {
  gemini: 'gemini-3',
  grok: 'grok-3', // Default to Gemini 3 Pro
  openai: 'gpt-4o-mini',
};

const PROVIDER_ORDER = ['gemini', 'grok', 'openai'];
const MODEL_PRIORITY: Record<string, number> = {
  'gemini-3': 0,
  'gemini-2.0-flash': 1,
  'gemini-1.5-pro': 2,
  'grok-4.1-fast-reasoning': 0,
  'grok-code-fast-1': 1,
  'grok-4-fast-reasoning': 2,
  'grok-4-fast-non-reasoning': 3,
  'grok-3': 4,
  'grok-3-mini': 5,
  'gpt-4o': 0,
  'gpt-4o-mini': 1,
  'gpt-4-turbo': 2,
  'o1': 3,
  'o1-mini': 4,
};

// Streaming LLM call to xAI Grok
async function* streamGrok(prompt: string, modelName: string = 'grok-3'): AsyncGenerator<string> {
  if (!apiKeys.grok) throw new Error('Grok API key not configured');

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKeys.grok}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: GLYPH_SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(prompt) },
      ],
      stream: true,
      temperature: 0.7,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    throw new Error(`Grok API error: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            yield content;
          }
        } catch {
          // Ignore parse errors for incomplete chunks
        }
      }
    }
  }
}

// Streaming LLM call to Gemini
async function* streamGemini(prompt: string, modelName: string = 'gemini-2.0-flash'): AsyncGenerator<string> {
  if (!apiKeys.gemini) throw new Error('Gemini API key not configured');

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?key=${apiKeys.gemini}&alt=sse`;
  log(`[Gemini] 🌐 Calling API with model: ${modelName}`);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: GLYPH_SYSTEM_PROMPT + '\n\n' + buildUserPrompt(prompt) }],
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 30000, 
      },
    }),
  });

  if (!response.ok) {
    // Try to get more error details
    let errorBody = '';
    try {
      errorBody = await response.text();
      log(`[Gemini] ❌ API Error Response: ${errorBody}`);
    } catch (e) {
      log(`[Gemini] ❌ Could not read error body`);
    }
    throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorBody.slice(0, 200)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let totalChars = 0;
  let chunkCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      log(`[Gemini] ✅ Stream complete: ${chunkCount} chunks, ${totalChars} total chars`);
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const rawData = line.slice(6);
          const data = JSON.parse(rawData);
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) {
            totalChars += text.length;
            chunkCount++;
            yield text;
          }
          // Check for errors in the response
          if (data?.error) {
            log(`[Gemini] ❌ API returned error in stream: ${JSON.stringify(data.error)}`);
          }
          // Check for finish reason
          const finishReason = data?.candidates?.[0]?.finishReason;
          if (finishReason && finishReason !== 'STOP') {
            log(`[Gemini] ⚠️ Unusual finish reason: ${finishReason}`);
          }
        } catch (parseErr) {
          // Log parse errors for debugging
          if (line.trim() && !line.includes('[DONE]')) {
            log(`[Gemini] ⚠️ Parse error on line: ${line.slice(0, 100)}`);
          }
        }
      }
    }
  }
  
  if (totalChars === 0) {
    log(`[Gemini] ⚠️ WARNING: Stream completed with 0 characters!`);
  }
}

// Streaming LLM call to OpenAI
async function* streamOpenAI(prompt: string, modelName: string = 'gpt-4o-mini'): AsyncGenerator<string> {
  if (!apiKeys.openai) throw new Error('OpenAI API key not configured');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKeys.openai}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: GLYPH_SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(prompt) },
      ],
      stream: true,
      temperature: 0.7,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            yield content;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }
}

// Provider streaming functions
const PROVIDER_STREAMS: Record<string, (prompt: string, modelName: string) => AsyncGenerator<string>> = {
  grok: streamGrok,
  gemini: streamGemini,
  openai: streamOpenAI,
};

interface GlyphEmbedData {
  code: string;
  glyphId: string;
  glyphName: string;
}

interface ChatGlyphAttachmentPayload {
  attachmentId?: string;
  glyphId: string;
  name?: string;
  icon?: string;
  llmPayload?: string;
  previewHtml?: string;
  attachedAt?: number;
}

interface RendererChatMessagePayload {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isSummoning?: boolean;
  glyphId?: string;
  glyphEmbed?: GlyphEmbedData;
  glyphAttachments?: ChatGlyphAttachmentPayload[];
}

type ProviderChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const MAX_CHAT_CONTEXT_MESSAGES = 24;
const MAX_CHAT_CONTEXT_CHARS = 12000;

function trimChatHistory(history: RendererChatMessagePayload[]): RendererChatMessagePayload[] {
  if (!history || history.length === 0) return [];
  const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
  const trimmed: RendererChatMessagePayload[] = [];
  let totalChars = 0;

  for (let i = sorted.length - 1; i >= 0; i--) {
    const entry = sorted[i];
    const basis = entry?.glyphEmbed?.code || entry?.content || '';
    trimmed.push(entry);
    totalChars += basis.length;
    const attachmentChars = entry?.glyphAttachments?.reduce((sum, attachment) => {
      return sum + (attachment.llmPayload?.length || 0);
    }, 0) ?? 0;
    totalChars += attachmentChars;

    if (trimmed.length >= MAX_CHAT_CONTEXT_MESSAGES) break;
    if (trimmed.length > 0 && totalChars >= MAX_CHAT_CONTEXT_CHARS) break;
  }

  return trimmed.reverse();
}

function formatHistoryEntryForProvider(entry: RendererChatMessagePayload): ProviderChatMessage | null {
  if (!entry) return null;

  if (entry.isSummoning && entry.role === 'assistant') {
    const payload = {
      type: 'generation',
      glyphId: entry.glyphId || entry.glyphEmbed?.glyphId,
      glyphName: entry.glyphEmbed?.glyphName,
      timestamp: entry.timestamp,
      code: entry.glyphEmbed?.code || entry.content,
    };
    return { role: 'assistant', content: JSON.stringify(payload) };
  }

  if (entry.isSummoning && entry.role === 'user') {
    const payload = {
      type: 'summon_request',
      prompt: entry.content,
      timestamp: entry.timestamp,
    };
    return { role: 'user', content: JSON.stringify(payload) };
  }

  if (entry.content && entry.content.trim().length > 0) {
    return { role: entry.role, content: entry.content };
  }

  if (entry.glyphEmbed?.code) {
    return { role: entry.role === 'assistant' ? 'assistant' : 'user', content: entry.glyphEmbed.code };
  }

  return null;
}

function buildChatMessages(history: RendererChatMessagePayload[] | undefined, fallbackMessage: string): ProviderChatMessage[] {
  const trimmedHistory = trimChatHistory(history || []);
  const formattedHistory: ProviderChatMessage[] = [];

  trimmedHistory.forEach((entry) => {
    const baseMessage = formatHistoryEntryForProvider(entry);
    if (baseMessage) {
      formattedHistory.push(baseMessage);
    }

    if (entry.glyphAttachments?.length) {
      for (const attachment of entry.glyphAttachments) {
        if (!attachment.llmPayload) continue;
        const descriptor = JSON.stringify({
          type: 'glyph_attachment',
          glyphId: attachment.glyphId,
          name: attachment.name,
          icon: attachment.icon,
        });
        formattedHistory.push({
          role: entry.role === 'assistant' ? 'assistant' : 'user',
          content: [
            '<<<ATTACHMENT_META>>>',
            descriptor,
            '<<<END_ATTACHMENT_META>>>',
            attachment.llmPayload,
          ].join('\n'),
        });
      }
    }
  });

  const lastEntry = formattedHistory[formattedHistory.length - 1];
  if (!lastEntry || lastEntry.role !== 'user') {
    formattedHistory.push({ role: 'user', content: fallbackMessage });
  }

  return [
    { role: 'system', content: CHAT_SYSTEM_PROMPT },
    ...formattedHistory,
  ];
}

function convertMessagesToGeminiContents(messages: ProviderChatMessage[]) {
  let systemBuffer = '';
  let systemInjected = false;
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  for (const message of messages) {
    if (message.role === 'system') {
      systemBuffer += (systemBuffer ? '\n\n' : '') + message.content;
      continue;
    }

    const role = message.role === 'assistant' ? 'model' : 'user';
    let text = message.content;

    if (!systemInjected && role === 'user' && systemBuffer) {
      text = `${systemBuffer}\n\n${text}`;
      systemInjected = true;
    }

    contents.push({ role, parts: [{ text }] });
  }

  if (systemBuffer && !systemInjected && contents[0]) {
    contents[0].parts[0].text = `${systemBuffer}\n\n${contents[0].parts[0].text}`;
  }

  return contents;
}

// ════════════════════════════════════════════════════════════════════════════
// 💬 CHAT STREAMING — Conversational mode without glyph generation
// ════════════════════════════════════════════════════════════════════════════

// Streaming chat call to Grok (conversational)
async function* streamChatGrok(messages: ProviderChatMessage[], modelName: string = 'grok-3-mini'): AsyncGenerator<string> {
  if (!apiKeys.grok) throw new Error('Grok API key not configured');

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKeys.grok}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages,
      stream: true,
      temperature: 0.8,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    throw new Error(`Grok API error: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            yield content;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }
}

// Streaming chat call to Gemini (conversational)
async function* streamChatGemini(messages: ProviderChatMessage[], modelName: string = 'gemini-2.0-flash'): AsyncGenerator<string> {
  if (!apiKeys.gemini) throw new Error('Gemini API key not configured');

  const contents = convertMessagesToGeminiContents(messages);
  if (contents.length === 0) {
    throw new Error('No chat messages available for Gemini request');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?key=${apiKeys.gemini}&alt=sse`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 2000,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const parsed = JSON.parse(jsonStr);
          const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) {
            yield text;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }
}

// Streaming chat call to OpenAI (conversational)
async function* streamChatOpenAI(messages: ProviderChatMessage[], modelName: string = 'gpt-4o-mini'): AsyncGenerator<string> {
  if (!apiKeys.openai) throw new Error('OpenAI API key not configured');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKeys.openai}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages,
      stream: true,
      temperature: 0.8,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            yield content;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }
}

// Provider chat streaming functions
const PROVIDER_CHAT_STREAMS: Record<string, (messages: ProviderChatMessage[], modelName: string) => AsyncGenerator<string>> = {
  grok: streamChatGrok,
  gemini: streamChatGemini,
  openai: streamChatOpenAI,
};

// Main chat function (no glyph generation)
async function chatWithAI(
  message: string,
  history: RendererChatMessagePayload[] | undefined,
  webContents: Electron.WebContents,
  selectedModelId?: string
): Promise<void> {
  const modelConfig = selectedModelId ? AI_MODELS[selectedModelId] : null;
  const provider = modelConfig?.provider || 'gemini';
  const modelName = modelConfig?.modelName || DEFAULT_MODELS[provider];
  const modelLabel = modelConfig?.label || 'Auto';

  log(`💬 CHAT request: "${message.slice(0, 50)}..." (${modelLabel}) | history: ${history?.length || 0} msgs`);

  const apiKey = apiKeys[provider];
  if (!apiKey) {
    const fallbackProviders = ['gemini', 'grok', 'openai'].filter(p => apiKeys[p as keyof ApiKeys]);
    if (fallbackProviders.length === 0) {
      webContents.send('chat-error', { error: 'No API keys configured!' });
      return;
    }
    const fallbackProvider = fallbackProviders[0] as keyof typeof DEFAULT_MODELS;
    return chatWithAI(message, history, webContents, DEFAULT_MODELS[fallbackProvider]);
  }

  let fullResponse = '';
  const chatMessages = buildChatMessages(history, message);

  const safeSend = (channel: string, data: unknown): boolean => {
    if (webContents.isDestroyed()) return false;
    webContents.send(channel, data);
    return true;
  };

  try {
    const streamFn = PROVIDER_CHAT_STREAMS[provider];
    if (!streamFn) {
      throw new Error(`No chat stream function for provider: ${provider}`);
    }

    for await (const chunk of streamFn(chatMessages, modelName)) {
      fullResponse += chunk;
      safeSend('chat-chunk', { chunk, fullResponse });
    }

    log(`💬 Chat complete: ${fullResponse.length} chars`);
    safeSend('chat-complete', { response: fullResponse });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log(`💬 Chat error: ${errorMsg}`);
    
    // Try fallback to different provider
    const fallbackProviders = ['gemini', 'grok', 'openai']
      .filter(p => p !== provider && apiKeys[p as keyof ApiKeys]);
    
    if (fallbackProviders.length > 0) {
      const fallbackProvider = fallbackProviders[0] as keyof typeof DEFAULT_MODELS;
      log(`💬 Falling back to ${fallbackProvider}...`);
      return chatWithAI(message, history, webContents, DEFAULT_MODELS[fallbackProvider]);
    }
    
    safeSend('chat-error', { error: errorMsg });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 📄 INCREMENTAL STREAMING PARSER — Parse marker-based output as it streams
// ════════════════════════════════════════════════════════════════════════════

interface StreamingGlyphState {
  phase: 'waiting' | 'manifest' | 'file' | 'complete';
  manifestJson: string;
  currentFileName: string | null;
  currentFileContent: string;
  files: Record<string, string>;
  manifest: {
    name?: string;
    icon?: string;
    entry?: string;
    inputs?: GlyphInput[];
  } | null;
  glyphId: string | null;
  glyphDir: string | null;
}

function createStreamingState(): StreamingGlyphState {
  return {
    phase: 'waiting',
    manifestJson: '',
    currentFileName: null,
    currentFileContent: '',
    files: {},
    manifest: null,
    glyphId: null,
    glyphDir: null,
  };
}

// Parse streaming content incrementally and write files as they complete
function processStreamingChunk(
  state: StreamingGlyphState,
  fullResponse: string,
  prompt: string,
  modelUsed: string | undefined,
  linkedKeys: string[] | undefined
): { fileWritten?: string; htmlContent?: string; manifestParsed?: boolean } {
  const result: { fileWritten?: string; htmlContent?: string; manifestParsed?: boolean } = {};
  
  // Check for manifest section
  if (state.phase === 'waiting' && fullResponse.includes('<<<MANIFEST>>>')) {
    state.phase = 'manifest';
    log('📋 [Streaming] Entering MANIFEST phase');
  }
  
  // Parse manifest when complete
  if (state.phase === 'manifest' && fullResponse.includes('<<<END_MANIFEST>>>')) {
    const manifestMatch = fullResponse.match(/<<<MANIFEST>>>([\s\S]*?)<<<END_MANIFEST>>>/);
    if (manifestMatch) {
      try {
        const manifestJson = manifestMatch[1].trim();
        state.manifest = JSON.parse(manifestJson);
        state.manifestJson = manifestJson;
        log('📋 [Streaming] Manifest parsed:', state.manifest?.name);
        
        // Create glyph directory immediately
        const glyphName = state.manifest?.name || 'glyph';
        const safeName = glyphName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
        state.glyphId = `glyph-${Date.now()}-${safeName}`;
        
        if (dynamicGlyphPath) {
          state.glyphDir = path.join(dynamicGlyphPath, state.glyphId);
          ensureDirectoryExists(state.glyphDir);
          log(`📂 [Streaming] Created glyph directory: ${state.glyphDir}`);
        }
        
        result.manifestParsed = true;
        state.phase = 'file'; // Ready for files
      } catch (e) {
        log('❌ [Streaming] Failed to parse manifest:', e);
      }
    }
  }
  
  // Check for file sections
  const fileStartMatch = fullResponse.match(/<<<FILE:([^>]+)>>>(?![\s\S]*<<<FILE:\1>>>)/);
  if (fileStartMatch && state.phase !== 'waiting') {
    const fileName = fileStartMatch[1];
    if (state.currentFileName !== fileName) {
      state.currentFileName = fileName;
      state.currentFileContent = '';
      log(`📄 [Streaming] Starting file: ${fileName}`);
    }
  }
  
  // Extract current file content as it streams
  if (state.currentFileName) {
    const filePattern = new RegExp(`<<<FILE:${state.currentFileName}>>>([\\s\\S]*?)(?:<<<END_FILE>>>|$)`);
    const fileMatch = fullResponse.match(filePattern);
    if (fileMatch) {
      state.currentFileContent = fileMatch[1];
      
      // If file is complete (has END_FILE marker), write it
      if (fullResponse.includes(`<<<FILE:${state.currentFileName}>>>`) && 
          fullResponse.includes('<<<END_FILE>>>')) {
        const endFileIndex = fullResponse.indexOf('<<<END_FILE>>>');
        const fileStartIndex = fullResponse.indexOf(`<<<FILE:${state.currentFileName}>>>`);
        
        // Make sure this END_FILE is after our file start
        if (endFileIndex > fileStartIndex) {
          const completeFileMatch = fullResponse.match(
            new RegExp(`<<<FILE:${state.currentFileName}>>>([\\s\\S]*?)<<<END_FILE>>>`)
          );
          if (completeFileMatch) {
            const fileContent = completeFileMatch[1];
            state.files[state.currentFileName] = fileContent;
            
            // Write file to disk immediately
            if (state.glyphDir) {
              try {
                const filePath = resolveGlyphFilePath(state.glyphDir, state.currentFileName);
                fs.writeFileSync(filePath, fileContent, 'utf-8');
                log(`📝 [Streaming] Wrote ${state.currentFileName} (${fileContent.length} chars)`);
                result.fileWritten = state.currentFileName;
              } catch (err) {
                log(`❌ [Streaming] Failed to write ${state.currentFileName}:`, err);
                throw err;
              }
            }
            
            // If it's an HTML file, send it for preview
            if (state.currentFileName.endsWith('.html')) {
              result.htmlContent = fileContent;
            }
            
            state.currentFileName = null;
            state.currentFileContent = '';
          }
        }
      }
    }
  }
  
  // Check for completion
  if (fullResponse.includes('<<<END>>>')) {
    state.phase = 'complete';
    log('✅ [Streaming] Generation complete');
  }
  
  return result;
}

// Finalize the glyph after streaming completes
function finalizeStreamingGlyph(
  state: StreamingGlyphState,
  prompt: string,
  modelUsed: string | undefined,
  linkedKeys: string[] | undefined
): { glyphId: string; locations: string[] } | null {
  if (!state.glyphId || !state.glyphDir || !state.manifest) {
    log('❌ [Streaming] Cannot finalize - missing state');
    return null;
  }
  
  // Determine entry file
  const fileNames = Object.keys(state.files);
  const entryFile = state.manifest.entry || 
    (fileNames.includes('index.html') ? 'index.html' : 
     fileNames.includes('index.tsx') ? 'index.tsx' : 
     fileNames[0]);
  
  // Build and write manifest.json
  const metadata: Record<string, unknown> = {
    id: state.glyphId,
    name: state.manifest.name || 'Unnamed Glyph',
    prompt: prompt || '',
    entry: entryFile,
    files: ['manifest.json', ...fileNames],
    model: modelUsed || undefined,
    savedAt: new Date().toISOString(),
  };
  
  if (state.manifest.inputs && state.manifest.inputs.length > 0) {
    metadata.inputs = state.manifest.inputs;
  }
  if (state.manifest.icon) {
    metadata.icon = state.manifest.icon;
  }
  if (linkedKeys && linkedKeys.length > 0) {
    metadata.linkedKeys = linkedKeys;
  }
  
  fs.writeFileSync(
    resolveGlyphFilePath(state.glyphDir, 'manifest.json'),
    JSON.stringify(metadata, null, 2)
  );
  log(`📋 [Streaming] Wrote manifest.json`);
  
  // Write chat history
  const chatHistory: ChatMessage[] = [
    {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
      type: 'generation',
    },
    {
      id: `msg-${Date.now()}-assistant`,
      role: 'assistant',
      content: `✨ Created "${state.manifest.name}"\n\nGenerated ${fileNames.length} file(s): ${fileNames.join(', ')}`,
      timestamp: Date.now() + 1,
      type: 'generation',
    },
  ];
  if (modelUsed) {
    chatHistory.push({
      id: `msg-${Date.now()}-system`,
      role: 'system',
      content: `Model: ${modelUsed}`,
      timestamp: Date.now() + 2,
      type: 'info',
    });
  }
  fs.writeFileSync(
    resolveGlyphFilePath(state.glyphDir, 'chat.json'),
    JSON.stringify(chatHistory, null, 2)
  );
  
  // Also write to library path if configured
  const locations = [state.glyphDir];
  if (glyphLibraryPath && glyphLibraryPath !== dynamicGlyphPath) {
    const libraryDir = path.join(glyphLibraryPath, state.glyphId);
    ensureDirectoryExists(libraryDir);
    
    // Copy all files
    for (const [fileName, content] of Object.entries(state.files)) {
      const filePath = resolveGlyphFilePath(libraryDir, fileName);
      fs.writeFileSync(filePath, content, 'utf-8');
    }
    fs.writeFileSync(
      resolveGlyphFilePath(libraryDir, 'manifest.json'),
      JSON.stringify(metadata, null, 2)
    );
    fs.writeFileSync(
      resolveGlyphFilePath(libraryDir, 'chat.json'),
      JSON.stringify(chatHistory, null, 2)
    );
    locations.push(libraryDir);
  }
  
  log(`✅ [Streaming] Glyph finalized: ${state.glyphId}`);
  
  // Broadcast that glyph list has changed
  broadcastGlyphListChanged(state.glyphId);
  
  return { glyphId: state.glyphId, locations };
}

// Legacy parser for backwards compatibility with JSON format
function parseGlyphManifest(response: string): GlyphManifest | null {
  try {
    // Try to extract JSON from the response
    let jsonStr = response.trim();
    
    // Remove markdown code blocks if present
    jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    // Find JSON object
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log('❌ No JSON found in response');
      return null;
    }
    
    const manifest = JSON.parse(jsonMatch[0]) as GlyphManifest;
    
    // Only name and files are required - type is now optional
    if (!manifest.name || !manifest.files) {
      log('❌ Invalid manifest structure (missing name or files)');
      return null;
    }

    const fileNames = Object.keys(manifest.files);
    if (fileNames.length === 0) {
      log('❌ Manifest has no files');
      return null;
    }

    const entry =
      manifest.entry ||
      (fileNames.includes('index.html')
        ? 'index.html'
        : fileNames.includes('index.tsx')
          ? 'index.tsx'
          : fileNames[0]);

    if (!entry || !manifest.files[entry]) {
      log('❌ Manifest entry missing or file not found');
      return null;
    }

    manifest.entry = entry;
    
    return manifest;
  } catch (error) {
    log('❌ Failed to parse manifest:', error);
    return null;
  }
}

// Write glyph files to disk
// Chat message interface for glyph history
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  type?: 'generation' | 'refinement' | 'info';
}

async function writeGlyphBundle(
  glyphId: string, 
  manifest: GlyphManifest,
  prompt?: string,
  modelUsed?: string,
  linkedKeys?: string[]
): Promise<{ glyphId: string; locations: string[] }> {
  const targets = [dynamicGlyphPath, glyphLibraryPath];
  const savedLocations: string[] = [];
  const contentFileNames = Object.keys(manifest.files);
  const entryFile = manifest.entry && manifest.files[manifest.entry]
    ? manifest.entry
    : contentFileNames.includes('index.html')
      ? 'index.html'
      : contentFileNames.includes('index.tsx')
        ? 'index.tsx'
        : contentFileNames[0];
  // Include manifest.json in the files list so it shows in the editor
  const allFileNames = ['manifest.json', ...contentFileNames];
  
  // 🔐 CRITICAL: Preserve inputs from LLM-generated manifest!
  // The LLM defines inputs for API keys, settings, etc. that the glyph needs
  const metadata: Record<string, unknown> = {
    id: glyphId,
    name: manifest.name,
    type: manifest.type,
    prompt: prompt || '',
    entry: entryFile,
    files: allFileNames,
    model: modelUsed || undefined, // Store which model was used for generation
    savedAt: new Date().toISOString(),
  };
  
  // Preserve inputs from LLM manifest (for API keys, settings, etc.)
  if (manifest.inputs && Array.isArray(manifest.inputs) && manifest.inputs.length > 0) {
    metadata.inputs = manifest.inputs;
    log(`📥 Preserving ${manifest.inputs.length} input(s) from LLM manifest`);
  }
  
  // Preserve icon from LLM manifest
  if (manifest.icon) {
    metadata.icon = manifest.icon;
  }
  
  // Save linked keys (user's vault keys associated with this glyph)
  if (linkedKeys && linkedKeys.length > 0) {
    metadata.linkedKeys = linkedKeys;
    log(`🔗 Linking ${linkedKeys.length} key(s) to glyph`);
  }
  
  for (const basePath of targets) {
    if (!basePath) continue;
    
    const glyphDir = path.join(basePath, glyphId);
    ensureDirectoryExists(glyphDir);
    log(`📂 [Bundle] Writing ${glyphId} → ${glyphDir}`);
    
    for (const [filename, content] of Object.entries(manifest.files)) {
      const filePath = resolveGlyphFilePath(glyphDir, filename);
      fs.writeFileSync(filePath, content, 'utf-8');
      log(`📝 Wrote ${filename} (${content.length} chars) → ${glyphDir}`);
    }
    
    fs.writeFileSync(
      resolveGlyphFilePath(glyphDir, 'manifest.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    // Save initial chat history with the generation prompt
    if (prompt) {
      const chatHistory: ChatMessage[] = [
        {
          id: `msg-${Date.now()}-user`,
          role: 'user',
          content: prompt,
          timestamp: Date.now(),
          type: 'generation',
        },
        {
          id: `msg-${Date.now()}-assistant`,
          role: 'assistant',
          content: `✨ Created "${manifest.name}" (${manifest.type})\n\nGenerated ${contentFileNames.length} file(s): ${contentFileNames.join(', ')}`,
          timestamp: Date.now() + 1,
          type: 'generation',
        },
      ];
      if (modelUsed) {
        chatHistory.push({
          id: `msg-${Date.now()}-system`,
          role: 'system',
          content: `Model: ${modelUsed}`,
          timestamp: Date.now() + 2,
          type: 'info',
        });
      }
      fs.writeFileSync(
        resolveGlyphFilePath(glyphDir, 'chat.json'),
        JSON.stringify(chatHistory, null, 2)
      );
      log(`💬 Saved chat history with ${chatHistory.length} messages`);
    }
    
    savedLocations.push(glyphDir);
  }
  
  // Broadcast that glyph list has changed
  broadcastGlyphListChanged(glyphId);
  
  return { glyphId, locations: savedLocations };
}

// Main summon function with refinement loop
async function summonGlyph(
  prompt: string, 
  webContents: Electron.WebContents, 
  selectedModelId?: string,
  refinementAttempt: number = 0,
  previousError?: string,
  previousCode?: string,
  summonId: string = `summon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  linkedKeys?: string[]
): Promise<void> {
  const maxRefinements = 5; // Max refinement attempts
  
  // Get model config or use default
  const modelConfig = selectedModelId ? AI_MODELS[selectedModelId] : null;
  const provider = modelConfig?.provider || 'gemini'; // Default to Gemini
  const modelName = modelConfig?.modelName || DEFAULT_MODELS[provider];
  const modelLabel = modelConfig?.label || 'Auto';
  
  const isRefinement = refinementAttempt > 0;
  log(`[${summonId}] ⚡ ${isRefinement ? `REFINING (attempt ${refinementAttempt})` : 'SUMMONING'}:`, prompt, `(${modelLabel})`);

  // Check if we have the API key for the selected provider
  const apiKey = apiKeys[provider];
  if (!apiKey) {
    // Prefer Gemini 3, then Grok, then OpenAI
    const fallbackProviders = ['gemini', 'grok', 'openai'].filter(p => apiKeys[p as keyof ApiKeys]);
    if (fallbackProviders.length === 0) {
      // Send error - use overlayWindow directly as safeSend isn't defined yet
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('summon-error', { error: 'No API keys configured!' });
      } else if (!webContents.isDestroyed()) {
        webContents.send('summon-error', { error: 'No API keys configured!' });
      }
      return;
    }
    const fallbackProvider = fallbackProviders[0] as keyof typeof DEFAULT_MODELS;
    return summonGlyph(prompt, webContents, DEFAULT_MODELS[fallbackProvider], refinementAttempt, previousError, previousCode, summonId, linkedKeys);
  }

  let fullResponse = '';
  
  // Helper to safely send IPC - checks if webContents is still valid
  const safeSend = (channel: string, data: any) => {
    // Check if webContents is destroyed
    if (webContents.isDestroyed()) {
      log(`[${summonId}] ⚠️ Cannot send ${channel} - webContents destroyed, trying overlayWindow`);
      // Fall back to overlayWindow
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send(channel, data);
        return true;
      }
      log(`[${summonId}] ❌ Cannot send ${channel} - no valid window`);
      return false;
    }
    webContents.send(channel, data);
    return true;
  };
  
  try {
    // Send status update
    safeSend('summon-provider', { 
      provider: modelLabel,
      attempt: refinementAttempt + 1,
      isRefinement 
    });

    const streamFn = PROVIDER_STREAMS[provider];
    
    // Build the appropriate prompt
    const actualPrompt = isRefinement && previousError && previousCode
      ? buildRefinementPrompt(prompt, previousCode, previousError)
      : buildUserPrompt(prompt);
    
    // Create streaming state for incremental parsing
    const streamState = createStreamingState();
    let lastHtmlContent = '';
    
    // Stream the response with incremental file writing
    for await (const chunk of streamFn(actualPrompt, modelName)) {
      fullResponse += chunk;
      
      // Process chunk incrementally - write files as they complete
      const result = processStreamingChunk(streamState, fullResponse, prompt, modelLabel, linkedKeys);
      
      // If HTML content was extracted/updated, include it in the chunk event
      if (result.htmlContent && result.htmlContent !== lastHtmlContent) {
        lastHtmlContent = result.htmlContent;
      }
      
      // Send chunk with both raw response and extracted HTML
      safeSend('summon-chunk', { 
        chunk, 
        fullCode: fullResponse,
        htmlContent: lastHtmlContent || undefined,
        attempt: refinementAttempt + 1,
        fileWritten: result.fileWritten,
        glyphId: streamState.glyphId,
      });
    }

    log(`[${summonId}] ✨ ${modelLabel} responded: ${fullResponse.length} chars`);
    
    let codeToSend: string;
    let bundleInfo: { id: string; name: string; type?: string; locations: string[] } | null = null;
    
    // Check if we used the new marker-based format
    if (streamState.phase === 'complete' && streamState.glyphId) {
      // New marker-based format - files already written during streaming
      const finalResult = finalizeStreamingGlyph(streamState, prompt, modelLabel, linkedKeys);
      if (finalResult) {
        codeToSend = lastHtmlContent || streamState.files['index.html'] || '';
        bundleInfo = {
          id: finalResult.glyphId,
          name: streamState.manifest?.name || 'Unnamed',
          type: undefined,
          locations: finalResult.locations,
        };
        log(`[${summonId}] 📦 Streaming bundle finalized: ${bundleInfo.name}`);
      } else {
        codeToSend = cleanGeneratedCode(fullResponse);
        log(`[${summonId}] ⚠️ Streaming finalization failed, using fallback`);
      }
    } else {
      // Try legacy JSON format as fallback
      const manifest = parseGlyphManifest(fullResponse);
      
      if (manifest) {
        // Legacy JSON format - write files now
        const glyphId = createGlyphId(manifest);
        const saveResult = await writeGlyphBundle(glyphId, manifest, prompt, modelLabel, linkedKeys);
        const entryName = manifest.entry || Object.keys(manifest.files)[0];
        const entryCode = manifest.files[entryName];
        if (!entryCode) {
          log('❌ Manifest entry code missing, aborting summon');
          return;
        }
        codeToSend = entryCode;
        bundleInfo = {
          id: saveResult.glyphId,
          name: manifest.name,
          type: manifest.type,
          locations: saveResult.locations,
        };
        log(`[${summonId}] 📦 Legacy bundle written: ${manifest.name}`);
      } else {
        // Fallback: treat as raw code
        codeToSend = cleanGeneratedCode(fullResponse);
        log(`[${summonId}] 📄 Raw code format: ${codeToSend.length} chars`);
      }
    }
    
    // Send completion with metadata
    const sent = safeSend('summon-complete', { 
      code: codeToSend,
      attempt: refinementAttempt + 1,
      manifest: streamState.manifest ? { name: streamState.manifest.name, type: undefined } : null,
      bundle: bundleInfo
    });
    log(`[${summonId}] ${sent ? '✅' : '⚠️'} summon-complete dispatched (attempt ${refinementAttempt + 1}, code ${codeToSend.length} chars)`);
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log(`[${summonId}] ❌ ${modelLabel} failed:`, errorMsg);
    
    // Try fallback to different provider (prefer Gemini)
    const fallbackProviders = ['gemini', 'grok', 'openai']
      .filter(p => p !== provider && apiKeys[p as keyof ApiKeys]);
    
    if (fallbackProviders.length > 0) {
      const fallbackProvider = fallbackProviders[0] as keyof typeof DEFAULT_MODELS;
      log(`[${summonId}] 🔄 Falling back to ${fallbackProvider}...`);
      return summonGlyph(prompt, webContents, DEFAULT_MODELS[fallbackProvider], refinementAttempt, previousError, previousCode, summonId, linkedKeys);
    }
    
    // No fallback available
    const fallbackCode = generateFallbackGlyph(prompt);
    safeSend('summon-complete', { code: fallbackCode, fallback: true });
    log(`[${summonId}] ⚠️ Fallback glyph generated (${fallbackCode.length} chars)`);
  }
}

// Handle refinement request from renderer (legacy - full code replacement)
ipcMain.on('summon-refine', async (event, data: { 
  prompt: string; 
  code: string; 
  error: string; 
  attempt: number;
  model?: string;
}) => {
  log(`🔄 Refinement request (attempt ${data.attempt + 1}):`, data.error.slice(0, 100));
  
  // Forward to background that we're refining
  if (backgroundWindow && !backgroundWindow.isDestroyed()) {
    backgroundWindow.webContents.send('summon-refining', { 
      attempt: data.attempt + 1,
      error: data.error 
    });
  }
  
  // Call summon with refinement context
  await summonGlyph(
    data.prompt, 
    event.sender, 
    data.model,
    data.attempt + 1,
    data.error,
    data.code
  );
});

// Interface for surgical line edits
interface LineEdit {
  type: 'replace' | 'insert' | 'delete';
  startLine: number;
  endLine?: number; // For replace/delete - inclusive
  newContent?: string; // For replace/insert
  explanation?: string;
}

const createRefinementDebugId = (prefix = 'refine') =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const logRefinementStage = (
  debugId: string,
  stage: string,
  payload?: Record<string, unknown>
) => {
  if (payload) {
    log(`[${debugId}] ${stage}`, payload);
  } else {
    log(`[${debugId}] ${stage}`);
  }
};

const previewSnippet = (text: string, length = 200) =>
  text.replace(/\s+/g, ' ').slice(0, length);

// Build prompt for surgical refinement
function buildSurgicalRefinementPrompt(
  originalPrompt: string, 
  currentCode: string, 
  chatHistory: ChatMessage[],
  refinementRequest: string
): string {
  // Number the lines for reference
  const numberedCode = currentCode.split('\n')
    .map((line, i) => `${(i + 1).toString().padStart(4, ' ')} | ${line}`)
    .join('\n');
  
  const historyContext = chatHistory
    .filter(m => m.role !== 'system')
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n---\n');

  return `You are a CODE EDITOR. Your job is to MODIFY existing code based on user requests.

⚠️ CRITICAL: You must respond with ONLY a JSON object in one of the two formats below.
⚠️ DO NOT return a manifest JSON with "name", "icon", "entry", "inputs" fields - that is WRONG.
⚠️ DO NOT create a new glyph - you are EDITING existing code.

═══════════════════════════════════════════════════════════════════════════════
📂 AVAILABLE APIs — File System Access (window.loom)
═══════════════════════════════════════════════════════════════════════════════
If the user asks to read files, browse directories, or work with local files, use these APIs:

• window.loom.readLocalFile(path) → {success, content, isDirectory, files, error, size, modified, extension}
• window.loom.listDirectory(path) → {success, path, parent, files, error}
• window.loom.getSystemPaths() → {home, desktop, documents, downloads, cwd}

Example:
  const result = await window.loom.readLocalFile('C:/path/to/file.txt');
  if (result.success) {
    console.log(result.content); // File contents (or result.files for directories)
  }

DO NOT use fetch() for local files - it will fail with CORS errors.
═══════════════════════════════════════════════════════════════════════════════

ORIGINAL CREATION REQUEST: "${originalPrompt}"

CONVERSATION HISTORY:
${historyContext || '(No previous refinement history)'}

CURRENT CODE (with line numbers for reference):
\`\`\`
${numberedCode}
\`\`\`

USER'S EDIT REQUEST: "${refinementRequest}"

═══════════════════════════════════════════════════════════════════════════════
RESPONSE FORMAT - Choose ONE:
═══════════════════════════════════════════════════════════════════════════════

FORMAT A: Surgical Edits (PREFERRED for targeted changes)
{
  "mode": "surgical",
  "edits": [
    {"type": "replace", "startLine": 15, "endLine": 17, "newContent": "// new code here\\n// more lines", "explanation": "What changed"},
    {"type": "insert", "startLine": 8, "newContent": "// code to insert before line 8", "explanation": "Added X"},
    {"type": "delete", "startLine": 42, "endLine": 45, "explanation": "Removed Y"}
  ]
}

Edit types:
- "replace": Replace lines startLine through endLine (inclusive) with newContent
- "insert": Insert newContent BEFORE the specified startLine  
- "delete": Remove lines startLine through endLine (inclusive)

FORMAT B: Full Replacement (for extensive changes affecting >30% of code)
{
  "mode": "full",
  "code": "<!DOCTYPE html>\\n<html>\\n... complete updated file content ...",
  "explanation": "Why full replacement was needed"
}

═══════════════════════════════════════════════════════════════════════════════

RULES:
1. Line numbers are 1-indexed (first line is 1, not 0)
2. Use \\n for newlines within JSON strings
3. Preserve proper indentation in newContent
4. Prefer FORMAT A (surgical) when possible - it's cleaner
5. Use FORMAT B only when changes are extensive
6. Respond with ONLY the JSON object - no markdown, no explanation outside JSON
7. SANDBOX CONSTRAINT: Never add window.open(), target="_blank" links, external navigation, or any code that opens new windows/tabs. All functionality must stay inside the iframe`;
}

// Apply surgical edits to code
function applySurgicalEdits(
  code: string, 
  edits: LineEdit[],
  options?: { debugId?: string; logLimit?: number }
): { 
  newCode: string; 
  appliedEdits: LineEdit[];
  errors: string[];
} {
  const lines = code.split('\n');
  const appliedEdits: LineEdit[] = [];
  const errors: string[] = [];
  
  // Sort edits by line number in reverse order (apply from bottom to top to preserve line numbers)
  const sortedEdits = [...edits].sort((a, b) => b.startLine - a.startLine);
  
  const logLimit = options?.logLimit ?? 10;
  if (options?.debugId) {
    logRefinementStage(options.debugId, 'Applying surgical edits', {
      requestedEdits: sortedEdits.length,
    });
  }

  sortedEdits.forEach((edit, index) => {
    try {
      const startIdx = edit.startLine - 1; // Convert to 0-indexed
      const endIdx = (edit.endLine || edit.startLine) - 1;
      
      if (startIdx < 0 || startIdx >= lines.length) {
        errors.push(`Line ${edit.startLine} out of range (1-${lines.length})`);
        if (options?.debugId) {
          logRefinementStage(options.debugId, 'Edit skipped - out of range', {
            edit,
            totalLines: lines.length,
          });
        }
        return; // Skip this edit (continue equivalent in forEach)
      }
      
      if (edit.type === 'delete') {
        lines.splice(startIdx, endIdx - startIdx + 1);
        appliedEdits.push(edit);
      } else if (edit.type === 'replace') {
        const newLines = edit.newContent?.split('\n') || [];
        lines.splice(startIdx, endIdx - startIdx + 1, ...newLines);
        appliedEdits.push(edit);
      } else if (edit.type === 'insert') {
        const newLines = edit.newContent?.split('\n') || [];
        lines.splice(startIdx, 0, ...newLines);
        appliedEdits.push(edit);
      }
      if (options?.debugId && index < logLimit) {
        logRefinementStage(options.debugId, `Edit applied #${index + 1}`, {
          type: edit.type,
          startLine: edit.startLine,
          endLine: edit.endLine,
          newContentLines: edit.newContent ? edit.newContent.split('\n').length : 0,
        });
      }
    } catch (err) {
      errors.push(`Error applying edit at line ${edit.startLine}: ${err}`);
      if (options?.debugId) {
        logRefinementStage(options.debugId, 'Error applying edit', {
          edit,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });
  
  if (options?.debugId && sortedEdits.length > logLimit) {
    logRefinementStage(options.debugId, 'Additional edits omitted from logs', {
      totalEdits: sortedEdits.length,
      loggedEdits: logLimit,
    });
  }
  
  if (options?.debugId) {
    logRefinementStage(options.debugId, 'Surgical edit summary', {
      appliedEdits: appliedEdits.length,
      errors,
    });
  }
  
  return {
    newCode: lines.join('\n'),
    appliedEdits: appliedEdits.reverse(), // Return in original order
    errors
  };
}

// Handle surgical refinement request (tool-based, minimal edits)
ipcMain.handle('refine-glyph-surgical', async (event, data: {
  glyphId: string;
  fileName: string;
  currentCode: string;
  originalPrompt: string;
  refinementRequest: string;
  chatHistory: ChatMessage[];
  model?: string;
  debugId?: string;
  source?: 'manual' | 'autofix';
}) => {
  const debugId = data.debugId || createRefinementDebugId();
  const stage = (message: string, payload?: Record<string, unknown>) =>
    logRefinementStage(debugId, message, payload);
  
  stage('🔧 Surgical refinement request received', {
    glyphId: data.glyphId,
    fileName: data.fileName,
    source: data.source || 'manual',
    requestPreview: previewSnippet(data.refinementRequest, 80),
    requestChars: data.refinementRequest.length,
    codeChars: data.currentCode.length,
    chatMessages: data.chatHistory?.length || 0,
    modelPreference: data.model || 'auto',
  });
  
  let selectedModelId = data.model || 'gemini-3';
  let modelConfig = AI_MODELS[selectedModelId];
  
  if (!modelConfig && selectedModelId) {
    const foundByLabel = Object.entries(AI_MODELS).find(([, config]) => config.label === selectedModelId);
    if (foundByLabel) {
      selectedModelId = foundByLabel[0];
      modelConfig = foundByLabel[1];
      stage('📍 Resolved model by label', { selectedModelId });
    }
  }
  
  if (!modelConfig || !apiKeys[modelConfig.provider]) {
    stage('⚠️ Preferred model unavailable, searching fallback', { selectedModelId });
    const modelOrder = ['gemini-3', 'gemini-2.0-flash', 'grok-3', 'gpt-4o-mini', 'gemini-1.5-pro'];
    for (const modelId of modelOrder) {
      const config = AI_MODELS[modelId];
      if (config && apiKeys[config.provider]) {
        selectedModelId = modelId;
        modelConfig = config;
        stage('✅ Using fallback model', { selectedModelId, label: config.label });
        break;
      }
    }
  }
  
  if (!modelConfig) {
    stage('❌ No AI models available', {});
    return { success: false, error: 'No AI models available. Please configure an API key.', debugId };
  }
  
  const provider = modelConfig.provider;
  const modelName = modelConfig.modelName;
  const modelLabel = modelConfig.label;
  
  stage('🔧 Using model', { modelLabel, modelName, provider });
  
  const apiKey = apiKeys[provider];
  if (!apiKey) {
    stage('❌ Missing API key for provider', { provider });
    return { success: false, error: 'No API key configured for ' + provider, debugId };
  }
  
  let promptChars = 0;
  let responseChars = 0;
  let chunkCount = 0;
  let fullResponse = '';
  
  try {
    const prompt = buildSurgicalRefinementPrompt(
      data.originalPrompt,
      data.currentCode,
      data.chatHistory,
      data.refinementRequest
    );
    promptChars = prompt.length;
    stage('🧾 Prompt assembled', {
      promptChars,
      codeLines: data.currentCode.split('\n').length,
      requestPreview: previewSnippet(data.refinementRequest, 120),
    });
    
    const streamFn = PROVIDER_STREAMS[provider];
    for await (const chunk of streamFn(prompt, modelName)) {
      chunkCount += 1;
      fullResponse += chunk;
      if (chunkCount <= 3) {
        stage('📨 LLM chunk received', {
          chunkCount,
          chunkChars: chunk.length,
          preview: previewSnippet(chunk, 100),
        });
      }
    }
    responseChars = fullResponse.length;
    stage('✨ LLM stream complete', { chunkCount, responseChars });
    
    let parsedResponse: any;
    try {
      stage('🧩 Parsing response', { preview: previewSnippet(fullResponse, 160) });
      const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        parsedResponse = JSON.parse(fullResponse.trim());
      }
    } catch (parseErr) {
      try {
        const arrayMatch = fullResponse.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (arrayMatch) {
          const edits = JSON.parse(arrayMatch[0]);
          parsedResponse = { mode: 'surgical', edits };
          stage('📎 Parsed legacy edits format', { editCount: edits?.length || 0 });
        } else {
          throw parseErr;
        }
      } catch {
        stage('⚠️ Failed to parse response', {
          error: parseErr instanceof Error ? parseErr.message : parseErr,
        });
        return { 
          success: false, 
          error: 'Failed to parse LLM response as JSON',
          rawResponse: fullResponse.slice(0, 500),
          debugId,
          responseChars,
          promptChars,
          chunkCount,
        };
      }
    }
    
    if (parsedResponse.mode === 'full' && parsedResponse.code) {
      stage('🪄 Full replacement mode detected', {
        codeChars: parsedResponse.code.length,
      });
      const oldLines = data.currentCode.split('\n').length;
      const newLines = parsedResponse.code.split('\n').length;
      
      return {
        success: true,
        originalCode: data.currentCode,
        newCode: parsedResponse.code,
        edits: [{
          type: 'replace' as const,
          startLine: 1,
          endLine: oldLines,
          newContent: parsedResponse.code,
          explanation: parsedResponse.explanation || `Full file replacement (${oldLines} → ${newLines} lines)`,
        }],
        errors: [],
        model: modelLabel,
        mode: 'full' as const,
        debugId,
        chunkCount,
        promptChars,
        responseChars,
      };
    }
    
    const edits: LineEdit[] = parsedResponse.edits || parsedResponse;
    
    if (!Array.isArray(edits) || edits.length === 0) {
      // Check if LLM returned wrong format (manifest instead of edits)
      if (parsedResponse.name && parsedResponse.entry) {
        stage('⚠️ LLM returned manifest format instead of edits', {
          name: parsedResponse.name,
          hasInputs: !!parsedResponse.inputs,
        });
        return { 
          success: false, 
          error: 'LLM returned a manifest instead of code edits. Please try again.',
          rawResponse: fullResponse.slice(0, 500),
          debugId,
          promptChars,
          responseChars,
          chunkCount,
        };
      }
      stage('⚠️ No edits returned from LLM', {});
      return { 
        success: false, 
        error: 'No edits returned from LLM',
        rawResponse: fullResponse.slice(0, 500),
        debugId,
        promptChars,
        responseChars,
        chunkCount,
      };
    }
    
    const result = applySurgicalEdits(data.currentCode, edits, { debugId });
    stage('🔧 Surgical edits applied', {
      appliedEdits: result.appliedEdits.length,
      errors: result.errors,
    });
    
    return {
      success: true,
      originalCode: data.currentCode,
      newCode: result.newCode,
      edits: result.appliedEdits,
      errors: result.errors,
      model: modelLabel,
      mode: 'surgical' as const,
      debugId,
      chunkCount,
      promptChars,
      responseChars,
    };
    
  } catch (err) {
    stage('❌ Surgical refinement failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { 
      success: false, 
      error: err instanceof Error ? err.message : 'Unknown error',
      debugId,
    };
  }
});

function cleanGeneratedCode(code: string): string {
  // Remove markdown code blocks if present
  let cleaned = code
    .replace(/```(?:tsx?|typescript|javascript)?\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  // Ensure it starts with import
  if (!cleaned.startsWith('import')) {
    const importIndex = cleaned.indexOf('import');
    if (importIndex !== -1) {
      cleaned = cleaned.slice(importIndex);
    }
  }

  return cleaned;
}

function generateFallbackGlyph(prompt: string): string {
  const words = prompt.split(' ').slice(0, 3).join(' ').toUpperCase();
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
      }
      .container {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: radial-gradient(circle at top, rgba(15,0,40,0.9), rgba(0,0,10,0.95));
      }
      .sigil {
        position: relative;
        width: min(65vw, 420px);
        height: min(65vw, 420px);
        border-radius: 50%;
        border: 3px solid rgba(0, 255, 255, 0.4);
        box-shadow: 0 0 40px rgba(255, 0, 255, 0.45);
        animation: spin 14s linear infinite;
      }
      .sigil::before {
        content: '';
        position: absolute;
        inset: 18%;
        border-radius: 50%;
        border: 2px dashed rgba(255, 0, 255, 0.5);
        animation: spin 10s linear reverse infinite;
      }
      .sigil::after {
        content: '${words || 'LOOM'}';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        letter-spacing: 0.5em;
        color: #00f0ff;
        font-size: clamp(14px, 2.8vw, 32px);
        text-shadow: 0 0 15px rgba(0, 255, 255, 0.7);
      }
      .spark {
        position: absolute;
        inset: 0;
        background: repeating-radial-gradient(circle, rgba(255,255,255,0.12) 0 1px, transparent 1px 3px);
        filter: blur(1px);
        opacity: 0.6;
        animation: pulse 4s ease-in-out infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      @keyframes pulse {
        0% { transform: scale(0.95); opacity: 0.4; }
        50% { transform: scale(1.05); opacity: 0.8; }
        100% { transform: scale(0.95); opacity: 0.4; }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="sigil"><div class="spark"></div></div>
    </div>
  </body>
</html>`;
}

// ════════════════════════════════════════════════════════════════════════════
// 🖼️ WINDOW MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════

function approxEqual(a: number, b: number): boolean {
  return Math.abs((a || 0) - (b || 0)) <= 1;
}

function applyBounds(win: BrowserWindow, displayId: string, bounds: Electron.Rectangle) {
  if (!win || win.isDestroyed()) return;
  
  const desired = { ...bounds };
  let attempt = 0;
  let lastActual: Electron.Rectangle | null = null;
  let adjusted = { ...desired };

  while (attempt < 3) {
    win.setBounds(adjusted, false);
    lastActual = win.getBounds();
    log('bounds-applied', { displayId, desired, attempt, adjusted, actual: lastActual });

    const matches =
      approxEqual(lastActual.x, desired.x) &&
      approxEqual(lastActual.y, desired.y) &&
      approxEqual(lastActual.width, desired.width) &&
      approxEqual(lastActual.height, desired.height);

    if (matches) {
      log('bounds-matched', { displayId });
      return;
    }

    const deltaX = desired.x - lastActual.x;
    const deltaY = desired.y - lastActual.y;

    if (deltaX === 0 && deltaY === 0) {
      break;
    }

    adjusted = {
      ...adjusted,
      x: adjusted.x + deltaX,
      y: adjusted.y + deltaY
    };

    attempt += 1;
  }

  log('bounds-warning', { displayId, desired, final: lastActual });
}

function toggleInteraction() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  
  interactionEnabled = !interactionEnabled;
  
  if (interactionEnabled) {
    overlayWindow.focus();
    log('✨ SUMMONER AWAKENED — Type your will');
    overlayWindow.webContents.send('interaction-state', { enabled: true });
  } else {
    overlayWindow.blur();
    log('💤 SUMMONER SLEEPS — Desktop restored');
    overlayWindow.webContents.send('interaction-state', { enabled: false });
  }
}

/**
 * LAYER 1: Background Windows (one per display)
 * - Full screen Three.js animated canvas per monitor
 * - Attached as wallpaper via electron-as-wallpaper
 * - Always click-through (ignoreMouseEvents: true)
 */
function createBackgroundWindowForDisplay(display: Electron.Display) {
  const displayId = String(display.id);
  const { bounds } = display;
  const isPrimary = display.id === screen.getPrimaryDisplay().id;
  
  log('creating-background-window-for-display', {
    displayId,
    bounds,
    scaleFactor: display.scaleFactor,
    isPrimary,
  });

  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  backgroundWindows.set(displayId, win);
  backgroundWindowsReady.set(displayId, false);
  backgroundWindowsAttached.set(displayId, false);
  
  // Set legacy pointer for primary display
  if (isPrimary) {
    backgroundWindow = win;
    backgroundDisplayId = displayId;
    backgroundDisplayBounds = { ...bounds };
    backgroundReadyForAttach = false;
  }

  log('background-window-created', { id: win.id, displayId, isPrimary });

  const isDev = !app.isPackaged;
  
  if (isDev) {
    win.loadURL(`http://localhost:5173?layer=background&displayId=${displayId}`);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { layer: 'background', displayId }
    });
  }

  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return;
    backgroundWindowsReady.set(displayId, true);
    
    if (isPrimary) {
      backgroundReadyForAttach = true;
    }
    
    log('background-ready-to-show', { displayId, bounds: win.getBounds(), isPrimary });
    
    applyBounds(win, displayId, bounds);
    win.showInactive();
    
    // Attach this window as wallpaper
    attachBackgroundWindowToDesktop(displayId, { force: true });
    
    // Restore background for this display if saved
    restoreBackgroundForDisplay(displayId);
    
    if (isPrimary) {
      applyBackgroundInteractionState({ reason: 'background-ready' });
    }
  });

  win.on('closed', () => {
    backgroundWindows.delete(displayId);
    backgroundWindowsReady.delete(displayId);
    backgroundWindowsAttached.delete(displayId);
    
    if (isPrimary) {
      backgroundReadyForAttach = false;
      backgroundWindow = null;
      backgroundDisplayBounds = null;
      backgroundDisplayId = null;
      wallpaperAttached = false;
    }
  });
  
  return win;
}

/**
 * Create background windows for ALL displays
 */
function createAllBackgroundWindows() {
  const allDisplays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  
  log('creating-all-background-windows', {
    displayCount: allDisplays.length,
    primaryId: primaryDisplay.id,
  });
  
  // Create primary display window first
  const primaryWin = createBackgroundWindowForDisplay(primaryDisplay);
  applyBackgroundInteractionState({ reason: 'background-window-created' });
  
  // Create windows for other displays
  for (const display of allDisplays) {
    if (display.id !== primaryDisplay.id) {
      createBackgroundWindowForDisplay(display);
    }
  }
  
  // Listen for display changes
  screen.on('display-added', (event, newDisplay) => {
    log('display-added', { id: newDisplay.id, bounds: newDisplay.bounds });
    createBackgroundWindowForDisplay(newDisplay);
  });
  
  screen.on('display-removed', (event, oldDisplay) => {
    const displayId = String(oldDisplay.id);
    log('display-removed', { displayId });
    const win = backgroundWindows.get(displayId);
    if (win && !win.isDestroyed()) {
      detachBackgroundWindowFromDesktop(displayId);
      win.close();
    }
  });
  
  screen.on('display-metrics-changed', (event, display, changedMetrics) => {
    const displayId = String(display.id);
    const win = backgroundWindows.get(displayId);
    if (win && !win.isDestroyed()) {
      log('display-metrics-changed-for', { displayId, bounds: display.bounds, changedMetrics });
      applyBounds(win, displayId, display.bounds);
      
      // Re-attach if needed
      if (backgroundWindowsAttached.get(displayId)) {
        detachBackgroundWindowFromDesktop(displayId);
        attachBackgroundWindowToDesktop(displayId, { force: true });
      }
    }
  });
}

/**
 * Attach a specific background window as wallpaper
 */
function attachBackgroundWindowToDesktop(displayId: string, { force = false }: { force?: boolean } = {}) {
  if (process.platform !== 'win32') return;
  
  const win = backgroundWindows.get(displayId);
  if (!win || win.isDestroyed()) return;
  if (!backgroundWindowsReady.get(displayId)) return;
  if (backgroundWindowsAttached.get(displayId) && !force) return;
  
  const allDisplays = screen.getAllDisplays();
  const display = allDisplays.find(d => String(d.id) === displayId);
  if (!display) return;
  
  const { bounds } = display;
  
  // Detach first if already attached
  if (backgroundWindowsAttached.get(displayId)) {
    detachBackgroundWindowFromDesktop(displayId);
  }
  
  try {
    // Set bounds before attaching
    applyBounds(win, displayId, bounds);
    
    attach(win, {
      transparent: true,
      forwardKeyboardInput: backgroundInteractionState.enabled,
      forwardMouseInput: backgroundInteractionState.enabled,
    });
    
    backgroundWindowsAttached.set(displayId, true);
    
    // Re-apply bounds after attachment
    applyBounds(win, displayId, bounds);
    
    // Multiple retry attempts to correct positioning
    const retryTimes = [50, 150, 300];
    retryTimes.forEach((delay) => {
      setTimeout(() => {
        if (win && !win.isDestroyed()) {
          const currentBounds = win.getBounds();
          const needsCorrection = 
            Math.abs(currentBounds.x - bounds.x) > 2 || 
            Math.abs(currentBounds.y - bounds.y) > 2;
          
          if (needsCorrection) {
            log(`🔧 Correcting background bounds for ${displayId} (delay: ${delay}ms)`);
            applyBounds(win, displayId, bounds);
          }
        }
      }, delay);
    });
    
    log('🔮 BACKGROUND ATTACHED AS WALLPAPER', {
      displayId,
      bounds,
    });
    
    // Update legacy state for primary
    if (displayId === backgroundDisplayId) {
      wallpaperAttached = true;
    }
  } catch (error) {
    log('attach-error', { displayId, error });
  }
}

/**
 * Detach a specific background window from wallpaper
 */
function detachBackgroundWindowFromDesktop(displayId: string) {
  if (process.platform !== 'win32') return;
  
  const win = backgroundWindows.get(displayId);
  if (!win || win.isDestroyed()) return;
  if (!backgroundWindowsAttached.get(displayId)) return;
  
  try {
    detach(win);
  } catch (error) {
    log('detach-error', { displayId, error });
  } finally {
    backgroundWindowsAttached.set(displayId, false);
    if (displayId === backgroundDisplayId) {
      wallpaperAttached = false;
    }
  }
}

/**
 * Restore background glyph for a specific display from saved state
 */
function restoreBackgroundForDisplay(displayId: string) {
  const state = loadMonitorBackgrounds();
  const config = state.backgrounds.find(b => b.displayId === displayId);
  
  if (config && config.code) {
    const win = backgroundWindows.get(displayId);
    if (win && !win.isDestroyed()) {
      log('🖼️ Restoring background for display:', displayId, config.glyphId);
      
      // Load fresh inputs from manifest to ensure config changes persist
      let inputs: Record<string, unknown> = {};
      let freshCode = config.code;
      if (config.glyphId) {
        const freshData = loadFreshGlyphData(config.glyphId);
        if (freshData) {
          inputs = freshData.inputs;
          freshCode = freshData.code; // Use fresh code too in case it was updated
          log(`📦 [Restore] Loaded fresh inputs for ${config.glyphId}: ${Object.keys(inputs).length} inputs`);
        }
      }
      
      win.webContents.send('summon-inject', {
        code: freshCode,
        prompt: config.prompt || 'Monitor Background',
        glyphId: config.glyphId,
        type: config.type,
        mode: 'background',
        inputs,
      });
    }
  } else if (displayId === backgroundDisplayId) {
    // Fall back to legacy wallpaper state for primary display
    restoreBackgroundWallpaper();
  }
}

// Legacy function - now wraps the new multi-window system
function createBackgroundWindow() {
  createAllBackgroundWindows();
}

/**
 * Calculate the bounding rectangle that encompasses ALL displays
 * This allows the overlay to span all monitors for widgets and UI
 */
function getAllDisplaysBounds(): Electron.Rectangle {
  const allDisplays = screen.getAllDisplays();
  
  if (allDisplays.length === 0) {
    return { x: 0, y: 0, width: 1920, height: 1080 };
  }
  
  if (allDisplays.length === 1) {
    return allDisplays[0].bounds;
  }
  
  // Calculate the bounding box that contains all displays
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  for (const display of allDisplays) {
    minX = Math.min(minX, display.bounds.x);
    minY = Math.min(minY, display.bounds.y);
    maxX = Math.max(maxX, display.bounds.x + display.bounds.width);
    maxY = Math.max(maxY, display.bounds.y + display.bounds.height);
  }
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * LAYER 2: The Overlay Window
 * - Transparent, always-on-top
 * - Contains ONLY the React UI (SummonBar, etc.)
 * - Starts click-through, toggles with Ctrl+Alt+S
 * - SPANS ALL DISPLAYS for multi-monitor widget/UI support
 */
function createOverlayWindow() {
  // Get bounds that span ALL displays
  const allBounds = getAllDisplaysBounds();
  const allDisplays = screen.getAllDisplays();
  
  log('creating-overlay-window', { 
    allBounds,
    displayCount: allDisplays.length,
    displays: allDisplays.map(d => ({ id: d.id, bounds: d.bounds, isPrimary: d.id === screen.getPrimaryDisplay().id })),
  });

  overlayWindow = new BrowserWindow({
    x: allBounds.x,
    y: allBounds.y,
    width: allBounds.width,
    height: allBounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    focusable: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  log('overlay-window-created', { id: overlayWindow.id });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  const isDev = !app.isPackaged;
  
  if (isDev) {
    overlayWindow.loadURL('http://localhost:5173?layer=overlay');
  } else {
    overlayWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { layer: 'overlay' }
    });
  }

  overlayWindow.once('ready-to-show', () => {
    if (!overlayWindow) return;
    log('overlay-ready-to-show');
    overlayWindow.showInactive();
  });

  // Listen for display changes and resize overlay to span all displays
  screen.on('display-added', updateOverlayBounds);
  screen.on('display-removed', updateOverlayBounds);
  screen.on('display-metrics-changed', updateOverlayBounds);

  overlayWindow.on('closed', () => {
    screen.removeListener('display-added', updateOverlayBounds);
    screen.removeListener('display-removed', updateOverlayBounds);
    screen.removeListener('display-metrics-changed', updateOverlayBounds);
    overlayWindow = null;
  });
}

/**
 * Update overlay window bounds to span all displays
 * Called when displays are added/removed/changed
 */
function updateOverlayBounds() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  
  const allBounds = getAllDisplaysBounds();
  log('updating-overlay-bounds', { allBounds });
  
  overlayWindow.setBounds(allBounds, false);
}

/**
 * Toggle Loom Panel in the overlay window
 * Sends IPC event to show/hide the panel (no separate window needed)
 * 
 * IMPORTANT: We keep the overlay click-through (forward: true) even when panel is open.
 * The panel uses mouseEnterUI/mouseLeaveUI to capture events only when hovering over it.
 * This allows clicking through to other windows when not on the panel.
 * 
 * NOT using alwaysOnTop so other windows can come to front when clicked.
 * Use Ctrl+Alt+L to bring the panel back to front.
 */
function toggleLoomPanel() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    log('🔮 Sending toggle-loom-panel to overlay');
    
    // Keep click-through with forwarding - panel will capture events on hover
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    // Don't use alwaysOnTop - let other windows come to front when clicked
    overlayWindow.setAlwaysOnTop(false);
    overlayWindow.webContents.send('toggle-loom-panel');
    // Bring to front initially, but other windows can go above it
    overlayWindow.moveTop();
  }
}

/**
 * Open the Loom Panel (used for initial launch)
 */
function openLoomPanel() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    log('🔮 Opening Loom Panel');
    // Keep click-through with forwarding - panel will capture events on hover
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    // Don't use alwaysOnTop - let other windows come to front when clicked
    overlayWindow.setAlwaysOnTop(false);
    overlayWindow.webContents.send('open-loom-panel');
    overlayWindow.moveTop();
  }
}

/**
 * System Tray Setup
 * - Shows LOOM icon in system tray
 * - Click to open Loom Panel
 * - Right-click for context menu
 */
function createTray() {
  // Create a 16x16 icon for the tray (using a data URL for simplicity)
  const iconPath = path.join(__dirname, '..', 'public', 'tray-icon.png');
  
  // If icon doesn't exist, create a simple colored icon
  let trayIcon;
  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath);
  } else {
    // Create a simple 16x16 cyan-magenta gradient icon
    trayIcon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADSSURBVDiNY2AYBaNgqANGBgYGBkdHx/+Ojo7/GRkZGRj+//8PAJb8AMiNDAwMDIyMjP8ZGRn/AwAjAyMDAwPj////GRkZ/wMAI0MEAwMDA8N/RkbG/4D8/4yMjAyMQDEGBgYGRkZGBsb//xkZGBj+AwAjUAMDA+N/RkZGRoYIoFoGBkZgGJD5/5+RkYEB6BUGBgYGRkbG/4wQNQyMDP8BLmVkZGRgZPzPwMjI+J+RkZERaD7QAAYGBkZGxv+MjIwMjEANDAz/GRkZGQEAqEU8HQPLXSEAAAAASUVORK5CYII='
    );
  }
  
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
  tray.setToolTip('LOOM — Digital Manifestation');
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '🔮 Open LOOM Panel (Ctrl+Alt+L)',
      click: () => toggleLoomPanel(),
    },
    {
      label: '⚡ Toggle Summoner (Ctrl+Alt+S)',
      click: () => toggleInteraction(),
    },
    { type: 'separator' },
    {
      label: '🔧 Dev Tools',
      submenu: [
        {
          label: 'Overlay DevTools',
          click: () => {
            if (overlayWindow && !overlayWindow.isDestroyed()) {
              overlayWindow.webContents.openDevTools({ mode: 'detach' });
            }
          },
        },
        {
          label: 'Background DevTools',
          click: () => {
            if (backgroundWindow && !backgroundWindow.isDestroyed()) {
              backgroundWindow.webContents.openDevTools({ mode: 'detach' });
            }
          },
        },
      ],
    },
    { type: 'separator' },
    {
      label: '❌ Quit LOOM',
      click: () => app.quit(),
    },
  ]);
  
  tray.setContextMenu(contextMenu);
  
  // Single click toggles the panel
  tray.on('click', () => {
    toggleLoomPanel();
  });
  
  log('🔔 System tray created');
}

// Sync Loom Panel state when closed from renderer (ESC key or close button)
ipcMain.on('loom-panel-closed', () => {
  log('🔮 Loom Panel closed from renderer - restoring click-through');
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.setAlwaysOnTop(false);
  }
});

// Load chat history for a glyph
ipcMain.handle('load-glyph-chat-history', async (event, glyphId: string) => {
  const searchPaths = [dynamicGlyphPath, glyphLibraryPath];
  
  for (const basePath of searchPaths) {
    if (!basePath || !fs.existsSync(basePath)) continue;
    
    const chatPath = path.join(basePath, glyphId, 'chat.json');
    if (fs.existsSync(chatPath)) {
      try {
        const chatHistory = JSON.parse(fs.readFileSync(chatPath, 'utf-8'));
        log(`📜 Loaded ${chatHistory.length} messages for glyph: ${glyphId}`);
        return chatHistory;
      } catch (err) {
        log(`⚠️ Failed to load chat history for ${glyphId}:`, err);
      }
    }
  }
  
  log(`📜 No chat history found for glyph: ${glyphId}`);
  return [];
});

// Save a chat message to a glyph's history
ipcMain.handle('save-glyph-chat-message', async (event, glyphId: string, message: ChatMessage) => {
  const searchPaths = [dynamicGlyphPath, glyphLibraryPath];
  
  for (const basePath of searchPaths) {
    if (!basePath || !fs.existsSync(basePath)) continue;
    
    const glyphDir = path.join(basePath, glyphId);
    if (!fs.existsSync(glyphDir)) continue;
    
    const chatPath = path.join(glyphDir, 'chat.json');
    let chatHistory: ChatMessage[] = [];
    
    if (fs.existsSync(chatPath)) {
      try {
        chatHistory = JSON.parse(fs.readFileSync(chatPath, 'utf-8'));
      } catch (err) {
        log(`⚠️ Failed to read existing chat history, starting fresh`);
      }
    }
    
    chatHistory.push(message);
    fs.writeFileSync(chatPath, JSON.stringify(chatHistory, null, 2));
    log(`💬 Saved message to ${glyphId} chat history (${chatHistory.length} total)`);
    
    return { success: true, messageCount: chatHistory.length };
  }
  
  return { success: false, error: 'Glyph not found' };
});

// ════════════════════════════════════════════════════════════════════════════
// 📁 GLYPH FILE SYSTEM IPC HANDLERS
// ════════════════════════════════════════════════════════════════════════════

ipcMain.handle('ui-state:load', async () => {
  return getUiStateSnapshot();
});

ipcMain.handle('ui-state:save', async (_event, patch: LoomUiStatePatch) => {
  return mergeUiState(patch);
});

// ════════════════════════════════════════════════════════════════════════════
// 💬 CHAT HISTORY IPC HANDLERS
// ════════════════════════════════════════════════════════════════════════════

const chatHistoryPath = path.join(app.getPath('userData'), 'chat-history.json');

interface ChatMessage extends RendererChatMessagePayload {}

interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  model?: string;
  mode?: 'chat' | 'summon';
}

interface ChatHistoryData {
  conversations: ChatConversation[];
  activeConversationId?: string;
}

let chatHistoryCache: ChatHistoryData | null = null;

function loadChatHistory(): ChatHistoryData {
  if (chatHistoryCache) return chatHistoryCache;
  
  try {
    if (fs.existsSync(chatHistoryPath)) {
      const raw = fs.readFileSync(chatHistoryPath, 'utf-8');
      chatHistoryCache = JSON.parse(raw);
      return chatHistoryCache!;
    }
  } catch (err) {
    log('⚠️ Failed to load chat history:', err);
  }
  
  chatHistoryCache = { conversations: [] };
  return chatHistoryCache;
}

function saveChatHistory(data: ChatHistoryData) {
  try {
    fs.writeFileSync(chatHistoryPath, JSON.stringify(data, null, 2));
    chatHistoryCache = data;
    log('💾 Saved chat history');
  } catch (err) {
    log('❌ Failed to save chat history:', err);
  }
}

// Load all chat conversations
ipcMain.handle('chat-history:load', async () => {
  log('📜 chat-history:load called');
  const history = loadChatHistory();
  log(`📜 Loaded ${history.conversations.length} chat conversations`);
  return history;
});

// Create a new conversation
ipcMain.handle('chat-history:create', async (_event, title?: string) => {
  log('📜 chat-history:create called with title:', title);
  const history = loadChatHistory();
  const newConversation: ChatConversation = {
    id: `chat-${Date.now()}`,
    title: title || 'New Chat',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  history.conversations.unshift(newConversation);
  history.activeConversationId = newConversation.id;
  saveChatHistory(history);
  
  log(`📜 Created new conversation: ${newConversation.id}`);
  return newConversation;
});

// Update a conversation (add messages, update title, etc.)
ipcMain.handle('chat-history:update', async (_event, conversationId: string, updates: Partial<ChatConversation>) => {
  const history = loadChatHistory();
  const index = history.conversations.findIndex(c => c.id === conversationId);
  
  if (index === -1) {
    log('⚠️ Conversation not found:', conversationId);
    return null;
  }
  
  // Merge updates
  history.conversations[index] = {
    ...history.conversations[index],
    ...updates,
    updatedAt: Date.now(),
  };
  
  saveChatHistory(history);
  return history.conversations[index];
});

// Add a message to a conversation
ipcMain.handle('chat-history:add-message', async (_event, conversationId: string, message: ChatMessage) => {
  log('📜 chat-history:add-message called:', { conversationId, role: message.role });
  const history = loadChatHistory();
  const index = history.conversations.findIndex(c => c.id === conversationId);
  
  if (index === -1) {
    log('⚠️ Conversation not found for message:', conversationId);
    return null;
  }
  
  history.conversations[index].messages.push(message);
  history.conversations[index].updatedAt = Date.now();
  
  // Auto-generate title from first user message if title is still default
  if (history.conversations[index].title === 'New Chat' && message.role === 'user') {
    const titleText = message.content.slice(0, 40);
    history.conversations[index].title = titleText + (message.content.length > 40 ? '...' : '');
    log('📜 Auto-titled conversation:', history.conversations[index].title);
  }
  
  saveChatHistory(history);
  log('📜 Message added, conversation now has', history.conversations[index].messages.length, 'messages');
  return history.conversations[index];
});

// Update a specific message in a conversation
ipcMain.handle('chat-history:update-message', async (_event, conversationId: string, messageId: string, updates: Partial<ChatMessage>) => {
  const history = loadChatHistory();
  const convIndex = history.conversations.findIndex(c => c.id === conversationId);
  
  if (convIndex === -1) return null;
  
  const msgIndex = history.conversations[convIndex].messages.findIndex(m => m.id === messageId);
  if (msgIndex === -1) return null;
  
  history.conversations[convIndex].messages[msgIndex] = {
    ...history.conversations[convIndex].messages[msgIndex],
    ...updates,
  };
  history.conversations[convIndex].updatedAt = Date.now();
  
  saveChatHistory(history);
  return history.conversations[convIndex];
});

// Delete a conversation
ipcMain.handle('chat-history:delete', async (_event, conversationId: string) => {
  const history = loadChatHistory();
  history.conversations = history.conversations.filter(c => c.id !== conversationId);
  
  if (history.activeConversationId === conversationId) {
    history.activeConversationId = history.conversations[0]?.id;
  }
  
  saveChatHistory(history);
  log(`🗑️ Deleted conversation: ${conversationId}`);
  return { success: true };
});

// Set active conversation
ipcMain.handle('chat-history:set-active', async (_event, conversationId: string) => {
  const history = loadChatHistory();
  history.activeConversationId = conversationId;
  saveChatHistory(history);
  return { success: true };
});

// Load all glyphs from both dynamic and library paths
ipcMain.handle('load-glyphs', async () => {
  const glyphs: any[] = [];
  const searchPaths = [dynamicGlyphPath, glyphLibraryPath];
  
  for (const basePath of searchPaths) {
    if (!fs.existsSync(basePath)) continue;
    
    const dirs = fs.readdirSync(basePath, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      
      const manifestPath = path.join(basePath, dir.name, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          // Use folder name as id if not present in manifest
          if (!manifest.id) {
            manifest.id = dir.name;
          }
          // Ensure manifest.json is always included in files list (for backward compatibility)
          if (manifest.files && !manifest.files.includes('manifest.json')) {
            manifest.files = ['manifest.json', ...manifest.files];
          } else if (!manifest.files) {
            // If no files array, scan directory for files
            const glyphDir = path.join(basePath, dir.name);
            const filesInDir = fs.readdirSync(glyphDir).filter(f => 
              fs.statSync(path.join(glyphDir, f)).isFile()
            );
            manifest.files = filesInDir;
          }
          // Avoid duplicates (same ID in both locations)
          if (!glyphs.find(g => g.id === manifest.id)) {
            glyphs.push(manifest);
          }
        } catch (err) {
          log('⚠️ Failed to load manifest:', manifestPath, err);
        }
      }
    }
  }
  
  // Sort by savedAt (newest first)
  glyphs.sort((a, b) => {
    const dateA = new Date(a.savedAt || 0).getTime();
    const dateB = new Date(b.savedAt || 0).getTime();
    return dateB - dateA;
  });
  
  log(`📦 Loaded ${glyphs.length} glyphs`);
  return glyphs;
});

// ════════════════════════════════════════════════════════════════════════════
// 📁 GLYPH FOLDER ORGANIZATION
// ════════════════════════════════════════════════════════════════════════════

const glyphFoldersPath = path.join(glyphLibraryPath, '_folders.json');

interface GlyphFolder {
  id: string;
  name: string;
  icon: string;
  collapsed?: boolean;
  glyphIds: string[];
  createdAt: string;
}

// Load folder organization data
ipcMain.handle('load-glyph-folders', async () => {
  try {
    if (fs.existsSync(glyphFoldersPath)) {
      const data = JSON.parse(fs.readFileSync(glyphFoldersPath, 'utf-8'));
      log(`📂 Loaded ${data.folders?.length || 0} folders`);
      return data;
    }
  } catch (err) {
    log('⚠️ Failed to load folders:', err);
  }
  // Return default structure
  return { folders: [], unassignedOrder: [] };
});

// Save folder organization data
ipcMain.handle('save-glyph-folders', async (event, data: { folders: GlyphFolder[]; unassignedOrder: string[] }) => {
  try {
    fs.writeFileSync(glyphFoldersPath, JSON.stringify(data, null, 2), 'utf-8');
    log(`💾 Saved ${data.folders?.length || 0} folders`);
    return { success: true };
  } catch (err) {
    log('❌ Failed to save folders:', err);
    return { success: false, error: String(err) };
  }
});

// Read a specific file from a glyph
ipcMain.handle('read-glyph-file', async (event, glyphId: string, fileName: string) => {
  const searchPaths = [dynamicGlyphPath, glyphLibraryPath];
  
  for (const basePath of searchPaths) {
    try {
      const safePath = resolveGlyphFilePath(path.join(basePath, glyphId), fileName);
      if (fs.existsSync(safePath)) {
        return fs.readFileSync(safePath, 'utf-8');
      }
    } catch (err) {
      log(`⚠️ Invalid glyph file read request: ${glyphId}/${fileName}`, err);
    }
  }
  
  throw new Error(`File not found: ${glyphId}/${fileName}`);
});

// Save a file to a glyph
ipcMain.handle('save-glyph-file', async (event, glyphId: string, fileName: string, content: string) => {
  log(`📝 save-glyph-file called: glyphId=${glyphId}, fileName=${fileName}, contentLength=${content.length}`);
  
  const searchPaths = [dynamicGlyphPath, glyphLibraryPath];
  log(`📝 Search paths: ${JSON.stringify(searchPaths)}`);
  
  for (const basePath of searchPaths) {
    const glyphDir = path.join(basePath, glyphId);
    log(`📝 Checking: ${glyphDir} exists=${fs.existsSync(glyphDir)}`);
    
    if (fs.existsSync(glyphDir)) {
      const filePath = resolveGlyphFilePath(glyphDir, fileName);
      log(`📝 Writing to: ${filePath}`);
      fs.writeFileSync(filePath, content, 'utf-8');
      log(`💾 Saved ${fileName} to ${glyphId} at ${filePath}`);
      
      // Broadcast glyph update to all windows so widgets can refresh
      // IMPORTANT: await the broadcast to ensure it completes before returning
      log(`📝 Starting broadcast for ${glyphId}...`);
      await broadcastGlyphUpdate(glyphId, fileName);
      log(`📝 Broadcast complete for ${glyphId}`);
      
      return { success: true };
    }
  }
  
  log(`❌ Glyph not found in any search path: ${glyphId}`);
  throw new Error(`Glyph not found: ${glyphId}`);
});

/**
 * Load fresh glyph data from disk, including resolved inputs from manifest.json
 * This ensures configuration changes persist across app restarts
 */
function loadFreshGlyphData(glyphId: string): { manifest: any; inputs: Record<string, unknown>; code: string } | null {
  const searchPaths = [dynamicGlyphPath, glyphLibraryPath];
  
  for (const basePath of searchPaths) {
    const glyphDir = path.join(basePath, glyphId);
    const manifestPath = path.join(glyphDir, 'manifest.json');
    
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const entryFile = manifest.entry
          || (fs.existsSync(path.join(glyphDir, 'index.html')) ? 'index.html' : 'index.tsx');
        const entryPath = path.join(glyphDir, entryFile);
        
        if (!fs.existsSync(entryPath)) {
          log(`⚠️ [loadFreshGlyphData] Entry file missing: ${entryFile} for ${glyphId}`);
          continue;
        }
        
        const code = fs.readFileSync(entryPath, 'utf-8');
        
        // Resolve inputs from manifest.inputs (value or defaultValue)
        const inputs: Record<string, unknown> = {};
        if (manifest.inputs && Array.isArray(manifest.inputs)) {
          for (const input of manifest.inputs) {
            if (input.value !== undefined) {
              inputs[input.id] = input.value;
            } else if (input.defaultValue !== undefined) {
              inputs[input.id] = input.defaultValue;
            }
          }
        }
        
        // Resolve linked keys from the secure vault
        if (manifest.linkedKeys && Array.isArray(manifest.linkedKeys) && manifest.linkedKeys.length > 0) {
          const keyValues = loadSecureKeysData();
          const keyMetadata = loadSecureKeysMetadata();
          const apiKeyInputs = (manifest.inputs || []).filter((i: GlyphInput) => i.type === 'apiKey');
          
          for (const keyId of manifest.linkedKeys) {
            if (keyValues[keyId]) {
              const meta = keyMetadata.find(k => k.id === keyId);
              const keyName = meta?.name || keyId;
              const keyNameLower = keyName.toLowerCase().replace(/\s+/g, '');
              
              let matchedInputId: string | null = null;
              for (const apiInput of apiKeyInputs) {
                const inputIdLower = apiInput.id.toLowerCase();
                const inputLabelLower = (apiInput.label || '').toLowerCase().replace(/\s+/g, '');
                const inputService = ((apiInput as any).service || '').toLowerCase();
                
                if (inputIdLower.includes(keyNameLower) || 
                    keyNameLower.includes(inputIdLower) ||
                    inputIdLower.includes(inputService) ||
                    inputLabelLower.includes(keyNameLower) ||
                    keyNameLower.includes(inputLabelLower)) {
                  matchedInputId = apiInput.id;
                  break;
                }
              }
              
              const inputKey = matchedInputId || keyNameLower;
              inputs[inputKey] = keyValues[keyId];
            }
          }
        }
        
        log(`📦 [loadFreshGlyphData] Loaded ${glyphId}: ${Object.keys(inputs).length} inputs resolved`);
        return { manifest, inputs, code };
      } catch (err) {
        log(`⚠️ [loadFreshGlyphData] Error loading ${glyphId}:`, err);
      }
    }
  }
  
  return null;
}

/**
 * Try to copy missing entry file from another glyph location
 * This handles cases where glyph was created in production but manifest exists in dev
 */
function tryRecoverMissingEntryFile(glyphId: string, entryFile: string, targetDir: string): boolean {
  const searchPaths = [dynamicGlyphPath, glyphLibraryPath];
  
  // Also check userData path explicitly (production glyphs location)
  const userDataGlyphPath = path.join(app.getPath('userData'), 'glyphs', 'dynamic');
  if (!searchPaths.includes(userDataGlyphPath)) {
    searchPaths.push(userDataGlyphPath);
  }
  
  for (const basePath of searchPaths) {
    if (basePath === targetDir) continue; // Skip the target directory itself
    
    const sourceDir = path.join(basePath, glyphId);
    const sourceFile = path.join(sourceDir, entryFile);
    
    if (fs.existsSync(sourceFile)) {
      try {
        const targetFile = path.join(targetDir, entryFile);
        fs.copyFileSync(sourceFile, targetFile);
        log(`📄 [Recovery] Copied missing ${entryFile} from ${sourceDir} to ${targetDir}`);
        return true;
      } catch (err) {
        log(`⚠️ [Recovery] Failed to copy ${entryFile}:`, err);
      }
    }
  }
  
  return false;
}

// Helper to broadcast glyph updates to all windows
async function broadcastGlyphUpdate(glyphId: string, changedFile: string) {
  log(`📢 Broadcasting glyph update: ${glyphId} (${changedFile})`);
  
  try {
    // Find and load the updated glyph data
    const searchPaths = [dynamicGlyphPath, glyphLibraryPath];
    
    for (const basePath of searchPaths) {
      const glyphDir = path.join(basePath, glyphId);
      const manifestPath = path.join(glyphDir, 'manifest.json');
      
      log(`🔍 Checking for manifest at: ${manifestPath}`);
      
      if (fs.existsSync(manifestPath)) {
        log(`✅ Found manifest at: ${manifestPath}`);
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const entryFile = manifest.entry
          || (fs.existsSync(path.join(glyphDir, 'index.html')) ? 'index.html' : 'index.tsx');
        const entryPath = path.join(glyphDir, entryFile);
        
        if (!fs.existsSync(entryPath)) {
          log(`⚠️ Entry file missing for glyph ${glyphId}: ${entryFile}, attempting recovery...`);
          // Try to recover the missing entry file from another location
          const recovered = tryRecoverMissingEntryFile(glyphId, entryFile, glyphDir);
          if (!recovered) {
            log(`❌ Could not recover entry file for glyph ${glyphId}: ${entryFile}`);
            return;
          }
        }
        
        const code = fs.readFileSync(entryPath, 'utf-8');
        log(`📄 Read code from ${entryFile}: ${code.length} chars`);
        
        // Resolve inputs for the update
        const inputs: Record<string, unknown> = {};
        
        if (manifest.inputs && Array.isArray(manifest.inputs)) {
          for (const input of manifest.inputs) {
            if (input.value !== undefined) {
              inputs[input.id] = input.value;
            } else if (input.defaultValue !== undefined) {
              inputs[input.id] = input.defaultValue;
            }
          }
        }
        
        // Resolve linked keys
        if (manifest.linkedKeys && Array.isArray(manifest.linkedKeys)) {
          const apiKeyInputs = (manifest.inputs || []).filter((i: any) => i.type === 'apiKey');
          
          for (const keyId of manifest.linkedKeys) {
            try {
              const keyData = getSecureKeyValue(keyId);
              if (keyData) {
                const keyNameLower = keyData.name.toLowerCase().replace(/\s+/g, '');
                
                let matchedInputId: string | null = null;
                for (const apiInput of apiKeyInputs) {
                  const inputIdLower = apiInput.id.toLowerCase();
                  const inputLabelLower = (apiInput.label || '').toLowerCase().replace(/\s+/g, '');
                  const inputService = (apiInput.service || '').toLowerCase();
                  
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
                inputs[inputKey] = keyData.value;
              }
            } catch (err) {
              log(`⚠️ Failed to resolve key ${keyId} for update:`, err);
            }
          }
        }
        
        const updateData = {
          glyphId,
          code,
          inputs,
          changedFile,
          manifest: {
            name: manifest.name,
            prompt: manifest.prompt,
          },
        };
        
        log(`📤 Broadcasting update data for ${glyphId}: code=${code.length}chars, inputs=${Object.keys(inputs).length}, changedFile=${changedFile}`);
        
        // Send to overlay (widgets in foreground)
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.webContents.send('glyph-updated', updateData);
          log(`📤 Sent glyph-updated to overlay`);
        } else {
          log(`⚠️ Overlay window not available for glyph-updated`);
        }
        
        // Send to ALL background windows (multi-monitor support)
        let backgroundSendCount = 0;
        for (const [displayId, win] of backgroundWindows.entries()) {
          if (win && !win.isDestroyed()) {
            win.webContents.send('glyph-updated', updateData);
            backgroundSendCount++;
            log(`📤 Sent glyph-updated to background display: ${displayId}`);
          }
        }
        
        if (backgroundSendCount === 0) {
          log(`⚠️ No background windows available for glyph-updated`);
        } else {
          log(`📤 Sent glyph-updated to ${backgroundSendCount} background window(s)`);
        }
        
        return;
      }
    }
    
    log(`❌ Glyph not found in any search path: ${glyphId}`);
  } catch (err) {
    log(`❌ Error broadcasting glyph update:`, err);
  }
}

// Helper to broadcast when glyph list changes (new glyph created)
function broadcastGlyphListChanged(glyphId: string) {
  log(`📢 Broadcasting glyph list changed: ${glyphId}`);
  
  // Send to overlay (where LoomPanel lives)
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('glyph-list-changed', { glyphId });
    log(`📤 Sent glyph-list-changed to overlay`);
  }
}

// Invoke a glyph to the screen (supports 'background' or 'widget' mode)
ipcMain.on('invoke-glyph', async (event, data: { glyphId: string; mode: 'background' | 'widget' }) => {
  const { glyphId, mode = 'background' } = typeof data === 'string' ? { glyphId: data, mode: 'background' as const } : data;
  log(`🔮 Invoking glyph: ${glyphId} as ${mode}`);
  
  // Find and load the glyph
  const searchPaths = [dynamicGlyphPath, glyphLibraryPath];
  
  for (const basePath of searchPaths) {
    const glyphDir = path.join(basePath, glyphId);
    const manifestPath = path.join(glyphDir, 'manifest.json');
    
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const entryFile = manifest.entry
        || (fs.existsSync(path.join(glyphDir, 'index.html')) ? 'index.html' : 'index.tsx');
      const entryPath = path.join(glyphDir, entryFile);

      if (!fs.existsSync(entryPath)) {
        log(`❌ Entry file missing for glyph ${glyphId}: ${entryFile}`);
        continue;
      }

      const code = fs.readFileSync(entryPath, 'utf-8');
      
      // 🔍 DIAGNOSTIC: Log what we're reading
      log(`📄 Reading glyph from: ${entryPath}`);
      log(`📄 Code length: ${code.length} chars`);
      log(`📄 Code preview (first 200): ${code.slice(0, 200)}`);
      log(`📄 Manifest name: ${manifest.name}, type: ${manifest.type}`);
      log(`📄 Manifest prompt length: ${manifest.prompt?.length || 0}`);
      
      // 🔐 Resolve inputs from manifest and linked keys
      const inputs: Record<string, unknown> = {};
      
      // First, extract values from manifest inputs (defaults and saved values)
      if (manifest.inputs && Array.isArray(manifest.inputs)) {
        for (const input of manifest.inputs) {
          if (input.value !== undefined) {
            inputs[input.id] = input.value;
          } else if (input.defaultValue !== undefined) {
            inputs[input.id] = input.defaultValue;
          }
        }
      }
      
      // Then, resolve linked keys from the secure vault
      if (manifest.linkedKeys && Array.isArray(manifest.linkedKeys) && manifest.linkedKeys.length > 0) {
        const keyValues = loadSecureKeysData();
        const keyMetadata = loadSecureKeysMetadata();
        
        // Get apiKey inputs from manifest for smart matching
        const apiKeyInputs = (manifest.inputs || []).filter((i: GlyphInput) => i.type === 'apiKey');
        
        for (const keyId of manifest.linkedKeys) {
          if (keyValues[keyId]) {
            const meta = keyMetadata.find(k => k.id === keyId);
            const keyName = meta?.name || keyId;
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
                  inputIdLower.includes(inputService) ||
                  inputLabelLower.includes(keyNameLower) ||
                  keyNameLower.includes(inputLabelLower)) {
                matchedInputId = apiInput.id;
                break;
              }
            }
            
            // Use matched input ID, or fall back to key name
            const inputKey = matchedInputId || keyNameLower;
            inputs[inputKey] = keyValues[keyId];
            log(`🔐 Resolved linked key: ${keyName} → ${inputKey}${matchedInputId ? ' (matched to manifest input)' : ''}`);
          }
        }
      }
      
      log(`📦 Resolved ${Object.keys(inputs).length} inputs for glyph`);
      
      if (mode === 'widget') {
        // Send widgets to OVERLAY for rendering (overlay is on top, interactive)
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          log(`📤 Sending to overlay: code=${code.length}chars, prompt=${(manifest.prompt || manifest.name).slice(0, 50)}...`);
          overlayWindow.webContents.send('widget-inject', {
            code,
            prompt: manifest.prompt || manifest.name,
            glyphId,
            inputs, // Include resolved inputs
          });
          log(`✨ Widget ${glyphId} sent to overlay`);
        }
      } else {
        // Send backgrounds to BACKGROUND window (full-screen wallpaper)
        if (backgroundWindow && !backgroundWindow.isDestroyed()) {
          log(`📤 Sending to background: code=${code.length}chars`);
          backgroundWindow.webContents.send('summon-inject', {
            code,
            prompt: manifest.prompt || manifest.name,
            mode: 'background',
            glyphId,
            type: manifest.type,
            inputs, // Include resolved inputs
          });
          log(`✨ Glyph ${glyphId} sent to background`);
          persistWallpaperState({
            code,
            prompt: manifest.prompt || manifest.name,
            glyphId,
            type: manifest.type,
            inputs, // Include resolved inputs
          });
        }
      }
      return;
    }
  }
  
  log(`❌ Glyph not found: ${glyphId}`);
});

// Handle widget layer changes (foreground/background toggle)
ipcMain.on('widget-layer-change', (event, data: { 
  widgetId: string; 
  widgetData: {
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
  } | null 
}) => {
  log(`📥 widget-layer-change received:`, JSON.stringify({
    widgetId: data.widgetId,
    hasWidgetData: !!data.widgetData,
    layer: data.widgetData?.layer,
    x: data.widgetData?.x,
    y: data.widgetData?.y,
    width: data.widgetData?.width,
    height: data.widgetData?.height,
    codeLength: data.widgetData?.code?.length,
  }));
  
  const { widgetId, widgetData } = data;
  
  // Helper to send to all background windows
  const sendToAllBackgrounds = (eventName: string, payload: any) => {
    let sendCount = 0;
    for (const [displayId, win] of backgroundWindows.entries()) {
      if (win && !win.isDestroyed()) {
        win.webContents.send(eventName, payload);
        sendCount++;
      }
    }
    return sendCount;
  };

  if (!widgetData) {
    // Widget being removed - notify ALL background windows to remove it
    log(`🗑️ Widget ${widgetId} removed from layer system`);
    const count = sendToAllBackgrounds('widget-layer-update', { widgetId, widgetData: null });
    log(`📤 Sent widget removal to ${count} background window(s)`);
    return;
  }
  
  log(`🔄 Widget ${widgetId} layer change: ${widgetData.layer}`);
  log(`📐 Widget dimensions: x=${widgetData.x}, y=${widgetData.y}, w=${widgetData.width}, h=${widgetData.height}`);
  
  if (widgetData.layer === 'background') {
    // Widget moving to background layer - send to ALL background windows
    log(`📤 Sending widget-layer-update to all background windows`);
    const count = sendToAllBackgrounds('widget-layer-update', { widgetId, widgetData });
    if (count > 0) {
      log(`✨ Widget ${widgetId} sent to ${count} background window(s)`);
    } else {
      log(`❌ No background windows available!`);
    }
  } else {
    // Widget moving to foreground - tell ALL background windows to remove it
    const count = sendToAllBackgrounds('widget-layer-update', { widgetId, widgetData: null });
    log(`✨ Widget ${widgetId} removed from ${count} background window(s) (now foreground)`);
  }
});

// Delete a glyph
ipcMain.handle('delete-glyph', async (event, glyphId: string) => {
  const searchPaths = [dynamicGlyphPath, glyphLibraryPath];
  
  for (const basePath of searchPaths) {
    const glyphDir = path.join(basePath, glyphId);
    if (fs.existsSync(glyphDir)) {
      fs.rmSync(glyphDir, { recursive: true, force: true });
      log(`🗑️ Deleted glyph: ${glyphId} from ${basePath}`);
    }
  }
  
  return { success: true };
});


// ════════════════════════════════════════════════════════════════════════════
// 📡 IPC HANDLERS
// ════════════════════════════════════════════════════════════════════════════

// Secure summon request from overlay
ipcMain.on('summon-request', async (event, data: { prompt: string; model?: string; linkedKeys?: string[] }) => {
  log('📨 summon-request received:', data.prompt, data.model ? `(model: ${data.model})` : '(auto)', data.linkedKeys?.length ? `(${data.linkedKeys.length} linked keys)` : '');
  
  // Forward to background for glyph injection
  if (backgroundWindow && !backgroundWindow.isDestroyed()) {
    backgroundWindow.webContents.send('summon-start', { prompt: data.prompt });
  }
  
  // Use overlayWindow.webContents directly instead of event.sender
  // This ensures we always send to the current overlay window, even if it was reloaded
  const targetWebContents = overlayWindow && !overlayWindow.isDestroyed() 
    ? overlayWindow.webContents 
    : event.sender;
  
  // Start LLM streaming from main process (secure)
  // Pass linkedKeys so they get saved to the manifest when the glyph is created
  await summonGlyph(data.prompt, targetWebContents, data.model, 0, undefined, undefined, undefined, data.linkedKeys);
});

// Chat request from overlay (conversational mode - no glyph generation)
ipcMain.on('chat-request', async (event, data: { message: string; model?: string; history?: RendererChatMessagePayload[] }) => {
  log(
    '💬 chat-request received:',
    data.message.slice(0, 50),
    data.model ? `(model: ${data.model})` : '(auto)',
    data.history?.length ? `(${data.history.length} history msgs)` : ''
  );
  
  const targetWebContents = overlayWindow && !overlayWindow.isDestroyed() 
    ? overlayWindow.webContents 
    : event.sender;
  
  await chatWithAI(data.message, data.history, targetWebContents, data.model);
});

// Get available models grouped by provider
ipcMain.handle('get-available-models', () => {
  const models = Object.values(AI_MODELS).map(model => ({
    id: model.id,
    name: model.label,
    provider: model.provider,
    available: !!apiKeys[model.provider],
    icon: model.icon,
  }));
  
  // Sort: available models first, then by provider, then by label
  return models.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    if (a.provider !== b.provider) {
      const orderDiff =
        (PROVIDER_ORDER.indexOf(a.provider) === -1 ? 999 : PROVIDER_ORDER.indexOf(a.provider)) -
        (PROVIDER_ORDER.indexOf(b.provider) === -1 ? 999 : PROVIDER_ORDER.indexOf(b.provider));
      if (orderDiff !== 0) return orderDiff;
    }
    const priorityDiff = (MODEL_PRIORITY[a.id] ?? 999) - (MODEL_PRIORITY[b.id] ?? 999);
    if (priorityDiff !== 0) return priorityDiff;
    return a.name.localeCompare(b.name);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 🖥️ MULTI-MONITOR SUPPORT
// ════════════════════════════════════════════════════════════════════════════

interface MonitorInfo {
  id: string;
  label: string;
  bounds: Electron.Rectangle;
  workArea: Electron.Rectangle;
  scaleFactor: number;
  isPrimary: boolean;
  rotation: number;
}

// Get all connected displays with metadata
ipcMain.handle('get-all-displays', () => {
  const allDisplays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  
  return allDisplays.map((display, index) => {
    const isPrimary = display.id === primaryDisplay.id;
    return {
      id: String(display.id),
      label: isPrimary ? `Display ${index + 1} (Primary)` : `Display ${index + 1}`,
      bounds: display.bounds,
      workArea: display.workArea,
      scaleFactor: display.scaleFactor,
      isPrimary,
      rotation: display.rotation,
    } as MonitorInfo;
  });
});

// Get the primary display info
ipcMain.handle('get-primary-display', () => {
  const primary = screen.getPrimaryDisplay();
  return {
    id: String(primary.id),
    label: 'Primary Display',
    bounds: primary.bounds,
    workArea: primary.workArea,
    scaleFactor: primary.scaleFactor,
    isPrimary: true,
    rotation: primary.rotation,
  } as MonitorInfo;
});

// Move background window to a specific display
ipcMain.handle('set-background-display', async (_event, displayId: string) => {
  const allDisplays = screen.getAllDisplays();
  const targetDisplay = allDisplays.find(d => String(d.id) === displayId);
  
  if (!targetDisplay) {
    log('❌ Display not found:', displayId);
    return { success: false, error: 'Display not found' };
  }
  
  if (!backgroundWindow || backgroundWindow.isDestroyed()) {
    log('❌ Background window not available');
    return { success: false, error: 'Background window not available' };
  }
  
  const { bounds } = targetDisplay;
  log('🖥️ Moving background to display:', displayId, bounds);
  
  // Detach from current wallpaper position
  detachBackgroundFromDesktop();
  
  // Update stored display info
  backgroundDisplayId = displayId;
  backgroundDisplayBounds = { ...bounds };
  
  // Apply new bounds
  applyBounds(backgroundWindow, displayId, bounds);
  
  // Re-attach as wallpaper
  attachBackgroundToDesktop({ force: true });
  
  log('✅ Background moved to display:', displayId);
  return { success: true };
});

// Get current background display info
ipcMain.handle('get-background-display', () => {
  return {
    displayId: backgroundDisplayId,
    bounds: backgroundDisplayBounds,
  };
});

// Get the total bounds spanning all displays (for overlay coordinate system)
ipcMain.handle('get-all-displays-bounds', () => {
  return getAllDisplaysBounds();
});

// Monitor backgrounds persistence path
const monitorBackgroundsPath = path.join(app.getPath('userData'), 'monitor-backgrounds.json');

interface MonitorBackgroundConfig {
  displayId: string;
  glyphId?: string;
  code?: string;
  prompt?: string;
  type?: string;
}

interface MonitorBackgroundsState {
  backgrounds: MonitorBackgroundConfig[];
  activeDisplayId?: string;
}

function loadMonitorBackgrounds(): MonitorBackgroundsState {
  try {
    if (fs.existsSync(monitorBackgroundsPath)) {
      const raw = fs.readFileSync(monitorBackgroundsPath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (error) {
    log('⚠️ Failed to load monitor backgrounds:', error);
  }
  return { backgrounds: [] };
}

function saveMonitorBackgrounds(state: MonitorBackgroundsState) {
  try {
    ensureDirectoryExists(path.dirname(monitorBackgroundsPath));
    fs.writeFileSync(monitorBackgroundsPath, JSON.stringify(state, null, 2));
  } catch (error) {
    log('⚠️ Failed to save monitor backgrounds:', error);
  }
}

// Get saved backgrounds for all monitors
ipcMain.handle('get-monitor-backgrounds', () => {
  return loadMonitorBackgrounds();
});

// Set background glyph for a specific monitor
ipcMain.handle('set-monitor-background', async (_event, config: MonitorBackgroundConfig) => {
  const state = loadMonitorBackgrounds();
  
  // Update or add the config for this display
  const existingIndex = state.backgrounds.findIndex(b => b.displayId === config.displayId);
  if (existingIndex >= 0) {
    state.backgrounds[existingIndex] = config;
  } else {
    state.backgrounds.push(config);
  }
  
  state.activeDisplayId = config.displayId;
  saveMonitorBackgrounds(state);
  
  // Apply the change to the specific display's background window
  if (config.code) {
    const win = backgroundWindows.get(config.displayId);
    if (win && !win.isDestroyed()) {
      log('🖥️ Applying background to display:', config.displayId);
      win.webContents.send('summon-inject', {
        code: config.code,
        prompt: config.prompt || 'Monitor Background',
        glyphId: config.glyphId,
        type: config.type,
        mode: 'background',
      });
    } else {
      log('⚠️ No background window found for display:', config.displayId);
    }
  }
  
  return { success: true };
});

// Clear background for a specific monitor
ipcMain.handle('clear-monitor-background', async (_event, displayId: string) => {
  const state = loadMonitorBackgrounds();
  state.backgrounds = state.backgrounds.filter(b => b.displayId !== displayId);
  saveMonitorBackgrounds(state);
  
  // Send clear command to the specific display's background window
  const win = backgroundWindows.get(displayId);
  if (win && !win.isDestroyed()) {
    log('🧹 Clearing background for display:', displayId);
    win.webContents.send('summon-clear');
  }
  
  return { success: true };
});

// Clear ALL monitor backgrounds
ipcMain.handle('clear-all-monitor-backgrounds', async () => {
  // Clear saved state
  saveMonitorBackgrounds({ backgrounds: [] });
  
  // Send clear command to ALL background windows
  for (const [displayId, win] of backgroundWindows.entries()) {
    if (win && !win.isDestroyed()) {
      log('🧹 Clearing background for display:', displayId);
      win.webContents.send('summon-clear');
    }
  }
  
  // Also clear legacy persisted wallpaper
  clearPersistedWallpaper();
  
  return { success: true };
});

// Forward completed code to background for compilation
ipcMain.on('summon-inject', (event, data: { code: string; prompt: string; type?: string; glyphId?: string; mode?: 'background' | 'widget' }) => {
  log('💉 ═══════════════════════════════════════════════════════════');
  log('💉 SUMMON-INJECT RECEIVED FROM OVERLAY');
  log('💉 Prompt:', data.prompt?.slice(0, 80));
  log('💉 Code length:', data.code?.length, 'chars');
  log('💉 Type:', data.type || 'unspecified');
  log('💉 Sender ID:', event.sender.id);
  log('💉 Background window:', !!backgroundWindow, '| destroyed:', backgroundWindow?.isDestroyed());
  
  if (backgroundWindow && !backgroundWindow.isDestroyed()) {
    log('💉 FORWARDING to background window...');
    backgroundWindow.webContents.send('summon-inject', data);
    log('💉 ✅ summon-inject SENT to background!');
  } else {
    log('💉 ❌ Cannot forward - background window not available!');
  }
  if (!data.mode || data.mode === 'background') {
    persistWallpaperState({
      code: data.code,
      prompt: data.prompt,
      glyphId: data.glyphId,
      type: data.type,
    });
  }
  log('💉 ═══════════════════════════════════════════════════════════');
});

// Handle glyph errors from background → forward to overlay for refinement
ipcMain.on('glyph-error', (event, data: { prompt: string; code: string; error: string }) => {
  log('❌ ═══════════════════════════════════════════════════════════');
  log('❌ GLYPH-ERROR RECEIVED FROM BACKGROUND!');
  log('❌ Error:', data.error?.slice(0, 100));
  log('❌ Prompt:', data.prompt?.slice(0, 80));
  log('❌ Code length:', data.code?.length, 'chars');
  log('❌ Overlay window:', !!overlayWindow, '| destroyed:', overlayWindow?.isDestroyed());
  
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    log('❌ 🔄 FORWARDING ERROR to overlay for auto-refinement...');
    overlayWindow.webContents.send('summon-error', { error: data.error });
    log('❌ ✅ summon-error SENT to overlay!');
  } else {
    log('❌ ❌ Cannot forward - overlay window not available!');
  }
  log('❌ ═══════════════════════════════════════════════════════════');
});

ipcMain.handle('background-interaction:get', async () => {
  log('[BackgroundInteraction] get-config', backgroundInteractionState);
  return backgroundInteractionState;
});

ipcMain.handle('background-interaction:toggle', async (_event, payload: { reason?: string } = {}) => {
  return toggleBackgroundInteraction({ reason: payload?.reason || 'ipc-request' });
});

ipcMain.on('background-interaction:debug', (_event, payload) => {
  try {
    log('[BackgroundInteraction] renderer-log', payload);
  } catch (_) {
    // renderer logging only
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 🪟 WINDOW CONTROLS — Mac-style minimize, maximize, close
// ═══════════════════════════════════════════════════════════════════════════

ipcMain.handle('window-control', async (event, action: 'close' | 'minimize' | 'maximize') => {
  // Find the BrowserWindow that sent this request
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) {
    log('[WindowControl] No valid window found for action:', action);
    return { success: false, error: 'Window not found' };
  }

  try {
    switch (action) {
      case 'close':
        // For the overlay window, just hide it (don't destroy)
        if (win === overlayWindow) {
          // Notify the renderer that we're closing
          win.webContents.send('loom-panel-closed');
        }
        log('[WindowControl] Close action - hiding window');
        break;
      case 'minimize':
        win.minimize();
        log('[WindowControl] Minimized window');
        break;
      case 'maximize':
        if (win.isMaximized()) {
          win.unmaximize();
          log('[WindowControl] Unmaximized window');
        } else {
          win.maximize();
          log('[WindowControl] Maximized window');
        }
        break;
      default:
        return { success: false, error: 'Unknown action' };
    }
    return { success: true, isMaximized: win.isMaximized() };
  } catch (error) {
    log('[WindowControl] Error:', error);
    return { success: false, error: String(error) };
  }
});

// Check if window is maximized
ipcMain.handle('window-is-maximized', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win && !win.isDestroyed() ? win.isMaximized() : false;
});

// Mouse capture for overlay UI hover
ipcMain.on('overlay-mouse-enter', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(false);
    // Bring to front when hovering over UI (but not alwaysOnTop)
    overlayWindow.moveTop();
  }
});

ipcMain.on('overlay-mouse-leave', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 BACKGROUND WINDOW INTERACTIVE CAPTURE
// When mouse enters an interactive glyph, capture mouse events so state.pointer works
// When mouse leaves, restore click-through so desktop icons work
// 
// IMPORTANT: We debounce the mouse leave to prevent flickering caused by rapid
// setIgnoreMouseEvents toggles on wallpaper-attached windows
// ═══════════════════════════════════════════════════════════════════════════

ipcMain.on('background-mouse-enter', () => {
  // Cancel any pending release
  if (backgroundMouseLeaveTimer) {
    clearTimeout(backgroundMouseLeaveTimer);
    backgroundMouseLeaveTimer = null;
  }

  if (backgroundInteractionState.enabled) {
    return;
  }
  
  if (backgroundWindow && !backgroundWindow.isDestroyed() && !backgroundMouseCaptured) {
    log('🎯 Background: Mouse entered interactive area - capturing mouse events');
    backgroundMouseCaptured = true;
    backgroundWindow.setIgnoreMouseEvents(false);
  }
});

ipcMain.on('background-mouse-leave', () => {
  // Cancel any existing timer
  if (backgroundMouseLeaveTimer) {
    clearTimeout(backgroundMouseLeaveTimer);
  }

  if (backgroundInteractionState.enabled) {
    return;
  }
  
  // Debounce the leave to prevent flickering from rapid enter/leave cycles
  backgroundMouseLeaveTimer = setTimeout(() => {
    backgroundMouseLeaveTimer = null;
    if (backgroundWindow && !backgroundWindow.isDestroyed() && backgroundMouseCaptured) {
      log('🎯 Background: Mouse left interactive area - restoring click-through');
      backgroundMouseCaptured = false;
      backgroundWindow.setIgnoreMouseEvents(true, { forward: true });
    }
  }, MOUSE_LEAVE_DEBOUNCE_MS);
});

// ════════════════════════════════════════════════════════════════════════════
// 🔐 SECURE API KEY STORAGE FOR GLYPHS
// ════════════════════════════════════════════════════════════════════════════

// Store glyph-specific API keys securely (encrypted in a separate file)
const glyphSecretsPath = path.join(app.getPath('userData'), 'glyph-secrets.json');

function loadGlyphSecrets(): Record<string, Record<string, string>> {
  try {
    if (fs.existsSync(glyphSecretsPath)) {
      const data = fs.readFileSync(glyphSecretsPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    log('⚠️ Failed to load glyph secrets:', err);
  }
  return {};
}

function saveGlyphSecrets(secrets: Record<string, Record<string, string>>): void {
  try {
    fs.writeFileSync(glyphSecretsPath, JSON.stringify(secrets, null, 2), 'utf-8');
    log('🔐 Glyph secrets saved');
  } catch (err) {
    log('❌ Failed to save glyph secrets:', err);
  }
}

// Save an API key for a specific glyph
ipcMain.handle('save-glyph-api-key', async (event, glyphId: string, keyName: string, keyValue: string) => {
  const secrets = loadGlyphSecrets();
  if (!secrets[glyphId]) {
    secrets[glyphId] = {};
  }
  secrets[glyphId][keyName] = keyValue;
  saveGlyphSecrets(secrets);
  log(`🔐 Saved API key "${keyName}" for glyph ${glyphId}`);
  return { success: true };
});

// Get an API key for a specific glyph (returns masked value for display)
ipcMain.handle('get-glyph-api-key', async (event, glyphId: string, keyName: string) => {
  const secrets = loadGlyphSecrets();
  const value = secrets[glyphId]?.[keyName];
  if (value) {
    // Return masked version for UI display
    const masked = value.length > 8 
      ? `${value.slice(0, 4)}${'*'.repeat(value.length - 8)}${value.slice(-4)}`
      : '*'.repeat(value.length);
    return { exists: true, masked };
  }
  return { exists: false, masked: '' };
});

// Get the actual API key value (for runtime use only)
ipcMain.handle('get-glyph-api-key-value', async (event, glyphId: string, keyName: string) => {
  const secrets = loadGlyphSecrets();
  return secrets[glyphId]?.[keyName] || null;
});

// Delete an API key for a specific glyph
ipcMain.handle('delete-glyph-api-key', async (event, glyphId: string, keyName: string) => {
  const secrets = loadGlyphSecrets();
  if (secrets[glyphId]?.[keyName]) {
    delete secrets[glyphId][keyName];
    if (Object.keys(secrets[glyphId]).length === 0) {
      delete secrets[glyphId];
    }
    saveGlyphSecrets(secrets);
    log(`🔐 Deleted API key "${keyName}" for glyph ${glyphId}`);
  }
  return { success: true };
});

// ════════════════════════════════════════════════════════════════════════════
// 🔐 SECURE USER KEY STORAGE — Using Windows DPAPI via safeStorage
// ════════════════════════════════════════════════════════════════════════════

interface StoredKeyMetadata {
  id: string;
  name: string;
  description?: string;
  category?: string;
  createdAt: number;
  updatedAt: number;
}

// Metadata file (not the actual secrets)
const secureKeysMetadataPath = path.join(app.getPath('userData'), 'secure-keys-metadata.json');
// Encrypted secrets file
const secureKeysDataPath = path.join(app.getPath('userData'), 'secure-keys-data.enc');

function loadSecureKeysMetadata(): StoredKeyMetadata[] {
  try {
    if (fs.existsSync(secureKeysMetadataPath)) {
      const data = fs.readFileSync(secureKeysMetadataPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    log('⚠️ Failed to load secure keys metadata:', err);
  }
  return [];
}

function saveSecureKeysMetadata(metadata: StoredKeyMetadata[]): void {
  try {
    fs.writeFileSync(secureKeysMetadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    log('🔐 Secure keys metadata saved');
  } catch (err) {
    log('❌ Failed to save secure keys metadata:', err);
  }
}

// Load encrypted key values (the actual secrets)
function loadSecureKeysData(): Record<string, string> {
  try {
    if (fs.existsSync(secureKeysDataPath) && safeStorage.isEncryptionAvailable()) {
      const encryptedBuffer = fs.readFileSync(secureKeysDataPath);
      const decrypted = safeStorage.decryptString(encryptedBuffer);
      return JSON.parse(decrypted);
    }
  } catch (err) {
    log('⚠️ Failed to load secure keys data:', err);
  }
  return {};
}

// Save encrypted key values
function saveSecureKeysData(data: Record<string, string>): void {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      log('⚠️ safeStorage encryption not available');
      return;
    }
    const encrypted = safeStorage.encryptString(JSON.stringify(data));
    fs.writeFileSync(secureKeysDataPath, encrypted);
    log('🔐 Secure keys data encrypted and saved');
  } catch (err) {
    log('❌ Failed to save secure keys data:', err);
  }
}

// Get a single secure key with its value and metadata
function getSecureKeyValue(keyId: string): { name: string; value: string } | null {
  try {
    const metadata = loadSecureKeysMetadata();
    const values = loadSecureKeysData();
    
    const keyMeta = metadata.find(k => k.id === keyId);
    const value = values[keyId];
    
    if (keyMeta && value) {
      return { name: keyMeta.name, value };
    }
  } catch (err) {
    log(`⚠️ Failed to get secure key value for ${keyId}:`, err);
  }
  return null;
}

// Get all stored keys (metadata only, no values)
ipcMain.handle('get-stored-keys', async () => {
  const metadata = loadSecureKeysMetadata();
  log(`🔐 Retrieved ${metadata.length} stored keys (metadata only)`);
  return metadata;
});

// Save a secure key (encrypts with Windows DPAPI)
ipcMain.handle('save-secure-key', async (event, keyId: string, keyData: {
  name: string;
  value: string;
  description?: string;
  category?: string;
}) => {
  try {
    // Load existing data
    const metadata = loadSecureKeysMetadata();
    const values = loadSecureKeysData();
    
    // Update or add metadata
    const existingIndex = metadata.findIndex(k => k.id === keyId);
    const now = Date.now();
    const keyMeta: StoredKeyMetadata = {
      id: keyId,
      name: keyData.name,
      description: keyData.description,
      category: keyData.category,
      createdAt: existingIndex >= 0 ? metadata[existingIndex].createdAt : now,
      updatedAt: now,
    };
    
    if (existingIndex >= 0) {
      metadata[existingIndex] = keyMeta;
    } else {
      metadata.push(keyMeta);
    }
    
    // Save the encrypted value
    values[keyId] = keyData.value;
    
    // Persist both
    saveSecureKeysMetadata(metadata);
    saveSecureKeysData(values);
    
    log(`🔐 Saved secure key "${keyData.name}" (${keyId})`);
    return { success: true };
  } catch (err) {
    log('❌ Failed to save secure key:', err);
    return { success: false, error: String(err) };
  }
});

// Get a specific key value (decrypted)
ipcMain.handle('get-secure-key-value', async (event, keyId: string) => {
  try {
    const values = loadSecureKeysData();
    const value = values[keyId];
    if (value) {
      log(`🔐 Retrieved secure key value for ${keyId}`);
      return { success: true, value };
    }
    return { success: false, error: 'Key not found' };
  } catch (err) {
    log('❌ Failed to get secure key value:', err);
    return { success: false, error: String(err) };
  }
});

// Get multiple key values at once (for prompt context)
ipcMain.handle('get-secure-key-values-batch', async (event, keyIds: string[]) => {
  try {
    const values = loadSecureKeysData();
    const metadata = loadSecureKeysMetadata();
    const result: Record<string, { name: string; value: string }> = {};
    
    for (const keyId of keyIds) {
      if (values[keyId]) {
        const meta = metadata.find(k => k.id === keyId);
        result[keyId] = {
          name: meta?.name || keyId,
          value: values[keyId],
        };
      }
    }
    
    log(`🔐 Retrieved ${Object.keys(result).length} secure key values (batch)`);
    return { success: true, keys: result };
  } catch (err) {
    log('❌ Failed to get secure key values batch:', err);
    return { success: false, error: String(err) };
  }
});

// Delete a secure key
ipcMain.handle('delete-secure-key', async (event, keyId: string) => {
  try {
    // Load existing data
    const metadata = loadSecureKeysMetadata();
    const values = loadSecureKeysData();
    
    // Remove from both
    const filteredMetadata = metadata.filter(k => k.id !== keyId);
    delete values[keyId];
    
    // Persist both
    saveSecureKeysMetadata(filteredMetadata);
    saveSecureKeysData(values);
    
    log(`🔐 Deleted secure key ${keyId}`);
    return { success: true };
  } catch (err) {
    log('❌ Failed to delete secure key:', err);
    return { success: false, error: String(err) };
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 🔑 LLM API KEY MANAGEMENT — For Grok, Gemini, OpenAI
// ════════════════════════════════════════════════════════════════════════════

// Get current LLM API key status (configured or not, masked values)
ipcMain.handle('get-llm-api-keys-status', async () => {
  try {
    const keys = loadLlmApiKeysFromSecureStorage();
    return {
      success: true,
      keys: {
        grok: {
          configured: !!keys.grok,
          masked: keys.grok ? `${keys.grok.slice(0, 8)}...${keys.grok.slice(-4)}` : null,
        },
        gemini: {
          configured: !!keys.gemini,
          masked: keys.gemini ? `${keys.gemini.slice(0, 8)}...${keys.gemini.slice(-4)}` : null,
        },
        openai: {
          configured: !!keys.openai,
          masked: keys.openai ? `${keys.openai.slice(0, 8)}...${keys.openai.slice(-4)}` : null,
        },
      },
    };
  } catch (err) {
    log('❌ Failed to get LLM API keys status:', err);
    return { success: false, error: String(err) };
  }
});

// Save an LLM API key (encrypts with Windows DPAPI)
ipcMain.handle('save-llm-api-key', async (event, provider: 'grok' | 'gemini' | 'openai', apiKey: string) => {
  try {
    // Load existing keys
    const keys = loadLlmApiKeysFromSecureStorage();
    
    // Update the specific key
    keys[provider] = apiKey;
    
    // Save back to secure storage
    const success = saveLlmApiKeysToSecureStorage(keys);
    
    if (success) {
      // Reload API keys so they take effect immediately
      reloadApiKeys();
      log(`🔐 Saved LLM API key for ${provider}`);
      return { success: true };
    } else {
      return { success: false, error: 'Failed to encrypt and save API key' };
    }
  } catch (err) {
    log('❌ Failed to save LLM API key:', err);
    return { success: false, error: String(err) };
  }
});

// Delete an LLM API key
ipcMain.handle('delete-llm-api-key', async (event, provider: 'grok' | 'gemini' | 'openai') => {
  try {
    // Load existing keys
    const keys = loadLlmApiKeysFromSecureStorage();
    
    // Remove the specific key
    delete keys[provider];
    
    // Save back to secure storage
    const success = saveLlmApiKeysToSecureStorage(keys);
    
    if (success) {
      // Reload API keys so the change takes effect immediately
      reloadApiKeys();
      log(`🔐 Deleted LLM API key for ${provider}`);
      return { success: true };
    } else {
      return { success: false, error: 'Failed to save after deletion' };
    }
  } catch (err) {
    log('❌ Failed to delete LLM API key:', err);
    return { success: false, error: String(err) };
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 🔗 GLYPH KEY LINKING — Connect secure vault keys to glyphs
// ════════════════════════════════════════════════════════════════════════════

// Get linked keys for a glyph (returns metadata only, no values)
ipcMain.handle('get-glyph-linked-keys', async (event, glyphId: string) => {
  try {
    const searchPaths = [dynamicGlyphPath, glyphLibraryPath];
    
    for (const basePath of searchPaths) {
      const manifestPath = path.join(basePath, glyphId, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const linkedKeyIds = manifest.linkedKeys || [];
        
        // Get metadata for these keys
        const allMetadata = loadSecureKeysMetadata();
        const linkedKeys = linkedKeyIds
          .map((keyId: string) => allMetadata.find(k => k.id === keyId))
          .filter(Boolean);
        
        return { success: true, linkedKeys };
      }
    }
    
    return { success: false, error: 'Glyph not found' };
  } catch (err) {
    log('❌ Failed to get glyph linked keys:', err);
    return { success: false, error: String(err) };
  }
});

// Link a key from the vault to a glyph
ipcMain.handle('link-key-to-glyph', async (event, glyphId: string, keyId: string) => {
  try {
    const searchPaths = [dynamicGlyphPath, glyphLibraryPath];
    
    for (const basePath of searchPaths) {
      const manifestPath = path.join(basePath, glyphId, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        
        // Initialize linkedKeys if needed
        if (!manifest.linkedKeys) {
          manifest.linkedKeys = [];
        }
        
        // Add key if not already linked
        if (!manifest.linkedKeys.includes(keyId)) {
          manifest.linkedKeys.push(keyId);
          fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
          log(`🔗 Linked key ${keyId} to glyph ${glyphId}`);
        }
        
        return { success: true };
      }
    }
    
    return { success: false, error: 'Glyph not found' };
  } catch (err) {
    log('❌ Failed to link key to glyph:', err);
    return { success: false, error: String(err) };
  }
});

// Unlink a key from a glyph
ipcMain.handle('unlink-key-from-glyph', async (event, glyphId: string, keyId: string) => {
  try {
    const searchPaths = [dynamicGlyphPath, glyphLibraryPath];
    
    for (const basePath of searchPaths) {
      const manifestPath = path.join(basePath, glyphId, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        
        // Remove key from linkedKeys
        if (manifest.linkedKeys) {
          manifest.linkedKeys = manifest.linkedKeys.filter((k: string) => k !== keyId);
          fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
          log(`🔓 Unlinked key ${keyId} from glyph ${glyphId}`);
        }
        
        return { success: true };
      }
    }
    
    return { success: false, error: 'Glyph not found' };
  } catch (err) {
    log('❌ Failed to unlink key from glyph:', err);
    return { success: false, error: String(err) };
  }
});

// Get resolved key values for a glyph (used when invoking)
ipcMain.handle('get-glyph-resolved-keys', async (event, glyphId: string) => {
  try {
    const searchPaths = [dynamicGlyphPath, glyphLibraryPath];
    
    for (const basePath of searchPaths) {
      const manifestPath = path.join(basePath, glyphId, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const linkedKeyIds = manifest.linkedKeys || [];
        
        if (linkedKeyIds.length === 0) {
          return { success: true, keys: {} };
        }
        
        // Get values for linked keys
        const values = loadSecureKeysData();
        const metadata = loadSecureKeysMetadata();
        const resolvedKeys: Record<string, { name: string; value: string }> = {};
        
        for (const keyId of linkedKeyIds) {
          if (values[keyId]) {
            const meta = metadata.find(k => k.id === keyId);
            resolvedKeys[keyId] = {
              name: meta?.name || keyId,
              value: values[keyId],
            };
          }
        }
        
        return { success: true, keys: resolvedKeys };
      }
    }
    
    return { success: false, error: 'Glyph not found' };
  } catch (err) {
    log('❌ Failed to get glyph resolved keys:', err);
    return { success: false, error: String(err) };
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 📁 GLYPH FILE UPLOAD HANDLING
// ════════════════════════════════════════════════════════════════════════════

// Save an uploaded file to a glyph's directory
ipcMain.handle('upload-glyph-file', async (event, glyphId: string, fileName: string, base64Data: string, mimeType: string) => {
  const searchPaths = [dynamicGlyphPath, glyphLibraryPath];
  
  for (const basePath of searchPaths) {
    const glyphDir = path.join(basePath, glyphId);
    if (fs.existsSync(glyphDir)) {
      // Create uploads subdirectory if needed
      const uploadsDir = path.join(glyphDir, 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      // Sanitize filename
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = path.join(uploadsDir, safeName);
      
      // Write the file
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(filePath, buffer);
      
      log(`📁 Uploaded file "${safeName}" to glyph ${glyphId} (${buffer.length} bytes)`);
      
      return {
        success: true,
        path: `uploads/${safeName}`,
        size: buffer.length,
        mimeType,
      };
    }
  }
  
  return { success: false, error: 'Glyph not found' };
});

// Read an uploaded file from a glyph's directory (returns base64)
ipcMain.handle('read-glyph-upload', async (event, glyphId: string, relativePath: string) => {
  const searchPaths = [dynamicGlyphPath, glyphLibraryPath];
  
  for (const basePath of searchPaths) {
    const filePath = path.join(basePath, glyphId, relativePath);
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      return {
        success: true,
        data: buffer.toString('base64'),
        size: buffer.length,
      };
    }
  }
  
  return { success: false, error: 'File not found' };
});

// Delete an uploaded file from a glyph's directory
ipcMain.handle('delete-glyph-upload', async (event, glyphId: string, relativePath: string) => {
  const searchPaths = [dynamicGlyphPath, glyphLibraryPath];
  
  for (const basePath of searchPaths) {
    const filePath = path.join(basePath, glyphId, relativePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      log(`🗑️ Deleted uploaded file from glyph ${glyphId}: ${relativePath}`);
      return { success: true };
    }
  }
  
  return { success: false, error: 'File not found' };
});

// ═══════════════════════════════════════════════════════════════════════════
// 📂 LOCAL FILE SYSTEM ACCESS FOR GLYPHS
// ═══════════════════════════════════════════════════════════════════════════

// Read a local file (for glyphs that need to view files)
ipcMain.handle('read-local-file', async (event, filePath: string) => {
  try {
    // Normalize the path
    const normalizedPath = path.normalize(filePath);
    
    // Check if file exists
    if (!fs.existsSync(normalizedPath)) {
      return { success: false, error: `File not found: ${normalizedPath}` };
    }
    
    // Get file stats
    const stats = fs.statSync(normalizedPath);
    
    if (stats.isDirectory()) {
      // If it's a directory, list contents
      const files = fs.readdirSync(normalizedPath).map(name => {
        const itemPath = path.join(normalizedPath, name);
        const itemStats = fs.statSync(itemPath);
        return {
          name,
          path: itemPath,
          isDirectory: itemStats.isDirectory(),
          size: itemStats.size,
          modified: itemStats.mtime.toISOString(),
        };
      });
      return { success: true, isDirectory: true, files, path: normalizedPath };
    }
    
    // For files, read content
    const ext = path.extname(normalizedPath).toLowerCase();
    const textExtensions = ['.txt', '.md', '.json', '.js', '.ts', '.tsx', '.jsx', '.html', '.css', '.scss', '.yaml', '.yml', '.xml', '.csv', '.log', '.env', '.gitignore', '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.sh', '.bat', '.ps1', '.sql', '.graphql', '.toml', '.ini', '.cfg'];
    
    if (textExtensions.includes(ext) || stats.size < 1024 * 1024) { // Read text files or files under 1MB
      const content = fs.readFileSync(normalizedPath, 'utf-8');
      return { 
        success: true, 
        isDirectory: false, 
        content, 
        path: normalizedPath,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        extension: ext,
      };
    } else {
      // For binary files, return base64
      const content = fs.readFileSync(normalizedPath);
      return { 
        success: true, 
        isDirectory: false, 
        content: content.toString('base64'),
        encoding: 'base64',
        path: normalizedPath,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        extension: ext,
      };
    }
  } catch (error: any) {
    log(`❌ Error reading local file: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// List directory contents
ipcMain.handle('list-directory', async (event, dirPath: string) => {
  try {
    const normalizedPath = path.normalize(dirPath || process.cwd());
    
    if (!fs.existsSync(normalizedPath)) {
      return { success: false, error: `Directory not found: ${normalizedPath}` };
    }
    
    const stats = fs.statSync(normalizedPath);
    if (!stats.isDirectory()) {
      return { success: false, error: `Not a directory: ${normalizedPath}` };
    }
    
    const files = fs.readdirSync(normalizedPath).map(name => {
      try {
        const itemPath = path.join(normalizedPath, name);
        const itemStats = fs.statSync(itemPath);
        return {
          name,
          path: itemPath,
          isDirectory: itemStats.isDirectory(),
          size: itemStats.size,
          modified: itemStats.mtime.toISOString(),
        };
      } catch {
        return { name, path: path.join(normalizedPath, name), isDirectory: false, size: 0, modified: '', error: true };
      }
    });
    
    return { 
      success: true, 
      path: normalizedPath,
      parent: path.dirname(normalizedPath),
      files 
    };
  } catch (error: any) {
    log(`❌ Error listing directory: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// Get home directory and common paths
ipcMain.handle('get-system-paths', async () => {
  return {
    home: require('os').homedir(),
    cwd: process.cwd(),
    desktop: path.join(require('os').homedir(), 'Desktop'),
    documents: path.join(require('os').homedir(), 'Documents'),
    downloads: path.join(require('os').homedir(), 'Downloads'),
  };
});

// Legacy summon-glyph for backwards compat
ipcMain.on('summon-glyph', (event, data) => {
  log('summon-glyph (legacy)', data);
  if (backgroundWindow && !backgroundWindow.isDestroyed()) {
    backgroundWindow.webContents.send('summon-glyph', data);
  }
});

ipcMain.on('summon-status', (event, data) => {
  log('summon-status', data);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('summon-status', data);
  }
});

ipcMain.on('summon-stream', (event, data) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('summon-stream', data);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 🚀 APP LIFECYCLE
// ════════════════════════════════════════════════════════════════════════════

app.whenReady().then(() => {
  log('app-ready');
  
  // Load API keys now that safeStorage is available
  reloadApiKeys();
  
  // THE SACRED SHORTCUT — Ctrl+Alt+S to toggle interaction
  const registered = globalShortcut.register('Control+Alt+S', () => {
    log('🔑 SUMMONER SHORTCUT TRIGGERED');
    toggleInteraction();
  });
  
  if (registered) {
    log('⌨️  Global shortcut registered: Ctrl+Alt+S (Summoner)');
  } else {
    log('❌ Failed to register Ctrl+Alt+S');
  }
  
  // Loom Panel shortcut — Ctrl+Alt+L to toggle the panel
  const loomPanelShortcut = globalShortcut.register('Control+Alt+L', () => {
    log('🔮 LOOM PANEL SHORTCUT TRIGGERED');
    toggleLoomPanel();
  });
  
  if (loomPanelShortcut) {
    log('⌨️  Global shortcut registered: Ctrl+Alt+L (Loom Panel)');
  } else {
    log('❌ Failed to register Ctrl+Alt+L');
  }
  
  // DevTools shortcut — Ctrl+Shift+D to toggle DevTools on overlay
  const devToolsOverlay = globalShortcut.register('Control+Shift+D', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      if (overlayWindow.webContents.isDevToolsOpened()) {
        overlayWindow.webContents.closeDevTools();
        log('🔧 Overlay DevTools closed');
      } else {
        overlayWindow.webContents.openDevTools({ mode: 'detach' });
        log('🔧 Overlay DevTools opened');
      }
    }
  });
  
  if (devToolsOverlay) {
    log('⌨️  Overlay DevTools: Ctrl+Shift+D');
  } else {
    log('❌ Failed to register Ctrl+Shift+D');
  }
  
  // DevTools shortcut — Ctrl+Shift+B to toggle DevTools on background
  const devToolsBackground = globalShortcut.register('Control+Shift+B', () => {
    if (backgroundWindow && !backgroundWindow.isDestroyed()) {
      if (backgroundWindow.webContents.isDevToolsOpened()) {
        backgroundWindow.webContents.closeDevTools();
        log('🔧 Background DevTools closed');
      } else {
        backgroundWindow.webContents.openDevTools({ mode: 'detach' });
        log('🔧 Background DevTools opened');
      }
    }
  });
  
  if (devToolsBackground) {
    log('⌨️  Background DevTools: Ctrl+Shift+B');
  } else {
    log('❌ Failed to register Ctrl+Shift+B');
  }

  // DevTools shortcut — Ctrl+Shift+C to open background DevTools (Chrome-style)
  const devToolsBackgroundAlt = globalShortcut.register('Control+Shift+C', () => {
    if (backgroundWindow && !backgroundWindow.isDestroyed()) {
      if (backgroundWindow.webContents.isDevToolsOpened()) {
        backgroundWindow.webContents.closeDevTools();
        log('🔧 Background DevTools closed (Ctrl+Shift+C)');
      } else {
        backgroundWindow.webContents.openDevTools({ mode: 'detach' });
        log('🔧 Background DevTools opened (Ctrl+Shift+C)');
      }
    }
  });

  if (devToolsBackgroundAlt) {
    log('⌨️  Background DevTools: Ctrl+Shift+C');
  } else {
    log('❌ Failed to register Ctrl+Shift+C');
  }

  refreshBackgroundShortcutBinding();
  
  // Install/update bundled glyphs (example glyphs that ship with the app)
  installBundledGlyphs();
  
  // Create system tray
  createTray();
  
  // Create both layers
  createBackgroundWindow();
  createOverlayWindow();
  
  // Open the Loom Panel by default on launch (rendered in overlay)
  setTimeout(() => {
    openLoomPanel();
  }, 1500); // Delay to let overlay initialize
  
  log('🎭 TWO-LAYER ARCHITECTURE INITIALIZED');
  log('   Layer 1: Background (Three.js wallpaper)');
  log('   Layer 2: Overlay (UI + Loom Panel)');
  log('⌨️  Press Ctrl+Alt+S to awaken the Summoner');
  log('⌨️  Press Ctrl+Alt+L to toggle the Loom Panel');
  log('🔔 System tray icon active');
  log('');
  log('🧙 LOOM SUMMONER v2 READY — Manifest reality');
  
  // ════════════════════════════════════════════════════════════════════════════
  // 🔄 AUTO-UPDATER — Check for updates after app is ready
  // ════════════════════════════════════════════════════════════════════════════
  if (!isDev) {
    // Check for updates 5 seconds after launch (don't block startup)
    setTimeout(() => {
      log('[Updater] 🔄 Initiating startup update check...');
      autoUpdater.checkForUpdates().catch((err: Error) => {
        log('[Updater] ⚠️  Startup update check failed:', err.message);
      });
    }, 5000);
    
    // Also check periodically (every 4 hours)
    setInterval(() => {
      log('[Updater] 🔄 Periodic update check...');
      autoUpdater.checkForUpdates().catch((err: Error) => {
        log('[Updater] ⚠️  Periodic update check failed:', err.message);
      });
    }, 4 * 60 * 60 * 1000);
  } else {
    log('[Updater] 🔧 Dev mode - auto-updates disabled');
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  log('window-all-closed');
  detachBackgroundFromDesktop();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  log('before-quit');
  detachBackgroundFromDesktop();
});
