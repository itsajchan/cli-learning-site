import { readFileSync, writeFileSync, readdirSync } from "node:fs"
import { join, basename } from "node:path"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const contentDir = join(here, "..", "lib", "content")

const files = readdirSync(contentDir)
  .filter((f) => f.endsWith(".yaml"))
  .sort()

let out = "// AUTO-GENERATED from lib/content/*.yaml — run `npm run content:gen` after editing\n"
for (const file of files) {
  const name = basename(file, ".yaml").toUpperCase()
  const raw = readFileSync(join(contentDir, file), "utf8")
  out += `\nexport const ${name}_YAML = ${JSON.stringify(raw)}\n`
}
out += `
export const CONTENT_FILES = ${JSON.stringify(files.map((f) => f))}
`

writeFileSync(join(contentDir, "generated.ts"), out)
console.log(`generated lib/content/generated.ts from ${files.length} YAML files`)
