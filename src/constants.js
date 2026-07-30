export const KIDS_INITIAL = [];

export const AMAZON_GIFT_FALLBACK_URL = 'https://www.amazon.com/s?k=gifts+for+kids';

export const KID_ACCENTS = ['#D4856A', '#7BA99A', '#6A9EB0', '#C8993E', '#A889B0'];

export const PROMPT_ACCENT = '#C8993E';

const PROD_APP_URL = 'https://app.patinafamily.com';

// Auth email links (magic link, password reset) need an absolute redirect —
// localhost obviously can't be that target, so dev/preview always redirects
// through the production app instead of wherever this happened to be running.
export function getAuthRedirectUrl() {
  if (typeof window === 'undefined') return PROD_APP_URL;
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return PROD_APP_URL;
  }
  return window.location.origin;
}

// Two shared avatar transform presets, reused everywhere a kid/friend/member avatar
// renders — before this, near-identical avatar circles across the app each requested
// their own slightly different width (w_36, w_40, w_44, w_48...), so the same photo
// never shared a cached derived asset between screens. Collapsing onto one small and
// one large size means those views can actually hit the same cache entry.
export const AVATAR_TRANSFORM_SM = 'w_100,h_100,c_fill,q_auto,f_auto'; // up to ~90px on screen
export const AVATAR_TRANSFORM_LG = 'w_200,h_200,c_fill,q_auto,f_auto'; // ~100-150px on screen

// Applied to every <video> playback source app-wide — without it, every video
// element streamed the raw uploaded file untouched (often 4K phone footage
// at high bitrate), regardless of how small the player actually renders.
// It's a max, not a forced downscale, thanks to `c_limit` — a bare `w_960`
// (Cloudinary's default crop mode scales to exactly that width) would
// *upscale* a smaller video instead of leaving it alone, producing a
// bigger, slower-loading file than the original for the most common case.
// 960 (not the previous 1920) is sized to this app's actual layout: the
// whole UI is a fixed-width card capped at 420px CSS width everywhere
// (index.html, `#root { max-width: 420px }`) — on phone, tablet, or
// desktop alike, since it's a fixed card, not a responsive layout that
// grows — so 960 already covers ~2.3x retina density with room to spare;
// the video player never actually renders wider than that regardless of
// the viewing device. Most landscape phone footage (1920+ wide) gets
// meaningfully downscaled here, which is the point; portrait clips (often
// ~1080 wide) take a modest, visually negligible step down too.
export const VIDEO_DELIVERY_TRANSFORM = 'w_960,c_limit,q_auto,f_auto';

// Patina Jar: one fixed question per calendar month, repeating every year —
// this March always asks the same thing as last March, so answers can be
// compared across years. 1-indexed (index 0 unused) to match Date's
// getMonth()+1 / month_index in patina_jar_entries directly, no off-by-one.
export const PATINA_JAR_QUESTIONS = [
  null,
  "What's your favorite color right now?",
  "What's something that makes you laugh?",
  "What's your favorite food right now?",
  "What's your favorite thing to do?",
  "What's something you're really good at?",
  "What do you want to be when you grow up?",
  "Who's your best friend right now?",
  "What's your favorite song right now?",
  "What's something new you learned?",
  "What's your biggest wish right now?",
  "What's something you're grateful for?",
  "What was your favorite memory this year?",
];
export const PATINA_JAR_RECORD_MAX_MS = 2 * 60 * 1000;

export const MOODS = ['Proud', 'Joyful', 'Surprised', 'Exhausted', 'Grateful', 'Nostalgic'];

export const MILESTONE_TYPES = [
  { id: 'first_steps', label: 'First steps', icon: 'ti-walk' },
  { id: 'first_words', label: 'First words', icon: 'ti-message-circle' },
  { id: 'first_day_school', label: 'First day of school', icon: 'ti-school' },
  { id: 'recital', label: 'Recital / performance', icon: 'ti-piano' },
];

export const PALETTES = [
  { bg: '#F6D9A0', tint: '#B8923D' },
  { bg: '#F3D2C7', tint: '#B05D40' },
  { bg: '#A8C49B', tint: '#3A5230' },
  { bg: '#A9C0D4', tint: '#3A5C7A' },
  { bg: '#E2C2D6', tint: '#7A3A5C' },
];

export const ENTRIES_INITIAL = [];

const _now = new Date();
export const TODAY = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;

function localDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function ageLabel(months) {
  const y = Math.floor(months / 12), m = months % 12;
  if (y === 0) return m + ' mo';
  if (m === 0) return y + ' yr';
  return y + 'y ' + m + 'm';
}

export function exactAge(birthdate, entryDate) {
  const b = localDate(birthdate);
  const e = localDate(entryDate);
  let years = e.getFullYear() - b.getFullYear();
  let months = e.getMonth() - b.getMonth();
  let days = e.getDate() - b.getDate();
  if (days < 0) {
    months--;
    days += new Date(e.getFullYear(), e.getMonth(), 0).getDate();
  }
  if (months < 0) { years--; months += 12; }
  return { years, months, days };
}

export function exactAgeLabel(birthdate, entryDate) {
  const { years, months, days } = exactAge(birthdate, entryDate);
  if (years === 0 && months === 0) return days + 'd';
  if (years === 0) return months + 'm ' + days + 'd';
  if (days === 0 && months === 0) return years + 'y';
  if (days === 0) return years + 'y ' + months + 'm';
  return years + 'y ' + months + 'm ' + days + 'd';
}

