import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  anthropicProvider,
  ANTHROPIC_API_URL,
  buildRequestBody,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
  extractText,
  setApiKey,
  USAGE_RECORDED_EVENT,
} from './anthropic';
import { clearApiKey } from './apiKeyStore';
import { AIError } from './types';
import {
  setUsageRepositoryForTesting,
  type UsageRepository,
} from '@/storage/repository';
import type { UsageRecord } from '@/types/usage';

// ──────────────────────────────────────────────────────────────────────────
// Pure helpers
// ──────────────────────────────────────────────────────────────────────────

describe('buildRequestBody', () => {
  it('includes model + max_tokens + messages in Anthropic shape', () => {
    const body = buildRequestBody({
      model: 'claude-sonnet-4-5',
      maxTokens: 2048,
      messages: [{ role: 'user', content: 'Hi' }],
    });
    expect(body.model).toBe('claude-sonnet-4-5');
    expect(body.max_tokens).toBe(2048);
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages).toEqual([{ role: 'user', content: 'Hi' }]);
  });

  it('adds a system field only when systemPrompt is non-empty after trim', () => {
    expect(
      buildRequestBody({
        model: 'x',
        maxTokens: 10,
        messages: [{ role: 'user', content: 'hi' }],
      }).system,
    ).toBeUndefined();

    expect(
      buildRequestBody({
        model: 'x',
        maxTokens: 10,
        systemPrompt: '   ',
        messages: [{ role: 'user', content: 'hi' }],
      }).system,
    ).toBeUndefined();

    expect(
      buildRequestBody({
        model: 'x',
        maxTokens: 10,
        systemPrompt: '  Be nice.  ',
        messages: [{ role: 'user', content: 'hi' }],
      }).system,
    ).toBe('Be nice.');
  });

  it('preserves assistant turns when composing multi-turn conversations', () => {
    const body = buildRequestBody({
      model: 'x',
      maxTokens: 10,
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello.' },
        { role: 'user', content: 'More.' },
      ],
    });
    expect(
      (body.messages as Array<{ role: string }>).map((m) => m.role),
    ).toEqual(['user', 'assistant', 'user']);
  });
});

