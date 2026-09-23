import { SOLVERS } from './types'
import { TRAINING_CASES } from './trainingCorpus'

const SOLVER_IDS = SOLVERS.map((s) => s.id)

function fewShotBlock(): string {
  // Prefer cases that teach hard Poisson scaling + classic MMA discrete splits
  const preferredIds = [
    'ontario-blackout',
    'z-unknown-lower',
    'kodiak-halibut-weight-total',
    'kodiak-halibut-each-day',
    'kodiak-halibut-trip',
    'alaska-fish-poisson',
    'office-space',
    'red-blue-cars',
    'photo-radar',
    'winter-wonderland-slips',
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
  · “less than k” / “Y < k” → lower=a, upper=k (NOT empty bounds)
  · “greater than k” / “Y > k” → atLeast=k
  · “n independent draws” / “both” / “at least one of n” → drawCount=n (default 1)
  · Every parts[] entry MUST include numeric a,b and the active bounds/drawCount —
    never leave values empty while putting the answer only in rationale prose
- Continuous with μ,σ (or N(μ,σ)) → normal
  · Always put the threshold in values.x as a plain number (1100 not "1,100")
  · Blackout / demand > capacity → query=greater, x=capacity
  · Example Ontario: mean=1000, sd=60, x=1100 → 1−NORM.DIST(1100,1000,60,TRUE)
  · “How much / how many / order amount / reorder point for X% chance of enough”
    with raw μ,σ given → solverId=normal, query=inverse, probability=X% (e.g. 0.95).
    Do NOT route these to standard-normal (that only yields a z-score).
  · P(X < a or X > b) → query=outside, lower=a, upper=b
  · Find XL,XU with P(XL<X<XU)=p (symmetric) → query=invBetweenSymmetric, probability=p
  · Known upper x₂, find lower → query=invBetweenLow, upper=x₂, probability=p
  · Known lower x₁, find upper → query=invBetweenHigh, lower=x₁, probability=p
  · Never invent query=invBetween (not valid — use one of the three above)
  · Do NOT invent numeric probabilities in rationale — leave short qualitative notes;
    the app recomputes Final Answers from values.
- Z ~ N(0,1) lookups → standard-normal
  · ONLY when the problem is already in z-units or has no raw μ,σ for X
  · P(Z<z), P(Z>z), P(a<Z<b) → less | greater | between
  · P(? < Z < zHigh) = p → query=invBetweenLow, zHigh, probability=p
    Excel: =NORM.S.INV(NORM.S.DIST(zHigh,TRUE)-p)
  · P(zLow < Z < ?) = p → query=invBetweenHigh, zLow, probability=p
    Excel: =NORM.S.INV(NORM.S.DIST(zLow,TRUE)+p)
  · Find z with P(Z≤z)=p → query=inverse, probability=p
- t lookups / unknown σ CI → t-dist or ci-mean-t
- Sample mean probabilities → sample-mean
  · “within X of the mean” / “within one standard deviation (i.e. $X)” →
    query=between, lower=μ−X, upper=μ+X computed EXACTLY (2000−240=1760, not approximate)
  · Large N (e.g. 10,000 units) with n≪N/20 → useFpc=false (or omit); still fill N if stated
  · Small N with n>N/20 → useFpc=true and N set
- Sample proportion probabilities → sample-proportion
- CI for mean known σ → ci-mean-z; unknown σ → ci-mean-t; proportion → ci-proportion
  · Always set xbar from the SAMPLE average (e.g. “average is found to be 995”), never
    from a target/spec level (e.g. “supposed to fill … 1,000 ml”) and never leave xbar
    to a prior example default like 2100
  · Paint fill: xbar=995, sd=21, n=49, confidence=0.95 → CI [989.12, 1000.88]
  · Proportion CI fields: successes (NOT x), n, confidence. “78 of them under-filled”
    out of sample of 100 → successes=78, n=100, confidence=0.95
- Required sample size → n-mean or n-proportion
  · “How large a sample … within approximately $E … confidence” + known σ → n-mean
    (σ, E, confidence). Example: σ=240, E=100, 95% → n = CEILING((z*σ/E)^2) = 23;
    E=50 → n = 89. Do NOT route these to ci-mean-z (no x̄ is given).
  · Proportion sample size with pilot % → n-proportion (p from pilot, E, confidence);
    “be conservative” → conservative=true (p=0.5)

Query conventions:
- binomial/poisson queries: equal | atMost | atLeast | moreThan | percentile | outside | compare
- “k or more” / “at least k” → query=atLeast, x=k → Excel 1−DIST(k−1,…,TRUE)
- “more than k” → query=moreThan, x=k → Excel 1−DIST(k,…,TRUE)
- Never treat “15 or more” as moreThan with x=15 (that is P(X>15)=P(X≥16), off-by-one)
- For desk/capacity “do we have a problem?” with X > desks: query=moreThan, x=desks
- Office Space (a): binomial n=50 p=0.3 moreThan x=20; (b): poisson λ=15 moreThan x=20
- Red/Blue cars: (a) poisson λ=10 moreThan x=9; (b) binomial n=15 p=0.3 atLeast x=5
- P(X < a or X > b) / “outside” → query=outside, lower=a, upper=b (BOTH tails — never drop one)
- “Which is more likely / more probable, A or B?” → query=compare with
  queryA,xA and queryB,xB (both sides required). Example Gnome: P(X≥2) vs P(X=0) →
  {query:"compare", queryA:"atLeast", xA:2, queryB:"equal", xB:0}
  Example equal-equal: X=30 vs X=50 → {query:"compare", queryA:"equal", xA:30, queryB:"equal", xB:50}
- Discrete percentile: “largest x such that P(X≤x) is as close as possible but no larger than p”
  → query=percentile, probability=p (field name probability, NOT x). Example:
  Binomial n=200 p=0.2 target 0.2 → {query:"percentile", n:200, p:0.2, probability:0.2}

Query conventions — t-distribution (solverId=t-dist):
- ONLY these query values: cdf | greater | invRight | invTwo
  (never invent “inverse”, “critical”, “right”, etc.)
- query=cdf, needs {df, t} → P(T ≤ t) via T.DIST(t, df, TRUE)
- query=greater, needs {df, t} → P(T > t) via 1−T.DIST(t, df, TRUE)
- query=invRight, needs {df, alpha} → critical t* for a RIGHT-tail α
  (phrases: “alpha on right = 0.1”, “t associated with alpha on right”)
  Excel: =T.INV(1−alpha, df)
- query=invTwo, needs {df, alpha} → critical ±t* for a TWO-tailed α
  (phrases: “alpha/2 = 0.025”, “two-tail”, “t values associated with alpha/2”)
  Excel: =T.INV(1−alpha/2, df) → report ± that value
- Slide example: “Given df=30, find t associated with alpha on right = 0.1”
  → {query: "invRight", df: 30, alpha: 0.1}
  (NOT query="inverse" — that is not a valid t-dist query)

CRITICAL — Poisson rate scaling vs independent days:
- App fields: lambda = base rate per period, hours = interval multiplier (λ_used = lambda × hours),
  independentDays = raise the single-period probability to this power (default 1)
- Trip TOTAL (“more than 90 fish during their trip”): scale λ. Kodiak → lambda=18, hours=4, independentDays=1
- SAME event on EACH of N independent days (“15 or more fish on each of the four days”):
  do NOT scale λ. Use daily λ, atLeast, and independentDays=N.
  Kodiak (b): lambda=18, hours=1, independentDays=4, query=atLeast, x=15
  → Excel =(1-POISSON.DIST(14,18,TRUE))^4
- Interval multiplier scales the RATE; independentDays raises the PROBABILITY. Never use hours=4 for “each of four days”.

CRITICAL — Poisson thinning (sub-rate events):
- When the problem gives a TOTAL arrival rate and then says only a fraction of arrivals
  count as the event (“one in ten order X”, “10% of customers…”, “1 in 5 are defective”),
  lambda must be the rate of the EVENT, not the total rate:
  lambda = totalRate × qualifyingFraction, BEFORE applying hours/interval multiplier.
- Example: “8 people arrive per minute, one in ten order a sandwich” →
  base sandwich-order rate = 8 × 0.1 = 0.8/min. For a 10-minute window:
  lambda=0.8, hours=10 (λ_used = 8) — NOT lambda=8, hours=10 (λ_used=80).
- Never set lambda to the raw foot-traffic / arrival count when a qualifying fraction is stated.

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
  "rationale": "short qualitative note only — do not assert numeric probabilities",
  "family": "discrete" | "continuous" | "sampling",
  "parts": [ { "label": "Part A", "solverId": "...", "values": {}, "rationale": "qualitative only" } ]
}
Omit parts unless the problem clearly has distinct a/b setups. When both Kodiak (a) trip-total and (b) each-day appear, ALWAYS return parts for both.
Numeric fields must be JSON numbers without thousands separators (1100 not "1,100"). Always include every required field (e.g. normal greater needs mean, sd, x).

Ontario blackout example (must return 4 parts):
(a) normal mean=1000 sd=60 query=greater x=1100
(b) normal mean=1000 sd=50 query=greater x=1100
(c) normal mean=1000 sd=60 query=greater x=1200
(d) binomial n=20 p=<part a blackout prob> query=atLeast x=1

Few-shot training from course practice:
${fewShotBlock()}
`
}
