// src/lib/supabaseClient.js
//
// Initializes the Supabase client using environment variables.
// In Vite, env vars must be prefixed with VITE_ to be available
// in the browser bundle (see .env.example).

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[supabaseClient] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.\n' +
    'Copy .env.example to .env.local and fill in your Supabase project values.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
