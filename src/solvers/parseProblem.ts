import type { SolverId } from './types'
import { EXAMPLES } from './examples'
import { SOLVERS } from './types'
import { TRAINING_CASES, type TrainingCase } from './trainingCorpus'

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
  if (/p\s*\(\s*z\b|z\s*~\s*n\s*\(\s*0/.test(t)) score += 6
  return score
}

function scoreSampleMean(text: string): number {
  const t = text.toLowerCase()
  let score = 0
  if (/sample mean|x-?bar|x̄/.test(t)) score += 6
  if (/random sample of\s+\d+/.test(t) && /mean/.test(t) && !/confidence/.test(t))
    score += 5
  if (/finite population|units/.test(t) && /sample of/.test(t)) score += 2
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
  if (
    !/confidence interval|construct (a |an )?\d|%\s*c\.?i/.test(t) &&
    !/95%\s*confidence|98%\s*confidence/.test(t)
  ) {
    return null
  }
  if (/proportion|successes|out of|of which/.test(t)) return 'ci-proportion'
  if (/sample standard deviation|\bs\s*=|unknown σ|t-?distribution|t\.inv/.test(t)) {
    return 'ci-mean-t'
  }
  return 'ci-mean-z'
}

function scoreSampleSize(text: string): SolverId | null {
  const t = text.toLowerCase()
  if (!/sample size|how large (a |the )?sample|required n|how large would the sample/.test(t)) {
    return null
  }
  if (/proportion|p̂|percent|high-priced|pilot/.test(t)) return 'n-proportion'
  return 'n-mean'
}

function detectSolver(text: string): { solverId: SolverId; score: number; family: ParseResult['family'] } | null {
  const ci = scoreCi(text)
  if (ci) return { solverId: ci, score: 10, family: 'sampling' }

  const nReq = scoreSampleSize(text)
  if (nReq) return { solverId: nReq, score: 10, family: 'sampling' }

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
        /(\d+)\s*employees?/i,
        /(\d+)\s*[- ]?question/i,
        /(\d+)\s*trials?/i,
        /\bn\s*=\s*(\d+)/i,
        /(\d+)\s*true-?false/i,
        /(\d+)\s+cars?\b/i,
      ]),
    ) ?? undefined
  if (n !== undefined) values.n = n

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

