import { useState, useEffect, useMemo, useRef } from 'react';
import { cloudinaryTransform, AVATAR_TRANSFORM_SM, AVATAR_TRANSFORM_LG, VIDEO_DELIVERY_TRANSFORM, exactAgeLabel } from '../constants.js';

// Everything in this file is used by BOTH the live in-app reel
// (MonthlyReelScreen) and its public replay page (SharedReelScreen) — slide
// rendering, the trip arc animation, text-slide cards, the audio
// crossfade/fade engine, and the closing card. Splitting these out of two
// separately-maintained copies exists specifically because that duplication
// repeatedly caused the shared page to drift out of sync with the live
// reel (missing captions, missing the second song, missing the trip
// animation, missing the stats count-up) — each one found and fixed
// separately instead of being impossible to miss in the first place.
// What's NOT shared: how each screen sources its slide data (live query vs.
// frozen JSON snapshot) and the tap-to-start gate the shared page needs
// (autoplay-with-sound requires a fresh gesture there; the live reel is
// already mid-interaction when it opens).

export const PHOTO_SLIDE_MS = 3200;
export const TRIP_ARC_MS = 4200;
export const MIN_TEXT_READ_MS = 4500;

export function videoThumbUrl(videoUrl, transforms = 'so_0,q_auto,f_auto') {
  if (!videoUrl || !videoUrl.startsWith('http')) return null;
  if (videoUrl.includes('res.cloudinary.com')) {
    return videoUrl.replace('/video/upload/', `/video/upload/${transforms}/`).replace(/\.[^/.]+$/, '.jpg');
  }
  try {
    const u = new URL(videoUrl);
    return u.origin + u.pathname.replace(/\.[^/.]+$/, '-thumb.jpg') + u.search;
  } catch { return null; }
}

// Every slide carries its own base durationMs (in ms, before scaling) —
// photo/trip slides get it fixed at build time, text slides from a
// reading-time formula. Scaling it against the actual music length happens
// here, uniformly, with text's readability floor applied after scaling so a
// tight reel can't compress a letter excerpt down to unreadable.
export function slideDurationMs(s, scale) {
  const base = (s?.durationMs ?? PHOTO_SLIDE_MS) * scale;
  return s?.type === 'text' ? Math.max(base, MIN_TEXT_READ_MS) : base;
}

// "{kid} · {age} old · {date}" — used both for the live caption bar and
// (precomputed into a plain string) for the shared payload, so both render
// from the exact same field instead of the shared page recomputing it from
// data it doesn't have.
export function captionFor(kid, date) {
  if (!kid || !date) return null;
  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return `${kid.name?.split(' ')[0]} · ${exactAgeLabel(kid.birthdate, date)} old · ${dateLabel}`;
}

function textExcerpt(text, maxLen) {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= maxLen) return trimmed;
  const cut = trimmed.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut) + '…';
}

// `startDate`/`endDate` are ISO 'YYYY-MM-DD' strings, inclusive on both ends —
// these compare correctly as plain strings, so no Date parsing is needed. A
// calendar-month reel is just the special case where the caller computed
// startDate/endDate as that month's first/last day.
function entriesInRange(entries, startDate, endDate) {
  return entries.filter(e => e.date >= startDate && e.date <= endDate);
}

function monthEntriesFor(entries, startDate, endDate) {
  return entriesInRange(entries, startDate, endDate).filter(e => e.media?.length);
}

// Every letter/note with written words is a candidate here, media or not —
// this is what actually differentiates the reel from a generic auto-generated
// photo montage: the family's own written words, not just their photos. A
// letter with a photo attached still gets its photo in the photo pipeline
// below; this is what earns its words their own separate beat in the reel.
function monthTextEntriesFor(entries, startDate, endDate) {
  return entriesInRange(entries, startDate, endDate).filter(e => e.text?.trim());
}

// Same "home is the coordinate cluster with the most neighbors within 25
// miles" logic already used for the Journal search's "trips" filter — kept
// as its own copy here since screens/ files are self-contained.
const TRIP_DISTANCE_MILES = 25;