describe('extractText', () => {
  it('concatenates multiple text blocks in order', () => {
    expect(
      extractText({
        content: [
          { type: 'text', text: 'part 1 ' },
          { type: 'text', text: 'part 2' },
        ],
      }),
    ).toBe('part 1 part 2');
  });

  it('skips non-text block types', () => {
    expect(
      extractText({
        content: [
          { type: 'tool_use' },
          { type: 'text', text: 'only text survives' },
        ],
      }),
    ).toBe('only text survives');
  });

  it('returns an empty string for an empty or missing content array', () => {
    expect(extractText({})).toBe('');
    expect(extractText({ content: [] })).toBe('');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// generateResponse — end-to-end with fetch + usage repo mocked
// ──────────────────────────────────────────────────────────────────────────

function fakeResponse(status: number, body: unknown): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

class FakeUsageRepo implements UsageRepository {
  records: UsageRecord[] = [];
  async create(record: Omit<UsageRecord, 'id'>): Promise<UsageRecord> {
    const full: UsageRecord = { id: `rec-${this.records.length}`, ...record };
    this.records.push(full);
    return full;
  }
  async listRecent(limit: number): Promise<UsageRecord[]> {
    return this.records.slice(-limit).reverse();
  }
  async listInRange(from: number, to: number): Promise<UsageRecord[]> {
    return this.records
      .filter((r) => r.timestamp >= from && r.timestamp < to)
      .sort((a, b) => b.timestamp - a.timestamp);
  }
  async totalSince(timestamp: number) {
    const rs = this.records.filter((r) => r.timestamp >= timestamp);
    return {
      costCents: rs.reduce((a, r) => a + r.costCents, 0),
      callCount: rs.length,
    };
  }
  async deleteOlderThan(timestamp: number) {
    const before = this.records.length;
    this.records = this.records.filter((r) => r.timestamp >= timestamp);
    return before - this.records.length;
  }
}

let usageRepo: FakeUsageRepo;

beforeEach(() => {
  localStorage.clear();
  clearApiKey();
  usageRepo = new FakeUsageRepo();
  setUsageRepositoryForTesting(usageRepo);
});

afterEach(() => {
  vi.restoreAllMocks();
  setUsageRepositoryForTesting(null);
});

describe('generateResponse — auth', () => {
  it('throws not_authenticated when no API key is stored', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(
      anthropicProvider.generateResponse({
        feature: 'hello-world',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toMatchObject({ kind: 'not_authenticated' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(usageRepo.records).toHaveLength(0);
  });

  it('sends x-api-key, anthropic-version, and the browser-access header', async () => {
    setApiKey('sk-ant-TEST-KEY');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        fakeResponse(200, {
          id: 'msg-1',
          model: DEFAULT_MODEL,
          role: 'assistant',
          content: [{ type: 'text', text: 'hello' }],
          usage: { input_tokens: 10, output_tokens: 3 },
        }),
      );

    await anthropicProvider.generateResponse({
      feature: 'hello-world',
      systemPrompt: 'Be brief.',
      messages: [{ role: 'user', content: 'say hi' }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(ANTHROPIC_API_URL);
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-TEST-KEY');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe(DEFAULT_MODEL);
    expect(body.max_tokens).toBe(DEFAULT_MAX_TOKENS);
    expect(body.system).toBe('Be brief.');
    expect(body.messages).toEqual([{ role: 'user', content: 'say hi' }]);
  });
});

describe('generateResponse — response parsing + usage recording', () => {
  beforeEach(() => {
    setApiKey('sk-ant-TEST-KEY');
  });

  it('parses content text and usage tokens from a successful response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      fakeResponse(200, {
        id: 'msg-2',
        model: 'claude-sonnet-4-5',
        role: 'assistant',
        content: [{ type: 'text', text: 'hello world' }],
        usage: { input_tokens: 12, output_tokens: 4 },
      }),
    );

    const resp = await anthropicProvider.generateResponse({
      feature: 'hello-world',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(resp.content).toBe('hello world');
    expect(resp.usage).toEqual({ inputTokens: 12, outputTokens: 4 });
  });

  it('writes a UsageRecord with correct model, tokens, costCents, feature, context', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      fakeResponse(200, {
        id: 'msg-3',
        model: 'claude-sonnet-4-5',
        role: 'assistant',
        content: [{ type: 'text', text: 'ok' }],
        // 5000 input at $3/M = 1.5c, 1000 output at $15/M = 1.5c → 3 cents.
        usage: { input_tokens: 5000, output_tokens: 1000 },
      }),
    );

    await anthropicProvider.generateResponse({
      feature: 'hello-world',
      scriptId: 'script-abc',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(usageRepo.records).toHaveLength(1);
    const [rec] = usageRepo.records;
    expect(rec.provider).toBe('anthropic');
    expect(rec.model).toBe('claude-sonnet-4-5');
    expect(rec.inputTokens).toBe(5000);
    expect(rec.outputTokens).toBe(1000);
    expect(rec.costCents).toBe(3);
    expect(rec.feature).toBe('hello-world');
    expect(rec.scriptId).toBe('script-abc');
    expect(rec.context).toBe('dev');
    // id generated, timestamp populated.
    expect(typeof rec.id).toBe('string');
    expect(typeof rec.timestamp).toBe('number');
  });

  it('dispatches USAGE_RECORDED_EVENT after a successful call', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      fakeResponse(200, {
        model: 'claude-sonnet-4-5',
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );

    const listener = vi.fn();
    window.addEventListener(USAGE_RECORDED_EVENT, listener);
    try {
      await anthropicProvider.generateResponse({
        feature: 'hello-world',
        messages: [{ role: 'user', content: 'hi' }],
      });
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(USAGE_RECORDED_EVENT, listener);
    }
  });

  it('falls back to "unknown" feature and warns when feature is omitted/empty', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      fakeResponse(200, {
        model: 'claude-sonnet-4-5',
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );

    await anthropicProvider.generateResponse({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      feature: '' as any,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(usageRepo.records[0].feature).toBe('unknown');
    expect(warn).toHaveBeenCalled();
  });
});

describe('generateResponse — error mapping', () => {
  beforeEach(() => {
    setApiKey('sk-ant-TEST-KEY');
  });

  it('401 → not_authenticated (no retry, no usage recorded)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      fakeResponse(401, { error: 'invalid api key' }),
    );
    await expect(
      anthropicProvider.generateResponse({
        feature: 'hello-world',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toMatchObject({ kind: 'not_authenticated' });
    expect(usageRepo.records).toHaveLength(0);
  });

  it('429 → rate_limited', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      fakeResponse(429, { error: 'slow down' }),
    );
    await expect(
      anthropicProvider.generateResponse({
        feature: 'hello-world',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toMatchObject({ kind: 'rate_limited' });
  });

  it('5xx → model_error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(fakeResponse(503, {}));
    await expect(
      anthropicProvider.generateResponse({
        feature: 'hello-world',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toMatchObject({ kind: 'model_error' });
  });

  it('fetch rejection → network_error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('offline'));
    const err = await anthropicProvider
      .generateResponse({
        feature: 'hello-world',
        messages: [{ role: 'user', content: 'hi' }],
      })
      .catch((e) => e);
    expect(err).toBeInstanceOf(AIError);
    expect(err.kind).toBe('network_error');
  });

  it('400 or other non-OK → unknown', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      fakeResponse(400, { error: 'bad req' }),
    );
    await expect(
      anthropicProvider.generateResponse({
        feature: 'hello-world',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toMatchObject({ kind: 'unknown' });
  });
});
