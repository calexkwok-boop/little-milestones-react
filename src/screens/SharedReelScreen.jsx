import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../supabase.js';
import { cloudinaryTransform } from '../constants.js';

const SLIDE_MS = 3800;

// Text slides (letter excerpts / note quotes, no photo) need real reading
// time, not the fixed photo-slide duration — same formula as the live reel.
function slideDurationMs(s) {
  if (s?.type !== 'text') return SLIDE_MS;
  const wordCount = (s.text || '').split(/\s+/).length;
  return Math.min(7500, Math.max(4500, 1400 + wordCount * 220));
}

function videoThumbUrl(videoUrl, transforms = 'so_0,q_auto,f_auto') {
  if (!videoUrl || !videoUrl.startsWith('http')) return null;
  if (videoUrl.includes('res.cloudinary.com')) {
    return videoUrl.replace('/video/upload/', `/video/upload/${transforms}/`).replace(/\.[^/.]+$/, '.jpg');
  }
  try {
    const u = new URL(videoUrl);
    return u.origin + u.pathname.replace(/\.[^/.]+$/, '-thumb.jpg') + u.search;
  } catch { return null; }
}

// Toggling the `autoPlay` attribute on an already-mounted <video> doesn't
// reliably (re)start playback in most browsers — autoplay is only honored
// when the element first attaches with it set. Every slide here is mounted
// up front (just opacity-crossfaded), so the active slide's video needs an
// imperative .play()/.pause() instead — same fix as the live reel's
// ReelSlideVideo. Without it, a video slide just freezes on its first frame
// for the whole slide duration, then moves on.
function SharedReelVideo({ url, active, style }) {
  const videoRef = useRef(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (active) { el.currentTime = 0; el.play().catch(() => {}); }
    else el.pause();
  }, [active]);
  return <video ref={videoRef} src={url} muted playsInline style={style} />;
}

