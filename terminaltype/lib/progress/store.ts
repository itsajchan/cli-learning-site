"use client"

import { create } from "zustand"
import type { Progress } from "../types"
import { TRACKS, TOTAL_LESSONS } from "../content"

const KEY = "terminaltype.progress.v1"

const defaultProgress: Progress = {
  xp: 0,
  badges: [],
  completedLessons: [],
  currentTrack: TRACKS[0].id,
  currentLesson: TRACKS[0].lessons[0].id,
  streak: 0,
  lastPlayed: null,
  theme: "phosphor",
  reducedMotion: false,
}

function load(): Progress {
  if (typeof window === "undefined") return defaultProgress
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultProgress
    return { ...defaultProgress, ...JSON.parse(raw) }
  } catch {
    return defaultProgress
  }
}

function save(p: Progress) {
  if (typeof window === "undefined") return
  localStorage.setItem(KEY, JSON.stringify(p))
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function yesterdayISO(): string {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10)
}

interface ProgressStore extends Progress {
  hydrated: boolean
  hydrate: () => void
  completeExercise: (xp: number) => void
  completeLesson: (lessonId: string, xp: number, badge?: string) => boolean
  setLesson: (trackId: string, lessonId: string) => void
  setTheme: (theme: string) => void
  toggleReducedMotion: () => void
  reset: () => void
  exportProgress: () => string
  importProgress: (code: string) => boolean
}

export const useProgress = create<ProgressStore>((set, get) => ({
  ...load(),
  hydrated: false,
  hydrate: () =>
    set(() => {
      const p = load()
      const last = p.lastPlayed
      let streak = p.streak
      if (last !== todayISO()) {
        streak = last === yesterdayISO() ? streak : 0
      }
      return { ...p, hydrated: true, streak }
    }),
  completeExercise: (xp) =>
    set((p) => {
      const next = { ...p, xp: p.xp + xp, lastPlayed: todayISO() }
      if (p.lastPlayed !== todayISO() && p.lastPlayed !== null) {
        next.streak = p.lastPlayed === yesterdayISO() ? p.streak + 1 : 1
      } else if (p.streak === 0) {
        next.streak = 1
      }
      save(next)
      return next
    }),
  completeLesson: (lessonId, xp, badge) => {
    const p = get()
    if (p.completedLessons.includes(lessonId)) return false
    const next: Progress = {
      ...p,
      xp: p.xp + xp,
      completedLessons: [...p.completedLessons, lessonId],
      badges: badge ? [...p.badges, badge] : p.badges,
      lastPlayed: todayISO(),
    }
    // advance cursor
    for (const track of TRACKS) {
      const idx = track.lessons.findIndex((l) => l.id === lessonId)
      if (idx !== -1) {
        next.currentTrack = track.id
        next.currentLesson = track.lessons[Math.min(idx + 1, track.lessons.length - 1)].id
      }
    }
    save(next)
    set(next)
    return true
  },
  setLesson: (trackId, lessonId) => {
    const next = { ...get(), currentTrack: trackId, currentLesson: lessonId }
    save(next)
    set(next)
  },
  setTheme: (theme) => {
    const next = { ...get(), theme }
    save(next)
    set(next)
  },
  toggleReducedMotion: () => {
    const next = { ...get(), reducedMotion: !get().reducedMotion }
    save(next)
    set(next)
  },
  reset: () => {
    localStorage.removeItem(KEY)
    set({ ...defaultProgress, hydrated: true })
  },
  exportProgress: () => {
    const p = { ...get() } as Progress & { hydrated?: boolean }
    delete p.hydrated
    return btoa(JSON.stringify(p))
  },
  importProgress: (code) => {
    try {
      const data = JSON.parse(atob(code.trim()))
      if (typeof data.xp !== "number" || !Array.isArray(data.completedLessons)) return false
      const next = { ...defaultProgress, ...data, hydrated: true }
      save(next)
      set(next)
      return true
    } catch {
      return false
    }
  },
}))

export const PROGRESS_VERSION = KEY
export { TOTAL_LESSONS }
