import { describe, it, expect } from "vitest"
import { runSandboxCommand, resetToExercise } from "../lib/sandbox"
import { TRACKS, lintContent, getLesson, TOTAL_LESSONS } from "../lib/content"
import type { Lesson, World } from "../lib/types"

function setup(lessonId: string, exerciseIndex = 0) {
  const found = getLesson(lessonId)!
  const world = resetToExercise(found.lesson, exerciseIndex)
  return { lesson: found.lesson, world }
}

describe("content lint", () => {
  it("has no problems", () => {
    const problems = lintContent()
    expect(problems).toEqual([])
  })

  it("covers all 10 tools across 3 tracks", () => {
    const tools = new Set(TRACKS.flatMap((t) => t.lessons.map((l) => l.tool)))
    for (const tool of ["ls", "cd", "mkdir", "cat", "git", "grep", "npm", "docker", "kubectl", "ffmpeg"]) {
      expect(tools.has(tool)).toBe(true)
    }
    expect(TRACKS).toHaveLength(3)
    expect(TOTAL_LESSONS).toBeGreaterThanOrEqual(34)
  })
})

describe("sandbox: track 1 lessons are solvable", () => solvable(0))

function canonicalOf(m: { canonical?: string; cmd: string; flags?: string[][]; args?: string[] }): string {
  if (m.canonical) return m.canonical
  return [m.cmd, ...(m.flags ?? []).map((f) => f[0]), ...(m.args ?? [])].join(" ")
}

function solvable(trackIndex: number) {
  for (const lesson of TRACKS[trackIndex].lessons) {
    it(`${lesson.id}: every exercise accepts its canonical answer`, () => {
      let world: World = resetToExercise(lesson, 0)
      lesson.exercises.forEach((ex, i) => {
        const m = ex.accept[0]
        const cmds = canonicalOf(m).split("&&").map((c) => c.trim())
        const last = cmds.length - 1
        cmds.forEach((cmd, ci) => {
          const result = runSandboxCommand(world, lesson, i, cmd)
          world = result.world
          // only the final command of a && chain is checked against the exercise
          if (ci === last && !result.exercisePassed) {
            throw new Error(
              `${lesson.id}/${ex.id}: canonical answer "${cmd}" did not pass. output: ${result.lines
                .map((l) => l.text)
                .join(" | ")}`,
            )
          }
        })
      })
    })
  }
}

describe("sandbox: track 2 lessons are solvable", () => solvable(1))
describe("sandbox: track 3 lessons are solvable", () => solvable(2))

describe("sandbox coaching", () => {
  it("coaches when the wrong flag is used (ls -l instead of ls -a)", () => {
    const { lesson, world } = setup("t1-l2", 1)
    const result = runSandboxCommand(world, lesson, 1, "ls -l")
    expect(result.exercisePassed).toBeFalsy()
    expect(result.lines.some((l) => l.text.includes("-a"))).toBe(true)
  })

  it("suggests closest command on typo", () => {
    const { lesson, world } = setup("t1-l1", 0)
    const result = runSandboxCommand(world, lesson, 0, "pdw")
    expect(result.lines.some((l) => l.text.includes("pwd"))).toBe(true)
  })

  it("unknown commands get command not found", () => {
    const { lesson, world } = setup("t1-l1", 0)
    const result = runSandboxCommand(world, lesson, 0, "frobnicate")
    expect(result.error).toBe(true)
  })

  it("dangerous commands are blocked", () => {
    const { lesson, world } = setup("t1-l1", 0)
    const result = runSandboxCommand(world, lesson, 0, "rm -rf /")
    expect(result.lines.some((l) => l.text.includes("safety"))).toBe(true)
  })

  it("git commit without -m teaches the flag", () => {
    const { lesson, world } = setup("t2-l4", 0)
    // stage first
    const staged = runSandboxCommand(world, lesson, 0, "git add README.md")
    const result = runSandboxCommand(staged.world, lesson, 0, 'git commit "oops"')
    expect(result.exercisePassed).toBeFalsy()
    expect(result.lines.some((l) => l.text.includes("-m"))).toBe(true)
  })
})

describe("sandbox free play", () => {
  it("accepts realistic variants (trailing slash, quotes)", () => {
    const { lesson, world } = setup("t1-l3", 0)
    const r1 = runSandboxCommand(world, lesson, 0, 'cd "projects"')
    expect(r1.exercisePassed).toBe(true)
  })
})