// Inverse of exactAge — given a birthdate and an { years, months, days } age,
// returns the calendar date (YYYY-MM-DD) that kid was that exact age.
export function dateForAge(birthdate, { years, months, days }) {
  const b = localDate(birthdate);
  const d = new Date(b.getFullYear() + years, b.getMonth() + months, b.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// For a merged "same age" entry (entry.sameAgeDates set), resolves one side per
// tagged kid — the anchor kid (the entry's original subject, no key in sameAgeDates,
// uses the entry's own date) plus every kid folded in later (their date comes from
// sameAgeDates, their photo is the one entry_media row tagged with their kid id).
// Returns null when the entry isn't a same-age pairing at all. Supports any number
// of kids — 2 is the common case, but nothing here assumes exactly 2.
export function sameAgeSides(entry, kids) {
  if (!entry.sameAgeDates || Object.keys(entry.sameAgeDates).length === 0) return null;
  return entry.kids
    .map(id => kids.find(k => k.id === id))
    .filter(Boolean)
    .map(kid => {
      const isMatched = kid.id in entry.sameAgeDates;
      const date = isMatched ? entry.sameAgeDates[kid.id] : entry.date;
      const photo = isMatched
        ? entry.media.find(m => m.kidId === kid.id) || null
        : entry.media.find(m => !m.kidId) || entry.media[0] || null;
      return { kid, photo, date };
    });
}

// Spread across a same-age group's dates, in days — 0 for an exact match, otherwise
// how far apart the furthest two kids' ages were when their photos were taken.
export function sameAgeDaysApart(sides) {
  const ageDays = s => (new Date(s.date + 'T12:00:00') - new Date(s.kid.birthdate + 'T12:00:00')) / 86400000;
  const days = sides.map(ageDays);
  return Math.round(Math.max(...days) - Math.min(...days));
}

export function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7) return new Date(ts).toLocaleDateString('en-US', { weekday: 'short' });
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function daysUntilBirthday(birthdate) {
  const [, bm, bd] = birthdate.split('-').map(Number);
  const [ty, tm, td] = TODAY.split('-').map(Number);
  const today = new Date(ty, tm - 1, td);
  let next = new Date(ty, bm - 1, bd);
  if (next < today) next = new Date(ty + 1, bm - 1, bd);
  return Math.round((next - today) / 86400000);
}

export function milestoneInfo(id) {
  if (!id) return null;
  if (id.startsWith('custom:')) return { id: 'custom', label: id.slice(7), icon: 'ti-star-filled' };
  return MILESTONE_TYPES.find(m => m.id === id) ?? null;
}

export function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return `${parseInt(v.substring(0, 2), 16)},${parseInt(v.substring(2, 4), 16)},${parseInt(v.substring(4, 6), 16)}`;
}

export function cloudinaryTransform(url, transforms) {
  if (!url || !url.includes('res.cloudinary.com')) return url;
  return url.replace('/upload/', `/upload/${transforms}/`);
}

// Cloudinary can render a still frame from a video as a plain jpg — used anywhere
// a video needs to stand in as a static image (feed thumbnails, and the printed
// book, which can't play video at all).
export function videoThumbUrl(videoUrl, transforms = 'so_0,q_auto,f_auto') {
  if (!videoUrl || !videoUrl.startsWith('http')) return null;
  if (videoUrl.includes('res.cloudinary.com')) {
    return videoUrl
      .replace('/video/upload/', `/video/upload/${transforms}/`)
      .replace(/\.[^/.]+$/, '.jpg');
  }
  try {
    const u = new URL(videoUrl);
    return u.origin + u.pathname.replace(/\.[^/.]+$/, '-thumb.jpg') + u.search;
  } catch { return null; }
}

// Crop position is stored per-photo (entry_media.crop_y) going forward, not
// per-entry — only photo #1 falls back to the legacy entry-level value
// (entries.crop_y), which is all that old data ever had. Every other photo
// defaults to center rather than inheriting photo #1's framing.
export function photoCropY(media, index, entry) {
  return media?.[index]?.cropY ?? (index === 0 ? entry?.cropY : null) ?? 50;
}

export function entryBgStyle(entry) {
  if (entry.media && entry.media.length > 0) {
    const m = entry.media[0];
    const cropY = photoCropY(entry.media, 0, entry);
    if (!m.url?.startsWith('http')) return { background: entry.palette.bg };
    if (m.type === 'video') {
      if (!m.url.includes('res.cloudinary.com')) return { background: entry.palette.bg };
      const thumbUrl = m.url
        .replace('/video/upload/', '/video/upload/so_0,w_800,e_sharpen:60,q_auto,f_auto/')
        .replace(/\.[^/.]+$/, '.jpg');
      return { backgroundImage: `url('${thumbUrl}')`, backgroundSize: 'cover', backgroundPosition: `center ${cropY}%` };
    }
    const url = cloudinaryTransform(m.url, 'w_800,e_sharpen:60,q_auto,f_auto');
    return { backgroundImage: `url('${url}')`, backgroundSize: 'cover', backgroundPosition: `center ${cropY}%` };
  }
  return { background: entry.palette.bg };
}

export function tintedScrimStyle(entry, opacity) {
  const t = entry.media && entry.media.length > 0 ? '40,35,28' : hexToRgb(entry.palette.tint);
  return { background: `linear-gradient(180deg, rgba(${t},0) 38%, rgba(${t},${opacity}) 100%)` };
}
