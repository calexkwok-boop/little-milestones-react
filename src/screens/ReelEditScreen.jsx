import { useState, useEffect, useMemo, useRef } from 'react';
import { cloudinaryTransform } from '../constants.js';
import {
  buildReelCandidates, autoSampleSlides, resolveSlideRefs, slideToRef,
  videoThumbUrl, SongSearchField,
} from './reelShared.jsx';

// Stable identity for a candidate/slide across renders — a photo/video keyed
// by its media url (matches how buildReelCandidates already dedupes), a
// letter by its source entry, a trip by its own derived id (a range can
// surface more than one).
function keyForSlide(s) {
  if (s.type === 'trip') return `trip-${s.id}`;
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
      <div style={{ width: 78, height: 62, borderRadius: 11, background: 'linear-gradient(135deg, rgba(200,153,62,0.35), rgba(74,94,80,0.5))', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, flexShrink: 0, padding: '0 6px', boxSizing: 'border-box' }}>
        <span style={{ fontSize: 17 }}>✈️</span>
        <span style={{ fontSize: 8, fontWeight: 700, color: '#3a4a3f', textAlign: 'center', lineHeight: 1.15, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{item.destinationLabel}</span>
      </div>
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
    <div style={{ width: 62, height: 62, borderRadius: 11, backgroundImage: `url('${src}')`, backgroundSize: 'cover', backgroundPosition: 'center', border: '1px solid var(--border)', position: 'relative', flexShrink: 0, WebkitTouchCallout: 'none', WebkitUserDrag: 'none' }}>
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
    if (reel.slideRefs && reel.slideRefs.length > 0) return resolveSlideRefs(reel.slideRefs, candidates);
    return autoSampleSlides(candidates, { forceLongReel: reel.durationSec === 60, reelId: reel.id }).slides;
  });

  // Everything else in range that isn't currently in the reel — always
  // computed fresh, so a reel reopened later can surface genuinely new
  // content (a photo added since it was last edited) to pull in manually,
  // even though playback itself no longer auto-enriches once slide_refs
  // is set. Split into three so finding a specific video or letter doesn't
  // mean scrolling past a wall of photos first.
  const availablePhotos = useMemo(() => {
    const usedKeys = new Set(slideList.map(keyForSlide));
    return candidates.photoCandidates.filter(c => c.mediaType !== 'video' && !usedKeys.has(keyForSlide(c)));
  }, [candidates, slideList]);
  const availableVideos = useMemo(() => {
    const usedKeys = new Set(slideList.map(keyForSlide));
    return candidates.photoCandidates.filter(c => c.mediaType === 'video' && !usedKeys.has(keyForSlide(c)));
  }, [candidates, slideList]);
  const availableLetters = useMemo(() => {
    const usedKeys = new Set(slideList.map(keyForSlide));
    return candidates.textCandidates.filter(c => !usedKeys.has(keyForSlide(c)));
  }, [candidates, slideList]);
  const availableTrips = useMemo(() => {
    const usedKeys = new Set(slideList.map(keyForSlide));
    return candidates.trips.filter(c => !usedKeys.has(keyForSlide(c)));
  }, [candidates, slideList]);

  // Three separate ceilings rather than one lump number — photos/videos
  // share a flexible, duration-dependent budget (videos always get in
  // uncapped, photos fill whatever's left), while letters and the trip
  // slide have their own small, fixed caps that don't move with duration.
  // Keeping them apart means removing a letter visibly frees a letter slot
  // instead of nudging one ambiguous shared total.
  const mediaBudget = useMemo(() => {
    const maxPhotoBudget = durationSec === 60 ? 14 : 7;
    const videoCount = candidates.photoCandidates.filter(c => c.mediaType === 'video').length;
    const imageCount = candidates.photoCandidates.length - videoCount;
    const imageBudget = Math.max(0, maxPhotoBudget - videoCount);
    return videoCount + Math.min(imageBudget, imageCount);
  }, [candidates, durationSec]);
  const letterCap = Math.min(2, candidates.textCandidates.length);
  const tripCap = candidates.trips.length;

  const mediaInReel = useMemo(() => slideList.filter(s => s.type === 'photo').length, [slideList]);
  const lettersInReel = useMemo(() => slideList.filter(s => s.type === 'text').length, [slideList]);
  const tripsInReel = useMemo(() => slideList.filter(s => s.type === 'trip').length, [slideList]);

  function removeFromSlides(key) {
    setSlideList(prev => prev.filter(s => keyForSlide(s) !== key));
  }

  // --- Touch drag-and-drop (hand-rolled — HTML5 drag/drop doesn't work on
  // touchscreens). Built on Pointer Events rather than Touch Events so the
  // exact same code drives a mouse on desktop too — one code path instead of
  // a separate mouse-drag implementation. A long press (not an immediate
  // pointer-down) starts a drag, so a quick swipe still scrolls the strip
  // normally instead of every touch fighting the browser's own horizontal
  // scroll. Listens on `document` (not the card itself) only once a drag is
  // actually confirmed, and only then calls preventDefault — so an ordinary
  // scroll (or, on desktop, a text selection) is never intercepted.
  const slideStripRef = useRef(null);
  const availPhotosStripRef = useRef(null);
  const availVideosStripRef = useRef(null);
  const availLettersStripRef = useRef(null);
  const availTripsStripRef = useRef(null);
  const scrollAreaRef = useRef(null); // the whole screen's scroll container — dragging near its top/bottom edge auto-scrolls it
  const dragRef = useRef(null); // { key, item, fromList, startX, startY, active, timer }
  const dropRef = useRef(null); // { list, index } — read at drop time, kept in a ref to avoid stale closures
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const autoScrollVelRef = useRef(0); // px/frame; negative = scrolling up, positive = down, 0 = none
  const rafRef = useRef(null);
  const [draggingKey, setDraggingKey] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // mirror of dropRef, for rendering the insertion line
  const [ghostPos, setGhostPos] = useState(null);
  const [ghostItem, setGhostItem] = useState(null);

  // A letter/note card is too small to read in place — its thumbnail is
  // just a truncated excerpt anyway (buildReelCandidates caps it at
  // 140-200 chars), so tapping one opens the full original entry text
  // instead of trying to make a 96×62 card scrollable.
  const [previewItem, setPreviewItem] = useState(null);

  function onCardPointerDown(e, item, fromList) {
    if (e.button != null && e.button !== 0) return; // ignore right/middle mouse
    const drag = { key: keyForSlide(item), item, fromList, startX: e.clientX, startY: e.clientY, active: false };
    if (e.pointerType === 'mouse') {
      // The long-press-then-cancel-on-movement gate below exists only to let
      // an ordinary touch swipe still scroll the strip instead of starting a
      // drag — a mouse has no competing scroll gesture on this element, and
      // a real mouse drag moves well past MOVE_CANCEL_PX within 300ms, so
      // gating it the same way as touch would cancel every mouse drag before
      // it ever activated. Activate immediately instead, matching ordinary
      // desktop drag-and-drop feel.
      drag.active = true;
      setDraggingKey(drag.key);
      setGhostItem(drag.item);
      setGhostPos({ x: drag.startX, y: drag.startY });
      dragRef.current = drag;
      return;
    }
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
      // Each section has its own label and margin around the actual strip,
      // so a fixed ±24px band around just the strip rect leaves real gaps
      // between sections where a drop lands in nobody's zone and silently
      // does nothing — which is exactly what made crossing from "In this
      // reel" into any available strip (or back) feel broken. Picking
      // whichever section is *closest* instead guarantees every release
      // point resolves to some zone, with no dead space between them.
      const zones = [
        ['slide', slideStripRef],
        ['photo', availPhotosStripRef],
        ['video', availVideosStripRef],
        ['letter', availLettersStripRef],
        ['trip', availTripsStripRef],
      ];
      let best = null, bestDist = Infinity;
      for (const [zone, ref] of zones) {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) continue;
        const dist = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
        if (dist < bestDist) { bestDist = dist; best = { zone, rect }; }
      }
      if (!best || bestDist > 140) return null; // released way off in unrelated UI — treat as a cancel

      if (best.zone === 'slide') {
        const cardEls = [...slideStripRef.current.querySelectorAll('[data-card-key]')];
        let index = cardEls.length;
        for (let i = 0; i < cardEls.length; i++) {
          const r = cardEls[i].getBoundingClientRect();
          if (clientX < r.left + r.width / 2) { index = i; break; }
        }
        return { list: 'slide', index };
      }
      return { list: 'avail', zone: best.zone };
    }

    function applyDropTarget(clientX, clientY) {
      const target = computeDropTarget(clientX, clientY);
      dropRef.current = target;
      setDropTarget(target);
    }

    // "In this reel" and the four available strips rarely all fit on screen
    // at once (title, length toggle, and up to two soundtrack pickers sit
    // above them) — without this, dragging a card from one section to
    // another whenever the target is off-screen would be physically
    // impossible, not just fiddly. Scroll speed ramps up the closer the
    // finger gets to the edge.
    function updateAutoScroll(clientY) {
      const el = scrollAreaRef.current;
      if (!el) { autoScrollVelRef.current = 0; return; }
      const rect = el.getBoundingClientRect();
      const EDGE = 56;
      const MAX_SPEED = 14;
      if (clientY < rect.top + EDGE) {
        autoScrollVelRef.current = -Math.ceil(MAX_SPEED * Math.min(1, (rect.top + EDGE - clientY) / EDGE));
      } else if (clientY > rect.bottom - EDGE) {
        autoScrollVelRef.current = Math.ceil(MAX_SPEED * Math.min(1, (clientY - (rect.bottom - EDGE)) / EDGE));
      } else {
        autoScrollVelRef.current = 0;
      }
    }

    function tick() {
      if (dragRef.current?.active && autoScrollVelRef.current !== 0 && scrollAreaRef.current) {
        scrollAreaRef.current.scrollTop += autoScrollVelRef.current;
        // The strips just moved under the still-stationary finger — recompute
        // where that finger now lands so the insertion line keeps up.
        applyDropTarget(lastPointerRef.current.x, lastPointerRef.current.y);
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    function onMove(e) {
      const drag = dragRef.current;
      if (!drag) return;
      if (!drag.active) {
        const dx = Math.abs(e.clientX - drag.startX), dy = Math.abs(e.clientY - drag.startY);
        if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) { clearTimeout(drag.timer); dragRef.current = null; }
        return;
      }
      e.preventDefault();
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      setGhostPos({ x: e.clientX, y: e.clientY });
      updateAutoScroll(e.clientY);
      applyDropTarget(e.clientX, e.clientY);
    }

    function onEnd() {
      const drag = dragRef.current;
      dragRef.current = null;
      autoScrollVelRef.current = 0;
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

    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onEnd);
    document.addEventListener('pointercancel', onEnd);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onEnd);
      document.removeEventListener('pointercancel', onEnd);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
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
        onPointerDown={e => onCardPointerDown(e, item, fromList)}
        onClick={() => { if (item.type === 'text') setPreviewItem(item); }}
        style={{
          width: item.type === 'text' ? 96 : item.type === 'trip' ? 78 : 62, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, position: 'relative', opacity: isDragging ? 0.35 : 1,
          userSelect: 'none', WebkitUserSelect: 'none',
          // Without these, a long press on a photo's background-image card is
          // iOS Safari's own cue to show its native "peek and lift" preview —
          // a dashed selection outline with its own drag/copy gesture that
          // hijacks the touch sequence out from under our JS drag, and never
          // resolves as a drop into anything of ours.
          WebkitTouchCallout: 'none', WebkitUserDrag: 'none',
        }}
      >
        {fromList === 'slide' && (
          <button
            onPointerDown={e => e.stopPropagation()}
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

  function availStrip(zone, label, items, containerRef) {
    const hovered = draggingKey && dropTarget?.list === 'avail' && dropTarget.zone === zone;
    return (
      <div style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 6px' }}>{label}</p>
        <div
          ref={containerRef}
          style={{
            display: 'flex', gap: 9, overflowX: draggingKey ? 'hidden' : 'auto', padding: '10px 3px', margin: '-7px -3px 0',
            minHeight: items.length === 0 ? 40 : undefined, borderRadius: 14,
            outline: hovered ? '1.5px dashed #C8993E' : 'none', outlineOffset: -2,
          }}
        >
          {items.length === 0
            ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>None from this range</span>
            : items.map(item => renderCard(item, 'avail'))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--bg)', zIndex: 100, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, padding: '2px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
        <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ width: 24, height: 1, background: 'rgba(200,153,62,0.4)', margin: '0 auto 4px' }} />
          <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>{isNew ? 'New reel' : 'Edit reel'}</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ border: 'none', borderRadius: 999, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, background: 'linear-gradient(180deg, #D4A84B 0%, #B8872E 100%)', color: '#fff', boxShadow: '0 2px 6px rgba(140,100,20,0.32), inset 0 1px 0 rgba(255,255,255,0.18)', flexShrink: 0, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="scroll-area" ref={scrollAreaRef}>
        <div style={{ padding: '4px 16px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 13, padding: '8px 10px', marginBottom: 10 }}>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: 'var(--text)', fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontStyle: 'italic', fontSize: 17, padding: 2, outline: 'none' }}
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
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{mediaInReel}/{mediaBudget} photos+videos</span>
                {letterCap > 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{lettersInReel}/{letterCap} letters</span>}
                {tripCap > 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{tripsInReel}/{tripCap} trip{tripCap !== 1 ? 's' : ''}</span>}
              </div>
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
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>Not in this reel yet</p>
            {availStrip('photo', 'Photos', availablePhotos, availPhotosStripRef)}
            {availStrip('video', 'Videos', availableVideos, availVideosStripRef)}
            {availStrip('letter', 'Letters', availableLetters, availLettersStripRef)}
            {candidates.trips.length > 0 && availStrip('trip', 'Trips', availableTrips, availTripsStripRef)}
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

      {previewItem && (
        <div
          style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.45)', display: 'flex', alignItems: 'flex-end', zIndex: 300 }}
          onClick={() => setPreviewItem(null)}
        >
          <div
            style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ flexShrink: 0, padding: '14px 18px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ width: 28 }} />
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>
                {previewItem.subtype === 'letter' ? 'Letter' : 'Note'}{previewItem.kidName ? ` · ${previewItem.kidName}` : ''}
              </p>
              <button
                onClick={() => setPreviewItem(null)}
                style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'var(--bg-elevated)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <i className="ti ti-x" style={{ fontSize: 13 }} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px 28px' }}>
              <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 15.5, lineHeight: 1.6, color: 'var(--text)', margin: 0, whiteSpace: 'pre-wrap' }}>
                {entries.find(e => e.id === previewItem.entryId)?.text || previewItem.text}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
