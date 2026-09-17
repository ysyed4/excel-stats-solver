import type { ReactNode } from 'react'

interface FieldProps {
  label: string
  hint?: string
  children: ReactNode
}

export function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint ? <span className="field-hint">{hint}</span> : null}
      </span>
      {children}
    </label>
  )
}

interface NumberInputProps {
  value: string | number
  onChange: (value: string) => void
  step?: string
  min?: string
  max?: string
  placeholder?: string
}

export function NumberInput({
  value,
  onChange,
  step = 'any',
  min,
  max,
  placeholder,
}: NumberInputProps) {
  return (
    <input
      className="input"
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      max={max}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

interface SelectInputProps {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}

export function SelectInput({ value, onChange, options }: SelectInputProps) {
  return (
    <select
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

interface CheckboxInputProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}

export function CheckboxInput({ checked, onChange, label }: CheckboxInputProps) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}
