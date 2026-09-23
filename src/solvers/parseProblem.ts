import type { SolverId } from './types'
import { EXAMPLES } from './examples'
import { SOLVERS } from './types'
import { TRAINING_CASES, type TrainingCase } from './trainingCorpus'
import { solve } from './compute'

export interface ParsedPart {
  id: string
  label: string
  rationale: string
  solverId: SolverId
  values: Record<string, string | number | boolean>
  fingerprints?: string[]
}

export interface ParseResult {
  solverId: SolverId
  values: Record<string, string | number | boolean>
  confidence: 'high' | 'medium' | 'low'
  summary: string
  matchedExampleId?: string
  notes: string[]
  /** When a problem asks to compare multiple setups (e.g. a vs b). */
  parts?: ParsedPart[]
  family?: 'discrete' | 'continuous' | 'sampling'
}

function pctToProb(n: number): number {
  return n > 1 ? n / 100 : n
}

function firstMatch(text: string, patterns: RegExp[]): RegExpMatchArray | null {
  for (const p of patterns) {
    const m = text.match(p)
    if (m) return m
  }
  return null
}

function num(m: RegExpMatchArray | null, group = 1): number | undefined {
  if (!m?.[group]) return undefined
  const n = Number(String(m[group]).replace(/,/g, ''))
  return Number.isFinite(n) ? n : undefined
}

function solverTitle(id: SolverId): string {
  return SOLVERS.find((s) => s.id === id)?.title ?? id
}

/** Structural cues from the MMA distribution tree — no need to name the distribution. */
function scorePoisson(text: string): number {
  const t = text.toLowerCase()
  let score = 0
  if (/\bpoisson\b/.test(t)) score += 8
  if (/once every\s+\d+/.test(t)) score += 6
  if (/every\s+\d+\s*(minute|min|hour|hr|second|day)/.test(t)) score += 5
  if (/\bper\s+(hour|minute|min|day|week)\b/.test(t)) score += 4
  if (/rate of\s+\d+/.test(t)) score += 4
  if (/arrivals?|calls?|requests?|occurrences?|drives by|come by|arrive/.test(t))
    score += 2
  if (/watch for\s+\d+|in\s+\d+\s*(minutes?|hours?|days?)/.test(t)) score += 3
  if (/more than\s+\d+\s+\w+/.test(t) && /minute|hour|day|watch/.test(t)) score += 2
  // Mean count given directly (no success %) → Poisson-style arrivals
  if (/on average[, ]+\s*\d+/.test(t) || /average of\s+\d+/.test(t)) score += 6
  if (/on average/.test(t) && !/\d+(?:\.\d+)?\s*%/.test(t)) score += 3
  if (
    /\b(in|over|during)\s+\d+\s*(minutes?|hours?|days?)\b/.test(t) &&
    !/\bnext\s+\d+\b/.test(t)
  ) {
    score += 3
  }
  // Capacity / hoteling with a mean demand
  if (/desks?|capacity|hoteling/.test(t) && /on average|average of/.test(t)) score += 4
  return score
}

function scoreBinomial(text: string): number {
  const t = text.toLowerCase()
  let score = 0
  if (/\bbinomial\b/.test(t)) score += 8
  if (/true-?false|flip-a-coin|multiple choice/.test(t)) score += 5
  if (/\bnext\s+\d+\b/.test(t)) score += 5
  if (/\bof the next\s+\d+\b/.test(t)) score += 6
  if (/(\d+)\s*(questions?|trials?|cars?|people|customers|items|employees)/.test(t))
    score += 2
  if (/\d+(?:\.\d+)?\s*%/.test(t) && /\b(of|will be|are|want)\b/.test(t)) score += 3
  if (/success|failure|correct|defective|blue|pass/.test(t)) score += 1
  if (/five or more|at least\s+\d+|or more will be/.test(t)) score += 2
  if (/\bnext\s+\d+\b/.test(t) && /\d+\s*%/.test(t)) score += 4
  // "at least one blackout over 20 independent / repeated days"
  if (
    /at least one|at least 1\b/.test(t) &&
    /independent|repeated|each day|for\s+\d+\s+days/.test(t)
  ) {
    score += 10
  }
  if (/repeated over\s+\d+\s+(?:independent\s+)?days/.test(t)) score += 5
  if (/repeated\s+each day\s+for\s+\d+/.test(t)) score += 8
  if (/for\s+\d+\s+days/.test(t) && /at least one|blackout/.test(t)) score += 6
  if (/\d+\s+independent\s+days/.test(t) && /blackout|at least/.test(t)) score += 5
  // Fixed population + success % (office / hoteling style)
  if (/\b\d+\s+employees?\b/.test(t) && /\d+(?:\.\d+)?\s*%/.test(t)) score += 7
  if (/want to work|shows? up|each day/.test(t) && /\d+\s*%/.test(t)) score += 3
  if (/desks?|hoteling|capacity/.test(t) && /\d+\s*%/.test(t)) score += 4
  // Mean-only demand (no %) should not look binomial
  if (/on average/.test(t) && !/\d+(?:\.\d+)?\s*%/.test(t)) score -= 5
  return score
}

