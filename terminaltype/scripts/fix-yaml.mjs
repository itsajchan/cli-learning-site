import fs from "node:fs"
import { load as yamlLoad } from "js-yaml"

const files = ["lib/content/track1.yaml", "lib/content/track2.yaml", "lib/content/track3.yaml"]

function quoteValue(line) {
  // "key: value" where value contains ": " -> quote it. Also handle "key: 'already quoted'"
  const m = line.match(/^(\s*(?:- )?(?:"[^"]+":|'[^']+':|[\w.$>-]+:) )(.+)$/)
  if (!m) return null
  let val = m[2]
  if (/^["'].*["']$/.test(val.trim())) return null
  if (!val.includes(": ") && !val.endsWith(":")) return null
  val = val.trim()
  return m[1] + JSON.stringify(val)
}

for (const f of files) {
  for (let i = 0; i < 500; i++) {
    const src = fs.readFileSync(f, "utf8")
    try {
      yamlLoad(src)
      break
    } catch (e) {
      const match = e.message.match(/\((\d+):(\d+)\)/)
      if (!match) {
        console.error(`${f}: unfixable: ${e.message}`)
        process.exit(1)
      }
      const lineNo = Number(match[1]) - 1
      const lines = src.split("\n")
      const fixed = quoteValue(lines[lineNo])
      if (fixed === null) {
        console.error(`${f}:${lineNo + 1}: could not auto-quote: ${lines[lineNo]}`)
        process.exit(1)
      }
      lines[lineNo] = fixed
      fs.writeFileSync(f, lines.join("\n"))
    }
  }
  yamlLoad(fs.readFileSync(f, "utf8"))
  console.log(`${f}: parses clean`)
}
