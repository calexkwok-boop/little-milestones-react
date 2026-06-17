import { useState, useRef, useEffect } from 'react';
import './App.css';
import {
  KIDS_INITIAL, ENTRIES_INITIAL, MOODS, MILESTONE_TYPES, PALETTES, TODAY,
  ageLabel, milestoneInfo, entryBgStyle, tintedScrimStyle,
} from './constants.js';

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
      style={active ? { background: kid ? kid.accent : '#3D3527' } : {}}
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

// ─── Home feed cards ───────────────────────────────────────────────────────

function StatCard({ count, onClick }) {
  return (
    <div
      style={{ flex: 1.4, borderRadius: 16, background: '#3D3527', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 16, cursor: 'pointer' }}
      onClick={onClick}
    >
      <p style={{ fontSize: 28, fontWeight: 800, color: '#F2BB4E', margin: 0, lineHeight: 1 }}>{count}</p>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: '4px 0 0', fontWeight: 600 }}>milestones logged</p>
    </div>
  );
}

function EntryCard({ entry, kid, variant, onClick }) {
  const m = entry.milestone ? milestoneInfo(entry.milestone) : null;
  const ratios = { hero: '16/9', square: '1/1', wide: '21/9', portrait: '3/4' };
  const titleSizes = { hero: 20, square: 13, wide: 15, portrait: 13 };
  const maxLen = variant === 'hero' ? 60 : 45;
  const text = entry.text.length > maxLen ? entry.text.slice(0, maxLen) + '...' : entry.text;

  return (
    <div
      style={{
        borderRadius: 16, overflow: 'hidden', position: 'relative',
        aspectRatio: ratios[variant], cursor: 'pointer', flex: 1,
        marginBottom: (variant === 'hero' || variant === 'wide') ? 12 : 0,
        ...entryBgStyle(entry),
      }}
      onClick={onClick}
    >
      <div className="scrim" style={tintedScrimStyle(entry, variant === 'hero' ? 0.58 : 0.5)} />
      {m && (variant === 'hero' || variant === 'wide') && (
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 3, fontSize: 11, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.22)', padding: '5px 10px', borderRadius: 7, letterSpacing: 0.3 }}>
          MILESTONE
        </div>
      )}
      <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: variant === 'hero' ? 18 : '12px 14px' }}>
        <p style={{ fontSize: titleSizes[variant], fontWeight: variant === 'hero' ? 800 : 600, color: '#fff', margin: `0 0 ${(variant === 'portrait' || variant === 'square') ? 6 : 8}px`, lineHeight: 1.25 }}>
          {text}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <KidThumb kid={kid} size={variant === 'hero' ? 22 : 18} />
          <span style={{ fontSize: variant === 'hero' ? 13 : 11, fontWeight: 600, color: '#fff' }}>
            {kid.name} · {ageLabel(entry.ageMonths)}
          </span>
        </div>
      </div>
    </div>
  );
}

function HomeFeed({ entries, kids, kidFilter, onOpenEntry }) {
  const filtered = entries
    .filter(e => kidFilter === null || e.kid === kidFilter)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (filtered.length === 0) {
    return <p style={{ fontSize: 13, color: '#B5AC9C', textAlign: 'center', padding: '30px 0' }}>No moments yet</p>;
  }

  const milestoneCount = entries.filter(e => e.milestone).length;
  const rows = [];
  let i = 0;
  while (i < filtered.length) {
    const pattern = i === 0 ? 'hero' : (i % 3 === 1 ? 'pair' : (i % 3 === 2 ? 'wide' : 'pair2'));
    const kidOf = (e) => kids.find(k => k.id === e.kid);

    if (pattern === 'hero') {
      rows.push(<EntryCard key={filtered[i].id} entry={filtered[i]} kid={kidOf(filtered[i])} variant="hero" onClick={() => onOpenEntry(filtered[i])} />);
      i += 1;
    } else if (pattern === 'pair' && i + 1 < filtered.length) {
      rows.push(
        <div key={'row-' + filtered[i].id} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <EntryCard entry={filtered[i]} kid={kidOf(filtered[i])} variant="square" onClick={() => onOpenEntry(filtered[i])} />
          <StatCard count={milestoneCount} onClick={() => onOpenEntry(filtered[i + 1])} />
        </div>
      );
      i += 2;
    } else if (pattern === 'wide') {
      rows.push(<EntryCard key={filtered[i].id} entry={filtered[i]} kid={kidOf(filtered[i])} variant="wide" onClick={() => onOpenEntry(filtered[i])} />);
      i += 1;
    } else if (i + 1 < filtered.length) {
      rows.push(
        <div key={'row-' + filtered[i].id} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <EntryCard entry={filtered[i]} kid={kidOf(filtered[i])} variant="portrait" onClick={() => onOpenEntry(filtered[i])} />
          <EntryCard entry={filtered[i + 1]} kid={kidOf(filtered[i + 1])} variant="portrait" onClick={() => onOpenEntry(filtered[i + 1])} />
        </div>
      );
      i += 2;
    } else {
      rows.push(<EntryCard key={filtered[i].id} entry={filtered[i]} kid={kidOf(filtered[i])} variant="wide" onClick={() => onOpenEntry(filtered[i])} />);
      i += 1;
    }
  }
  return <>{rows}</>;
}

