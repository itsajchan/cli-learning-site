"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Line, Segment, World } from "../lib/types"
import { useProgress } from "../lib/progress/store"
import { THEMES } from "../lib/theme"
import { TRACKS, getLesson, TOTAL_LESSONS } from "../lib/content"
import {
  routeAppCommand,
  lessonCard,
  appCompletions,
  type RouterContext,
} from "../lib/router"
import {
  runSandboxCommand,
  resetToExercise,
  sandboxVocabulary,
  KNOWN,
} from "../lib/sandbox"
import { closestWord } from "../lib/parser/tokenizer"
import Palette from "./Palette"

let lineId = 0
const nextId = () => `l${lineId++}`
const line = (text: string, color?: Segment["color"]): Line => ({ id: nextId(), segments: [{ text, color: color ?? "text" }] })

const BOOT_LINES: [string, Segment["color"]][] = [
  ["TerminalType BIOS v1.0.0 — session start", "dim"],
  ["memory check ................. OK", "dim"],
  [`loading lessons .............. ${TOTAL_LESSONS} found`, "dim"],
  ["mounting /sandbox ............ done", "dim"],
  ["", "text"],
  ["  ████████╗ ▄▄ ▄ ▄▄ ▄▄▄▄  ▄▄▄▄▄▄▄▄", "success"],
  ["  ██╔════╝ ██ ██ ██ ██╔══██ ██╔════╝", "success"],
  ["  ███████╗ ██ ██ ██ ██▄▄██  ███████", "success"],
  ["  ╚════██║ ██ ██ ██ ██╔══██ ╚════██║", "success"],
  ["  ███████║ ██ ██ ██ ██   ██ ███████║", "success"],
  ["  ╚══════╝ ╚═╝ ╚═╝ ╚═╝   ╚═╝ ╚══════╝", "success"],
  ["", "text"],
  ["learn the CLI by using the CLI. 10 tools. 3 tracks. zero install.", "accent"],
  ["", "text"],
]

