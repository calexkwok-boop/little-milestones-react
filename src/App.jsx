import { useState, useRef, useEffect } from 'react';
import './App.css';
import exifr from 'exifr';
import { supabase, supabaseConfigured } from './supabase.js';
import {
  KIDS_INITIAL, ENTRIES_INITIAL,
  MOODS, MILESTONE_TYPES, PALETTES, TODAY,
  ageLabel, exactAge, exactAgeLabel, milestoneInfo, entryBgStyle, tintedScrimStyle,
} from './constants.js';

const KID_ACCENTS = ['#D4856A', '#7BA99A', '#6A9EB0', '#C8993E', '#A889B0'];
const LOCAL_STORAGE_KEY = 'patina-local-data';
const PROD_APP_URL = 'https://little-milestones-react.vercel.app';

function getAuthRedirectUrl() {
  if (typeof window === 'undefined') return PROD_APP_URL;
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return PROD_APP_URL;
  }
  return window.location.origin;
}

function loadLocalData() {
  if (typeof window === 'undefined') {
    return { kids: KIDS_INITIAL, entries: ENTRIES_INITIAL };
  }
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return { kids: KIDS_INITIAL, entries: ENTRIES_INITIAL };
    const parsed = JSON.parse(raw);
    return {
      kids: Array.isArray(parsed.kids) ? parsed.kids : KIDS_INITIAL,
      entries: Array.isArray(parsed.entries) ? parsed.entries : ENTRIES_INITIAL,
    };
  } catch {
    return { kids: KIDS_INITIAL, entries: ENTRIES_INITIAL };
  }
}

// ─── Shared bits ─────────────────────────────────────────────────────────

function KidThumb({ kid, size = 24 }) {
  if (kid.avatar) {
    return (
      <span className="thumb" style={{ width: size, height: size }}>
        <img src={kid.avatar} alt={kid.name} onError={e => { e.currentTarget.style.display = 'none'; }} />
      </span>
    );
  }
  return (
    <span
      className="thumb"
      style={{ width: size, height: size, background: kid.accent, color: '#fff', fontSize: Math.round(size * 0.42) }}
    >
      {kid.name[0]}
    </span>
  );
}

function AvatarImg({ src, alt, fallback }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [src]);
  if (!src || broken) return fallback;
  return <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setBroken(true)} />;
}

function KidChip({ kid, active, onClick, icon, label }) {
  return (
    <div
      className={`kid-chip ${active ? 'active' : ''}`}
      style={active ? { background: kid ? kid.accent : '#4A5E50' } : {}}
      onClick={onClick}
    >
      {kid ? <KidThumb kid={kid} /> : <span className="thumb"><i className={`ti ${icon}`} style={{ fontSize: 11 }} /></span>}
      {label ?? kid?.name}
    </div>
  );
}

function KidSelector({ kids, selected, onSelect, onManage }) {
  return (
    <div className="scrollx">
      <KidChip active={selected === null} onClick={() => onSelect(null)} icon="ti-users" label={kids.length > 2 ? 'All' : 'Both'} />
      {kids.map(k => (
        <KidChip key={k.id} kid={k} active={selected === k.id} onClick={() => onSelect(k.id)} />
      ))}
      <KidChip icon="ti-home-heart" label="Family" onClick={onManage} />
    </div>
  );
}

// ─── Home screen components ──────────────────────────────────────────────────

