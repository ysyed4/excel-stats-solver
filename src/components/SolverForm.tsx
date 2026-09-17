import type { SolverId } from '../solvers/types'
import {
  CheckboxInput,
  Field,
  NumberInput,
  SelectInput,
} from './Fields'

interface SolverFormProps {
  solverId: SolverId
  values: Record<string, string | number | boolean>
  onChange: (key: string, value: string | boolean) => void
}

export function SolverForm({ solverId, values, onChange }: SolverFormProps) {
  const v = (key: string, fallback = '') =>
    values[key] === undefined || values[key] === null
      ? fallback
      : String(values[key])

  switch (solverId) {
    case 'binomial':
      return (
        <div className="form-grid">
          <Field label="Trials n">
            <NumberInput value={v('n', '20')} onChange={(x) => onChange('n', x)} />
          </Field>
          <Field label="Success probability p">
            <NumberInput
              value={v('p', '0.5')}
              onChange={(x) => onChange('p', x)}
              min="0"
              max="1"
            />
          </Field>
          <Field label="Question">
            <SelectInput
              value={v('query', 'atLeast')}
              onChange={(x) => onChange('query', x)}
              options={[
                { value: 'atLeast', label: 'P(X ≥ x)' },
                { value: 'moreThan', label: 'P(X > x)' },
                { value: 'atMost', label: 'P(X ≤ x)' },
                { value: 'equal', label: 'P(X = x)' },
              ]}
            />
          </Field>
          <Field label="x">
            <NumberInput value={v('x', '10')} onChange={(x) => onChange('x', x)} />
          </Field>
          <Field label="Optional exact x₂" hint="also compute P(X = x₂)">
            <NumberInput
              value={v('x2')}
              onChange={(x) => onChange('x2', x)}
              placeholder="e.g. 15"
            />
          </Field>
        </div>
      )

    case 'poisson':
      return (
        <div className="form-grid">
          <Field label="Rate λ (per base interval)">
            <NumberInput
              value={v('lambda', '1.5')}
              onChange={(x) => onChange('lambda', x)}
            />
          </Field>
          <Field label="Interval multiplier" hint="scales λ (trip total) — not for “each day”">
            <NumberInput
              value={v('hours', '1')}
              onChange={(x) => onChange('hours', x)}
            />
          </Field>
          <Field
            label="Independent days"
            hint="raise single-day P to this power (e.g. each of 4 days → 4)"
          >
            <NumberInput
              value={v('independentDays', '1')}
              onChange={(x) => onChange('independentDays', x)}
            />
          </Field>
          <Field label="Question">
            <SelectInput
              value={v('query', 'equal')}
              onChange={(x) => onChange('query', x)}
              options={[
                { value: 'equal', label: 'P(X = x)' },
                { value: 'atMost', label: 'P(X ≤ x)' },
                { value: 'atLeast', label: 'P(X ≥ x)' },
                { value: 'moreThan', label: 'P(X > x)' },
              ]}
            />
          </Field>
          <Field label="x">
            <NumberInput value={v('x', '0')} onChange={(x) => onChange('x', x)} />
          </Field>
        </div>
      )

    case 'uniform':
      return (
        <div className="form-grid">
          <Field label="Minimum a">
            <NumberInput value={v('a', '2000')} onChange={(x) => onChange('a', x)} />
          </Field>
          <Field label="Maximum b">
            <NumberInput value={v('b', '5000')} onChange={(x) => onChange('b', x)} />
          </Field>
          <Field label="Between · lower">
            <NumberInput
              value={v('lower', '2500')}
              onChange={(x) => onChange('lower', x)}
            />
          </Field>
          <Field label="Between · upper">
            <NumberInput
              value={v('upper', '3000')}
              onChange={(x) => onChange('upper', x)}
            />
          </Field>
          <Field label="Optional P(X ≥ …)">
            <NumberInput
              value={v('atLeast')}
              onChange={(x) => onChange('atLeast', x)}
              placeholder="e.g. 4000"
            />
          </Field>
          <Field label="Optional exact point">
            <NumberInput
              value={v('exact')}
              onChange={(x) => onChange('exact', x)}
              placeholder="e.g. 2500"
            />
          </Field>
        </div>
      )

    case 'normal':
      return (
        <div className="form-grid">
          <Field label="Mean μ">
            <NumberInput
              value={v('mean', '15')}
              onChange={(x) => onChange('mean', x)}
            />
          </Field>
          <Field label="Std. deviation σ">
            <NumberInput value={v('sd', '3')} onChange={(x) => onChange('sd', x)} />
          </Field>
          <Field label="Question">
            <SelectInput
              value={v('query', 'greater')}
              onChange={(x) => onChange('query', x)}
              options={[
                { value: 'greater', label: 'P(X > x)' },
                { value: 'less', label: 'P(X ≤ x)' },
                { value: 'between', label: 'P(lower < X < upper)' },
                { value: 'inverse', label: 'Find x from probability' },
              ]}
            />
          </Field>
          {v('query', 'greater') === 'between' ? (
            <>
              <Field label="Lower">
                <NumberInput
                  value={v('lower', '8')}
                  onChange={(x) => onChange('lower', x)}
                />
              </Field>
              <Field label="Upper">
                <NumberInput
                  value={v('upper', '19')}
                  onChange={(x) => onChange('upper', x)}
                />
              </Field>
            </>
          ) : v('query', 'greater') === 'inverse' ? (
            <Field label="Left-tail probability">
              <NumberInput
                value={v('probability', '0.95')}
                onChange={(x) => onChange('probability', x)}
              />
            </Field>
          ) : (
            <Field label="x">
              <NumberInput value={v('x', '16')} onChange={(x) => onChange('x', x)} />
            </Field>
          )}
        </div>
      )

    case 'standard-normal':
      return (
        <div className="form-grid">
          <Field label="Question">
            <SelectInput
              value={v('query', 'less')}
              onChange={(x) => onChange('query', x)}
              options={[
                { value: 'less', label: 'P(Z ≤ z)' },
                { value: 'greater', label: 'P(Z > z)' },
                { value: 'between', label: 'P(z₁ < Z < z₂)' },
                { value: 'inverse', label: 'Find z from left-tail P' },
                {
                  value: 'invBetweenLow',
                  label: 'Find lower z in P(z < Z < z₂) = p',
                },
                {
                  value: 'invBetweenHigh',
                  label: 'Find upper z in P(z₁ < Z < z) = p',
                },
              ]}
            />
          </Field>
          {v('query', 'less') === 'between' ? (
            <>
              <Field label="z low">
                <NumberInput
                  value={v('zLow', '-1')}
                  onChange={(x) => onChange('zLow', x)}
                />
              </Field>
              <Field label="z high">
                <NumberInput
                  value={v('zHigh', '1')}
                  onChange={(x) => onChange('zHigh', x)}
                />
              </Field>
            </>
          ) : v('query', 'less') === 'inverse' ? (
            <Field label="Left-tail probability">
              <NumberInput
                value={v('probability', '0.975')}
                onChange={(x) => onChange('probability', x)}
              />
            </Field>
          ) : v('query', 'less') === 'invBetweenLow' ? (
            <>
              <Field label="Known upper z">
                <NumberInput
                  value={v('zHigh', '1')}
                  onChange={(x) => onChange('zHigh', x)}
                />
              </Field>
              <Field label="Middle probability p">
                <NumberInput
                  value={v('probability', '0.1')}
                  onChange={(x) => onChange('probability', x)}
                />
              </Field>
            </>
          ) : v('query', 'less') === 'invBetweenHigh' ? (
            <>
              <Field label="Known lower z">
                <NumberInput
                  value={v('zLow', '0')}
                  onChange={(x) => onChange('zLow', x)}
                />
              </Field>
              <Field label="Middle probability p">
                <NumberInput
                  value={v('probability', '0.1')}
                  onChange={(x) => onChange('probability', x)}
                />
              </Field>
            </>
          ) : (
            <Field label="z">
              <NumberInput value={v('z', '1')} onChange={(x) => onChange('z', x)} />
            </Field>
          )}
        </div>
      )

    case 't-dist':
      return (
        <div className="form-grid">
          <Field label="Degrees of freedom">
            <NumberInput value={v('df', '30')} onChange={(x) => onChange('df', x)} />
          </Field>
          <Field label="Question">
            <SelectInput
              value={v('query', 'invRight')}
              onChange={(x) => onChange('query', x)}
              options={[
                { value: 'cdf', label: 'P(T ≤ t)' },
                { value: 'greater', label: 'P(T > t)' },
                { value: 'invRight', label: 'Critical t (right α)' },
                { value: 'invTwo', label: 'Critical ±t (two-tail α)' },
              ]}
            />
          </Field>
          {v('query', 'invRight') === 'cdf' ||
          v('query', 'invRight') === 'greater' ? (
            <Field label="t">
              <NumberInput value={v('t', '2.04')} onChange={(x) => onChange('t', x)} />
            </Field>
          ) : (
            <Field label="α">
              <NumberInput
                value={v('alpha', '0.1')}
                onChange={(x) => onChange('alpha', x)}
              />
            </Field>
          )}
        </div>
      )

    case 'sample-mean':
      return (
        <div className="form-grid">
          <Field label="Population mean μ">
            <NumberInput
              value={v('mean', '2000')}
              onChange={(x) => onChange('mean', x)}
            />
          </Field>
          <Field label="Population σ">
            <NumberInput
              value={v('sd', '240')}
              onChange={(x) => onChange('sd', x)}
            />
          </Field>
          <Field label="Sample size n">
            <NumberInput value={v('n', '36')} onChange={(x) => onChange('n', x)} />
          </Field>
          <Field label="Question">
            <SelectInput
              value={v('query', 'greater')}
              onChange={(x) => onChange('query', x)}
              options={[
                { value: 'greater', label: 'P(x̄ > value)' },
                { value: 'less', label: 'P(x̄ ≤ value)' },
                { value: 'between', label: 'P(lower < x̄ < upper)' },
              ]}
            />
          </Field>
          {v('query', 'greater') === 'between' ? (
            <>
              <Field label="Lower">
                <NumberInput
                  value={v('lower', '1760')}
                  onChange={(x) => onChange('lower', x)}
                />
              </Field>
              <Field label="Upper">
                <NumberInput
                  value={v('upper', '2240')}
                  onChange={(x) => onChange('upper', x)}
                />
              </Field>
            </>
          ) : (
            <Field label="Value">
              <NumberInput
                value={v('value', '2080')}
                onChange={(x) => onChange('value', x)}
              />
            </Field>
          )}
          <Field label="Population N" hint="optional">
            <NumberInput value={v('N')} onChange={(x) => onChange('N', x)} />
          </Field>
          <CheckboxInput
            checked={Boolean(values.useFpc)}
            onChange={(c) => onChange('useFpc', c)}
            label="Apply finite population correction when n > N/20"
          />
        </div>
      )

    case 'sample-proportion':
      return (
        <div className="form-grid">
          <Field label="Population proportion p">
            <NumberInput value={v('p', '0.2')} onChange={(x) => onChange('p', x)} />
          </Field>
          <Field label="Sample size n">
            <NumberInput value={v('n', '30')} onChange={(x) => onChange('n', x)} />
          </Field>
          <Field label="Question">
            <SelectInput
              value={v('query', 'greater')}
              onChange={(x) => onChange('query', x)}
              options={[
                { value: 'greater', label: 'P(p̂ > value)' },
                { value: 'less', label: 'P(p̂ ≤ value)' },
              ]}
            />
          </Field>
          <Field label="Value">
            <NumberInput
              value={v('value', '0.25')}
              onChange={(x) => onChange('value', x)}
            />
          </Field>
        </div>
      )

    case 'ci-mean-z':
      return (
        <div className="form-grid">
          <Field label="Sample mean x̄">
            <NumberInput
              value={v('xbar', '2100')}
              onChange={(x) => onChange('xbar', x)}
            />
          </Field>
          <Field label="Known σ">
            <NumberInput
              value={v('sd', '240')}
              onChange={(x) => onChange('sd', x)}
            />
          </Field>
          <Field label="n">
            <NumberInput value={v('n', '36')} onChange={(x) => onChange('n', x)} />
          </Field>
          <Field label="Confidence" hint="e.g. 0.95">
            <NumberInput
              value={v('confidence', '0.95')}
              onChange={(x) => onChange('confidence', x)}
            />
          </Field>
        </div>
      )

    case 'ci-mean-t':
      return (
        <div className="form-grid">
          <Field label="Sample mean x̄">
            <NumberInput
              value={v('xbar', '995')}
              onChange={(x) => onChange('xbar', x)}
            />
          </Field>
          <Field label="Sample sd s">
            <NumberInput value={v('s', '21')} onChange={(x) => onChange('s', x)} />
          </Field>
          <Field label="n">
            <NumberInput value={v('n', '49')} onChange={(x) => onChange('n', x)} />
          </Field>
          <Field label="Confidence">
            <NumberInput
              value={v('confidence', '0.95')}
              onChange={(x) => onChange('confidence', x)}
            />
          </Field>
        </div>
      )

    case 'ci-proportion':
      return (
        <div className="form-grid">
          <Field label="Successes">
            <NumberInput
              value={v('successes', '12')}
              onChange={(x) => onChange('successes', x)}
            />
          </Field>
          <Field label="n">
            <NumberInput value={v('n', '50')} onChange={(x) => onChange('n', x)} />
          </Field>
          <Field label="Confidence">
            <NumberInput
              value={v('confidence', '0.95')}
              onChange={(x) => onChange('confidence', x)}
            />
          </Field>
        </div>
      )

    case 'n-mean':
      return (
        <div className="form-grid">
          <Field label="σ">
            <NumberInput
              value={v('sd', '240')}
              onChange={(x) => onChange('sd', x)}
            />
          </Field>
          <Field label="Desired margin E">
            <NumberInput value={v('E', '100')} onChange={(x) => onChange('E', x)} />
          </Field>
          <Field label="Confidence">
            <NumberInput
              value={v('confidence', '0.95')}
              onChange={(x) => onChange('confidence', x)}
            />
          </Field>
        </div>
      )

    case 'n-proportion':
      return (
        <div className="form-grid">
          <Field label="Pilot p̂">
            <NumberInput value={v('p', '0.1')} onChange={(x) => onChange('p', x)} />
          </Field>
          <Field label="Desired margin E">
            <NumberInput
              value={v('E', '0.05')}
              onChange={(x) => onChange('E', x)}
            />
          </Field>
          <Field label="Confidence">
            <NumberInput
              value={v('confidence', '0.95')}
              onChange={(x) => onChange('confidence', x)}
            />
          </Field>
          <CheckboxInput
            checked={Boolean(values.conservative)}
            onChange={(c) => onChange('conservative', c)}
            label="Use conservative p = 0.5"
          />
        </div>
      )

    default:
      return null
  }
}
