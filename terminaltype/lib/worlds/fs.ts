import type { CmdOutput, FSNode, FSWorld, ParsedCommand, WorldMutation } from "../types"
import { parseLine } from "../parser/tokenizer"

export interface WorldOutput extends CmdOutput {
  world: FSWorld
}

export function makeFSWorld(root: FSNode, cwd: string[] = []): FSWorld {
  return { kind: "fs", cwd, root: structuredClone(root) }
}

export function applyMutations(world: FSWorld, mutations: WorldMutation[] = []): FSWorld {
  let w = structuredClone(world)
  for (const m of mutations) {
    switch (m.op) {
      case "mkdir":
        w = fsMkdir(w, parseLine("mkdir " + (m.path ?? m.name ?? "")), true).world
        break
      case "touch":
        w = fsTouch(w, parseLine("touch " + (m.path ?? m.name ?? "")), true).world
        break
      case "write": {
        const parentPath = (m.path ?? "").split("/").filter(Boolean)
        w = fsWrite(w, parentPath, m.name ?? "", m.content ?? "").world
        break
      }
      case "rm":
        w = fsRm(w, parseLine("rm " + (m.path ?? m.name ?? ""))).world
        break
      case "chdir":
        w = { ...w, cwd: (m.path ?? "").split("/").filter(Boolean) }
        break
    }
  }
  return w
}

export function nodeAt(root: FSNode, path: string[]): FSNode | null {
  let node: FSNode = root
  for (const seg of path) {
    if (node.type !== "dir" || !node.children?.[seg]) return null
    node = node.children[seg]
  }
  return node
}

/** Resolve a user-supplied path (absolute with / or relative) against cwd. */
export function resolvePath(cwd: string[], input: string): string[] {
  if (input.startsWith("/")) return input.split("/").filter(Boolean).filter((s) => s !== ".")
  const parts = input.split("/").filter(Boolean)
  const out = [...cwd]
  for (const part of parts) {
    if (part === ".") continue
    if (part === "..") out.pop()
    else if (part === "~") out.length = 0
    else out.push(part)
  }
  return out
}

export function displayPath(cwd: string[]): string {
  return "/" + cwd.join("/")
}

export function fsLs(world: FSWorld, parsed: ParsedCommand): WorldOutput {
  const showAll = parsed.flags.includes("-a") || parsed.flags.includes("-la")
  const target = parsed.args[0]
  const path = target ? resolvePath(world.cwd, target) : world.cwd
  const node = nodeAt(world.root, path)
  if (!node) {
    return { world, error: true, lines: [{ text: `ls: cannot access '${target}': No such file or directory`, color: "error" }] }
  }
  if (node.type === "file") {
    return { world, lines: [{ text: node.name, color: "text" }] }
  }
  const entries = Object.values(node.children ?? {})
    .filter((c) => showAll || !c.hidden)
    .sort((a, b) => a.name.localeCompare(b.name))
  if (entries.length === 0) {
    return { world, lines: [] }
  }
  return {
    world,
    lines: [
      {
        text: entries.map((e) => (e.type === "dir" ? e.name + "/" : e.name)).join("  "),
        color: "text",
      },
    ],
  }
}

export function fsCd(world: FSWorld, parsed: ParsedCommand): WorldOutput {
  const target = parsed.args[0] ?? "~"
  const path = resolvePath(world.cwd, target)
  const node = nodeAt(world.root, path)
  if (!node) {
    return { world, error: true, lines: [{ text: `cd: no such file or directory: ${target}`, color: "error" }] }
  }
  if (node.type !== "dir") {
    return { world, error: true, lines: [{ text: `cd: not a directory: ${target}`, color: "error" }] }
  }
  return { world: { ...world, cwd: path }, lines: [] }
}

export function fsPwd(world: FSWorld): WorldOutput {
  return { world, lines: [{ text: displayPath(world.cwd), color: "text" }] }
}

export function fsMkdir(world: FSWorld, parsed: ParsedCommand, silent = false): WorldOutput {
  const name = parsed.args[0]
  if (!name) {
    return { world, error: true, lines: [{ text: "mkdir: missing operand", color: "error" }] }
  }
  const path = resolvePath(world.cwd, name)
  const dirName = path.pop()!
  const parent = nodeAt(world.root, path)
  if (!parent || parent.type !== "dir") {
    return { world, error: true, lines: [{ text: `mkdir: cannot create directory '${name}': No such file or directory`, color: "error" }] }
  }
  if (parent.children?.[dirName]) {
    return { world, error: true, lines: [{ text: `mkdir: cannot create directory '${name}': File exists`, color: "error" }] }
  }
  parent.children = parent.children ?? {}
  parent.children[dirName] = { type: "dir", name: dirName, children: {} }
  return {
    world: { ...world, root: world.root },
    lines: silent ? [] : [{ text: "", color: "text" }],
  }
}

