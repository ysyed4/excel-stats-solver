import type { SolverId } from './types'

/** Parse "1,100" / "1.5" / 1100 into a finite number when possible. */
export function coerceNumber(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'boolean') return undefined
  if (raw == null) return undefined
  const s = String(raw).trim().replace(/,/g, '')
  if (!s) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Enum / flag fields that are safe to keep as identity defaults when autofill
 * omits them. Never include numeric content fields (x̄, μ, σ, n, x, …) — those
 * must come only from the new parse or stay absent.
 */
export const AUTOFILL_STRUCTURAL_KEYS = [
  'query',
  'useFpc',
  'conservative',
] as const

/** Per-solver identity defaults applied only when autofill omits the key. */
const AUTOFILL_IDENTITY: Partial<
  Record<SolverId, Record<string, string | number | boolean>>
> = {
  poisson: { hours: 1, independentDays: 1 },
  uniform: { drawCount: 1 },
  'sample-mean': { useFpc: false, N: '' },
  'n-proportion': { conservative: false },
}

/**
 * @deprecated Prefer full-reset mergeAutofillValues. Kept for tests/docs that
 * list historically leaky threshold keys.
 */
export const AUTOFILL_CLEAR_KEYS = [
  'x',
  'x2',
  'value',
  'z',
  'zLow',
  'zHigh',
  'lower',
  'upper',
  'probability',
  'atLeast',
  'exact',
  't',
  'alpha',
  'N',
  'mean',
  'sd',
  'xbar',
  's',
  'successes',
  'p',
  'n',
  'lambda',
  'E',
  'confidence',
  'df',
] as const

/** Common LLM / parser aliases → canonical field names. */
const ALIASES: Record<string, string> = {
  capacity: 'x',
  threshold: 'x',
  cutoff: 'x',
  mu: 'mean',
  sigma: 'sd',
  stdev: 'sd',
  'std_dev': 'sd',
  trials: 'n',
  probability_s: 'p',
  success_probability: 'p',
}

/**
 * Solver-specific renames. Critical: CI · Proportion uses `successes`, but LLMs
 * (and the status banner) often emit `x=78` — without this map, Successes stays
 * empty while the UI fallback fakes the curated-example 12.
 */
const SOLVER_ALIASES: Partial<Record<SolverId, Record<string, string>>> = {
  'ci-proportion': {
    x: 'successes',
    count: 'successes',
    successes: 'successes',
  },
}

function canonicalKey(rawKey: string, solverId?: SolverId): string {
  const lower = rawKey.toLowerCase()
  const solverMap = solverId ? SOLVER_ALIASES[solverId] : undefined
  if (solverMap?.[rawKey]) return solverMap[rawKey]
  if (solverMap?.[lower]) return solverMap[lower]
  return ALIASES[rawKey] ?? ALIASES[lower] ?? rawKey
}

export function coerceValues(
  values: Record<string, unknown> | undefined | null,
  solverId?: SolverId,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [rawKey, raw] of Object.entries(values ?? {})) {
    const key = canonicalKey(rawKey, solverId)
    if (typeof raw === 'boolean') {
      out[key] = raw
      continue
    }
    if (typeof raw === 'string') {
      const asNum = coerceNumber(raw)
      // Keep non-numeric strings (e.g. query enums)
      out[key] = asNum !== undefined && /^-?[\d,.]+$/.test(raw.trim()) ? asNum : raw
      continue
    }
    const asNum = coerceNumber(raw)
    if (asNum !== undefined) out[key] = asNum
  }
  return out
}

/**
 * Autofill merge: full reset of tool inputs, then write only newly parsed values.
 *
 * Does NOT overlay onto solver DEFAULTS / prior curated-example numbers. That
 * pattern caused stale x̄=2100, Normal x=16, FPC, etc. across tools. Only
 * structural enums/flags and identity multipliers (hours=1, …) may fill gaps.
 */
export function mergeAutofillValues(
  solverId: SolverId,
  defaults: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const coerced = coerceValues(next, solverId)
  const out: Record<string, string | number | boolean> = {}

  for (const key of AUTOFILL_STRUCTURAL_KEYS) {
    if (key in defaults && !(key in coerced)) {
      out[key] = defaults[key]
    }
  }

  const identity = AUTOFILL_IDENTITY[solverId]
  if (identity) {
    for (const [k, v] of Object.entries(identity)) {
      if (!(k in coerced)) out[k] = v
    }
  }

  Object.assign(out, coerced)

  // Never leave FPC checked without a usable Population N.
  const popN = coerceNumber(out.N)
  if (popN === undefined || popN <= 0) {
    if (solverId === 'sample-mean' || 'useFpc' in out) out.useFpc = false
    if (solverId === 'sample-mean' && !('N' in coerced)) out.N = ''
  }

  return out
}
