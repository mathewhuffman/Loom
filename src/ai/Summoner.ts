/**
 * LOOM SUMMONER — SUMMONER v1
 * 
 * ⚠️ NOTE: In SUMMONER v1, all LLM API calls happen in the MAIN PROCESS
 * for security (API keys never exposed to renderer).
 * 
 * This file is kept for quick glyph templates and fallback generation.
 * The actual streaming happens via IPC from main.ts
 */

import { QUICK_GLYPH_TEMPLATES, extractDataRequirements } from './glyphTemplates';

export interface SummonResult {
  code: string;
  dataRequirements: string[];
  error?: string;
}

export type StreamCallback = (chunk: string, done: boolean) => void;

/**
 * SUMMONER v1 — Quick template matching (no API needed)
 * For full AI generation, use window.loom.summonRequest() which
 * routes through the secure main process
 */
class Summoner {
  /**
   * Check for quick template match before hitting AI
   */
  checkQuickTemplate(prompt: string): string | null {
    const lowerPrompt = prompt.toLowerCase().trim();
    for (const [key, template] of Object.entries(QUICK_GLYPH_TEMPLATES)) {
      if (lowerPrompt.includes(key)) {
        console.log('[Summoner] Quick template match:', key);
        return template;
      }
    }
    return null;
  }

  /**
   * Extract data requirements from prompt
   */
  getDataRequirements(prompt: string): string[] {
    return extractDataRequirements(prompt);
  }

  /**
   * Generate a fallback glyph when AI fails
   */
  generateFallbackGlyph(prompt: string): string {
    const words = prompt.split(' ').slice(0, 3).join(' ').toUpperCase();
    return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <style>
      html, body { margin:0; height:100%; background:transparent; font-family:'Inter','Helvetica Neue',sans-serif; }
      .wrapper {
        position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
        background: radial-gradient(ellipse at center, rgba(30,30,45,0.9), rgba(15,15,25,0.98));
      }
      .glyph {
        width: min(70vw, 480px);
        height: min(70vw, 480px);
        border-radius: 50%;
        border: 2px solid rgba(100, 149, 237, 0.5);
        box-shadow: 0 0 60px rgba(100, 149, 237, 0.2);
        position: relative;
        animation: spin 20s linear infinite;
      }
      .glyph::after {
        content: '${words}';
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        letter-spacing: 0.3em;
        font-size: 0.9em;
        font-weight: 300;
        color: rgba(255,255,255,0.85);
        text-shadow: 0 2px 20px rgba(100, 149, 237, 0.5);
      }
      .pulse {
        position:absolute; inset:10%;
        border: 1px solid rgba(255,255,255,0.15);
        border-radius:50%;
        animation: pulse 4s ease-in-out infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes pulse {
        0% { transform: scale(0.9); opacity:0.3; }
        50% { transform: scale(1.1); opacity:0.7; }
        100% { transform: scale(0.9); opacity:0.3; }
      }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="glyph"><div class="pulse"></div></div>
    </div>
  </body>
</html>`.trim();
  }
}

// Singleton instance
export const summoner = new Summoner();
export default Summoner;
