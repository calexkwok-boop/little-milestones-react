import { useState, useEffect, useMemo, useRef } from 'react';
import { Icon } from '../icons';
import { supabase } from '../supabase.js';
import { cloudinaryTransform, AVATAR_TRANSFORM_LG, VIDEO_DELIVERY_TRANSFORM, PATINA_JAR_QUESTIONS } from '../constants.js';
import { SongSearchField, usePatinaJarAudioEngine } from './reelShared.jsx';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthYearLabel(year, monthIndex) {
  return new Date(year, monthIndex - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Every recorded clip mounted up front, opacity-crossfaded (same convention
// ReelSlideVideo/MonthlyReelScreen already use) — but unlike those, clips
// here are unmuted (the whole point is hearing the answer) and advance on
// each clip's own `onended`, not a fixed/estimated slide timer, since these
// are real recordings of unknown, variable length.
function PatinaJarCompilation({ entries, song, onClose }) {
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const videoRefs = useRef([]);
  const audio = usePatinaJarAudioEngine({ song });

  function handleStart() {
    if (started) return;
    setStarted(true);
    audio.start();
    const el = videoRefs.current[0];
    if (el) { el.currentTime = 0; el.play().catch(() => {}); }
  }

  useEffect(() => {
    if (!started || index === 0) return;
    const el = videoRefs.current[index];
    if (el) { el.currentTime = 0; el.play().catch(() => {}); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  function handleEnded() {
    if (index < entries.length - 1) setIndex(i => i + 1);
    else audio.stop();
  }

  useEffect(() => () => { audio.stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const active = entries[index];

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 45 }} onClick={handleStart}>
      <audio ref={audio.audioRef} {...audio.audioElementProps} />
      {entries.map((e, i) => (
        <video
          key={e.id}
          ref={el => { videoRefs.current[i] = el; }}
          src={cloudinaryTransform(e.videoUrl, VIDEO_DELIVERY_TRANSFORM)}
          playsInline
          onEnded={i === index ? handleEnded : undefined}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: i === index ? 1 : 0, transition: 'opacity 0.4s ease', pointerEvents: 'none' }}
        />
      ))}

      <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 2 }}>
        <button onClick={e => { e.stopPropagation(); onClose(); }} style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Icon name="ti-x" />
        </button>
        <span style={{ background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 999, fontFamily: "'Urbanist', sans-serif" }}>
          {monthYearLabel(active.year, active.monthIndex)} · {index + 1}/{entries.length}
        </span>
        <span style={{ width: 28 }} />
      </div>

      {!started && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3, pointerEvents: 'none' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="ti-player-play-filled" style={{ fontSize: 20, color: '#fff' }} />
          </div>
        </div>
      )}
    </div>
  );
}

