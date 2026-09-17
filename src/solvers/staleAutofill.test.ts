/**
 * Systemic stale-autofill suite: load a curated example, then merge autofill
 * for an unrelated problem, and assert every content field matches the new
 * problem — never a leftover from defaults/example.
 * Run: npm run test:stale
 */
import { EXAMPLES } from './examples'
import { parseProblemText } from './parseProblem'
import { mergeAutofillValues } from './values'
import type { SolverId } from './types'

/** Mirrors App DEFAULTS — used as the merge “defaults” arg (must not leak). */
const DEFAULTS: Record<SolverId, Record<string, string | number | boolean>> = {
  binomial: { n: 20, p: 0.5, query: 'atLeast', x: 10, x2: 15 },
  poisson: { lambda: 1.5, hours: 1, independentDays: 1, query: 'equal', x: 0 },
  uniform: {
    a: 2000,
    b: 5000,
    lower: 2500,
    upper: 3000,
    atLeast: 4000,
    exact: 2500,
  },
  normal: { mean: 15, sd: 3, query: 'greater', x: 16, lower: 8, upper: 19 },
  'standard-normal': {
    query: 'less',
    z: 1,
    zLow: -1,
    zHigh: 1,
    probability: 0.975,
  },
  't-dist': { df: 30, query: 'invRight', alpha: 0.1, t: 2.04 },
  'sample-mean': {
    mean: 2000,
    sd: 240,
    n: 36,
    query: 'greater',
    value: 2080,
    N: '',
    useFpc: false,
  },
  'sample-proportion': { p: 0.2, n: 30, query: 'greater', value: 0.25 },
  'ci-mean-z': { xbar: 2100, sd: 240, n: 36, confidence: 0.95 },
  'ci-mean-t': { xbar: 995, s: 21, n: 49, confidence: 0.95 },
  'ci-proportion': { successes: 12, n: 50, confidence: 0.95 },
  'n-mean': { sd: 240, E: 100, confidence: 0.95 },
  'n-proportion': { p: 0.1, E: 0.05, confidence: 0.95, conservative: false },
}

const STRUCTURAL = new Set(['query', 'useFpc', 'conservative', 'hours', 'independentDays', 'N'])

type Case = {
  label: string
  exampleId: string
  problem: string
  expectSolver: SolverId
  expect: Record<string, string | number | boolean>
}

const CASES: Case[] = [
  {
    label: 'paint-ci-after-apartment-example',
    exampleId: 'ci-apartments',
    problem: `A local company uses a machine to fill containers of paint. The
machine is supposed to fill the containers to the level of 1,000 ml,
however, it may not be working properly. Suppose that it is known
that, whether it's working properly or not, the standard deviation of
its fill rate is 21 ml.
a. Suppose a sample of 49 is taken and the average is found to be
995 ml. Construct the 95% confidence interval for the population
mean.`,
    expectSolver: 'ci-mean-z',
    expect: { xbar: 995, sd: 21, n: 49, confidence: 0.95 },
  },
  {
    label: 'ontario-a-after-lake-trout',
    exampleId: 'fishing-normal',
    problem:
      'Peak electricity demand ~ Normal mean 1000 sd 60. Maximum generation is 1,100. What is P(blackout)?',
    expectSolver: 'normal',
    expect: { mean: 1000, sd: 60, query: 'greater', x: 1100 },
  },
  {
    label: 'kingston-after-toronto-example',
    exampleId: 'toronto-mean',
    problem: `Apartment Rental Problem. The rental market in Kingston is small – only 100 units. The price of single bedroom apartments is not normal, but it is known to have a mean of $2,000 per month and a standard deviation of $240.
a. If you took a random sample of 36 apartments, what is the distribution of the sample mean?
b. What is the probability that your sample will have a mean greater than $2,080?`,
    expectSolver: 'sample-mean',
    expect: {
      mean: 2000,
      sd: 240,
      n: 36,
      N: 100,
      value: 2080,
      query: 'greater',
      useFpc: true,
    },
  },
  {
    label: 'toronto-within-after-kingston-example',
    exampleId: 'kingston-fpc',
    problem: `The rental market in Toronto is huge with 10,000 units. The price of
single bedroom apartments is not normal, but it is known to have a
mean of $2,000 per month and a standard deviation of $240.
a. Suppose you took a sample mean with n of 36, what is the
probability that it would be within one standard deviation (i.e.
$240) of the actual mean?`,
    expectSolver: 'sample-mean',
    expect: {
      mean: 2000,
      sd: 240,
      n: 36,
      N: 10000,
      query: 'between',
      lower: 1760,
      upper: 2240,
      useFpc: false,
    },
  },
  {
    label: 'paint-prop-after-high-priced-example',
    exampleId: 'ci-prop-high',
    problem: `A local company uses a machine to fill containers of paint. The
machine is supposed to fill the containers to the level of 1,000 ml,
however, it may not be working properly. Suppose that it is known
that, whether it's working properly or not, the standard deviation of
its fill rate is 21 ml.
b. Suppose a sample of 100 were taken and 78 of them were found
to be under-filled. Calculate the 95% confidence interval on the
proportion of those that were under-filled.`,
    expectSolver: 'ci-proportion',
    expect: { successes: 78, n: 100, confidence: 0.95 },
  },
]

