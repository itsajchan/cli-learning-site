import { describe, it, expect } from "vitest"
import { makeGitWorld, gitApplyMutations, runGit } from "../lib/worlds/git"
import { makeDockerWorld, runDocker, makeK8sWorld, runK8s } from "../lib/worlds/containers"
import { parseLine } from "../lib/parser/tokenizer"
import type { GitWorld, DockerWorld, K8sWorld } from "../lib/types"

function git(): GitWorld {
  return makeGitWorld([
    { path: "README.md", content: "# project" },
    { path: "app.js", content: "console.log(1)" },
  ])
}

describe("git world", () => {
  it("errors before init", () => {
    const w = git()
    const out = runGit(w, parseLine("git status"))
    expect(out.error).toBe(true)
  })

  it("init -> status -> add -> commit flow", () => {
    let w = gitApplyMutations(git(), [{ op: "gitInit" }])
    w = runGit(w, parseLine("git status")).world as GitWorld
    expect(w.untracked).toContain("README.md")
    w = runGit(w, parseLine("git add README.md")).world as GitWorld
    expect(w.staged).toContain("README.md")
    expect(w.untracked).not.toContain("README.md")
    w = runGit(w, parseLine('git commit -m "first"')).world as GitWorld
    expect(w.commits).toHaveLength(1)
    expect(w.commits[0].message).toBe("first")
    expect(w.staged).toHaveLength(0)
  })

  it("commit without -m teaches the flag", () => {
    let w = gitApplyMutations(git(), [{ op: "gitInit" }])
    w = runGit(w, parseLine("git add .")).world as GitWorld
    const out = runGit(w, parseLine("git commit"))
    expect(out.error).toBe(true)
    expect(out.lines.some((l) => l.text.includes("-m"))).toBe(true)
  })

  it("branch + switch + merge", () => {
    let w = gitApplyMutations(git(), [{ op: "gitInit" }])
    w = runGit(w, parseLine("git branch feature/x")).world as GitWorld
    expect(w.branches).toContain("feature/x")
    w = runGit(w, parseLine("git switch feature/x")).world as GitWorld
    expect(w.currentBranch).toBe("feature/x")
    w = runGit(w, parseLine("git switch main")).world as GitWorld
    const merged = runGit(w, parseLine("git merge feature/x"))
    expect(merged.error).toBeFalsy()
  })

  it("checkout -b creates and switches", () => {
    let w = gitApplyMutations(git(), [{ op: "gitInit" }])
    w = runGit(w, parseLine("git checkout -b feature/y")).world as GitWorld
    expect(w.currentBranch).toBe("feature/y")
  })

  it("log shows commits", () => {
    let w = gitApplyMutations(git(), [{ op: "gitInit" }])
    w = runGit(w, parseLine("git add .")).world as GitWorld
    w = runGit(w, parseLine('git commit -m "hello"')).world as GitWorld
    const out = runGit(w, parseLine("git log"))
    expect(out.lines.some((l) => l.text.includes("hello"))).toBe(true)
  })

  it("push without remote errors", () => {
    let w = gitApplyMutations(git(), [{ op: "gitInit" }])
    const out = runGit(w, parseLine("git push"))
    expect(out.error).toBe(true)
  })

  it("unknown git subcommand errors", () => {
    const w = git()
    const out = runGit(w, parseLine("git yeet"))
    expect(out.error).toBe(true)
  })
})

describe("docker world", () => {
  it("ps lists running containers", () => {
    const w = makeDockerWorld([{ op: "dockerContainer", image: "nginx", cname: "web" }])
    const out = runDocker(w, parseLine("docker ps"))
    expect(out.lines.length).toBe(2) // header + 1
  })

  it("build requires context", () => {
    const w = makeDockerWorld()
    const out = runDocker(w, parseLine("docker build -t x"))
    expect(out.error).toBe(true)
  })

  it("build with . creates image", () => {
    const w = makeDockerWorld()
    const out = runDocker(w, parseLine("docker build -t my-app ."))
    expect(out.error).toBeFalsy()
    expect((out.world as DockerWorld).images.some((i) => i.repo === "my-app")).toBe(true)
  })

  it("run pulls missing images", () => {
    const w = makeDockerWorld()
    const out = runDocker(w, parseLine("docker run alpine"))
    expect(out.lines.some((l) => l.text.includes("Pulling"))).toBe(true)
  })

  it("logs unknown container errors", () => {
    const w = makeDockerWorld()
    const out = runDocker(w, parseLine("docker logs nope"))
    expect(out.error).toBe(true)
  })
})

describe("kubectl world", () => {
  it("get pods lists pods", () => {
    const w = makeK8sWorld([{ op: "k8sPod", name: "web-abc", image: "web:1" }])
    const out = runK8s(w, parseLine("kubectl get pods"))
    expect(out.lines.length).toBe(2)
  })

  it("apply creates deployment + pods from yaml", () => {
    const w = makeK8sWorld()
    // seed a deployment.yaml
    w.root.children!["deployment.yaml"] = {
      type: "file",
      name: "deployment.yaml",
      content: "kind: Deployment\nmetadata:\n  name: web-app\nspec:\n  replicas: 3\n",
    }
    const out = runK8s(w, parseLine("kubectl apply -f deployment.yaml"))
    expect(out.lines[0].text).toContain("deployment.apps/web-app created")
    const k8s = out.world as K8sWorld
    expect(k8s.deployments).toHaveLength(1)
    expect(k8s.pods).toHaveLength(3)
  })

  it("apply service creates service", () => {
    const w = makeK8sWorld()
    w.root.children!["service.yaml"] = {
      type: "file",
      name: "service.yaml",
      content: "kind: Service\nmetadata:\n  name: web-svc\n",
    }
    const out = runK8s(w, parseLine("kubectl apply -f service.yaml"))
    expect(out.lines[0].text).toContain("service/web-svc created")
  })

  it("describe missing pod errors", () => {
    const w = makeK8sWorld()
    const out = runK8s(w, parseLine("kubectl describe pod nope"))
    expect(out.error).toBe(true)
  })
})
