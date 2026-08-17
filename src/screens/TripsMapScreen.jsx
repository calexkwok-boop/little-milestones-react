import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../icons';
import KidThumb from '../KidThumb.jsx';
import mapImage from '../assets/travel-map.png';
import { findHomePoint, clusterIntoTrips, latLngToMapPercent } from '../tripClustering.js';
import { cloudinaryTransform, videoThumbUrl, PHOTO_SQUARE, PHOTO_XS } from '../constants.js';

const PIN_OVERRIDES_KEY = 'patina-trip-pin-overrides';

function loadPinOverrides() {
  try { return JSON.parse(localStorage.getItem(PIN_OVERRIDES_KEY) || '{}'); } catch { return {}; }
}

// Groups every entry with a tagged location into trips (see tripClustering.js
// for "what counts as the same trip"), picking one representative entry per
// trip -- whichever location string recurs most in that cluster -- to supply
// the trip's label and a *guess* at where its pin belongs. That guess is a
// starting point, not a placement -- the illustrated map isn't drawn to a
// real projection, so it's frequently off by a meaningful amount. A trip
// only counts as actually pinned once someone drags it into place
// (persisted per trip id in localStorage, see PIN_OVERRIDES_KEY below).
function useTrips(entries, kids) {
  return useMemo(() => {
    const homePt = findHomePoint(entries);
    const clusters = clusterIntoTrips(entries, homePt);
    const trips = clusters.map(clusterEntries => {
      const sorted = clusterEntries.slice().sort((a, b) => a.date.localeCompare(b.date));
      const labelCounts = new Map();
      clusterEntries.forEach(e => { if (e.location) labelCounts.set(e.location, (labelCounts.get(e.location) || 0) + 1); });
      let bestLabel = null, bestCount = 0;
      labelCounts.forEach((count, label) => { if (count > bestCount) { bestCount = count; bestLabel = label; } });
      const representative = clusterEntries.find(e => e.location === bestLabel) || sorted[0];
      const label = bestLabel || representative.location || 'Somewhere new';
      const guess = latLngToMapPercent(representative.locationLat, representative.locationLng);
      const photos = clusterEntries.flatMap(e => (e.media || []).map(m => ({ ...m, entry: e })));
      const tripKidIds = new Set(clusterEntries.flatMap(e => e.kids || []));
      const tripKids = kids.filter(k => tripKidIds.has(k.id));
      const id = `${sorted[0].date}-${Math.round(representative.locationLat * 100)}-${Math.round(representative.locationLng * 100)}`;
      return {
        id, label, guess, photos,
        entries: sorted,
        earliestDate: sorted[0].date,
        latestDate: sorted[sorted.length - 1].date,
        kids: tripKids,
        locationCoords: { lat: representative.locationLat, lng: representative.locationLng },
      };
    });
    return { homePt, trips };
  }, [entries, kids]);
}

function dateRangeLabel(earliestDate, latestDate) {
  const fmt = (d, withYear) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: withYear ? 'numeric' : undefined });
  if (earliestDate === latestDate) return fmt(earliestDate, true);
  const sameYear = earliestDate.slice(0, 4) === latestDate.slice(0, 4);
  return `${fmt(earliestDate, !sameYear)} – ${fmt(latestDate, true)}`;
}

const DRAG_THRESHOLD_PX = 6;

