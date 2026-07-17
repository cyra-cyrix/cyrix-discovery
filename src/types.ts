// ---------- Discovery dimensions (the 10 interview objectives) ----------

export type DimensionKey =
  | 'value' // how the team creates value
  | 'flow' // how work actually flows
  | 'time' // where people spend time
  | 'knowledge' // where knowledge exists
  | 'knowledgeLoss' // where knowledge is lost
  | 'decisions' // where decisions are made
  | 'delays' // where delays happen
  | 'manual' // where manual effort exists
  | 'aiOpportunity' // where AI can help
  | 'impact' // what measurable business impact is possible

export interface Dimension {
  key: DimensionKey
  label: string
  short: string
}

export const DIMENSIONS: Dimension[] = [
  { key: 'value', label: 'How this team creates value', short: 'Value' },
  { key: 'flow', label: 'How work actually flows', short: 'Workflow' },
  { key: 'time', label: 'Where people spend time', short: 'Time' },
  { key: 'knowledge', label: 'Where knowledge exists', short: 'Knowledge' },
  { key: 'knowledgeLoss', label: 'Where knowledge is lost', short: 'Knowledge risk' },
  { key: 'decisions', label: 'Where decisions are made', short: 'Decisions' },
  { key: 'delays', label: 'Where delays happen', short: 'Delays' },
  { key: 'manual', label: 'Where manual effort exists', short: 'Manual work' },
  { key: 'aiOpportunity', label: 'Where AI can help', short: 'AI openings' },
  { key: 'impact', label: 'What measurable impact is possible', short: 'Impact' },
]

// ---------- People (the primary entity) ----------
// The organization is discovered, not predefined: people are invited, and
// departments/relationships emerge from what their interviews reveal.

export interface Person {
  id: string
  name: string
  designation: string
  email: string
  phone: string
  state: string
  reportingManager: string // optional, free text
  department: string // optional — usually discovered by the interview
  createdAt: number
}

export const newPersonId = (): string => `per-${Date.now().toString(36)}-${Math.floor(Math.random() * 36 ** 4).toString(36)}`

export type PersonStatus = 'complete' | 'in_progress' | 'invited' | 'not_invited'

// ---------- Invitations (issued to a person) ----------

export type InviteStatus = 'active' | 'disabled'

export interface Invite {
  token: string
  personId: string
  createdAt: number
  status: InviteStatus
  completedAt: number | null
}

// ---------- Conversation ----------

export interface ChatMessage {
  id: string
  role: 'ai' | 'user'
  text: string
}

export interface Fact {
  dimension: DimensionKey
  text: string
}

export type Coverage = Record<DimensionKey, number> // 0..1 per dimension

export const emptyCoverage = (): Coverage => ({
  value: 0, flow: 0, time: 0, knowledge: 0, knowledgeLoss: 0,
  decisions: 0, delays: 0, manual: 0, aiOpportunity: 0, impact: 0,
})

// ---------- Opportunity engine ----------

export type OpportunityType =
  | 'Knowledge AI' | 'Decision AI' | 'Search AI' | 'Documentation AI'
  | 'Communication AI' | 'Prediction AI' | 'Workflow Automation'
  | 'Agentic AI' | 'Analytics' | 'Monitoring' | 'Copilot'

export type Horizon = 'quick' | 'medium' | 'strategic'

export interface Opportunity {
  id: string
  personId: string // the interview this opportunity emerged from
  title: string
  type: OpportunityType
  problem: string
  currentCost: string
  peopleInvolved: string
  solution: string
  businessValue: string
  complexity: 'Low' | 'Medium' | 'High'
  confidence: number // 0..100
  horizon: Horizon
  impact: number // 1..10 (priority matrix y)
  effort: number // 1..10 (priority matrix x)
}

// ---------- Knowledge model ----------

export interface PainPoint {
  text: string
  severity: 1 | 2 | 3 // 3 = most severe
  category: string // e.g. Waiting, Searching, Rework, Approval delay
}

export interface KnowledgeRisk {
  text: string
  severity: 'low' | 'medium' | 'high'
}

export interface DepartmentProfile {
  mission: string
  responsibilities: string[]
  criticalProcesses: string[]
  inputs: string[]
  outputs: string[]
  stakeholders: string[]
  systems: string[]
  kpis: string[]
  manualActivities: string[]
  knowledgeAssets: string[]
  decisionPoints: string[]
  approvalFlow: string[]
  improvementIdeas: string[]
}

export interface WorkflowStep {
  step: string
  detail: string
  friction: string | null
}

export interface CapabilityArea {
  area: string
  strength: 'strong' | 'adequate' | 'gap'
  note: string
}

export interface Report {
  executiveSummary: string
  capabilityMap: CapabilityArea[]
  workflow: WorkflowStep[]
  painPoints: PainPoint[]
  knowledgeFlow: string
  knowledgeRisks: KnowledgeRisk[]
  decisionFlow: string
  estimatedImpact: string
  unanswered: string[]
  /** The 60-second read for founders: what matters, what to do first. */
  founderBrief: string
}

/** An emergent relationship between discovered departments/teams (free-text names). */
export interface GraphEdge {
  from: string
  to: string
  label: string
}

// ---------- Participant context (collected at interview start) ----------

export interface ParticipantContext {
  name: string // optional — may be ''
  designation: string
  department: string // optional free text — discovered in conversation if blank
  stateBranch: string
  yearsAtCyrix: string
  responsibility: string // primary responsibility in 1–2 sentences
}

// ---------- Interview (keyed by person) ----------

/** `complete` is the only immutable state. `analysis_failed` keeps the
 *  transcript and stays resumable — the answers are the participant's twenty
 *  minutes; a failed report is our problem to retry, not theirs to redo. */
export type InterviewStatus = 'not_started' | 'in_progress' | 'generating' | 'complete' | 'analysis_failed'

export interface Interview {
  personId: string
  departmentName: string | null // discovered — from context or the analysis
  status: InterviewStatus
  mode: 'live' | 'simulated'
  startedAt: number | null
  completedAt: number | null
  inviteToken: string | null
  participant: ParticipantContext | null
  messages: ChatMessage[]
  facts: Fact[]
  coverage: Coverage
  profile: DepartmentProfile | null
  report: Report | null
  opportunities: Opportunity[]
  edges: GraphEdge[]
  /** Monotonic, incremented by the client on every mutation. The server
   *  rejects any checkpoint whose revision does not exceed the stored one, so
   *  a delayed retry can never overwrite a newer turn. Interviews written
   *  before checkpointing existed have no revision; readers treat that as 0. */
  revision: number
  updatedAt: number
  /** Set only when the report could not be written; see analysis-background. */
  analysisError: string | null
}

export const newInterview = (
  personId: string,
  mode: 'live' | 'simulated',
  participant: ParticipantContext | null = null,
  inviteToken: string | null = null,
): Interview => ({
  personId,
  departmentName: participant?.department.trim() || null,
  status: 'in_progress',
  mode,
  startedAt: Date.now(),
  completedAt: null,
  inviteToken,
  participant,
  messages: [],
  facts: [],
  coverage: emptyCoverage(),
  profile: null,
  report: null,
  opportunities: [],
  edges: [],
  revision: 0,
  updatedAt: Date.now(),
  analysisError: null,
})

// ---------- Settings ----------

export interface Settings {
  apiKey: string
  model: string
}
