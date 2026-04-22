import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildRequestBody,
  composeInstructions,
  extractAssistantText,
  openaiCodexProvider,
} from './openaiCodex';
import { writeTokens, clearTokens, type StoredTokens } from './tokenStore';
import { AIError } from './types';

// ──────────────────────────────────────────────────────────────────────────
// Pure helpers: compose/instructions, request body, response parsing
// ──────────────────────────────────────────────────────────────────────────

describe('composeInstructions', () => {
  it('returns the Codex-required prefix when no user prompt is provided', () => {
    const out = composeInstructions();
    expect(out).toContain('You are Codex');
    expect(out).toContain("Codex CLI on a user's machine");
  });

  it('appends the user prompt after a blank line', () => {
    const out = composeInstructions('Be concise.');
    const lines = out.split('\n');
    // Must start with the Codex prefix and end with the user prompt.
    expect(lines[0]).toMatch(/^You are Codex/);
    expect(lines[lines.length - 1]).toBe('Be concise.');
    // Blank line between them.
    expect(out.includes('\n\nBe concise.')).toBe(true);
  });

  it('trims whitespace-only user prompts to the prefix alone', () => {
    expect(composeInstructions('   ')).toBe(composeInstructions());
    expect(composeInstructions('')).toBe(composeInstructions());
  });
});

