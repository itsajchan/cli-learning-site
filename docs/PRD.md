# PRD: TerminalType

An interactive, terminal-themed web app that teaches real CLI skills — from `ls` to `kubectl` — inside a simulated terminal in the browser.

---

## 1. Overview

### Problem
The CLI is intimidating for newcomers and underserved by existing education. Docs are dry, video courses are passive, and there's no safe place to practice commands before typing them into a real machine. Meanwhile, the terminal is *the* universal interface of software engineering — git, Docker, Kubernetes, and package managers all assume fluency.

### Solution
**TerminalType** is a Duolingo-meets-Codecademy experience wrapped entirely in a terminal aesthetic. Every screen looks and feels like a shell session. Lessons are interactive: users type real commands into a simulated terminal and watch a virtual filesystem, git repo, containers, and clusters respond. Guided sandboxes understand correct answers *and* common mistakes, offering smart feedback.

### Why now
- CLI skills are a hard prerequisite for modern dev workflows (CI/CD, containers, cloud).
- Existing tools are either passive (videos, blogs) or heavyweight (full VMs, WebContainers).
- A guided-sandbox approach — pattern-matched commands with typo-aware feedback — delivers 90% of the "real terminal" feel at a fraction of the complexity.

---

## 2. Goals & Success Metrics

### Goals
1. Teach practical, muscle-memory CLI usage across 10 tools, beginner → advanced.
2. Make practice feel real: typed commands, real responses, real consequences (in a sandbox).
3. Zero-friction start: no signup, works offline, progress stored locally.

### Success Metrics
| Metric | Target |
|---|---|
| Lesson completion rate (lesson started → finished) | ≥ 60% |
| Track 1 completion (terminal basics) | ≥ 35% of new users |
| D7 retention (localStorage-cohort return) | ≥ 20% |
| Avg. session length | ≥ 8 minutes |
| Commands typed per session | ≥ 40 |

### Non-goals
- ❌ Real shell execution / server-side execution (security surface, infra cost)
- ❌ Accounts, cloud sync, payments (v1)
- ❌ Windows PowerShell / cmd tracks (v1 is POSIX-flavored; `dir` gets a friendly hint)
- ❌ Mobile-native experience (v1 is desktop-first; keyboard required)

---

## 3. Target Audience

| Persona | Description | Needs |
|---|---|---|
| **The Newcomer** (primary) | Bootcamp student / career-switcher who has never opened a terminal | Hand-holding, zero jargon, instant wins |
| **The Bootcamper** | Knows basics, fears git and Docker | Structured tracks, safe practice reps |
| **The Rusty Dev** | Uses the CLI daily but panics at `kubectl` | Advanced tracks, quick reference, challenge mode |

---

## 4. Scope: Tracks & Lessons

Three tracks, 10 tools, ~36 lessons in v1. Each lesson = **5–8 exercises**, ~3–5 minutes.

### Track 1 — First Steps (Beginner) · ~8 lessons
Tools: `ls`, `cd`, `mkdir`, `cat`
- Intro: what is a terminal? prompt anatomy (`user@host:~$`)
- Navigating: `ls`, `cd`, `pwd`, relative vs absolute paths
- Creating: `mkdir`, `touch`
- Reading: `cat`
- **Boss exercise:** navigate a virtual filesystem to find a "hidden" file and print it

### Track 2 — Everyday Power (Intermediate) · ~14 lessons
Tools: `git`, `grep`, `npm`
- Git: init, status, add, commit, log, branching, merge, remote simulation
- Grep: literal search, `-i`, `-r`, `-n`, combining with pipes
- npm: init, install, scripts, dependencies
- **Boss exercise:** "Ship a feature" — branch, edit (simulated), commit, merge

### Track 3 — Ops & Media (Advanced) · ~14 lessons
Tools: `docker`, `kubectl`, `ffmpeg`
- Docker: images vs containers, run, ps, build (Dockerfile walk-through), logs
- Kubernetes: pods, deployments, services, `apply`, `get`, `logs`, `describe`
- ffmpeg: convert formats, extract audio, trim, compress (before/after visual output)
- **Boss exercise:** "Deploy the app" — build image, push (simulated), apply manifests, verify pods

Each lesson follows the arc: **concept card → guided practice → free-play sandbox → challenge → badge.**

---

