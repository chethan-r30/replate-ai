import { afterEach, expect, it, vi } from 'vitest';
import { aiConfigured, createAiClient } from './provider.js';
import { parseListing, forecastInsight } from './parser.js';
const config = {
  AI_PROVIDER: 'groq',
  GROQ_API_KEY: 'synthetic-test-only',
  GROQ_MODEL: 'openai/gpt-oss-20b',
  GROQ_VISION_MODEL: 'qwen/qwen3.8-27b',
};
const fields = {
  items: ['bread'],
  title: 'Bread',
  category: 'bakery',
  dietary: [],
  servings: 10,
  suggestedBestBefore: null,
  safetyWarnings: ['Human review required'],
};
afterEach(() => vi.unstubAllGlobals());
it('converts Groq text JSON into the same strictly reviewed listing boundary', async () => {
  const mock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(fields) } }],
    }),
  }));
  vi.stubGlobal('fetch', mock);
  expect((await parseListing({ note: 'bread' }, config)).fields).toEqual(
    fields,
  );
  const body = JSON.parse(mock.mock.calls[0][1].body);
  expect(body.model).toBe(config.GROQ_MODEL);
  expect(body.response_format.type).toBe('json_object');
  expect(body.max_completion_tokens).toBe(800);
  expect(body.messages[0].content).toContain('untrusted data');
});
it('uses vision model and data URL for one validated image', async () => {
  const mock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(fields) } }],
    }),
  }));
  vi.stubGlobal('fetch', mock);
  await parseListing(
    { image: { mediaType: 'image/png', data: 'aGVsbG8=' } },
    config,
  );
  const b = JSON.parse(mock.mock.calls[0][1].body);
  expect(b.model).toBe(config.GROQ_VISION_MODEL);
  expect(b.messages[1].content[0].image_url.url).toBe(
    'data:image/png;base64,aGVsbG8=',
  );
});
it('quota failure never calls another paid provider and preserves manual/numeric fallbacks', async () => {
  const mock = vi.fn(async () => ({ ok: false, status: 429 }));
  vi.stubGlobal('fetch', mock);
  expect((await parseListing({ note: 'bread' }, config)).mode).toBe('manual');
  expect(await forecastInsight([1, 2], config)).toBeNull();
  expect(mock).toHaveBeenCalledTimes(2);
  expect(
    mock.mock.calls.every(
      (x) => x[0] === 'https://api.groq.com/openai/v1/chat/completions',
    ),
  ).toBe(true);
});
it('missing key stays manual and malformed JSON gets at most one retry', async () => {
  expect(aiConfigured({ ...config, GROQ_API_KEY: 'REPLACE_ME' })).toBe(false);
  expect(
    (await parseListing({ note: 'bread' }, { ...config, GROQ_API_KEY: '' }))
      .mode,
  ).toBe('manual');
  const mock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: 'invalid' } }] }),
  }));
  vi.stubGlobal('fetch', mock);
  expect((await parseListing({ note: 'bread' }, config)).mode).toBe('manual');
  expect(mock).toHaveBeenCalledTimes(2);
});
it('network/oversized responses fail safely and forecast text remains bounded', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'x'.repeat(17000) } }],
      }),
    })),
  );
  await expect(
    createAiClient(config).messages.create({
      system: 's',
      messages: [{ role: 'user', content: 'n' }],
      max_tokens: 250,
    }),
  ).rejects.toThrow('Invalid AI response');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'x'.repeat(2000) } }],
      }),
    })),
  );
  expect((await forecastInsight([1], config)).length).toBe(1500);
});
