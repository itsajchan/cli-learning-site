import { load as yamlLoad } from "js-yaml"
import type { Track, Lesson, Exercise, CommandMatcher, WorldMutation } from "../types"
import { TRACK1_YAML, TRACK2_YAML, TRACK3_YAML } from "./generated"

/* eslint-disable @typescript-eslint/no-explicit-any */

function coerceMatcher(m: any): CommandMatcher {
  return {
    cmd: m.cmd,
    flags: m.flags,
    args: m.args,
    minArgs: m.minArgs,
    argCount: m.argCount,
    label: m.label,
    canonical: m.canonical,
  }
}

function coerceLesson(t: Track, l: any): Lesson {
  return {
    id: l.id,
    title: l.title,
    track: t.id,
    tool: l.tool,
    intro: (l.intro as string).trim(),
    seed: l.seed as WorldMutation[] | undefined,
    world: l.world,
    boss: l.boss,
    badge: l.badge,
    exercises: (l.exercises as any[]).map((e): Exercise => ({
      id: e.id,
      prompt: e.prompt,
      accept: (e.accept as any[]).map(coerceMatcher),
      tips: e.tips,
      setup: e.setup as WorldMutation[] | undefined,
      hint: e.hint,
    })),
  }
}

function coerceTrack(raw: string): Track {
  const t = yamlLoad(raw) as any
  const track: Track = {
    id: t.id,
    title: t.title,
    level: t.level,
    description: t.description,
    lessons: [],
  }
  track.lessons = (t.lessons as any[]).map((l) => coerceLesson(track, l))
  return track
}

export const TRACKS: Track[] = [coerceTrack(TRACK1_YAML), coerceTrack(TRACK2_YAML), coerceTrack(TRACK3_YAML)]

export function getTrack(id: string): Track | undefined {
  return TRACKS.find((t) => t.id === id)
}

export function getLesson(lessonId: string): { track: Track; lesson: Lesson; index: number } | undefined {
  for (const track of TRACKS) {
    const index = track.lessons.findIndex((l) => l.id === lessonId)
    if (index !== -1) return { track, lesson: track.lessons[index], index }
  }
  return undefined
}

export function nextLesson(lessonId: string): Lesson | undefined {
  for (const track of TRACKS) {
    const idx = track.lessons.findIndex((l) => l.id === lessonId)
    if (idx === -1) continue
    if (idx + 1 < track.lessons.length) return track.lessons[idx + 1]
    const trackIdx = TRACKS.findIndex((t) => t.id === track.id)
    return TRACKS[trackIdx + 1]?.lessons[0]
  }
  return undefined
}

export const TOTAL_LESSONS = TRACKS.reduce((n, t) => n + t.lessons.length, 0)

/** Content linter — structural problems break the test suite; tip coverage is reported as warnings. */
export function lintContent(): string[] {
  const problems: string[] = []
  const seenLessons = new Set<string>()
  for (const track of TRACKS) {
    if (!track.lessons.length) problems.push(`track ${track.id} has no lessons`)
    for (const lesson of track.lessons) {
      if (seenLessons.has(lesson.id)) problems.push(`duplicate lesson id: ${lesson.id}`)
      seenLessons.add(lesson.id)
      if (!lesson.exercises.length) problems.push(`${lesson.id}: no exercises`)
      for (const ex of lesson.exercises) {
        if (!ex.accept.length) problems.push(`${lesson.id}/${ex.id}: no accept matchers`)
        for (const m of ex.accept) {
          if (!m.cmd) problems.push(`${lesson.id}/${ex.id}: matcher without cmd`)
        }
        if (!ex.hint) problems.push(`${lesson.id}/${ex.id}: no hint`)
      }
    }
  }
  return problems
}

/** Soft metric: % of exercises that ship coaching tips. */
export function tipCoverage(): { withTips: number; total: number } {
  let withTips = 0
  let total = 0
  for (const track of TRACKS) {
    for (const lesson of track.lessons) {
      for (const ex of lesson.exercises) {
        total++
        if (ex.tips && Object.keys(ex.tips).length > 0) withTips++
      }
    }
  }
  return { withTips, total }
}
