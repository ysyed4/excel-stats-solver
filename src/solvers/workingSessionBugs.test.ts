/**
 * Working Session bugs 1–7: autofill/routing regressions via parseProblemText.
 * Run: npm run test:working-session
 */
import { parseProblemText } from './parseProblem'
import { solve } from './compute'
import { enrichSolverValues } from './parseProblem'
import { BINOM_DIST, NORM_INV, POISSON_DIST, T_INV } from '../excel/functions'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function assertClose(name: string, got: number, want: number, tol = 1e-3) {
  if (Math.abs(got - want) > tol) {
    throw new Error(`${name}: got ${got}, want ≈ ${want}`)
  }
}

function main() {
  // BUG 1+3 — outside union (both tails)
  const outsideText =
    'X ~ Binomial(n=200, p=0.5). Find P(X < 40 or X > 180).'
  const outside = parseProblemText(outsideText)
  assert(!!outside, 'outside parse null')
  assert(outside!.solverId === 'binomial', `outside solver=${outside!.solverId}`)
  assert(
    outside!.values.query === 'outside',
    `outside query=${outside!.values.query}`,
  )
  assertClose('outside lower', Number(outside!.values.lower), 40, 0)
  assertClose('outside upper', Number(outside!.values.upper), 180, 0)
  const oRes = solve('binomial', outside!.values)
  const oLine = oRes.lines.find((l) => /or X >/.test(l.label) && l.emphasis)
  assert(!!oLine, `outside line missing: ${JSON.stringify(oRes.lines)}`)
  const wantOut =
    BINOM_DIST(39, 200, 0.5, true) + (1 - BINOM_DIST(180, 200, 0.5, true))
  assertClose('outside P', Number(oLine!.value), wantOut)
  console.log('OK [BUG1/3 outside]', oLine!.value)

  // Normal outside
  const nOutText = 'X ~ N(100, 15). Find P(X < 70 or X > 130).'
  const nOut = parseProblemText(nOutText)
  assert(!!nOut && nOut.solverId === 'normal', `normal outside: ${JSON.stringify(nOut)}`)
  assert(nOut!.values.query === 'outside', `nOut query=${nOut!.values.query}`)
  const nRes = solve('normal', nOut!.values)
  assert(
    nRes.lines.some((l) => /or X >/.test(l.label) && l.emphasis),
    JSON.stringify(nRes.lines),
  )
  console.log('OK [BUG3 normal outside]', nOut!.values)

  // Poisson outside (was missing in compute — AI detected it but engine threw)
  const poisOut = solve('poisson', {
    lambda: 40,
    hours: 1,
    query: 'outside',
    lower: 40,
    upper: 180,
  })
  const pLeft = poisOut.lines.find((l) => /P\(X < 40\)/.test(l.label))
  const pRight = poisOut.lines.find((l) => l.label === 'P(X > 180)')
  const pUnion = poisOut.lines.find((l) => /or X >/.test(l.label) && l.emphasis)
  assert(
    !!pLeft && !!pRight && !!pUnion,
    `pois outside lines: ${JSON.stringify(poisOut.lines)}`,
  )
  const wantLeft = POISSON_DIST(39, 40, true)
  const wantRight = 1 - POISSON_DIST(180, 40, true)
  assertClose('pois P(X<40)', Number(pLeft!.value), wantLeft)
  assertClose('pois P(X>180)', Number(pRight!.value), wantRight)
  assertClose('pois union', Number(pUnion!.value), wantLeft + wantRight)
  console.log(
    'OK [poisson outside]',
    pLeft!.value,
    '+',
    pRight!.value,
    '=',
    pUnion!.value,
  )

  // BUG 2 — compare / which is more likely
  const compareText =
    'X ~ Binomial(n=100, p=0.4). Which is more likely: P(X = 30) or P(X = 50)?'
  const cmp = parseProblemText(compareText)
  assert(!!cmp && cmp.solverId === 'binomial', `compare parse: ${JSON.stringify(cmp)}`)
  assert(cmp!.values.query === 'compare', `compare query=${cmp!.values.query}`)
  assertClose('xA', Number(cmp!.values.xA), 30, 0)
  assertClose('xB', Number(cmp!.values.xB), 50, 0)
  const cRes = solve('binomial', cmp!.values)
  assert(
    cRes.lines.some((l) => /Comparison|more likely/i.test(l.label + l.value)),
    JSON.stringify(cRes.lines),
  )
  console.log('OK [BUG2 compare equal]', cRes.lines.map((l) => l.value))

  const gnome =
    'Gnomes cast spells. X ~ Binomial(n=10, p=0.2). Which is more likely: P(X ≥ 2) or P(X = 0)?'
  const g = parseProblemText(gnome)
  assert(!!g && g.values.query === 'compare', `gnome: ${JSON.stringify(g)}`)
  assert(
    g!.values.queryA === 'atLeast' && Number(g!.values.xA) === 2,
    `gnome A: ${JSON.stringify(g!.values)}`,
  )
  assert(
    g!.values.queryB === 'equal' && Number(g!.values.xB) === 0,
    `gnome B: ${JSON.stringify(g!.values)}`,
  )
  console.log('OK [BUG2 gnome compare]', g!.values)

  // BUG 4 — percentile reachable from text
  const pctText =
    'X ~ Binomial(n=200, p=0.2). Find the largest integer x such that P(X ≤ x) is as close as possible but no larger than 0.2.'
  const pct = parseProblemText(pctText)
  assert(!!pct && pct.solverId === 'binomial', `pct: ${JSON.stringify(pct)}`)
  assert(pct!.values.query === 'percentile', `pct query=${pct!.values.query}`)
  assertClose('pct target', Number(pct!.values.probability), 0.2)
  const pctRes = solve('binomial', pct!.values)
  const pctX = pctRes.lines.find((l) => /Largest x/.test(l.label))
  assertClose('pct x', Number(pctX!.value), 34, 0)
  console.log('OK [BUG4 percentile]', pctX!.value)

  const poisPct =
    'X ~ Poisson(λ=40). Find largest x such that P(X ≤ x) is as close as possible but no larger than 0.2.'
  const pp = parseProblemText(poisPct)
  assert(!!pp && pp.solverId === 'poisson', `pois pct solver=${pp?.solverId}`)
  assert(pp!.values.query === 'percentile', `pois pct query=${pp!.values.query}`)
  console.log('OK [BUG4 poisson percentile]', pp!.values)

  // BUG 5 — invBetweenSymmetric from text
  const invText =
    'X ~ N(10, 2). Find XL and XU such that P(XL < X < XU) = 0.8 (symmetric about the mean).'
  const inv = parseProblemText(invText)
  assert(!!inv && inv.solverId === 'normal', `inv: ${JSON.stringify(inv)}`)
  assert(
    inv!.values.query === 'invBetweenSymmetric',
    `inv query=${inv!.values.query}`,
  )
  assertClose('inv p', Number(inv!.values.probability), 0.8)
  const invRes = solve('normal', inv!.values)
  const xl = invRes.lines.find((l) => /XL/.test(l.label))
  const xu = invRes.lines.find((l) => /XU/.test(l.label))
  assertClose('XL', Number(xl!.value), 7.437, 0.01)
  assertClose('XU', Number(xu!.value), 12.563, 0.01)
  console.log('OK [BUG5 invBetweenSymmetric]', xl!.value, xu!.value)

  // BUG 6 — uniform independent draws from text + enrich part values
  const uniText = `Y ~ Uniform(5, 15).
a. Find P(Y < 8).
b. Both independent draws less than 8.
c. At least one of 2 draws greater than 14.`
  const uni = parseProblemText(uniText)
  assert(!!uni, 'uniform parse null')
  // Multipart or single — at least one part/values must carry drawCount
  const uniParts = uni!.parts ?? [
    { id: 'u', label: 'All', solverId: 'uniform' as const, values: uni!.values, rationale: '' },
  ]
  const bothPart =
    uniParts.find((p) => /both|draw|independent/i.test(p.label + p.rationale)) ??
    uniParts.find((p) => Number(p.values.drawCount) > 1) ??
    uniParts[0]
  const enriched = enrichSolverValues(
    'uniform',
    'Uniform(5,15). Both independent draws less than 8.',
    bothPart.values,
  )
  assertClose('uni a', Number(enriched.a), 5, 0)
  assertClose('uni b', Number(enriched.b), 15, 0)
  assertClose('uni lower', Number(enriched.lower), 5, 0)
  assertClose('uni upper', Number(enriched.upper), 8, 0)
  assertClose('drawCount', Number(enriched.drawCount), 2, 0)
  const uRes = solve('uniform', enriched)
  const allLine = uRes.lines.find((l) => /All 2 draws/.test(l.label))
  assert(!!allLine, `draws line: ${JSON.stringify(uRes.lines)}`)
  assertClose('both < 8', Number(allLine!.value), 0.09)
  console.log('OK [BUG6 uniform draws]', enriched, '→', allLine!.value)

  // BUG 7 — sushi/salmon style: raw Normal inverse, not standard-normal
  const sushi =
    'Daily salmon demand is normally distributed with mean 100 kg and standard deviation 15 kg. How much salmon should they order for a 95% chance of having enough?'
  const sushiParsed = parseProblemText(sushi)
  assert(!!sushiParsed, 'sushi parse null')
  assert(
    sushiParsed!.solverId === 'normal',
    `sushi solver=${sushiParsed!.solverId} (must not be standard-normal)`,
  )
  assert(
    sushiParsed!.values.query === 'inverse',
    `sushi query=${sushiParsed!.values.query}`,
  )
  assertClose('sushi mean', Number(sushiParsed!.values.mean), 100, 0)
  assertClose('sushi sd', Number(sushiParsed!.values.sd), 15, 0)
  assertClose('sushi p', Number(sushiParsed!.values.probability), 0.95)
  const sRes = solve('normal', sushiParsed!.values)
  const sx = sRes.lines.find((l) => l.emphasis)
  assertClose('order qty', Number(sx!.value), NORM_INV(0.95, 100, 15), 0.05)
  console.log('OK [BUG7 sushi→normal inverse]', sx!.value)

  // Sanity: unknown binomial query throws (no silent atLeast)
  let threw = false
  try {
    solve('binomial', { n: 10, p: 0.5, query: 'inverse', x: 1 })
  } catch (err) {
    threw = /Unknown binomial query/.test(
      err instanceof Error ? err.message : String(err),
    )
  }
  assert(threw, 'expected Unknown binomial query for inverse')
  console.log('OK [unknown binomial query throws]')

  // Silence unused import warning for T_INV if tree-shaken differently
  void T_INV

  console.log('All working-session bug checks passed.')
}

main()
