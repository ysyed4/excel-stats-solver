/**
 * Paint-fill CI regressions:
 * (a) σ known mean CI — x̄=995 not 2100/1000
 * (b) under-filled proportion CI — successes=78 not curated 12; AI `x`→successes
 * Run: npm run test:paint-ci
 */
import { parseProblemText } from './parseProblem'
import { solve } from './compute'
import { mergeAutofillValues, coerceValues } from './values'
import { EXAMPLES } from './examples'

const CI_Z_DEFAULTS = {
  xbar: 2100,
  sd: 240,
  n: 36,
  confidence: 0.95,
}

const CI_PROP_DEFAULTS = {
  successes: 12,
  n: 50,
  confidence: 0.95,
}

const PAINT_MEAN = `A local company uses a machine to fill containers of paint. The
machine is supposed to fill the containers to the level of 1,000 ml,
however, it may not be working properly. Suppose that it is known
that, whether it's working properly or not, the standard deviation of
its fill rate is 21 ml.
a. Suppose a sample of 49 is taken and the average is found to be
995 ml. Construct the 95% confidence interval for the population
mean.`

const PAINT_PROP = `A local company uses a machine to fill containers of paint. The
machine is supposed to fill the containers to the level of 1,000 ml,
however, it may not be working properly. Suppose that it is known
that, whether it's working properly or not, the standard deviation of
its fill rate is 21 ml.
b. Suppose a sample of 100 were taken and 78 of them were found
to be under-filled. Calculate the 95% confidence interval on the
proportion of those that were under-filled.`

function ciBounds(
  solverId: 'ci-mean-z' | 'ci-proportion',
  values: Record<string, string | number | boolean>,
) {
  const res = solve(solverId, values)
  const line = res.lines.find((l) => l.emphasis) ?? res.lines[res.lines.length - 1]
  const m = String(line.value).match(/\[([-\d.]+),\s*([-\d.]+)\]/)
  if (!m) throw new Error(`No CI brackets in ${line.value}`)
  return { lo: Number(m[1]), hi: Number(m[2]) }
}

function assertClose(name: string, got: number, want: number, tol = 0.0002) {
  if (Math.abs(got - want) > tol) {
    throw new Error(`${name}: got ${got}, want ≈ ${want}`)
  }
}

function assertPaintMean() {
  const parsed = parseProblemText(PAINT_MEAN)
  if (!parsed) throw new Error('parse returned null')
  if (parsed.solverId !== 'ci-mean-z') {
    throw new Error(`solverId=${parsed.solverId}, want ci-mean-z`)
  }
  const v = parsed.values
  if (Number(v.xbar) !== 995) {
    throw new Error(`xbar=${v.xbar}, want 995 (not 1000 target or 2100 example)`)
  }
  if (Number(v.sd) !== 21 || Number(v.n) !== 49 || Number(v.confidence) !== 0.95) {
    throw new Error(`sd/n/conf mismatch: ${JSON.stringify(v)}`)
  }

  const apartment = EXAMPLES.find((e) => e.id === 'ci-apartments')
  if (!apartment) throw new Error('missing ci-apartments example')
  const afterExample = mergeAutofillValues(
    'ci-mean-z',
    CI_Z_DEFAULTS,
    apartment.values,
  )
  if (Number(afterExample.xbar) !== 2100) {
    throw new Error(`example load failed: ${JSON.stringify(afterExample)}`)
  }

  const afterPaint = mergeAutofillValues('ci-mean-z', CI_Z_DEFAULTS, v)
  if (Number(afterPaint.xbar) !== 995) {
    throw new Error(
      `stale x̄ survived example→autofill: ${JSON.stringify(afterPaint)}`,
    )
  }

  const partialAi = mergeAutofillValues('ci-mean-z', CI_Z_DEFAULTS, {
    sd: 21,
    n: 49,
    confidence: 0.95,
  })
  if ('xbar' in partialAi) {
    throw new Error(`partial AI should omit xbar, got ${partialAi.xbar}`)
  }

  const { lo, hi } = ciBounds('ci-mean-z', afterPaint)
  assertClose('CI lower', lo, 989.1201)
  assertClose('CI upper', hi, 1000.8799)
  console.log('OK paint-mean-ci', afterPaint, '→', `[${lo}, ${hi}]`)
}

function assertPaintProp() {
  const parsed = parseProblemText(PAINT_PROP)
  if (!parsed) throw new Error('prop parse returned null')
  if (parsed.solverId !== 'ci-proportion') {
    throw new Error(`solverId=${parsed.solverId}, want ci-proportion`)
  }
  const v = parsed.values
  if (Number(v.successes) !== 78 || Number(v.n) !== 100) {
    throw new Error(`successes/n mismatch: ${JSON.stringify(v)}`)
  }
  if (Number(v.confidence) !== 0.95) {
    throw new Error(`confidence=${v.confidence}, want 0.95`)
  }

  // Curated High-priced share CI (successes=12) then paint autofill
  const highPriced = EXAMPLES.find((e) => e.id === 'ci-prop-high')
  if (!highPriced) throw new Error('missing ci-prop-high example')
  mergeAutofillValues('ci-proportion', CI_PROP_DEFAULTS, highPriced.values)

  const afterPaint = mergeAutofillValues('ci-proportion', CI_PROP_DEFAULTS, v)
  if (Number(afterPaint.successes) !== 78) {
    throw new Error(
      `stale successes=12 survived: ${JSON.stringify(afterPaint)}`,
    )
  }

  // AI often emits x=78 instead of successes=78 — must map into Successes
  const fromAiX = mergeAutofillValues('ci-proportion', CI_PROP_DEFAULTS, {
    x: 78,
    n: 100,
    confidence: 0.95,
  } as Record<string, string | number | boolean>)
  if (Number(fromAiX.successes) !== 78) {
    throw new Error(`AI x→successes failed: ${JSON.stringify(fromAiX)}`)
  }
  if ('x' in fromAiX) {
    throw new Error(`x should not remain on ci-proportion: ${JSON.stringify(fromAiX)}`)
  }

  const coerced = coerceValues({ x: 78, n: 100 }, 'ci-proportion')
  if (Number(coerced.successes) !== 78) {
    throw new Error(`coerceValues alias failed: ${JSON.stringify(coerced)}`)
  }

  const { lo, hi } = ciBounds('ci-proportion', afterPaint)
  assertClose('prop CI lower', lo, 0.6988, 0.00015)
  assertClose('prop CI upper', hi, 0.8612, 0.00015)
  console.log('OK paint-prop-ci', afterPaint, '→', `[${lo}, ${hi}]`)
}

function main() {
  assertPaintMean()
  assertPaintProp()
  console.log('All paint CI regression checks passed.')
}

main()