describe('buildRequestBody', () => {
  it('targets the Responses API shape (instructions + input[])', () => {
    const body = buildRequestBody({
      model: 'gpt-5.2',
      messages: [{ role: 'user', content: 'Hi' }],
    });
    expect(body.model).toBe('gpt-5.2');
    expect(typeof body.instructions).toBe('string');
    expect(Array.isArray(body.input)).toBe(true);
    const input = body.input as Array<{ role: string; content: unknown }>;
    expect(input[0].role).toBe('user');
    // Content is an array of typed parts, NOT a raw string.
    expect(Array.isArray(input[0].content)).toBe(true);
  });

  it('always includes the Codex-required prefix in instructions', () => {
    const body = buildRequestBody({
      model: 'gpt-5.2',
      systemPrompt: 'You are a helpful editor.',
      messages: [{ role: 'user', content: 'Hi' }],
    });
    expect(body.instructions).toMatch(/^You are Codex/);
    expect(body.instructions).toContain('You are a helpful editor.');
  });

  it('tags user messages with type="input_text"', () => {
    const body = buildRequestBody({
      model: 'gpt-5.2',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    const input = body.input as Array<{
      content: Array<{ type: string; text: string }>;
    }>;
    expect(input[0].content[0].type).toBe('input_text');
    expect(input[0].content[0].text).toBe('Hello');
  });

  it('tags assistant messages with type="output_text" for continuation turns', () => {
    const body = buildRequestBody({
      model: 'gpt-5.2',
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello.' },
        { role: 'user', content: 'More.' },
      ],
    });
    const input = body.input as Array<{
      role: string;
      content: Array<{ type: string; text: string }>;
    }>;
    expect(input.map((i) => i.role)).toEqual(['user', 'assistant', 'user']);
    expect(input.map((i) => i.content[0].type)).toEqual([
      'input_text',
      'output_text',
      'input_text',
    ]);
  });
});

describe('extractAssistantText', () => {
  it('uses output_text convenience field when present', () => {
    expect(extractAssistantText({ output_text: 'hello' })).toBe('hello');
  });

  it('walks output[] assistant message content[] when output_text is missing', () => {
    const body = {
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'hello world' }],
        },
      ],
    };
    expect(extractAssistantText(body)).toBe('hello world');
  });

  it('concatenates multiple text parts in order', () => {
    const body = {
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'output_text', text: 'first ' },
            { type: 'output_text', text: 'second' },
          ],
        },
      ],
    };
    expect(extractAssistantText(body)).toBe('first second');
  });

  it('skips non-assistant / non-message output items (reasoning, tool_call, etc.)', () => {
    const body = {
      output: [
        { type: 'reasoning', role: 'assistant', content: [{ text: 'ignored' }] },
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'kept' }],
        },
      ],
    };
    expect(extractAssistantText(body)).toBe('kept');
  });

  it('returns "" when there is no assistant text to find', () => {
    expect(extractAssistantText({})).toBe('');
    expect(extractAssistantText({ output: [] })).toBe('');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// generateResponse — end-to-end with fetch mocked
// ──────────────────────────────────────────────────────────────────────────

function fakeResponse(status: number, body: unknown): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function futureTokens(overrides: Partial<StoredTokens> = {}): StoredTokens {
  return {
    accessToken: 'fresh-access',
    refreshToken: 'r',
    // Far past the 5-minute skew.
    expiresAt: Date.now() + 60 * 60 * 1000,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  clearTokens();
});

describe('generateResponse — auth & request shape', () => {
  it('throws not_authenticated when no tokens are stored', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(
      openaiCodexProvider.generateResponse({
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toMatchObject({ kind: 'not_authenticated' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends Authorization: Bearer <token> and Responses API body when authed', async () => {
    writeTokens(futureTokens());
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        fakeResponse(200, {
          output_text: 'ok',
          usage: { input_tokens: 7, output_tokens: 3 },
        }),
      );

    const resp = await openaiCodexProvider.generateResponse({
      systemPrompt: 'user system',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(resp.content).toBe('ok');
    expect(resp.usage).toEqual({ inputTokens: 7, outputTokens: 3 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.openai.com/v1/responses');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer fresh-access');
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(String(init?.body));
    // Codex-required system prompt present.
    expect(body.instructions).toMatch(/^You are Codex/);
    // User's own system prompt was appended.
    expect(body.instructions).toContain('user system');
    // Responses API shape.
    expect(body.input[0].role).toBe('user');
    expect(body.input[0].content[0].type).toBe('input_text');
    expect(body.input[0].content[0].text).toBe('hello');
  });
});

describe('generateResponse — error mapping', () => {
  it('maps a 429 to AIError{kind:"rate_limited"}', async () => {
    writeTokens(futureTokens());
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      fakeResponse(429, { error: 'slow down' }),
    );
    await expect(
      openaiCodexProvider.generateResponse({
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toMatchObject({ kind: 'rate_limited' });
  });

  it('maps a 500 to AIError{kind:"model_error"}', async () => {
    writeTokens(futureTokens());
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      fakeResponse(500, { error: 'boom' }),
    );
    await expect(
      openaiCodexProvider.generateResponse({
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toMatchObject({ kind: 'model_error' });
  });

  it('maps fetch() rejection to AIError{kind:"network_error"}', async () => {
    writeTokens(futureTokens());
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('offline'));
    const err = await openaiCodexProvider
      .generateResponse({ messages: [{ role: 'user', content: 'hi' }] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(AIError);
    expect(err.kind).toBe('network_error');
  });

  it('maps an unrecognized status (418) to AIError{kind:"unknown"}', async () => {
    writeTokens(futureTokens());
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(fakeResponse(418, 'teapot'));
    await expect(
      openaiCodexProvider.generateResponse({
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toMatchObject({ kind: 'unknown' });
  });
});

describe('generateResponse — refresh-on-401', () => {
  it('refreshes the token once on 401 and retries, returning the second response', async () => {
    writeTokens(futureTokens({ accessToken: 'stale', refreshToken: 'refresh-me' }));

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      // First call: 401 on the Responses API.
      .mockResolvedValueOnce(fakeResponse(401, { error: 'expired' }))
      // Refresh call.
      .mockResolvedValueOnce(
        fakeResponse(200, {
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
      )
      // Retry of the Responses API.
      .mockResolvedValueOnce(fakeResponse(200, { output_text: 'retried' }));

    const resp = await openaiCodexProvider.generateResponse({
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(resp.content).toBe('retried');
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Retry must use the new access token.
    const retryCall = fetchMock.mock.calls[2];
    const retryHeaders = retryCall[1]?.headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe('Bearer new-access');
  });

  it('gives up as not_authenticated when the retry also 401s', async () => {
    writeTokens(futureTokens({ refreshToken: 'r' }));
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(fakeResponse(401, {})) // first call
      .mockResolvedValueOnce(
        fakeResponse(200, {
          access_token: 'a',
          refresh_token: 'r',
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(fakeResponse(401, {})); // retry still 401

    await expect(
      openaiCodexProvider.generateResponse({
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toMatchObject({ kind: 'not_authenticated' });
  });
});
