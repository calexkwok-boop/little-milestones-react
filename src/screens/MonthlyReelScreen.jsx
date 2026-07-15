import { useState, useEffect, useMemo, useRef } from 'react';
import { cloudinaryTransform, exactAgeLabel } from '../constants.js';
import { supabase } from '../supabase.js';

const PHOTO_SLIDE_MS = 3200;
const SAME_AGE_SLIDE_MS = 7000; // two ~3.5s halves, played sequentially
const MAX_PHOTO_SLIDES = 8;

function videoThumbUrl(videoUrl, transforms = 'so_0,q_auto,f_auto') {
  if (!videoUrl || !videoUrl.startsWith('http')) return null;
  if (videoUrl.includes('res.cloudinary.com')) {
    return videoUrl
      .replace('/video/upload/', `/video/upload/${transforms}/`)
      .replace(/\.[^/.]+$/, '.jpg');
  }
  try {
    const u = new URL(videoUrl);
    return u.origin + u.pathname.replace(/\.[^/.]+$/, '-thumb.jpg') + u.search;
  } catch { return null; }
}

function monthEntriesFor(entries, year, month) {
  return entries.filter(e => {
    if (!e.media?.length) return false;
    const [ey, em] = e.date.split('-').map(Number);
    return ey === year && em === month;
  });
}

// Same "home is the coordinate cluster with the most neighbors within 25
// miles" logic already used for the Journal search's "trips" filter — kept
// as its own copy here since screens/ files are self-contained, same as
// videoThumbUrl above.
const TRIP_DISTANCE_MILES = 25;

function haversine(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findHomePoint(entries) {
  const pts = entries.filter(e => e.locationLat != null && e.locationLng != null);
  if (pts.length < 2) return null;
  let best = null, bestCount = 0;
  pts.forEach(p => {
    const count = pts.filter(q => haversine(p.locationLat, p.locationLng, q.locationLat, q.locationLng) <= TRIP_DISTANCE_MILES).length;
    if (count > bestCount) { bestCount = count; best = p; }
  });
  if (!best || bestCount < 2) return null;
  return { lat: best.locationLat, lng: best.locationLng };
}

// One trip highlight per reel, at most — the farthest-from-home entry this
// month becomes the destination; its photo is the reveal after the arc, and
// the rest of that trip's photos still surface as ordinary slides elsewhere.
function findTripThisMonth(monthEntries, homePt, kids) {
  if (!homePt) return null;
  const tripEntries = monthEntries.filter(e =>
    e.locationLat != null && e.locationLng != null && e.media?.length > 0 &&
    haversine(homePt.lat, homePt.lng, e.locationLat, e.locationLng) > TRIP_DISTANCE_MILES
  );
  if (tripEntries.length === 0) return null;
  const farthest = tripEntries.reduce((a, b) =>
    haversine(homePt.lat, homePt.lng, b.locationLat, b.locationLng) > haversine(homePt.lat, homePt.lng, a.locationLat, a.locationLng) ? b : a
  );
  const photo = farthest.media.find(m => m.type !== 'video') || farthest.media[0];
  // The slide sorts by the trip's *earliest* day, not the farthest photo's
  // day — so in chronological order the animation always leads into that
  // trip's own photos rather than landing partway through them.
  const earliestDate = tripEntries.reduce((min, e) => e.date < min ? e.date : min, tripEntries[0].date);
  return {
    destinationLabel: farthest.location || 'somewhere new',
    date: farthest.date,
    earliestDate,
    destLat: farthest.locationLat,
    destLng: farthest.locationLng,
    photo: { url: photo.url, mediaType: photo.type, cropY: farthest.cropY ?? 50 },
    photoKid: kids.find(k => farthest.kids.includes(k.id)),
    tripEntryIds: new Set(tripEntries.map(e => e.id)),
  };
}

// Sibling match (within a family) takes precedence over a friend match, and
// gets a wider age-day tolerance since siblings are the point of the feature —
// friends are a fallback for only-children, not the primary case.
const SIBLING_TOLERANCE_DAYS = 90;
const FRIEND_TOLERANCE_DAYS = 30;

function ageDays(birthdate, date) {
  return (new Date(date + 'T12:00:00') - new Date(birthdate + 'T12:00:00')) / 86400000;
}

const MAX_SAME_AGE_SLIDES = 3;

function findSameAgeMatches({ monthEntries, kids, entries, friendKids, friendEntries }) {
  // Every media moment from this month, per kid, is a candidate "anchor" —
  // each one independently looks for its own best age-matched companion.
  const anchors = [];
  for (const e of monthEntries) {
    for (const kidId of e.kids) {
      const kid = kids.find(k => k.id === kidId);
      if (!kid?.birthdate) continue;
      anchors.push({ entry: e, kid, days: ageDays(kid.birthdate, e.date) });
    }
  }
  if (anchors.length === 0) return { matches: [], usedUrls: new Set() };

  function bestSiblingFor(anchor) {
    let best = null;
    for (const sibling of kids) {
      if (sibling.id === anchor.kid.id || !sibling.birthdate) continue;
      const pool = entries.filter(e => e.kids.includes(sibling.id) && e.media?.length);
      for (const e of pool) {
        const diff = Math.abs(anchor.days - ageDays(sibling.birthdate, e.date));
        if (diff > SIBLING_TOLERANCE_DAYS) continue;
        if (!best || diff < best.diff) best = { anchor, matchKid: sibling, matchEntry: e, diff, isFriend: false };
      }
    }
    return best;
  }

  function bestFriendFor(anchor) {
    let best = null;
    for (const friendKid of friendKids) {
      if (!friendKid.birthdate) continue;
      const pool = friendEntries.filter(e => e.kids?.includes(friendKid.id) && e.media?.length);
      for (const e of pool) {
        const diff = Math.abs(anchor.days - ageDays(friendKid.birthdate, e.date));
        if (diff > FRIEND_TOLERANCE_DAYS) continue;
        if (!best || diff < best.diff) best = { anchor, matchKid: friendKid, matchEntry: e, diff, isFriend: true };
      }
    }
    return best;
  }

  // Siblings take precedence at the family level: if any sibling match exists
  // this month, friends don't come into it at all — friends are strictly a
  // fallback for a month where no sibling pairing exists.
  const siblingMatches = anchors.map(bestSiblingFor).filter(Boolean);
  const pool = siblingMatches.length > 0 ? siblingMatches : anchors.map(bestFriendFor).filter(Boolean);
  const pickMedia = entry => entry.media.find(m => m.type === 'video') || entry.media[0];

  // The same two entries can surface from both directions (anchor→match and
  // match→anchor) — collapse those down to one slide, closest matches first.
  // And if a candidate would reuse a photo (for either kid) already claimed
  // by an earlier, closer-matching slide, drop it rather than repeat a photo.
  const seenPairs = new Set();
  const usedUrls = new Set();
  const matches = [];
  for (const m of pool.sort((a, b) => a.diff - b.diff)) {
    const key = [m.anchor.entry.id, m.matchEntry.id].sort().join('|');
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);

    const anchorMedia = pickMedia(m.anchor.entry);
    const matchMedia = pickMedia(m.matchEntry);
    if (usedUrls.has(anchorMedia.url) || usedUrls.has(matchMedia.url)) continue;
    usedUrls.add(anchorMedia.url);
    usedUrls.add(matchMedia.url);

    matches.push({ ...m, anchorMedia, matchMedia });
    if (matches.length >= MAX_SAME_AGE_SLIDES) break;
  }
  return { matches, usedUrls };
}

