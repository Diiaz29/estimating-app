import { supabase } from './supabase'

/** Public URL of the company logo (a fixed path in the public branding bucket). */
export const LOGO_URL = supabase
  ? supabase.storage.from('branding').getPublicUrl('logo').data.publicUrl
  : ''
