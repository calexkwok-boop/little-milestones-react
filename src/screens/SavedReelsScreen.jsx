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

function formatDateLong(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// A real tap directly on the (invisible, but genuinely interactive) native
// input already opens the OS date picker on mobile — no JS needed there.
// Desktop is the exception: clicking a date input only opens its calendar
// when you hit its own tiny built-in icon, not anywhere else in the field,
// so this explicit showPicker() call is what makes clicking *this row's*
// text/emoji (not that icon) work on desktop specifically.
function openDatePicker(ref) {
  const el = ref.current;
  if (!el) return;
  if (typeof el.showPicker === 'function') {
    try { el.showPicker(); return; } catch {}
  }
  el.focus();
  el.click();
}

const SWIPE_REVEAL = 144; // px of edit+delete actions revealed once swiped open (two 72px buttons)
const SWIPE_OPEN_THRESHOLD = 36; // drag past this far left and it snaps open instead of springing back

// A swipeable row — dragging left reveals edit + delete actions underneath,
// matching the standard iOS/Android "swipe for actions" list pattern instead
// of permanently-visible icons cluttering every row. `open` (whether this
// row is currently revealed) is owned by the parent so opening one row can
// close any other that was already open.
function ReelRow({ reel, thumbPhoto, open, onOpen, onClose, onWatch, onEdit, onDelete }) {
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
        onClick={() => { onEdit(reel); onClose(); }}
        style={{ position: 'absolute', top: 0, right: 72, bottom: 0, width: 72, background: 'var(--accent)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        <i className="ti ti-pencil" style={{ fontSize: 18, color: '#fff' }} />
      </button>
      <button
        onClick={() => onDelete(reel)}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 72, background: '#D4856A', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
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

function SavedReelsScreen({ entries = [], savedReels = [], onBack, onSwitchSection, onStartBuilding, onDeleteReel, onWatchReel, onEditReel }) {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const startDateInputRef = useRef(null);
  const endDateInputRef = useRef(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // the reel pending delete confirmation, or null
  const [openSwipeId, setOpenSwipeId] = useState(null); // which reel row, if any, is currently swiped open

  const canContinue = startDate && endDate && startDate <= endDate;

  function resetForm() {
    setTitle('');
    setStartDate(''); setEndDate('');
  }

  // Just enough to know what the reel covers — title, length, soundtrack,
  // and exactly which slides make the cut are all decided next, in the same
  // editor a saved reel is later reopened through. Nothing is written to
  // Keepsakes until that editor's own "Build reel" is tapped.
  function handleContinue() {
    if (!canContinue) return;
    const label = title.trim() || formatRangeLabel(startDate, endDate);
    setShowCreate(false);
    onStartBuilding({ title: label, startDate, endDate });
    resetForm();
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
                  onEdit={onEditReel}
                  onDelete={r => { setDeleteTarget(r); setOpenSwipeId(null); }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 11 }} onClick={() => { setShowCreate(false); resetForm(); }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', width: '100%', maxHeight: '86vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ flexShrink: 0, padding: '14px 20px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 14px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ width: 28, flexShrink: 0 }} />
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 3px' }}>New reel</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>For any stretch of time — not just a month.</p>
                </div>
                <button
                  onClick={() => { setShowCreate(false); resetForm(); }}
                  style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'var(--bg-elevated)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                >
                  <i className="ti ti-x" style={{ fontSize: 13 }} />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px 4px' }}>
              <input
                className="input-field"
                type="text"
                placeholder="Title (optional — e.g. Seattle trip)"
                value={title}
                onChange={e => setTitle(e.target.value)}
                style={{ marginBottom: 20 }}
              />

              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 16px 18px', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(127,176,127,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className="ti ti-calendar-event" style={{ fontSize: 13, color: 'var(--accent)' }} />
                  </div>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', margin: 0 }}>When</p>
                </div>
                <div style={{ position: 'relative', paddingLeft: 16 }}>
                  <div style={{ position: 'absolute', left: 4, top: 8, bottom: 8, width: 1, background: 'var(--border)' }} />
                  <div style={{ position: 'relative', marginBottom: 14 }}>
                    <div style={{ position: 'absolute', left: -16, top: 5, width: 7, height: 7, borderRadius: '50%', background: '#C8993E', border: '2px solid var(--bg-elevated)' }} />
                    <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 6px' }}>Start</p>
                    <div
                      onClick={() => openDatePicker(startDateInputRef)}
                      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: 'var(--bg-input)', cursor: 'pointer' }}
                    >
                      <span style={{ fontSize: 16, flexShrink: 0 }}>📅</span>
                      <span style={{ flex: 1, fontSize: 14, color: startDate ? 'var(--text)' : 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif" }}>
                        {startDate ? formatDateLong(startDate) : 'Choose a date'}
                      </span>
                      <input
                        ref={startDateInputRef}
                        type="date"
                        value={startDate}
                        max={endDate || undefined}
                        onChange={e => setStartDate(e.target.value)}
                        style={{ position: 'absolute', inset: 0, opacity: 0, border: 'none', margin: 0, padding: 0, cursor: 'pointer' }}
                      />
                    </div>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: -16, top: 5, width: 7, height: 7, borderRadius: '50%', background: '#C8993E', border: '2px solid var(--bg-elevated)' }} />
                    <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 6px' }}>End</p>
                    <div
                      onClick={() => openDatePicker(endDateInputRef)}
                      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: 'var(--bg-input)', cursor: 'pointer' }}
                    >
                      <span style={{ fontSize: 16, flexShrink: 0 }}>📅</span>
                      <span style={{ flex: 1, fontSize: 14, color: endDate ? 'var(--text)' : 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif" }}>
                        {endDate ? formatDateLong(endDate) : 'Choose a date'}
                      </span>
                      <input
                        ref={endDateInputRef}
                        type="date"
                        value={endDate}
                        min={startDate || undefined}
                        onChange={e => setEndDate(e.target.value)}
                        style={{ position: 'absolute', inset: 0, opacity: 0, border: 'none', margin: 0, padding: 0, cursor: 'pointer' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ flexShrink: 0, padding: '14px 24px 28px', borderTop: '1px solid var(--border)' }}>
              <button
                className="btn btn-gold"
                style={{ width: '100%', opacity: canContinue ? 1 : 0.5 }}
                disabled={!canContinue}
                onClick={handleContinue}
              >
                Continue
              </button>
            </div>
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
