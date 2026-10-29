import { describe, it, expect } from "vitest"
import { parseLine, levenshtein, closestWord } from "../lib/parser/tokenizer"
import { matchCommand, matchAny } from "../lib/parser/matcher"

describe("tokenizer", () => {
  it("parses basic commands", () => {
    const p = parseLine("ls -la src")
    expect(p.cmd).toBe("ls")
    expect(p.flags).toEqual(["-l", "-a"])
    expect(p.args).toEqual(["src"])
  })

  it("keeps long flags whole", () => {
    const p = parseLine("grep --line-number TODO file.txt")
    expect(p.flags).toEqual(["--line-number"])
    expect(p.args).toEqual(["TODO", "file.txt"])
  })

  it("respects quotes", () => {
    const p = parseLine('git commit -m "fix the bug"')
    expect(p.cmd).toBe("git")
    expect(p.args).toEqual(["commit", "fix the bug"])
  })

  it("handles empty input", () => {
    expect(parseLine("").cmd).toBe("")
    expect(parseLine("   ").cmd).toBe("")
  })
})

describe("levenshtein", () => {
  it("returns 0 for equal strings", () => {
    expect(levenshtein("ls", "ls")).toBe(0)
  })
  it("counts edits", () => {
    expect(levenshtein("pdw", "pwd")).toBe(1) // adjacent transposition
    expect(levenshtein("kitten", "sitting")).toBe(3)
  })
})

describe("closestWord", () => {
  const vocab = ["ls", "cd", "mkdir", "git", "grep", "clear"]
  it("suggests for typos", () => {
    expect(closestWord("greb", vocab)).toBe("grep")
    expect(closestWord("mkdor", vocab)).toBe("mkdir")
  })
  it("returns null for garbage", () => {
    expect(closestWord("zzzzzzzz", vocab)).toBeNull()
  })
})

describe("matcher", () => {
  it("matches plain command", () => {
    const p = parseLine("ls")
    expect(matchCommand(p, { cmd: "ls" }).matched).toBe(true)
  })

  it("requires flags", () => {
    const p = parseLine("ls")
    const r = matchCommand(p, { cmd: "ls", flags: [["-a"]] })
    expect(r.matched).toBe(false)
    expect(r.reason).toBe("flags")
    expect(r.missingFlags).toEqual(["-a"])
  })

  it("accepts flag alternates", () => {
    const p = parseLine("ls --all")
    expect(matchCommand(p, { cmd: "ls", flags: [["-a", "--all"]] }).matched).toBe(true)
  })

  it("splits combined short flags", () => {
    const p = parseLine("ls -al")
    expect(matchCommand(p, { cmd: "ls", flags: [["-a"], ["-l"]] }).matched).toBe(true)
  })

  it("matches literal args", () => {
    expect(matchCommand(parseLine("cd projects"), { cmd: "cd", args: ["projects"] }).matched).toBe(true)
    expect(matchCommand(parseLine("cd home"), { cmd: "cd", args: ["projects"] }).matched).toBe(false)
  })

  it("wildcard args", () => {
    expect(matchCommand(parseLine("cd anything"), { cmd: "cd", args: ["*"] }).matched).toBe(true)
  })

  it("matchAny picks the closest failure for coaching", () => {
    const matchers = [
      { cmd: "ls", args: ["projects"], label: "ls projects" },
      { cmd: "ls", flags: [["-a"]], label: "ls -a" },
    ]
    // right command, wrong flag -> flags reason ranks closest
    const r = matchAny(parseLine("ls -x"), matchers)
    expect(r.matched).toBe(false)
    expect(r.reason).toBe("flags")
  })

  it("dir aliases to ls", () => {
    expect(matchCommand(parseLine("dir"), { cmd: "ls" }).matched).toBe(true)
  })
})