function haversine(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findHomePoint(entries) {
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

// Every distinct trip in range gets its own highlight — entries far from
// home are grouped by mutual proximity (two far-from-home entries within
// TRIP_DISTANCE_MILES of each other are the same trip; further apart, they're
// separate trips), so a month with both a beach week and a grandparent visit
// surfaces two trip slides instead of just the single farthest one. Each
// trip's farthest-from-home entry becomes its destination; the rest of that
// trip's photos still surface as ordinary slides elsewhere.
function findTripsThisMonth(monthEntries, homePt, kids, familyMembers) {
  if (!homePt) return [];
  const tripEntries = monthEntries.filter(e =>
    e.locationLat != null && e.locationLng != null && e.media?.length > 0 &&
    haversine(homePt.lat, homePt.lng, e.locationLat, e.locationLng) > TRIP_DISTANCE_MILES
  );
  if (tripEntries.length === 0) return [];

  const clusters = [];
  for (const e of tripEntries) {
    const cluster = clusters.find(c => c.some(o => haversine(o.locationLat, o.locationLng, e.locationLat, e.locationLng) <= TRIP_DISTANCE_MILES));
    if (cluster) cluster.push(e);
    else clusters.push([e]);
  }

  return clusters.map(clusterEntries => {
    const farthest = clusterEntries.reduce((a, b) =>
      haversine(homePt.lat, homePt.lng, b.locationLat, b.locationLng) > haversine(homePt.lat, homePt.lng, a.locationLat, a.locationLng) ? b : a
    );
    const distanceMiles = Math.round(haversine(homePt.lat, homePt.lng, farthest.locationLat, farthest.locationLng));
    const photo = farthest.media.find(m => m.type !== 'video') || farthest.media[0];
    // The slide sorts by the trip's *earliest* day, not the farthest photo's
    // day — so in chronological order the animation always leads into that
    // trip's own photos rather than landing partway through them.
    const earliestDate = clusterEntries.reduce((min, e) => e.date < min ? e.date : min, clusterEntries[0].date);

    // Whoever actually shows up in the trip — every kid tagged in any of its
    // entries, and every family member who authored one — not just the one
    // kid/photo picked to represent it, so the arc reads like "this was your
    // trip" rather than spotlighting a single person. Normalized into one
    // {name, avatar, accent} shape since TripSlide doesn't need to tell kids
    // and family members apart.
    const tripKidIds = new Set(clusterEntries.flatMap(e => e.kids || []));
    const tripAuthorIds = new Set(clusterEntries.map(e => e.userId).filter(Boolean));
    const tripKids = kids.filter(k => tripKidIds.has(k.id));
    const tripFamilyMembers = familyMembers.filter(m => tripAuthorIds.has(m.user_id));
    const tripPeople = [
      ...tripKids.map(k => ({ name: k.name, avatar: k.avatar, accent: k.accent })),
      ...tripFamilyMembers.map(m => ({ name: m.real_name || m.display_name || 'Family', avatar: m.avatar_url, accent: '#4A5E50' })),
    ];
    const photoKid = kids.find(k => farthest.kids.includes(k.id));

    // A stable id derived from the destination + when it happened, not array
    // position — so a saved reel's { type: 'trip', id } ref still resolves to
    // the same trip after new entries reshuffle cluster order on reopen.
    const id = `${earliestDate}-${Math.round(farthest.locationLat * 100)}-${Math.round(farthest.locationLng * 100)}`;

    return {
      type: 'trip',
      id,
      date: earliestDate,
      earliestDate,
      destLat: farthest.locationLat,
      destLng: farthest.locationLng,
      destinationLabel: farthest.location || 'somewhere new',
      distanceMiles,
      photo: { url: photo.url, mediaType: photo.type, cropY: farthest.cropY ?? 50 },
      photoCaption: captionFor(photoKid, farthest.date),
      tripPeople,
      tripEntryIds: new Set(clusterEntries.map(e => e.id)),
      durationMs: TRIP_ARC_MS + PHOTO_SLIDE_MS,
    };
  }).sort((a, b) => a.earliestDate.localeCompare(b.earliestDate));
}

// The full, unbudgeted pool of everything a reel for this range could draw
// from — both the live playback algorithm (which applies its own
// budget/sampling on top of this) and the reel editor (which needs to know
// everything available to offer, not just what got auto-picked) build off
// this exact same set, so "what's in the reel" and "what's available to add"
// never drift out of sync with each other.
export function buildReelCandidates(entries, kids, familyMembers, startDate, endDate) {
  const monthEntries = monthEntriesFor(entries, startDate, endDate);
  const monthTextEntries = monthTextEntriesFor(entries, startDate, endDate);
  const homePt = findHomePoint(entries);
  const trips = findTripsThisMonth(monthEntries, homePt, kids, familyMembers);

  const seen = new Set();
  trips.forEach(t => seen.add(t.photo.url));
  const photoCandidates = [];
  for (const e of monthEntries.slice().sort((a, b) => a.date.localeCompare(b.date))) {
    for (const m of e.media) {
      if (seen.has(m.url)) continue;
      seen.add(m.url);
      const kid = kids.find(k => e.kids.includes(k.id));
      photoCandidates.push({ type: 'photo', url: m.url, mediaType: m.type, date: e.date, cropY: e.cropY ?? 50, kid, caption: captionFor(kid, e.date), entryId: e.id, durationMs: PHOTO_SLIDE_MS });
    }
  }

  const textCandidates = monthTextEntries.slice().sort((a, b) => a.date.localeCompare(b.date)).map(e => {
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
      kidName: kid?.name?.split(' ')[0] || null,
      kidAvatar: kid?.avatar || null,
      kidAccent: kid?.accent || null,
      entryId: e.id,
      durationMs: Math.min(7500, Math.max(4200, 1400 + wordCount * 220)),
    };
  });

  return { photoCandidates, textCandidates, trips };
}

// Turns a saved, ordered list of lightweight refs back into real slide
// objects against *current* entries/kids data — a crop change or caption
// still updates live, only the set and order the user picked are pinned.
// A ref whose source entry no longer exists (deleted since the reel was
// last edited) is silently skipped rather than erroring.
export function resolveSlideRefs(refs, candidates) {
  const photoByUrl = new Map(candidates.photoCandidates.map(p => [p.url, p]));
  const textByEntryId = new Map(candidates.textCandidates.map(t => [t.entryId, t]));
  const tripById = new Map(candidates.trips.map(t => [t.id, t]));
  const out = [];
  for (const ref of refs || []) {
    if (ref.type === 'trip') {
      // Refs saved before multi-trip support have no id — best-effort
      // fall back to whichever trip is first, since only one could ever
      // have existed when that ref was written.
      const found = ref.id != null ? tripById.get(ref.id) : candidates.trips[0];
      if (found) out.push(found);
      continue;
    }
    if (ref.type === 'letter') { const found = textByEntryId.get(ref.entryId); if (found) out.push(found); continue; }
    const found = photoByUrl.get(ref.url);
    if (found) out.push(found);
  }
  return out;
}

// The inverse of resolveSlideRefs — what actually gets persisted to
// saved_reels.slide_refs when the editor saves.
export function slideToRef(slide) {
  if (slide.type === 'trip') return { type: 'trip', id: slide.id };
  if (slide.type === 'text') return { type: 'letter', entryId: slide.entryId };
  return { type: slide.mediaType === 'video' ? 'video' : 'photo', entryId: slide.entryId, url: slide.url };
}

// A tiny seeded PRNG (mulberry32, seeded via a string hash) — the "random"
// photo fill below needs to reshuffle only when the actual candidate pool
// changes (new entries added to the range), not on every re-open of the same
// saved reel, or a "saved" reel would show different photos each time.
export function seededRandom(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h = (h ^= h >>> 16) >>> 0;
    return h / 4294967296;
  };
}

