import type { SolveResult } from '../solvers/types'
import { DiagramView } from './DiagramView'

export function WalkthroughPanel({ result }: { result: SolveResult }) {
  const { walkthrough, lines, excelCalls, note } = result

  return (
    <div className="walkthrough">
      <header className="walkthrough-head">
        <h3>{walkthrough.title}</h3>
        <div className="walkthrough-meta">
          <div>
            <span className="meta-label">Distribution</span>
            <p>{walkthrough.distribution}</p>
          </div>
          <div>
            <span className="meta-label">Find</span>
            <p>{walkthrough.find}</p>
          </div>
        </div>
      </header>

      {walkthrough.diagram ? <DiagramView diagram={walkthrough.diagram} /> : null}

      <ol className="method-steps">
        {walkthrough.steps.map((s) => (
          <li key={s.number} className="method-step">
            <div className="step-badge">{s.number}</div>
            <div className="step-body">
              <h4>{s.title}</h4>
              {s.body.split('\n').map((para) => (
                <p key={para}>{para}</p>
              ))}
              {s.excel && s.excel.length > 0 ? (
                <div className="excel-calls">
                  {s.excel.map((call) => (
                    <code key={call}>{call}</code>
                  ))}
                </div>
              ) : null}
              {s.values && s.values.length > 0 ? (
                <dl className="lines compact">
                  {s.values.map((v) => (
                    <div key={v.label} className="line">
                      <dt>{v.label}</dt>
                      <dd>{v.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <section className="final-answers">
        <h4>Final answers</h4>
        <div className="excel-calls">
          {excelCalls.map((call) => (
            <code key={call}>{call}</code>
          ))}
        </div>
        <dl className="lines">
          {lines.map((line) => (
            <div
              key={line.label}
              className={line.emphasis ? 'line emphasis' : 'line'}
            >
              <dt>{line.label}</dt>
              <dd>{line.value}</dd>
            </div>
          ))}
        </dl>
        <p className="explanation">{walkthrough.explanation}</p>
        {note ? <p className="note">{note}</p> : null}
      </section>
    </div>
  )
}
