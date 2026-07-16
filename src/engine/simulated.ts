import type {
  Coverage, Department, DepartmentProfile, DimensionKey, Fact, GraphEdge,
  Interview, Opportunity, OpportunityType, PainPoint, Report,
} from '../types'
import { DIMENSIONS } from '../types'
import { DEPARTMENTS } from '../data/departments'

// ---------------------------------------------------------------------------
// Offline adaptive interviewer. Not a script: it picks the next probe from
// (a) signals detected in the latest answer, then (b) the least-covered
// dimension. Good enough to demonstrate the conversation design without a key.
// ---------------------------------------------------------------------------

interface Signal {
  id: string
  test: RegExp
  dimension: DimensionKey
  followUp: string
}

const SIGNALS: Signal[] = [
  { id: 'excel', test: /\bexcel\b|spread\s?sheet|\bsheets?\b/i, dimension: 'manual', followUp: 'You mentioned a spreadsheet — walk me through it. Who updates it, how often does it break, and what happens when it\'s wrong?' },
  { id: 'whatsapp', test: /whats\s?app|telegram|group chat/i, dimension: 'knowledge', followUp: 'Interesting that this runs on WhatsApp. If someone needed to find a message from six months ago — say to settle a dispute — could they?' },
  { id: 'call', test: /\bcall|phone|ring\b/i, dimension: 'flow', followUp: 'You said you call someone at that point. What information are you actually getting from that call that no system could tell you?' },
  { id: 'wait', test: /wait|pending|stuck|delay|slow/i, dimension: 'delays', followUp: 'Let\'s stay on that delay. When it happens, what is everyone doing while they wait — and who notices first?' },
  { id: 'approval', test: /approv|sign[- ]?off|sanction|permission/i, dimension: 'decisions', followUp: 'Tell me about that approval. What does the approver actually check — and how often do they say no?' },
  { id: 'memory', test: /in my head|by heart|experience|i just know|instinct|gut/i, dimension: 'knowledgeLoss', followUp: 'That knowledge in your head — if you were unreachable for a month, what specifically would go wrong first?' },
  { id: 'repeat', test: /again|re-?do|rework|repeat|every time|same thing/i, dimension: 'manual', followUp: 'That sounds like work being done more than once. Roughly how many hours a week does that repetition cost your team?' },
  { id: 'search', test: /search|find|look for|hunt|locate/i, dimension: 'time', followUp: 'How much of your team\'s day goes into just finding things — information, parts, documents, people?' },
  { id: 'person', test: /only (one|he|she|[A-Z][a-z]+)|one person|depends on/i, dimension: 'knowledgeLoss', followUp: 'So this depends on one person. What happened the last time they were on leave?' },
  { id: 'paper', test: /paper|register|manual entry|typed|type up|fill/i, dimension: 'manual', followUp: 'Where does that manually-entered information go next — and does anyone re-enter it into another system?' },
]

const PRIMARY_QUESTIONS: Record<DimensionKey, string[]> = {
  value: [
    'Let\'s ground this: if your department vanished for a week, what would break first in the company — and who would scream loudest?',
    'What is the one thing your department does that the company would pay the most to protect?',
  ],
  flow: [
    'Walk me through yesterday. From the moment work arrived at your department, what actually happened, step by step?',
    'Take the last piece of work that left your department. Trace it backwards for me — where did each step happen and who touched it?',
  ],
  time: [
    'If I shadowed your team for a full day, where would I see the hours actually go — versus where you wish they went?',
    'What takes far longer than it should? Give me a real example from this week.',
  ],
  knowledge: [
    'When someone on your team doesn\'t know how to handle something, where do they go — a system, a document, or a person?',
    'What knowledge does your department run on that a new hire couldn\'t find written down anywhere?',
  ],
  knowledgeLoss: [
    'What happens when your most experienced person goes on leave? Be specific about what stalls.',
    'If your best person resigned tomorrow, what would walk out the door with them?',
  ],
  decisions: [
    'What decisions land on your desk that you wish didn\'t need to? Why do they need you?',
    'Where does work queue up waiting for someone to decide or approve something?',
  ],
  delays: [
    'What usually causes delays in your work? Tell me about the most recent one.',
    'Where does your work most often get stuck waiting on another department?',
  ],
  manual: [
    'What does your team still do by hand — writing, copying, entering, reconciling — that feels like it belongs to another decade?',
    'What work gets repeated — done once, then done again in another system or format?',
  ],
  aiOpportunity: [
    'Forget technology for a second: if you could hire one more brilliant person for free, what would you have them do all day?',
    'What question do you wish you could answer instantly that today takes days to answer?',
  ],
  impact: [
    'If the frustrations we\'ve discussed were fixed, what would the measurable difference be — in hours, rupees, or customer outcomes?',
    'Which of these problems, if solved, would your MD actually notice in the numbers?',
  ],
}

