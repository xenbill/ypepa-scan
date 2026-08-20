import { useEffect, useRef, useState } from 'react'
import type { Lookup } from '../api/types'

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
  // Only filter once the user has typed since the list opened. Opening with a
  // value selected shows the whole list (with the selection highlighted), so a
  // different value can be picked directly instead of first clearing the text.
  const [typed, setTyped] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // sync the visible text when the value changes from outside (Καθαρισμός, cascade reset)
  const selectedName = selected?.name ?? ''
  useEffect(() => { setText(selectedName) }, [selectedName])

  const q = normalizeGreek(text.trim())
  const matches = typed && q ? options.filter((o) => normalizeGreek(o.name).includes(q)) : options

  function openList() {
    setTyped(false)
    setHi(Math.max(0, options.findIndex((o) => String(o.id) === value)))
    setOpen(true)
  }

  // keep the highlighted row in view when moving with the keyboard / opening on a selection
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>('.combo-item.hi')
    el?.scrollIntoView({ block: 'nearest' })
  }, [open, hi])

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
      else openList()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHi((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && matches[hi]) { e.preventDefault(); commit(matches[hi]) }
    } else if (e.key === 'Escape' && open) {
      // Consume it: Escape closes the list first, not the dialog around it.
      e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div className="combo" ref={wrapRef} onBlur={onBlur}>
      <input
        ref={inputRef}
        value={text}
        placeholder={allLabel}
        onChange={(e) => { setText(e.target.value); setTyped(true); setOpen(true); setHi(0) }}
        onFocus={(e) => { openList(); e.target.select() }}
        // Clicking the (already focused) input re-opens the list; picking an option
        // keeps focus in the input, so onFocus alone would never fire again.
        onClick={() => { if (!open) openList() }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
      />
      <span
        className="combo-caret"
        onMouseDown={(e) => {
          e.preventDefault()
          if (open) setOpen(false)
          else { inputRef.current?.focus(); openList() }
        }}
      >▾</span>
      {open && (
        <div className="combo-list" role="listbox" ref={listRef}>
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
