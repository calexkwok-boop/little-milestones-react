export const KIDS_INITIAL = [];

export const AMAZON_GIFT_FALLBACK_URL = 'https://www.amazon.com/s?k=gifts+for+kids';

// Two shared avatar transform presets, reused everywhere a kid/friend/member avatar
// renders — before this, near-identical avatar circles across the app each requested
// their own slightly different width (w_36, w_40, w_44, w_48...), so the same photo
// never shared a cached derived asset between screens. Collapsing onto one small and
// one large size means those views can actually hit the same cache entry.
export const AVATAR_TRANSFORM_SM = 'w_100,h_100,c_fill,q_auto,f_auto'; // up to ~90px on screen
export const AVATAR_TRANSFORM_LG = 'w_200,h_200,c_fill,q_auto,f_auto'; // ~100-150px on screen

// Applied to every <video> playback source app-wide — without it, every video
// element streamed the raw uploaded file untouched (often 1080p/4K phone
// footage at high bitrate), regardless of how small the player actually
// renders. 1080p is already more resolution than any in-app video view
// (feed cards, entry viewer, reels) ever needs; motion also masks a modest
// quality/resolution trim far more than a static photo would.
export const VIDEO_DELIVERY_TRANSFORM = 'w_1080,q_auto,f_auto';

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

export function milestoneInfo(id) {
  if (!id) return null;
  if (id.startsWith('custom:')) return { id: 'custom', label: id.slice(7), icon: 'ti-star' };
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

export function entryBgStyle(entry) {
  if (entry.media && entry.media.length > 0) {
    const m = entry.media[0];
    if (!m.url?.startsWith('http')) return { background: entry.palette.bg };
    if (m.type === 'video') {
      if (!m.url.includes('res.cloudinary.com')) return { background: entry.palette.bg };
      const thumbUrl = m.url
        .replace('/video/upload/', '/video/upload/so_0,w_800,e_sharpen:60,q_auto,f_auto/')
        .replace(/\.[^/.]+$/, '.jpg');
      return { backgroundImage: `url('${thumbUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center' };
    }
    const url = cloudinaryTransform(m.url, 'w_800,e_sharpen:60,q_auto,f_auto');
    return { backgroundImage: `url('${url}')`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  return { background: entry.palette.bg };
}

export function tintedScrimStyle(entry, opacity) {
  const t = entry.media && entry.media.length > 0 ? '40,35,28' : hexToRgb(entry.palette.tint);
  return { background: `linear-gradient(180deg, rgba(${t},0) 38%, rgba(${t},${opacity}) 100%)` };
}
