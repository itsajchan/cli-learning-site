export type SegmentColor =
  | "text"
  | "dim"
  | "command"
  | "flag"
  | "string"
  | "error"
  | "success"
  | "warning"
  | "accent"
  | "prompt"
  | "path"

export interface Segment {
  text: string
  color?: SegmentColor
}

export interface Line {
  id: string
  segments: Segment[]
}

export type WorldKind = "fs" | "git" | "docker" | "k8s" | "ffmpeg"

/** Generic command output shared by all world runners. */
export interface CmdOutput {
  world: World
  lines: { text: string; color?: string }[]
  error?: boolean
}

/** Parsed command: e.g. `ls -la src` */
export interface ParsedCommand {
  raw: string
  cmd: string
  flags: string[] // normalized: "-a", "--all" kept as typed
  args: string[]
  flagsAndArgs: string[]
}

/** A matcher describes what commands an exercise accepts. */
export interface CommandMatcher {
  /** command name (e.g. "ls"); "*"" accepts any known-command */
  cmd: string
  /** flags that must be present (any-of groups when nested) */
  flags?: string[][]
  /** literal arg matchers, in order; "*"" = any arg */
  args?: string[]
  /** min number of args */
  minArgs?: number
  /** exact arg count required */
  argCount?: number
  /** human label for feedback, e.g. "ls -a" */
  label?: string
  /** exact string used by tests to verify solvability (defaults to rendered cmd+flags+args) */
  canonical?: string
}

export interface Exercise {
  id: string
  prompt: string
  /** accepted matchers — any one passing completes the exercise */
  accept: CommandMatcher[]
  /** mistake pattern -> coaching message. Key is a compact matcher-ish string like "cmd:ls flag:-l" */
  tips?: Record<string, string>
  setup?: WorldMutation[]
  /** free-play commands additionally supported after pass */
  hint?: string
}

export interface Lesson {
  id: string
  title: string
  track: string
  tool: string
  intro: string
  /** initial world state (files present at lesson start) */
  seed?: WorldMutation[]
  exercises: Exercise[]
  world: WorldKind
  boss?: boolean
  badge?: string
}

export interface Track {
  id: string
  title: string
  level: "Beginner" | "Intermediate" | "Advanced"
  description: string
  lessons: Lesson[]
}

/* ---------- Virtual worlds ---------- */

export interface FSNode {
  type: "dir" | "file"
  name: string
  content?: string
  hidden?: boolean
  children?: Record<string, FSNode>
}

export interface FSWorld {
  kind: "fs"
  cwd: string[] // path segments from root
  root: FSNode
}

export interface GitCommit {
  hash: string
  message: string
  branch: string
}

export interface GitWorld {
  kind: "git"
  initialized: boolean
  cwd: string[]
  root: FSNode
  staged: string[]
  modified: string[]
  untracked: string[]
  branches: string[]
  currentBranch: string
  commits: GitCommit[]
  remotes: string[]
  remoteCommits: string[]
  inMerge?: boolean
}

export interface DockerContainer {
  id: string
  image: string
  name: string
  status: "running" | "exited" | "created"
  ports?: string
}

export interface DockerWorld {
  kind: "docker"
  images: { repo: string; tag: string; id: string; size: string }[]
  containers: DockerContainer[]
  cwd: string[]
  root: FSNode
}

export interface K8sPod {
  name: string
  image: string
  status: "Running" | "Pending" | "CrashLoopBackOff" | "ContainerCreating"
  restarts: number
  ready: string
}

export interface K8sDeployment {
  name: string
  replicas: number
  readyReplicas: number
  image: string
}

export interface K8sService {
  name: string
  type: string
  clusterIP: string
  port: string
}

export interface K8sWorld {
  kind: "k8s"
  pods: K8sPod[]
  deployments: K8sDeployment[]
  services: K8sService[]
  cwd: string[]
  root: FSNode
  appliedOnce: boolean
}

export interface FfmpegWorld {
  kind: "ffmpeg"
  cwd: string[]
  root: FSNode
}

export type World = FSWorld | GitWorld | DockerWorld | K8sWorld | FfmpegWorld

export interface WorldMutation {
  op:
    | "mkdir"
    | "touch"
    | "write"
    | "rm"
    | "chdir"
    | "gitInit"
    | "gitModify"
    | "gitRemote"
    | "dockerImage"
    | "dockerContainer"
    | "k8sPod"
    | "k8sDeploy"
    | "k8sService"
  path?: string
  name?: string
  content?: string
  image?: string
  tag?: string
  size?: string
  cname?: string
  status?: string
  ports?: string
  replicas?: number
  ready?: number
  clusterIP?: string
  port?: string
  restarts?: number
  kstatus?: K8sPod["status"]
}

/* ---------- Progress ---------- */

export interface Progress {
  xp: number
  badges: string[]
  completedLessons: string[]
  currentTrack: string
  currentLesson: string | null
  streak: number
  lastPlayed: string | null // ISO date
  theme: string
  reducedMotion: boolean
}