// One fewer photo slide, traded for more time on the trip arc animation.
const SHORT_MAX_PHOTO_SLIDES = 7;
// A rich range earns a second song and a bigger photo budget instead of
// stretching a handful of photos to fill 60 seconds, or repeating itself.
const LONG_MAX_PHOTO_SLIDES = 14;
// Below this many distinct photos/videos, there just isn't enough material to
// justify a second song — a sparse range gets the original single-song,
// ~30s reel instead of a two-song reel padded out with repeats.
const LONG_REEL_MEDIA_THRESHOLD = 12;

// The algorithmic "pick and arrange" step — everything buildReelCandidates
// found, budgeted/sampled/interleaved into an actual playable order. Shared
// by the live reel (auto mode, before anything's been saved to freeze it)
// and the reel editor (to show what the algorithm would have picked, as the
// starting point for a freshly-built reel that's never been through the
// editor before).
export function autoSampleSlides(candidates, { forceLongReel = null, reelId = null } = {}) {
  const { photoCandidates, textCandidates: allTextCandidates, trips } = candidates;
  const isLongReel = forceLongReel != null ? forceLongReel : photoCandidates.length >= LONG_REEL_MEDIA_THRESHOLD;
  const MAX_PHOTO_SLIDES = isLongReel ? LONG_MAX_PHOTO_SLIDES : SHORT_MAX_PHOTO_SLIDES;
  // Every detected trip makes it in automatically, same as videos — the
  // user can always bench one later in the editor if a range happens to
  // catch more than one.
  const tripCandidates = trips;

  const MAX_TEXT_SLIDES = 2;
  const textCandidates = allTextCandidates.length <= MAX_TEXT_SLIDES ? allTextCandidates : (() => {
    const step = allTextCandidates.length / MAX_TEXT_SLIDES;
    const out = [];
    for (let i = 0; i < MAX_TEXT_SLIDES; i++) out.push(allTextCandidates[Math.floor(i * step)]);
    return out;
  })();

  // Videos get priority — every video makes it into the reel, no matter how
  // many there are. Only the remaining slide budget (if any) gets photos.
  const videoSlides = photoCandidates.filter(s => s.mediaType === 'video');
  const imageSlides = photoCandidates.filter(s => s.mediaType !== 'video');
  const imageBudget = Math.max(0, MAX_PHOTO_SLIDES - videoSlides.length);

  // Videos and letters are the guaranteed content — plain photos are the
  // filler, so which ones make the cut is randomized rather than picked by a
  // fixed stride. An unsaved reel (reelId == null) gets a fresh shuffle via
  // Math.random() every time it's opened. Once it's actually saved, reelId is
  // that row's own stable id — seeding on it means the same saved reel always
  // samples the same photos, instead of reshuffling on reopen.
  const rng = reelId != null ? seededRandom(String(reelId)) : Math.random;
  function sampleRandom(arr, n) {
    if (arr.length <= n) return arr;
    const shuffled = arr.slice().sort(() => rng() - 0.5);
    return shuffled.slice(0, n);
  }

  // A trip is "a bigger deal" — its photos get first claim on roughly half
  // the image budget (or all of them, if there are fewer) instead of being
  // sampled alongside the rest on equal footing. The remaining budget is
  // filled randomly from the rest. Multiple trips share that same half
  // between them rather than each claiming their own half.
  let keptImages;
  if (trips.length > 0) {
    const tripEntryIds = new Set(trips.flatMap(t => [...t.tripEntryIds]));
    const tripImages = imageSlides.filter(s => tripEntryIds.has(s.entryId));
    const otherImages = imageSlides.filter(s => !tripEntryIds.has(s.entryId));
    const tripBudget = Math.min(tripImages.length, Math.ceil(imageBudget / 2));
    const otherBudget = Math.max(0, imageBudget - tripBudget);
    keptImages = [...sampleRandom(tripImages, tripBudget), ...sampleRandom(otherImages, otherBudget)];
  } else {
    keptImages = sampleRandom(imageSlides, imageBudget);
  }

  // Chronological order for the photo/video/trip spine — a trip slide needs
  // to lead into its own trip photos, so on a tied date the trip slide
  // always sorts first.
  const spine = [...videoSlides, ...keptImages, ...tripCandidates];
  spine.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    if (a.type === 'trip' && b.type !== 'trip') return -1;
    if (b.type === 'trip' && a.type !== 'trip') return 1;
    return 0;
  });

  // A letter/note pairs with its own entry's photo or video when that media
  // survived the budget — read the words, then see the moment right after,
  // rather than the two landing in unrelated parts of the reel. Only falls
  // back to even spacing (not by real date — two letters a day apart would
  // otherwise land right next to each other instead of reading as separate
  // beats) when that entry's media didn't make the cut. Skips the very
  // first/last slot in that fallback so a quote doesn't open or close the
  // reel outright.
  let combined = spine.slice();
  const unpaired = [];
  textCandidates.forEach(textSlide => {
    const pairIdx = combined.findIndex(s => s.type !== 'trip' && s.entryId === textSlide.entryId);
    if (pairIdx !== -1) combined.splice(pairIdx, 0, textSlide);
    else unpaired.push(textSlide);
  });
  unpaired.forEach((textSlide, i) => {
    const fraction = (i + 1) / (unpaired.length + 1);
    const insertAt = Math.min(combined.length, Math.max(1, Math.round(fraction * combined.length)));
    combined.splice(insertAt, 0, textSlide);
  });

  return { slides: combined, isLongReel };
}

