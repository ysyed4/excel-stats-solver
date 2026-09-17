import type { Diagram } from '../solvers/types'

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x))
}

function NumberLine({ diagram }: { diagram: Extract<Diagram, { kind: 'number-line' }> }) {
  const { min, max, marks, highlightFrom, highlightTo, caption } = diagram
  const span = max - min || 1
  const toPct = (v: number) => `${clamp01((v - min) / span) * 100}%`
  const hiFrom = highlightFrom ?? min
  const hiTo = highlightTo ?? hiFrom
  const left = Math.min(hiFrom, hiTo)
  const right = Math.max(hiFrom, hiTo)

  return (
    <div className="diagram">
      <div className="number-line">
        <div
          className="number-line-shade"
          style={{
            left: toPct(left),
            width: `${Math.max(1.2, ((right - left) / span) * 100)}%`,
          }}
        />
        <div className="number-line-track" />
        {marks.map((m) => (
          <div
            key={`${m.value}-${m.label}`}
            className="number-line-mark"
            style={{ left: toPct(m.value) }}
          >
            <span className="tick" />
            <span className="tick-label">{m.label}</span>
          </div>
        ))}
      </div>
      {caption ? <p className="diagram-caption">{caption}</p> : null}
    </div>
  )
}

function UniformBar({ diagram }: { diagram: Extract<Diagram, { kind: 'uniform-bar' }> }) {
  const { a, b, regions, caption } = diagram
  const span = b - a || 1
  const toPct = (v: number) => clamp01((v - a) / span) * 100

  return (
    <div className="diagram">
      <div className="uniform-bar">
        <div className="uniform-rect" />
        {regions.map((r, i) => {
          const left = toPct(Math.min(r.from, r.to))
          const width = Math.max(0.8, toPct(Math.max(r.from, r.to)) - left)
          return (
            <div
              key={`${r.from}-${r.to}-${i}`}
              className="uniform-shade"
              style={{ left: `${left}%`, width: `${width}%` }}
              title={r.label}
            />
          )
        })}
        <div className="uniform-labels">
          <span>{a}</span>
          <span>{b}</span>
        </div>
      </div>
      {caption ? <p className="diagram-caption">{caption}</p> : null}
    </div>
  )
}

