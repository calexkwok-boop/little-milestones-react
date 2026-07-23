import { useState, useMemo } from 'react';
import { Icon } from '../icons';
import KidThumb from '../KidThumb.jsx';
import { TODAY, cloudinaryTransform, AVATAR_TRANSFORM_SM } from '../constants.js';

export default function BookBuilderScreen({ kids = [], entries = [], familyMembers = [], myDisplayName, darkMode, onBack, onPreview }) {
  const [selectedKids, setSelectedKids] = useState(() => kids.map(k => k.id));
  const [rangeMode, setRangeMode] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState(TODAY);
  const [favoritesOnly, setFavoritesOnly] = useState(true);

  const authorMembers = useMemo(() => {
    return familyMembers.map(m => ({
      id: m.user_id || m.id,
      name: m.display_name || m.real_name?.split(' ')[0] || '',
      avatar: m.avatar_url || null,
    })).filter(m => m.name);
  }, [familyMembers]);

  const [selectedAuthors, setSelectedAuthors] = useState(() => authorMembers.map(m => m.id));

  const currentYear = TODAY.slice(0, 4);

  const filteredEntries = useMemo(() => {
    if (selectedKids.length === 0) return [];
    return entries.filter(e => {
      if (!selectedKids.some(id => e.kids?.includes(id))) return false;
      if (favoritesOnly && !e.favorited) return false;
      if (rangeMode === 'year' && !e.date.startsWith(currentYear)) return false;
      if (rangeMode === 'custom') {
        if (customFrom && e.date < customFrom) return false;
        if (customTo && e.date > customTo) return false;
      }
      return true;
    });
  }, [selectedKids, entries, rangeMode, currentYear, customFrom, customTo, favoritesOnly]);

  const textEntries = filteredEntries.filter(e => e.text?.trim());

  const authorSummary = useMemo(() => {
    const names = authorMembers.filter(m => selectedAuthors.includes(m.id)).map(m => m.name);
    if (names.length === 0) return myDisplayName || '';
    const last = names[names.length - 1];
    const rest = names.slice(0, -1);
    return rest.length > 0 ? `${rest.join(', ')} & ${last}` : last;
  }, [selectedAuthors, authorMembers, myDisplayName]);

  const recipientSummary = selectedKids
    .map(id => kids.find(k => k.id === id)?.name.split(' ')[0])
    .filter(Boolean)
    .join(' & ');

  function handlePreview() {
    if (textEntries.length === 0) return;
    onPreview({
      kidIds: selectedKids,
      fromDate: rangeMode === 'custom' ? customFrom || null : rangeMode === 'year' ? `${currentYear}-01-01` : null,
      toDate: rangeMode === 'custom' ? customTo || null : rangeMode === 'year' ? `${currentYear}-12-31` : null,
      bookEntries: textEntries,
      authorLabel: authorSummary,
      authorSummary,
      recipientSummary,
    });
  }

  const canPreview = selectedKids.length > 0 && textEntries.length > 0;
  const sectionLabel = { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1.2, textTransform: 'uppercase', margin: '0 0 10px' };
  const chipBtn = (selected) => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px 8px 8px', borderRadius: 40, border: `2px solid ${selected ? 'var(--accent)' : darkMode ? 'rgba(255,255,255,0.1)' : 'var(--border)'}`, background: selected ? 'var(--bg-elevated)' : 'transparent', cursor: 'pointer', transition: 'all 0.15s' });

  return (
    <div className="screen">
    <div className="scroll-area">
    <div className="scrollpad">

      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
        <button className="icon-btn" onClick={onBack}><Icon name="ti-arrow-left" /></button>
        <div style={{ margin: '0 auto', textAlign: 'center' }}>
          <div style={{ width: 28, height: 1, background: 'rgba(200,153,62,0.4)', margin: '0 auto 5px' }} />
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>Create a book</h2>
        </div>
        <div style={{ width: 36 }} />
      </div>

      {/* Kid selector */}
      <div>
        <p style={sectionLabel}>Who is this book for?</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {kids.map(kid => {
            const selected = selectedKids.includes(kid.id);
            return (
              <button key={kid.id} onClick={() => setSelectedKids(prev => selected ? prev.filter(x => x !== kid.id) : [...prev, kid.id])} style={chipBtn(selected)}>
                <KidThumb kid={kid} size={30} />
                <span style={{ fontSize: 14, fontWeight: 600, color: selected ? 'var(--text)' : 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif" }}>{kid.name.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Time period — segmented control matching RecapScreen style */}
      <div>
        <p style={sectionLabel}>Time period</p>
        <div style={{ display: 'flex', background: darkMode ? 'var(--bg-input)' : 'var(--bg-elevated)', borderRadius: 12, padding: 4, gap: 2 }}>
          {[['all', 'All time'], ['year', currentYear], ['custom', 'Custom']].map(([mode, label]) => (
            <button key={mode} onClick={() => setRangeMode(mode)} style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: 'none', background: rangeMode === mode ? (darkMode ? 'var(--bg-elevated)' : 'var(--bg-input)') : 'transparent', fontSize: 13, fontWeight: 600, color: rangeMode === mode ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", transition: 'all 0.15s', boxShadow: rangeMode === mode && !darkMode ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
              {label}
            </button>
          ))}
        </div>
        {rangeMode === 'custom' && (
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            {[['From', customFrom, v => setCustomFrom(v), '', customTo || TODAY], ['To', customTo, v => setCustomTo(v), customFrom, TODAY]].map(([lbl, val, set, min, max]) => (
              <div key={lbl} style={{ flex: 1 }}>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 5px', fontWeight: 600 }}>{lbl}</p>
                <input type="date" value={val} onChange={e => set(e.target.value)} min={min} max={max} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${darkMode ? 'rgba(255,255,255,0.1)' : 'var(--border)'}`, background: 'var(--bg-card)', color: 'var(--text)', fontSize: 14, fontFamily: "'Urbanist', sans-serif", boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Favorites only */}
      <button onClick={() => setFavoritesOnly(f => !f)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'var(--bg-card)', border: 'none', borderRadius: 14, padding: '14px 16px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="ti-star-filled" style={{ fontSize: 17, color: favoritesOnly ? '#C8993E' : 'var(--text-muted)' }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: favoritesOnly ? 'var(--text)' : 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif" }}>Favorites only</span>
        </div>
        <div style={{ width: 46, height: 27, borderRadius: 14, background: favoritesOnly ? 'var(--accent)' : darkMode ? 'rgba(255,255,255,0.15)' : 'var(--border)', position: 'relative', transition: 'background 0.22s', flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: 3, left: favoritesOnly ? 22 : 3, width: 21, height: 21, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)', transition: 'left 0.22s' }} />
        </div>
      </button>

      {/* Written by */}
      <div>
        <p style={sectionLabel}>Written by</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {authorMembers.map(m => {
            const selected = selectedAuthors.includes(m.id);
            return (
              <button key={m.id} onClick={() => setSelectedAuthors(prev => selected ? prev.filter(id => id !== m.id) : [...prev, m.id])} style={chipBtn(selected)}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
                  {m.avatar
                    ? <img src={cloudinaryTransform(m.avatar, AVATAR_TRANSFORM_SM)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                    : m.name.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: selected ? 'var(--text)' : 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif" }}>{m.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Entry count */}
      {selectedKids.length > 0 && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="ti-book-2" style={{ fontSize: 18, color: 'var(--accent)' }} />
          </div>
          {textEntries.length > 0 ? (
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                {(() => {
                  const letterCount = textEntries.filter(e => e.type !== 'note').length;
                  const noteCount = textEntries.filter(e => e.type === 'note').length;
                  if (letterCount > 0 && noteCount > 0) return `${letterCount} letter${letterCount !== 1 ? 's' : ''} & ${noteCount} note${noteCount !== 1 ? 's' : ''}`;
                  if (noteCount > 0) return `${noteCount} note${noteCount !== 1 ? 's' : ''}`;
                  return `${letterCount} letter${letterCount !== 1 ? 's' : ''}`;
                })()}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                {filteredEntries.length - textEntries.length > 0 ? `${filteredEntries.length - textEntries.length} photo-only excluded · ` : ''}Ready to preview
              </p>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No entries with text for this selection</p>
          )}
        </div>
      )}

      {/* Preview button */}
      <button
        onClick={handlePreview}
        disabled={!canPreview}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '14px 18px', background: canPreview ? (darkMode ? 'linear-gradient(180deg, #2E4A34 0%, #1E3425 100%)' : 'linear-gradient(180deg, #3A4D40 0%, #1E2E24 100%)') : (darkMode ? 'var(--bg-elevated)' : 'var(--border)'), border: canPreview && darkMode ? '1px solid rgba(107,158,109,0.18)' : 'none', borderRadius: 14, cursor: canPreview ? 'pointer' : 'default', fontFamily: "'Urbanist', sans-serif", boxShadow: canPreview ? (darkMode ? '0 2px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 3px 10px rgba(20,35,25,0.38), inset 0 1px 0 rgba(255,255,255,0.08)') : 'none', opacity: canPreview ? 1 : 0.5, transition: 'all 0.15s' }}
        onMouseDown={e => { if (canPreview) { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.opacity = '0.88'; } }}
        onMouseUp={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.opacity = canPreview ? '' : '0.5'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.opacity = canPreview ? '' : '0.5'; }}
        onTouchStart={e => { if (canPreview) { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.opacity = '0.88'; } }}
        onTouchEnd={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.opacity = canPreview ? '' : '0.5'; }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="ti-book" style={{ fontSize: 18, color: canPreview ? '#C8993E' : 'var(--text-muted)' }} />
          </div>
          <p style={{ fontSize: 14, fontWeight: 700, color: canPreview ? '#fff' : 'var(--text-muted)', margin: 0, textAlign: 'left' }}>Preview book</p>
        </div>
        <Icon name="ti-arrow-right" style={{ fontSize: 16, color: canPreview ? 'rgba(255,255,255,0.3)' : 'var(--text-muted)', flexShrink: 0 }} />
      </button>

    </div>
    </div>
    </div>
  );
}