// Press-and-drag pin placement, shared between the small map card and the
// enlarged full-screen view -- the only difference between them is whether
// the frame is visually rotated 90°. getBoundingClientRect() already
// reflects that CSS rotation, so a plain (unrotated) fraction-of-rect read
// would place every pin 90° away from where it was actually pressed;
// `rotated` inverts the axes to correct for it (same fix Patina Calendar's
// own full-screen map uses).
function usePinDrag(frameRef, setOverrides, onTap, rotated) {
  const [dragPreview, setDragPreview] = useState(null); // { id, x, y }
  const [draggingId, setDraggingId] = useState(null);
  const dragStartRef = useRef(null);

  function toLocalPercent(clientX, clientY) {
    const rect = frameRef.current.getBoundingClientRect();
    const xFrac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const yFrac = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    return rotated ? { x: (1 - yFrac) * 100, y: xFrac * 100 } : { x: xFrac * 100, y: yFrac * 100 };
  }

  useEffect(() => {
    if (!draggingId) return;
    function onMove(e) {
      const d = dragStartRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
      if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) d.moved = true;
      if (d.moved) setDragPreview({ id: draggingId, ...toLocalPercent(e.clientX, e.clientY) });
    }
    function onUp(e) {
      const moved = dragStartRef.current?.moved;
      dragStartRef.current = null;
      if (moved) {
        const pos = toLocalPercent(e.clientX, e.clientY);
        setOverrides(prev => {
          const next = { ...prev, [draggingId]: pos };
          localStorage.setItem(PIN_OVERRIDES_KEY, JSON.stringify(next));
          return next;
        });
        setDragPreview(null);
      } else {
        onTap(draggingId);
      }
      setDraggingId(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId]);

  function startDrag(tripId, e) {
    dragStartRef.current = { startX: e.clientX, startY: e.clientY, moved: false };
    setDraggingId(tripId);
  }

  function positionFor(trip) {
    return dragPreview?.id === trip.id ? dragPreview : null;
  }

  return { positionFor, startDrag };
}

function TripPin({ trip, pos, confirmed, active, onPointerDown }) {
  return (
    <button
      className={`trip-pin${active ? ' active' : ''}`}
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, opacity: confirmed ? 1 : 0.5 }}
      onPointerDown={onPointerDown}
      aria-label={trip.label}
    >
      <span className="trip-pin-visual">
        {active && <span className="trip-pin-ring" />}
        <svg width={active ? 20 : 17} height={active ? 25 : 21} viewBox="0 0 16 20">
          <path fill="#C8993E" d="M8 0C3.6 0 0 3.6 0 8c0 5.5 8 12 8 12s8-6.5 8-12c0-4.4-3.6-8-8-8z" />
          <circle cx="8" cy="8" r="3" fill="#fff" />
        </svg>
      </span>
    </button>
  );
}

function TripMapCard({ trips, overrides, frameRef, dropTarget, onExpand, onTapPin }) {
  // A plain div, not a button -- it contains its own pin buttons, and
  // buttons can't nest inside buttons (the browser would silently break out
  // of the outer one). onClick on the card still gives the "tap the
  // background to expand" behavior; individual pins stop propagation.
  // frameRef is on the *inner* .trip-map-frame, not the card -- pin percent
  // positions and the list-drag drop-detection both measure against the
  // actual aspect-ratio-locked art, not the (possibly taller/letterboxed)
  // card around it.
  return (
    <div className={`trip-map-card${dropTarget ? ' drop-target' : ''}`} role="button" tabIndex={0} onClick={onExpand}>
      <div className="trip-map-frame" ref={frameRef}>
        <img className="trip-map-img" src={mapImage} alt="" />
        {trips.map(trip => {
          const pos = overrides[trip.id] || trip.guess;
          return (
            <TripPin
              key={trip.id}
              trip={trip}
              pos={pos}
              confirmed={!!overrides[trip.id]}
              active={false}
              onPointerDown={e => { e.stopPropagation(); onTapPin(trip.id); }}
            />
          );
        })}
      </div>
      <div className="trip-map-vignette" />
      <div className="trip-map-caption-bar">
        <span>{Object.keys(overrides).filter(id => trips.some(t => t.id === id)).length}/{trips.length} pinned</span>
        <span style={{ marginLeft: 'auto' }}>{dropTarget ? 'Drop to place' : 'Tap to enlarge →'}</span>
      </div>
    </div>
  );
}

