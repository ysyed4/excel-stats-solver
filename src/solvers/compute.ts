import {
  BINOM_DIST,
  POISSON_DIST,
  NORM_DIST,
  NORM_S_DIST,
  NORM_S_INV,
  NORM_INV,
  T_DIST,
  T_INV,
  UNIFORM_RANGE_PROB,
  formatExcelCall,
  roundResult,
  ceilInt,
} from '../excel/functions'
import type { SolveResult, SolverId } from './types'

function num(values: Record<string, unknown>, key: string): number {
  const raw = values[key]
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) throw new Error(`Enter a valid number for ${key}`)
  return n
}

function bool(values: Record<string, unknown>, key: string, fallback = false): boolean {
  const raw = values[key]
  if (typeof raw === 'boolean') return raw
  if (raw === 'true' || raw === 'TRUE') return true
  if (raw === 'false' || raw === 'FALSE') return false
  return fallback
}

function str(values: Record<string, unknown>, key: string, fallback: string): string {
  const raw = values[key]
  return typeof raw === 'string' && raw.length ? raw : fallback
}

function pct(p: number): string {
  return `${roundResult(p * 100, 4)}%`
}

function fmt(n: number, digits = 6): string {
  return roundResult(n, digits).toString()
}

export function solve(solverId: SolverId, values: Record<string, unknown>): SolveResult {
  switch (solverId) {
    case 'binomial':
      return solveBinomial(values)
    case 'poisson':
      return solvePoisson(values)
    case 'uniform':
      return solveUniform(values)
    case 'normal':
      return solveNormal(values)
    case 'standard-normal':
      return solveStandardNormal(values)
    case 't-dist':
      return solveT(values)
    case 'sample-mean':
      return solveSampleMean(values)
    case 'sample-proportion':
      return solveSampleProportion(values)
    case 'ci-mean-z':
      return solveCiMeanZ(values)
    case 'ci-mean-t':
      return solveCiMeanT(values)
    case 'ci-proportion':
      return solveCiProportion(values)
    case 'n-mean':
      return solveNMean(values)
    case 'n-proportion':
      return solveNProportion(values)
    default:
      throw new Error('Unknown solver')
  }
}

function solveBinomial(values: Record<string, unknown>): SolveResult {
  const n = num(values, 'n')
  const p = num(values, 'p')
  const x = num(values, 'x')
  const query = str(values, 'query', 'atLeast')

  if (query === 'equal') {
    const prob = BINOM_DIST(x, n, p, false)
    return {
      excelCalls: [formatExcelCall('BINOM.DIST', [x, n, p, false])],
      lines: [{ label: `P(X = ${x})`, value: fmt(prob), emphasis: true }],
    }
  }

  if (query === 'atMost') {
    const prob = BINOM_DIST(x, n, p, true)
    return {
      excelCalls: [formatExcelCall('BINOM.DIST', [x, n, p, true])],
      lines: [{ label: `P(X ≤ ${x})`, value: fmt(prob), emphasis: true }],
    }
  }

  // atLeast: P(X ≥ x) = 1 − P(X ≤ x−1)
  const cutoff = x - 1
  const left = cutoff < 0 ? 0 : BINOM_DIST(cutoff, n, p, true)
  const prob = 1 - left
  const excelCalls =
    cutoff < 0
      ? ['=1']
      : [`=1 - ${formatExcelCall('BINOM.DIST', [cutoff, n, p, true]).slice(1)}`]

  const lines = [
    {
      label: cutoff < 0 ? 'P(X ≤ −1)' : `P(X ≤ ${cutoff})`,
      value: cutoff < 0 ? '0' : fmt(left),
    },
    { label: `P(X ≥ ${x})`, value: fmt(prob), emphasis: true },
  ]

  if (values.x2 !== undefined && values.x2 !== '') {
    const x2 = num(values, 'x2')
    const exact = BINOM_DIST(x2, n, p, false)
    excelCalls.push(formatExcelCall('BINOM.DIST', [x2, n, p, false]))
    lines.push({ label: `P(X = ${x2})`, value: fmt(exact), emphasis: true })
  }

  return {
    excelCalls,
    lines,
    note: 'Translate P(X ≥ k) into 1 − BINOM.DIST(k−1, n, p, TRUE).',
  }
}

