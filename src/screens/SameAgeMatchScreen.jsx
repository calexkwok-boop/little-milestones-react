import { useRef, useState } from 'react';
import KidThumb from '../KidThumb.jsx';
import { exactAge, dateForAge } from '../constants.js';

let _exifr = null;
const loadExifr = () => _exifr ?? (_exifr = import('exifr').then(m => m.default));

function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return dt;
}

function monthDay(dt) {
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Prefers the photo's own EXIF capture date over the computed target — same
// honesty principle as showing "19 days apart" instead of assuming an exact match.
async function extractExifDate(file) {
  if (!file.type.startsWith('image')) return null;
  try {
    const exifr = await loadExifr();
    const tags = await exifr.parse(file, ['DateTimeOriginal']);
    if (tags?.DateTimeOriginal) return toISODate(new Date(tags.DateTimeOriginal));
  } catch {}
  return null;
}

export default function SameAgeMatchScreen({ sourceEntry, sourceKid, targetKid, onCancel, onConfirm }) {
  const [picking, setPicking] = useState(false);
  const fileInputRef = useRef(null);
  const age = exactAge(sourceKid.birthdate, sourceEntry.date);
  const targetDate = dateForAge(targetKid.birthdate, age);
  const ageLabel = age.years > 0
    ? `${age.years} year${age.years !== 1 ? 's' : ''}, ${age.months} month${age.months !== 1 ? 's' : ''}, ${age.days} day${age.days !== 1 ? 's' : ''} old`
    : age.months > 0
      ? `${age.months} month${age.months !== 1 ? 's' : ''}, ${age.days} day${age.days !== 1 ? 's' : ''} old`
      : `${age.days} day${age.days !== 1 ? 's' : ''} old`;
  const targetDateLabel = new Date(targetDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const rangeLabel = `${monthDay(addDays(targetDate, -14))} – ${monthDay(addDays(targetDate, 14))}, ${targetDate.slice(0, 4)}`;

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPicking(true);
    const photoDate = (await extractExifDate(file)) ?? targetDate;
    setPicking(false);
    onConfirm(photoDate, file);
  }

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button className="icon-btn" onClick={onCancel}><i className="ti ti-arrow-left" /></button>
            <h2 style={{ fontSize: 16, color: 'var(--accent)', margin: '0 auto', fontWeight: 700, fontFamily: "'Urbanist', sans-serif" }}>Same age as {sourceKid.name.split(' ')[0]}</h2>
            <div style={{ width: 36 }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '20px 8px 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <KidThumb kid={sourceKid} size={48} />
              <i className="ti ti-arrow-right" style={{ fontSize: 20, color: '#C8993E' }} />
              <KidThumb kid={targetKid} size={48} />
            </div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
              {targetKid.name.split(' ')[0]} was this old on
            </p>
            <p style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontWeight: 700, fontSize: 28, color: '#C8993E', margin: '6px 0 4px' }}>
              {targetDateLabel}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 16px', maxWidth: '26ch' }}>
              {ageLabel} — same as {sourceKid.name.split(' ')[0]} in this post.
            </p>
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text)', textAlign: 'center', width: '100%', maxWidth: 320 }}>
              📍 Look for photos from {rangeLabel}
            </div>

            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
            <button className="btn btn-gold" style={{ width: '100%', maxWidth: 320, marginTop: 18, opacity: picking ? 0.7 : 1 }} disabled={picking} onClick={() => fileInputRef.current?.click()}>
              <i className="ti ti-photo" style={{ fontSize: 17 }} />
              {picking ? 'One moment…' : 'Find a photo from then'}
            </button>
            <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, marginTop: 10, padding: 8, fontFamily: "'Urbanist', sans-serif" }}>
              Never mind
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
