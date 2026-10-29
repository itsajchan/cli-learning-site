import type { CmdOutput, GitWorld, ParsedCommand, WorldMutation, GitCommit } from "../types"
import { makeFSWorld, applyMutations } from "./fs"

export type WorldOutput = CmdOutput

function shortHash(): string {
  return Math.random().toString(16).slice(2, 9)
}

export function makeGitWorld(
  files: { path: string; content: string; hidden?: boolean }[],
  cwd: string[] = [],
): GitWorld {
  const fs = makeFSWorld(
    {
      type: "dir",
      name: "~",
      children: Object.fromEntries(
        files.map((f) => [
          f.path.split("/")[0],
          {
            type: f.path.includes("/") || !f.path.match(/\.[a-z]+$/) ? "dir" : "file",
            name: f.path,
            content: f.content,
          } as never,
        ]),
      ),
    },
    cwd,
  )
  return {
    kind: "git",
    initialized: false,
    cwd,
    root: fs.root,
    staged: [],
    modified: [],
    untracked: files.map((f) => f.path),
    branches: [],
    currentBranch: "main",
    commits: [],
    remotes: [],
    remoteCommits: [],
  }
}

export function gitApplyMutations(world: GitWorld, mutations: WorldMutation[]): GitWorld {
  const w = structuredClone(world)
  for (const m of mutations) {
    switch (m.op) {
      case "gitInit":
        w.initialized = true
        w.branches = ["main"]
        break
      case "gitRemote":
        if (m.name && !w.remotes.includes(m.name)) w.remotes.push(m.name)
        break
      case "gitModify":
        if (!w.modified.includes(m.path ?? "")) w.modified.push(m.path ?? "")
        w.untracked = w.untracked.filter((f) => f !== m.path)
        break
      default:
        // reuse fs mutations on the embedded root
        const fsWorld = applyMutations({ kind: "fs", cwd: w.cwd, root: w.root }, [m])
        w.root = fsWorld.root
    }
  }
  return w
}

function statusLines(world: GitWorld): { text: string; color?: string }[] {
  if (!world.initialized) {
    return [{ text: "fatal: not a git repository (or any of the parent directories): .git", color: "error" }]
  }
  const lines: { text: string; color?: string }[] = []
  lines.push({ text: `On branch ${world.currentBranch}`, color: "text" })
  if (world.commits.length === 0) {
    lines.push({ text: "", color: "text" })
    lines.push({ text: "No commits yet", color: "dim" })
  }
  lines.push({ text: "", color: "text" })
  if (world.staged.length) {
    lines.push({ text: "Changes to be committed:", color: "text" })
    for (const f of world.staged) lines.push({ text: `        modified:   ${f}`, color: "success" })
    lines.push({ text: "", color: "text" })
  }
  if (world.modified.length) {
    lines.push({ text: "Changes not staged for commit:", color: "text" })
    for (const f of world.modified) lines.push({ text: `        modified:   ${f}`, color: "error" })
    lines.push({ text: "", color: "text" })
  }
  if (world.untracked.length) {
    lines.push({ text: "Untracked files:", color: "text" })
    for (const f of world.untracked) lines.push({ text: `        ${f}`, color: "error" })
    lines.push({ text: "", color: "text" })
  }
  if (!world.staged.length && !world.modified.length && !world.untracked.length) {
    lines.push({ text: "nothing to commit, working tree clean", color: "dim" })
  } else if (!world.staged.length) {
    lines.push({ text: 'nothing added to commit but untracked files present (use "git add" to track)', color: "dim" })
  }
  return lines
}