function assertCase(c: Case) {
  const example = EXAMPLES.find((e) => e.id === c.exampleId)
  if (!example) throw new Error(`[${c.label}] missing example ${c.exampleId}`)

  const defaults = DEFAULTS[example.solverId]
  // (1) load curated example into merge pipeline
  const afterExample = mergeAutofillValues(
    example.solverId,
    defaults,
    example.values,
  )

  // (2) parse unrelated problem
  const parsed = parseProblemText(c.problem)
  if (!parsed) throw new Error(`[${c.label}] parse null`)
  if (parsed.solverId !== c.expectSolver) {
    throw new Error(
      `[${c.label}] solverId=${parsed.solverId}, want ${c.expectSolver}`,
    )
  }

  // (3) autofill as if Detect wrote over the example (same as App.fillSolver)
  const afterAutofill = mergeAutofillValues(
    parsed.solverId,
    DEFAULTS[parsed.solverId],
    parsed.values,
  )

  for (const [k, want] of Object.entries(c.expect)) {
    const got = afterAutofill[k]
    if (got !== want && Number(got) !== Number(want)) {
      throw new Error(
        `[${c.label}] field ${k}: got ${JSON.stringify(got)}, want ${want}; full=${JSON.stringify(afterAutofill)}; priorExample=${JSON.stringify(afterExample)}`,
      )
    }
  }

  // No content field from the prior example may survive unless the new problem
  // explicitly set the same value.
  for (const [k, prior] of Object.entries(example.values)) {
    if (STRUCTURAL.has(k)) continue
    if (k in c.expect) continue
    if (k in afterAutofill && afterAutofill[k] === prior) {
      // Same value coincidentally OK only if parsed also had it
      if (parsed.values[k] !== prior) {
        throw new Error(
          `[${c.label}] stale field ${k}=${prior} from example survived autofill`,
        )
      }
    }
  }

  // Defaults must not fill missing content keys
  for (const [k, defVal] of Object.entries(DEFAULTS[parsed.solverId])) {
    if (STRUCTURAL.has(k)) continue
    if (k in parsed.values) continue
    if (k in afterAutofill && afterAutofill[k] === defVal) {
      throw new Error(
        `[${c.label}] default leaked for unset ${k}=${defVal}`,
      )
    }
  }

  console.log(`OK [${c.label}]`, afterAutofill)
}

function main() {
  for (const c of CASES) assertCase(c)
  console.log('All stale-autofill regression checks passed.')
}

main()
