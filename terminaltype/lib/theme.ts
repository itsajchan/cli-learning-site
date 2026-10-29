export interface Theme {
  id: string
  name: string
  bg: string
  fg: string
  prompt: string
  green: string
  amber: string
  red: string
  cyan: string
  dim: string
  selection: string
}

export const THEMES: Record<string, Theme> = {
  phosphor: {
    id: "phosphor",
    name: "phosphor (default)",
    bg: "#0a0e14",
    fg: "#e6e6e6",
    prompt: "#4af626",
    green: "#4af626",
    amber: "#ffb648",
    red: "#ff5c57",
    cyan: "#57c7ff",
    dim: "#6b7280",
    selection: "#1f2937",
  },
  dracula: {
    id: "dracula",
    name: "dracula",
    bg: "#282a36",
    fg: "#f8f8f2",
    prompt: "#50fa7b",
    green: "#50fa7b",
    amber: "#f1fa8c",
    red: "#ff5555",
    cyan: "#8be9fd",
    dim: "#6272a4",
    selection: "#44475a",
  },
  nord: {
    id: "nord",
    name: "nord",
    bg: "#2e3440",
    fg: "#eceff4",
    prompt: "#a3be8c",
    green: "#a3be8c",
    amber: "#ebcb8b",
    red: "#bf616a",
    cyan: "#88c0d0",
    dim: "#69788c",
    selection: "#434c5e",
  },
  gruvbox: {
    id: "gruvbox",
    name: "gruvbox",
    bg: "#1d2021",
    fg: "#ebdbb2",
    prompt: "#b8bb26",
    green: "#b8bb26",
    amber: "#fabd2f",
    red: "#fb4934",
    cyan: "#83a598",
    dim: "#928374",
    selection: "#504945",
  },
  matrix: {
    id: "matrix",
    name: "matrix",
    bg: "#000000",
    fg: "#00ff41",
    prompt: "#00ff41",
    green: "#00ff41",
    amber: "#ccff00",
    red: "#ff0000",
    cyan: "#00cccc",
    dim: "#007700",
    selection: "#003300",
  },
}

export const THEME_LIST = Object.values(THEMES)
