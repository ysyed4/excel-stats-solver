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
import type { Diagram, SolveResult, SolverId, WalkthroughStep } from './types'

/** Human-readable names so validation errors match the Inputs panel labels. */
const FIELD_LABELS: Record<string, string> = {
  mean: 'Population mean μ',
  sd: 'Population σ',
  n: 'Sample size n',
  N: 'Population N',
  value: 'Value',
  lower: 'Lower',
  upper: 'Upper',
  x: 'x',
  x2: 'Optional exact x₂',
  z: 'z',
  zLow: 'Known lower z',
  zHigh: 'Known upper z',
  p: 'Population proportion p',
  lambda: 'Rate λ',
  hours: 'Interval multiplier',
  independentDays: 'Independent days',
  a: 'Minimum a',
  b: 'Maximum b',
  atLeast: 'Optional P(X ≥ …)',
  exact: 'Optional exact point',
  probability: 'Target probability p',
  alpha: 'α',
  t: 't',
  df: 'Degrees of freedom',
  drawCount: 'Independent draws',
  xbar: 'Sample mean x̄',
  s: 'Sample s',
  successes: 'Successes',
  confidence: 'Confidence',
  E: 'Margin of error E',
}

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key
}

function num(values: Record<string, unknown>, key: string): number {
  const raw = values[key]
  if (raw === '' || raw === null || raw === undefined) {
    throw new Error(`Enter a valid number for ${fieldLabel(key)}`)
  }
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''))
  if (!Number.isFinite(n)) {
    throw new Error(`Enter a valid number for ${fieldLabel(key)}`)
  }
  return n
}

/** True when a form field holds a finite number (not blank / mid-edit garbage). */
function hasFiniteNumber(values: Record<string, unknown>, key: string): boolean {
  const raw = values[key]
  if (raw === '' || raw === null || raw === undefined) return false
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''))
  return Number.isFinite(n)
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

function step(
  number: number,
  title: string,
  body: string,
  extra?: Pick<WalkthroughStep, 'excel' | 'values'>,
): WalkthroughStep {
  return { number, title, body, ...extra }
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
  const query = str(values, 'query', 'atLeast')

  const baseSteps: WalkthroughStep[] = [
    step(
      1,
      'Determine the distribution',
      `Fixed number of independent trials with success/failure outcomes and constant p → Binomial(n = ${n}, p = ${p}).`,
    ),
    step(
      2,
      'Code the problem',
      `Let X = number of successes in ${n} trials. Known: n = ${n}, p = ${p}.`,
      {
        values: [
          { label: 'n', value: String(n) },
          { label: 'p', value: String(p) },
        ],
      },
    ),
  ]

  // Largest integer x with P(X ≤ x) ≤ target (discrete percentile / inverse CDF)
  if (query === 'percentile') {
    const target = num(values, 'probability')
    if (!(target > 0 && target < 1)) {
      throw new Error('Target probability p must be strictly between 0 and 1.')
    }
    let xStar = 0
    let cdf = BINOM_DIST(0, n, p, true)
    let exceededAtZero = false
    if (cdf > target) {
      exceededAtZero = true
      xStar = 0
    } else {
      for (let x = 1; x <= n; x++) {
        const next = BINOM_DIST(x, n, p, true)
        if (next > target) break
        xStar = x
        cdf = next
      }
    }
    const cdfNext = xStar < n ? BINOM_DIST(xStar + 1, n, p, true) : 1
    const excel = formatExcelCall('BINOM.DIST', [xStar, n, p, true])
    const excelNext =
      xStar < n
        ? formatExcelCall('BINOM.DIST', [xStar + 1, n, p, true])
        : undefined
    return {
      excelCalls: [excel, ...(excelNext ? [excelNext] : [])],
      lines: [
        {
          label: `Largest x with P(X ≤ x) ≤ ${target}`,
          value: String(xStar),
          emphasis: true,
        },
        { label: `P(X ≤ ${xStar})`, value: fmt(cdf) },
        ...(xStar < n
          ? [{ label: `P(X ≤ ${xStar + 1})`, value: fmt(cdfNext) }]
          : []),
      ],
      note: exceededAtZero
        ? `P(X ≤ 0) = ${fmt(cdf)} already exceeds the target ${target}; reporting x = 0.`
        : `P(X ≤ ${xStar}) = ${fmt(cdf)} ≤ ${target}, but P(X ≤ ${xStar + 1}) = ${fmt(cdfNext)} > ${target}.`,
      walkthrough: {
        title: 'Binomial · discrete percentile (inverse CDF)',
        distribution: `X ~ Binomial(n = ${n}, p = ${p})`,
        find: `Largest integer x with P(X ≤ x) ≤ ${target}`,
        diagram: {
          kind: 'number-line',
          min: 0,
          max: n,
          marks: [
            { value: 0, label: '0' },
            { value: xStar, label: String(xStar) },
            { value: n, label: String(n) },
          ],
          highlightFrom: 0,
          highlightTo: xStar,
          caption: `Search left-tail CDF until it would exceed ${target}`,
        },
        steps: [
          ...baseSteps,
          step(
            3,
            'Identify what to find',
            `Largest x such that BINOM.DIST(x, ${n}, ${p}, TRUE) ≤ ${target}.`,
          ),
          step(
            4,
            'Draw a diagram',
            'Walk the discrete number line, checking the cumulative probability at each integer.',
          ),
          step(
            5,
            'Translate for Excel',
            `Search x = 0, 1, … while BINOM.DIST(x, n, p, TRUE) ≤ ${target}; stop at the last success.`,
            { excel: [excel] },
          ),
          step(
            6,
            'Solve and check',
            exceededAtZero
              ? `Even x = 0 exceeds the target (CDF ≈ ${fmt(cdf)}).`
              : `x = ${xStar}: CDF ≈ ${fmt(cdf)} ≤ ${target}; x = ${xStar + 1}: CDF ≈ ${fmt(cdfNext)} > ${target}.`,
            {
              values: [
                { label: 'x*', value: String(xStar) },
                { label: `P(X ≤ ${xStar})`, value: fmt(cdf) },
              ],
            },
          ),
        ],
        explanation:
          'This is a discrete inverse-CDF / percentile search: keep the largest x whose left-tail probability does not exceed the target.',
      },
    }
  }

  // P(X < a) or P(X > b) = left tail + right tail (never drop one side)
  if (query === 'outside') {
    const a = num(values, 'lower')
    const b = num(values, 'upper')
    if (!(a < b)) {
      throw new Error('Outside query needs lower < upper (thresholds for X < a or X > b).')
    }
    const leftCut = a - 1
    const leftProb = leftCut < 0 ? 0 : BINOM_DIST(leftCut, n, p, true)
    const rightCum = BINOM_DIST(b, n, p, true)
    const rightProb = 1 - rightCum
    const total = leftProb + rightProb
    const excelLeft =
      leftCut < 0 ? '=0' : formatExcelCall('BINOM.DIST', [leftCut, n, p, true])
    const excelRight = formatExcelCall('BINOM.DIST', [b, n, p, true])
    return {
      excelCalls: [
        leftCut < 0
          ? `=0 + (1 - ${excelRight.slice(1)})`
          : `=${excelLeft.slice(1)} + (1 - ${excelRight.slice(1)})`,
      ],
      lines: [
        {
          label: `P(X < ${a}) = P(X ≤ ${leftCut < 0 ? '−1' : leftCut})`,
          value: fmt(leftProb),
        },
        { label: `P(X > ${b})`, value: fmt(rightProb) },
        {
          label: `P(X < ${a} or X > ${b})`,
          value: fmt(total),
          emphasis: true,
        },
      ],
      note: 'Union of two disjoint tails: compute both terms and add — do not drop either side.',
      walkthrough: {
        title: 'Binomial · outside (two-tail union)',
        distribution: `X ~ Binomial(n = ${n}, p = ${p})`,
        find: `P(X < ${a} or X > ${b})`,
        diagram: {
          kind: 'number-line',
          min: 0,
          max: n,
          marks: [
            { value: 0, label: '0' },
            { value: a, label: String(a) },
            { value: b, label: String(b) },
            { value: n, label: String(n) },
          ],
          highlightFrom: 0,
          highlightTo: Math.max(0, leftCut),
          caption: `Left: X < ${a}; right: X > ${b}`,
        },
        steps: [
          ...baseSteps,
          step(
            3,
            'Identify what to find',
            `P(X < ${a}) + P(X > ${b}) (disjoint events — add both).`,
          ),
          step(
            4,
            'Draw a diagram',
            `Shade 0…${leftCut < 0 ? '∅' : leftCut} and ${b + 1}…${n}.`,
          ),
          step(
            5,
            'Translate for Excel',
            `P(X < ${a}) = BINOM.DIST(${leftCut},…,TRUE); P(X > ${b}) = 1 − BINOM.DIST(${b},…,TRUE).`,
            { excel: [excelLeft, `=1 - ${excelRight.slice(1)}`] },
          ),
          step(
            6,
            'Solve and check',
            `${fmt(leftProb)} + ${fmt(rightProb)} = ${fmt(total)}.`,
            {
              values: [
                { label: `P(X < ${a})`, value: fmt(leftProb) },
                { label: `P(X > ${b})`, value: fmt(rightProb) },
                { label: 'Union', value: fmt(total) },
              ],
            },
          ),
        ],
        explanation:
          'An “or” of two disjoint tails is a sum. Never report only the first tail.',
      },
    }
  }

  if (query === 'compare') {
    const queryA = str(values, 'queryA', 'equal')
    const queryB = str(values, 'queryB', 'equal')
    const xA = num(values, 'xA')
    const xB = num(values, 'xB')
    const pA = binomialEventProb(n, p, queryA, xA)
    const pB = binomialEventProb(n, p, queryB, xB)
    const labelA = binomialEventLabel(queryA, xA)
    const labelB = binomialEventLabel(queryB, xB)
    const winner =
      Math.abs(pA - pB) < 1e-12
        ? 'Equally likely'
        : pA > pB
          ? `A more likely (${labelA})`
          : `B more likely (${labelB})`
    return {
      excelCalls: [
        binomialEventExcel(n, p, queryA, xA),
        binomialEventExcel(n, p, queryB, xB),
      ],
      lines: [
        { label: `A: ${labelA}`, value: fmt(pA), emphasis: pA >= pB },
        { label: `B: ${labelB}`, value: fmt(pB), emphasis: pB > pA },
        { label: 'Comparison', value: winner, emphasis: true },
      ],
      note: 'Compute both sides fully, then compare — never drop one event.',
      walkthrough: {
        title: 'Binomial · which is more likely?',
        distribution: `X ~ Binomial(n = ${n}, p = ${p})`,
        find: `Compare ${labelA} vs ${labelB}`,
        diagram: {
          kind: 'number-line',
          min: 0,
          max: n,
          marks: [
            { value: 0, label: '0' },
            { value: xA, label: `A:${xA}` },
            { value: xB, label: `B:${xB}` },
            { value: n, label: String(n) },
          ],
          highlightFrom: Math.min(xA, xB),
          highlightTo: Math.max(xA, xB),
          caption: 'Evaluate both events on the same distribution',
        },
        steps: [
          ...baseSteps,
          step(3, 'Identify what to find', `Compare ${labelA} with ${labelB}.`),
          step(4, 'Draw a diagram', 'Mark both events on the same number line.'),
          step(5, 'Translate for Excel', 'Compute each probability with BINOM.DIST.', {
            excel: [
              binomialEventExcel(n, p, queryA, xA),
              binomialEventExcel(n, p, queryB, xB),
            ],
          }),
          step(
            6,
            'Solve and check',
            `${labelA} ≈ ${fmt(pA)}; ${labelB} ≈ ${fmt(pB)} → ${winner}.`,
            {
              values: [
                { label: labelA, value: fmt(pA) },
                { label: labelB, value: fmt(pB) },
              ],
            },
          ),
        ],
        explanation:
          'A comparison question requires both probabilities before declaring a winner.',
      },
    }
  }


  const x = num(values, 'x')
  const hasExact = values.x2 !== undefined && values.x2 !== ''
  const x2 = hasExact ? num(values, 'x2') : undefined

  if (query === 'equal') {
    const prob = BINOM_DIST(x, n, p, false)
    const excel = formatExcelCall('BINOM.DIST', [x, n, p, false])
    return {
      excelCalls: [excel],
      lines: [{ label: `P(X = ${x})`, value: fmt(prob), emphasis: true }],
      walkthrough: {
        title: 'Binomial · exact probability',
        distribution: `X ~ Binomial(n = ${n}, p = ${p})`,
        find: `P(X = ${x})`,
        diagram: {
          kind: 'number-line',
          min: 0,
          max: n,
          marks: [
            { value: 0, label: '0' },
            { value: x, label: String(x) },
            { value: n, label: String(n) },
          ],
          highlightFrom: x,
          highlightTo: x,
          caption: `Highlight the single outcome X = ${x}`,
        },
        steps: [
          ...baseSteps,
          step(3, 'Identify what to find', `We want the point probability P(X = ${x}).`),
          step(
            4,
            'Draw a diagram',
            `On the discrete number line from 0 to ${n}, mark the single point x = ${x}.`,
          ),
          step(
            5,
            'Translate for Excel',
            `Use BINOM.DIST with cumulative = FALSE for a point probability.`,
            { excel: [excel] },
          ),
          step(
            6,
            'Solve and check',
            `${excel} ≈ ${fmt(prob)}. A point probability for a reasonable x should sit between 0 and 1 and usually be small when n is large.`,
            { values: [{ label: `P(X = ${x})`, value: fmt(prob) }] },
          ),
        ],
        explanation: `Excel’s BINOM.DIST with FALSE returns P(X = ${x}) directly — no need to expand the binomial PMF by hand.`,
      },
    }
  }

  if (query === 'atMost') {
    const prob = BINOM_DIST(x, n, p, true)
    const excel = formatExcelCall('BINOM.DIST', [x, n, p, true])
    return {
      excelCalls: [excel],
      lines: [{ label: `P(X ≤ ${x})`, value: fmt(prob), emphasis: true }],
      walkthrough: {
        title: 'Binomial · cumulative probability',
        distribution: `X ~ Binomial(n = ${n}, p = ${p})`,
        find: `P(X ≤ ${x})`,
        diagram: {
          kind: 'number-line',
          min: 0,
          max: n,
          marks: [
            { value: 0, label: '0' },
            { value: x, label: String(x) },
            { value: n, label: String(n) },
          ],
          highlightFrom: 0,
          highlightTo: x,
          caption: `Shade outcomes from 0 through ${x}`,
        },
        steps: [
          ...baseSteps,
          step(3, 'Identify what to find', `We want P(X ≤ ${x}).`),
          step(
            4,
            'Draw a diagram',
            `Shade all integer outcomes from 0 through ${x} on the number line.`,
          ),
          step(
            5,
            'Translate for Excel',
            `Cumulative BINOM.DIST with TRUE returns the left-tail probability directly.`,
            { excel: [excel] },
          ),
          step(
            6,
            'Solve and check',
            `${excel} ≈ ${fmt(prob)}.`,
            { values: [{ label: `P(X ≤ ${x})`, value: fmt(prob) }] },
          ),
        ],
        explanation: `P(X ≤ ${x}) is exactly what BINOM.DIST(…, TRUE) is designed to return.`,
      },
    }
  }

  if (query === 'moreThan') {
    const cum = BINOM_DIST(x, n, p, true)
    const more = 1 - cum
    const excelLeft = formatExcelCall('BINOM.DIST', [x, n, p, true])
    return {
      excelCalls: [`=1 - ${excelLeft.slice(1)}`],
      lines: [
        { label: `P(X ≤ ${x})`, value: fmt(cum) },
        { label: `P(X > ${x})`, value: fmt(more), emphasis: true },
      ],
      note: 'Translate P(X > k) into 1 − BINOM.DIST(k, n, p, TRUE).',
      walkthrough: {
        title: 'Binomial · more-than probability',
        distribution: `X ~ Binomial(n = ${n}, p = ${p})`,
        find: `P(X > ${x})`,
        diagram: {
          kind: 'number-line',
          min: 0,
          max: n,
          marks: [
            { value: 0, label: '0' },
            { value: x, label: String(x) },
            { value: n, label: String(n) },
          ],
          highlightFrom: Math.min(x + 1, n),
          highlightTo: n,
          caption: `Shade X ≥ ${x + 1} (i.e. X > ${x})`,
        },
        steps: [
          ...baseSteps,
          step(
            3,
            'Identify what to find',
            `Find P(X > ${x}) — e.g. overflow / more demand than capacity ${x}.`,
          ),
          step(
            4,
            'Draw a diagram',
            `Shade outcomes ${x + 1} through ${n}. Complement is 0 through ${x}.`,
          ),
          step(
            5,
            'Translate for Excel',
            `P(X > ${x}) = 1 − P(X ≤ ${x}) = 1 − BINOM.DIST(${x}, ${n}, ${p}, TRUE).`,
            { excel: [excelLeft, `=1 - ${excelLeft.slice(1)}`] },
          ),
          step(
            6,
            'Solve and check',
            `P(X ≤ ${x}) ≈ ${fmt(cum)}, so P(X > ${x}) = ${fmt(more)}.`,
            {
              values: [
                { label: `P(X ≤ ${x})`, value: fmt(cum) },
                { label: `P(X > ${x})`, value: fmt(more) },
              ],
            },
          ),
        ],
        explanation: `MMA solutions write this as 1 − BINOM.DIST(${x}, n, p, TRUE).`,
      },
    }
  }


  if (query === 'atLeast') {
  // atLeast: P(X ≥ x) = 1 − P(X ≤ x−1)
  const cutoff = x - 1
  const left = cutoff < 0 ? 0 : BINOM_DIST(cutoff, n, p, true)
  const prob = 1 - left
  const excelLeft =
    cutoff < 0
      ? undefined
      : formatExcelCall('BINOM.DIST', [cutoff, n, p, true])
  const excelCalls =
    cutoff < 0
      ? ['=1']
      : [`=1 - ${excelLeft!.slice(1)}`]

  const lines = [
    {
      label: cutoff < 0 ? 'P(X ≤ −1)' : `P(X ≤ ${cutoff})`,
      value: cutoff < 0 ? '0' : fmt(left),
    },
    { label: `P(X ≥ ${x})`, value: fmt(prob), emphasis: true },
  ]

  let exactExcel: string | undefined
  let exactProb: number | undefined
  if (x2 !== undefined) {
    exactProb = BINOM_DIST(x2, n, p, false)
    exactExcel = formatExcelCall('BINOM.DIST', [x2, n, p, false])
    excelCalls.push(exactExcel)
    lines.push({ label: `P(X = ${x2})`, value: fmt(exactProb), emphasis: true })
  }

  const findParts = [`P(X ≥ ${x})`]
  if (x2 !== undefined) findParts.push(`P(X = ${x2})`)

  return {
    excelCalls,
    lines,
    note: 'Translate P(X ≥ k) into 1 − BINOM.DIST(k−1, n, p, TRUE).',
    walkthrough: {
      title: 'Binomial · at-least probability',
      distribution: `X ~ Binomial(n = ${n}, p = ${p})`,
      find: findParts.join(' and '),
      diagram: {
        kind: 'number-line',
        min: 0,
        max: n,
        marks: [
          { value: 0, label: '0' },
          ...(cutoff >= 0 ? [{ value: cutoff, label: String(cutoff) }] : []),
          { value: x, label: String(x) },
          ...(x2 !== undefined ? [{ value: x2, label: String(x2) }] : []),
          { value: n, label: String(n) },
        ],
        highlightFrom: x,
        highlightTo: n,
        caption: `Shade X ≥ ${x} (pass region). Complement is X ≤ ${cutoff < 0 ? '−1' : cutoff}.`,
      },
      steps: [
        ...baseSteps,
        step(
          3,
          'Identify what to find',
          x2 !== undefined
            ? `Find P(X ≥ ${x}) (e.g. “pass”) and the exact probability P(X = ${x2}).`
            : `Find P(X ≥ ${x}).`,
        ),
        step(
          4,
          'Draw a diagram',
          `On a number line from 0 to ${n}, shade the outcomes ${x}, ${x + 1}, …, ${n}. The unshaded complement is 0 through ${cutoff < 0 ? 'nothing' : cutoff}.`,
        ),
        step(
          5,
          'Translate for Excel',
          cutoff < 0
            ? `P(X ≥ ${x}) covers the entire support, so the probability is 1.`
            : `Excel’s cumulative BINOM.DIST returns left tails, so rewrite:\nP(X ≥ ${x}) = 1 − P(X ≤ ${cutoff}).${
                x2 !== undefined
                  ? `\nFor the exact count use cumulative = FALSE: P(X = ${x2}).`
                  : ''
              }`,
          {
            excel: [
              ...(excelLeft ? [excelLeft, `=1 - ${excelLeft.slice(1)}`] : ['=1']),
              ...(exactExcel ? [exactExcel] : []),
            ],
          },
        ),
        step(
          6,
          'Solve and check',
          cutoff < 0
            ? `P(X ≥ ${x}) = 1.`
            : `P(X ≤ ${cutoff}) = ${excelLeft} ≈ ${fmt(left)}.\nTherefore P(X ≥ ${x}) = 1 − ${fmt(left)} = ${fmt(prob)}.${
                exactProb !== undefined && exactExcel
                  ? `\nAlso ${exactExcel} ≈ ${fmt(exactProb)}.`
                  : ''
              }\nCheck: both answers are between 0 and 1; with p = 0.5 and n = ${n}, P(X ≥ ${x}) near one-half is reasonable when x is near the mean.`,
          {
            values: [
              ...(cutoff >= 0
                ? [{ label: `P(X ≤ ${cutoff})`, value: fmt(left) }]
                : []),
              { label: `P(X ≥ ${x})`, value: fmt(prob) },
              ...(exactProb !== undefined
                ? [{ label: `P(X = ${x2})`, value: fmt(exactProb) }]
                : []),
            ],
          },
        ),
      ],
      explanation:
        'Same workflow as the MMA slides: identify Binomial → code n and p → state the event → sketch the number line → rewrite as 1 − CDF → look up with BINOM.DIST.',
    },
  }

  }

  throw new Error(
    `Unknown binomial query: "${query}". Expected equal, atMost, atLeast, moreThan, percentile, outside, or compare.`,
  )
}

