import { useState, useEffect, useRef } from 'react';
import { cloudinaryTransform } from '../constants.js';
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

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Composes an ISO 'YYYY-MM-DD' from separate month/day/year fields — only
// once all three are actually filled in (year needs all 4 digits), same
// rule NewEntryScreen's date editor uses.
function composeDate(month, day, year) {
  if (!month || !day || !year || year.length !== 4) return '';
  return `${year}-${month}-${String(day).padStart(2, '0')}`;
}

// Shared by both soundtrack slots — a picked-song card, or a debounced
// search field with results, depending on whether `song` is already set.
function SongSearchField({ song, onPick, onClear, query, onQueryChange, results, searching, placeholder }) {
  if (song) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-elevated)', borderRadius: 14, padding: '12px 14px' }}>
        <img src={song.artworkUrl} style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} alt="" loading="lazy" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.name}</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>{song.artist}</p>
        </div>
        <button onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', fontFamily: "'Urbanist', sans-serif", padding: 0, fontWeight: 600, flexShrink: 0 }}>Change</button>
      </div>
    );
  }
  return (
    <div>
      <div style={{ position: 'relative', marginBottom: results.length > 0 ? 8 : 0 }}>
        <input
          className="input-field"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder={placeholder}
          style={{ paddingRight: 40 }}
        />
        {searching && (
          <i className="ti ti-loader-2" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', animation: 'spin 1s linear infinite', color: 'var(--text-muted)', fontSize: 16 }} />
        )}
      </div>
      {results.length > 0 && (
        <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {results.map((r, i) => (
            <button
              key={r.trackId}
              onClick={() => onPick({ name: r.trackName, artist: r.artistName, artworkUrl: r.artworkUrl100.replace('100x100bb', '300x300bb'), previewUrl: r.previewUrl })}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', border: 'none', borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: "'Urbanist', sans-serif" }}
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
  );
}

const SWIPE_REVEAL = 72; // px of delete-action revealed once swiped open
const SWIPE_OPEN_THRESHOLD = 36; // drag past this far left and it snaps open instead of springing back

// A swipeable row — dragging left reveals a delete action underneath,
// matching the standard iOS/Android "swipe to delete" list pattern instead of
// a permanently-visible trash icon cluttering every row. `open` (whether
// this row is currently revealed) is owned by the parent so opening one row
// can close any other that was already open.
function ReelRow({ reel, thumbPhoto, open, onOpen, onClose, onWatch, onDelete }) {
  const [dragX, setDragX] = useState(open ? -SWIPE_REVEAL : 0);
  const dragState = useRef(null); // { startX, startOffset, moved }

  useEffect(() => { if (!dragState.current) setDragX(open ? -SWIPE_REVEAL : 0); }, [open]);

  function handleTouchStart(e) {
    dragState.current = { startX: e.touches[0].clientX, startOffset: open ? -SWIPE_REVEAL : 0, moved: false };
  }
  function handleTouchMove(e) {
    if (!dragState.current) return;
    const dx = e.touches[0].clientX - dragState.current.startX;
    if (Math.abs(dx) > 6) dragState.current.moved = true;
    setDragX(Math.max(-SWIPE_REVEAL, Math.min(0, dragState.current.startOffset + dx)));
  }
  function handleTouchEnd() {
    if (!dragState.current) return;
    const shouldOpen = dragX < -SWIPE_OPEN_THRESHOLD;
    setDragX(shouldOpen ? -SWIPE_REVEAL : 0);
    if (shouldOpen) onOpen(); else if (open) onClose();
    dragState.current = null;
  }
  function handleClick() {
    if (dragState.current?.moved) return; // this click is the tail end of a drag, not a tap
    if (open) { onClose(); return; }
    onWatch();
  }

  return (
    <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden' }}>
      <button
        onClick={() => onDelete(reel)}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: SWIPE_REVEAL, background: '#D4856A', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        <i className="ti ti-trash" style={{ fontSize: 18, color: '#fff' }} />
      </button>
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px', cursor: 'pointer',
          transform: `translateX(${dragX}px)`, transition: dragState.current ? 'none' : 'transform 0.2s ease', position: 'relative',
        }}
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
      </div>
    </div>
  );
}

function SavedReelsScreen({ entries = [], savedReels = [], onBack, onSwitchSection, onCreateReel, onDeleteReel, onWatchReel }) {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [startMonth, setStartMonth] = useState('');
  const [startDay, setStartDay] = useState('');
  const [startYear, setStartYear] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [endDay, setEndDay] = useState('');
  const [endYear, setEndYear] = useState('');
  const [saving, setSaving] = useState(false);
  const [duration, setDuration] = useState(30); // seconds — 30 or 60; 60 unlocks a second soundtrack slot
  const [song, setSong] = useState(null);
  const [songQuery, setSongQuery] = useState('');
  const [songResults, setSongResults] = useState([]);
  const [songSearching, setSongSearching] = useState(false);
  const [song2, setSong2] = useState(null);
  const [song2Query, setSong2Query] = useState('');
  const [song2Results, setSong2Results] = useState([]);
  const [song2Searching, setSong2Searching] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // the reel pending delete confirmation, or null
  const [openSwipeId, setOpenSwipeId] = useState(null); // which reel row, if any, is currently swiped open

  const startDate = composeDate(startMonth, startDay, startYear);
  const endDate = composeDate(endMonth, endDay, endYear);
  const canSave = startDate && endDate && startDate <= endDate;

  // Same debounced iTunes search NewEntryScreen's song picker uses — a custom
  // reel gets exactly the song(s) the user picked, instead of the fixed
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

  useEffect(() => {
    const q = song2Query.trim();
    if (q.length < 2) { setSong2Results([]); return; }
    const t = setTimeout(async () => {
      setSong2Searching(true);
      try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=8`);
        const data = await res.json();
        setSong2Results((data.results || []).filter(r => r.previewUrl));
      } catch {}
      setSong2Searching(false);
    }, 500);
    return () => clearTimeout(t);
  }, [song2Query]);

  function resetForm() {
    setTitle('');
    setStartMonth(''); setStartDay(''); setStartYear('');
    setEndMonth(''); setEndDay(''); setEndYear('');
    setDuration(30);
    setSong(null);
    setSongQuery('');
    setSongResults([]);
    setSong2(null);
    setSong2Query('');
    setSong2Results([]);
  }

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    const label = title.trim() || formatRangeLabel(startDate, endDate);
    const reel = await onCreateReel({ title: label, startDate, endDate, song, song2: duration === 60 ? song2 : null, durationSec: duration });
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
              {savedReels.map(reel => (
                <ReelRow
                  key={reel.id}
                  reel={reel}
                  thumbPhoto={reelThumbPhoto(entries, reel)}
                  open={openSwipeId === reel.id}
                  onOpen={() => setOpenSwipeId(reel.id)}
                  onClose={() => setOpenSwipeId(id => id === reel.id ? null : id)}
                  onWatch={() => onWatchReel(reel)}
                  onDelete={r => { setDeleteTarget(r); setOpenSwipeId(null); }}
                />
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 6px' }}>Start</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ position: 'relative', flex: 2.2 }}>
                    <select value={startMonth} onChange={e => setStartMonth(e.target.value)} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 32px 12px 12px', fontSize: 14, outline: 'none', background: 'var(--bg-input)', color: startMonth ? 'var(--text)' : 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif", appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}>
                      <option value="" disabled>Month</option>
                      {MONTH_NAMES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
                    </select>
                    <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12, pointerEvents: 'none' }} />
                  </div>
                  <input type="number" placeholder="Day" value={startDay} min={1} max={31} onChange={e => setStartDay(e.target.value)} style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 10, padding: '12px 8px', fontSize: 14, outline: 'none', background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'Urbanist', sans-serif", textAlign: 'center' }} />
                  <input type="number" placeholder="Year" value={startYear} min={1900} max={2100} onChange={e => setStartYear(e.target.value)} style={{ flex: 1.4, border: '1px solid var(--border)', borderRadius: 10, padding: '12px 8px', fontSize: 14, outline: 'none', background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'Urbanist', sans-serif", textAlign: 'center' }} />
                </div>
              </div>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 6px' }}>End</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ position: 'relative', flex: 2.2 }}>
                    <select value={endMonth} onChange={e => setEndMonth(e.target.value)} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 32px 12px 12px', fontSize: 14, outline: 'none', background: 'var(--bg-input)', color: endMonth ? 'var(--text)' : 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif", appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}>
                      <option value="" disabled>Month</option>
                      {MONTH_NAMES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
                    </select>
                    <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12, pointerEvents: 'none' }} />
                  </div>
                  <input type="number" placeholder="Day" value={endDay} min={1} max={31} onChange={e => setEndDay(e.target.value)} style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 10, padding: '12px 8px', fontSize: 14, outline: 'none', background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'Urbanist', sans-serif", textAlign: 'center' }} />
                  <input type="number" placeholder="Year" value={endYear} min={1900} max={2100} onChange={e => setEndYear(e.target.value)} style={{ flex: 1.4, border: '1px solid var(--border)', borderRadius: 10, padding: '12px 8px', fontSize: 14, outline: 'none', background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'Urbanist', sans-serif", textAlign: 'center' }} />
                </div>
              </div>
            </div>

            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 6px' }}>Length</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {[{ value: 30, label: '30 seconds' }, { value: 60, label: '1 minute' }].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setDuration(opt.value)}
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: 10,
                    border: duration === opt.value ? '1px solid #C8993E' : '1px solid var(--border)',
                    background: duration === opt.value ? 'rgba(200,153,62,0.12)' : 'var(--bg-input)',
                    color: duration === opt.value ? '#C8993E' : 'var(--text)',
                    fontSize: 13, fontWeight: 600, fontFamily: "'Urbanist', sans-serif", cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 6px' }}>
              {duration === 60 ? 'First soundtrack (optional)' : 'Soundtrack (optional)'}
            </p>
            <div style={{ marginBottom: 20 }}>
              <SongSearchField
                song={song}
                onPick={picked => { setSong(picked); setSongQuery(''); setSongResults([]); }}
                onClear={() => setSong(null)}
                query={songQuery}
                onQueryChange={setSongQuery}
                results={songResults}
                searching={songSearching}
                placeholder="Search for a song… (defaults to a mood track if left blank)"
              />
            </div>

            {duration === 60 && (
              <>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 6px' }}>Second soundtrack (optional)</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>Plays for the back half of a 1-minute reel.</p>
                <div style={{ marginBottom: 20 }}>
                  <SongSearchField
                    song={song2}
                    onPick={picked => { setSong2(picked); setSong2Query(''); setSong2Results([]); }}
                    onClear={() => setSong2(null)}
                    query={song2Query}
                    onQueryChange={setSong2Query}
                    results={song2Results}
                    searching={song2Searching}
                    placeholder="Search for a second song… (defaults to a mood track if left blank)"
                  />
                </div>
              </>
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