## 5. Core Experience

### 5.1 It's all terminal, everywhere
- The **entire app is a shell session**. No navbar — navigation *is* the CLI.
- A persistent prompt: `learner@terminaltype:~$` with blinking cursor.
- Commands typed anywhere: `learn git`, `track 2`, `next`, `hint`, `clear`, `help`, `theme dracula`.
- Autocomplete: `Tab` completion for commands/args, `↑/↓` history, ghost-text suggestion as you type.

### 5.2 The lesson loop
1. **Concept card** — rendered as styled terminal output (ASCII boxes, syntax-highlighted command anatomy: command / flag / argument color-coded).
2. **Task banner** — e.g. `▸ TASK: list all files, including hidden ones` with a live ✅/progress indicator.
3. **Guided sandbox** — user types into a real-feeling prompt. The simulation accepts the expected commands and *plausible variants*, and responds to everything else.
4. **Feedback** — pass → satisfying success animation (green flash, XP counter tick). Fail → typo-aware coaching (below).
5. **Free play** — after passing, "the sandbox is yours" — poke around; the virtual FS/objects respond.
6. **Badge unlock** — ASCII-art achievement printed to the terminal, saved locally.

### 5.3 Smart feedback (the differentiator)
The guided sandbox uses **per-lesson command parsers** (not just pattern matching):

| User types | Response |
|---|---|
| `ls -la` (expected `ls -a`) | "Close! `-l` is for the long format — great instinct though. Here you only need `-a`." |
| `cd folder/` instead of `cd folder` | Succeeds (realistic), with a tip about trailing slashes |
| `git commit` (missing `-m`) | Simulates the real behavior: opens a mock "editor" notice teaching `-m` |
| `ls --help` | Renders a mini man-page styled output |
| Unrecognized command | `command not found: xyz — try 'hint'` |
| Dangerous command (`rm -rf /`) | Playful but firm safety response; never destructive |

Typo detection: Levenshtein distance against the lesson's accepted vocabulary → "Did you mean `mkdir`?"

### 5.4 Virtual world state
Each lesson instantiates a small **virtual environment model**:
- **Filesystem node tree** — supports `ls/cd/mkdir/touch/cat/rm` (sandboxed to a fake home dir)
- **Git state machine** — staged/unstaged files, branches, commits, HEAD
- **Docker/K8s state** — mock images, containers, pods with statuses
- **ffmpeg visual diff** — "converts" a fake file and shows a before/after media card (this one gets a small UI flourish beyond pure text)

State persists per-lesson only (reset with `reset`).

---

## 6. Feature Requirements

### P0 — MVP (must ship)
- [ ] Terminal shell UI (prompt, history, Tab-complete, keyboard-first)
- [ ] Command routing & help system (`help`, `learn`, `track`, `next`, `skip`, `hint`, `reset`, `clear`)
- [ ] 3 tracks × 36 lessons content engine (JSON-defined lessons)
- [ ] Virtual filesystem, git state machine, docker/k8s mock state
- [ ] Guided-sandbox parser with typo awareness & coaching messages
- [ ] Progress tracking in `localStorage` (XP, badges, streak, completed lessons, current position)
- [ ] Landing screen = terminal boot sequence → auto-starts Track 1
- [ ] Fully keyboard-navigable; command palette via `Ctrl+K` for lesson jump

### P1 — Fast follow
- [ ] Streaks, daily challenge ("command of the day")
- [ ] Achievements page (`achievements` command) with ASCII badges
- [ ] Theme system (dracula, nord, gruvbox, matrix)
- [ ] Typing-mini-game mode (pure speed drills for command vocabulary)
- [ ] Shareable progress card (generates an SVG/ASCII "neofetch"-style stat card)

### P2 — Later
- [ ] Optional accounts + cloud sync
- [ ] User-created lessons (community content)
- [ ] Real-shell mode via WebContainers (flagged, opt-in)
- [ ] PowerShell/cmd tracks

---

## 7. UX & Visual Design

### Look & feel
- **Monospace everything.** JetBrains Mono / IBM Plex Mono.
- Dark-first CRT-inspired theme: near-black background `#0a0e14`, phosphor-green primary `#4af626`, amber accents for warnings, red for errors — classic terminal palette with modern polish.
- Subtle scanline overlay + optional CRT flicker (toggle in `settings`, default *off* for accessibility).
- Syntax color coding within prompts: commands (white), flags (cyan), strings (green), errors (red), success (green).
- Motion: typed-text reveal for lesson intros, glitch effect on badge unlock, smooth prompt focus. Keep it fast — no animation >400ms.

