import { useCallback, useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { AIError, provider } from '@/ai';
import { readTokens, type StoredTokens } from '@/ai/tokenStore';
import { readAndClearOAuthCompletion } from '@/ai/openaiCodex';

/**
 * Top-bar "AI" button + settings dialog.
 *
 * This commit's scope is just: can we auth, can we round-trip a
 * chat completion, can we show the result. Nothing more — no scene
 * feedback, no Cmd+K, no prompt editor.
 *
 * State machine for the Test-connection button:
 *   idle   → user clicks → sending → (ok | error) → idle (next click)
 * Kept as plain component state because there's no cross-component
 * need to observe it.
 *
 * Signed-in detection:
 *   - On mount, read tokens directly from storage.
 *   - After the OAuth redirect completes, /oauth/callback writes an
 *     OAuthCompletion record. We also check for that when the dialog
 *     opens, so if the user returns to this tab mid-flow we can
 *     reflect the outcome without a hard reload.
 */
export function AISettingsButton() {
  const [open, setOpen] = useState(false);
  const [tokens, setTokens] = useState<StoredTokens | null>(() => readTokens());
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  // Test-connection transient state.
  const [testState, setTestState] = useState<
    | { kind: 'idle' }
    | { kind: 'sending' }
    | { kind: 'ok'; text: string }
    | { kind: 'error'; text: string }
  >({ kind: 'idle' });

  // When the dialog opens, re-read tokens and drain any completion
  // record left behind by the OAuth callback page. This is how the
  // editor tab "wakes up" after the redirect round-trip completes.
  useEffect(() => {
    if (!open) return;
    const completion = readAndClearOAuthCompletion();
    if (completion && !completion.ok && completion.error) {
      setSignInError(completion.error);
    }
    setTokens(readTokens());
  }, [open]);

  const handleSignIn = useCallback(async () => {
    setSigningIn(true);
    setSignInError(null);
    try {
      // signIn() navigates away; in practice this Promise never
      // resolves in the initiating tab. We still await it for the
      // synthetic test path and so an unhandled rejection can't escape.
      await provider.signIn();
    } catch (err) {
      const msg =
        err instanceof AIError ? err.message : 'Could not start sign-in.';
      setSignInError(msg);
      setSigningIn(false);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    await provider.signOut();
    setTokens(null);
    setTestState({ kind: 'idle' });
  }, []);

  const handleTest = useCallback(async () => {
    setTestState({ kind: 'sending' });
    try {
      const resp = await provider.generateResponse({
        messages: [{ role: 'user', content: 'Say hello in one sentence.' }],
      });
      setTestState({ kind: 'ok', text: resp.content || '(empty response)' });
    } catch (err) {
      const msg =
        err instanceof AIError ? err.message : 'Test call failed.';
      setTestState({ kind: 'error', text: msg });
    }
  }, []);

  const authed = tokens !== null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label="AI settings">
          <Sparkles className="h-4 w-4" aria-hidden />
          AI
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI — {provider.name}</DialogTitle>
          <DialogDescription>
            {authed
              ? 'Connected. You can run a test call below.'
              : 'Connect to OpenAI with your ChatGPT subscription.'}
          </DialogDescription>
        </DialogHeader>

        {!authed && (
          <>
            {signInError && (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {signInError}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSignIn} disabled={signingIn}>
                {signingIn ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Opening sign-in…
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {authed && (
          <>
            <div className="space-y-1 text-sm">
              <p className="font-medium">Signed in</p>
              {tokens?.email && (
                <p className="text-muted-foreground">{tokens.email}</p>
              )}
            </div>

            {/* Test-connection result panel */}
            {testState.kind !== 'idle' && (
              <div
                className={
                  testState.kind === 'error'
                    ? 'rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
                    : 'rounded-md border bg-muted px-3 py-2 text-sm'
                }
                role={testState.kind === 'error' ? 'alert' : undefined}
                data-testid="ai-test-result"
              >
                {testState.kind === 'sending' && (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Sending…
                  </span>
                )}
                {testState.kind === 'ok' && <span>{testState.text}</span>}
                {testState.kind === 'error' && <span>{testState.text}</span>}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleSignOut}>
                Sign out
              </Button>
              <Button
                onClick={handleTest}
                disabled={testState.kind === 'sending'}
              >
                Test connection
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
