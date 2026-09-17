/**
 * Regression fixture: Ontario blackout multipart (Normal a–c + Binomial d).
 * Covers local detect for full wording variants + autofill merge guards.
 * Run: npm run test:ontario
 */
import { parseProblemText } from './parseProblem'
import { solve } from './compute'
import { mergeAutofillValues, coerceValues } from './values'

const NORMAL_DEFAULTS = {
  mean: 15,
  sd: 3,
  query: 'greater' as const,
  x: 16,
  lower: 8,
  upper: 19,
}
const BINOM_DEFAULTS = {
  n: 20,
  p: 0.5,
  query: 'atLeast' as const,
  x: 10,
  x2: 15,
}

/** Canonical full problem (capacity / independent days). */
const FULL_A = `Peak demand for electricity in Ontario is normally distributed with a mean of 1000 and a standard deviation of 60. Max capacity is 1,100 units. Blackout if demand exceeds capacity.
a. What is the probability of a blackout on one day?
b. What if the standard deviation falls to 50?
c. What if σ stays 60 but capacity rises by 100 (to 1,200)?
d. If repeated over 20 independent days, what is P(at least one blackout)?`

/** Alternate MMA-style wording (generation limit / repeated each day). */
const FULL_B = `Peak demand for electricity is normally distributed with mean 1000 and standard deviation 60. Maximum electricity generation is 1,100 units. A blackout occurs if demand exceeds generation.
a. P(blackout on one day)?
b. If the standard deviation of demand falls to 50, P(blackout)?
c. If σ stays 60 but capacity rises by 100 (to 1,200), P(blackout)?
d. If the situation in (a) is repeated each day for 20 days, P(at least one blackout)?`

const EXPECTED = {
  A: { solverId: 'normal', mean: 1000, sd: 60, x: 1100, pApprox: 0.04779 },
  B: { solverId: 'normal', mean: 1000, sd: 50, x: 1100, pApprox: 0.02275 },
  C: { solverId: 'normal', mean: 1000, sd: 60, x: 1200, pApprox: 0.000429 },
  D: { solverId: 'binomial', n: 20, x: 1, pApprox: 0.624464 },
} as const

function emphProb(
  solverId: string,
  values: Record<string, string | number | boolean>,
) {
  const res = solve(solverId as 'normal' | 'binomial', values)
  const line = res.lines.find((l) => l.emphasis)
  if (!line) throw new Error(`No emphasis line for ${solverId}`)
  const v = Number(line.value)
  if (v === 0 || v === 1) {
    throw new Error(
      `Suspicious Final Answer ${v} for ${JSON.stringify(values)} — likely stale x/threshold`,
    )
  }
  return v
}

function assertClose(name: string, got: number, want: number, tol = 0.0005) {
  if (Math.abs(got - want) > tol) {
    throw new Error(`${name}: got ${got}, want ≈ ${want}`)
  }
}

function assertParts(label: string, text: string) {
  const parsed = parseProblemText(text)
  if (!parsed?.parts || parsed.parts.length < 4) {
    throw new Error(
      `[${label}] Expected 4 parts, got ${parsed?.parts?.length}: ${parsed?.summary}`,
    )
  }

  for (const letter of ['A', 'B', 'C', 'D'] as const) {
    const part = parsed.parts.find(
      (p) => p.label.replace(/^part\s+/i, '').trim().toUpperCase() === letter,
    )
    if (!part) throw new Error(`[${label}] Missing Part ${letter}`)
    const exp = EXPECTED[letter]
    if (part.solverId !== exp.solverId) {
      throw new Error(
        `[${label}] Part ${letter} solverId=${part.solverId}, want ${exp.solverId}`,
      )
    }
    if (letter !== 'D') {
      const e = exp as (typeof EXPECTED)['A']
      if (Number(part.values.mean) !== e.mean || Number(part.values.sd) !== e.sd) {
        throw new Error(
          `[${label}] Part ${letter} mean/sd mismatch: ${JSON.stringify(part.values)}`,
        )
      }
      if (Number(part.values.x) !== e.x) {
        throw new Error(
          `[${label}] Part ${letter} x=${part.values.x}, want ${e.x}`,
        )
      }
    } else {
      const e = exp as (typeof EXPECTED)['D']
      if (Number(part.values.n) !== e.n || Number(part.values.x) !== e.x) {
        throw new Error(
          `[${label}] Part D n/x mismatch: ${JSON.stringify(part.values)}`,
        )
      }
    }
    const p = emphProb(part.solverId, part.values)
    assertClose(
      `[${label}] Part ${letter} probability`,
      p,
      exp.pApprox,
      letter === 'D' ? 0.002 : 0.0005,
    )
    console.log(`OK [${label}] Part ${letter}: ${part.solverId}`, part.values, '→', p)
  }
}

function main() {
  const coerced = coerceValues({
    mean: 1000,
    sd: 60,
    query: 'greater',
    x: '1,100',
  })
  if (coerced.x !== 1100) throw new Error(`comma coerce failed: ${coerced.x}`)

  const aliased = coerceValues({
    mean: 1000,
    sd: 60,
    query: 'greater',
    capacity: '1,200',
  })
  if (aliased.x !== 1200) {
    throw new Error(`capacity alias failed: ${JSON.stringify(aliased)}`)
  }

  const merged = mergeAutofillValues('normal', NORMAL_DEFAULTS, {
    mean: 1000,
    sd: 60,
    query: 'greater',
    x: 1100,
  })
  if (merged.x !== 1100) throw new Error(`merge lost x: ${merged.x}`)

  const mergedNoX = mergeAutofillValues('normal', NORMAL_DEFAULTS, {
    mean: 1000,
    sd: 60,
    query: 'greater',
  })
  if (mergedNoX.x === 16) {
    throw new Error('stale default x=16 survived autofill merge')
  }

  const mergedBinom = mergeAutofillValues('binomial', BINOM_DEFAULTS, {
    n: 20,
    p: 0.04779,
    query: 'atLeast',
    x: 1,
  })
  if (mergedBinom.x2 === 15) {
    throw new Error('stale optional x2=15 survived autofill merge')
  }

  // Empty string must not become a silent P(X>0)=1
  try {
    solve('normal', { mean: 1000, sd: 60, query: 'greater', x: '' })
    throw new Error('expected empty x to throw')
  } catch (err) {
    if (!(err instanceof Error) || !/valid number for x/i.test(err.message)) {
      throw err
    }
  }

  assertParts('full-capacity', FULL_A)
  assertParts('full-generation-repeated-each-day', FULL_B)

  // Standalone “at least one over N days” should classify Binomial (local)
  const alone = parseProblemText(
    'An event has probability 0.05 each day. If repeated each day for 20 days, what is P(at least one occurrence)?',
  )
  if (alone?.solverId !== 'binomial') {
    throw new Error(`standalone at-least-one classified as ${alone?.solverId}`)
  }
  if (Number(alone.values.n) !== 20 || Number(alone.values.x) !== 1) {
    throw new Error(`standalone values ${JSON.stringify(alone.values)}`)
  }
  console.log('OK standalone repeated-each-day binomial', alone.values)

  console.log('All Ontario blackout regression checks passed.')
}

main()
