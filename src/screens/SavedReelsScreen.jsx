import { useState } from 'react';
import { TODAY } from '../constants.js';
import SectionSwitcher from '../SectionSwitcher.jsx';

function formatRangeLabel(startDate, endDate) {
  const s = new Date(startDate + 'T12:00:00');
  const e = new Date(endDate + 'T12:00:00');
  const sameYear = s.getFullYear() === e.getFullYear();
  const startLabel = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
  const endLabel = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return startDate === endDate ? endLabel : `${startLabel} – ${endLabel}`;
}

function SavedReelsScreen({ savedReels = [], onBack, onSwitchSection, onCreateReel, onDeleteReel, onWatchReel }) {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = startDate && endDate && startDate <= endDate;

  function resetForm() {
    setTitle('');
    setStartDate('');
    setEndDate('');
  }

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    const label = title.trim() || formatRangeLabel(startDate, endDate);
    const reel = await onCreateReel({ title: label, startDate, endDate });
    setSaving(false);
    setShowCreate(false);
    resetForm();
    if (reel) onWatchReel(reel);
  }

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: 'var(--accent)', margin: 0, textAlign: 'center' }}>Keepsakes</h2>
              <button className="icon-btn" onClick={() => setShowCreate(true)}>
                <i className="ti ti-plus" />
              </button>
            </div>

            <div>
              <SectionSwitcher
                tabs={[{ id: 'recap', label: 'Recap' }, { id: 'partner-letters', label: 'All letters' }, { id: 'compare', label: 'At the same age' }, { id: 'reels', label: 'Reels' }]}
                active="reels"
                onChange={onSwitchSection}
              />
            </div>
          </div>

          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            A monthly recap always covers one calendar month — build a reel for any other stretch of time here instead, like a trip that doesn't line up with month boundaries.
          </p>

          {savedReels.length === 0 ? (
            <div className="empty-state">
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <i className="ti ti-movie" style={{ fontSize: 24, color: 'var(--text-muted)' }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', margin: '0 0 6px' }}>No reels saved yet</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>Tap + above to build one for any date range.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {savedReels.map(reel => (
                <div
                  key={reel.id}
                  onClick={() => onWatchReel(reel)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px', cursor: 'pointer' }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className="ti ti-player-play-filled" style={{ fontSize: 16, color: '#C8993E' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reel.title}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{formatRangeLabel(reel.startDate, reel.endDate)}</p>
                  </div>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      if (window.confirm(`Delete the "${reel.title}" reel? This can't be undone.`)) onDeleteReel(reel.id);
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--text-muted)', fontSize: 16, display: 'flex', flexShrink: 0 }}
                  >
                    <i className="ti ti-trash" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 11 }} onClick={() => { setShowCreate(false); resetForm(); }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', width: '100%', padding: '20px 24px 32px' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 20px' }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px', textAlign: 'center' }}>New reel</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 18px', textAlign: 'center' }}>Pick the dates this reel should cover.</p>

            <input
              className="input-field"
              type="text"
              placeholder="Title (optional — e.g. Seattle trip)"
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{ marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 6px' }}>Start</p>
                <input
                  className="input-field"
                  type="date"
                  value={startDate}
                  max={endDate || TODAY}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 6px' }}>End</p>
                <input
                  className="input-field"
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  max={TODAY}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <button
              className="btn btn-gold"
              style={{ width: '100%', opacity: canSave && !saving ? 1 : 0.5 }}
              disabled={!canSave || saving}
              onClick={handleSave}
            >
              {saving ? 'Building…' : 'Build reel'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SavedReelsScreen;
