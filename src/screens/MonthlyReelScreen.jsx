import { useState, useEffect, useMemo, useRef } from 'react';
import { cloudinaryTransform } from '../constants.js';
import { supabase } from '../supabase.js';
import {
  TRIP_ARC_MS, MIN_TEXT_READ_MS,
  videoThumbUrl, slideDurationMs, ReelSlideVideo, TripSlide, TextSlide,
  useReelImagePreload, useReelCountUpStats, useReelAudioEngine,
  ReelBottomBar, MonthlyClosingCard,
  buildReelCandidates, resolveSlideRefs, autoSampleSlides, seededRandom,
} from './reelShared.jsx';

// Quiet, reflective, warm — the mood a family looks back through a month or a
// trip with. Auto-picked (not user-chosen) songs are drawn from here instead
// of two fixed tracks, so reels stop sounding identical to each other. Each
// entry's `pick` mirrors the old inline fallback chain: prefer the specific
// artist+track, then just the track name, then whatever iTunes returned.
const SONG_POOL = [
  {
    search: 'landslide andie case',
    pick: rs => rs.find(r => /andie case/i.test(r.artistName) && /landslide/i.test(r.trackName))
      || rs.find(r => /landslide/i.test(r.trackName)) || rs[0],
  },
  {
    search: 'hollow coves coastline',
    pick: rs => rs.find(r => /hollow coves/i.test(r.artistName) && /^coastline$/i.test(r.trackName))
      || rs.find(r => /hollow coves/i.test(r.artistName) && /coastline/i.test(r.trackName))
      || rs.find(r => /coastline/i.test(r.trackName)) || rs[0],
  },
  {
    search: 'such great heights iron and wine',
    pick: rs => rs.find(r => /iron.*wine/i.test(r.artistName) && /such great heights/i.test(r.trackName))
      || rs.find(r => /such great heights/i.test(r.trackName)) || rs[0],
  },
  {
    search: 'happiest year jaymes young',
    pick: rs => rs.find(r => /jaymes young/i.test(r.artistName) && /happiest year/i.test(r.trackName))
      || rs.find(r => /happiest year/i.test(r.trackName)) || rs[0],
  },
  {
    search: "i don't want to miss a thing mary bragg",
    pick: rs => rs.find(r => /mary bragg/i.test(r.artistName) && /miss a thing/i.test(r.trackName))
      || rs.find(r => /miss a thing/i.test(r.trackName)) || rs[0],
  },
  {
    search: 'forever young alphaville',
    pick: rs => rs.find(r => /^alphaville$/i.test(r.artistName) && /^forever young$/i.test(r.trackName))
      || rs.find(r => /alphaville/i.test(r.artistName) && /forever young/i.test(r.trackName)) || rs[0],
  },
  {
    search: 'iris goo goo dolls',
    pick: rs => rs.find(r => /goo goo dolls/i.test(r.artistName) && /^iris$/i.test(r.trackName))
      || rs.find(r => /goo goo dolls/i.test(r.artistName) && /iris/i.test(r.trackName)) || rs[0],
  },
  {
    search: 'rhianne somewhere only we know',
    pick: rs => rs.find(r => /^rhianne$/i.test(r.artistName) && /somewhere only we know/i.test(r.trackName))
      || rs.find(r => /somewhere only we know/i.test(r.trackName)) || rs[0],
  },
  {
    search: 'better together jack johnson',
    pick: rs => rs.find(r => /^jack johnson$/i.test(r.artistName) && /^better together$/i.test(r.trackName))
      || rs.find(r => /jack johnson/i.test(r.artistName) && /better together/i.test(r.trackName)) || rs[0],
  },
];