// Shared by both soundtrack slots (the "New reel" builder and the reel
// editor) — a picked-song card, or a debounced search field with results,
// depending on whether `song` is already set.
export function SongSearchField({ song, onPick, onClear, query, onQueryChange, results, searching, placeholder }) {
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

// Toggling the `autoPlay` attribute on a <video> that's already mounted
// doesn't reliably (re)start playback in most browsers — autoplay is only
// honored when the element first attaches with it set. Every slide in both
// reels is mounted up front (just opacity-crossfaded), so the active
// slide's video needs an imperative .play()/.pause() instead.
export function ReelSlideVideo({ url, active, style }) {
  const videoRef = useRef(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (active) { el.currentTime = 0; el.play().catch(() => {}); }
    else el.pause();
  }, [active]);
  return <video ref={videoRef} src={cloudinaryTransform(url, VIDEO_DELIVERY_TRANSFORM)} muted playsInline style={style} />;
}

// Abstract arc (not a real map — no map library/API key needed, and it fits
// the reel's illustrated look better than literal map tiles would) from a
// "Home" dot to the destination, a plane animating along it, then a
// crossfade into that trip's photo. `trip.tripPeople` is already normalized
// (kids and family members merged into one {name, avatar, accent} shape) by
// whoever builds the slide, since this component doesn't need to tell them
// apart. Self-contained caption (shown once the photo crossfade happens) —
// deliberately not lifted via a phase callback, so this component has no
// dependency on how its caller's own UI chrome is laid out.
export function TripSlide({ trip, active, arcMs }) {
  const [phase, setPhase] = useState('arc');
  useEffect(() => {
    if (!active) { setPhase('arc'); return; }
    const t = setTimeout(() => setPhase('photo'), arcMs);
    return () => clearTimeout(t);
  }, [active, arcMs]);

  const isVideo = trip.photo.mediaType === 'video';
  const photoSrc = isVideo ? videoThumbUrl(trip.photo.url, 'so_0,w_1600,q_auto,f_auto') : cloudinaryTransform(trip.photo.url, 'w_1600,q_auto,f_auto');

  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(38,58,44,0.97)', opacity: phase === 'arc' ? 1 : 0, transition: 'opacity 0.8s ease', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ margin: '0 0 14px', fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 15, color: '#fff' }}>
          {new Date(trip.earliestDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
        </p>
        {/* Everyone who actually appears in the trip's own entries — not a
            fixed "family of 4," whoever's kids/authors this trip actually has. */}
        {trip.tripPeople?.length > 0 && (
          <div style={{ display: 'flex', marginBottom: 20 }}>
            {trip.tripPeople.map((person, i) => (
              <div key={i} title={person.name} style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(38,58,44,0.97)', marginLeft: i > 0 ? -10 : 0, background: person.accent || '#4A5E50', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {person.avatar
                  ? <img src={cloudinaryTransform(person.avatar, AVATAR_TRANSFORM_SM)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" loading="lazy" />
                  : <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 13, color: '#fff' }}>{person.name?.charAt(0)}</span>}
              </div>
            ))}
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
          <span style={{ position: 'absolute', left: 276, top: 68 + 12, transform: 'translateX(-50%)', fontSize: 11, color: '#E5C97E', fontFamily: "'Urbanist', sans-serif", fontWeight: 700, whiteSpace: 'nowrap', maxWidth: 120, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis' }}>{trip.destinationLabel}</span>
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
        <div style={{ position: 'absolute', inset: '-10%', backgroundImage: `url('${photoSrc}')`, backgroundSize: 'cover', backgroundPosition: `center ${trip.photo.cropY ?? 50}%`, filter: 'blur(18px) brightness(0.5)', transform: 'scale(1.1)' }} />
        {isVideo ? (
          <ReelSlideVideo url={trip.photo.url} active={active && phase === 'photo'} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, backgroundImage: `url('${photoSrc}')`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }} />
        )}
      </div>
      {phase === 'photo' && trip.photoCaption && (
        <>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 40%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: 64, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.55)', borderRadius: 10, padding: '6px 14px', maxWidth: '86%' }}>
            <p style={{ margin: 0, fontFamily: "'Urbanist', sans-serif", fontSize: 13, fontWeight: 700, color: '#fff', textAlign: 'center' }}>{trip.photoCaption}</p>
          </div>
        </>
      )}
    </>
  );
}