function binomialEventLabel(query: string, x: number): string {
  if (query === 'equal') return `P(X = ${x})`
  if (query === 'atMost') return `P(X ≤ ${x})`
  if (query === 'moreThan') return `P(X > ${x})`
  return `P(X ≥ ${x})`
}

function binomialEventProb(n: number, p: number, query: string, x: number): number {
  if (query === 'equal') return BINOM_DIST(x, n, p, false)
  if (query === 'atMost') return BINOM_DIST(x, n, p, true)
  if (query === 'moreThan') return 1 - BINOM_DIST(x, n, p, true)
  const cutoff = x - 1
  return cutoff < 0 ? 1 : 1 - BINOM_DIST(cutoff, n, p, true)
}

function binomialEventExcel(n: number, p: number, query: string, x: number): string {
  if (query === 'equal') return formatExcelCall('BINOM.DIST', [x, n, p, false])
  if (query === 'atMost') return formatExcelCall('BINOM.DIST', [x, n, p, true])
  if (query === 'moreThan') {
    const left = formatExcelCall('BINOM.DIST', [x, n, p, true])
    return `=1 - ${left.slice(1)}`
  }
  const cutoff = x - 1
  if (cutoff < 0) return '=1'
  const left = formatExcelCall('BINOM.DIST', [cutoff, n, p, true])
  return `=1 - ${left.slice(1)}`
}


