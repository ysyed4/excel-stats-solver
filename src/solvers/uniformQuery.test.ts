/**
 * Uniform: only validate fields for the active query.
 * atLeast alone (empty between bounds) must not throw on Lower.
 * Run: npm run test:uniform
 */
import { solve } from './compute'

function assertClose(name: string, got: number, want: number, tol = 1e-6) {
  if (Math.abs(got - want) > tol) {
    throw new Error(`${name}: got ${got}, want ≈ ${want}`)
  }
}

function main() {
  // Regression: min=0, max=25, between empty, geqValue=5.97 → P(X≥5.97)≈0.7612
  const res = solve('uniform', {
    a: 0,
    b: 25,
    lower: '',
    upper: '',
    atLeast: 5.97,
  })
  const line = res.lines.find((l) => l.emphasis && /P\(X ≥/.test(l.label))
  if (!line) throw new Error(`missing P(X≥) line: ${JSON.stringify(res.lines)}`)
  assertClose('P(X ≥ 5.97)', Number(line.value), (25 - 5.97) / 25)
  console.log('OK [atLeast-only]', line.label, '=', line.value)

  // Empty between must not block when atLeast is set
  try {
    solve('uniform', { a: 0, b: 25, lower: '', upper: '', atLeast: 5.97 })
  } catch (err) {
    throw new Error(
      `atLeast-only should not throw, got: ${err instanceof Error ? err.message : err}`,
    )
  }

  // Between-only still works
  const between = solve('uniform', {
    a: 2000,
    b: 5000,
    lower: 2500,
    upper: 3000,
  })
  const bLine = between.lines.find((l) => /2500/.test(l.label))
  if (!bLine) throw new Error('between line missing')
  assertClose('between', Number(bLine.value), 500 / 3000)
  console.log('OK [between-only]', bLine.value)

  // Exact-only
  const exact = solve('uniform', { a: 2000, b: 5000, exact: 2500, lower: '', upper: '' })
  const eLine = exact.lines.find((l) => /P\(X =/.test(l.label))
  if (!eLine || eLine.value !== '0') throw new Error(`exact failed: ${JSON.stringify(exact.lines)}`)
  console.log('OK [exact-only]')

  // Nothing filled → clear error (not a false Lower error when atLeast was intended)
  try {
    solve('uniform', { a: 0, b: 25, lower: '', upper: '', atLeast: '', exact: '' })
    throw new Error('expected empty-query throw')
  } catch (err) {
    if (!(err instanceof Error) || !/between range|P\(X ≥|exact point/i.test(err.message)) {
      throw new Error(`unexpected empty error: ${err instanceof Error ? err.message : err}`)
    }
  }
  console.log('OK [empty-query message]')

  // Independent draws: Uniform(5,15), P(Y < 8) = 0.3 per draw
  // both of 2 < 8 → 0.09; P(Y > 14) = 0.1 → at least one of 2 → 1 − 0.9² = 0.19
  const both = solve('uniform', {
    a: 5,
    b: 15,
    lower: 5,
    upper: 8,
    drawCount: 2,
  })
  const bothLine = both.lines.find((l) => /All 2 draws/.test(l.label))
  if (!bothLine) throw new Error(`missing all-draws line: ${JSON.stringify(both.lines)}`)
  assertClose('both draws < 8', Number(bothLine.value), 0.09)
  console.log('OK [both draws]', bothLine.value)

  const atLeastOne = solve('uniform', {
    a: 5,
    b: 15,
    lower: '',
    upper: '',
    atLeast: 14,
    drawCount: 2,
  })
  const aloLine = atLeastOne.lines.find((l) => /At least one of 2/.test(l.label))
  if (!aloLine) {
    throw new Error(`missing at-least-one line: ${JSON.stringify(atLeastOne.lines)}`)
  }
  assertClose('at least one > 14', Number(aloLine.value), 0.19)
  console.log('OK [at least one draw]', aloLine.value)

  console.log('All uniform query-mode checks passed.')
}

main()
