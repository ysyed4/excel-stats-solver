/**
 * Normal invBetween Low / High / Symmetric (via Z ↔ x).
 * Run: npm run test:normal-inv
 */
import { NORM_S_INV } from '../excel/functions'
import { solve } from './compute'

function assertClose(name: string, got: number, want: number, tol = 1e-3) {
  if (Math.abs(got - want) > tol) {
    throw new Error(`${name}: got ${got}, want ≈ ${want}`)
  }
}

function main() {
  // N(10, σ=2), symmetric P(XL < X < XU) = 0.8 → z = ±NORM.S.INV(0.1)
  const z = NORM_S_INV(0.1)
  const wantLo = 10 + z * 2
  const wantHi = 10 + -z * 2
  assertClose('ref XL', wantLo, 7.4369, 1e-3)
  assertClose('ref XU', wantHi, 12.5631, 1e-3)

  const res = solve('normal', {
    mean: 10,
    sd: 2,
    query: 'invBetweenSymmetric',
    probability: 0.8,
  })
  const xl = res.lines.find((l) => /XL/.test(l.label))
  const xu = res.lines.find((l) => /XU/.test(l.label))
  if (!xl || !xu) throw new Error(`missing XL/XU: ${JSON.stringify(res.lines)}`)
  assertClose('XL', Number(xl.value), wantLo)
  assertClose('XU', Number(xu.value), wantHi)
  if (!res.note || !/infinitely many|non-symmetric/i.test(res.note)) {
    throw new Error(`expected non-uniqueness note, got: ${res.note}`)
  }
  console.log('OK [symmetric]', xl.value, xu.value)

  // Sanity: invBetweenLow with known upper = XU should recover XL
  const low = solve('normal', {
    mean: 10,
    sd: 2,
    query: 'invBetweenLow',
    upper: wantHi,
    probability: 0.8,
  })
  const xStarLo = low.lines.find((l) => /x\*/.test(l.label))
  if (!xStarLo) throw new Error(`missing invBetweenLow: ${JSON.stringify(low.lines)}`)
  assertClose('invBetweenLow → XL', Number(xStarLo.value), wantLo)
  console.log('OK [invBetweenLow]', xStarLo.value)

  const high = solve('normal', {
    mean: 10,
    sd: 2,
    query: 'invBetweenHigh',
    lower: wantLo,
    probability: 0.8,
  })
  const xStarHi = high.lines.find((l) => /x\*/.test(l.label))
  if (!xStarHi) throw new Error(`missing invBetweenHigh: ${JSON.stringify(high.lines)}`)
  assertClose('invBetweenHigh → XU', Number(xStarHi.value), wantHi)
  console.log('OK [invBetweenHigh]', xStarHi.value)

  console.log('All normal invBetween checks passed.')
}

main()