function solvePoisson(values: Record<string, unknown>): SolveResult {
  const lambdaBase = num(values, 'lambda')
  const query = str(values, 'query', 'equal')
  const x = num(values, 'x')
  const hours = values.hours === '' || values.hours === undefined ? 1 : num(values, 'hours')
  const lambda = lambdaBase * hours

  if (query === 'equal') {
    const prob = POISSON_DIST(x, lambda, false)
    return {
      excelCalls: [formatExcelCall('POISSON.DIST', [x, lambda, false])],
      lines: [
        { label: 'λ used', value: fmt(lambda, 4) },
        { label: `P(X = ${x})`, value: fmt(prob), emphasis: true },
      ],
    }
  }

  if (query === 'atMost') {
    const prob = POISSON_DIST(x, lambda, true)
    return {
      excelCalls: [formatExcelCall('POISSON.DIST', [x, lambda, true])],
      lines: [
        { label: 'λ used', value: fmt(lambda, 4) },
        { label: `P(X ≤ ${x})`, value: fmt(prob), emphasis: true },
      ],
    }
  }

  // moreThan: P(X > x) = 1 − P(X ≤ x)
  const left = POISSON_DIST(x, lambda, true)
  const prob = 1 - left
  return {
    excelCalls: [
      `=1 - ${formatExcelCall('POISSON.DIST', [x, lambda, true]).slice(1)}`,
    ],
    lines: [
      { label: 'λ used', value: fmt(lambda, 4) },
      { label: `P(X ≤ ${x})`, value: fmt(left) },
      { label: `P(X > ${x})`, value: fmt(prob), emphasis: true },
    ],
    note: 'Scale λ with the interval length (e.g. 1.5/hour → λ = 3 for 2 hours).',
  }
}

function solveUniform(values: Record<string, unknown>): SolveResult {
  const a = num(values, 'a')
  const b = num(values, 'b')
  const lower = num(values, 'lower')
  const upper = num(values, 'upper')
  const between = UNIFORM_RANGE_PROB(a, b, lower, upper)
  const lines = [
    {
      label: `P(${lower} ≤ X ≤ ${upper})`,
      value: fmt(between),
      emphasis: true,
    },
  ]
  const excelCalls = [
    `=(MIN(${b}, ${upper}) - MAX(${a}, ${lower})) / (${b} - ${a})`,
  ]

  if (values.atLeast !== undefined && values.atLeast !== '') {
    const atLeast = num(values, 'atLeast')
    const p = UNIFORM_RANGE_PROB(a, b, atLeast, b)
    lines.push({
      label: `P(X ≥ ${atLeast})`,
      value: fmt(p),
      emphasis: true,
    })
  }

  if (values.exact !== undefined && values.exact !== '') {
    lines.push({
      label: `P(X = ${num(values, 'exact')})`,
      value: '0',
      emphasis: true,
    })
  }

  return {
    excelCalls,
    lines,
    note: 'Continuous uniform: probability is the length of the event interval divided by (b − a). A single point has probability 0.',
  }
}

function solveNormal(values: Record<string, unknown>): SolveResult {
  const mean = num(values, 'mean')
  const sd = num(values, 'sd')
  const query = str(values, 'query', 'greater')

  if (query === 'less') {
    const x = num(values, 'x')
    const prob = NORM_DIST(x, mean, sd, true)
    return {
      excelCalls: [formatExcelCall('NORM.DIST', [x, mean, sd, true])],
      lines: [{ label: `P(X ≤ ${x})`, value: fmt(prob), emphasis: true }],
    }
  }

  if (query === 'greater') {
    const x = num(values, 'x')
    const left = NORM_DIST(x, mean, sd, true)
    const prob = 1 - left
    return {
      excelCalls: [
        `=1 - ${formatExcelCall('NORM.DIST', [x, mean, sd, true]).slice(1)}`,
      ],
      lines: [
        { label: `P(X ≤ ${x})`, value: fmt(left) },
        { label: `P(X > ${x})`, value: fmt(prob), emphasis: true },
      ],
      note: 'P(X = x) = 0 for continuous normals; use ranges.',
    }
  }

  if (query === 'between') {
    const lower = num(values, 'lower')
    const upper = num(values, 'upper')
    const hi = NORM_DIST(upper, mean, sd, true)
    const lo = NORM_DIST(lower, mean, sd, true)
    const prob = hi - lo
    return {
      excelCalls: [
        `=${formatExcelCall('NORM.DIST', [upper, mean, sd, true]).slice(1)} - ${formatExcelCall('NORM.DIST', [lower, mean, sd, true]).slice(1)}`,
      ],
      lines: [
        { label: `P(X ≤ ${upper})`, value: fmt(hi) },
        { label: `P(X ≤ ${lower})`, value: fmt(lo) },
        {
          label: `P(${lower} < X < ${upper})`,
          value: fmt(prob),
          emphasis: true,
        },
      ],
    }
  }

  // inverse: find x such that P(X ≤ x) = prob
  const probability = num(values, 'probability')
  const x = NORM_INV(probability, mean, sd)
  return {
    excelCalls: [formatExcelCall('NORM.INV', [probability, mean, sd])],
    lines: [
      {
        label: `x such that P(X ≤ x) = ${probability}`,
        value: fmt(x, 4),
        emphasis: true,
      },
    ],
  }
}

