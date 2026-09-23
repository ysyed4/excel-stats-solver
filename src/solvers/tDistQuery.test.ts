/**
 * t-dist query modes: invRight / invTwo, and reject unknown queries.
 * Run: npm run test:t-dist
 */
import { T_INV } from '../excel/functions'
import { solve } from './compute'

function assertClose(name: string, got: number, want: number, tol = 1e-3) {
  if (Math.abs(got - want) > tol) {
    throw new Error(`${name}: got ${got}, want ≈ ${want}`)
  }
}

function main() {
  // Slide: df=30, alpha on right = 0.1 → T.INV(0.9, 30)
  const wantRight = T_INV(0.9, 30)
  const right = solve('t-dist', { df: 30, query: 'invRight', alpha: 0.1 })
  const rLine = right.lines.find((l) => l.emphasis)
  if (!rLine) throw new Error(`missing invRight line: ${JSON.stringify(right.lines)}`)
  assertClose('invRight t*', Number(rLine.value), wantRight)
  assertClose('invRight ≈ 1.3104', Number(rLine.value), 1.3104, 1e-3)
  console.log('OK [invRight]', rLine.value, '(T.INV(0.9,30)=', wantRight, ')')

  // Two-tail α=0.05 → ±T.INV(0.975, 30)
  const wantTwo = T_INV(0.975, 30)
  const two = solve('t-dist', { df: 30, query: 'invTwo', alpha: 0.05 })
  const tLine = two.lines.find((l) => l.emphasis)
  if (!tLine) throw new Error(`missing invTwo line: ${JSON.stringify(two.lines)}`)
  const parsed = String(tLine.value).replace(/^±/, '')
  assertClose('invTwo |t*|', Number(parsed), wantTwo)
  console.log('OK [invTwo]', tLine.value, '(T.INV(0.975,30)=', wantTwo, ')')

  // Regression: AI-invented query="inverse" must throw, not silently act as invTwo
  let threw = false
  try {
    solve('t-dist', { df: 30, query: 'inverse', alpha: 0.1 })
  } catch (err) {
    threw = true
    const msg = err instanceof Error ? err.message : String(err)
    if (!/Unknown t-distribution query/.test(msg) || !/inverse/.test(msg)) {
      throw new Error(`unexpected error message: ${msg}`)
    }
    console.log('OK [unknown query throws]', msg)
  }
  if (!threw) {
    throw new Error('query=inverse should throw, but solve() returned a result')
  }

  console.log('All t-dist query checks passed.')
}

main()
