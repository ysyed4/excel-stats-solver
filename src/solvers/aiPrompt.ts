import { SOLVERS } from './types'
import { TRAINING_CASES } from './trainingCorpus'

const SOLVER_IDS = SOLVERS.map((s) => s.id)

function fewShotBlock(): string {
  // Prefer cases that teach hard Poisson scaling + classic MMA discrete splits
  const preferredIds = [
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
- binomial/poisson: equal | atMost | atLeast | moreThan (moreThan = P(X>x) = 1−DIST(x,…,TRUE))
- For desk/capacity “do we have a problem?” with X > desks: query=moreThan, x=desks
- Office Space (a): binomial n=50 p=0.3 moreThan x=20; (b): poisson λ=15 moreThan x=20
- Red/Blue cars: (a) poisson λ=10 moreThan x=9; (b) binomial n=15 p=0.3 atLeast x=5

CRITICAL — Poisson rate scaling (people × hours × days):
- App fields: lambda = base rate per period, hours = interval multiplier, λ_used = lambda × hours
- If rate is per person per hour and the question is about a multi-day trip, you MUST scale to the question window.
- Example (Kodiak / Norwegian anglers): 3 anglers × 4 hours/day × 1.5 fish/hour = 18 fish/day.
  Question “more than 90 fish during their trip” over 4 days → set lambda=18 and hours=4 (λ_used=72),
  OR set lambda=72 and hours=1. Never leave hours=1 with only the daily rate when the question is trip-total.
- Example (Alaska practice): 4 men × 3 hours × 5 days × 2 fish/hour → daily λ=24, hours=5 (λ_used=120), or lambda=120 hours=1.
- Always align λ with the same time window as the probability question (per day vs per trip).

Return ONLY valid JSON (no markdown fences):
{
  "solverId": "<one of the ids>",
  "values": { ...numeric/string/boolean fields for that solver... },
  "confidence": "high" | "medium" | "low",
  "rationale": "short explanation",
  "family": "discrete" | "continuous" | "sampling",
  "parts": [ { "label": "Part A", "solverId": "...", "values": {}, "rationale": "..." } ]
}
Omit parts unless the problem clearly has distinct a/b setups.

Few-shot training from course practice:
${fewShotBlock()}
`
}
