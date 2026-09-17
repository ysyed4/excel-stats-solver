import { SOLVERS, type SolverId } from './types'
import {
  parseProblemText,
  pickBestPart,
  type ParseResult,
  type ParsedPart,
} from './parseProblem'

const SOLVER_IDS = new Set(SOLVERS.map((s) => s.id))

export function hasAiKey(): boolean {
  // Key lives on the Vite server (.env ANTHROPIC_API_KEY), not in the browser.
  // Soft signal: assume AI may be available; server returns 503 if missing.
  return true
}

function sanitizeValues(
  values: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(values ?? {})) {
    if (typeof v === 'boolean' || typeof v === 'string') out[k] = v
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    else if (v != null && Number.isFinite(Number(v))) out[k] = Number(v)
  }
  return out
}

function sanitizeResult(raw: unknown, fallbackText: string): ParseResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI returned invalid JSON')
  }
  const obj = raw as Record<string, unknown>
  const solverId = String(obj.solverId ?? '') as SolverId
  if (!SOLVER_IDS.has(solverId)) {
    throw new Error(`AI returned unknown solverId: ${solverId}`)
  }

  const values = sanitizeValues(
    (obj.values as Record<string, unknown>) ?? {},
  )
  const confidence =
    obj.confidence === 'high' ||
    obj.confidence === 'medium' ||
    obj.confidence === 'low'
      ? obj.confidence
      : 'medium'
  const rationale =
    typeof obj.rationale === 'string' ? obj.rationale : 'AI classification'

  let parts: ParsedPart[] | undefined
  if (Array.isArray(obj.parts)) {
    parts = obj.parts
      .map((p, i) => {
        if (!p || typeof p !== 'object') return null
        const part = p as Record<string, unknown>
        const sid = String(part.solverId ?? '') as SolverId
        if (!SOLVER_IDS.has(sid)) return null
        return {
          id: `ai-part-${i}`,
          label: String(part.label ?? `Part ${i + 1}`),
          solverId: sid,
          values: sanitizeValues((part.values as Record<string, unknown>) ?? {}),
          rationale: String(part.rationale ?? rationale),
        } satisfies ParsedPart
      })
      .filter((p): p is ParsedPart => p !== null)
    if (parts.length < 2) parts = undefined
  }

  const primary =
    parts && parts.length > 0 ? pickBestPart(parts, fallbackText) : undefined
  return {
    solverId: primary?.solverId ?? solverId,
    values: primary?.values ?? values,
    confidence,
    family:
      obj.family === 'discrete' ||
      obj.family === 'continuous' ||
      obj.family === 'sampling'
        ? obj.family
        : SOLVERS.find((s) => s.id === solverId)?.category,
    summary: `AI detected ${SOLVERS.find((s) => s.id === (primary?.solverId ?? solverId))?.title ?? solverId}.`,
    notes: [rationale, `Source text length: ${fallbackText.length} chars.`],
    parts,
  }
}

/**
 * Prefer Claude (Anthropic) via local Vite proxy `/api/ai-detect`.
 * Falls back to training-corpus / heuristic parser if AI is unavailable.
 */
export async function detectProblem(text: string): Promise<{
  result: ParseResult
  source: 'ai' | 'local'
  message?: string
  provider?: string
}> {
  const trimmed = text.trim()

  try {
    const res = await fetch('/api/ai-detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: trimmed }),
    })

    const payload = (await res.json()) as {
      ok?: boolean
      data?: unknown
      error?: string
      provider?: string
      model?: string
    }

    if (!res.ok || !payload.ok || !payload.data) {
      throw new Error(payload.error || `AI detect failed (${res.status})`)
    }

    const result = sanitizeResult(payload.data, trimmed)
    return {
      result,
      source: 'ai',
      provider: payload.provider,
      message: [
        payload.provider ? `provider ${payload.provider}` : null,
        payload.model ? `model ${payload.model}` : null,
      ]
        .filter(Boolean)
        .join(', '),
    }
  } catch (err) {
    const local = parseProblemText(trimmed)
    if (!local) {
      throw err instanceof Error
        ? err
        : new Error('Paste a longer problem statement first.')
    }
    return {
      result: local,
      source: 'local',
      message: `AI unavailable (${err instanceof Error ? err.message : 'error'}); used local detection.`,
    }
  }
}

/** @deprecated use hasAiKey — kept for older imports */
export function hasOpenAIKey(): boolean {
  return hasAiKey()
}
