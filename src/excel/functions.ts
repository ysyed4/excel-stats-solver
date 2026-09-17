/**
 * Excel-compatible statistical lookup helpers.
 * These wrap numerical CDF/PDF routines (same workflow as Excel books),
 * not closed-form definitional PMF formulas written by hand.
 */
import jStat from 'jstat'

const { binomial, poisson, normal, studentt } = jStat

function assertFinite(name: string, value: number) {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`)
  }
}

/** BINOM.DIST(number_s, trials, probability_s, cumulative) */
export function BINOM_DIST(
  number_s: number,
  trials: number,
  probability_s: number,
  cumulative: boolean,
): number {
  assertFinite('number_s', number_s)
  assertFinite('trials', trials)
  assertFinite('probability_s', probability_s)
  if (trials < 0 || !Number.isInteger(trials)) {
    throw new Error('trials must be a non-negative integer')
  }
  if (probability_s < 0 || probability_s > 1) {
    throw new Error('probability_s must be between 0 and 1')
  }
  const k = Math.floor(number_s)
  if (k < 0) return cumulative ? 0 : 0
  if (k > trials) return cumulative ? 1 : 0
  return cumulative
    ? binomial.cdf(k, trials, probability_s)
    : binomial.pdf(k, trials, probability_s)
}

/** POISSON.DIST(x, mean, cumulative) */
export function POISSON_DIST(
  x: number,
  mean: number,
  cumulative: boolean,
): number {
  assertFinite('x', x)
  assertFinite('mean', mean)
  if (mean < 0) throw new Error('mean must be ≥ 0')
  const k = Math.floor(x)
  if (k < 0) return cumulative ? 0 : 0
  return cumulative ? poisson.cdf(k, mean) : poisson.pdf(k, mean)
}

/** NORM.DIST(x, mean, standard_dev, cumulative) */
export function NORM_DIST(
  x: number,
  mean: number,
  standard_dev: number,
  cumulative: boolean,
): number {
  assertFinite('x', x)
  assertFinite('mean', mean)
  assertFinite('standard_dev', standard_dev)
  if (standard_dev <= 0) throw new Error('standard_dev must be > 0')
  return cumulative
    ? normal.cdf(x, mean, standard_dev)
    : normal.pdf(x, mean, standard_dev)
}

/** NORM.S.DIST(z, cumulative) */
export function NORM_S_DIST(z: number, cumulative: boolean): number {
  return NORM_DIST(z, 0, 1, cumulative)
}

/** NORM.INV(probability, mean, standard_dev) */
export function NORM_INV(
  probability: number,
  mean: number,
  standard_dev: number,
): number {
  assertFinite('probability', probability)
  assertFinite('mean', mean)
  assertFinite('standard_dev', standard_dev)
  if (probability <= 0 || probability >= 1) {
    throw new Error('probability must be between 0 and 1 (exclusive)')
  }
  if (standard_dev <= 0) throw new Error('standard_dev must be > 0')
  return normal.inv(probability, mean, standard_dev)
}

/** NORM.S.INV(probability) */
export function NORM_S_INV(probability: number): number {
  return NORM_INV(probability, 0, 1)
}

/** T.DIST(x, deg_freedom, cumulative) — left-tail when cumulative = TRUE */
export function T_DIST(
  x: number,
  deg_freedom: number,
  cumulative: boolean,
): number {
  assertFinite('x', x)
  assertFinite('deg_freedom', deg_freedom)
  if (deg_freedom < 1) throw new Error('deg_freedom must be ≥ 1')
  return cumulative ? studentt.cdf(x, deg_freedom) : studentt.pdf(x, deg_freedom)
}

/** T.INV(probability, deg_freedom) — left-tail inverse */
export function T_INV(probability: number, deg_freedom: number): number {
  assertFinite('probability', probability)
  assertFinite('deg_freedom', deg_freedom)
  if (probability <= 0 || probability >= 1) {
    throw new Error('probability must be between 0 and 1 (exclusive)')
  }
  if (deg_freedom < 1) throw new Error('deg_freedom must be ≥ 1')
  return studentt.inv(probability, deg_freedom)
}

/**
 * Uniform continuous probability via length ratios (Excel/course approach).
 * P(X = x) for continuous uniform is always 0.
 */
export function UNIFORM_RANGE_PROB(
  a: number,
  b: number,
  lower: number,
  upper: number,
): number {
  assertFinite('a', a)
  assertFinite('b', b)
  assertFinite('lower', lower)
  assertFinite('upper', upper)
  if (b <= a) throw new Error('maximum must be greater than minimum')
  const lo = Math.max(a, Math.min(lower, upper))
  const hi = Math.min(b, Math.max(lower, upper))
  if (hi <= lo) return 0
  return (hi - lo) / (b - a)
}

export function formatExcelCall(
  name: string,
  args: Array<string | number | boolean>,
): string {
  const rendered = args.map((arg) => {
    if (typeof arg === 'boolean') return arg ? 'TRUE' : 'FALSE'
    if (typeof arg === 'number') {
      if (!Number.isFinite(arg)) return String(arg)
      // Trim noisy floats while keeping Excel-readable precision
      return Number(arg.toPrecision(10)).toString()
    }
    return arg
  })
  return `=${name}(${rendered.join(', ')})`
}

export function roundResult(value: number, digits = 6): number {
  if (!Number.isFinite(value)) return value
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function ceilInt(value: number): number {
  return Math.ceil(value - 1e-12)
}
