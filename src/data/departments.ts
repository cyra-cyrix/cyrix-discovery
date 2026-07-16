import type { Department } from '../types'

export const DEPARTMENTS: Department[] = [
  {
    id: 'gov-ops',
    name: 'Government Operations',
    short: 'Gov Ops',
    blurb: 'Equipment maintenance contracts across government hospitals — tenders, SLAs, compliance reporting.',
    headRole: 'Head — Government Operations',
  },
  {
    id: 'private-service',
    name: 'Private Service',
    short: 'Private',
    blurb: 'Breakdown and preventive maintenance for private hospitals, labs and clinics.',
    headRole: 'Head — Private Service',
  },
  {
    id: 'warehouse',
    name: 'Warehouse',
    short: 'Warehouse',
    blurb: 'Spare parts stocking, kitting and dispatch to 1200 field engineers nationwide.',
    headRole: 'Warehouse Manager',
  },
  {
    id: 'procurement',
    name: 'Procurement',
    short: 'Procurement',
    blurb: 'Sourcing spares and equipment from OEMs, importers and grey-market channels.',
    headRole: 'Procurement Head',
  },
  {
    id: 'revive-lab',
    name: 'Revive Lab',
    short: 'Revive',
    blurb: 'Board-level repair and refurbishment of medical equipment written off by OEMs.',
    headRole: 'Lab Director',
  },
  {
    id: 'calibration',
    name: 'Calibration',
    short: 'Calibration',
    blurb: 'NABL-traceable calibration and certification of biomedical equipment.',
    headRole: 'Calibration Head',
  },
  {
    id: 'academy',
    name: 'Academy',
    short: 'Academy',
    blurb: 'Training biomedical engineers — internal upskilling and external certification programs.',
    headRole: 'Academy Director',
  },
  {
    id: 'finance',
    name: 'Finance',
    short: 'Finance',
    blurb: 'Billing, collections, AMC revenue recognition, statutory compliance.',
    headRole: 'Finance Controller',
  },
  {
    id: 'hr',
    name: 'HR',
    short: 'HR',
    blurb: 'Hiring, deployment and retention of a 1200-engineer distributed workforce.',
    headRole: 'HR Head',
  },
  {
    id: 'sales',
    name: 'Sales',
    short: 'Sales',
    blurb: 'AMC/CMC contract sales, equipment sales, key-account growth.',
    headRole: 'Sales Head',
  },
  {
    id: 'marketing',
    name: 'Marketing',
    short: 'Marketing',
    blurb: 'Brand, hospital outreach, tender intelligence and lead generation.',
    headRole: 'Marketing Head',
  },
  {
    id: 'quality',
    name: 'Quality',
    short: 'Quality',
    blurb: 'ISO 13485 processes, service quality audits, CAPA management.',
    headRole: 'Quality Head',
  },
  {
    id: 'audit',
    name: 'Audit',
    short: 'Audit',
    blurb: 'Internal audit of service records, inventory and contract compliance.',
    headRole: 'Chief Internal Auditor',
  },
  {
    id: 'regional-ops',
    name: 'Regional Operations',
    short: 'Regional',
    blurb: 'State/zone level coordination of field engineers, escalations and customer SLAs.',
    headRole: 'Regional Operations Head',
  },
]

export const deptById = (id: string): Department =>
  DEPARTMENTS.find((d) => d.id === id) ?? DEPARTMENTS[0]
