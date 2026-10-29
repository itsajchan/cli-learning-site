"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { TRACKS } from "../lib/content"
import { useProgress } from "../lib/progress/store"

export default function Palette({ onClose, onPick }: { onClose: () => void; onPick: (lessonId: string) => void }) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const completed = useProgress((s) => s.completedLessons)

  const all = useMemo(
    () =>
      TRACKS.flatMap((t, ti) =>
        t.lessons.map((l, li) => ({
          id: l.id,
          title: l.title,
          track: `T${ti + 1}`,
          level: t.level,
          tool: l.tool,
          boss: !!l.boss,
          done: completed.includes(l.id),
          label: `T${ti + 1}·L${li + 1}`,
        })),
      ),
    [completed],
  )

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return all
    return all.filter((l) => `${l.title} ${l.tool} ${l.track} ${l.label}`.toLowerCase().includes(q))
  }, [all, query])

  useEffect(() => setSelected(0), [query])

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette-head">
          <span className="c-accent">▸</span>
          <input
            ref={inputRef}
            value={query}
            placeholder="jump to lesson… (title, tool, track)"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault()
                setSelected((s) => Math.min(s + 1, filtered.length - 1))
              } else if (e.key === "ArrowUp") {
                e.preventDefault()
                setSelected((s) => Math.max(s - 1, 0))
              } else if (e.key === "Enter" && filtered[selected]) {
                onPick(filtered[selected].id)
              }
            }}
          />
          <span className="c-dim">esc</span>
        </div>
        <div className="palette-list">
          {filtered.map((l, i) => (
            <button
              key={l.id}
              className={`palette-item ${i === selected ? "selected" : ""}`}
              onClick={() => onPick(l.id)}
              onMouseEnter={() => setSelected(i)}
            >
              <span className="c-dim">{l.label}</span>
              <span className={l.done ? "c-dim" : "c-text"}>
                {l.done ? "✅ " : l.boss ? "👑 " : "   "}
                {l.title}
              </span>
              <span className="c-dim palette-tool">{l.tool}</span>
            </button>
          ))}
          {filtered.length === 0 && <div className="c-dim palette-empty">no lessons match &apos;{query}&apos;</div>}
        </div>
      </div>
    </div>
  )
}