function buildSalutation(entry, allKids) {
  const names = (entry.kids ?? [entry.kid])
    .map(id => allKids.find(k => k.id === id)?.name.split(' ')[0])
    .filter(Boolean);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

// ─── Crop modal ──────────────────────────────────────────────────────────────

function CropModal({ url, cropY, cardHeight, onSave, onClose }) {
  const scrollRef = useRef(null);
  const imgRef = useRef(null);

  function scrollToCropY(y) {
    const img = imgRef.current;
    const container = scrollRef.current;
    if (!img || !container) return;
    const scale = container.offsetWidth / img.naturalWidth;
    const scaledH = img.naturalHeight * scale;
    const extra = scaledH - cardHeight;
    if (extra > 0) container.scrollTop = (y / 100) * extra;
  }

  function handleLoad() {
    scrollToCropY(cropY);
  }

  function handleSave() {
    const img = imgRef.current;
    const container = scrollRef.current;
    if (!img || !container) return onSave(cropY);
    const scale = container.offsetWidth / img.naturalWidth;
    const scaledH = img.naturalHeight * scale;
    const extra = scaledH - cardHeight;
    const newY = extra > 0 ? Math.round((container.scrollTop / extra) * 100) : 50;
    onSave(Math.min(100, Math.max(0, newY)));
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <p style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', fontSize: 13, margin: '0 0 14px', fontFamily: 'Inter, sans-serif' }}>
        Scroll to reposition
      </p>
      <div
        ref={scrollRef}
        style={{ height: cardHeight, overflowY: 'scroll', WebkitOverflowScrolling: 'touch', margin: '0 0' }}
      >
        <img ref={imgRef} src={url} style={{ width: '100%', display: 'block' }} onLoad={handleLoad} alt="" />
      </div>
      <div style={{ display: 'flex', gap: 12, padding: '20px 24px 44px' }}>
        <button onClick={onClose} style={{ flex: 1, padding: '13px', border: '1px solid rgba(255,255,255,0.25)', background: 'none', color: '#fff', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
          Cancel
        </button>
        <button onClick={handleSave} style={{ flex: 1, padding: '13px', background: '#4A5E50', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
          Done
        </button>
      </div>
    </div>
  );
}

function LetterCard({ entry, kid, allKids, featured, onClick, cropY = 50, onCropEdit }) {
  const cardH = featured ? 200 : 150;
  const preview = entry.text.length > (featured ? 160 : 110)
    ? entry.text.slice(0, featured ? 160 : 110) + '…'
    : entry.text;
  const dateLabel = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div onClick={onClick} style={{ background: '#F8FAF6', border: '1px solid #C4D8C0', borderRadius: 16, overflow: 'hidden', cursor: 'pointer' }}>
      {entry.media && entry.media.length > 0 && (
        <div
          onClick={e => { e.stopPropagation(); onCropEdit && onCropEdit(entry.id, cardH); }}
          style={{ position: 'relative', height: cardH, overflow: 'hidden', cursor: onCropEdit ? 'move' : 'pointer' }}
        >
          <img src={entry.media[0].url} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `center ${cropY}%`, display: 'block' }} alt="" />
        </div>
      )}
      <div style={{ padding: '16px 18px 14px' }}>
        <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 12, color: '#9AA89C', margin: '0 0 7px' }}>
          Dear {allKids ? buildSalutation(entry, allKids) : kid.name},
        </p>
        {preview && (
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: featured ? 16 : 14, color: '#2C3828', margin: '0 0 8px', lineHeight: 1.65 }}>
            {preview}
          </p>
        )}
        {entry.signedAs && (
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 12, color: '#9AA89C', margin: '0 0 10px' }}>
            — {entry.signedAs}
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(allKids ? entry.kids.map(id => allKids.find(k => k.id === id)).filter(Boolean) : [kid]).map(k => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <KidThumb kid={k} size={18} />
              <span style={{ fontSize: 11, color: '#9AA89C' }}>
                {exactAgeLabel(k.birthdate, entry.date)} · {dateLabel}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OnThisDayCard({ entry, kid, allKids, yearsAgo, onClick, cropY = 50, onCropEdit }) {
  const cardH = 250;
  const preview = entry.text.length > 200 ? entry.text.slice(0, 200) + '…' : entry.text;
  const yearLabel = yearsAgo === 1 ? 'One year ago today' : `${yearsAgo} years ago today`;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1, height: 1, background: '#CCDAC8' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: '#9AA89C', letterSpacing: 0.8, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{yearLabel}</span>
        <div style={{ flex: 1, height: 1, background: '#CCDAC8' }} />
      </div>
      <div onClick={onClick} style={{ background: '#F8FAF6', border: '1px solid #C4D8C0', borderRadius: 16, overflow: 'hidden', cursor: 'pointer' }}>
        {entry.media && entry.media.length > 0 && (
          <div
            onClick={e => { e.stopPropagation(); onCropEdit && onCropEdit(entry.id, cardH); }}
            style={{ position: 'relative', height: cardH, overflow: 'hidden', cursor: onCropEdit ? 'move' : 'pointer' }}
          >
            <img src={entry.media[0].url} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `center ${cropY}%`, display: 'block' }} alt="" />
          </div>
        )}
        <div style={{ padding: '20px 20px 18px' }}>
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 13, color: '#9AA89C', margin: '0 0 10px' }}>
            Dear {allKids ? buildSalutation(entry, allKids) : kid.name},
          </p>
          {preview && (
            <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 17, color: '#2C3828', margin: '0 0 16px', lineHeight: 1.75 }}>
              {preview}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {entry.kids.map(kidId => {
              const k = allKids.find(k => k.id === kidId);
              if (!k) return null;
              return (
                <div key={kidId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <KidThumb kid={k} size={20} />
                  <span style={{ fontSize: 12, color: '#9AA89C' }}>{k.name} was {exactAgeLabel(k.birthdate, entry.date)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionDivider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 1, background: '#CCDAC8' }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: '#9AA89C', letterSpacing: 0.8, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: '#CCDAC8' }} />
    </div>
  );
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function daysUntilBirthday(birthdate) {
  const [, bm, bd] = birthdate.split('-').map(Number);
  const [ty, tm, td] = TODAY.split('-').map(Number);
  const today = new Date(ty, tm - 1, td);
  let next = new Date(ty, bm - 1, bd);
  if (next < today) next = new Date(ty + 1, bm - 1, bd);
  return Math.round((next - today) / 86400000);
}

function turningAge(birthdate) {
  const [by, bm, bd] = birthdate.split('-').map(Number);
  const [ty, tm, td] = TODAY.split('-').map(Number);
  const birthdayPassedThisYear = new Date(ty, bm - 1, bd) < new Date(ty, tm - 1, td);
  return birthdayPassedThisYear ? ty + 1 - by : ty - by;
}

function HomeScreen({ entries, kids, onOpenEntry, onSearch, onManage, kidFilter, setKidFilter, onAddMoment, onSeeAll }) {
  const todayMMDD = TODAY.slice(5);
  const todayYear = parseInt(TODAY.slice(0, 4));
  const todayLabel = new Date(TODAY + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const [cropPositions, setCropPositions] = useState(() => {
    try { return JSON.parse(localStorage.getItem('patina-crop-positions') || '{}'); } catch { return {}; }
  });
  const [cropModal, setCropModal] = useState(null); // { entryId, url, cardH }

  function openCropModal(entryId, cardH) {
    const entry = entries.find(e => e.id === entryId);
    if (!entry?.media?.[0]?.url) return;
    setCropModal({ entryId, url: entry.media[0].url, cardH });
  }

  function saveCropY(y) {
    const next = { ...cropPositions, [cropModal.entryId]: y };
    setCropPositions(next);
    try { localStorage.setItem('patina-crop-positions', JSON.stringify(next)); } catch {}
    setCropModal(null);
  }

  const onThisDay = entries
    .filter(e => e.date.slice(5) === todayMMDD && parseInt(e.date.slice(0, 4)) < todayYear)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const recent = [...entries]
    .filter(e => kidFilter === null || e.kids.includes(kidFilter))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 4);

  const letterCounts = kids.map(k => ({ kid: k, count: entries.filter(e => e.kids.includes(k.id)).length }));

  const birthdayToday = kids.filter(k => daysUntilBirthday(k.birthdate) === 0);
  const birthdayNextWeek = kids.filter(k => daysUntilBirthday(k.birthdate) === 7);

  const Header = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <p style={{ fontSize: 12, color: '#9AA89C', margin: '0 0 6px' }}>{todayLabel}</p>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: '#2C3828', margin: 0, fontWeight: 700 }}>Patina</h1>
      </div>
      <button className="icon-btn" onClick={onSearch}><i className="ti ti-search" /></button>
    </div>
  );

  if (entries.length === 0) {
    const onlyChild = kids.length === 1 ? kids[0].name.split(' ')[0] : null;
    const emptyGreeting = onlyChild ? `Dear ${onlyChild},` : 'To my children,';
    return (
      <div className="screen">
        <div className="scroll-area" style={{ overflowY: 'hidden' }}>
          <div style={{ padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 28 }}>
            <Header />
            <div
              onClick={onAddMoment}
              style={{ background: '#F8FAF6', border: '1px solid #C4D8C0', borderRadius: 16, padding: '24px 22px 28px', cursor: 'pointer' }}
            >
              <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 19, color: '#4A5E50', margin: '0 0 22px' }}>
                {emptyGreeting}
              </p>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{ height: 28, borderBottom: '1px solid #D4E4D0' }} />
              ))}
              <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 14, color: '#9AA89C', margin: '20px 0 0', lineHeight: 1.65 }}>
                {onlyChild ? `Write something you want ${onlyChild} to know...` : 'Write something you want them to know...'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="scroll-area">
        <div style={{ padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Header />

          {kids.length > 1 && (
            <KidSelector kids={kids} selected={kidFilter} onSelect={setKidFilter} onManage={onManage} />
          )}

          {birthdayToday.map(k => (
            <div key={k.id} style={{ background: '#4A5E50', borderRadius: 16, padding: '22px 20px', textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <i className="ti ti-cake" style={{ fontSize: 24, color: '#C8993E' }} />
              </div>
              <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>
                Happy Birthday, {k.name}!
              </p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', margin: 0 }}>
                {k.name} turns {ordinal(turningAge(k.birthdate))} today
              </p>
            </div>
          ))}

          {birthdayNextWeek.map(k => (
            <div key={k.id} style={{ background: '#EDE8DE', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(200,153,62,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="ti ti-cake" style={{ fontSize: 20, color: '#C8993E' }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#4A5E50', margin: '0 0 2px' }}>
                  {k.name}'s {ordinal(turningAge(k.birthdate))} birthday is in one week
                </p>
                <p style={{ fontSize: 12, color: '#9AA89C', margin: 0 }}>
                  Write something special for the occasion
                </p>
              </div>
            </div>
          ))}

          {onThisDay.length > 0 && (() => {
            const entry = onThisDay[0];
            const kid = kids.find(k => k.id === entry.kids[0]);
            const yearsAgo = todayYear - parseInt(entry.date.slice(0, 4));
            return <OnThisDayCard entry={entry} kid={kid} allKids={kids} yearsAgo={yearsAgo} onClick={() => onOpenEntry(entry)} cropY={cropPositions[entry.id] ?? 50} onCropEdit={openCropModal} />;
          })()}

          {recent.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SectionDivider label="Recent letters" />
              {recent.map(entry => {
                const kid = kids.find(k => k.id === entry.kids[0]);
                return <LetterCard key={entry.id} entry={entry} kid={kid} allKids={kids} featured={true} onClick={() => onOpenEntry(entry)} cropY={cropPositions[entry.id] ?? 50} onCropEdit={openCropModal} />;
              })}
              {entries.length > 4 && (
                <button onClick={onSeeAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#7A8C78', fontFamily: "'Inter', sans-serif", fontWeight: 600, padding: '4px 0', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  See all letters <i className="ti ti-arrow-right" style={{ fontSize: 13 }} />
                </button>
              )}
            </div>
          )}

          <div style={{ background: '#EEF2EA', borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {letterCounts.map(({ kid, count }) => (
              <div key={kid.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <KidThumb kid={kid} size={26} />
                <p style={{ fontSize: 14, color: '#2C3828', margin: 0, lineHeight: 1.3 }}>
                  <strong>{count}</strong>
                  <span style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', color: '#7A8C78' }}> letter{count !== 1 ? 's' : ''} to {kid.name}</span>
                </p>
              </div>
            ))}
          </div>

        </div>
      </div>
      {cropModal && (
        <CropModal
          url={cropModal.url}
          cropY={cropPositions[cropModal.entryId] ?? 50}
          cardHeight={cropModal.cardH}
          onSave={saveCropY}
          onClose={() => setCropModal(null)}
        />
      )}
    </div>
  );
}

// ─── Journal timeline ────────────────────────────────────────────────────

function JournalEntryRow({ entry, kid, onClick }) {
  const m = entry.milestone ? milestoneInfo(entry.milestone) : null;
  const d = new Date(entry.date);
  const dayNum = d.getDate();
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const text = entry.text.length > 160 ? entry.text.slice(0, 160) + '...' : entry.text;

  return (
    <div className="journal-entry" onClick={onClick}>
      <span className="day-quote-mark">"</span>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ textAlign: 'center', flexShrink: 0, width: 40 }}>
          <p style={{ fontSize: 22, fontWeight: 700, color: '#2C3828', margin: 0, lineHeight: 1, fontFamily: "'Playfair Display', serif" }}>{dayNum}</p>
          <p style={{ fontSize: 10, color: '#9AA89C', margin: '2px 0 0', fontWeight: 600, textTransform: 'uppercase' }}>{weekday}</p>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            <KidThumb kid={kid} size={20} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4A5E50' }}>{kid.name}</span>
            <span style={{ fontSize: 11, color: '#9AA89C' }}>· {exactAgeLabel(kid.birthdate, entry.date)}</span>
            {m && (
              <span style={{ fontSize: 10, fontWeight: 700, color: entry.palette.tint, background: entry.palette.bg, padding: '2px 8px', borderRadius: 999, marginLeft: 'auto' }}>
                {m.label}
              </span>
            )}
          </div>
          <p style={{ fontSize: 15, color: '#3A3020', lineHeight: 1.65, margin: 0, fontFamily: "'Source Serif 4', serif", fontStyle: text ? 'italic' : 'normal' }}>{text}</p>
          {entry.media && entry.media.length > 0 && (
            <div className="journal-thumb-strip">
              {entry.media.slice(0, 4).map((mm, i) => (
                <div key={i} className="journal-thumb" style={{ backgroundImage: `url('${mm.url}')` }} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function JournalScreen({ entries, kids, onOpenEntry, onNewEntry, kidFilter, setKidFilter }) {
  const filtered = entries
    .filter(e => kidFilter === null || e.kids.includes(kidFilter))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  let currentMonth = null;
  const rows = [];
  filtered.forEach(entry => {
    const d = new Date(entry.date);
    const monthLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (monthLabel !== currentMonth) {
      currentMonth = monthLabel;
      rows.push(
        <div className="month-divider" key={'divider-' + monthLabel}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#9AA89C', letterSpacing: 0.3 }}>{monthLabel.toUpperCase()}</span>
          <div className="month-divider-line" />
        </div>
      );
    }
    const kid = kids.find(k => k.id === entry.kids[0]);
    rows.push(<JournalEntryRow key={entry.id} entry={entry} kid={kid} onClick={() => onOpenEntry(entry)} />);
  });

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad" style={{ paddingBottom: 6 }}>
          <div>
            <p style={{ fontSize: 12, color: '#9AA89C', margin: 0 }}>Journal</p>
            <h1 style={{ fontSize: 23, color: '#4A5E50', margin: '4px 0 0', fontWeight: 700 }}>A page for every day</h1>
          </div>
          <KidSelector kids={kids} selected={kidFilter} onSelect={setKidFilter} onManage={() => {}} />
        </div>
        <div className="scrollpad" style={{ paddingTop: 0 }}>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F5EFE3', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <i className="ti ti-notebook" style={{ fontSize: 24, color: '#9AA89C' }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#4A5E50', margin: '0 0 6px' }}>Nothing written yet</p>
              <p style={{ fontSize: 13, color: '#9AA89C', margin: '0 0 20px', maxWidth: 240, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
                Your first journal entry will show up here. Big moment or small one — they all count.
              </p>
              <button className="btn btn-primary" style={{ width: 'auto', padding: '11px 22px', margin: '0 auto' }} onClick={onNewEntry}>
                Write your first entry
              </button>
            </div>
          ) : rows}
        </div>
      </div>
    </div>
  );
}

// ─── Entry detail ────────────────────────────────────────────────────────

function EntryDetailScreen({ entry, kid, allKids, onBack, onEdit }) {
  const m = entry.milestone ? milestoneInfo(entry.milestone) : null;
  const media = entry.media || [];
  const [activeSlide, setActiveSlide] = useState(0);

  return (
    <div className="screen">
      <div className="scroll-area">
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}>
            <button className="icon-btn-ghost" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            <button className="icon-btn-ghost" onClick={() => onEdit(entry)}><i className="ti ti-edit" /></button>
          </div>
          {media.length > 0 ? (
            <div className="gallery-stage">
              {media.map((item, i) => (
                <div
                  key={i}
                  className="gallery-slide"
                  style={{ backgroundImage: `url('${item.url}')`, opacity: i === activeSlide ? 1 : 0 }}
                >
                  {item.type === 'video' && <div className="video-play-overlay"><i className="ti ti-player-play" /></div>}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ aspectRatio: '4/3', ...entryBgStyle(entry) }} />
          )}
        </div>
        <div className="scrollpad">
          {m && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, width: 'fit-content', background: entry.palette.bg, color: entry.palette.tint, fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999 }}>
              <i className={`ti ${m.icon}`} style={{ fontSize: 13 }} />{m.label}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(allKids ? entry.kids.map(id => allKids.find(k => k.id === id)).filter(Boolean) : [kid]).map(k => (
              <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <KidThumb kid={k} size={32} />
                <div>
                  <p style={{ fontSize: 16, color: '#4A5E50', margin: 0, fontWeight: 700 }}>{k.name}</p>
                  <p style={{ fontSize: 12, color: '#9AA89C', margin: '2px 0 0' }}>
                    {exactAgeLabel(k.birthdate, entry.date)} old · {new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 17, color: '#2C3828', lineHeight: 1.8, margin: 0, fontFamily: "'Source Serif 4', serif", fontStyle: entry.text ? 'italic' : 'normal' }}>{entry.text}</p>
          {entry.signedAs && (
            <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 17, color: '#9AA89C', margin: 0, textAlign: 'right' }}>
              — {entry.signedAs}
            </p>
          )}
          <div style={{ height: 1, background: '#CCDAC8' }} />
          {entry.mood && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 12, color: '#9AA89C' }}>Feeling</span>
              <span className="chip selected" style={{ cursor: 'default' }}>{entry.mood}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── New entry form ────────────────────────────────────────────────────────

function NewEntryScreen({ kids, onCancel, onSave, existingEntry, signedDefault }) {
  const [selectedKids, setSelectedKids] = useState(
    existingEntry ? existingEntry.kids : (kids.length === 1 ? [kids[0].id] : [])
  );
  const [text, setText] = useState(existingEntry?.text || '');
  const [mood, setMood] = useState(existingEntry?.mood || null);
  const [milestoneType, setMilestoneType] = useState(existingEntry?.milestone || null);
  const [media, setMedia] = useState(existingEntry?.media || []);
  const [fileObjects, setFileObjects] = useState(existingEntry?.media?.map(() => null) || []);
  const [saving, setSaving] = useState(false);
  const [signedAs, setSignedAs] = useState(existingEntry?.signedAs ?? signedDefault ?? '');
  const [entryDate, setEntryDate] = useState(existingEntry?.date || TODAY);
  const [dateFromPhoto, setDateFromPhoto] = useState(false);
  const [showExtras, setShowExtras] = useState(true);
  const [showKidPicker, setShowKidPicker] = useState(false);
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [editMonth, setEditMonth] = useState('');
  const [editDay, setEditDay] = useState('');
  const [editYear, setEditYear] = useState('');
  const cameraInputRef = useRef(null);
  const uploadInputRef = useRef(null);

  const dateDisplay = new Date(entryDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const salutationName = (() => {
    if (selectedKids.length === 0) return null;
    const names = selectedKids.map(id => kids.find(k => k.id === id)?.name.split(' ')[0]).filter(Boolean);
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
  })();

  function openDateEdit() {
    const [y, m, d] = entryDate.split('-');
    setEditYear(y); setEditMonth(m); setEditDay(String(parseInt(d)));
    setEditingDate(true);
  }

  function applyDate() {
    if (editMonth && editDay && editYear && editYear.length === 4) {
      setEntryDate(`${editYear}-${editMonth}-${editDay.padStart(2, '0')}`);
      setDateFromPhoto(false);
    }
    setEditingDate(false);
  }

  async function handleFileChange(e) {
    const files = Array.from(e.target.files);
    const newMedia = files.map(file => ({
      url: URL.createObjectURL(file),
      type: file.type.startsWith('video') ? 'video' : 'image',
    }));
    setMedia(prev => [...prev, ...newMedia]);
    setFileObjects(prev => [...prev, ...files]);
    e.target.value = '';
    if (!dateFromPhoto) {
      for (const file of files) {
        if (!file.type.startsWith('image')) continue;
        try {
          const tags = await exifr.parse(file, ['DateTimeOriginal']);
          if (tags?.DateTimeOriginal) {
            const d = new Date(tags.DateTimeOriginal);
            setEntryDate(d.toISOString().slice(0, 10));
            setDateFromPhoto(true);
            break;
          }
        } catch {}
      }
    }
  }

  async function handleSave() {
    setSaving(true);
    await onSave({
      kids: selectedKids,
      text: text.trim(),
      mood: mood || null,
      milestone: milestoneType || null,
      media,
      fileObjects,
      date: entryDate,
      entryId: existingEntry?.id,
      signedAs: signedAs.trim() || null,
    });
    setSaving(false);
  }

  const canSave = selectedKids.length > 0 && (text.trim().length > 0 || media.length > 0);

  return (
    <div className="screen" style={{ background: '#F8FAF6', position: 'relative' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', flexShrink: 0, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="icon-btn" onClick={onCancel}><i className="ti ti-x" /></button>
          <div style={{ position: 'relative' }}>
            {showMediaMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setShowMediaMenu(false)} />
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: '#fff', border: '1px solid #CCDAC8', borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', minWidth: 210, zIndex: 10 }}>
                  <button onClick={() => { cameraInputRef.current?.click(); setShowMediaMenu(false); }} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '13px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: '#2C3828', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>
                    <i className="ti ti-camera" style={{ fontSize: 17, color: '#4A5E50' }} />
                    Take a photo
                  </button>
                  <div style={{ height: 1, background: '#CCDAC8' }} />
                  <button onClick={() => { uploadInputRef.current?.click(); setShowMediaMenu(false); }} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '13px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: '#2C3828', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>
                    <i className="ti ti-photo" style={{ fontSize: 17, color: '#4A5E50' }} />
                    Upload from library
                  </button>
                </div>
              </>
            )}
            <button onClick={() => setShowMediaMenu(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', color: showMediaMenu ? '#4A5E50' : '#9AA89C', fontSize: 20, borderRadius: 10 }}>
              <i className="ti ti-camera" />
            </button>
          </div>
          <button onClick={() => setShowExtras(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', color: showExtras ? '#4A5E50' : '#9AA89C', fontSize: 20, borderRadius: 10 }}>
            <i className="ti ti-dots" />
          </button>
        </div>
        <button
          className="btn btn-primary"
          style={{ padding: '9px 22px', fontSize: 14, borderRadius: 10, opacity: canSave && !saving ? 1 : 0.4 }}
          disabled={!canSave || saving}
          onClick={handleSave}
        >
          {saving ? 'Saving…' : existingEntry ? 'Update' : 'Save'}
        </button>
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileChange} />
        <input ref={uploadInputRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={handleFileChange} />
      </div>

      {/* Letter body */}
      <div className="scroll-area" style={{ padding: '4px 24px 20px' }}>

        {/* Salutation + date */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 21, color: '#4A5E50' }}>Dear</span>
            {kids.length === 1 ? (
              <span style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 21, color: '#4A5E50' }}>{salutationName},</span>
            ) : salutationName ? (
              <button onClick={() => setShowKidPicker(true)} style={{ background: 'none', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', cursor: 'pointer', fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 21, color: '#4A5E50', padding: 0, textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 4 }}>
                {salutationName},
              </button>
            ) : (
              <button onClick={() => setShowKidPicker(true)} style={{ background: 'none', borderTop: 'none', borderRight: 'none', borderBottom: '1.5px dashed #C4D8C0', borderLeft: 'none', cursor: 'pointer', fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 21, color: '#C4D8C0', padding: 0 }}>
                my children
              </button>
            )}
          </div>
          <button onClick={openDateEdit} style={{ background: '#EEF2EA', border: 'none', cursor: 'pointer', fontSize: 12, color: '#5C6B5E', fontFamily: "'Inter', sans-serif", padding: '6px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
            <i className="ti ti-calendar" style={{ fontSize: 13 }} />
            {dateDisplay}
            {dateFromPhoto && <span style={{ fontSize: 10, color: '#9AA89C' }}>· photo</span>}
          </button>
        </div>

        {/* Writing area */}
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="You did the most surprising thing today. I never want you to forget what it felt like to be there…"
          style={{
            width: '100%', border: 'none', outline: 'none', resize: 'none',
            background: 'transparent', fontFamily: "'Source Serif 4', serif",
            fontStyle: 'italic', fontSize: 17, lineHeight: 1.85, color: '#2C3828',
            minHeight: 260, padding: 0,
          }}
        />

        {/* Sign-off */}
        {signedDefault && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16 }}>
            <span style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 17, color: '#9AA89C' }}>—</span>
            <input
              value={signedAs}
              onChange={e => setSignedAs(e.target.value)}
              placeholder={signedDefault}
              style={{ border: 'none', outline: 'none', background: 'transparent', fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 17, color: '#4A5E50', width: '100%', padding: 0 }}
            />
          </div>
        )}

        {/* Photo strip */}
        {media.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            {media.map((item, i) => (
              <div key={i} style={{ width: 76, height: 76, borderRadius: 10, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
                {item.type === 'video'
                  ? <video src={item.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                  : <img src={item.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                }
                <button onClick={() => { setMedia(prev => prev.filter((_, idx) => idx !== i)); setFileObjects(prev => prev.filter((_, idx) => idx !== i)); }} style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ti ti-x" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Extras: mood + milestone */}
        {showExtras && (
          <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #D4E4D0', display: 'flex', flexDirection: 'column', gap: 24 }}>

            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#9AA89C', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>How are you feeling?</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  { label: 'Proud',     emoji: '🌟' },
                  { label: 'Joyful',    emoji: '☀️' },
                  { label: 'Surprised', emoji: '✨' },
                  { label: 'Exhausted', emoji: '🌙' },
                  { label: 'Grateful',  emoji: '🤍' },
                  { label: 'Nostalgic', emoji: '🍂' },
                ].map(({ label, emoji }) => {
                  const active = mood === label;
                  return (
                    <div
                      key={label}
                      onClick={() => setMood(active ? null : label)}
                      style={{
                        background: active ? '#4A5E50' : '#fff',
                        border: `1px solid ${active ? '#4A5E50' : '#CCDAC8'}`,
                        borderRadius: 14, padding: '14px 8px 12px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontSize: 24, lineHeight: 1 }}>{emoji}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: active ? '#fff' : '#5C6B5E', letterSpacing: 0.2 }}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#9AA89C', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Mark as milestone?</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {MILESTONE_TYPES.filter(mt => mt.id !== 'custom').map(mt => {
                  const active = milestoneType === mt.id;
                  return (
                    <div
                      key={mt.id}
                      onClick={() => setMilestoneType(active ? null : mt.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 13,
                        background: active ? '#4A5E50' : '#fff',
                        border: `1px solid ${active ? '#4A5E50' : '#CCDAC8'}`,
                        borderRadius: 13, padding: '13px 16px', cursor: 'pointer',
                      }}
                    >
                      <i className={`ti ${mt.icon}`} style={{ fontSize: 19, color: active ? '#C8993E' : '#9AA89C', flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: active ? '#fff' : '#2C3828', flex: 1 }}>{mt.label}</span>
                      {active && <i className="ti ti-check" style={{ color: '#C8993E', fontSize: 16 }} />}
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Date edit sheet */}
      {editingDate && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '0 16px' }} onClick={() => setEditingDate(false)}>
          <div style={{ background: '#F2F4EC', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#2C3828', margin: '0 0 16px' }}>When did this happen?</p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <div style={{ position: 'relative', flex: 2.2 }}>
                <select value={editMonth} onChange={e => setEditMonth(e.target.value)} style={{ width: '100%', border: '1px solid #CCDAC8', borderRadius: 10, padding: '14px 36px 14px 14px', fontSize: 16, outline: 'none', background: '#fff', color: editMonth ? '#2C3828' : '#9AA89C', fontFamily: "'Inter', sans-serif", appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}>
                  <option value="" disabled>Month</option>
                  {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                    <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                  ))}
                </select>
                <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#9AA89C', fontSize: 13, pointerEvents: 'none' }} />
              </div>
              <input type="number" placeholder="Day" value={editDay} min={1} max={31} onChange={e => setEditDay(e.target.value)} style={{ flex: 1, border: '1px solid #CCDAC8', borderRadius: 10, padding: '14px 10px', fontSize: 16, outline: 'none', background: '#fff', color: '#2C3828', fontFamily: "'Inter', sans-serif", textAlign: 'center' }} />
              <input type="number" placeholder="Year" value={editYear} min={1900} max={2030} onChange={e => setEditYear(e.target.value)} style={{ flex: 1.5, border: '1px solid #CCDAC8', borderRadius: 10, padding: '14px 10px', fontSize: 16, outline: 'none', background: '#fff', color: '#2C3828', fontFamily: "'Inter', sans-serif", textAlign: 'center' }} />
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={applyDate}>Done</button>
          </div>
        </div>
      )}

      {/* Kid picker sheet */}
      {showKidPicker && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '0 16px' }} onClick={() => setShowKidPicker(false)}>
          <div style={{ background: '#F2F4EC', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#2C3828', margin: '0 0 16px' }}>Who are you writing to?</p>
            {kids.map(k => {
              const selected = selectedKids.includes(k.id);
              return (
                <div key={k.id} onClick={() => setSelectedKids(prev => selected ? prev.filter(id => id !== k.id) : [...prev, k.id])} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: '1px solid #CCDAC8', cursor: 'pointer' }}>
                  <KidThumb kid={k} size={36} />
                  <span style={{ fontSize: 16, color: '#2C3828', fontWeight: 600 }}>{k.name}</span>
                  <div style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: '50%', border: `2px solid ${selected ? '#4A5E50' : '#CCDAC8'}`, background: selected ? '#4A5E50' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {selected && <i className="ti ti-check" style={{ color: '#fff', fontSize: 12 }} />}
                  </div>
                </div>
              );
            })}
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 20 }} onClick={() => setShowKidPicker(false)}>Done</button>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Celebration overlay ───────────────────────────────────────────────────

function CelebrationOverlay({ kid, milestoneType, onDone }) {
  const m = milestoneInfo(milestoneType) || { label: 'Milestone', icon: 'ti-star' };
  const colors = ['#C8993E', '#D4856A', '#7BA99A', '#6A9EB0', '#A889B0'];
  const [pieces, setPieces] = useState([]);

  useEffect(() => {
    const newPieces = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      size: 5 + Math.random() * 6,
      left: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 0.4,
    }));
    setPieces(newPieces);
  }, []);

  return (
    <div className="celebrate-overlay">
      {pieces.map(p => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{ width: p.size, height: p.size, left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s` }}
        />
      ))}
      <div style={{ width: 76, height: 76, borderRadius: '50%', overflow: 'hidden' }}>
        <KidThumb kid={kid} size={76} />
      </div>
      <h2 style={{ fontSize: 23, color: '#4A5E50', margin: 0, fontWeight: 800 }}>Milestone unlocked</h2>
      <p style={{ fontSize: 15, color: '#5C6B5E', margin: 0 }}>
        {kid.name} just hit: <strong style={{ color: '#4A5E50' }}>{m.label}</strong>
      </p>
      <button className="btn btn-primary" style={{ marginTop: 10, width: 'auto', padding: '13px 28px' }} onClick={onDone}>
        See it in the journal
      </button>
    </div>
  );
}

// ─── Recap screen ──────────────────────────────────────────────────────────

function RecapEntryRow({ entry, kids, onOpenEntry }) {
  const kid = kids.find(k => k.id === entry.kids[0]);
  if (!kid) return null;
  const m = entry.milestone ? milestoneInfo(entry.milestone) : null;
  const dayLabel = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const snippet = entry.text.slice(0, 90) + (entry.text.length > 90 ? '…' : '');
  return (
    <div
      onClick={() => onOpenEntry(entry)}
      style={{ background: '#fff', border: '1px solid #ECE5D6', borderRadius: 12, padding: '11px 13px', cursor: 'pointer', display: 'flex', gap: 11, alignItems: 'flex-start' }}
    >
      <KidThumb kid={kid} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: snippet ? 4 : 0 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#4A5E50' }}>{kid.name}</span>
          <span style={{ fontSize: 11, color: '#B8CCB4' }}>·</span>
          <span style={{ fontSize: 11, color: '#9AA89C' }}>{exactAgeLabel(kid.birthdate, entry.date)}</span>
          <span style={{ fontSize: 11, color: '#B8CCB4', marginLeft: 'auto', flexShrink: 0 }}>{dayLabel}</span>
        </div>
        {snippet && (
          <p style={{ fontSize: 13, color: '#5C6B5E', margin: 0, lineHeight: 1.5, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {snippet}
          </p>
        )}
        {m && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5, fontSize: 10, fontWeight: 700, color: '#C8993E', background: '#FDF3E0', padding: '2px 8px', borderRadius: 999 }}>
            <i className={`ti ${m.icon}`} style={{ fontSize: 10 }} />{m.label}
          </span>
        )}
      </div>
    </div>
  );
}

function RecapScreen({ entries, kids, onBack, onOpenEntry, onCompare }) {
  const [viewMode, setViewMode] = useState('month');
  const [selectedMonth, setSelectedMonth] = useState(TODAY.slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(TODAY.slice(0, 4));
  const [recapFilter, setRecapFilter] = useState(null);

  const segTabStyle = (tab) => ({
    border: 'none', borderRadius: 7, padding: '6px 14px',
    fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    background: viewMode === tab ? '#fff' : 'transparent',
    color: viewMode === tab ? '#4A5E50' : '#9AA89C',
    boxShadow: viewMode === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
  });

  const monthEntries = [...entries.filter(e => e.date.startsWith(selectedMonth))].sort((a, b) => new Date(b.date) - new Date(a.date));
  const monthLabel = new Date(selectedMonth + '-15T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const canGoNextMonth = selectedMonth < TODAY.slice(0, 7);

  function prevMonth() {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  function nextMonth() {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (next <= TODAY.slice(0, 7)) setSelectedMonth(next);
  }

  const yearEntries = [...entries.filter(e => e.date.startsWith(selectedYear))].sort((a, b) => new Date(b.date) - new Date(a.date));
  const canGoNextYear = selectedYear < TODAY.slice(0, 4);

  const yearGroups = [];
  let curMonthLabel = null;
  yearEntries.forEach(e => {
    const label = new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long' });
    if (label !== curMonthLabel) { curMonthLabel = label; yearGroups.push({ label, entries: [] }); }
    yearGroups[yearGroups.length - 1].entries.push(e);
  });

  const allEntries = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));
  const allGroups = [];
  let curAllLabel = null;
  allEntries.forEach(e => {
    const label = new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (label !== curAllLabel) { curAllLabel = label; allGroups.push({ label, entries: [] }); }
    allGroups[allGroups.length - 1].entries.push(e);
  });

  const periodEntries = viewMode === 'month' ? monthEntries : viewMode === 'year' ? yearEntries : allEntries;
  const momentCount = periodEntries.length;
  const milestoneCount = periodEntries.filter(e => e.milestone).length;
  const photoCount = periodEntries.reduce((sum, e) => sum + (e.media?.length || 0), 0);
  const periodEmpty = viewMode === 'month' ? `No moments logged in ${monthLabel}.` : viewMode === 'year' ? `No moments logged in ${selectedYear}.` : 'No moments logged yet.';

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            <div style={{ display: 'flex', background: '#E8EDE4', borderRadius: 9, padding: 3 }}>
              <button style={segTabStyle('month')} onClick={() => { setViewMode('month'); setRecapFilter(null); }}>Month</button>
              <button style={segTabStyle('year')} onClick={() => { setViewMode('year'); setRecapFilter(null); }}>Year</button>
              <button style={segTabStyle('all')} onClick={() => { setViewMode('all'); setRecapFilter(null); }}>All</button>
            </div>
            <div style={{ width: 36 }} />
          </div>

          {viewMode !== 'all' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <button
                onClick={viewMode === 'month' ? prevMonth : () => setSelectedYear(y => String(Number(y) - 1))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9AA89C', fontSize: 16, padding: 4, display: 'flex' }}
              >
                <i className="ti ti-chevron-left" />
              </button>
              <h2 style={{ fontSize: 17, color: '#4A5E50', margin: 0, fontWeight: 700, minWidth: 150, textAlign: 'center' }}>
                {viewMode === 'month' ? monthLabel : selectedYear}
              </h2>
              <button
                onClick={viewMode === 'month' ? nextMonth : () => { if (canGoNextYear) setSelectedYear(y => String(Number(y) + 1)); }}
                style={{ background: 'none', border: 'none', cursor: (viewMode === 'month' ? canGoNextMonth : canGoNextYear) ? 'pointer' : 'default', color: (viewMode === 'month' ? canGoNextMonth : canGoNextYear) ? '#9AA89C' : 'transparent', fontSize: 16, padding: 4, display: 'flex' }}
              >
                <i className="ti ti-chevron-right" />
              </button>
            </div>
          )}

          {momentCount === 0 ? (
            <div className="empty-state">
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#EEF2EA', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <i className="ti ti-calendar" style={{ fontSize: 22, color: '#9AA89C' }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#4A5E50', margin: '0 0 6px' }}>Nothing written</p>
              <p style={{ fontSize: 13, color: '#9AA89C', margin: 0 }}>{periodEmpty}</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1.3, background: '#4A5E50', borderRadius: 14, padding: 16 }}>
                  <p style={{ fontSize: 36, fontWeight: 800, color: '#C8993E', margin: 0, lineHeight: 1 }}>{momentCount}</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: '5px 0 0', fontWeight: 600 }}>moment{momentCount !== 1 ? 's' : ''} logged</p>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div
                    onClick={() => setRecapFilter(f => f === 'milestones' ? null : 'milestones')}
                    style={{ background: recapFilter === 'milestones' ? '#4A5E50' : '#EEF2EA', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, padding: '12px 14px', cursor: milestoneCount > 0 ? 'pointer' : 'default' }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 700, color: recapFilter === 'milestones' ? '#C8993E' : '#4A5E50' }}>milestones</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: recapFilter === 'milestones' ? '#fff' : '#4A5E50' }}>{milestoneCount}</span>
                  </div>
                  <div
                    onClick={() => setRecapFilter(f => f === 'photos' ? null : 'photos')}
                    style={{ background: recapFilter === 'photos' ? '#7A6850' : '#EDE8DE', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, padding: '12px 14px', cursor: photoCount > 0 ? 'pointer' : 'default' }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 700, color: recapFilter === 'photos' ? 'rgba(255,255,255,0.8)' : '#7A6850' }}>photos</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: recapFilter === 'photos' ? '#fff' : '#7A6850' }}>{photoCount}</span>
                  </div>
                </div>
              </div>

              {recapFilter === 'photos' ? (
                (() => {
                  const allPhotos = periodEntries.flatMap(e => (e.media || []).map(m => ({ ...m, entry: e })));
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                      {allPhotos.map((item, i) => (
                        <div
                          key={i}
                          onClick={() => onOpenEntry(item.entry)}
                          style={{ aspectRatio: '1', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', background: '#EEF2EA' }}
                        >
                          <img src={item.url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" />
                        </div>
                      ))}
                    </div>
                  );
                })()
              ) : recapFilter === 'milestones' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {periodEntries.filter(e => e.milestone).map(e => <RecapEntryRow key={e.id} entry={e} kids={kids} onOpenEntry={onOpenEntry} />)}
                </div>
              ) : viewMode === 'month' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {monthEntries.map(e => <RecapEntryRow key={e.id} entry={e} kids={kids} onOpenEntry={onOpenEntry} />)}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {(viewMode === 'year' ? yearGroups : allGroups).map(group => (
                    <div key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#9AA89C', letterSpacing: 0.4, textTransform: 'uppercase' }}>{group.label}</span>
                        <div style={{ flex: 1, height: 1, background: '#CCDAC8' }} />
                        <span style={{ fontSize: 11, color: '#B8CCB4', fontWeight: 600 }}>{group.entries.length}</span>
                      </div>
                      {group.entries.map(e => <RecapEntryRow key={e.id} entry={e} kids={kids} onOpenEntry={onOpenEntry} />)}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <button className="btn btn-outline" onClick={onCompare}>
            See them at this age <i className="ti ti-arrow-right" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Compare screen ──────────────────────────────────────────────────────

function CompareScreen({ entries, kids, onBack, onOpenEntry }) {
  const [filterTab, setFilterTab] = useState('age');
  const [compareAge, setCompareAge] = useState(24);
  const [milestoneFilter, setMilestoneFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const ages = [12, 18, 24, 36, 48, 60, 72];
  const isSearching = searchQuery.trim().length > 0;
  const isMilestoneFiltering = !isSearching && filterTab === 'milestone' && milestoneFilter !== null;

  function switchTab(tab) {
    setFilterTab(tab);
    setMilestoneFilter(null);
    setSearchQuery('');
  }

  function matchesAgeBucket(entryAgeMonths) {
    const currentIndex = ages.indexOf(compareAge);
    if (currentIndex === -1) return false;
    const nextAge = ages[currentIndex + 1];
    if (nextAge == null) return entryAgeMonths >= compareAge;
    return entryAgeMonths >= compareAge && entryAgeMonths < nextAge;
  }

  function entryMatchesSearch(e) {
    const q = searchQuery.toLowerCase();
    const m = e.milestone ? milestoneInfo(e.milestone) : null;
    return e.text.toLowerCase().includes(q) || (m && m.label.toLowerCase().includes(q));
  }

  const showMeta = isSearching || isMilestoneFiltering;
  const emptyLabel = isSearching ? 'No matches'
    : filterTab === 'milestone' && !milestoneFilter ? 'Pick a milestone above'
    : isMilestoneFiltering ? 'None logged yet'
    : 'No moments yet at this age';

  const tabStyle = (tab) => ({
    flex: 1, border: 'none', borderRadius: 8, padding: '8px 0',
    fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    background: filterTab === tab ? '#fff' : 'transparent',
    color: filterTab === tab ? '#4A5E50' : '#9AA89C',
    boxShadow: filterTab === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
    transition: 'all 0.15s',
  });

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            <h2 style={{ fontSize: 16, color: '#4A5E50', margin: 0, fontWeight: 700 }}>At this age</h2>
            <div style={{ width: 36 }} />
          </div>

          <div style={{ display: 'flex', background: '#E8EDE4', borderRadius: 10, padding: 3 }}>
            <button style={tabStyle('age')} onClick={() => switchTab('age')}>By Age</button>
            <button style={tabStyle('milestone')} onClick={() => switchTab('milestone')}>Milestones</button>
            <button style={tabStyle('search')} onClick={() => switchTab('search')}>Search</button>
          </div>

          {filterTab === 'search' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: '1px solid #ECE5D6', borderRadius: 10, padding: '10px 14px' }}>
              <i className="ti ti-search" style={{ color: '#9AA89C', fontSize: 16 }} />
              <input
                autoFocus
                type="text"
                placeholder="Search moments..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', flex: 1, fontSize: 14, background: 'transparent', color: '#4A5E50', fontFamily: 'Inter, sans-serif' }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9AA89C', padding: 0, display: 'flex', alignItems: 'center' }}>
                  <i className="ti ti-x" style={{ fontSize: 14 }} />
                </button>
              )}
            </div>
          )}

          {filterTab === 'age' && (
            <div className="scrollx">
              {ages.map(age => (
                <div
                  key={age}
                  className={`kid-chip ${compareAge === age ? 'active' : ''}`}
                  style={{ padding: '7px 14px', ...(compareAge === age ? { background: '#4A5E50' } : {}) }}
                  onClick={() => setCompareAge(age)}
                >
                  {ageLabel(age)}
                </div>
              ))}
            </div>
          )}

          {filterTab === 'milestone' && (
            <div className="scrollx">
              {MILESTONE_TYPES.filter(ms => ms.id !== 'custom').map(ms => {
                const active = milestoneFilter === ms.id;
                return (
                  <div
                    key={ms.id}
                    className="kid-chip"
                    style={{ padding: '7px 14px', ...(active ? { background: '#C8993E', borderColor: '#C8993E', color: '#fff' } : {}) }}
                    onClick={() => setMilestoneFilter(active ? null : ms.id)}
                  >
                    <i className={`ti ${ms.icon}`} style={{ fontSize: 13 }} />
                    {ms.label}
                  </div>
                );
              })}
            </div>
          )}

          {filterTab === 'milestone' && !milestoneFilter ? (
            <div className="empty-state" style={{ padding: '32px 24px' }}>
              <p style={{ fontSize: 13, color: '#9AA89C', margin: 0 }}>Pick a milestone above to compare</p>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 12 }}>
              {kids.map(kid => {
                const matches = isSearching
                  ? entries.filter(e => e.kids.includes(kid.id) && entryMatchesSearch(e))
                  : isMilestoneFiltering
                    ? entries.filter(e => e.kids.includes(kid.id) && e.milestone === milestoneFilter)
                    : entries.filter(e => e.kids.includes(kid.id) && matchesAgeBucket(e.ageMonths));
                return (
                  <div key={kid.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <KidThumb kid={kid} />
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#4A5E50', margin: 0 }}>{kid.name}</p>
                    </div>
                    {matches.length === 0 ? (
                      <div style={{ background: '#fff', border: '1px dashed #D8CFBC', borderRadius: 12, padding: '24px 12px', textAlign: 'center' }}>
                        <p style={{ fontSize: 12, color: '#9AA89C', margin: 0 }}>{emptyLabel}</p>
                      </div>
                    ) : matches.map(e => {
                      const m = e.milestone ? milestoneInfo(e.milestone) : null;
                      const ageStr = exactAgeLabel(kid.birthdate, e.date);
                      const dateStr = new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                      return (
                        <div key={e.id} style={{ borderRadius: 12, overflow: 'hidden' }} onClick={() => onOpenEntry(e)}>
                          <div className="compare-photo" style={entryBgStyle(e)}>
                            <div className="scrim" style={tintedScrimStyle(e, 0.5)} />
                            <div style={{ position: 'relative', zIndex: 2, padding: 10, width: '100%' }}>
                              <p style={{ fontSize: 11, color: '#fff', margin: '0 0 2px', fontWeight: 700 }}>{ageStr}</p>
                              {showMeta && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', margin: '0 0 2px' }}>{dateStr}</p>}
                              {m && !isMilestoneFiltering && <p style={{ fontSize: 11, color: '#fff', margin: 0, fontWeight: 600, opacity: 0.9 }}>{m.label}</p>}
                            </div>
                          </div>
                          <p style={{ fontSize: 12, color: '#5C6B5E', lineHeight: 1.5, margin: '8px 2px 0' }}>
                            {e.text.slice(0, 70)}{e.text.length > 70 ? '...' : ''}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Search screen ─────────────────────────────────────────────────────────

function SearchScreen({ entries, kids, onBack, onOpenEntry }) {
  const [query, setQuery] = useState('');

  const matches = query.trim() ? entries.filter(e => {
    const m = e.milestone ? milestoneInfo(e.milestone) : null;
    const kid = kids.find(k => k.id === e.kids[0]);
    const q = query.toLowerCase();
    return e.text.toLowerCase().includes(q) || (m && m.label.toLowerCase().includes(q)) || kid.name.toLowerCase().includes(q);
  }) : [];

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            <h2 style={{ fontSize: 16, color: '#4A5E50', margin: 0, fontWeight: 700 }}>Search</h2>
            <div style={{ width: 36 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: '1px solid #ECE5D6', borderRadius: 10, padding: '11px 14px' }}>
            <i className="ti ti-search" style={{ color: '#9AA89C' }} />
            <input
              type="text"
              placeholder="Search moments, milestones, trips..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ border: 'none', outline: 'none', flex: 1, fontSize: 14, background: 'transparent', color: '#4A5E50', fontFamily: 'Inter, sans-serif' }}
            />
          </div>
          {query.trim() && matches.length === 0 && (
            <p style={{ fontSize: 13, color: '#9AA89C', textAlign: 'center', padding: '24px 0' }}>No moments found</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: matches.length > 0 ? 14 : 0 }}>
            {matches.map(e => {
              const kid = kids.find(k => k.id === e.kids[0]);
              return <JournalEntryRow key={e.id} entry={e} kid={kid} onClick={() => onOpenEntry(e)} />;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── Profile / manage kids ─────────────────────────────────────────────────

function ProfileScreen({ kids, entries, onBack, onAvatarUpload, onSignOut, familyMembers, myDisplayName, onInvite, onUpdateDisplayName, onAddKid, onFamilyAvatarUpload, currentUserId, onRenameKid }) {
  const fileInputRef = useRef(null);
  const familyAvatarInputRef = useRef(null);
  const [uploadKidId, setUploadKidId] = useState(null);
  const [activeFamilyAvatarId, setActiveFamilyAvatarId] = useState(null);
  const [inviteCode, setInviteCode] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(myDisplayName);
  const [editingKid, setEditingKid] = useState(null);
  const [kidNameInput, setKidNameInput] = useState('');
  const [addingKid, setAddingKid] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBdMonth, setNewBdMonth] = useState('');
  const [newBdDay, setNewBdDay] = useState('');
  const [newBdYear, setNewBdYear] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const newBirthdate = (newBdMonth && newBdDay && newBdYear && newBdYear.length === 4)
    ? `${newBdYear}-${newBdMonth}-${newBdDay.padStart(2, '0')}` : '';

  async function handleSaveNewKid() {
    if (!newName.trim() || !newBirthdate) return;
    setAddSaving(true);
    await onAddKid({ name: newName.trim(), birthdate: newBirthdate });
    setAddingKid(false);
    setNewName(''); setNewBdMonth(''); setNewBdDay(''); setNewBdYear('');
    setAddSaving(false);
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file || !uploadKidId) return;
    onAvatarUpload(uploadKidId, file);
    setUploadKidId(null);
    e.target.value = '';
  }

  function handleFamilyAvatarFile(e) {
    const file = e.target.files[0];
    if (!file || !activeFamilyAvatarId) return;
    onFamilyAvatarUpload?.(activeFamilyAvatarId, file);
    setActiveFamilyAvatarId(null);
    e.target.value = '';
  }

  async function handleInvite() {
    setInviteLoading(true);
    const code = await onInvite();
    setInviteCode(code);
    setInviteLoading(false);
  }

  function handleSaveName() {
    if (nameInput.trim()) onUpdateDisplayName(nameInput.trim());
    setEditingName(false);
  }

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            <h2 style={{ fontSize: 16, color: '#4A5E50', margin: 0, fontWeight: 700 }}>Your family</h2>
            <div style={{ width: 36 }} />
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

          {kids.map(k => {
            const kEntries = entries.filter(e => e.kids.includes(k.id));
            const kMilestones = kEntries.filter(e => e.milestone).length;
            const bornLabel = (() => { const [y,m,d] = k.birthdate.split('-').map(Number); return new Date(y,m-1,d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); })();
            return (
              <div key={k.id} style={{ background: '#fff', border: '1px solid #ECE5D6', borderRadius: 14, padding: '20px 16px 16px', textAlign: 'center' }}>
                <div
                  className="avatar-upload-zone"
                  style={{ width: 84, height: 84, margin: '0 auto 12px' }}
                  onClick={() => { setUploadKidId(k.id); fileInputRef.current?.click(); }}
                  title="Tap to change photo"
                >
                  <AvatarImg src={k.avatar} alt={k.name} fallback={<i className="ti ti-camera" />} />
                </div>
                <p
                  style={{ fontSize: 15, fontWeight: 700, color: '#4A5E50', margin: '0 0 2px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  onClick={() => { setEditingKid(k); setKidNameInput(k.name); }}
                >
                  {k.name} <i className="ti ti-pencil" style={{ fontSize: 12, color: '#9AA89C' }} />
                </p>
                <p style={{ fontSize: 12, color: '#9AA89C', margin: '0 0 14px' }}>Born {bornLabel}</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div className="stat-tile">
                    <p style={{ fontSize: 18, color: '#4A5E50', margin: 0, fontWeight: 700 }}>{kEntries.length}</p>
                    <p style={{ fontSize: 11, color: '#9AA89C', margin: '3px 0 0' }}>moments</p>
                  </div>
                  <div className="stat-tile">
                    <p style={{ fontSize: 18, color: '#4A5E50', margin: 0, fontWeight: 700 }}>{kMilestones}</p>
                    <p style={{ fontSize: 11, color: '#9AA89C', margin: '3px 0 0' }}>milestones</p>
                  </div>
                </div>
              </div>
            );
          })}

          {kids.length < 4 && (
            <button className="btn btn-outline" onClick={() => setAddingKid(true)}>
              <i className="ti ti-plus" />Add a child
            </button>
          )}

          {/* Parents section */}
          {familyMembers && familyMembers.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #ECE5D6', borderRadius: 14, padding: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#9AA89C', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 14px' }}>Parents</p>
              {familyMembers.map(m => (
                <div key={m.id || m.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      onClick={() => {
                        if (!onFamilyAvatarUpload || m.user_id !== currentUserId) return;
                        setActiveFamilyAvatarId(m.id || m.user_id);
                        familyAvatarInputRef.current?.click();
                      }}
                      style={{ width: 34, height: 34, borderRadius: '50%', background: '#EEF2EA', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: m.user_id === currentUserId ? 'pointer' : 'default' }}
                    >
                      <AvatarImg src={m.avatar_url} alt={m.display_name} fallback={<i className="ti ti-user" style={{ fontSize: 16, color: '#4A5E50' }} />} />
                    </div>
                    {m.user_id === currentUserId ? (
                      <span
                        style={{ fontSize: 14, color: '#2C3828', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                        onClick={() => { setNameInput(myDisplayName); setEditingName(true); }}
                      >
                        {m.display_name} <i className="ti ti-pencil" style={{ fontSize: 12, color: '#9AA89C' }} />
                      </span>
                    ) : (
                      <span style={{ fontSize: 14, color: '#2C3828', fontWeight: 600 }}>{m.display_name}</span>
                    )}
                  </div>
                </div>
              ))}
              <input ref={familyAvatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFamilyAvatarFile} />
              {onInvite && familyMembers.length < 2 && (
                inviteCode ? (
                  <div style={{ marginTop: 14, padding: '12px 14px', background: '#EEF2EA', borderRadius: 12, textAlign: 'center' }}>
                    <p style={{ fontSize: 11, color: '#7A8C78', margin: '0 0 6px', fontWeight: 600 }}>Share this code with your partner</p>
                    <p style={{ fontSize: 26, fontWeight: 700, color: '#4A5E50', letterSpacing: 4, margin: '0 0 10px', fontFamily: "'Inter', sans-serif" }}>{inviteCode}</p>
                    <button onClick={() => { navigator.clipboard?.writeText(inviteCode); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#9AA89C', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>
                      <i className="ti ti-copy" style={{ fontSize: 13, marginRight: 4 }} />Copy code
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn btn-outline"
                    style={{ width: '100%', marginTop: 14, fontSize: 13, padding: '10px 14px' }}
                    onClick={handleInvite}
                    disabled={inviteLoading}
                  >
                    <i className="ti ti-user-plus" />
                    {inviteLoading ? 'Generating…' : 'Invite your partner'}
                  </button>
                )
              )}
            </div>
          )}

          {/* Add kid sheet */}
          {addingKid && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, padding: '0 16px' }} onClick={() => setAddingKid(false)}>
              <div style={{ background: '#F2F4EC', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#2C3828', margin: '0 0 16px' }}>Add a child</p>
                <input
                  className="input-field"
                  placeholder="Name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  style={{ marginBottom: 10, fontSize: 16 }}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                  <div style={{ position: 'relative', flex: 2.2 }}>
                    <select value={newBdMonth} onChange={e => setNewBdMonth(e.target.value)} style={{ width: '100%', border: '1px solid #CCDAC8', borderRadius: 10, padding: '13px 32px 13px 14px', fontSize: 15, outline: 'none', background: '#fff', color: newBdMonth ? '#2C3828' : '#9AA89C', fontFamily: "'Inter', sans-serif", appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}>
                      <option value="" disabled>Month</option>
                      {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                        <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                      ))}
                    </select>
                    <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#9AA89C', fontSize: 12, pointerEvents: 'none' }} />
                  </div>
                  <input type="number" placeholder="Day" value={newBdDay} min={1} max={31} onChange={e => setNewBdDay(e.target.value)} style={{ flex: 1, border: '1px solid #CCDAC8', borderRadius: 10, padding: '13px 8px', fontSize: 15, outline: 'none', background: '#fff', color: '#2C3828', fontFamily: "'Inter', sans-serif", textAlign: 'center' }} />
                  <input type="number" placeholder="Year" value={newBdYear} min={1900} max={2030} onChange={e => setNewBdYear(e.target.value)} style={{ flex: 1.5, border: '1px solid #CCDAC8', borderRadius: 10, padding: '13px 8px', fontSize: 15, outline: 'none', background: '#fff', color: '#2C3828', fontFamily: "'Inter', sans-serif", textAlign: 'center' }} />
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', opacity: newName.trim() && newBirthdate && !addSaving ? 1 : 0.4 }}
                  disabled={!newName.trim() || !newBirthdate || addSaving}
                  onClick={handleSaveNewKid}
                >
                  {addSaving ? 'Saving…' : 'Add'}
                </button>
              </div>
            </div>
          )}

          {/* Rename kid sheet */}
          {editingKid && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, padding: '0 16px' }} onClick={() => setEditingKid(null)}>
              <div style={{ background: '#F2F4EC', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#2C3828', margin: '0 0 16px' }}>Rename {editingKid.name}</p>
                <input
                  className="input-field"
                  value={kidNameInput}
                  onChange={e => setKidNameInput(e.target.value)}
                  placeholder="Name"
                  style={{ marginBottom: 16, fontSize: 18 }}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter' && kidNameInput.trim()) { onRenameKid(editingKid.id, kidNameInput.trim()); setEditingKid(null); } }}
                />
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', opacity: kidNameInput.trim() ? 1 : 0.4 }}
                  disabled={!kidNameInput.trim()}
                  onClick={() => { onRenameKid(editingKid.id, kidNameInput.trim()); setEditingKid(null); }}
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Edit display name sheet */}
          {editingName && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, padding: '0 16px' }} onClick={() => setEditingName(false)}>
              <div style={{ background: '#F2F4EC', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#2C3828', margin: '0 0 16px' }}>What do the kids call you?</p>
                <input
                  className="input-field"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  placeholder="Mom, Dad, Mama…"
                  style={{ marginBottom: 16, fontSize: 18 }}
                  autoFocus
                />
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleSaveName}>Save</button>
              </div>
            </div>
          )}

          <button onClick={onSignOut} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#9AA89C', fontFamily: "'Inter', sans-serif", padding: '8px 0', fontWeight: 600, alignSelf: 'center' }}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Join family screen ───────────────────────────────────────────────────

function JoinFamilyScreen({ onJoin, onBack }) {
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleJoin() {
    if (!code.trim() || !displayName.trim()) return;
    setLoading(true);
    setError('');
    const result = await onJoin(code, displayName.trim());
    if (result?.error) { setError(result.error); setLoading(false); }
  }

  return (
    <div className="screen">
      <div className="scroll-area">
        <div style={{ padding: '60px 28px 48px', display: 'flex', flexDirection: 'column', minHeight: 560, justifyContent: 'center' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 32px', display: 'flex', alignItems: 'center', gap: 6, color: '#9AA89C', fontSize: 13, fontWeight: 600, fontFamily: "'Inter', sans-serif", alignSelf: 'flex-start' }}>
            <i className="ti ti-arrow-left" style={{ fontSize: 16 }} /> Back
          </button>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: '#2C3828', margin: '0 0 10px', lineHeight: 1.2 }}>
            Join a family journal
          </h2>
          <p style={{ fontSize: 14, color: '#7A8C78', lineHeight: 1.7, margin: '0 0 32px' }}>
            Enter the invite code your partner shared with you, then tell us what the kids call you.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            <input
              className="input-field"
              placeholder="Invite code (e.g. XK7P2M)"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              style={{ fontSize: 22, letterSpacing: 4, textAlign: 'center', fontWeight: 700 }}
            />
            <input
              className="input-field"
              placeholder="What do the kids call you? (Mom, Dad…)"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
            />
          </div>
          {error && <p style={{ fontSize: 13, color: '#D4856A', marginBottom: 12, textAlign: 'center' }}>{error}</p>}
          <button
            className="btn btn-primary"
            style={{ width: '100%', opacity: code.trim() && displayName.trim() && !loading ? 1 : 0.4 }}
            disabled={!code.trim() || !displayName.trim() || loading}
            onClick={handleJoin}
          >
            {loading ? 'Joining…' : 'Join family'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Nav bar ────────────────────────────────────────────────────────────

function NavBar({ active, onNavigate }) {

  const tabs = [
    { id: 'home', icon: 'ti-home', label: 'Home', color: '#F0897A' },
  ];
  const tabsRight = [
    { id: 'recap', icon: 'ti-calendar', label: 'Recaps', color: '#7BA99A' },
  ];

  function tabStyle(tab) {
    const isActive = active === tab.id;
    return { backgroundColor: isActive ? tab.color : 'transparent', color: isActive ? '#ffffff' : '#A89A85' };
  }

  return (
    <>
      <div className="nav-frame">
        <div className="nav-bar">
          {tabs.map(tab => (
            <button key={tab.id} className="nv-tab" style={tabStyle(tab)} onClick={() => onNavigate(tab.id)}>
              <i className={`ti ${tab.icon}`} />
              <span>{tab.label}</span>
            </button>
          ))}
          <div className="nv-add-wrap">
            <button className="nv-add" onClick={() => onNavigate('new-entry')}><i className="ti ti-plus" /></button>
          </div>
          {tabsRight.map(tab => (
            <button key={tab.id} className="nv-tab" style={tabStyle(tab)} onClick={() => onNavigate(tab.id)}>
              <i className={`ti ${tab.icon}`} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Auth screen ───────────────────────────────────────────────────────────

function AuthScreen() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit() {
    if (!email || !password) return;
    setLoading(true);
    setError('');
    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getAuthRedirectUrl(),
        },
      });
      if (error) setError(error.message);
      else setCheckEmail(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    }
    setLoading(false);
  }

  if (checkEmail) {
    return (
      <div className="screen">
        <div className="scroll-area">
          <div style={{ padding: '60px 28px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 560, textAlign: 'center', gap: 16 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#EEF2EA', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <i className="ti ti-mail-check" style={{ fontSize: 32, color: '#4A5E50' }} />
            </div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: '#2C3828', margin: 0 }}>Check your inbox</h2>
            <p style={{ fontSize: 14, color: '#7A8C78', lineHeight: 1.7, margin: 0 }}>
              We sent a confirmation link to<br />
              <strong style={{ color: '#4A5E50' }}>{email}</strong>
            </p>
            <button onClick={() => setCheckEmail(false)} style={{ background: 'none', border: 'none', color: '#4A5E50', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif", marginTop: 8 }}>
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="scroll-area">
        <div style={{ padding: '60px 28px 48px', display: 'flex', flexDirection: 'column', minHeight: 560, justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <div style={{ width: 76, height: 76, borderRadius: 24, background: '#4A5E50', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <span style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: 54, fontWeight: 700, color: '#C8993E', lineHeight: 1, userSelect: 'none', marginTop: 4 }}>P</span>
            </div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, color: '#2C3828', margin: '0 0 10px' }}>Patina</h1>
            <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 15, color: '#7A8C78', margin: 0 }}>
              For all the things you wish they knew.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            <input
              className="input-field"
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
            <input
              className="input-field"
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          {error && (
            <p style={{ fontSize: 13, color: '#D4856A', marginBottom: 12, textAlign: 'center', lineHeight: 1.4 }}>{error}</p>
          )}
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginBottom: 16, opacity: loading || !email || !password ? 0.5 : 1 }}
            disabled={loading || !email || !password}
            onClick={handleSubmit}
          >
            {loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
          <p style={{ textAlign: 'center', fontSize: 13, color: '#9AA89C', margin: 0 }}>
            {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
            <button
              onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4A5E50', fontWeight: 600, fontSize: 13, padding: 0, fontFamily: "'Inter', sans-serif" }}
            >
              {mode === 'signup' ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Onboarding ────────────────────────────────────────────────────────────

function OnboardingScreen({ onDone, onJoinFamily }) {
  const [step, setStep] = useState('welcome');
  const [doneKids, setDoneKids] = useState([]);
  const [name, setName] = useState('');
  const [bdMonth, setBdMonth] = useState('');
  const [bdDay, setBdDay] = useState('');
  const [bdYear, setBdYear] = useState('');
  const birthdate = (bdMonth && bdDay && bdYear && bdYear.length === 4)
    ? `${bdYear}-${bdMonth}-${bdDay.padStart(2, '0')}`
    : '';
  const [avatar, setAvatar] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const fileInputRef = useRef(null);

  const kidIndex = doneKids.length;
  const accent = KID_ACCENTS[kidIndex % KID_ACCENTS.length];
  const initial = name.trim() ? name.trim()[0].toUpperCase() : null;

  function goBack() {
    if (step === 'name') setStep('welcome');
    else if (step === 'birthdate') setStep('name');
    else if (step === 'photo') setStep('birthdate');
    else if (step === 'another') setStep('photo');
    else if (step === 'yourname') setStep('another');
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setAvatar(URL.createObjectURL(file));
    e.target.value = '';
  }

  function handleAnother() {
    setDoneKids(prev => [...prev, {
      id: kidIndex, name: name.trim(),
      accent: KID_ACCENTS[kidIndex % KID_ACCENTS.length],
      birthdate, avatar,
    }]);
    setName(''); setBdMonth(''); setBdDay(''); setBdYear(''); setAvatar(null);
    setStep('name');
  }

  function handleFinish() {
    setDoneKids(prev => [...prev, {
      id: kidIndex, name: name.trim(),
      accent: KID_ACCENTS[kidIndex % KID_ACCENTS.length],
      birthdate, avatar,
    }]);
    setStep('yourname');
  }

  function handleReallyDone() {
    onDone(doneKids, displayName.trim() || 'Parent');
  }

  return (
    <div className="screen">
      <div className="scroll-area">
        <div style={{ padding: '60px 28px 48px', display: 'flex', flexDirection: 'column', minHeight: 560 }}>

          {step !== 'welcome' && (
            <button onClick={goBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 36px', display: 'flex', alignItems: 'center', gap: 6, color: '#9AA89C', fontSize: 13, fontWeight: 600, fontFamily: "'Inter', sans-serif", alignSelf: 'flex-start' }}>
              <i className="ti ti-arrow-left" style={{ fontSize: 16 }} /> Back
            </button>
          )}

          {step === 'welcome' && (
            <div style={{ textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 76, height: 76, borderRadius: 24, background: '#4A5E50', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: 54, fontWeight: 700, color: '#C8993E', lineHeight: 1, userSelect: 'none', marginTop: 4 }}>P</span>
              </div>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 40, color: '#2C3828', margin: '0 0 14px', lineHeight: 1.1 }}>Patina</h1>
              <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 16, color: '#7A8C78', lineHeight: 1.8, margin: '0 0 52px' }}>
                For all the things you wish they knew.
              </p>
              <button className="btn btn-primary" style={{ width: '100%', marginBottom: 16 }} onClick={() => setStep('name')}>
                Begin
              </button>
              {onJoinFamily && (
                <button
                  onClick={onJoinFamily}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#9AA89C', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
                >
                  Joining your partner's family? Enter an invite code
                </button>
              )}
            </div>
          )}

          {step === 'name' && (
            <div style={{ flex: 1 }}>
              {doneKids.length > 0 && (
                <p style={{ fontSize: 13, color: '#9AA89C', marginBottom: 10 }}>
                  {doneKids.map(k => k.name).join(' & ')} {doneKids.length === 1 ? 'is' : 'are'} added. One more?
                </p>
              )}
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: '#2C3828', lineHeight: 1.25, margin: '0 0 36px' }}>
                What's your<br />child's name?
              </h2>
              <input
                className="input-field"
                placeholder="Name"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && name.trim() && setStep('birthdate')}
                autoFocus
                style={{ fontSize: 20, padding: '16px 18px', marginBottom: 24 }}
              />
              <button
                className="btn btn-primary"
                style={{ width: '100%', opacity: name.trim() ? 1 : 0.4 }}
                disabled={!name.trim()}
                onClick={() => setStep('birthdate')}
              >
                Continue
              </button>
            </div>
          )}

          {step === 'birthdate' && (
            <div style={{ flex: 1 }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: '#2C3828', lineHeight: 1.25, margin: '0 0 36px' }}>
                When was<br />{name} born?
              </h2>
              <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
                <div style={{ position: 'relative', flex: 2.2 }}>
                  <select
                    value={bdMonth}
                    onChange={e => setBdMonth(e.target.value)}
                    style={{
                      width: '100%', border: '1px solid #CCDAC8', borderRadius: 10,
                      padding: '15px 36px 15px 16px', fontSize: 16, outline: 'none',
                      background: '#fff', color: bdMonth ? '#2C3828' : '#9AA89C',
                      fontFamily: "'Inter', sans-serif", appearance: 'none',
                      WebkitAppearance: 'none', cursor: 'pointer',
                    }}
                  >
                    <option value="" disabled>Month</option>
                    {['January','February','March','April','May','June',
                      'July','August','September','October','November','December'].map((m, i) => (
                      <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                    ))}
                  </select>
                  <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#9AA89C', fontSize: 13, pointerEvents: 'none' }} />
                </div>
                <input
                  type="number"
                  placeholder="Day"
                  value={bdDay}
                  min={1} max={31}
                  onChange={e => setBdDay(e.target.value)}
                  style={{
                    flex: 1, border: '1px solid #CCDAC8', borderRadius: 10,
                    padding: '15px 10px', fontSize: 16, outline: 'none',
                    background: '#fff', color: '#2C3828', fontFamily: "'Inter', sans-serif",
                    textAlign: 'center', MozAppearance: 'textfield',
                  }}
                />
                <input
                  type="number"
                  placeholder="Year"
                  value={bdYear}
                  min={1900} max={2030}
                  onChange={e => setBdYear(e.target.value)}
                  style={{
                    flex: 1.5, border: '1px solid #CCDAC8', borderRadius: 10,
                    padding: '15px 10px', fontSize: 16, outline: 'none',
                    background: '#fff', color: '#2C3828', fontFamily: "'Inter', sans-serif",
                    textAlign: 'center', MozAppearance: 'textfield',
                  }}
                />
              </div>
              <button
                className="btn btn-primary"
                style={{ width: '100%', opacity: birthdate ? 1 : 0.4 }}
                disabled={!birthdate}
                onClick={() => setStep('photo')}
              >
                Continue
              </button>
            </div>
          )}

          {step === 'photo' && (
            <div style={{ flex: 1, textAlign: 'center' }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: '#2C3828', lineHeight: 1.25, margin: '0 0 8px' }}>
                Add a photo<br />of {name}?
              </h2>
              <p style={{ fontSize: 14, color: '#9AA89C', marginBottom: 40 }}>You can always add one later.</p>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 128, height: 128, borderRadius: '50%', margin: '0 auto 44px',
                  background: avatar ? 'transparent' : accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', overflow: 'hidden',
                  border: avatar ? '3px solid #ECE5D6' : '3px dashed rgba(255,255,255,0.45)',
                }}
              >
                {avatar
                  ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initial
                    ? <span style={{ fontSize: 48, fontWeight: 700, color: '#fff', fontFamily: "'Inter', sans-serif" }}>{initial}</span>
                    : <i className="ti ti-camera" style={{ fontSize: 32, color: 'rgba(255,255,255,0.7)' }} />
                }
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setStep('another')}>
                {avatar ? 'Looks good' : 'Skip for now'}
              </button>
            </div>
          )}

          {step === 'another' && (
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ marginBottom: 44 }}>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%', margin: '0 auto 14px',
                  background: avatar ? 'transparent' : accent,
                  overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: avatar ? '2px solid #ECE5D6' : 'none',
                }}>
                  {avatar
                    ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 32, fontWeight: 700, color: '#fff', fontFamily: "'Inter', sans-serif" }}>{initial}</span>
                  }
                </div>
                <p style={{ fontSize: 15, color: '#7A8C78', fontFamily: "'Source Serif 4', serif", fontStyle: 'italic' }}>{name} is all set.</p>
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: '#2C3828', lineHeight: 1.25, margin: '0 0 32px' }}>
                Do you have<br />another child?
              </h2>
              {kidIndex < 3 && (
                <button className="btn btn-outline" style={{ width: '100%', marginBottom: 12 }} onClick={handleAnother}>
                  Yes, add another
                </button>
              )}
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleFinish}>
                No, let's start writing
              </button>
            </div>
          )}

          {step === 'yourname' && (
            <div style={{ flex: 1 }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: '#2C3828', lineHeight: 1.25, margin: '0 0 12px' }}>
                One last thing —
              </h2>
              <p style={{ fontSize: 15, color: '#7A8C78', lineHeight: 1.7, margin: '0 0 32px' }}>
                What do the kids call you?
              </p>
              <input
                className="input-field"
                placeholder="Mom, Dad, Mama…"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleReallyDone()}
                autoFocus
                style={{ fontSize: 20, padding: '16px 18px', marginBottom: 24 }}
              />
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleReallyDone}>
                Start writing
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Root App ──────────────────────────────────────────────────────────────

export default function App() {
  const localMode = !supabaseConfigured;
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(!localMode);
  const [dataLoading, setDataLoading] = useState(false);
  const [kids, setKids] = useState(() => localMode ? loadLocalData().kids : []);
  const [entries, setEntries] = useState(() => localMode ? loadLocalData().entries : []);
  const [screen, setScreen] = useState('home');
  const [kidFilter, setKidFilter] = useState(null);
  const [activeEntry, setActiveEntry] = useState(null);
  const [profileKidId, setProfileKidId] = useState(() => localMode ? (loadLocalData().kids[0]?.id ?? null) : null);
  const [celebration, setCelebration] = useState(null);
  const [familyId, setFamilyId] = useState(null);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [myDisplayName, setMyDisplayName] = useState('');
  const [joiningFamily, setJoiningFamily] = useState(false);

  // Auth listener
  useEffect(() => {
    if (localMode || !supabase) {
      setAuthLoading(false);
      return undefined;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) { setKids([]); setEntries([]); }
    });
    return () => subscription.unsubscribe();
  }, [localMode]);

  useEffect(() => {
    if (!localMode || typeof window === 'undefined') return;
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ kids, entries }));
  }, [entries, kids, localMode]);

  // Load kids and entries after sign-in
  useEffect(() => {
    if (localMode || !session || !supabase) return;
    setDataLoading(true);
    async function loadData() {
      // Check family membership
      const { data: myMembership } = await supabase
        .from('family_members').select('*').eq('user_id', session.user.id).maybeSingle();

      let currentFamilyId = myMembership?.family_id ?? null;
      if (myMembership) {
        setFamilyId(currentFamilyId);
        setMyDisplayName(myMembership.display_name);
      }

      const [{ data: kidsData, error: kidsError }, { data: entriesData }] = await Promise.all([
        supabase.from('kids').select('*').order('created_at'),
        supabase.from('entries').select('*, entry_media(*)').order('date', { ascending: false }),
      ]);

      // Bad/expired session — sign out so the login screen appears
      if (kidsError && !kidsData) {
        await supabase.auth.signOut();
        setDataLoading(false);
        return;
      }

      // Auto-migrate existing user who has kids but no family yet
      if (!currentFamilyId && kidsData && kidsData.length > 0) {
        const { data: family } = await supabase.from('families').insert({}).select().single();
        if (family) {
          currentFamilyId = family.id;
          setFamilyId(currentFamilyId);
          const { data: mem } = await supabase.from('family_members').insert({
            family_id: currentFamilyId, user_id: session.user.id, display_name: 'Parent',
          }).select().single();
          setMyDisplayName('Parent');
          setFamilyMembers(mem ? [mem] : []);
          await supabase.from('kids').update({ family_id: currentFamilyId }).eq('user_id', session.user.id);
          await supabase.from('entries').update({ family_id: currentFamilyId }).eq('user_id', session.user.id);
        }
      } else if (currentFamilyId) {
        const { data: membersData } = await supabase.from('family_members').select('*').eq('family_id', currentFamilyId);
        if (membersData) setFamilyMembers(membersData);
      }

      if (kidsData) {
        setKids(kidsData.map(k => ({ id: k.id, name: k.name, birthdate: k.birthdate, accent: k.accent || KID_ACCENTS[0], avatar: k.avatar_url })));
        setProfileKidId(kidsData[0]?.id ?? null);
      }
      if (entriesData) {
        setEntries(entriesData.map(e => ({
          id: e.id, kids: e.kid_ids, date: e.date, text: e.text || '',
          mood: e.mood, milestone: e.milestone, ageMonths: e.age_months,
          palette: e.palette || PALETTES[0],
          media: (e.entry_media || []).map(m => ({ url: m.url, type: m.type })),
          signedAs: e.signed_as,
        })));
      }
      setDataLoading(false);
    }
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  function openEntry(entry) {
    setActiveEntry(entry);
    setScreen('entry-detail');
  }

  function editEntry(entry) {
    setActiveEntry(entry);
    setScreen('edit-entry');
  }

  async function handleSaveEntry({ kids: kidIds, text, mood, milestone, media, fileObjects, date, entryId, signedAs }) {
    const primaryKid = kids.find(k => k.id === kidIds[0]);
    const { years, months } = exactAge(primaryKid.birthdate, date);
    const ageMonths = years * 12 + months;

    // ── UPDATE existing entry ──
    if (entryId) {
      if (localMode || !supabase || !session) {
        setEntries(prev => prev.map(e => e.id === entryId ? { ...e, kids: kidIds, text: text || '', mood, milestone, date, ageMonths, media } : e));
        setScreen('home');
        return;
      }
      await supabase.from('entries').update({ kid_ids: kidIds, text: text || '', mood, milestone, date, age_months: ageMonths, signed_as: signedAs || null }).eq('id', entryId);

      // Delete existing media rows, then re-insert (handles removals + new uploads)
      await supabase.from('entry_media').delete().eq('entry_id', entryId);
      const finalMedia = [];
      for (let i = 0; i < media.length; i++) {
        const fileObj = fileObjects?.[i];
        let url = media[i].url;
        if (fileObj) {
          try {
            const ext = fileObj.type.startsWith('video') ? 'mp4' : 'jpg';
            const path = `${session.user.id}/${entryId}-edit${Date.now()}-${i}.${ext}`;
            const { error } = await supabase.storage.from('media').upload(path, fileObj);
            if (!error) {
              const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path);
              url = publicUrl;
            }
          } catch {}
        }
        finalMedia.push({ url, type: media[i].type });
      }
      if (finalMedia.length > 0) {
        await supabase.from('entry_media').insert(finalMedia.map(m => ({ entry_id: entryId, url: m.url, type: m.type })));
      }
      setEntries(prev => prev.map(e => e.id === entryId ? { ...e, kids: kidIds, text: text || '', mood, milestone, date, ageMonths, media: finalMedia, signedAs: signedAs || null } : e));
      setScreen('home');
      return;
    }

    // ── CREATE new entry ──
    const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];

    if (localMode || !supabase || !session) {
      const newEntry = {
        id: Date.now(),
        kids: kidIds,
        date,
        text: text || '',
        mood,
        milestone,
        ageMonths,
        palette,
        media: media.map(item => ({ url: item.url, type: item.type })),
      };
      setEntries(prev => [newEntry, ...prev]);
      if (milestone) {
        setCelebration({ kid: primaryKid, milestoneType: milestone });
      } else {
        setScreen('home');
      }
      return;
    }

    const { data: entry, error } = await supabase.from('entries').insert({
      user_id: session.user.id,
      family_id: familyId,
      author_id: session.user.id,
      signed_as: signedAs || null,
      kid_ids: kidIds,
      text: text || '',
      mood,
      milestone,
      date,
      age_months: ageMonths,
      palette,
    }).select().single();

    if (error || !entry) return;

    const savedMedia = [];
    for (let i = 0; i < media.length; i++) {
      const item = media[i];
      const fileObj = fileObjects?.[i];
      let url = item.url;
      if (fileObj) {
        try {
          const ext = fileObj.type.startsWith('video') ? 'mp4' : 'jpg';
          const path = `${session.user.id}/${entry.id}-${i}.${ext}`;
          const { error: uploadError } = await supabase.storage.from('media').upload(path, fileObj);
          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path);
            url = publicUrl;
          }
        } catch {}
      }
      savedMedia.push({ url, type: item.type });
    }

    if (savedMedia.length > 0) {
      await supabase.from('entry_media').insert(savedMedia.map(m => ({ entry_id: entry.id, url: m.url, type: m.type })));
    }

    const newEntry = { id: entry.id, kids: kidIds, date, text: text || '', mood, milestone, ageMonths, palette, media: savedMedia, signedAs: signedAs || null };
    setEntries(prev => [newEntry, ...prev]);

    if (milestone) {
      setCelebration({ kid: primaryKid, milestoneType: milestone });
    } else {
      setScreen('home');
    }
  }

  async function handleAvatarUpload(kidId, file) {
    const previousAvatar = kids.find(k => k.id === kidId)?.avatar ?? null;
    const localUrl = URL.createObjectURL(file);
    setKids(prev => prev.map(k => k.id === kidId ? { ...k, avatar: localUrl } : k));
    if (localMode || !supabase || !session) return;
    const { data: { session: activeSession } } = await supabase.auth.getSession();
    const activeUserId = activeSession?.user?.id;
    if (!activeUserId) {
      setKids(prev => prev.map(k => k.id === kidId ? { ...k, avatar: previousAvatar } : k));
      alert('Upload failed because your session expired. Please sign out and sign back in, then try again.');
      return;
    }
    const ext = file.name?.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${activeUserId}/avatar-${kidId}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('media').upload(path, file);
    if (uploadError) {
      setKids(prev => prev.map(k => k.id === kidId ? { ...k, avatar: previousAvatar } : k));
      const hint = uploadError.message?.includes('row-level security')
        ? ' Your account may not be fully signed in on this device yet. Try signing out and back in, then retry.'
        : '';
      alert('Photo upload failed: ' + uploadError.message + hint);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path);
    setKids(prev => prev.map(k => k.id === kidId ? { ...k, avatar: publicUrl } : k));
    const { error: dbError } = await supabase.from('kids').update({ avatar_url: publicUrl }).eq('id', kidId);
    if (dbError) {
      setKids(prev => prev.map(k => k.id === kidId ? { ...k, avatar: previousAvatar } : k));
      alert('Photo saved locally but failed to sync: ' + dbError.message);
    }
  }

  function openProfile(kidId) {
    setProfileKidId(kidId);
    setScreen('profile');
  }

  async function handleOnboardingDone(newKids, displayName = 'Parent') {
    if (localMode || !supabase || !session) {
      const normalizedKids = newKids.map((kid, i) => ({
        ...kid,
        id: kid.id ?? Date.now() + i,
        accent: kid.accent || KID_ACCENTS[i % KID_ACCENTS.length],
      }));
      setKids(normalizedKids);
      setProfileKidId(normalizedKids[0]?.id ?? null);
      return;
    }
    const userId = session.user.id;
    const { data: family } = await supabase.from('families').insert({}).select().single();
    const newFamilyId = family.id;
    setFamilyId(newFamilyId);
    const { data: mem } = await supabase.from('family_members').insert({
      family_id: newFamilyId, user_id: userId, display_name: displayName,
    }).select().single();
    setMyDisplayName(displayName);
    setFamilyMembers(mem ? [mem] : []);
    const { data } = await supabase.from('kids').insert(
      newKids.map((k, i) => ({
        user_id: userId,
        family_id: newFamilyId,
        name: k.name,
        birthdate: k.birthdate,
        accent: k.accent || KID_ACCENTS[i % KID_ACCENTS.length],
        avatar_url: null,
      }))
    ).select();
    if (data) {
      setKids(data.map(k => ({ id: k.id, name: k.name, birthdate: k.birthdate, accent: k.accent, avatar: k.avatar_url })));
      setProfileKidId(data[0]?.id ?? null);
    }
  }

  async function handleJoinFamily(code, displayName) {
    if (!supabase || !session) return { error: 'Not authenticated' };
    const { data: invite } = await supabase
      .from('family_invites').select('*')
      .eq('token', code.toUpperCase().trim()).is('accepted_at', null).maybeSingle();
    if (!invite) return { error: 'Invalid or expired code — check with your partner' };
    const { error: joinError } = await supabase.from('family_members').insert({
      family_id: invite.family_id, user_id: session.user.id, display_name: displayName,
    });
    if (joinError) return { error: 'Could not join — you may already be in this family' };
    await supabase.from('family_invites').update({ accepted_at: new Date().toISOString() }).eq('id', invite.id);
    setFamilyId(invite.family_id);
    setMyDisplayName(displayName);
    const [{ data: kidsData }, { data: entriesData }, { data: membersData }] = await Promise.all([
      supabase.from('kids').select('*').order('created_at'),
      supabase.from('entries').select('*, entry_media(*)').order('date', { ascending: false }),
      supabase.from('family_members').select('*').eq('family_id', invite.family_id),
    ]);
    if (kidsData) {
      setKids(kidsData.map(k => ({ id: k.id, name: k.name, birthdate: k.birthdate, accent: k.accent || KID_ACCENTS[0], avatar: k.avatar_url })));
      setProfileKidId(kidsData[0]?.id ?? null);
    }
    if (entriesData) {
      setEntries(entriesData.map(e => ({
        id: e.id, kids: e.kid_ids, date: e.date, text: e.text || '',
        mood: e.mood, milestone: e.milestone, ageMonths: e.age_months,
        palette: e.palette || PALETTES[0],
        media: (e.entry_media || []).map(m => ({ url: m.url, type: m.type })),
        signedAs: e.signed_as,
      })));
    }
    if (membersData) setFamilyMembers(membersData);
    setScreen('home');
    return { success: true };
  }

  async function handleInvitePartner() {
    if (!familyId || !supabase || !session) return null;
    const token = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { error } = await supabase.from('family_invites').insert({
      family_id: familyId, invited_by: session.user.id, token,
    });
    return error ? null : token;
  }

  async function handleRenameKid(kidId, name) {
    setKids(prev => prev.map(k => k.id === kidId ? { ...k, name } : k));
    if (localMode || !supabase || !session) return;
    await supabase.from('kids').update({ name }).eq('id', kidId);
  }

  async function handleAddKid({ name, birthdate }) {
    const accent = KID_ACCENTS[kids.length % KID_ACCENTS.length];
    if (localMode || !supabase || !session) {
      const newKid = { id: Date.now(), name, birthdate, accent, avatar: null };
      setKids(prev => [...prev, newKid]);
      return;
    }
    const { data } = await supabase.from('kids').insert({
      user_id: session.user.id,
      family_id: familyId,
      name,
      birthdate,
      accent,
      avatar_url: null,
    }).select().single();
    if (data) {
      setKids(prev => [...prev, { id: data.id, name: data.name, birthdate: data.birthdate, accent: data.accent, avatar: null }]);
    }
  }

  async function handleUpdateDisplayName(name) {
    setMyDisplayName(name);
    setFamilyMembers(prev => prev.map(m => m.user_id === session?.user.id ? { ...m, display_name: name } : m));
    if (!supabase || !session || !familyId) return;
    await supabase.from('family_members').update({ display_name: name })
      .eq('family_id', familyId).eq('user_id', session.user.id);
  }

  async function handleFamilyAvatarUpload(memberId, file) {
    const previousAvatar = familyMembers.find(m => m.id === memberId || m.user_id === memberId)?.avatar_url ?? null;
    const localUrl = URL.createObjectURL(file);
    setFamilyMembers(prev => prev.map(m => (m.id === memberId || m.user_id === memberId) ? { ...m, avatar_url: localUrl } : m));
    if (localMode || !supabase || !session || !familyId) return;
    const { data: { session: activeSession } } = await supabase.auth.getSession();
    const activeUserId = activeSession?.user?.id;
    if (!activeUserId) {
      setFamilyMembers(prev => prev.map(m => (m.id === memberId || m.user_id === memberId) ? { ...m, avatar_url: previousAvatar } : m));
      alert('Upload failed because your session expired. Please sign out and sign back in, then try again.');
      return;
    }
    const ext = file.name?.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${activeUserId}/family-avatar-${memberId}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('media').upload(path, file);
    if (uploadError) {
      setFamilyMembers(prev => prev.map(m => (m.id === memberId || m.user_id === memberId) ? { ...m, avatar_url: previousAvatar } : m));
      const hint = uploadError.message?.includes('row-level security')
        ? ' Your account may not be fully signed in on this device yet. Try signing out and back in, then retry.'
        : '';
      alert('Photo upload failed: ' + uploadError.message + hint);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path);
    setFamilyMembers(prev => prev.map(m => (m.id === memberId || m.user_id === memberId) ? { ...m, avatar_url: publicUrl } : m));
    const { error: dbError } = await supabase.from('family_members').update({ avatar_url: publicUrl })
      .eq('family_id', familyId).eq('user_id', session.user.id);
    if (dbError) {
      setFamilyMembers(prev => prev.map(m => (m.id === memberId || m.user_id === memberId) ? { ...m, avatar_url: previousAvatar } : m));
      if (dbError.message?.includes("avatar_url")) {
        alert("Your photo uploaded, but your Supabase database is missing the family_members.avatar_url column. Run the SQL in family-members-avatar-column.sql, then try again.");
      } else {
        alert('Photo saved locally but failed to sync: ' + dbError.message);
      }
    }
  }

  if (authLoading || dataLoading) {
    return (
      <div className="app-root" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <i className="ti ti-loader-2" style={{ fontSize: 32, color: '#9AA89C', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (!session && !localMode) {
    return (
      <div className="app-root">
        <AuthScreen />
      </div>
    );
  }

  if (kids.length === 0) {
    return (
      <div className="app-root">
        {joiningFamily
          ? <JoinFamilyScreen onJoin={handleJoinFamily} onBack={() => setJoiningFamily(false)} />
          : <OnboardingScreen onDone={handleOnboardingDone} onJoinFamily={() => setJoiningFamily(true)} />
        }
      </div>
    );
  }

  return (
    <div className="app-root">
      {screen === 'home' && (
        <HomeScreen
          entries={entries}
          kids={kids}
          kidFilter={kidFilter}
          setKidFilter={setKidFilter}
          onOpenEntry={openEntry}
          onSearch={() => setScreen('search')}
          onManage={() => openProfile(kids[0].id)}
          onAddMoment={() => setScreen('new-entry')}
          onSeeAll={() => setScreen('journal')}
        />
      )}

      {screen === 'journal' && (
        <JournalScreen
          entries={entries}
          kids={kids}
          kidFilter={kidFilter}
          setKidFilter={setKidFilter}
          onOpenEntry={openEntry}
          onNewEntry={() => setScreen('new-entry')}
        />
      )}

      {screen === 'entry-detail' && activeEntry && (
        <EntryDetailScreen
          entry={activeEntry}
          kid={kids.find(k => k.id === activeEntry.kids[0])}
          allKids={kids}
          onBack={() => setScreen('home')}
          onEdit={editEntry}
        />
      )}

      {screen === 'new-entry' && (
        <NewEntryScreen kids={kids} onCancel={() => setScreen('home')} onSave={handleSaveEntry} signedDefault={myDisplayName || undefined} />
      )}

      {screen === 'edit-entry' && activeEntry && (
        <NewEntryScreen
          kids={kids}
          existingEntry={activeEntry}
          onCancel={() => setScreen('entry-detail')}
          onSave={handleSaveEntry}
          signedDefault={myDisplayName || undefined}
        />
      )}

      {screen === 'recap' && (
        <RecapScreen
          entries={entries}
          kids={kids}
          onBack={() => setScreen('home')}
          onOpenEntry={openEntry}
          onCompare={() => setScreen('compare')}
        />
      )}

      {screen === 'compare' && (
        <CompareScreen entries={entries} kids={kids} onBack={() => setScreen('home')} onOpenEntry={openEntry} />
      )}

      {screen === 'search' && (
        <SearchScreen entries={entries} kids={kids} onBack={() => setScreen('home')} onOpenEntry={openEntry} />
      )}

{screen === 'profile' && (
        <ProfileScreen
          kids={kids}
          entries={entries}
          onBack={() => setScreen('home')}
          onAvatarUpload={handleAvatarUpload}
          familyMembers={familyMembers}
          myDisplayName={myDisplayName}
          onInvite={handleInvitePartner}
          onUpdateDisplayName={handleUpdateDisplayName}
          onAddKid={handleAddKid}
          onRenameKid={handleRenameKid}
          onFamilyAvatarUpload={handleFamilyAvatarUpload}
          currentUserId={session?.user?.id}
          onSignOut={() => {
            if (localMode || !supabase) {
              setKids([]);
              setEntries([]);
              setProfileKidId(null);
              setScreen('home');
              if (typeof window !== 'undefined') {
                window.localStorage.removeItem(LOCAL_STORAGE_KEY);
              }
              return;
            }
            supabase.auth.signOut();
          }}
        />
      )}

      {screen !== 'entry-detail' && screen !== 'new-entry' && screen !== 'edit-entry' && screen !== 'profile' && (
        <NavBar active={screen} onNavigate={setScreen} />
      )}
      {screen === 'profile' && <NavBar active="home" onNavigate={setScreen} />}

      {celebration && (
        <CelebrationOverlay
          kid={celebration.kid}
          milestoneType={celebration.milestoneType}
          onDone={() => { setCelebration(null); setScreen('journal'); }}
        />
      )}
    </div>
  );
}