const CLOSING =
  'This has been genuinely valuable — you\'ve given me a clear picture of how the work really flows, where the hours go, and where the knowledge lives. I have what I need. Next I\'ll show you a short summary of what I understood — you can correct or add anything before it goes anywhere.'

export interface SimTurnResult {
  reply: string
  facts: Fact[]
  coverage: Coverage
  windDown: boolean
}

export function simulatedOpening(participant?: { name: string; responsibility: string } | null): string {
  const first = participant?.name?.trim().split(/\s+/)[0]
  const greeting = first ? `Thank you for making the time, ${first}` : 'Thank you for making the time'
  const anchor = participant?.responsibility
    ? ` You described your responsibility as: "${participant.responsibility.replace(/\.$/, '')}" — let's start right there.`
    : ''
  return `${greeting} — this is a conversation, not a survey, and there are no right or wrong answers.${anchor} Walk me through yesterday: from the moment you started work, what did your day actually look like?`
}

function summarise(answer: string): string {
  const clean = answer.replace(/\s+/g, ' ').trim()
  return clean.length > 180 ? clean.slice(0, 177) + '…' : clean
}

/** Pick next probe based on the latest answer + coverage state. */
export function simulatedTurn(
  interview: Interview,
  latestAnswer: string,
): SimTurnResult {
  const coverage: Coverage = { ...interview.coverage }
  const asked = new Set(
    interview.messages.filter((m) => m.role === 'ai').map((m) => m.text),
  )

  // Which dimension was the last AI question probing? Attribute the answer there.
  const lastProbe = lastProbedDimension(interview)
  const gain = Math.min(0.45, 0.15 + latestAnswer.length / 600)
  coverage[lastProbe] = Math.min(1, coverage[lastProbe] + gain)

  const facts: Fact[] = [{ dimension: lastProbe, text: summarise(latestAnswer) }]

  // Signal-driven follow-up beats scripted progression (this is the adaptivity).
  for (const sig of SIGNALS) {
    if (sig.test.test(latestAnswer) && !asked.has(sig.followUp)) {
      coverage[sig.dimension] = Math.min(1, coverage[sig.dimension] + 0.1)
      return { reply: sig.followUp, facts, coverage, windDown: false }
    }
  }

  // Otherwise advance to the least-covered dimension.
  const remaining = DIMENSIONS.filter((d) => coverage[d.key] < 0.65).sort(
    (a, b) => coverage[a.key] - coverage[b.key],
  )

  const askedCount = interview.messages.filter((m) => m.role === 'ai').length
  if (remaining.length === 0 || askedCount >= 14) {
    return { reply: CLOSING, facts, coverage, windDown: true }
  }

  const target = remaining[0]
  const options = PRIMARY_QUESTIONS[target.key]
  const q = options.find((o) => !asked.has(o)) ?? options[0]
  return { reply: q, facts, coverage, windDown: false }
}

function lastProbedDimension(interview: Interview): DimensionKey {
  const lastAi = [...interview.messages].reverse().find((m) => m.role === 'ai')
  if (!lastAi) return 'flow'
  for (const [key, qs] of Object.entries(PRIMARY_QUESTIONS) as [DimensionKey, string[]][]) {
    if (qs.includes(lastAi.text)) return key
  }
  const sig = SIGNALS.find((s) => s.followUp === lastAi.text)
  if (sig) return sig.dimension
  return 'flow'
}

// ---------------------------------------------------------------------------
// Offline analysis: synthesises the discovery output from collected facts.
// ---------------------------------------------------------------------------

export interface AnalysisResult {
  profile: DepartmentProfile
  report: Report
  opportunities: Opportunity[]
  edges: GraphEdge[]
}

const CATEGORY_BY_DIMENSION: Record<DimensionKey, string> = {
  value: 'Value stream',
  flow: 'Process variation',
  time: 'Searching',
  knowledge: 'Knowledge silo',
  knowledgeLoss: 'Human dependency',
  decisions: 'Decision bottleneck',
  delays: 'Waiting',
  manual: 'Manual documentation',
  aiOpportunity: 'Knowledge waste',
  impact: 'Rework',
}

interface OppTemplate {
  match: RegExp
  type: OpportunityType
  title: string
  solution: string
  complexity: 'Low' | 'Medium' | 'High'
  horizon: 'quick' | 'medium' | 'strategic'
  impact: number
  effort: number
}

