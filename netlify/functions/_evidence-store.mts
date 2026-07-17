// Evidence persistence — THE STORAGE ABSTRACTION (M0 Decision 3).
//
// The domain speaks only to `EvidenceStore`. The active driver is Netlify Blobs
// (works today, zero new credentials); the Supabase driver drops in behind the
// same interface once a project + SUPABASE_URL/SUPABASE_SERVICE_KEY exist —
// selected here, in this one file, with no domain change. Do not import
// @netlify/blobs for evidence anywhere else.

import { getStore } from '@netlify/blobs'
import type { EvidenceEnvelope } from '../../src/intelligence/evidence.ts'

export interface EvidenceStore {
  get(interviewId: string): Promise<EvidenceEnvelope | null>
  put(envelope: EvidenceEnvelope): Promise<void>
  remove(interviewId: string): Promise<void>
  /** Envelope summaries for the dashboard side; contents stay per-interview. */
  list(): Promise<Array<{ interview_id: string; extracted_at: number; items: number; extractor: string }>>
}

class BlobsEvidenceStore implements EvidenceStore {
  private store() {
    return getStore({ name: 'cyra-discovery-evidence', consistency: 'strong' })
  }
  private key(id: string) {
    return `evidence/${id}`
  }
  async get(interviewId: string) {
    return (await this.store().get(this.key(interviewId), { type: 'json' })) as EvidenceEnvelope | null
  }
  async put(envelope: EvidenceEnvelope) {
    await this.store().setJSON(this.key(envelope.interview_id), envelope)
  }
  async remove(interviewId: string) {
    await this.store().delete(this.key(interviewId))
  }
  async list() {
    const s = this.store()
    const { blobs } = await s.list({ prefix: 'evidence/' })
    const envelopes = await Promise.all(
      blobs.map(async (b) => (await s.get(b.key, { type: 'json' })) as EvidenceEnvelope | null),
    )
    return envelopes
      .filter((e): e is EvidenceEnvelope => e !== null)
      .map((e) => ({ interview_id: e.interview_id, extracted_at: e.extracted_at, items: e.items.length, extractor: e.extractor }))
  }
}

// Driver selection. When Supabase lands: `return env.SUPABASE_URL ? new
// SupabaseEvidenceStore() : new BlobsEvidenceStore()` — the only line that changes.
export function evidenceStore(): EvidenceStore {
  return new BlobsEvidenceStore()
}
