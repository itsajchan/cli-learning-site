import type { CmdOutput, DockerWorld, ParsedCommand, K8sWorld, WorldMutation } from "../types"
import { makeFSWorld, applyMutations, nodeAt } from "./fs"

export type WorldOutput = CmdOutput

const TABLE_PAD = 24

function padRow(cells: string[]): string {
  return cells.map((c) => c.padEnd(TABLE_PAD, " ")).join("").trimEnd()
}

/* ---------------- Docker ---------------- */

export function makeDockerWorld(mutations: WorldMutation[] = []): DockerWorld {
  const fs = makeFSWorld({
    type: "dir",
    name: "~",
    children: {
      Dockerfile: {
        type: "file",
        name: "Dockerfile",
        content: "FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nRUN npm install\nCMD [\"npm\", \"start\"]\n",
      },
    },
  })
  return dockerApplyMutations({ kind: "docker", images: [], containers: [], cwd: [], root: fs.root }, mutations)
}

export function dockerApplyMutations(world: DockerWorld, mutations: WorldMutation[]): DockerWorld {
  const w = structuredClone(world)
  for (const m of mutations) {
    switch (m.op) {
      case "dockerImage":
        if (m.image) w.images.push({ repo: m.image, tag: m.tag ?? "latest", id: Math.random().toString(16).slice(2, 12), size: m.size ?? "85MB" })
        break
      case "dockerContainer":
        if (m.image) {
          w.containers.push({
            id: Math.random().toString(16).slice(2, 12),
            image: m.image,
            name: m.cname ?? "sandbox-container",
            status: (m.status as never) ?? "running",
            ports: m.ports,
          })
        }
        break
      default:
        const fsWorld = applyMutations({ kind: "fs", cwd: w.cwd, root: w.root }, [m])
        w.root = fsWorld.root
    }
  }
  return w
}