export function runGit(world: GitWorld, parsed: ParsedCommand): WorldOutput {
  const w: GitWorld = structuredClone(world)
  const tokens = parsed.flagsAndArgs // ordered tokens keep flags inline (e.g. -b, -m)
  const sub = tokens[0] ?? ""
  const rest = tokens.slice(1)

  if (parsed.cmd !== "git") {
    return { world, lines: [] }
  }

  switch (sub) {
    case "init": {
      if (w.initialized) {
        return { world: w, lines: [{ text: "Reinitialized existing Git repository", color: "dim" }] }
      }
      w.initialized = true
      w.branches = ["main"]
      return { world: w, lines: [{ text: "Initialized empty Git repository in /sandbox/.git/", color: "dim" }] }
    }
    case "status":
      if (!w.initialized) return { world: w, error: true, lines: [{ text: "fatal: not a git repository (or any of the parent directories): .git", color: "error" }] }
      return { world: w, lines: statusLines(w) }
    case "add": {
      if (!w.initialized) return { world: w, error: true, lines: [{ text: "fatal: not a git repository", color: "error" }] }
      const target = rest[0]
      if (target === "." || target === "-A" || target === "--all") {
        w.staged = Array.from(new Set([...w.staged, ...w.modified, ...w.untracked]))
        w.modified = []
        w.untracked = []
      } else if (target) {
        w.staged.push(target)
        w.modified = w.modified.filter((f) => f !== target)
        w.untracked = w.untracked.filter((f) => f !== target)
      } else {
        return { world: w, error: true, lines: [{ text: "Nothing specified, nothing added.", color: "error" }] }
      }
      return { world: w, lines: [] }
    }
    case "commit": {
      if (!w.initialized) return { world: w, error: true, lines: [{ text: "fatal: not a git repository", color: "error" }] }
      const mIdx = rest.indexOf("-m")
      const message = mIdx !== -1 ? rest[mIdx + 1] : undefined
      if (!message) {
        return {
          world: w,
          error: true,
          lines: [
            { text: "hint: Waiting for your editor to close the file...", color: "dim" },
            { text: "(this sandbox pauses here — real git opens an editor)", color: "dim" },
            { text: "tip: use the -m flag to pass a message inline: git commit -m \"your message\"", color: "warning" },
          ],
        }
      }
      if (w.staged.length === 0 && w.commits.length === 0) {
        return { world: w, error: true, lines: [{ text: "nothing to commit, working tree clean (did you git add?)", color: "error" }] }
      }
      if (w.staged.length === 0) {
        return {
          world: w,
          error: true,
          lines: [
            { text: "On branch " + w.currentBranch, color: "text" },
            { text: "nothing to commit, working tree clean — stage changes with git add first", color: "dim" },
          ],
        }
      }
      const commit: GitCommit = {
        hash: shortHash(),
        message: message.replace(/^["']|["']$/g, ""),
        branch: w.currentBranch,
      }
      w.commits.push(commit)
      w.staged = []
      return { world: w, lines: [{ text: `[${w.currentBranch} ${commit.hash}] ${commit.message}`, color: "success" }] }
    }
    case "log": {
      if (!w.initialized) return { world: w, error: true, lines: [{ text: "fatal: not a git repository", color: "error" }] }
      if (w.commits.length === 0) {
        return { world: w, error: true, lines: [{ text: "fatal: your current branch 'main' does not have any commits yet", color: "error" }] }
      }
      const lines: { text: string; color?: string }[] = []
      for (const c of [...w.commits].reverse()) {
        lines.push({ text: `commit ${c.hash} (HEAD -> ${c.branch})`, color: "warning" })
        lines.push({ text: "Author: You <you@terminaltype.dev>", color: "text" })
        lines.push({ text: "", color: "text" })
        lines.push({ text: `    ${c.message}`, color: "text" })
        lines.push({ text: "", color: "text" })
      }
      return { world: w, lines }
    }
    case "branch": {
      if (!w.initialized) return { world: w, error: true, lines: [{ text: "fatal: not a git repository", color: "error" }] }
      const name = rest[0]
      if (!name) {
        return { world: w, lines: w.branches.map((b) => ({ text: (b === w.currentBranch ? "* " : "  ") + b, color: "text" })) }
      }
      if (w.branches.includes(name)) {
        return { world: w, error: true, lines: [{ text: `fatal: a branch named '${name}' already exists`, color: "error" }] }
      }
      w.branches.push(name)
      return { world: w, lines: [] }
    }
    case "checkout":
    case "switch": {
      if (!w.initialized) return { world: w, error: true, lines: [{ text: "fatal: not a git repository", color: "error" }] }
      const name = rest[0]
      if (!name) {
        return { world: w, error: true, lines: [{ text: `usage: ${sub} <branch>`, color: "error" }] }
      }
      if (sub === "checkout" && rest[0] === "-b") {
        const newBranch = rest[1]
        if (!newBranch) return { world: w, error: true, lines: [{ text: "usage: git checkout -b <branch>", color: "error" }] }
        if (w.branches.includes(newBranch)) {
          return { world: w, error: true, lines: [{ text: `fatal: a branch named '${newBranch}' already exists`, color: "error" }] }
        }
        w.branches.push(newBranch)
        w.currentBranch = newBranch
        return { world: w, lines: [{ text: `Switched to a new branch '${newBranch}'`, color: "success" }] }
      }
      if (sub === "switch" && rest[0] === "-c") {
        const newBranch = rest[1]
        if (!newBranch) return { world: w, error: true, lines: [{ text: "usage: git switch -c <branch>", color: "error" }] }
        if (w.branches.includes(newBranch)) {
          return { world: w, error: true, lines: [{ text: `fatal: a branch named '${newBranch}' already exists`, color: "error" }] }
        }
        w.branches.push(newBranch)
        w.currentBranch = newBranch
        return { world: w, lines: [{ text: `Switched to a new branch '${newBranch}'`, color: "success" }] }
      }
      if (!w.branches.includes(name)) {
        return { world: w, error: true, lines: [{ text: `error: pathspec '${name}' did not match any file(s) known to git`, color: "error" }] }
      }
      w.currentBranch = name
      return { world: w, lines: [{ text: `Switched to branch '${name}'`, color: "success" }] }
    }
    case "merge": {
      if (!w.initialized) return { world: w, error: true, lines: [{ text: "fatal: not a git repository", color: "error" }] }
      const name = rest[0]
      if (!name || !w.branches.includes(name)) {
        return { world: w, error: true, lines: [{ text: `merge: ${name} - not something we can merge`, color: "error" }] }
      }
      return { world: w, lines: [{ text: `Merge made by the 'ort' strategy.`, color: "success" }] }
    }
    case "remote": {
      const op = rest[0]
      if (op === "add" && rest[2]) {
        w.remotes.push(rest[1])
        return { world: w, lines: [] }
      }
      if (op === "-v") {
        return { world: w, lines: w.remotes.flatMap((r) => [
          { text: `${r}\tgit@github.com:you/${r}.git (fetch)`, color: "text" },
          { text: `${r}\tgit@github.com:you/${r}.git (push)`, color: "text" },
        ]) }
      }
      return { world: w, lines: [] }
    }
    case "push": {
      if (!w.initialized) return { world: w, error: true, lines: [{ text: "fatal: not a git repository", color: "error" }] }
      if (w.remotes.length === 0) {
        return { world: w, error: true, lines: [{ text: "fatal: No configured push destination. (hint: this lesson simulates remotes — add one with git remote add)", color: "error" }] }
      }
      w.remoteCommits = w.commits.map((c) => c.hash)
      return {
        world: w,
        lines: [
          { text: `Enumerating objects: ${w.commits.length * 3}, done.`, color: "dim" },
          { text: `To github.com:you/${w.remotes[0]}.git`, color: "success" },
          { text: ` * [new branch]      ${w.currentBranch} -> ${w.currentBranch}`, color: "success" },
        ],
      }
    }
    case "diff":
      return { world: w, lines: w.modified.flatMap((f) => [
        { text: `diff --git a/${f} b/${f}`, color: "dim" },
        { text: `--- a/${f}`, color: "dim" },
        { text: `+++ b/${f}`, color: "dim" },
        { text: "@@ -1,1 +1,1 @@", color: "dim" },
        { text: `-old content of ${f}`, color: "error" },
        { text: `+new content of ${f} ✨`, color: "success" },
      ]) }
    case "config":
      return { world: w, lines: [] }
    default:
      return {
        world: w,
        error: true,
        lines: [{ text: `git: '${sub}' is not a git command. See 'git --help'`, color: "error" }],
      }
  }
}
