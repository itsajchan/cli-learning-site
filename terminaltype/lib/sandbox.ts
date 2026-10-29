import type {
  Exercise,
  Lesson,
  ParsedCommand,
  World,
  WorldMutation,
  FSWorld,
} from "./types"
import { parseLine, closestWord } from "./parser/tokenizer"
import { matchAny, type MatchResult } from "./parser/matcher"
import {
  makeFSWorld,
  applyMutations,
  fsLs,
  fsCd,
  fsPwd,
  fsMkdir,
  fsTouch,
  fsCat,
  fsRm,
  fsGrep,
  nodeAt,
  type WorldOutput,
} from "./worlds/fs"
import { makeGitWorld, gitApplyMutations, runGit } from "./worlds/git"
import {
  makeDockerWorld,
  dockerApplyMutations,
  runDocker,
  makeK8sWorld,
  k8sApplyMutations,
  runK8s,
  makeFfmpegWorld,
  runFfmpeg,
} from "./worlds/containers"

export interface SandboxResult {
  world: World
  lines: { text: string; color?: string }[]
  error?: boolean
  exercisePassed?: boolean
  exercise?: Exercise
  /** extra commands the free-play mode understands (for tab complete) */
  suggestions?: string[]
}

export const KNOWN = [
  "ls", "cd", "pwd", "mkdir", "touch", "cat", "rm", "echo", "grep", "clear",
  "git", "npm", "npx", "docker", "kubectl", "ffmpeg", "man", "which", "help", "hint",
]

function outputToWorld(world: World, out: import("./types").CmdOutput): SandboxResult {
  return { world: out.world, lines: out.lines, error: out.error }
}