export function runDocker(world: DockerWorld, parsed: ParsedCommand): WorldOutput {
  const w: DockerWorld = structuredClone(world)
  const tokens = parsed.flagsAndArgs
  const sub = tokens[0] ?? ""
  const rest = tokens.slice(1)

  switch (sub) {
    case "ps": {
      const lines: { text: string; color?: string }[] = [{ text: padRow(["CONTAINER ID", "IMAGE", "STATUS", "PORTS", "NAMES"]), color: "dim" }]
      const list = parsed.flags.includes("-a") ? w.containers : w.containers.filter((c) => c.status === "running")
      for (const c of list) {
        lines.push({
          text: padRow([c.id, c.image, c.status === "running" ? "Up About a minute" : `Exited (0)`, c.ports ?? "", c.name]),
          color: "text",
        })
      }
      return { world: w, lines }
    }
    case "images": {
      const lines: { text: string; color?: string }[] = [{ text: padRow(["REPOSITORY", "TAG", "IMAGE ID", "SIZE"]), color: "dim" }]
      for (const i of w.images) {
        lines.push({ text: padRow([i.repo, i.tag, i.id.slice(0, 8), i.size]), color: "text" })
      }
      return { world: w, lines }
    }
    case "run": {
      const image = rest[0]
      if (!image) return { world: w, error: true, lines: [{ text: "docker: 'run' requires an image", color: "error" }] }
      const known = w.images.find((i) => i.repo === image || i.repo + ":" + i.tag === image)
      if (!known) {
        return {
          world: w,
          lines: [
            { text: `Unable to find image '${image}' locally`, color: "dim" },
            { text: `Pulling from library/${image}`, color: "dim" },
            { text: `Status: Downloaded newer image for ${image}`, color: "success" },
          ],
        }
      }
      w.containers.push({
        id: Math.random().toString(16).slice(2, 12),
        image: known.repo,
        name: "sandbox-container",
        status: "running",
        ports: undefined,
      })
      return { world: w, lines: [{ text: "container started (it prints nothing — check docker ps)", color: "dim" }] }
    }
    case "build": {
      const ctxIdx = rest.findIndex((t) => t === ".")
      const tagIdx = rest.findIndex((t) => t === "-t")
      const image = tagIdx !== -1 ? rest[tagIdx + 1] : "sandbox-app"
      if (ctxIdx === -1) {
        return { world: w, error: true, lines: [{ text: `docker: no build context given — pass a path, usually '.'`, color: "error" }] }
      }
      const dockerfile = nodeAt(w.root, ["Dockerfile"])
      if (!dockerfile) {
        return { world: w, error: true, lines: [{ text: `unable to prepare context: no Dockerfile found in context`, color: "error" }] }
      }
      w.images.push({ repo: image, tag: "latest", id: Math.random().toString(16).slice(2, 12), size: "92MB" })
      return {
        world: w,
        lines: [
          { text: `[+] Building 0.4s (7/7) FINISHED`, color: "dim" },
          { text: ` => [1/4] FROM docker.io/library/node:20-alpine`, color: "dim" },
          { text: ` => [2/4] WORKDIR /app`, color: "dim" },
          { text: ` => [3/4] COPY . .`, color: "dim" },
          { text: ` => [4/4] RUN npm install`, color: "dim" },
          { text: ` => exporting to image`, color: "dim" },
          { text: `Successfully tagged ${image}:latest`, color: "success" },
        ],
      }
    }
    case "logs": {
      const name = rest[0]
      const c = w.containers.find((x) => x.name === name || x.id === name)
      if (!c) return { world: w, error: true, lines: [{ text: `Error: No such container: ${name}`, color: "error" }] }
      return {
        world: w,
        lines: [
          { text: `[${c.name}] listening on http://localhost:3000`, color: "text" },
          { text: `[${c.name}] GET / 200 OK`, color: "text" },
        ],
      }
    }
    case "pull": {
      const image = rest[0]
      if (!image) return { world: w, error: true, lines: [{ text: "docker: 'pull' requires an image", color: "error" }] }
      w.images.push({ repo: image, tag: "latest", id: Math.random().toString(16).slice(2, 12), size: "77MB" })
      return { world: w, lines: [{ text: `${image}: Pull complete`, color: "success" }] }
    }
    default:
      return { world: w, error: true, lines: [{ text: `docker: '${sub}' is not a docker command.`, color: "error" }] }
  }
}

/* ---------------- Kubernetes ---------------- */

export function makeK8sWorld(mutations: WorldMutation[] = []): K8sWorld {
  const fs = makeFSWorld({
    type: "dir",
    name: "~",
    children: {
      "deployment.yaml": {
        type: "file",
        name: "deployment.yaml",
        content: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web-app\nspec:\n  replicas: 3\n",
      },
    },
  })
  return k8sApplyMutations(
    {
      kind: "k8s",
      pods: [],
      deployments: [],
      services: [],
      cwd: [],
      root: fs.root,
      appliedOnce: false,
    },
    mutations,
  )
}

export function k8sApplyMutations(world: K8sWorld, mutations: WorldMutation[]): K8sWorld {
  const w = structuredClone(world)
  for (const m of mutations) {
    switch (m.op) {
      case "k8sPod":
        if (m.name) {
          w.pods.push({
            name: m.name,
            image: m.image ?? "nginx:latest",
            status: (m.kstatus as never) ?? "Running",
            restarts: m.restarts ?? 0,
            ready: m.ready ? `${m.ready}/1` : "1/1",
          })
        }
        break
      case "k8sDeploy":
        if (m.name) {
          w.deployments.push({
            name: m.name,
            replicas: m.replicas ?? 3,
            readyReplicas: m.ready ?? m.replicas ?? 3,
            image: m.image ?? "nginx:latest",
          })
          for (let i = 0; i < (m.replicas ?? 3); i++) {
            w.pods.push({
              name: `${m.name}-${Math.random().toString(16).slice(2, 7)}`,
              image: m.image ?? "nginx:latest",
              status: "Running",
              restarts: 0,
              ready: "1/1",
            })
          }
        }
        break
      case "k8sService":
        if (m.name) {
          w.services.push({ name: m.name, type: "ClusterIP", clusterIP: m.clusterIP ?? "10.96.0.42", port: m.port ?? "80" })
        }
        break
      default:
        const fsWorld = applyMutations({ kind: "fs", cwd: w.cwd, root: w.root }, [m])
        w.root = fsWorld.root
    }
  }
  return w
}

