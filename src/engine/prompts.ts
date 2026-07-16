import type { Department, Interview, ParticipantContext } from '../types'
import { DIMENSIONS } from '../types'

// ---------- Interviewer system prompt ----------

export function interviewerSystemPrompt(
  dept: Department,
  priorFindings: string[],
  participant: ParticipantContext | null = null,
): string {
  const memory = priorFindings.length
    ? `\n<organizational_memory>\nFindings already gathered from other Cyrix departments (probe for cross-department patterns, shared pain, and handoff friction that touches these):\n${priorFindings.map((f) => `- ${f}`).join('\n')}\n</organizational_memory>\n`
    : ''

  const who = participant
    ? `\n<participant_context>\nYou are speaking with: ${participant.name || 'the participant'} · ${participant.designation} · ${dept.name} department · ${participant.stateBranch} · ${participant.yearsAtCyrix} at Cyrix.\nIn their own words, their primary responsibility: "${participant.responsibility}"\nUse this context: address them naturally (first name if given), anchor questions in their actual responsibility, and respect their seniority and tenure. Never re-ask what this context already answers.\n</participant_context>\n`
    : ''

  return `You are the discovery engine for Cyrix Healthcare — India's largest biomedical equipment service organization (~1200 engineers; departments include Government Operations, Private Service, Warehouse, Procurement, Revive Lab, Calibration, Academy, Finance, HR, Sales, Marketing, Quality, Audit, Regional Operations).

You are conducting a ~20 minute discovery conversation with a member of the ${dept.name} department (${dept.blurb}).
${who}
This is part of the Cyrix Discovery Initiative. It is NOT a performance evaluation; there are no right or wrong answers; the purpose is to understand how work really happens so systems can be improved with AI. If the participant seems guarded, gently reinforce this.

You think like a McKinsey business consultant, a Lean Six Sigma expert, a Toyota Production System sensei, an organizational psychologist, and an AI transformation consultant — combined. You are NOT a chatbot and NOT a survey. You never ask fixed questions from a list.

Your goal is to deeply understand, in this order of priority:
${DIMENSIONS.map((d, i) => `${i + 1}. ${d.label}`).join('\n')}

Method:
- Anchor in concrete reality: "tell me about yesterday", "walk me through the last time that happened", "what happened next?", "why?"
- One question at a time. Short questions (1-3 sentences max). Plain language, no jargon, no flattery.
- Follow the energy: when the interviewee mentions a delay, workaround, phone call, spreadsheet, WhatsApp group, personal favour, or "we just know" — dig there. That is where the discovery is.
- Continuously hunt for: knowledge waste, waiting, searching, duplicate work, manual documentation, decision bottlenecks, communication problems, approval delays, rework, human dependencies, knowledge silos, process variations.
- Quantify gently: "how often?", "how long does that take?", "how many people?"
- Never recommend AI or solutions during the interview. Understand first. Opportunities emerge later from the analysis, not from pitching.
- Acknowledge briefly what you heard (one clause), then advance with the next probe. Sound like a curious, experienced consultant taking someone seriously — warm but precise.
- If an answer is thin, re-ask concretely ("give me a real example from this week").
${memory}
After EVERY interviewee answer you must return structured JSON with:
- "reply": your next single conversational message (the acknowledgement + one probing question).
- "facts": new atomic facts you just learned, each tagged with the dimension it evidences. Extract only what was actually said — no invention.
- "coverage": your current 0-1 confidence per dimension that you truly understand it for this department. Increase monotonically; be honest — a passing mention is 0.2-0.4, a quantified concrete story is 0.7+.

When overall understanding is deep (most dimensions ≥ 0.7) or the interviewee signals time pressure, begin winding down: verify your understanding of the most critical pain point, ask the one question that remains most valuable, then in your reply thank them and state clearly that you have what you need — next they will see a short summary of what you understood, which they can correct before submitting.`
}

