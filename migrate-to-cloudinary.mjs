// One-time migration: Supabase Storage → Cloudinary
// Run: SUPABASE_SERVICE_ROLE_KEY=your_key node migrate-to-cloudinary.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf-8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLOUD_NAME = env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = env.VITE_CLOUDINARY_UPLOAD_PRESET;

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY — run as:\n  SUPABASE_SERVICE_ROLE_KEY=xxx node migrate-to-cloudinary.mjs');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const STORAGE_MARKER = '/storage/v1/object/public/media/';

function isSupabaseUrl(url) {
  return url && url.includes(STORAGE_MARKER);
}

function storagePath(url) {
  return url.slice(url.indexOf(STORAGE_MARKER) + STORAGE_MARKER.length);
}

async function uploadToCloudinary(arrayBuffer, mimeType) {
  const resourceType = mimeType.startsWith('video/') ? 'video' : 'image';
  const fd = new FormData();
  fd.append('file', new Blob([arrayBuffer], { type: mimeType }));
  fd.append('upload_preset', UPLOAD_PRESET);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`,
    { method: 'POST', body: fd }
  );
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).secure_url;
}

async function migrate(url, mimeType) {
  const { data, error } = await supabase.storage.from('media').download(storagePath(url));
  if (error) throw new Error(error.message);
  return uploadToCloudinary(await data.arrayBuffer(), mimeType);
}

let migrated = 0, skipped = 0, failed = 0;

async function main() {
  // ── entry_media ──────────────────────────────────────────────────
  console.log('\n── entry_media ──');
  const { data: mediaRows, error: e1 } = await supabase.from('entry_media').select('id, url, type');
  if (e1) throw e1;

  for (const row of mediaRows) {
    if (!isSupabaseUrl(row.url)) { skipped++; continue; }
    try {
      const mime = row.type === 'video' ? 'video/mp4' : 'image/jpeg';
      const newUrl = await migrate(row.url, mime);
      await supabase.from('entry_media').update({ url: newUrl }).eq('id', row.id);
      console.log(`  ✓ ${row.id}`);
      migrated++;
    } catch (err) {
      console.error(`  ✗ ${row.id}: ${err.message}`);
      failed++;
    }
  }

  // ── kid avatars ───────────────────────────────────────────────────
  console.log('\n── kids ──');
  const { data: kids, error: e2 } = await supabase.from('kids').select('id, avatar_url');
  if (e2) throw e2;

  for (const kid of kids) {
    if (!isSupabaseUrl(kid.avatar_url)) { skipped++; continue; }
    try {
      const newUrl = await migrate(kid.avatar_url, 'image/jpeg');
      await supabase.from('kids').update({ avatar_url: newUrl }).eq('id', kid.id);
      console.log(`  ✓ ${kid.id}`);
      migrated++;
    } catch (err) {
      console.error(`  ✗ ${kid.id}: ${err.message}`);
      failed++;
    }
  }

  // ── family member avatars ─────────────────────────────────────────
  console.log('\n── family_members ──');
  const { data: members, error: e3 } = await supabase.from('family_members').select('id, avatar_url');
  if (e3) throw e3;

  for (const m of members) {
    if (!isSupabaseUrl(m.avatar_url)) { skipped++; continue; }
    try {
      const newUrl = await migrate(m.avatar_url, 'image/jpeg');
      await supabase.from('family_members').update({ avatar_url: newUrl }).eq('id', m.id);
      console.log(`  ✓ ${m.id}`);
      migrated++;
    } catch (err) {
      console.error(`  ✗ ${m.id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone — migrated: ${migrated}, skipped (already Cloudinary): ${skipped}, failed: ${failed}`);
}

main().catch(err => { console.error(err); process.exit(1); });
