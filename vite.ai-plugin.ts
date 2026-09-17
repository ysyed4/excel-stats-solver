import type { Plugin, Connect } from 'vite'
import { buildSystemPrompt } from './src/solvers/aiPrompt.ts'

type Provider = 'openai' | 'anthropic' | 'gemini'

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const payload = fence ? fence[1].trim() : trimmed
  return JSON.parse(payload)
}

function resolveProvider(env: Record<string, string>): {
  provider: Provider
  apiKey: string
  model: string
} | null {
  const forced = env.AI_PROVIDER?.trim().toLowerCase() as Provider | undefined
  const anthropic = env.ANTHROPIC_API_KEY?.trim()
  const openai = env.OPENAI_API_KEY?.trim()
  const gemini = env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim()

  const pick = (provider: Provider) => {
    if (provider === 'anthropic' && anthropic) {
      return {
        provider,
        apiKey: anthropic,
        model: env.ANTHROPIC_MODEL?.trim() || 'claude-haiku-4-5-20251001',
      }
    }
    if (provider === 'openai' && openai) {
      return {
        provider,
        apiKey: openai,
        model: env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
      }
    }
    if (provider === 'gemini' && gemini) {
      return {
        provider,
        apiKey: gemini,
        model: env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash',
      }
    }
    return null
  }

  if (forced === 'openai' || forced === 'anthropic' || forced === 'gemini') {
    return pick(forced)
  }

  // Default preference: Claude → OpenAI → Gemini
  return pick('anthropic') ?? pick('openai') ?? pick('gemini')
}

async function callClaude(apiKey: string, model: string, text: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      temperature: 0,
      system: buildSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: `Classify this MMA-style problem and fill solver fields. Return JSON only.\n\n${text}`,
        },
      ],
    }),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${raw.slice(0, 300)}`)
  const data = JSON.parse(raw) as { content?: { type: string; text?: string }[] }
  const textOut = data.content?.find((c) => c.type === 'text')?.text
  if (!textOut) throw new Error('Empty Claude response')
  return textOut
}

async function callOpenAI(apiKey: string, model: string, text: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        {
          role: 'user',
          content: `Classify this MMA-style problem and fill solver fields. Return JSON only.\n\n${text}`,
        },
      ],
    }),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${raw.slice(0, 300)}`)
  const data = JSON.parse(raw) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty OpenAI response')
  return content
}

async function callGemini(apiKey: string, model: string, text: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Classify this MMA-style problem and fill solver fields. Return JSON only.\n\n${text}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
      },
    }),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${raw.slice(0, 300)}`)
  const data = JSON.parse(raw) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const textOut = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? '')
    .join('')
  if (!textOut) throw new Error('Empty Gemini response')
  return textOut
}

async function callProvider(
  provider: Provider,
  apiKey: string,
  model: string,
  text: string,
): Promise<string> {
  if (provider === 'anthropic') return callClaude(apiKey, model, text)
  if (provider === 'openai') return callOpenAI(apiKey, model, text)
  return callGemini(apiKey, model, text)
}

function createHandler(env: Record<string, string>): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    if (req.method !== 'POST') {
      next()
      return
    }

    try {
      const body = JSON.parse(await readBody(req)) as { text?: string }
      const text = body.text?.trim() ?? ''
      if (text.length < 12) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Paste a longer problem statement first.' }))
        return
      }

      const resolved = resolveProvider(env)
      if (!resolved) {
        res.statusCode = 503
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            error:
              'No AI API key in .env. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY (see .env.example).',
          }),
        )
        return
      }

      const content = await callProvider(
        resolved.provider,
        resolved.apiKey,
        resolved.model,
        text,
      )
      const parsed = extractJson(content)

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          ok: true,
          data: parsed,
          provider: resolved.provider,
          model: resolved.model,
        }),
      )
    } catch (err) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error: err instanceof Error ? err.message : 'AI detect failed',
        }),
      )
    }
  }
}

/** Dev/preview middleware: POST /api/ai-detect { text } → provider classification JSON. */
export function aiDetectPlugin(env: Record<string, string>): Plugin {
  const handler = createHandler(env)
  return {
    name: 'ai-detect-multi',
    configureServer(server) {
      server.middlewares.use('/api/ai-detect', handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/ai-detect', handler)
    },
  }
}
