/**
 * GLYPH IFRAME BUILDER
 * Converts generated glyph source into sandboxed iframe documents.
 * Supports both standalone HTML apps and legacy React Three Fiber TSX code.
 */

import { transform } from 'sucrase';

const REACT_CDN = 'https://esm.sh/react@18.3.1';
const REACT_DOM_CDN = 'https://esm.sh/react-dom@18.3.1/client';
const THREE_CDN = 'https://esm.sh/three@0.168.0';
const R3F_CDN = 'https://esm.sh/@react-three/fiber@8.15.15';
const DREI_CDN = 'https://esm.sh/@react-three/drei@9.88.18';

const LOOM_BRIDGE_SCRIPT = `<script>
(function() {
  // Create a bridge to parent window's loom API via postMessage
  const pendingRequests = new Map();
  let requestId = 0;
  
  // Listen for responses from parent
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'loom-response') {
      const { id, result } = event.data;
      const resolver = pendingRequests.get(id);
      if (resolver) {
        resolver(result);
        pendingRequests.delete(id);
      }
    }
  });
  
  // Helper to send request to parent and wait for response
  function sendRequest(method, args) {
    return new Promise((resolve) => {
      const id = ++requestId;
      pendingRequests.set(id, resolve);
      window.parent.postMessage({
        type: 'loom-request',
        id,
        method,
        args
      }, '*');
      // Timeout after 30s
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          resolve({ success: false, error: 'Request timed out' });
        }
      }, 30000);
    });
  }
  
  // Create window.loom API that mirrors the real one
  window.loom = {
    readLocalFile: (path) => sendRequest('readLocalFile', [path]),
    listDirectory: (path) => sendRequest('listDirectory', [path]),
    getSystemPaths: () => sendRequest('getSystemPaths', []),
    // Stub other methods that might be called
    readGlyphFile: (glyphId, fileName) => sendRequest('readGlyphFile', [glyphId, fileName]),
    saveGlyphFile: (glyphId, fileName, content) => sendRequest('saveGlyphFile', [glyphId, fileName, content]),
  };
  
  console.log('[Glyph] 🔮 Loom bridge initialized');
})();
</script>`;

function buildInputsScript(inputs?: Record<string, unknown>): string {
  if (!inputs) return '';
  const serialized = JSON.stringify(inputs).replace(/<\/(script)/gi, '<\\/$1');
  return `<script>window.GLYPH_INPUTS = ${serialized};</script>`;
}

export interface GlyphIframeOptions {
  glyphId?: string;
  glyphType?: string;
  background?: string;
  inputs?: Record<string, unknown>; // Dynamic input values to inject
}

export interface GlyphIframeResult {
  srcDoc: string | null;
  error: string | null;
  mode: 'html' | 'tsx';
}

const HTML_HINTS = ['<!doctype', '<html', '<body', '<head', '<canvas', '<svg'];
const JSX_HINTS = ['import ', 'export default', '@react-three', 'useFrame', 'useThree'];

function looksLikeHtml(code: string): boolean {
  const trimmed = code.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (HTML_HINTS.some((hint) => lower.includes(hint))) return true;
  if (JSX_HINTS.some((hint) => trimmed.includes(hint))) return false;
  return trimmed.startsWith('<');
}

