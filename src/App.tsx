import { useDeferredValue, useMemo, useState } from 'react'
import { ProblemPaste } from './components/ProblemPaste'
import { SolverForm } from './components/SolverForm'
import { WalkthroughPanel } from './components/WalkthroughPanel'
import { solve } from './solvers/compute'
import { EXAMPLES } from './solvers/examples'
import type { ParseResult, ParsedPart } from './solvers/parseProblem'
import { mergeAutofillValues } from './solvers/values'
import { enrichSolverValues } from './solvers/parseProblem'
import {
  CATEGORIES,
  SOLVERS,
  type CategoryId,
  type SolverId,
} from './solvers/types'
import './App.css'

export const DEFAULTS: Record<SolverId, Record<string, string | number | boolean>> = {
  binomial: { n: 20, p: 0.5, query: 'atLeast', x: 10, x2: 15 },
  poisson: { lambda: 1.5, hours: 1, independentDays: 1, query: 'equal', x: 0 },
  uniform: {
    a: 2000,
    b: 5000,
    lower: 2500,
    upper: 3000,
    atLeast: 4000,
    exact: 2500,
  },
  normal: { mean: 15, sd: 3, query: 'greater', x: 16, lower: 8, upper: 19 },
  'standard-normal': {
    query: 'less',
    z: 1,
    zLow: -1,
    zHigh: 1,
    probability: 0.975,
  },
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
  const [solverId, setSolverId] = useState<SolverId>('binomial')
  const [values, setValues] = useState(DEFAULTS.binomial)
  const [parsedParts, setParsedParts] = useState<ParsedPart[] | undefined>()
  const [activePartId, setActivePartId] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)

  const meta = SOLVERS.find((s) => s.id === solverId)!
  const examples = EXAMPLES.filter((e) => e.solverId === solverId)

  // Defer solve so mid-keystroke empty fields don't immediately blank the panel
  // with a misleading validation error while the other bound still looks filled.
  const deferredValues = useDeferredValue(values)

  const result = useMemo(() => {
    try {
      return { ok: true as const, data: solve(solverId, deferredValues) }
    } catch (err) {
      return {
        ok: false as const,
        message: err instanceof Error ? err.message : 'Could not solve',
      }
    }
  }, [solverId, deferredValues])

  function fillSolver(
    id: SolverId,
    next: Record<string, string | number | boolean>,
    fromAutofill = false,
  ) {
    setSolverId(id)
    setValues(
      fromAutofill
        ? mergeAutofillValues(id, DEFAULTS[id], next)
        : { ...DEFAULTS[id], ...next },
    )
    setFormKey((k) => k + 1)
  }

  function selectSolver(id: SolverId) {
    fillSolver(id, DEFAULTS[id], false)
    setParsedParts(undefined)
    setActivePartId(null)
  }

  function loadExample(id: string) {
    const example = EXAMPLES.find((e) => e.id === id)
    if (!example) return
    fillSolver(example.solverId, example.values, true)
    setParsedParts(undefined)
    setActivePartId(null)
  }

  function applyPart(part: ParsedPart) {
    // Always materialize every field the part implies — never show rationale-only
    // prose while the form underneath is empty / unsolvable.
    const enriched = enrichSolverValues(part.solverId, part.rationale, part.values)
    fillSolver(part.solverId, enriched, true)
    setActivePartId(part.id)
  }

  function applyParsed(parsed: ParseResult, part?: ParsedPart) {
    const hasValues = Object.keys(parsed.values ?? {}).length > 0
    if (parsed.confidence === 'low' && !hasValues && !parsed.parts?.length) {
      return
    }
    if (parsed.parts && parsed.parts.length > 0) {
      setParsedParts(parsed.parts)
      applyPart(part ?? parsed.parts[0])
      return
    }
    setParsedParts(undefined)
    setActivePartId(null)
    const enriched = enrichSolverValues(
      parsed.solverId,
      parsed.summary ?? '',
      parsed.values ?? {},
    )
    fillSolver(parsed.solverId, enriched, true)
  }

  return (
    <div className="shell">
      <aside className="toc" aria-label="Table of contents">
        <div className="toc-brand">
          <p className="brand">Excel Stats Solver</p>
          <p className="toc-tag">MMA 863 · Excel lookups</p>
        </div>

        <nav className="toc-nav">
          {CATEGORIES.map((category) => (
            <TocSection
              key={category.id}
              category={category.id}
              label={category.label}
              activeId={solverId}
              onSelect={selectSolver}
            />
          ))}
        </nav>
      </aside>

      <div className="workspace">
        <header className="hero">
          <h1>{meta.title}</h1>
          <p className="lede">{meta.blurb}</p>
          <code className="excel-pill">{meta.excel}</code>
        </header>

        <ProblemPaste
          onParsed={applyParsed}
          parts={parsedParts}
          activePartId={activePartId}
          onSelectPart={applyPart}
        />

        <main className="panel" id="solver-inputs">
          {examples.length > 0 ? (
            <div className="examples">
              <span className="examples-label">Quick-load curated example</span>
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

          <h2 className="section-title">Inputs</h2>
          <SolverForm
            key={`${solverId}-${formKey}`}
            solverId={solverId}
            values={values}
            onChange={(key, value) =>
              setValues((prev) => ({ ...prev, [key]: value }))
            }
          />

          <section className="results" aria-live="polite">
            <h2 className="section-title">Solution walkthrough</h2>
            {result.ok ? (
              <WalkthroughPanel result={result.data} />
            ) : (
              <p className="error">{result.message}</p>
            )}
          </section>
        </main>

        <footer className="footer">
          <p>
            Paste a problem to autofill, or pick a solver from the left. Answers
            use Excel-style functions (e.g. P(X ≥ 10) → 1 − BINOM.DIST(9, n, p,
            TRUE)), not closed-form PMF formulas.
          </p>
        </footer>
      </div>
    </div>
  )
}

function TocSection({
  category,
  label,
  activeId,
  onSelect,
}: {
  category: CategoryId
  label: string
  activeId: SolverId
  onSelect: (id: SolverId) => void
}) {
  const items = SOLVERS.filter((s) => s.category === category)
  return (
    <div className="toc-section">
      <h2>{label}</h2>
      <ol>
        {items.map((s, index) => (
          <li key={s.id}>
            <button
              type="button"
              className={s.id === activeId ? 'toc-link active' : 'toc-link'}
              onClick={() => onSelect(s.id)}
            >
              <span className="toc-index">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="toc-text">
                <span className="toc-title">{s.title}</span>
                <span className="toc-excel">{s.excel}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default App