const OPP_TEMPLATES: OppTemplate[] = [
  { match: /search|find|locate|hunt|look/i, type: 'Search AI', title: 'Instant answers over department records', solution: 'AI search assistant over the department\'s documents, registers and message history so staff find information in seconds instead of hunting.', complexity: 'Low', horizon: 'quick', impact: 7, effort: 3 },
  { match: /excel|spreadsheet|reconcil|re-?enter|copy|typed?/i, type: 'Workflow Automation', title: 'Automate the manual data shuffle', solution: 'Replace re-entry and reconciliation between spreadsheets/systems with an automated pipeline; exceptions surfaced daily.', complexity: 'Medium', horizon: 'medium', impact: 8, effort: 5 },
  { match: /in my head|experience|by heart|one person|depends on|leave/i, type: 'Knowledge AI', title: 'Capture the expert playbook', solution: 'Structured capture of the veteran\'s decision rules into an AI assistant the whole team can query — de-risking the single-person dependency.', complexity: 'Medium', horizon: 'quick', impact: 9, effort: 4 },
  { match: /report|document|write|paperwork|certificate/i, type: 'Documentation AI', title: 'Auto-drafted documentation', solution: 'Generate reports/certificates from work already recorded; staff approve instead of writing.', complexity: 'Low', horizon: 'quick', impact: 7, effort: 3 },
  { match: /approv|sanction|sign[- ]?off|decide|decision/i, type: 'Decision AI', title: 'Decision support with clear rules', solution: 'Encode approval criteria into decision support that pre-screens routine cases, escalating only true exceptions.', complexity: 'Medium', horizon: 'medium', impact: 7, effort: 5 },
  { match: /forecast|predict|season|demand|plan/i, type: 'Prediction AI', title: 'Forecasting from history', solution: 'Predictive model on historical patterns to anticipate demand/failures before they become emergencies.', complexity: 'Medium', horizon: 'medium', impact: 8, effort: 6 },
  { match: /status|follow[- ]?up|chase|where is|update/i, type: 'Communication AI', title: 'Self-service status bot', solution: 'A bot that answers status questions automatically from live records, ending the human relay of updates.', complexity: 'Low', horizon: 'quick', impact: 6, effort: 2 },
]

