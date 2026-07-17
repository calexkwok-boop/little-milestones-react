import { useState, useEffect, useMemo, useRef } from 'react';
import { cloudinaryTransform, AMAZON_GIFT_FALLBACK_URL } from '../constants.js';

const SLIDESHOW_DURATION = 50700;

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

function ordinal(n) {
  const s = ['th','st','nd','rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function AmazonIcon({ size = 13, aColor = 'currentColor', arrowColor = '#FF9900', style }) {
  return (
    <svg width={size} height={size * (38 / 32)} viewBox="0 0 32 38" fill="none" style={{ display: 'inline-block', flexShrink: 0, ...style }}>
      <text x="16" y="24" textAnchor="middle" fontFamily="Arial, 'Helvetica Neue', Helvetica, sans-serif" fontWeight="800" fontSize="30" fill={aColor} style={{ transform: 'scaleY(1.1) scaleX(0.88)', transformOrigin: '16px 12px' }}>a</text>
      <path d="M3 30 C 9 36.5 23 36.5 29 29" stroke={arrowColor} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M24 27 L29.5 28.8 L26 35.5" stroke={arrowColor} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BirthdaySlideshowScreen({ kid, age, entries, onClose, isFriend = false, viewerEntries = [], viewerKids = [], onGenerateReelShare, onRevokeReelShare, onStatClick, kids = [], familyMembers = [] }) {
  const slides = useMemo(() => {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const uniqueEntries = [...new Map(entries.map(e => [e.id, e])).values()]
      .filter(e => e.kids.includes(kid.id) && e.media?.length);

    function collectMedia(pool) {
      const seen = new Set();
      const out = [];
      for (const e of pool) {
        for (const m of e.media) {
          if (seen.has(m.url)) continue;
          seen.add(m.url);
          out.push({ url: m.url, type: m.type, date: e.date, cropY: e.cropY ?? 50 });
        }
      }
      return { out, seen };
    }

    // Prefer photos from the past year (this is a "year in review" recap), but if this kid has
    // no photos from the last 12 months, fall back to all-time rather than showing an empty
    // slideshow — some photos beat "no photos yet" when photos genuinely exist.
    const recentEntries = uniqueEntries.filter(e => new Date(e.date + 'T12:00:00') >= oneYearAgo);
    const { out: result, seen } = collectMedia(recentEntries.length > 0 ? recentEntries : uniqueEntries);

    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    // TEST VIDEO — remove after testing
    const testVideo = uniqueEntries.flatMap(e => (e.media || []).filter(m => m.type === 'video').map(m => ({ url: m.url, type: 'video', date: e.date, cropY: e.cropY ?? 50 }))).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (testVideo && !seen.has(testVideo.url)) result.unshift(testVideo);
    return result.slice(0, 9);
  }, [entries, kid.id]);

  const slideInterval = slides.length > 0 ? Math.floor(SLIDESHOW_DURATION / slides.length) : SLIDESHOW_DURATION;

  const yearStats = useMemo(() => {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const yearEntries = entries.filter(e => e.kids.includes(kid.id) && new Date(e.date + 'T12:00:00') >= oneYearAgo);
    return {
      photos: yearEntries.reduce((n, e) => n + (e.media?.filter(m => m.type !== 'video').length || 0), 0),
      letters: yearEntries.filter(e => e.text?.trim()).length,
      milestones: yearEntries.filter(e => e.milestone).length,
    };
  }, [entries, kid.id]);

  const sharedLabel = useMemo(() => {
    if (!isFriend || !viewerKids.length) return '';
    const viewerKidIds = new Set(viewerKids.map(k => k.id));
    const appearedIds = new Set();
    [...viewerEntries, ...entries]
      .filter(e => e.media?.length > 0 && e.kids?.includes(kid.id) && e.kids?.some(id => viewerKidIds.has(id)))
      .forEach(e => e.kids.forEach(id => { if (viewerKidIds.has(id)) appearedIds.add(id); }));
    const viewerNames = viewerKids.filter(k => appearedIds.has(k.id)).map(k => k.name.split(' ')[0]);
    const allNames = [...viewerNames, kid.name.split(' ')[0]];
    const last = allNames[allNames.length - 1];
    const rest = allNames.slice(0, -1);
    const nameStr = rest.length > 0 ? `${rest.join(', ')} & ${last}` : last;
    return `${nameStr} are growing up so fast.`;
  }, [isFriend, viewerEntries, entries, viewerKids, kid]);

  const sharedPhotos = useMemo(() => {
    if (!isFriend || !viewerKids.length) return [];
    const viewerKidIds = new Set(viewerKids.map(k => k.id));
    const seen = new Set();
    return [...viewerEntries, ...entries]
      .filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; })
      .filter(e => e.media?.length > 0 && e.kids?.includes(kid.id) && e.kids?.some(id => viewerKidIds.has(id)))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .flatMap(e => e.media.filter(m => m.type !== 'video').map(m => ({ url: m.url, date: e.date })))
      .slice(0, 10);
  }, [isFriend, viewerEntries, entries, viewerKids, kid.id]);


  const [index, setIndex] = useState(0);
  const [ended, setEnded] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [countedStats, setCountedStats] = useState({ photos: 0, letters: 0, milestones: 0 });
  const [song, setSong] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [introFading, setIntroFading] = useState(false);
  const [slideshowPaused, setSlideshowPaused] = useState(false);
  const [showPauseHint, setShowPauseHint] = useState(false);
  const [slideResetKey, setSlideResetKey] = useState(0);
  const audioRef = useRef(null);
  const audioRef2 = useRef(null);
  const crossfadeTriggeredRef = useRef(false);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const [song2, setSong2] = useState(null);
  const [showingSong2, setShowingSong2] = useState(false);
  const [slideProgress, setSlideProgress] = useState(0);
  const slideElapsedMsRef = useRef(0);
  const [freezeFrame, setFreezeFrame] = useState(false);
  const videoRefs = useRef({});
  const endingRef = useRef(false);
  const [shareToken, setShareToken] = useState(null);
  const [shareId, setShareId] = useState(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [shareError, setShareError] = useState(false);

  const confettiParticles = useMemo(() => Array.from({ length: 24 }, (_, i) => ({
    left: `${6 + (i * 37 + 13) % 84}%`,
    bottom: `${8 + (i * 53 + 7) % 42}%`,
    size: 4 + (i * 3) % 7,
    color: ['#C8993E','#E5C97E','#EAD9BE','rgba(255,255,255,0.85)','#B8D4B8'][i % 5],
    delay: `${((i * 0.17) % 1.4).toFixed(2)}s`,
    dur: `${(1.8 + (i * 0.13) % 1.4).toFixed(2)}s`,
  })), []);

  // Unlock audio context during the mount gesture, then fetch and autoplay
  useEffect(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      ctx.resume();
    } catch {}

    // Preload all slide images so they're cached before display
    slides.forEach(s => {
      const src = s.type === 'video'
        ? videoThumbUrl(s.url, 'so_0,w_1600,q_auto,f_auto')
        : cloudinaryTransform(s.url, 'w_1600,q_auto,f_auto');
      const img = new Image();
      img.src = src;
    });

    async function loadDefault() {
      try {
        const res = await fetch('https://itunes.apple.com/search?term=photograph+ed+sheeran&entity=song&limit=10');
        const data = await res.json();
        const results = (data.results || []).filter(r => r.previewUrl);
        if (results.length > 0) {
          const r = results[0];
          setSong({ name: r.trackName, artist: r.artistName, artworkUrl: r.artworkUrl100, previewUrl: r.previewUrl });
        }
      } catch {}
    }
    async function loadSong2() {
      try {
        const res = await fetch('https://itunes.apple.com/search?term=what+a+wonderful+world&entity=song&limit=10');
        const data = await res.json();
        const results = (data.results || []).filter(r => r.previewUrl);
        if (results.length > 0) {
          const r = results[0];
          setSong2({ name: r.trackName, artist: r.artistName, artworkUrl: r.artworkUrl100, previewUrl: r.previewUrl });
        }
      } catch {}
    }
    loadDefault();
    loadSong2();
  }, []);

  // Intro card: fade in, hold, fade out, then unmount
  useEffect(() => {
    const t1 = setTimeout(() => setIntroFading(true), 4500);
    const t2 = setTimeout(() => setShowIntro(false), 5300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Auto-advance slides, show stats card after last one
  useEffect(() => {
    if (ended || showIntro || slideshowPaused) return;
    // Only one slide (or none) — there's nothing to advance between, but it should still move on
    // to the stats card after a beat instead of sitting there forever.
    if (slides.length <= 1) {
      const t = setTimeout(() => {
        setEnded(true);
        setFreezeFrame(true);
        setTimeout(() => { setFreezeFrame(false); setShowStats(true); }, 2400);
      }, slideInterval);
      return () => clearTimeout(t);
    }
    const t = setInterval(() => {
      try { navigator.vibrate?.(8); } catch {}
      setIndex(i => {
        if (i + 1 >= slides.length) {
          setEnded(true);
          setFreezeFrame(true);
          setTimeout(() => { setFreezeFrame(false); setShowStats(true); }, 2400);
          return i;
        }
        return i + 1;
      });
    }, slideInterval);
    return () => clearInterval(t);
  }, [slides.length, slideInterval, ended, showIntro, slideshowPaused, slideResetKey]);

  // Set src and autoplay when song loads
  useEffect(() => {
    if (song && audioRef.current) {
      audioRef.current.src = song.previewUrl;
      audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
    }
  }, [song]);

  function togglePlay() {
    const a = audioRef.current;
    if (!a || !song) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play().then(() => setPlaying(true)).catch(() => {});
    }
  }

  // Begin fading audio as the last slide appears — long gradual fade over the full slide duration
  useEffect(() => {
    if (index !== slides.length - 1 || slides.length <= 1 || showIntro || ended) return;
    endingRef.current = true;
    const fadeDuration = slideInterval + 2400; // slide duration + freeze-frame
    const STEPS = 60;
    const intervalMs = fadeDuration / STEPS;
    let step = 0;
    const a1 = audioRef.current;
    const a2 = audioRef2.current;
    const vol1 = (a1 && !a1.ended) ? a1.volume : 0;
    const vol2 = (a2 && !a2.ended) ? (a2.volume || 1) : 0;
    const id = setInterval(() => {
      step++;
      const ratio = Math.max(0, 1 - step / STEPS);
      if (a1 && !a1.ended) a1.volume = vol1 * ratio;
      if (a2 && !a2.ended) a2.volume = vol2 * ratio;
      if (step >= STEPS) {
        clearInterval(id);
        a1?.pause();
        a2?.pause();
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [index, slides.length, showIntro, ended, slideInterval]);

  // Count-up animation when stats card appears
  useEffect(() => {
    if (!showStats) return;
    const DURATION = 1400;
    const STEPS = 40;
    const interval = DURATION / STEPS;
    let step = 0;
    const t = setInterval(() => {
      step++;
      const progress = Math.min(step / STEPS, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCountedStats({
        photos: Math.round(yearStats.photos * ease),
        letters: Math.round(yearStats.letters * ease),
        milestones: Math.round(yearStats.milestones * ease),
      });
      if (step >= STEPS) clearInterval(t);
    }, interval);
    return () => clearInterval(t);
  }, [showStats, yearStats.photos, yearStats.letters, yearStats.milestones]);


  // Control video playback for active slide
  useEffect(() => {
    Object.entries(videoRefs.current).forEach(([idx, el]) => {
      if (parseInt(idx) === index && !showIntro) {
        if (slideshowPaused) el.pause();
        else el.play().catch(() => {});
      } else {
        el.pause();
        el.currentTime = 0;
      }
    });
  }, [index, slideshowPaused, showIntro]);

  // Reset progress bar when slide changes
  useEffect(() => {
    slideElapsedMsRef.current = 0;
    setSlideProgress(0);
  }, [index, slideResetKey]);

  // Drive progress bar (pauses correctly with slideshowPaused)
  useEffect(() => {
    if (ended || showIntro || slideshowPaused) return;
    const startTime = Date.now();
    const baseElapsed = slideElapsedMsRef.current;
    const id = setInterval(() => {
      const total = baseElapsed + (Date.now() - startTime);
      slideElapsedMsRef.current = total;
      setSlideProgress(Math.min(1, total / slideInterval));
    }, 50);
    return () => clearInterval(id);
  }, [index, slideResetKey, ended, showIntro, slideshowPaused, slideInterval]);

  function handleTapPause() {
    const nowPaused = !slideshowPaused;
    setSlideshowPaused(nowPaused);
    if (nowPaused) {
      audioRef.current?.pause();
      audioRef2.current?.pause();
    } else {
      const a = audioRef.current;
      if (a && !a.ended) a.play().catch(() => {});
      if (crossfadeTriggeredRef.current && audioRef2.current) audioRef2.current.play().catch(() => {});
    }
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
      setSlideResetKey(k => k + 1);
    } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      handleTapPause();
    }
  }

  function replay() {
    setIndex(0);
    setEnded(false);
    setShowStats(false);
    setCountedStats({ photos: 0, letters: 0, milestones: 0 });
    crossfadeTriggeredRef.current = false;
    endingRef.current = false;
    setShowingSong2(false);
    setSlideshowPaused(false);
    setShowPauseHint(false);
    setSlideResetKey(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.volume = 1;
      audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
    }
    if (audioRef2.current) {
      audioRef2.current.pause();
      audioRef2.current.src = '';
      audioRef2.current.volume = 0;
    }
  }

  function ageAtDate(birthdate, photoDate) {
    const [by, bm, bd] = birthdate.split('-').map(Number);
    const [py, pm, pd] = photoDate.split('-').map(Number);
    let years = py - by, months = pm - bm, days = pd - bd;
    if (days < 0) { months--; days += new Date(py, pm - 1, 0).getDate(); }
    if (months < 0) { years--; months += 12; }
    if (years < 0) return null;
    return `${years}y ${months}m ${days}d`;
  }

  // Only the fields SharedReelScreen actually renders — not full entry
  // objects (internal ids, family_id, etc. have no business in a public row).
  // Caption is precomputed into a string here (same "{age} · {month year}"
  // the live reel builds inline from kid.birthdate) since the shared page
  // never gets the full kid object, just plain per-slide fields.
  function buildSharePayload() {
    return {
      stats: yearStats,
      song,
      // Whole family, same as the monthly reel's payload — "whose reel is
      // this" for a visitor who hasn't watched anything yet, not just the
      // birthday kid.
      family: [
        ...kids.map(k => ({ name: k.name, avatar: k.avatar, accent: k.accent })),
        ...familyMembers.map(m => ({ name: m.real_name || m.display_name || 'Family', avatar: m.avatar_url, accent: null })),
      ],
      slides: slides.map(s => {
        const a = ageAtDate(kid.birthdate, s.date);
        const my = new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        return { type: 'photo', url: s.url, mediaType: s.type, cropY: s.cropY, date: s.date, caption: a ? `${a} · ${my}` : my };
      }),
    };
  }

  async function handleShare() {
    if (!onGenerateReelShare || shareBusy) return;
    setShareBusy(true);
    setShareError(false);
    const result = await onGenerateReelShare({ reelType: 'birthday', title: `Happy ${ordinal(age)} birthday to ${kid.name}!`, payload: buildSharePayload() });
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
        <p style={{ color: '#fff', fontSize: 18, fontFamily: "'Playfair Display', serif", textAlign: 'center', padding: '0 32px' }}>No photos yet for {kid.name}</p>
        <button onClick={onClose} className="btn btn-outline" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)' }}>Close</button>
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', zIndex: 100, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {slides.map((s, i) => {
        const isVideo = s.type === 'video';
        const thumbSrc = videoThumbUrl(s.url, 'so_0,w_1600,q_auto,f_auto');
        const imgSrc = cloudinaryTransform(s.url, 'w_1600,q_auto,f_auto');
        const bgSrc = isVideo ? thumbSrc : imgSrc;
        const kbAnim = `kb${(i % 4) + 1} ${slideInterval}ms ease-in-out forwards`;
        const isActive = !showIntro && i === index;
        return (
          <div key={i} style={{ position: 'absolute', inset: 0, opacity: isActive ? 1 : 0, transition: 'opacity 1.4s ease' }}>
            {/* Blurred background fill */}
            <div style={{ position: 'absolute', inset: '-10%', backgroundImage: `url('${bgSrc}')`, backgroundSize: 'cover', backgroundPosition: `center ${s.cropY}%`, filter: 'blur(18px) brightness(0.5)', transform: 'scale(1.1)' }} />
            {isVideo ? (
              <video
                ref={el => { if (el) videoRefs.current[i] = el; else delete videoRefs.current[i]; }}
                src={s.url}
                muted
                playsInline
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <div style={{ position: 'absolute', inset: 0, backgroundImage: `url('${imgSrc}')`, backgroundSize: 'contain', backgroundPosition: 'center 38%', backgroundRepeat: 'no-repeat', animation: i === index ? kbAnim : 'none' }} />
            )}
          </div>
        );
      })}
      {freezeFrame && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none', animation: 'freezeIn 2.4s ease forwards' }} />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 28%, transparent 55%, rgba(0,0,0,0.75) 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")", opacity: 0.06 }} />
      {/* Pause/play hint */}
      {showPauseHint && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 8, pointerEvents: 'none' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'introOut 0.9s ease forwards' }}>
            <i className={`ti ${slideshowPaused ? 'ti-player-pause' : 'ti-player-play'}`} style={{ fontSize: 26, color: '#fff' }} />
          </div>
        </div>
      )}


      {/* Top bar — branding + actions */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 16px 0' }}>
        {/* Patina branding */}
        <div />
        <button onClick={onClose} style={{ background: 'rgba(0,0,0,0.4)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: 18 }}>
          <i className="ti ti-x" />
        </button>
      </div>

      {/* Stats closing card */}
      {showStats && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(38,58,44,0.97)', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 36px' }}>
          {onGenerateReelShare && (
            <button onClick={() => setShowShareSheet(true)} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: 16, zIndex: 3 }}>
              <i className="ti ti-share-2" />
            </button>
          )}
          {/* Confetti particles */}
          {confettiParticles.map((p, i) => (
            <div key={i} style={{ position: 'absolute', left: p.left, bottom: p.bottom, width: p.size, height: p.size, borderRadius: '50%', background: p.color, animation: `confettiFloat ${p.dur} ease-out ${p.delay} both`, pointerEvents: 'none' }} />
          ))}
          {/* Kid avatar */}
          <div className="fade-up" style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', marginBottom: 20, flexShrink: 0, background: kid.accent || '#4A5E50', display: 'flex', alignItems: 'center', justifyContent: 'center', animationDelay: '0ms', animation: 'fadeUp 0.6s ease both 0ms, avatarGlow 2.2s ease-in-out 0.6s infinite' }}>
            {kid.avatar
              ? <img src={kid.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" loading="lazy" />
              : <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 28, color: '#fff' }}>{kid.name?.charAt(0)}</span>
            }
          </div>
          {!isFriend && (
            <p className="fade-up" style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 15, color: 'rgba(255,255,255,0.45)', margin: '0 0 36px', textAlign: 'center', lineHeight: 1.7, animationDelay: '120ms' }}>
              They might not always show it, but they're lucky to have you.
            </p>
          )}
          <p className="fade-up" style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 26, fontWeight: 700, color: '#fff', margin: '0 0 28px', textAlign: 'center', lineHeight: 1.2, animationDelay: '260ms' }}>
            Happy {ordinal(age)} birthday to {kid.name}!
          </p>
          {!isFriend && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 48 }}>
              {[
                { n: countedStats.photos, real: yearStats.photos, singular: 'moment captured', plural: 'moments captured', icon: 'ti-camera', filter: 'photos' },
                { n: countedStats.letters, real: yearStats.letters, singular: 'letter written', plural: 'letters written', icon: 'ti-feather', filter: null },
                { n: countedStats.milestones, real: yearStats.milestones, singular: 'milestone celebrated', plural: 'milestones celebrated', icon: 'ti-star', filter: 'milestones' },
              ].filter(s => s.real > 0).map(({ n, real, singular, plural, icon, filter }, idx) => (
                <div
                  key={icon}
                  className="fade-up"
                  onClick={onStatClick ? () => onStatClick(filter) : undefined}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, animationDelay: `${400 + idx * 100}ms`, cursor: onStatClick ? 'pointer' : undefined }}
                >
                  <i className={`ti ${icon}`} style={{ fontSize: 18, color: '#C8993E', flexShrink: 0, width: 22, textAlign: 'center' }} />
                  <p style={{ fontFamily: "'Source Serif 4', serif", fontSize: 17, color: 'rgba(255,255,255,0.75)', margin: 0 }}>
                    {n} {n === 1 ? singular : plural}.
                  </p>
                </div>
              ))}
            </div>
          )}
          {sharedPhotos.length > 0 && (
            <div className="fade-up" style={{ marginBottom: 32, animationDelay: '700ms', width: '64%', overflow: 'hidden' }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontStyle: 'italic', color: 'rgba(255,255,255,0.45)', textAlign: 'center', margin: '0 0 10px' }}>{sharedLabel}</p>
              <div style={{ display: 'flex', gap: 8, overflowX: 'scroll', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', paddingBottom: 4, justifyContent: sharedPhotos.length <= 2 ? 'center' : 'flex-start' }}>
                {sharedPhotos.map((p, i) => (
                  <img key={i} src={p.url} alt="" style={{ width: 260, height: 260, flexShrink: 0, borderRadius: 10, objectFit: 'cover', display: 'block', scrollSnapAlign: 'start' }} loading="lazy" />
                ))}
              </div>
            </div>
          )}
          {isFriend && (
            <a
              href={kid.wishlistUrl || AMAZON_GIFT_FALLBACK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="fade-up"
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(200,153,62,0.15)', border: '1px solid rgba(200,153,62,0.4)', borderRadius: 999, padding: '10px 20px', marginBottom: 28, animationDelay: sharedPhotos.length > 0 ? '820ms' : '620ms', textDecoration: 'none' }}
            >
              <AmazonIcon size={17} aColor="#fff" />
              <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 13, fontWeight: 600, color: '#E5C97E' }}>
                {kid.wishlistUrl ? `View ${kid.name.split(' ')[0]}'s wishlist` : 'Shop gift ideas on Amazon'}
              </span>
            </a>
          )}
          <button className="fade-up" onClick={replay} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: 26, animationDelay: sharedPhotos.length > 0 ? '900ms' : '700ms', marginBottom: 48 }}>
            <i className="ti ti-player-play-filled" style={{ marginLeft: 3 }} />
          </button>
          <div style={{ position: 'absolute', bottom: 28, display: 'flex', alignItems: 'center', gap: 6 }}>
            <img src="/quill-no-background.png" style={{ width: 15, height: 15, objectFit: 'contain', opacity: 0.25 }} alt="" loading="lazy" />
            <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 12, color: 'rgba(255,255,255,0.25)', letterSpacing: 0.5 }}>Patina</span>
          </div>
        </div>
      )}

      {/* Bottom */}
      {!showStats && (
        <div style={{ position: 'relative', zIndex: 1, marginTop: 'auto', padding: '0 20px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ textAlign: 'center' }}>
            {slides[index]?.date && (
              <p key={index} style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', margin: '0 0 10px', letterSpacing: 1, textTransform: 'uppercase', animation: 'captionIn 0.5s ease forwards' }}>
                {(() => {
                  const a = ageAtDate(kid.birthdate, slides[index].date);
                  const my = new Date(slides[index].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                  return a ? `${a} · ${my}` : my;
                })()}
              </p>
            )}
            {(song || song2) && (() => { const s = showingSong2 && song2 ? song2 : song; return s ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 8 }}>
                <img src={s.artworkUrl} style={{ width: 22, height: 22, borderRadius: 4, flexShrink: 0 }} alt="" loading="lazy" />
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{s.name} — {s.artist}</p>
              </div>
            ) : null; })()}
          </div>

          {/* Progress bar */}
          <div style={{ height: 3, background: 'rgba(255,255,255,0.2)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#fff', borderRadius: 2, width: `${((index + slideProgress) / slides.length) * 100}%` }} />
          </div>

        </div>
      )}

      {/* Opening title card */}
      {showIntro && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 9, background: 'rgba(38,58,44,0.97)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', animation: introFading ? 'introOut 0.7s ease forwards' : 'introIn 0.8s ease forwards' }}>
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 13, color: 'rgba(200,153,62,0.75)', margin: '0 0 16px', letterSpacing: 0.5 }}>
            {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
          <p style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 56, fontWeight: 700, margin: 0, lineHeight: 1, textAlign: 'center', padding: '0 24px', background: 'linear-gradient(90deg, #fff 20%, rgba(200,153,62,0.95) 50%, #fff 80%)', backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', animation: 'shimmer 2.8s linear infinite' }}>
            {kid.name}
          </p>
          <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,0.45)', margin: '18px 0 0', letterSpacing: 2, textTransform: 'uppercase' }}>
            turns {age} today
          </p>
        </div>
      )}

      <audio ref={audioRef2} />
      <audio
        ref={audioRef}
        onPlay={() => { if (audioRef.current) audioRef.current.volume = 1; setPlaying(true); }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={() => {
          if (endingRef.current) return;
          const a = audioRef.current;
          const a2 = audioRef2.current;
          if (!a || !a.duration) return;
          const remaining = a.duration - a.currentTime;
          if (remaining <= 1 && !crossfadeTriggeredRef.current && a2 && song2) {
            crossfadeTriggeredRef.current = true;
            setShowingSong2(true);
            a2.src = song2.previewUrl;
            a2.volume = 0;
            a2.play().catch(() => {});
          }
          if (crossfadeTriggeredRef.current && a2) {
            a2.volume = Math.min(1, Math.max(0, 1 - remaining));
          }
          if (remaining <= 1) a.volume = Math.max(0, remaining);
        }}
      />

      {showShareSheet && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 60 }} onClick={() => setShowShareSheet(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', width: '100%', padding: '20px 24px 32px' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 20px' }} />
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <i className="ti ti-share-2" style={{ fontSize: 19, color: 'var(--accent)' }} />
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px', textAlign: 'center' }}>Share this reel</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: 1.6, textAlign: 'center' }}>
              Anyone with this link can watch {kid.name.split(' ')[0]}'s birthday reel — no Patina account needed.
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
    </div>
  );
}

export default BirthdaySlideshowScreen;