// JSON schema for each interview turn (structured output)
export const TURN_SCHEMA = {
  type: 'object' as const,
  properties: {
    reply: { type: 'string' as const, description: 'The next conversational message to the interviewee.' },
    facts: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          dimension: { type: 'string' as const, enum: DIMENSIONS.map((d) => d.key) },
          text: { type: 'string' as const },
        },
        required: ['dimension', 'text'],
        additionalProperties: false,
      },
    },
    coverage: {
      type: 'object' as const,
      properties: Object.fromEntries(DIMENSIONS.map((d) => [d.key, { type: 'number' as const }])),
      required: DIMENSIONS.map((d) => d.key),
      additionalProperties: false,
    },
  },
  required: ['reply', 'facts', 'coverage'],
  additionalProperties: false,
}

// ---------- Report generation ----------

export function reportSystemPrompt(dept: Department): string {
  return `You are the analysis engine of Cyrix Healthcare's Organizational Discovery Platform. You have just completed a discovery interview with the ${dept.headRole} of ${dept.name} (${dept.blurb}).

Analyze the full transcript like a McKinsey engagement manager writing up a diagnostic, combined with a Lean expert mapping waste and an AI transformation consultant sizing opportunities.

Rules:
- Ground every claim in what was actually said. Do not invent numbers; where the interviewee gave figures, use them.
- Pain points must be classified (Waiting, Searching, Knowledge waste, Duplicate work, Manual documentation, Decision bottleneck, Communication, Approval delay, Rework, Human dependency, Knowledge silo, Process variation).
- Opportunities must each name a concrete problem, its current cost, the people involved, a specific AI solution, expected business value, complexity (Low/Medium/High), a confidence score 0-100, a horizon (quick = 30 days, medium = 3-6 months, strategic = 1-3 years), and impact/effort scores 1-10 for a priority matrix. Classify each into exactly one of: Knowledge AI, Decision AI, Search AI, Documentation AI, Communication AI, Prediction AI, Workflow Automation, Agentic AI, Analytics, Monitoring, Copilot.
- Graph edges: identify dependencies between this department and other Cyrix departments mentioned or implied. Use ONLY these department ids: gov-ops, private-service, warehouse, procurement, revive-lab, calibration, academy, finance, hr, sales, marketing, quality, audit, regional-ops.
- Be honest in "unanswered": what a rigorous consultant would still need to verify.
- The goal is understanding first; AI recommendations must emerge from the evidence, not enthusiasm.
- "founderBrief" is the 60-second read for the founders: 3-5 plain sentences — where this department loses the most time or money, the single biggest knowledge risk, and what to deploy first and why. No preamble, no hedging, no consulting jargon. Write it so a founder who reads nothing else still makes the right first move.`
}

