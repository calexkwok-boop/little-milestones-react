export const KIDS_INITIAL = [
  { id: 0, name: 'Emma', accent: '#F0897A', birthdate: '2020-03-14', avatar: null },
  { id: 1, name: 'Jack', accent: '#6FB582', birthdate: '2024-05-02', avatar: null },
];

export const MOODS = ['Proud', 'Joyful', 'Surprised', 'Exhausted', 'Grateful', 'Nostalgic'];

export const MILESTONE_TYPES = [
  { id: 'first_steps', label: 'First steps', icon: 'ti-walk' },
  { id: 'first_words', label: 'First words', icon: 'ti-message-circle' },
  { id: 'first_tooth', label: 'First tooth', icon: 'ti-emergency-bed' },
  { id: 'first_day_school', label: 'First day of school', icon: 'ti-school' },
  { id: 'recital', label: 'Recital / performance', icon: 'ti-piano' },
  { id: 'custom', label: 'Custom...', icon: 'ti-edit' },
];

export const PALETTES = [
  { bg: '#F6D9A0', tint: '#B8923D' },
  { bg: '#F3D2C7', tint: '#B05D40' },
  { bg: '#A8C49B', tint: '#3A5230' },
  { bg: '#A9C0D4', tint: '#3A5C7A' },
  { bg: '#E2C2D6', tint: '#7A3A5C' },
];

export const ENTRIES_INITIAL = [
  { id: 1, kid: 0, date: '2026-05-28', text: "Emma had her first piano recital today! She was so nervous backstage but the second she sat down she lit up — you could see her find the music. We took her for ice cream after to celebrate, and she talked the entire car ride about wanting to learn a harder piece next.", mood: 'Proud', milestone: 'recital', ageMonths: 74, palette: PALETTES[0], media: [] },
  { id: 2, kid: 1, date: '2026-05-26', text: "Jack took three steps all on his own before plopping down laughing. We all screamed loud enough the neighbors probably heard.", mood: 'Joyful', milestone: 'first_steps', ageMonths: 24, palette: PALETTES[2], media: [] },
  { id: 3, kid: 0, date: '2026-05-20', text: "Lost her first tooth at school and was SO proud to show everyone the gap. She wouldn't stop smiling at dinner.", mood: 'Proud', milestone: 'first_tooth', ageMonths: 73, palette: PALETTES[0], media: [] },
  { id: 4, kid: 1, date: '2026-05-15', text: "Said 'mama' clearly for the first time while reaching for me. I cried a little, not gonna lie.", mood: 'Joyful', milestone: 'first_words', ageMonths: 23, palette: PALETTES[3], media: [] },
  { id: 5, kid: 0, date: '2026-05-10', text: "Rough morning, she didn't want to go to school and we had a meltdown. Felt like a tough parenting day, but we got through it. By bedtime she was back to her usual self, telling me a long made-up story about a dragon who was scared of the dark.", mood: 'Exhausted', milestone: null, ageMonths: 73, palette: PALETTES[1], media: [] },
  { id: 6, kid: 0, date: '2018-09-02', text: "Emma's first day of preschool! She marched right in without looking back, which somehow made me cry more than if she'd cried.", mood: 'Nostalgic', milestone: 'first_day_school', ageMonths: 24, palette: PALETTES[3], media: [] },
  { id: 7, kid: 1, date: '2026-04-30', text: "Jack discovered he can stack two blocks today and was so pleased with himself he clapped for his own hands.", mood: 'Joyful', milestone: null, ageMonths: 23, palette: PALETTES[2], media: [] },
  { id: 8, kid: 0, date: '2026-04-12', text: "We went to the zoo as a family. Emma's favorite was the otters — she narrated their whole day like a nature documentary.", mood: 'Joyful', milestone: null, ageMonths: 73, palette: PALETTES[4], media: [] },
];

export const TODAY = '2026-06-17';

export function ageLabel(months) {
  const y = Math.floor(months / 12), m = months % 12;
  if (y === 0) return m + ' mo';
  if (m === 0) return y + ' yr';
  return y + 'y ' + m + 'm';
}

export function milestoneInfo(id) {
  return MILESTONE_TYPES.find(m => m.id === id);
}

export function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return `${parseInt(v.substring(0, 2), 16)},${parseInt(v.substring(2, 4), 16)},${parseInt(v.substring(4, 6), 16)}`;
}

export function entryBgStyle(entry) {
  if (entry.media && entry.media.length > 0) {
    return { backgroundImage: `url('${entry.media[0].url}')`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  return { background: entry.palette.bg };
}

export function tintedScrimStyle(entry, opacity) {
  const t = entry.media && entry.media.length > 0 ? '40,35,28' : hexToRgb(entry.palette.tint);
  return { background: `linear-gradient(180deg, rgba(${t},0) 38%, rgba(${t},${opacity}) 100%)` };
}