function MediaHalf({ item, kid, active, muted = true }) {
  const isVideo = item.type === 'video';
  const videoRef = useRef(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (active) { el.currentTime = 0; el.play().catch(() => {}); }
    else el.pause();
  }, [active]);
  const poster = isVideo ? videoThumbUrl(item.url, 'so_0,w_800,q_auto,f_auto') : cloudinaryTransform(item.url, 'w_800,q_auto,f_auto');
  return (
    <div style={{ position: 'relative', flex: 1, height: '100%', overflow: 'hidden', background: '#111' }}>
      {isVideo ? (
        <video ref={videoRef} src={item.url} poster={poster} muted={muted} playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: active ? 1 : 0.55, transition: 'opacity 0.4s ease' }} />
      ) : (
        <img src={poster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 35%)' }} />
      {/* Moved to the top — the bottom of the frame is where the reel's own
          chrome (song info, safe-area padding) lives, so text pinned there
          kept getting crowded/hard to read regardless of a gradient or chip. */}
      <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.55)', borderRadius: 10, padding: '6px 12px', textAlign: 'center', maxWidth: '86%' }}>
        <p style={{ margin: 0, fontFamily: "'Urbanist', sans-serif", fontSize: 13, fontWeight: 700, color: '#fff' }}>{kid.name?.split(' ')[0]}</p>
        <p style={{ margin: '2px 0 0', fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.4, textTransform: 'uppercase' }}>{exactAgeLabel(kid.birthdate, item.date)} old</p>
      </div>
    </div>
  );
}

const TRIP_ARC_MS = 2600;

