import { useEffect, useRef, useState } from 'react'
import type { Lookup } from './types'

/** πεζά, χωρίς τόνους/διαλυτικά, ς→σ — ώστε «ΥΠΟΔ», «υπόδ» και «υποδ» να ταιριάζουν όλα */
export function normalizeGreek(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ς/g, 'σ')
}

interface ComboSelectProps {
  options: Lookup[]
  /** lookup id as string, '' = όλα */
  value: string
  /** «Όλες» / «Όλα» / «Όλοι» — placeholder and first list entry */
  allLabel: string
  onChange: (id: string) => void
}

/** Lightweight autocomplete replacement for a <select>: type to filter
    (accent/case-invariant), arrows + Enter to pick, blank = all. */
export default function ComboSelect({ options, value, allLabel, onChange }: ComboSelectProps) {
  const selected = options.find((o) => String(o.id) === value) ?? null
  const [text, setText] = useState(selected?.name ?? '')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  // sync the visible text when the value changes from outside (Καθαρισμός, cascade reset)
  const selectedName = selected?.name ?? ''
  useEffect(() => { setText(selectedName) }, [selectedName])

  const q = normalizeGreek(text.trim())
  const matches = q ? options.filter((o) => normalizeGreek(o.name).includes(q)) : options

  function commit(o: Lookup | null) {
    onChange(o ? String(o.id) : '')
    setText(o?.name ?? '')
    setOpen(false)
  }

  function onBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (wrapRef.current?.contains(e.relatedTarget as Node)) return
    setOpen(false)
    if (!text.trim()) {
      if (value) onChange('')
      setText('')
      return
    }
    const exact = options.find((o) => normalizeGreek(o.name) === q)
    if (exact) {
      if (String(exact.id) !== value) onChange(String(exact.id))
      setText(exact.name)
    } else {
      setText(selectedName)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (open) setHi((h) => Math.min(h + 1, matches.length - 1))
      else setOpen(true)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHi((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && matches[hi]) { e.preventDefault(); commit(matches[hi]) }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="combo" ref={wrapRef} onBlur={onBlur}>
      <input
        value={text}
        placeholder={allLabel}
        onChange={(e) => { setText(e.target.value); setOpen(true); setHi(0) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
      />
      <span className="combo-caret">▾</span>
      {open && (
        <div className="combo-list" role="listbox">
          <div
            className={'combo-item combo-all' + (value === '' ? ' selected' : '')}
            onMouseDown={(e) => { e.preventDefault(); commit(null) }}
          >
            {allLabel}
          </div>
          {matches.map((o, i) => (
            <div
              key={o.id}
              className={'combo-item' + (i === hi ? ' hi' : '') + (String(o.id) === value ? ' selected' : '')}
              onMouseDown={(e) => { e.preventDefault(); commit(o) }}
              onMouseEnter={() => setHi(i)}
            >
              {o.name}
            </div>
          ))}
          {matches.length === 0 && <div className="combo-none">Καμία αντιστοιχία</div>}
        </div>
      )}
    </div>
  )
}
