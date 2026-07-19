import { useState, useEffect } from 'react';
import { TODAY, cloudinaryTransform } from '../constants.js';
import SectionSwitcher from '../SectionSwitcher.jsx';

function formatRangeLabel(startDate, endDate) {
  const s = new Date(startDate + 'T12:00:00');
  const e = new Date(endDate + 'T12:00:00');
  const sameYear = s.getFullYear() === e.getFullYear();
  const startLabel = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
  const endLabel = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return startDate === endDate ? endLabel : `${startLabel} – ${endLabel}`;
}

// A little "movie poster" for the list row — the first photo actually in
// that reel's date range, rather than a generic icon standing in for every
// reel alike.
function reelThumbPhoto(entries, reel) {
  for (const e of entries) {
    if (e.date < reel.startDate || e.date > reel.endDate) continue;
    const photo = e.media?.find(m => m.type !== 'video');
    if (photo) return photo;
  }
  return null;
}

function SavedReelsScreen({ entries = [], savedReels = [], onBack, onSwitchSection, onCreateReel, onDeleteReel, onWatchReel }) {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [song, setSong] = useState(null);
  const [songQuery, setSongQuery] = useState('');
  const [songResults, setSongResults] = useState([]);
  const [songSearching, setSongSearching] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // the reel pending delete confirmation, or null

  const canSave = startDate && endDate && startDate <= endDate;

  // Same debounced iTunes search NewEntryScreen's song picker uses — a custom
  // reel gets exactly the song the user picked, instead of the fixed
  // Landslide/Coastline tracks a monthly reel auto-selects for its mood.
  useEffect(() => {
    const q = songQuery.trim();
    if (q.length < 2) { setSongResults([]); return; }
    const t = setTimeout(async () => {
      setSongSearching(true);
      try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=8`);
        const data = await res.json();
        setSongResults((data.results || []).filter(r => r.previewUrl));
      } catch {}
      setSongSearching(false);
    }, 500);
    return () => clearTimeout(t);
  }, [songQuery]);

  function resetForm() {
    setTitle('');
    setStartDate('');
    setEndDate('');
    setSong(null);
    setSongQuery('');
    setSongResults([]);
  }

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    const label = title.trim() || formatRangeLabel(startDate, endDate);
    const reel = await onCreateReel({ title: label, startDate, endDate, song });
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
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 28, height: 1, background: 'rgba(200,153,62,0.4)', margin: '0 auto 5px' }} />
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>Keepsakes</h2>
              </div>
              <button className="icon-btn" onClick={() => setShowCreate(true)}>
                <i className="ti ti-plus" />
              </button>
            </div>

            <div>
              <SectionSwitcher
                tabs={[{ id: 'recap', label: 'Recap', icon: 'ti-sparkles' }, { id: 'partner-letters', label: 'All letters', icon: 'ti-mail' }, { id: 'compare', label: 'At the same age', icon: 'ti-arrows-diff' }, { id: 'reels', label: 'Reels', icon: 'ti-player-play' }]}
                active="reels"
                onChange={onSwitchSection}
              />
            </div>
          </div>

          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            Build a reel for any stretch of time — a trip, a season, anything that doesn't fit neatly into one calendar month.
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
              {savedReels.map(reel => {
                const thumbPhoto = reelThumbPhoto(entries, reel);
                return (
                <div
                  key={reel.id}
                  onClick={() => onWatchReel(reel)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px', cursor: 'pointer' }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
                    {thumbPhoto ? (
                      <>
                        <img src={cloudinaryTransform(thumbPhoto.url, 'w_100,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" loading="lazy" />
                        <div style={{ position: 'absolute', bottom: 3, right: 3, width: 15, height: 15, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i className="ti ti-player-play-filled" style={{ fontSize: 8, color: '#fff' }} />
                        </div>
                      </>
                    ) : (
                      <i className="ti ti-player-play-filled" style={{ fontSize: 16, color: '#C8993E' }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reel.title}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{formatRangeLabel(reel.startDate, reel.endDate)}</p>
                  </div>
                  <button
                    className="icon-btn"
                    onClick={e => { e.stopPropagation(); setDeleteTarget(reel); }}
                    style={{ width: 32, height: 32, fontSize: 14, color: '#D4856A', borderColor: 'rgba(212,133,106,0.35)', background: 'rgba(212,133,106,0.08)', flexShrink: 0 }}
                  >
                    <i className="ti ti-trash" />
                  </button>
                </div>
                );
              })}
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
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 6px' }}>Start</p>
                <input
                  className="input-field"
                  type="date"
                  value={startDate}
                  max={endDate || TODAY}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
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

            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 6px' }}>Soundtrack (optional)</p>
            {song ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-elevated)', borderRadius: 14, padding: '12px 14px', marginBottom: 20 }}>
                <img src={song.artworkUrl} style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} alt="" loading="lazy" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>{song.artist}</p>
                </div>
                <button onClick={() => setSong(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', fontFamily: "'Urbanist', sans-serif", padding: 0, fontWeight: 600, flexShrink: 0 }}>Change</button>
              </div>
            ) : (
              <div style={{ marginBottom: 20 }}>
                <div style={{ position: 'relative', marginBottom: songResults.length > 0 ? 8 : 0 }}>
                  <input
                    className="input-field"
                    value={songQuery}
                    onChange={e => setSongQuery(e.target.value)}
                    placeholder="Search for a song… (defaults to a mood track if left blank)"
                    style={{ paddingRight: 40 }}
                  />
                  {songSearching && (
                    <i className="ti ti-loader-2" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', animation: 'spin 1s linear infinite', color: 'var(--text-muted)', fontSize: 16 }} />
                  )}
                </div>
                {songResults.length > 0 && (
                  <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    {songResults.map((r, i) => (
                      <button
                        key={r.trackId}
                        onClick={() => { setSong({ name: r.trackName, artist: r.artistName, artworkUrl: r.artworkUrl100.replace('100x100bb', '300x300bb'), previewUrl: r.previewUrl }); setSongQuery(''); setSongResults([]); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', border: 'none', borderBottom: i < songResults.length - 1 ? '1px solid var(--border)' : 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: "'Urbanist', sans-serif" }}
                      >
                        <img src={r.artworkUrl100} style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} alt="" loading="lazy" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.trackName}</p>
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.artistName}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

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

      {deleteTarget && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 11 }} onClick={() => setDeleteTarget(null)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', padding: '28px 24px 36px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(212,133,106,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <i className="ti ti-trash" style={{ fontSize: 19, color: '#D4856A' }} />
            </div>
            <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px', textAlign: 'center' }}>Delete "{deleteTarget.title}"?</p>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', textAlign: 'center' }}>This can't be undone.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn" style={{ flex: 1, background: '#D4856A', color: '#fff' }} onClick={() => { onDeleteReel(deleteTarget.id); setDeleteTarget(null); }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SavedReelsScreen;
