import { supabase } from './supabase.js';

// Fire-and-forget push notification to another user — mirrors how notify-partner
// is invoked (never awaited by the caller, never blocks the UI on failure).
export default function triggerPush(body) {
  if (!supabase) return;
  supabase.functions.invoke('send-push', { body }).then(({ data, error }) => {
    if (error || data?.errors) console.error('send-push failed:', error || data?.errors);
  }).catch(err => console.error('send-push request failed:', err));
}
