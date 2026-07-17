export const KIDS_INITIAL = [];

export const AMAZON_GIFT_FALLBACK_URL = 'https://www.amazon.com/s?k=gifts+for+kids';

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

// For a merged "same age" entry (entry.sameAgeKidId set), resolves the two sides
// of the split view: the anchor kid (the entry's original subject) and the match
// kid (folded in later), each with their own photo and the date they were that age.
// The match photo is the one entry_media row tagged with sameAgeKidId; the anchor
// photo is whichever photo isn't — no need to retroactively tag old photos.
export function sameAgeSides(entry, kids) {
  if (!entry.sameAgeKidId) return null;
  const matchKid = kids.find(k => k.id === entry.sameAgeKidId);
  const anchorKid = kids.find(k => entry.kids.includes(k.id) && k.id !== entry.sameAgeKidId);
  if (!matchKid || !anchorKid) return null;
  const matchPhoto = entry.media.find(m => m.kidId === entry.sameAgeKidId) || null;
  const anchorPhoto = entry.media.find(m => m.kidId !== entry.sameAgeKidId) || entry.media[0] || null;
  return {
    anchor: { kid: anchorKid, photo: anchorPhoto, date: entry.date },
    match: { kid: matchKid, photo: matchPhoto, date: entry.sameAgeDate },
  };
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