function extractComponentName(code: string): string {
  const patterns = [
    /export\s+default\s+function\s+(\w+)/,
    /function\s+(\w+)\s*\(/,
    /const\s+(\w+)\s*=\s*\(/,
    /const\s+(\w+)\s*=\s*function/,
  ];
  for (const pattern of patterns) {
    const match = code.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return 'GeneratedGlyph';
}

function stripTypeScript(code: string): string {
  let result = code;
  result = result.replace(/interface\s+\w+\s*\{[\s\S]*?\}/g, '');
  result = result.replace(/type\s+\w+\s*=[\s\S]*?;/g, '');
  result = result.replace(/(<\s*\w+(?:\s*,\s*\w+)*\s*>)(?=\s*\()/g, '');
  result = result.replace(/\s+as\s+\w+(?:\[\])?/g, '');
  result = result.replace(/:\s*\[[\w\s,]+\]\[\]/g, '');
  result = result.replace(/:\s*\[[\w\s,]+\]/g, '');
  result = result.replace(/:\s*React\.\w+(?:<[^>]+>)?/g, '');
  result = result.replace(/:\s*THREE\.\w+(?:<[^>]+>)?/g, '');
  result = result.replace(/:\s*(string|number|boolean|any|void|null|undefined|never)(?=\s*[,\)\=\{])/g, '');
  result = result.replace(/:\s*\w+(?:\s*\|\s*\w+)+/g, '');
  result = result.replace(/:\s*\w+\[\]/g, '');
  result = result.replace(/\}:\s*\w+(?:\s*\))/g, '})');
  result = result.replace(/\}:\s*\{[^}]+\}\s*\)/g, '})');
  result = result.replace(/(const|let|var)\s+(\w+)\s*:\s*\{[^}]+\}\s*=/g, '$1 $2 =');
  result = result.replace(/:\s*[A-Z]\w*(?=\s*[,\)\=\{])/g, '');
  result = result.replace(/<THREE\.\w+\[\]>/g, '');
  result = result.replace(/<THREE\.\w+>/g, '');
  result = result.replace(/<\w+\[\]>/g, '');
  result = result.replace(/<\w+(?:\.\w+)?>/g, '');
  result = result.replace(/\):\s*\w+(?:\[\])?\s*(?=\{|=>)/g, ')');
  result = result.replace(/\):\s*React\.\w+(?:<[^>]+>)?\s*(?=\{|=>)/g, ')');
  result = result.replace(/\):\s*JSX\.Element\s*(?=\{|=>)/g, ')');
  result = result.replace(/=>\s*:\s*\w+/g, '=>');
  result = result.replace(/(\w+)\?:/g, '$1:');
  result = result.replace(/  +/g, ' ');
  return result;
}

