/**
 * LOOM GLYPH TEMPLATES — Guides for generating standalone HTML glyphs
 */

export const GLYPH_SYSTEM_PROMPT = `You are LOOM, an AI that generates standalone HTML/CSS/JS glyphs for sandboxed iframes.
Return ONLY a JSON manifest with: { "name", "type", "entry": "index.html", "files": { "index.html": "<!DOCTYPE html>..." } }.

RULES FOR index.html:
1. Provide a complete HTML document with <head>, <style>, and <body>.
2. Set html/body to margin:0, padding:0, width/height:100%, background transparent.
3. Use inline CSS and <script type="module">; no React, no bundlers.
4. You may import modules from HTTPS CDNs (e.g., https://esm.sh/three@0.168.0).
5. Fill the viewport for "background" glyphs; keep objects/hud responsive (600–900px areas).
6. If interactivity is requested, add real event listeners with cleanup and animate elements accordingly.

📂 FILE SYSTEM ACCESS (window.loom APIs):
Glyphs can read local files using these APIs:
• window.loom.readLocalFile(path) → {success, content, isDirectory, files, error}
• window.loom.listDirectory(path) → {success, path, parent, files}
• window.loom.getSystemPaths() → {home, desktop, documents, downloads, cwd}

Example:
  const result = await window.loom.readLocalFile('C:/path/to/file.txt');
  if (result.success) console.log(result.content);

DO NOT use fetch() for local files - use window.loom.readLocalFile() instead.

🚫 SANDBOX CONSTRAINTS:
- NEVER use window.open() or open new browser windows/tabs
- NEVER use target="_blank" links or any navigation outside the iframe
- All functionality MUST render inside the iframe boundaries
- Display external URLs as copyable text, not clickable links

EXAMPLE SNIPPET:
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>html,body{margin:0;height:100%;background:transparent;overflow:hidden;}</style>
  </head>
  <body>
    <canvas id="scene"></canvas>
    <script type="module">
      import * as THREE from 'https://esm.sh/three@0.168.0';
      // render magic here
    </script>
  </body>
</html>`;

export const GLYPH_USER_PROMPT_TEMPLATE = (userRequest: string) => `
Create a standalone HTML/CSS/JS glyph for: "${userRequest}"

Requirements:
- Output a JSON manifest with entry "index.html".
- The HTML must be complete (doctype, head, styles, body) and self-contained.
- Import Three.js or other libs via HTTPS CDNs if needed.
- Keep the experience responsive to iframe resizing.

Return ONLY the JSON manifest.`;

export const LIVE_DATA_KEYWORDS = {
  bitcoin: { type: 'crypto', symbol: 'BTC' },
  btc: { type: 'crypto', symbol: 'BTC' },
  ethereum: { type: 'crypto', symbol: 'ETH' },
  eth: { type: 'crypto', symbol: 'ETH' },
  crypto: { type: 'crypto', symbol: 'BTC' },
  weather: { type: 'weather' },
  time: { type: 'time' },
  clock: { type: 'time' },
  date: { type: 'date' },
  stock: { type: 'stock' },
  cpu: { type: 'system', metric: 'cpu' },
  memory: { type: 'system', metric: 'memory' },
  ram: { type: 'system', metric: 'memory' },
};

export const extractDataRequirements = (prompt: string): string[] => {
  const requirements: string[] = [];
  const lowerPrompt = prompt.toLowerCase();
  
  for (const [keyword, config] of Object.entries(LIVE_DATA_KEYWORDS)) {
    if (lowerPrompt.includes(keyword)) {
      requirements.push(JSON.stringify(config));
    }
  }
  
  return requirements;
};

export const QUICK_GLYPH_TEMPLATES: Record<string, string> = {
  'floating cube': `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <style>
      html, body { margin:0; height:100%; background:transparent; display:flex; align-items:center; justify-content:center; }
      .cube {
        width: min(50vw, 360px);
        height: min(50vw, 360px);
        position: relative;
        transform-style: preserve-3d;
        animation: spin 12s linear infinite;
      }
      .cube span {
        position: absolute;
        inset: 0;
        border: 2px solid rgba(100, 149, 237, 0.6);
        border-radius: 18px;
        box-shadow: 0 0 25px rgba(65, 105, 225, 0.45);
      }
      .cube span:nth-child(2) { transform: rotateY(90deg); }
      .cube span:nth-child(3) { transform: rotateX(90deg); }
      .cube span:nth-child(4) { transform: rotateX(45deg); }
      @keyframes spin {
        to { transform: rotateX(360deg) rotateY(360deg); }
      }
    </style>
  </head>
  <body>
    <div class="cube">
      <span></span><span></span><span></span><span></span>
    </div>
  </body>
</html>`,
  
  'particle storm': `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <style>
      html, body { margin:0; height:100%; background:#0a0a12; }
      canvas { width:100%; height:100%; display:block; }
    </style>
  </head>
  <body>
    <canvas id="storm"></canvas>
    <script>
      const canvas = document.getElementById('storm');
      const ctx = canvas.getContext('2d');
      const colors = ['#f4a261', '#e76f51', '#2a9d8f', '#264653', '#e9c46a'];
      const particles = Array.from({ length: 350 }, () => ({
        x: Math.random(),
        y: Math.random(),
        z: Math.random(),
        color: colors[Math.floor(Math.random() * colors.length)]
      }));

      function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
      window.addEventListener('resize', resize);
      resize();

      function render(time) {
        ctx.fillStyle = 'rgba(10, 10, 18, 0.3)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        particles.forEach(p => {
          const depth = (Math.sin(time * 0.0002 + p.z * 6.28) + 1) * 0.5;
          const size = 1 + depth * 3;
          const px = (p.x + Math.sin(time * 0.0001 + p.z) * 0.05) * canvas.width;
          const py = (p.y + Math.cos(time * 0.00015 + p.z * 2) * 0.05) * canvas.height;

          ctx.beginPath();
          ctx.fillStyle = p.color;
          ctx.globalAlpha = 0.4 + depth * 0.6;
          ctx.arc(px, py, size, 0, Math.PI * 2);
          ctx.fill();
        });

        ctx.globalAlpha = 1;
        requestAnimationFrame(render);
      }
      requestAnimationFrame(render);
    </script>
  </body>
</html>`,
};

