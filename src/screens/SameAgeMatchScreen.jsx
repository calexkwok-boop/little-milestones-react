import KidThumb from '../KidThumb.jsx';
import { exactAge, dateForAge } from '../constants.js';

function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return dt;
}

function monthDay(dt) {
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SameAgeMatchScreen({ sourceEntry, sourceKid, targetKid, onCancel, onConfirm }) {
  const age = exactAge(sourceKid.birthdate, sourceEntry.date);
  const targetDate = dateForAge(targetKid.birthdate, age);
  const ageLabel = age.years > 0
    ? `${age.years} year${age.years !== 1 ? 's' : ''}, ${age.months} month${age.months !== 1 ? 's' : ''}, ${age.days} day${age.days !== 1 ? 's' : ''} old`
    : age.months > 0
      ? `${age.months} month${age.months !== 1 ? 's' : ''}, ${age.days} day${age.days !== 1 ? 's' : ''} old`
      : `${age.days} day${age.days !== 1 ? 's' : ''} old`;
  const targetDateLabel = new Date(targetDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const rangeLabel = `${monthDay(addDays(targetDate, -14))} – ${monthDay(addDays(targetDate, 14))}, ${targetDate.slice(0, 4)}`;

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

            <button className="btn btn-gold" style={{ width: '100%', maxWidth: 320, marginTop: 18 }} onClick={() => onConfirm(targetDate)}>
              <i className="ti ti-photo" style={{ fontSize: 17 }} />
              Find a photo from then
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
