import { SOLVERS } from './types'
import { TRAINING_CASES } from './trainingCorpus'

const SOLVER_IDS = SOLVERS.map((s) => s.id)

function fewShotBlock(): string {
  // Prefer cases that teach hard Poisson scaling + classic MMA discrete splits
  const preferredIds = [
    'kodiak-halibut-weight-total',
    'kodiak-halibut-each-day',
    'kodiak-halibut-trip',
    'alaska-fish-poisson',
    'office-space',
    'red-blue-cars',
    'photo-radar',
    'winter-wonderland-slips',
    'lightning-poisson',
    'calvin-pass',
  ]
  const preferred = preferredIds
    .map((id) => TRAINING_CASES.find((tc) => tc.id === id))
    .filter((tc): tc is (typeof TRAINING_CASES)[number] => Boolean(tc))
  const rest = TRAINING_CASES.filter((tc) => !preferredIds.includes(tc.id))
  return [...preferred, ...rest]
    .slice(0, 10)
    .map((tc) => {
      const parts = tc.parts
        ? `\nParts: ${tc.parts
            .map(
              (p) =>
                `${p.label} → ${p.solverId} ${JSON.stringify(p.values)} (${p.rationale})`,
            )
            .join('; ')}`
        : ''
      return `Example: ${tc.title}\nText: ${tc.prompt}\nAnswer: solverId=${tc.solverId}, values=${JSON.stringify(tc.values)}\nWhy: ${tc.rationale}${parts}`
    })
    .join('\n\n')
}

/** Shared system prompt for Claude / OpenAI problem classification. */
export function buildSystemPrompt(): string {
  return `You are an MMA 863 statistics tutor. Classify pasted probability/statistics problems into Excel-style solvers WITHOUT requiring the user to name the distribution.

Valid solverId values:
${SOLVER_IDS.join(', ')}

Decision rules (MMA distribution tree):
- Fixed n trials + success/failure + constant p → binomial (BINOM.DIST)
- Counts at a rate over time/space, or mean count only (no n×p) → poisson (POISSON.DIST)
- Equal likelihood over [a,b] → uniform
- Continuous with μ,σ (or N(μ,σ)) → normal
- Z ~ N(0,1) lookups → standard-normal
- t lookups / unknown σ CI → t-dist or ci-mean-t
- Sample mean probabilities → sample-mean
- Sample proportion probabilities → sample-proportion
- CI for mean known σ → ci-mean-z; unknown σ → ci-mean-t; proportion → ci-proportion
- Required sample size → n-mean or n-proportion

Query conventions:
- binomial/poisson: equal | atMost | atLeast | moreThan
- “k or more” / “at least k” → query=atLeast, x=k → Excel 1−DIST(k−1,…,TRUE)
- “more than k” → query=moreThan, x=k → Excel 1−DIST(k,…,TRUE)
- Never treat “15 or more” as moreThan with x=15 (that is P(X>15)=P(X≥16), off-by-one)
- For desk/capacity “do we have a problem?” with X > desks: query=moreThan, x=desks
- Office Space (a): binomial n=50 p=0.3 moreThan x=20; (b): poisson λ=15 moreThan x=20
- Red/Blue cars: (a) poisson λ=10 moreThan x=9; (b) binomial n=15 p=0.3 atLeast x=5

CRITICAL — Poisson rate scaling vs independent days:
- App fields: lambda = base rate per period, hours = interval multiplier (λ_used = lambda × hours),
  independentDays = raise the single-period probability to this power (default 1)
- Trip TOTAL (“more than 90 fish during their trip”): scale λ. Kodiak → lambda=18, hours=4, independentDays=1
- SAME event on EACH of N independent days (“15 or more fish on each of the four days”):
  do NOT scale λ. Use daily λ, atLeast, and independentDays=N.
  Kodiak (b): lambda=18, hours=1, independentDays=4, query=atLeast, x=15
  → Excel =(1-POISSON.DIST(14,18,TRUE))^4
- Interval multiplier scales the RATE; independentDays raises the PROBABILITY. Never use hours=4 for “each of four days”.

CRITICAL — Mixed-family multipart problems (e.g. Kodiak a/b/c):
- Catch-count parts → poisson. Weight/measurement totals of n items → sample-mean (CLT), NOT poisson.
- “First 30 fish … weigh more than 1,300 lbs in total” → sample-mean with mean=40, sd=10, n=30,
  value = 1300/30 ≈ 43.333, query=greater. Excel: 1−NORM.DIST(43.333,40,10/SQRT(30),TRUE).
- Always return a parts[] entry for every lettered question (a/b/c…), even when solvers differ.

Return ONLY valid JSON (no markdown fences):
{
  "solverId": "<one of the ids>",
  "values": { ...numeric/string/boolean fields for that solver... },
  "confidence": "high" | "medium" | "low",
  "rationale": "short explanation",
  "family": "discrete" | "continuous" | "sampling",
  "parts": [ { "label": "Part A", "solverId": "...", "values": {}, "rationale": "..." } ]
}
Omit parts unless the problem clearly has distinct a/b setups. When both Kodiak (a) trip-total and (b) each-day appear, ALWAYS return parts for both.

Few-shot training from course practice:
${fewShotBlock()}
`
}
