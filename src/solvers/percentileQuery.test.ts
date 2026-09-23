/**
 * Discrete percentile / inverse-CDF: largest x with P(X ≤ x) ≤ target.
 * Run: npm run test:percentile
 */
import { BINOM_DIST, POISSON_DIST } from '../excel/functions'
import { solve } from './compute'

function assertClose(name: string, got: number, want: number, tol = 1e-6) {
  if (Math.abs(got - want) > tol) {
    throw new Error(`${name}: got ${got}, want ≈ ${want}`)
  }
}

function largestXBinom(n: number, p: number, target: number): number {
  let xStar = 0
  for (let x = 0; x <= n; x++) {
    if (BINOM_DIST(x, n, p, true) <= target) xStar = x
    else break
  }
  return xStar
}

function largestXPois(lambda: number, target: number): number {
  const cap = Math.ceil(lambda + 10 * Math.sqrt(lambda))
  let xStar = 0
  for (let x = 0; x <= cap; x++) {
    if (POISSON_DIST(x, lambda, true) <= target) xStar = x
    else break
  }
  return xStar
}

function main() {
  // Binomial(n=200, p=0.2), target=0.2 → x=34
  // (BINOM.DIST(34,200,0.2,TRUE) ≤ 0.2 < BINOM.DIST(35,…))
  const wantBinom = largestXBinom(200, 0.2, 0.2)
  assertClose('ref binom x', wantBinom, 34, 0)
  const binom = solve('binomial', {
    n: 200,
    p: 0.2,
    query: 'percentile',
    probability: 0.2,
  })
  const bX = binom.lines.find((l) => /Largest x/.test(l.label))
  if (!bX) throw new Error(`missing binom x line: ${JSON.stringify(binom.lines)}`)
  assertClose('binom percentile x', Number(bX.value), wantBinom, 0)
  const bCdf = binom.lines.find((l) => l.label === `P(X ≤ ${wantBinom})`)
  if (!bCdf) throw new Error('missing binom CDF line')
  assertClose('binom P(X≤x)', Number(bCdf.value), BINOM_DIST(wantBinom, 200, 0.2, true))
  console.log('OK [binom percentile]', bX.value, 'CDF=', bCdf.value)

  // Poisson(λ=40), target=0.2 → x=34
  const wantPois = largestXPois(40, 0.2)
  assertClose('ref pois x', wantPois, 34, 0)
  const pois = solve('poisson', {
    lambda: 40,
    hours: 1,
    query: 'percentile',
    probability: 0.2,
  })
  const pX = pois.lines.find((l) => /Largest x/.test(l.label))
  if (!pX) throw new Error(`missing pois x line: ${JSON.stringify(pois.lines)}`)
  assertClose('pois percentile x', Number(pX.value), wantPois, 0)
  const pCdf = pois.lines.find((l) => l.label === `P(X ≤ ${wantPois})`)
  if (!pCdf) throw new Error('missing pois CDF line')
  assertClose('pois P(X≤x)', Number(pCdf.value), POISSON_DIST(wantPois, 40, true))
  console.log('OK [pois percentile]', pX.value, 'CDF=', pCdf.value)

  console.log('All percentile query checks passed.')
}

main()
