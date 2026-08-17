import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../icons';
import KidThumb from '../KidThumb.jsx';
import mapImage from '../assets/travel-map.png';
import { findHomePoint, clusterIntoTrips, latLngToMapPercent } from '../tripClustering.js';
import { cloudinaryTransform, videoThumbUrl, PHOTO_SQUARE } from '../constants.js';

const PIN_OVERRIDES_KEY = 'patina-trip-pin-overrides';

function loadPinOverrides() {
  try { return JSON.parse(localStorage.getItem(PIN_OVERRIDES_KEY) || '{}'); } catch { return {}; }
}

// Groups every entry with a tagged location into trips (see tripClustering.js
// for "what counts as the same trip"), picking one representative entry per
// trip -- whichever location string recurs most in that cluster -- to supply
// the pin's real-world coordinates and label. Averaging every entry's lat/lng
// into a centroid instead would risk landing the pin somewhere between two
// real places (or in the ocean) rather than on one that was actually visited.
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
      const pos = latLngToMapPercent(representative.locationLat, representative.locationLng);
      const photos = clusterEntries.flatMap(e => (e.media || []).map(m => ({ ...m, entry: e })));
      const tripKidIds = new Set(clusterEntries.flatMap(e => e.kids || []));
      const tripKids = kids.filter(k => tripKidIds.has(k.id));
      const id = `${sorted[0].date}-${Math.round(representative.locationLat * 100)}-${Math.round(representative.locationLng * 100)}`;
      return {
        id, label, x: pos.x, y: pos.y, photos,
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

function TripSheet({ trip, onClose, onOpenEntry, onWriteLetter }) {
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

        <button
          className="btn btn-gold"
          style={{ width: '100%', marginTop: 18 }}
          onClick={() => onWriteLetter(trip)}
        >
          <Icon name="ti-pencil" style={{ fontSize: 16 }} />
          Write a letter about this trip
        </button>
      </div>
    </div>
  );
}

// The illustrated map isn't drawn to a real projection, so an auto-plotted
// pin (tripClustering.js's latLngToMapPercent) is a starting guess, not a
// guarantee -- it can land a bit off, more so near coastlines/high latitudes
// where the hand-drawn art itself drifts furthest from the real coastline.
// Press-and-drag a pin to correct it; a tap under DRAG_THRESHOLD_PX of
// movement still opens the trip sheet instead. Corrections persist in
// localStorage per trip id (stable across reloads -- see tripClustering.js's
// id comment) rather than a DB column, since this is a per-device visual
// nicety, not data anyone else needs to see.
const DRAG_THRESHOLD_PX = 6;

function TripsMapScreen({ entries, kids, onBack, onOpenEntry, onWriteLetter }) {
  const { homePt, trips } = useTrips(entries, kids);
  const [activeId, setActiveId] = useState(null);
  const [overrides, setOverrides] = useState(loadPinOverrides);
  const [dragPreview, setDragPreview] = useState(null); // { id, x, y }
  const [draggingId, setDraggingId] = useState(null);
  const frameRef = useRef(null);
  const dragStartRef = useRef(null); // { startX, startY, moved } -- doesn't need to be reactive itself

  function positionFor(trip) {
    if (dragPreview?.id === trip.id) return dragPreview;
    const o = overrides[trip.id];
    return o || trip;
  }

  // Only attaches while an actual drag is in progress -- draggingId flipping
  // from null is what (re)runs this, unlike a plain ref mutation, which
  // React has no way to notice.
  useEffect(() => {
    if (!draggingId) return;
    function toFramePercent(clientX, clientY) {
      const rect = frameRef.current.getBoundingClientRect();
      const x = Math.min(100, Math.max(0, (clientX - rect.left) / rect.width * 100));
      const y = Math.min(100, Math.max(0, (clientY - rect.top) / rect.height * 100));
      return { x, y };
    }
    function onMove(e) {
      const d = dragStartRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
      if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) d.moved = true;
      if (d.moved) setDragPreview({ id: draggingId, ...toFramePercent(e.clientX, e.clientY) });
    }
    function onUp(e) {
      const moved = dragStartRef.current?.moved;
      dragStartRef.current = null;
      if (moved) {
        const pos = toFramePercent(e.clientX, e.clientY);
        setOverrides(prev => {
          const next = { ...prev, [draggingId]: pos };
          localStorage.setItem(PIN_OVERRIDES_KEY, JSON.stringify(next));
          return next;
        });
        setDragPreview(null);
      } else {
        setActiveId(prev => prev === draggingId ? null : draggingId);
      }
      setDraggingId(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [draggingId]);

  function startDrag(trip, e) {
    dragStartRef.current = { startX: e.clientX, startY: e.clientY, moved: false };
    setDraggingId(trip.id);
  }

  const activeTrip = trips.find(t => t.id === activeId) || null;

  return (
    <div className="screen">
      <div className="scroll-area">
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
              <div className="trip-map-frame" ref={frameRef} onClick={() => setActiveId(null)}>
                <img className="trip-map-img" src={mapImage} alt="" />
                {trips.map(trip => {
                  const pos = positionFor(trip);
                  const active = trip.id === activeId;
                  return (
                    <button
                      key={trip.id}
                      className={`trip-pin${active ? ' active' : ''}`}
                      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                      onPointerDown={e => { e.stopPropagation(); startDrag(trip, e); }}
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
                })}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: '12px 0 0', lineHeight: 1.5 }}>
                {trips.length} {trips.length === 1 ? 'place' : 'places'} you've written home about<br />
                <span style={{ opacity: 0.75 }}>Pin a little off? Press and drag it to fix.</span>
              </p>
            </>
          )}
        </div>
      </div>

      {activeTrip && (
        <TripSheet
          trip={activeTrip}
          onClose={() => setActiveId(null)}
          onOpenEntry={onOpenEntry}
          onWriteLetter={onWriteLetter}
        />
      )}
    </div>
  );
}

export default TripsMapScreen;