export function runK8s(world: K8sWorld, parsed: ParsedCommand): WorldOutput {
  const w: K8sWorld = structuredClone(world)
  const tokens = parsed.flagsAndArgs
  const sub = tokens[0] ?? ""
  const rest = tokens.slice(1)

  switch (sub) {
    case "get": {
      const resource = rest[0]
      if (!resource) return { world: w, error: true, lines: [{ text: `error: required resource not specified`, color: "error" }] }
      if (resource.startsWith("po")) {
        const lines: { text: string; color?: string }[] = [{ text: padRow(["NAME", "READY", "STATUS", "RESTARTS", "IMAGE"]), color: "dim" }]
        for (const p of w.pods) {
          lines.push({ text: padRow([p.name, p.ready, p.status, String(p.restarts), p.image]), color: "text" })
        }
        return { world: w, lines }
      }
      if (resource.startsWith("deploy")) {
        const lines: { text: string; color?: string }[] = [{ text: padRow(["NAME", "READY", "UP-TO-DATE", "AVAILABLE", "IMAGE"]), color: "dim" }]
        for (const d of w.deployments) {
          lines.push({ text: padRow([d.name, `${d.readyReplicas}/${d.replicas}`, String(d.replicas), String(d.readyReplicas), d.image]), color: "text" })
        }
        return { world: w, lines }
      }
      if (resource.startsWith("svc")) {
        const lines: { text: string; color?: string }[] = [{ text: padRow(["NAME", "TYPE", "CLUSTER-IP", "PORT(S)"]), color: "dim" }]
        for (const s of w.services) {
          lines.push({ text: padRow([s.name, s.type, s.clusterIP, `${s.port}/TCP`]), color: "text" })
        }
        return { world: w, lines }
      }
      return { world: w, error: true, lines: [{ text: `error: the server doesn't have a resource type "${resource}"`, color: "error" }] }
    }
    case "apply": {
      const file = rest.find((t) => !t.startsWith("-")) ?? rest[rest.indexOf("-f") + 1]
      if (!file) return { world: w, error: true, lines: [{ text: `error: --filename is required`, color: "error" }] }
      const path = file === "-" ? ["deployment.yaml"] : file.replace("./", "").split("/")
      const node = nodeAt(w.root, path)
      if (!node) return { world: w, error: true, lines: [{ text: `error: the path ${file} does not exist`, color: "error" }] }
      const isService = node.content?.includes("kind: Service")
      const name = node.content?.match(/name:\s*(\S+)/)?.[1] ?? "web-app"
      w.appliedOnce = true
      if (isService) {
        w.services.push({ name, type: "ClusterIP", clusterIP: "10.96.0." + Math.floor(Math.random() * 200), port: "80" })
        return { world: w, lines: [{ text: `service/${name} created`, color: "success" }] }
      }
      const replicas = Number(node.content?.match(/replicas:\s*(\d+)/)?.[1] ?? 3)
      w.deployments.push({ name, replicas, readyReplicas: replicas, image: "web-app:latest" })
      for (let i = 0; i < replicas; i++) {
        w.pods.push({
          name: `${name}-${Math.random().toString(16).slice(2, 7)}`,
          image: "web-app:latest",
          status: "Running",
          restarts: 0,
          ready: "1/1",
        })
      }
      return { world: w, lines: [{ text: `deployment.apps/${name} created`, color: "success" }] }
    }
    case "logs": {
      const name = rest[0]
      const pod = w.pods.find((p) => p.name === name || p.name.startsWith(name))
      if (!pod) return { world: w, error: true, lines: [{ text: `Error from server (NotFound): pods "${name}" not found`, color: "error" }] }
      return {
        world: w,
        lines: [
          { text: `[${pod.name}] server listening on :8080`, color: "text" },
          { text: `[${pod.name}] health check OK`, color: "text" },
        ],
      }
    }
    case "describe": {
      const name = rest[1] ?? rest[0]
      const pod = w.pods.find((p) => p.name === name)
      if (!pod) return { world: w, error: true, lines: [{ text: `Error from server (NotFound): pods "${name}" not found`, color: "error" }] }
      return {
        world: w,
        lines: [
          { text: `Name:         ${pod.name}`, color: "text" },
          { text: `Node:         node-1`, color: "text" },
          { text: `Status:       ${pod.status}`, color: pod.status === "Running" ? "success" : "error" },
          { text: `IP:           10.244.0.7`, color: "text" },
          { text: `Containers:`, color: "text" },
          { text: `  Image:      ${pod.image}`, color: "text" },
        ],
      }
    }
    case "delete": {
      const name = rest[1] ?? rest[0]
      const before = w.pods.length
      w.pods = w.pods.filter((p) => !p.name.startsWith(name))
      w.deployments = w.deployments.filter((d) => d.name !== name)
      if (w.pods.length === before && !w.deployments.length) {
        return { world: w, lines: [{ text: `Error from server (NotFound)`, color: "error" }] }
      }
      return { world: w, lines: [] }
    }
    default:
      return { world: w, error: true, lines: [{ text: `error: unknown command "${sub}" — try kubectl get --help`, color: "error" }] }
  }
}