function NormalShade({ diagram }: { diagram: Extract<Diagram, { kind: 'normal-shade' }> }) {
  const { mean, sd, shade, x, lower, upper, caption } = diagram
  const width = 320
  const height = 110
  const pad = 16
  const axisY = 88
  const domainLeft = mean - 3.4 * sd
  const domainRight = mean + 3.4 * sd
  const span = domainRight - domainLeft || 1

  const xToPx = (val: number) =>
    pad + ((val - domainLeft) / span) * (width - 2 * pad)

  const pdf = (val: number) => {
    const z = (val - mean) / sd
    return Math.exp(-0.5 * z * z)
  }

  const points: string[] = []
  const steps = 80
  let maxPdf = 0
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i <= steps; i++) {
    const val = domainLeft + (i / steps) * span
    const y = pdf(val)
    xs.push(val)
    ys.push(y)
    if (y > maxPdf) maxPdf = y
  }
  for (let i = 0; i <= steps; i++) {
    const px = xToPx(xs[i])
    const py = axisY - (ys[i] / maxPdf) * 62
    points.push(`${px},${py}`)
  }

  const shadePath = () => {
    let from = domainLeft
    let to = domainRight
    if (shade === 'left' && x !== undefined) {
      to = x
    } else if (shade === 'right' && x !== undefined) {
      from = x
    } else if (shade === 'between' && lower !== undefined && upper !== undefined) {
      from = lower
      to = upper
    } else if (shade === 'two-tail' && lower !== undefined && upper !== undefined) {
      // draw as two regions via separate polygons below
      return null
    } else if (shade === 'none') {
      return null
    }

    const poly: string[] = [`${xToPx(from)},${axisY}`]
    for (let i = 0; i <= steps; i++) {
      if (xs[i] < from || xs[i] > to) continue
      const px = xToPx(xs[i])
      const py = axisY - (ys[i] / maxPdf) * 62
      poly.push(`${px},${py}`)
    }
    poly.push(`${xToPx(to)},${axisY}`)
    return poly.join(' ')
  }

  const leftTail =
    shade === 'two-tail' && lower !== undefined
      ? (() => {
          const poly: string[] = [`${xToPx(domainLeft)},${axisY}`]
          for (let i = 0; i <= steps; i++) {
            if (xs[i] > lower) break
            poly.push(
              `${xToPx(xs[i])},${axisY - (ys[i] / maxPdf) * 62}`,
            )
          }
          poly.push(`${xToPx(lower)},${axisY}`)
          return poly.join(' ')
        })()
      : null

  const rightTail =
    shade === 'two-tail' && upper !== undefined
      ? (() => {
          const poly: string[] = [`${xToPx(upper)},${axisY}`]
          for (let i = 0; i <= steps; i++) {
            if (xs[i] < upper) continue
            poly.push(
              `${xToPx(xs[i])},${axisY - (ys[i] / maxPdf) * 62}`,
            )
          }
          poly.push(`${xToPx(domainRight)},${axisY}`)
          return poly.join(' ')
        })()
      : null

  const mainShade = shadePath()

  return (
    <div className="diagram">
      <svg
        className="normal-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={caption ?? 'Normal density sketch'}
      >
        {mainShade ? <polygon points={mainShade} className="normal-shade" /> : null}
        {leftTail ? <polygon points={leftTail} className="normal-shade" /> : null}
        {rightTail ? <polygon points={rightTail} className="normal-shade" /> : null}
        <polyline points={points.join(' ')} className="normal-curve" fill="none" />
        <line
          x1={pad}
          x2={width - pad}
          y1={axisY}
          y2={axisY}
          className="normal-axis"
        />
        <line
          x1={xToPx(mean)}
          x2={xToPx(mean)}
          y1={axisY}
          y2={axisY - 66}
          className="normal-mean"
        />
        <text x={xToPx(mean)} y={height - 4} textAnchor="middle" className="normal-label">
          {Number(mean.toPrecision(4))}
        </text>
        {x !== undefined ? (
          <text x={xToPx(x)} y={18} textAnchor="middle" className="normal-label">
            {Number(x.toPrecision(4))}
          </text>
        ) : null}
        {lower !== undefined ? (
          <text x={xToPx(lower)} y={18} textAnchor="middle" className="normal-label">
            {Number(lower.toPrecision(4))}
          </text>
        ) : null}
        {upper !== undefined ? (
          <text x={xToPx(upper)} y={18} textAnchor="middle" className="normal-label">
            {Number(upper.toPrecision(4))}
          </text>
        ) : null}
      </svg>
      {caption ? <p className="diagram-caption">{caption}</p> : null}
    </div>
  )
}

function CiInterval({ diagram }: { diagram: Extract<Diagram, { kind: 'ci-interval' }> }) {
  const { center, lower, upper, caption } = diagram
  const pad = Math.max(Math.abs(upper - lower) * 0.25, Math.abs(center) * 0.05, 1)
  const min = lower - pad
  const max = upper + pad
  const span = max - min || 1
  const toPct = (v: number) => `${clamp01((v - min) / span) * 100}%`

  return (
    <div className="diagram">
      <div className="ci-line">
        <div className="ci-track" />
        <div
          className="ci-interval"
          style={{ left: toPct(lower), width: `${((upper - lower) / span) * 100}%` }}
        />
        <div className="ci-center" style={{ left: toPct(center) }} />
        <div className="ci-label" style={{ left: toPct(lower) }}>
          {Number(lower.toPrecision(5))}
        </div>
        <div className="ci-label center" style={{ left: toPct(center) }}>
          {Number(center.toPrecision(5))}
        </div>
        <div className="ci-label" style={{ left: toPct(upper) }}>
          {Number(upper.toPrecision(5))}
        </div>
      </div>
      {caption ? <p className="diagram-caption">{caption}</p> : null}
    </div>
  )
}

export function DiagramView({ diagram }: { diagram: Diagram }) {
  switch (diagram.kind) {
    case 'number-line':
      return <NumberLine diagram={diagram} />
    case 'uniform-bar':
      return <UniformBar diagram={diagram} />
    case 'normal-shade':
      return <NormalShade diagram={diagram} />
    case 'ci-interval':
      return <CiInterval diagram={diagram} />
    default:
      return null
  }
}