export default function TerminalApp() {
  const progress = useProgress()
  const [lines, setLines] = useState<Line[]>([])
  const [input, setInput] = useState("")
  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [booting, setBooting] = useState(true)
  const [bootStep, setBootStep] = useState(0)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [flash, setFlash] = useState(false)

  // lesson session
  const [lessonId, setLessonId] = useState<string | null>(null)
  const [exerciseIndex, setExerciseIndex] = useState(-1) // -1 = intro
  const [world, setWorld] = useState<World | null>(null)
  const [completedExerciseIds, setCompletedExerciseIds] = useState<string[]>([])
  const [, setHintShown] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bootTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const theme = THEMES[progress.theme] ?? THEMES.phosphor
  const lesson = lessonId ? getLesson(lessonId) : undefined
  const currentExercise = lesson && exerciseIndex >= 0 ? lesson.lesson.exercises[exerciseIndex] : undefined
  const inLesson = !!lesson && exerciseIndex >= 0

  /* ---------- theme vars ---------- */
  const cssVars = useMemo(
    () =>
      ({
        "--bg": theme.bg,
        "--fg": theme.fg,
        "--green": theme.green,
        "--amber": theme.amber,
        "--red": theme.red,
        "--cyan": theme.cyan,
        "--dim": theme.dim,
        "--accent": theme.prompt,
        "--selection": theme.selection,
      }) as React.CSSProperties,
    [theme],
  )

  /* ---------- boot ---------- */
  useEffect(() => {
    progress.hydrate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!booting) return
    if (progress.reducedMotion) {
      setBooting(false)
      return
    }
    if (bootStep < BOOT_LINES.length) {
      bootTimer.current = setTimeout(() => setBootStep((s) => s + 1), bootStep === 0 ? 300 : 140)
      return () => {
        if (bootTimer.current) clearTimeout(bootTimer.current)
      }
    }
    bootTimer.current = setTimeout(() => setBooting(false), 400)
    return () => {
      if (bootTimer.current) clearTimeout(bootTimer.current)
    }
  }, [bootStep, booting, progress.reducedMotion])

  /* after boot: show welcome + current lesson card */
  const startedRef = useRef(false)
  useEffect(() => {
    if (booting || startedRef.current || !progress.hydrated) return
    startedRef.current = true
    const target = progress.currentLesson ?? TRACKS[0].lessons[0].id
    setLessonId(target)
    setExerciseIndex(-1)
    setLines([
      line("welcome back, learner.", "dim"),
      line(`progress: ${progress.xp} xp · ${progress.completedLessons.length}/${TOTAL_LESSONS} lessons · ${progress.streak}🔥 streak`, "dim"),
      line("", "text"),
      ...lessonCardLines(target),
    ])
  }, [booting, progress.hydrated])

  function lessonCardLines(lessonId: string): Line[] {
    const ctx = makeCtx()
    return lessonCard(lessonId, { ...ctx, lessonIndex: -1 })
  }

  /* keep the sandbox world in sync with the active lesson */
  useEffect(() => {
    if (!lessonId) {
      setWorld(null)
      return
    }
    const found = getLesson(lessonId)
    if (found) setWorld(resetToExercise(found.lesson, exerciseIndex < 0 ? 0 : exerciseIndex))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId])

  /* ---------- scroll to bottom on new lines ---------- */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines])

  /* focus input on any click */
  useEffect(() => {
    const onClick = () => inputRef.current?.focus()
    window.addEventListener("click", onClick)
    return () => window.removeEventListener("click", onClick)
  }, [])

  /* ---------- context for the router ---------- */
  const makeCtx = useCallback((): RouterContext => {
    const p = useProgress.getState()
    return {
      currentTrack: p.currentTrack,
      currentLesson: p.currentLesson,
      lessonIndex: exerciseIndex,
      inLesson,
      completedLessons: p.completedLessons,
      xp: p.xp,
      badges: p.badges,
      streak: p.streak,
      theme: p.theme,
      actions: {
        startLesson: (id) => {
          setLessonId(id)
          setExerciseIndex(-1)
          setCompletedExerciseIds([])
          setHintShown(null)
          useProgress.getState().setLesson(getLesson(id)?.track.id ?? p.currentTrack, id)
        },
        acceptIntro: () => {
          setExerciseIndex(0)
          setCompletedExerciseIds([])
          setHintShown(null)
        },
        skipExercise: () => {
          advanceExercise(true)
        },
        nextLesson: () => {},
        clear: () => setLines([]),
        setTheme: (t) => useProgress.getState().setTheme(t),
        toggleReducedMotion: () => useProgress.getState().toggleReducedMotion(),
        resetProgress: () => {
          useProgress.getState().reset()
          setLessonId(null)
          setExerciseIndex(-1)
        },
        exportProgress: () => useProgress.getState().exportProgress(),
        importProgress: (code) => {
          const ok = useProgress.getState().importProgress(code)
          if (ok) {
            const p2 = useProgress.getState()
            if (p2.currentLesson) {
              setLessonId(p2.currentLesson)
              setExerciseIndex(-1)
            }
          }
          return ok
        },
        openPalette: () => setPaletteOpen(true),
        hintUsed: () => {},
        bootDone: () => {},
        showAchievements: () => {},
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseIndex, inLesson, lessonId, progress.hydrated])

  /* ---------- exercise advancement ---------- */
  function advanceExercise(skipped = false) {
    if (!lesson) return
    const nextIdx = exerciseIndex + 1
    if (nextIdx < lesson.lesson.exercises.length) {
      setExerciseIndex(nextIdx)
      setHintShown(null)
    } else {
      // lesson complete
      const xp = lesson.lesson.exercises.length * 10 + (lesson.lesson.boss ? 25 : 0)
      const first = useProgress.getState().completeLesson(lesson.lesson.id, skipped ? 0 : xp, lesson.lesson.badge)
      if (first && lesson.lesson.badge) {
        setLines((prev) => [
          ...prev,
          line("", "text"),
          line("   ┌─────────────────────────────┐", "success"),
          line(`   │  🏆 BADGE UNLOCKED           │`, "success"),
          line(`   │  ${lesson.lesson.badge!.padEnd(27)}│`, "success"),
          line("   └─────────────────────────────┘", "success"),
        ])
        if (!progress.reducedMotion) {
          setFlash(true)
          setTimeout(() => setFlash(false), 450)
        }
      }
      const nl = useProgress.getState().currentLesson
      setLines((prev) => [
        ...prev,
        line("", "text"),
        line(`✅ lesson complete: ${lesson.lesson.title} (+${skipped ? 0 : xp} xp)`, "success"),
        line("", "text"),
      ])
      if (nl && nl !== lesson.lesson.id) {
        setLessonId(nl)
        setExerciseIndex(-1)
        const found = getLesson(nl)
        if (found) setWorld(resetToExercise(found.lesson, 0))
        setTimeout(() => {
          setLines((prev) => [...prev, ...lessonCard(nl, makeCtx())])
        }, 350)
      } else {
        setExerciseIndex(-1)
        setLines((prev) => [...prev, line("that was the last lesson. you finished TerminalType. 🏆", "success")])
      }
    }
  }

  function showHint() {
    if (!lesson || exerciseIndex < 0) return
    const ex = lesson.lesson.exercises[exerciseIndex]
    if (!ex) return
    setHintShown(ex.hint ?? "no hint for this one — read the task again")
    setLines((prev) => [...prev, line(`💡 ${ex.hint ?? "read the task once more"}`, "warning")])
  }

  /* ---------- submit ---------- */
  const submit = useCallback(
    (raw: string) => {
      const trimmed = raw.trim()
      setLines((prev) => [...prev, promptLine(raw, inLesson ? cwdOf(world) : null)])
      if (!trimmed) return
      setHistory((h) => [...h, trimmed])
      setHistoryIdx(-1)

      const ctx = makeCtx()

      // hint shortcut inside lesson
      if (trimmed === "hint" && inLesson) {
        showHint()
        return
      }

      const routed = routeAppCommand(trimmed, ctx)
      if (routed) {
        if (routed.lines?.length) setLines((prev) => [...prev, ...routed.lines!])
        return
      }

      if (!inLesson || !world || !lesson) {
        const first = trimmed.split(/\s+/)[0]
        const suggestion = closestWord(first, [...KNOWN, "next", "help", "tracks"])
        setLines((prev) => [
          ...prev,
          line(`command not found: ${first}`, "error"),
          ...(suggestion && suggestion !== first ? [line(`did you mean '${suggestion}'?`, "warning")] : []),
          ...(suggestion === first ? [line(`real ${first} lives inside lessons — type 'next' to enter one, or 'learn ${first}'`, "dim")] : []),
        ])
        return
      }

      // sandbox execution
      const result = runSandboxCommand(world, lesson.lesson, exerciseIndex, trimmed)
      setWorld(result.world)

      if (result.exercisePassed) {
        const ex = lesson.lesson.exercises[exerciseIndex]
        const xp = lesson.lesson.boss ? 15 : 10
        useProgress.getState().completeExercise(xp)
        setCompletedExerciseIds((c) => [...c, ex.id])
        setLines((prev) => [
          ...prev,
          ...result.lines.map((l) => ({ id: nextId(), segments: [{ text: l.text, color: (l.color ?? "text") as Segment["color"] }] })),
          line(`✓ correct (+${xp} xp)`, "success"),
        ])
        setTimeout(() => advanceExercise(), 50)
      } else {
        setLines((prev) => [
          ...prev,
          ...result.lines.map((l) => ({ id: nextId(), segments: [{ text: l.text, color: (l.color ?? "text") as Segment["color"] }] })),
        ])
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, lesson, exerciseIndex, inLesson, makeCtx, progress.reducedMotion],
  )

  /* ---------- keyboard ---------- */
  const [ghost, setGhost] = useState<string | null>(null)

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (booting) {
      setBooting(false)
      return
    }
    if (e.key === "Tab") {
      e.preventDefault()
      const pool = inLesson ? sandboxVocabulary(lesson!.lesson) : []
      const app = appCompletions(input)
      if (app.length === 1) {
        setInput(app[0])
        setGhost(null)
      } else if (app.length > 1) {
        setGhost(app.join("  "))
      } else if (inLesson) {
        const matches = Array.from(new Set(pool)).filter((c) => input && c.startsWith(input))
        if (matches.length === 1) setInput(matches[0])
        else if (matches.length > 1) setGhost(matches.join("  "))
        else setGhost(null)
      }
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      const idx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1)
      if (history[idx] !== undefined) {
        setHistoryIdx(idx)
        setInput(history[idx])
      }
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (historyIdx === -1) return
      const idx = historyIdx + 1
      if (idx >= history.length) {
        setHistoryIdx(-1)
        setInput("")
      } else {
        setHistoryIdx(idx)
        setInput(history[idx])
      }
      return
    }
    if (e.key === "l" && e.ctrlKey) {
      e.preventDefault()
      setLines([])
      return
    }
    if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      setPaletteOpen(true)
      return
    }
    if (e.key === "Enter") {
      submit(input)
      setInput("")
      setGhost(null)
      setHistoryIdx(-1)
      return
    }
    setGhost(null)
  }

  /* ghost suggestion */
  useEffect(() => {
    if (input.length < 2 || input.includes(" ")) {
      setGhost(null)
      return
    }
    const app = appCompletions(input)
    if (app.length === 1 && app[0] !== input) {
      setGhost(app[0].slice(input.length))
      return
    }
    setGhost(null)
  }, [input])

  const promptLabel = inLesson ? `learner@terminaltype:${cwdOf(world)}$` : "learner@terminaltype:~$"

  /* ---------- render ---------- */
  const showBoot = booting && !progress.reducedMotion
  const visibleBoot = BOOT_LINES.slice(0, bootStep)

  const currentLessonData = lessonId ? getLesson(lessonId) : undefined
  const showIntro = !!currentLessonData && exerciseIndex === -1

  return (
    <div
      className="terminal-root"
      style={cssVars}
      data-reduced={progress.reducedMotion ? "true" : undefined}
      data-flash={flash ? "true" : undefined}
    >
      <div className="scanlines" aria-hidden />
      <div ref={scrollRef} className="scrollback" onClick={() => inputRef.current?.focus()}>
        {showBoot
          ? visibleBoot.map((l) => (
              <div key={nextId()} className="tl">
                <BootLine text={l[0]} color={l[1]} />
              </div>
            ))
          : lines.map((l) => (
              <div key={l.id} className="tl">
                {l.segments.map((s, i) => (
                  <span key={i} className={`c-${s.color ?? "text"}`}>
                    {s.text}
                  </span>
                ))}
              </div>
            ))}

        {!showBoot && (
          <>
            {showIntro && currentLessonData && (
              <div className="tl lesson-intro">
                <div className="task-banner">
                  <span className="c-accent">▸ {currentLessonData.lesson.title.toUpperCase()}</span>
                  <span className="c-dim"> — {currentLessonData.lesson.exercises.length} exercises · type</span>{" "}
                  <span className="c-command">next</span>
                  <span className="c-dim"> to begin</span>
                </div>
              </div>
            )}

            {currentExercise && (
              <div className="tl">
                <div className="task-banner">
                  <span className="c-accent">
                    ▸ TASK [{completedExerciseIds.length}/{currentLessonData!.lesson.exercises.length}]:{" "}
                  </span>
                  <span className="c-text">{currentExercise.prompt}</span>
                </div>
              </div>
            )}

            <div className="input-line tl">
              <span className="c-prompt">{promptLabel} </span>
              <span className="input-wrap">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  autoFocus
                  spellCheck={false}
                  autoCapitalize="off"
                  autoComplete="off"
                  aria-label="terminal input"
                />
                {ghost && <span className="ghost">{ghost}</span>}
              </span>
            </div>
            {ghost && ghost.includes("  ") && (
              <div className="tl">
                <span className="c-dim">{ghost}</span>
              </div>
            )}
          </>
        )}
      </div>

      {paletteOpen && (
        <Palette
          onClose={() => setPaletteOpen(false)}
          onPick={(id) => {
            setPaletteOpen(false)
            makeCtx().actions.startLesson(id)
            setLines((prev) => [...prev, ...lessonCard(id, makeCtx())])
          }}
        />
      )}
    </div>
  )
}

function cwdOf(world: World | null): string {
  if (!world) return "~"
  const cwd = (world as { cwd: string[] }).cwd ?? []
  return "~" + (cwd.length ? "/" + cwd.join("/") : "")
}

function promptLine(raw: string, cwd: string | null): Line {
  return {
    id: nextId(),
    segments: [
      { text: `learner@terminaltype:${cwd ?? "~"}$ `, color: "prompt" },
      { text: raw, color: "command" },
    ],
  }
}

function BootLine({ text, color }: { text: string; color: Segment["color"] }) {
  return <span className={`c-${color}`}>{text}</span>
}