// Abstract arc (not a real map — no map library/API key needed, and it fits
// the reel's illustrated look better than literal map tiles would) from a
// "Home" dot to the destination, a plane animating along it, then a crossfade
// into that trip's photo.
function TripSlide({ trip, active, arcMs, destinationLabel, onPhaseChange }) {
  const [phase, setPhase] = useState('arc');
  useEffect(() => {
    if (!active) { setPhase('arc'); return; }
    const t = setTimeout(() => setPhase('photo'), arcMs);
    return () => clearTimeout(t);
  }, [active, arcMs]);
  useEffect(() => { onPhaseChange?.(phase); }, [phase, onPhaseChange]);

  const isVideo = trip.photo.mediaType === 'video';
  const photoSrc = isVideo ? videoThumbUrl(trip.photo.url, 'so_0,w_1600,q_auto,f_auto') : cloudinaryTransform(trip.photo.url, 'w_1600,q_auto,f_auto');

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(38,58,44,0.97)', opacity: phase === 'arc' ? 1 : 0, transition: 'opacity 0.8s ease', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ margin: '0 0 20px', fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 15, color: '#fff' }}>
          {new Date(trip.earliestDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
        </p>
        {/* Fixed pixel size (not %) because offset-path below needs its path
            data in the same coordinate space as the element it's drawn in —
            percentages there wouldn't track a fluid-width container. Reels
            are a fixed full-screen phone overlay, so this is safe to pin. */}
        <div style={{ position: 'relative', width: 300, height: 170 }}>
          <svg viewBox="0 0 300 170" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
            <path d="M 24 139 Q 150 8 276 68" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeDasharray="6 7" />
          </svg>
          <div style={{ position: 'absolute', left: 24, top: 139, transform: 'translate(-50%, -50%)', width: 7, height: 7, borderRadius: '50%', background: '#C8993E' }} />
          <div style={{ position: 'absolute', left: 276, top: 68, transform: 'translate(-50%, -50%)', width: 7, height: 7, borderRadius: '50%', background: '#C8993E' }} />
          <span style={{ position: 'absolute', left: 24, top: 139 + 12, transform: 'translateX(-50%)', fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: "'Urbanist', sans-serif", fontWeight: 600, whiteSpace: 'nowrap' }}>Home</span>
          <span style={{ position: 'absolute', left: 276, top: 68 + 12, transform: 'translateX(-50%)', fontSize: 11, color: '#E5C97E', fontFamily: "'Urbanist', sans-serif", fontWeight: 700, whiteSpace: 'nowrap', maxWidth: 120, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis' }}>{destinationLabel}</span>
          {/* CSS motion path — the browser follows the exact curve and keeps
              the icon tangent to it every frame, instead of us manually
              sampling points and linearly interpolating between them (which
              cut visible straight-line facets through the curve). Using the
              ✈️ emoji rather than a drawn shape or the ti-plane font icon —
              instantly reads as a plane, unlike the earlier attempts. Its
              resting artwork points up-and-right at ~45°, so (verified
              visually, frame by frame) offset-rotate needs "auto 45deg" —
              plain "auto" or "-45deg" both pointed the wrong way. */}
          {active && phase === 'arc' && (
            <div style={{ position: 'absolute', left: 0, top: 0, fontSize: 20, lineHeight: 1, offsetPath: "path('M 24 139 Q 150 8 276 68')", offsetRotate: 'auto 45deg', animation: `tripFly ${arcMs}ms ease-in-out forwards` }}>✈️</div>
          )}
        </div>
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: phase === 'photo' ? 1 : 0, transition: 'opacity 1s ease' }}>
        <div style={{ position: 'absolute', inset: '-10%', backgroundImage: `url('${photoSrc}')`, backgroundSize: 'cover', backgroundPosition: `center ${trip.photo.cropY}%`, filter: 'blur(18px) brightness(0.5)', transform: 'scale(1.1)' }} />
        {isVideo ? (
          <ReelSlideVideo url={trip.photo.url} active={active && phase === 'photo'} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, backgroundImage: `url('${photoSrc}')`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }} />
        )}
      </div>
    </div>
  );
}

// Toggling the `autoPlay` attribute on a <video> that's already mounted
// doesn't reliably start playback in most browsers — autoplay is only
// honored when the element first attaches with it set. Since every slide is
// mounted up front (just opacity-toggled for the crossfade), the active
// slide's video needs an imperative .play()/.pause() instead.
function ReelSlideVideo({ url, active, style }) {
  const videoRef = useRef(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (active) { el.currentTime = 0; el.play().catch(() => {}); }
    else el.pause();
  }, [active]);
  return <video ref={videoRef} src={url} muted playsInline style={style} />;
}