function solvePoisson(values: Record<string, unknown>): SolveResult {
  const lambdaBase = num(values, 'lambda')
  const query = str(values, 'query', 'equal')
  const hours =
    values.hours === '' || values.hours === undefined ? 1 : num(values, 'hours')
  const lambda = lambdaBase * hours
  const independentDays =
    values.independentDays === '' || values.independentDays === undefined
      ? 1
      : Math.max(1, Math.round(num(values, 'independentDays')))

  const base = [
    step(
      1,
      'Determine the distribution',
      'Counts of events at a constant average rate over an interval → Poisson.',
    ),
    step(
      2,
      'Code the problem',
      `Base rate λ₀ = ${lambdaBase} per unit interval. Interval multiplier = ${hours}, so λ = ${fmt(lambda, 4)}.`,
      {
        values: [
          { label: 'λ₀', value: String(lambdaBase) },
          { label: 'intervals', value: String(hours) },
          { label: 'λ used', value: fmt(lambda, 4) },
        ],
      },
    ),
  ]

  if (query === 'percentile') {
    const target = num(values, 'probability')
    if (!(target > 0 && target < 1)) {
      throw new Error('Target probability p must be strictly between 0 and 1.')
    }
    const cap = Math.max(1, Math.ceil(lambda + 10 * Math.sqrt(Math.max(lambda, 1))))
    let xStar = 0
    let cdf = POISSON_DIST(0, lambda, true)
    let exceededAtZero = false
    if (cdf > target) {
      exceededAtZero = true
      xStar = 0
    } else {
      for (let x = 1; x <= cap; x++) {
        const next = POISSON_DIST(x, lambda, true)
        if (next > target) break
        xStar = x
        cdf = next
      }
    }
    const cdfNext = POISSON_DIST(xStar + 1, lambda, true)
    const excel = formatExcelCall('POISSON.DIST', [xStar, lambda, true])
    const excelNext = formatExcelCall('POISSON.DIST', [xStar + 1, lambda, true])
    return {
      excelCalls: [excel, excelNext],
      lines: [
        {
          label: `Largest x with P(X ≤ x) ≤ ${target}`,
          value: String(xStar),
          emphasis: true,
        },
        { label: `P(X ≤ ${xStar})`, value: fmt(cdf) },
        { label: `P(X ≤ ${xStar + 1})`, value: fmt(cdfNext) },
      ],
      note: exceededAtZero
        ? `P(X ≤ 0) = ${fmt(cdf)} already exceeds the target ${target}; reporting x = 0.`
        : `P(X ≤ ${xStar}) = ${fmt(cdf)} ≤ ${target}, but P(X ≤ ${xStar + 1}) = ${fmt(cdfNext)} > ${target}.`,
      walkthrough: {
        title: 'Poisson · discrete percentile (inverse CDF)',
        distribution: `X ~ Poisson(λ = ${fmt(lambda, 4)})`,
        find: `Largest integer x with P(X ≤ x) ≤ ${target}`,
        diagram: {
          kind: 'number-line',
          min: 0,
          max: Math.max(cap, xStar + 3),
          marks: [
            { value: 0, label: '0' },
            { value: xStar, label: String(xStar) },
          ],
          highlightFrom: 0,
          highlightTo: xStar,
          caption: `Search left-tail CDF until it would exceed ${target}`,
        },
        steps: [
          ...base,
          step(
            3,
            'Identify what to find',
            `Largest x such that POISSON.DIST(x, λ, TRUE) ≤ ${target}.`,
          ),
          step(
            4,
            'Draw a diagram',
            `Walk x = 0, 1, … (cap ≈ λ + 10√λ = ${cap}) checking the CDF.`,
          ),
          step(
            5,
            'Translate for Excel',
            `Search while POISSON.DIST(x, ${fmt(lambda, 4)}, TRUE) ≤ ${target}.`,
            { excel: [excel] },
          ),
          step(
            6,
            'Solve and check',
            exceededAtZero
              ? `Even x = 0 exceeds the target (CDF ≈ ${fmt(cdf)}).`
              : `x = ${xStar}: CDF ≈ ${fmt(cdf)} ≤ ${target}; x = ${xStar + 1}: CDF ≈ ${fmt(cdfNext)} > ${target}.`,
            {
              values: [
                { label: 'x*', value: String(xStar) },
                { label: `P(X ≤ ${xStar})`, value: fmt(cdf) },
              ],
            },
          ),
        ],
        explanation:
          'Discrete inverse-CDF search on Poisson: keep the largest x whose left-tail probability does not exceed the target.',
      },
    }
  }

  if (query === 'outside') {
    const a = num(values, 'lower')
    const b = num(values, 'upper')
    if (!(a < b)) {
      throw new Error('Outside query needs lower < upper (thresholds for X < a or X > b).')
    }
    const leftCut = a - 1
    const leftProb = leftCut < 0 ? 0 : POISSON_DIST(leftCut, lambda, true)
    const rightCum = POISSON_DIST(b, lambda, true)
    const rightProb = 1 - rightCum
    const total = leftProb + rightProb
    const excelLeft =
      leftCut < 0 ? '=0' : formatExcelCall('POISSON.DIST', [leftCut, lambda, true])
    const excelRight = formatExcelCall('POISSON.DIST', [b, lambda, true])
    return {
      excelCalls: [
        leftCut < 0
          ? `=0 + (1 - ${excelRight.slice(1)})`
          : `=${excelLeft.slice(1)} + (1 - ${excelRight.slice(1)})`,
      ],
      lines: [
        {
          label: `P(X < ${a}) = P(X ≤ ${leftCut < 0 ? '−1' : leftCut})`,
          value: fmt(leftProb),
        },
        { label: `P(X > ${b})`, value: fmt(rightProb) },
        {
          label: `P(X < ${a} or X > ${b})`,
          value: fmt(total),
          emphasis: true,
        },
      ],
      note: 'Union of two disjoint tails: compute both terms and add — do not drop either side.',
      walkthrough: {
        title: 'Poisson · outside (two-tail union)',
        distribution: `X ~ Poisson(λ = ${fmt(lambda, 4)})`,
        find: `P(X < ${a} or X > ${b})`,
        diagram: {
          kind: 'number-line',
          min: 0,
          max: Math.max(b + 5, a + 5, 20),
          marks: [
            { value: 0, label: '0' },
            { value: a, label: String(a) },
            { value: b, label: String(b) },
          ],
          highlightFrom: 0,
          highlightTo: Math.max(0, leftCut),
          caption: `Left: X < ${a}; right: X > ${b}`,
        },
        steps: [
          ...base,
          step(
            3,
            'Identify what to find',
            `P(X < ${a}) + P(X > ${b}) (disjoint events — add both).`,
          ),
          step(
            4,
            'Draw a diagram',
            `Shade 0…${leftCut < 0 ? '∅' : leftCut} and ${b + 1}, ${b + 2}, …`,
          ),
          step(
            5,
            'Translate for Excel',
            `P(X < ${a}) = POISSON.DIST(${leftCut}, λ, TRUE); P(X > ${b}) = 1 − POISSON.DIST(${b}, λ, TRUE).`,
            { excel: [excelLeft, `=1 - ${excelRight.slice(1)}`] },
          ),
          step(
            6,
            'Solve and check',
            `${fmt(leftProb)} + ${fmt(rightProb)} = ${fmt(total)}. Never drop one tail.`,
            {
              values: [
                { label: `P(X < ${a})`, value: fmt(leftProb) },
                { label: `P(X > ${b})`, value: fmt(rightProb) },
                { label: 'Union', value: fmt(total) },
              ],
            },
          ),
        ],
        explanation:
          'An “or” of two disjoint tails is a sum. Never report only the first tail.',
      },
    }
  }

  if (query === 'compare') {
    const queryA = str(values, 'queryA', 'equal')
    const queryB = str(values, 'queryB', 'equal')
    const xA = num(values, 'xA')
    const xB = num(values, 'xB')
    const pA = poissonEventProb(lambda, queryA, xA)
    const pB = poissonEventProb(lambda, queryB, xB)
    const labelA = binomialEventLabel(queryA, xA)
    const labelB = binomialEventLabel(queryB, xB)
    const winner =
      Math.abs(pA - pB) < 1e-12
        ? 'Equally likely'
        : pA > pB
          ? `A more likely (${labelA})`
          : `B more likely (${labelB})`
    return {
      excelCalls: [
        poissonEventExcel(lambda, queryA, xA),
        poissonEventExcel(lambda, queryB, xB),
      ],
      lines: [
        { label: `A: ${labelA}`, value: fmt(pA), emphasis: pA >= pB },
        { label: `B: ${labelB}`, value: fmt(pB), emphasis: pB > pA },
        { label: 'Comparison', value: winner, emphasis: true },
      ],
      note: 'Compute both sides fully, then compare.',
      walkthrough: {
        title: 'Poisson · which is more likely?',
        distribution: `X ~ Poisson(λ = ${fmt(lambda, 4)})`,
        find: `Compare ${labelA} vs ${labelB}`,
        diagram: {
          kind: 'number-line',
          min: 0,
          max: Math.max(xA, xB, 8) + 3,
          marks: [
            { value: 0, label: '0' },
            { value: xA, label: `A:${xA}` },
            { value: xB, label: `B:${xB}` },
          ],
          highlightFrom: Math.min(xA, xB),
          highlightTo: Math.max(xA, xB),
          caption: 'Evaluate both events',
        },
        steps: [
          ...base,
          step(3, 'Identify what to find', `Compare ${labelA} with ${labelB}.`),
          step(4, 'Draw a diagram', 'Mark both events.'),
          step(5, 'Translate for Excel', 'POISSON.DIST for each side.', {
            excel: [
              poissonEventExcel(lambda, queryA, xA),
              poissonEventExcel(lambda, queryB, xB),
            ],
          }),
          step(
            6,
            'Solve and check',
            `${labelA} ≈ ${fmt(pA)}; ${labelB} ≈ ${fmt(pB)} → ${winner}.`,
            {
              values: [
                { label: labelA, value: fmt(pA) },
                { label: labelB, value: fmt(pB) },
              ],
            },
          ),
        ],
        explanation: 'Both probabilities are required before declaring which event is more likely.',
      },
    }
  }


  const x = num(values, 'x')

  function withIndependentDays(
    oneDayProb: number,
    oneDayExcelInner: string,
    oneDayLabel: string,
    findLabel: string,
    walkthroughTitle: string,
    diagram: Diagram,
    identifyBody: string,
    drawBody: string,
    translateBody: string,
  ): SolveResult {
    const raised = independentDays > 1 ? oneDayProb ** independentDays : oneDayProb
    const excelCalls =
      independentDays > 1
        ? [`=(${oneDayExcelInner})^${independentDays}`]
        : [`=${oneDayExcelInner}`]
    const lines =
      independentDays > 1
        ? [
            { label: 'λ used', value: fmt(lambda, 4) },
            { label: oneDayLabel, value: fmt(oneDayProb) },
            {
              label: `(${oneDayLabel})^${independentDays}`,
              value: fmt(raised),
              emphasis: true,
            },
          ]
        : [
            { label: 'λ used', value: fmt(lambda, 4) },
            { label: oneDayLabel, value: fmt(raised), emphasis: true },
          ]

    const steps = [
      ...base,
      step(3, 'Identify what to find', identifyBody),
      step(4, 'Draw a diagram', drawBody),
      step(5, 'Translate for Excel', translateBody, {
        excel: [`=${oneDayExcelInner}`],
      }),
      step(6, 'Solve and check', `${oneDayLabel} ≈ ${fmt(oneDayProb)}.`, {
        values: [{ label: oneDayLabel, value: fmt(oneDayProb) }],
      }),
    ]

    if (independentDays > 1) {
      steps.push(
        step(
          7,
          'Independent identical days',
          `The event must occur on each of ${independentDays} independent days, so raise the single-day probability to the ${independentDays}th power.`,
          {
            excel: excelCalls,
            values: [
              { label: oneDayLabel, value: fmt(oneDayProb) },
              {
                label: `P(all ${independentDays} days)`,
                value: fmt(raised),
              },
            ],
          },
        ),
      )
    }

    return {
      excelCalls,
      lines,
      note:
        independentDays > 1
          ? 'Do not scale λ across days here — each day is a separate Poisson trial; raise the daily probability to the power of the number of days.'
          : 'Scale λ with the interval length when the question covers a longer window (e.g. full trip total).',
      walkthrough: {
        title: walkthroughTitle,
        distribution: `X ~ Poisson(λ = ${fmt(lambda, 4)})`,
        find:
          independentDays > 1
            ? `${findLabel} on each of ${independentDays} independent days → (${findLabel})^${independentDays}`
            : findLabel,
        diagram,
        steps,
        explanation:
          independentDays > 1
            ? `Single-day ${findLabel} ≈ ${fmt(oneDayProb)}; over ${independentDays} independent days → ${fmt(raised)}.`
            : `Use the Poisson CDF (or 1 − CDF) after aligning λ with the question window.`,
      },
    }
  }

  if (query === 'equal') {
    const oneDay = POISSON_DIST(x, lambda, false)
    const inner = formatExcelCall('POISSON.DIST', [x, lambda, false]).slice(1)
    return withIndependentDays(
      oneDay,
      inner,
      `P(X = ${x})`,
      `P(X = ${x})`,
      'Poisson · exact count',
      {
        kind: 'number-line',
        min: 0,
        max: Math.max(8, x + 3),
        marks: [
          { value: 0, label: '0' },
          { value: x, label: String(x) },
          { value: Math.max(8, x + 3), label: '…' },
        ],
        highlightFrom: x,
        highlightTo: x,
        caption: `Single outcome X = ${x}`,
      },
      `P(X = ${x}).`,
      `Mark the single count ${x} on a discrete number line.`,
      'Use POISSON.DIST with cumulative = FALSE.',
    )
  }

  if (query === 'atMost') {
    const oneDay = POISSON_DIST(x, lambda, true)
    const inner = formatExcelCall('POISSON.DIST', [x, lambda, true]).slice(1)
    return withIndependentDays(
      oneDay,
      inner,
      `P(X ≤ ${x})`,
      `P(X ≤ ${x})`,
      'Poisson · cumulative',
      {
        kind: 'number-line',
        min: 0,
        max: Math.max(8, x + 3),
        marks: [
          { value: 0, label: '0' },
          { value: x, label: String(x) },
        ],
        highlightFrom: 0,
        highlightTo: x,
        caption: `Shade 0 through ${x}`,
      },
      `P(X ≤ ${x}).`,
      `Shade counts from 0 through ${x}.`,
      'POISSON.DIST with TRUE is the left-tail CDF.',
    )
  }

  // atLeast: P(X ≥ x) = 1 − P(X ≤ x−1)
  if (query === 'atLeast') {
    const cutoff = x - 1
    const left = cutoff < 0 ? 0 : POISSON_DIST(cutoff, lambda, true)
    const oneDay = 1 - left
    const cdfCall =
      cutoff < 0
        ? '0'
        : formatExcelCall('POISSON.DIST', [cutoff, lambda, true]).slice(1)
    const inner = cutoff < 0 ? '1' : `1 - ${cdfCall}`
    return withIndependentDays(
      oneDay,
      inner,
      `P(X ≥ ${x})`,
      `P(X ≥ ${x})`,
      'Poisson · at least x',
      {
        kind: 'number-line',
        min: 0,
        max: Math.max(10, x + 5),
        marks: [
          { value: 0, label: '0' },
          { value: cutoff < 0 ? 0 : cutoff, label: cutoff < 0 ? '—' : String(cutoff) },
          { value: x, label: String(x) },
        ],
        highlightFrom: x,
        highlightTo: Math.max(10, x + 5),
        caption: `Shade X ≥ ${x} (includes ${x})`,
      },
      `P(X ≥ ${x}) = 1 − P(X ≤ ${cutoff}). “${x} or more” includes ${x}.`,
      `Shade from ${x} to the right (include the point ${x}).`,
      `P(X ≥ ${x}) = 1 − POISSON.DIST(${cutoff}, λ, TRUE) — use ${cutoff}, not ${x}.`,
    )
  }


  if (query === 'moreThan') {
  // moreThan: P(X > x) = 1 − P(X ≤ x)
  const left = POISSON_DIST(x, lambda, true)
  const oneDay = 1 - left
  const cdfCall = formatExcelCall('POISSON.DIST', [x, lambda, true]).slice(1)
  const inner = `1 - ${cdfCall}`
  return withIndependentDays(
    oneDay,
    inner,
    `P(X > ${x})`,
    `P(X > ${x})`,
    'Poisson · more than x',
    {
      kind: 'number-line',
      min: 0,
      max: Math.max(10, x + 5),
      marks: [
        { value: 0, label: '0' },
        { value: x, label: String(x) },
        { value: x + 1, label: String(x + 1) },
      ],
      highlightFrom: x + 1,
      highlightTo: Math.max(10, x + 5),
      caption: `Shade X ≥ ${x + 1} (i.e. more than ${x})`,
    },
    `P(X > ${x}) = P(X ≥ ${x + 1}) = 1 − P(X ≤ ${x}).`,
    `Shade the right side of the number line starting at ${x + 1}.`,
    `P(X > ${x}) = 1 − P(X ≤ ${x}).`,
  )

  }

  throw new Error(
    `Unknown poisson query: "${query}". Expected equal, atMost, atLeast, moreThan, percentile, outside, or compare.`,
  )
}