function solveStandardNormal(values: Record<string, unknown>): SolveResult {
  const query = str(values, 'query', 'less')

  if (query === 'less') {
    const z = num(values, 'z')
    const prob = NORM_S_DIST(z, true)
    return {
      excelCalls: [formatExcelCall('NORM.S.DIST', [z, true])],
      lines: [{ label: `P(Z ≤ ${z})`, value: fmt(prob), emphasis: true }],
    }
  }

  if (query === 'greater') {
    const z = num(values, 'z')
    const left = NORM_S_DIST(z, true)
    return {
      excelCalls: [
        `=1 - ${formatExcelCall('NORM.S.DIST', [z, true]).slice(1)}`,
      ],
      lines: [
        { label: `P(Z ≤ ${z})`, value: fmt(left) },
        { label: `P(Z > ${z})`, value: fmt(1 - left), emphasis: true },
      ],
    }
  }

  if (query === 'between') {
    const zLow = num(values, 'zLow')
    const zHigh = num(values, 'zHigh')
    const hi = NORM_S_DIST(zHigh, true)
    const lo = NORM_S_DIST(zLow, true)
    return {
      excelCalls: [
        `=${formatExcelCall('NORM.S.DIST', [zHigh, true]).slice(1)} - ${formatExcelCall('NORM.S.DIST', [zLow, true]).slice(1)}`,
      ],
      lines: [
        {
          label: `P(${zLow} < Z < ${zHigh})`,
          value: fmt(hi - lo),
          emphasis: true,
        },
      ],
    }
  }

  // inverse left-tail
  const probability = num(values, 'probability')
  const z = NORM_S_INV(probability)
  return {
    excelCalls: [formatExcelCall('NORM.S.INV', [probability])],
    lines: [
      {
        label: `z such that P(Z ≤ z) = ${probability}`,
        value: fmt(z, 4),
        emphasis: true,
      },
    ],
  }
}

function solveT(values: Record<string, unknown>): SolveResult {
  const df = num(values, 'df')
  const query = str(values, 'query', 'cdf')

  if (query === 'cdf') {
    const t = num(values, 't')
    const prob = T_DIST(t, df, true)
    return {
      excelCalls: [formatExcelCall('T.DIST', [t, df, true])],
      lines: [{ label: `P(T ≤ ${t})`, value: fmt(prob), emphasis: true }],
    }
  }

  if (query === 'greater') {
    const t = num(values, 't')
    const left = T_DIST(t, df, true)
    return {
      excelCalls: [`=1 - ${formatExcelCall('T.DIST', [t, df, true]).slice(1)}`],
      lines: [{ label: `P(T > ${t})`, value: fmt(1 - left), emphasis: true }],
    }
  }

  if (query === 'invRight') {
    const alpha = num(values, 'alpha')
    const t = T_INV(1 - alpha, df)
    return {
      excelCalls: [formatExcelCall('T.INV', [1 - alpha, df])],
      lines: [
        {
          label: `t* with right-tail α = ${alpha}`,
          value: fmt(t, 4),
          emphasis: true,
        },
      ],
      note: 'Right-tail critical value uses T.INV(1 − α, df).',
    }
  }

  // two-sided critical value
  const alpha = num(values, 'alpha')
  const t = T_INV(1 - alpha / 2, df)
  return {
    excelCalls: [formatExcelCall('T.INV', [1 - alpha / 2, df])],
    lines: [
      {
        label: `±t* for two-tail α = ${alpha}`,
        value: `±${fmt(t, 4)}`,
        emphasis: true,
      },
    ],
  }
}