// The one non-photo slide type: two kids (siblings, or a friend's kid as a
// fallback) shown side by side at roughly the same age. Sequencing (play one
// clip, then the other) only makes sense when there's actually motion to
// sequence — a pure photo/photo pairing just shows both at once, same as any
// other slide, rather than artificially splitting into two halves.
function SameAgeSlide({ match, active, durationMs, hasVideo }) {
  const [activeSide, setActiveSide] = useState('left');
  useEffect(() => {
    if (!hasVideo || !active) { setActiveSide('left'); return; }
    const t = setTimeout(() => setActiveSide('right'), durationMs / 2);
    return () => clearTimeout(t);
  }, [active, durationMs, hasVideo]);

  const leftItem = { ...match.anchorMedia, date: match.anchor.entry.date };
  const rightItem = { ...match.matchMedia, date: match.matchEntry.date };
  const leftActive = hasVideo ? (active && activeSide === 'left') : active;
  const rightActive = hasVideo ? (active && activeSide === 'right') : active;

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ textAlign: 'center', padding: '18px 24px 12px', position: 'relative', zIndex: 2 }}>
        <p style={{ margin: 0, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 15, color: '#fff' }}>At the same age</p>
      </div>
      <div style={{ flex: 1, display: 'flex', gap: 2 }}>
        <MediaHalf item={leftItem} kid={match.anchor.kid} active={leftActive} />
        <MediaHalf item={rightItem} kid={match.matchKid} active={rightActive} />
      </div>
    </div>
  );
}

const RECAP_QUOTE = "Isn't it funny how day by day nothing changes, but when you look back, everything is different.";

