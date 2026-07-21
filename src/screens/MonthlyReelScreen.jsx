import { useState, useEffect, useMemo, useRef } from 'react';
import { cloudinaryTransform, exactAgeLabel } from '../constants.js';
import { supabase } from '../supabase.js';
import {
  PHOTO_SLIDE_MS, TRIP_ARC_MS,
  videoThumbUrl, slideDurationMs, ReelSlideVideo, TripSlide, TextSlide,
  useReelImagePreload, useReelCountUpStats, useReelAudioEngine,
  ReelBottomBar, MonthlyClosingCard,
} from './reelShared.jsx';

// "{kid} · {age} old · {date}" — used both for the live caption bar and
// (precomputed into a plain string) for the shared payload, so both render
// from the exact same field instead of the shared page recomputing it from
// data it doesn't have.
function captionFor(kid, date) {
  if (!kid || !date) return null;
  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return `${kid.name?.split(' ')[0]} · ${exactAgeLabel(kid.birthdate, date)} old · ${dateLabel}`;
}

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
  // trip" rather than spotlighting a single person. Normalized into one
  // {name, avatar, accent} shape since TripSlide doesn't need to tell kids
  // and family members apart.
  const tripKidIds = new Set(tripEntries.flatMap(e => e.kids || []));
  const tripAuthorIds = new Set(tripEntries.map(e => e.userId).filter(Boolean));
  const tripKids = kids.filter(k => tripKidIds.has(k.id));
  const tripFamilyMembers = familyMembers.filter(m => tripAuthorIds.has(m.user_id));
  const tripPeople = [
    ...tripKids.map(k => ({ name: k.name, avatar: k.avatar, accent: k.accent })),
    ...tripFamilyMembers.map(m => ({ name: m.real_name || m.display_name || 'Family', avatar: m.avatar_url, accent: '#4A5E50' })),
  ];
  const photoKid = kids.find(k => farthest.kids.includes(k.id));

  return {
    type: 'trip',
    date: earliestDate,
    earliestDate,
    destLat: farthest.locationLat,
    destLng: farthest.locationLng,
    destinationLabel: farthest.location || 'somewhere new',
    distanceMiles,
    photo: { url: photo.url, mediaType: photo.type, cropY: farthest.cropY ?? 50 },
    photoCaption: captionFor(photoKid, farthest.date),
    tripPeople,
    tripEntryIds: new Set(tripEntries.map(e => e.id)),
    durationMs: TRIP_ARC_MS + PHOTO_SLIDE_MS,
  };
}

const RECAP_QUOTE = "Isn't it funny how day by day nothing changes, but when you look back, everything is different.";

