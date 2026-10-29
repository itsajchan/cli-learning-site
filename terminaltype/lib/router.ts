"use client"

import type { Line, Segment } from "./types"
import { TRACKS, getLesson, nextLesson, getTrack, TOTAL_LESSONS } from "./content"
import { THEME_LIST } from "./theme"
import { closestWord } from "./parser/tokenizer"

export interface RouterContext {
  currentTrack: string
  currentLesson: string | null
  lessonIndex: number // exercise index within lesson; -1 = intro not yet accepted
  inLesson: boolean
  completedLessons: string[]
  xp: number
  badges: string[]
  streak: number
  theme: string
  actions: {
    startLesson: (lessonId: string) => void
    acceptIntro: () => void
    skipExercise: () => void
    nextLesson: () => void
    clear: () => void
    setTheme: (t: string) => void
    toggleReducedMotion: () => void
    resetProgress: () => void
    exportProgress: () => string
    importProgress: (code: string) => boolean
    openPalette: () => void
    hintUsed: () => void
    bootDone: () => void
    showAchievements: () => void
  }
}

export interface RouterResult {
  handled: boolean
  lines?: Line[]
  /** keep focus in sandbox instead of router (e.g. lesson exercise commands) */
}

const APP_COMMANDS = [
  "help", "learn", "track", "tracks", "next", "skip", "hint", "reset", "clear",
  "theme", "achievements", "save", "load", "status", "ls-tracks", "start", "settings", "exit",
]

export function buildHelp(): Line[] {
  return [
    mkLine("─── TerminalType commands ─────────────────────", "dim"),
    mkLine("  learn <tool>     jump to a tool's next lesson (git, docker, ls...)", "text"),
    mkLine("  track <1|2|3>    switch track (or 'tracks' to list them)", "text"),
    mkLine("  next             continue to the current task", "text"),
    mkLine("  hint             nudge for the current exercise", "text"),
    mkLine("  skip             skip the current exercise", "text"),
    mkLine("  status           your progress (xp, streak, badges)", "text"),
    mkLine("  achievements     badge collection", "text"),
    mkLine("  theme <name>     phosphor | dracula | nord | gruvbox | matrix", "text"),
    mkLine("  settings         toggle motion / accessibility", "text"),
    mkLine("  save             export progress as a code", "text"),
    mkLine("  load <code>      import progress from a code", "text"),
    mkLine("  reset            wipe all progress", "text"),
    mkLine("  clear            wipe the screen", "text"),
    mkLine("  Ctrl+K           jump to any lesson", "dim"),
    mkLine("─── in lessons, real commands work too ────────", "dim"),
  ]
}

export function mkLine(text: string, color?: Segment["color"]): Line {
  return { id: Math.random().toString(36).slice(2), segments: [{ text, color: color ?? "text" }] }
}

export function mkLines(text: string, color?: Segment["color"]): Line[] {
  return text.split("\n").map((t) => mkLine(t, color))
}

export function lessonCard(lessonId: string, ctx: RouterContext): Line[] {
  const found = getLesson(lessonId)
  if (!found) return [mkLine(`lesson '${lessonId}' not found. Try 'tracks' or Ctrl+K.`, "error")]
  const { track, lesson, index } = found
  const done = ctx.completedLessons.includes(lesson.id)
  const lines: Line[] = []
  lines.push(mkLine(`┌── ${track.title.toUpperCase()} · Lesson ${index + 1}/${track.lessons.length} ${lesson.boss ? "· 👑 BOSS" : ""} ${done ? "· ✅ done" : ""}`, "accent"))
  lines.push(mkLine(`│  ${lesson.title}`, "command"))
  lines.push(mkLine(`│  tool: ${lesson.tool} · world: ${lesson.world}`, "dim"))
  lines.push(mkLine("│", "dim"))
  for (const l of mkLines(lesson.intro)) {
    lines.push({ id: Math.random().toString(36).slice(2), segments: [{ text: `│  ${l.segments[0].text}`, color: "text" }] })
  }
  lines.push(mkLine("└──────────────────────────────────────────", "accent"))
  return lines
}

export function trackList(ctx: RouterContext): Line[] {
  const lines: Line[] = [mkLine("─── tracks ─────────────────────────────", "dim")]
  TRACKS.forEach((t, i) => {
    const doneCount = t.lessons.filter((l) => ctx.completedLessons.includes(l.id)).length
    const active = ctx.currentTrack === t.id ? "*" : " "
    lines.push(mkLine(`${active} track ${i + 1} — ${t.title} (${t.level})`, ctx.currentTrack === t.id ? "success" : "text"))
    lines.push(mkLine(`    ${t.description}`, "dim"))
    lines.push(mkLine(`    ${doneCount}/${t.lessons.length} lessons complete`, "accent"))
  })
  return lines
}

