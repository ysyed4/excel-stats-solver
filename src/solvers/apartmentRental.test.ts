/**
 * Regression: Apartment Rental multipart sample-mean with FPC.
 * Part (b) says “your sample” without restating μ,σ,n,N — must inherit (a)
 * and apply finite population correction (N=100, n=36).
 * Run: npm run test:apartment
 */
import { parseProblemText } from './parseProblem'
import { solve } from './compute'
import { mergeAutofillValues } from './values'

const SAMPLE_MEAN_DEFAULTS = {
  mean: 2000,
  sd: 240,
  n: 36,
  query: 'greater' as const,
  value: 2080,
  N: '',
  useFpc: false,
}

const NORMAL_DEFAULTS = {
  mean: 15,
  sd: 3,
  query: 'greater' as const,
  x: 16,
  lower: 8,
  upper: 19,
}

const FULL = `Apartment Rental Problem. The rental market in Kingston is small – only 100 units. The price of single bedroom apartments is not normal, but it is known to have a mean of $2,000 per month and a standard deviation of $240.
a. If you took a random sample of 36 apartments, what is the distribution of the sample mean?
b. What is the probability that your sample will have a mean greater than $2,080?`

/** Part (b) alone still references “your sample” — full paste includes setup + (a). */
const FULL_ALT = `The rental market is small – only 100 units. Apartment rents have mean $2000 and standard deviation $240 (not normal).
a. Random sample of 36 apartments: what is the distribution of the sample mean?
b. Probability that your sample will have a mean greater than $2080?`

const EXPECTED_P = 0.006433

function emphProb(solverId: string, values: Record<string, string | number | boolean>) {
  const res = solve(solverId as 'sample-mean', values)
  const line = res.lines.find((l) => l.emphasis)
  if (!line) throw new Error(`No emphasis line for ${solverId}`)
  return Number(line.value)
}

function assertClose(name: string, got: number, want: number, tol = 0.00005) {
  if (Math.abs(got - want) > tol) {
    throw new Error(`${name}: got ${got}, want ≈ ${want}`)
  }
}

function assertApartment(label: string, text: string) {
  const parsed = parseProblemText(text)
  if (!parsed) throw new Error(`[${label}] parse returned null`)

  if (parsed.solverId !== 'sample-mean') {
    throw new Error(`[${label}] solverId=${parsed.solverId}, want sample-mean`)
  }

  // Must not spin up a disconnected Normal Part B tab
  if (parsed.parts?.some((p) => p.solverId === 'normal')) {
    throw new Error(
      `[${label}] spurious Normal part(s): ${JSON.stringify(parsed.parts)}`,
    )
  }
  if (parsed.parts && parsed.parts.length > 1) {
    throw new Error(
      `[${label}] expected single sample-mean solve, got ${parsed.parts.length} parts`,
    )
  }

  const v = parsed.values
  if (Number(v.mean) !== 2000 || Number(v.sd) !== 240 || Number(v.n) !== 36) {
    throw new Error(`[${label}] mean/sd/n mismatch: ${JSON.stringify(v)}`)
  }
  if (Number(v.N) !== 100) {
    throw new Error(`[${label}] N=${v.N}, want 100 (from “only 100 units”)`)
  }
  if (v.useFpc !== true) {
    throw new Error(`[${label}] useFpc=${v.useFpc}, want true (n > N/20)`)
  }
  if (Number(v.value) !== 2080) {
    throw new Error(`[${label}] value=${v.value}, want 2080`)
  }

  // Autofill must not reintroduce lake-trout Normal stubs
  const mergedSm = mergeAutofillValues('sample-mean', SAMPLE_MEAN_DEFAULTS, v)
  if (mergedSm.useFpc !== true || Number(mergedSm.N) !== 100) {
    throw new Error(`[${label}] merge lost FPC: ${JSON.stringify(mergedSm)}`)
  }

  const mergedNormalGuard = mergeAutofillValues('normal', NORMAL_DEFAULTS, {
    query: 'greater',
  })
  if (
    mergedNormalGuard.mean === 15 ||
    mergedNormalGuard.sd === 3 ||
    mergedNormalGuard.x === 16
  ) {
    throw new Error(
      `[${label}] stale Normal defaults survived merge: ${JSON.stringify(mergedNormalGuard)}`,
    )
  }

  const p = emphProb(parsed.solverId, parsed.values)
  assertClose(`[${label}] P(x̄ > 2080)`, p, EXPECTED_P)
  console.log(`OK [${label}]`, parsed.values, '→', p)
}

function main() {
  assertApartment('apartment-rental-full', FULL)
  assertApartment('apartment-rental-alt', FULL_ALT)
  console.log('All Apartment Rental regression checks passed.')
}

main()
