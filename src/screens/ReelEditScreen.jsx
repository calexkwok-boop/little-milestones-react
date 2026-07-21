import { useState, useEffect, useMemo, useRef } from 'react';
import { cloudinaryTransform } from '../constants.js';
import {
  buildReelCandidates, autoSampleSlides, resolveSlideRefs, slideToRef,
  videoThumbUrl, SongSearchField,
} from './reelShared.jsx';

// Stable identity for a candidate/slide across renders — a photo/video keyed
// by its media url (matches how buildReelCandidates already dedupes), a
// letter by its source entry, the trip by nothing (there's ever only one).
function keyForSlide(s) {
  if (s.type === 'trip') return 'trip';
  if (s.type === 'text') return `letter-${s.entryId}`;
  return `media-${s.url}`;
}

function cardLabel(item) {
  if (item.type === 'trip') return 'Trip';
  if (item.type === 'text') return item.subtype === 'letter' ? 'Letter' : 'Note';
  return item.mediaType === 'video' ? 'Video' : 'Photo';
}

// The thumbnail portion of a card — shared between the real strip cards and
// the floating ghost that follows the finger while dragging, so the two
// never drift out of sync with each other.
function CardThumb({ item, wide }) {
  if (item.type === 'trip') {
    return (
      <div style={{ width: wide ? 96 : 62, height: 62, borderRadius: 11, background: 'linear-gradient(135deg, rgba(200,153,62,0.35), rgba(74,94,80,0.5))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>✈️</div>
    );
  }
  if (item.type === 'text') {
    return (
      <div style={{ width: 96, height: 62, borderRadius: 11, background: 'rgba(200,153,62,0.09)', border: '1px solid rgba(200,153,62,0.3)', padding: '6px 7px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', overflow: 'hidden', flexShrink: 0, boxSizing: 'border-box' }}>
        <span style={{ fontSize: 11, color: '#C8993E', marginBottom: 3 }}>✉</span>
        <span style={{ fontSize: 9, fontStyle: 'italic', fontFamily: "'Source Serif 4', serif", color: 'var(--text)', lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }}>{item.text}</span>
      </div>
    );
  }
  const src = item.mediaType === 'video' ? videoThumbUrl(item.url, 'so_0,w_200,q_auto,f_auto') : cloudinaryTransform(item.url, 'w_200,q_auto,f_auto');
  return (
    <div style={{ width: 62, height: 62, borderRadius: 11, backgroundImage: `url('${src}')`, backgroundSize: 'cover', backgroundPosition: 'center', border: '1px solid var(--border)', position: 'relative', flexShrink: 0 }}>
      {item.mediaType === 'video' && (
        <div style={{ position: 'absolute', bottom: 3, right: 3, width: 15, height: 15, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="ti ti-player-play-filled" style={{ fontSize: 7, color: '#fff' }} />
        </div>
      )}
    </div>
  );
}

const LONG_PRESS_MS = 300;
const MOVE_CANCEL_PX = 8;

export default function ReelEditScreen({ entries, kids, familyMembers = [], reel, onBack, onSave }) {
  const isNew = reel.id == null; // opened straight from "+ New reel" — nothing's been written to Keepsakes yet
  const [title, setTitle] = useState(reel.title);
  const [song, setSong] = useState(reel.song || null);
  const [songQuery, setSongQuery] = useState('');
  const [songResults, setSongResults] = useState([]);
  const [songSearching, setSongSearching] = useState(false);
  const [song2, setSong2] = useState(reel.song2 || null);
  const [song2Query, setSong2Query] = useState('');
  const [song2Results, setSong2Results] = useState([]);
  const [song2Searching, setSong2Searching] = useState(false);
  // Once a reel's been through the editor, its format becomes an explicit
  // saved choice too (same as its content) rather than something re-derived
  // live from how much media happened to be in range — so a monthly bookmark
  // that already had a second song defaults to "1 minute" here.
  const [durationSec, setDurationSec] = useState(reel.durationSec === 60 || reel.song2 ? 60 : 30);
  const [saving, setSaving] = useState(false);

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

  // The same full, unbudgeted pool the live reel draws from — a previously
  // edited reel resolves its exact saved slide_refs against this; a
  // freshly-built one (never edited) starts from what the algorithm would
  // have picked, via the same autoSampleSlides the live reel itself uses.
  const candidates = useMemo(
    () => buildReelCandidates(entries, kids, familyMembers, reel.startDate, reel.endDate),
    [entries, kids, familyMembers, reel.startDate, reel.endDate]
  );
  const [slideList, setSlideList] = useState(() => {
    if (reel.slideRefs && reel.slideRefs.length > 0) return resolveSlideRefs(reel.slideRefs, candidates, candidates.trip);
    return autoSampleSlides(candidates, { forceLongReel: reel.durationSec === 60, reelId: reel.id }).slides;
  });

  // Everything else in range that isn't currently in the reel — always
  // computed fresh, so a reel reopened later can surface genuinely new
  // content (a photo added since it was last edited) to pull in manually,
  // even though playback itself no longer auto-enriches once slide_refs
  // is set.
  const availableList = useMemo(() => {
    const usedKeys = new Set(slideList.map(keyForSlide));
    return [...candidates.photoCandidates, ...candidates.textCandidates].filter(c => !usedKeys.has(keyForSlide(c)));
  }, [candidates, slideList]);

  function removeFromSlides(key) {
    setSlideList(prev => prev.filter(s => keyForSlide(s) !== key));
  }

  // --- Touch drag-and-drop (hand-rolled — HTML5 drag/drop doesn't work on
  // touchscreens). A long press (not an immediate touch) starts a drag, so a
  // quick swipe still scrolls the strip normally instead of every touch
  // fighting the browser's own horizontal scroll. Listens on `document`
  // (not the card itself) only once a drag is actually confirmed, and only
  // then calls preventDefault — so an ordinary scroll is never intercepted.
  const slideStripRef = useRef(null);
  const availStripRef = useRef(null);
  const dragRef = useRef(null); // { key, item, fromList, startX, startY, active, timer }
  const dropRef = useRef(null); // { list, index } — read at drop time, kept in a ref to avoid stale closures
  const [draggingKey, setDraggingKey] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // mirror of dropRef, for rendering the insertion line
  const [ghostPos, setGhostPos] = useState(null);
  const [ghostItem, setGhostItem] = useState(null);

  function onCardTouchStart(e, item, fromList) {
    const t = e.touches[0];
    const drag = { key: keyForSlide(item), item, fromList, startX: t.clientX, startY: t.clientY, active: false };
    drag.timer = setTimeout(() => {
      if (dragRef.current !== drag) return;
      drag.active = true;
      setDraggingKey(drag.key);
      setGhostItem(drag.item);
      setGhostPos({ x: drag.startX, y: drag.startY });
      try { navigator.vibrate?.(10); } catch {}
    }, LONG_PRESS_MS);
    dragRef.current = drag;
  }

  useEffect(() => {
    function computeDropTarget(clientX, clientY) {
      const slideRect = slideStripRef.current?.getBoundingClientRect();
      const availRect = availStripRef.current?.getBoundingClientRect();
      let list = null;
      if (slideRect && clientY >= slideRect.top - 24 && clientY <= slideRect.bottom + 24) list = 'slide';
      else if (availRect && clientY >= availRect.top - 24 && clientY <= availRect.bottom + 24) list = 'avail';
      if (!list) return null;
      const container = list === 'slide' ? slideStripRef.current : availStripRef.current;
      const cardEls = [...container.querySelectorAll('[data-card-key]')];
      let index = cardEls.length;
      for (let i = 0; i < cardEls.length; i++) {
        const r = cardEls[i].getBoundingClientRect();
        if (clientX < r.left + r.width / 2) { index = i; break; }
      }
      return { list, index };
    }

    function onMove(e) {
      const drag = dragRef.current;
      if (!drag) return;
      const t = e.touches[0];
      if (!drag.active) {
        const dx = Math.abs(t.clientX - drag.startX), dy = Math.abs(t.clientY - drag.startY);
        if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) { clearTimeout(drag.timer); dragRef.current = null; }
        return;
      }
      e.preventDefault();
      setGhostPos({ x: t.clientX, y: t.clientY });
      const target = computeDropTarget(t.clientX, t.clientY);
      dropRef.current = target;
      setDropTarget(target);
    }

    function onEnd() {
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag && !drag.active) clearTimeout(drag.timer);
      const target = dropRef.current;
      dropRef.current = null;
      setDraggingKey(null);
      setGhostItem(null);
      setGhostPos(null);
      setDropTarget(null);
      if (!drag?.active || !target) return;

      if (drag.fromList === 'slide' && target.list === 'slide') {
        setSlideList(prev => {
          const fromIdx = prev.findIndex(s => keyForSlide(s) === drag.key);
          if (fromIdx === -1) return prev;
          const copy = prev.slice();
          const [moved] = copy.splice(fromIdx, 1);
          const idx = fromIdx < target.index ? target.index - 1 : target.index;
          copy.splice(idx, 0, moved);
          return copy;
        });
      } else if (target.list === 'slide') {
        // From the available pool into the reel, at the exact drop position.
        setSlideList(prev => {
          const copy = prev.slice();
          copy.splice(target.index, 0, drag.item);
          return copy;
        });
      } else if (drag.fromList === 'slide') {
        // Dropped back into the available strip — benched, not deleted.
        removeFromSlides(drag.key);
      }
      // Dropped from available back into available: no-op, nothing to change.
    }

    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    return () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    await onSave({
      title: title.trim() || reel.title,
      song,
      song2: durationSec === 60 ? song2 : null,
      durationSec,
      slideRefs: slideList.map(slideToRef),
    });
    setSaving(false);
  }

  function renderCard(item, fromList) {
    const key = keyForSlide(item);
    const isDragging = draggingKey === key;
    return (
      <div
        key={key}
        data-card-key={key}
        onTouchStart={e => onCardTouchStart(e, item, fromList)}
        style={{ width: item.type === 'text' || item.type === 'trip' ? (item.type === 'text' ? 96 : 62) : 62, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, position: 'relative', opacity: isDragging ? 0.35 : 1 }}
      >
        {fromList === 'slide' && (
          <button
            onTouchStart={e => e.stopPropagation()}
            onClick={() => removeFromSlides(key)}
            style={{ position: 'absolute', top: -6, right: -6, width: 19, height: 19, borderRadius: '50%', background: '#D4856A', color: '#fff', border: '2px solid var(--bg)', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3, cursor: 'pointer' }}
          >×</button>
        )}
        <CardThumb item={item} />
        <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-muted)' }}>{cardLabel(item)}</span>
      </div>
    );
  }

  function renderDropIndicator(list) {
    if (!dropTarget || dropTarget.list !== list) return null;
    return <div style={{ width: 2, borderRadius: 1, background: '#C8993E', flexShrink: 0, alignSelf: 'stretch', margin: '3px -1px' }} />;
  }

  function stripWithIndicator(list, items, containerRef) {
    const cards = items.map(item => renderCard(item, list));
    if (!dropTarget || dropTarget.list !== list) return cards;
    const idx = Math.max(0, Math.min(items.length, dropTarget.index));
    const out = cards.slice(0, idx);
    out.push(<span key="__drop_indicator__">{renderDropIndicator(list)}</span>);
    out.push(...cards.slice(idx));
    return out;
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--bg)', zIndex: 100, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, padding: '2px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 24, height: 1, background: 'rgba(200,153,62,0.4)', margin: '0 auto 4px' }} />
          <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>{isNew ? 'New reel' : 'Edit reel'}</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ border: 'none', borderRadius: 999, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, background: 'linear-gradient(180deg, #D4A84B 0%, #B8872E 100%)', color: '#fff', boxShadow: '0 2px 6px rgba(140,100,20,0.32), inset 0 1px 0 rgba(255,255,255,0.18)', flexShrink: 0, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? (isNew ? 'Building…' : 'Saving…') : (isNew ? 'Build reel' : 'Save')}
        </button>
      </div>

      <div className="scroll-area">
        <div style={{ padding: '4px 16px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 13, padding: '8px 10px', marginBottom: 10 }}>
            <div style={{ width: 24, height: 24, borderRadius: 7, background: 'rgba(200,153,62,0.14)', color: '#C8993E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>Aa</div>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: 'var(--text)', fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 15, padding: 2, outline: 'none' }}
            />
          </div>

          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 13, padding: '10px 10px 12px', marginBottom: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px' }}>Length</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[{ value: 30, label: '30 seconds' }, { value: 60, label: '1 minute' }].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setDurationSec(opt.value)}
                  style={{
                    flex: 1, padding: '9px 8px', borderRadius: 9,
                    border: durationSec === opt.value ? 'none' : '1px solid var(--border)',
                    background: durationSec === opt.value ? 'linear-gradient(180deg, #D4A84B 0%, #B8872E 100%)' : 'var(--bg-input)',
                    boxShadow: durationSec === opt.value ? '0 2px 6px rgba(140,100,20,0.32), inset 0 1px 0 rgba(255,255,255,0.18)' : 'none',
                    color: durationSec === opt.value ? '#fff' : 'var(--text)',
                    fontSize: 12.5, fontWeight: 600, fontFamily: "'Urbanist', sans-serif", cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 6px' }}>
              {durationSec === 60 ? 'First soundtrack' : 'Soundtrack'}
            </p>
            <SongSearchField
              song={song}
              onPick={picked => { setSong(picked); setSongQuery(''); setSongResults([]); }}
              onClear={() => setSong(null)}
              query={songQuery}
              onQueryChange={setSongQuery}
              results={songResults}
              searching={songSearching}
              placeholder="Search for a song…"
            />
            {durationSec === 60 && (
              <>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '12px 0 6px' }}>Second soundtrack</p>
                <SongSearchField
                  song={song2}
                  onPick={picked => { setSong2(picked); setSong2Query(''); setSong2Results([]); }}
                  onClear={() => setSong2(null)}
                  query={song2Query}
                  onQueryChange={setSong2Query}
                  results={song2Results}
                  searching={song2Searching}
                  placeholder="Search for a second song…"
                />
              </>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', margin: 0 }}>In this reel</p>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>{slideList.length} slide{slideList.length !== 1 ? 's' : ''}</p>
            </div>
            <div
              ref={slideStripRef}
              style={{
                display: 'flex', gap: 9, overflowX: draggingKey ? 'hidden' : 'auto', padding: '10px 3px', margin: '-7px -3px 0',
                minHeight: 96, borderRadius: 14,
                border: slideList.length === 0 ? '1.5px dashed var(--border)' : 'none',
                alignItems: slideList.length === 0 ? 'center' : undefined,
                justifyContent: slideList.length === 0 ? 'center' : undefined,
              }}
            >
              {slideList.length === 0
                ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Drag something up from below</span>
                : stripWithIndicator('slide', slideList, slideStripRef)}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Not in this reel yet</p>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>drag one up ↑</p>
            </div>
            <div
              ref={availStripRef}
              style={{ display: 'flex', gap: 9, overflowX: draggingKey ? 'hidden' : 'auto', padding: '10px 3px', margin: '-7px -3px 0', minHeight: availableList.length === 0 ? 40 : undefined }}
            >
              {availableList.length === 0
                ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Everything from this range is already in the reel</span>
                : stripWithIndicator('avail', availableList, availStripRef)}
            </div>
          </div>

          <p style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', margin: '14px 0 0', padding: '0 8px', lineHeight: 1.5 }}>
            Nothing here is ever deleted from your journal — this only changes what plays in the reel.
          </p>
        </div>
      </div>

      {ghostItem && ghostPos && (
        <div style={{ position: 'fixed', left: ghostPos.x, top: ghostPos.y, transform: 'translate(-50%, -50%) scale(1.08)', pointerEvents: 'none', zIndex: 200, filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.35))' }}>
          <CardThumb item={ghostItem} />
        </div>
      )}
    </div>
  );
}