export function simulatedAnalysis(dept: Department, interview: Interview): AnalysisResult {
  const byDim = (k: DimensionKey) => interview.facts.filter((f) => f.dimension === k).map((f) => f.text)
  const allText = interview.messages.filter((m) => m.role === 'user').map((m) => m.text).join(' ')

  const painPoints: PainPoint[] = (['delays', 'manual', 'knowledgeLoss', 'time', 'decisions'] as DimensionKey[])
    .flatMap((k) => byDim(k).slice(0, 2).map((text): PainPoint => ({
      text,
      severity: k === 'delays' || k === 'knowledgeLoss' ? 3 : 2,
      category: CATEGORY_BY_DIMENSION[k],
    })))
    .slice(0, 6)

  const opportunities: Opportunity[] = []
  for (const t of OPP_TEMPLATES) {
    if (t.match.test(allText) && opportunities.length < 4) {
      opportunities.push({
        id: `${dept.id}-sim-${opportunities.length}`,
        departmentId: dept.id,
        title: t.title,
        type: t.type,
        problem: painPoints[opportunities.length]?.text ?? 'Recurring manual effort described in the interview.',
        currentCost: 'Recurring staff hours and delay cost described in the interview (to be quantified in follow-up).',
        peopleInvolved: `${dept.name} team and its upstream/downstream departments.`,
        solution: t.solution,
        businessValue: 'Hours returned to higher-value work; faster turnaround on the department\'s core output.',
        complexity: t.complexity,
        confidence: 65 + opportunities.length * 4,
        horizon: t.horizon,
        impact: t.impact,
        effort: t.effort,
      })
    }
  }
  if (opportunities.length === 0) {
    opportunities.push({
      id: `${dept.id}-sim-0`, departmentId: dept.id,
      title: 'Department copilot for daily operations', type: 'Copilot',
      problem: 'Fragmented information and repeated manual coordination described in the interview.',
      currentCost: 'Daily coordination overhead across the team.',
      peopleInvolved: `${dept.name} team.`,
      solution: 'An assistant grounded in the department\'s records that drafts, finds, and coordinates routine work.',
      businessValue: 'Measurable reduction in coordination time.',
      complexity: 'Medium', confidence: 60, horizon: 'medium', impact: 6, effort: 5,
    })
  }

  // Graph edges: departments actually mentioned in the conversation.
  const edges: GraphEdge[] = DEPARTMENTS
    .filter((d) => d.id !== dept.id)
    .filter((d) => new RegExp(`\\b${d.short}\\b`, 'i').test(allText) || new RegExp(`\\b${d.name}\\b`, 'i').test(allText))
    .slice(0, 4)
    .map((d) => ({ from: dept.id, to: d.id, label: 'works with' }))

  const profile: DepartmentProfile = {
    mission: byDim('value')[0] ?? `${dept.blurb}`,
    responsibilities: byDim('flow').slice(0, 4),
    criticalProcesses: byDim('flow').slice(0, 3),
    inputs: ['Work requests from other departments and customers'],
    outputs: [`${dept.name} deliverables to downstream departments`],
    stakeholders: edges.map((e) => e.to),
    systems: detectSystems(allText),
    kpis: byDim('impact').slice(0, 3),
    manualActivities: byDim('manual').slice(0, 4),
    knowledgeAssets: byDim('knowledge').slice(0, 3),
    decisionPoints: byDim('decisions').slice(0, 3),
    approvalFlow: byDim('decisions').slice(0, 2),
    improvementIdeas: byDim('aiOpportunity').slice(0, 3),
  }

  const report: Report = {
    executiveSummary:
      `The ${dept.name} interview surfaced a pattern familiar across Cyrix: capable people compensating for missing structure. ` +
      `Work flows through informal channels, key knowledge is concentrated in a few heads, and measurable hours go to searching, chasing and re-entering information. ` +
      `The strongest openings are ${opportunities.slice(0, 2).map((o) => o.title.toLowerCase()).join(' and ')} — both grounded directly in what the interviewee described.`,
    capabilityMap: [
      { area: 'Core execution', strength: 'strong', note: 'The team reliably delivers its primary output under pressure.' },
      { area: 'Knowledge management', strength: 'gap', note: byDim('knowledgeLoss')[0] ?? 'Critical know-how is undocumented.' },
      { area: 'Process visibility', strength: 'gap', note: byDim('delays')[0] ?? 'Status and delays surface through phone calls, not systems.' },
      { area: 'Systems & data', strength: 'adequate', note: 'Systems exist but fragment across tools; manual bridging fills the gaps.' },
    ],
    workflow: byDim('flow').slice(0, 5).map((f, i) => ({
      step: `Step ${i + 1}`,
      detail: f,
      friction: byDim('delays')[i] ?? null,
    })),
    painPoints,
    knowledgeFlow: byDim('knowledge').concat(byDim('knowledgeLoss')).slice(0, 3).join(' ') ||
      'Knowledge moves person-to-person; little lands in systems that outlast individuals.',
    knowledgeRisks: byDim('knowledgeLoss').slice(0, 3).map((text) => ({ text, severity: 'high' as const })),
    decisionFlow: byDim('decisions').slice(0, 3).join(' ') ||
      'Decisions concentrate upward; routine cases queue behind exceptional ones.',
    estimatedImpact:
      'Directional estimate pending quantification: the manual effort and delays described suggest 20–35% of team capacity is recoverable, with direct effect on turnaround time for the department\'s core output.',
    unanswered: [
      'Quantified frequency and cost of the main delays described',
      'Volume metrics for the department\'s core transactions',
      'Baseline KPI values to measure improvement against',
    ],
    founderBrief:
      `${dept.name} loses its hours to ${topLoss(byDim)} rather than to its core work. ` +
      `The biggest structural risk is that ${byDim('knowledgeLoss')[0]?.replace(/\.$/, '').toLowerCase() || 'critical know-how is undocumented and concentrated in a few people'}. ` +
      `Deploy first: ${opportunities[0]?.title.toLowerCase() ?? 'a department copilot'} — it is grounded directly in what the team described, is ${opportunities[0]?.complexity.toLowerCase() ?? 'medium'} complexity, and its effect will be visible in the department's turnaround time within a quarter.`,
  }

  return { profile, report, opportunities, edges }
}

function topLoss(byDim: (k: DimensionKey) => string[]): string {
  const t = byDim('time')[0] ?? byDim('manual')[0] ?? byDim('delays')[0]
  if (!t) return 'searching, chasing and re-entering information'
  // keep the team's own words, but as a clean short quote
  const words = t.replace(/\.+$/, '').split(/\s+/)
  const short = words.slice(0, 14).join(' ')
  return `what the team described plainly: "${short}${words.length > 14 ? '…' : ''}"`
}

export function detectSystems(text: string): string[] {
  const found: string[] = []
  const candidates: [RegExp, string][] = [
    [/tally/i, 'Tally'], [/excel|spreadsheet/i, 'Excel'], [/whats\s?app/i, 'WhatsApp'],
    [/sap\b/i, 'SAP'], [/erp/i, 'ERP'], [/email|mail/i, 'Email'], [/portal/i, 'Web portals'],
    [/\bword\b/i, 'Word templates'], [/paper|worksheet|register/i, 'Paper records'],
  ]
  for (const [re, name] of candidates) if (re.test(text)) found.push(name)
  return found.length ? found : ['No dedicated system — phone, paper and memory']
}
