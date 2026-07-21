import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabase.js';
import { cloudinaryTransform, AVATAR_TRANSFORM_SM } from '../constants.js';
import {
  TRIP_ARC_MS,
  videoThumbUrl, slideDurationMs, ReelSlideVideo, TripSlide, TextSlide,
  useReelImagePreload, useReelCountUpStats, useReelAudioEngine,
  ReelBottomBar, MonthlyClosingCard,
} from './reelShared.jsx';

// A lighter-weight replay than the live reels — same slide rendering, audio
// engine, and closing-card polish (they share the actual code, see
// reelShared.jsx), but a visitor with no account and no prior interaction
// has to tap to start (browsers block audio autoplay without a gesture on a
// fresh page load) instead of the live reel's brief intro-card delay.
function SharedReelScreen({ token, effectiveDark }) {
  const theme = effectiveDark ? 'dark' : undefined;
  const [status, setStatus] = useState('loading'); // 'loading' | 'not-found' | 'ready'
  const [reel, setReel] = useState(null); // { reel_type, title, payload }
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [ended, setEnded] = useState(false);
  const [freezeFrame, setFreezeFrame] = useState(false);
  const [showStats, setShowStats] = useState(false);

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
  const song = reel?.payload?.song || null;
  const song2 = reel?.payload?.song2 || null;
  const totalBaseMs = useMemo(() => slides.reduce((sum, s) => sum + (s.durationMs || 0), 0), [slides]);

  const {
    audioRef, audioRef2, audioElementProps, audioElementProps2,
    activeSong, durationScale,
    playSong1, replay: replayAudio,
  } = useReelAudioEngine({ song, song2, totalBaseMs, holdSong1: true });

  const [countedStats, setCountedStats] = useReelCountUpStats(showStats, reel?.payload?.stats);

  useReelImagePreload(slides);

  useEffect(() => {
    if (!started || ended || slides.length === 0) return;
    const t = setTimeout(() => {
      if (index + 1 >= slides.length) {
        setEnded(true);
        setFreezeFrame(true);
        setTimeout(() => { setFreezeFrame(false); setShowStats(true); }, 2400);
      } else {
        setIndex(i => i + 1);
      }
    }, slideDurationMs(slides[index], durationScale));
    return () => clearTimeout(t);
  }, [started, ended, index, slides.length, durationScale]);

  function handleStart() {
    setStarted(true);
    playSong1();
  }

  function replay() {
    setIndex(0);
    setEnded(false);
    setShowStats(false);
    setFreezeFrame(false);
    setCountedStats({ letters: 0, milestones: 0, photos: 0 });
    replayAudio();
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
  const currentSlide = slides[index];

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {slides.map((s, i) => {
        const isActive = started && i === index;
        if (s.type === 'trip') {
          return (
            <div key={i} style={{ position: 'absolute', inset: 0, opacity: isActive ? 1 : 0, transition: 'opacity 0.6s ease' }}>
              {i === index && <TripSlide trip={s} active={isActive} arcMs={TRIP_ARC_MS * durationScale} />}
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
        const kbAnim = `kb${(i % 4) + 1} ${slideDurationMs(s, durationScale)}ms ease-in-out forwards`;
        return (
          <div key={i} style={{ position: 'absolute', inset: 0, opacity: isActive ? 1 : 0, transition: 'opacity 1s ease' }}>
            <div style={{ position: 'absolute', inset: '-10%', backgroundImage: `url('${thumbSrc}')`, backgroundSize: 'cover', backgroundPosition: `center ${s.cropY ?? 50}%`, filter: 'blur(18px) brightness(0.5)', transform: 'scale(1.1)' }} />
            {isVideo ? (
              <ReelSlideVideo url={s.url} active={isActive} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
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

      {started && !ended && (
        <>
          <div style={{ position: 'relative', zIndex: 10, display: 'flex', gap: 4, padding: '14px 16px 0' }}>
            {slides.map((s, i) => (
              <div key={i} style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.25)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#fff', borderRadius: 2, width: i < index ? '100%' : i === index ? '100%' : '0%', transition: i === index ? `width ${slideDurationMs(s, durationScale)}ms linear` : 'none' }} />
              </div>
            ))}
          </div>
          {!isBirthday && <ReelBottomBar activeSlide={currentSlide} activeSong={activeSong} />}
        </>
      )}

      {!started && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 9, background: 'rgba(38,58,44,0.97)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px', textAlign: 'center' }}>
          {payload.family?.length > 0 && (
            <div style={{ display: 'flex', marginBottom: 18 }}>
              {payload.family.map((person, i) => (
                <div key={i} title={person.name} style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(38,58,44,0.97)', marginLeft: i > 0 ? -12 : 0, background: person.accent || '#4A5E50', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {person.avatar
                    ? <img src={cloudinaryTransform(person.avatar, AVATAR_TRANSFORM_SM)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" loading="lazy" />
                    : <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 14, color: '#fff' }}>{person.name?.charAt(0)}</span>}
                </div>
              ))}
            </div>
          )}
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 13, color: 'rgba(200,153,62,0.75)', margin: '0 0 16px', letterSpacing: 0.5 }}>
            {isBirthday ? 'A Patina birthday reel' : 'A Patina monthly recap'}
          </p>
          <p style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: 36, fontWeight: 700, margin: '0 0 28px', lineHeight: 1.25, color: '#fff' }}>
            {reel.title}
          </p>
          <button onClick={handleStart} style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.14)', border: '2px solid rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
            <i className="ti ti-player-play-filled" style={{ fontSize: 26, marginLeft: 3 }} />
          </button>
        </div>
      )}

      {isBirthday && showStats && (
        <div style={{ position: 'absolute', inset: 0, background: '#1E2A1E', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '0 32px', textAlign: 'center' }}>
          {confettiParticles.map((p, i) => (
            <div key={i} style={{ position: 'absolute', left: p.left, bottom: p.bottom, width: p.size, height: p.size, borderRadius: '50%', background: p.color, animation: `confettiFloat ${p.dur} ease-out ${p.delay} both`, pointerEvents: 'none' }} />
          ))}
          <p style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: 26, fontWeight: 700, color: '#fff', margin: '0 0 28px', lineHeight: 1.25 }}>{reel.title}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 32 }}>
            {[
              { n: payload.stats?.photos, displayN: countedStats.photos, singular: 'moment captured', plural: 'moments captured', icon: 'ti-camera' },
              { n: payload.stats?.letters, displayN: countedStats.letters, singular: 'letter written', plural: 'letters written', icon: 'ti-feather' },
              { n: payload.stats?.milestones, displayN: countedStats.milestones, singular: 'milestone celebrated', plural: 'milestones celebrated', icon: 'ti-star' },
            ].filter(s => s.n > 0).map(({ n, displayN, singular, plural, icon }) => (
              <div key={icon} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <i className={`ti ${icon}`} style={{ fontSize: 18, color: '#C8993E', flexShrink: 0, width: 22, textAlign: 'center' }} />
                <p style={{ fontFamily: "'Source Serif 4', serif", fontSize: 17, color: 'rgba(255,255,255,0.75)', margin: 0 }}>{displayN} {n === 1 ? singular : plural}.</p>
              </div>
            ))}
          </div>
          <a href="/" style={{ display: 'block', width: '100%', textAlign: 'center', padding: '14px', borderRadius: 12, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5C97E', fontSize: 13.5, fontWeight: 600, textDecoration: 'none' }}>
            Never forget a moment, start your own family journal on Patina
          </a>
        </div>
      )}

      {!isBirthday && showStats && (
        <MonthlyClosingCard
          monthLabel={reel.title}
          quote={payload.quote}
          stats={payload.stats || {}}
          countedStats={countedStats}
          onShare={null}
          onReplay={replay}
          primaryAction={{ label: 'Never forget a moment, start your own family journal on Patina', href: '/' }}
        />
      )}

      <audio ref={audioRef} {...audioElementProps} />
      <audio ref={audioRef2} {...audioElementProps2} />
    </div>
  );
}

export default SharedReelScreen;