// Text-only letters and notes (no photo) get their own card instead of being
// silently excluded — the reel's one moment built from the family's own
// words, not something an auto-generated photo montage could ever produce.
// Letters get "Dear ___," framing (they're written TO the kid); notes/prompts
// get a quote-mark treatment (they're an observation ABOUT the kid).
export function TextSlide({ slide }) {
  const kidFirst = slide.kidName ?? slide.kid?.name?.split(' ')[0];
  const avatar = slide.kidAvatar ?? slide.kid?.avatar;
  const accent = slide.kidAccent ?? slide.kid?.accent;
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(38,58,44,0.97)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 36px' }}>
      {(avatar || accent || kidFirst) && (
        <div style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', marginBottom: 18, flexShrink: 0, background: accent || '#4A5E50', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {avatar
            ? <img src={cloudinaryTransform(avatar, AVATAR_TRANSFORM_LG)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" loading="lazy" />
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

// Preloads every slide's image/video-thumb on mount so it's already cached
// by the time it becomes active, instead of a possible pop-in on a slow
// connection.
export function useReelImagePreload(slides) {
  useEffect(() => {
    slides.forEach(s => {
      if (s.type === 'text') return;
      const media = s.type === 'trip' ? s.photo : s;
      const src = media.mediaType === 'video' ? videoThumbUrl(media.url, 'so_0,w_1600,q_auto,f_auto') : cloudinaryTransform(media.url, 'w_1600,q_auto,f_auto');
      if (src) { const img = new Image(); img.src = src; }
    });
  }, [slides]);
}

// Count-up animation for the closing card's stat tiles, easing 0 -> real
// value over ~1.4s once the reel actually ends. Deliberately keyed only on
// the boolean trigger, not the stats object itself — a stats object that's a
// fresh literal recomputed on every one of the PARENT's renders (which the
// live reel's is) would otherwise restart this animation on any incidental
// parent re-render, usually before it ever got to visibly count up.
export function useReelCountUpStats(trigger, stats) {
  const [counted, setCounted] = useState({ letters: 0, milestones: 0, photos: 0 });
  useEffect(() => {
    if (!trigger || !stats) return;
    const DURATION = 1400;
    const STEPS = 40;
    const interval = DURATION / STEPS;
    let step = 0;
    const t = setInterval(() => {
      step++;
      const progress = Math.min(step / STEPS, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCounted({
        letters: Math.round((stats.letters || 0) * ease),
        milestones: Math.round((stats.milestones || 0) * ease),
        photos: Math.round((stats.photos || 0) * ease),
      });
      if (step >= STEPS) clearInterval(t);
    }, interval);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  return [counted, setCounted];
}

// The whole audio stack: dual <audio> elements, a shared Web Audio graph
// (iOS Safari — which Chrome-on-iOS also runs on, Apple requires it —
// silently ignores <audio>.volume; only a GainNode's gain is respected
// there), the crossfade from song 1 into song 2 (or a plain fade to silence
// if there's no song 2), song 2's own end-fade, and the proportional
// duration-scaling budget so the whole reel's visual runtime tracks however
// much music is actually available. `holdSong1` lets the caller control
// exactly when song 1 is allowed to start (the live reel waits for its intro
// card to finish; the shared page waits for the visitor's first tap) without
// this hook needing to know why.
export function useReelAudioEngine({ song, song2, totalBaseMs, holdSong1 }) {
  const audioRef = useRef(null);
  const audioRef2 = useRef(null);
  const [showingSong2, setShowingSong2] = useState(false);
  const [audioDuration, setAudioDuration] = useState(null);
  const [audioDuration2, setAudioDuration2] = useState(null);

  const audioCtxRef = useRef(null);
  const gainNodeRef = useRef(null);
  const gainNodeRef2 = useRef(null);
  const fadeFiredRef1 = useRef(false);
  const fadeFiredRef2 = useRef(false);
  const crossfadeTriggeredRef = useRef(false);
  const song1ReadyRef = useRef(!holdSong1);

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

  // Loading each clip (so its duration is known in time to compute
  // durationScale below) happens as soon as it's found. Actually playing
  // song 1 waits for playSong1() to be called (see holdSong1 above). Song 2
  // loads early too (for its duration) but never plays until the crossfade
  // triggers.
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
      if (song1ReadyRef.current) { ensureAudioGraph(); a.play().catch(() => {}); }
    }
  }, [song]);

  useEffect(() => {
    if (song2 && audioRef2.current) {
      const a2 = audioRef2.current;
      a2.crossOrigin = 'anonymous';
      a2.src = song2.previewUrl;
      a2.load();
      // Covers the live reel's case: song 2 is fetched from iTunes async and
      // can still be loading when playSong1() (and its unlock priming, see
      // there) already fired. If song 1 is already underway, this is the
      // next best chance to prime song 2 before the crossfade needs it.
      if (song1ReadyRef.current) a2.play().then(() => a2.pause()).catch(() => {});
    }
  }, [song2]);

  function playSong1() {
    song1ReadyRef.current = true;
    if (audioRef.current?.src) {
      ensureAudioGraph();
      audioRef.current.play().catch(() => {});
      // Safari (desktop and iOS) only allows a media element's *first*
      // play() call to succeed without a fresh user gesture if that first
      // call itself happened synchronously inside a gesture handler — a
      // later call from the crossfade's timeupdate callback doesn't count,
      // and gets silently rejected (swallowed by the .catch below), even
      // though the gain node's UI-driving state flips right on schedule.
      // That produced exactly this bug: the "now playing" artwork switches
      // to song 2 on time, but no audio ever comes out. Priming song 2 here
      // — playing (silent, since its gain is still 0) then immediately
      // pausing it, right inside this same gesture — unlocks it so the real
      // .play() at crossfade time is allowed to actually produce sound.
      const a2 = audioRef2.current;
      if (a2?.src) a2.play().then(() => a2.pause()).catch(() => {});
    }
  }

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
  // Fades the GainNode when the Web Audio graph is up, falling back to
  // element .volume if the graph isn't available for some reason.
  //
  // Fired-flags live in refs (not local closures) so replay() below can
  // reset them — otherwise a replayed track's timeupdate handler would see
  // its fade/crossfade as already-fired from the first playthrough and never
  // trigger again, since the effect that attached it never re-runs.
  function attachEndFade(el, getGain, firedRef) {
    if (!el) return () => {};
    const FADE_TRIGGER_MS = 1800;
    // Some browsers (observed on iOS WebKit) briefly under-report a
    // still-buffering clip's duration before it self-corrects upward.
    // Reading that raw value here could permanently commit to fading way
    // too early on a single bad tick — there's no way to un-fire `firedRef`.
    // Tracking the highest duration ever observed and using that ceiling
    // instead is immune to a downward blip, since a real duration for a
    // fully-declared file only trends up (or holds steady), never
    // legitimately drops.
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

  // Song 1 ending: crossfade into song 2 (if there is one) or just fade to
  // silence — decided once, the first time song 1 nears its own end.
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

  // Song 2 ending — fades to silence near its own end, same as a lone song
  // would. No-ops harmlessly if there's no song 2.
  //
  // Depends on [song2], not []: the shared page gates its whole first render
  // behind an async row fetch (status starts 'loading', with no <audio> tags
  // mounted yet at all), so an empty-deps effect fires once on that very
  // first render with audioRef2.current still null and attachEndFade's
  // `if (!el) return` no-ops it — permanently, since the effect never runs
  // again. Keying it to song2 (null until the fetch resolves, same as the
  // crossfade effect above) makes it re-run once the <audio> element — and a
  // real ref — actually exist. The live reel already renders its <audio>
  // tags synchronously on mount, so this was silently correct there; only
  // the shared page's async gate exposed it.
  useEffect(() => attachEndFade(audioRef2.current, () => gainNodeRef2.current, fadeFiredRef2), [song2]);

  // Stretches (or shrinks) every slide's duration proportionally so the
  // reel's total runtime matches however much music is actually available —
  // otherwise the reel reliably ends with several seconds of a clip never
  // heard, or (for a long reel) runs well past both songs combined, playing
  // its last stretch in total silence. ~29s stands in for song 2's
  // contribution before its own metadata has loaded (the near-universal
  // iTunes preview length, confirmed by checking a range of tracks).
  const FADE_BUFFER_MS = 900;
  const totalAudioMs = useMemo(() => {
    const s1 = audioDuration ? audioDuration * 1000 : 0;
    if (!song2) return s1;
    const s2 = audioDuration2 ? audioDuration2 * 1000 : 29000;
    return s1 + s2;
  }, [audioDuration, audioDuration2, song2]);
  const durationScale = useMemo(() => {
    if (!totalAudioMs || totalBaseMs === 0) return 1;
    const available = totalAudioMs - FADE_BUFFER_MS;
    return available > 0 ? available / totalBaseMs : 1;
  }, [totalAudioMs, totalBaseMs]);

  function pauseAll() { audioRef.current?.pause(); audioRef2.current?.pause(); }
  function resumeActive() {
    audioCtxRef.current?.resume?.().catch(() => {});
    (showingSong2 ? audioRef2.current : audioRef.current)?.play().catch(() => {});
  }

  function replay() {
    setShowingSong2(false);
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

  const activeSong = showingSong2 && song2 ? song2 : song;

  return {
    audioRef, audioRef2,
    audioElementProps: { preload: 'auto', crossOrigin: 'anonymous', onLoadedMetadata: e => setAudioDuration(e.target.duration) },
    audioElementProps2: { preload: 'auto', crossOrigin: 'anonymous', onLoadedMetadata: e => setAudioDuration2(e.target.duration) },
    showingSong2, activeSong, durationScale,
    playSong1, pauseAll, resumeActive, replay,
  };
}

// Caption (for the active photo slide) + "now playing" song credit, pinned
// to the bottom of the screen. Trip and text slides caption themselves
// (TripSlide, TextSlide above) since their content lives on a solid card
// rather than over a photo — only photo slides need this shared strip.
export function ReelBottomBar({ activeSlide, activeSong }) {
  return (
    <div style={{ position: 'relative', zIndex: 1, marginTop: 'auto', padding: '0 20px 32px', textAlign: 'center' }}>
      {activeSlide?.type === 'photo' && activeSlide?.caption && (
        <p key={activeSlide.url} style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', margin: '0 0 10px', letterSpacing: 1, textTransform: 'uppercase', animation: 'captionIn 0.5s ease forwards' }}>
          {activeSlide.caption}
        </p>
      )}
      {activeSong && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
          <img src={activeSong.artworkUrl} style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0 }} alt="" loading="lazy" />
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{activeSong.name} — {activeSong.artist}</p>
        </div>
      )}
    </div>
  );
}

// The monthly recap closing card — quote, stat tiles (count-up), replay,
// optional share button, and a primary action that's a button on the live
// reel ("Keep going", closes back to the app) or a link on the shared page
// ("Start your own family journal", since there's no app to return to).
export function MonthlyClosingCard({ monthLabel, quote, stats, countedStats, onShare, onSave, saved, savingSave, saveToast, onReplay, primaryAction, onStatClick }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#1E2A1E', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '0 32px' }}>
      {saveToast && (
        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(44,56,40,0.92)', color: '#fff', fontSize: 13, fontWeight: 500, padding: '8px 16px', borderRadius: 20, zIndex: 51, whiteSpace: 'nowrap', pointerEvents: 'none', fontFamily: "'Urbanist', sans-serif" }}>
          {saveToast}
        </div>
      )}
      {/* Right-to-left so close sits outermost, then share, then save — each
          slot 44px apart (36px button + 8px gap). Close only appears for the
          live in-app reel (primaryAction.onClick) — the shared public page
          has no "close" to go to, it keeps its own full-width CTA below
          instead. */}
      {[
        primaryAction?.onClick && { key: 'close', onClick: primaryAction.onClick, icon: 'ti-x', label: 'Close' },
        onShare && { key: 'share', onClick: onShare, icon: 'ti-share-2', label: 'Share' },
        onSave && { key: 'save', onClick: onSave, disabled: savingSave, icon: saved ? 'ti-bookmark-filled' : 'ti-bookmark', label: saved ? 'Remove from Keepsakes' : 'Save to Keepsakes', color: saved ? '#C8993E' : '#fff' },
      ].filter(Boolean).map((btn, i) => (
        <button
          key={btn.key}
          onClick={btn.onClick}
          disabled={btn.disabled}
          aria-label={btn.label}
          style={{ position: 'absolute', top: 16, right: 16 + i * 44, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: btn.disabled ? 'default' : 'pointer', opacity: btn.disabled ? 0.6 : 1, color: btn.color || '#fff', fontSize: 16 }}
        >
          <i className={`ti ${btn.icon}`} />
        </button>
      ))}
      <p className="fade-up" style={{ fontSize: 11, fontWeight: 700, color: 'rgba(200,153,62,0.8)', letterSpacing: 1.6, textTransform: 'uppercase', margin: '0 0 16px', animationDelay: '0ms' }}>{monthLabel}</p>
      <h1 className="fade-up" style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: '#fff', textAlign: 'center', margin: '0 0 6px', lineHeight: 1.35, animationDelay: '120ms' }}>
        "{quote}"
      </h1>
      <p className="fade-up" style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.3)', textAlign: 'center', margin: '0 0 32px', letterSpacing: 0.5, animationDelay: '220ms' }}>
        — C.S. Lewis
      </p>

      <div className="fade-up" style={{ display: 'flex', gap: 12, width: '100%', marginBottom: 40, animationDelay: '340ms' }}>
        <div
          onClick={onStatClick ? () => onStatClick(null) : undefined}
          style={{ flex: 1, background: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 12px', textAlign: 'center', cursor: onStatClick ? 'pointer' : undefined }}
        >
          <p style={{ fontSize: 36, fontWeight: 800, color: '#C8993E', margin: '0 0 4px', lineHeight: 1 }}>{countedStats.letters}</p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: 0, fontWeight: 600 }}>letter{stats.letters !== 1 ? 's' : ''}</p>
        </div>
        {stats.milestones > 0 && (
          <div
            onClick={onStatClick ? () => onStatClick('milestones') : undefined}
            style={{ flex: 1, background: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 12px', textAlign: 'center', cursor: onStatClick ? 'pointer' : undefined }}
          >
            <p style={{ fontSize: 36, fontWeight: 800, color: '#C8993E', margin: '0 0 4px', lineHeight: 1 }}>{countedStats.milestones}</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: 0, fontWeight: 600 }}>milestone{stats.milestones !== 1 ? 's' : ''}</p>
          </div>
        )}
        {stats.photos > 0 && (
          <div
            onClick={onStatClick ? () => onStatClick('photos') : undefined}
            style={{ flex: 1, background: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 12px', textAlign: 'center', cursor: onStatClick ? 'pointer' : undefined }}
          >
            <p style={{ fontSize: 36, fontWeight: 800, color: '#C8993E', margin: '0 0 4px', lineHeight: 1 }}>{countedStats.photos}</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: 0, fontWeight: 600 }}>photo{stats.photos !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>

      <button onClick={onReplay} className="fade-up" style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: 22, marginBottom: 20, animationDelay: '480ms' }}>
        <i className="ti ti-player-play-filled" style={{ marginLeft: 2 }} />
      </button>

      {/* Live in-app reel closes via the X at top right instead of a bottom
          button now — this link-only CTA is left for the shared public page,
          which has no app to close back into. */}
      {primaryAction.href && (
        <a href={primaryAction.href} className="btn btn-gold fade-up" style={{ border: 'none', borderRadius: 14, padding: '15px 40px', fontSize: 15, fontWeight: 700, fontFamily: "'Urbanist', sans-serif", animationDelay: '560ms', textDecoration: 'none', display: 'inline-block', textAlign: 'center' }}>
          {primaryAction.label}
        </a>
      )}
    </div>
  );
}
