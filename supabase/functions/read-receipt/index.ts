// Reads a receipt photo/PDF with Claude and returns the date, total, merchant
// and last four of the card so the uploader only has to pick job + category.
// Runs on Supabase's servers: the Anthropic key lives in the function secrets
// (ANTHROPIC_API_KEY) and never reaches the browser.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// What we ask Claude for. additionalProperties:false + required on every key
// is what structured outputs needs.
const SCHEMA = {
  type: 'object',
  properties: {
    date: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Purchase date as YYYY-MM-DD, or null if not visible' },
    total: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'Grand total actually charged, in dollars, or null' },
    merchant: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Store or vendor name, short, or null' },
    card_last4: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Last four digits of the card used, or null if cash / not shown' },
  },
  required: ['date', 'total', 'merchant', 'card_last4'],
  additionalProperties: false,
} as const

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

function mediaTypeFor(path: string, blobType: string): string {
  if (blobType && blobType !== 'application/octet-stream') return blobType
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'png') return 'image/png'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Who is asking? Must be a signed-in team member.
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const {
    data: { user },
  } = await caller.auth.getUser()
  if (!user) return json(401, { error: 'Not signed in' })

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json(200, { ok: false, reason: 'Receipt reading is not set up yet (no ANTHROPIC_API_KEY secret).' })

  const { path } = await req.json().catch(() => ({}))
  if (typeof path !== 'string' || !path || path.includes('..')) {
    return json(400, { error: 'A receipt file path is required' })
  }

  // Only people who can file receipts get to spend API credit reading them.
  // (The file is read before the receipt row exists — the uploader reviews first.)
  const { data: profile } = await caller.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'estimator', 'pm', 'office'].includes(profile?.role ?? '')) {
    return json(403, { error: 'Your role cannot file receipts' })
  }

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: blob, error: dlErr } = await admin.storage.from('receipts').download(path)
  if (dlErr || !blob) return json(200, { ok: false, reason: dlErr?.message ?? 'Could not open the file' })

  const mediaType = mediaTypeFor(path, blob.type)
  const isPdf = mediaType === 'application/pdf'
  if (!isPdf && !IMAGE_TYPES.has(mediaType)) {
    return json(200, { ok: false, reason: `Can't read ${mediaType} files — use a JPG, PNG or PDF` })
  }
  const buf = await blob.arrayBuffer()
  if (buf.byteLength > 20 * 1024 * 1024) return json(200, { ok: false, reason: 'File is too big to read' })
  const data = toBase64(buf)

  const fileBlock = isPdf
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data } }
    : {
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data },
      }

  const client = new Anthropic({ apiKey })
  try {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1024,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system:
        'You read purchase receipts for a millwork shop\'s bookkeeping. Pull out the purchase date, the grand total that was actually charged (after tax, after any discounts — not a subtotal and not "amount tendered" for cash), the merchant name, and the last four digits of the card that was used. Use null for anything you cannot see clearly. Dates are US style (month/day/year) unless the receipt clearly says otherwise.',
      messages: [
        {
          role: 'user',
          content: [fileBlock, { type: 'text', text: 'Read this receipt.' }],
        },
      ],
    })

    if (response.stop_reason === 'refusal') return json(200, { ok: false, reason: 'Could not read this file' })
    const text = response.content.find((b) => b.type === 'text')?.text ?? ''
    const parsed = JSON.parse(text) as {
      date: string | null
      total: number | null
      merchant: string | null
      card_last4: string | null
    }
    // tidy: keep digits only for the card, sane date shape
    const last4 = parsed.card_last4 ? parsed.card_last4.replace(/\D/g, '').slice(-4) : null
    const date = parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null
    return json(200, {
      ok: true,
      date,
      total: typeof parsed.total === 'number' && isFinite(parsed.total) ? Math.round(parsed.total * 100) / 100 : null,
      merchant: parsed.merchant?.trim() || null,
      card_last4: last4 && last4.length === 4 ? last4 : null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json(200, { ok: false, reason: msg })
  }
})