function poissonEventProb(lambda: number, query: string, x: number): number {
  if (query === 'equal') return POISSON_DIST(x, lambda, false)
  if (query === 'atMost') return POISSON_DIST(x, lambda, true)
  if (query === 'moreThan') return 1 - POISSON_DIST(x, lambda, true)
  const cutoff = x - 1
  return cutoff < 0 ? 1 : 1 - POISSON_DIST(cutoff, lambda, true)
}

function poissonEventExcel(lambda: number, query: string, x: number): string {
  if (query === 'equal') return formatExcelCall('POISSON.DIST', [x, lambda, false])
  if (query === 'atMost') return formatExcelCall('POISSON.DIST', [x, lambda, true])
  if (query === 'moreThan') {
    const left = formatExcelCall('POISSON.DIST', [x, lambda, true])
    return `=1 - ${left.slice(1)}`
  }
  const cutoff = x - 1
  if (cutoff < 0) return '=1'
  const left = formatExcelCall('POISSON.DIST', [cutoff, lambda, true])
  return `=1 - ${left.slice(1)}`
}


function solveUniform(values: Record<string, unknown>): SolveResult {
  const a = num(values, 'a')
  const b = num(values, 'b')
  const drawCount =
    values.drawCount === '' || values.drawCount === undefined
      ? 1
      : Math.max(1, Math.round(num(values, 'drawCount')))

  // Active query is whichever optional field(s) the user actually filled —
  // never require Between · lower/upper when only P(X ≥ …) or exact is set.
  const wantBetween =
    hasFiniteNumber(values, 'lower') && hasFiniteNumber(values, 'upper')
  const wantAtLeast = hasFiniteNumber(values, 'atLeast')
  const wantExact = hasFiniteNumber(values, 'exact')

  if (!wantBetween && !wantAtLeast && !wantExact) {
    // One bound alone for “between” → name the missing field
    if (hasFiniteNumber(values, 'lower') && !hasFiniteNumber(values, 'upper')) {
      throw new Error(`Enter a valid number for ${fieldLabel('upper')}`)
    }
    if (hasFiniteNumber(values, 'upper') && !hasFiniteNumber(values, 'lower')) {
      throw new Error(`Enter a valid number for ${fieldLabel('lower')}`)
    }
    throw new Error(
      'Enter a between range, Optional P(X ≥ …), or an exact point to compute.',
    )
  }

  const lines: SolveResult['lines'] = []
  const excelCalls: string[] = []
  const regions: { from: number; to: number; label: string }[] = []
  const stepValues: { label: string; value: string }[] = []
  const findParts: string[] = []
  let betweenText = ''
  let atLeastText = ''
  let exactText = ''
  let drawsText = ''

  function pushIndependentDraws(labelEvent: string, p: number) {
    if (drawCount <= 1) return
    const all = p ** drawCount
    const atLeastOne = 1 - (1 - p) ** drawCount
    lines.push({
      label: `All ${drawCount} draws: (${labelEvent})^${drawCount}`,
      value: fmt(all),
      emphasis: true,
    })
    lines.push({
      label: `At least one of ${drawCount}: 1−(1−p)^${drawCount}`,
      value: fmt(atLeastOne),
      emphasis: true,
    })
    excelCalls.push(`=${fmt(p)}^${drawCount}`, `=1-(1-${fmt(p)})^${drawCount}`)
    stepValues.push(
      { label: `p^${drawCount}`, value: fmt(all) },
      { label: `1−(1−p)^${drawCount}`, value: fmt(atLeastOne) },
    )
    drawsText += ` Independent draws n=${drawCount}: all satisfy → p^n = ${fmt(all)}; at least one → 1−(1−p)^n = ${fmt(atLeastOne)}.`
  }

  if (wantBetween) {
    const lower = num(values, 'lower')
    const upper = num(values, 'upper')
    const between = UNIFORM_RANGE_PROB(a, b, lower, upper)
    lines.push({
      label: `P(${lower} ≤ X ≤ ${upper})`,
      value: fmt(between),
      emphasis: true,
    })
    excelCalls.push(
      `=(MIN(${b}, ${upper}) - MAX(${a}, ${lower})) / (${b} - ${a})`,
    )
    regions.push({
      from: Math.max(a, Math.min(lower, upper)),
      to: Math.min(b, Math.max(lower, upper)),
      label: 'between',
    })
    stepValues.push({ label: `P(${lower} ≤ X ≤ ${upper})`, value: fmt(between) })
    findParts.push(`P(${lower} ≤ X ≤ ${upper})`)
    betweenText = `P(${lower} ≤ X ≤ ${upper}) = ${fmt(between)}.`
    pushIndependentDraws(`P(${lower}≤X≤${upper})`, between)
  }

  if (wantAtLeast) {
    const atLeast = num(values, 'atLeast')
    const p = UNIFORM_RANGE_PROB(a, b, atLeast, b)
    lines.push({ label: `P(X ≥ ${atLeast})`, value: fmt(p), emphasis: true })
    excelCalls.push(`=(${b} - ${atLeast}) / (${b} - ${a})`)
    regions.push({ from: Math.max(a, atLeast), to: b, label: '≥' })
    stepValues.push({ label: `P(X ≥ ${atLeast})`, value: fmt(p) })
    findParts.push(`P(X ≥ ${atLeast})`)
    atLeastText = ` P(X ≥ ${atLeast}) = (${b} − ${atLeast}) / (${b} − ${a}) = ${fmt(p)}.`
    pushIndependentDraws(`P(X≥${atLeast})`, p)
  }

  if (wantExact) {
    const exact = num(values, 'exact')
    lines.push({ label: `P(X = ${exact})`, value: '0', emphasis: true })
    stepValues.push({ label: `P(X = ${exact})`, value: '0' })
    findParts.push(`P(X = ${exact})`)
    exactText = ` A single point such as X = ${exact} has probability 0 on a continuous distribution.`
  }

  if (excelCalls.length === 0) {
    excelCalls.push(`=length / (${b} - ${a})`)
  }

  return {
    excelCalls,
    lines,
    note:
      'Continuous uniform: probability is the length of the event interval divided by (b − a). A single point has probability 0.' +
      (drawCount > 1
        ? ` For ${drawCount} i.i.d. draws, raise the single-draw probability (or use 1−(1−p)^n for “at least one”).`
        : ''),
    walkthrough: {
      title: 'Uniform · length ratios',
      distribution: `X ~ Uniform(a = ${a}, b = ${b})`,
      find:
        findParts.join('; ') +
        (drawCount > 1 ? ` (${drawCount} independent draws)` : ''),
      diagram: {
        kind: 'uniform-bar',
        a,
        b,
        regions,
        caption: `Rectangle from ${a} to ${b}; probability = shaded length / (${b} − ${a})`,
      },
      steps: [
        step(
          1,
          'Determine the distribution',
          `Outcomes equally likely over a fixed range → Continuous Uniform on [${a}, ${b}].`,
        ),
        step(
          2,
          'Code the problem',
          `Minimum a = ${a}, maximum b = ${b}. Total length = ${b - a}.`,
        ),
        step(3, 'Identify what to find', findParts.join('; ') + '.'),
        step(
          4,
          'Draw a diagram',
          'Sketch the flat density rectangle and shade the event interval(s).',
        ),
        step(
          5,
          'Translate for Excel / geometry',
          `Probability = (length of overlap with [a, b]) / (b − a).` +
            (drawCount > 1
              ? ` Independent draws: all → p^${drawCount}; at least one → 1−(1−p)^${drawCount}.`
              : ''),
          { excel: excelCalls },
        ),
        step(
          6,
          'Solve and check',
          `${betweenText}${atLeastText}${exactText}${drawsText}`.trim(),
          { values: stepValues },
        ),
      ],
      explanation:
        'For Uniform, “draw the rectangle and take the shaded length over total length” is the course method.' +
        (drawCount > 1
          ? ' Independent identical draws multiply probabilities (or use the complement for “at least one”).'
          : ''),
    },
  }
}

