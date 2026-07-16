import { useState, useEffect, useMemo, useRef } from 'react';
import { cloudinaryTransform, exactAgeLabel } from '../constants.js';
import { supabase } from '../supabase.js';

// Same "{kid} · {age} old · {date}" caption the live reel builds inline from
// full kid/date objects it already has — the shared payload only carries
// plain fields, so this gets precomputed once into a string at share time.
function captionFor(kid, date) {
  if (!kid || !date) return null;
  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return `${kid.name?.split(' ')[0]} · ${exactAgeLabel(kid.birthdate, date)} old · ${dateLabel}`;
}

const PHOTO_SLIDE_MS = 3200;
// One fewer photo slide, traded for more time on the trip arc animation below.
const SHORT_MAX_PHOTO_SLIDES = 7;
// A month with enough content gets a second song and a bigger photo budget
// instead of stretching a handful of photos to fill 60 seconds of music —
// see isLongReel below for the threshold that decides which tier applies.
const LONG_MAX_PHOTO_SLIDES = 14;
// Below this many distinct photos/videos, there just isn't enough material to
// justify a second song — a sparse month gets the original single-song,
// ~30s reel instead of a two-song reel padded out with repeats or a wall of
// near-static slides.
const LONG_REEL_MEDIA_THRESHOLD = 12;

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

// Text-only letters and notes/prompts (no media) are otherwise invisible to
// the reel entirely — this is what actually differentiates it from a generic
// auto-generated photo montage: the family's own written words, not just
// their photos.
function monthTextEntriesFor(entries, year, month) {
  return entries.filter(e => {
    if (e.media?.length || !e.text?.trim()) return false;
    const [ey, em] = e.date.split('-').map(Number);
    return ey === year && em === month;
  });
}

function textExcerpt(text, maxLen) {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= maxLen) return trimmed;
  const cut = trimmed.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut) + '…';
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
function findTripThisMonth(monthEntries, homePt, kids, familyMembers) {
  if (!homePt) return null;
  const tripEntries = monthEntries.filter(e =>
    e.locationLat != null && e.locationLng != null && e.media?.length > 0 &&
    haversine(homePt.lat, homePt.lng, e.locationLat, e.locationLng) > TRIP_DISTANCE_MILES
  );
  if (tripEntries.length === 0) return null;
  const farthest = tripEntries.reduce((a, b) =>
    haversine(homePt.lat, homePt.lng, b.locationLat, b.locationLng) > haversine(homePt.lat, homePt.lng, a.locationLat, a.locationLng) ? b : a
  );
  const distanceMiles = Math.round(haversine(homePt.lat, homePt.lng, farthest.locationLat, farthest.locationLng));
  const photo = farthest.media.find(m => m.type !== 'video') || farthest.media[0];
  // The slide sorts by the trip's *earliest* day, not the farthest photo's
  // day — so in chronological order the animation always leads into that
  // trip's own photos rather than landing partway through them.
  const earliestDate = tripEntries.reduce((min, e) => e.date < min ? e.date : min, tripEntries[0].date);

  // Whoever actually shows up in the trip — every kid tagged in any of its
  // entries, and every family member who authored one — not just the one
  // kid/photo picked to represent it, so the arc reads like "this was your
  // trip" rather than spotlighting a single person.
  const tripKidIds = new Set(tripEntries.flatMap(e => e.kids || []));
  const tripAuthorIds = new Set(tripEntries.map(e => e.userId).filter(Boolean));
  const tripKids = kids.filter(k => tripKidIds.has(k.id));
  const tripFamilyMembers = familyMembers.filter(m => tripAuthorIds.has(m.user_id));

  return {
    destinationLabel: farthest.location || 'somewhere new',
    date: farthest.date,
    earliestDate,
    destLat: farthest.locationLat,
    destLng: farthest.locationLng,
    distanceMiles,
    photo: { url: photo.url, mediaType: photo.type, cropY: farthest.cropY ?? 50 },
    photoKid: kids.find(k => farthest.kids.includes(k.id)),
    tripEntryIds: new Set(tripEntries.map(e => e.id)),
    tripKids,
    tripFamilyMembers,
  };
}

