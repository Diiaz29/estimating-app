export type BidStatus = 'received' | 'takeoff' | 'pricing' | 'sent' | 'won' | 'lost'

export type Role = 'admin' | 'estimator'

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
  inclusions: string | null
  exclusions: string | null
  notes: string | null
  lost_reason: string | null
  created_at: string
  updated_at: string
}

export interface BidCustomer {
  bid_id: string
  customer_id: string
  won_through: boolean
  customer?: Customer
}