function standardErrorMean(
  sd: number,
  n: number,
  N?: number,
  useFpc?: boolean,
): { se: number; fpcApplied: boolean } {
  let se = sd / Math.sqrt(n)
  let fpcApplied = false
  if (useFpc && N !== undefined && N > 0 && n > N / 20) {
    se *= Math.sqrt((N - n) / (N - 1))
    fpcApplied = true
  }
  return { se, fpcApplied }
}

function solveSampleMean(values: Record<string, unknown>): SolveResult {
  const mean = num(values, 'mean')
  const sd = num(values, 'sd')
  const n = num(values, 'n')
  const query = str(values, 'query', 'greater')
  const N = values.N === '' || values.N === undefined ? undefined : num(values, 'N')
  const useFpc = bool(values, 'useFpc', false)
  const { se, fpcApplied } = standardErrorMean(sd, n, N, useFpc)

  const lines: SolveResult['lines'] = [
    { label: 'SE(x̄)', value: fmt(se, 4) },
  ]
  if (fpcApplied) {
    lines.push({ label: 'Finite population correction', value: 'applied' })
  }

  if (query === 'greater') {
    const value = num(values, 'value')
    const left = NORM_DIST(value, mean, se, true)
    const prob = 1 - left
    return {
      excelCalls: [
        `=1 - ${formatExcelCall('NORM.DIST', [value, mean, se, true]).slice(1)}`,
      ],
      lines: [
        ...lines,
        { label: `P(x̄ ≤ ${value})`, value: fmt(left) },
        { label: `P(x̄ > ${value})`, value: fmt(prob), emphasis: true },
      ],
      note: 'Sampling distribution: x̄ ~ approx Normal(μ, σ/√n).',
    }
  }

  if (query === 'less') {
    const value = num(values, 'value')
    const prob = NORM_DIST(value, mean, se, true)
    return {
      excelCalls: [formatExcelCall('NORM.DIST', [value, mean, se, true])],
      lines: [
        ...lines,
        { label: `P(x̄ ≤ ${value})`, value: fmt(prob), emphasis: true },
      ],
    }
  }

  const lower = num(values, 'lower')
  const upper = num(values, 'upper')
  const hi = NORM_DIST(upper, mean, se, true)
  const lo = NORM_DIST(lower, mean, se, true)
  return {
    excelCalls: [
      `=${formatExcelCall('NORM.DIST', [upper, mean, se, true]).slice(1)} - ${formatExcelCall('NORM.DIST', [lower, mean, se, true]).slice(1)}`,
    ],
    lines: [
      ...lines,
      {
        label: `P(${lower} < x̄ < ${upper})`,
        value: fmt(hi - lo),
        emphasis: true,
      },
    ],
  }
}

function solveSampleProportion(values: Record<string, unknown>): SolveResult {
  const p = num(values, 'p')
  const n = num(values, 'n')
  const se = Math.sqrt((p * (1 - p)) / n)
  const query = str(values, 'query', 'greater')
  const value = num(values, 'value')

  const npOk = n * p >= 5 && n * (1 - p) >= 5
  const lines: SolveResult['lines'] = [
    { label: 'SE(p̂)', value: fmt(se, 6) },
    {
      label: 'CLT check np & n(1−p) ≥ 5',
      value: npOk ? 'ok' : 'borderline — interpret carefully',
    },
  ]

  if (query === 'greater') {
    const left = NORM_DIST(value, p, se, true)
    return {
      excelCalls: [
        `=1 - ${formatExcelCall('NORM.DIST', [value, p, se, true]).slice(1)}`,
      ],
      lines: [
        ...lines,
        { label: `P(p̂ > ${value})`, value: fmt(1 - left), emphasis: true },
      ],
    }
  }

  const left = NORM_DIST(value, p, se, true)
  return {
    excelCalls: [formatExcelCall('NORM.DIST', [value, p, se, true])],
    lines: [
      ...lines,
      { label: `P(p̂ ≤ ${value})`, value: fmt(left), emphasis: true },
    ],
  }
}

