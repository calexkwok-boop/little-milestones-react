import { useState, useMemo } from 'react';
import KidThumb from '../KidThumb.jsx';
import { TODAY } from '../constants.js';

export default function BookBuilderScreen({ kids, entries, familyMembers, myDisplayName, onBack, onPreview }) {
  const [selectedKids, setSelectedKids] = useState(() => kids.map(k => k.id));
  const [rangeMode, setRangeMode] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState(TODAY);
  const [authorLabel, setAuthorLabel] = useState(myDisplayName || '');

  const currentYear = TODAY.slice(0, 4);

  const filteredEntries = useMemo(() => {
    if (selectedKids.length === 0) return [];
    return entries.filter(e => {
      if (!selectedKids.some(id => e.kids?.includes(id))) return false;
      if (rangeMode === 'year' && !e.date.startsWith(currentYear)) return false;
      if (rangeMode === 'custom') {
        if (customFrom && e.date < customFrom) return false;
        if (customTo && e.date > customTo) return false;
      }
      return true;
    });
  }, [selectedKids, entries, rangeMode, currentYear, customFrom, customTo]);

  const textEntries = filteredEntries.filter(e => e.text?.trim());

  const authorSummary = useMemo(() => {
    if (authorLabel.trim()) return authorLabel.trim();
    const names = familyMembers.map(m => (m.display_name || m.real_name || '').split(' ')[0]).filter(Boolean);
    return names.join(' & ');
  }, [authorLabel, familyMembers]);

  const recipientSummary = selectedKids
    .map(id => kids.find(k => k.id === id)?.name.split(' ')[0])
    .filter(Boolean)
    .join(' & ');

  function toggleKid(id) {
    setSelectedKids(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function handlePreview() {
    if (textEntries.length === 0) return;
    onPreview({
      kidIds: selectedKids,
      fromDate: rangeMode === 'custom' ? customFrom || null : rangeMode === 'year' ? `${currentYear}-01-01` : null,
      toDate: rangeMode === 'custom' ? customTo || null : rangeMode === 'year' ? `${currentYear}-12-31` : null,
      bookEntries: textEntries,
      authorLabel,
      authorSummary,
      recipientSummary,
    });
  }

  const canPreview = selectedKids.length > 0 && textEntries.length > 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '54px 20px 20px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)', flexShrink: 0 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 22 }} />
        </button>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1.5, textTransform: 'uppercase', margin: 0 }}>Patina</p>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 22, color: 'var(--text)', margin: 0, lineHeight: 1.2 }}>Create a book</h1>
        </div>
      </div>

      <div style={{ padding: '0 20px 100px', display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* Kid selector */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1.2, textTransform: 'uppercase', margin: '0 0 12px' }}>Who is this book for?</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {kids.map(kid => {
              const selected = selectedKids.includes(kid.id);
              return (
                <button key={kid.id} onClick={() => toggleKid(kid.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px 8px 8px', borderRadius: 40, border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`, background: selected ? 'var(--bg-elevated)' : 'transparent', cursor: 'pointer', transition: 'all 0.15s' }}>
                  <KidThumb kid={kid} size={30} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: selected ? 'var(--text)' : 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif" }}>{kid.name.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Date range */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1.2, textTransform: 'uppercase', margin: '0 0 12px' }}>Time period</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['all', 'All time'], ['year', currentYear], ['custom', 'Custom']].map(([mode, label]) => (
              <button key={mode} onClick={() => setRangeMode(mode)} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: `2px solid ${rangeMode === mode ? 'var(--accent)' : 'var(--border)'}`, background: rangeMode === mode ? 'var(--bg-elevated)' : 'transparent', fontSize: 13, fontWeight: 600, color: rangeMode === mode ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", transition: 'all 0.15s' }}>
                {label}
              </button>
            ))}
          </div>
          {rangeMode === 'custom' && (
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              {[['From', customFrom, v => setCustomFrom(v), '', customTo || TODAY], ['To', customTo, v => setCustomTo(v), customFrom, TODAY]].map(([lbl, val, set, min, max]) => (
                <div key={lbl} style={{ flex: 1 }}>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 5px', fontWeight: 600 }}>{lbl}</p>
                  <input type="date" value={val} onChange={e => set(e.target.value)} min={min} max={max} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 14, fontFamily: "'Urbanist', sans-serif", boxSizing: 'border-box' }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Author */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1.2, textTransform: 'uppercase', margin: '0 0 12px' }}>Written by</p>
          <input
            type="text"
            value={authorLabel}
            onChange={e => setAuthorLabel(e.target.value)}
            placeholder={authorSummary || 'Mom, Dad…'}
            style={{ width: '100%', padding: '13px 14px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 15, fontFamily: "'Urbanist', sans-serif", boxSizing: 'border-box', outline: 'none' }}
          />
        </div>

        {/* Entry count */}
        {selectedKids.length > 0 && (
          <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="ti ti-book-2" style={{ fontSize: 20, color: 'var(--accent)' }} />
            </div>
            {textEntries.length > 0 ? (
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0, fontFamily: "'Urbanist', sans-serif" }}>
                  {textEntries.length} letter{textEntries.length !== 1 ? 's' : ''}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  {filteredEntries.length - textEntries.length > 0 ? `${filteredEntries.length - textEntries.length} photo-only entries excluded` : 'Ready to preview'}
                </p>
              </div>
            ) : (
              <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>No entries with text for this selection</p>
            )}
          </div>
        )}

        {/* Preview button */}
        <button
          onClick={handlePreview}
          disabled={!canPreview}
          style={{ width: '100%', padding: '17px', borderRadius: 14, border: 'none', background: canPreview ? 'var(--accent)' : 'var(--border)', color: canPreview ? '#fff' : 'var(--text-muted)', fontSize: 16, fontWeight: 700, fontFamily: "'Urbanist', sans-serif", cursor: canPreview ? 'pointer' : 'default', opacity: canPreview ? 1 : 0.6, transition: 'all 0.15s' }}
        >
          Preview book
        </button>
      </div>
    </div>
  );
}
