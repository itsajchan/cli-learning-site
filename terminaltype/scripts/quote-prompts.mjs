import fs from "node:fs"

for (const f of ["lib/content/track1.yaml", "lib/content/track2.yaml", "lib/content/track3.yaml"]) {
  let src = fs.readFileSync(f, "utf8")
  src = src
    .split("\n")
    .map((line) => {
      const m = line.match(/^(\s+prompt: )(.+)$/)
      if (!m) return line
      const val = m[2].trim()
      if (val.startsWith('"') || val.startsWith("'")) return line
      return m[1] + JSON.stringify(val)    })
    .join("\n")
  fs.writeFileSync(f, src)
}
console.log("quoted all prompt values")