### Layout
```
┌──────────────────────────────────────────────┐
│  learner@terminaltype:~/track-1/lesson-3     │  ← breadcrumb as path
├──────────────────────────────────────────────┤
│                                              │
│   ▸ LESSON 3: Navigating with cd             │
│   The cd command changes your current        │
│   directory...                               │
│                                              │
│   ▸ TASK: go into the projects folder        │
│   ✅ 1/3 done                                │
│                                              │
│   learner@terminaltype:~$ cd projects█       │
│                                              │
└──────────────────────────────────────────────┘
```
One column, full viewport, scrollback buffer like a real terminal. Everything readable at 14–16px.

### Accessibility
- Reduced-motion mode disables scanlines/glitch/typewriter effects.
- High-contrast theme option; all text ≥ WCAG AA contrast.
- Full keyboard operation (no pointer required anywhere).

---

## 8. Technical Approach

### Stack
| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Next.js (App Router)** | SSG for content pages, fast first paint |
| Language | **TypeScript** | Lesson schema typing is critical |
| State | **Zustand** | Terminal buffer, lesson state, world state |
| Styling | **Tailwind CSS** | Rapid theming, monospace design system |
| Persistence | **localStorage** (wrapped in a storage adapter) | Zero-friction progress; swappable for API later |
| Content | **JSON/YAML lesson files** in repo | Versioned, reviewable, no CMS needed |
| Testing | **Vitest** (parsers, state machines) + **Playwright** (key lesson flows) | Parser correctness is the product |

### Architecture notes
- **Terminal engine:** React component rendering a scrollback buffer + input line. Input events flow through a **command router** (app-level commands like `next`/`help` → lesson sandbox parser).
- **Lesson schema (illustrative):**
```ts
type Exercise = {
  id: string
  prompt: string          // the task text
  accept: CommandMatcher[]  // expected commands + variants
  tips: Record<string, string> // mistake-pattern → coaching msg
  setup?: WorldMutation   // seeds FS/git/docker state
  onPass?: WorldMutation
}
```
- **Matchers** are small composable AST matchers (parse command → compare against expected grammar), not regex soup. Enables typo distance + partial credit.
- **World state** is a reducer per environment type (FS / git / docker / k8s); commands are pure functions `(world, cmd) → { world, output }` — trivially testable.
- **SEO:** each track/lesson gets a static route with prerendered lesson summary (indexable), while the interactive session lives client-side.

---

## 9. Content Pipeline
- Lessons authored as YAML with a strict schema + CLI linter (`npm run lessons:lint`) validating: every exercise solvable, tips cover top-5 mistake patterns, no dead-end states.
- Seed v1 content: 36 lessons × ~6 exercises ≈ **220 exercises**. Boss lessons hand-tuned; standard lessons semi-templated.

---

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Sandbox feels fake ("it's just pattern matching") | Users bounce | Invest in typo-aware coaching, realistic outputs, free-play mode per lesson |
| Content authoring is slow | Delayed launch | YAML templates + lint tooling + semi-templated lessons |
| Virtual FS/git diverges from real tool behavior | Teaches wrong things | Behavior verified against real tool docs; side-by-side QA checklist per lesson |
| Local-only progress lost on cache clear | Frustration | Export/import progress as copy-paste string (on-theme: `save > myprogress.txt`) |

---

## 11. Launch Checklist
- [ ] Track 1 fully playable end-to-end
- [ ] Tracks 2–3 content complete & linted
- [ ] Lighthouse: ≥95 perf, ≥90 a11y on lesson route
- [ ] Keyboard-only walkthrough: boot → 3 lessons → badge, zero pointer use
- [ ] Progress survives refresh; reset & export work
- [ ] "Command not found" path handles 100% of inputs gracefully

---

## 12. Open Questions
1. Name: **TerminalType** (working) vs. alternatives — feedback welcome.
2. Should XP unlock tracks (gamified) or should all tracks be open from the start?
3. Include a "cheat sheet" overlay (`Ctrl+\`) with quick syntax reference during lessons?
