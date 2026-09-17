import { useMemo, useState } from 'react'
import { SolverForm } from './components/SolverForm'
import { WalkthroughPanel } from './components/WalkthroughPanel'
import { solve } from './solvers/compute'
import { EXAMPLES } from './solvers/examples'
import {
  CATEGORIES,
  SOLVERS,
  type CategoryId,
  type SolverId,
} from './solvers/types'
import './App.css'

const DEFAULTS: Record<SolverId, Record<string, string | number | boolean>> = {
  binomial: { n: 20, p: 0.5, query: 'atLeast', x: 10, x2: 15 },
  poisson: { lambda: 1.5, hours: 1, query: 'equal', x: 0 },
  uniform: {
    a: 2000,
    b: 5000,
    lower: 2500,
    upper: 3000,
    atLeast: 4000,
    exact: 2500,
  },
  normal: { mean: 15, sd: 3, query: 'greater', x: 16, lower: 8, upper: 19 },
  'standard-normal': { query: 'less', z: 1, zLow: -1, zHigh: 1 },
  't-dist': { df: 30, query: 'invRight', alpha: 0.1, t: 2.04 },
  'sample-mean': {
    mean: 2000,
    sd: 240,
    n: 36,
    query: 'greater',
    value: 2080,
    N: '',
    useFpc: false,
  },
  'sample-proportion': { p: 0.2, n: 30, query: 'greater', value: 0.25 },
  'ci-mean-z': { xbar: 2100, sd: 240, n: 36, confidence: 0.95 },
  'ci-mean-t': { xbar: 995, s: 21, n: 49, confidence: 0.95 },
  'ci-proportion': { successes: 12, n: 50, confidence: 0.95 },
  'n-mean': { sd: 240, E: 100, confidence: 0.95 },
  'n-proportion': { p: 0.1, E: 0.05, confidence: 0.95, conservative: false },
}

function App() {
  const [category, setCategory] = useState<CategoryId>('discrete')
  const [solverId, setSolverId] = useState<SolverId>('binomial')
  const [values, setValues] = useState(DEFAULTS.binomial)

  const solvers = SOLVERS.filter((s) => s.category === category)
  const meta = SOLVERS.find((s) => s.id === solverId)!
  const examples = EXAMPLES.filter((e) => e.solverId === solverId)

  const result = useMemo(() => {
    try {
      return { ok: true as const, data: solve(solverId, values) }
    } catch (err) {
      return {
        ok: false as const,
        message: err instanceof Error ? err.message : 'Could not solve',
      }
    }
  }, [solverId, values])

  function selectCategory(next: CategoryId) {
    setCategory(next)
    const first = SOLVERS.find((s) => s.category === next)!
    setSolverId(first.id)
    setValues({ ...DEFAULTS[first.id] })
  }

  function selectSolver(id: SolverId) {
    setSolverId(id)
    setValues({ ...DEFAULTS[id] })
  }

  function loadExample(id: string) {
    const example = EXAMPLES.find((e) => e.id === id)
    if (!example) return
    setValues({ ...DEFAULTS[example.solverId], ...example.values })
  }

  return (
    <div className="app">
      <header className="hero">
        <p className="brand">Excel Stats Solver</p>
        <h1>Solve probability problems the Excel way</h1>
        <p className="lede">
          Discrete and continuous lookups using the same function names as
          Microsoft Excel — <code>BINOM.DIST</code>, <code>POISSON.DIST</code>,{' '}
          <code>NORM.DIST</code>, <code>T.INV</code>, and more. Built around MMA
          863 review problems.
        </p>
      </header>

      <nav className="tabs" aria-label="Problem category">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={c.id === category ? 'tab active' : 'tab'}
            onClick={() => selectCategory(c.id)}
          >
            {c.label}
          </button>
        ))}
      </nav>

      <div className="layout">
        <aside className="rail">
          <h2>Solvers</h2>
          <ul className="solver-list">
            {solvers.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={s.id === solverId ? 'solver active' : 'solver'}
                  onClick={() => selectSolver(s.id)}
                >
                  <span className="solver-title">{s.title}</span>
                  <span className="solver-excel">{s.excel}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="panel">
          <div className="panel-head">
            <div>
              <h2>{meta.title}</h2>
              <p>{meta.blurb}</p>
            </div>
            <code className="excel-pill">{meta.excel}</code>
          </div>

          {examples.length > 0 ? (
            <div className="examples">
              <span className="examples-label">Load example</span>
              <div className="example-row">
                {examples.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    className="example"
                    title={ex.prompt}
                    onClick={() => loadExample(ex.id)}
                  >
                    {ex.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <SolverForm
            solverId={solverId}
            values={values}
            onChange={(key, value) =>
              setValues((prev) => ({ ...prev, [key]: value }))
            }
          />

          <section className="results" aria-live="polite">
            <h3>Solution walkthrough</h3>
            {result.ok ? (
              <WalkthroughPanel result={result.data} />
            ) : (
              <p className="error">{result.message}</p>
            )}
          </section>
        </main>
      </div>

      <footer className="footer">
        <p>
          Probabilities come from Excel-style distribution functions, not
          hand-written closed-form PMF definitions. Translate inequalities the
          way the course does: e.g. P(X ≥ 10) → 1 − BINOM.DIST(9, n, p, TRUE).
        </p>
      </footer>
    </div>
  )
}

export default App