// A lighter-weight replay than the live reels — same Ken Burns pan and one
// background track, but a visitor with no account and no prior interaction
// has to tap to start (browsers block audio autoplay without a gesture on a
// fresh page load), and the "at the same age" pairing is shown as a single
// static side-by-side rather than the live reel's sequential video swap, to
// keep this page simple for an anonymous, one-shot viewing.
function SharedReelScreen({ token, effectiveDark }) {
  const theme = effectiveDark ? 'dark' : undefined;
  const [status, setStatus] = useState('loading'); // 'loading' | 'not-found' | 'ready'
  const [reel, setReel] = useState(null); // { reel_type, title, payload }
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [ended, setEnded] = useState(false);
  const audioRef = useRef(null);

  // iOS Safari ignores <audio>.volume entirely — it can be read/written but
  // has no effect on actual output level there, only the hardware volume
  // buttons do. Routing playback through a Web Audio GainNode instead is the
  // standard workaround; the node's gain IS respected on iOS. Falls back to
  // plain .volume elsewhere/if the graph can't be built.
  const audioCtxRef = useRef(null);
  const gainNodeRef = useRef(null);
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
    } catch {}
    audioCtxRef.current?.resume?.().catch(() => {});
  }

  useEffect(() => {
    if (!supabase || !token) { setStatus('not-found'); return; }
    let cancelled = false;
    supabase.rpc('get_shared_reel', { p_token: token }).then(({ data, error }) => {
      if (cancelled) return;
      const row = data?.[0];
      if (error || !row) { setStatus('not-found'); return; }
      setReel(row);
      setStatus('ready');
    });
    return () => { cancelled = true; };
  }, [token]);

  const slides = reel?.payload?.slides || [];

  useEffect(() => {
    if (!started || ended || slides.length === 0) return;
    const t = setTimeout(() => {
      if (index + 1 >= slides.length) setEnded(true);
      else setIndex(i => i + 1);
    }, slideDurationMs(slides[index]));
    return () => clearTimeout(t);
  }, [started, ended, index, slides.length]);

  // Fade the music out over its own last stretch, driven by the clip's real
  // playback position rather than the visual slide schedule — so it never
  // cuts off abruptly even if the two drift out of sync. The fade's own
  // duration is capped to whatever time is actually left (not fixed) —
  // a fixed-length fade routinely lost its final ~200-300ms to the browser's
  // own native end-of-media pause firing first. Same approach as the live reel.
  //
  // Depends on `status`, not `[]`: the <audio> element only exists once the
  // reel has finished loading from Supabase (the loading/not-found screens
  // render without it) — binding once on mount would grab a null ref and
  // never attach the listener at all.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    let fading = false;
    const FADE_TRIGGER_MS = 1800;
    function onTimeUpdate() {
      if (fading || !a.duration || !isFinite(a.duration)) return;
      const remainingMs = (a.duration - a.currentTime) * 1000;
      if (remainingMs > FADE_TRIGGER_MS) return;
      fading = true;
      const fadeDuration = Math.max(300, remainingMs - 60);
      const STEPS = Math.max(6, Math.round(fadeDuration / 60));
      const gain = gainNodeRef.current;
      const startVol = gain ? gain.gain.value : a.volume;
      let step = 0;
      const id = setInterval(() => {
        step++;
        const v = Math.max(0, startVol * (1 - step / STEPS));
        if (gain) gain.gain.value = v; else a.volume = v;
        if (step >= STEPS) { clearInterval(id); a.pause(); }
      }, fadeDuration / STEPS);
    }
    a.addEventListener('timeupdate', onTimeUpdate);
    return () => a.removeEventListener('timeupdate', onTimeUpdate);
  }, [status]);

  function handleStart() {
    setStarted(true);
    const song = reel?.payload?.song;
    if (song && audioRef.current) {
      const a = audioRef.current;
      // crossOrigin is already set via the JSX attribute, but re-asserting +
      // forcing a fresh .load() here guards against the browser reusing an
      // HTTP-cached response fetched in no-cors mode from an earlier session
      // — a stale opaque cache entry for this exact URL is exactly what
      // produces the silent-output CORS warning even with the attribute
      // correctly in place now.
      a.crossOrigin = 'anonymous';
      a.src = song.previewUrl;
      a.load();
      ensureAudioGraph();
      a.play().catch(() => {});
    }
  }

  const confettiParticles = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    left: `${6 + (i * 37 + 13) % 84}%`,
    bottom: `${8 + (i * 53 + 7) % 42}%`,
    size: 4 + (i * 3) % 7,
    color: ['#C8993E', '#E5C97E', '#EAD9BE', 'rgba(255,255,255,0.85)', '#B8D4B8'][i % 5],
    delay: `${((i * 0.17) % 1.4).toFixed(2)}s`,
    dur: `${(1.8 + (i * 0.13) % 1.4).toFixed(2)}s`,
  })), []);

  if (status === 'loading') {
    return (
      <div className="app-root" data-theme={theme} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <i className="ti ti-loader-2" style={{ fontSize: 32, color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (status === 'not-found') {
    return (
      <div className="app-root" data-theme={theme} style={{ alignItems: 'center', justifyContent: 'center', padding: '0 32px', textAlign: 'center' }}>
        <i className="ti ti-link-off" style={{ fontSize: 32, color: 'var(--text-muted)', marginBottom: 14 }} />
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: '0 0 6px' }}>This link isn't available anymore</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>It may have been revoked by the person who shared it.</p>
      </div>
    );
  }

  const { payload, reel_type } = reel;
  const isBirthday = reel_type === 'birthday';

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {slides.map((s, i) => {
        const isActive = started && !ended && i === index;
        if (s.type === 'text') {
          return (
            <div key={i} style={{ position: 'absolute', inset: 0, opacity: isActive ? 1 : 0, transition: 'opacity 0.6s ease', background: 'rgba(38,58,44,0.97)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 36px' }}>
              {(s.kidAvatar || s.kidAccent) && (
                <div style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', marginBottom: 18, flexShrink: 0, background: s.kidAccent || '#4A5E50', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {s.kidAvatar
                    ? <img src={cloudinaryTransform(s.kidAvatar, 'w_112,h_112,c_fill,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 22, color: '#fff' }}>{s.kidName?.charAt(0)}</span>}
                </div>
              )}
              {s.subtype === 'letter' ? (
                <>
                  {s.kidName && (
                    <p style={{ margin: '0 0 18px', fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 15, color: 'rgba(200,153,62,0.85)' }}>Dear {s.kidName},</p>
                  )}
                  <p style={{ margin: 0, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 21, lineHeight: 1.55, color: '#fff', textAlign: 'center' }}>{s.text}</p>
                </>
              ) : (
                <>
                  <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 54, lineHeight: 0.6, color: 'rgba(200,153,62,0.6)', display: 'block', marginBottom: 6 }}>"</span>
                  <p style={{ margin: '0 0 18px', fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: 20, lineHeight: 1.5, color: '#fff', textAlign: 'center' }}>{s.text}</p>
                  {s.kidName && (
                    <p style={{ margin: 0, fontFamily: "'Urbanist', sans-serif", fontSize: 12, fontWeight: 700, color: 'rgba(200,153,62,0.85)', letterSpacing: 1, textTransform: 'uppercase' }}>{s.kidName}</p>
                  )}
                </>
              )}
            </div>
          );
        }
        const isVideo = s.mediaType === 'video';
        const thumbSrc = isVideo ? videoThumbUrl(s.url, 'so_0,w_1600,q_auto,f_auto') : cloudinaryTransform(s.url, 'w_1600,q_auto,f_auto');
        const kbAnim = `kb${(i % 4) + 1} ${SLIDE_MS}ms ease-in-out forwards`;
        return (
          <div key={i} style={{ position: 'absolute', inset: 0, opacity: isActive ? 1 : 0, transition: 'opacity 1s ease' }}>
            <div style={{ position: 'absolute', inset: '-10%', backgroundImage: `url('${thumbSrc}')`, backgroundSize: 'cover', backgroundPosition: `center ${s.cropY ?? 50}%`, filter: 'blur(18px) brightness(0.5)', transform: 'scale(1.1)' }} />
            {isVideo ? (
              <SharedReelVideo url={s.url} active={isActive} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <div style={{ position: 'absolute', inset: 0, backgroundImage: `url('${thumbSrc}')`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', animation: isActive ? kbAnim : 'none' }} />
            )}
            {s.caption && (
              <>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 40%)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: 64, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.55)', borderRadius: 10, padding: '6px 14px', maxWidth: '86%' }}>
                  <p style={{ margin: 0, fontFamily: "'Urbanist', sans-serif", fontSize: 13, fontWeight: 700, color: '#fff', textAlign: 'center' }}>{s.caption}</p>
                </div>
              </>
            )}
          </div>
        );
      })}

      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 28%, transparent 55%, rgba(0,0,0,0.75) 100%)', pointerEvents: 'none' }} />

      {started && !ended && (
        <>
          <div style={{ position: 'relative', zIndex: 10, display: 'flex', gap: 4, padding: '14px 16px 0' }}>
            {slides.map((s, i) => (
              <div key={i} style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.25)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#fff', borderRadius: 2, width: i < index ? '100%' : i === index ? '100%' : '0%', transition: i === index ? `width ${slideDurationMs(s)}ms linear` : 'none' }} />
              </div>
            ))}
          </div>
          {payload.song && (
            <div style={{ position: 'relative', zIndex: 1, marginTop: 'auto', padding: '0 20px 32px', textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                <img src={payload.song.artworkUrl} style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0 }} alt="" />
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{payload.song.name} — {payload.song.artist}</p>
              </div>
            </div>
          )}
        </>
      )}

      {!started && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 9, background: 'rgba(38,58,44,0.97)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px', textAlign: 'center' }}>
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 13, color: 'rgba(200,153,62,0.75)', margin: '0 0 16px', letterSpacing: 0.5 }}>
            {isBirthday ? 'A Patina birthday reel' : 'A Patina monthly recap'}
          </p>
          <p style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 36, fontWeight: 700, margin: '0 0 28px', lineHeight: 1.15, color: '#fff' }}>
            {reel.title}
          </p>
          <button onClick={handleStart} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 999, padding: '14px 28px', cursor: 'pointer', color: '#fff' }}>
            <i className="ti ti-player-play-filled" />
            <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "'Urbanist', sans-serif" }}>Play{payload.song ? ' with sound' : ''}</span>
          </button>
        </div>
      )}

      {ended && (
        <div style={{ position: 'absolute', inset: 0, background: '#1E2A1E', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '0 32px', textAlign: 'center' }}>
          {isBirthday && confettiParticles.map((p, i) => (
            <div key={i} style={{ position: 'absolute', left: p.left, bottom: p.bottom, width: p.size, height: p.size, borderRadius: '50%', background: p.color, animation: `confettiFloat ${p.dur} ease-out ${p.delay} both`, pointerEvents: 'none' }} />
          ))}

          {isBirthday ? (
            <>
              <p style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 26, fontWeight: 700, color: '#fff', margin: '0 0 28px' }}>{reel.title}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 32 }}>
                {[
                  { n: payload.stats?.photos, singular: 'moment captured', plural: 'moments captured', icon: 'ti-camera' },
                  { n: payload.stats?.letters, singular: 'letter written', plural: 'letters written', icon: 'ti-feather' },
                  { n: payload.stats?.milestones, singular: 'milestone celebrated', plural: 'milestones celebrated', icon: 'ti-star' },
                ].filter(s => s.n > 0).map(({ n, singular, plural, icon }) => (
                  <div key={icon} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <i className={`ti ${icon}`} style={{ fontSize: 18, color: '#C8993E', flexShrink: 0, width: 22, textAlign: 'center' }} />
                    <p style={{ fontFamily: "'Source Serif 4', serif", fontSize: 17, color: 'rgba(255,255,255,0.75)', margin: 0 }}>{n} {n === 1 ? singular : plural}.</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(200,153,62,0.8)', letterSpacing: 1.6, textTransform: 'uppercase', margin: '0 0 16px' }}>{reel.title}</p>
              {payload.quote && (
                <>
                  <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: '#fff', textAlign: 'center', margin: '0 0 6px', lineHeight: 1.35 }}>"{payload.quote}"</h1>
                  <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.3)', textAlign: 'center', margin: '0 0 32px', letterSpacing: 0.5 }}>— C.S. Lewis</p>
                </>
              )}
              <div style={{ display: 'flex', gap: 12, width: '100%', marginBottom: 32 }}>
                {[
                  { n: payload.stats?.letters, label: 'letter' },
                  { n: payload.stats?.milestones, label: 'milestone' },
                  { n: payload.stats?.photos, label: 'photo' },
                ].filter(s => s.n > 0).map(({ n, label }) => (
                  <div key={label} style={{ flex: 1, background: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 12px', textAlign: 'center' }}>
                    <p style={{ fontSize: 36, fontWeight: 800, color: '#C8993E', margin: '0 0 4px', lineHeight: 1 }}>{n}</p>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: 0, fontWeight: 600 }}>{label}{n !== 1 ? 's' : ''}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          <a
            href="/"
            style={{ display: 'block', width: '100%', textAlign: 'center', padding: '14px', borderRadius: 12, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5C97E', fontSize: 13.5, fontWeight: 600, textDecoration: 'none' }}
          >
            Start your own family journal on Patina
          </a>
        </div>
      )}

      <audio ref={audioRef} crossOrigin="anonymous" />
    </div>
  );
}

export default SharedReelScreen;