function TripMapFullView({ trips, overrides, setOverrides, onClose, onOpenTrip }) {
  const frameRef = useRef(null);
  // Tapping a pin here shows its name in place (Calendar's own popup
  // treatment) rather than immediately leaving the enlarged view -- the
  // point of enlarging is to see exactly which pin is which before
  // dragging it, so jumping straight to the full trip sheet defeated that.
  const [popupId, setPopupId] = useState(null);
  const { positionFor, startDrag } = usePinDrag(frameRef, setOverrides, setPopupId, true);
  const popupTrip = trips.find(t => t.id === popupId) || null;
  const popupPos = popupTrip ? (positionFor(popupTrip) || overrides[popupTrip.id] || popupTrip.guess) : null;

  return (
    <div className="trip-map-full rotated">
      <button type="button" className="trip-map-full-close" aria-label="Close map" onClick={onClose}>
        <Icon name="ti-x" />
      </button>
      <div className="trip-map-full-stage">
        <div className="trip-map-frame" ref={frameRef} style={{ cursor: 'grab' }} onClick={() => setPopupId(null)}>
          <img className="trip-map-img" src={mapImage} alt="" />
          {trips.map(trip => {
            const pos = positionFor(trip) || overrides[trip.id] || trip.guess;
            return (
              <TripPin
                key={trip.id}
                trip={trip}
                pos={pos}
                confirmed={!!overrides[trip.id]}
                active={trip.id === popupId}
                onPointerDown={e => { e.stopPropagation(); startDrag(trip.id, e); }}
              />
            );
          })}
          {popupTrip && (
            <div className="trip-map-popup" style={{ left: `${popupPos.x}%` }} onClick={e => e.stopPropagation()}>
              <div className="trip-map-popup-name">{popupTrip.label}</div>
              <div className="trip-map-popup-dates">{dateRangeLabel(popupTrip.earliestDate, popupTrip.latestDate)}</div>
              <button type="button" className="trip-map-popup-link" onClick={() => onOpenTrip(popupTrip.id)}>
                View details <Icon name="ti-arrow-right" style={{ fontSize: 10 }} />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="trip-map-rotate-hint">
        <svg className="trip-map-rotate-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="2" width="10" height="20" rx="2.2" />
          <path d="M11 19h2" />
        </svg>
        <span>Press and drag a pin to place it · turn your phone sideways to line it up</span>
      </div>
    </div>
  );
}

// Press-and-drag a list item up onto the map to place its pin -- more
// direct than the sheet's "Place on map" detour, especially for an
// unconfirmed trip where that's the obvious next thing to do. Dropped
// outside the map frame, nothing happens (list item stays put); a tap under
// DRAG_THRESHOLD_PX still opens the trip sheet as before. Auto-scrolls the
// page while dragging near the top of the viewport, since the map card sits
// above these lists and may already be scrolled out of view by the time
// there are several trips in "haven't pinned yet."
function useListDrag(mapFrameRef, scrollAreaRef, setOverrides, onTap) {
  const [ghost, setGhost] = useState(null); // { tripId, x, y } in viewport coords
  const [overMap, setOverMap] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const dragStartRef = useRef(null);

  function isOverFrame(clientX, clientY) {
    const rect = mapFrameRef.current?.getBoundingClientRect();
    return !!rect && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  useEffect(() => {
    if (!draggingId) return;
    function onMove(e) {
      const d = dragStartRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
      if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) d.moved = true;
      if (!d.moved) return;
      setGhost({ tripId: draggingId, x: e.clientX, y: e.clientY });
      setOverMap(isOverFrame(e.clientX, e.clientY));
      const scroller = scrollAreaRef.current;
      if (scroller && e.clientY < 110) scroller.scrollTop -= (110 - e.clientY) * 0.4;
    }
    function onUp(e) {
      const moved = dragStartRef.current?.moved;
      dragStartRef.current = null;
      if (moved) {
        if (isOverFrame(e.clientX, e.clientY)) {
          const rect = mapFrameRef.current.getBoundingClientRect();
          const pos = {
            x: Math.min(100, Math.max(0, (e.clientX - rect.left) / rect.width * 100)),
            y: Math.min(100, Math.max(0, (e.clientY - rect.top) / rect.height * 100)),
          };
          setOverrides(prev => {
            const next = { ...prev, [draggingId]: pos };
            localStorage.setItem(PIN_OVERRIDES_KEY, JSON.stringify(next));
            return next;
          });
        }
      } else {
        onTap(draggingId);
      }
      setGhost(null);
      setOverMap(false);
      setDraggingId(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId]);

  function startDrag(tripId, e) {
    dragStartRef.current = { startX: e.clientX, startY: e.clientY, moved: false };
    setDraggingId(tripId);
  }

  return { ghost, overMap, startDrag };
}

// Drag-to-place only applies while a trip is still unconfirmed -- once it's
// in "Places you've been," dragging it around from the small list would let
// someone nudge an already-placed pin without the precision the enlarged
// view exists for. A confirmed item is a plain tap (open the sheet); moving
// an already-set pin is only possible via "Move pin" in that sheet, which
// opens the enlarged view.
function TripListItem({ trip, confirmed, onOpen, onPointerDown }) {
  const cover = trip.photos[0];
  return (
    <div
      className="trip-list-item"
      onClick={confirmed ? onOpen : undefined}
      onPointerDown={confirmed ? undefined : onPointerDown}
      style={confirmed ? undefined : { touchAction: 'none' }}
    >
      <div className="trip-list-thumb">
        {cover
          ? <img src={cover.type === 'video' ? videoThumbUrl(cover.url, `so_0,${PHOTO_XS}`) : cloudinaryTransform(cover.url, PHOTO_XS)} alt="" loading="lazy" />
          : <Icon name="ti-map-pin" style={{ fontSize: 16, color: confirmed ? '#C8993E' : 'var(--text-muted)' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trip.label}</p>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 0' }}>{dateRangeLabel(trip.earliestDate, trip.latestDate)}</p>
      </div>
      {trip.kids.length > 0 && (
        <div style={{ display: 'flex', flexShrink: 0 }}>
          {trip.kids.slice(0, 3).map((k, i) => (
            <div key={k.id} style={{ marginLeft: i > 0 ? -8 : 0, border: '2px solid var(--bg-card)', borderRadius: '50%' }}>
              <KidThumb kid={k} size={22} />
            </div>
          ))}
        </div>
      )}
      {!confirmed && <Icon name="ti-arrows-up-down" style={{ fontSize: 14, color: 'var(--text-muted)', flexShrink: 0 }} />}
    </div>
  );
}

function TripSheet({ trip, confirmed, onClose, onOpenEntry, onWriteLetter, onPlaceOnMap }) {
  return (
    <div className="sheet-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.4)', zIndex: 40, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: '22px 22px 0 0', width: '100%', maxHeight: '78%', overflowY: 'auto', padding: '10px 20px 28px' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
          <div>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>{trip.label}</h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '3px 0 0' }}>{dateRangeLabel(trip.earliestDate, trip.latestDate)}</p>
          </div>
          {trip.kids.length > 0 && (
            <div style={{ display: 'flex', flexShrink: 0 }}>
              {trip.kids.map((k, i) => (
                <div key={k.id} style={{ marginLeft: i > 0 ? -10 : 0, border: '2px solid var(--bg-card)', borderRadius: '50%' }}>
                  <KidThumb kid={k} size={30} />
                </div>
              ))}
            </div>
          )}
        </div>

        {!confirmed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elevated)', border: '1px dashed var(--border)', borderRadius: 10, padding: '9px 12px', marginTop: 14 }}>
            <Icon name="ti-map-pin" style={{ fontSize: 14, color: '#C8993E', flexShrink: 0 }} />
            <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, lineHeight: 1.4 }}>Not on the map yet — place it so it shows up next to your other trips.</p>
          </div>
        )}

        {trip.photos.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 16 }}>
            {trip.photos.map((m, i) => (
              <div
                key={`${m.url}-${i}`}
                onClick={() => onOpenEntry(m.entry)}
                style={{ aspectRatio: '1', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', position: 'relative', background: 'var(--bg-input)' }}
              >
                <img
                  src={m.type === 'video' ? videoThumbUrl(m.url, `so_0,${PHOTO_SQUARE}`) : cloudinaryTransform(m.url, PHOTO_SQUARE)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  alt=""
                  loading="lazy"
                />
                {m.type === 'video' && (
                  <Icon name="ti-player-play-filled" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: '#fff', fontSize: 16, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))' }} />
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button className="btn btn-outline" style={{ flex: confirmed ? '0 0 auto' : 1 }} onClick={onPlaceOnMap}>
            <Icon name="ti-map-pin" style={{ fontSize: 15 }} />
            {confirmed ? 'Move pin' : 'Place on map'}
          </button>
          <button className="btn btn-gold" style={{ flex: 1 }} onClick={() => onWriteLetter(trip)}>
            <Icon name="ti-pencil" style={{ fontSize: 16 }} />
            Write a letter
          </button>
        </div>
      </div>
    </div>
  );
}

function TripsMapScreen({ entries, kids, onBack, onOpenEntry, onWriteLetter }) {
  const { homePt, trips } = useTrips(entries, kids);
  const [activeId, setActiveId] = useState(null);
  const [overrides, setOverrides] = useState(loadPinOverrides);
  const [expanded, setExpanded] = useState(false);
  const mapFrameRef = useRef(null);
  const scrollAreaRef = useRef(null);

  const activeTrip = trips.find(t => t.id === activeId) || null;
  const confirmedTrips = trips.filter(t => overrides[t.id]);
  const unconfirmedTrips = trips.filter(t => !overrides[t.id]);

  function openTrip(id) { setActiveId(id); }
  const { ghost, overMap, startDrag: startListDrag } = useListDrag(mapFrameRef, scrollAreaRef, setOverrides, openTrip);
  const ghostTrip = ghost ? trips.find(t => t.id === ghost.tripId) : null;

  return (
    <div className="screen">
      <div className="scroll-area" ref={scrollAreaRef}>
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <button className="icon-btn" onClick={onBack}><Icon name="ti-arrow-left" /></button>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ width: 28, height: 1, background: 'rgba(200,153,62,0.4)', margin: '0 auto 5px' }} />
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>Trips</h2>
            </div>
            <div style={{ width: 36 }} />
          </div>

          {!homePt || trips.length === 0 ? (
            <div className="empty-state">
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Icon name="ti-map-pin" style={{ fontSize: 24, color: '#C8993E' }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', margin: '0 0 6px' }}>No trips mapped yet</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                Tag a location when you write a letter about somewhere you've been, and it'll show up here.
              </p>
            </div>
          ) : (
            <>
              <TripMapCard
                trips={trips}
                overrides={overrides}
                frameRef={mapFrameRef}
                dropTarget={overMap}
                onExpand={() => setExpanded(true)}
                onTapPin={openTrip}
              />

              {confirmedTrips.length > 0 && (
                <>
                  <p className="trip-list-heading">Places you've been</p>
                  <div className="trip-list">
                    {confirmedTrips.map(trip => (
                      <TripListItem key={trip.id} trip={trip} confirmed onOpen={() => openTrip(trip.id)} />
                    ))}
                  </div>
                </>
              )}

              {unconfirmedTrips.length > 0 && (
                <>
                  <p className="trip-list-heading">Places you haven't pinned yet</p>
                  <p className="trip-list-hint">Drag and drop onto the map to place a pin.</p>
                  <div className="trip-list">
                    {unconfirmedTrips.map(trip => (
                      <TripListItem key={trip.id} trip={trip} confirmed={false} onPointerDown={e => startListDrag(trip.id, e)} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {ghost && ghostTrip && (
        <div className="trip-ghost-pin" style={{ left: ghost.x, top: ghost.y }}>
          <svg width="24" height="30" viewBox="0 0 16 20">
            <path fill="#C8993E" d="M8 0C3.6 0 0 3.6 0 8c0 5.5 8 12 8 12s8-6.5 8-12c0-4.4-3.6-8-8-8z" stroke="#fff" strokeWidth="0.5" />
            <circle cx="8" cy="8" r="3" fill="#fff" />
          </svg>
        </div>
      )}

      {activeTrip && !expanded && (
        <TripSheet
          trip={activeTrip}
          confirmed={!!overrides[activeTrip.id]}
          onClose={() => setActiveId(null)}
          onOpenEntry={onOpenEntry}
          onWriteLetter={onWriteLetter}
          onPlaceOnMap={() => setExpanded(true)}
        />
      )}

      {expanded && (
        <TripMapFullView
          trips={trips}
          overrides={overrides}
          setOverrides={setOverrides}
          onClose={() => setExpanded(false)}
          onOpenTrip={id => { setExpanded(false); openTrip(id); }}
        />
      )}
    </div>
  );
}

export default TripsMapScreen;
