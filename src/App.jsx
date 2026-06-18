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
        <img src={kid.avatar} alt={kid.name} />
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
      <KidChip active={selected === null} onClick={() => onSelect(null)} icon="ti-users" label="Both" />
      {kids.map(k => (
        <KidChip key={k.id} kid={k} active={selected === k.id} onClick={() => onSelect(k.id)} />
      ))}
      <KidChip icon="ti-settings" label="Manage" onClick={onManage} />
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

function LetterCard({ entry, kid, allKids, featured, onClick }) {
  const preview = entry.text.length > (featured ? 160 : 110)
    ? entry.text.slice(0, featured ? 160 : 110) + '…'
    : entry.text;
  const dateLabel = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div onClick={onClick} style={{ background: '#F8FAF6', border: '1px solid #C4D8C0', borderRadius: 16, overflow: 'hidden', cursor: 'pointer' }}>
      {entry.media && entry.media.length > 0 && (
        <div style={{ height: featured ? 200 : 150, backgroundImage: `url('${entry.media[0].url}')`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      )}
      <div style={{ padding: '16px 18px 14px' }}>
        <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 12, color: '#9AA89C', margin: '0 0 7px' }}>
          Dear {allKids ? buildSalutation(entry, allKids) : kid.name},
        </p>
        {preview && (
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: featured ? 16 : 14, color: '#2C3828', margin: '0 0 14px', lineHeight: 1.65 }}>
            {preview}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <KidThumb kid={kid} size={18} />
          <span style={{ fontSize: 11, color: '#9AA89C' }}>
            {exactAgeLabel(kid.birthdate, entry.date)} · {dateLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

function OnThisDayCard({ entry, kid, allKids, yearsAgo, onClick }) {
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
          <div style={{ height: 230, backgroundImage: `url('${entry.media[0].url}')`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <KidThumb kid={kid} size={20} />
            <span style={{ fontSize: 12, color: '#9AA89C' }}>
              {kid.name} was {exactAgeLabel(kid.birthdate, entry.date)}
            </span>
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

function HomeScreen({ entries, kids, onOpenEntry, onSearch, onManage, kidFilter, setKidFilter, onAddMoment, onSeeAll }) {
  const todayMMDD = TODAY.slice(5);
  const todayYear = parseInt(TODAY.slice(0, 4));
  const todayLabel = new Date(TODAY + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const onThisDay = entries
    .filter(e => e.date.slice(5) === todayMMDD && parseInt(e.date.slice(0, 4)) < todayYear)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const recent = [...entries]
    .filter(e => kidFilter === null || e.kids.includes(kidFilter))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 4);

  const letterCounts = kids.map(k => ({ kid: k, count: entries.filter(e => e.kids.includes(k.id)).length }));

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
        <div className="scroll-area">
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

          {onThisDay.length > 0 && (() => {
            const entry = onThisDay[0];
            const kid = kids.find(k => k.id === entry.kids[0]);
            const yearsAgo = todayYear - parseInt(entry.date.slice(0, 4));
            return <OnThisDayCard entry={entry} kid={kid} allKids={kids} yearsAgo={yearsAgo} onClick={() => onOpenEntry(entry)} />;
          })()}

          {recent.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SectionDivider label="Recent letters" />
              {recent.map((entry, idx) => {
                const kid = kids.find(k => k.id === entry.kids[0]);
                return <LetterCard key={entry.id} entry={entry} kid={kid} allKids={kids} featured={idx === 0} onClick={() => onOpenEntry(entry)} />;
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

function EntryDetailScreen({ entry, kid, onBack }) {
  const m = entry.milestone ? milestoneInfo(entry.milestone) : null;
  const media = entry.media || [];
  const [activeSlide, setActiveSlide] = useState(0);

  return (
    <div className="screen">
      <div className="scroll-area">
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}>
            <button className="icon-btn-ghost" onClick={onBack}><i className="ti ti-arrow-left" /></button>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <KidThumb kid={kid} size={32} />
            <div>
              <p style={{ fontSize: 16, color: '#4A5E50', margin: 0, fontWeight: 700 }}>{kid.name}</p>
              <p style={{ fontSize: 12, color: '#9AA89C', margin: '2px 0 0' }}>
                {exactAgeLabel(kid.birthdate, entry.date)} old · {new Date(entry.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>
          <p style={{ fontSize: 17, color: '#2C3828', lineHeight: 1.8, margin: 0, fontFamily: "'Source Serif 4', serif", fontStyle: entry.text ? 'italic' : 'normal' }}>{entry.text}</p>
          <div style={{ height: 1, background: '#CCDAC8' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: 12, color: '#9AA89C' }}>Feeling</span>
            <span className="chip selected" style={{ cursor: 'default' }}>{entry.mood}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── New entry form ────────────────────────────────────────────────────────

function NewEntryScreen({ kids, onCancel, onSave }) {
  const [selectedKids, setSelectedKids] = useState(kids.length === 1 ? [kids[0].id] : []);
  const [text, setText] = useState('');
  const [mood, setMood] = useState(null);
  const [milestoneType, setMilestoneType] = useState(null);
  const [media, setMedia] = useState([]);
  const [fileObjects, setFileObjects] = useState([]);
  const [saving, setSaving] = useState(false);
  const [entryDate, setEntryDate] = useState(TODAY);
  const [dateFromPhoto, setDateFromPhoto] = useState(false);
  const [showExtras, setShowExtras] = useState(false);
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
      mood: mood || 'Joyful',
      milestone: milestoneType || null,
      media,
      fileObjects,
      date: entryDate,
    });
    setSaving(false);
  }

  const canSave = selectedKids.length > 0 && (text.trim().length > 0 || media.length > 0);

  return (
    <div className="screen" style={{ background: '#F8FAF6', position: 'relative' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', flexShrink: 0 }}>
        <button className="icon-btn" onClick={onCancel}><i className="ti ti-x" /></button>
        <button
          className="btn btn-primary"
          style={{ padding: '9px 22px', fontSize: 14, borderRadius: 10, opacity: canSave && !saving ? 1 : 0.4 }}
          disabled={!canSave || saving}
          onClick={handleSave}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
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
          autoFocus
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

      {/* Bottom toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px 24px', borderTop: '1px solid #D4E4D0', flexShrink: 0, background: '#F8FAF6', position: 'relative' }}>
        {showMediaMenu && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setShowMediaMenu(false)} />
            <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 16, background: '#fff', border: '1px solid #CCDAC8', borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', minWidth: 210, zIndex: 10 }}>
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
        <button onClick={() => setShowExtras(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', color: showExtras ? '#4A5E50' : '#9AA89C', fontSize: 20, borderRadius: 10 }}>
          <i className="ti ti-dots" />
        </button>
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileChange} />
        <input ref={uploadInputRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={handleFileChange} />
      </div>

      {/* Date edit sheet */}
      {editingDate && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '0 16px' }} onClick={() => setEditingDate(false)}>
          <div style={{ background: '#F2F4EC', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#2C3828', margin: '0 0 16px' }}>When did this happen?</p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <div style={{ position: 'relative', flex: 2.2 }}>
                <select value={editMonth} onChange={e => setEditMonth(e.target.value)} style={{ width: '100%', border: '1px solid #CCDAC8', borderRadius: 10, padding: '14px 36px 14px 14px', fontSize: 15, outline: 'none', background: '#fff', color: editMonth ? '#2C3828' : '#9AA89C', fontFamily: "'Inter', sans-serif", appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}>
                  <option value="" disabled>Month</option>
                  {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                    <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                  ))}
                </select>
                <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#9AA89C', fontSize: 13, pointerEvents: 'none' }} />
              </div>
              <input type="number" placeholder="Day" value={editDay} min={1} max={31} onChange={e => setEditDay(e.target.value)} style={{ flex: 1, border: '1px solid #CCDAC8', borderRadius: 10, padding: '14px 10px', fontSize: 15, outline: 'none', background: '#fff', color: '#2C3828', fontFamily: "'Inter', sans-serif", textAlign: 'center' }} />
              <input type="number" placeholder="Year" value={editYear} min={1900} max={2030} onChange={e => setEditYear(e.target.value)} style={{ flex: 1.5, border: '1px solid #CCDAC8', borderRadius: 10, padding: '14px 10px', fontSize: 15, outline: 'none', background: '#fff', color: '#2C3828', fontFamily: "'Inter', sans-serif", textAlign: 'center' }} />
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

function RecapScreen({ entries, kids, onBack, onOpenEntry, onCompare }) {
  const [selectedMonth, setSelectedMonth] = useState(TODAY.slice(0, 7));

  const monthEntries = entries.filter(e => e.date.startsWith(selectedMonth));
  const momentCount = monthEntries.length;
  const milestoneCount = monthEntries.filter(e => e.milestone).length;
  const photoCount = monthEntries.reduce((sum, e) => sum + (e.media?.length || 0), 0);
  const monthMilestones = monthEntries.filter(e => e.milestone);
  const monthLabel = new Date(selectedMonth + '-15T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const canGoNext = selectedMonth < TODAY.slice(0, 7);

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

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9AA89C', fontSize: 16, padding: 4, display: 'flex' }}>
                <i className="ti ti-chevron-left" />
              </button>
              <h2 style={{ fontSize: 16, color: '#4A5E50', margin: 0, fontWeight: 700, minWidth: 130, textAlign: 'center' }}>{monthLabel}</h2>
              <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: canGoNext ? 'pointer' : 'default', color: canGoNext ? '#9AA89C' : 'transparent', fontSize: 16, padding: 4, display: 'flex' }}>
                <i className="ti ti-chevron-right" />
              </button>
            </div>
            <div style={{ width: 36 }} />
          </div>

          {momentCount === 0 ? (
            <div className="empty-state">
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#EEF2EA', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <i className="ti ti-calendar" style={{ fontSize: 22, color: '#9AA89C' }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#4A5E50', margin: '0 0 6px' }}>Nothing written</p>
              <p style={{ fontSize: 13, color: '#9AA89C', margin: 0 }}>No moments logged in {monthLabel}.</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1.3, background: '#4A5E50', borderRadius: 14, padding: 16 }}>
                  <p style={{ fontSize: 36, fontWeight: 800, color: '#C8993E', margin: 0, lineHeight: 1 }}>{momentCount}</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: '5px 0 0', fontWeight: 600 }}>moment{momentCount !== 1 ? 's' : ''} logged</p>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ background: '#EEF2EA', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, padding: '12px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#4A5E50' }}>milestones</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: '#4A5E50' }}>{milestoneCount}</span>
                  </div>
                  <div style={{ background: '#EDE8DE', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, padding: '12px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#7A6850' }}>photos</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: '#7A6850' }}>{photoCount}</span>
                  </div>
                </div>
              </div>

              {monthMilestones.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {monthMilestones.map(e => {
                    const kid = kids.find(k => k.id === e.kids[0]);
                    const m = milestoneInfo(e.milestone);
                    return (
                      <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer', background: '#fff', border: '1px solid #C4D8C0', borderRadius: 12, padding: '12px 14px' }} onClick={() => onOpenEntry(e)}>
                        <KidThumb kid={kid} size={34} />
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 14, fontWeight: 600, color: '#4A5E50', margin: 0 }}>{m.label}</p>
                          <p style={{ fontSize: 12, color: '#9AA89C', margin: '1px 0 0' }}>{kid.name} · {exactAgeLabel(kid.birthdate, e.date)}</p>
                        </div>
                        <i className={`ti ${m.icon}`} style={{ color: '#C8993E', fontSize: 17 }} />
                      </div>
                    );
                  })}
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
  const [compareAge, setCompareAge] = useState(24);
  const ages = [12, 18, 24, 36, 48, 60, 72];

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            <h2 style={{ fontSize: 16, color: '#4A5E50', margin: 0, fontWeight: 700 }}>At this age</h2>
            <div style={{ width: 36 }} />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#5C6B5E', marginBottom: 9 }}>Pick an age</p>
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
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {kids.map(kid => {
              const matches = entries.filter(e => e.kids.includes(kid.id) && Math.abs(e.ageMonths - compareAge) <= 3);
              return (
                <div key={kid.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <KidThumb kid={kid} />
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#4A5E50', margin: 0 }}>{kid.name}</p>
                  </div>
                  {matches.length === 0 ? (
                    <div style={{ background: '#fff', border: '1px dashed #D8CFBC', borderRadius: 12, padding: '24px 12px', textAlign: 'center' }}>
                      <p style={{ fontSize: 12, color: '#9AA89C', margin: 0 }}>No moments yet at this age</p>
                    </div>
                  ) : matches.map(e => {
                    const m = e.milestone ? milestoneInfo(e.milestone) : null;
                    return (
                      <div key={e.id} style={{ borderRadius: 12, overflow: 'hidden' }} onClick={() => onOpenEntry(e)}>
                        <div className="compare-photo" style={entryBgStyle(e)}>
                          <div className="scrim" style={tintedScrimStyle(e, 0.5)} />
                          <div style={{ position: 'relative', zIndex: 2, padding: 10, width: '100%' }}>
                            <p style={{ fontSize: 11, color: '#fff', margin: '0 0 4px', fontWeight: 700 }}>{exactAgeLabel(kid.birthdate, e.date)}</p>
                            {m && <p style={{ fontSize: 11, color: '#fff', margin: 0, fontWeight: 600, opacity: 0.9 }}>{m.label}</p>}
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

// ─── Recap reel ────────────────────────────────────────────────────────────

function RecapReelScreen({ entries, kids, onClose }) {
  const slides = (() => {
    const ms = entries.filter(e => e.milestone).sort((a, b) => new Date(a.date) - new Date(b.date));
    return ms.length ? ms : entries.slice(0, 4);
  })();

  const [index, setIndex] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (index < slides.length - 1) setIndex(index + 1);
      else onClose();
    }, 3500);
    return () => clearTimeout(timerRef.current);
  }, [index]);

  function prev() { if (index > 0) setIndex(index - 1); }
  function next() { if (index < slides.length - 1) setIndex(index + 1); else onClose(); }

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad" style={{ paddingBottom: 0 }}>
          <button className="icon-btn" onClick={onClose} style={{ alignSelf: 'flex-start' }}><i className="ti ti-x" /></button>
        </div>
        <div style={{ padding: '8px 36px 24px' }}>
          <div className="reel-stage">
            <div className="reel-progress">
              {slides.map((_, i) => (
                <div className="reel-progress-seg" key={i}>
                  <div
                    className="reel-progress-fill"
                    style={{
                      width: i < index ? '100%' : i === index ? '100%' : '0%',
                      transition: i === index ? 'width 3.5s linear' : 'none',
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="reel-tap-zone" style={{ left: 0 }} onClick={prev} />
            <div className="reel-tap-zone" style={{ right: 0 }} onClick={next} />
            {slides.map((e, i) => {
              const kid = kids.find(k => k.id === e.kids[0]);
              const m = e.milestone ? milestoneInfo(e.milestone) : null;
              return (
                <div key={e.id} className="reel-slide" style={{ opacity: i === index ? 1 : 0, ...entryBgStyle(e) }}>
                  <div className="scrim" style={tintedScrimStyle(e, 0.72)} />
                  <div style={{ position: 'relative', zIndex: 3, padding: '20px 22px 32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <KidThumb kid={kid} size={28} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{kid.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.22)', color: '#fff' }}>
                        {exactAgeLabel(kid.birthdate, e.date)}
                      </span>
                    </div>
                    {m && (
                      <div style={{ display: 'inline-block', marginBottom: 10, fontSize: 11, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.2)', padding: '5px 10px', borderRadius: 7 }}>
                        {m.label.toUpperCase()}
                      </div>
                    )}
                    <p style={{ fontSize: 16, color: '#fff', lineHeight: 1.5, margin: 0, fontWeight: 500 }}>{e.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Profile / manage kids ─────────────────────────────────────────────────

function ProfileScreen({ kids, entries, selectedKidId, setSelectedKidId, onBack, onAvatarUpload, onSignOut }) {
  const kid = kids.find(k => k.id === selectedKidId);
  const kidEntries = entries.filter(e => e.kids.includes(selectedKidId));
  const milestoneCount = kidEntries.filter(e => e.milestone).length;
  const fileInputRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    onAvatarUpload(selectedKidId, file);
    e.target.value = '';
  }

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            <h2 style={{ fontSize: 16, color: '#4A5E50', margin: 0, fontWeight: 700 }}>Manage kids</h2>
            <div style={{ width: 36 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 22 }}>
            {kids.map(k => (
              <div key={k.id} style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => setSelectedKidId(k.id)}>
                <div
                  className="avatar-upload-zone"
                  style={k.id === selectedKidId ? { boxShadow: `0 0 0 2px ${k.accent}` } : {}}
                >
                  {k.avatar ? <img src={k.avatar} alt={k.name} /> : <i className="ti ti-camera" />}
                </div>
                <p style={{ fontSize: 13, color: k.id === selectedKidId ? '#4A5E50' : '#9AA89C', margin: '8px 0 0', fontWeight: 600 }}>
                  {k.name}
                </p>
              </div>
            ))}
            <div style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => alert('Add a new kid profile here — same flow as the existing two.')}>
              <div className="avatar-upload-zone"><i className="ti ti-plus" /></div>
              <p style={{ fontSize: 13, color: '#9AA89C', margin: '8px 0 0', fontWeight: 600 }}>Add kid</p>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <button className="btn btn-outline" style={{ width: 'auto', padding: '10px 22px', margin: '0 auto' }} onClick={() => fileInputRef.current?.click()}>
              <i className="ti ti-upload" />Upload photo for {kid.name}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
          </div>
          <div style={{ background: '#fff', border: '1px solid #ECE5D6', borderRadius: 14, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <KidThumb kid={kid} size={38} />
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#4A5E50', margin: 0 }}>{kid.name}</p>
                <p style={{ fontSize: 12, color: '#9AA89C', margin: '2px 0 0' }}>
                  Born {new Date(kid.birthdate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="stat-tile">
                <p style={{ fontSize: 18, color: '#4A5E50', margin: 0, fontWeight: 700 }}>{kidEntries.length}</p>
                <p style={{ fontSize: 11, color: '#9AA89C', margin: '3px 0 0' }}>moments</p>
              </div>
              <div className="stat-tile">
                <p style={{ fontSize: 18, color: '#4A5E50', margin: 0, fontWeight: 700 }}>{milestoneCount}</p>
                <p style={{ fontSize: 11, color: '#9AA89C', margin: '3px 0 0' }}>milestones</p>
              </div>
            </div>
          </div>
          <button onClick={onSignOut} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#9AA89C', fontFamily: "'Inter', sans-serif", padding: '8px 0', fontWeight: 600, alignSelf: 'center' }}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Import review ─────────────────────────────────────────────────────────

function ImportReviewScreen({ initialPhotos, processing, kids, onBack, onImport }) {
  const [photos, setPhotos] = useState(initialPhotos);

  useEffect(() => { setPhotos(initialPhotos); }, [initialPhotos]);

  function update(id, field, value) {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  }

  if (processing) {
    return (
      <div className="screen">
        <div className="scroll-area" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <i className="ti ti-loader-2" style={{ fontSize: 36, color: '#9AA89C', display: 'block', marginBottom: 12, animation: 'spin 1s linear infinite' }} />
            <p style={{ fontSize: 14, color: '#9AA89C', margin: 0 }}>Reading photo dates…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-x" /></button>
            <h2 style={{ fontSize: 16, color: '#4A5E50', margin: 0, fontWeight: 700 }}>
              Review {photos.length} photo{photos.length !== 1 ? 's' : ''}
            </h2>
            <div style={{ width: 36 }} />
          </div>

          <p style={{ fontSize: 13, color: '#9AA89C', margin: 0, lineHeight: 1.5 }}>
            Assign each photo to a child. Dates are read from photo metadata.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {photos.map(photo => (
              <div key={photo.id} style={{ background: '#fff', border: '1px solid #ECE5D6', borderRadius: 14, padding: 12, display: 'flex', gap: 12 }}>
                <img src={photo.url} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {kids.map(k => (
                      <div
                        key={k.id}
                        className={`kid-chip ${photo.kidId === k.id ? 'active' : ''}`}
                        style={photo.kidId === k.id ? { background: k.accent } : {}}
                        onClick={() => update(photo.id, 'kidId', k.id)}
                      >
                        <KidThumb kid={k} size={16} />{k.name}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="ti ti-calendar" style={{ color: '#9AA89C', fontSize: 13, flexShrink: 0 }} />
                    <input
                      type="date"
                      value={photo.date}
                      onChange={e => update(photo.id, 'date', e.target.value)}
                      style={{ border: 'none', outline: 'none', fontSize: 12, background: 'transparent', color: '#4A5E50', fontFamily: 'Inter, sans-serif', flex: 1, padding: 0 }}
                    />
                    {!photo.dateFromExif && (
                      <span style={{ fontSize: 10, color: '#F0897A', fontWeight: 600, whiteSpace: 'nowrap' }}>no date found</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setPhotos(prev => prev.filter(p => p.id !== photo.id))}
                  style={{ background: 'none', border: 'none', color: '#C4BAA8', cursor: 'pointer', padding: 0, alignSelf: 'flex-start', fontSize: 18 }}
                >
                  <i className="ti ti-x" />
                </button>
              </div>
            ))}
          </div>

          {photos.length > 0 && (
            <button
              className="btn btn-primary"
              onClick={() => onImport(photos)}
              disabled={photos.some(p => p.kidId === null)}
              style={{ opacity: photos.some(p => p.kidId === null) ? 0.45 : 1 }}
            >
              Import {photos.length} moment{photos.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Nav bar ────────────────────────────────────────────────────────────

function NavBar({ active, onNavigate, onImportFiles }) {
  const [showMenu, setShowMenu] = useState(false);
  const importRef = useRef(null);

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

  const menuBtn = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: '#4A5E50', fontWeight: 600, fontFamily: 'Inter, sans-serif', textAlign: 'left' };

  return (
    <>
      {showMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setShowMenu(false)}>
          <div
            style={{ position: 'absolute', bottom: 96, left: '50%', transform: 'translateX(-50%)', background: '#fff', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.16)', overflow: 'hidden', minWidth: 220 }}
            onClick={e => e.stopPropagation()}
          >
            <button style={menuBtn} onClick={() => { setShowMenu(false); onNavigate('new-entry'); }}>
              <i className="ti ti-edit" style={{ fontSize: 18, color: '#4A5E50' }} /> Write a moment
            </button>
            <div style={{ height: 1, background: '#CCDAC8' }} />
            <button style={menuBtn} onClick={() => { setShowMenu(false); importRef.current?.click(); }}>
              <i className="ti ti-photos" style={{ fontSize: 18, color: '#4A5E50' }} /> Import from Photos
            </button>
          </div>
        </div>
      )}
      <input
        ref={importRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={e => { const files = Array.from(e.target.files); e.target.value = ''; if (files.length) onImportFiles(files); }}
      />
      <div className="nav-frame">
        <div className="nav-bar">
          {tabs.map(tab => (
            <button key={tab.id} className="nv-tab" style={tabStyle(tab)} onClick={() => onNavigate(tab.id)}>
              <i className={`ti ${tab.icon}`} />
              <span>{tab.label}</span>
            </button>
          ))}
          <div className="nv-add-wrap">
            <button className="nv-add" onClick={() => setShowMenu(m => !m)}><i className="ti ti-plus" /></button>
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
      const { error } = await supabase.auth.signUp({ email, password });
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

function OnboardingScreen({ onDone }) {
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
  const fileInputRef = useRef(null);

  const kidIndex = doneKids.length;
  const accent = KID_ACCENTS[kidIndex % KID_ACCENTS.length];
  const initial = name.trim() ? name.trim()[0].toUpperCase() : null;

  function goBack() {
    if (step === 'name') setStep('welcome');
    else if (step === 'birthdate') setStep('name');
    else if (step === 'photo') setStep('birthdate');
    else if (step === 'another') setStep('photo');
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
    onDone([...doneKids, {
      id: kidIndex, name: name.trim(),
      accent: KID_ACCENTS[kidIndex % KID_ACCENTS.length],
      birthdate, avatar,
    }]);
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
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setStep('name')}>
                Begin
              </button>
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

        </div>
      </div>
    </div>
  );
}

// ─── Root App ──────────────────────────────────────────────────────────────

export default function App() {
  const localMode = !supabaseConfigured;
  const localData = localMode ? loadLocalData() : null;
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(!localMode);
  const [dataLoading, setDataLoading] = useState(false);
  const [kids, setKids] = useState(localMode ? localData.kids : []);
  const [entries, setEntries] = useState(localMode ? localData.entries : []);
  const [screen, setScreen] = useState('home');
  const [kidFilter, setKidFilter] = useState(null);
  const [activeEntry, setActiveEntry] = useState(null);
  const [profileKidId, setProfileKidId] = useState(localMode ? localData.kids[0]?.id ?? null : null);
  const [celebration, setCelebration] = useState(null);
  const [importPhotos, setImportPhotos] = useState([]);
  const [importProcessing, setImportProcessing] = useState(false);

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
      const [{ data: kidsData }, { data: entriesData }] = await Promise.all([
        supabase.from('kids').select('*').order('created_at'),
        supabase.from('entries').select('*, entry_media(*)').order('date', { ascending: false }),
      ]);
      if (kidsData) {
        setKids(kidsData.map(k => ({ id: k.id, name: k.name, birthdate: k.birthdate, accent: k.accent || KID_ACCENTS[0], avatar: k.avatar_url })));
        setProfileKidId(kidsData[0]?.id ?? null);
      }
      if (entriesData) {
        setEntries(entriesData.map(e => ({
          id: e.id,
          kids: e.kid_ids,
          date: e.date,
          text: e.text || '',
          mood: e.mood,
          milestone: e.milestone,
          ageMonths: e.age_months,
          palette: e.palette || PALETTES[0],
          media: (e.entry_media || []).map(m => ({ url: m.url, type: m.type })),
        })));
      }
      setDataLoading(false);
    }
    loadData();
  }, [session]);

  function openEntry(entry) {
    setActiveEntry(entry);
    setScreen('entry-detail');
  }

  async function handleSaveEntry({ kids: kidIds, text, mood, milestone, media, fileObjects, date }) {
    const primaryKid = kids.find(k => k.id === kidIds[0]);
    const { years, months } = exactAge(primaryKid.birthdate, date);
    const ageMonths = years * 12 + months;
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
        setScreen('journal');
      }
      return;
    }

    const { data: entry, error } = await supabase.from('entries').insert({
      user_id: session.user.id,
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

    const newEntry = { id: entry.id, kids: kidIds, date, text: text || '', mood, milestone, ageMonths, palette, media: savedMedia };
    setEntries(prev => [newEntry, ...prev]);

    if (milestone) {
      setCelebration({ kid: primaryKid, milestoneType: milestone });
    } else {
      setScreen('journal');
    }
  }

  async function handleAvatarUpload(kidId, file) {
    const localUrl = URL.createObjectURL(file);
    setKids(prev => prev.map(k => k.id === kidId ? { ...k, avatar: localUrl } : k));
    if (localMode || !supabase || !session) return;
    try {
      const path = `${session.user.id}/avatar-${kidId}.jpg`;
      const { error } = await supabase.storage.from('media').upload(path, file, { upsert: true });
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path);
        setKids(prev => prev.map(k => k.id === kidId ? { ...k, avatar: publicUrl } : k));
        await supabase.from('kids').update({ avatar_url: publicUrl }).eq('id', kidId);
      }
    } catch {}
  }

  function openProfile(kidId) {
    setProfileKidId(kidId);
    setScreen('profile');
  }

  async function handleOnboardingDone(newKids) {
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
    const { data } = await supabase.from('kids').insert(
      newKids.map((k, i) => ({
        user_id: userId,
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

  async function handleImportFiles(files) {
    setImportProcessing(true);
    setImportPhotos([]);
    setScreen('import-review');
    const defaultKidId = kids[0]?.id ?? null;
    const processed = await Promise.all(
      files.filter(f => f.type.startsWith('image')).map(async (file, i) => {
        const url = URL.createObjectURL(file);
        let date = TODAY;
        let dateFromExif = false;
        try {
          const tags = await exifr.parse(file, ['DateTimeOriginal']);
          if (tags?.DateTimeOriginal) {
            date = new Date(tags.DateTimeOriginal).toISOString().slice(0, 10);
            dateFromExif = true;
          }
        } catch {}
        return { id: `${i}_${Date.now()}`, url, file, date, dateFromExif, kidId: defaultKidId };
      })
    );
    setImportPhotos(processed.sort((a, b) => new Date(b.date) - new Date(a.date)));
    setImportProcessing(false);
  }

  async function handleBulkImport(photos) {
    if (localMode || !supabase || !session) {
      const newEntries = photos.map((photo, idx) => {
        const kid = kids.find(k => k.id === photo.kidId);
        const { years, months } = exactAge(kid.birthdate, photo.date);
        return {
          id: Date.now() + idx,
          kids: [photo.kidId],
          date: photo.date,
          text: '',
          mood: 'Joyful',
          milestone: null,
          ageMonths: years * 12 + months,
          palette: PALETTES[Math.floor(Math.random() * PALETTES.length)],
          media: [{ url: photo.url, type: 'image' }],
        };
      });
      setEntries(prev => [...newEntries, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date)));
      setImportPhotos([]);
      setScreen('journal');
      return;
    }
    const userId = session.user.id;
    const newEntries = [];
    for (const photo of photos) {
      const kid = kids.find(k => k.id === photo.kidId);
      const { years, months } = exactAge(kid.birthdate, photo.date);
      const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
      const { data: entry } = await supabase.from('entries').insert({
        user_id: userId,
        kid_ids: [photo.kidId],
        text: '',
        mood: 'Joyful',
        milestone: null,
        date: photo.date,
        age_months: years * 12 + months,
        palette,
      }).select().single();
      if (entry) {
        let mediaUrl = photo.url;
        if (photo.file) {
          try {
            const path = `${userId}/${entry.id}-0.jpg`;
            const { error } = await supabase.storage.from('media').upload(path, photo.file);
            if (!error) {
              const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path);
              mediaUrl = publicUrl;
              await supabase.from('entry_media').insert({ entry_id: entry.id, url: mediaUrl, type: 'image' });
            }
          } catch {}
        }
        newEntries.push({ id: entry.id, kids: [photo.kidId], date: photo.date, text: '', mood: 'Joyful', milestone: null, ageMonths: years * 12 + months, palette, media: [{ url: mediaUrl, type: 'image' }] });
      }
    }
    setEntries(prev => [...newEntries, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date)));
    setImportPhotos([]);
    setScreen('journal');
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
        <OnboardingScreen onDone={handleOnboardingDone} />
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
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'new-entry' && (
        <NewEntryScreen kids={kids} onCancel={() => setScreen('home')} onSave={handleSaveEntry} />
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

      {screen === 'reel' && (
        <RecapReelScreen entries={entries} kids={kids} onClose={() => setScreen('home')} />
      )}

      {screen === 'profile' && (
        <ProfileScreen
          kids={kids}
          entries={entries}
          selectedKidId={profileKidId}
          setSelectedKidId={setProfileKidId}
          onBack={() => setScreen('home')}
          onAvatarUpload={handleAvatarUpload}
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

      {screen === 'import-review' && (
        <ImportReviewScreen
          initialPhotos={importPhotos}
          processing={importProcessing}
          kids={kids}
          onBack={() => setScreen('home')}
          onImport={handleBulkImport}
        />
      )}

      {screen !== 'entry-detail' && screen !== 'new-entry' && screen !== 'reel' && screen !== 'profile' && (
        <NavBar active={screen} onNavigate={setScreen} onImportFiles={handleImportFiles} />
      )}
      {screen === 'profile' && <NavBar active="home" onNavigate={setScreen} onImportFiles={handleImportFiles} />}

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
