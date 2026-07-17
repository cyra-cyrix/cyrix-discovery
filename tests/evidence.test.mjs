// Evidence Layer invariant tests — the harness the roadmap bootstraps in M1.
// Runs with `npm test` (node:test, no framework dependency). These assert the
// DETERMINISTIC layer: the model may emit garbage; this layer must not store it.
//
// Uses the compiled TS via tsx-less trick: evidence.ts is imported through a
// one-off esbuild transpile into a temp module (build does not type-check, so
// tests import the same code paths production bundles).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Transpile src/intelligence/evidence.ts to an importable ESM module once.
const dir = mkdtempSync(join(tmpdir(), 'cyra-ev-'))
const out = join(dir, 'evidence.mjs')
execSync(`npx esbuild src/intelligence/evidence.ts --format=esm --outfile=${out}`, { stdio: 'pipe' })
const { deriveConfidence, anchorResolves, isForbidden, realizeCandidate } = await import(out)

const TRANSCRIPT = 'Yesterday I recalibrated the CT scanner myself. The register is kept by one clerk and honestly we skip the second sign-off. The SOP says two signatures are required.'

const base = {
  verbatim_anchor: 'Yesterday I recalibrated the CT scanner myself.',
  interpretation: 'First-hand account of solo recalibration',
  entity: 'INCIDENT', register: 'ENACTED', source_quality: 'FIRST_HAND',
  specificity: 'RECENT_INSTANCE', richness: 'THIN',
  against_interest: false, self_serving: false, verifiable: true,
  internally_consistent: true, sig_recall_exhausted: false,
  sig_inarticulable: false, sig_relational: false,
  sig_third_party_eval: false, sig_sensitive: false, turn_index: 2,
}

test('confidence is capped at MODERATE no matter how strong the flags (§12.2 / P4 ceiling)', () => {
  const r = deriveConfidence({
    source_quality: 'FIRST_HAND', specificity: 'DATED_INCIDENT', richness: 'RICH',
    against_interest: true, self_serving: false, verifiable: true,
    internally_consistent: true, register: 'ENACTED', elicitation: 'SPONTANEOUS',
    sig_recall_exhausted: false,
  })
  assert.equal(r.band, 'MODERATE') // never HIGH — unreachable within one interview
  assert.match(r.rationale, /→ MODERATE$/)
})

test('confidence is deterministic — same flags, same band and rationale', () => {
  const input = { source_quality: 'HEARSAY', specificity: 'GENERAL', richness: 'THIN', against_interest: false, self_serving: true, verifiable: false, internally_consistent: false, register: 'ESPOUSED', elicitation: 'PROMPTED', sig_recall_exhausted: false }
  const a = deriveConfidence(input), b = deriveConfidence(input)
  assert.deepEqual(a, b)
})

test('hearsay flags HEARSAY and starts from base 0 (§11.5, §12.1)', () => {
  const r = deriveConfidence({ source_quality: 'HEARSAY', specificity: 'GENERAL', richness: 'THIN', against_interest: false, self_serving: false, verifiable: true, internally_consistent: false, register: 'ENACTED', elicitation: 'PROMPTED', sig_recall_exhausted: false })
  assert.ok(r.flags.includes('HEARSAY'))
  assert.equal(r.band, 'NONE')
})

test('leading elicitation deducts and flags (§12.1, I12 telemetry)', () => {
  const r = deriveConfidence({ source_quality: 'FIRST_HAND', specificity: 'GENERAL', richness: 'THIN', against_interest: false, self_serving: false, verifiable: true, internally_consistent: false, register: 'ENACTED', elicitation: 'LEADING', sig_recall_exhausted: false })
  assert.ok(r.flags.includes('LEADING_ELICITED'))
})

test('a non-verbatim anchor disqualifies the item — nothing unanchored is stored', () => {
  const r = realizeCandidate({ ...base, verbatim_anchor: 'I recalibrated the scanner all alone yesterday.' }, TRANSCRIPT, 'per-1', 'Engineer')
  assert.equal(r.items.length, 0)
  assert.equal(r.droppedUnanchored, true)
})

test('anchorResolves demands verbatim, ≥8 chars', () => {
  assert.equal(anchorResolves('The SOP says two signatures are required.', TRANSCRIPT), true)
  assert.equal(anchorResolves('The SOP says 2 signatures', TRANSCRIPT), false)
  assert.equal(anchorResolves('says', TRANSCRIPT), false)
})

test('MIXED register splits into two items, never one blurred item (§11.3, I4)', () => {
  const r = realizeCandidate({ ...base, verbatim_anchor: 'The SOP says two signatures are required.', register: 'MIXED' }, TRANSCRIPT, 'per-1', 'Engineer')
  assert.equal(r.items.length, 2)
  assert.deepEqual(r.items.map((i) => i.register).sort(), ['ENACTED', 'ESPOUSED'])
  for (const item of r.items) assert.notEqual(item.verbatim_anchor, item.interpretation) // I5
})

test('named-individual evaluation is never stored as an evidence item (§11.6, I7)', () => {
  const c = { ...base, entity: 'CAPABILITY', sig_third_party_eval: true }
  assert.equal(isForbidden(c), true)
  const r = realizeCandidate(c, TRANSCRIPT, 'per-1', 'Engineer')
  assert.equal(r.items.length, 0)
  assert.equal(r.droppedUnanchored, false) // dropped by rule, not by anchor
})

test('sensitive content is never stored (§11.6 / P9)', () => {
  assert.equal(isForbidden({ ...base, sig_sensitive: true }), true)
})

test('relational knowledge routes as POINTER and yields a PointerItem (§11.4 / P8)', () => {
  const r = realizeCandidate({ ...base, verbatim_anchor: 'The register is kept by one clerk', sig_relational: true, pointer_holder: 'the stores clerk' }, TRANSCRIPT, 'per-1', 'Engineer')
  assert.equal(r.items[0].routing, 'POINTER')
  assert.equal(r.pointer.holder, 'the stores clerk')
})

test('provenance carries role, never a personal name field (P6 shape)', () => {
  const r = realizeCandidate({ ...base }, TRANSCRIPT, 'per-1', 'Service Engineer')
  const p = r.items[0].provenance
  assert.deepEqual(Object.keys(p).sort(), ['elicitation', 'interview_id', 'role', 'turn_index'])
})
