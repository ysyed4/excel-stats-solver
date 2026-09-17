/**
 * Regression: “within X of the mean” derived between-bounds for sample-mean.
 * Lower/upper must be μ±X exactly (not AI-approximate arithmetic).
 * Run: npm run test:toronto
 */
import { parseProblemText, applyWithinOfMeanBounds } from './parseProblem'
import { solve } from './compute'
import { mergeAutofillValues } from './values'

const SAMPLE_MEAN_DEFAULTS = {
  mean: 2000,
  sd: 240,
  n: 36,
  query: 'greater' as const,
  value: 2080,
  N: '',
  useFpc: true, // stale checked FPC from a prior Kingston solve
}

const TORONTO = `The rental market in Toronto is huge with 10,000 units. The price of
single bedroom apartments is not normal, but it is known to have a
mean of $2,000 per month and a standard deviation of $240.
a. Suppose you took a sample mean with n of 36, what is the
probability that it would be within one standard deviation (i.e.
$240) of the actual mean?`

const WIDGETS = `Widgets have mean 50 and standard deviation 4 (not normal).
Suppose you took a sample of 25. What is the probability that the
sample mean is within 2 of the true mean?`

function emphProb(values: Record<string, string | number | boolean>) {
  const res = solve('sample-mean', values)
  const line = res.lines.find((l) => l.emphasis)
  if (!line) throw new Error('No emphasis line')
  return Number(line.value)
}

function assertClose(name: string, got: number, want: number, tol = 1e-6) {
  if (Math.abs(got - want) > tol) {
    throw new Error(`${name}: got ${got}, want ≈ ${want}`)
  }
}

function assertWithinCase(
  label: string,
  text: string,
  want: {
    mean: number
    sd: number
    n: number
    lower: number
    upper: number
    N?: number
    useFpc: boolean
    p: number
  },
) {
  const parsed = parseProblemText(text)
  if (!parsed) throw new Error(`[${label}] parse returned null`)
  if (parsed.solverId !== 'sample-mean') {
    throw new Error(`[${label}] solverId=${parsed.solverId}, want sample-mean`)
  }

  const v = parsed.values
  if (v.query !== 'between') {
    throw new Error(`[${label}] query=${v.query}, want between`)
  }
  if (Number(v.mean) !== want.mean || Number(v.sd) !== want.sd || Number(v.n) !== want.n) {
    throw new Error(`[${label}] mean/sd/n mismatch: ${JSON.stringify(v)}`)
  }
  if (Number(v.lower) !== want.lower || Number(v.upper) !== want.upper) {
    throw new Error(
      `[${label}] bounds lower=${v.lower} upper=${v.upper}, want ${want.lower}/${want.upper}`,
    )
  }
  if (want.N !== undefined && Number(v.N) !== want.N) {
    throw new Error(`[${label}] N=${v.N}, want ${want.N}`)
  }
  if (v.useFpc !== want.useFpc) {
    throw new Error(`[${label}] useFpc=${v.useFpc}, want ${want.useFpc}`)
  }

  const merged = mergeAutofillValues('sample-mean', SAMPLE_MEAN_DEFAULTS, v)
  if (merged.useFpc !== want.useFpc) {
    throw new Error(
      `[${label}] merge useFpc=${merged.useFpc}, want ${want.useFpc} (stale FPC must not stick without N/threshold)`,
    )
  }
  if (Number(merged.lower) !== want.lower || Number(merged.upper) !== want.upper) {
    throw new Error(`[${label}] merge bounds wrong: ${JSON.stringify(merged)}`)
  }

  const p = emphProb(v)
  assertClose(`[${label}] P`, p, want.p, 1e-5)
  console.log(`OK [${label}]`, { lower: v.lower, upper: v.upper, useFpc: v.useFpc }, '→', p)
}

function main() {
  assertWithinCase('toronto-within-sd', TORONTO, {
    mean: 2000,
    sd: 240,
    n: 36,
    lower: 1760,
    upper: 2240,
    N: 10000,
    useFpc: false,
    p: 0.999999998,
  })

  assertWithinCase('widgets-within-2', WIDGETS, {
    mean: 50,
    sd: 4,
    n: 25,
    lower: 48,
    upper: 52,
    useFpc: false,
    p: 0.9875806693,
  })

  // AI-arithmetic repair: wrong lower must be overwritten from text
  const repaired = applyWithinOfMeanBounds(TORONTO, {
    mean: 2000,
    sd: 240,
    n: 36,
    query: 'between',
    lower: 1789,
    upper: 2240,
  })
  if (Number(repaired.lower) !== 1760 || Number(repaired.upper) !== 2240) {
    throw new Error(`repair failed: ${JSON.stringify(repaired)}`)
  }
  console.log('OK [ai-bound-repair] 1789 → 1760')

  // FPC checked with empty N must clear on merge
  const staleFpc = mergeAutofillValues('sample-mean', SAMPLE_MEAN_DEFAULTS, {
    mean: 2000,
    sd: 240,
    n: 36,
    query: 'between',
    lower: 1760,
    upper: 2240,
    useFpc: true,
  })
  if (staleFpc.useFpc !== false) {
    throw new Error(`expected useFpc cleared when N missing, got ${JSON.stringify(staleFpc)}`)
  }
  console.log('OK [fpc-without-N] unchecked')

  // Validation names Lower, not a hardcoded “upper”
  try {
    solve('sample-mean', {
      mean: 2000,
      sd: 240,
      n: 36,
      query: 'between',
      lower: '',
      upper: 2240,
    })
    throw new Error('expected empty lower to throw')
  } catch (err) {
    if (!(err instanceof Error) || !/valid number for Lower/i.test(err.message)) {
      throw new Error(
        `empty lower should name Lower, got: ${err instanceof Error ? err.message : err}`,
      )
    }
  }
  console.log('OK [validation-lower-label]')

  console.log('All Toronto within-of-mean regression checks passed.')
}

main()