export function fsTouch(world: FSWorld, parsed: ParsedCommand, silent = false): WorldOutput {
  const name = parsed.args[0]
  if (!name) {
    return { world, error: true, lines: [{ text: "touch: missing file operand", color: "error" }] }
  }
  const path = resolvePath(world.cwd, name)
  const fileName = path.pop()!
  const parent = nodeAt(world.root, path)
  if (!parent || parent.type !== "dir") {
    return { world, error: true, lines: [{ text: `touch: cannot touch '${name}': No such file or directory`, color: "error" }] }
  }
  parent.children = parent.children ?? {}
  if (!parent.children[fileName]) {
    parent.children[fileName] = { type: "file", name: fileName, content: "" }
  }
  return {
    world: { ...world, root: world.root },
    lines: silent ? [] : [{ text: "", color: "text" }],
  }
}

function fsWrite(world: FSWorld, path: string[], name: string, content: string): WorldOutput {
  const parent = nodeAt(world.root, path)
  if (!parent || parent.type !== "dir") return { world, lines: [], error: true }
  parent.children = parent.children ?? {}
  parent.children[name] = { type: "file", name, content }
  return { world: { ...world, root: world.root }, lines: [] }
}

export function fsCat(world: FSWorld, parsed: ParsedCommand): WorldOutput {
  const name = parsed.args[0]
  if (!name) {
    return { world, error: true, lines: [{ text: "cat: missing operand", color: "error" }] }
  }
  const path = resolvePath(world.cwd, name)
  const node = nodeAt(world.root, path)
  if (!node) {
    return { world, error: true, lines: [{ text: `cat: ${name}: No such file or directory`, color: "error" }] }
  }
  if (node.type === "dir") {
    return { world, error: true, lines: [{ text: `cat: ${name}: Is a directory`, color: "error" }] }
  }
  return {
    world,
    lines: (node.content ?? "").split("\n").map((text) => ({ text, color: "text" })),
  }
}

export function fsRm(world: FSWorld, parsed: ParsedCommand): WorldOutput {
  if (parsed.args.includes("/") && parsed.flags.some((f) => f.includes("r"))) {
    return {
      world,
      error: true,
      lines: [{ text: "nice try 🙂 — this sandbox keeps its safety rails on. Nothing was deleted.", color: "warning" }],
    }
  }
  const name = parsed.args[0]
  if (!name) {
    return { world, error: true, lines: [{ text: "rm: missing operand", color: "error" }] }
  }
  const path = resolvePath(world.cwd, name)
  const fileName = path.pop()!
  const parent = nodeAt(world.root, path)
  if (!parent?.children?.[fileName]) {
    return { world, error: true, lines: [{ text: `rm: cannot remove '${name}': No such file or directory`, color: "error" }] }
  }
  const child = parent.children[fileName]
  if (child.type === "dir" && !parsed.flags.some((f) => f.includes("r"))) {
    return { world, error: true, lines: [{ text: `rm: cannot remove '${name}': Is a directory`, color: "error" }] }
  }
  delete parent.children[fileName]
  return { world: { ...world, root: world.root }, lines: [] }
}

export function fsGrep(world: FSWorld, parsed: ParsedCommand): WorldOutput {
  const pattern = parsed.args[0]
  const target = parsed.args[1]
  if (!pattern) {
    return { world, error: true, lines: [{ text: "usage: grep [-r] [-i] [-n] PATTERN [FILE]", color: "error" }] }
  }
  const ignoreCase = parsed.flags.includes("-i")
  const lineNums = parsed.flags.includes("-n")
  const rx = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ignoreCase ? "i" : "")
  const results: { text: string; color?: string }[] = []

  const searchNode = (node: FSNode, prefix: string) => {
    if (node.type === "file") {
      const content = node.content ?? ""
      content.split("\n").forEach((line, i) => {
        if (rx.test(line)) {
          const prefixStr = (target ? "" : prefix) + (lineNums ? `${i + 1}: ` : "")
          results.push({ text: `${prefixStr}${line}`, color: "text" })
        }
      })
    } else {
      for (const child of Object.values(node.children ?? {})) {
        if (parsed.flags.includes("-r") || target) searchNode(child, prefix + child.name + "/")
      }
    }
  }

  if (target) {
    const path = resolvePath(world.cwd, target)
    const node = nodeAt(world.root, path)
    if (!node) {
      return { world, error: true, lines: [{ text: `grep: ${target}: No such file or directory`, color: "error" }] }
    }
    searchNode(node, "")
  } else {
    if (!parsed.flags.includes("-r")) {
      return { world, error: true, lines: [{ text: "grep: no file given — pass a file, or use -r to search recursively", color: "error" }] }
    }
    searchNode(nodeAt(world.root, world.cwd)!, "")
  }

  if (results.length === 0) return { world, lines: [{ text: "", color: "text" }] }
  return { world, lines: results }
}
