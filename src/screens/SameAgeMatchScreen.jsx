import { useRef, useState } from 'react';
import { Icon } from '../icons';
import KidThumb from '../KidThumb.jsx';
import CroppedImg from '../CroppedImg.jsx';
import { exactAge, dateForAge, cloudinaryTransform, videoThumbUrl, photoCropY, PHOTO_XS, TODAY } from '../constants.js';

let _exifr = null;
const loadExifr = () => _exifr ?? (_exifr = import('exifr').then(m => m.default));

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hexToRgba(hex, alpha) {
  const clean = (hex || '').replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

export default function SameAgeMatchScreen({ sourceEntry, sourceKid, targetKid, stepLabel, onCancel, onConfirm }) {
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
  const monthYearLabel = new Date(targetDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  // Callers pre-filter for this (see App.jsx's sameAgeEligibleOthers/
  // sameAgeMatchBanner), but the draft-compose entry point doesn't filter
  // at all -- guard here too rather than asking for a photo of a moment
  // that hasn't happened yet ("find something from next month").
  const isFuture = targetDate > TODAY;
  const sourceAccent = sourceKid.accent || '#4A5E50';
  const targetAccent = targetKid.accent || '#4A5E50';
  // Show the actual photo/video being compared against, not just the source
  // kid's generic profile picture — that's the specific moment this screen
  // is trying to help match, so it's the more useful thing to see here.
  // Fetched width-only (not server-side squared) so CroppedImg can crop to
  // the photo's own saved focal point instead of Cloudinary's default center.
  const sourceMedia = sourceEntry.media?.[0];
  const sourceThumbUrl = sourceMedia
    ? (sourceMedia.type === 'video'
      ? videoThumbUrl(sourceMedia.url, `so_0,${PHOTO_XS}`)
      : cloudinaryTransform(sourceMedia.url, PHOTO_XS))
    : null;
  const sourceCropY = sourceMedia ? photoCropY(sourceEntry.media, 0, sourceEntry) : 50;

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
            <button className="icon-btn" onClick={onCancel}><Icon name="ti-arrow-left" /></button>
            <div style={{ margin: '0 auto', textAlign: 'center' }}>
              <div style={{ width: 28, height: 1, background: 'rgba(200,153,62,0.4)', margin: '0 auto 5px' }} />
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, color: 'var(--accent)', margin: 0, fontWeight: 700 }}>Same age as {sourceKid.name.split(' ')[0]}</h2>
              {stepLabel && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0', fontWeight: 600 }}>Kid {stepLabel}</p>}
            </div>
            <div style={{ width: 36 }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '8px 0 4px' }}>

            <div style={{
              width: '100%', borderRadius: 18, padding: '24px 20px',
              background: `linear-gradient(160deg, ${hexToRgba(sourceAccent, 0.16)} 0%, ${hexToRgba(targetAccent, 0.16)} 100%)`,
              border: `1px solid ${hexToRgba(targetAccent, 0.25)}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 20 }}>
                <div style={{ boxShadow: `0 0 0 3px ${sourceAccent}`, borderRadius: '50%' }}>
                  {sourceThumbUrl
                    ? <div style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden' }}><CroppedImg src={sourceThumbUrl} cropY={sourceCropY} /></div>
                    : <KidThumb kid={sourceKid} size={64} />}
                </div>
                <Icon name="ti-arrows-diff" style={{ fontSize: 18, color: '#C8993E' }} />
                <div style={{ boxShadow: `0 0 0 3px ${targetAccent}`, borderRadius: '50%' }}>
                  <KidThumb kid={targetKid} size={64} />
                </div>
              </div>
              <p style={{ fontSize: 16, color: 'var(--text)', margin: 0, lineHeight: 1.55, maxWidth: '28ch', marginLeft: 'auto', marginRight: 'auto' }}>
                {targetKid.name.split(' ')[0]} {isFuture ? 'will be' : 'was'} <strong style={{ color: 'var(--accent)' }}>{ageLabel}</strong> on <strong style={{ color: 'var(--accent)' }}>{targetDateLabel}</strong>
              </p>
            </div>

            {isFuture ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '18px 0 0', maxWidth: 300, lineHeight: 1.5 }}>
                {targetKid.name.split(' ')[0]} hasn't reached that age yet — check back after {targetDateLabel}.
              </p>
            ) : (
              <>
                <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={handleFileChange} />
                <button className="btn btn-primary" style={{ width: '100%', maxWidth: 320, marginTop: 18, opacity: picking ? 0.7 : 1 }} disabled={picking} onClick={() => fileInputRef.current?.click()}>
                  <Icon name="ti-photo" style={{ fontSize: 17 }} />
                  {picking ? 'One moment…' : `Find something from ${monthYearLabel}`}
                </button>
              </>
            )}
            <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, marginTop: 10, padding: 8, fontFamily: "'Urbanist', sans-serif" }}>
              Never mind
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