function solveNormal(values: Record<string, unknown>): SolveResult {
  const mean = num(values, 'mean')
  const sd = num(values, 'sd')
  const query = str(values, 'query', 'greater')

  const intro = [
    step(
      1,
      'Determine the distribution',
      `Continuous bell-shaped outcomes with given mean and sd → Normal.`,
    ),
    step(
      2,
      'Code the problem',
      `X ~ N(μ = ${mean}, σ = ${sd}).`,
      {
        values: [
          { label: 'μ', value: String(mean) },
          { label: 'σ', value: String(sd) },
        ],
      },
    ),
  ]

  if (query === 'less') {
    const x = num(values, 'x')
    const prob = NORM_DIST(x, mean, sd, true)
    const z = (x - mean) / sd
    const excel = formatExcelCall('NORM.DIST', [x, mean, sd, true])
    return {
      excelCalls: [excel],
      lines: [{ label: `P(X ≤ ${x})`, value: fmt(prob), emphasis: true }],
      walkthrough: {
        title: 'Normal · left tail',
        distribution: `X ~ N(${mean}, ${sd})`,
        find: `P(X ≤ ${x})`,
        diagram: {
          kind: 'normal-shade',
          mean,
          sd,
          shade: 'left',
          x,
          caption: `Shade left of x = ${x} (Z ≈ ${fmt(z, 3)})`,
        },
        steps: [
          ...intro,
          step(3, 'Identify what to find', `P(X ≤ ${x}).`),
          step(
            4,
            'Draw a diagram',
            `Sketch the normal curve; shade from −∞ to ${x}. Optional Z-score: Z = (${x} − ${mean}) / ${sd} = ${fmt(z, 4)}.`,
          ),
          step(
            5,
            'Translate for Excel',
            'NORM.DIST with cumulative = TRUE returns the left-tail area directly (no table needed).',
            { excel: [excel] },
          ),
          step(6, 'Solve and check', `${excel} ≈ ${fmt(prob)}.`, {
            values: [
              { label: 'Z', value: fmt(z, 4) },
              { label: `P(X ≤ ${x})`, value: fmt(prob) },
            ],
          }),
        ],
        explanation: 'You may standardize to Z and use NORM.S.DIST, or call NORM.DIST on the original scale — both match Excel practice.',
      },
    }
  }

  if (query === 'greater') {
    const x = num(values, 'x')
    const left = NORM_DIST(x, mean, sd, true)
    const prob = 1 - left
    const z = (x - mean) / sd
    const excel = formatExcelCall('NORM.DIST', [x, mean, sd, true])
    return {
      excelCalls: [`=1 - ${excel.slice(1)}`],
      lines: [
        { label: `P(X ≤ ${x})`, value: fmt(left) },
        { label: `P(X > ${x})`, value: fmt(prob), emphasis: true },
      ],
      note: 'P(X = x) = 0 for continuous normals; use ranges.',
      walkthrough: {
        title: 'Normal · right tail',
        distribution: `X ~ N(${mean}, ${sd})`,
        find: `P(X > ${x})`,
        diagram: {
          kind: 'normal-shade',
          mean,
          sd,
          shade: 'right',
          x,
          caption: `Shade right of x = ${x} (Z ≈ ${fmt(z, 3)})`,
        },
        steps: [
          ...intro,
          step(3, 'Identify what to find', `P(X > ${x}). Note P(X = ${x}) = 0.`),
          step(
            4,
            'Draw a diagram',
            `Shade the right tail beyond ${x}. Z = (${x} − ${mean}) / ${sd} = ${fmt(z, 4)}.`,
          ),
          step(
            5,
            'Translate for Excel',
            `P(X > ${x}) = 1 − P(X ≤ ${x}) = 1 − NORM.DIST(${x}, ${mean}, ${sd}, TRUE).`,
            { excel: [excel, `=1 - ${excel.slice(1)}`] },
          ),
          step(
            6,
            'Solve and check',
            `P(X ≤ ${x}) ≈ ${fmt(left)} → P(X > ${x}) = ${fmt(prob)}.`,
            {
              values: [
                { label: 'Z', value: fmt(z, 4) },
                { label: `P(X ≤ ${x})`, value: fmt(left) },
                { label: `P(X > ${x})`, value: fmt(prob) },
              ],
            },
          ),
        ],
        explanation: 'Right-tail events almost always become 1 − left-tail CDF in Excel.',
      },
    }
  }

  if (query === 'between') {
    const lower = num(values, 'lower')
    const upper = num(values, 'upper')
    const hi = NORM_DIST(upper, mean, sd, true)
    const lo = NORM_DIST(lower, mean, sd, true)
    const prob = hi - lo
    const zL = (lower - mean) / sd
    const zU = (upper - mean) / sd
    const excelHi = formatExcelCall('NORM.DIST', [upper, mean, sd, true])
    const excelLo = formatExcelCall('NORM.DIST', [lower, mean, sd, true])
    return {
      excelCalls: [`=${excelHi.slice(1)} - ${excelLo.slice(1)}`],
      lines: [
        { label: `P(X ≤ ${upper})`, value: fmt(hi) },
        { label: `P(X ≤ ${lower})`, value: fmt(lo) },
        {
          label: `P(${lower} < X < ${upper})`,
          value: fmt(prob),
          emphasis: true,
        },
      ],
      walkthrough: {
        title: 'Normal · between two values',
        distribution: `X ~ N(${mean}, ${sd})`,
        find: `P(${lower} < X < ${upper})`,
        diagram: {
          kind: 'normal-shade',
          mean,
          sd,
          shade: 'between',
          lower,
          upper,
          caption: `Shade between ${lower} and ${upper}`,
        },
        steps: [
          ...intro,
          step(3, 'Identify what to find', `P(${lower} < X < ${upper}).`),
          step(
            4,
            'Draw a diagram',
            `Shade the central band. Z_lower = ${fmt(zL, 4)}, Z_upper = ${fmt(zU, 4)}.`,
          ),
          step(
            5,
            'Translate for Excel',
            `P(lower < X < upper) = NORM.DIST(upper,…) − NORM.DIST(lower,…).`,
            { excel: [excelHi, excelLo] },
          ),
          step(
            6,
            'Solve and check',
            `${fmt(hi)} − ${fmt(lo)} = ${fmt(prob)}.`,
            {
              values: [
                { label: `P(X ≤ ${upper})`, value: fmt(hi) },
                { label: `P(X ≤ ${lower})`, value: fmt(lo) },
                { label: `P(${lower} < X < ${upper})`, value: fmt(prob) },
              ],
            },
          ),
        ],
        explanation: 'Between-probabilities are a difference of two left-tail lookups.',
      },
    }
  }

  // P(X < a) or P(X > b) — union of two disjoint tails
  if (query === 'outside') {
    const a = num(values, 'lower')
    const b = num(values, 'upper')
    if (!(a < b)) {
      throw new Error('Outside query needs lower < upper (thresholds for X < a or X > b).')
    }
    const left = NORM_DIST(a, mean, sd, true)
    const rightCum = NORM_DIST(b, mean, sd, true)
    const right = 1 - rightCum
    const total = left + right
    const excelLo = formatExcelCall('NORM.DIST', [a, mean, sd, true])
    const excelHi = formatExcelCall('NORM.DIST', [b, mean, sd, true])
    return {
      excelCalls: [`=${excelLo.slice(1)} + (1 - ${excelHi.slice(1)})`],
      lines: [
        { label: `P(X < ${a})`, value: fmt(left) },
        { label: `P(X > ${b})`, value: fmt(right) },
        {
          label: `P(X < ${a} or X > ${b})`,
          value: fmt(total),
          emphasis: true,
        },
      ],
      note: 'Union of two disjoint tails: add both — continuous P(X = a) = 0 so < and ≤ match.',
      walkthrough: {
        title: 'Normal · outside (two-tail union)',
        distribution: `X ~ N(${mean}, ${sd})`,
        find: `P(X < ${a} or X > ${b})`,
        diagram: {
          kind: 'normal-shade',
          mean,
          sd,
          shade: 'two-tail',
          lower: a,
          upper: b,
          caption: `Shade X < ${a} and X > ${b}`,
        },
        steps: [
          ...intro,
          step(
            3,
            'Identify what to find',
            `P(X < ${a}) + P(X > ${b}) (disjoint — add both).`,
          ),
          step(4, 'Draw a diagram', `Shade both outer tails beyond ${a} and ${b}.`),
          step(
            5,
            'Translate for Excel',
            `NORM.DIST(${a},…) + (1 − NORM.DIST(${b},…)).`,
            { excel: [excelLo, `=1 - ${excelHi.slice(1)}`] },
          ),
          step(
            6,
            'Solve and check',
            `${fmt(left)} + ${fmt(right)} = ${fmt(total)}.`,
            {
              values: [
                { label: `P(X < ${a})`, value: fmt(left) },
                { label: `P(X > ${b})`, value: fmt(right) },
                { label: 'Union', value: fmt(total) },
              ],
            },
          ),
        ],
        explanation: 'Never drop one tail of an “or” outside probability.',
      },
    }
  }

  if (query === 'compare') {
    const queryA = str(values, 'queryA', 'greater')
    const queryB = str(values, 'queryB', 'greater')
    const xA = num(values, 'xA')
    const xB = num(values, 'xB')
    const pA = normalEventProb(mean, sd, queryA, xA)
    const pB = normalEventProb(mean, sd, queryB, xB)
    const labelA = normalEventLabel(queryA, xA)
    const labelB = normalEventLabel(queryB, xB)
    const winner =
      Math.abs(pA - pB) < 1e-12
        ? 'Equally likely'
        : pA > pB
          ? `A more likely (${labelA})`
          : `B more likely (${labelB})`
    return {
      excelCalls: [
        normalEventExcel(mean, sd, queryA, xA),
        normalEventExcel(mean, sd, queryB, xB),
      ],
      lines: [
        { label: `A: ${labelA}`, value: fmt(pA), emphasis: pA >= pB },
        { label: `B: ${labelB}`, value: fmt(pB), emphasis: pB > pA },
        { label: 'Comparison', value: winner, emphasis: true },
      ],
      walkthrough: {
        title: 'Normal · which is more likely?',
        distribution: `X ~ N(${mean}, ${sd})`,
        find: `Compare ${labelA} vs ${labelB}`,
        diagram: {
          kind: 'normal-shade',
          mean,
          sd,
          shade: 'between',
          lower: Math.min(xA, xB),
          upper: Math.max(xA, xB),
          caption: 'Compare two events on the same Normal',
        },
        steps: [
          ...intro,
          step(3, 'Identify what to find', `Compare ${labelA} with ${labelB}.`),
          step(4, 'Draw a diagram', 'Sketch both events on the same curve.'),
          step(5, 'Translate for Excel', 'NORM.DIST for each side.', {
            excel: [
              normalEventExcel(mean, sd, queryA, xA),
              normalEventExcel(mean, sd, queryB, xB),
            ],
          }),
          step(
            6,
            'Solve and check',
            `${labelA} ≈ ${fmt(pA)}; ${labelB} ≈ ${fmt(pB)} → ${winner}.`,
            {
              values: [
                { label: labelA, value: fmt(pA) },
                { label: labelB, value: fmt(pB) },
              ],
            },
          ),
        ],
        explanation: 'Both sides must be computed before declaring a winner.',
      },
    }
  }

  // P(? < X < xHigh) = p  → convert via Z, reuse standard-normal inverse-between math
  if (query === 'invBetweenLow') {
    const xHigh = num(values, 'upper')
    const probability = num(values, 'probability')
    const zHigh = (xHigh - mean) / sd
    const phiHigh = NORM_S_DIST(zHigh, true)
    const target = phiHigh - probability
    if (!(target > 0 && target < 1)) {
      throw new Error(
        `Need 0 < Φ(z₂) − p < 1 (got ${fmt(target)}). Check the known upper x and probability.`,
      )
    }
    const zStar = NORM_S_INV(target)
    const xStar = mean + zStar * sd
    const excel = `=NORM.INV(NORM.S.DIST((${xHigh}-${mean})/${sd},TRUE)-${probability},${mean},${sd})`
    return {
      excelCalls: [excel],
      lines: [
        { label: `z₂ = (${xHigh} − ${mean}) / ${sd}`, value: fmt(zHigh, 4) },
        {
          label: `x* such that P(x* < X < ${xHigh}) = ${probability}`,
          value: fmt(xStar, 4),
          emphasis: true,
        },
      ],
      walkthrough: {
        title: 'Normal · find lower bound in a between probability',
        distribution: `X ~ N(${mean}, ${sd})`,
        find: `x* with P(x* < X < ${xHigh}) = ${probability}`,
        diagram: {
          kind: 'normal-shade',
          mean,
          sd,
          shade: 'between',
          lower: xStar,
          upper: xHigh,
          caption: `Unknown lower x*; upper = ${xHigh}; shaded area = ${probability}`,
        },
        steps: [
          ...intro,
          step(
            3,
            'Identify what to find',
            `Standardize: find z* with P(z* < Z < ${fmt(zHigh, 4)}) = ${probability}, then x* = μ + z*σ.`,
          ),
          step(4, 'Draw a diagram', `Shade from x* up to ${xHigh}.`),
          step(
            5,
            'Translate for Excel',
            `z* = NORM.S.INV(NORM.S.DIST(z₂,TRUE) − p); x* = ${mean} + z*·${sd}.`,
            { excel: [excel] },
          ),
          step(6, 'Solve and check', `z* ≈ ${fmt(zStar, 4)} → x* ≈ ${fmt(xStar, 4)}.`, {
            values: [
              { label: 'z*', value: fmt(zStar, 4) },
              { label: 'x*', value: fmt(xStar, 4) },
            ],
          }),
        ],
        explanation:
          'Convert the Normal between-problem to Z, invert the CDF, then map back with x = μ + zσ.',
      },
    }
  }

  if (query === 'invBetweenHigh') {
    const xLow = num(values, 'lower')
    const probability = num(values, 'probability')
    const zLow = (xLow - mean) / sd
    const phiLow = NORM_S_DIST(zLow, true)
    const target = phiLow + probability
    if (!(target > 0 && target < 1)) {
      throw new Error(
        `Need 0 < Φ(z₁) + p < 1 (got ${fmt(target)}). Check the known lower x and probability.`,
      )
    }
    const zStar = NORM_S_INV(target)
    const xStar = mean + zStar * sd
    const excel = `=NORM.INV(NORM.S.DIST((${xLow}-${mean})/${sd},TRUE)+${probability},${mean},${sd})`
    return {
      excelCalls: [excel],
      lines: [
        { label: `z₁ = (${xLow} − ${mean}) / ${sd}`, value: fmt(zLow, 4) },
        {
          label: `x* such that P(${xLow} < X < x*) = ${probability}`,
          value: fmt(xStar, 4),
          emphasis: true,
        },
      ],
      walkthrough: {
        title: 'Normal · find upper bound in a between probability',
        distribution: `X ~ N(${mean}, ${sd})`,
        find: `x* with P(${xLow} < X < x*) = ${probability}`,
        diagram: {
          kind: 'normal-shade',
          mean,
          sd,
          shade: 'between',
          lower: xLow,
          upper: xStar,
          caption: `Lower = ${xLow}; unknown upper x*; shaded area = ${probability}`,
        },
        steps: [
          ...intro,
          step(
            3,
            'Identify what to find',
            `Standardize: find z* with P(${fmt(zLow, 4)} < Z < z*) = ${probability}, then x* = μ + z*σ.`,
          ),
          step(4, 'Draw a diagram', `Shade from ${xLow} up to x*.`),
          step(
            5,
            'Translate for Excel',
            `z* = NORM.S.INV(NORM.S.DIST(z₁,TRUE) + p); x* = ${mean} + z*·${sd}.`,
            { excel: [excel] },
          ),
          step(6, 'Solve and check', `z* ≈ ${fmt(zStar, 4)} → x* ≈ ${fmt(xStar, 4)}.`, {
            values: [
              { label: 'z*', value: fmt(zStar, 4) },
              { label: 'x*', value: fmt(xStar, 4) },
            ],
          }),
        ],
        explanation:
          'Convert the Normal between-problem to Z, invert the CDF, then map back with x = μ + zσ.',
      },
    }
  }

  if (query === 'invBetweenSymmetric') {
    const probability = num(values, 'probability')
    if (!(probability > 0 && probability < 1)) {
      throw new Error('Middle probability p must be strictly between 0 and 1.')
    }
    const alphaHalf = (1 - probability) / 2
    const zLow = NORM_S_INV(alphaHalf)
    const zHigh = NORM_S_INV(1 - alphaHalf)
    const xLow = mean + zLow * sd
    const xHigh = mean + zHigh * sd
    const excelLo = formatExcelCall('NORM.INV', [alphaHalf, mean, sd])
    const excelHi = formatExcelCall('NORM.INV', [1 - alphaHalf, mean, sd])
    return {
      excelCalls: [excelLo, excelHi],
      lines: [
        { label: 'z* (lower)', value: fmt(zLow, 4) },
        { label: 'z* (upper)', value: fmt(zHigh, 4) },
        { label: 'XL (symmetric)', value: fmt(xLow, 4), emphasis: true },
        { label: 'XU (symmetric)', value: fmt(xHigh, 4), emphasis: true },
      ],
      note:
        'Symmetric-about-the-mean is one of infinitely many (XL, XU) pairs with the same middle probability; other non-symmetric solutions are equally valid.',
      walkthrough: {
        title: 'Normal · symmetric between bounds',
        distribution: `X ~ N(${mean}, ${sd})`,
        find: `XL, XU with P(XL < X < XU) = ${probability} (symmetric about μ)`,
        diagram: {
          kind: 'normal-shade',
          mean,
          sd,
          shade: 'between',
          lower: xLow,
          upper: xHigh,
          caption: `Central ${(probability * 100).toFixed(0)}% band (symmetric)`,
        },
        steps: [
          ...intro,
          step(
            3,
            'Identify what to find',
            `Split the remaining probability ${(1 - probability).toFixed(4)} evenly into two tails of ${fmt(alphaHalf, 4)} each.`,
          ),
          step(
            4,
            'Draw a diagram',
            'Shade the central band; note many other (non-symmetric) bands have the same area.',
          ),
          step(
            5,
            'Translate for Excel',
            `XL = NORM.INV(${fmt(alphaHalf)}, μ, σ); XU = NORM.INV(${fmt(1 - alphaHalf)}, μ, σ).`,
            { excel: [excelLo, excelHi] },
          ),
          step(
            6,
            'Solve and check',
            `XL ≈ ${fmt(xLow, 4)}, XU ≈ ${fmt(xHigh, 4)}. This is the conventional symmetric choice, not the unique solution.`,
            {
              values: [
                { label: 'XL', value: fmt(xLow, 4) },
                { label: 'XU', value: fmt(xHigh, 4) },
              ],
            },
          ),
        ],
        explanation:
          'Any pair with the same middle probability works; symmetry about the mean is the usual convention taught in class.',
      },
    }
  }

  if (query === 'inverse') {
    const probability = num(values, 'probability')
    const x = NORM_INV(probability, mean, sd)
    const excel = formatExcelCall('NORM.INV', [probability, mean, sd])
    return {
      excelCalls: [excel],
      lines: [
        {
          label: `x such that P(X ≤ x) = ${probability}`,
          value: fmt(x, 4),
          emphasis: true,
        },
      ],
      walkthrough: {
        title: 'Normal · inverse (quantile)',
        distribution: `X ~ N(${mean}, ${sd})`,
        find: `x with P(X ≤ x) = ${probability}`,
        diagram: {
          kind: 'normal-shade',
          mean,
          sd,
          shade: 'left',
          x,
          caption: `Find x so left-tail area equals ${probability}`,
        },
        steps: [
          ...intro,
          step(3, 'Identify what to find', `The cutoff x whose left-tail probability is ${probability}.`),
          step(4, 'Draw a diagram', 'Shade the left area equal to the target probability; read x on the axis.'),
          step(5, 'Translate for Excel', 'Use NORM.INV for the left-tail quantile.', {
            excel: [excel],
          }),
          step(6, 'Solve and check', `${excel} ≈ ${fmt(x, 4)}.`, {
            values: [{ label: 'x', value: fmt(x, 4) }],
          }),
        ],
        explanation: 'Inverse problems flip the usual CDF lookup: probability in → x out.',
      },
    }
  }

  throw new Error(
    `Unknown normal query: "${query}". Expected less, greater, between, outside, compare, inverse, invBetweenLow, invBetweenHigh, or invBetweenSymmetric.`,
  )
}