const TRIP_ARC_MS = 4200;

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
        <p style={{ margin: '0 0 14px', fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 15, color: '#fff' }}>
          {new Date(trip.earliestDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
        </p>
        {/* Everyone who actually appears in the trip's own entries — not a
            fixed "family of 4," whoever's kids/authors this trip actually has. */}
        {(trip.tripKids.length + trip.tripFamilyMembers.length) > 0 && (
          <div style={{ display: 'flex', marginBottom: 20 }}>
            {[...trip.tripKids, ...trip.tripFamilyMembers].map((person, i) => {
              const isKid = trip.tripKids.includes(person);
              const avatarUrl = isKid ? person.avatar : person.avatar_url;
              const name = isKid ? person.name : (person.real_name || person.display_name || 'Family');
              const accent = isKid ? (person.accent || '#4A5E50') : '#4A5E50';
              return (
                <div key={i} title={name} style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(38,58,44,0.97)', marginLeft: i > 0 ? -10 : 0, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {avatarUrl
                    ? <img src={cloudinaryTransform(avatarUrl, 'w_68,h_68,c_fill,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 13, color: '#fff' }}>{name.charAt(0)}</span>}
                </div>
              );
            })}
          </div>
        )}
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
        <p style={{ margin: '14px 0 0', fontFamily: "'Urbanist', sans-serif", fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.4 }}>
          {trip.distanceMiles.toLocaleString()} miles from home
        </p>
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

// Text-only letters and notes (no photo) get their own card instead of being
// silently excluded — the reel's one moment built from the family's own
// words, not something an auto-generated photo montage could ever produce.
// Letters get "Dear ___," framing (they're written TO the kid); notes/prompts
// get a quote-mark treatment (they're an observation ABOUT the kid).
function TextSlide({ slide }) {
  const kidFirst = slide.kid?.name?.split(' ')[0];
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(38,58,44,0.97)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 36px' }}>
      {slide.kid && (
        <div style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', marginBottom: 18, flexShrink: 0, background: slide.kid.accent || '#4A5E50', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {slide.kid.avatar
            ? <img src={cloudinaryTransform(slide.kid.avatar, 'w_112,h_112,c_fill,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
            : <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 22, color: '#fff' }}>{kidFirst?.charAt(0)}</span>}
        </div>
      )}
      {slide.subtype === 'letter' ? (
        <>
          {kidFirst && (
            <p style={{ margin: '0 0 18px', fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 15, color: 'rgba(200,153,62,0.85)' }}>Dear {kidFirst},</p>
          )}
          <p style={{ margin: 0, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 21, lineHeight: 1.55, color: '#fff', textAlign: 'center' }}>
            {slide.text}
          </p>
        </>
      ) : (
        <>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 54, lineHeight: 0.6, color: 'rgba(200,153,62,0.6)', display: 'block', marginBottom: 6 }}>"</span>
          <p style={{ margin: '0 0 18px', fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: 20, lineHeight: 1.5, color: '#fff', textAlign: 'center' }}>
            {slide.text}
          </p>
          {kidFirst && (
            <p style={{ margin: 0, fontFamily: "'Urbanist', sans-serif", fontSize: 12, fontWeight: 700, color: 'rgba(200,153,62,0.85)', letterSpacing: 1, textTransform: 'uppercase' }}>{kidFirst}</p>
          )}
        </>
      )}
    </div>
  );
}

const RECAP_QUOTE = "Isn't it funny how day by day nothing changes, but when you look back, everything is different.";

