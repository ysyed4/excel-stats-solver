export type SolverId =
  | 'binomial'
  | 'poisson'
  | 'uniform'
  | 'normal'
  | 'standard-normal'
  | 't-dist'
  | 'sample-mean'
  | 'sample-proportion'
  | 'ci-mean-z'
  | 'ci-mean-t'
  | 'ci-proportion'
  | 'n-mean'
  | 'n-proportion'

export type CategoryId = 'discrete' | 'continuous' | 'sampling'

export interface SolverMeta {
  id: SolverId
  category: CategoryId
  title: string
  excel: string
  blurb: string
}

export interface ExampleProblem {
  id: string
  solverId: SolverId
  title: string
  prompt: string
  values: Record<string, string | number | boolean>
}

export interface SolveLine {
  label: string
  value: string
  emphasis?: boolean
}

export interface WalkthroughStep {
  number: number
  title: string
  body: string
  excel?: string[]
  values?: { label: string; value: string }[]
}

export interface NumberLineDiagram {
  kind: 'number-line'
  min: number
  max: number
  marks: { value: number; label: string }[]
  highlightFrom?: number
  highlightTo?: number
  caption?: string
}

export interface UniformBarDiagram {
  kind: 'uniform-bar'
  a: number
  b: number
  regions: { from: number; to: number; label?: string }[]
  caption?: string
}

export interface NormalShadeDiagram {
  kind: 'normal-shade'
  mean: number
  sd: number
  shade: 'left' | 'right' | 'between' | 'two-tail' | 'none'
  x?: number
  lower?: number
  upper?: number
  caption?: string
}

export interface CiIntervalDiagram {
  kind: 'ci-interval'
  center: number
  lower: number
  upper: number
  caption?: string
}

export type Diagram =
  | NumberLineDiagram
  | UniformBarDiagram
  | NormalShadeDiagram
  | CiIntervalDiagram

export interface Walkthrough {
  title: string
  distribution: string
  find: string
  steps: WalkthroughStep[]
  diagram?: Diagram
  explanation: string
}

export interface SolveResult {
  excelCalls: string[]
  lines: SolveLine[]
  note?: string
  walkthrough: Walkthrough
}

export const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'discrete', label: 'Discrete' },
  { id: 'continuous', label: 'Continuous' },
  { id: 'sampling', label: 'Sampling & CI' },
]

export const SOLVERS: SolverMeta[] = [
  {
    id: 'binomial',
    category: 'discrete',
    title: 'Binomial',
    excel: 'BINOM.DIST',
    blurb: 'Fixed trials, success/failure, constant p.',
  },
  {
    id: 'poisson',
    category: 'discrete',
    title: 'Poisson',
    excel: 'POISSON.DIST',
    blurb: 'Counts over a fixed interval at rate λ.',
  },
  {
    id: 'uniform',
    category: 'continuous',
    title: 'Uniform',
    excel: 'range ratios',
    blurb: 'Equal likelihood over [a, b]; probability = length ratio.',
  },
  {
    id: 'normal',
    category: 'continuous',
    title: 'Normal',
    excel: 'NORM.DIST / NORM.INV',
    blurb: 'General normal with mean μ and sd σ.',
  },
  {
    id: 'standard-normal',
    category: 'continuous',
    title: 'Standard Normal',
    excel: 'NORM.S.DIST / NORM.S.INV',
    blurb: 'Z ~ N(0, 1) lookups and inverses.',
  },
  {
    id: 't-dist',
    category: 'continuous',
    title: 't Distribution',
    excel: 'T.DIST / T.INV',
    blurb: 'Student-t lookups when σ is estimated by s.',
  },
  {
    id: 'sample-mean',
    category: 'sampling',
    title: 'Sample Mean',
    excel: 'NORM.DIST + SE',
    blurb: 'P(x̄ …) using CLT / known-σ sampling distribution.',
  },
  {
    id: 'sample-proportion',
    category: 'sampling',
    title: 'Sample Proportion',
    excel: 'NORM.DIST + SE',
    blurb: 'P(p̂ …) when np and n(1−p) conditions hold.',
  },
  {
    id: 'ci-mean-z',
    category: 'sampling',
    title: 'CI · Mean (σ known)',
    excel: 'NORM.S.INV',
    blurb: 'z-based confidence interval for μ.',
  },
  {
    id: 'ci-mean-t',
    category: 'sampling',
    title: 'CI · Mean (σ unknown)',
    excel: 'T.INV',
    blurb: 't-based confidence interval using sample sd s.',
  },
  {
    id: 'ci-proportion',
    category: 'sampling',
    title: 'CI · Proportion',
    excel: 'NORM.S.INV',
    blurb: 'Approximate CI for p using p̂.',
  },
  {
    id: 'n-mean',
    category: 'sampling',
    title: 'Sample Size · Mean',
    excel: 'NORM.S.INV',
    blurb: 'Minimum n for margin of error E on a mean.',
  },
  {
    id: 'n-proportion',
    category: 'sampling',
    title: 'Sample Size · Proportion',
    excel: 'NORM.S.INV',
    blurb: 'Minimum n for margin of error E on a proportion.',
  },
]
