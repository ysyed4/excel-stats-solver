import { SOLVERS } from './types'
import { TRAINING_CASES } from './trainingCorpus'

const SOLVER_IDS = SOLVERS.map((s) => s.id)

function fewShotBlock(): string {
  return TRAINING_CASES.slice(0, 8)
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