function normalEventLabel(query: string, x: number): string {
  if (query === 'less') return `P(X ≤ ${x})`
  if (query === 'equal') return `P(X = ${x})` // continuous → 0, but label clearly
  return `P(X > ${x})`
}

function normalEventProb(mean: number, sd: number, query: string, x: number): number {
  if (query === 'less') return NORM_DIST(x, mean, sd, true)
  if (query === 'equal') return 0
  return 1 - NORM_DIST(x, mean, sd, true)
}

function normalEventExcel(mean: number, sd: number, query: string, x: number): string {
  const left = formatExcelCall('NORM.DIST', [x, mean, sd, true])
  if (query === 'less') return left
  if (query === 'equal') return '=0'
  return `=1 - ${left.slice(1)}`
}

function solveStandardNormal(values: Record<string, unknown>): SolveResult {
  const query = str(values, 'query', 'less')

  if (query === 'less') {
    const z = num(values, 'z')
    const prob = NORM_S_DIST(z, true)
    const excel = formatExcelCall('NORM.S.DIST', [z, true])
    return {
      excelCalls: [excel],
      lines: [{ label: `P(Z ≤ ${z})`, value: fmt(prob), emphasis: true }],
      walkthrough: {
        title: 'Standard Normal · left tail',
        distribution: 'Z ~ N(0, 1)',
        find: `P(Z ≤ ${z})`,
        diagram: {
          kind: 'normal-shade',
          mean: 0,
          sd: 1,
          shade: 'left',
          x: z,
          caption: `Shade Z ≤ ${z}`,
        },
        steps: [
          step(1, 'Determine the distribution', 'Standard Normal Z ~ N(0, 1).'),
          step(2, 'Code the problem', `Given z* = ${z}.`),
          step(3, 'Identify what to find', `P(Z ≤ ${z}).`),
          step(4, 'Draw a diagram', `Shade the left tail up to ${z}.`),
          step(5, 'Translate for Excel', 'NORM.S.DIST(z, TRUE).', { excel: [excel] }),
          step(6, 'Solve and check', `${excel} ≈ ${fmt(prob)}.`, {
            values: [{ label: `P(Z ≤ ${z})`, value: fmt(prob) }],
          }),
        ],
        explanation: 'NORM.S.DIST is the Excel replacement for old Z-tables.',
      },
    }
  }

  if (query === 'greater') {
    const z = num(values, 'z')
    const left = NORM_S_DIST(z, true)
    const excel = formatExcelCall('NORM.S.DIST', [z, true])
    return {
      excelCalls: [`=1 - ${excel.slice(1)}`],
      lines: [
        { label: `P(Z ≤ ${z})`, value: fmt(left) },
        { label: `P(Z > ${z})`, value: fmt(1 - left), emphasis: true },
      ],
      walkthrough: {
        title: 'Standard Normal · right tail',
        distribution: 'Z ~ N(0, 1)',
        find: `P(Z > ${z})`,
        diagram: {
          kind: 'normal-shade',
          mean: 0,
          sd: 1,
          shade: 'right',
          x: z,
          caption: `Shade Z > ${z}`,
        },
        steps: [
          step(1, 'Determine the distribution', 'Standard Normal Z ~ N(0, 1).'),
          step(2, 'Code the problem', `Given z* = ${z}.`),
          step(3, 'Identify what to find', `P(Z > ${z}).`),
          step(4, 'Draw a diagram', `Shade the right tail beyond ${z}.`),
          step(
            5,
            'Translate for Excel',
            `P(Z > ${z}) = 1 − NORM.S.DIST(${z}, TRUE).`,
            { excel: [excel, `=1 - ${excel.slice(1)}`] },
          ),
          step(
            6,
            'Solve and check',
            `1 − ${fmt(left)} = ${fmt(1 - left)}.`,
            { values: [{ label: `P(Z > ${z})`, value: fmt(1 - left) }] },
          ),
        ],
        explanation: 'Right-tail Z problems are always 1 − left-tail lookups.',
      },
    }
  }

  if (query === 'between') {
    const zLow = num(values, 'zLow')
    const zHigh = num(values, 'zHigh')
    const hi = NORM_S_DIST(zHigh, true)
    const lo = NORM_S_DIST(zLow, true)
    const excelHi = formatExcelCall('NORM.S.DIST', [zHigh, true])
    const excelLo = formatExcelCall('NORM.S.DIST', [zLow, true])
    return {
      excelCalls: [`=${excelHi.slice(1)} - ${excelLo.slice(1)}`],
      lines: [
        {
          label: `P(${zLow} < Z < ${zHigh})`,
          value: fmt(hi - lo),
          emphasis: true,
        },
      ],
      walkthrough: {
        title: 'Standard Normal · between',
        distribution: 'Z ~ N(0, 1)',
        find: `P(${zLow} < Z < ${zHigh})`,
        diagram: {
          kind: 'normal-shade',
          mean: 0,
          sd: 1,
          shade: 'between',
          lower: zLow,
          upper: zHigh,
          caption: `Shade between ${zLow} and ${zHigh}`,
        },
        steps: [
          step(1, 'Determine the distribution', 'Standard Normal Z ~ N(0, 1).'),
          step(2, 'Code the problem', `Bounds ${zLow} and ${zHigh}.`),
          step(3, 'Identify what to find', `P(${zLow} < Z < ${zHigh}).`),
          step(4, 'Draw a diagram', 'Shade the band between the two z values.'),
          step(
            5,
            'Translate for Excel',
            'Difference of two NORM.S.DIST left tails.',
            { excel: [excelHi, excelLo] },
          ),
          step(6, 'Solve and check', `${fmt(hi)} − ${fmt(lo)} = ${fmt(hi - lo)}.`, {
            values: [{ label: 'probability', value: fmt(hi - lo) }],
          }),
        ],
        explanation: 'Between on Z is CDF(high) − CDF(low).',
      },
    }
  }

  // P(? < Z < zHigh) = p  →  Φ(zHigh) − Φ(z*) = p  →  z* = NORM.S.INV(Φ(zHigh) − p)
  if (query === 'invBetweenLow') {
    const zHigh = num(values, 'zHigh')
    const probability = num(values, 'probability')
    const phiHigh = NORM_S_DIST(zHigh, true)
    const target = phiHigh - probability
    if (!(target > 0 && target < 1)) {
      throw new Error(
        `Need 0 < Φ(${zHigh}) − ${probability} < 1 (got ${fmt(target)}). Check the known z and probability.`,
      )
    }
    const zStar = NORM_S_INV(target)
    const excelPhi = formatExcelCall('NORM.S.DIST', [zHigh, true])
    const excelInv = `=NORM.S.INV(${excelPhi.slice(1)} - ${probability})`
    return {
      excelCalls: [excelInv],
      lines: [
        { label: `Φ(${zHigh})`, value: fmt(phiHigh) },
        { label: `Φ(z*) = Φ(${zHigh}) − ${probability}`, value: fmt(target) },
        {
          label: `z* such that P(z* < Z < ${zHigh}) = ${probability}`,
          value: fmt(zStar, 4),
          emphasis: true,
        },
      ],
      walkthrough: {
        title: 'Standard Normal · find lower bound',
        distribution: 'Z ~ N(0, 1)',
        find: `z* with P(z* < Z < ${zHigh}) = ${probability}`,
        diagram: {
          kind: 'normal-shade',
          mean: 0,
          sd: 1,
          shade: 'between',
          lower: zStar,
          upper: zHigh,
          caption: `Unknown lower z*; upper = ${zHigh}; shaded area = ${probability}`,
        },
        steps: [
          step(1, 'Determine the distribution', 'Standard Normal Z ~ N(0, 1).'),
          step(
            2,
            'Code the problem',
            `Known upper z = ${zHigh}, target middle probability = ${probability}.`,
          ),
          step(
            3,
            'Identify what to find',
            `Find z* so Φ(${zHigh}) − Φ(z*) = ${probability}.`,
          ),
          step(4, 'Draw a diagram', `Shade from z* up to ${zHigh}.`),
          step(
            5,
            'Translate for Excel',
            `Φ(z*) = NORM.S.DIST(${zHigh},TRUE) − ${probability}, then NORM.S.INV(…).`,
            { excel: [excelPhi, excelInv] },
          ),
          step(
            6,
            'Solve and check',
            `Φ(${zHigh}) ≈ ${fmt(phiHigh)}, so Φ(z*) ≈ ${fmt(target)} → z* ≈ ${fmt(zStar, 4)}.`,
            { values: [{ label: 'z*', value: fmt(zStar, 4) }] },
          ),
        ],
        explanation:
          'Unknown endpoint problems rearrange the between identity, then invert the standard normal CDF.',
      },
    }
  }

  // P(zLow < Z < ?) = p  →  Φ(z*) − Φ(zLow) = p  →  z* = NORM.S.INV(Φ(zLow) + p)
  if (query === 'invBetweenHigh') {
    const zLow = num(values, 'zLow')
    const probability = num(values, 'probability')
    const phiLow = NORM_S_DIST(zLow, true)
    const target = phiLow + probability
    if (!(target > 0 && target < 1)) {
      throw new Error(
        `Need 0 < Φ(${zLow}) + ${probability} < 1 (got ${fmt(target)}). Check the known z and probability.`,
      )
    }
    const zStar = NORM_S_INV(target)
    const excelPhi = formatExcelCall('NORM.S.DIST', [zLow, true])
    const excelInv = `=NORM.S.INV(${excelPhi.slice(1)} + ${probability})`
    return {
      excelCalls: [excelInv],
      lines: [
        { label: `Φ(${zLow})`, value: fmt(phiLow) },
        { label: `Φ(z*) = Φ(${zLow}) + ${probability}`, value: fmt(target) },
        {
          label: `z* such that P(${zLow} < Z < z*) = ${probability}`,
          value: fmt(zStar, 4),
          emphasis: true,
        },
      ],
      walkthrough: {
        title: 'Standard Normal · find upper bound',
        distribution: 'Z ~ N(0, 1)',
        find: `z* with P(${zLow} < Z < z*) = ${probability}`,
        diagram: {
          kind: 'normal-shade',
          mean: 0,
          sd: 1,
          shade: 'between',
          lower: zLow,
          upper: zStar,
          caption: `Lower = ${zLow}; unknown upper z*; shaded area = ${probability}`,
        },
        steps: [
          step(1, 'Determine the distribution', 'Standard Normal Z ~ N(0, 1).'),
          step(
            2,
            'Code the problem',
            `Known lower z = ${zLow}, target middle probability = ${probability}.`,
          ),
          step(
            3,
            'Identify what to find',
            `Find z* so Φ(z*) − Φ(${zLow}) = ${probability}.`,
          ),
          step(4, 'Draw a diagram', `Shade from ${zLow} up to z*.`),
          step(
            5,
            'Translate for Excel',
            `Φ(z*) = NORM.S.DIST(${zLow},TRUE) + ${probability}, then NORM.S.INV(…).`,
            { excel: [excelPhi, excelInv] },
          ),
          step(
            6,
            'Solve and check',
            `Φ(${zLow}) ≈ ${fmt(phiLow)}, so Φ(z*) ≈ ${fmt(target)} → z* ≈ ${fmt(zStar, 4)}.`,
            { values: [{ label: 'z*', value: fmt(zStar, 4) }] },
          ),
        ],
        explanation:
          'Unknown endpoint problems rearrange the between identity, then invert the standard normal CDF.',
      },
    }
  }

  const probability = num(values, 'probability')
  const z = NORM_S_INV(probability)
  const excel = formatExcelCall('NORM.S.INV', [probability])
  return {
    excelCalls: [excel],
    lines: [
      {
        label: `z such that P(Z ≤ z) = ${probability}`,
        value: fmt(z, 4),
        emphasis: true,
      },
    ],
    walkthrough: {
      title: 'Standard Normal · inverse',
      distribution: 'Z ~ N(0, 1)',
      find: `z with P(Z ≤ z) = ${probability}`,
      diagram: {
        kind: 'normal-shade',
        mean: 0,
        sd: 1,
        shade: 'left',
        x: z,
        caption: `Left area = ${probability}`,
      },
      steps: [
        step(1, 'Determine the distribution', 'Standard Normal Z ~ N(0, 1).'),
        step(2, 'Code the problem', `Target left-tail probability = ${probability}.`),
        step(3, 'Identify what to find', 'The critical z*.'),
        step(4, 'Draw a diagram', 'Shade the left area and read z on the axis.'),
        step(5, 'Translate for Excel', 'NORM.S.INV(probability).', { excel: [excel] }),
        step(6, 'Solve and check', `${excel} ≈ ${fmt(z, 4)}.`, {
          values: [{ label: 'z*', value: fmt(z, 4) }],
        }),
      ],
      explanation: 'NORM.S.INV is the Excel version of reading a Z-table backwards.',
    },
  }
}