function scoreNormal(text: string): number {
  const t = text.toLowerCase()
  let score = 0
  if (/\bnormally distributed\b|\bnormal distribution\b/.test(t)) score += 8
  if (/\bn\s*\(\s*[-+]?\d/.test(t)) score += 6
  if (/expected value of|mean of/.test(t) && /standard deviation/.test(t)) score += 4
  if (/μ\s*=|σ\s*=/.test(t)) score += 3
  if (/kg|weight|height|demand|sales/.test(t) && /standard deviation/.test(t))
    score += 2
  // Explicitly non-normal population → prefer CLT / sample-mean, not X~Normal
  if (/\bnot normal\b|\bnon-?normal\b|\bisn't normal\b/.test(t)) score -= 6
  return score
}

function scoreUniform(text: string): number {
  const t = text.toLowerCase()
  let score = 0
  if (/\buniform(ly)?\b/.test(t)) score += 8
  if (/minimum of\s+[\d,]+/.test(t) && /maximum of\s+[\d,]+/.test(t)) score += 6
  if (/equally likely/.test(t)) score += 3
  return score
}

function scoreStandardNormal(text: string): number {
  const t = text.toLowerCase()
  let score = 0
  if (/standard normal/.test(t)) score += 8
  if (/z\s*~\s*n\s*\(\s*0/.test(t) || /norm\.s\.(dist|inv)/.test(t)) score += 8
  // Any P(…Z…) style lookup, including unknowns like P(? < Z < 1)
  if (/p\s*\([^)]*\bz\b/.test(t)) score += 7
  if (/\?\s*<\s*z|z\s*<\s*\?|<\s*z\s*</.test(t)) score += 4
  if (/find\s+z|critical\s+z|z\s*\*/.test(t)) score += 3
  return score
}

function scoreSampleMean(text: string): number {
  const t = text.toLowerCase()
  let score = 0
  if (/sample mean|x-?bar|x̄/.test(t)) score += 6
  // Part (b) language: “your sample will have a mean…” without restating μ,σ,n
  if (/your sample|sample will have a mean|sample(?:'s)? mean/.test(t)) score += 6
  if (/random sample of\s+\d+/.test(t) && /mean/.test(t) && !/confidence/.test(t))
    score += 5
  if (/finite population|units/.test(t) && /sample of/.test(t)) score += 2
  if (/\bonly\s+\d+\s+units\b/.test(t) && /sample/.test(t)) score += 3
  // P(|x̄ − μ| < X) / “within … of the mean” (not sample-size “within $E at 95%”)
  if (
    /within/.test(t) &&
    /(?:actual\s+)?mean|standard deviation/.test(t) &&
    !/how large|sample size|accuracy|confidence/.test(t)
  ) {
    score += 7
  }
  // Total of n i.i.d. measurements → CLT on the sample mean (or sum)
  if (/first\s+\d+\s+(fish|items|observations|customers|units)/.test(t)) score += 5
  if (/in total.*weigh|weigh more than|total weight|weigh(?:ing)?\s+more than/.test(t))
    score += 6
  if (
    /average.+(?:weigh|weight|lbs)|weighing\s+\d+/.test(t) &&
    /standard deviation/.test(t)
  ) {
    score += 4
  }
  if (/\bnot normal\b|\bnon-?normal\b/.test(t) && /sample/.test(t)) score += 3
  return score
}

function scoreSampleProportion(text: string): number {
  const t = text.toLowerCase()
  let score = 0
  if (/sample proportion|p̂|phat/.test(t)) score += 6
  if (/sample of\s+\d+/.test(t) && /%\s*of/.test(t) && /how likely|probability/.test(t))
    score += 4
  return score
}

function scoreCi(text: string): SolverId | null {
  const t = text.toLowerCase()
  // Sample-size planning uses “95% confidence” too — never treat those as CIs
  if (
    /how large|sample size|required n|sample would (?:you |i )?need|sample need to be|within approximately/i.test(
      t,
    )
  ) {
    return null
  }
  if (
    !/confidence interval|construct (?:a |an |the )?\d+\s*%\s*confidence|%\s*c\.?i|construct .{0,40}interval/.test(
      t,
    )
  ) {
    return null
  }
  if (/proportion|successes|out of|of which|under-?filled|high-priced/.test(t)) {
    return 'ci-proportion'
  }
  if (/sample standard deviation|\bs\s*=|unknown σ|t-?distribution|t\.inv/.test(t)) {
    return 'ci-mean-t'
  }
  return 'ci-mean-z'
}

function scoreSampleSize(text: string): SolverId | null {
  const t = text.toLowerCase()
  if (
    !/sample size|how large (a |the )?sample|required n|how large would the sample|sample would (?:you |i )?(?:require|need)|estimate within approximately|within approximately\s*\$/.test(
      t,
    )
  ) {
    return null
  }
  // Proportion sample-size: pilot % / high-priced / “be conservative”
  if (
    /proportion|p̂|high-priced|pilot|conservative|within\s+0\.\d+|within\s+\d+(?:\.\d+)?\s*%/.test(
      t,
    ) && !/standard deviation|σ\s*=/.test(t)
  ) {
    return 'n-proportion'
  }
  if (/standard deviation|σ\s*=|σ of/.test(t) || /within approximately\s*\$/.test(t)) {
    return 'n-mean'
  }
  if (/proportion|p̂|percent|high-priced|pilot|conservative/.test(t)) return 'n-proportion'
  return 'n-mean'
}

function detectSolver(text: string): { solverId: SolverId; score: number; family: ParseResult['family'] } | null {
  // Sample-size questions mention “95% confidence” — check before CI routing
  const nReq = scoreSampleSize(text)
  if (nReq) return { solverId: nReq, score: 12, family: 'sampling' }

  const ci = scoreCi(text)
  if (ci) return { solverId: ci, score: 10, family: 'sampling' }

  const scores: { id: SolverId; score: number; family: ParseResult['family'] }[] = [
    { id: 'poisson', score: scorePoisson(text), family: 'discrete' },
    { id: 'binomial', score: scoreBinomial(text), family: 'discrete' },
    { id: 'normal', score: scoreNormal(text), family: 'continuous' },
    { id: 'uniform', score: scoreUniform(text), family: 'continuous' },
    { id: 'standard-normal', score: scoreStandardNormal(text), family: 'continuous' },
    { id: 'sample-mean', score: scoreSampleMean(text), family: 'sampling' },
    { id: 'sample-proportion', score: scoreSampleProportion(text), family: 'sampling' },
  ]

  scores.sort((a, b) => b.score - a.score)
  const best = scores[0]
  if (!best || best.score < 3) return null
  return { solverId: best.id, score: best.score, family: best.family }
}

function parseBinomial(text: string): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {
    query: 'atLeast',
    n: 20,
    p: 0.5,
    x: 10,
  }

  const n =
    num(
      firstMatch(text, [
        /of the next\s+(\d+)/i,
        /next\s+(\d+)\s+(?:cars?|people|customers|items|units|trials?)/i,
        /repeated over\s+(\d+)\s+(?:independent\s+)?days/i,
        /repeated\s+each day\s+for\s+(\d+)/i,
        /each day for\s+(\d+)\s+days/i,
        /for\s+(\d+)\s+days/i,
        /over\s+(\d+)\s+independent\s+days/i,
        /(\d+)\s+independent\s+days/i,
        /(\d+)\s*employees?/i,
        /(\d+)\s*[- ]?question/i,
        /(\d+)\s*trials?/i,
        /\bn\s*=\s*(\d+)/i,
        /(\d+)\s*true-?false/i,
        /(\d+)\s+cars?\b/i,
      ]),
    ) ?? undefined
  if (n !== undefined) values.n = n

  // P(at least one …) over n independent trials → Binomial, x=1
  if (/at least one|at least 1\b/i.test(text)) {
    values.query = 'atLeast'
    values.x = 1
  }

  const fridayPct = num(
    text.match(/friday[^.]*?(\d+(?:\.\d+)?)\s*%/i) ||
      text.match(/except friday[^.]*?(\d+(?:\.\d+)?)\s*%/i),
  )
  const pctMatches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]))
  const pRaw =
    num(
      firstMatch(text, [
        /only\s+(\d+(?:\.\d+)?)\s*%/i,
        /(\d+(?:\.\d+)?)\s*%\s*want/i,
        /(\d+(?:\.\d+)?)\s*%\s*of (?:cars|people|customers|them|the|employees)/i,
        /about\s+(\d+(?:\.\d+)?)\s*%/i,
        /(\d+(?:\.\d+)?)\s*%\s*of the time/i,
        /probability[^.]*?(\d+(?:\.\d+)?)\s*%/i,
        /\bp\s*=\s*(\d+(?:\.\d+)?)/i,
        /(\d+(?:\.\d+)?)\s*%\s*chance/i,
        /right\s+(\d+(?:\.\d+)?)\s*%/i,
      ]),
    ) ??
    (pctMatches.length
      ? pctMatches.find((p) => fridayPct === undefined || p !== fridayPct) ?? pctMatches[0]
      : undefined)
  if (pRaw !== undefined) values.p = pctToProb(pRaw)

  // "five or more" / "5 or more will be blue"
  const wordNums: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  }

  const wordAtLeast = text.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+or more\b/i,
  )
  if (wordAtLeast) {
    values.query = 'atLeast'
    values.x = wordNums[wordAtLeast[1].toLowerCase()]
  }

  if (/exactly\s+(\d+)/i.test(text) && /or more|at least|pass/i.test(text)) {
    values.query = 'atLeast'
    const atLeast = num(
      firstMatch(text, [
        /(\d+)\s+or more/i,
        /at least\s+(\d+)/i,
        /pass[^.]*?(\d+)\s+or more/i,
        /≥\s*(\d+)/i,
      ]),
    )
    if (atLeast !== undefined) values.x = atLeast
    const exact = num(text.match(/exactly\s+(\d+)/i))
    if (exact !== undefined) values.x2 = exact
  } else if (/exactly\s+(\d+)/i.test(text)) {
    values.query = 'equal'
    const exact = num(text.match(/exactly\s+(\d+)/i))
    if (exact !== undefined) values.x = exact
  } else if (/at most|no more than|≤/i.test(text)) {
    values.query = 'atMost'
    const x = num(
      firstMatch(text, [/at most\s+(\d+)/i, /no more than\s+(\d+)/i, /X\s*≤\s*(\d+)/i]),
    )
    if (x !== undefined) values.x = x
  } else {
    const atLeast = num(
      firstMatch(text, [
        /(\d+)\s+or more/i,
        /at least\s+(\d+)/i,
        /≥\s*(\d+)/i,
        /X\s*≥\s*(\d+)/i,
      ]),
    )
    if (atLeast !== undefined) {
      values.query = 'atLeast'
      values.x = atLeast
    }
  }

  // Capacity / “do we have a problem?” → P(X > desks) = 1 − BINOM.DIST(desks,…)
  const desks = num(firstMatch(text, [/(\d+)\s*desks?/i, /capacity of\s+(\d+)/i]))
  if (
    desks !== undefined &&
    /do we have a problem|enough (desks|space)|shortage|overflow|hoteling/i.test(text)
  ) {
    values.query = 'moreThan'
    values.x = desks
  }

  return values
}

const POISSON_WORD_NUM: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  hundred: 100,
}

function parseWordOrNumber(token: string): number | undefined {
  const t = token.trim().toLowerCase()
  if (POISSON_WORD_NUM[t] !== undefined) return POISSON_WORD_NUM[t]
  const n = Number(t.replace(/,/g, ''))
  return Number.isFinite(n) ? n : undefined
}

/**
 * Qualifying fraction for Poisson thinning: only a subset of arrivals are the event.
 * “one in ten”, “1 in 10”, “10% of customers”, “2 out of 5”.
 */
export function extractQualifyingFraction(text: string): number | undefined {
  const inPhrase = text.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+in\s+(a\s+)?(ten|twenty|hundred|one|two|three|four|five|six|seven|eight|nine|eleven|twelve|\d+)\b/i,
  )
  if (inPhrase) {
    const numera = parseWordOrNumber(inPhrase[1])
    const den = parseWordOrNumber(inPhrase[3])
    if (numera !== undefined && den !== undefined && den > 0) return numera / den
  }

  const pct = num(
    firstMatch(text, [
      /(\d+(?:\.\d+)?)\s*%\s+of\s+(?:the\s+)?(?:customers?|arrivals?|people|shoppers?|orders?|items?|units?|visitors?)/i,
      /(\d+(?:\.\d+)?)\s*%\s+(?:order|are|choose|buy|request)/i,
    ]),
  )
  if (pct !== undefined) return pctToProb(pct)

  const outOf = text.match(
    /\b(\d+)\s+out\s+of\s+(?:every\s+)?(\d+)\b/i,
  )
  if (outOf) {
    const a = Number(outOf[1])
    const b = Number(outOf[2])
    if (b > 0 && a <= b) return a / b
  }

  return undefined
}

/** Total arrival / foot-traffic rate with time unit (before thinning). */
function extractArrivalRate(
  text: string,
): { rate: number; unit: 'minute' | 'hour' } | undefined {
  const digit = text.match(
    /(\d+(?:\.\d+)?)\s+(?:people|customers|arrivals?|shoppers?|visitors?|cars?)\s+arrive\s+per\s+(minutes?|mins?|hours?|hrs?)/i,
  )
  if (digit) {
    const rate = Number(digit[1])
    const u = digit[2].toLowerCase()
    const unit: 'minute' | 'hour' =
      u.startsWith('min') ? 'minute' : 'hour'
    if (Number.isFinite(rate)) return { rate, unit }
  }

  const word = text.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\s+(?:people|customers|arrivals?|shoppers?|visitors?)\s+arrive\s+per\s+(minutes?|mins?|hours?|hrs?)/i,
  )
  if (word) {
    const rate = parseWordOrNumber(word[1])
    const u = word[2].toLowerCase()
    const unit: 'minute' | 'hour' =
      u.startsWith('min') ? 'minute' : 'hour'
    if (rate !== undefined) return { rate, unit }
  }

  const bare = text.match(
    /(\d+(?:\.\d+)?)\s+arrive\s+per\s+(minutes?|mins?|hours?|hrs?)/i,
  )
  if (bare) {
    const rate = Number(bare[1])
    const u = bare[2].toLowerCase()
    const unit: 'minute' | 'hour' =
      u.startsWith('min') ? 'minute' : 'hour'
    if (Number.isFinite(rate)) return { rate, unit }
  }

  return undefined
}