function MonthlyReelScreen({ entries, kids, familyMembers = [], year, month, monthLabel, stats, onClose, onGenerateReelShare, onRevokeReelShare }) {
  const monthEntries = useMemo(() => monthEntriesFor(entries, year, month), [entries, year, month]);
  const monthTextEntries = useMemo(() => monthTextEntriesFor(entries, year, month), [entries, year, month]);

  // Home is computed from ALL entries (a stable, long-term thing), not just
  // this month's — otherwise a month with only trip photos would have
  // nothing to compare distance against.
  const homePt = useMemo(() => findHomePoint(entries), [entries]);
  const trip = useMemo(() => findTripThisMonth(monthEntries, homePt, kids, familyMembers), [monthEntries, homePt, kids, familyMembers]);

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

  const { slides, isLongReel } = useMemo(() => {
    // Pre-seed with whatever the trip slide already claimed, so its photo
    // doesn't also show up again as a plain photo slide.
    const seen = new Set();
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
    // A rich month earns a second song and a bigger photo budget instead of
    // stretching a handful of photos to fill 60 seconds, or repeating itself.
    const isLongReel = photoCandidates.length >= LONG_REEL_MEDIA_THRESHOLD;
    const MAX_PHOTO_SLIDES = isLongReel ? LONG_MAX_PHOTO_SLIDES : SHORT_MAX_PHOTO_SLIDES;
    const tripCandidates = trip ? [{ type: 'trip', trip, date: trip.earliestDate, durationMs: TRIP_ARC_MS + PHOTO_SLIDE_MS }] : [];

    // Letters and notes/prompts with no photo attached — otherwise invisible
    // to the reel. Capped low (unlike photos/videos) since reading text takes
    // real time and this is meant as a moment, not the reel's main content.
    const textAll = monthTextEntries.slice().sort((a, b) => a.date.localeCompare(b.date)).map(e => {
      const kid = kids.find(k => e.kids.includes(k.id));
      const isLetter = e.type === 'letter';
      const excerpt = textExcerpt(e.text, isLetter ? 200 : 140);
      const wordCount = excerpt.split(/\s+/).length;
      return {
        type: 'text',
        subtype: isLetter ? 'letter' : 'note',
        text: excerpt,
        date: e.date,
        kid,
        durationMs: Math.min(7500, Math.max(4200, 1400 + wordCount * 220)),
      };
    });
    const MAX_TEXT_SLIDES = 2;
    const textCandidates = textAll.length <= MAX_TEXT_SLIDES ? textAll : (() => {
      const step = textAll.length / MAX_TEXT_SLIDES;
      const out = [];
      for (let i = 0; i < MAX_TEXT_SLIDES; i++) out.push(textAll[Math.floor(i * step)]);
      return out;
    })();

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

    // Chronological order for the photo/video/trip spine — a trip slide
    // needs to lead into its own trip photos (picture, picture, trip
    // animation, trip pic, trip pic, picture…), so on a tied date the trip
    // slide always sorts first.
    const spine = [...videoSlides, ...keptImages, ...tripCandidates];
    spine.sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      if (a.type === 'trip') return -1;
      if (b.type === 'trip') return 1;
      return 0;
    });

    // Text slides are placed by even spacing across the spine, not by their
    // real date — two letters written a day apart would otherwise land right
    // next to each other instead of reading as separate beats scattered
    // through the reel. Skips the very first/last slot so a quote doesn't
    // open or close the reel outright.
    const combined = spine.slice();
    textCandidates.forEach((textSlide, i) => {
      const fraction = (i + 1) / (textCandidates.length + 1);
      const insertAt = Math.min(spine.length, Math.max(1, Math.round(fraction * spine.length)));
      combined.splice(insertAt + i, 0, textSlide);
    });

    return { slides: combined, isLongReel };
  }, [monthEntries, monthTextEntries, kids, trip]);

  const [index, setIndex] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  const [introFading, setIntroFading] = useState(false);
  const [ended, setEnded] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [freezeFrame, setFreezeFrame] = useState(false);
  const [countedStats, setCountedStats] = useState({ letters: 0, milestones: 0, photos: 0 });
  const [song, setSong] = useState(null);
  const [song2, setSong2] = useState(null);
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
  const [shareError, setShareError] = useState(false);
  const audioRef = useRef(null);
  const audioRef2 = useRef(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const [showingSong2, setShowingSong2] = useState(false); // which track the caption/song bar should credit

  // iOS Safari ignores <audio>.volume entirely — it can be read/written but
  // has no effect on actual output level there, only the hardware volume
  // buttons do. Routing playback through Web Audio GainNodes instead is the
  // standard workaround; gain IS respected on iOS. Falls back to plain
  // .volume elsewhere/if the graph can't be built. One shared AudioContext
  // drives both tracks so the crossfade between them can run through it.
  const audioCtxRef = useRef(null);
  const gainNodeRef = useRef(null);
  const gainNodeRef2 = useRef(null);
  function ensureAudioGraph() {
    if (audioCtxRef.current || !audioRef.current) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const source = ctx.createMediaElementSource(audioRef.current);
      const gain = ctx.createGain();
      source.connect(gain).connect(ctx.destination);
      audioCtxRef.current = ctx;
      gainNodeRef.current = gain;
      if (audioRef2.current) {
        const source2 = ctx.createMediaElementSource(audioRef2.current);
        const gain2 = ctx.createGain();
        gain2.gain.value = 0; // silent until the crossfade ramps it up
        source2.connect(gain2).connect(ctx.destination);
        gainNodeRef2.current = gain2;
      }
    } catch {}
    audioCtxRef.current?.resume?.().catch(() => {});
  }

  const [audioDuration, setAudioDuration] = useState(null); // seconds, once song 1's metadata loads
  const [audioDuration2, setAudioDuration2] = useState(null); // seconds, once song 2's metadata loads
  const totalBaseMs = useMemo(() => slides.reduce((sum, s) => sum + s.durationMs, 0), [slides]);
  // Stretch (or shrink) every slide's duration proportionally so the reel's
  // total runtime matches however much music is actually available —
  // otherwise the reel reliably ends with several seconds of a clip never
  // heard. Safe to use the clip's full length here (no held-back portion to
  // subtract) since playback itself doesn't start until the first slide does.
  // A long reel's budget is song 1 + song 2 combined; song 2's real duration
  // isn't known until its metadata loads (it's preloaded — see below — as
  // soon as it's found, well before the crossfade actually plays it), so a
  // ~29s placeholder (the near-universal iTunes preview length, confirmed by
  // checking a range of tracks) stands in until then.
  const FADE_BUFFER_MS = 900;
  const totalAudioMs = useMemo(() => {
    const s1 = audioDuration ? audioDuration * 1000 : 0;
    if (!isLongReel || !song2) return s1;
    const s2 = audioDuration2 ? audioDuration2 * 1000 : 29000;
    return s1 + s2;
  }, [audioDuration, audioDuration2, isLongReel, song2]);
  const durationScale = useMemo(() => {
    if (!totalAudioMs || totalBaseMs === 0) return 1;
    const available = totalAudioMs - FADE_BUFFER_MS;
    return available > 0 ? available / totalBaseMs : 1;
  }, [totalAudioMs, totalBaseMs]);

  // Text slides get a readability floor that survives the proportional
  // scaling above — a tight reel (lots of photos/videos competing for one
  // ~30s clip) could otherwise compress a letter excerpt down to barely a
  // second, which defeats the entire point of including it. Worst case this
  // makes the reel end a couple seconds after the music fades — a much
  // smaller problem than text nobody can actually read.
  const MIN_TEXT_READ_MS = 4500;
  const currentSlide = slides[index];
  const slideDuration = currentSlide?.type === 'text'
    ? Math.max(currentSlide.durationMs * durationScale, MIN_TEXT_READ_MS)
    : (currentSlide?.durationMs ?? PHOTO_SLIDE_MS) * durationScale;

  // Intro card. The music intentionally does NOT start here — holding it
  // back gives the cover card room to breathe instead of feeling rushed by
  // a countdown that's already ticking, and it starts exactly in sync with
  // the first slide once the card fades out (see introEndedRef below).
  const introEndedRef = useRef(false);
  useEffect(() => {
    const t1 = setTimeout(() => setIntroFading(true), 2600);
    const t2 = setTimeout(() => {
      setShowIntro(false);
      introEndedRef.current = true;
      if (audioRef.current?.src) { ensureAudioGraph(); audioRef.current.play().catch(() => {}); }
    }, 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Background music — same iTunes preview-clip approach as the birthday
  // reel (a real, legally-served preview, not a hosted copy of the track):
  // Landslide, Andie Case's cover specifically.
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

  // Second song — only fetched for a long (rich-month) reel, so a short reel
  // never pays for an API call it won't use. Coastline, Hollow Coves —
  // pairs with Landslide's tone (both quiet and reflective). The track
  // itself is titled "Coastline" (singular), not "Coastlines".
  useEffect(() => {
    if (!isLongReel) return;
    async function loadSong2() {
      try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent('hollow coves coastline')}&entity=song&limit=15`);
        const data = await res.json();
        const results = (data.results || []).filter(r => r.previewUrl);
        const pick = results.find(r => /hollow coves/i.test(r.artistName) && /^coastline$/i.test(r.trackName))
          || results.find(r => /hollow coves/i.test(r.artistName) && /coastline/i.test(r.trackName))
          || results.find(r => /coastline/i.test(r.trackName))
          || results[0];
        if (pick) setSong2({ name: pick.trackName, artist: pick.artistName, artworkUrl: pick.artworkUrl100, previewUrl: pick.previewUrl });
      } catch {}
    }
    loadSong2();
  }, [isLongReel]);

  // Loading each clip (so its duration is known in time to compute
  // durationScale above) happens as soon as it's found. Actually playing
  // song 1 waits for the intro to have already finished — if that already
  // happened by the time the clip loads, start right away instead of waiting
  // forever for an intro-end event that's already passed. Song 2 loads early
  // too (for its duration) but never plays until the crossfade triggers.
  useEffect(() => {
    if (song && audioRef.current) {
      const a = audioRef.current;
      // crossOrigin is already set via the JSX attribute, but re-asserting +
      // forcing a fresh .load() here guards against the browser reusing an
      // HTTP-cached response fetched in no-cors mode from an earlier session
      // (e.g. before this attribute existed) — a stale opaque cache entry for
      // this exact URL is exactly what produces the silent-output CORS
      // warning even with the attribute correctly in place now.
      a.crossOrigin = 'anonymous';
      a.src = song.previewUrl;
      a.load();
      if (introEndedRef.current) { ensureAudioGraph(); a.play().catch(() => {}); }
    }
  }, [song]);

  useEffect(() => {
    if (song2 && audioRef2.current) {
      const a2 = audioRef2.current;
      a2.crossOrigin = 'anonymous';
      a2.src = song2.previewUrl;
      a2.load();
    }
  }, [song2]);

  // Auto-advance
  useEffect(() => {
    if (ended || showIntro || slideshowPaused || slides.length === 0) return;
    const t = setTimeout(() => {
      if (index + 1 >= slides.length) {
        setEnded(true);
        setFreezeFrame(true);
        setTimeout(() => { setFreezeFrame(false); setShowStats(true); }, 2400);
      } else {
        try { navigator.vibrate?.(8); } catch {}
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

  // Fades whichever <audio> element is passed in to silence over its own
  // last stretch, driven by its real playback position rather than by which
  // slide is showing. Tying a fade to the visual slide schedule meant any
  // drift between a clip's actual length and the (estimated, scaled) slide
  // durations — e.g. its duration not being known yet when early slides
  // start — could let the clip hit its natural end before a schedule-based
  // fade ever triggered, cutting it off abruptly. Listening to the element
  // itself always catches the real ending, however the schedule drifted.
  //
  // The fade's own duration is capped to whatever time is actually left (not
  // a fixed length) — verified via an isolated Playwright test that a
  // fixed-length fade routinely lost its final ~200-300ms to the browser's
  // own native end-of-media pause firing first (since `timeupdate` only
  // catches the "about to end" moment to within ~250ms, not exactly when
  // it's crossed), leaving the clip audibly cut off at ~15-20% volume
  // instead of reaching true silence.
  //
  // Fades the GainNode when the Web Audio graph is up (needed on iOS Safari,
  // which silently ignores <audio>.volume — only the hardware buttons affect
  // output there), falling back to element .volume if the graph isn't
  // available for some reason.
  // Fired-flags live in refs (not local closures) so replay() below can
  // reset them — otherwise a replayed track's timeupdate handler would see
  // its fade/crossfade as already-fired from the first playthrough and never
  // trigger again, since the effect that attached it never re-runs.
  const fadeFiredRef1 = useRef(false);
  const fadeFiredRef2 = useRef(false);
  const crossfadeTriggeredRef = useRef(false);

  function attachEndFade(el, getGain, firedRef) {
    if (!el) return () => {};
    const FADE_TRIGGER_MS = 1800;
    // Some browsers (observed on iOS WebKit — which Chrome-on-iOS also runs
    // on, Apple requires it) briefly under-report a still-buffering clip's
    // duration before it self-corrects upward. Reading that raw value here
    // could permanently commit to fading way too early on a single bad tick
    // — there's no way to un-fire `firedRef`. Tracking the highest duration
    // ever observed and using that ceiling instead is immune to a downward
    // blip, since a real duration for a fully-declared file only trends up
    // (or holds steady) as more of it buffers, never legitimately drops.
    let maxDuration = 0;
    function onTimeUpdate() {
      if (firedRef.current) return;
      if (el.duration && isFinite(el.duration)) maxDuration = Math.max(maxDuration, el.duration);
      if (!maxDuration) return;
      const remainingMs = (maxDuration - el.currentTime) * 1000;
      if (remainingMs > FADE_TRIGGER_MS) return;
      firedRef.current = true;
      const fadeDuration = Math.max(300, remainingMs - 60);
      const STEPS = Math.max(6, Math.round(fadeDuration / 60));
      const gain = getGain();
      const startVol = gain ? gain.gain.value : el.volume;
      let step = 0;
      const id = setInterval(() => {
        step++;
        const v = Math.max(0, startVol * (1 - step / STEPS));
        if (gain) gain.gain.value = v; else el.volume = v;
        if (step >= STEPS) { clearInterval(id); el.pause(); }
      }, fadeDuration / STEPS);
    }
    el.addEventListener('timeupdate', onTimeUpdate);
    return () => el.removeEventListener('timeupdate', onTimeUpdate);
  }

  // Song 1 ending: crossfade into song 2 (long reel with one loaded) or just
  // fade to silence (short reel / song 2 never came through) — decided once,
  // the first time song 1 nears its own end.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!song2) return attachEndFade(a, () => gainNodeRef.current, fadeFiredRef1);

    const CROSSFADE_MS = 1800;
    let maxDuration = 0; // ceiling guard against a transient under-reported duration — see attachEndFade above
    function onTimeUpdate() {
      if (crossfadeTriggeredRef.current) return;
      if (a.duration && isFinite(a.duration)) maxDuration = Math.max(maxDuration, a.duration);
      if (!maxDuration) return;
      const remainingMs = (maxDuration - a.currentTime) * 1000;
      if (remainingMs > CROSSFADE_MS) return;
      crossfadeTriggeredRef.current = true;
      const a2 = audioRef2.current;
      const gain1 = gainNodeRef.current;
      const gain2 = gainNodeRef2.current;
      const startVol1 = gain1 ? gain1.gain.value : a.volume;
      if (a2) { setShowingSong2(true); a2.play().catch(() => {}); }
      if (gain2) gain2.gain.value = 0;
      const fadeDuration = Math.max(300, remainingMs - 60);
      const STEPS = Math.max(6, Math.round(fadeDuration / 60));
      let step = 0;
      const id = setInterval(() => {
        step++;
        const ratio = step / STEPS;
        const v1 = Math.max(0, startVol1 * (1 - ratio));
        if (gain1) gain1.gain.value = v1; else a.volume = v1;
        if (gain2) gain2.gain.value = Math.min(1, ratio); else if (a2) a2.volume = Math.min(1, ratio);
        if (step >= STEPS) { clearInterval(id); a.pause(); }
      }, fadeDuration / STEPS);
    }
    a.addEventListener('timeupdate', onTimeUpdate);
    return () => a.removeEventListener('timeupdate', onTimeUpdate);
  }, [song2]);

  // Song 2 ending (long reel only) — fades to silence near its own end, same
  // as a lone song would. No-ops harmlessly if song 2 never loaded.
  useEffect(() => attachEndFade(audioRef2.current, () => gainNodeRef2.current, fadeFiredRef2), []);

  // Preload every slide's image/video-thumb so it's already cached by the
  // time it becomes active, instead of a possible pop-in on a slow connection.
  useEffect(() => {
    slides.forEach(s => {
      if (s.type === 'text') return;
      const src = s.type === 'trip'
        ? (s.trip.photo.mediaType === 'video' ? videoThumbUrl(s.trip.photo.url, 'so_0,w_1600,q_auto,f_auto') : cloudinaryTransform(s.trip.photo.url, 'w_1600,q_auto,f_auto'))
        : (s.mediaType === 'video' ? videoThumbUrl(s.url, 'so_0,w_1600,q_auto,f_auto') : cloudinaryTransform(s.url, 'w_1600,q_auto,f_auto'));
      if (src) { const img = new Image(); img.src = src; }
    });
  }, [slides]);

  // Count-up animation when the closing stats card appears. Deliberately
  // keyed only on `showStats`, not `stats` itself — `stats` is a fresh
  // object literal recomputed by the parent on every one of ITS renders
  // (not just when the reel opens), so depending on it by reference would
  // restart this animation on any incidental parent re-render, usually
  // before it ever got to visibly count up.
  useEffect(() => {
    if (!showStats || !stats) return;
    const DURATION = 1400;
    const STEPS = 40;
    const interval = DURATION / STEPS;
    let step = 0;
    const t = setInterval(() => {
      step++;
      const progress = Math.min(step / STEPS, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCountedStats({
        letters: Math.round((stats.letters || 0) * ease),
        milestones: Math.round((stats.milestones || 0) * ease),
        photos: Math.round((stats.photos || 0) * ease),
      });
      if (step >= STEPS) clearInterval(t);
    }, interval);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showStats]);

  function handleTapPause() {
    const next = !slideshowPaused;
    setSlideshowPaused(next);
    if (next) { audioRef.current?.pause(); audioRef2.current?.pause(); }
    else {
      audioCtxRef.current?.resume?.().catch(() => {});
      (showingSong2 ? audioRef2.current : audioRef.current)?.play().catch(() => {});
    }
    setShowPauseHint(true);
    setTimeout(() => setShowPauseHint(false), 900);
  }

  function replay() {
    setIndex(0);
    setEnded(false);
    setShowStats(false);
    setFreezeFrame(false);
    setCountedStats({ letters: 0, milestones: 0, photos: 0 });
    setShowingSong2(false);
    setSlideshowPaused(false);
    setShowPauseHint(false);
    crossfadeTriggeredRef.current = false;
    fadeFiredRef1.current = false;
    fadeFiredRef2.current = false;
    audioCtxRef.current?.resume?.().catch(() => {});
    const a = audioRef.current;
    if (a) {
      a.currentTime = 0;
      if (gainNodeRef.current) gainNodeRef.current.gain.value = 1; else a.volume = 1;
      a.play().catch(() => {});
    }
    const a2 = audioRef2.current;
    if (a2) {
      // Leave its .src alone — it was already preloaded once, so pausing and
      // rewinding lets the next crossfade reuse it instead of re-fetching
      // the whole clip from the network again.
      a2.pause();
      a2.currentTime = 0;
      if (gainNodeRef2.current) gainNodeRef2.current.gain.value = 0; else a2.volume = 0;
    }
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
      song2: song2 || null,
      slides: slides.map(s => {
        // Full trip data, not flattened — the shared page renders the same
        // arc animation the live reel does. destinationLabel uses whatever
        // was already reverse-geocoded live, so the shared page never needs
        // to make that call itself (it has no way to — it's an anonymous,
        // unauthenticated request). tripKids/tripFamilyMembers get merged
        // into one normalized list since the shared renderer doesn't need to
        // tell them apart, only the live one's avatar-styling code does.
        if (s.type === 'trip') {
          return {
            type: 'trip',
            earliestDate: s.trip.earliestDate,
            distanceMiles: s.trip.distanceMiles,
            destinationLabel: tripDestLabel || s.trip.destinationLabel,
            photo: { url: s.trip.photo.url, mediaType: s.trip.photo.mediaType, cropY: s.trip.photo.cropY },
            photoCaption: captionFor(s.trip.photoKid, s.trip.date),
            tripPeople: [
              ...s.trip.tripKids.map(k => ({ name: k.name, avatar: k.avatar, accent: k.accent })),
              ...s.trip.tripFamilyMembers.map(m => ({ name: m.real_name || m.display_name || 'Family', avatar: m.avatar_url, accent: '#4A5E50' })),
            ],
          };
        }
        if (s.type === 'text') {
          return { type: 'text', subtype: s.subtype, text: s.text, date: s.date, kidName: s.kid?.name?.split(' ')[0] || null, kidAvatar: s.kid?.avatar || null, kidAccent: s.kid?.accent || null };
        }
        return { type: 'photo', url: s.url, mediaType: s.mediaType, cropY: s.cropY, date: s.date, caption: captionFor(s.kid, s.date) };
      }),
    };
  }

  async function handleShare() {
    if (!onGenerateReelShare || shareBusy) return;
    setShareBusy(true);
    setShareError(false);
    const result = await onGenerateReelShare({ reelType: 'monthly', title: monthLabel, payload: buildSharePayload() });
    if (result) { setShareToken(result.share_token); setShareId(result.id); }
    else setShareError(true);
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
        if (s.type === 'trip') {
          return (
            <div key={i} style={{ position: 'absolute', inset: 0, opacity: isActive ? 1 : 0, transition: 'opacity 0.6s ease' }}>
              {i === index && <TripSlide trip={s.trip} active={isActive && !slideshowPaused} arcMs={TRIP_ARC_MS * durationScale} destinationLabel={tripDestLabel || s.trip.destinationLabel} onPhaseChange={setTripPhase} />}
            </div>
          );
        }
        if (s.type === 'text') {
          return (
            <div key={i} style={{ position: 'absolute', inset: 0, opacity: isActive ? 1 : 0, transition: 'opacity 0.6s ease' }}>
              <TextSlide slide={s} />
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
      {freezeFrame && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none', animation: 'freezeIn 2.4s ease forwards' }} />
      )}

      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 28%, transparent 55%, rgba(0,0,0,0.75) 100%)', pointerEvents: 'none' }} />

      {showPauseHint && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 8, pointerEvents: 'none' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'introOut 0.9s ease forwards' }}>
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
          {(() => { const activeSong = showingSong2 && song2 ? song2 : song; return activeSong ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
              <img src={activeSong.artworkUrl} style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0 }} alt="" />
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{activeSong.name} — {activeSong.artist}</p>
            </div>
          ) : null; })()}
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
          <p className="fade-up" style={{ fontSize: 11, fontWeight: 700, color: 'rgba(200,153,62,0.8)', letterSpacing: 1.6, textTransform: 'uppercase', margin: '0 0 16px', animationDelay: '0ms' }}>{monthLabel}</p>
          <h1 className="fade-up" style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: '#fff', textAlign: 'center', margin: '0 0 6px', lineHeight: 1.35, animationDelay: '120ms' }}>
            "{RECAP_QUOTE}"
          </h1>
          <p className="fade-up" style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.3)', textAlign: 'center', margin: '0 0 32px', letterSpacing: 0.5, animationDelay: '220ms' }}>
            — C.S. Lewis
          </p>

          <div className="fade-up" style={{ display: 'flex', gap: 12, width: '100%', marginBottom: 40, animationDelay: '340ms' }}>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 12px', textAlign: 'center' }}>
              <p style={{ fontSize: 36, fontWeight: 800, color: '#C8993E', margin: '0 0 4px', lineHeight: 1 }}>{countedStats.letters}</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: 0, fontWeight: 600 }}>letter{stats.letters !== 1 ? 's' : ''}</p>
            </div>
            {stats.milestones > 0 && (
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 12px', textAlign: 'center' }}>
                <p style={{ fontSize: 36, fontWeight: 800, color: '#C8993E', margin: '0 0 4px', lineHeight: 1 }}>{countedStats.milestones}</p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: 0, fontWeight: 600 }}>milestone{stats.milestones !== 1 ? 's' : ''}</p>
              </div>
            )}
            {stats.photos > 0 && (
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 12px', textAlign: 'center' }}>
                <p style={{ fontSize: 36, fontWeight: 800, color: '#C8993E', margin: '0 0 4px', lineHeight: 1 }}>{countedStats.photos}</p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: 0, fontWeight: 600 }}>photo{stats.photos !== 1 ? 's' : ''}</p>
              </div>
            )}
          </div>

          <button onClick={replay} className="fade-up" style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: 22, marginBottom: 20, animationDelay: '480ms' }}>
            <i className="ti ti-player-play-filled" style={{ marginLeft: 2 }} />
          </button>

          <button
            onClick={onClose}
            className="btn btn-gold fade-up"
            style={{ border: 'none', borderRadius: 14, padding: '15px 40px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", animationDelay: '560ms' }}
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
              Anyone with this link can watch this month's reel — no Patina account needed.
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
              <>
                <button onClick={handleShare} disabled={shareBusy} className="btn btn-primary" style={{ width: '100%', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", opacity: shareBusy ? 0.6 : 1 }}>
                  {shareBusy ? 'Creating…' : 'Create link'}
                </button>
                {shareError && (
                  <p style={{ fontSize: 12, color: '#D4856A', margin: '10px 0 0', textAlign: 'center' }}>
                    Something went wrong creating the link. Please try again.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <audio ref={audioRef} preload="auto" crossOrigin="anonymous" onLoadedMetadata={e => setAudioDuration(e.target.duration)} />
      <audio ref={audioRef2} preload="auto" crossOrigin="anonymous" onLoadedMetadata={e => setAudioDuration2(e.target.duration)} />
    </div>
  );
}

export default MonthlyReelScreen;