/* ---------------- ffmpeg ---------------- */

export function makeFfmpegWorld(): WorldOutput & { world: import("../types").FfmpegWorld } {
  const fs = makeFSWorld({
    type: "dir",
    name: "~",
    children: {
      "video.mp4": { type: "file", name: "video.mp4", content: "VIDEO 1920x1080 120s" },
      "podcast.wav": { type: "file", name: "podcast.wav", content: "AUDIO 48000Hz stereo" },
      "song.mp3": { type: "file", name: "song.mp3", content: "AUDIO 320kbps" },
    },
  })
  return { world: { kind: "ffmpeg", cwd: [], root: fs.root }, lines: [] }
}

export function runFfmpeg(world: import("../types").FfmpegWorld, parsed: ParsedCommand): WorldOutput {
  const w = structuredClone(world)
  const inputs = parsed.args.filter((a) => !a.startsWith("-"))
  const out = inputs[inputs.length - 1]
  if (parsed.cmd !== "ffmpeg") return { world: w, lines: [] }
  if (!out) {
    return { world: w, error: true, lines: [{ text: "usage: ffmpeg -i INPUT [-vn|-ss 00:00:10] [-t 5] OUTPUT", color: "error" }] }
  }
  const inNode = nodeAt(w.root, [inputs[0]])
  if (!inNode) {
    return { world: w, error: true, lines: [{ text: `No such input file: ${inputs[0]}`, color: "error" }] }
  }
  w.root.children![out] = {
    type: "file",
    name: out,
    content: `converted from ${inNode.name}`,
  }
  const isAudio = out.match(/\.(mp3|wav|m4a)$/)
  return {
    world: w,
    lines: [
      { text: `ffmpeg version n7.0 — sandbox edition`, color: "dim" },
      { text: `Input: ${inNode.name}`, color: "text" },
      { text: isAudio ? "Stream mapping: audio only" : "Stream mapping: video + audio", color: "dim" },
      { text: `Output: ${out} ✅`, color: "success" },
    ],
  }
}
