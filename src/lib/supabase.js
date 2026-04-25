import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!URL || !ANON) {
  // eslint-disable-next-line no-console
  console.warn('Supabase env missing - VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Auth will not work.');
}

export const supabase = (URL && ANON) ? createClient(URL, ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
}) : null;
