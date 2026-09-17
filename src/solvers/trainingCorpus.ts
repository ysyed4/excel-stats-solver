import type { SolverId } from './types'

/**
 * Labeled practice problems mined from MMA 863 practice decks/solutions.
 * Used to teach distribution detection (structure + fingerprints), not just keywords.
 */
export interface TrainingCase {
  id: string
  title: string
  /** Unique phrases that must largely appear for a curated match. */
  fingerprints: string[]
  /** Full (or representative) problem text for fuzzy matching. */
  prompt: string
  solverId: SolverId
  values: Record<string, string | number | boolean>
  /** Why this distribution — mirrors course solutions. */
  rationale: string
  /** Optional sibling parts for a/b comparison problems. */
  parts?: {
    label: string
    solverId: SolverId
    values: Record<string, string | number | boolean>
    rationale: string
    fingerprints?: string[]
  }[]
  source: string
}

export const TRAINING_CASES: TrainingCase[] = [
  {
    id: 'red-blue-cars',
    title: 'Red car / blue car',
    fingerprints: ['red car', 'once every 2 minutes', '30 % of cars are blue', 'more than 9 red'],
    prompt:
      'One Car two Car, Red Car Blue Car: a red car drives by about once every 2 minutes. About 30% of cars are blue. Which is more probable: (a) watch 20 minutes see more than 9 red cars; (b) of the next 15 cars five or more will be blue?',
    solverId: 'poisson',
    values: { lambda: 10, hours: 1, query: 'moreThan', x: 9 },
    rationale:
      'Part a: arrivals at a rate over time → Poisson(λ=10 for 20 min). Part b: fixed n with success % → Binomial.',
    parts: [
      {
        label: 'Part A',
        solverId: 'poisson',
        values: { lambda: 10, hours: 1, query: 'moreThan', x: 9 },
        rationale:
          'Red cars arrive once every 2 minutes → λ = 10 per 20 minutes. P(X>9)=1−POISSON.DIST(9,10,TRUE).',
        fingerprints: ['more than 9 red', 'watch for 20 minutes', 'once every 2'],
      },
      {
        label: 'Part B',
        solverId: 'binomial',
        values: { n: 15, p: 0.3, query: 'atLeast', x: 5 },
        rationale:
          'Next 15 cars, p=0.30 blue → Binomial. P(X≥5)=1−BINOM.DIST(4,15,0.3,TRUE).',
        fingerprints: ['next 15 cars', 'five or more', 'blue'],
      },
    ],
    source: 'Discrete Random Variables - Practice Problems',
  },
  {
    id: 'office-space',
    title: 'Office Space (hoteling)',
    fingerprints: ['hoteling', '20 desks', '50 employees', 'want to work in the office'],
    prompt:
      'My office uses a hoteling model. 20 desks, 50 employees, only 30% want to work in the office (35% Friday). Do we have a problem? (b) On average 15 employees want office (17 Friday). Do we have a problem?',
    solverId: 'binomial',
    values: { n: 50, p: 0.3, query: 'moreThan', x: 20 },
    rationale:
      'Problem = more people than desks (X>20). (a) fixed n=50 with p% → Binomial. (b) mean count only → Poisson.',
    parts: [
      {
        label: 'Part A',
        solverId: 'binomial',
        values: { n: 50, p: 0.3, query: 'moreThan', x: 20 },
        rationale:
          'Binomial n=50, p=0.30 (weekday). Problem when X>20 → 1−BINOM.DIST(20,50,0.3,TRUE).',
        fingerprints: ['50 employees', '30%', 'hoteling'],
      },
      {
        label: 'Part B',
        solverId: 'poisson',
        values: { lambda: 15, hours: 1, query: 'moreThan', x: 20 },
        rationale:
          'Mean demand λ=15/day (no fixed n×p) → Poisson. Problem when X>20 → 1−POISSON.DIST(20,15,TRUE).',
        fingerprints: ['on average, 15', '17 on average', 'hoteling'],
      },
    ],
    source: 'Discrete Random Variables - Practice Problems',
  },
  {
    id: 'winter-wonderland-slips',
    title: 'Winter Wonderland · slips',
    fingerprints: ['driveway', '1 km long', '5% chance', 'slip and fall', '100 m'],
    prompt:
      'Driveway is 1 km long. 5% chance of slipping in first 100 m. Walk 2.5 km remaining after forgetting keys. Probability of finishing without slipping?',
    solverId: 'poisson',
    values: { lambda: 1.25, hours: 1, query: 'equal', x: 0 },
    rationale:
      'Rate 0.05 falls / 100 m over 2500 m → λ=1.25. P(X=0)=POISSON.DIST(0,1.25,TRUE). Alternate: Binomial n=25,p=0.05.',
    source: 'Discrete Random Variables - Practice Problems',
  },
  {
    id: 'winter-wonderland-propane',
    title: 'Winter Wonderland · propane',
    fingerprints: ['200 L of propane', '6.5 L', 'standard deviation of 2', '30 days'],
    prompt:
      '200 L propane left, 30 days until delivery. Daily consumption mean 6.5 L, sd 2 L. How worried should I be?',
    solverId: 'sample-mean',
    values: {
      mean: 6.5,
      sd: 2,
      n: 30,
      query: 'greater',
      value: 6.6666667,
      useFpc: false,
    },
    rationale:
      'Need average daily use < 200/30≈6.67. x̄ ~ N(6.5, 2/√30). P(x̄>6.67) via NORM.DIST.',
    source: 'Discrete Random Variables - Practice Problems',
  },
  {
    id: 'ontario-blackout',
    title: 'Ontario peak demand · blackout a–d',
    fingerprints: [
      'peak demand',
      'blackout',
      'standard deviation',
      'falls to 50',
      '1,200',
      '1200',
      '20',
      'at least one',
    ],
    prompt:
      'Peak demand ~ N(1000, 60). Capacity 1,100. (a) P(blackout)? (b) σ→50? (c) capacity→1,200? (d) P(at least one blackout in 20 days)?',
    solverId: 'normal',
    values: { mean: 1000, sd: 60, query: 'greater', x: 1100 },
    rationale:
      'Single-day blackout is Normal right-tail; multi-day “at least one” is Binomial with p from (a).',
    parts: [
      {
        label: 'Part A',
        solverId: 'normal',
        values: { mean: 1000, sd: 60, query: 'greater', x: 1100 },
        rationale: 'P(X>1100) with N(1000,60).',
        fingerprints: ['blackout on one day', 'p(blackout)'],
      },
      {
        label: 'Part B',
        solverId: 'normal',
        values: { mean: 1000, sd: 50, query: 'greater', x: 1100 },
        rationale: 'Same capacity, σ falls to 50.',
        fingerprints: ['falls to 50', 'σ falls'],
      },
      {
        label: 'Part C',
        solverId: 'normal',
        values: { mean: 1000, sd: 60, query: 'greater', x: 1200 },
        rationale: 'Capacity rises to 1,200; σ stays 60.',
        fingerprints: ['1,200', '1200', 'rises by 100'],
      },
      {
        label: 'Part D',
        solverId: 'binomial',
        values: { n: 20, p: 0.047790352, query: 'atLeast', x: 1 },
        rationale: '20 independent days; P(at least one) with p from part A.',
        fingerprints: ['20 days', 'at least one', 'repeated', 'each day'],
      },
    ],
    source: 'MMA 863 Normal / Binomial practice',
  },
  {
    id: 'photo-radar',
    title: 'Photo Radar',
    fingerprints: ['photo radar', '2000', '1%', 'ticketed', 'more than 25'],
    prompt:
      'Photo radar on exactly 2000 cars, about 1% ticketed. Probability more than 25 cars get ticketed?',
    solverId: 'binomial',
    values: { n: 2000, p: 0.01, query: 'moreThan', x: 25 },
    rationale:
      'Fixed n cars, constant ticket probability → Binomial. P(X>25)=1−BINOM.DIST(25,2000,0.01,TRUE).',
    source: 'MMA 863 Exam Practice',
  },
  {
    id: 'deck-stain-rain',
    title: 'Deck stain rain',
    fingerprints: ['stain my deck', '20% chance', 'final four hours', 'independent'],
    prompt:
      '0% rain first 20 hours, 20% each of final four hours, independent. Probability newly stained deck gets rained on?',
    solverId: 'binomial',
    values: { n: 4, p: 0.2, query: 'atLeast', x: 1 },
    rationale:
      'Four independent hour-trials with p=0.20 → Binomial. Rain = at least one success: 1−BINOM.DIST(0,4,0.2,TRUE).',
    source: 'Probability / Exam Practice',
  },
  {
    id: 'boots-normal',
    title: 'Boots price (normal day)',
    fingerprints: ['boots on amazon', 'normally distributed', 'mean of 300', 'standard deviation of 30'],
    prompt:
      'Boot price normally distributed mean 300 sd 30. Probability of a lower price than $240 on a given day?',
    solverId: 'normal',
    values: { mean: 300, sd: 30, query: 'less', x: 240 },
    rationale: 'Continuous price ~ N(300,30). P(X<240)=NORM.DIST(240,300,30,TRUE).',
    source: 'Session 4 Practice',
  },
  {
    id: 'boots-ci',
    title: 'Boots price CI (σ unknown)',
    fingerprints: ['275.80', '272.52', '95% confidence interval', 'historic prices'],
    prompt:
      'Historic boot prices: 275.80, 272.52, … n=10. 95% confidence interval for the mean price.',
    solverId: 'ci-mean-t',
    values: { xbar: 293.317, s: 21.193, n: 10, confidence: 0.95 },
    rationale: 'σ unknown, small sample → t-based CI for μ using T.INV.',
    source: 'Session 4 Practice Solutions',
  },
  {
    id: 'boots-n',
    title: 'Boots sample size',
    fingerprints: ['within $5', '95% accuracy', 'sample would i need'],
    prompt:
      'How large a sample to estimate true mean boot price within $5 with 95% accuracy (use s≈21.19)?',
    solverId: 'n-mean',
    values: { sd: 21.193, E: 5, confidence: 0.95 },
    rationale: 'Sample-size for mean: n=CEILING((z·σ/E)²).',
    source: 'Session 4 Practice Solutions',
  },
  {
    id: 'repair-uniform',
    title: 'Appliance repair arrival',
    fingerprints: ['appliance repair', 'between 8:00', '12:00 noon', 'phone call'],
    prompt:
      'Appliance repairperson arrives uniformly between 8:00 AM and 12:00 noon. Probability arrives before phone call at 10:00?',
    solverId: 'uniform',
    values: { a: 8, b: 12, lower: 8, upper: 10 },
    rationale:
      'Maximal ignorance over an interval → Uniform[8,12]. P(arrive before 10)=(10−8)/(12−8)=0.5.',
    source: 'Session 4 Practice Solutions',
  },
  {
    id: 'pizza-dough-thursday',
    title: 'Pizza dough Thursday',
    fingerprints: ['pizza restaurant', 'mean 20', 'standard deviation of 5', '100 kg of dough'],
    prompt:
      'Pizzas/hour ~ N(20,5), open 4 hours, 100 kg dough (100 pizzas). P(run out Thursday)?',
    solverId: 'normal',
    values: { mean: 80, sd: 10, query: 'greater', x: 100 },
    rationale:
      'Sum of 4 hours: N(80,10). Stockout if X>100 → 1−NORM.DIST(100,80,10,TRUE).',
    source: 'Session 4 Practice Solutions',
  },
  {
    id: 'pizza-double-cheese',
    title: 'Double cheese proportion CI',
    fingerprints: ['double cheese', '49 pizzas', '7 had double', '95 % confidence'],
    prompt:
      'Of last 49 pizzas, 7 had double cheese. 95% CI for proportion.',
    solverId: 'ci-proportion',
    values: { successes: 7, n: 49, confidence: 0.95 },
    rationale: 'Proportion CI with p̂=7/49 using NORM.S.INV.',
    source: 'Session 4 Practice Solutions',
  },
  {
    id: 'words-sample-size',
    title: 'Words with letter e · n',
    fingerprints: ['12.5%', 'letter', 'within 1%', 'confidence of 90%'],
    prompt:
      '12.5% of words contain e. Sample size to estimate within 1% at 90% confidence?',
    solverId: 'n-proportion',
    values: { p: 0.125, E: 0.01, confidence: 0.9, conservative: false },
    rationale: 'Proportion sample size with pilot p̂=0.125, E=0.01, 90% → n≈2960.',
    source: 'Session 4 Practice Solutions',
  },
  {
    id: 'alaska-fish-poisson',
    title: 'Alaska fishing · total catch',
    fingerprints: ['2 fish per hour', 'three-hour', 'five days', 'more than 130 fish'],
    prompt:
      'Typical person catches about 2 fish/hour. Four men, 3-hour tours × 5 days. P(more than 130 fish)?',
    solverId: 'poisson',
    values: { lambda: 24, hours: 5, query: 'moreThan', x: 130 },
    rationale:
      'Daily λ = 4×3×2 = 24; trip has 5 days → multiplier 5 so λ_used = 120. P(X>130)=1−POISSON.DIST(130,120,TRUE).',
    source: 'New Practice Problems 2020',
  },
  {
    id: 'kodiak-halibut-trip',
    title: 'Kodiak halibut · trip / each day / weight total',
    fingerprints: [
      'norwegian anglers',
      'halibut',
      'kodiak',
      '1.5 fish per hour',
      'more than 90 fish',
      '15 or more',
      '1,300',
      'four days',
    ],
    prompt:
      'Three Norwegian anglers, four-hour charter each of four days, 1.5 fish/hour, fish weigh ~40 lbs sd 10. (a) P(more than 90 fish during trip)? (b) P(15 or more on each of four days)? (c) P(first 30 fish weigh more than 1300 lbs)?',
    solverId: 'poisson',
    values: { lambda: 18, hours: 4, independentDays: 1, query: 'moreThan', x: 90 },
    rationale:
      'Daily λ = 3×4×1.5 = 18. (a) trip total → scale λ. (b) independent days → raise P. (c) weights → sample mean / CLT with x̄ = 1300/30.',
    parts: [
      {
        label: 'Part A',
        solverId: 'poisson',
        values: { lambda: 18, hours: 4, independentDays: 1, query: 'moreThan', x: 90 },
        rationale:
          'Trip total: λ_used = 18×4 = 72. P(X>90)=1−POISSON.DIST(90,72,TRUE).',
        fingerprints: ['more than 90 fish', 'during their trip'],
      },
      {
        label: 'Part B',
        solverId: 'poisson',
        values: {
          lambda: 18,
          hours: 1,
          independentDays: 4,
          query: 'atLeast',
          x: 15,
        },
        rationale:
          '“15 or more” → P(X≥15)=1−POISSON.DIST(14,18,TRUE). “On each of four days” → raise to 4th power (do not scale λ).',
        fingerprints: ['15 or more', 'on each of the four days'],
      },
      {
        label: 'Part C',
        solverId: 'sample-mean',
        values: {
          mean: 40,
          sd: 10,
          n: 30,
          query: 'greater',
          value: 1300 / 30,
          useFpc: false,
        },
        rationale:
          'Fish weights ~ mean 40, sd 10. First 30 fish: P(sum>1300)=P(x̄>1300/30). SE=10/√30; 1−NORM.DIST(43.333,40,SE,TRUE).',
        fingerprints: [
          'first 30 fish',
          'weigh more than',
          '1,300',
          '1300',
        ],
      },
    ],
    source: 'User practice / Alaska charter variant',
  },
  {
    id: 'kodiak-halibut-weight-total',
    title: 'Kodiak · first 30 fish weight',
    fingerprints: [
      'halibut',
      '40 lbs',
      'standard deviation of 10',
      'first 30 fish',
      '1,300',
    ],
    prompt:
      'Halibut average 40 lbs sd 10. P(first 30 fish weigh more than 1300 lbs in total)?',
    solverId: 'sample-mean',
    values: {
      mean: 40,
      sd: 10,
      n: 30,
      query: 'greater',
      value: 1300 / 30,
      useFpc: false,
    },
    rationale:
      'P(Σ>1300)=P(x̄>43.333). x̄≈N(40, 10/√30). =1−NORM.DIST(43.333,40,10/SQRT(30),TRUE).',
    source: 'User practice / Alaska charter variant',
  },
  {
    id: 'kodiak-halibut-each-day',
    title: 'Kodiak halibut · each day',
    fingerprints: [
      'norwegian anglers',
      '1.5 fish per hour',
      '15 or more',
      'on each of the four days',
    ],
    prompt:
      'Three Norwegian anglers, four-hour charter × four days, 1.5 fish/hour. P(15 or more fish on each of the four days)?',
    solverId: 'poisson',
    values: {
      lambda: 18,
      hours: 1,
      independentDays: 4,
      query: 'atLeast',
      x: 15,
    },
    rationale:
      'Daily λ=18. P(X≥15)=1−POISSON.DIST(14,18,TRUE) ≈ 0.7919; four independent days → (…)^4 ≈ 0.3933.',
    source: 'User practice / Alaska charter variant',
  },
  {
    id: 'lightning-poisson',
    title: 'Lightning strikes',
    fingerprints: ['lightning', 'once every 5 minutes', '20 min storm', 'between 5 and 7'],
    prompt:
      'Lightning about once every 5 minutes. During 20 min storm, P(between 5 and 7 strikes inclusive)?',
    solverId: 'poisson',
    values: { lambda: 4, hours: 1, query: 'atMost', x: 7 },
    rationale:
      'Every 5 min → λ=4 in 20 min. P(5≤X≤7)=POISSON.DIST(7,4,TRUE)−POISSON.DIST(4,4,TRUE).',
    source: 'New Practice Problems 2020',
  },
  {
    id: 'dice-binomial-compare',
    title: 'Dice comparison',
    fingerprints: ['6 standard dice', 'at least 3', '5 standard dice', 'at least 4'],
    prompt:
      'Which more likely: 6 dice get 5 or 6 on ≥3; or 5 dice get 4/5/6 on ≥4?',
    solverId: 'binomial',
    values: { n: 6, p: 1 / 3, query: 'atLeast', x: 3 },
    rationale:
      'Both Binomial: (a) n=6,p=1/3; (b) n=5,p=1/2. Compare 1−BINOM.DIST(k−1,…).',
    parts: [
      {
        label: 'Part A',
        solverId: 'binomial',
        values: { n: 6, p: 1 / 3, query: 'atLeast', x: 3 },
        rationale: 'P(5 or 6)=2/6=1/3. P(X≥3)=1−BINOM.DIST(2,6,1/3,TRUE).',
      },
      {
        label: 'Part B',
        solverId: 'binomial',
        values: { n: 5, p: 0.5, query: 'atLeast', x: 4 },
        rationale: 'P(4,5,6)=3/6=1/2. P(X≥4)=1−BINOM.DIST(3,5,0.5,TRUE).',
      },
    ],
    source: 'New Practice Problems 2020',
  },
  {
    id: 'z-unknown-lower',
    title: 'Standard normal · unknown lower bound',
    fingerprints: ['? < z <', 'p(? < z < 1)', '= 0.1'],
    prompt: 'P(? < Z < 1) = 0.1. Find the missing lower z-value.',
    solverId: 'standard-normal',
    values: { query: 'invBetweenLow', zHigh: 1, probability: 0.1 },
    rationale:
      'Z ~ N(0,1). Φ(1) − Φ(z*) = 0.1 → z* = NORM.S.INV(NORM.S.DIST(1,TRUE) − 0.1).',
    source: 'MMA 863 Z-table practice',
  },
  {
    id: 'z-unknown-upper',
    title: 'Standard normal · unknown upper bound',
    fingerprints: ['-1 < z < z', 'find z such that', '= 0.5'],
    prompt: 'Find z such that P(-1 < Z < z) = 0.5.',
    solverId: 'standard-normal',
    values: { query: 'invBetweenHigh', zLow: -1, probability: 0.5 },
    rationale:
      'Φ(z*) − Φ(−1) = 0.5 → z* = NORM.S.INV(NORM.S.DIST(-1,TRUE) + 0.5).',
    source: 'MMA 863 Z-table practice',
  },
  {
    id: 'calvin-pass',
    title: 'Calvin’s true/false exam',
    fingerprints: ['true-false', 'flip-a-coin', '20-question', '10 or more'],
    prompt:
      '20-question true-false exam, flip-a-coin, p=0.5. P(10 or more correct) and P(exactly 15)?',
    solverId: 'binomial',
    values: { n: 20, p: 0.5, query: 'atLeast', x: 10, x2: 15 },
    rationale: 'Fixed trials, success/failure, constant p → Binomial.',
    source: 'MMA 863 Statistics Review',
  },
  {
    id: 'support-poisson',
    title: 'Support call volume',
    fingerprints: ['support', 'poisson', '1.5 per hour', 'more than four'],
    prompt:
      'Support requests Poisson mean 1.5/hour. P(no problems in an hour); P(more than 4 in 2 hours).',
    solverId: 'poisson',
    values: { lambda: 1.5, hours: 1, query: 'equal', x: 0 },
    rationale: 'Counts at a rate over an interval → Poisson.',
    source: 'MMA 863 Statistics Review',
  },
  {
    id: 'gas-uniform',
    title: 'Gasoline sales',
    fingerprints: ['gasoline', 'uniformly distributed', '2,000', '5,000'],
    prompt:
      'Gasoline sold daily Uniform(2000,5000). P(2500–3000), P(≥4000), P(exactly 2500).',
    solverId: 'uniform',
    values: {
      a: 2000,
      b: 5000,
      lower: 2500,
      upper: 3000,
      atLeast: 4000,
      exact: 2500,
    },
    rationale: 'Equal likelihood over a range → Uniform length ratios.',
    source: 'MMA 863 Statistics Review',
  },
  {
    id: 'fishing-normal',
    title: 'Lake trout weights',
    fingerprints: ['lake trout', '15 kg', 'standard deviation of 3', 'little duck'],
    prompt: 'Fish weight ~ N(15,3). P(X>16) and P(8<X<19).',
    solverId: 'normal',
    values: { mean: 15, sd: 3, query: 'greater', x: 16, lower: 8, upper: 19 },
    rationale: 'Continuous normal measurement → NORM.DIST.',
    source: 'MMA 863 Statistics Review',
  },
  {
    id: 'inspection-ci',
    title: 'Home inspection win rate CI',
    fingerprints: ['home inspection', '$800', '30 jobs', 'sold the jobs 8'],
    prompt:
      'Quoted $800 for 30 jobs, sold 8. 95% CI for proportion of jobs at new price.',
    solverId: 'ci-proportion',
    values: { successes: 8, n: 30, confidence: 0.95 },
    rationale: 'Sample proportion CI from successes/n.',
    source: 'New Practice Problems 2020',
  },
  {
    id: 'toronto-within-sd',
    title: 'Toronto rentals · within one σ of mean',
    fingerprints: [
      'toronto',
      '10,000',
      '10000',
      'within one standard deviation',
      'sample mean with n of 36',
    ],
    prompt:
      'Toronto rental market 10,000 units. Prices mean $2000 sd $240 (not normal). P(sample mean with n=36 within one standard deviation i.e. $240 of the actual mean)?',
    solverId: 'sample-mean',
    values: {
      mean: 2000,
      sd: 240,
      n: 36,
      N: 10000,
      query: 'between',
      lower: 1760,
      upper: 2240,
      useFpc: false,
    },
    rationale:
      'Within $240 of μ → lower=2000−240=1760, upper=2240. SE=240/√36=40; FPC negligible (n≪N/20).',
    source: 'User practice / apartment rental variant',
  },
  {
    id: 'widgets-within-2',
    title: 'Widgets · within 2 of mean',
    fingerprints: ['widgets', 'within 2 of', 'true mean', 'sample of 25'],
    prompt:
      'Widgets have mean 50 and standard deviation 4. Sample of 25. Probability the sample mean is within 2 of the true mean?',
    solverId: 'sample-mean',
    values: {
      mean: 50,
      sd: 4,
      n: 25,
      query: 'between',
      lower: 48,
      upper: 52,
      useFpc: false,
    },
    rationale:
      'Within 2 of μ → lower=48, upper=52. SE=4/√25=0.8; P via NORM.DIST difference.',
    source: 'Synthetic within-of-mean regression',
  },
  {
    id: 'paint-ci-known-sigma',
    title: 'Paint fill machine · CI σ known',
    fingerprints: [
      'paint',
      'containers',
      '1,000 ml',
      '1000 ml',
      'fill rate is 21',
      'average is found to be 995',
      'sample of 49',
    ],
    prompt:
      'Paint machine supposed to fill 1000 ml, σ=21 known. Sample of 49, average found to be 995. Construct 95% CI for μ.',
    solverId: 'ci-mean-z',
    values: { xbar: 995, sd: 21, n: 49, confidence: 0.95 },
    rationale:
      'x̄=995 (not the 1000 target), σ=21, n=49. CI = x̄ ± NORM.S.INV(0.975)·21/√49.',
    source: 'User practice / paint fill machine',
  },
  {
    id: 'paint-ci-proportion',
    title: 'Paint fill · under-filled proportion CI',
    fingerprints: [
      'under-filled',
      'underfilled',
      '78 of them',
      'sample of 100',
      'proportion of those',
    ],
    prompt:
      'Paint fill machine. Sample of 100, 78 under-filled. 95% CI for the under-filled proportion.',
    solverId: 'ci-proportion',
    values: { successes: 78, n: 100, confidence: 0.95 },
    rationale:
      'p̂=78/100=0.78. CI = p̂ ± NORM.S.INV(0.975)·√(p̂(1−p̂)/n). Field is successes (not x).',
    source: 'User practice / paint fill machine part b',
  },
  {
    id: 'apartment-n-mean',
    title: 'Apartment rents · required sample size (mean)',
    fingerprints: [
      'how large a sample would you require',
      'within approximately',
      'actual figure',
      'standard deviation of $240',
      'nor is the mean known',
    ],
    prompt:
      'Apartment prices sd $240, mean unknown. (a) Sample size for estimate within ~$100 at 95%? (b) Within ~$50 at 95%?',
    solverId: 'n-mean',
    values: { sd: 240, E: 100, confidence: 0.95 },
    rationale:
      'n = CEILING((z* σ / E)^2). E=100 → n=23; E=50 → n=89. Not a CI (no x̄).',
    parts: [
      {
        label: 'Part A',
        solverId: 'n-mean',
        values: { sd: 240, E: 100, confidence: 0.95 },
        rationale: 'E=100, σ=240, 95% → n=23.',
        fingerprints: ['within approximately $100', 'within approximately $100'],
      },
      {
        label: 'Part B',
        solverId: 'n-mean',
        values: { sd: 240, E: 50, confidence: 0.95 },
        rationale: 'E=50, σ=240, 95% → n=89.',
        fingerprints: ['within approximately $50'],
      },
    ],
    source: 'MMA 863 Statistics Review · Estimating n for Means',
  },
  {
    id: 'toronto-n-proportion',
    title: 'Toronto high-priced · required sample size (proportion)',
    fingerprints: [
      'how large a sample would you need',
      'within 0.05 of the actual value',
      'previous study suggests that 10%',
      'be conservative',
      'high-priced',
    ],
    prompt:
      'Toronto high-priced apartments; pilot 10%. (a) Sample size within 0.05 at 95% using pilot? (b) Conservative p=0.5?',
    solverId: 'n-proportion',
    values: { p: 0.1, E: 0.05, confidence: 0.95, conservative: false },
    rationale:
      'Pilot: n=CEILING(z²p(1−p)/E²). Conservative uses p=0.5.',
    parts: [
      {
        label: 'Part A',
        solverId: 'n-proportion',
        values: { p: 0.1, E: 0.05, confidence: 0.95, conservative: false },
        rationale: 'Pilot p=0.1.',
        fingerprints: ['pilot study', 'previous study', 'treat the previous'],
      },
      {
        label: 'Part B',
        solverId: 'n-proportion',
        values: { p: 0.5, E: 0.05, confidence: 0.95, conservative: true },
        rationale: 'Conservative p=0.5.',
        fingerprints: ['be conservative', 'conservative'],
      },
    ],
    source: 'MMA 863 Statistics Review · Estimating n for Proportions',
  },
]
