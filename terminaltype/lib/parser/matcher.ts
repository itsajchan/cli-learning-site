import type { CommandMatcher, ParsedCommand } from "../types"

export interface MatchResult {
  matched: boolean
  /** Why it failed, for coaching. */
  reason?: "cmd" | "flags" | "args" | "argcount"
  /** The matcher that came closest. */
  matcher?: CommandMatcher
  /** Missing flags the user should have used. */
  missingFlags?: string[]
  /** Extra flags the user passed beyond requirements. */
  extraFlags?: string[]
}

function hasFlag(parsed: ParsedCommand, flag: string): boolean {
  if (parsed.flags.includes(flag)) return true
  // combined short flags were split by tokenizer; also accept "no dash" duplicates
  return false
}

/**
 * Match a parsed command against a matcher.
 * Tolerant by design: extra flags are OK (realistic), missing required flags are not.
 */
export function matchCommand(parsed: ParsedCommand, matcher: CommandMatcher): MatchResult {
  // command match (typo handled upstream by router)
  const cmdOk =
    matcher.cmd === "*" ||
    parsed.cmd.toLowerCase() === matcher.cmd.toLowerCase() ||
    (matcher.cmd === "ls" && parsed.cmd === "dir")
  if (!cmdOk) return { matched: false, reason: "cmd", matcher }

  // arg count checks
  const min = matcher.minArgs ?? 0
  if (matcher.argCount !== undefined) {
    if (parsed.args.length !== matcher.argCount) {
      return { matched: false, reason: "argcount", matcher }
    }
  } else if (parsed.args.length < min) {
    return { matched: false, reason: "argcount", matcher }
  }

  // literal args: non-dash args compare positionally against parsed.args,
  // dash args (e.g. "-b" in `git checkout -b x`) compare against parsed.flags
  if (matcher.args) {
    let argPos = 0
    for (let i = 0; i < matcher.args.length; i++) {
      const expected = matcher.args[i]
      if (expected === "*") {
        argPos++
        continue
      }
      if (expected.startsWith("-")) {
        if (!hasFlag(parsed, expected)) {
          return { matched: false, reason: "flags", matcher, missingFlags: [expected] }
        }
        continue
      }
      const actual = parsed.args[argPos]
      if (expected !== undefined && actual !== expected) {
        return { matched: false, reason: "args", matcher }
      }
      argPos++
    }
  }

  // flags: each group is an any-of; at least one flag of each group must be present
  const missingFlags: string[][] = []
  for (const group of matcher.flags ?? []) {
    if (!group.some((f) => hasFlag(parsed, f))) missingFlags.push(group)
  }
  if (missingFlags.length > 0) {
    return { matched: false, reason: "flags", matcher, missingFlags: missingFlags.flat() }
  }

  return { matched: true, matcher }
}

/** Try a list of matchers; return the best (most specific) result for coaching. */
export function matchAny(parsed: ParsedCommand, matchers: CommandMatcher[]): MatchResult {
  let best: MatchResult | null = null
  for (const matcher of matchers) {
    const result = matchCommand(parsed, matcher)
    if (result.matched) return result
    if (!best || rank(result) < rank(best)) best = result
  }
  return best ?? { matched: false, reason: "cmd" }
}

/** Lower rank = closer to matching = better feedback source. */
function rank(r: MatchResult): number {
  if (r.reason === "cmd") return 3
  if (r.reason === "argcount") return 2
  if (r.reason === "args") return 1
  return 0 // flags wrong is closest — user got the right command
}
