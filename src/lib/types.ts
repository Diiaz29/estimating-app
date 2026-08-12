export type BidStatus = 'received' | 'working' | 'sent' | 'won' | 'lost'

export type Role = 'admin' | 'estimator' | 'pm' | 'viewer' | 'office'

export interface Profile {
  id: string
  email: string
  role: Role
  created_at: string
}

export type CustomerType = 'GC' | 'direct' | 'architect'

export interface Customer {
  id: string
  company: string
  type: CustomerType
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  created_at: string
}

export interface Contact {
  id: string
  customer_id: string
  name: string
  role: string | null
  phone: string | null
  email: string | null
}

export interface Bid {
  id: string
  job_number: string
  name: string
  status: BidStatus
  due_at: string | null
  address: string | null
  distance_miles: number | null
  labor_heads: number | null
  install_heads: number | null
  tax_exempt: boolean
  bid_value: number | null
  drawings_date: string | null
  adders: BidAdders
  inclusions: string | null
  exclusions: string | null
  notes: string | null
  lost_reason: string | null
  sent_at: string | null
  followup_days: number | null
  completed_at: string | null
  price_adjustment: number
  adjustment_note: string | null
  adjustment_visible: boolean
  created_at: string
  updated_at: string
}

export interface BidCustomer {
  bid_id: string
  customer_id: string
  won_through: boolean
  customer?: Customer
}

export interface Material {
  id: string
  category: string
  name: string
  unit: string
  cost: number | null
  supplier: string | null
  notes: string | null
  active: boolean
  cost_updated_at: string
  created_at: string
  updated_at: string
}

export interface Finish {
  id: string
  type: string
  name: string
  brand: string | null
  color_code: string | null
  grade: string | null
  unit: string
  cost: number | null
  supplier: string | null
  default_slot: string | null
  active: boolean
  cost_updated_at: string
}

export type PricingUnit = 'EA' | 'LF' | 'SF'

export interface Assembly {
  id: string
  category: string
  name: string
  description: string | null
  pricing_unit: PricingUnit
  build_minutes: number
  install_minutes: number
  typical_width_in: number | null
  width_confirmed: boolean
  active: boolean
  sort_order: number
}

export interface AssemblyMaterial {
  id: string
  assembly_id: string
  material_id: string | null
  slot: string | null
  label: string | null
  qty: number
  waste_pct: number
  material?: Material | null
}

export interface Area {
  id: string
  bid_id: string
  name: string
  sheet_ref: string | null
  multiplier: number
  is_alternate: boolean
  inclusions: string | null
  exclusions: string | null
  /** set when this area belongs to a change order; drafts stay is_alternate=true */
  change_order_id: string | null
  sort_order: number
}

export interface ChangeOrder {
  id: string
  bid_id: string
  co_number: number
  title: string
  description: string | null
  status: 'draft' | 'approved'
  amount: number | null
  prior_contract: number | null
  price_adjustment: number
  created_by: string | null
  approved_at: string | null
  created_at: string
}

export type LineKind = 'assembly' | 'manual' | 'sub'

export interface LineItem {
  id: string
  area_id: string
  kind: LineKind
  assembly_id: string | null
  name: string | null
  quantity: number
  entry_mode: 'unit' | 'feet'
  entry_value: number | null
  unit_price: number | null
  unit_cost: number | null
  rate_override: number | null
  note: string | null
  sort_order: number
}

export interface BidFinish {
  bid_id: string
  slot: string
  finish_id: string
  finish?: Finish
}

export interface BidAdders {
  install: boolean
  delivery: boolean
  design: boolean
  punch: boolean
  per_diem: boolean
  lodging: boolean
  general_conditions: boolean
  insurance: boolean
}

export interface Revision {
  id: string
  bid_id: string
  rev_number: number
  note: string | null
  contract_amount: number
  tax: number
  true_cost: number | null
  profit: number | null
  margin_pct: number | null
  created_by: string | null
  created_at: string
}

export interface BidMaterialOverride {
  bid_id: string
  from_material_id: string
  to_material_id: string
}

export interface AreaMaterialOverride {
  area_id: string
  from_material_id: string
  to_material_id: string
}

export interface OverheadItem {
  id: string
  name: string
  amount: number
  period: 'monthly' | 'yearly'
  sort_order: number
}

export type SettingFormat = 'number' | 'money' | 'percent' | 'factor' | 'days' | 'miles' | 'lf'

export interface Setting {
  key: string
  label: string
  group_name: string
  value: number
  format: SettingFormat
  sort_order: number
}