function solveCiMeanZ(values: Record<string, unknown>): SolveResult {
  const xbar = num(values, 'xbar')
  const sd = num(values, 'sd')
  const n = num(values, 'n')
  const confidence = num(values, 'confidence')
  const alpha = 1 - confidence
  const z = NORM_S_INV(1 - alpha / 2)
  const me = z * (sd / Math.sqrt(n))
  const lower = xbar - me
  const upper = xbar + me
  return {
    excelCalls: [
      formatExcelCall('NORM.S.INV', [1 - alpha / 2]),
      `margin = z * σ / SQRT(n)`,
    ],
    lines: [
      { label: 'z*', value: fmt(z, 4) },
      { label: 'Margin of error', value: fmt(me, 4) },
      {
        label: `${pct(confidence)} CI for μ`,
        value: `[${fmt(lower, 4)}, ${fmt(upper, 4)}]`,
        emphasis: true,
      },
    ],
  }
}

function solveCiMeanT(values: Record<string, unknown>): SolveResult {
  const xbar = num(values, 'xbar')
  const s = num(values, 's')
  const n = num(values, 'n')
  const confidence = num(values, 'confidence')
  const df = n - 1
  const alpha = 1 - confidence
  const t = T_INV(1 - alpha / 2, df)
  const me = t * (s / Math.sqrt(n))
  return {
    excelCalls: [
      formatExcelCall('T.INV', [1 - alpha / 2, df]),
      `margin = t * s / SQRT(n)`,
    ],
    lines: [
      { label: 'df', value: String(df) },
      { label: 't*', value: fmt(t, 4) },
      { label: 'Margin of error', value: fmt(me, 4) },
      {
        label: `${pct(confidence)} CI for μ`,
        value: `[${fmt(xbar - me, 4)}, ${fmt(xbar + me, 4)}]`,
        emphasis: true,
      },
    ],
  }
}

function solveCiProportion(values: Record<string, unknown>): SolveResult {
  const successes = num(values, 'successes')
  const n = num(values, 'n')
  const confidence = num(values, 'confidence')
  const phat = successes / n
  const alpha = 1 - confidence
  const z = NORM_S_INV(1 - alpha / 2)
  const se = Math.sqrt((phat * (1 - phat)) / n)
  const me = z * se
  return {
    excelCalls: [
      formatExcelCall('NORM.S.INV', [1 - alpha / 2]),
      `p̂ = successes / n`,
    ],
    lines: [
      { label: 'p̂', value: fmt(phat, 4) },
      { label: 'z*', value: fmt(z, 4) },
      { label: 'Margin of error', value: fmt(me, 4) },
      {
        label: `${pct(confidence)} CI for p`,
        value: `[${fmt(phat - me, 4)}, ${fmt(phat + me, 4)}]`,
        emphasis: true,
      },
    ],
  }
}

function solveNMean(values: Record<string, unknown>): SolveResult {
  const sd = num(values, 'sd')
  const E = num(values, 'E')
  const confidence = num(values, 'confidence')
  const alpha = 1 - confidence
  const z = NORM_S_INV(1 - alpha / 2)
  const raw = (z * sd) / E
  const n = ceilInt(raw * raw)
  return {
    excelCalls: [
      formatExcelCall('NORM.S.INV', [1 - alpha / 2]),
      'n = CEILING((z * σ / E)^2)',
    ],
    lines: [
      { label: 'z*', value: fmt(z, 4) },
      { label: 'Raw n', value: fmt(raw * raw, 4) },
      { label: 'Required n (round up)', value: String(n), emphasis: true },
    ],
  }
}

function solveNProportion(values: Record<string, unknown>): SolveResult {
  const confidence = num(values, 'confidence')
  const E = num(values, 'E')
  const conservative = bool(values, 'conservative', false)
  const p = conservative ? 0.5 : num(values, 'p')
  const alpha = 1 - confidence
  const z = NORM_S_INV(1 - alpha / 2)
  const raw = (z * z * p * (1 - p)) / (E * E)
  const n = ceilInt(raw)
  return {
    excelCalls: [
      formatExcelCall('NORM.S.INV', [1 - alpha / 2]),
      'n = CEILING(z² p (1−p) / E²)',
    ],
    lines: [
      { label: 'p used', value: fmt(p, 4) },
      { label: 'z*', value: fmt(z, 4) },
      { label: 'Required n (round up)', value: String(n), emphasis: true },
    ],
    note: conservative
      ? 'Conservative plan uses p = 0.5 (largest variance).'
      : 'Pilot p̂ used for planning sample size.',
  }
}
