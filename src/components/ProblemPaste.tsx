import { useState } from 'react'
import { detectProblem } from '../solvers/aiDetect'
import {
  parseProblemText,
  type ParseResult,
  type ParsedPart,
} from '../solvers/parseProblem'

interface ProblemPasteProps {
  onParsed: (result: ParseResult, part?: ParsedPart) => void
  parts?: ParsedPart[]
  activePartId?: string | null
  onSelectPart?: (part: ParsedPart) => void
}

export function ProblemPaste({
  onParsed,
  parts,
  activePartId,
  onSelectPart,
}: ProblemPasteProps) {
  const [text, setText] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function applyResult(
    result: ParseResult,
    source: 'ai' | 'local',
    message?: string,
  ) {
    if (result.confidence === 'low' && Object.keys(result.values).length === 0) {
      setError(result.notes.join(' '))
      setStatus(result.summary)
      return
    }
    onParsed(result, result.parts?.[0])
    const src =
      source === 'ai' ? 'AI' : 'Local training corpus / heuristics'
    setStatus(
      `${result.summary} · via ${src}${result.family ? ` · ${result.family}` : ''}${
        message ? ` — ${message}` : ''
      }`,
    )
  }

  function handleLocal() {
    setError(null)
    const result = parseProblemText(text)
    if (!result) {
      setError('Paste a longer problem statement first.')
      setStatus(null)
      return
    }
    applyResult(result, 'local')
  }

  async function handleAi() {
    setError(null)
    setBusy(true)
    try {
      const { result, source, message } = await detectProblem(text)
      applyResult(result, source, message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detection failed')
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="paste-box">
      <div className="paste-head">
        <h3>Paste a problem</h3>
        <p>
          Paste the full wording — you don’t need to name the distribution.
          Optional AI uses <strong>Claude</strong>, <strong>ChatGPT</strong>, or{' '}
          <strong>Gemini</strong> when an API key is set in <code>.env</code>.
        </p>
      </div>
      <textarea
        className="paste-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={7}
        placeholder={`Example:\nA red car drives by about once every 2 minutes. About 30% of cars are blue. Which is more probable:\na. If I watch for 20 minutes I will see more than 9 red cars; or\nb. of the next 15 cars that I see five or more will be blue?`}
      />
      <div className="paste-actions">
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => void handleAi()}
        >
          {busy ? 'Detecting…' : 'Detect & autofill'}
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={busy}
          onClick={handleLocal}
        >
          Detect locally only
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={busy}
          onClick={() => {
            setText('')
            setStatus(null)
            setError(null)
          }}
        >
          Clear
        </button>
      </div>
      <p className="paste-hint">
        Set <code>ANTHROPIC_API_KEY</code>, <code>OPENAI_API_KEY</code>, or{' '}
        <code>GEMINI_API_KEY</code> in <code>.env</code>, then restart{' '}
        <code>npm run dev</code>. Optional:{' '}
        <code>AI_PROVIDER=anthropic|openai|gemini</code>. Without a key, Detect
        falls back to local heuristics.
      </p>
      {status ? <p className="paste-status">{status}</p> : null}
      {error ? <p className="paste-error">{error}</p> : null}

      {parts && parts.length > 1 ? (
        <div className="part-switcher">
          <span className="examples-label">
            This problem has multiple setups — pick a part
          </span>
          <div className="example-row">
            {parts.map((part) => (
              <button
                key={part.id}
                type="button"
                className={
                  part.id === activePartId ? 'example part active' : 'example part'
                }
                title={part.rationale}
                onClick={() => onSelectPart?.(part)}
              >
                {part.label}: {part.solverId}
              </button>
            ))}
          </div>
          {parts.map((part) =>
            part.id === activePartId ? (
              <p key={`${part.id}-why`} className="part-why">
                {part.rationale}
              </p>
            ) : null,
          )}
        </div>
      ) : null}
    </section>
  )
}
