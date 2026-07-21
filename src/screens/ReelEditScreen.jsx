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

// Cards in "In this reel" are the ones that actually matter right now, so
// they get a noticeably bigger thumbnail than the merely-available pool
// below — a size difference reads as "active" without needing a label.
function cardSize(item, large) {
  const h = large ? 102 : 62;
  if (item.type === 'trip') return { w: large ? 126 : 78, h };
  if (item.type === 'text') return { w: large ? 154 : 96, h };
  return { w: h, h };
}

// The thumbnail portion of a card — shared between the real strip cards and
// the floating ghost that follows the finger while dragging, so the two
// never drift out of sync with each other.
function CardThumb({ item, large }) {
  const { w, h } = cardSize(item, large);
  if (item.type === 'trip') {
    return (
      <div style={{ width: w, height: h, borderRadius: 11, background: 'linear-gradient(135deg, rgba(200,153,62,0.35), rgba(74,94,80,0.5))', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, flexShrink: 0, padding: '0 6px', boxSizing: 'border-box' }}>
        <span style={{ fontSize: large ? 27 : 17 }}>✈️</span>
        <span style={{ fontSize: large ? 11.5 : 8, fontWeight: 700, color: '#3a4a3f', textAlign: 'center', lineHeight: 1.15, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{item.destinationLabel}</span>
      </div>
    );
  }
  if (item.type === 'text') {
    return (
      <div style={{ width: w, height: h, borderRadius: 11, background: 'rgba(200,153,62,0.09)', border: '1px solid rgba(200,153,62,0.3)', padding: '6px 7px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', overflow: 'hidden', flexShrink: 0, boxSizing: 'border-box' }}>
        <span style={{ fontSize: large ? 15 : 11, color: '#C8993E', marginBottom: 3 }}>✉</span>
        <span style={{ fontSize: large ? 11.5 : 9, fontStyle: 'italic', fontFamily: "'Source Serif 4', serif", color: 'var(--text)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: large ? 6 : 4, WebkitBoxOrient: 'vertical' }}>{item.text}</span>
      </div>
    );
  }
  const src = item.mediaType === 'video' ? videoThumbUrl(item.url, 'so_0,w_200,q_auto,f_auto') : cloudinaryTransform(item.url, 'w_200,q_auto,f_auto');
  return (
    <div style={{ width: w, height: h, borderRadius: 11, backgroundImage: `url('${src}')`, backgroundSize: 'cover', backgroundPosition: 'center', border: '1px solid var(--border)', position: 'relative', flexShrink: 0, WebkitTouchCallout: 'none', WebkitUserDrag: 'none' }}>
      {item.mediaType === 'video' && (
        <div style={{ position: 'absolute', bottom: 3, right: 3, width: large ? 23 : 15, height: large ? 23 : 15, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="ti ti-player-play-filled" style={{ fontSize: large ? 11 : 7, color: '#fff' }} />
        </div>
      )}
    </div>
  );
}

const LONG_PRESS_MS = 300;

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

  // Swapping which song plays first vs second — only ever two possible
  // states, so a single toggle button is simpler and just as capable as a
  // drag gesture would be for something with exactly two positions.
  function handleSwapSongs() {
    setSong(song2); setSong2(song);
    setSongQuery(song2Query); setSong2Query(songQuery);
    setSongResults(song2Results); setSong2Results(songResults);
    setSongSearching(song2Searching); setSong2Searching(songSearching);
  }

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

  // Tapping an available card adds it — placed automatically rather than
  // always at the end, so a manual add lands in roughly the same spot the
  // auto-builder would have put it: a letter pairs with its own entry's
  // photo/video when that's already in the reel (same rule autoSampleSlides
  // uses), and everything else slots in by date among the non-text slides.
  function addToSlides(item) {
    setSlideList(prev => {
      const updated = prev.slice();
      if (item.type === 'text') {
        const pairIdx = updated.findIndex(s => s.type !== 'trip' && s.type !== 'text' && s.entryId === item.entryId);
        if (pairIdx !== -1) { updated.splice(pairIdx, 0, item); return updated; }
      }
      let idx = updated.length;
      for (let i = 0; i < updated.length; i++) {
        const s = updated[i];
        if (s.type !== 'text' && s.date && item.date && s.date > item.date) { idx = i; break; }
      }
      updated.splice(idx, 0, item);
      return updated;
    });
  }

  // Switching to 1 minute doubles the photo budget (7 → 14) — without this,
  // the reel would still only have however many photos the 30s auto-build
  // happened to pick, leaving the user to manually drag in enough extras to
  // actually fill the longer length. Only tops up on the way to 60s; going
  // back to 30s never removes anything already added.
  function handleSetDurationSec(newDurationSec) {
    setDurationSec(newDurationSec);
    if (newDurationSec !== 60) return;
    setSlideList(prev => {
      const videoCount = candidates.photoCandidates.filter(c => c.mediaType === 'video').length;
      const imageCandidates = candidates.photoCandidates.filter(c => c.mediaType !== 'video');
      const imageBudget = Math.max(0, 14 - videoCount);
      const currentImageCount = prev.filter(s => s.type === 'photo' && s.mediaType !== 'video').length;
      const need = Math.min(imageBudget, imageCandidates.length) - currentImageCount;
      if (need <= 0) return prev;
      const usedKeys = new Set(prev.map(keyForSlide));
      const pool = imageCandidates.filter(c => !usedKeys.has(keyForSlide(c)));
      const additions = pool.slice().sort(() => Math.random() - 0.5).slice(0, need);
      const updated = prev.slice();
      additions.forEach(photo => {
        let idx = updated.length;
        for (let i = 0; i < updated.length; i++) {
          const s = updated[i];
          if (s.type !== 'text' && s.date && s.date > photo.date) { idx = i; break; }
        }
        updated.splice(idx, 0, photo);
      });
      return updated;
    });
  }

  // --- Touch drag-and-drop for reordering within "In this reel" (hand-
  // rolled — HTML5 drag/drop doesn't work on touchscreens). Moving a card
  // between "In this reel" and the available pool is a plain tap now
  // (addToSlides / removeFromSlides above) — dragging is only for changing
  // play order within the reel itself, so this only ever has one strip to
  // worry about. Built on Pointer Events rather than Touch Events so the
  // exact same code drives a mouse on desktop too. A long press (not an
  // immediate pointer-down) starts a drag, so a quick swipe still scrolls
  // the strip normally instead of every touch fighting the browser's own
  // horizontal scroll. Listens on `document` (not the card itself) only
  // once a drag is actually confirmed, and only then calls preventDefault —
  // so an ordinary scroll (or, on desktop, a text selection) is never
  // intercepted.
  const slideStripRef = useRef(null);
  const dragRef = useRef(null); // { key, item, startX, startY, active, timer }
  const dropRef = useRef(null); // { index } — read at drop time, kept in a ref to avoid stale closures
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const hAutoScrollVelRef = useRef(0); // px/frame; negative = scrolling left, positive = right, 0 = none
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

  function onCardPointerDown(e, item) {
    if (e.button != null && e.button !== 0) return; // ignore right/middle mouse
    const drag = { key: keyForSlide(item), item, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, active: false };
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
      // The finger's likely moved some since touch-down (no longer cancelled
      // on movement) — start the ghost from wherever it actually is now, not
      // the original touch point, so it doesn't visibly jump on activation.
      setGhostPos({ x: drag.lastX ?? drag.startX, y: drag.lastY ?? drag.startY });
      try { navigator.vibrate?.(10); } catch {}
    }, LONG_PRESS_MS);
    dragRef.current = drag;
  }

  useEffect(() => {
    function computeDropTarget(clientX, clientY) {
      const rect = slideStripRef.current?.getBoundingClientRect();
      if (!rect || clientY < rect.top - 40 || clientY > rect.bottom + 40) return null;
      const cardEls = [...slideStripRef.current.querySelectorAll('[data-card-key]')];
      let index = cardEls.length;
      for (let i = 0; i < cardEls.length; i++) {
        const r = cardEls[i].getBoundingClientRect();
        if (clientX < r.left + r.width / 2) { index = i; break; }
      }
      return { index };
    }

    function applyDropTarget(clientX, clientY) {
      const target = computeDropTarget(clientX, clientY);
      dropRef.current = target;
      setDropTarget(target);
      return target;
    }

    // Reordering into a spot further along than what's currently visible
    // shouldn't require a separate gesture just to scroll there first.
    function updateHorizontalAutoScroll(clientX) {
      const el = slideStripRef.current;
      if (!el) { hAutoScrollVelRef.current = 0; return; }
      const rect = el.getBoundingClientRect();
      const EDGE = 40;
      const MAX_SPEED = 12;
      if (clientX < rect.left + EDGE) {
        hAutoScrollVelRef.current = -Math.ceil(MAX_SPEED * Math.min(1, (rect.left + EDGE - clientX) / EDGE));
      } else if (clientX > rect.right - EDGE) {
        hAutoScrollVelRef.current = Math.ceil(MAX_SPEED * Math.min(1, (clientX - (rect.right - EDGE)) / EDGE));
      } else {
        hAutoScrollVelRef.current = 0;
      }
    }

    function tick() {
      if (dragRef.current?.active && hAutoScrollVelRef.current !== 0 && slideStripRef.current) {
        slideStripRef.current.scrollLeft += hAutoScrollVelRef.current;
        // The strip just moved under the still-stationary finger — recompute
        // where it now lands so the insertion line keeps up.
        applyDropTarget(lastPointerRef.current.x, lastPointerRef.current.y);
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    function onMove(e) {
      const drag = dragRef.current;
      if (!drag) return;
      // Deliberately no distance-based cancel here — a real hold-then-drag
      // gesture isn't perfectly stationary, and any fixed pixel tolerance
      // (8px, then 18px) kept getting exceeded by ordinary finger movement
      // before the long-press timer had a chance to fire, killing the drag
      // before it ever started. Time alone gates activation: hold past
      // LONG_PRESS_MS and the drag activates from wherever the finger
      // currently is. Cards have touch-action: none (native panning on
      // either axis is exactly what let Safari commit this touch to the
      // page's own vertical scroll before our timer got a chance to call
      // preventDefault()), so nothing scrolls the strip on its own anymore —
      // this manually mirrors that horizontal scroll in JS instead, for as
      // long as the press hasn't turned into a drag yet.
      if (!drag.active) {
        if (slideStripRef.current) slideStripRef.current.scrollLeft -= (e.clientX - drag.lastX);
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        return;
      }
      e.preventDefault();
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      setGhostPos({ x: e.clientX, y: e.clientY });
      applyDropTarget(e.clientX, e.clientY);
      updateHorizontalAutoScroll(e.clientX);
    }

    function onEnd() {
      const drag = dragRef.current;
      dragRef.current = null;
      hAutoScrollVelRef.current = 0;
      if (drag && !drag.active) clearTimeout(drag.timer);
      const target = dropRef.current;
      dropRef.current = null;
      setDraggingKey(null);
      setGhostItem(null);
      setGhostPos(null);
      setDropTarget(null);
      if (!drag?.active || !target) return;

      setSlideList(prev => {
        const fromIdx = prev.findIndex(s => keyForSlide(s) === drag.key);
        if (fromIdx === -1) return prev;
        const copy = prev.slice();
        const [moved] = copy.splice(fromIdx, 1);
        const idx = fromIdx < target.index ? target.index - 1 : target.index;
        copy.splice(idx, 0, moved);
        return copy;
      });
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

  // A card already in the reel — press and hold to reorder within this
  // strip; the × removes it back to the available pool below.
  function renderSlideCard(item) {
    const key = keyForSlide(item);
    const isDragging = draggingKey === key;
    return (
      <div
        key={key}
        data-card-key={key}
        onPointerDown={e => onCardPointerDown(e, item)}
        onClick={() => { if (item.type === 'text') setPreviewItem(item); }}
        style={{
          width: cardSize(item, true).w, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, position: 'relative', opacity: isDragging ? 0.35 : 1,
          userSelect: 'none', WebkitUserSelect: 'none',
          // Without these, a long press on a photo's background-image card is
          // iOS Safari's own cue to show its native "peek and lift" preview —
          // a dashed selection outline with its own drag/copy gesture that
          // hijacks the touch sequence out from under our JS drag, and never
          // resolves as a drop into anything of ours.
          WebkitTouchCallout: 'none', WebkitUserDrag: 'none',
          // No native panning on either axis — that's exactly what let
          // Safari commit this touch to the page's own scroll before our
          // long-press timer got a chance to call preventDefault(). onMove
          // manually mirrors the strip's horizontal scroll in JS during the
          // pre-activation window instead.
          touchAction: 'none',
        }}
      >
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); removeFromSlides(key); }}
          style={{ position: 'absolute', top: -6, right: -6, width: 19, height: 19, borderRadius: '50%', background: '#D4856A', color: '#fff', border: '2px solid var(--bg)', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3, cursor: 'pointer' }}
        >×</button>
        <CardThumb item={item} large />
        <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-muted)' }}>{cardLabel(item)}</span>
      </div>
    );
  }

  // A card in the available pool — tap anywhere adds it straight into "In
  // this reel" (auto-placed near its own entry's partner, or by date). No
  // preview step here even for letters — the full-text sheet is reserved
  // for a letter already in the reel, where "let me re-read this" actually
  // applies; adding one from the pool is trivially reversible via the ×.
  function renderAvailCard(item) {
    const key = keyForSlide(item);
    return (
      <div
        key={key}
        onClick={() => addToSlides(item)}
        style={{ width: cardSize(item, false).w, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer' }}
      >
        <CardThumb item={item} />
        <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-muted)' }}>{cardLabel(item)}</span>
      </div>
    );
  }

  function slideStripWithIndicator(items) {
    const cards = items.map(renderSlideCard);
    if (!dropTarget) return cards;
    const idx = Math.max(0, Math.min(items.length, dropTarget.index));
    const out = cards.slice(0, idx);
    out.push(<div key="__drop_indicator__" style={{ width: 2, borderRadius: 1, background: '#C8993E', flexShrink: 0, alignSelf: 'stretch', margin: '3px -1px' }} />);
    out.push(...cards.slice(idx));
    return out;
  }

  function availStrip(label, items) {
    return (
      <div style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 6px' }}>{label}</p>
        <div style={{ display: 'flex', gap: 9, overflowX: 'auto', padding: '10px 3px', margin: '-7px -3px 0' }}>
          {items.map(renderAvailCard)}
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

      <div className="scroll-area">
        <div style={{ padding: '4px 16px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 13, padding: '8px 10px', marginBottom: 10 }}>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{ flex: 1, minWidth: 0, textAlign: 'center', border: 'none', background: 'transparent', color: 'var(--text)', fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontStyle: 'italic', fontSize: 17, padding: 2, outline: 'none' }}
            />
          </div>

          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 13, padding: '10px 10px 12px', marginBottom: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px' }}>Length</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[{ value: 30, label: '30 seconds' }, { value: 60, label: '1 minute' }].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleSetDurationSec(opt.value)}
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
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Soundtrack (optional)</p>
              {durationSec === 60 && (
                <button
                  onClick={handleSwapSongs}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: 'var(--accent)', fontSize: 11, fontWeight: 600, fontFamily: "'Urbanist', sans-serif", cursor: 'pointer', padding: 0 }}
                >
                  <i className="ti ti-arrows-up-down" style={{ fontSize: 13 }} />
                  Swap order
                </button>
              )}
            </div>
            {durationSec === 60 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
              </div>
            ) : (
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
                minHeight: 136, borderRadius: 14,
                border: slideList.length === 0 ? '1.5px dashed var(--border)' : 'none',
                alignItems: slideList.length === 0 ? 'center' : undefined,
                justifyContent: slideList.length === 0 ? 'center' : undefined,
              }}
            >
              {slideList.length === 0
                ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tap something below to add it</span>
                : slideStripWithIndicator(slideList)}
            </div>
          </div>

          <div>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>Not in this reel yet</p>
            {/* Hidden entirely while empty, for a cleaner page — tap a card to add it. */}
            {availablePhotos.length > 0 && availStrip('Photos', availablePhotos)}
            {availableVideos.length > 0 && availStrip('Videos', availableVideos)}
            {availableLetters.length > 0 && availStrip('Letters', availableLetters)}
            {availableTrips.length > 0 && availStrip('Trips', availableTrips)}
          </div>
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