function MonthlyReelScreen({ entries, kids, friendEntries = [], friendKids = [], year, month, monthLabel, stats, onClose, onGenerateReelShare, onRevokeReelShare }) {
  const monthEntries = useMemo(() => monthEntriesFor(entries, year, month), [entries, year, month]);

  const { matches: sameAgeMatches, usedUrls: sameAgeUsedUrls } = useMemo(
    () => findSameAgeMatches({ monthEntries, kids, entries, friendKids, friendEntries }),
    [monthEntries, kids, entries, friendKids, friendEntries]
  );

  // Home is computed from ALL entries (a stable, long-term thing), not just
  // this month's — otherwise a month with only trip photos would have
  // nothing to compare distance against.
  const homePt = useMemo(() => findHomePoint(entries), [entries]);
  const trip = useMemo(() => findTripThisMonth(monthEntries, homePt, kids), [monthEntries, homePt, kids]);

  // The stored location is often a specific address/place name — reverse
  // geocode to "City, State" for the arc label instead. Routed through the
  // reverse-geocode edge function rather than calling Google directly: the
  // Geocoding API rejects referrer-restricted keys (the only kind safe to
  // ship in a client bundle), so this has to happen server-side.
  const [tripDestLabel, setTripDestLabel] = useState(null);
  useEffect(() => {
    if (!trip || !supabase) { setTripDestLabel(null); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.functions.invoke('reverse-geocode', { body: { lat: trip.destLat, lng: trip.destLng } });
      if (error || !data?.location) {
        console.warn('[trip reel] reverse geocode failed — falling back to raw location', error || data);
        if (!cancelled) setTripDestLabel(trip.destinationLabel);
        return;
      }
      if (!cancelled) setTripDestLabel(data.location);
    })();
    return () => { cancelled = true; };
  }, [trip]);

  const slides = useMemo(() => {
    // Pre-seed with whatever the same-age slides and the trip slide already
    // claimed, so a photo shown there doesn't also show up again as a plain
    // photo slide.
    const seen = new Set(sameAgeUsedUrls);
    if (trip) seen.add(trip.photo.url);
    const photoCandidates = [];
    for (const e of monthEntries.slice().sort((a, b) => a.date.localeCompare(b.date))) {
      for (const m of e.media) {
        if (seen.has(m.url)) continue;
        seen.add(m.url);
        const kid = kids.find(k => e.kids.includes(k.id));
        photoCandidates.push({ type: 'photo', url: m.url, mediaType: m.type, date: e.date, cropY: e.cropY ?? 50, kid, entryId: e.id, durationMs: PHOTO_SLIDE_MS });
      }
    }
    const sameAgeCandidates = sameAgeMatches.map(match => {
      const hasVideo = match.anchorMedia.type === 'video' || match.matchMedia.type === 'video';
      return { type: 'sameAge', match, date: match.anchor.entry.date, hasVideo, durationMs: hasVideo ? SAME_AGE_SLIDE_MS : PHOTO_SLIDE_MS };
    });
    const tripCandidates = trip ? [{ type: 'trip', trip, date: trip.earliestDate, durationMs: TRIP_ARC_MS + PHOTO_SLIDE_MS }] : [];

    // Videos get priority — every video this month makes it into the reel,
    // no matter how many there are. Only the remaining slide budget (if any)
    // gets filled with photos.
    const videoSlides = photoCandidates.filter(s => s.mediaType === 'video');
    const imageSlides = photoCandidates.filter(s => s.mediaType !== 'video');
    const imageBudget = Math.max(0, MAX_PHOTO_SLIDES - videoSlides.length);

    function sampleEvenly(arr, n) {
      if (arr.length <= n) return arr;
      const step = arr.length / n;
      const out = [];
      for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
      return out;
    }

    // A trip is "a bigger deal" — its photos get first claim on roughly half
    // the image budget (or all of them, if there are fewer) instead of being
    // sampled evenly alongside the rest of the month on equal footing. The
    // remaining budget is sampled evenly across the month as before.
    let keptImages;
    if (trip) {
      const tripImages = imageSlides.filter(s => trip.tripEntryIds.has(s.entryId));
      const otherImages = imageSlides.filter(s => !trip.tripEntryIds.has(s.entryId));
      const tripBudget = Math.min(tripImages.length, Math.ceil(imageBudget / 2));
      const otherBudget = Math.max(0, imageBudget - tripBudget);
      keptImages = [...sampleEvenly(tripImages, tripBudget), ...sampleEvenly(otherImages, otherBudget)];
    } else {
      keptImages = sampleEvenly(imageSlides, imageBudget);
    }

    // Chronological order — a trip slide needs to lead into its own trip
    // photos (picture, picture, trip animation, trip pic, trip pic, picture…),
    // so on a tied date the trip slide always sorts first.
    const combined = [...videoSlides, ...keptImages, ...sameAgeCandidates, ...tripCandidates];
    combined.sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      if (a.type === 'trip') return -1;
      if (b.type === 'trip') return 1;
      return 0;
    });
    return combined;
  }, [monthEntries, kids, sameAgeMatches, sameAgeUsedUrls, trip]);

  const [index, setIndex] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  const [introFading, setIntroFading] = useState(false);
  const [ended, setEnded] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [song, setSong] = useState(null);
  const [slideshowPaused, setSlideshowPaused] = useState(false);
  const [showPauseHint, setShowPauseHint] = useState(false);
  const [slideProgress, setSlideProgress] = useState(0);
  const slideElapsedMsRef = useRef(0);
  const [tripPhase, setTripPhase] = useState('arc'); // lifted from TripSlide so the bottom caption/song bar know when its photo reveal is showing
  const [shareToken, setShareToken] = useState(null);
  const [shareId, setShareId] = useState(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const audioRef = useRef(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  const [audioDuration, setAudioDuration] = useState(null); // seconds, once the clip's metadata loads
  const totalBaseMs = useMemo(() => slides.reduce((sum, s) => sum + s.durationMs, 0), [slides]);
  // Stretch (or shrink) every slide's duration proportionally so the reel's
  // total runtime matches the music clip's actual length — otherwise the
  // reel reliably ends with 10+ seconds of a 30s preview never heard.
  const FADE_BUFFER_MS = 900;
  const durationScale = useMemo(() => {
    if (!audioDuration || totalBaseMs === 0) return 1;
    const available = audioDuration * 1000 - FADE_BUFFER_MS;
    return available > 0 ? available / totalBaseMs : 1;
  }, [audioDuration, totalBaseMs]);

  const slideDuration = (slides[index]?.durationMs ?? PHOTO_SLIDE_MS) * durationScale;

  // Intro card
  useEffect(() => {
    const t1 = setTimeout(() => setIntroFading(true), 2600);
    const t2 = setTimeout(() => setShowIntro(false), 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Background music — same iTunes preview-clip approach as the birthday
  // reel (a real, legally-served 30s preview, not a hosted copy of the
  // track): Landslide, Andie Case's cover specifically.
  useEffect(() => {
    async function loadSong() {
      try {
        const res = await fetch('https://itunes.apple.com/search?term=landslide+andie+case&entity=song&limit=15');
        const data = await res.json();
        const results = (data.results || []).filter(r => r.previewUrl);
        const pick = results.find(r => /andie case/i.test(r.artistName) && /landslide/i.test(r.trackName))
          || results.find(r => /landslide/i.test(r.trackName))
          || results[0];
        if (pick) setSong({ name: pick.trackName, artist: pick.artistName, artworkUrl: pick.artworkUrl100, previewUrl: pick.previewUrl });
      } catch {}
    }
    loadSong();
  }, []);

  useEffect(() => {
    if (song && audioRef.current) {
      audioRef.current.src = song.previewUrl;
      audioRef.current.play().catch(() => {});
    }
  }, [song]);

  // Auto-advance
  useEffect(() => {
    if (ended || showIntro || slideshowPaused || slides.length === 0) return;
    const t = setTimeout(() => {
      if (index + 1 >= slides.length) {
        setEnded(true);
        setTimeout(() => setShowStats(true), 900);
      } else {
        setIndex(i => i + 1);
      }
    }, slideDuration);
    return () => clearTimeout(t);
  }, [index, ended, showIntro, slideshowPaused, slides.length, slideDuration]);

  // Progress bar clock for the active slide
  useEffect(() => {
    if (ended || showIntro || slideshowPaused) return;
    const start = Date.now();
    const base = slideElapsedMsRef.current;
    const id = setInterval(() => {
      const total = base + (Date.now() - start);
      slideElapsedMsRef.current = total;
      setSlideProgress(Math.min(1, total / slideDuration));
    }, 50);
    return () => clearInterval(id);
  }, [index, ended, showIntro, slideshowPaused, slideDuration]);

  useEffect(() => { slideElapsedMsRef.current = 0; setSlideProgress(0); }, [index]);

  // Fade the music out over the final slide, same as the birthday reel —
  // so it doesn't just cut off abruptly when the recap card appears.
  // Deliberately doesn't depend on `ended`: that flips true partway through
  // this fade (when the auto-advance timeout fires), and re-running this
  // effect on that change used to tear the interval down via its cleanup
  // before it ever reached the final a.pause() — leaving the (looping)
  // audio stuck playing indefinitely at whatever volume it was cut off at.
  const fadeStartedRef = useRef(false);
  useEffect(() => {
    if (slides.length === 0 || index !== slides.length - 1 || showIntro || fadeStartedRef.current) return;
    fadeStartedRef.current = true;
    const fadeDuration = slideDuration + 900;
    const STEPS = 30;
    const intervalMs = fadeDuration / STEPS;
    let step = 0;
    const a = audioRef.current;
    const startVol = a ? a.volume : 1;
    const id = setInterval(() => {
      step++;
      const ratio = Math.max(0, 1 - step / STEPS);
      if (a) a.volume = startVol * ratio;
      if (step >= STEPS) { clearInterval(id); a?.pause(); }
    }, intervalMs);
    return () => clearInterval(id);
  }, [index, slides.length, showIntro, slideDuration]);

  function handleTapPause() {
    const next = !slideshowPaused;
    setSlideshowPaused(next);
    if (next) audioRef.current?.pause();
    else audioRef.current?.play().catch(() => {});
    setShowPauseHint(true);
    setTimeout(() => setShowPauseHint(false), 900);
  }

  function handleTouchStart(e) {
    if (e.target.closest('button, input, a')) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }
  function handleTouchEnd(e) {
    if (touchStartX.current === null || e.target.closest('button, input, a')) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      setIndex(i => Math.max(0, Math.min(slides.length - 1, i + (dx < 0 ? 1 : -1))));
    } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      handleTapPause();
    }
  }

  // Only the fields SharedReelScreen actually renders — not full kid/entry
  // objects (internal ids, family_id, etc. have no business in a public row).
  function buildSharePayload() {
    return {
      quote: RECAP_QUOTE,
      stats,
      song,
      slides: slides.map(s => {
        if (s.type === 'sameAge') {
          return {
            type: 'sameAge',
            left: { url: s.match.anchorMedia.url, mediaType: s.match.anchorMedia.type, date: s.match.anchor.entry.date, kidName: s.match.anchor.kid.name.split(' ')[0], kidBirthdate: s.match.anchor.kid.birthdate },
            right: { url: s.match.matchMedia.url, mediaType: s.match.matchMedia.type, date: s.match.matchEntry.date, kidName: s.match.matchKid.name.split(' ')[0], kidBirthdate: s.match.matchKid.birthdate },
          };
        }
        // The arc animation is reel-only — the shared page keeps things
        // simple with just the destination photo, same as the live reel now
        // shows a plain photo (no caption) after its own crossfade.
        if (s.type === 'trip') {
          return { type: 'photo', url: s.trip.photo.url, mediaType: s.trip.photo.mediaType, cropY: s.trip.photo.cropY, date: s.trip.date };
        }
        return { type: 'photo', url: s.url, mediaType: s.mediaType, cropY: s.cropY, date: s.date };
      }),
    };
  }

  async function handleShare() {
    if (!onGenerateReelShare || shareBusy) return;
    setShareBusy(true);
    const result = await onGenerateReelShare({ reelType: 'monthly', title: monthLabel, payload: buildSharePayload() });
    if (result) { setShareToken(result.share_token); setShareId(result.id); }
    setShareBusy(false);
  }

  async function handleRevokeShare() {
    if (!onRevokeReelShare || !shareId || shareBusy) return;
    setShareBusy(true);
    await onRevokeReelShare(shareId);
    setShareToken(null);
    setShareId(null);
    setShareBusy(false);
  }

  function handleCopyShareLink() {
    if (!shareToken) return;
    navigator.clipboard.writeText(`${window.location.origin}/?reel=${shareToken}`).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }).catch(() => {});
  }

  if (slides.length === 0) {
    return (
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.94)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <i className="ti ti-camera-off" style={{ fontSize: 48, color: 'rgba(255,255,255,0.3)' }} />
        <p style={{ color: '#fff', fontSize: 18, fontFamily: "'Playfair Display', serif", textAlign: 'center', padding: '0 32px' }}>No photos yet for {monthLabel}</p>
        <button onClick={onClose} className="btn btn-outline" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)' }}>Close</button>
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', zIndex: 100, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {slides.map((s, i) => {
        const isActive = !showIntro && i === index;
        if (s.type === 'sameAge') {
          return (
            <div key={i} style={{ position: 'absolute', inset: 0, opacity: isActive || (!showIntro && i === index) ? 1 : 0, transition: 'opacity 0.6s ease' }}>
              {i === index && <SameAgeSlide match={s.match} active={isActive && !slideshowPaused} durationMs={slideDuration} hasVideo={s.hasVideo} />}
            </div>
          );
        }
        if (s.type === 'trip') {
          return (
            <div key={i} style={{ position: 'absolute', inset: 0, opacity: isActive ? 1 : 0, transition: 'opacity 0.6s ease' }}>
              {i === index && <TripSlide trip={s.trip} active={isActive && !slideshowPaused} arcMs={TRIP_ARC_MS * durationScale} destinationLabel={tripDestLabel || s.trip.destinationLabel} onPhaseChange={setTripPhase} />}
            </div>
          );
        }
        const isVideo = s.mediaType === 'video';
        const thumbSrc = isVideo ? videoThumbUrl(s.url, 'so_0,w_1600,q_auto,f_auto') : cloudinaryTransform(s.url, 'w_1600,q_auto,f_auto');
        const kbAnim = `kb${(i % 4) + 1} ${slideDuration}ms ease-in-out forwards`;
        return (
          <div key={i} style={{ position: 'absolute', inset: 0, opacity: isActive ? 1 : 0, transition: 'opacity 1s ease' }}>
            <div style={{ position: 'absolute', inset: '-10%', backgroundImage: `url('${thumbSrc}')`, backgroundSize: 'cover', backgroundPosition: `center ${s.cropY}%`, filter: 'blur(18px) brightness(0.5)', transform: 'scale(1.1)' }} />
            {isVideo ? (
              <ReelSlideVideo url={s.url} active={isActive && !slideshowPaused} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <div style={{ position: 'absolute', inset: 0, backgroundImage: `url('${thumbSrc}')`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', animation: isActive ? kbAnim : 'none' }} />
            )}
          </div>
        );
      })}

      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 28%, transparent 55%, rgba(0,0,0,0.75) 100%)', pointerEvents: 'none' }} />

      {showPauseHint && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 8, pointerEvents: 'none' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className={`ti ${slideshowPaused ? 'ti-player-pause' : 'ti-player-play'}`} style={{ fontSize: 26, color: '#fff' }} />
          </div>
        </div>
      )}

      {/* Segmented progress bar — one bar per slide, since slides now have varying durations */}
      {!showStats && (
        <div style={{ position: 'relative', zIndex: 10, display: 'flex', gap: 4, padding: '14px 16px 0' }}>
          {slides.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.25)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#fff', borderRadius: 2, width: `${i < index ? 100 : i === index ? slideProgress * 100 : 0}%` }} />
            </div>
          ))}
        </div>
      )}

      <div style={{ position: 'relative', zIndex: 10, display: 'flex', justifyContent: 'flex-end', padding: '10px 16px 0' }}>
        <button onClick={onClose} style={{ background: 'rgba(0,0,0,0.4)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: 18 }}>
          <i className="ti ti-x" />
        </button>
      </div>

      {!showStats && (
        <div style={{ position: 'relative', zIndex: 1, marginTop: 'auto', padding: '0 20px 32px', textAlign: 'center' }}>
          {slides[index]?.type === 'photo' && slides[index]?.kid && (
            <p key={index} style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', margin: '0 0 10px', letterSpacing: 1, textTransform: 'uppercase', animation: 'captionIn 0.5s ease forwards' }}>
              {slides[index].kid.name.split(' ')[0]} · {exactAgeLabel(slides[index].kid.birthdate, slides[index].date)} old · {new Date(slides[index].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
            </p>
          )}
          {slides[index]?.type === 'trip' && tripPhase === 'photo' && slides[index].trip.photoKid && (
            <p key={index} style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', margin: '0 0 10px', letterSpacing: 1, textTransform: 'uppercase', animation: 'captionIn 0.5s ease forwards' }}>
              {slides[index].trip.photoKid.name.split(' ')[0]} · {exactAgeLabel(slides[index].trip.photoKid.birthdate, slides[index].trip.date)} old · {new Date(slides[index].trip.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
            </p>
          )}
          {song && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
              <img src={song.artworkUrl} style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0 }} alt="" />
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{song.name} — {song.artist}</p>
            </div>
          )}
        </div>
      )}

      {/* Opening title card */}
      {showIntro && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 9, background: 'rgba(38,58,44,0.97)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', transition: 'opacity 0.6s ease', opacity: introFading ? 0 : 1 }}>
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 13, color: 'rgba(200,153,62,0.75)', margin: '0 0 16px', letterSpacing: 0.5 }}>Your month with Patina</p>
          <p style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 44, fontWeight: 700, margin: 0, lineHeight: 1, textAlign: 'center', padding: '0 24px', color: '#fff' }}>
            {monthLabel}
          </p>
        </div>
      )}

      {/* Closing card — the exact monthly recap card that normally pops up on its own,
          just reached via the reel instead of standing alone. */}
      {showStats && stats && (
        <div style={{ position: 'absolute', inset: 0, background: '#1E2A1E', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '0 32px' }}>
          {onGenerateReelShare && (
            <button onClick={() => setShowShareSheet(true)} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: 16 }}>
              <i className="ti ti-share-2" />
            </button>
          )}
          <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(200,153,62,0.8)', letterSpacing: 1.6, textTransform: 'uppercase', margin: '0 0 16px' }}>{monthLabel}</p>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: '#fff', textAlign: 'center', margin: '0 0 6px', lineHeight: 1.35 }}>
            "{RECAP_QUOTE}"
          </h1>
          <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.3)', textAlign: 'center', margin: '0 0 32px', letterSpacing: 0.5 }}>
            — C.S. Lewis
          </p>

          <div style={{ display: 'flex', gap: 12, width: '100%', marginBottom: 40 }}>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 12px', textAlign: 'center' }}>
              <p style={{ fontSize: 36, fontWeight: 800, color: '#C8993E', margin: '0 0 4px', lineHeight: 1 }}>{stats.letters}</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: 0, fontWeight: 600 }}>letter{stats.letters !== 1 ? 's' : ''}</p>
            </div>
            {stats.milestones > 0 && (
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 12px', textAlign: 'center' }}>
                <p style={{ fontSize: 36, fontWeight: 800, color: '#C8993E', margin: '0 0 4px', lineHeight: 1 }}>{stats.milestones}</p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: 0, fontWeight: 600 }}>milestone{stats.milestones !== 1 ? 's' : ''}</p>
              </div>
            )}
            {stats.photos > 0 && (
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 12px', textAlign: 'center' }}>
                <p style={{ fontSize: 36, fontWeight: 800, color: '#C8993E', margin: '0 0 4px', lineHeight: 1 }}>{stats.photos}</p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: 0, fontWeight: 600 }}>photo{stats.photos !== 1 ? 's' : ''}</p>
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="btn btn-gold"
            style={{ border: 'none', borderRadius: 14, padding: '15px 40px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif" }}
          >
            Keep going
          </button>
        </div>
      )}

      {showShareSheet && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 60 }} onClick={() => setShowShareSheet(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', width: '100%', padding: '20px 24px 32px' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 20px' }} />
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <i className="ti ti-share-2" style={{ fontSize: 19, color: 'var(--accent)' }} />
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px', textAlign: 'center' }}>Share this reel</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: 1.6, textAlign: 'center' }}>
              Anyone with this link can watch this month's reel — no Patina account needed. This shares exactly what you've seen just now; new photos added later won't appear. You can revoke it anytime.
            </p>
            {shareToken ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                  <p style={{ flex: 1, fontSize: 12, color: 'var(--text-2)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {`${window.location.origin}/?reel=${shareToken}`}
                  </p>
                </div>
                <button onClick={handleCopyShareLink} className="btn btn-primary" style={{ width: '100%', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", marginBottom: 10 }}>
                  {shareCopied ? 'Copied!' : 'Copy link'}
                </button>
                <button onClick={handleRevokeShare} disabled={shareBusy} style={{ width: '100%', background: 'none', border: 'none', color: '#D4856A', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", padding: '4px', opacity: shareBusy ? 0.6 : 1 }}>
                  Revoke link
                </button>
              </>
            ) : (
              <button onClick={handleShare} disabled={shareBusy} className="btn btn-primary" style={{ width: '100%', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", opacity: shareBusy ? 0.6 : 1 }}>
                {shareBusy ? 'Creating…' : 'Create link'}
              </button>
            )}
          </div>
        </div>
      )}

      <audio ref={audioRef} loop onLoadedMetadata={e => setAudioDuration(e.target.duration)} />
    </div>
  );
}

export default MonthlyReelScreen;