async function fetchPoolSong(spec) {
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(spec.search)}&entity=song&limit=15`);
    const data = await res.json();
    const results = (data.results || []).filter(r => r.previewUrl);
    const pick = spec.pick(results);
    if (pick) return { name: pick.trackName, artist: pick.artistName, artworkUrl: pick.artworkUrl100, previewUrl: pick.previewUrl };
  } catch {}
  return null;
}

const RECAP_QUOTE = "Isn't it funny how day by day nothing changes, but when you look back, everything is different.";

function MonthlyReelScreen({ entries, kids, familyMembers = [], startDate, endDate, monthLabel, stats, reelType = 'monthly', customSong = null, customSong2 = null, forceLongReel = null, reelId = null, slideRefs = null, onAutoPickSong, onClose, onGenerateReelShare, onRevokeReelShare, onSaveReel, onUnsaveReel, onStatClick }) {
  // The same full, unbudgeted candidate pool the reel editor uses — a frozen
  // reel (slideRefs below) resolves its exact saved picks against this; an
  // auto-built one (slideRefs null) samples/budgets from it exactly as before.
  const candidates = useMemo(() => buildReelCandidates(entries, kids, familyMembers, startDate, endDate), [entries, kids, familyMembers, startDate, endDate]);
  const trip = candidates.trip;

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
    const auto = autoSampleSlides(candidates, { forceLongReel, reelId });
    // Once a reel has been through the editor, slideRefs is the definitive,
    // user-arranged list — resolved against the live candidates above (so a
    // crop change or caption still updates), but the set and order are
    // exactly what was saved, not re-sampled.
    if (slideRefs != null) {
      return { slides: resolveSlideRefs(slideRefs, candidates, trip), isLongReel: auto.isLongReel };
    }
    return auto;
  }, [candidates, trip, forceLongReel, reelId, slideRefs]);

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

  // A text slide's real floor (MIN_TEXT_READ_MS, applied post-scale in
  // slideDurationMs below) has to be reserved here too, or the audio-matching
  // scale gets computed against a total that undercounts how long text slides
  // actually end up on screen — reels with letters would then run visibly
  // longer than the music that was sized to cover them.
  const totalBaseMs = useMemo(() => slides.reduce((sum, s) => sum + (s.type === 'text' ? Math.max(s.durationMs, MIN_TEXT_READ_MS) : s.durationMs), 0), [slides]);
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

  // Which pool entries this reel draws for song 1 / song 2 — same
  // saved-vs-unsaved rule as the photo shuffle above: an unsaved reel gets a
  // fresh random pick every time it's opened, while a saved reel (reelId
  // known) seeds off its own row id so it always lands on the same two songs
  // on reopen. Song 2's draw excludes whatever song 1 picked so a long reel
  // never doubles up on the same track.
  const song1Index = useMemo(() => {
    const rng = reelId != null ? seededRandom(`song1-${reelId}`) : Math.random;
    return Math.floor(rng() * SONG_POOL.length);
  }, [reelId]);
  const song2Index = useMemo(() => {
    const rng = reelId != null ? seededRandom(`song2-${reelId}`) : Math.random;
    const idx = Math.floor(rng() * SONG_POOL.length);
    return (idx === song1Index && SONG_POOL.length > 1) ? (idx + 1) % SONG_POOL.length : idx;
  }, [reelId, song1Index]);

  // Background music — same iTunes preview-clip approach as the birthday
  // reel (a real, legally-served preview, not a hosted copy of the track).
  // Skipped entirely when the caller already supplied a customSong (a
  // custom-range reel the user picked their own soundtrack for, or a saved
  // reel reopening with whatever it already froze) — that's used as-is
  // instead. A saved reel (reelId known) that auto-picks here reports the
  // result back via onAutoPickSong so it's written into the saved row and
  // never has to be re-derived from the pool again — same permanence as the
  // slides themselves, not just a reproducible-for-now seeded guess.
  useEffect(() => {
    if (customSong) return;
    let cancelled = false;
    fetchPoolSong(SONG_POOL[song1Index]).then(result => {
      if (!result || cancelled) return;
      setSong(result);
      if (reelId != null) onAutoPickSong?.('song', result);
    });
    return () => { cancelled = true; };
  }, [customSong, song1Index]);

  // Second song — only fetched for a long reel (rich month, or a custom range
  // reel the user explicitly built at 1 minute), so a short reel never pays
  // for an API call it won't use. Skipped when the caller already supplied a
  // customSong2 — the user picked their own second soundtrack, or a saved
  // reel reopening with what it already froze. Same write-back as song 1.
  useEffect(() => {
    if (!isLongReel || customSong2) return;
    let cancelled = false;
    fetchPoolSong(SONG_POOL[song2Index]).then(result => {
      if (!result || cancelled) return;
      setSong2(result);
      if (reelId != null) onAutoPickSong?.('song2', result);
    });
    return () => { cancelled = true; };
  }, [isLongReel, customSong2, song2Index]);

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
    const result = await onSaveReel({ song, song2: isLongReel ? song2 : null });
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
          <p style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: 44, fontWeight: 700, margin: 0, lineHeight: 1.25, textAlign: 'center', padding: '0 24px', background: 'linear-gradient(90deg, #fff 20%, rgba(200,153,62,0.95) 50%, #fff 80%)', backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', animation: 'shimmer 2.8s linear infinite' }}>
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