function MonthlyReelScreen({ entries, kids, familyMembers = [], startDate, endDate, monthLabel, stats, reelType = 'monthly', customSong = null, customSong2 = null, forceLongReel = null, onClose, onGenerateReelShare, onRevokeReelShare, onSaveReel, onUnsaveReel, onStatClick }) {
  const monthEntries = useMemo(() => monthEntriesFor(entries, startDate, endDate), [entries, startDate, endDate]);
  const monthTextEntries = useMemo(() => monthTextEntriesFor(entries, startDate, endDate), [entries, startDate, endDate]);

  // Home is computed from ALL entries (a stable, long-term thing), not just
  // this month's — otherwise a month with only trip photos would have
  // nothing to compare distance against.
  const homePt = useMemo(() => findHomePoint(entries), [entries]);
  const trip = useMemo(() => findTripThisMonth(monthEntries, homePt, kids, familyMembers), [monthEntries, homePt, kids, familyMembers]);

  // The stored location is often a specific address/place name — reverse
  // geocode to "City, State" for the arc label instead. Routed through the
  // reverse-geocode edge function rather than calling Google directly: the
  // Geocoding API rejects referrer-restricted keys (the only kind safe to
  // ship in a client bundle), so this has to happen server-side. Resolves
  // after `trip` is already built, so it's merged in at render/share time
  // rather than baked into the trip object itself.
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
        photoCandidates.push({ type: 'photo', url: m.url, mediaType: m.type, date: e.date, cropY: e.cropY ?? 50, kid, caption: captionFor(kid, e.date), entryId: e.id, durationMs: PHOTO_SLIDE_MS });
      }
    }
    // A rich month earns a second song and a bigger photo budget instead of
    // stretching a handful of photos to fill 60 seconds, or repeating itself.
    // A custom-range reel skips this guess entirely — the user picked "30
    // seconds" or "1 minute" explicitly, via forceLongReel.
    const isLongReel = forceLongReel != null ? forceLongReel : photoCandidates.length >= LONG_REEL_MEDIA_THRESHOLD;
    const MAX_PHOTO_SLIDES = isLongReel ? LONG_MAX_PHOTO_SLIDES : SHORT_MAX_PHOTO_SLIDES;
    const tripCandidates = trip ? [trip] : [];

    // Letters and notes/prompts, photo attached or not — capped low (unlike
    // photos/videos) since reading text takes real time and this is meant as
    // a moment, not the reel's main content.
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
        kidName: kid?.name?.split(' ')[0] || null,
        kidAvatar: kid?.avatar || null,
        kidAccent: kid?.accent || null,
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

    // Videos and letters are the guaranteed content (all videos above; up to
    // MAX_TEXT_SLIDES letters below) — plain photos are the filler, so which
    // ones make the cut is randomized rather than picked by a fixed stride,
    // instead of the same evenly-spaced photos showing up every time a reel
    // for this range is regenerated.
    function sampleRandom(arr, n) {
      if (arr.length <= n) return arr;
      const shuffled = arr.slice().sort(() => Math.random() - 0.5);
      return shuffled.slice(0, n);
    }

    // A trip is "a bigger deal" — its photos get first claim on roughly half
    // the image budget (or all of them, if there are fewer) instead of being
    // sampled alongside the rest of the range on equal footing. The remaining
    // budget is filled randomly from the rest.
    let keptImages;
    if (trip) {
      const tripImages = imageSlides.filter(s => trip.tripEntryIds.has(s.entryId));
      const otherImages = imageSlides.filter(s => !trip.tripEntryIds.has(s.entryId));
      const tripBudget = Math.min(tripImages.length, Math.ceil(imageBudget / 2));
      const otherBudget = Math.max(0, imageBudget - tripBudget);
      keptImages = [...sampleRandom(tripImages, tripBudget), ...sampleRandom(otherImages, otherBudget)];
    } else {
      keptImages = sampleRandom(imageSlides, imageBudget);
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
  }, [monthEntries, monthTextEntries, kids, trip, forceLongReel]);

  const [index, setIndex] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  const [introFading, setIntroFading] = useState(false);
  const [ended, setEnded] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [freezeFrame, setFreezeFrame] = useState(false);
  const [song, setSong] = useState(customSong);
  const [song2, setSong2] = useState(customSong2);
  const [slideshowPaused, setSlideshowPaused] = useState(false);
  const [showPauseHint, setShowPauseHint] = useState(false);
  const [slideProgress, setSlideProgress] = useState(0);
  const slideElapsedMsRef = useRef(0);
  const [shareToken, setShareToken] = useState(null);
  const [shareId, setShareId] = useState(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [shareError, setShareError] = useState(false);
  const [savingReel, setSavingReel] = useState(false);
  const [savedReel, setSavedReel] = useState(false);
  const [savedReelId, setSavedReelId] = useState(null);
  const [saveToast, setSaveToast] = useState(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  const [countedStats, setCountedStats] = useReelCountUpStats(showStats, stats);

  const totalBaseMs = useMemo(() => slides.reduce((sum, s) => sum + s.durationMs, 0), [slides]);
  // Music intentionally does NOT start during the intro card — holding it
  // back gives the cover card room to breathe instead of feeling rushed by a
  // countdown that's already ticking; playSong1() is called once the card
  // fades out, so it starts exactly in sync with the first slide.
  const {
    audioRef, audioRef2, audioElementProps, audioElementProps2,
    showingSong2, activeSong, durationScale,
    playSong1, pauseAll, resumeActive, replay: replayAudio,
  } = useReelAudioEngine({ song, song2: isLongReel ? song2 : null, totalBaseMs, holdSong1: true });

  const currentSlide = slides[index];
  const slideDuration = slideDurationMs(currentSlide, durationScale);

  useReelImagePreload(slides);

  // Intro card
  useEffect(() => {
    const t1 = setTimeout(() => setIntroFading(true), 2600);
    const t2 = setTimeout(() => { setShowIntro(false); playSong1(); }, 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Background music — same iTunes preview-clip approach as the birthday
  // reel (a real, legally-served preview, not a hosted copy of the track):
  // Landslide, Andie Case's cover specifically. Skipped entirely when the
  // caller already supplied a customSong (a custom-range reel the user
  // picked their own soundtrack for) — that's used as-is instead.
  useEffect(() => {
    if (customSong) return;
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
  }, [customSong]);

  // Second song — only fetched for a long reel (rich month, or a custom range
  // reel the user explicitly built at 1 minute), so a short reel never pays
  // for an API call it won't use. Coastline, Hollow Coves — pairs with
  // Landslide's tone (both quiet and reflective). The track itself is titled
  // "Coastline" (singular), not "Coastlines". Skipped when the caller already
  // supplied a customSong2 — the user picked their own second soundtrack.
  useEffect(() => {
    if (!isLongReel || customSong2) return;
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
  }, [isLongReel, customSong2]);

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

  function handleTapPause() {
    const next = !slideshowPaused;
    setSlideshowPaused(next);
    if (next) pauseAll(); else resumeActive();
    setShowPauseHint(true);
    setTimeout(() => setShowPauseHint(false), 900);
  }

  function replay() {
    setIndex(0);
    setEnded(false);
    setShowStats(false);
    setFreezeFrame(false);
    setCountedStats({ letters: 0, milestones: 0, photos: 0 });
    setSlideshowPaused(false);
    setShowPauseHint(false);
    replayAudio();
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
      song2: isLongReel ? (song2 || null) : null,
      // Whole family, not just whoever happens to show up in this month's
      // slides — this is "whose reel is this" for a visitor who hasn't
      // watched anything yet, not a cast list of who appears in it.
      family: [
        ...kids.map(k => ({ name: k.name, avatar: k.avatar, accent: k.accent })),
        ...familyMembers.map(m => ({ name: m.real_name || m.display_name || 'Family', avatar: m.avatar_url, accent: null })),
      ],
      slides: slides.map(s => {
        if (s.type === 'trip') {
          return {
            type: 'trip', durationMs: s.durationMs,
            earliestDate: s.earliestDate,
            distanceMiles: s.distanceMiles,
            destinationLabel: tripDestLabel || s.destinationLabel,
            photo: s.photo,
            photoCaption: s.photoCaption,
            tripPeople: s.tripPeople,
          };
        }
        if (s.type === 'text') {
          return { type: 'text', durationMs: s.durationMs, subtype: s.subtype, text: s.text, date: s.date, kidName: s.kidName, kidAvatar: s.kidAvatar, kidAccent: s.kidAccent };
        }
        return { type: 'photo', durationMs: s.durationMs, url: s.url, mediaType: s.mediaType, cropY: s.cropY, date: s.date, caption: s.caption };
      }),
    };
  }

  async function handleShare() {
    if (!onGenerateReelShare || shareBusy) return;
    setShareBusy(true);
    setShareError(false);
    const result = await onGenerateReelShare({ reelType, title: monthLabel, payload: buildSharePayload() });
    if (result) { setShareToken(result.share_token); setShareId(result.id); }
    else setShareError(true);
    setShareBusy(false);
  }

  // Only a live monthly reel needs this — a custom-range reel opened from
  // Keepsakes → Reels is by definition already saved (that's where it came
  // from); a monthly reel otherwise has no way to be revisited directly
  // without re-navigating Recap's month picker.
  async function handleToggleSaveReel() {
    if (!onSaveReel || savingReel) return;
    if (savedReel) {
      setSavingReel(true);
      await onUnsaveReel?.(savedReelId);
      setSavingReel(false);
      setSavedReel(false);
      setSavedReelId(null);
      setSaveToast('Removed from Keepsakes');
      setTimeout(() => setSaveToast(null), 1800);
      return;
    }
    setSavingReel(true);
    const result = await onSaveReel();
    setSavingReel(false);
    if (result) {
      setSavedReel(true);
      setSavedReelId(result.id);
      setSaveToast('Saved to Keepsakes');
      setTimeout(() => setSaveToast(null), 1800);
    }
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
              {i === index && <TripSlide trip={{ ...s, destinationLabel: tripDestLabel || s.destinationLabel }} active={isActive && !slideshowPaused} arcMs={TRIP_ARC_MS * durationScale} />}
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

      {!showStats && <ReelBottomBar activeSlide={currentSlide} activeSong={activeSong} />}

      {/* Opening title card */}
      {showIntro && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 9, background: 'rgba(38,58,44,0.97)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', transition: 'opacity 0.6s ease', opacity: introFading ? 0 : 1 }}>
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 13, color: 'rgba(200,153,62,0.75)', margin: '0 0 16px', letterSpacing: 0.5 }}>
            {reelType === 'range' ? 'Patina' : 'Your month with Patina'}
          </p>
          <p style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 44, fontWeight: 700, margin: 0, lineHeight: 1.25, textAlign: 'center', padding: '0 24px', background: 'linear-gradient(90deg, #fff 20%, rgba(200,153,62,0.95) 50%, #fff 80%)', backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', animation: 'shimmer 2.8s linear infinite' }}>
            {monthLabel}
          </p>
        </div>
      )}

      {/* Closing card — the exact monthly recap card that normally pops up on its own,
          just reached via the reel instead of standing alone. */}
      {showStats && stats && (
        <MonthlyClosingCard
          monthLabel={monthLabel}
          quote={RECAP_QUOTE}
          stats={stats}
          countedStats={countedStats}
          onShare={onGenerateReelShare ? () => setShowShareSheet(true) : null}
          onSave={onSaveReel ? handleToggleSaveReel : null}
          saved={savedReel}
          savingSave={savingReel}
          saveToast={saveToast}
          onReplay={replay}
          primaryAction={{ label: 'Keep going', onClick: onClose }}
          onStatClick={onStatClick}
        />
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

      <audio ref={audioRef} {...audioElementProps} />
      <audio ref={audioRef2} {...audioElementProps2} />
    </div>
  );
}

export default MonthlyReelScreen;
