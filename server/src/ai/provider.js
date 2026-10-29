// Groq adapter keeps provider responses behind the existing validated AI boundary.
import Anthropic from '@anthropic-ai/sdk';
import { hasKey } from '../config/env.js';
export function aiConfigured(config) {
  return hasKey(
    config.AI_PROVIDER === 'groq'
      ? config.GROQ_API_KEY
      : config.ANTHROPIC_API_KEY,
  );
}
export function createAiClient(config) {
  if (config.AI_PROVIDER !== 'groq')
    return new Anthropic({
      apiKey: config.ANTHROPIC_API_KEY,
      maxRetries: 0,
      timeout: 10000,
    });
  return {
    messages: {
      async create(request, { signal } = {}) {
        const image = request.messages.some(
          (message) =>
            Array.isArray(message.content) &&
            message.content.some((part) => part.type === 'image'),
        );
        const messages = [
          { role: 'system', content: request.system },
          ...request.messages.map((message) => ({
            role: message.role,
            content:
              typeof message.content === 'string'
                ? message.content
                : message.content.map((part) =>
                    part.type === 'image'
                      ? {
                          type: 'image_url',
                          image_url: {
                            url: `data:${part.source.media_type};base64,${part.source.data}`,
                          },
                        }
                      : { type: 'text', text: part.text },
                  ),
          })),
        ];
        const response = await fetch(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            method: 'POST',
            signal: signal || AbortSignal.timeout(10000),
            headers: {
              Authorization: `Bearer ${config.GROQ_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: image ? config.GROQ_VISION_MODEL : config.GROQ_MODEL,
              messages,
              max_completion_tokens: request.max_tokens,
              temperature: 0.1,
              reasoning_effort: image ? 'none' : 'low',
              ...(request.max_tokens === 800
                ? { response_format: { type: 'json_object' } }
                : {}),
            }),
          },
        );
        // Do not log provider bodies, prompts, images or the secret. Quota never triggers a paid fallback.
        if (!response.ok)
          throw new Error(`AI provider unavailable (${response.status})`);
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (typeof text !== 'string' || text.length > 16000)
          throw new Error('Invalid AI response');
        return { content: [{ type: 'text', text }] };
      },
    },
  };
}