function parsePoisson(text: string): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {
    lambda: 1.5,
    hours: 1,
    independentDays: 1,
    query: 'equal',
    x: 0,
  }

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
  const independentEach =
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
  const values: Record<string, string | number | boolean> = {
    mean: 15,
    sd: 3,
    query: 'greater',
    x: 16,
  }

  const mean = num(
    firstMatch(text, [
      /expected value of\s+([\d,]+(?:\.\d+)?)/i,
      /mean of\s+([\d,]+(?:\.\d+)?)/i,
      /μ\s*=\s*([\d,]+(?:\.\d+)?)/i,
      /N\s*\(\s*([-+]?[\d,]+(?:\.\d+)?)\s*,/i,
      /mean\s+([\d,]+(?:\.\d+)?)/i,
    ]),
  )
  const sd = num(
    firstMatch(text, [
      /standard deviation of\s+([\d,]+(?:\.\d+)?)/i,
      /σ\s*=\s*([\d,]+(?:\.\d+)?)/i,
      /N\s*\(\s*[-+]?[\d,]+(?:\.\d+)?\s*,\s*([\d,]+(?:\.\d+)?)/i,
      /sd\s*=\s*([\d,]+(?:\.\d+)?)/i,
    ]),
  )
  if (mean !== undefined) values.mean = mean
  if (sd !== undefined) values.sd = sd

  const between = text.match(
    /between\s+([-+]?[\d,]+(?:\.\d+)?)\s+(?:kg\s+)?and\s+([-+]?[\d,]+(?:\.\d+)?)|([-+]?[\d,]+(?:\.\d+)?)\s*<\s*[Xx]\s*<\s*([-+]?[\d,]+(?:\.\d+)?)/i,
  )
  if (between) {
    values.query = 'between'
    const lo = Number((between[1] || between[3] || '').replace(/,/g, ''))
    const hi = Number((between[2] || between[4] || '').replace(/,/g, ''))
    values.lower = Math.min(lo, hi)
    values.upper = Math.max(lo, hi)
    return values
  }

  if (/more than|greater than|or more|exceed|blackout|>\s*/i.test(text)) {
    values.query = 'greater'
    const x = num(
      firstMatch(text, [
        /more than\s+([-+]?[\d,]+(?:\.\d+)?)/i,
        /greater than\s+([-+]?[\d,]+(?:\.\d+)?)/i,
        /≥\s*([-+]?[\d,]+(?:\.\d+)?)/i,
        />\s*([-+]?[\d,]+(?:\.\d+)?)/i,
        /capacity[^.]*?([\d,]+)/i,
        /([\d,]+(?:\.\d+)?)\s*kg or more/i,
      ]),
    )
    if (x !== undefined) values.x = x
  } else if (/less than|at most|≤/i.test(text)) {
    values.query = 'less'
    const x = num(
      firstMatch(text, [
        /less than\s+([-+]?[\d,]+(?:\.\d+)?)/i,
        /≤\s*([-+]?[\d,]+(?:\.\d+)?)/i,
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

function parseSampleMean(text: string): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {
    mean: 2000,
    sd: 240,
    n: 36,
    query: 'greater',
    value: 2080,
    useFpc: false,
  }

  const mean = num(
    firstMatch(text, [
      /mean of\s*\$?\s*([\d,]+)/i,
      /μ\s*=\s*\$?\s*([\d,]+)/i,
      /\$?\s*([\d,]+)\s*per month/i,
    ]),
  )
  const sd = num(
    firstMatch(text, [
      /standard deviation of\s*\$?\s*([\d,]+)/i,
      /σ\s*=\s*\$?\s*([\d,]+)/i,
    ]),
  )
  const n = num(
    firstMatch(text, [/sample of\s+(\d+)/i, /\bn\s*=\s*(\d+)/i, /(\d+)\s+apartments/i]),
  )
  const N = num(
    firstMatch(text, [/with\s+([\d,]+)\s+units/i, /population[^.]*?([\d,]+)/i, /\bN\s*=\s*([\d,]+)/i]),
  )
  const value = num(
    firstMatch(text, [
      /greater than\s*\$?\s*([\d,]+)/i,
      />\s*\$?\s*([\d,]+)/i,
      /mean greater than\s*\$?\s*([\d,]+)/i,
    ]),
  )

  if (mean !== undefined) values.mean = mean
  if (sd !== undefined) values.sd = sd
  if (n !== undefined) values.n = n
  if (N !== undefined) {
    values.N = N
    if (n !== undefined && n > N / 20) values.useFpc = true
  }
  if (value !== undefined) values.value = value

  return values
}

function parseSampleProportion(text: string): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {
    p: 0.2,
    n: 30,
    query: 'greater',
    value: 0.25,
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
  const values: Record<string, string | number | boolean> = {
    xbar: 2100,
    sd: 240,
    n: 36,
    confidence: 0.95,
  }

  const xbar = num(
    firstMatch(text, [
      /x[̄bar-]+\s*=\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /average is found to be\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /find x-?bar\s*=\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /sample mean[^.]*?\$?\s*([\d,]+(?:\.\d+)?)/i,
    ]),
  )
  const sd = num(
    firstMatch(text, [
      /standard deviation of\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      /σ\s*=\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
    ]),
  )
  const n = num(firstMatch(text, [/sample of\s+(\d+)/i, /\bn\s*=\s*(\d+)/i]))
  const conf = num(
    firstMatch(text, [/(\d+(?:\.\d+)?)\s*%\s*confidence/i, /(\d+(?:\.\d+)?)\s*%\s*c\.?i/i]),
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
      /\bs\s*=\s*([\d,]+(?:\.\d+)?)/i,
    ]),
  )
  if (s !== undefined) values.s = s
  else if (typeof values.sd === 'number') values.s = values.sd
  delete values.sd
  return values
}

function parseCiProportion(text: string): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {
    successes: 12,
    n: 50,
    confidence: 0.95,
  }

  const pair = text.match(/(\d+)\s+of\s+(?:which\s+)?(\d+)/i) || text.match(/(\d+)\s+of\s+(\d+)/i)
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

  const conf = num(text.match(/(\d+(?:\.\d+)?)\s*%\s*confidence/i))
  if (conf !== undefined) values.confidence = pctToProb(conf)

  return values
}

function parseNMean(text: string): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {
    sd: 240,
    E: 100,
    confidence: 0.95,
  }

  const sd = num(
    firstMatch(text, [
      /standard deviation of\s*\$?\s*([\d,]+)/i,
      /σ\s*=\s*\$?\s*([\d,]+)/i,
    ]),
  )
  const E = num(
    firstMatch(text, [
      /within\s*(?:approximately\s*)?\$?\s*([\d,]+)/i,
      /margin[^.]*?\$?\s*([\d,]+)/i,
      /\bE\s*=\s*\$?\s*([\d,]+)/i,
    ]),
  )
  const conf = num(text.match(/(\d+(?:\.\d+)?)\s*%\s*confidence/i))

  if (sd !== undefined) values.sd = sd
  if (E !== undefined) values.E = E
  if (conf !== undefined) values.confidence = pctToProb(conf)

  return values
}

function parseNProportion(text: string): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {
    p: 0.1,
    E: 0.05,
    confidence: 0.95,
    conservative: /conservative|p\s*=\s*0\.5/i.test(text),
  }

  const p = num(
    firstMatch(text, [
      /(\d+(?:\.\d+)?)\s*%\s*of apartments/i,
      /pilot[^.]*?(\d+(?:\.\d+)?)\s*%/i,
      /\bp\s*=\s*(\d+(?:\.\d+)?)/i,
    ]),
  )
  const E = num(
    firstMatch(text, [
      /within\s+(\d+(?:\.\d+)?)/i,
      /\bE\s*=\s*(\d+(?:\.\d+)?)/i,
    ]),
  )
  const conf = num(text.match(/(\d+(?:\.\d+)?)\s*%\s*confidence/i))

  if (p !== undefined) values.p = pctToProb(p)
  if (E !== undefined) values.E = E > 1 ? E / 100 : E
  if (conf !== undefined) values.confidence = pctToProb(conf)

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
    .replace(/[^a-z0-9.%]+/g, ' ')
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
  const parts: ParsedPart[] | undefined = tc.parts?.map((p, i) => ({
    id: `${tc.id}-${p.label}-${i}`,
    label: p.label,
    rationale: p.rationale,
    solverId: p.solverId,
    values: { ...p.values },
    fingerprints: p.fingerprints,
  }))

  const primary =
    parts && parts.length > 0
      ? pickBestPart(parts, sourceText ?? tc.prompt)
      : undefined
  return {
    solverId: primary?.solverId ?? tc.solverId,
    values: { ...(primary?.values ?? tc.values) },
    confidence: 'high',
    family: SOLVERS.find((s) => s.id === tc.solverId)?.category,
    summary: `Matched training case “${tc.title}” (${tc.source}).`,
    matchedExampleId: tc.id,
    notes: [tc.rationale, ...(parts?.map((p) => `${p.label}: ${p.rationale}`) ?? [])],
    parts,
  }
}