export const REPORT_SCHEMA = {
  type: 'object' as const,
  properties: {
    profile: {
      type: 'object' as const,
      properties: {
        mission: { type: 'string' as const },
        responsibilities: { type: 'array' as const, items: { type: 'string' as const } },
        criticalProcesses: { type: 'array' as const, items: { type: 'string' as const } },
        inputs: { type: 'array' as const, items: { type: 'string' as const } },
        outputs: { type: 'array' as const, items: { type: 'string' as const } },
        stakeholders: { type: 'array' as const, items: { type: 'string' as const } },
        systems: { type: 'array' as const, items: { type: 'string' as const } },
        kpis: { type: 'array' as const, items: { type: 'string' as const } },
        manualActivities: { type: 'array' as const, items: { type: 'string' as const } },
        knowledgeAssets: { type: 'array' as const, items: { type: 'string' as const } },
        decisionPoints: { type: 'array' as const, items: { type: 'string' as const } },
        approvalFlow: { type: 'array' as const, items: { type: 'string' as const } },
        improvementIdeas: { type: 'array' as const, items: { type: 'string' as const } },
      },
      required: ['mission', 'responsibilities', 'criticalProcesses', 'inputs', 'outputs', 'stakeholders', 'systems', 'kpis', 'manualActivities', 'knowledgeAssets', 'decisionPoints', 'approvalFlow', 'improvementIdeas'],
      additionalProperties: false,
    },
    report: {
      type: 'object' as const,
      properties: {
        executiveSummary: { type: 'string' as const },
        capabilityMap: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              area: { type: 'string' as const },
              strength: { type: 'string' as const, enum: ['strong', 'adequate', 'gap'] },
              note: { type: 'string' as const },
            },
            required: ['area', 'strength', 'note'],
            additionalProperties: false,
          },
        },
        workflow: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              step: { type: 'string' as const },
              detail: { type: 'string' as const },
              friction: { type: ['string', 'null'] as const },
            },
            required: ['step', 'detail', 'friction'],
            additionalProperties: false,
          },
        },
        painPoints: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              text: { type: 'string' as const },
              severity: { type: 'integer' as const, enum: [1, 2, 3] },
              category: { type: 'string' as const },
            },
            required: ['text', 'severity', 'category'],
            additionalProperties: false,
          },
        },
        knowledgeFlow: { type: 'string' as const },
        knowledgeRisks: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              text: { type: 'string' as const },
              severity: { type: 'string' as const, enum: ['low', 'medium', 'high'] },
            },
            required: ['text', 'severity'],
            additionalProperties: false,
          },
        },
        decisionFlow: { type: 'string' as const },
        estimatedImpact: { type: 'string' as const },
        unanswered: { type: 'array' as const, items: { type: 'string' as const } },
        founderBrief: { type: 'string' as const },
      },
      required: ['executiveSummary', 'capabilityMap', 'workflow', 'painPoints', 'knowledgeFlow', 'knowledgeRisks', 'decisionFlow', 'estimatedImpact', 'unanswered', 'founderBrief'],
      additionalProperties: false,
    },
    opportunities: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          title: { type: 'string' as const },
          type: {
            type: 'string' as const,
            enum: ['Knowledge AI', 'Decision AI', 'Search AI', 'Documentation AI', 'Communication AI', 'Prediction AI', 'Workflow Automation', 'Agentic AI', 'Analytics', 'Monitoring', 'Copilot'],
          },
          problem: { type: 'string' as const },
          currentCost: { type: 'string' as const },
          peopleInvolved: { type: 'string' as const },
          solution: { type: 'string' as const },
          businessValue: { type: 'string' as const },
          complexity: { type: 'string' as const, enum: ['Low', 'Medium', 'High'] },
          confidence: { type: 'integer' as const },
          horizon: { type: 'string' as const, enum: ['quick', 'medium', 'strategic'] },
          impact: { type: 'integer' as const },
          effort: { type: 'integer' as const },
        },
        required: ['title', 'type', 'problem', 'currentCost', 'peopleInvolved', 'solution', 'businessValue', 'complexity', 'confidence', 'horizon', 'impact', 'effort'],
        additionalProperties: false,
      },
    },
    edges: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          from: { type: 'string' as const },
          to: { type: 'string' as const },
          label: { type: 'string' as const },
        },
        required: ['from', 'to', 'label'],
        additionalProperties: false,
      },
    },
  },
  required: ['profile', 'report', 'opportunities', 'edges'],
  additionalProperties: false,
}

// Findings from earlier interviews passed into later ones (future memory)
export function priorFindingsFor(interviews: Record<string, Interview>, excludeDept: string): string[] {
  const out: string[] = []
  for (const iv of Object.values(interviews)) {
    if (iv.departmentId === excludeDept || iv.status !== 'complete' || !iv.report) continue
    for (const p of iv.report.painPoints.filter((p) => p.severity >= 2).slice(0, 3)) {
      out.push(`${iv.departmentId}: ${p.text} (${p.category})`)
    }
  }
  return out.slice(0, 12)
}
