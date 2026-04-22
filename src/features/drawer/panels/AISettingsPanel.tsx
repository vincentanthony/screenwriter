import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AIError, provider } from '@/ai';
import {
  clearApiKey,
  maskApiKey,
  readApiKey,
  writeApiKey,
} from '@/ai/apiKeyStore';
import { DEFAULT_MODEL } from '@/ai/anthropic';
import { computeCostFineCents, formatCostFineCents } from '@/ai/pricing';

/**
 * AI Settings — API key entry + test-connection.
 *
 * This panel is the canonical surface for AI configuration, replacing
 * the standalone top-bar button from commit 2a. Two modes:
 *
 *   No key stored  → text input + Save
 *   Key stored     → masked display + Replace / Remove
 *
 * "Test connection" sends a one-shot hello-world call through the
 * provider and shows the response + the cost of that single call,
 * so users see the cost mechanism working before they commit to
 * real feature usage.
 *
 * The model field is read-only for now — swapping requires a code
 * change. That's intentional; we don't want to expose model choice
 * UI before we've thought through the defaults / pricing display.
 */

export function AISettingsPanel() {
  const [stored, setStored] = useState<string | null>(() => readApiKey());
  // Track whether we're in "enter a new key" mode: either no key
  // exists, or the user clicked Replace.
  const [entering, setEntering] = useState<boolean>(() => readApiKey() === null);
  const [draftKey, setDraftKey] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Test-connection transient state.
  const [testState, setTestState] = useState<
    | { kind: 'idle' }
    | { kind: 'sending' }
    | { kind: 'ok'; text: string; costLabel: string }
    | { kind: 'error'; text: string }
  >({ kind: 'idle' });

  // If the key was cleared or changed elsewhere (e.g. from the Usage
  // page clearing records + unknown state nudge), keep our view in
  // sync. Re-reads on mount.
  useEffect(() => {
    setStored(readApiKey());
  }, []);

  const handleSave = useCallback(() => {
    setSaveError(null);
    const trimmed = draftKey.trim();
    if (trimmed.length === 0) {
      setSaveError('Paste your Anthropic API key first.');
      return;
    }
    writeApiKey(trimmed);
    setStored(trimmed);
    setDraftKey('');
    setEntering(false);
    setTestState({ kind: 'idle' });
  }, [draftKey]);

  const handleReplace = useCallback(() => {
    setEntering(true);
    setDraftKey('');
    setSaveError(null);
    setTestState({ kind: 'idle' });
  }, []);

  const handleRemove = useCallback(async () => {
    clearApiKey();
    setStored(null);
    setEntering(true);
    setTestState({ kind: 'idle' });
    // Let the provider clean up any internal state it might hold.
    await provider.signOut();
  }, []);

  const handleTest = useCallback(async () => {
    setTestState({ kind: 'sending' });
    try {
      const resp = await provider.generateResponse({
        feature: 'hello-world',
        messages: [{ role: 'user', content: 'Say hello in one sentence.' }],
      });
      const fine =
        resp.usage !== undefined
          ? computeCostFineCents(
              DEFAULT_MODEL,
              resp.usage.inputTokens,
              resp.usage.outputTokens,
            )
          : 0;
      setTestState({
        kind: 'ok',
        text: resp.content || '(empty response)',
        costLabel: formatCostFineCents(fine),
      });
    } catch (err) {
      const msg =
        err instanceof AIError ? err.message : 'Test call failed.';
      setTestState({ kind: 'error', text: msg });
    }
  }, []);

  return (
    <div className="space-y-5 text-sm">
      <section className="space-y-1.5">
        <Label>Provider</Label>
        <p className="text-muted-foreground">Anthropic (Claude)</p>
      </section>

      <section className="space-y-1.5">
        <Label>Model</Label>
        <p className="text-muted-foreground">{DEFAULT_MODEL}</p>
      </section>

      <section className="space-y-2">
        <Label htmlFor="anthropic-api-key">API key</Label>

        {!entering && stored !== null && (
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded border bg-muted px-2 py-1 text-xs">
              {maskApiKey(stored)}
            </code>
            <Button size="sm" variant="outline" onClick={handleReplace}>
              Replace
            </Button>
            <Button size="sm" variant="outline" onClick={handleRemove}>
              Remove
            </Button>
          </div>
        )}

        {entering && (
          <>
            <Input
              id="anthropic-api-key"
              type="password"
              placeholder="sk-ant-api03-…"
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSave();
                }
              }}
              autoComplete="off"
              spellCheck={false}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={handleSave}>
                Save
              </Button>
              {stored !== null && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEntering(false);
                    setDraftKey('');
                    setSaveError(null);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
            {saveError && (
              <p role="alert" className="text-destructive">
                {saveError}
              </p>
            )}
          </>
        )}

        <p className="text-xs text-muted-foreground">
          Get your API key from{' '}
          <a
            href="https://console.anthropic.com/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline hover:no-underline"
          >
            console.anthropic.com
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
          . This key is stored locally in your browser only.
        </p>
      </section>

      {stored !== null && !entering && (
        <section className="space-y-2">
          <Button
            size="sm"
            onClick={handleTest}
            disabled={testState.kind === 'sending'}
          >
            {testState.kind === 'sending' ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Sending…
              </>
            ) : (
              'Test connection'
            )}
          </Button>
          {testState.kind === 'ok' && (
            <div
              className="rounded-md border bg-muted px-3 py-2 text-xs"
              data-testid="ai-test-result"
            >
              <p className="mb-1">{testState.text}</p>
              <p className="text-muted-foreground">
                Cost: {testState.costLabel}
              </p>
            </div>
          )}
          {testState.kind === 'error' && (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {testState.text}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
