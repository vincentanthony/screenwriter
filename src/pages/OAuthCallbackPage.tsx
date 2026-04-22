import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  finishOAuthRedirect,
  writeOAuthCompletion,
} from '@/ai/openaiCodex';
import { AIError } from '@/ai';

/**
 * OAuth redirect landing page.
 *
 * The PKCE flow lands here with `?code=...&state=...` (or `?error=...`).
 * We finish the token exchange in an effect, write an OAuthCompletion
 * record to sessionStorage (so the editor tab that started the flow
 * can pick it up), and offer a "Back to app" button.
 *
 * We do NOT auto-close this tab: that only works when the user opened
 * the provider in a popup (which we deliberately don't, for
 * reliability — popup blockers are fickle). The user clicks the
 * button, lands back on the editor, and the Settings dialog reflects
 * the new signed-in state.
 */
export function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<'working' | 'ok' | 'error'>('working');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await finishOAuthRedirect(params);
        if (cancelled) return;
        writeOAuthCompletion({ ok: true });
        setStatus('ok');
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof AIError ? err.message : 'Sign-in failed. Please try again.';
        writeOAuthCompletion({ ok: false, error: msg });
        setStatus('error');
        setMessage(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run exactly once on mount — the search params are a stable
    // snapshot of the redirect; we don't want to re-run on any subtle
    // URL normalization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container flex min-h-screen items-center justify-center py-12">
      <div className="max-w-md rounded-md border bg-card p-6 text-sm">
        {status === 'working' && <p>Finishing sign-in…</p>}
        {status === 'ok' && (
          <>
            <h1 className="mb-2 text-lg font-semibold">Signed in</h1>
            <p className="mb-4 text-muted-foreground">
              You&rsquo;re connected to OpenAI. You can close this tab or head
              back to your scripts.
            </p>
            <Button asChild>
              <Link to="/">Back to scripts</Link>
            </Button>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="mb-2 text-lg font-semibold">Sign-in failed</h1>
            <p className="mb-4 text-muted-foreground">{message}</p>
            <Button asChild variant="outline">
              <Link to="/">Back to scripts</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