function runWorldCommand(world: World, parsed: ParsedCommand): SandboxResult | null {
  switch (world.kind) {
    case "fs":
      switch (parsed.cmd) {
        case "ls": case "dir": return outputToWorld(world, fsLs(world, parsed))
        case "cd": return outputToWorld(world, fsCd(world, parsed))
        case "pwd": return outputToWorld(world, fsPwd(world))
        case "mkdir": return outputToWorld(world, fsMkdir(world, parsed))
        case "touch": return outputToWorld(world, fsTouch(world, parsed))
        case "cat": return outputToWorld(world, fsCat(world, parsed))
        case "rm": return outputToWorld(world, fsRm(world, parsed))
        case "grep": return outputToWorld(world, fsGrep(world, parsed))
        case "echo":
          return { world, lines: [{ text: parsed.flagsAndArgs.slice(1).join(" ").replace(/^["']|["']$/g, ""), color: "text" }] }
        case "which": case "man":
          return { world, lines: [{ text: `${parsed.args[0] ?? "?"}: built into this sandbox — try 'hint' if stuck`, color: "dim" }] }
        case "npm":
          return runNpm(world, parsed)
      }
      return null
    case "git":
      if (parsed.cmd === "git") return { world: runGit(world, parsed).world, lines: runGit(world, parsed).lines, error: runGit(world, parsed).error }
      // allow fs commands inside git world
      return fsInWorld(world, parsed)
    case "docker":
      if (parsed.cmd === "docker") {
        const out = runDocker(world, parsed)
        return outputToWorld(world, out)
      }
      return fsInWorld(world, parsed)
    case "k8s":
      if (parsed.cmd === "kubectl") {
        const out = runK8s(world, parsed)
        return outputToWorld(world, out)
      }
      return fsInWorld(world, parsed)
    case "ffmpeg":
      if (parsed.cmd === "ffmpeg") {
        const out = runFfmpeg(world, parsed)
        return outputToWorld(world, out)
      }
      return fsInWorld(world, parsed)
  }
}

/** Minimal npm simulation inside fs worlds. */
function runNpm(world: World, parsed: ParsedCommand): SandboxResult {
  const w = structuredClone(world) as import("./types").FSWorld
  const sub = parsed.args[0] ?? ""
  const pkg = parsed.args[1]
  const home = nodeAt(w.root, w.cwd)!

  const readPkg = (): Record<string, unknown> | null => {
    const file = home.children?.["package.json"]
    if (!file || file.type !== "file") return null
    try {
      return JSON.parse(file.content ?? "{}")
    } catch {
      return null
    }
  }
  const writePkg = (data: Record<string, unknown>) => {
    home.children = home.children ?? {}
    home.children["package.json"] = { type: "file", name: "package.json", content: JSON.stringify(data, null, 2) + "\n" }
  }

  switch (sub) {
    case "init": {
      if (readPkg()) return { world: w, lines: [{ text: "package.json already exists", color: "dim" }] }
      writePkg({ name: "sandbox", version: "1.0.0", scripts: { test: 'echo "ok"' } })
      return {
        world: { ...w, root: w.root },
        lines: [
          { text: "Wrote to package.json:", color: "dim" },
          { text: '{ "name": "sandbox", "version": "1.0.0" }', color: "dim" },
        ],
      }
    }
    case "install":
    case "i":
    case "add": {
      if (!pkg) {
        return { world: w, error: true, lines: [{ text: "npm install needs a package name (or a package.json to install from)", color: "error" }] }
      }
      const data = readPkg() ?? { name: "sandbox", version: "1.0.0" }
      const deps = (data.dependencies as Record<string, string>) ?? {}
      deps[pkg] = "^" + Math.floor(Math.random() * 4) + "." + Math.floor(Math.random() * 10) + ".0"
      data.dependencies = deps
      writePkg(data)
      home.children = home.children ?? {}
      home.children["node_modules"] = { type: "dir", name: "node_modules", children: {} }
      return {
        world: { ...w, root: w.root },
        lines: [
          { text: `added 1 package in 0.8s`, color: "dim" },
          { text: `+ ${pkg}@${deps[pkg]}`, color: "success" },
        ],
      }
    }
    case "run":
    case "test":
    case "start": {
      const script = sub === "run" ? pkg : sub
      if (!script) return { world: w, error: true, lines: [{ text: "npm run <script-name>", color: "error" }] }
      const data = readPkg()
      if (!data) return { world: w, error: true, lines: [{ text: "npm ERR! no package.json — run npm init -y first", color: "error" }] }
      const scripts = (data.scripts as Record<string, string>) ?? {}
      const cmd = scripts[script]
      if (!cmd) {
        return { world: w, error: true, lines: [{ text: `npm ERR! Missing script: "${script}"`, color: "error" }, { text: `available: ${Object.keys(scripts).join(", ") || "none"}`, color: "dim" }] }
      }
      const match = cmd.match(/echo\s+"?([^"]*)"?/)
      return {
        world: w,
        lines: [
          { text: `> sandbox@1.0.0 ${script}`, color: "dim" },
          { text: `> ${cmd}`, color: "dim" },
          { text: match ? match[1].replace(/\\"/g, "") : `ran: ${cmd}`, color: "success" },
        ],
      }
    }
    default:
      return { world: w, error: true, lines: [{ text: `Unknown command "${sub}" — try npm init, npm install, or npm run`, color: "error" }] }
  }
}
function fsInWorld(world: World, parsed: ParsedCommand): SandboxResult | null {
  // run fs commands against any world's embedded root; keep the OUTER world identity
  const fsWorld = { kind: "fs" as const, cwd: (world as { cwd: string[] }).cwd, root: (world as { root: import("./types").FSNode }).root }
  const wrap = (out: WorldOutput): SandboxResult => ({ world, lines: out.lines, error: out.error })
  switch (parsed.cmd) {
    case "ls": case "dir": return wrap(fsLs(fsWorld, parsed))
    case "cd": return wrap(fsCd(fsWorld, parsed))
    case "pwd": return wrap(fsPwd(fsWorld))
    case "mkdir": return wrap(fsMkdir(fsWorld, parsed))
    case "touch": return wrap(fsTouch(fsWorld, parsed))
    case "cat": return wrap(fsCat(fsWorld, parsed))
    case "rm": return wrap(fsRm(fsWorld, parsed))
    case "grep": return wrap(fsGrep(fsWorld, parsed))
    case "echo":
      return { world, lines: [{ text: parsed.flagsAndArgs.slice(1).join(" ").replace(/^["']|["']$/g, ""), color: "text" }] }
  }
  return null
}

function coachingMessage(parsed: ParsedCommand, result: MatchResult, exercise: Exercise): { text: string; color?: string }[] {
  // 1. exercise-specific tips (keyed like "cmd:ls flag:-l" or "cmd:git sub:commit")
  for (const [pattern, tip] of Object.entries(exercise.tips ?? {})) {
    if (tipMatches(pattern, parsed)) return [{ text: tip, color: "warning" }]
  }
  // 2. generic coaching based on closest matcher
  if (result.reason === "cmd") {
    const suggestion = closestWord(parsed.cmd, KNOWN)
    return [
      { text: `${parsed.cmd}: command not found`, color: "error" },
      ...(suggestion && suggestion !== parsed.cmd ? [{ text: `did you mean '${suggestion}'?`, color: "warning" }] : []),
      { text: `expected something like: ${result.matcher?.label ?? exercise.accept[0]?.label ?? exercise.hint ?? "??"} — type 'hint' for help`, color: "dim" },
    ]
  }
  if (result.reason === "flags") {
    return [
      { text: "Close! You've got the right command.", color: "success" },
      { text: `Missing flag(s): ${result.missingFlags?.join(" ")}`, color: "warning" },
      ...(result.matcher?.label ? [{ text: `try: ${result.matcher.label}`, color: "dim" }] : []),
    ]
  }
  if (result.reason === "args") {
    return [
      { text: "Right command — check the arguments though.", color: "warning" },
      ...(result.matcher?.label ? [{ text: `try: ${result.matcher.label}`, color: "dim" }] : []),
    ]
  }
  return [
    { text: "Not quite — count the arguments.", color: "warning" },
    ...(result.matcher?.label ? [{ text: `try: ${result.matcher.label}`, color: "dim" }] : []),
  ]
}

function tipMatches(pattern: string, parsed: ParsedCommand): boolean {
  // pattern format: space-separated k:v pairs. cmd:ls flag:-l arg:projects sub:commit
  const parts = Object.fromEntries(pattern.split(/\s+/).map((p) => [p.split(":")[0], p.split(":").slice(1).join(":")]))
  if (parts.cmd && parts.cmd !== parsed.cmd) return false
  if (parts.sub && parsed.args[0] !== parts.sub) return false
  if (parts.flag && !parsed.flags.includes(parts.flag)) return false
  if (parts.arg && !parsed.args.includes(parts.arg)) return false
  if (parts.noarg && parsed.args.includes(parts.noarg)) return false
  return true
}

/** Run a user-typed line in the current lesson sandbox. */
export function runSandboxCommand(world: World, lesson: Lesson, exerciseIndex: number, raw: string): SandboxResult {
  const parsed = parseLine(raw)
  if (!parsed.cmd) return { world, lines: [] }

  // help & hint handled by router, but man/--help inside sandbox:
  if (parsed.flags.includes("--help") || parsed.args[0] === "--help") {
    const label = exerciseLabel(lesson, exerciseIndex)
    return { world, lines: [{ text: `sandbox help — accepted for this task: ${label}`, color: "dim" }] }
  }

  const out = runWorldCommand(world, parsed)
  if (!out) {
    const suggestion = closestWord(parsed.cmd, KNOWN)
    return {
      world,
      error: true,
      lines: [
        { text: `${parsed.cmd}: command not found`, color: "error" },
        ...(suggestion && suggestion !== parsed.cmd ? [{ text: `did you mean '${suggestion}'?`, color: "warning" }] : []),
      ],
    }
  }

  // check exercise pass
  const exercise = lesson.exercises[exerciseIndex]
  if (exercise) {
    const result = matchAny(parsed, exercise.accept)
    // a command that errored at world level never passes the exercise
    if (result.matched && !out.error) {
      return { ...out, exercisePassed: true, exercise }
    }
    // if the command errored at world level, show that; else coach
    if (out.error) return out
    return {
      ...out,
      lines: [
        ...out.lines,
        ...coachingMessage(parsed, result, exercise),
      ],
    }
  }

  return out
}

export function exerciseLabel(lesson: Lesson, index: number): string {
  const ex = lesson.exercises[index]
  if (!ex) return "—"
  return ex.accept.map((a) => a.label ?? a.cmd).join(" or ")
}

/**
 * Build the world as it should be at the start of exercise `exerciseIndex`:
 * lesson seed + side effects of exercises 0..exerciseIndex-1.
 */
export function resetToExercise(lesson: Lesson, exerciseIndex: number): World {
  const mutations = [
    ...(lesson.seed ?? []),
    ...lesson.exercises
      .slice(0, Math.max(0, exerciseIndex))
      .flatMap((e) => e.setup ?? []),
  ]
  switch (lesson.world) {
    case "fs":
      return applyMutations(makeFSWorld({ type: "dir", name: "~", children: {} }), mutations)
    case "git":
      return gitApplyMutations(makeGitWorld([{ path: "README.md", content: "# My Project" }]), mutations)
    case "docker":
      return dockerApplyMutations(makeDockerWorld(), mutations)
    case "k8s":
      return k8sApplyMutations(makeK8sWorld(), mutations)
    case "ffmpeg": {
      const seed = makeFfmpegWorld()
      return applyMutations(seed.world as unknown as FSWorld, mutations) as unknown as World
    }
  }
}

/** Commands tab-complete should offer in the sandbox. */
export function sandboxVocabulary(lesson: Lesson): string[] {
  const base = [...KNOWN]
  if (lesson.world === "git") base.push("status", "add", "commit", "log", "branch", "checkout", "switch", "merge", "push", "remote", "diff")
  return base
}

export type { WorldMutation }
