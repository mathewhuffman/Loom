import { useEffect, useMemo, useState, useCallback } from 'react';
import GlyphIframe from './components/GlyphIframe';

interface GlyphInstance {
  id: string;
  glyphId?: string;
  code: string;
  prompt: string;
  createdAt: number;
  inputs?: Record<string, unknown>;
}

function DefaultBackdrop() {
  const stripes = useMemo(() => Array.from({ length: 6 }, (_, i) => i), []);
  return (
    <div className="loom-default">
      <div className="loom-default__grid">
        {stripes.map((i) => (
          <span key={i} className="loom-default__stripe" />
        ))}
      </div>
      <div className="loom-default__title">
        <div>LOOM</div>
        <small>Summoner v2 · Manifest reality</small>
      </div>
    </div>
  );
}

function SummoningIndicator({ prompt }: { prompt: string }) {
  return (
    <div className="loom-summoning">
      <div className="loom-summoning__pulse" />
      <p>Channeling — “{prompt.slice(0, 120)}{prompt.length > 120 ? '…' : ''}”</p>
    </div>
  );
}

export default function LoomScene() {
  const [backgroundGlyph, setBackgroundGlyph] = useState<GlyphInstance | null>(null);
  const [summoningPrompt, setSummoningPrompt] = useState<string | null>(null);

  const handleSummonStart = useCallback((data: { prompt: string }) => {
    setSummoningPrompt(data.prompt);
  }, []);

  const handleInject = useCallback((data: { code: string; prompt: string; glyphId?: string; inputs?: Record<string, unknown> }) => {
    console.log('[Background] 📥 summon-inject received', {
      glyphId: data.glyphId,
      codeLength: data.code?.length,
      promptPreview: data.prompt?.slice(0, 80),
      inputsCount: data.inputs ? Object.keys(data.inputs).length : 0,
    });
    const glyph: GlyphInstance = {
      id: `glyph-${Date.now()}`,
      glyphId: data.glyphId,
      code: data.code,
      prompt: data.prompt,
      createdAt: Date.now(),
      inputs: data.inputs,
    };

    setSummoningPrompt(null);
    console.log('[Background] 🌌 Setting background glyph', glyph.glyphId || glyph.id);
    setBackgroundGlyph(glyph);
    console.log('[Background] ✅ Glyph enqueued for rendering');
  }, []);

  const handleSummonComplete = useCallback(() => {
    setSummoningPrompt(null);
  }, []);

  const handleSummonClear = useCallback(() => {
    console.log('[Background] 🧹 summon-clear received - clearing background glyph');
    setSummoningPrompt(null);
    setBackgroundGlyph(null);
  }, []);

  useEffect(() => {
    if (!window.loom) return;
    const unsubs: Array<(() => void) | undefined> = [];

    unsubs.push(
      window.loom.onSummonStart?.(handleSummonStart),
      window.loom.onSummonInject?.(handleInject),
      window.loom.onSummonComplete?.(handleSummonComplete),
      window.loom.onSummonClear?.(handleSummonClear),
    );

    return () => {
      unsubs.forEach((unsub) => unsub && unsub());
    };
  }, [handleSummonStart, handleInject, handleSummonComplete, handleSummonClear]);

  useEffect(() => {
    if (!window.loom?.onGlyphUpdated) return;
    const unsubscribe = window.loom.onGlyphUpdated((data: {
      glyphId: string;
      code: string;
      inputs?: Record<string, unknown>;
    }) => {
      setBackgroundGlyph(prev => {
        if (!prev) return prev;
        const prevId = prev.glyphId || prev.id;
        if (prevId !== data.glyphId) return prev;
        return {
          ...prev,
          code: data.code,
          inputs: data.inputs ?? prev.inputs,
          createdAt: Date.now(),
        };
      });
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  return (
    <div className="loom-background-root">
      {backgroundGlyph ? (
        <GlyphIframe
          code={backgroundGlyph.code}
          glyphId={backgroundGlyph.glyphId || backgroundGlyph.id}
          glyphType="background"
          title="loom-background"
          inputs={backgroundGlyph.inputs}
        />
      ) : (
        <DefaultBackdrop />
      )}

      {summoningPrompt && <SummoningIndicator prompt={summoningPrompt} />}
    </div>
  );
}