/** Window length in the same unit as the arrival rate → hours multiplier. */
function extractIntervalMultiplier(
  text: string,
  unit: 'minute' | 'hour',
): number | undefined {
  if (unit === 'minute') {
    const m = num(
      firstMatch(text, [
        /(\d+(?:\.\d+)?)\s*[- ]?minutes?/i,
        /in\s+(?:a\s+)?(\d+(?:\.\d+)?)\s*[- ]?min/i,
        /over\s+(\d+(?:\.\d+)?)\s*minutes?/i,
        /during\s+(\d+(?:\.\d+)?)\s*minutes?/i,
        /for\s+(\d+(?:\.\d+)?)\s*minutes?/i,
      ]),
    )
    return m
  }
  const h = num(
    firstMatch(text, [
      /(\d+(?:\.\d+)?)\s*[- ]?hours?/i,
      /in\s+(?:a\s+)?(\d+(?:\.\d+)?)\s*[- ]?hour/i,
      /over\s+(\d+(?:\.\d+)?)\s*hours?/i,
      /during\s+(\d+(?:\.\d+)?)\s*hours?/i,
    ]),
  )
  return h
}

function parsePoisson(text: string): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {
    lambda: 1.5,
    hours: 1,
    independentDays: 1,
    query: 'equal',
    x: 0,
  }

  // Arrival rate × qualifying fraction (Poisson thinning) before interval scaling
  const arrival = extractArrivalRate(text)
  const fraction = extractQualifyingFraction(text)
  let independentEach = false

  if (arrival) {
    values.lambda = arrival.rate * (fraction ?? 1)
    const window = extractIntervalMultiplier(text, arrival.unit)
    if (window !== undefined) values.hours = window
  } else {
    // Fishing / multi-agent rate problems:
    // λ_day = people × hours_per_day × rate_per_person_per_hour
    // For a multi-day "trip" question, scale by days via the interval multiplier.
    const ratePerHour = num(
      firstMatch(text, [
        /(\d+(?:\.\d+)?)\s*fish per hour/i,
        /catches? about\s+(\d+(?:\.\d+)?)\s*(?:fish\s+)?per hour/i,
        /about\s+(\d+(?:\.\d+)?)\s*fish per hour/i,
      ]),
    )
    const people = num(
      firstMatch(text, [
        /(\d+)\s+(?:norwegian\s+)?(?:anglers?|men|women|people|fishermen|fishers)/i,
        /(?:anglers?|men|people)\s*[:(]?\s*(\d+)/i,
      ]),
    )
    const peopleWord = /\bthree\s+(?:norwegian\s+)?(?:anglers?|men)/i.test(text)
      ? 3
      : /\bfour\s+(?:norwegian\s+)?(?:anglers?|men)/i.test(text)
        ? 4
        : /\bfive\s+(?:norwegian\s+)?(?:anglers?|men)/i.test(text)
          ? 5
          : /\btwo\s+(?:norwegian\s+)?(?:anglers?|men)/i.test(text)
            ? 2
            : undefined
    const nPeopleResolved = people ?? peopleWord

    const hoursPerDay = num(
      firstMatch(text, [
        /(\d+(?:\.\d+)?)\s*[- ]?hour(?:s)?\s+(?:fishing\s+)?(?:charter|tour|trip)/i,
        /(?:charter|tour|trip)\s+for\s+each[^.]{0,60}?(\d+(?:\.\d+)?)\s*[- ]?hour/i,
        /(\d+(?:\.\d+)?)\s*[- ]?hour(?:s)?\s+fishing/i,
        /booked a\s+(\d+(?:\.\d+)?)\s*[- ]?hour/i,
      ]),
    )
    const hoursWord = /four-hour|\b4-hour\b/i.test(text)
      ? 4
      : /three-hour|\b3-hour\b/i.test(text)
        ? 3
        : /two-hour|\b2-hour\b/i.test(text)
          ? 2
          : undefined
    const hrs = hoursPerDay ?? hoursWord

    const days = num(
      firstMatch(text, [
        /(\d+)\s+days?\s+they/i,
        /each of the\s+(\d+)\s+days/i,
        /for\s+(?:each of\s+)?(?:the\s+)?(\d+)\s+days/i,
        /(\d+)\s*[- ]?day\s+(?:trip|visit|charter)/i,
        /planning to be there[^.]*?(\d+)\s+days/i,
      ]),
    )
    const daysWord = /\bfour days\b|\b4 days\b/i.test(text)
      ? 4
      : /\bfive days\b|\b5 days\b/i.test(text)
        ? 5
        : /\bthree days\b|\b3 days\b/i.test(text)
          ? 3
          : undefined
    const dayCount = days ?? daysWord

    const tripQuestion =
      /during their trip|over the (?:whole |entire )?trip|in total.*trip|catch more than\s+\d+\s+fish during/i.test(
        text,
      )

    // “15 or more fish on each of the four days” → raise daily P to the 4th power (do NOT scale λ)
    const eachDaysWord = /\bon each of (?:the )?(four|five|three|two)\s+days\b/i.exec(text)
    const eachDaysNum = /\bon each of (?:the )?(\d+)\s+days\b/i.exec(text)
    const eachDaysFromPhrase = eachDaysWord
      ? ({ four: 4, five: 5, three: 3, two: 2 } as Record<string, number>)[
          eachDaysWord[1].toLowerCase()
        ]
      : eachDaysNum
        ? Number(eachDaysNum[1])
        : undefined
    const orMoreOnEach = /(\d+)\s+or more\s+fish\s+on each/i.test(text)
    const atLeastOnEach = /at least\s+(\d+)\s+fish\s+on each/i.test(text)
    independentEach =
      (orMoreOnEach || atLeastOnEach) &&
      eachDaysFromPhrase !== undefined &&
      eachDaysFromPhrase > 1

    if (ratePerHour !== undefined && (nPeopleResolved !== undefined || hrs !== undefined)) {
      const nPeople = nPeopleResolved ?? 1
      const nHours = hrs ?? 1
      const dailyLambda = nPeople * nHours * ratePerHour
      values.lambda = dailyLambda
      if (independentEach) {
        // Per-day λ; days are independent repeats of the same event
        values.hours = 1
        values.independentDays = eachDaysFromPhrase!
      } else if (tripQuestion && dayCount !== undefined && dayCount > 1) {
        values.hours = dayCount
        values.independentDays = 1
      } else if (dayCount !== undefined && dayCount > 1 && /more than\s+\d+\s+fish/i.test(text)) {
        // "more than N fish" with multi-day setup usually means the whole visit
        values.hours = dayCount
        values.independentDays = 1
      } else {
        values.hours = 1
        values.independentDays = 1
      }
    } else if (
      // "once every 2 minutes" → rate = 1/2 per minute
      (() => {
        const every = text.match(
          /(?:once\s+)?every\s+(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|seconds?|days?)/i,
        )
        const window = text.match(
          /(?:watch for|in|over|during)\s+(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|seconds?|days?)/i,
        )
        if (!every || !window) return false
        const interval = Number(every[1])
        const duration = Number(window[1])
        const unitEvery = every[2].toLowerCase()
        const unitWindow = window[2].toLowerCase()
        const sameFamily =
          (unitEvery.startsWith('min') && unitWindow.startsWith('min')) ||
          ((unitEvery.startsWith('hour') || unitEvery.startsWith('hr')) &&
            (unitWindow.startsWith('hour') || unitWindow.startsWith('hr'))) ||
          (unitEvery.startsWith('sec') && unitWindow.startsWith('sec')) ||
          (unitEvery.startsWith('day') && unitWindow.startsWith('day'))
        if (sameFamily && interval > 0) {
          values.lambda = duration / interval
          values.hours = 1
          return true
        }
        return false
      })()
    ) {
      // handled above
    } else {
      const fridayMean = num(
        text.match(/friday[^.]*?(?:average[, ]*|on average[, ]*)(\d+(?:\.\d+)?)/i) ||
          text.match(/except friday when\s+(\d+(?:\.\d+)?)/i),
      )
      const mean = num(
        firstMatch(text, [
          /on average[, ]+(\d+(?:\.\d+)?)/i,
          /average of\s+(\d+(?:\.\d+)?)/i,
          /mean of\s+(\d+(?:\.\d+)?)/i,
          /λ\s*=\s*(\d+(?:\.\d+)?)/i,
          /poisson[^(]*\(?\s*(\d+(?:\.\d+)?)/i,
          /(\d+(?:\.\d+)?)\s*per hour/i,
          /about\s+(\d+(?:\.\d+)?)\s*per/i,
        ]),
      )
      if (mean !== undefined && (fridayMean === undefined || mean !== fridayMean)) {
        values.lambda = mean
      } else if (mean !== undefined) {
        values.lambda = mean
      } else if (fridayMean !== undefined) {
        values.lambda = fridayMean
      }

      // Thin a generic per-interval rate when a qualifying fraction is stated
      if (fraction !== undefined && typeof values.lambda === 'number') {
        values.lambda = values.lambda * fraction
      }

      const hours = num(
        firstMatch(text, [
          /(\d+(?:\.\d+)?)\s*[- ]?hours?/i,
          /in a\s+(\d+(?:\.\d+)?)\s*hour/i,
          /over\s+(\d+(?:\.\d+)?)\s*hours?/i,
          /watch for\s+(\d+(?:\.\d+)?)/i,
        ]),
      )
      if (hours !== undefined && !/desks?|employees?|fish per hour|anglers?/i.test(text)) {
        values.hours = hours
      }
    }
  }

  const desks = num(firstMatch(text, [/(\d+)\s*desks?/i, /capacity of\s+(\d+)/i]))

  if (
    /no (problems|calls|events|cars)|X\s*=\s*0|\bnone\b/i.test(text) &&
    !/more than|do we have a problem|or more|at least/i.test(text)
  ) {
    values.query = 'equal'
    values.x = 0
  } else if (
    desks !== undefined &&
    /do we have a problem|enough|shortage|overflow|hoteling/i.test(text)
  ) {
    values.query = 'moreThan'
    values.x = desks
  } else if (independentEach) {
    values.query = 'atLeast'
    const x = num(
      firstMatch(text, [/(\d+)\s+or more/i, /at least\s+(\d+)/i]),
    )
    if (x !== undefined) values.x = x
  } else if (/(\d+)\s+or more|at least\s+(\d+)/i.test(text) && !/more than\s+\d+/i.test(text)) {
    values.query = 'atLeast'
    const x = num(
      firstMatch(text, [/(\d+)\s+or more/i, /at least\s+(\d+)/i]),
    )
    if (x !== undefined) values.x = x
  } else if (/more than\s+(\d+)/i.test(text)) {
    values.query = 'moreThan'
    const x = num(text.match(/more than\s+(\d+)/i))
    if (x !== undefined) values.x = x
  } else if (/at most|≤/i.test(text)) {
    values.query = 'atMost'
    const x = num(firstMatch(text, [/at most\s+(\d+)/i, /X\s*≤\s*(\d+)/i]))
    if (x !== undefined) values.x = x
  }

  return values
}

function parseUniform(text: string): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {
    a: 2000,
    b: 5000,
    lower: 2500,
    upper: 3000,
  }

  const min = num(
    firstMatch(text, [
      /minimum of\s+([\d,]+)/i,
      /min(?:imum)?\s*=\s*([\d,]+)/i,
      /uniform\s*\(\s*([\d,]+)\s*,/i,
      /a\s*=\s*([\d,]+)/i,
    ]),
  )
  const max = num(
    firstMatch(text, [
      /maximum of\s+([\d,]+)/i,
      /max(?:imum)?\s*=\s*([\d,]+)/i,
      /uniform\s*\(\s*[\d,]+\s*,\s*([\d,]+)/i,
      /b\s*=\s*([\d,]+)/i,
    ]),
  )
  if (min !== undefined) values.a = min
  if (max !== undefined) values.b = max

  const between = text.match(
    /between\s+([\d,]+)\s+and\s+([\d,]+)|([\d,]+)\s*[–-]\s*([\d,]+)/i,
  )
  if (between) {
    const lo = Number((between[1] || between[3] || '').replace(/,/g, ''))
    const hi = Number((between[2] || between[4] || '').replace(/,/g, ''))
    if (Number.isFinite(lo) && Number.isFinite(hi)) {
      values.lower = Math.min(lo, hi)
      values.upper = Math.max(lo, hi)
    }
  }

  const atLeast = num(
    firstMatch(text, [
      /at least\s+([\d,]+)/i,
      /≥\s*([\d,]+)/i,
      /sell at least\s+([\d,]+)/i,
    ]),
  )
  if (atLeast !== undefined) values.atLeast = atLeast

  const exact = num(
    firstMatch(text, [/exactly\s+([\d,]+)/i, /P\([^)]*=\s*([\d,]+)/i]),
  )
  if (exact !== undefined) values.exact = exact

  return values
}

function parseNormal(text: string): Record<string, string | number | boolean> {
  // Never emit lake-trout stubs (μ=15, σ=3, x=16). Only set fields found in text;
  // multipart inheritance / mergeAutofillValues supply the rest.
  const values: Record<string, string | number | boolean> = {
    query: 'greater',
  }

  const mean = num(
    firstMatch(text, [
      /expected value of\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /mean of\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /μ\s*=\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /N\s*\(\s*([-+]?[\d,]+(?:\.\d+)?)\s*,/i,
      /~\s*N\s*\(\s*([-+]?[\d,]+(?:\.\d+)?)\s*,/i,
      /mean\s+\$?\s*([\d,]+(?:\.\d+)?)/i,
    ]),
  )
  // Prefer part-local σ overrides ("falls to 50") over the shared setup σ
  const sdOverride = num(
    firstMatch(text, [
      /(?:falls?|drops?|decreases?|reduced)\s+to\s+([\d,]+(?:\.\d+)?)/i,
      /σ\s+falls\s+to\s+([\d,]+(?:\.\d+)?)/i,
      /standard deviation\s+falls\s+to\s+([\d,]+(?:\.\d+)?)/i,
    ]),
  )
  const sd = num(
    firstMatch(text, [
      /standard deviation of\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /standard deviation\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /σ\s*(?:stays\s+)?(?:at\s+)?([\d,]+(?:\.\d+)?)/i,
      /σ\s*=\s*([\d,]+(?:\.\d+)?)/i,
      /N\s*\(\s*[-+]?[\d,]+(?:\.\d+)?\s*,\s*([\d,]+(?:\.\d+)?)/i,
      /~\s*N\s*\(\s*[-+]?[\d,]+(?:\.\d+)?\s*,\s*([\d,]+(?:\.\d+)?)/i,
      /sd\s*=\s*([\d,]+(?:\.\d+)?)/i,
    ]),
  )
  if (mean !== undefined) values.mean = mean
  if (sdOverride !== undefined) values.sd = sdOverride
  else if (sd !== undefined) values.sd = sd

  // “Within X of the mean” → μ ± X (derived; do not mis-parse nearby numbers)
  const withWithin = applyWithinOfMeanBounds(text, values)
  if (withWithin.query === 'between') {
    return withWithin
  }

  const between = text.match(
    /between\s+\$?\s*([-+]?[\d,]+(?:\.\d+)?)\s+(?:kg\s+)?and\s+\$?\s*([-+]?[\d,]+(?:\.\d+)?)|([-+]?[\d,]+(?:\.\d+)?)\s*<\s*[Xx]\s*<\s*([-+]?[\d,]+(?:\.\d+)?)/i,
  )
  if (between) {
    values.query = 'between'
    const lo = Number((between[1] || between[3] || '').replace(/,/g, ''))
    const hi = Number((between[2] || between[4] || '').replace(/,/g, ''))
    values.lower = Math.min(lo, hi)
    values.upper = Math.max(lo, hi)
    return values
  }

  if (/more than|greater than|or more|exceed|blackout|>\s*|capacity|generation/i.test(text)) {
    values.query = 'greater'
    const x = num(
      firstMatch(text, [
        // Prefer explicit raised capacity "(to 1,200)" before generic "by 100"
        /\(to\s*([\d,]+(?:\.\d+)?)\)/i,
        /capacity\s+rises?[^.]*?\bto\s*([\d,]+(?:\.\d+)?)/i,
        /capacity\s*(?:is|=|of)?\s*([\d,]+(?:\.\d+)?)/i,
        /max(?:imum)?\s+capacity\s*(?:is|=)?\s*([\d,]+(?:\.\d+)?)/i,
        /max(?:imum)?\s+(?:electricity\s+)?generation\s*(?:is|=)?\s*([\d,]+(?:\.\d+)?)/i,
        /generation\s*(?:is|=|of|capacity)?\s*([\d,]+(?:\.\d+)?)/i,
        /(?:limit|threshold|cap)\s*(?:is|=|of)?\s*([\d,]+(?:\.\d+)?)/i,
        /exceeds?\s+(?:capacity\s*(?:of\s*)?)?([\d,]+(?:\.\d+)?)/i,
        /demand\s*>\s*([\d,]+(?:\.\d+)?)/i,
        /more than\s*\$?\s*([-+]?[\d,]+(?:\.\d+)?)/i,
        /greater than\s*\$?\s*([-+]?[\d,]+(?:\.\d+)?)/i,
        /X\s*>\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
        /≥\s*\$?\s*([-+]?[\d,]+(?:\.\d+)?)/i,
        />\s*\$?\s*([-+]?[\d,]+(?:\.\d+)?)/i,
        /([\d,]+(?:\.\d+)?)\s*kg or more/i,
      ]),
    )
    if (x !== undefined) values.x = x
  } else if (/less than|at most|≤/i.test(text)) {
    values.query = 'less'
    const x = num(
      firstMatch(text, [
        /less than\s*\$?\s*([-+]?[\d,]+(?:\.\d+)?)/i,
        /≤\s*\$?\s*([-+]?[\d,]+(?:\.\d+)?)/i,
      ]),
    )
    if (x !== undefined) values.x = x
  }

  return values
}

function parseStandardNormal(text: string): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {
    query: 'less',
    z: 1,
  }

  const probEq = num(
    firstMatch(text, [
      /\)\s*=\s*(\d+(?:\.\d+)?)/,
      /=\s*(\d+(?:\.\d+)?)\s*$/,
      /probability\s*(?:of|is|=)\s*(\d+(?:\.\d+)?)/i,
    ]),
  )

  // P(? < Z < zHigh) = p  → find lower bound
  const invLow = text.match(
    /P\s*\(\s*[?_x]\s*<\s*Z\s*<\s*([-+]?\d+(?:\.\d+)?)\s*\)\s*=\s*(\d+(?:\.\d+)?)/i,
  )
  if (invLow) {
    values.query = 'invBetweenLow'
    values.zHigh = Number(invLow[1])
    values.probability = Number(invLow[2])
    return values
  }

  // P(zLow < Z < ?) = p  → find upper bound
  const invHigh = text.match(
    /P\s*\(\s*([-+]?\d+(?:\.\d+)?)\s*<\s*Z\s*<\s*[?_x]\s*\)\s*=\s*(\d+(?:\.\d+)?)/i,
  )
  if (invHigh) {
    values.query = 'invBetweenHigh'
    values.zLow = Number(invHigh[1])
    values.probability = Number(invHigh[2])
    return values
  }

  // Find z such that P(a < Z < z) = p  (unknown written as z)
  const findUpper = text.match(
    /P\s*\(\s*([-+]?\d+(?:\.\d+)?)\s*<\s*Z\s*<\s*z\s*\)\s*=\s*(\d+(?:\.\d+)?)/i,
  )
  if (findUpper && /find\s+z|such that/i.test(text)) {
    values.query = 'invBetweenHigh'
    values.zLow = Number(findUpper[1])
    values.probability = Number(findUpper[2])
    return values
  }

  // P(Z < ?) = p or P(Z ≤ z) = p with unknown z / find z
  const invLeft = text.match(
    /P\s*\(\s*Z\s*[≤<]\s*[?_z]\s*\)\s*=\s*(\d+(?:\.\d+)?)/i,
  )
  if (
    invLeft ||
    (/find\s+z|such that/i.test(text) &&
      /P\s*\(\s*Z\s*[≤<]/i.test(text) &&
      probEq !== undefined)
  ) {
    return {
      query: 'inverse',
      probability:
        invLeft && invLeft[1] !== undefined ? Number(invLeft[1]) : (probEq as number),
    }
  }

  const between = text.match(
    /P\s*\(\s*([-+]?\d+(?:\.\d+)?)\s*<\s*Z\s*<\s*([-+]?\d+(?:\.\d+)?)\s*\)|between\s+([-+]?\d+(?:\.\d+)?)\s+and\s+([-+]?\d+(?:\.\d+)?)/i,
  )
  if (between) {
    values.query = 'between'
    values.zLow = Number(between[1] || between[3])
    values.zHigh = Number(between[2] || between[4])
    return values
  }

  if (/P\s*\(\s*Z\s*>/i.test(text) || /greater than/i.test(text)) {
    values.query = 'greater'
    const z = num(firstMatch(text, [/Z\s*>\s*([-+]?\d+(?:\.\d+)?)/i, />\s*([-+]?\d+(?:\.\d+)?)/i]))
    if (z !== undefined) values.z = z
  } else {
    values.query = 'less'
    const z = num(firstMatch(text, [/Z\s*[≤<]\s*([-+]?\d+(?:\.\d+)?)/i, /<\s*([-+]?\d+(?:\.\d+)?)/i]))
    if (z !== undefined) values.z = z
  }

  return values
}

function parseTDist(text: string): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {
    df: 30,
    query: 'invRight',
    alpha: 0.1,
  }

  const df = num(firstMatch(text, [/df\s*=\s*(\d+)/i, /degrees of freedom\s*=?\s*(\d+)/i]))
  if (df !== undefined) values.df = df

  const alpha = num(
    firstMatch(text, [
      /alpha\s*(?:\/\s*2)?\s*=\s*(\d+(?:\.\d+)?)/i,
      /α\s*(?:\/\s*2)?\s*=\s*(\d+(?:\.\d+)?)/i,
      /right\s*=\s*(\d+(?:\.\d+)?)/i,
    ]),
  )
  if (alpha !== undefined) values.alpha = alpha > 1 ? alpha / 100 : alpha

  if (/two-?tail|α\s*\/\s*2|alpha\s*\/\s*2/i.test(text)) {
    values.query = 'invTwo'
  } else if (/P\s*\(\s*t\s*>/i.test(text)) {
    values.query = 'greater'
    const t = num(text.match(/t\s*>\s*([-+]?\d+(?:\.\d+)?)/i))
    if (t !== undefined) values.t = t
  }

  return values
}

/**
 * Half-width for “within X of the mean” / “within one standard deviation”.
 * Prefer an explicit dollar/number; else k×σ. Returns undefined for sample-size
 * “within $E at 95% confidence” wording.
 */
export function extractWithinHalfWidth(
  text: string,
  sd?: number,
): number | undefined {
  if (/how large|sample size|sample would i need|accuracy|%\s*confidence/i.test(text)) {
    return undefined
  }
  if (!/within/i.test(text)) return undefined

  // Explicit amount: “within $240 of the (actual) mean”
  const explicit = num(
    firstMatch(text, [
      /within\s+(?:approximately\s+)?\$\s*([\d,]+(?:\.\d+)?)\s+of\s+(?:the\s+)?(?:actual\s+)?mean/i,
      /within\s+(?:approximately\s+)?([\d,]+(?:\.\d+)?)\s+of\s+(?:the\s+)?(?:actual\s+)?mean/i,
    ]),
  )
  if (explicit !== undefined) return explicit

  // Parenthetical amount: “within one standard deviation (i.e. $240)”
  const parenthetical = num(
    firstMatch(text, [
      /within\s+(?:one\s+|1\s+)?standard\s+deviation\s*\([^)]*?\$?\s*([\d,]+(?:\.\d+)?)/i,
      /within[^.()]{0,40}\(i\.?e\.?\s*,?\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
    ]),
  )
  if (parenthetical !== undefined) return parenthetical

  // “within k standard deviations” → k × σ
  const kSd = text.match(
    /within\s+(\d+(?:\.\d+)?)\s+standard\s+deviations?/i,
  )
  if (kSd && sd !== undefined) {
    const k = Number(kSd[1])
    if (Number.isFinite(k)) return k * sd
  }

  // “within one / 1 standard deviation” or “within σ” → use σ
  if (
    /within\s+(?:one|1)\s+standard\s+deviation/i.test(text) ||
    /within\s+σ\b/i.test(text)
  ) {
    return sd
  }

  return undefined
}

/**
 * Force query=between with lower=μ−X, upper=μ+X when the text describes a
 * “within X of the mean” band. Overwrites any wrong AI-derived bounds.
 */
export function applyWithinOfMeanBounds(
  text: string,
  values: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const meanRaw = values.mean
  const mean =
    typeof meanRaw === 'number'
      ? meanRaw
      : typeof meanRaw === 'string'
        ? Number(String(meanRaw).replace(/,/g, ''))
        : undefined
  const sdRaw = values.sd
  const sd =
    typeof sdRaw === 'number'
      ? sdRaw
      : typeof sdRaw === 'string'
        ? Number(String(sdRaw).replace(/,/g, ''))
        : undefined
  if (mean === undefined || !Number.isFinite(mean)) return values

  const half = extractWithinHalfWidth(
    text,
    sd !== undefined && Number.isFinite(sd) ? sd : undefined,
  )
  if (half === undefined || !Number.isFinite(half)) return values

  const next = { ...values }
  next.query = 'between'
  next.lower = mean - half
  next.upper = mean + half
  delete next.value
  return next
}

function parseSampleMean(text: string): Record<string, string | number | boolean> {
  // No Kingston/Toronto stubs — only fields found in text (plus useFpc when N qualifies).
  const values: Record<string, string | number | boolean> = {
    query: 'greater',
    useFpc: false,
  }

  const mean = num(
    firstMatch(text, [
      /average(?:\s+\w+){0,3}\s+weighing\s+([\d,]+(?:\.\d+)?)/i,
      /average(?:\s+\w+){0,3}\s+weight(?:ing)?\s+of\s+([\d,]+(?:\.\d+)?)/i,
      /mean of\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /have mean\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /mean\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /μ\s*=\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /\$?\s*([\d,]+(?:\.\d+)?)\s*per month/i,
      /weighing\s+([\d,]+(?:\.\d+)?)\s*lbs?/i,
    ]),
  )
  const sd = num(
    firstMatch(text, [
      /standard deviation of\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /standard deviation\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /σ\s*=\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
    ]),
  )
  const n = num(
    firstMatch(text, [
      /first\s+(\d+)\s+(?:fish|items|observations|customers|units)/i,
      /sample of\s+(\d+)/i,
      /sample mean with n of\s+(\d+)/i,
      /\bn\s+of\s+(\d+)/i,
      /\bn\s*=\s*(\d+)/i,
      /(\d+)\s+apartments/i,
    ]),
  )
  const N = num(
    firstMatch(text, [
      /only\s+([\d,]+)\s+units/i,
      /small[^.]*?([\d,]+)\s+units/i,
      /huge[^.]*?([\d,]+)\s+units/i,
      /with\s+([\d,]+)\s+units/i,
      /(?:population|market)[^.]*?([\d,]+)\s+units/i,
      /population[^.]*?([\d,]+)/i,
      /\bN\s*=\s*([\d,]+)/i,
      /([\d,]+)\s+units\b/i,
    ]),
  )

  // Direct mean threshold, or total-of-n threshold → convert to x̄ threshold
  const meanThreshold = num(
    firstMatch(text, [
      /mean greater than\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /average greater than\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /x(?:bar|̄)?\s*>\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
    ]),
  )
  const totalThreshold = num(
    firstMatch(text, [
      /in total[^.]*?more than\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /total(?:\s+weight)?\s+(?:of\s+more than\s+|greater than\s+|more than\s+)\$?\s*([\d,]+(?:\.\d+)?)/i,
      /weigh more than\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /weigh(?:ing)?\s+more than\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
    ]),
  )
  const plainGreater = num(
    firstMatch(text, [
      /greater than\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      />\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
    ]),
  )

  if (mean !== undefined) values.mean = mean
  if (sd !== undefined) values.sd = sd
  if (n !== undefined) values.n = n
  if (N !== undefined) {
    values.N = N
    // Checkbox label: apply FPC when n > N/20 (5% rule)
    if (n !== undefined && n > N / 20) values.useFpc = true
  } else {
    values.useFpc = false
  }

  // “Within X of the mean” → derived between band (must run before one-sided thresholds)
  const withWithin = applyWithinOfMeanBounds(text, values)
  if (withWithin.query === 'between') {
    return withWithin
  }

  if (meanThreshold !== undefined) {
    values.value = meanThreshold
    values.query = 'greater'
  } else if (
    totalThreshold !== undefined &&
    n !== undefined &&
    n > 0 &&
    /weigh|weight|total/i.test(text)
  ) {
    // P(sum > T) for n i.i.d. = P(x̄ > T/n)
    values.value = totalThreshold / n
    values.query = 'greater'
  } else if (plainGreater !== undefined) {
    values.value = plainGreater
    values.query = 'greater'
  }

  if (/less than|weigh less/i.test(text) && !/more than|greater than/i.test(text)) {
    values.query = 'less'
  }

  return values
}

function parseSampleProportion(text: string): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {
    query: 'greater',
  }

  const p = num(
    firstMatch(text, [
      /(\d+(?:\.\d+)?)\s*%\s*of/i,
      /\bp\s*=\s*(\d+(?:\.\d+)?)/i,
      /proportion[^.]*?(\d+(?:\.\d+)?)/i,
    ]),
  )
  const n = num(firstMatch(text, [/sample of\s+(\d+)/i, /\bn\s*=\s*(\d+)/i]))
  const value = num(
    firstMatch(text, [
      /exceeded\s+(\d+(?:\.\d+)?)\s*%/i,
      />\s*(\d+(?:\.\d+)?)\s*%/i,
      /exceeded\s+(\d+(?:\.\d+)?)/i,
      /p̂\s*>\s*(\d+(?:\.\d+)?)/i,
    ]),
  )

  if (p !== undefined) values.p = pctToProb(p)
  if (n !== undefined) values.n = n
  if (value !== undefined) values.value = pctToProb(value)

  return values
}

function parseCiMeanZ(text: string): Record<string, string | number | boolean> {
  // No apartment stubs (x̄=2100) — only fields found in text.
  const values: Record<string, string | number | boolean> = {}

  const xbar = num(
    firstMatch(text, [
      /x[̄bar-]+\s*=\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /average is found to be\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /average\s+(?:is\s+)?found to be\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /(?:sample\s+)?average\s+(?:of|is|=)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(?:ml|kg|lbs?|units?)?/i,
      /found to be\s*([\d,]+(?:\.\d+)?)\s*ml\b/i,
      /find x-?bar\s*=\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /sample mean\s*(?:is|=|:)?\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
    ]),
  )
  const sd = num(
    firstMatch(text, [
      /standard deviation of(?:\s+[\w'-]+){0,6}\s+is\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /standard deviation(?:\s+of)?\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /σ\s*=\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
    ]),
  )
  const n = num(
    firstMatch(text, [
      /sample of\s+(\d+)/i,
      /\bn\s*=\s*(\d+)/i,
      /sample\s+of\s+(\d+)\s+is taken/i,
    ]),
  )
  const conf = num(
    firstMatch(text, [
      /(\d+(?:\.\d+)?)\s*%\s*confidence/i,
      /(\d+(?:\.\d+)?)\s*%\s*c\.?i/i,
      /construct(?:\s+the)?\s+(\d+(?:\.\d+)?)\s*%/i,
    ]),
  )

  if (xbar !== undefined) values.xbar = xbar
  if (sd !== undefined) values.sd = sd
  if (n !== undefined) values.n = n
  if (conf !== undefined) values.confidence = pctToProb(conf)

  return values
}

function parseCiMeanT(text: string): Record<string, string | number | boolean> {
  const values = parseCiMeanZ(text)
  const s = num(
    firstMatch(text, [
      /sample standard deviation of\s*([\d,]+(?:\.\d+)?)/i,
      /standard deviation of(?:\s+[\w'-]+){0,6}\s+is\s*([\d,]+(?:\.\d+)?)/i,
      /\bs\s*=\s*([\d,]+(?:\.\d+)?)/i,
    ]),
  )
  if (s !== undefined) values.s = s
  else if (typeof values.sd === 'number') values.s = values.sd
  delete values.sd
  return values
}

function parseCiProportion(text: string): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {}

  const pair =
    text.match(/(\d+)\s+of\s+(?:which\s+)?(\d+)/i) ||
    text.match(/(\d+)\s+of\s+(\d+)/i) ||
    text.match(/(\d+)\s+out\s+of\s+(\d+)/i)
  if (pair) {
    const a = Number(pair[1])
    const b = Number(pair[2])
    if (/of which/i.test(text) || a > b) {
      values.n = Math.max(a, b)
      values.successes = Math.min(a, b)
    } else {
      values.successes = a
      values.n = b
    }
  }

  // “sample of 100 … 78 of them were found / under-filled”
  if (values.n === undefined) {
    const n = num(
      firstMatch(text, [
        /sample of\s+(\d+)/i,
        /(\d+)\s+were taken/i,
        /\bn\s*=\s*(\d+)/i,
      ]),
    )
    if (n !== undefined) values.n = n
  }
  if (values.successes === undefined) {
    const successes = num(
      firstMatch(text, [
        /(\d+)\s+of them\b/i,
        /(\d+)\s+(?:were|are)\s+found/i,
        /(\d+)\s+(?:were|are)\s+under-?filled/i,
        /(\d+)\s+under-?filled/i,
        /(\d+)\s+successes?/i,
      ]),
    )
    if (successes !== undefined) values.successes = successes
  }

  const conf = num(text.match(/(\d+(?:\.\d+)?)\s*%\s*confidence/i))
  if (conf !== undefined) values.confidence = pctToProb(conf)

  return values
}

function parseNMean(text: string): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {}

  const sd = num(
    firstMatch(text, [
      /standard deviation of\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /standard deviation\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /σ\s*(?:of|=)\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
    ]),
  )
  const E = num(
    firstMatch(text, [
      /within\s*(?:approximately\s*)?\$\s*([\d,]+(?:\.\d+)?)/i,
      /within\s*(?:approximately\s*)?([\d,]+(?:\.\d+)?)\s+of\s+(?:the\s+)?(?:actual\s+)?(?:figure|mean|value)/i,
      /margin(?:\s+of\s+error)?[^.]*?\$?\s*([\d,]+(?:\.\d+)?)/i,
      /\bE\s*=\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
    ]),
  )
  const conf = num(
    firstMatch(text, [
      /(\d+(?:\.\d+)?)\s*%\s*confidence/i,
      /confidence\s+level\s+of\s+(\d+(?:\.\d+)?)\s*%/i,
    ]),
  )

  if (sd !== undefined) values.sd = sd
  if (E !== undefined) values.E = E
  if (conf !== undefined) values.confidence = pctToProb(conf)

  return values
}

function parseNProportion(text: string): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {
    conservative: /conservative|p\s*=\s*0\.5|be conservative/i.test(text),
  }

  const p = num(
    firstMatch(text, [
      /(\d+(?:\.\d+)?)\s*%\s*of apartments/i,
      /previous study suggests that\s+(\d+(?:\.\d+)?)\s*%/i,
      /pilot[^.]*?(\d+(?:\.\d+)?)\s*%/i,
      /(\d+(?:\.\d+)?)\s*%\s*(?:are|of)\s+high-priced/i,
      /\bp\s*=\s*(\d+(?:\.\d+)?)/i,
    ]),
  )
  const E = num(
    firstMatch(text, [
      /within\s+(0\.\d+)/i,
      /within\s+(\d+(?:\.\d+)?)\s*%/i,
      /within\s+(\d+(?:\.\d+)?)\s+of\s+(?:the\s+)?actual/i,
      /\bE\s*=\s*(\d+(?:\.\d+)?)/i,
    ]),
  )
  const conf = num(
    firstMatch(text, [
      /(\d+(?:\.\d+)?)\s*%\s*confidence/i,
      /confidence\s+level\s+of\s+(\d+(?:\.\d+)?)\s*%/i,
    ]),
  )

  if (p !== undefined) values.p = pctToProb(p)
  if (E !== undefined) values.E = E > 1 ? E / 100 : E
  if (conf !== undefined) values.confidence = pctToProb(conf)
  // Conservative path: ignore pilot p
  if (values.conservative) {
    values.p = 0.5
  }

  return values
}

const PARSERS: Record<
  SolverId,
  (text: string) => Record<string, string | number | boolean>
> = {
  binomial: parseBinomial,
  poisson: parsePoisson,
  uniform: parseUniform,
  normal: parseNormal,
  'standard-normal': parseStandardNormal,
  't-dist': parseTDist,
  'sample-mean': parseSampleMean,
  'sample-proportion': parseSampleProportion,
  'ci-mean-z': parseCiMeanZ,
  'ci-mean-t': parseCiMeanT,
  'ci-proportion': parseCiProportion,
  'n-mean': parseNMean,
  'n-proportion': parseNProportion,
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "'")
    // Keep ? < > = so fingerprints like "? < z < 1" still match
    .replace(/[^a-z0-9.%?<>=_+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchTrainingCase(text: string): TrainingCase | null {
  const norm = normalize(text)
  let best: { case: TrainingCase; score: number; hits: number; need: number } | null =
    null

  for (const tc of TRAINING_CASES) {
    const fps = tc.fingerprints.map((f) => normalize(f)).filter(Boolean)
    if (!fps.length) continue
    let hits = 0
    for (const fp of fps) {
      if (norm.includes(fp)) hits += 1
    }
    // Require a strong majority of fingerprints (never match on one shared number/% alone)
    const need = Math.max(2, Math.ceil(fps.length * 0.6))
    if (hits < need) continue
    const score = hits / fps.length
    if (!best || score > best.score || (score === best.score && hits > best.hits)) {
      best = { case: tc, score, hits, need }
    }
  }

  return best?.case ?? null
}

function trainingCaseToResult(tc: TrainingCase, sourceText?: string): ParseResult {
  let parts: ParsedPart[] | undefined = tc.parts?.map((p, i) => ({
    id: `${tc.id}-${p.label}-${i}`,
    label: p.label,
    rationale: p.rationale,
    solverId: p.solverId,
    values: { ...p.values },
    fingerprints: p.fingerprints,
  }))

  if (parts) parts = finalizeParts(parts)

  const primary =
    parts && parts.length > 0
      ? pickBestPart(parts, sourceText ?? tc.prompt)
      : undefined
  return {
    solverId: primary?.solverId ?? tc.solverId,
    values: { ...(primary?.values ?? tc.values) },
    confidence: 'high',
    family: SOLVERS.find((s) => s.id === (primary?.solverId ?? tc.solverId))?.category,
    summary: `Matched training case “${tc.title}” (${tc.source}).`,
    matchedExampleId: tc.id,
    notes: [
      primary?.rationale ?? tc.rationale,
      ...(parts?.map((p) => `${p.label}: ${p.rationale}`) ?? []),
    ],
    parts,
  }
}

/** Prefer the part whose fingerprints / question letter best match the pasted text. */
export function pickBestPart(parts: ParsedPart[], text: string): ParsedPart {
  if (parts.length === 1) return parts[0]
  const norm = normalize(text)

  const letters = [...text.matchAll(/(?:^|\n|\s)([a-e])[\.)]\s+/gi)].map((m) =>
    m[1].toUpperCase(),
  )
  // Only one lettered question in the paste → that part
  if (letters.length === 1) {
    const want = letters[0]
    const byLetter = parts.find(
      (p) =>
        p.label === `Part ${want}` ||
        p.label === want ||
        p.label.toUpperCase().endsWith(` ${want}`) ||
        p.label.toUpperCase() === `PART ${want}`,
    )
    if (byLetter) return byLetter
  }

  const lastLetter = letters.length ? letters[letters.length - 1] : null

  let best: { part: ParsedPart; score: number } | null = null
  for (const part of parts) {
    let score = 0
    const fps = part.fingerprints?.map((f) => normalize(f)).filter(Boolean) ?? []
    for (const fp of fps) {
      if (norm.includes(fp)) score += 4
    }
    const labelLetter = part.label.replace(/^part\s+/i, '').trim().toUpperCase()
    if (lastLetter && labelLetter === lastLetter) score += 3
    if (letters.length === 1 && labelLetter === letters[0]) score += 5

    // Soft cues from rationale / values
    const blob = normalize(`${part.rationale} ${JSON.stringify(part.values)}`)
    for (const token of blob.split(' ').filter((w) => w.length > 5)) {
      if (norm.includes(token)) score += 0.2
    }
    if (!best || score > best.score) best = { part, score }
  }
  return best?.part ?? parts[0]
}

/**
 * Post-process multipart results:
 * - Link "at least one over n days" binomial p to the prior single-day Normal blackout prob
 * - Inherit sample-mean params into later parts that refer to “your sample”
 * - Replace LLM/heuristic rationale numbers with engine-computed Final Answers
 */
export function finalizeParts(parts: ParsedPart[]): ParsedPart[] {
  let out = parts.map((p) => ({
    ...p,
    values: { ...p.values },
  }))

  const byLetter = (letter: string) =>
    out.find((p) => p.label.replace(/^part\s+/i, '').trim().toUpperCase() === letter)

  // Carry sample-mean context forward; reclassify stray Normal parts that only
  // ask about “your sample” / sample mean without restating μ,σ,n.
  {
    let priorSm: ParsedPart | undefined
    out = out.map((part) => {
      if (part.solverId === 'sample-mean') {
        const merged = priorSm
          ? {
              ...part,
              values: { ...priorSm.values, ...part.values },
            }
          : part
        priorSm = merged
        return merged
      }
      if (priorSm && part.solverId === 'normal') {
        const missingCore =
          part.values.mean === undefined ||
          part.values.sd === undefined ||
          part.values.x === undefined
        // Incomplete Normal after a sample-mean part → inherit sampling context
        // rather than lake-trout stubs (μ=15, σ=3, x=16).
        if (missingCore) {
          const inherited: ParsedPart = {
            ...part,
            solverId: 'sample-mean',
            values: {
              ...priorSm.values,
              ...(part.values.x !== undefined && part.values.value === undefined
                ? { value: part.values.x }
                : {}),
              ...Object.fromEntries(
                Object.entries(part.values).filter(
                  ([k, v]) =>
                    v !== undefined &&
                    v !== '' &&
                    !['mean', 'sd', 'x'].includes(k),
                ),
              ),
            },
            rationale:
              'Same sampling distribution as the prior sample-mean part (inherited μ, σ, n, N).',
          }
          priorSm = inherited
          return inherited
        }
      }
      return part
    })
  }

  const partA = byLetter('A')
  const partD = byLetter('D')
  if (
    partA?.solverId === 'normal' &&
    partD?.solverId === 'binomial' &&
    (partD.values.query === 'atLeast' || partD.values.x === 1)
  ) {
    try {
      const res = solve(partA.solverId, partA.values)
      const emph = res.lines.find((l) => l.emphasis)
      const p = emph ? Number(emph.value) : NaN
      if (Number.isFinite(p) && p > 0 && p < 1) {
        out = out.map((p0) =>
          p0.id === partD.id
            ? {
                ...p0,
                values: {
                  ...p0.values,
                  p,
                  query: 'atLeast',
                  x: 1,
                },
              }
            : p0,
        )
      }
    } catch {
      // keep heuristic p
    }
  }

  return out.map((part) => {
    try {
      const res = solve(part.solverId, part.values)
      const emph = res.lines
        .filter((l) => l.emphasis)
        .map((l) => `${l.label} ≈ ${l.value}`)
        .join('; ')
      const formula = res.excelCalls[0] ?? ''
      const computed = [formula, emph].filter(Boolean).join(' → ')
      // Flag impossible right-tail answers for QA (e.g. stale x=16 with μ=1000)
      const badTail = res.lines.some((l) => {
        if (!l.emphasis) return false
        const v = Number(l.value)
        return v === 0 || v === 1
      })
      const warn = badTail
        ? ' ⚠ Final answer is 0 or 1 — check that x/threshold was autofilled (not a stale default).'
        : ''
      return {
        ...part,
        rationale: computed
          ? `${computed}${warn}`
          : `${part.rationale}${warn}`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'solve failed'
      return { ...part, rationale: `${part.rationale} (engine: ${msg})` }
    }
  })
}

/** Distribution-of-x̄ (a) + P(about that sample) (b) → one sample-mean solve. */
function coalesceSampleMeanSetup(
  parts: ParsedPart[],
  split: { label: string; body: string }[],
  fullText: string,
): ParsedPart[] | null {
  if (parts.length < 2) return null
  const bodies = split.map((s) => s.body)
  const hasDistQ = bodies.some((b) =>
    /distribution of (?:the )?sample mean|what is the distribution/i.test(b),
  )
  const hasSampleProbQ = bodies.some(
    (b) =>
      /probability|how likely|chance/i.test(b) &&
      /(?:your\s+)?sample|sample mean|x(?:bar|̄)?|mean greater|mean less/i.test(b),
  )
  if (!hasDistQ || !hasSampleProbQ) return null

  // Collapse when every lettered part is sample-mean, or a Normal stub missing
  // core params that clearly belongs to the same sampling setup.
  const ok = parts.every((p) => {
    if (p.solverId === 'sample-mean') return true
    if (p.solverId !== 'normal') return false
    const missingCore =
      p.values.mean === undefined ||
      p.values.sd === undefined ||
      (p.values.x === undefined && p.values.value === undefined)
    return missingCore
  })
  if (!ok) return null

  return [
    {
      id: 'sample-mean-combined',
      label: 'Sample Mean',
      rationale: rationaleFor('sample-mean', fullText),
      solverId: 'sample-mean',
      values: parseSampleMean(fullText),
    },
  ]
}

function matchLegacyExample(text: string) {
  const norm = normalize(text)
  let best: { id: string; score: number; coverage: number } | null = null

  for (const ex of EXAMPLES) {
    const prompt = normalize(ex.prompt)
    const title = normalize(ex.title)
    const contentWords = [
      ...new Set(
        `${title} ${prompt}`
          .split(' ')
          .filter((w) => w.length > 3 && !/^\d+(\.\d+)?%?$/.test(w)),
      ),
    ]
    const titleWords = title.split(' ').filter((w) => w.length > 3)

    let wordHits = 0
    for (const w of contentWords) {
      if (norm.includes(w)) wordHits += 1
    }
    const titleHits = titleWords.filter((w) => norm.includes(w)).length
    const coverage = contentWords.length ? wordHits / contentWords.length : 0

    if (titleHits < 2 && coverage < 0.45) continue

    let score = titleHits * 4 + wordHits
    if (norm.includes(prompt) || prompt.includes(norm.slice(0, 80))) score += 10

    if (!best || score > best.score) best = { id: ex.id, score, coverage }
  }

  if (best && best.score >= 10 && best.coverage >= 0.4) {
    return EXAMPLES.find((e) => e.id === best!.id)!
  }
  return null
}

function splitComparisonParts(text: string): { label: string; body: string }[] {
  // Prefer lettered parts: a. ... b. ... (allow same-line after a period)
  const lettered = [
    ...text.matchAll(
      /(?:^|\n|[.!?]\s+)([a-e])[\.)]\s+([\s\S]*?)(?=(?:^|\n|[.!?]\s+)[a-e][\.)]\s+|$)/gi,
    ),
  ]
  if (lettered.length >= 2) {
    return lettered.map((m) => ({
      label: m[1].toUpperCase(),
      body: m[2].trim(),
    }))
  }

  // Numbered 1. 2. — ONLY at line starts (never mid-expression like "Z < 1)")
  const numbered = [
    ...text.matchAll(
      /(?:^|\n)\s*([1-9]\d*)[\.)]\s+([\s\S]*?)(?=(?:^|\n)\s*[1-9]\d*[\.)]\s+|$)/g,
    ),
  ]
  if (numbered.length >= 2) {
    return numbered.map((m) => ({
      label: m[1],
      body: m[2].trim(),
    }))
  }

  // "which is more probable" with "; or"
  if (/which of the following is more probable|which is more probable/i.test(text)) {
    const chunks = text.split(/\bor\b/i)
    if (chunks.length >= 2) {
      return chunks.slice(-2).map((body, i) => ({
        label: String.fromCharCode(65 + i),
        body: body.trim(),
      }))
    }
  }

  return []
}

function rationaleFor(solverId: SolverId, snippet: string): string {
  const t = snippet.toLowerCase()
  if (solverId === 'sample-mean') {
    if (/weigh|weight|total/.test(t)) {
      return 'n i.i.d. continuous measurements (weights) with known μ,σ → sampling distribution of the mean (CLT). P(sum > T) = P(x̄ > T/n).'
    }
    return 'Probability about a sample mean with known σ → Normal sampling distribution of x̄ (CLT).'
  }
  if (solverId === 'poisson') {
    if (/on average|desks?|hoteling/.test(t)) {
      return 'Mean count of arrivals/demand is given (no fixed n×p setup) → discrete Poisson. “Problem” means demand exceeds desk capacity.'
    }
    return 'Counts events over a time window at a roughly constant rate (can always imagine one more) → discrete Poisson.'
  }
  if (solverId === 'binomial') {
    if (/employees?|desks?|%\s*want|hoteling/.test(t)) {
      return 'Fixed number of employees, each independently “success” (wants a desk) with constant p → discrete Binomial. “Problem” means more people than desks.'
    }
    return 'Fixed number of independent trials with success/failure and constant p → discrete Binomial.'
  }
  if (solverId === 'normal') {
    return 'Continuous measurement with mean and sd described as bell-shaped / normal → Normal.'
  }
  if (solverId === 'uniform') {
    return 'Outcomes equally likely over a min–max range → Uniform.'
  }
  return `Inferred ${solverTitle(solverId)} from problem structure (${snippet.slice(0, 60)}…).`
}

function buildPart(
  id: string,
  label: string,
  sharedContext: string,
  partBody: string,
): ParsedPart | null {
  const combined = `${sharedContext}\n${partBody}`
  // Prefer cues in the part itself (so shared rate language doesn't override a weight/CLT part)
  const local = detectSolver(partBody)
  const overall = detectSolver(combined)
  let detected =
    local && local.score >= 4 ? local : overall ?? local
  if (
    local &&
    overall &&
    local.family !== overall.family &&
    local.score >= 3
  ) {
    detected = local
  }
  // "at least one over N days" must win over shared Normal demand language
  if (
    local &&
    local.solverId === 'binomial' &&
    /at least one|repeated|each day for\s+\d+/i.test(partBody)
  ) {
    detected = local
  }
  if (!detected) return null
  const values = PARSERS[detected.solverId](combined)
  return {
    id,
    label: `Part ${label}`,
    rationale: rationaleFor(detected.solverId, partBody),
    solverId: detected.solverId,
    values,
  }
}

function extractSharedContext(text: string): string {
  const cut = text.search(
    /which of the following|more probable:|\b[a-e][\.)]\s+|\b[1-9]\d*[\.)]\s+/i,
  )
  if (cut > 0) return text.slice(0, cut).trim()
  return text
}

export function parseProblemText(raw: string): ParseResult | null {
  const text = raw.trim()
  if (text.length < 8) return null

  const split = splitComparisonParts(text)
  const trained = matchTrainingCase(text)

  // 1) Lettered a/b/c… split FIRST so mixed-family multipart problems
  // (e.g. Poisson catch counts + Normal/sample-mean weights) are not swallowed
  // by a training case that only covers earlier parts.
  if (split.length >= 2) {
    const shared = extractSharedContext(text)
    // Accumulate prior lettered bodies so (b) “your sample” sees n from (a).
    let priorBodies = ''
    let parts: ParsedPart[] = []
    for (let i = 0; i < split.length; i++) {
      const p = split[i]
      const ctx = [shared, priorBodies].filter(Boolean).join('\n')
      const built = buildPart(`part-${p.label}-${i}`, p.label, ctx, p.body)
      if (built) parts.push(built)
      priorBodies = [priorBodies, p.body].filter(Boolean).join('\n')
    }

    const coalesced = coalesceSampleMeanSetup(parts, split, text)
    if (coalesced) {
      const finalized = finalizeParts(coalesced)
      const primary = finalized[0]
      return {
        solverId: primary.solverId,
        values: primary.values,
        confidence: 'high',
        family: 'sampling',
        summary: `Inferred ${solverTitle(primary.solverId)} (parts a/b share one sampling setup).`,
        notes: [
          primary.rationale,
          'Distribution question (a) and sample-mean probability (b) solved together — no separate Normal tab.',
        ],
      }
    }

    // Overlay / repair from training when fingerprints match OR heuristic is incomplete
    if (trained?.parts?.length) {
      parts = parts.map((part) => {
        const letter = part.label.replace(/^part\s+/i, '').trim().toUpperCase()
        const trainedPart = trained.parts!.find((tp) => {
          const tl = tp.label.replace(/^part\s+/i, '').trim().toUpperCase()
          return tl === letter || tl === part.label.toUpperCase()
        })
        if (!trainedPart) return part

        const splitBody = split.find((s) => s.label.toUpperCase() === letter)?.body ?? ''
        const bodyNorm = normalize(`${part.label} ${splitBody}`)
        const fps = (trainedPart.fingerprints ?? []).map((f) => normalize(f))
        const hits = fps.filter((fp) => fp && bodyNorm.includes(fp)).length
        const need = Math.max(1, Math.ceil((fps.length || 1) * 0.5))
        const fingerprintHit = fps.length > 0 && hits >= need

        const missingThreshold =
          part.solverId === 'normal' &&
          part.values.query === 'greater' &&
          (part.values.x === undefined ||
            part.values.x === '' ||
            part.values.x === 0)

        const wrongFamilyForAtLeastOne =
          trainedPart.solverId === 'binomial' &&
          part.solverId !== 'binomial' &&
          /at least one|repeated|each day for\s+\d+|for\s+\d+\s+days/i.test(
            splitBody,
          )

        if (fingerprintHit || missingThreshold || wrongFamilyForAtLeastOne) {
          // Prefer training values for repaired fields; keep heuristic overrides when present
          const mergedValues = {
            ...trainedPart.values,
            ...            Object.fromEntries(
              Object.entries(part.values).filter(([k, v]) => {
                if (v === undefined || v === '') return false
                if (missingThreshold && k === 'x') return false
                if (k === 'x' && v === 0) return false
                return true
              }),
            ),
          }
          // Ensure threshold comes from training when heuristic lacked it
          if (missingThreshold && trainedPart.values.x !== undefined) {
            mergedValues.x = trainedPart.values.x
          }
          return {
            ...part,
            solverId:
              wrongFamilyForAtLeastOne || fingerprintHit
                ? trainedPart.solverId
                : part.solverId,
            values:
              wrongFamilyForAtLeastOne || fingerprintHit
                ? { ...trainedPart.values }
                : mergedValues,
            rationale: trainedPart.rationale,
            fingerprints: trainedPart.fingerprints,
          }
        }
        return part
      })
    }

    if (parts.length >= 2) {
      parts = finalizeParts(parts)

      const incompleteNormal = parts.some(
        (p) =>
          p.solverId === 'normal' &&
          p.values.query === 'greater' &&
          (p.values.x === undefined || p.values.x === '' || p.values.x === 0),
      )
      const dShouldBeBinomial =
        /at least one/i.test(text) &&
        /(?:repeated|each day|independent).{0,40}\d+\s+days|\d+\s+(?:independent\s+)?days/i.test(
          text,
        ) &&
        parts.some(
          (p) =>
            /part\s*d/i.test(p.label) && p.solverId !== 'binomial',
        )

      // If structural parse is still broken but we have a labeled training case, trust it
      if ((incompleteNormal || dShouldBeBinomial) && trained?.parts?.length) {
        return trainingCaseToResult(trained, text)
      }

      const primary = pickBestPart(parts, text)
      const family = parts.every((p) =>
        ['binomial', 'poisson'].includes(p.solverId),
      )
        ? 'discrete'
        : detectSolver(text)?.family

      const missingNotes = parts
        .filter(
          (p) =>
            p.solverId === 'normal' &&
            p.values.query === 'greater' &&
            (p.values.x === undefined || p.values.x === '' || p.values.x === 0),
        )
        .map(
          (p) =>
            `${p.label}: threshold x not found in pasted text — paste the capacity/limit (e.g. 1,100) or the full problem intro.`,
        )

      return {
        solverId: primary.solverId,
        values: primary.values,
        confidence: missingNotes.length ? 'medium' : 'high',
        family,
        summary: `Comparison: detected ${parts
          .map((p) => `${p.label} → ${solverTitle(p.solverId)}`)
          .join('; ')}.`,
        notes: [
          ...parts.map((p) => `${p.label}: ${p.rationale}`),
          ...missingNotes,
        ],
        parts,
      }
    }
  }

  // 2) Fingerprint match against MMA practice training corpus (single-focus pastes)
  // Do not force a catch-count case when the question is clearly about weights/totals.
  if (trained) {
    const weightQuestion =
      /weigh more than|total weight|in total[^.]*?weigh|first\s+\d+\s+fish[^.]*?weigh/i.test(
        text,
      )
    const caseCoversWeights =
      ['sample-mean', 'normal'].includes(trained.solverId) ||
      Boolean(
        trained.parts?.some((p) =>
          ['sample-mean', 'normal'].includes(p.solverId),
        ),
      )
    if (!(weightQuestion && !caseCoversWeights)) {
      return trainingCaseToResult(trained, text)
    }
  }

  // 3) Legacy curated EXAMPLES (strict — no number-only matches)
  const example = matchLegacyExample(text)
  if (example) {
    return {
      solverId: example.solverId,
      values: { ...example.values },
      confidence: 'high',
      family: SOLVERS.find((s) => s.id === example.solverId)?.category,
      summary: `Matched curated example “${example.title}”.`,
      matchedExampleId: example.id,
      notes: ['Fields filled from the known MMA sample problem.'],
    }
  }

  // 4) Structural heuristic (Binomial vs Poisson vs Normal, …)
  const detected = detectSolver(text)
  if (!detected) {
    return {
      solverId: 'binomial',
      values: {},
      confidence: 'low',
      summary: 'Could not identify the distribution from the problem structure.',
      notes: [
        'Tip: include a rate over time (→ Poisson), a fixed number of trials with a success % (→ Binomial), or mean & sd (→ Normal).',
        'Or use Detect with AI if you have configured ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY in .env.',
      ],
    }
  }

  const values = PARSERS[detected.solverId](text)
  return {
    solverId: detected.solverId,
    values,
    confidence: detected.score >= 6 ? 'high' : 'medium',
    family: detected.family,
    summary: `Inferred ${solverTitle(detected.solverId)} from problem structure (no distribution name required).`,
    notes: [rationaleFor(detected.solverId, text)],
  }
}