function solveT(values: Record<string, unknown>): SolveResult {
  const df = num(values, 'df')
  const query = str(values, 'query', 'cdf')

  if (query === 'cdf') {
    const t = num(values, 't')
    const prob = T_DIST(t, df, true)
    const excel = formatExcelCall('T.DIST', [t, df, true])
    return {
      excelCalls: [excel],
      lines: [{ label: `P(T ≤ ${t})`, value: fmt(prob), emphasis: true }],
      walkthrough: {
        title: 't · left-tail probability',
        distribution: `T ~ t(df = ${df})`,
        find: `P(T ≤ ${t})`,
        diagram: {
          kind: 'normal-shade',
          mean: 0,
          sd: 1,
          shade: 'left',
          x: t,
          caption: `t curve (wider than Z); shade T ≤ ${t}`,
        },
        steps: [
          step(1, 'Determine the distribution', `Student-t with df = ${df}.`),
          step(2, 'Code the problem', `t* = ${t}, df = ${df}.`),
          step(3, 'Identify what to find', `P(T ≤ ${t}).`),
          step(4, 'Draw a diagram', 'Sketch a t curve (slightly heavier tails than Z) and shade the left tail.'),
          step(5, 'Translate for Excel', 'T.DIST(t, df, TRUE).', { excel: [excel] }),
          step(6, 'Solve and check', `${excel} ≈ ${fmt(prob)}.`, {
            values: [{ label: `P(T ≤ ${t})`, value: fmt(prob) }],
          }),
        ],
        explanation: 'T.DIST mirrors NORM.S.DIST but includes degrees of freedom.',
      },
    }
  }

  if (query === 'greater') {
    const t = num(values, 't')
    const left = T_DIST(t, df, true)
    const excel = formatExcelCall('T.DIST', [t, df, true])
    return {
      excelCalls: [`=1 - ${excel.slice(1)}`],
      lines: [{ label: `P(T > ${t})`, value: fmt(1 - left), emphasis: true }],
      walkthrough: {
        title: 't · right-tail probability',
        distribution: `T ~ t(df = ${df})`,
        find: `P(T > ${t})`,
        diagram: {
          kind: 'normal-shade',
          mean: 0,
          sd: 1,
          shade: 'right',
          x: t,
          caption: `Shade T > ${t}`,
        },
        steps: [
          step(1, 'Determine the distribution', `Student-t with df = ${df}.`),
          step(2, 'Code the problem', `t* = ${t}, df = ${df}.`),
          step(3, 'Identify what to find', `P(T > ${t}).`),
          step(4, 'Draw a diagram', 'Shade the right tail.'),
          step(
            5,
            'Translate for Excel',
            `P(T > ${t}) = 1 − T.DIST(${t}, ${df}, TRUE).`,
            { excel: [excel, `=1 - ${excel.slice(1)}`] },
          ),
          step(6, 'Solve and check', `1 − ${fmt(left)} = ${fmt(1 - left)}.`, {
            values: [{ label: `P(T > ${t})`, value: fmt(1 - left) }],
          }),
        ],
        explanation: 'Same complement trick as Normal/Z.',
      },
    }
  }

  if (query === 'invRight') {
    const alpha = num(values, 'alpha')
    const t = T_INV(1 - alpha, df)
    const excel = formatExcelCall('T.INV', [1 - alpha, df])
    return {
      excelCalls: [excel],
      lines: [
        {
          label: `t* with right-tail α = ${alpha}`,
          value: fmt(t, 4),
          emphasis: true,
        },
      ],
      note: 'Right-tail critical value uses T.INV(1 − α, df).',
      walkthrough: {
        title: 't · right critical value',
        distribution: `T ~ t(df = ${df})`,
        find: `t* with P(T > t*) = ${alpha}`,
        diagram: {
          kind: 'normal-shade',
          mean: 0,
          sd: 1,
          shade: 'right',
          x: t,
          caption: `Right-tail area α = ${alpha}`,
        },
        steps: [
          step(1, 'Determine the distribution', `Student-t with df = ${df}.`),
          step(2, 'Code the problem', `Right-tail α = ${alpha}, so left-tail probability = ${1 - alpha}.`),
          step(3, 'Identify what to find', 'Critical t* for the right tail.'),
          step(4, 'Draw a diagram', 'Shade area α on the right; t* is the boundary.'),
          step(
            5,
            'Translate for Excel',
            'T.INV returns a left-tail quantile, so use T.INV(1 − α, df).',
            { excel: [excel] },
          ),
          step(6, 'Solve and check', `${excel} ≈ ${fmt(t, 4)}.`, {
            values: [{ label: 't*', value: fmt(t, 4) }],
          }),
        ],
        explanation: 'Watch the left- vs right-tail convention when calling T.INV.',
      },
    }
  }

  if (query === 'invTwo') {
    const alpha = num(values, 'alpha')
    const t = T_INV(1 - alpha / 2, df)
    const excel = formatExcelCall('T.INV', [1 - alpha / 2, df])
    return {
      excelCalls: [excel],
      lines: [
        {
          label: `±t* for two-tail α = ${alpha}`,
          value: `±${fmt(t, 4)}`,
          emphasis: true,
        },
      ],
      walkthrough: {
        title: 't · two-sided critical value',
        distribution: `T ~ t(df = ${df})`,
        find: `±t* for two-tail α = ${alpha}`,
        diagram: {
          kind: 'normal-shade',
          mean: 0,
          sd: 1,
          shade: 'two-tail',
          lower: -t,
          upper: t,
          caption: `Each tail has area α/2 = ${alpha / 2}`,
        },
        steps: [
          step(1, 'Determine the distribution', `Student-t with df = ${df}.`),
          step(2, 'Code the problem', `Two-tail α = ${alpha} → each tail α/2 = ${alpha / 2}.`),
          step(3, 'Identify what to find', 'Symmetric critical values ±t*.'),
          step(4, 'Draw a diagram', 'Shade both tails; leave central probability 1 − α.'),
          step(
            5,
            'Translate for Excel',
            'T.INV(1 − α/2, df) gives the positive critical value.',
            { excel: [excel] },
          ),
          step(6, 'Solve and check', `±${fmt(t, 4)}.`, {
            values: [{ label: '±t*', value: `±${fmt(t, 4)}` }],
          }),
        ],
        explanation: 'Two-sided CIs and tests use ±t* from T.INV(1 − α/2, df).',
      },
    }
  }

  throw new Error(
    `Unknown t-distribution query: "${query}". Expected cdf, greater, invRight, or invTwo.`,
  )
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

  const intro = [
    step(
      1,
      'Determine the distribution',
      `Sampling distribution of the sample mean. By CLT (or normality of the population), x̄ is approximately Normal.`,
    ),
    step(
      2,
      'Code the problem',
      `μ = ${mean}, σ = ${sd}, n = ${n}${N ? `, N = ${N}` : ''}. SE = σ/√n${fpcApplied ? ' with finite population correction' : ''} = ${fmt(se, 4)}.`,
      {
        values: [
          { label: 'μ', value: String(mean) },
          { label: 'SE(x̄)', value: fmt(se, 4) },
          ...(fpcApplied ? [{ label: 'FPC', value: 'applied' }] : []),
        ],
      },
    ),
  ]

  if (query === 'greater') {
    const value = num(values, 'value')
    const left = NORM_DIST(value, mean, se, true)
    const prob = 1 - left
    const z = (value - mean) / se
    const excel = formatExcelCall('NORM.DIST', [value, mean, se, true])
    return {
      excelCalls: [`=1 - ${excel.slice(1)}`],
      lines: [
        { label: 'SE(x̄)', value: fmt(se, 4) },
        ...(fpcApplied
          ? [{ label: 'Finite population correction', value: 'applied' }]
          : []),
        { label: `P(x̄ ≤ ${value})`, value: fmt(left) },
        { label: `P(x̄ > ${value})`, value: fmt(prob), emphasis: true },
      ],
      note: 'Sampling distribution: x̄ ~ approx Normal(μ, σ/√n).',
      walkthrough: {
        title: 'Sample mean · right-tail probability',
        distribution: `x̄ ≈ N(μ = ${mean}, SE = ${fmt(se, 4)})`,
        find: `P(x̄ > ${value})`,
        diagram: {
          kind: 'normal-shade',
          mean,
          sd: se,
          shade: 'right',
          x: value,
          caption: `Sampling distribution of x̄; shade above ${value}`,
        },
        steps: [
          ...intro,
          step(3, 'Identify what to find', `P(x̄ > ${value}).`),
          step(
            4,
            'Draw a diagram',
            `Sketch Normal(μ, SE). Z = (${value} − ${mean}) / ${fmt(se, 4)} = ${fmt(z, 4)}.`,
          ),
          step(
            5,
            'Translate for Excel',
            `P(x̄ > ${value}) = 1 − NORM.DIST(${value}, ${mean}, ${fmt(se, 4)}, TRUE).`,
            { excel: [excel, `=1 - ${excel.slice(1)}`] },
          ),
          step(
            6,
            'Solve and check',
            `P(x̄ ≤ ${value}) ≈ ${fmt(left)} → P(x̄ > ${value}) = ${fmt(prob)}.`,
            {
              values: [
                { label: 'Z', value: fmt(z, 4) },
                { label: `P(x̄ > ${value})`, value: fmt(prob) },
              ],
            },
          ),
        ],
        explanation:
          'Treat x̄ like any Normal random variable once you have plugged in SE = σ/√n (and FPC if needed).',
      },
    }
  }

  if (query === 'less') {
    const value = num(values, 'value')
    const prob = NORM_DIST(value, mean, se, true)
    const excel = formatExcelCall('NORM.DIST', [value, mean, se, true])
    return {
      excelCalls: [excel],
      lines: [
        { label: 'SE(x̄)', value: fmt(se, 4) },
        { label: `P(x̄ ≤ ${value})`, value: fmt(prob), emphasis: true },
      ],
      walkthrough: {
        title: 'Sample mean · left-tail probability',
        distribution: `x̄ ≈ N(${mean}, ${fmt(se, 4)})`,
        find: `P(x̄ ≤ ${value})`,
        diagram: {
          kind: 'normal-shade',
          mean,
          sd: se,
          shade: 'left',
          x: value,
          caption: `Shade x̄ ≤ ${value}`,
        },
        steps: [
          ...intro,
          step(3, 'Identify what to find', `P(x̄ ≤ ${value}).`),
          step(4, 'Draw a diagram', 'Shade the left side of the sampling distribution.'),
          step(5, 'Translate for Excel', 'NORM.DIST with the SE as standard_dev.', {
            excel: [excel],
          }),
          step(6, 'Solve and check', `${excel} ≈ ${fmt(prob)}.`, {
            values: [{ label: `P(x̄ ≤ ${value})`, value: fmt(prob) }],
          }),
        ],
        explanation: 'Same Excel call as a Normal problem — only the sd argument is SE.',
      },
    }
  }

  const lower = num(values, 'lower')
  const upper = num(values, 'upper')
  const hi = NORM_DIST(upper, mean, se, true)
  const lo = NORM_DIST(lower, mean, se, true)
  const excelHi = formatExcelCall('NORM.DIST', [upper, mean, se, true])
  const excelLo = formatExcelCall('NORM.DIST', [lower, mean, se, true])
  return {
    excelCalls: [`=${excelHi.slice(1)} - ${excelLo.slice(1)}`],
    lines: [
      { label: 'SE(x̄)', value: fmt(se, 4) },
      {
        label: `P(${lower} < x̄ < ${upper})`,
        value: fmt(hi - lo),
        emphasis: true,
      },
    ],
    walkthrough: {
      title: 'Sample mean · between',
      distribution: `x̄ ≈ N(${mean}, ${fmt(se, 4)})`,
      find: `P(${lower} < x̄ < ${upper})`,
      diagram: {
        kind: 'normal-shade',
        mean,
        sd: se,
        shade: 'between',
        lower,
        upper,
        caption: `Shade between ${lower} and ${upper}`,
      },
      steps: [
        ...intro,
        step(3, 'Identify what to find', `P(${lower} < x̄ < ${upper}).`),
        step(4, 'Draw a diagram', 'Shade the central band on the sampling distribution.'),
        step(5, 'Translate for Excel', 'Difference of two NORM.DIST calls.', {
          excel: [excelHi, excelLo],
        }),
        step(6, 'Solve and check', `${fmt(hi)} − ${fmt(lo)} = ${fmt(hi - lo)}.`, {
          values: [{ label: 'probability', value: fmt(hi - lo) }],
        }),
      ],
      explanation: 'Between on x̄ = CDF(upper) − CDF(lower) using SE.',
    },
  }
}

