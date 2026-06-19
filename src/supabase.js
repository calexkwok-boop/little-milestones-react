import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
console.log('[patina] VITE_SUPABASE_URL:', supabaseUrl ? supabaseUrl.slice(0, 30) + '…' : 'MISSING');
console.log('[patina] VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✓ set' : 'MISSING');

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