export function statusReport(ctx: RouterContext): Line[] {
  const lines: Line[] = [
    mkLine("─── learner status ─────────────────────", "dim"),
    mkLine(`  xp:        ${ctx.xp}`, "text"),
    mkLine(`  streak:    ${ctx.streak} day${ctx.streak === 1 ? "" : "s"} 🔥`, "text"),
    mkLine(`  badges:    ${ctx.badges.length} of ${TOTAL_LESSONS}`, "text"),
    mkLine(`  lessons:   ${ctx.completedLessons.length}/${TOTAL_LESSONS} complete`, "text"),
    mkLine(`  theme:     ${ctx.theme}`, "text"),
  ]
  return lines
}

export function achievementsReport(ctx: RouterContext): Line[] {
  const lines = [mkLine("─── achievements ───────────────────────", "dim")]
  let found = 0
  for (const track of TRACKS) {
    for (const lesson of track.lessons) {
      if (!lesson.badge) continue
      const has = ctx.badges.includes(lesson.badge)
      if (has) found++
      lines.push(
        mkLine(
          `  ${has ? "🏆" : "🔒"} ${lesson.badge.replace(/-/g, " ")} — ${lesson.title}`,
          has ? "success" : "dim",
        ),
      )
    }
  }
  lines.push(mkLine(`  ${found} unlocked`, "accent"))
  return lines
}

function findTrackByNumber(n: string) {
  const idx = parseInt(n, 10) - 1
  return TRACKS[idx]
}

const TOOL_ALIASES: Record<string, string> = {
  list: "ls", "dir": "ls", "cd": "cd", "mkdir": "mkdir", "touch": "mkdir",
  "cat": "cat", "git": "git", "grep": "grep", "npm": "npm", "npx": "npm",
  "docker": "docker", "kubectl": "kubectl", "k8s": "kubectl", "ffmpeg": "ffmpeg",
  "shell": "shell", "bash": "shell", "terminal": "shell",
}

