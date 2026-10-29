import type { ParsedCommand } from "../types"

/** Tokenize a command line respecting quotes. Returns tokens. */
export function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ""
  let quote: '"' | "'" | null = null
  for (const ch of input) {
    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        current += ch
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current)
        current = ""
      }
    } else {
      current += ch
    }
  }
  if (current) tokens.push(current)
  return tokens
}

/** Parse a raw command line into a ParsedCommand. */
export function parseLine(raw: string): ParsedCommand {
  const tokens = tokenize(raw.trim())
  const cmd = tokens[0] ?? ""
  const rest = tokens.slice(1)
  const flags: string[] = []
  const args: string[] = []
  for (const token of rest) {
    if (token.startsWith("-") && token.length > 1) {
      // split combined short flags like -la
      if (token.startsWith("--") || token.length === 2) {
        flags.push(token)
      } else {
        for (const ch of token.slice(1)) flags.push("-" + ch)
      }
    } else {
      args.push(token)
    }
  }
  return { raw: raw.trim(), cmd, flags, args, flagsAndArgs: rest }
}

/** Damerau-Levenshtein distance (supports adjacent transpositions). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length || !b.length) return a.length || b.length
  const alen = a.length
  const blen = b.length
  const d: number[][] = Array.from({ length: alen + 1 }, () => new Array(blen + 1).fill(0))
  for (let i = 0; i <= alen; i++) d[i][0] = i
  for (let j = 0; j <= blen; j++) d[0][j] = j
  for (let i = 1; i <= alen; i++) {
    for (let j = 1; j <= blen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[alen][blen]
}

/** Find closest known word for "did you mean" suggestions. */
export function closestWord(input: string, vocabulary: string[]): string | null {
  let best: string | null = null
  let bestDist = Infinity
  for (const word of vocabulary) {
    const dist = levenshtein(input.toLowerCase(), word.toLowerCase())
    if (dist < bestDist) {
      bestDist = dist
      best = word
    }
  }
  return bestDist <= Math.max(2, Math.floor(input.length / 3)) ? best : null
}
