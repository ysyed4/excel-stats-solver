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

/** Keys that are answer thresholds / optional extras — never inherit stale defaults on autofill. */
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
  // Continuous / sampling location-scale params — never keep lake-trout μ=15,σ=3
  // when the parser didn't extract them (multipart should inherit or error instead).
  'mean',
  'sd',
] as const

/** Common LLM / parser aliases → canonical field names per solver family. */
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

export function coerceValues(
  values: Record<string, unknown> | undefined | null,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [rawKey, raw] of Object.entries(values ?? {})) {
    const key = ALIASES[rawKey] ?? ALIASES[rawKey.toLowerCase()] ?? rawKey
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
 * Merge solver defaults with autofilled values without leaving stale thresholds
 * (e.g. Normal x=16 from the lake-trout default, Binomial optional x2=15).
 */
export function mergeAutofillValues(
  _solverId: SolverId,
  defaults: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const coerced = coerceValues(next)
  const base: Record<string, string | number | boolean> = { ...defaults }
  for (const k of AUTOFILL_CLEAR_KEYS) {
    if (!(k in coerced)) delete base[k]
  }
  const merged: Record<string, string | number | boolean> = { ...base, ...coerced }
  // Never leave FPC checked without a usable Population N (stale carryover / AI).
  const popN = coerceNumber(merged.N)
  if (popN === undefined || popN <= 0) {
    merged.useFpc = false
    if (!('N' in coerced)) merged.N = ''
  }
  return merged
}
