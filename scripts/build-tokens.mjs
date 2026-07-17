// CYRA token pipeline (13 § Token pipeline).
//
// cyra-tokens.json is the single source. This script compiles it to CSS custom
// properties on :root. Tailwind's theme extends ONLY from those variables.
// A value that isn't a token is a review finding.
//
// Run: npm run tokens (wired into predev/prebuild)

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SOURCE = resolve(here, '../cyra-tokens.json')
const OUT = resolve(here, '../src/tokens.css')

const tokens = JSON.parse(readFileSync(SOURCE, 'utf8'))

/** Walk the token tree; every node carrying `value` becomes one custom property. */
function flatten(node, path = [], acc = []) {
  if (node && typeof node === 'object' && 'value' in node) {
    acc.push([path.join('-'), String(node.value)])
    return acc
  }
  for (const [key, child] of Object.entries(node ?? {})) {
    if (key.startsWith('$')) continue
    if (child && typeof child === 'object') flatten(child, [...path, key], acc)
  }
  return acc
}

const vars = flatten(tokens)
  .map(([name, value]) => `  --cyra-${name}: ${value};`)
  .join('\n')

const css = `/* GENERATED FROM cyra-tokens.json — DO NOT EDIT BY HAND.
 * Regenerate with: npm run tokens
 * Source of truth: CYRA Design System 14_Design_Tokens.json (13 § Token pipeline)
 */
:root {
${vars}
}
`

writeFileSync(OUT, css)
console.log(`cyra tokens → ${vars.split('\n').length} custom properties → src/tokens.css`)