function transpileCode(code: string): string {
  let cleaned = code
    .replace(/```(?:tsx?|typescript|javascript|jsx)?\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  if (!cleaned.startsWith('import') && !cleaned.startsWith('function') && !cleaned.startsWith('const')) {
    const importIndex = cleaned.indexOf('import');
    const functionIndex = cleaned.indexOf('function');
    const constIndex = cleaned.indexOf('const');
    const startIndex = Math.min(
      importIndex === -1 ? Infinity : importIndex,
      functionIndex === -1 ? Infinity : functionIndex,
      constIndex === -1 ? Infinity : constIndex
    );
    if (startIndex !== Infinity) {
      cleaned = cleaned.slice(startIndex);
    }
  }

  cleaned = cleaned
    .replace(/import\s+[\s\S]*?from\s*['"][^'"]+['"];?\n?/g, '')
    .replace(/import\s*{[\s\S]*?}\s*from\s*['"][^'"]+['"];?\n?/g, '')
    .replace(/import\s+\*\s+as\s+\w+\s+from\s*['"][^'"]+['"];?\n?/g, '');

  cleaned = stripTypeScript(cleaned);
  cleaned = cleaned.replace(/export\s+default\s+/, '');

  const hasClosingGroup = cleaned.includes('</group>');
  const returnMatch = cleaned.match(/return\s*\(\s*\n\s*(\{\/\*|<(?!group))/);
  if (hasClosingGroup && returnMatch) {
    cleaned = cleaned.replace(/return\s*\(\s*\n/, 'return (\n    <group>\n');
  }

  const openGroupCount = (cleaned.match(/<group/g) || []).length;
  const closeGroupCount = (cleaned.match(/<\/group>/g) || []).length;
  if (closeGroupCount > openGroupCount) {
    for (let i = 0; i < closeGroupCount - openGroupCount; i++) {
      cleaned = cleaned.replace(/return\s*\(\s*\n/, 'return (\n    <group>\n');
    }
  }

  const result = transform(cleaned, {
    transforms: ['jsx', 'typescript'],
    jsxRuntime: 'classic',
    jsxPragma: 'React.createElement',
    jsxFragmentPragma: 'React.Fragment',
  });
  return result.code;
}

function ensureHtmlDocument(code: string, options?: GlyphIframeOptions): string {
  const baseStyles = `
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: ${options?.background || 'transparent'};
      color: #fff;
      font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
    }
    canvas, svg {
      width: 100% !important;
      height: 100% !important;
      display: block;
    }
    * { box-sizing: border-box; }
  `;

  const inputsScript = buildInputsScript(options?.inputs);

  if (/<!doctype/i.test(code) || /<html/i.test(code)) {
    // Insert inputs script and loom bridge right after <head> or before first <script>
    let result = code;
    const injectScripts = LOOM_BRIDGE_SCRIPT + inputsScript;
    if (result.includes('<head>')) {
      result = result.replace('<head>', `<head>${injectScripts}`);
    } else if (result.includes('<body>')) {
      result = result.replace('<body>', `<body>${injectScripts}`);
    }
    if (result.includes('<style')) {
      return result.replace('</head>', `<style>${baseStyles}</style></head>`);
    }
    return result.replace('<head>', `<head><style>${baseStyles}</style>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${LOOM_BRIDGE_SCRIPT}
    ${inputsScript}
    <style>${baseStyles}</style>
  </head>
  <body>
    ${code}
  </body>
</html>`;
}

function createTsxFunctionBody(transpiledCode: string, componentName: string): string {
  return `
    const { useRef, useMemo, useState, useEffect, useCallback, createElement, Fragment } = React;
    const { useFrame, useThree } = ReactThreeFiber;
    const THREE = ThreeJS;
    const { 
      Text, Html, Billboard, Sparkles, Stars, Cloud, Sky, Float, 
      MeshDistortMaterial, MeshWobbleMaterial, GradientTexture, 
      Sphere, Box, Plane, Torus, TorusKnot, Cylinder, Cone, Ring, 
      Tetrahedron, Octahedron, Dodecahedron, Icosahedron, RoundedBox, 
      Capsule, Circle, Line, QuadraticBezierLine, CubicBezierLine,
      Trail, MeshReflectorMaterial, MeshTransmissionMaterial,
      Environment, Lightformer, useTexture, PointMaterial, Points
    } = Drei;

    ${transpiledCode}

    return ${componentName};
  `;
}

function buildTsxHtmlDocument(functionBody: string, options?: GlyphIframeOptions): string {
  const sanitizedBody = functionBody.replace(/<\/script>/gi, '<\\/script>');
  const glyphProps = JSON.stringify({
    glyphId: options?.glyphId || '',
    glyphType: options?.glyphType || 'object',
  });
  const inputsScript = buildInputsScript(options?.inputs);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${LOOM_BRIDGE_SCRIPT}
    ${inputsScript}
    <style>
      html, body, #root {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
      }
      canvas {
        display: block;
      }
      * { box-sizing: border-box; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
      import * as React from '${REACT_CDN}';
      import { createRoot } from '${REACT_DOM_CDN}';
      import * as ThreeJS from '${THREE_CDN}';
      import * as Fiber from '${R3F_CDN}';
      import * as Drei from '${DREI_CDN}';

      const { Canvas, useFrame, useThree } = Fiber;
      const functionBody = ${JSON.stringify(sanitizedBody)};
      const factory = new Function('React', 'ReactThreeFiber', 'ThreeJS', 'Drei', functionBody);
      const Component = factory(React, { useFrame, useThree }, ThreeJS, Drei);
      const glyphMeta = ${glyphProps};
      const glyphInputs = window.GLYPH_INPUTS || {};
      const defaultProps = Object.assign({ position: [0, 0, 0], scale: 1 }, glyphMeta, { inputs: glyphInputs });

      const root = createRoot(document.getElementById('root'));
      root.render(
        React.createElement(Canvas, {
          style: { width: '100%', height: '100%', background: 'transparent' },
          camera: { position: [0, 0, 500], fov: 60 },
          gl: { alpha: true, antialias: true, preserveDrawingBuffer: true }
        }, React.createElement(Component, defaultProps))
      );
    </script>
  </body>
</html>`;
}

export function buildGlyphIframe(code: string, options?: GlyphIframeOptions): GlyphIframeResult {
  try {
    const trimmed = code.trim();
    if (looksLikeHtml(trimmed)) {
      return { srcDoc: ensureHtmlDocument(trimmed, options), error: null, mode: 'html' };
    }

    const componentName = extractComponentName(trimmed);
    const transpiledCode = transpileCode(trimmed);
    const functionBody = createTsxFunctionBody(transpiledCode, componentName);
    const srcDoc = buildTsxHtmlDocument(functionBody, options);
    return { srcDoc, error: null, mode: 'tsx' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown compilation error';
    console.error('[GlyphIframe] Failed to build iframe document:', message);
    return { srcDoc: null, error: message, mode: 'tsx' };
  }
}

export default { buildGlyphIframe };