function solveSampleProportion(values: Record<string, unknown>): SolveResult {
  const p = num(values, 'p')
  const n = num(values, 'n')
  const se = Math.sqrt((p * (1 - p)) / n)
  const query = str(values, 'query', 'greater')
  const value = num(values, 'value')
  const npOk = n * p >= 5 && n * (1 - p) >= 5

  const intro = [
    step(
      1,
      'Determine the distribution',
      'Sampling distribution of a sample proportion (Normal approx when CLT conditions hold).',
    ),
    step(
      2,
      'Code the problem',
      `p = ${p}, n = ${n}, SE = √(p(1−p)/n) = ${fmt(se, 6)}. CLT check np & n(1−p) ≥ 5: ${npOk ? 'ok' : 'borderline'}.`,
    ),
  ]

  if (query === 'greater') {
    const left = NORM_DIST(value, p, se, true)
    const excel = formatExcelCall('NORM.DIST', [value, p, se, true])
    return {
      excelCalls: [`=1 - ${excel.slice(1)}`],
      lines: [
        { label: 'SE(p̂)', value: fmt(se, 6) },
        {
          label: 'CLT check np & n(1−p) ≥ 5',
          value: npOk ? 'ok' : 'borderline — interpret carefully',
        },
        { label: `P(p̂ > ${value})`, value: fmt(1 - left), emphasis: true },
      ],
      walkthrough: {
        title: 'Sample proportion · right tail',
        distribution: `p̂ ≈ N(p = ${p}, SE = ${fmt(se, 6)})`,
        find: `P(p̂ > ${value})`,
        diagram: {
          kind: 'normal-shade',
          mean: p,
          sd: se,
          shade: 'right',
          x: value,
          caption: `Shade p̂ > ${value}`,
        },
        steps: [
          ...intro,
          step(3, 'Identify what to find', `P(p̂ > ${value}).`),
          step(
            4,
            'Draw a diagram',
            `Z = (${value} − ${p}) / ${fmt(se, 6)} = ${fmt((value - p) / se, 4)}.`,
          ),
          step(
            5,
            'Translate for Excel',
            `1 − NORM.DIST(${value}, ${p}, SE, TRUE).`,
            { excel: [excel, `=1 - ${excel.slice(1)}`] },
          ),
          step(6, 'Solve and check', `P(p̂ > ${value}) ≈ ${fmt(1 - left)}.`, {
            values: [{ label: `P(p̂ > ${value})`, value: fmt(1 - left) }],
          }),
        ],
        explanation: 'p̂ is just another approximately Normal variable once SE is computed.',
      },
    }
  }

  const left = NORM_DIST(value, p, se, true)
  const excel = formatExcelCall('NORM.DIST', [value, p, se, true])
  return {
    excelCalls: [excel],
    lines: [
      { label: 'SE(p̂)', value: fmt(se, 6) },
      {
        label: 'CLT check np & n(1−p) ≥ 5',
        value: npOk ? 'ok' : 'borderline — interpret carefully',
      },
      { label: `P(p̂ ≤ ${value})`, value: fmt(left), emphasis: true },
    ],
    walkthrough: {
      title: 'Sample proportion · left tail',
      distribution: `p̂ ≈ N(${p}, ${fmt(se, 6)})`,
      find: `P(p̂ ≤ ${value})`,
      diagram: {
        kind: 'normal-shade',
        mean: p,
        sd: se,
        shade: 'left',
        x: value,
        caption: `Shade p̂ ≤ ${value}`,
      },
      steps: [
        ...intro,
        step(3, 'Identify what to find', `P(p̂ ≤ ${value}).`),
        step(4, 'Draw a diagram', 'Shade the left side of the p̂ sampling distribution.'),
        step(5, 'Translate for Excel', 'NORM.DIST with SE as standard_dev.', {
          excel: [excel],
        }),
        step(6, 'Solve and check', `${excel} ≈ ${fmt(left)}.`, {
          values: [{ label: `P(p̂ ≤ ${value})`, value: fmt(left) }],
        }),
      ],
      explanation: 'Left-tail proportion problems are a single NORM.DIST call.',
    },
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
  const excel = formatExcelCall('NORM.S.INV', [1 - alpha / 2])
  return {
    excelCalls: [excel, 'margin = z * σ / SQRT(n)'],
    lines: [
      { label: 'z*', value: fmt(z, 4) },
      { label: 'Margin of error', value: fmt(me, 4) },
      {
        label: `${pct(confidence)} CI for μ`,
        value: `[${fmt(lower, 4)}, ${fmt(upper, 4)}]`,
        emphasis: true,
      },
    ],
    walkthrough: {
      title: 'CI for mean · σ known (Z)',
      distribution: `x̄ ≈ N(μ, σ/√n) with σ = ${sd}`,
      find: `${pct(confidence)} confidence interval for μ`,
      diagram: {
        kind: 'ci-interval',
        center: xbar,
        lower,
        upper,
        caption: `x̄ ± z* · σ/√n`,
      },
      steps: [
        step(1, 'Determine the distribution', 'Known σ → use Z critical values for the CI.'),
        step(
          2,
          'Code the problem',
          `x̄ = ${xbar}, σ = ${sd}, n = ${n}, confidence = ${confidence} so α = ${fmt(alpha, 4)}.`,
        ),
        step(3, 'Identify what to find', 'Lower and upper confidence limits for μ.'),
        step(
          4,
          'Draw a diagram',
          'Draw the Normal sampling distribution of x̄; mark central probability 1 − α and two equal tails α/2.',
        ),
        step(
          5,
          'Translate for Excel',
          'z* = NORM.S.INV(1 − α/2); margin = z* · σ/√n; CI = x̄ ± margin.',
          { excel: [excel] },
        ),
        step(
          6,
          'Solve and check',
          `z* ≈ ${fmt(z, 4)}, ME ≈ ${fmt(me, 4)}, CI = [${fmt(lower, 4)}, ${fmt(upper, 4)}]. Wider confidence → wider interval.`,
          {
            values: [
              { label: 'z*', value: fmt(z, 4) },
              { label: 'ME', value: fmt(me, 4) },
              { label: 'CI', value: `[${fmt(lower, 4)}, ${fmt(upper, 4)}]` },
            ],
          },
        ),
      ],
      explanation:
        'Interpretation: in repeated sampling, about (1 − α) of such intervals contain μ.',
    },
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
  const excel = formatExcelCall('T.INV', [1 - alpha / 2, df])
  return {
    excelCalls: [excel, 'margin = t * s / SQRT(n)'],
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
    walkthrough: {
      title: 'CI for mean · σ unknown (t)',
      distribution: `Use t(df = ${df}) because σ is estimated by s = ${s}`,
      find: `${pct(confidence)} confidence interval for μ`,
      diagram: {
        kind: 'ci-interval',
        center: xbar,
        lower: xbar - me,
        upper: xbar + me,
        caption: `x̄ ± t* · s/√n`,
      },
      steps: [
        step(1, 'Determine the distribution', 'Unknown σ → replace Z with t and σ with s.'),
        step(
          2,
          'Code the problem',
          `x̄ = ${xbar}, s = ${s}, n = ${n}, df = n − 1 = ${df}, α = ${fmt(alpha, 4)}.`,
        ),
        step(3, 'Identify what to find', 't-based confidence limits for μ.'),
        step(4, 'Draw a diagram', 'Same CI picture as Z, but the critical value comes from t.'),
        step(
          5,
          'Translate for Excel',
          't* = T.INV(1 − α/2, df); margin = t* · s/√n.',
          { excel: [excel] },
        ),
        step(
          6,
          'Solve and check',
          `t* ≈ ${fmt(t, 4)}, CI = [${fmt(xbar - me, 4)}, ${fmt(xbar + me, 4)}]. Expect a slightly wider interval than the known-σ Z version.`,
          {
            values: [
              { label: 't*', value: fmt(t, 4) },
              {
                label: 'CI',
                value: `[${fmt(xbar - me, 4)}, ${fmt(xbar + me, 4)}]`,
              },
            ],
          },
        ),
      ],
      explanation: 't intervals account for extra uncertainty from estimating σ.',
    },
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
  const excel = formatExcelCall('NORM.S.INV', [1 - alpha / 2])
  return {
    excelCalls: [excel, 'p̂ = successes / n'],
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
    walkthrough: {
      title: 'CI for proportion',
      distribution: `p̂ ≈ N(p, √(p̂(1−p̂)/n)) with p̂ = ${fmt(phat, 4)}`,
      find: `${pct(confidence)} CI for p`,
      diagram: {
        kind: 'ci-interval',
        center: phat,
        lower: phat - me,
        upper: phat + me,
        caption: `p̂ ± z* · SE(p̂)`,
      },
      steps: [
        step(1, 'Determine the distribution', 'Approximate Normal CI for a proportion (CLT).'),
        step(
          2,
          'Code the problem',
          `successes = ${successes}, n = ${n} → p̂ = ${fmt(phat, 4)}.`,
        ),
        step(3, 'Identify what to find', 'Lower and upper limits for population proportion p.'),
        step(4, 'Draw a diagram', 'Center the interval at p̂ with equal tails α/2.'),
        step(
          5,
          'Translate for Excel',
          'z* = NORM.S.INV(1 − α/2); SE uses p̂ since p is unknown.',
          { excel: [excel] },
        ),
        step(
          6,
          'Solve and check',
          `CI = [${fmt(phat - me, 4)}, ${fmt(phat + me, 4)}].`,
          {
            values: [
              { label: 'p̂', value: fmt(phat, 4) },
              {
                label: 'CI',
                value: `[${fmt(phat - me, 4)}, ${fmt(phat + me, 4)}]`,
              },
            ],
          },
        ),
      ],
      explanation: 'Substitute p̂ for the unknown p inside the standard error.',
    },
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
  const excel = formatExcelCall('NORM.S.INV', [1 - alpha / 2])
  return {
    excelCalls: [excel, 'n = CEILING((z * σ / E)^2)'],
    lines: [
      { label: 'z*', value: fmt(z, 4) },
      { label: 'Raw n', value: fmt(raw * raw, 4) },
      { label: 'Required n (round up)', value: String(n), emphasis: true },
    ],
    walkthrough: {
      title: 'Sample size · mean',
      distribution: 'Planning n so z* · σ/√n ≤ E',
      find: `Minimum n for ME ≈ ${E} at ${pct(confidence)} confidence`,
      diagram: {
        kind: 'number-line',
        min: 0,
        max: Math.max(n, 10),
        marks: [
          { value: 0, label: '0' },
          { value: n, label: `n=${n}` },
        ],
        highlightFrom: n,
        highlightTo: n,
        caption: 'Round any fractional n upward',
      },
      steps: [
        step(1, 'Determine the distribution', 'Mean estimation with known/assumed σ uses Z.'),
        step(
          2,
          'Code the problem',
          `σ = ${sd}, desired margin E = ${E}, confidence = ${confidence}.`,
        ),
        step(3, 'Identify what to find', 'Smallest whole-number sample size n.'),
        step(4, 'Draw a diagram', 'Think of the CI half-width E = z* · σ/√n; solve for n.'),
        step(
          5,
          'Translate for Excel',
          'z* = NORM.S.INV(1 − α/2); n = CEILING((z* σ / E)²).',
          { excel: [excel] },
        ),
        step(
          6,
          'Solve and check',
          `Raw n ≈ ${fmt(raw * raw, 4)} → round up to ${n}.`,
          { values: [{ label: 'n', value: String(n) }] },
        ),
      ],
      explanation: 'Always round sample-size formulas up; a fraction of an observation is not usable.',
    },
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
  const excel = formatExcelCall('NORM.S.INV', [1 - alpha / 2])
  return {
    excelCalls: [excel, 'n = CEILING(z² p (1−p) / E²)'],
    lines: [
      { label: 'p used', value: fmt(p, 4) },
      { label: 'z*', value: fmt(z, 4) },
      { label: 'Required n (round up)', value: String(n), emphasis: true },
    ],
    note: conservative
      ? 'Conservative plan uses p = 0.5 (largest variance).'
      : 'Pilot p̂ used for planning sample size.',
    walkthrough: {
      title: 'Sample size · proportion',
      distribution: 'Planning n from ME = z* √(p(1−p)/n)',
      find: `Minimum n for ME ≈ ${E} at ${pct(confidence)} confidence`,
      diagram: {
        kind: 'number-line',
        min: 0,
        max: Math.max(n, 10),
        marks: [
          { value: 0, label: '0' },
          { value: n, label: `n=${n}` },
        ],
        highlightFrom: n,
        highlightTo: n,
        caption: conservative ? 'Using conservative p = 0.5' : `Using pilot p = ${p}`,
      },
      steps: [
        step(1, 'Determine the distribution', 'Proportion CI planning with Normal approximation.'),
        step(
          2,
          'Code the problem',
          `E = ${E}, confidence = ${confidence}, p used = ${p}${conservative ? ' (conservative)' : ' (pilot)'}.`,
        ),
        step(3, 'Identify what to find', 'Minimum n after rounding up.'),
        step(4, 'Draw a diagram', 'Same CI half-width idea, now with √(p(1−p)/n).'),
        step(
          5,
          'Translate for Excel',
          'z* = NORM.S.INV(1 − α/2); n = CEILING(z² p (1−p) / E²).',
          { excel: [excel] },
        ),
        step(
          6,
          'Solve and check',
          `Raw n ≈ ${fmt(raw, 4)} → n = ${n}.`,
          {
            values: [
              { label: 'p used', value: fmt(p, 4) },
              { label: 'n', value: String(n) },
            ],
          },
        ),
      ],
      explanation: conservative
        ? 'p = 0.5 maximizes p(1−p), giving the most conservative (largest) n.'
        : 'A pilot study supplies p̂ so the planned n can be smaller than the conservative choice.',
    },
  }
}