function HomeScreen({ entries, kids, onOpenEntry, onSearch, onManage, onOpenReel, kidFilter, setKidFilter }) {
  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad" style={{ paddingBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 12, color: '#B5AC9C', margin: 0 }}>Wednesday, June 17</p>
              <h1 style={{ fontSize: 23, color: '#3D3527', margin: '4px 0 0', fontWeight: 700 }}>Their story so far</h1>
            </div>
            <button className="icon-btn" onClick={onSearch}><i className="ti ti-search" /></button>
          </div>
          <KidSelector kids={kids} selected={kidFilter} onSelect={setKidFilter} onManage={onManage} />
        </div>
        <div style={{ padding: '0 18px' }}>
          <div
            onClick={onOpenReel}
            style={{ borderRadius: 14, overflow: 'hidden', position: 'relative', height: 88, cursor: 'pointer', background: '#3D3527', display: 'flex', alignItems: 'center', padding: '0 18px', gap: 14 }}
          >
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="ti ti-player-play" style={{ fontSize: 18, color: '#fff' }} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 11, color: '#A89A85', margin: 0, fontWeight: 600, letterSpacing: 0.3 }}>MAY RECAP</p>
              <p style={{ fontSize: 15, color: '#fff', margin: '3px 0 0', fontWeight: 700 }}>3 milestones, 12 moments</p>
            </div>
            <i className="ti ti-chevron-right" style={{ color: '#A89A85', fontSize: 16 }} />
          </div>
        </div>
        <div className="scrollpad" style={{ paddingTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 16, color: '#3D3527', margin: 0, fontWeight: 700 }}>Recent days</h2>
            <span style={{ fontSize: 12, color: '#B5AC9C' }}>
              {entries.filter(e => kidFilter === null || e.kid === kidFilter).length} moments
            </span>
          </div>
          <HomeFeed entries={entries} kids={kids} kidFilter={kidFilter} onOpenEntry={onOpenEntry} />
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
          <p style={{ fontSize: 20, fontWeight: 800, color: '#3D3527', margin: 0, lineHeight: 1 }}>{dayNum}</p>
          <p style={{ fontSize: 10, color: '#B5AC9C', margin: '2px 0 0', fontWeight: 600, textTransform: 'uppercase' }}>{weekday}</p>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            <KidThumb kid={kid} size={20} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#3D3527' }}>{kid.name}</span>
            <span style={{ fontSize: 11, color: '#B5AC9C' }}>· {ageLabel(entry.ageMonths)}</span>
            {m && (
              <span style={{ fontSize: 10, fontWeight: 700, color: entry.palette.tint, background: entry.palette.bg, padding: '2px 8px', borderRadius: 999, marginLeft: 'auto' }}>
                {m.label}
              </span>
            )}
          </div>
          <p style={{ fontSize: 14, color: '#4A4339', lineHeight: 1.6, margin: 0 }}>{text}</p>
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
    .filter(e => kidFilter === null || e.kid === kidFilter)
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
          <span style={{ fontSize: 12, fontWeight: 700, color: '#B5AC9C', letterSpacing: 0.3 }}>{monthLabel.toUpperCase()}</span>
          <div className="month-divider-line" />
        </div>
      );
    }
    const kid = kids.find(k => k.id === entry.kid);
    rows.push(<JournalEntryRow key={entry.id} entry={entry} kid={kid} onClick={() => onOpenEntry(entry)} />);
  });

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad" style={{ paddingBottom: 6 }}>
          <div>
            <p style={{ fontSize: 12, color: '#B5AC9C', margin: 0 }}>Journal</p>
            <h1 style={{ fontSize: 23, color: '#3D3527', margin: '4px 0 0', fontWeight: 700 }}>A page for every day</h1>
          </div>
          <KidSelector kids={kids} selected={kidFilter} onSelect={setKidFilter} onManage={() => {}} />
        </div>
        <div className="scrollpad" style={{ paddingTop: 0 }}>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F5EFE3', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <i className="ti ti-notebook" style={{ fontSize: 24, color: '#B5AC9C' }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#3D3527', margin: '0 0 6px' }}>Nothing written yet</p>
              <p style={{ fontSize: 13, color: '#B5AC9C', margin: '0 0 20px', maxWidth: 240, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
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
              <p style={{ fontSize: 16, color: '#3D3527', margin: 0, fontWeight: 700 }}>{kid.name}</p>
              <p style={{ fontSize: 12, color: '#B5AC9C', margin: '2px 0 0' }}>
                {ageLabel(entry.ageMonths)} old · {new Date(entry.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>
          <p style={{ fontSize: 15, color: '#3D3527', lineHeight: 1.7, margin: 0 }}>{entry.text}</p>
          <div style={{ height: 1, background: '#ECE5D6' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: 12, color: '#B5AC9C' }}>Feeling</span>
            <span className="chip selected" style={{ cursor: 'default' }}>{entry.mood}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── New entry form ────────────────────────────────────────────────────────

function NewEntryScreen({ kids, onCancel, onSave }) {
  const [selectedKid, setSelectedKid] = useState(kids[0].id);
  const [text, setText] = useState('');
  const [mood, setMood] = useState(null);
  const [isMilestone, setIsMilestone] = useState(false);
  const [milestoneType, setMilestoneType] = useState(null);
  const [customMilestone, setCustomMilestone] = useState('');
  const [media, setMedia] = useState([]);
  const fileInputRef = useRef(null);

  function handleFileChange(e) {
    const files = Array.from(e.target.files);
    const newMedia = files.map(file => ({
      url: URL.createObjectURL(file),
      type: file.type.startsWith('video') ? 'video' : 'image',
    }));
    setMedia(prev => [...prev, ...newMedia]);
    e.target.value = '';
  }

  function removeMedia(index) {
    setMedia(prev => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    if (!text.trim()) {
      alert('Add a little note about what happened!');
      return;
    }
    onSave({
      kid: selectedKid,
      text: text.trim(),
      mood: mood || 'Joyful',
      milestone: isMilestone ? (milestoneType || 'custom') : null,
      media,
    });
  }

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onCancel}><i className="ti ti-x" /></button>
            <h2 style={{ fontSize: 16, color: '#3D3527', margin: 0, fontWeight: 700 }}>New moment</h2>
            <div style={{ width: 36 }} />
          </div>

          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#6B6258', marginBottom: 9 }}>Who's this about?</p>
            <div className="scrollx">
              {kids.map(k => (
                <KidChip key={k.id} kid={k} active={selectedKid === k.id} onClick={() => setSelectedKid(k.id)} />
              ))}
            </div>
          </div>

          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#6B6258', marginBottom: 9 }}>Photos &amp; videos</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <div className="photo-slot dashed" onClick={() => fileInputRef.current?.click()}>
                <i className="ti ti-plus" />
              </div>
              {media.map((item, i) => (
                <div className="photo-slot" key={i}>
                  {item.type === 'video' ? <video src={item.url} muted /> : <img src={item.url} alt="" />}
                  <button className="photo-remove-btn" onClick={(e) => { e.stopPropagation(); removeMedia(i); }}>
                    <i className="ti ti-x" />
                  </button>
                </div>
              ))}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={handleFileChange} />
          </div>

          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#6B6258', marginBottom: 9 }}>What happened?</p>
            <textarea
              className="input-field"
              placeholder="She took her very first steps across the living room today..."
              value={text}
              onChange={e => setText(e.target.value)}
            />
          </div>

          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#6B6258', marginBottom: 9 }}>How are you feeling?</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {MOODS.map(mo => (
                <div key={mo} className={`chip ${mood === mo ? 'selected' : ''}`} onClick={() => setMood(mo)}>{mo}</div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
              <input
                type="checkbox"
                id="milestone-toggle"
                checked={isMilestone}
                onChange={e => setIsMilestone(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: '#3D3527' }}
              />
              <label htmlFor="milestone-toggle" style={{ fontSize: 13, fontWeight: 600, color: '#6B6258' }}>
                Tag this as a milestone
              </label>
            </div>
            {isMilestone && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {MILESTONE_TYPES.map(mt => (
                    <div
                      key={mt.id}
                      className={`chip ${milestoneType === mt.id ? 'selected' : ''}`}
                      onClick={() => setMilestoneType(mt.id)}
                    >
                      <i className={`ti ${mt.icon}`} style={{ fontSize: 14 }} />{mt.label}
                    </div>
                  ))}
                </div>
                {milestoneType === 'custom' && (
                  <input
                    className="input-field"
                    placeholder="Or type a custom milestone..."
                    value={customMilestone}
                    onChange={e => setCustomMilestone(e.target.value)}
                  />
                )}
              </div>
            )}
          </div>

          <button className="btn btn-primary" onClick={handleSave}>Save this moment</button>
        </div>
      </div>
    </div>
  );
}

// ─── Celebration overlay ───────────────────────────────────────────────────

function CelebrationOverlay({ kid, milestoneType, onDone }) {
  const m = milestoneInfo(milestoneType) || { label: 'Milestone', icon: 'ti-star' };
  const colors = ['#F2BB4E', '#F0897A', '#6FB582', '#5B9BD9', '#D17BB5'];
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
      <h2 style={{ fontSize: 23, color: '#3D3527', margin: 0, fontWeight: 800 }}>Milestone unlocked</h2>
      <p style={{ fontSize: 15, color: '#6B6258', margin: 0 }}>
        {kid.name} just hit: <strong style={{ color: '#3D3527' }}>{m.label}</strong>
      </p>
      <button className="btn btn-primary" style={{ marginTop: 10, width: 'auto', padding: '13px 28px' }} onClick={onDone}>
        See it in the journal
      </button>
    </div>
  );
}

// ─── Recap screen ──────────────────────────────────────────────────────────

function RecapScreen({ entries, kids, onBack, onOpenEntry, onCompare }) {
  const mayMilestones = entries.filter(e => e.milestone && e.date.startsWith('2026-05'));

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            <h2 style={{ fontSize: 16, color: '#3D3527', margin: 0, fontWeight: 700 }}>May recap</h2>
            <div style={{ width: 36 }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1.3, background: '#3D3527', borderRadius: 14, padding: 16 }}>
              <p style={{ fontSize: 36, fontWeight: 800, color: '#F2BB4E', margin: 0, lineHeight: 1 }}>12</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: '5px 0 0', fontWeight: 600 }}>moments logged</p>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ background: '#F0BBA8', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, padding: '12px 14px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#7A4430' }}>milestones</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#7A4430' }}>3</span>
              </div>
              <div style={{ background: '#A8C49B', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, padding: '12px 14px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#3A5230' }}>photos</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#3A5230' }}>28</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mayMilestones.map(e => {
              const kid = kids.find(k => k.id === e.kid);
              const m = milestoneInfo(e.milestone);
              return (
                <div
                  key={e.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer', background: '#fff', border: '1px solid #ECE5D6', borderRadius: 12, padding: '12px 14px' }}
                  onClick={() => onOpenEntry(e)}
                >
                  <KidThumb kid={kid} size={34} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#3D3527', margin: 0 }}>{m.label}</p>
                    <p style={{ fontSize: 12, color: '#B5AC9C', margin: '1px 0 0' }}>{kid.name} · {ageLabel(e.ageMonths)}</p>
                  </div>
                  <i className={`ti ${m.icon}`} style={{ color: '#3D3527', fontSize: 17 }} />
                </div>
              );
            })}
          </div>
          <button className="btn btn-outline" onClick={onCompare}>
            Compare siblings at this age <i className="ti ti-arrow-right" />
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
            <h2 style={{ fontSize: 16, color: '#3D3527', margin: 0, fontWeight: 700 }}>Side by side</h2>
            <div style={{ width: 36 }} />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#6B6258', marginBottom: 9 }}>Compare at age</p>
            <div className="scrollx">
              {ages.map(age => (
                <div
                  key={age}
                  className={`kid-chip ${compareAge === age ? 'active' : ''}`}
                  style={{ padding: '7px 14px', ...(compareAge === age ? { background: '#3D3527' } : {}) }}
                  onClick={() => setCompareAge(age)}
                >
                  {ageLabel(age)}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {kids.map(kid => {
              const matches = entries.filter(e => e.kid === kid.id && Math.abs(e.ageMonths - compareAge) <= 3);
              return (
                <div key={kid.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <KidThumb kid={kid} />
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#3D3527', margin: 0 }}>{kid.name}</p>
                  </div>
                  {matches.length === 0 ? (
                    <div style={{ background: '#fff', border: '1px dashed #D8CFBC', borderRadius: 12, padding: '24px 12px', textAlign: 'center' }}>
                      <p style={{ fontSize: 12, color: '#B5AC9C', margin: 0 }}>No moments yet at this age</p>
                    </div>
                  ) : matches.map(e => {
                    const m = e.milestone ? milestoneInfo(e.milestone) : null;
                    return (
                      <div key={e.id} style={{ borderRadius: 12, overflow: 'hidden' }} onClick={() => onOpenEntry(e)}>
                        <div className="compare-photo" style={entryBgStyle(e)}>
                          <div className="scrim" style={tintedScrimStyle(e, 0.5)} />
                          <div style={{ position: 'relative', zIndex: 2, padding: 10, width: '100%' }}>
                            <p style={{ fontSize: 11, color: '#fff', margin: '0 0 4px', fontWeight: 700 }}>{ageLabel(e.ageMonths)}</p>
                            {m && <p style={{ fontSize: 11, color: '#fff', margin: 0, fontWeight: 600, opacity: 0.9 }}>{m.label}</p>}
                          </div>
                        </div>
                        <p style={{ fontSize: 12, color: '#6B6258', lineHeight: 1.5, margin: '8px 2px 0' }}>
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
    const kid = kids.find(k => k.id === e.kid);
    const q = query.toLowerCase();
    return e.text.toLowerCase().includes(q) || (m && m.label.toLowerCase().includes(q)) || kid.name.toLowerCase().includes(q);
  }) : [];

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            <h2 style={{ fontSize: 16, color: '#3D3527', margin: 0, fontWeight: 700 }}>Search</h2>
            <div style={{ width: 36 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: '1px solid #ECE5D6', borderRadius: 10, padding: '11px 14px' }}>
            <i className="ti ti-search" style={{ color: '#B5AC9C' }} />
            <input
              type="text"
              placeholder="Search moments, milestones, trips..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ border: 'none', outline: 'none', flex: 1, fontSize: 14, background: 'transparent', color: '#3D3527', fontFamily: 'Inter, sans-serif' }}
            />
          </div>
          {query.trim() && matches.length === 0 && (
            <p style={{ fontSize: 13, color: '#B5AC9C', textAlign: 'center', padding: '24px 0' }}>No moments found</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: matches.length > 0 ? 14 : 0 }}>
            {matches.map(e => {
              const kid = kids.find(k => k.id === e.kid);
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
              const kid = kids.find(k => k.id === e.kid);
              const m = e.milestone ? milestoneInfo(e.milestone) : null;
              return (
                <div key={e.id} className="reel-slide" style={{ opacity: i === index ? 1 : 0, ...entryBgStyle(e) }}>
                  <div className="scrim" style={tintedScrimStyle(e, 0.72)} />
                  <div style={{ position: 'relative', zIndex: 3, padding: '20px 22px 32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <KidThumb kid={kid} size={28} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{kid.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.22)', color: '#fff' }}>
                        {ageLabel(e.ageMonths)}
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

function ProfileScreen({ kids, entries, selectedKidId, setSelectedKidId, onBack, onAvatarUpload }) {
  const kid = kids.find(k => k.id === selectedKidId);
  const kidEntries = entries.filter(e => e.kid === selectedKidId);
  const milestoneCount = kidEntries.filter(e => e.milestone).length;
  const fileInputRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    onAvatarUpload(selectedKidId, URL.createObjectURL(file));
    e.target.value = '';
  }

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            <h2 style={{ fontSize: 16, color: '#3D3527', margin: 0, fontWeight: 700 }}>Manage kids</h2>
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
                <p style={{ fontSize: 13, color: k.id === selectedKidId ? '#3D3527' : '#B5AC9C', margin: '8px 0 0', fontWeight: 600 }}>
                  {k.name}
                </p>
              </div>
            ))}
            <div style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => alert('Add a new kid profile here — same flow as the existing two.')}>
              <div className="avatar-upload-zone"><i className="ti ti-plus" /></div>
              <p style={{ fontSize: 13, color: '#B5AC9C', margin: '8px 0 0', fontWeight: 600 }}>Add kid</p>
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
                <p style={{ fontSize: 15, fontWeight: 700, color: '#3D3527', margin: 0 }}>{kid.name}</p>
                <p style={{ fontSize: 12, color: '#B5AC9C', margin: '2px 0 0' }}>
                  Born {new Date(kid.birthdate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="stat-tile">
                <p style={{ fontSize: 18, color: '#3D3527', margin: 0, fontWeight: 700 }}>{kidEntries.length}</p>
                <p style={{ fontSize: 11, color: '#B5AC9C', margin: '3px 0 0' }}>moments</p>
              </div>
              <div className="stat-tile">
                <p style={{ fontSize: 18, color: '#3D3527', margin: 0, fontWeight: 700 }}>{milestoneCount}</p>
                <p style={{ fontSize: 11, color: '#B5AC9C', margin: '3px 0 0' }}>milestones</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Nav bar ────────────────────────────────────────────────────────────

function NavBar({ active, onNavigate }) {
  const tabs = [
    { id: 'home', icon: 'ti-home', label: 'Home', color: '#F0897A' },
    { id: 'journal', icon: 'ti-notebook', label: 'Journal', color: '#6FB582' },
  ];
  const tabsRight = [
    { id: 'compare', icon: 'ti-arrows-left-right', label: 'Compare', color: '#5B9BD9' },
    { id: 'recap', icon: 'ti-calendar', label: 'Recaps', color: '#D17BB5' },
  ];

  function tabStyle(tab) {
    const isActive = active === tab.id;
    return { backgroundColor: isActive ? tab.color : 'transparent', color: isActive ? '#ffffff' : '#A89A85' };
  }

  return (
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
  );
}

// ─── Root App ──────────────────────────────────────────────────────────────

export default function App() {
  const [kids, setKids] = useState(KIDS_INITIAL);
  const [entries, setEntries] = useState(ENTRIES_INITIAL);
  const [screen, setScreen] = useState('home');
  const [kidFilter, setKidFilter] = useState(null);
  const [activeEntry, setActiveEntry] = useState(null);
  const [profileKidId, setProfileKidId] = useState(0);
  const [celebration, setCelebration] = useState(null); // { kid, milestoneType }

  function openEntry(entry) {
    setActiveEntry(entry);
    setScreen('entry-detail');
  }

  function handleSaveEntry({ kid: kidId, text, mood, milestone, media }) {
    const kid = kids.find(k => k.id === kidId);
    const birth = new Date(kid.birthdate);
    const ageMonths = Math.max(0, Math.floor((new Date(TODAY) - birth) / (1000 * 60 * 60 * 24 * 30.44)));

    const newEntry = {
      id: entries.length + 1,
      kid: kidId,
      date: TODAY,
      text,
      mood,
      milestone,
      ageMonths,
      palette: PALETTES[Math.floor(Math.random() * PALETTES.length)],
      media,
    };
    setEntries(prev => [newEntry, ...prev]);

    if (milestone) {
      setCelebration({ kid, milestoneType: milestone });
    } else {
      setScreen('journal');
    }
  }

  function handleAvatarUpload(kidId, url) {
    setKids(prev => prev.map(k => (k.id === kidId ? { ...k, avatar: url } : k)));
  }

  function openProfile(kidId) {
    setProfileKidId(kidId);
    setScreen('profile');
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
          onOpenReel={() => setScreen('reel')}
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
          kid={kids.find(k => k.id === activeEntry.kid)}
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
        />
      )}

      {screen !== 'entry-detail' && screen !== 'new-entry' && screen !== 'reel' && screen !== 'profile' && (
        <NavBar active={screen} onNavigate={setScreen} />
      )}
      {(screen === 'profile') && <NavBar active="home" onNavigate={setScreen} />}

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
