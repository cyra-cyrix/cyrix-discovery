// ---------- Discovery dimensions (the 10 interview objectives) ----------

export type DimensionKey =
  | 'value' // how the department creates value
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
  { key: 'value', label: 'How this department creates value', short: 'Value' },
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
  departmentId: string
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

export interface GraphEdge {
  from: string // department id
  to: string // department id
  label: string
}

// ---------- Participant ----------

export interface ParticipantContext {
  name: string // optional — may be ''
  designation: string
  stateBranch: string
  yearsAtCyrix: string
  responsibility: string // primary responsibility in 1–2 sentences
}

// ---------- Invitations ----------

export type InviteStatus = 'active' | 'disabled'

export interface Invite {
  token: string
  departmentId: string // the department this invitation was issued for (informational — the form still asks)
  createdAt: number
  status: InviteStatus
  completedAt: number | null
}

// ---------- Interview ----------

export type InterviewStatus = 'not_started' | 'in_progress' | 'generating' | 'complete'

export interface Interview {
  departmentId: string
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
}

export const newInterview = (
  departmentId: string,
  mode: 'live' | 'simulated',
  participant: ParticipantContext | null = null,
  inviteToken: string | null = null,
): Interview => ({
  departmentId,
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
})

// ---------- Departments ----------

export interface Department {
  id: string
  name: string
  short: string
  blurb: string
  headRole: string
}

// ---------- Settings ----------

export interface Settings {
  apiKey: string
  model: string
}