/** Route an app-level command. Returns null if the router did NOT handle it (fall through to sandbox). */
export function routeAppCommand(raw: string, ctx: RouterContext): RouterResult | null {
  const trimmed = raw.trim()
  if (!trimmed) return { handled: true, lines: [] }
  const [cmd, ...rest] = trimmed.split(/\s+/)
  const arg = rest.join(" ")

  switch (cmd) {
    case "help":
    case "--help":
      return { handled: true, lines: buildHelp() }

    case "clear":
      ctx.actions.clear()
      return { handled: true, lines: [] }

    case "tracks":
    case "ls-tracks":
      return { handled: true, lines: trackList(ctx) }

    case "track": {
      const t = findTrackByNumber(arg) ?? getTrack(arg)
      if (!t) return { handled: true, lines: [mkLine(`no track '${arg}'. try 'tracks'`, "error")] }
      const firstUndone = t.lessons.find((l) => !ctx.completedLessons.includes(l.id)) ?? t.lessons[0]
      ctx.actions.startLesson(firstUndone.id)
      return {
        handled: true,
        lines: [
          mkLine(`switching to track ${t.id.replace("track-", "")} — ${t.title}`, "dim"),
          ...lessonCard(firstUndone.id, ctx),
        ],
      }
    }

    case "learn": {
      const tool = TOOL_ALIASES[arg.toLowerCase()]
      if (!tool) {
        return {
          handled: true,
          lines: [mkLine(`no lessons for '${arg}'. tools: ls, cd, mkdir, cat, git, grep, npm, docker, kubectl, ffmpeg`, "error")],
        }
      }
      // find next uncompleted lesson for tool
      const candidates = TRACKS.flatMap((t) => t.lessons).filter((l) => l.tool === tool)
      const target = candidates.find((l) => !ctx.completedLessons.includes(l.id))
      if (!target) {
        return { handled: true, lines: [mkLine(`you've completed every ${tool} lesson. respect. 🫡`, "success")] }
      }
      ctx.actions.startLesson(target.id)
      return { handled: true, lines: [mkLine(`loading ${tool} lesson...`, "dim"), ...lessonCard(target.id, ctx)] }
    }

    case "next": {
      if (ctx.currentLesson && ctx.lessonIndex === -1) {
        // intro showing — accept it
        ctx.actions.acceptIntro()
        return { handled: true, lines: [] }
      }
      const nl = ctx.currentLesson ? nextLesson(ctx.currentLesson) : TRACKS[0].lessons[0]
      if (!nl) return { handled: true, lines: [mkLine("you've reached the end. every lesson complete. 🏆", "success")] }
      ctx.actions.startLesson(nl.id)
      return { handled: true, lines: [...lessonCard(nl.id, ctx)] }
    }

    case "start":
      return ctx.currentLesson
        ? { handled: true, lines: [...lessonCard(ctx.currentLesson, ctx)] }
        : null

    case "skip":
      if (!ctx.inLesson) return { handled: true, lines: [mkLine("nothing to skip — type 'next' to start a lesson", "dim")] }
      ctx.actions.skipExercise()
      return { handled: true, lines: [mkLine("skipped (no xp — honesty is a CLI virtue)", "dim")] }

    case "hint":
      if (!ctx.inLesson) return { handled: true, lines: [mkLine("enter a lesson first — 'next'", "dim")] }
      ctx.actions.hintUsed()
      return { handled: true } // the sandbox component injects the actual hint

    case "status":
      return { handled: true, lines: statusReport(ctx) }

    case "achievements":
      ctx.actions.showAchievements()
      return { handled: true }

    case "theme": {
      if (!arg) {
        return {
          handled: true,
          lines: [mkLine(`themes: ${THEME_LIST.map((t) => t.id).join(", ")} — usage: theme dracula`, "dim")],
        }
      }
      const theme = THEME_LIST.find((t) => t.id === arg.toLowerCase())
      if (!theme) {
        const sugg = closestWord(arg, THEME_LIST.map((t) => t.id))
        return { handled: true, lines: [mkLine(`unknown theme '${arg}'${sugg ? ` — did you mean '${sugg}'?` : ""}`, "error")] }
      }
      ctx.actions.setTheme(theme.id)
      return { handled: true, lines: [mkLine(`theme set to ${theme.id} ✨`, "success")] }
    }

    case "settings":
      ctx.actions.toggleReducedMotion()
      return {
        handled: true,
        lines: [mkLine("toggled reduced motion (scanlines/glitch off, typewriter instant)", "dim")],
      }

    case "save":
      return {
        handled: true,
        lines: [
          mkLine("your progress code (keep it somewhere safe):", "dim"),
          mkLine(ctx.actions.exportProgress(), "string"),
          mkLine("restore later with: load <code>", "dim"),
        ],
      }

    case "load": {
      if (!arg) return { handled: true, lines: [mkLine("usage: load <code>", "error")] }
      const ok = ctx.actions.importProgress(arg)
      return {
        handled: true,
        lines: [ok ? mkLine("progress restored ✅", "success") : mkLine("that code didn't parse — copy the whole thing?", "error")],
      }
    }

    case "reset":
      ctx.actions.resetProgress()
      ctx.actions.clear()
      return {
        handled: true,
        lines: [
          mkLine("progress wiped. fresh terminal, who dis.", "warning"),
          mkLine("type 'next' to begin again", "dim"),
        ],
      }

    case "exit":
    case "quit":
      return {
        handled: true,
        lines: [mkLine("there is no exit from the terminal. only 'next'.", "warning")],
      }

    case "rm": {
      if (rest.join(" ").includes("-rf /") || rest.join(" ").includes("-fr /")) {
        return {
          handled: true,
          lines: [
            mkLine("🛑 absolute legend move, but no. this sandbox keeps its safety rails on.", "warning"),
            mkLine("(real terminals would now be deleting everything. always double-check rm -rf)", "dim"),
          ],
        }
      }
      return null
    }

    case "neofetch":
      return {
        handled: true,
        lines: [
          mkLine("      ▄▄▄▄▄▄▄        learner@terminaltype", "success"),
          mkLine("    ▄█████████▄      ─────────────────────", "success"),
          mkLine("   ███████████▀      OS: TerminalType Web", "success"),
          mkLine("   ▀█████████▄       Shell: ttype 1.0", "success"),
          mkLine("     ▀▀▀▀▀▀▀         XP: " + ctx.xp, "success"),
          mkLine("                     Lessons: " + ctx.completedLessons.length + "/" + TOTAL_LESSONS, "success"),
          mkLine("                     Badges: " + ctx.badges.length, "success"),
          mkLine("                     Streak: " + ctx.streak + "🔥", "success"),
        ],
      }
  }

  // 'cd' inside app shell → cute message but still handled at app level when not in lesson
  if (["ls", "pwd", "cd", "cat", "mkdir", "touch", "echo", "grep", "git", "npm", "docker", "kubectl", "ffmpeg"].includes(cmd) && !ctx.inLesson) {
    return {
      handled: true,
      lines: [
        mkLine(`${cmd}: real ${cmd} lives inside lessons — type 'next' to enter one`, "dim"),
        mkLine(`or jump straight in: learn ${cmd}`, "dim"),
      ],
    }
  }

  return null
}

/** Tab completion candidates for app-level commands. */
export function appCompletions(input: string): string[] {
  const tokens = input.split(/\s+/)
  if (tokens.length <= 1) {
    return APP_COMMANDS.filter((c) => c.startsWith(tokens[0] ?? ""))
  }
  const [cmd, arg] = tokens
  if (cmd === "theme") return THEME_LIST.filter((t) => t.id.startsWith(arg)).map((t) => `theme ${t.id}`)
  if (cmd === "learn") {
    const tools = ["ls", "cd", "mkdir", "cat", "git", "grep", "npm", "docker", "kubectl", "ffmpeg"]
    return tools.filter((t) => t.startsWith(arg)).map((t) => `learn ${t}`)
  }
  if (cmd === "track") return ["1", "2", "3"].filter((n) => n.startsWith(arg)).map((n) => `track ${n}`)
  return []
}
