/**
 * Poisson thinning: event rate = total arrival rate × qualifying fraction,
 * then scale by interval multiplier (hours).
 * Run: npm run test:poisson-thin
 */
import { parseProblemText, extractQualifyingFraction } from './parseProblem'
import { solve } from './compute'

const SANDWICH = `At a cafe, eight people arrive per minute. Of these, one in ten order
the sandwich. What is the probability that at most 8 sandwich orders
arrive in a 10-minute window?`

function assertClose(name: string, got: number, want: number, tol = 0.001) {
  if (Math.abs(got - want) > tol) {
    throw new Error(`${name}: got ${got}, want ≈ ${want}`)
  }
}

function main() {
  // Direct compute: λ₀=0.8/min × 10 min → λ=8; P(X≤8)≈0.5925
  const res = solve('poisson', {
    lambda: 0.8,
    hours: 10,
    query: 'atMost',
    x: 8,
  })
  const line = res.lines.find((l) => l.emphasis)
  if (!line) throw new Error(`no emphasis line: ${JSON.stringify(res.lines)}`)
  assertClose('P(X ≤ 8 | λ=8)', Number(line.value), 0.5925)
  console.log('OK [solve atMost]', line.label, '=', line.value)

  // Fraction extractor
  const frac = extractQualifyingFraction('one in ten order a sandwich')
  if (frac === undefined || Math.abs(frac - 0.1) > 1e-9) {
    throw new Error(`fraction=${frac}, want 0.1`)
  }
  console.log('OK [fraction one-in-ten]', frac)

  // Local parse must thin 8 × 0.1 = 0.8 (not leave λ=8)
  const parsed = parseProblemText(SANDWICH)
  if (!parsed) throw new Error('parse returned null')
  if (parsed.solverId !== 'poisson') {
    throw new Error(`solverId=${parsed.solverId}, want poisson`)
  }
  const v = parsed.values
  assertClose('parsed lambda', Number(v.lambda), 0.8, 1e-9)
  assertClose('parsed hours', Number(v.hours), 10, 1e-9)
  if (Number(v.lambda) === 8) {
    throw new Error('regression: lambda left at raw arrival rate 8 (missing thinning)')
  }
  if (v.query !== 'atMost' || Number(v.x) !== 8) {
    throw new Error(`query/x mismatch: ${JSON.stringify(v)}`)
  }

  const fromParse = solve('poisson', v)
  const pLine = fromParse.lines.find((l) => l.emphasis)
  if (!pLine) throw new Error('no emphasis from parsed solve')
  assertClose('parsed→solve P', Number(pLine.value), 0.5925)
  console.log('OK [parse sandwich]', v, '→', pLine.value)

  // Percent form
  const pctText =
    '8 people arrive per minute. 10% of customers order coffee. P(at most 8 orders in 10 minutes)?'
  const pctParsed = parseProblemText(pctText)
  if (!pctParsed || pctParsed.solverId !== 'poisson') {
    throw new Error(`pct parse failed: ${JSON.stringify(pctParsed)}`)
  }
  assertClose('pct lambda', Number(pctParsed.values.lambda), 0.8, 1e-9)
  console.log('OK [percent thinning]', pctParsed.values)

  console.log('All Poisson thinning checks passed.')
}

main()
