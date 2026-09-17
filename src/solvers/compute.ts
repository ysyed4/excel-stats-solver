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
  const x = num(values, 'x')
  const query = str(values, 'query', 'atLeast')
  const hasExact = values.x2 !== undefined && values.x2 !== ''
  const x2 = hasExact ? num(values, 'x2') : undefined

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

function solvePoisson(values: Record<string, unknown>): SolveResult {
  const lambdaBase = num(values, 'lambda')
  const query = str(values, 'query', 'equal')
  const x = num(values, 'x')
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

  const regions = [{ from: Math.max(a, Math.min(lower, upper)), to: Math.min(b, Math.max(lower, upper)), label: 'between' }]
  const stepValues = [{ label: `P(${lower} ≤ X ≤ ${upper})`, value: fmt(between) }]
  let atLeastText = ''
  let exactText = ''

  if (values.atLeast !== undefined && values.atLeast !== '') {
    const atLeast = num(values, 'atLeast')
    const p = UNIFORM_RANGE_PROB(a, b, atLeast, b)
    lines.push({ label: `P(X ≥ ${atLeast})`, value: fmt(p), emphasis: true })
    regions.push({ from: Math.max(a, atLeast), to: b, label: '≥' })
    stepValues.push({ label: `P(X ≥ ${atLeast})`, value: fmt(p) })
    atLeastText = ` Also P(X ≥ ${atLeast}) = (${b} − ${atLeast}) / (${b} − ${a}) = ${fmt(p)}.`
  }

  if (values.exact !== undefined && values.exact !== '') {
    const exact = num(values, 'exact')
    lines.push({ label: `P(X = ${exact})`, value: '0', emphasis: true })
    stepValues.push({ label: `P(X = ${exact})`, value: '0' })
    exactText = ` A single point such as X = ${exact} has probability 0 on a continuous distribution.`
  }

  return {
    excelCalls,
    lines,
    note: 'Continuous uniform: probability is the length of the event interval divided by (b − a). A single point has probability 0.',
    walkthrough: {
      title: 'Uniform · length ratios',
      distribution: `X ~ Uniform(a = ${a}, b = ${b})`,
      find: `P(${lower} ≤ X ≤ ${upper})` +
        (values.atLeast ? ` and related events` : ''),
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
        step(
          3,
          'Identify what to find',
          `Primary event: P(${lower} ≤ X ≤ ${upper}).`,
        ),
        step(
          4,
          'Draw a diagram',
          'Sketch the flat density rectangle and shade the event interval(s).',
        ),
        step(
          5,
          'Translate for Excel / geometry',
          `Probability = (length of overlap with [a, b]) / (b − a). No special Excel distribution function is required — it is a length ratio.`,
          { excel: excelCalls },
        ),
        step(
          6,
          'Solve and check',
          `P(${lower} ≤ X ≤ ${upper}) = ${fmt(between)}.${atLeastText}${exactText}`,
          { values: stepValues },
        ),
      ],
      explanation:
        'For Uniform, “draw the rectangle and take the shaded length over total length” is the course method.',
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
