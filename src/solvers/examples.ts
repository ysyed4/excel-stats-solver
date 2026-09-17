import type { ExampleProblem } from './types'

/** Curated from MMA 863 Statistics Review sample problems. */
export const EXAMPLES: ExampleProblem[] = [
  {
    id: 'calvin-pass',
    solverId: 'binomial',
    title: 'Calvin’s true/false exam',
    prompt:
      '20 true/false questions, p = 0.5. Probability of 10 or more correct, and exactly 15 correct.',
    values: {
      n: 20,
      p: 0.5,
      query: 'atLeast',
      x: 10,
      x2: 15,
    },
  },
  {
    id: 'red-blue-cars',
    solverId: 'poisson',
    title: 'Red car / blue car',
    prompt:
      'Red car once every 2 minutes; 30% of cars blue. Compare P(more than 9 red in 20 min) vs P(≥5 blue in next 15).',
    values: {
      lambda: 10,
      hours: 1,
      query: 'moreThan',
      x: 9,
    },
  },
  {
    id: 'office-space',
    solverId: 'binomial',
    title: 'Office Space (hoteling)',
    prompt:
      'Hoteling: 20 desks, 50 employees, 30% want office (35% Friday). Do we have a problem? (b) Average 15 want office.',
    values: {
      n: 50,
      p: 0.3,
      query: 'moreThan',
      x: 20,
    },
  },
  {
    id: 'photo-radar',
    solverId: 'binomial',
    title: 'Photo Radar',
    prompt: '2000 cars scanned, 1% ticketed. P(more than 25 ticketed)?',
    values: {
      n: 2000,
      p: 0.01,
      query: 'moreThan',
      x: 25,
    },
  },
  {
    id: 'support-poisson',
    solverId: 'poisson',
    title: 'Support call volume',
    prompt:
      'Calls ~ Poisson(1.5 / hour). P(no calls in 1 hour) and P(more than 4 in 2 hours).',
    values: {
      lambda: 1.5,
      query: 'equal',
      x: 0,
      hours: 2,
      xHigh: 4,
    },
  },
  {
    id: 'kodiak-halibut',
    solverId: 'poisson',
    title: 'Kodiak · trip total (a)',
    prompt:
      '3 anglers × 4 hrs/day × 1.5 fish/hr × 4 days. P(more than 90 fish during the trip)?',
    values: {
      lambda: 18,
      hours: 4,
      independentDays: 1,
      query: 'moreThan',
      x: 90,
    },
  },
  {
    id: 'kodiak-halibut-each-day',
    solverId: 'poisson',
    title: 'Kodiak · each day (b)',
    prompt:
      '3 anglers × 4 hrs/day × 1.5 fish/hr. P(15 or more fish on each of 4 independent days)?',
    values: {
      lambda: 18,
      hours: 1,
      independentDays: 4,
      query: 'atLeast',
      x: 15,
    },
  },
  {
    id: 'gas-uniform',
    solverId: 'uniform',
    title: 'Gasoline sales',
    prompt:
      'Daily gallons ~ Uniform(2000, 5000). P(2500–3000), P(≥ 4000), P(exactly 2500).',
    values: {
      a: 2000,
      b: 5000,
      lower: 2500,
      upper: 3000,
      atLeast: 4000,
      exact: 2500,
    },
  },
  {
    id: 'fishing-normal',
    solverId: 'normal',
    title: 'Lake trout weights',
    prompt:
      'Fish weight ~ N(15, 3). P(X > 16) and P(8 < X < 19).',
    values: {
      mean: 15,
      sd: 3,
      query: 'greater',
      x: 16,
      lower: 8,
      upper: 19,
    },
  },
  {
    id: 'z-practice',
    solverId: 'standard-normal',
    title: 'Standard normal practice',
    prompt: 'P(Z < 1), P(Z > 2.3), P(−1 < Z < 1).',
    values: {
      query: 'less',
      z: 1,
      zLow: -1,
      zHigh: 1,
    },
  },
  {
    id: 'blackout',
    solverId: 'normal',
    title: 'Ontario peak demand',
    prompt:
      'Demand ~ N(1000, 60). Capacity 1100. Probability of a blackout (demand > capacity).',
    values: {
      mean: 1000,
      sd: 60,
      query: 'greater',
      x: 1100,
    },
  },
  {
    id: 'toronto-mean',
    solverId: 'sample-mean',
    title: 'Toronto rents · sample mean',
    prompt:
      'μ = 2000, σ = 240, n = 36. P(x̄ > 2080). Optional finite-pop correction if N given.',
    values: {
      mean: 2000,
      sd: 240,
      n: 36,
      query: 'greater',
      value: 2080,
      N: 10000,
      useFpc: false,
    },
  },
  {
    id: 'kingston-fpc',
    solverId: 'sample-mean',
    title: 'Kingston rents · FPC',
    prompt: 'Same as Toronto but N = 100, n = 36 — apply finite population correction.',
    values: {
      mean: 2000,
      sd: 240,
      n: 36,
      query: 'greater',
      value: 2080,
      N: 100,
      useFpc: true,
    },
  },
  {
    id: 'high-priced',
    solverId: 'sample-proportion',
    title: 'High-priced units',
    prompt: 'p = 0.20, n = 30. P(p̂ > 0.25).',
    values: {
      p: 0.2,
      n: 30,
      query: 'greater',
      value: 0.25,
    },
  },
  {
    id: 'ci-apartments',
    solverId: 'ci-mean-z',
    title: 'Apartment CI (σ known)',
    prompt: 'x̄ = 2100, σ = 240, n = 36. Build 95% and 98% CIs.',
    values: {
      xbar: 2100,
      sd: 240,
      n: 36,
      confidence: 0.95,
    },
  },
  {
    id: 'ci-paint-t',
    solverId: 'ci-mean-t',
    title: 'Paint fill CI (σ unknown)',
    prompt: 'x̄ = 995, s = 21, n = 49. 95% CI for μ.',
    values: {
      xbar: 995,
      s: 21,
      n: 49,
      confidence: 0.95,
    },
  },
  {
    id: 'ci-prop-high',
    solverId: 'ci-proportion',
    title: 'High-priced share CI',
    prompt: '12 of 50 units high-priced. 95% CI for p.',
    values: {
      successes: 12,
      n: 50,
      confidence: 0.95,
    },
  },
  {
    id: 'n-rent',
    solverId: 'n-mean',
    title: 'Sample size for rent mean',
    prompt: 'σ = 240, E = 100, 95% confidence. How large should n be?',
    values: {
      sd: 240,
      E: 100,
      confidence: 0.95,
    },
  },
  {
    id: 'n-prop',
    solverId: 'n-proportion',
    title: 'Sample size for proportion',
    prompt: 'E = 0.05, 95% CI. Pilot p̂ = 0.10 vs conservative p = 0.5.',
    values: {
      p: 0.1,
      E: 0.05,
      confidence: 0.95,
      conservative: false,
    },
  },
  {
    id: 't-lookups',
    solverId: 't-dist',
    title: 't lookups',
    prompt: 'df = 30: t for right-tail α = 0.10 and two-tail α/2 = 0.025.',
    values: {
      df: 30,
      query: 'invRight',
      alpha: 0.1,
    },
  },
]