/** Prefer the part whose fingerprints / question letter best match the pasted text. */
export function pickBestPart(parts: ParsedPart[], text: string): ParsedPart {
  if (parts.length === 1) return parts[0]
  const norm = normalize(text)

  const letters = [...text.matchAll(/(?:^|\n|\s)([a-d])[\.)]\s+/gi)].map((m) =>
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
  // Prefer lettered parts: a. ... b. ...
  const lettered = [
    ...text.matchAll(
      /(?:^|\n|\s)([a-d])[\.)]\s*([\s\S]*?)(?=(?:^|\n|\s)[a-d][\.)]\s*|$)/gi,
    ),
  ]
  if (lettered.length >= 2) {
    return lettered.map((m) => ({
      label: m[1].toUpperCase(),
      body: m[2].trim(),
    }))
  }

  // Numbered 1. 2.
  const numbered = [
    ...text.matchAll(/(?:^|\n|\s)([1-4])[\.)]\s*([\s\S]*?)(?=(?:^|\n|\s)[1-4][\.)]\s*|$)/g),
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
  // Prefer cues in the part itself (so shared rate language doesn't override a binomial part)
  const local = detectSolver(partBody)
  const overall = detectSolver(combined)
  const detected =
    local && local.score >= 4 ? local : overall ?? local
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
    /which of the following|more probable:|\ba[\.)]\s|\b1[\.)]\s/i,
  )
  if (cut > 0) return text.slice(0, cut).trim()
  return text
}

export function parseProblemText(raw: string): ParseResult | null {
  const text = raw.trim()
  if (text.length < 12) return null

  // 1) Fingerprint match against MMA practice training corpus
  const trained = matchTrainingCase(text)
  if (trained) return trainingCaseToResult(trained, text)

  // 2) Multi-part comparison (a vs b) via structural split
  const split = splitComparisonParts(text)
  if (split.length >= 2) {
    const shared = extractSharedContext(text)
    const parts = split
      .map((p, i) => buildPart(`part-${p.label}-${i}`, p.label, shared, p.body))
      .filter((p): p is ParsedPart => p !== null)

    if (parts.length >= 2) {
      const primary = pickBestPart(parts, text)
      const family = parts.every((p) =>
        ['binomial', 'poisson'].includes(p.solverId),
      )
        ? 'discrete'
        : detectSolver(text)?.family

      return {
        solverId: primary.solverId,
        values: primary.values,
        confidence: 'high',
        family,
        summary: `Comparison: detected ${parts
          .map((p) => `${p.label} → ${solverTitle(p.solverId)}`)
          .join('; ')}.`,
        notes: parts.map((p) => `${p.label}: ${p.rationale}`),
        parts,
      }
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
