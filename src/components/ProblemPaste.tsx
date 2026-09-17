import { useRef, useState } from 'react'
import { detectProblem } from '../solvers/aiDetect'
import {
  parseProblemText,
  pickBestPart,
  type ParseResult,
  type ParsedPart,
} from '../solvers/parseProblem'

interface ProblemPasteProps {
  onParsed: (result: ParseResult, part?: ParsedPart) => void
  parts?: ParsedPart[]
  activePartId?: string | null
  onSelectPart?: (part: ParsedPart) => void
}

function summarizeValues(
  values: Record<string, string | number | boolean>,
): string {
  const keys = [
    'lambda',
    'hours',
    'independentDays',
    'n',
    'p',
    'query',
    'x',
    'mean',
    'sd',
  ]
  const bits = keys
    .filter((k) => values[k] !== undefined && values[k] !== '')
    .map((k) => `${k}=${String(values[k])}`)
  return bits.length ? bits.join(', ') : 'defaults'
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
  const textRef = useRef<HTMLTextAreaElement>(null)

  function currentText(): string {
    // Prefer live DOM value so paste + immediate click never races React state
    return (textRef.current?.value ?? text).trim()
  }

  function applyResult(
    result: ParseResult,
    source: 'ai' | 'local',
    message?: string,
    sourceText?: string,
  ) {
    const hasValues = Object.keys(result.values ?? {}).length > 0
    if (result.confidence === 'low' && !hasValues && !result.parts?.length) {
      setError(result.notes.join(' ') || 'Could not detect a solver from this text.')
      setStatus(result.summary)
      return
    }

    const chosen =
      result.parts && result.parts.length > 0
        ? pickBestPart(result.parts, sourceText ?? currentText())
        : undefined

    onParsed(result, chosen ?? result.parts?.[0])

    const filled = summarizeValues(chosen?.values ?? result.values ?? {})
    const src =
      source === 'ai' ? 'AI' : 'Local training corpus / heuristics'
    const partNote = chosen ? ` · loaded ${chosen.label}` : ''
    setError(null)
    setStatus(
      `${result.summary}${partNote} · filled ${filled} · via ${src}${
        result.family ? ` · ${result.family}` : ''
      }${message ? ` — ${message}` : ''}`,
    )

    // Bring the Inputs panel into view after autofill
    requestAnimationFrame(() => {
      document.getElementById('solver-inputs')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  function handleLocal() {
    setError(null)
    const raw = currentText()
    if (raw.length < 12) {
      setError('Paste a longer problem statement first.')
      setStatus(null)
      return
    }
    // Keep React state in sync if DOM was ahead
    if (raw !== text.trim()) setText(raw)

    const result = parseProblemText(raw)
    if (!result) {
      setError('Paste a longer problem statement first.')
      setStatus(null)
      return
    }
    applyResult(result, 'local', undefined, raw)
  }

  async function handleAi() {
    setError(null)
    setBusy(true)
    const raw = currentText()
    if (raw.length < 12) {
      setError('Paste a longer problem statement first.')
      setStatus(null)
      setBusy(false)
      return
    }
    if (raw !== text.trim()) setText(raw)

    try {
      const { result, source, message } = await detectProblem(raw)
      applyResult(result, source, message, raw)
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
        ref={textRef}
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
            if (textRef.current) textRef.current.value = ''
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