function PatinaJarScreen({ kid, entries, song, onUpdateSong, onBack, onRecord, onDeleteEntry }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIndex = now.getMonth() + 1;

  const [songQuery, setSongQuery] = useState('');
  const [songResults, setSongResults] = useState([]);
  const [songSearching, setSongSearching] = useState(false);
  const [sheetEntry, setSheetEntry] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [singleWatchEntry, setSingleWatchEntry] = useState(null);
  const [compilationOpen, setCompilationOpen] = useState(false);

  useEffect(() => {
    const q = songQuery.trim();
    if (q.length < 2) { setSongResults([]); return; }
    const t = setTimeout(async () => {
      setSongSearching(true);
      try {
        const { data, error } = await supabase.functions.invoke('itunes-search', { body: { term: q, limit: 8 } });
        if (error) throw error;
        setSongResults((data?.results || []).filter(r => r.previewUrl));
      } catch {}
      setSongSearching(false);
    }, 500);
    return () => clearTimeout(t);
  }, [songQuery]);

  const entriesThisYear = useMemo(() => entries.filter(e => e.year === currentYear), [entries, currentYear]);
  const doneThisMonth = entriesThisYear.some(e => e.monthIndex === currentMonthIndex);
  const sortedEntries = useMemo(
    () => entries.slice().sort((a, b) => a.year - b.year || a.monthIndex - b.monthIndex),
    [entries]
  );

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <button className="icon-btn" onClick={onBack}><Icon name="ti-arrow-left" /></button>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 28, height: 1, background: 'rgba(200,153,62,0.4)', margin: '0 auto 5px' }} />
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>Patina Jar</h2>
      </div>
      <span style={{ width: 36 }} />
    </div>
  );

  if (entries.length === 0) {
    return (
      <div className="screen">
        <div className="scroll-area">
          <div className="scrollpad">
            {header}
            <div className="empty-state">
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: 22 }}>
                🫙
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', margin: '0 0 6px' }}>Change can be so subtle</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: 1.5 }}>
                New questions month after month. Same questions year after year.
              </p>
              <button className="btn btn-primary" style={{ display: 'inline-flex' }} onClick={onRecord}>Record this month's question</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          {header}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', background: kid.accent || 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {kid.avatar
                ? <img src={cloudinaryTransform(kid.avatar, AVATAR_TRANSFORM_LG)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" loading="lazy" />
                : <span style={{ color: '#fff', fontWeight: 700, fontFamily: "'Urbanist', sans-serif" }}>{kid.name[0]}</span>}
            </span>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{kid.name}'s Patina Jar</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{entriesThisYear.length}/12 this year · {entries.length} total</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {MONTH_LABELS.map((label, i) => {
              const monthIndex = i + 1;
              const entry = entriesThisYear.find(e => e.monthIndex === monthIndex);
              const isCurrent = monthIndex === currentMonthIndex;
              const active = !!entry || isCurrent;
              return (
                <div
                  key={monthIndex}
                  onClick={() => { if (entry) setSheetEntry(entry); else if (isCurrent) onRecord(); }}
                  style={{
                    aspectRatio: '1', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                    background: entry ? 'var(--accent)' : 'var(--bg-card)',
                    border: entry ? 'none' : isCurrent ? '1.5px dashed var(--accent)' : '1px solid var(--border)',
                    cursor: active ? 'pointer' : 'default',
                    opacity: active ? 1 : 0.45,
                  }}
                >
                  <Icon name={entry ? 'ti-player-play-filled' : isCurrent ? 'ti-plus' : 'ti-lock'} style={{ fontSize: 14, color: entry ? '#fff' : 'var(--text-muted)' }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: entry ? '#fff' : 'var(--text-muted)' }}>{label}</span>
                </div>
              );
            })}
          </div>

          {!doneThisMonth && (
            <button className="btn btn-primary" onClick={onRecord}>
              <Icon name="ti-video" /> Record this month's question
            </button>
          )}

          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '4px 0 8px 2px' }}>Compilation song</p>
            <SongSearchField
              song={song}
              onPick={onUpdateSong}
              onClear={() => onUpdateSong(null)}
              query={songQuery}
              onQueryChange={setSongQuery}
              results={songResults}
              searching={songSearching}
              placeholder="Search for a song…"
            />
          </div>

          <button className="btn btn-outline" style={{ width: '100%' }} onClick={() => setCompilationOpen(true)}>
            <Icon name="ti-player-play" /> Watch compilation
          </button>
        </div>
      </div>

      {sheetEntry && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 20 }} onClick={() => { setSheetEntry(null); setConfirmingDelete(false); }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', padding: '24px 20px 32px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>{monthYearLabel(sheetEntry.year, sheetEntry.monthIndex)}</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', fontStyle: 'italic' }}>{PATINA_JAR_QUESTIONS[sheetEntry.monthIndex]}</p>
            {confirmingDelete ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 14px', textAlign: 'center' }}>Delete this recording? This can't be undone.</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setConfirmingDelete(false)}>Cancel</button>
                  <button
                    className="btn"
                    style={{ flex: 1, background: 'var(--coral)', color: '#fff' }}
                    onClick={() => { onDeleteEntry(sheetEntry.id); setSheetEntry(null); setConfirmingDelete(false); }}
                  >
                    Delete
                  </button>
                </div>
              </>
            ) : (
              <>
                <button className="btn btn-primary" style={{ width: '100%', marginBottom: 10 }} onClick={() => { setSingleWatchEntry(sheetEntry); setSheetEntry(null); }}>Watch</button>
                <button
                  onClick={() => setConfirmingDelete(true)}
                  style={{ display: 'block', width: '100%', textAlign: 'center', background: 'none', border: 'none', color: 'var(--coral)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", padding: 0 }}
                >
                  Delete this recording
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {singleWatchEntry && (
        <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 45, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSingleWatchEntry(null)}>
          <button onClick={() => setSingleWatchEntry(null)} style={{ position: 'absolute', top: 16, left: 16, width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Icon name="ti-x" />
          </button>
          <video
            src={cloudinaryTransform(singleWatchEntry.videoUrl, VIDEO_DELIVERY_TRANSFORM)}
            controls autoPlay playsInline
            style={{ maxWidth: '100%', maxHeight: '100%' }}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {compilationOpen && (
        <PatinaJarCompilation entries={sortedEntries} song={song} onClose={() => setCompilationOpen(false)} />
      )}
    </div>
  );
}

export default PatinaJarScreen;
