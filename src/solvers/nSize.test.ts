/**
 * MMA 863 sample-size determination (n-mean / n-proportion).
 * Apartment: σ=240, E=$100 → n=23; E=$50 → n=89.
 * Run: npm run test:n-size
 */
import { parseProblemText } from './parseProblem'
import { solve } from './compute'
import { mergeAutofillValues } from './values'

const N_MEAN_DEFAULTS = { sd: 240, E: 100, confidence: 0.95 }

const APARTMENT = `The price of single bedroom apartments is not normal, nor is the
mean known, but it is known to have a standard deviation of $240.
a. How large a sample would you require to get an estimate within
approximately $100 of the actual figure with a 95% confidence
level?
b. How large would the sample need to be to get an estimate within
approximately $50 of the actual figure with a 95% confidence
level?`

const TORONTO_PROP = `The rental market in Toronto is huge with 10,000 units. High-priced
units are those that rent for more than $2,480/month. A previous study
suggests that 10% of apartments are high-priced.
a. How large a sample would you need to get an estimate within 0.05
of the actual value with a 95% confidence level – treat the previous
study as a pilot study.
b. How large a sample would you need to get an estimate within 0.05
of the actual value with a 95% confidence level – be conservative.`

function requiredN(solverId: 'n-mean' | 'n-proportion', values: Record<string, string | number | boolean>) {
  const res = solve(solverId, values)
  const line = res.lines.find((l) => l.emphasis)
  if (!line) throw new Error('no emphasis line')
  return Number(line.value)
}

function main() {
  const parsed = parseProblemText(APARTMENT)
  if (!parsed) throw new Error('apartment parse null')
  if (parsed.solverId !== 'n-mean') {
    throw new Error(`apartment solverId=${parsed.solverId}, want n-mean (not ci-mean-z)`)
  }

  const parts = parsed.parts
  if (!parts || parts.length < 2) {
    throw new Error(`expected parts a/b, got ${JSON.stringify(parsed)}`)
  }
  if (parts.some((p) => p.solverId !== 'n-mean')) {
    throw new Error(`non n-mean parts: ${JSON.stringify(parts)}`)
  }

  const a = parts.find((p) => /a/i.test(p.label)) ?? parts[0]
  const b = parts.find((p) => /b/i.test(p.label)) ?? parts[1]
  if (Number(a.values.sd) !== 240 || Number(a.values.E) !== 100) {
    throw new Error(`part A values ${JSON.stringify(a.values)}`)
  }
  if (Number(b.values.sd) !== 240 || Number(b.values.E) !== 50) {
    throw new Error(`part B values ${JSON.stringify(b.values)}`)
  }

  const nA = requiredN('n-mean', a.values)
  const nB = requiredN('n-mean', b.values)
  if (nA !== 23) throw new Error(`part A n=${nA}, want 23`)
  if (nB !== 89) throw new Error(`part B n=${nB}, want 89`)

  // Stale CI defaults must not leak into n-mean autofill
  const merged = mergeAutofillValues('n-mean', N_MEAN_DEFAULTS, a.values)
  if (Number(merged.E) !== 100 || Number(merged.sd) !== 240) {
    throw new Error(`merge failed ${JSON.stringify(merged)}`)
  }
  console.log('OK apartment-n-mean', { A: nA, B: nB })

  const prop = parseProblemText(TORONTO_PROP)
  if (!prop) throw new Error('toronto prop parse null')
  if (prop.solverId !== 'n-proportion' && !prop.parts?.every((p) => p.solverId === 'n-proportion')) {
    throw new Error(`toronto prop routed to ${prop.solverId}`)
  }
  const pParts = prop.parts
  if (!pParts || pParts.length < 2) {
    throw new Error(`toronto prop parts missing: ${JSON.stringify(prop)}`)
  }
  const pa = pParts[0]
  const pb = pParts[1]
  // One pilot, one conservative — order may follow letter
  const pilot = pParts.find((p) => p.values.conservative !== true) ?? pa
  const cons = pParts.find((p) => p.values.conservative === true) ?? pb
  if (Number(pilot.values.p) !== 0.1 || Number(pilot.values.E) !== 0.05) {
    throw new Error(`pilot values ${JSON.stringify(pilot.values)}`)
  }
  if (Number(cons.values.p) !== 0.5 || cons.values.conservative !== true) {
    throw new Error(`conservative values ${JSON.stringify(cons.values)}`)
  }
  const nPilot = requiredN('n-proportion', pilot.values)
  const nCons = requiredN('n-proportion', cons.values)
  // z≈1.96, E=0.05: pilot p=0.1 → n=ceil(138.3)=139; cons p=0.5 → n=ceil(384.16)=385
  if (nPilot < 130 || nPilot > 145) throw new Error(`pilot n=${nPilot}, expected ≈139`)
  if (nCons < 380 || nCons > 390) throw new Error(`conservative n=${nCons}, expected ≈385`)
  console.log('OK toronto-n-proportion', { pilot: nPilot, conservative: nCons })

  console.log('All sample-size regression checks passed.')
}

main()
