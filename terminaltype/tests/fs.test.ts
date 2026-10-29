import { describe, it, expect } from "vitest"
import { makeFSWorld, fsLs, fsCd, fsMkdir, fsTouch, fsCat, fsRm, resolvePath, fsGrep } from "../lib/worlds/fs"
import { parseLine } from "../lib/parser/tokenizer"
import type { FSNode } from "../lib/types"

function seedWorld(): ReturnType<typeof makeFSWorld> {
  return makeFSWorld({
    type: "dir",
    name: "~",
    children: {
      "readme.txt": { type: "file", name: "readme.txt", content: "hello world" },
      ".hidden": { type: "file", name: ".hidden", content: "secret", hidden: true },
      docs: { type: "dir", name: "docs", children: { "a.md": { type: "file", name: "a.md", content: "# doc" } } },
    },
  })
}

describe("fs world", () => {
  it("ls hides dotfiles without -a", () => {
    const w = seedWorld()
    const out = fsLs(w, parseLine("ls"))
    expect(out.lines[0].text).not.toContain(".hidden")
    expect(out.lines[0].text).toContain("readme.txt")
    expect(out.lines[0].text).toContain("docs/")
  })

  it("ls -a shows hidden", () => {
    const w = seedWorld()
    const out = fsLs(w, parseLine("ls -a"))
    expect(out.lines[0].text).toContain(".hidden")
  })

  it("ls on missing path errors", () => {
    const w = seedWorld()
    const out = fsLs(w, parseLine("ls nope"))
    expect(out.error).toBe(true)
  })

  it("cd changes cwd and validates", () => {
    let w = seedWorld()
    w = fsCd(w, parseLine("cd docs")).world
    expect(w.cwd).toEqual(["docs"])
    const bad = fsCd(w, parseLine("cd nope"))
    expect(bad.error).toBe(true)
  })

  it("cd .. climbs", () => {
    let w = seedWorld()
    w = fsCd(w, parseLine("cd docs")).world
    w = fsCd(w, parseLine("cd ..")).world
    expect(w.cwd).toEqual([])
  })

  it("mkdir creates dirs", () => {
    let w = seedWorld()
    w = fsMkdir(w, parseLine("mkdir projects")).world
    expect(w.root.children!["projects"]).toBeTruthy()
  })

  it("mkdir refuses duplicates", () => {
    const w = seedWorld()
    const out = fsMkdir(w, parseLine("mkdir docs"))
    expect(out.error).toBe(true)
  })

  it("touch creates files, cat reads them", () => {
    let w = seedWorld()
    w = fsTouch(w, parseLine("touch notes.txt")).world
    w = fsCd(w, parseLine("cd docs")).world
    const out = fsCat(w, parseLine("cat a.md"))
    expect(out.lines[0].text).toBe("# doc")
  })

  it("cat errors on missing and dirs", () => {
    let w = seedWorld()
    expect(fsCat(w, parseLine("cat nope")).error).toBe(true)
    expect(fsCat(w, parseLine("cat docs")).error).toBe(true)
  })

  it("rm deletes files", () => {
    let w = seedWorld()
    w = fsRm(w, parseLine("rm readme.txt")).world
    expect(w.root.children!["readme.txt"]).toBeUndefined()
  })

  it("rm -rf / is blocked", () => {
    const w = seedWorld()
    const out = fsRm(w, parseLine("rm -rf /"))
    expect(out.error).toBe(true)
    expect(out.lines[0].text).toContain("safety")
  })

  it("resolvePath handles absolute/relative/../~", () => {
    expect(resolvePath(["docs"], "a/b")).toEqual(["docs", "a", "b"])
    expect(resolvePath(["docs"], "/a/b")).toEqual(["a", "b"])
    expect(resolvePath(["docs"], "..")).toEqual([])
    expect(resolvePath(["a", "b"], "~")).toEqual([])
    expect(resolvePath([], "./x")).toEqual(["x"])
  })

  it("grep finds with -i and -n", () => {
    const w = seedWorld()
    const out = fsGrep(w, parseLine("grep -n -i HELLO readme.txt"))
    expect(out.lines).toHaveLength(1)
    expect(out.lines[0].text).toBe("1: hello world")
  })

  it("grep -r recurses", () => {
    const w = seedWorld()
    const out = fsGrep(w, parseLine("grep -r doc ."))
    expect(out.lines).toHaveLength(1)
  })
})
