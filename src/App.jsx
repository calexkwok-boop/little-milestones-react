import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback, memo, lazy, Suspense } from 'react';
import './App.css';
// exifr is only needed when reading photo metadata — lazy-load so it's excluded from the initial bundle
let _exifr = null;
const loadExifr = () => _exifr ?? (_exifr = import('exifr').then(m => m.default));
import { supabase, supabaseConfigured } from './supabase.js';
import { SessionCtx, DataCtx, NotifCtx, useSession, useData, useNotif } from './contexts.js';
import KidThumb from './KidThumb.jsx';
import SectionSwitcher from './SectionSwitcher.jsx';
const LazyBirthdaySlideshowScreen = lazy(() => import('./screens/BirthdaySlideshowScreen'));
import RecapScreen from './screens/RecapScreen';
const LazyGrowthScreen = lazy(() => import('./screens/GrowthScreen'));
const LazyBookPreviewScreen = lazy(() => import('./screens/BookPreviewScreen'));
import BookBuilderScreen from './screens/BookBuilderScreen';
import {
  KIDS_INITIAL, ENTRIES_INITIAL,
  MOODS, MILESTONE_TYPES, PALETTES, TODAY,
  ageLabel, exactAge, exactAgeLabel, milestoneInfo, entryBgStyle, tintedScrimStyle, cloudinaryTransform,
} from './constants.js';

const KID_ACCENTS = ['#D4856A', '#7BA99A', '#6A9EB0', '#C8993E', '#A889B0'];
const NOTE_PROMPTS = [
  'What made them laugh today?',
  "What's a word or phrase they keep saying lately?",
  'What did they surprise you with today?',
  "What's something small they did today you don't want to forget?",
  "What are they obsessed with this week?",
  "What did they ask you today that you didn't have an answer for?",
  "What's a moment from today you wish you'd filmed?",
  'What did they call something the wrong (but better) name today?',
  "What's something they're proud of right now?",
  'What did they refuse to do today, and how did that go?',
  "What's a habit of theirs you'll miss when it's gone?",
  'What did they teach you today?',
  "What's something they said that sounded so grown-up?",
  'What food did they love or hate today?',
  'What did they pretend to be today?',
  "What's something ordinary today that felt extraordinary?",
  'What question did they ask on repeat today?',
  "What's a nickname or inside joke from today?",
  'What did they do today that reminded you of yourself?',
  "What's a fear or worry they shared with you?",
  'What did they do for someone else today?',
  "What did their body do today that amazed you — a new skill, a growth spurt, a wobble?",
  'What song or sound have they had on repeat lately?',
  "What could they do today that they couldn't a year ago?",
  "What did they do today that showed who they're becoming?",
  'What did they smell, sound, or feel like today that you want to remember?',
  'What calmed them down today, and how?',
  "What's the strangest thing they believed to be true today?",
  'What are you grateful for about them right now?',
  'What do you hope they remember about today?',
];
let _pendingCircleViewer = null;

function hexToRgba(hex, alpha) {
  const clean = (hex || '').replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

class ScreenErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <div className="screen" style={{ alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 24px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center' }}>Something went wrong.</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 11, textAlign: 'center', fontFamily: 'monospace', background: 'var(--bg-elevated)', padding: '8px 12px', borderRadius: 8, wordBreak: 'break-all' }}>{String(this.state.error)}</p>
          <button className="icon-btn" onClick={() => { this.setState({ error: null }); this.props.onBack?.(); }}>Go back</button>
        </div>
      );
    }
    return this.props.children;
  }
}
const LOCAL_STORAGE_KEY = 'patina-local-data';

function isDarkTime() { const h = new Date().getHours(); return h < 6 || h >= 18; }


function generateVideoThumbnail(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    // iOS WebKit won't load/decode video data unless the element is in the DOM
    video.style.cssText = 'position:fixed;opacity:0;width:1px;height:1px;pointer-events:none;top:-9999px;left:-9999px;';
    document.body.appendChild(video);
    const cleanup = () => {
      try { document.body.removeChild(video); } catch {}
      try { URL.revokeObjectURL(url); } catch {}
    };
    const done = (result) => { clearTimeout(timer); cleanup(); resolve(result); };
    const timer = setTimeout(() => done(null), 8000);
    const capture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      try { video.pause(); } catch {}
      done(canvas.toDataURL('image/jpeg', 0.7));
    };
    video.onloadedmetadata = () => { video.currentTime = Math.min(0.5, video.duration * 0.1); };
    video.onseeked = capture;
    video.onerror = () => done(null);
    video.src = url;
    video.load();
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const bytes = atob(data);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

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

// ─── Share card ──────────────────────────────────────────────────────────────

function loadImageEl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function ctxRoundRect(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function ctxWrapText(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

const SHARE_PALETTE = {
  bg: '#E8F0E4',
  card: '#F6FAF4',
  border: '#CCDAC8',
  accent: '#4A5E50',
  text: '#2C3828',
  muted: '#9AA89C',
  gold: '#C8993E',
};

async function generateShareCard(entry, allKids) {
  await document.fonts.ready;
  await Promise.allSettled([
    document.fonts.load('italic 400 42px "Source Serif 4"'),
    document.fonts.load('600 28px Inter'),
  ]);

  const W = 1080, H = 1350, PAD = 72;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = SHARE_PALETTE.bg;
  ctx.fillRect(0, 0, W, H);

  let cardTop = 100;
  let hasPhoto = false;

  const firstMedia = entry.media?.[0];
  if (firstMedia) {
    const imgUrl = firstMedia.type === 'video' ? videoThumbUrl(firstMedia.url) : firstMedia.url;
    if (imgUrl) {
      try {
        const img = await loadImageEl(imgUrl);
        const PHOTO_H = 520;
        const scale = Math.max(W / img.width, PHOTO_H / img.height);
        const sw = W / scale, sh = PHOTO_H / scale;
        const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, W, PHOTO_H); ctx.clip();
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, PHOTO_H);
        ctx.restore();
        cardTop = PHOTO_H - 44;
        hasPhoto = true;
      } catch {}
    }
  }

  ctxRoundRect(ctx, 0, cardTop, W, H - cardTop + 20, 44, SHARE_PALETTE.card);

  let y = cardTop + 80;

  if (!hasPhoto) {
    ctx.font = '400 140px “Source Serif 4”';
    ctx.fillStyle = SHARE_PALETTE.border;
    ctx.textAlign = 'right';
    ctx.fillText('”', W - PAD + 10, cardTop + 118);
    ctx.textAlign = 'left';
  }

  const name = buildSalutation(entry, allKids);
  ctx.font = 'italic 400 38px "Source Serif 4"';
  ctx.fillStyle = SHARE_PALETTE.accent;
  ctx.fillText(`Dear ${name},`, PAD, y);
  y += 60;

  const cleanText = entry.text.replace(/^dear\s+[\w\s,&]+[,.]?\s*/i, '').trim();
  ctx.font = 'italic 400 42px "Source Serif 4"';
  ctx.fillStyle = SHARE_PALETTE.text;
  const maxLines = hasPhoto ? 7 : 10;
  const bodyLines = ctxWrapText(ctx, cleanText, W - PAD * 2);
  bodyLines.slice(0, maxLines).forEach(line => { ctx.fillText(line, PAD, y); y += 64; });
  if (bodyLines.length > maxLines) {
    ctx.fillStyle = SHARE_PALETTE.muted; ctx.fillText('…', PAD, y); y += 64;
  }
  y += 12;

  if (entry.signedAs) {
    ctx.font = 'italic 400 36px "Source Serif 4"';
    ctx.fillStyle = SHARE_PALETTE.accent;
    ctx.fillText(`Love, ${entry.signedAs}`, PAD, y);
    y += 52;
  }

  y += 28;
  ctx.fillStyle = SHARE_PALETTE.border;
  ctx.fillRect(PAD, y, W - PAD * 2, 1.5);
  y += 36;

  const dateStr = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  ctx.font = '600 28px Inter';
  ctx.fillStyle = SHARE_PALETTE.accent;
  ctx.fillText(dateStr, PAD, y);
  const ICON_SIZE = 36, ICON_GAP = 10;
  ctx.font = '600 28px Inter';
  ctx.fillStyle = SHARE_PALETTE.gold;
  const patinaW = ctx.measureText('Patina').width;
  ctx.fillText('Patina', W - PAD - patinaW - ICON_GAP - ICON_SIZE, y);
  try {
    const quillImg = await loadImageEl('/quill-no-background.png');
    ctx.drawImage(quillImg, W - PAD - ICON_SIZE, y - 30, ICON_SIZE, ICON_SIZE);
  } catch {}
  ctx.textAlign = 'left';

  return canvas;
}


async function shareEntry(entry, allKids) {
  const canvas = await generateShareCard(entry, allKids);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  const file = new File([blob], 'patina-letter.jpg', { type: 'image/jpeg' });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'A letter from Patina' });
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'patina-letter.jpg'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function compressImage(file, maxDim = 2400, quality = 0.88) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const useWebP = canvas.toDataURL('image/webp').startsWith('data:image/webp');
      const mime = useWebP ? 'image/webp' : 'image/jpeg';
      const ext = useWebP ? 'webp' : 'jpg';
      canvas.toBlob(
        blob => resolve(blob ? new File([blob], (file.name || 'photo').replace(/\.[^.]+$/, '') + '.' + ext, { type: mime }) : file),
        mime, quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}


const PROD_APP_URL = 'https://app.patinafamily.com';

let googleMapsPromise = null;
function loadGoogleMaps() {
  if (window.google?.maps?.places) return Promise.resolve();
  if (!googleMapsPromise) {
    googleMapsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_PLACES_KEY}&libraries=places&v=beta`;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  return googleMapsPromise;
}

function getAuthRedirectUrl() {
  if (typeof window === 'undefined') return PROD_APP_URL;
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return PROD_APP_URL;
  }
  return window.location.origin;
}

function loadLocalData() {
  if (typeof window === 'undefined') {
    return { kids: KIDS_INITIAL, entries: ENTRIES_INITIAL };
  }
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return { kids: KIDS_INITIAL, entries: ENTRIES_INITIAL };
    const parsed = JSON.parse(raw);
    return {
      kids: Array.isArray(parsed.kids) ? parsed.kids : KIDS_INITIAL,
      entries: Array.isArray(parsed.entries) ? parsed.entries : ENTRIES_INITIAL,
    };
  } catch {
    return { kids: KIDS_INITIAL, entries: ENTRIES_INITIAL };
  }
}

// ─── Shared bits ─────────────────────────────────────────────────────────

function FadeImg({ src, style, loading = 'lazy', ...props }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img src={src} style={{ ...style, opacity: loaded ? 1 : 0, transition: 'opacity 0.35s ease' }}
      onLoad={() => setLoaded(true)} loading={loading} {...props} />
  );
}

function AvatarImg({ src, alt, fallback }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [src]);
  if (!src || broken) return fallback;
  return <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setBroken(true)} />;
}

function KidChip({ kid, active, onClick, icon, label }) {
  return (
    <div
      className={`kid-chip ${active ? 'active' : ''}`}
      style={active ? { background: kid ? kid.accent : 'var(--accent)' } : {}}
      onClick={onClick}
    >
      {kid ? <KidThumb kid={kid} /> : <span className="thumb"><i className={`ti ${icon}`} style={{ fontSize: 11 }} /></span>}
      {label ?? kid?.name}
    </div>
  );
}

function AuthorChip({ member, onClick, active }) {
  return (
    <div className={`kid-chip ${active ? 'active' : ''}`} onClick={onClick} style={{ cursor: 'pointer', ...(active ? { background: 'var(--accent)' } : {}) }}>
      <span className="thumb" style={member.avatar_url ? {} : { background: 'var(--bg-elevated)', color: 'var(--accent)', fontSize: 10, fontWeight: 700 }}>
        {member.avatar_url
          ? <img src={cloudinaryTransform(member.avatar_url, 'w_100,h_100,c_fill,q_auto,f_auto')} alt="" />
          : (member.real_name || member.display_name)?.charAt(0)?.toUpperCase() || '?'}
      </span>
      {(member.real_name || member.display_name)?.split(' ')[0] || 'Me'}
    </div>
  );
}

function KidSelector({ kids, selected, onSelect, showBoth }) {
  return (
    <div className="scrollx">
      <KidChip active={selected === null} onClick={() => onSelect(null)} icon="ti-layout-list" label="All" />
      {showBoth && kids.length >= 2 && (
        <div
          className={`kid-chip ${selected === 'both' ? 'active' : ''}`}
          style={selected === 'both' ? { background: 'var(--accent)' } : {}}
          onClick={() => onSelect('both')}
        >
          <div style={{ position: 'relative', width: 34, height: 24, flexShrink: 0 }}>
            <span style={{ position: 'absolute', left: 0, top: 0 }}><KidThumb kid={kids[0]} /></span>
            <span style={{ position: 'absolute', left: 12, top: 0, outline: `2px solid ${selected === 'both' ? 'var(--accent)' : 'var(--bg-input)'}`, borderRadius: '50%' }}><KidThumb kid={kids[1]} /></span>
          </div>
          Both
        </div>
      )}
      {kids.map(k => (
        <KidChip key={k.id} kid={k} active={selected === k.id} onClick={() => onSelect(k.id)} />
      ))}
    </div>
  );
}

// ─── Home screen components ──────────────────────────────────────────────────

function buildSalutation(entry, allKids) {
  const names = (entry.kids ?? [entry.kid])
    .map(id => allKids.find(k => k.id === id)?.name.split(' ')[0])
    .filter(Boolean);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

// ─── Crop modal ──────────────────────────────────────────────────────────────

function LocationInput({ value, onChange, onChangeCoords, placeholder = 'e.g. Disneyland, California', autoFocus, inline, compact }) {
  const [suggestions, setSuggestions] = useState([]);
  const [placesUnavailable, setPlacesUnavailable] = useState(false);
  const debounceRef = useRef(null);
  const blurRef = useRef(null);

  function handleChange(e) {
    const q = e.target.value;
    onChange(q);
    onChangeCoords?.(null, null);
    clearTimeout(debounceRef.current);
    if (placesUnavailable || q.trim().length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': import.meta.env.VITE_GOOGLE_PLACES_KEY,
            'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text',
          },
          body: JSON.stringify({ input: q }),
        });
        if (!res.ok) {
          if (res.status === 403) {
            setPlacesUnavailable(true);
            setSuggestions([]);
            console.warn('Google Places autocomplete is unavailable. Check that the Places API (New) is enabled, billing is active, and this origin is allowed for your API key.');
            return;
          }
          throw new Error(`Places autocomplete failed with ${res.status}`);
        }
        const data = await res.json();
        setSuggestions((data.suggestions || []).map(s => {
          const p = s.placePrediction;
          const main = p?.structuredFormat?.mainText?.text;
          const secondary = p?.structuredFormat?.secondaryText?.text;
          return { label: [main, secondary].filter(Boolean).join(', ') || p?.text?.text || '', placeId: p?.placeId };
        }).filter(s => s.label));
      } catch {}
    }, 350);
  }

  async function pick(s) {
    onChange(s.label);
    setSuggestions([]);
    if (placesUnavailable || !s.placeId || !onChangeCoords) return;
    try {
      const res = await fetch(`https://places.googleapis.com/v1/places/${s.placeId}`, {
        headers: {
          'X-Goog-Api-Key': import.meta.env.VITE_GOOGLE_PLACES_KEY,
          'X-Goog-FieldMask': 'location',
        },
      });
      if (!res.ok) throw new Error(`Place details failed with ${res.status}`);
      const data = await res.json();
      if (data.location) onChangeCoords(data.location.latitude, data.location.longitude);
    } catch {}
  }

  const hasSuggestions = suggestions.length > 0;

  if (compact) {
    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--bg-card)', borderRadius: hasSuggestions ? '8px 8px 0 0' : 8, padding: '5px 10px' }}>
          <i className="ti ti-map-pin" style={{ fontSize: 12, color: 'var(--text-2)', flexShrink: 0 }} />
          <input
            autoFocus={autoFocus}
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 16, color: 'var(--text-2)', fontFamily: "'Urbanist', sans-serif", fontWeight: 500, width: value ? Math.max(80, Math.min(value.length * 9, 200)) : 90 }}
            onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Enter') setSuggestions([]); }}
            onBlur={() => { blurRef.current = setTimeout(() => setSuggestions([]), 150); }}
            onFocus={() => clearTimeout(blurRef.current)}
          />
          {value && <button onMouseDown={e => e.preventDefault()} onClick={() => { onChange(''); setSuggestions([]); onChangeCoords?.(null, null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex' }}><i className="ti ti-x" style={{ fontSize: 11 }} /></button>}
        </div>
        {hasSuggestions && (
          <div style={{ position: 'absolute', top: '100%', left: 0, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '0 8px 8px 8px', overflow: 'hidden', zIndex: 50, boxShadow: '0 4px 16px rgba(44,56,40,0.12)', minWidth: 220 }}>
            {suggestions.map((s, i) => (
              <div key={i} onMouseDown={e => { e.preventDefault(); pick(s); }} style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text)', cursor: 'pointer', borderBottom: i < suggestions.length - 1 ? '1px solid #F0F4EE' : 'none', display: 'flex', alignItems: 'center', gap: 7 }}>
                <i className="ti ti-map-pin" style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }} />
                {s.label}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: inline ? undefined : 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: hasSuggestions && inline ? '10px 10px 0 0' : 10, padding: '11px 14px' }}>
        <i className="ti ti-map-pin" style={{ color: 'var(--text-muted)', fontSize: 15, flexShrink: 0 }} />
        <input
          autoFocus={autoFocus}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          style={{ border: 'none', outline: 'none', flex: 1, fontSize: 16, background: 'transparent', color: 'var(--text)', fontFamily: 'Inter, sans-serif' }}
          onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Enter') setSuggestions([]); }}
          onBlur={() => { blurRef.current = setTimeout(() => setSuggestions([]), 150); }}
          onFocus={() => clearTimeout(blurRef.current)}
        />
        {value ? <button onMouseDown={e => e.preventDefault()} onClick={() => { onChange(''); setSuggestions([]); onChangeCoords?.(null, null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}><i className="ti ti-x" style={{ fontSize: 14 }} /></button> : null}
      </div>
      {hasSuggestions && (
        <div style={inline ? {
          border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden', background: 'var(--bg-input)',
        } : {
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', zIndex: 50, boxShadow: '0 4px 16px rgba(44,56,40,0.12)', maxHeight: 200, overflowY: 'auto',
        }}>
          {suggestions.map((s, i) => (
            <div key={i} onMouseDown={e => { e.preventDefault(); pick(s); }} style={{ padding: '12px 14px', fontSize: 14, color: 'var(--text)', cursor: 'pointer', borderBottom: i < suggestions.length - 1 ? '1px solid #F0F4EE' : 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-map-pin" style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }} />
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CropModal({ url, cropY, cardHeight, onSave, onClose }) {
  const scrollRef = useRef(null);
  const imgRef = useRef(null);
  const [loaded, setLoaded] = useState(false);

  function scrollToCropY(y) {
    const img = imgRef.current;
    const container = scrollRef.current;
    if (!img || !container) return;
    const scale = container.offsetWidth / img.naturalWidth;
    const scaledH = img.naturalHeight * scale;
    const extra = scaledH - cardHeight;
    if (extra > 0) container.scrollTop = (y / 100) * extra;
  }

  function handleLoad() {
    setLoaded(true);
    scrollToCropY(cropY);
  }

  function handleSave() {
    const img = imgRef.current;
    const container = scrollRef.current;
    if (!img || !container) return onSave(cropY);
    const scale = container.offsetWidth / img.naturalWidth;
    const scaledH = img.naturalHeight * scale;
    const extra = scaledH - cardHeight;
    const newY = extra > 0 ? Math.round((container.scrollTop / extra) * 100) : 50;
    onSave(Math.min(100, Math.max(0, newY)));
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <p style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', fontSize: 13, margin: '0 0 14px', fontFamily: 'Inter, sans-serif' }}>
        Scroll to reposition
      </p>
      <div
        ref={scrollRef}
        style={{ height: cardHeight, overflowY: 'scroll', WebkitOverflowScrolling: 'touch', margin: '0 0' }}
      >
        <img ref={imgRef} src={url} style={{ width: '100%', display: 'block' }} onLoad={handleLoad} alt="" />
      </div>
      <div style={{ display: 'flex', gap: 12, padding: '20px 24px 44px' }}>
        <button onClick={onClose} style={{ flex: 1, padding: '13px', border: '1px solid rgba(255,255,255,0.25)', background: 'none', color: '#fff', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
          Cancel
        </button>
        <button onClick={handleSave} disabled={!loaded} style={{ flex: 1, padding: '13px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: loaded ? 'pointer' : 'default', opacity: loaded ? 1 : 0.45, fontFamily: 'Inter, sans-serif' }}>
          {loaded ? 'Done' : 'Loading…'}
        </button>
      </div>
    </div>
  );
}

function BookCropModal({ url, mediaType, cropY, cardHeight, photoWidth, onSave, onClose }) {
  const scrollRef = useRef(null);
  const mediaRef = useRef(null);
  const [topPad, setTopPad] = useState(0);
  const isVideo = mediaType === 'video';

  useLayoutEffect(() => {
    if (scrollRef.current) {
      setTopPad(Math.max(0, scrollRef.current.offsetHeight / 2 - cardHeight / 2));
    }
  }, [cardHeight]);

  function getMediaDimensions() {
    const el = mediaRef.current;
    if (!el) return { w: 0, h: 0 };
    return { w: el.naturalWidth || el.offsetWidth, h: el.naturalHeight || el.offsetHeight };
  }

  function handleReady() {
    const { w, h } = getMediaDimensions();
    const scroll = scrollRef.current;
    if (!scroll || !w) return;
    const scale = scroll.offsetWidth / w;
    const scaledH = h * scale;
    const extra = scaledH - cardHeight;
    if (extra > 0) scroll.scrollTop = (cropY / 100) * extra;
  }

  function handleSave() {
    const { w, h } = getMediaDimensions();
    const scroll = scrollRef.current;
    if (!scroll || !w) return onSave(cropY);
    const scale = scroll.offsetWidth / w;
    const scaledH = h * scale;
    const extra = scaledH - cardHeight;
    const newY = extra > 0 ? Math.round((scroll.scrollTop / extra) * 100) : 50;
    onSave(Math.min(100, Math.max(0, newY)));
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#000', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', cursor: 'pointer', fontSize: 15, fontFamily: 'Inter, sans-serif', padding: 0 }}>Cancel</button>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, margin: 0, fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Scroll to reposition</p>
        <button onClick={handleSave} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 15, fontFamily: 'Inter, sans-serif', fontWeight: 700, padding: 0 }}>Done</button>
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <div
          ref={scrollRef}
          style={{
            height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
            width: photoWidth ? `${photoWidth}px` : 'calc(100% - 40px)',
            margin: '0 auto',
          }}
        >
          <div style={{ paddingTop: topPad, paddingBottom: topPad }}>
            <img ref={mediaRef} src={isVideo ? videoThumbUrl(url) : url} style={{ width: '100%', display: 'block' }} onLoad={handleReady} alt="" />
          </div>
        </div>

        {/* Dim area above crop frame */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `calc(50% - ${cardHeight / 2}px)`, background: 'rgba(0,0,0,0.72)', pointerEvents: 'none' }} />
        {/* Dim area below crop frame */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `calc(50% - ${cardHeight / 2}px)`, background: 'rgba(0,0,0,0.72)', pointerEvents: 'none' }} />
        {/* Crop frame border — same width and position as the book photo */}
        <div style={{
          position: 'absolute',
          width: photoWidth ? `${photoWidth}px` : 'calc(100% - 40px)',
          left: '50%', transform: 'translate(-50%, -50%)',
          top: '50%',
          height: cardHeight,
          border: '2px solid rgba(255,255,255,0.7)',
          pointerEvents: 'none',
        }} />
      </div>
    </div>
  );
}

function useLongPress(callback, ms = 500) {
  const timer = useRef(null);
  const didFire = useRef(false);
  const startPos = useRef(null);

  function onTouchStart(e) {
    if (!callback) return;
    didFire.current = false;
    startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    timer.current = setTimeout(() => { didFire.current = true; callback(); }, ms);
  }
  function onTouchMove(e) {
    if (!startPos.current) return;
    if (Math.abs(e.touches[0].clientX - startPos.current.x) > 8 ||
        Math.abs(e.touches[0].clientY - startPos.current.y) > 8) {
      clearTimeout(timer.current);
    }
  }
  function onTouchEnd() { clearTimeout(timer.current); startPos.current = null; }
  function wrapClick(handler) {
    return (e) => { if (didFire.current) { didFire.current = false; return; } handler?.(e); };
  }
  return { onTouchStart, onTouchMove, onTouchEnd, wrapClick, didFire };
}

function usePullToRefresh(scrollRef, onRefresh) {
  const startY = useRef(null);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const isRefreshing = useRef(false);

  const handlers = {
    onTouchStart(e) {
      if (isRefreshing.current || (scrollRef.current?.scrollTop ?? 1) > 0) return;
      startY.current = e.touches[0].clientY;
    },
    onTouchMove(e) {
      if (startY.current === null || isRefreshing.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) { startY.current = null; setPullY(0); return; }
      setPullY(Math.min(dy * 0.45, 64));
    },
    onTouchEnd() {
      if (isRefreshing.current) return;
      const py = pullY;
      startY.current = null;
      setPullY(0);
      if (py >= 52) {
        isRefreshing.current = true;
        setRefreshing(true);
        Promise.resolve(onRefresh?.()).finally(() => { isRefreshing.current = false; setRefreshing(false); });
      }
    },
  };

  const indicator = (pullY > 0 || refreshing) ? (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: refreshing ? 52 : pullY, flexShrink: 0, overflow: 'hidden', transition: pullY > 0 ? 'none' : 'height 0.25s ease' }}>
      <i className={`ti ${refreshing ? 'ti-loader-2' : 'ti-refresh'}`} style={{ fontSize: 20, color: 'var(--accent)', animation: refreshing ? 'spin 1s linear infinite' : 'none', transform: !refreshing ? `rotate(${(pullY / 64) * 360}deg)` : 'none', opacity: refreshing ? 1 : Math.min(pullY / 30, 1) }} />
    </div>
  ) : null;

  return { handlers, indicator };
}

function QuickActionSheet({ entry, allKids, onClose, onFavorite, onShare, onDelete }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const preview = (entry.text || '').replace(/^dear\s+[\w\s,&]+[,.]?\s*/i, '').trim();
  const actions = [
    { icon: entry.favorited ? 'ti-star-filled' : 'ti-star', label: entry.favorited ? 'Remove from favorites' : 'Add to favorites', color: entry.favorited ? '#C8993E' : 'var(--text)', fn: onFavorite },
    { icon: 'ti-share', label: 'Share', color: 'var(--text)', fn: onShare },
    { icon: 'ti-trash', label: 'Delete', color: '#D4856A', fn: () => setConfirmingDelete(true) },
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div className="quick-sheet" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: '20px 20px 0 0', width: '100%', padding: '12px 0 28px' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 14px' }} />
        <div style={{ padding: '0 20px 14px', borderBottom: '1px solid #E8E4DC' }}>
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 13, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
            {preview.length > 100 ? preview.slice(0, 100) + '…' : preview}
          </p>
        </div>
        {confirmingDelete ? (
          <div style={{ padding: '20px 20px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0, textAlign: 'center' }}>Delete this entry?</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>This can't be undone.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setConfirmingDelete(false)}>Cancel</button>
              <button className="btn" style={{ flex: 1, background: '#D4856A', color: '#fff' }} onClick={onDelete}>Delete</button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '4px 12px 8px' }}>
            {actions.map(({ icon, label, color, fn }) => (
              <button key={label} onClick={fn} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 10px', borderRadius: 12, fontFamily: 'Inter, sans-serif' }}>
                <i className={`ti ${icon}`} style={{ fontSize: 20, color, width: 24, textAlign: 'center' }} />
                <span style={{ fontSize: 15, fontWeight: 500, color }}>{label}</span>
              </button>
            ))}
            <button className="btn btn-outline" style={{ width: '100%', marginTop: 4 }} onClick={onClose}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

const LetterCard = memo(function LetterCard({ entry, kid, allKids, featured, onClick, cropY = 50, onLongPress }) {
  const cardH = featured ? 200 : 150;
  const photoRef = useRef(null);
  const lp = useLongPress(onLongPress ? () => onLongPress(entry) : null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const cleanText = entry.text.replace(/^dear\s+[\w\s,&]+[,.]?\s*/i, '').trim();
  const preview = cleanText.length > (featured ? 160 : 110)
    ? cleanText.slice(0, featured ? 160 : 110) + '…'
    : cleanText;
  const dateLabel = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div onClick={lp.wrapClick(onClick)} onTouchStart={lp.onTouchStart} onTouchMove={lp.onTouchMove} onTouchEnd={lp.onTouchEnd} style={{ position: 'relative', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 2px 8px rgba(44,56,40,0.08)' }}>
      {entry.shared === false && (
        <div style={{ position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }} title="Private">
          <i className="ti ti-lock" style={{ color: '#fff', fontSize: 12 }} />
        </div>
      )}
      {entry.media && entry.media.length > 0 && (
        <div
          ref={photoRef}
          onClick={e => { if (lp.didFire.current) { lp.didFire.current = false; return; } e.stopPropagation(); onClick?.(); }}
          style={{ position: 'relative', height: cardH, overflow: 'hidden', cursor: 'pointer' }}
        >
          {entry.media[0].type === 'video' ? (
            <div style={{ width: '100%', height: '100%', position: 'relative', background: '#1a1a1a' }}>
              {videoPlaying ? (
                <video src={entry.media[0].url} autoPlay playsInline controls style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onClick={e => e.stopPropagation()} />
              ) : (
                <>
                  <img src={videoThumbUrl(entry.media[0].url, 'so_0,w_800,e_sharpen:60,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `center ${cropY}%`, display: 'block' }} alt="" />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { e.stopPropagation(); setVideoPlaying(true); }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="ti ti-player-play-filled" style={{ color: '#fff', fontSize: 16 }} />
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : <FadeImg src={cloudinaryTransform(entry.media[0].url, 'w_800,e_sharpen:60,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `center ${cropY}%`, display: 'block' }} alt="" />
          }
        </div>
      )}
      <div style={{ padding: '16px 18px 14px' }}>
        <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 12, color: 'var(--text-muted)', margin: '0 0 7px' }}>
          Dear {allKids ? buildSalutation(entry, allKids) : kid.name},
        </p>
        {preview && (
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: featured ? 16 : 14, color: 'var(--text)', margin: '0 0 8px', lineHeight: 1.65 }}>
            {preview}
          </p>
        )}
        {entry.signedAs && (
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px' }}>
            Love, {entry.signedAs}
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(allKids ? entry.kids.map(id => allKids.find(k => k.id === id)).filter(Boolean) : [kid]).map(k => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <KidThumb kid={k} size={18} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {exactAgeLabel(k.birthdate, entry.date)} · {dateLabel}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

const PROMPT_ACCENT = '#C8993E';

const FeedMediaThumb = memo(function FeedMediaThumb({ item, cropY = 50, transform }) {
  const [playing, setPlaying] = useState(false);
  if (item.type !== 'video') {
    return <img src={cloudinaryTransform(item.url, transform)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `center ${cropY}%` }} alt="" />;
  }
  if (playing) {
    return <video src={item.url} autoPlay controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} onClick={e => e.stopPropagation()} />;
  }
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }} onClick={e => { e.stopPropagation(); setPlaying(true); }}>
      <img src={videoThumbUrl(item.url, `so_0,${transform}`)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `center ${cropY}%` }} alt="" />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="ti ti-player-play-filled" style={{ color: '#fff', fontSize: 15 }} />
        </div>
      </div>
    </div>
  );
});

const NoteCard = memo(function NoteCard({ entry, kid, allKids, onClick, onLongPress }) {
  const lp = useLongPress(onLongPress ? () => onLongPress(entry) : null);
  const accent = kid?.accent || KID_ACCENTS[0];
  const tintBg = hexToRgba(accent, 0.13);
  const tintBorder = hexToRgba(accent, 0.3);
  const tintFold = hexToRgba(accent, 0.48);
  const seed = String(entry.id).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const rotation = ((seed % 7) - 3) * 0.45;
  const dateLabel = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const entryKids = (allKids ? entry.kids.map(id => allKids.find(k => k.id === id)).filter(Boolean) : [kid]).filter(Boolean);
  const preview = entry.text.length > 200 ? entry.text.slice(0, 200) + '…' : entry.text;

  return (
    <div
      onClick={lp.wrapClick(onClick)} onTouchStart={lp.onTouchStart} onTouchMove={lp.onTouchMove} onTouchEnd={lp.onTouchEnd}
      style={{ position: 'relative', background: tintBg, border: `1px solid ${tintBorder}`, borderRadius: 13, padding: '15px 17px 13px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.07)', transform: `rotate(${rotation}deg)` }}
    >
      <div style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderStyle: 'solid', borderWidth: '0 15px 15px 0', borderColor: `transparent ${tintFold} transparent transparent`, borderRadius: '0 13px 0 0' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-notebook" style={{ fontSize: 12, color: accent }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: accent }}>Note</span>
        </div>
        {entry.shared === false && <i className="ti ti-lock" style={{ fontSize: 12, color: accent }} title="Private" />}
      </div>
      <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 15, lineHeight: 1.55, color: 'var(--text)', margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>
        {preview}
      </p>
      {entry.media?.length === 1 && (
        <div style={{ marginBottom: 12, borderRadius: 10, overflow: 'hidden', height: 140 }}>
          <FeedMediaThumb item={entry.media[0]} cropY={entry.cropY} transform="w_500,q_auto,f_auto" />
        </div>
      )}
      {entry.media?.length > 1 && (
        <div style={{ marginBottom: 12, display: 'flex', gap: 8, overflowX: 'auto' }}>
          {entry.media.slice(0, 3).map((m, i) => (
            <div key={i} style={{ width: 110, height: 110, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
              <FeedMediaThumb item={m} cropY={entry.cropY} transform="w_240,q_auto,f_auto" />
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {entryKids.map(k => (
          <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <KidThumb kid={k} size={18} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {exactAgeLabel(k.birthdate, entry.date)} &middot; {dateLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

const PromptCard = memo(function PromptCard({ entry, kid, allKids, onClick, onLongPress }) {
  const lp = useLongPress(onLongPress ? () => onLongPress(entry) : null);
  const dateLabel = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const entryKids = (allKids ? entry.kids.map(id => allKids.find(k => k.id === id)).filter(Boolean) : [kid]).filter(Boolean);
  const preview = entry.text.length > 200 ? entry.text.slice(0, 200) + '…' : entry.text;

  return (
    <div
      onClick={lp.wrapClick(onClick)} onTouchStart={lp.onTouchStart} onTouchMove={lp.onTouchMove} onTouchEnd={lp.onTouchEnd}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 2px 8px rgba(44,56,40,0.08)' }}
    >
      <div style={{ background: PROMPT_ACCENT, padding: '13px 17px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-bulb" style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)' }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>Prompt</span>
          </div>
          {entry.shared === false && <i className="ti ti-lock" style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)' }} title="Private" />}
        </div>
        <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 15, lineHeight: 1.4, color: '#fff', margin: 0 }}>
          {entry.prompt}
        </p>
      </div>
      <div style={{ padding: '14px 17px 13px' }}>
        <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 15, lineHeight: 1.55, color: 'var(--text)', margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>
          {preview}
        </p>
        {entry.media?.length === 1 && (
          <div style={{ marginBottom: 12, borderRadius: 10, overflow: 'hidden', height: 140 }}>
            <FeedMediaThumb item={entry.media[0]} cropY={entry.cropY} transform="w_500,q_auto,f_auto" />
          </div>
        )}
        {entry.media?.length > 1 && (
          <div style={{ marginBottom: 12, display: 'flex', gap: 8, overflowX: 'auto' }}>
            {entry.media.slice(0, 3).map((m, i) => (
              <div key={i} style={{ width: 110, height: 110, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
                <FeedMediaThumb item={m} cropY={entry.cropY} transform="w_240,q_auto,f_auto" />
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {entryKids.map(k => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <KidThumb kid={k} size={18} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {exactAgeLabel(k.birthdate, entry.date)} &middot; {dateLabel}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

const OnThisDayCard = memo(function OnThisDayCard({ entry, kid, allKids, yearsAgo, onClick, cropY = 50 }) {
  const cardH = 250;
  const photoRef = useRef(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const preview = entry.text.length > 200 ? entry.text.slice(0, 200) + '…' : entry.text;
  const yearLabel = yearsAgo === 1 ? 'One year ago today' : `${yearsAgo} years ago today`;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{yearLabel}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      <div onClick={onClick} style={{ position: 'relative', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 2px 8px rgba(44,56,40,0.08)' }}>
        {entry.shared === false && (
          <div style={{ position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }} title="Private">
            <i className="ti ti-lock" style={{ color: '#fff', fontSize: 12 }} />
          </div>
        )}
        {entry.media && entry.media.length > 0 && (
          <div
            ref={photoRef}
            onClick={e => { e.stopPropagation(); onClick?.(); }}
            style={{ position: 'relative', height: cardH, overflow: 'hidden', cursor: 'pointer' }}
          >
            {entry.media[0].type === 'video' ? (
              <div style={{ width: '100%', height: '100%', position: 'relative', background: '#1a1a1a' }}>
                {videoPlaying ? (
                  <video src={entry.media[0].url} autoPlay playsInline controls style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onClick={e => e.stopPropagation()} />
                ) : (
                  <>
                    <img src={videoThumbUrl(entry.media[0].url, 'so_0,w_1600,e_sharpen:60,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `center ${cropY}%`, display: 'block' }} alt="" onError={e => { e.target.style.display = 'none'; }} />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { e.stopPropagation(); setVideoPlaying(true); }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="ti ti-player-play-filled" style={{ color: '#fff', fontSize: 18 }} />
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : <FadeImg src={cloudinaryTransform(entry.media[0].url, 'w_800,e_sharpen:60,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `center ${cropY}%`, display: 'block' }} alt="" />
            }
          </div>
        )}
        <div style={{ padding: '20px 20px 18px' }}>
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 13, color: 'var(--text-muted)', margin: '0 0 10px' }}>
            Dear {allKids ? buildSalutation(entry, allKids) : kid.name},
          </p>
          {preview && (
            <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 17, color: 'var(--text)', margin: '0 0 16px', lineHeight: 1.75 }}>
              {preview}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {entry.kids.map(kidId => {
              const k = allKids.find(k => k.id === kidId);
              if (!k) return null;
              return (
                <div key={kidId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <KidThumb kid={k} size={20} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{k.name} was {exactAgeLabel(k.birthdate, entry.date)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

function EntryCard({ entry, kid, allKids, onClick, onLongPress, featured, cropY }) {
  if (entry.type === 'note' && entry.prompt) return <PromptCard entry={entry} kid={kid} allKids={allKids} onClick={onClick} onLongPress={onLongPress} />;
  if (entry.type === 'note') return <NoteCard entry={entry} kid={kid} allKids={allKids} onClick={onClick} onLongPress={onLongPress} />;
  return <LetterCard entry={entry} kid={kid} allKids={allKids} featured={featured} onClick={onClick} cropY={cropY ?? 50} onLongPress={onLongPress} />;
}

function SectionDivider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7) return new Date(ts).toLocaleDateString('en-US', { weekday: 'short' });
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysUntilBirthday(birthdate) {
  const [, bm, bd] = birthdate.split('-').map(Number);
  const [ty, tm, td] = TODAY.split('-').map(Number);
  const today = new Date(ty, tm - 1, td);
  let next = new Date(ty, bm - 1, bd);
  if (next < today) next = new Date(ty + 1, bm - 1, bd);
  return Math.round((next - today) / 86400000);
}

// Returns how many days ago this birthday occurred this year (0=today, 1=yesterday, negative=still upcoming)
function daysSinceBirthday(birthdate) {
  const [, bm, bd] = birthdate.split('-').map(Number);
  const [ty, tm, td] = TODAY.split('-').map(Number);
  const today = new Date(ty, tm - 1, td);
  const thisYear = new Date(ty, bm - 1, bd);
  return Math.round((today - thisYear) / 86400000);
}

function turningAge(birthdate) {
  const [by, bm, bd] = birthdate.split('-').map(Number);
  const [ty, tm, td] = TODAY.split('-').map(Number);
  const birthdayPassedThisYear = new Date(ty, bm - 1, bd) < new Date(ty, tm - 1, td);
  return birthdayPassedThisYear ? ty + 1 - by : ty - by;
}

function slotString() {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const slot = Math.floor(d.getHours() / 3) * 3;
  return `${date}-${slot}`;
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function entryAddedTime(entry) {
  const created = entry?.createdAt ? new Date(entry.createdAt).getTime() : NaN;
  if (!Number.isNaN(created)) return created;
  return new Date((entry?.date || TODAY) + 'T12:00:00').getTime();
}

function HomeScreen({ onOpenEntry, onSearch, kidFilter, setKidFilter, onAddMoment, onSeeAll, onCompare, onUpdateCrop, onSeePartnerLetters, self, onRefresh, onToggleFavorite, onDeleteEntry, friendEntries = [], friendKids = [], friends = [], friendFamilyMap = {}, onCompareAtAge, pendingOpenEntryId, onClearPendingOpen, onAvatarUpload, initialCircleViewer = null, onClearInitialCircleViewer, onBirthdayNextWeekClick, onBirthdayTodayClick, onFriendBirthdayClick, onStartPrompt }) {
  const { entries, kids } = useData() ?? {};
  const { unseenPartnerIds = [], reactionCounts = {}, pendingRequestCount = 0, circleBadge = 0 } = useNotif() ?? {};
  const { session, userId: currentUserId, familyMembers = [], myDisplayName } = useSession() ?? {};
  const [currentDate, setCurrentDate] = useState(todayString);
  const [currentSlot, setCurrentSlot] = useState(slotString);
  const [longPressEntry, setLongPressEntry] = useState(null);
  const avatarFileInputRef = useRef(null);
  const avatarCaptureInputRef = useRef(null);
  const avatarUploadKidIdRef = useRef(null);
  const [showAvatarSheet, setShowAvatarSheet] = useState(false);
  const [circleViewer, setCircleViewer] = useState(null);
  const [viewerPlaying, setViewerPlaying] = useState(false);
  const [viewerLikes, setViewerLikes] = useState([]);
  const [viewerComments, setViewerComments] = useState([]);
  const [viewerCommentText, setViewerCommentText] = useState('');
  const [replyTarget, setReplyTarget] = useState(null); // { id, display_name, user_id }
  const [showLikeAnim, setShowLikeAnim] = useState(false);
  const lastTapRef = useRef(0);
  const handleLongPress = useCallback((entry) => setLongPressEntry(entry), []);
  const [dismissedBdays, setDismissedBdays] = useState(() => {
    try { return JSON.parse(localStorage.getItem('patina-bday-dismissed') || '{}'); } catch { return {}; }
  });
  function dismissBirthday(kidId, age) {
    const next = { ...dismissedBdays, [`${kidId}-${age}`]: true };
    setDismissedBdays(next);
    localStorage.setItem('patina-bday-dismissed', JSON.stringify(next));
  }
  const scrollRef = useRef(null);
  const ptr = usePullToRefresh(scrollRef, onRefresh);

  useEffect(() => {
    function scheduleRefresh() {
      const now = new Date();
      const nextSlotHour = (Math.floor(now.getHours() / 3) + 1) * 3;
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), nextSlotHour);
      const ms = next - now;
      return setTimeout(() => { setCurrentDate(todayString()); setCurrentSlot(slotString()); scheduleRefresh(); }, ms);
    }
    const t = scheduleRefresh();
    return () => clearTimeout(t);
  }, []);

  const todayMMDD = currentDate.slice(5);
  const todayYear = parseInt(currentDate.slice(0, 4));
  const todayLabel = new Date(currentDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Load likes + comments when lightbox opens
  useEffect(() => {
    setViewerPlaying(false);
    if (!circleViewer) { setViewerLikes([]); setViewerComments([]); setViewerCommentText(''); setReplyTarget(null); return; }
    Promise.all([
      supabase.from('entry_likes').select('id, user_id, display_name').eq('entry_id', circleViewer.entry.id),
      supabase.from('entry_comments').select('id, user_id, display_name, body, created_at, parent_id').eq('entry_id', circleViewer.entry.id).order('created_at'),
    ]).then(([{ data: likes }, { data: comments }]) => {
      setViewerLikes(likes || []);
      setViewerComments(comments || []);
    });
  }, [circleViewer?.entry?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialCircleViewer) {
      setCircleViewer(initialCircleViewer);
      if (onClearInitialCircleViewer) onClearInitialCircleViewer();
    }
  }, [initialCircleViewer]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggleLike() {
    if (!supabase || !session) return;
    const entryId = circleViewer.entry.id;
    const userId = session.user.id;
    const existing = viewerLikes.find(l => l.user_id === userId);
    if (existing) {
      setViewerLikes(prev => prev.filter(l => l.user_id !== userId));
      await supabase.from('entry_likes').delete().eq('entry_id', entryId).eq('user_id', userId);
    } else {
      const socialName = self?.real_name || myDisplayName || '';
      const optimistic = { id: 'opt', user_id: userId, display_name: socialName };
      setViewerLikes(prev => [...prev, optimistic]);
      const { data } = await supabase.from('entry_likes').insert({ entry_id: entryId, user_id: userId, display_name: socialName }).select('id, user_id, display_name').single();
      if (data) setViewerLikes(prev => prev.map(l => l.id === 'opt' ? data : l));
    }
  }

  async function handleSubmitComment() {
    const body = viewerCommentText.trim();
    if (!body || !supabase || !session) return;
    setViewerCommentText('');
    const socialName = self?.real_name || myDisplayName || '';
    const parentId = replyTarget?.id || null;
    setReplyTarget(null);
    const temp = { id: 'opt-' + Date.now(), user_id: session.user.id, display_name: socialName, body, created_at: new Date().toISOString(), parent_id: parentId };
    setViewerComments(prev => [...prev, temp]);
    const insertData = { entry_id: circleViewer.entry.id, user_id: session.user.id, display_name: socialName, body };
    if (parentId) insertData.parent_id = parentId;
    const { data } = await supabase.from('entry_comments').insert(insertData).select('id, user_id, display_name, body, created_at, parent_id').single();
    if (data) setViewerComments(prev => prev.map(c => c.id === temp.id ? data : c));
  }

  function handleOpenEntry(entry) {
    if (!entry.user_id || entry.user_id === currentUserId) {
      onOpenEntry(entry);
      return;
    }
    const entryKids = kids.filter(k => (entry.kids || []).includes(k.id));
    const kidLabel = entryKids.map(k => k.name).join(' & ') || 'Photo';
    const age = entryKids[0]?.birthdate ? exactAgeLabel(entryKids[0].birthdate, entry.date) : null;
    const entryDate = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const member = familyMembers.find(m => m.user_id === entry.user_id);
    setCircleViewer({ entry, entryKids, kidLabel, age, friendName: member?.real_name || member?.display_name || '', friendAvatar: member?.avatar_url || null, entryDate });
  }


  const onThisDay = useMemo(() => entries
    .filter(e => e.date.slice(5) === todayMMDD && parseInt(e.date.slice(0, 4)) < todayYear)
    .sort((a, b) => new Date(b.date) - new Date(a.date)),
  [entries, todayMMDD, todayYear]);

  const recent = useMemo(() => entries
    .filter(e => kidFilter === null || (kidFilter === 'both' ? e.kids.length >= 2 : e.kids.includes(kidFilter)))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 3),
  [entries, kidFilter]);

  const recentlyAdded = useMemo(() => {
    const recentIds = new Set(recent.map(e => e.id));
    return entries
      .filter(e => kidFilter === null || (kidFilter === 'both' ? e.kids.length >= 2 : e.kids.includes(kidFilter)))
      .filter(e => !recentIds.has(e.id))
      .sort((a, b) => entryAddedTime(b) - entryAddedTime(a))
      .slice(0, 2);
  }, [entries, kidFilter, recent]);

  const circleSnapshot = useMemo(() => {
    const byFamily = new Map();
    for (const e of friendEntries) {
      if (!e.media?.length) continue;
      if (!byFamily.has(e.familyId)) byFamily.set(e.familyId, []);
      byFamily.get(e.familyId).push(e);
    }
    const result = [];
    for (const [fid, pool] of byFamily.entries()) {
      // Stable daily shuffle — seeded so it doesn't reshuffle on every rerender
      let h = parseInt(todayMMDD.replace('-', ''), 10) ^ parseInt(fid.replace(/-/g, '').slice(0, 8), 16);
      const shuffled = [...pool].sort((a, b) => {
        h ^= h << 13; h ^= h >> 17; h ^= h << 5; h &= 0x7fffffff;
        return (h & 1) ? 1 : -1;
      });
      result.push(...shuffled.slice(0, 2));
    }
    return result;
  }, [friendEntries, todayMMDD]);

  const friendUserMap = useMemo(() => {
    const map = {};
    friends.forEach(fr => {
      const isReq = fr.requester_id === currentUserId;
      const friendId = isReq ? fr.addressee_id : fr.requester_id;
      map[friendId] = { name: isReq ? fr.addressee_display_name : fr.requester_display_name, avatar: isReq ? fr.addressee_avatar_url : fr.requester_avatar_url };
    });
    return map;
  }, [friends, currentUserId]);

  useEffect(() => {
    if (!pendingOpenEntryId) return;
    // Notifications are on own entries; friend taps are on friendEntries
    const ownEntry = entries.find(e => e.id === pendingOpenEntryId);
    if (ownEntry) {
      onOpenEntry(ownEntry);
      if (onClearPendingOpen) onClearPendingOpen();
      return;
    }
    const friendEntry = friendEntries.find(e => e.id === pendingOpenEntryId);
    if (friendEntry) {
      const entryKids = friendKids.filter(k => (friendEntry.kids || []).includes(k.id));
      if (!entryKids.length) { if (onClearPendingOpen) onClearPendingOpen(); return; }
      const friendInfo = friendUserMap[friendEntry.userId] || friendFamilyMap[friendEntry.familyId] || {};
      const kidLabel = entryKids.map(k => k.name).join(' & ');
      const age = entryKids[0].birthdate ? exactAgeLabel(entryKids[0].birthdate, friendEntry.date) : null;
      const entryDate = new Date(friendEntry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      setCircleViewer({ entry: friendEntry, entryKids, kidLabel, age, friendName: friendInfo.name || '', friendAvatar: friendInfo.avatar || null, entryDate });
      if (onClearPendingOpen) onClearPendingOpen();
    }
  }, [pendingOpenEntryId]); // eslint-disable-line react-hooks/exhaustive-deps

  const kidMap = useMemo(() => new Map(kids.map(k => [k.id, k])), [kids]);

  const letterCounts = useMemo(() => {
    const countMap = new Map(kids.map(k => [k.id, 0]));
    for (const e of entries) if (e.type !== 'note') for (const id of e.kids) if (countMap.has(id)) countMap.set(id, countMap.get(id) + 1);
    return kids.map(k => ({ kid: k, count: countMap.get(k.id) ?? 0 }));
  }, [kids, entries]);

  const noteCounts = useMemo(() => {
    const countMap = new Map(kids.map(k => [k.id, 0]));
    for (const e of entries) if (e.type === 'note') for (const id of e.kids) if (countMap.has(id)) countMap.set(id, countMap.get(id) + 1);
    return kids.map(k => ({ kid: k, count: countMap.get(k.id) ?? 0 }));
  }, [kids, entries]);

  // Nudge toward whichever kid has gone quietest lately (by recency of their last
  // entry, not lifetime volume — an older kid naturally has more entries but isn't
  // necessarily "more written about right now"). Only shows once someone's actually
  // overdue, and never repeats a prompt already answered for that specific kid.
  const promptOfDay = useMemo(() => {
    if (kids.length === 0) return null;
    const now = Date.now();
    const gaps = kids.map(kid => {
      const kidEntries = entries.filter(e => e.kids.includes(kid.id));
      const lastActivity = kidEntries.reduce((max, e) => Math.max(max, entryAddedTime(e)), 0);
      const days = lastActivity ? (now - lastActivity) / 86400000 : Infinity;
      return { kid, days };
    }).sort((a, b) => b.days - a.days);
    const target = gaps[0];
    if (!target || target.days < 5) return null;

    const usedPrompts = new Set(
      entries.filter(e => e.type === 'note' && e.prompt && e.kids.includes(target.kid.id)).map(e => e.prompt)
    );
    const available = NOTE_PROMPTS.filter(p => !usedPrompts.has(p));
    const pool = available.length > 0 ? available : NOTE_PROMPTS;
    const seed = `${todayString()}-${target.kid.id}`.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return { kid: target.kid, prompt: pool[seed % pool.length], pool };
  }, [kids, entries]);

  const [rerolledPrompt, setRerolledPrompt] = useState(null);
  const displayedPrompt = rerolledPrompt || promptOfDay?.prompt;

  const [promptDismissed, setPromptDismissed] = useState(() => {
    try { return localStorage.getItem('patina-prompt-of-day-dismissed') === todayString(); } catch { return false; }
  });

  const birthdayToday = useMemo(() => kids.filter(k => k.birthdate && daysUntilBirthday(k.birthdate) === 0), [kids]);
  const birthdayTodayIds = useMemo(() => new Set(birthdayToday.map(k => k.id)), [birthdayToday]);
  const birthdayNextWeek = useMemo(() => kids.filter(k => daysUntilBirthday(k.birthdate) === 7 && !birthdayTodayIds.has(k.id)), [kids, birthdayTodayIds]);
  const friendBirthdaysToday = useMemo(() => friendKids.filter(k => k.birthdate && daysUntilBirthday(k.birthdate) === 0), [friendKids]);
  const friendBirthdayNextWeek = useMemo(() => friendKids.filter(k => k.birthdate && daysUntilBirthday(k.birthdate) === 7), [friendKids]);

  // FNV-1a hash with good avalanche — consecutive slots pick different entries
  const onceUponATimeScore = (salt, id) => {
    const s = currentSlot + '|' + salt + '|' + String(id).replace(/-/g, '');
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) & 0x7fffffff; }
    return h;
  };

  const onceUponATime = useMemo(() => {
    if (onThisDay.length > 0) return null;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const pool = entries.filter(e => e.type !== 'note' && new Date(e.date + 'T12:00:00') < cutoff);
    if (pool.length === 0) return null;
    return pool.reduce((best, e) => onceUponATimeScore('letter', e.id) > onceUponATimeScore('letter', best.id) ? e : best);
  }, [entries, onThisDay, currentSlot]);

  const onceUponATimeNote = useMemo(() => {
    if (onThisDay.length > 0) return null;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const pool = entries.filter(e => e.type === 'note' && new Date(e.date + 'T12:00:00') < cutoff);
    if (pool.length === 0) return null;
    return pool.reduce((best, e) => onceUponATimeScore('note', e.id) > onceUponATimeScore('note', best.id) ? e : best);
  }, [entries, onThisDay, currentSlot]);

  const sameAgeGroups = useMemo(() => {
    if (kids.length < 2) return null;
    const kidItems = kids.map(kid => ({
      kid,
      items: entries
        .filter(e => e.kids[0] === kid.id && e.media?.length > 0)
        .map(e => ({ entry: e, ageDays: (new Date(e.date + 'T12:00:00') - new Date(kid.birthdate + 'T12:00:00')) / 86400000 }))
        .filter(x => x.ageDays >= 0),
    })).filter(kd => kd.items.length > 0);

    if (kidItems.length < 2) return null;

    const groups = [];
    for (const anchor of kidItems) {
      for (const anchorItem of anchor.items) {
        const group = [{ entry: anchorItem.entry, kid: anchor.kid }];
        for (const other of kidItems) {
          if (other.kid.id === anchor.kid.id) continue;
          let bestMatch = null, minDiff = Infinity;
          for (const item of other.items) {
            const diff = Math.abs(anchorItem.ageDays - item.ageDays);
            if (diff <= 30 && diff < minDiff) { minDiff = diff; bestMatch = { entry: item.entry, kid: other.kid }; }
          }
          if (bestMatch) group.push(bestMatch);
        }
        if (group.length >= 2) {
          groups.push(group);
        }
      }
    }
    return groups.length > 0 ? groups : null;
  }, [entries, kids]);

  const [sameAgeIdx, setSameAgeIdx] = useState(0);
  useEffect(() => {
    if (sameAgeGroups?.length > 1) {
      setSameAgeIdx(Math.floor(Math.random() * sameAgeGroups.length));
    }
  }, [sameAgeGroups?.length]);

  const sameAgeGroup = sameAgeGroups ? sameAgeGroups[sameAgeIdx % sameAgeGroups.length] : null;

  const Header = () => (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 6px' }}>{todayLabel}</p>
      <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, color: '#C8993E', margin: 0, fontWeight: 700 }}>Patina</h1>
    </div>
  );

  if (entries.length === 0) {
    const prompt = 'For all the things you wish they knew, and all the moments you never want them to forget.';
    return (
      <div className="screen">
        <div className="scroll-area" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '28px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            {Header()}

            {/* Kid-first hero — vertically centered in remaining space */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, paddingBottom: 32 }}>
              <input ref={avatarFileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                const file = e.target.files?.[0];
                if (file && avatarUploadKidIdRef.current && onAvatarUpload) onAvatarUpload(avatarUploadKidIdRef.current, file);
                e.target.value = '';
              }} />
              <input ref={avatarCaptureInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => {
                const file = e.target.files?.[0];
                if (file && avatarUploadKidIdRef.current && onAvatarUpload) onAvatarUpload(avatarUploadKidIdRef.current, file);
                e.target.value = '';
              }} />
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                {kids.map((k, i) => (
                  <div key={k.id} onClick={() => { if (!onAvatarUpload) return; avatarUploadKidIdRef.current = k.id; setShowAvatarSheet(true); }} style={{ width: 116, height: 116, borderRadius: '50%', background: k.accent || 'var(--border)', border: '3px solid var(--bg)', marginLeft: i > 0 ? -24 : 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>
                    {k.avatar
                      ? <img src={cloudinaryTransform(k.avatar, 'w_232,h_232,c_fill,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 44, fontWeight: 700, color: '#fff' }}>{k.name.charAt(0)}</span>}
                  </div>
                ))}
              </div>
              {showAvatarSheet && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }} onClick={() => setShowAvatarSheet(false)}>
                  <div className="quick-sheet" style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%', padding: '12px 16px 36px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 20px' }} />
                    {[
                      { label: 'Photo Library', icon: 'ti-photo', action: () => { setShowAvatarSheet(false); avatarFileInputRef.current?.click(); } },
                      { label: 'Take Photo', icon: 'ti-camera', action: () => { setShowAvatarSheet(false); avatarCaptureInputRef.current?.click(); } },
                      { label: 'Choose File', icon: 'ti-folder', action: () => { setShowAvatarSheet(false); avatarFileInputRef.current?.click(); } },
                    ].map(opt => (
                      <button key={opt.label} onClick={opt.action} style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 4px', fontFamily: "'Urbanist', sans-serif", fontSize: 16, color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>
                        <i className={`ti ${opt.icon}`} style={{ fontSize: 20, color: 'var(--accent)', width: 24 }} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 16, color: 'var(--text-3)', lineHeight: 1.7, textAlign: 'center', margin: 0 }}>{prompt}</p>

              <button onClick={onAddMoment} className="btn btn-primary" style={{ width: '100%' }}>
                <i className="ti ti-pencil" style={{ fontSize: 17 }} />
                {kids.length === 1 ? `Write ${kids[0].name.split(' ')[0]}'s first letter` : 'Write their first letter'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen" style={{ position: 'relative' }}>
      <div className="scroll-area" ref={scrollRef} style={{ overscrollBehaviorY: 'contain' }} {...ptr.handlers}>
        {ptr.indicator}
        <div style={{ padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Header />

          {kids.length > 1 && (
            <KidSelector kids={kids} selected={kidFilter} onSelect={setKidFilter} />
          )}

          {unseenPartnerIds.length > 0 && (() => {
            const partner = familyMembers.find(m => m.user_id !== currentUserId);
            const name = partner?.real_name || partner?.display_name || 'Your partner';
            const count = unseenPartnerIds.length;
            return (
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className="ti ti-sparkles" style={{ color: '#C8993E', fontSize: 17, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, color: 'var(--accent)', fontWeight: 500 }}>
                  {name} added {count === 1 ? 'a new letter' : `${count} new letters`}
                </span>
                <button
                  onClick={() => onSeePartnerLetters?.()}
                  style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '5px 10px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', flexShrink: 0 }}
                >
                  See all
                </button>
              </div>
            );
          })()}

          {birthdayToday.map(k => (
            <div key={k.id} onClick={() => onBirthdayTodayClick?.(k)} style={{ background: 'linear-gradient(160deg, #2A4035 0%, #4A5E50 60%, #3A5548 100%)', borderRadius: 16, padding: '26px 20px', textAlign: 'center', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
              {/* Floating particles */}
              {[
                { left: '7%',  top: '18%', size: 4, color: '#C8993E',             delay: '0s',    dur: '2.4s' },
                { left: '18%', top: '72%', size: 3, color: '#E5C97E',             delay: '0.4s',  dur: '2.0s' },
                { left: '78%', top: '14%', size: 5, color: 'rgba(255,255,255,0.5)', delay: '0.7s', dur: '2.6s' },
                { left: '88%', top: '65%', size: 3, color: '#C8993E',             delay: '0.2s',  dur: '1.9s' },
                { left: '50%', top: '80%', size: 4, color: '#E5C97E',             delay: '1.1s',  dur: '2.2s' },
                { left: '65%', top: '25%', size: 3, color: 'rgba(255,255,255,0.4)', delay: '0.6s', dur: '2.8s' },
              ].map((p, i) => (
                <div key={i} style={{ position: 'absolute', left: p.left, top: p.top, width: p.size, height: p.size, borderRadius: '50%', background: p.color, animation: `bdayFloat ${p.dur} ease-in-out ${p.delay} infinite`, pointerEvents: 'none' }} />
              ))}
              {/* Kid avatar */}
              <div style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', margin: '0 auto 14px', border: '2px solid rgba(200,153,62,0.5)', background: k.accent || '#4A5E50', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {k.avatar
                  ? <img src={k.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  : <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 22, color: '#fff' }}>{k.name?.charAt(0)}</span>
                }
              </div>
              <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, margin: '0 0 6px', color: '#C8993E' }}>
                Happy {ordinal(turningAge(k.birthdate))} birthday to {k.name}
              </p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: '0 0 14px', fontFamily: "'Source Serif 4', serif", fontStyle: 'italic' }}>
                "The days are long, but the years are short."
              </p>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(200,153,62,0.15)', border: '1px solid rgba(200,153,62,0.3)', borderRadius: '50%', width: 32, height: 32 }}>
                <i className="ti ti-player-play-filled" style={{ fontSize: 13, color: '#C8993E' }} />
              </div>
            </div>
          ))}

          {birthdayNextWeek.filter(k => !dismissedBdays[`${k.id}-${turningAge(k.birthdate)}`]).map(k => (
            <div key={k.id} onClick={() => onBirthdayNextWeekClick?.(k, turningAge(k.birthdate))} style={{ background: 'var(--bg-nav)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', position: 'relative' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(200,153,62,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="ti ti-cake" style={{ fontSize: 20, color: '#C8993E' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', margin: '0 0 2px' }}>
                  {k.name}'s {ordinal(turningAge(k.birthdate))} birthday is in one week!
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                  Write something special for the occasion
                </p>
              </div>
              <button onClick={e => { e.stopPropagation(); dismissBirthday(k.id, turningAge(k.birthdate)); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 4, flexShrink: 0, lineHeight: 1 }}>
                <i className="ti ti-x" />
              </button>
            </div>
          ))}

          {friendBirthdayNextWeek.filter(k => !dismissedBdays[`${k.id}-${turningAge(k.birthdate)}`]).map(k => (
            <div
              key={k.id}
              onClick={() => k.wishlistUrl && window.open(k.wishlistUrl, '_blank', 'noopener,noreferrer')}
              style={{ background: 'var(--bg-nav)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: k.wishlistUrl ? 'pointer' : 'default', position: 'relative' }}
            >
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(200,153,62,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="ti ti-cake" style={{ fontSize: 20, color: '#C8993E' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', margin: '0 0 2px' }}>
                  {k.name}'s birthday is in one week!
                </p>
                {k.wishlistUrl ? (
                  <p style={{ fontSize: 12, color: '#C8993E', margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className="ti ti-brand-amazon" style={{ fontSize: 13 }} />
                    View gift ideas on Amazon
                  </p>
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                    No wishlist shared yet
                  </p>
                )}
              </div>
              <button onClick={e => { e.stopPropagation(); dismissBirthday(k.id, turningAge(k.birthdate)); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 4, flexShrink: 0, lineHeight: 1 }}>
                <i className="ti ti-x" />
              </button>
            </div>
          ))}

          {onThisDay.length > 0 && (() => {
            const entry = onThisDay[0];
            const kid = kidMap.get(entry.kids[0]);
            const yearsAgo = todayYear - parseInt(entry.date.slice(0, 4));
            if (entry.type === 'note') {
              const yearLabel = yearsAgo === 1 ? 'One year ago today' : `${yearsAgo} years ago today`;
              return (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{yearLabel}</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  </div>
                  {entry.prompt
                    ? <PromptCard entry={entry} kid={kid} allKids={kids} onClick={() => handleOpenEntry(entry)} onLongPress={handleLongPress} />
                    : <NoteCard entry={entry} kid={kid} allKids={kids} onClick={() => handleOpenEntry(entry)} onLongPress={handleLongPress} />}
                </div>
              );
            }
            return <OnThisDayCard entry={entry} kid={kid} allKids={kids} yearsAgo={yearsAgo} onClick={() => handleOpenEntry(entry)} cropY={entry.cropY ?? 50} />;
          })()}

          {promptOfDay && !promptDismissed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px' }}>
              <div
                onClick={() => onStartPrompt?.(displayedPrompt, promptOfDay.kid.id)}
                style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}
              >
                <i className="ti ti-bulb" style={{ fontSize: 14, color: '#C8993E', flexShrink: 0 }} />
                <p style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text-2)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'Source Serif 4', serif", fontStyle: 'italic' }}>
                  {displayedPrompt}
                </p>
                {kids.length > 1 && <KidThumb kid={promptOfDay.kid} size={18} />}
              </div>
              <button
                onClick={() => {
                  const rest = promptOfDay.pool.filter(p => p !== displayedPrompt);
                  const options = rest.length > 0 ? rest : promptOfDay.pool;
                  setRerolledPrompt(options[Math.floor(Math.random() * options.length)]);
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', flexShrink: 0 }}
              >
                <i className="ti ti-refresh" style={{ fontSize: 13 }} />
              </button>
              <button
                onClick={() => { setPromptDismissed(true); try { localStorage.setItem('patina-prompt-of-day-dismissed', todayString()); } catch {} }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', flexShrink: 0 }}
              >
                <i className="ti ti-x" style={{ fontSize: 13 }} />
              </button>
            </div>
          )}

          {(onceUponATime || onceUponATimeNote) && (() => {
            return (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Once upon a time</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {onceUponATime && (
                    <EntryCard entry={onceUponATime} kid={kidMap.get(onceUponATime.kids[0])} allKids={kids} featured={true} onClick={() => handleOpenEntry(onceUponATime)} cropY={onceUponATime.cropY} onLongPress={handleLongPress} />
                  )}
                  {onceUponATimeNote && (
                    <EntryCard entry={onceUponATimeNote} kid={kidMap.get(onceUponATimeNote.kids[0])} allKids={kids} featured={true} onClick={() => handleOpenEntry(onceUponATimeNote)} cropY={onceUponATimeNote.cropY} onLongPress={handleLongPress} />
                  )}
                </div>
              </div>
            );
          })()}

          {sameAgeGroup && !kidFilter && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  At the same age · {exactAgeLabel(sameAgeGroup[0].kid.birthdate, sameAgeGroup[0].entry.date)}
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
              {sameAgeGroup.length === 2 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {sameAgeGroup.map(({ entry, kid }) => (
                    <EntryCard key={entry.id} entry={entry} kid={kid} allKids={kids} featured={false} onClick={() => handleOpenEntry(entry)} cropY={entry.cropY} onLongPress={handleLongPress} />
                  ))}
                </div>
              ) : (
                <div className="scrollx">
                  {sameAgeGroup.map(({ entry, kid }) => (
                    <div key={entry.id} style={{ minWidth: '72%', flexShrink: 0 }}>
                      <EntryCard entry={entry} kid={kid} allKids={kids} featured={false} onClick={() => handleOpenEntry(entry)} cropY={entry.cropY} onLongPress={handleLongPress} />
                    </div>
                  ))}
                </div>
              )}
              {kids.length > 1 && onCompare && (
                <button onClick={onCompare} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 12, padding: '12px 16px', background: 'var(--bg-elevated)', border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>See all side-by-side</span>
                  <i className="ti ti-arrow-right" style={{ fontSize: 14, color: 'var(--accent)' }} />
                </button>
              )}
            </div>
          )}

          {recent.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SectionDivider label="Recent" />
              {recent.map(entry => {
                const kid = kidMap.get(entry.kids[0]);
                return <EntryCard key={entry.id} entry={entry} kid={kid} allKids={kids} featured={true} onClick={() => handleOpenEntry(entry)} cropY={entry.cropY} onLongPress={handleLongPress} />;
              })}
              {entries.length > 3 && (
                <button onClick={onSeeAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-3)', fontFamily: "'Urbanist', sans-serif", fontWeight: 600, padding: '4px 0', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  See all letters <i className="ti ti-arrow-right" style={{ fontSize: 13 }} />
                </button>
              )}
            </div>
          )}

          {recentlyAdded.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SectionDivider label="Recently added" />
              {recentlyAdded.map(entry => {
                const kid = kidMap.get(entry.kids[0]);
                return <EntryCard key={entry.id} entry={entry} kid={kid} allKids={kids} featured={true} onClick={() => handleOpenEntry(entry)} cropY={entry.cropY} onLongPress={handleLongPress} />;
              })}
            </div>
          )}

          <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {letterCounts.map(({ kid, count }) => {
              const noteCount = noteCounts.find(nc => nc.kid.id === kid.id)?.count ?? 0;
              return (
                <div key={kid.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <KidThumb kid={kid} size={26} />
                  <p style={{ fontSize: 14, color: 'var(--text)', margin: 0, lineHeight: 1.3 }}>
                    <strong>{count}</strong>
                    <span style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', color: 'var(--text-3)' }}> letter{count !== 1 ? 's' : ''}</span>
                    {noteCount > 0 && (
                      <>
                        <span style={{ color: 'var(--text-muted)' }}> &middot; </span>
                        <strong>{noteCount}</strong>
                        <span style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', color: 'var(--text-3)' }}> note{noteCount !== 1 ? 's' : ''}</span>
                      </>
                    )}
                    <span style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', color: 'var(--text-3)' }}> to {kid.name}</span>
                  </p>
                </div>
              );
            })}
          </div>


          {(circleSnapshot.length > 0 || friendBirthdaysToday.length > 0) && (() => {
            const sharedMoments = circleSnapshot;
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Just a glimpse</span>
                  {friendBirthdaysToday.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(200,153,62,0.12)', border: '1px solid rgba(200,153,62,0.3)', borderRadius: 999, padding: '2px 7px' }}>
                      <i className="ti ti-cake" style={{ fontSize: 10, color: '#C8993E' }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#C8993E', fontFamily: "'Urbanist', sans-serif", letterSpacing: 0.3 }}>{friendBirthdaysToday.length}</span>
                    </div>
                  )}
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
                <div className="scrollx" style={{ gap: 10, paddingBottom: 4 }}>
                  {friendBirthdaysToday.map(k => {
                    const friendInfo = friendFamilyMap[k.familyId] || {};
                    const age = turningAge(k.birthdate);
                    return (
                      <div key={`bday-${k.id}`} onClick={() => onFriendBirthdayClick?.(k)} style={{ width: 136, flexShrink: 0, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(200,153,62,0.35)', background: 'linear-gradient(160deg, #2A4035 0%, #3A5548 100%)', display: 'flex', flexDirection: 'column', cursor: 'pointer' }}>
                        <div style={{ height: 136, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 10px', position: 'relative' }}>
                          <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(200,153,62,0.5)', background: k.accent || '#4A5E50', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {k.avatar
                              ? <img src={k.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                              : <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 18, color: '#fff' }}>{k.name?.charAt(0)}</span>
                            }
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(200,153,62,0.15)', border: '1px solid rgba(200,153,62,0.3)', borderRadius: '50%', width: 28, height: 28 }}>
                            <i className="ti ti-player-play-filled" style={{ fontSize: 11, color: '#C8993E' }} />
                          </div>
                        </div>
                        <div style={{ padding: '8px 10px', borderTop: '1px solid rgba(200,153,62,0.15)' }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: '#C8993E', margin: 0, lineHeight: 1.3 }}>🎂 {k.name}'s {ordinal(age)}</p>
                          {friendInfo.name && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: '2px 0 0', fontFamily: "'Urbanist', sans-serif" }}>{friendInfo.name}'s family</p>}
                        </div>
                      </div>
                    );
                  })}
                  {sharedMoments.map(entry => {
                    const entryKids = friendKids.filter(k => (entry.kids || []).includes(k.id));
                    if (!entryKids.length) return null;
                    const friendInfo = friendUserMap[entry.userId] || friendFamilyMap[entry.familyId] || {};
                    const friendName = friendInfo.name || '';
                    const friendAvatar = friendInfo.avatar || null;
                    const kidLabel = entryKids.map(k => k.name).join(' & ');
                    const age = entryKids[0].birthdate ? exactAgeLabel(entryKids[0].birthdate, entry.date) : null;
                    const bgStyle = entryBgStyle(entry);
                    const hasPhoto = bgStyle.backgroundImage;
                    const entryDate = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                    return (
                      <div key={entry.id} onClick={() => setCircleViewer({ entry, entryKids, kidLabel, age: entryKids[0].birthdate ? exactAgeLabel(entryKids[0].birthdate, entry.date) : null, friendName, friendAvatar, entryDate })} style={{ width: 136, flexShrink: 0, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', cursor: 'pointer' }}>
                        <div style={{ height: 136, position: 'relative', overflow: 'hidden', background: hasPhoto ? '#000' : (entry.palette?.bg || 'var(--bg-elevated)'), ...bgStyle, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                          <div style={{ position: 'absolute', top: 7, left: 7, width: 24, height: 24, borderRadius: '50%', overflow: 'hidden', background: 'rgba(255,255,255,0.92)', border: '1.5px solid rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>
                            {friendAvatar
                              ? <img src={cloudinaryTransform(friendAvatar, 'w_48,h_48,c_fill,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : friendName?.charAt(0) || '?'}
                          </div>
                        </div>
                        <div style={{ padding: '8px 10px' }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.3 }}>{kidLabel}</p>
                          {age && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '1px 0 0' }}>{age}</p>}
                          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '3px 0 0' }}>{entryDate}{friendName ? ` · ${friendName}` : ''}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

        </div>
      </div>
      {longPressEntry && (
        <QuickActionSheet
          entry={longPressEntry}
          allKids={kids}
          onClose={() => setLongPressEntry(null)}
          onFavorite={() => { onToggleFavorite?.(longPressEntry.id); setLongPressEntry(null); }}
          onShare={() => { shareEntry(longPressEntry, kids).catch(() => {}); setLongPressEntry(null); }}
          onDelete={() => { setLongPressEntry(null); onDeleteEntry?.(longPressEntry.id); }}
        />
      )}
      {circleViewer && (() => {
        const { entry, kidLabel, age, friendName, friendAvatar, entryDate, isOwn } = circleViewer;
        const bgStyle = entryBgStyle(entry);
        const heroMedia = entry.media?.[0] || null;
        const isVideo = heroMedia?.type === 'video';
        const posterMember = familyMembers.find(m => m.user_id === entry.userId);
        const resolvedName = friendName || posterMember?.real_name || posterMember?.display_name || '';
        const resolvedAvatar = friendAvatar || posterMember?.avatar_url || null;
        return (
          <div onClick={() => setCircleViewer(null)} style={{ position: 'absolute', inset: 0, background: 'var(--bg)', zIndex: 30, display: 'flex', flexDirection: 'column' }}>
            {/* Top bar — friend info + compare icon + close */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 16px 12px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>
                {resolvedAvatar
                  ? <img src={cloudinaryTransform(resolvedAvatar, 'w_72,h_72,c_fill,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : resolvedName?.charAt(0) || '?'}
              </div>
              <div style={{ flex: 1 }}>
                {resolvedName && <p style={{ margin: '0 0 1px', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{resolvedName}</p>}
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>{entryDate}</p>
              </div>
              {onCompareAtAge && circleViewer.entryKids[0] && !isOwn && (
                <button onClick={e => { e.stopPropagation(); setCircleViewer(null); onCompareAtAge(circleViewer.entryKids[0].id, circleViewer.entry.ageMonths); }} title="At the same age" style={{ background: 'var(--bg-elevated)', border: 'none', borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--accent)', fontSize: 16, flexShrink: 0 }}>
                  <i className="ti ti-arrows-diff" />
                </button>
              )}
              {isOwn && (
                <button onClick={e => { e.stopPropagation(); setCircleViewer(null); onOpenEntry(entry); }} title="Edit" style={{ background: 'var(--bg-elevated)', border: 'none', borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--accent)', fontSize: 16, flexShrink: 0 }}>
                  <i className="ti ti-pencil" />
                </button>
              )}
              <button onClick={() => setCircleViewer(null)} style={{ background: 'var(--bg-elevated)', border: 'none', borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-2)', fontSize: 16, flexShrink: 0 }}>
                <i className="ti ti-x" />
              </button>
            </div>

            {/* Photo/video — fixed square, double-tap to like */}
            <div
              style={{ width: '100%', aspectRatio: '1', flexShrink: 0, ...(isVideo && viewerPlaying ? {} : bgStyle), backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative', cursor: 'pointer', overflow: 'hidden' }}
              onClick={e => {
                e.stopPropagation();
                if (isVideo && !viewerPlaying) { setViewerPlaying(true); return; }
                const now = Date.now();
                if (now - lastTapRef.current < 320) {
                  const alreadyLiked = viewerLikes.some(l => l.user_id === session?.user?.id);
                  if (!alreadyLiked && !isOwn) handleToggleLike();
                  setShowLikeAnim(true);
                  setTimeout(() => setShowLikeAnim(false), 800);
                }
                lastTapRef.current = now;
              }}
            >
              {isVideo && viewerPlaying && (
                <video src={heroMedia.url} autoPlay controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onClick={e => e.stopPropagation()} />
              )}
              {isVideo && !viewerPlaying && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="video-play-overlay"><i className="ti ti-player-play" style={{ fontSize: 20 }} /></div>
                </div>
              )}
              {showLikeAnim && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <i className="ti ti-heart-filled" style={{ fontSize: 80, color: '#fff', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.35))', animation: 'likeHeartPop 0.8s ease forwards' }} />
                </div>
              )}
            </div>

            {/* Kid name + heart inline, then scrollable comments */}
            <div style={{ padding: '12px 16px 8px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, borderBottom: viewerComments.length > 0 ? '1px solid var(--border)' : 'none' }} onClick={e => e.stopPropagation()}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: '0 0 1px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{kidLabel}</p>
                {age && <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>{age}</p>}
              </div>
              {(() => {
                const userHasLiked = viewerLikes.some(l => l.user_id === session?.user?.id);
                const likeNames = viewerLikes.length >= 3
                  ? `${viewerLikes.length} likes`
                  : viewerLikes.length === 2
                    ? viewerLikes.map(l => l.display_name?.split(' ')[0] || 'Someone').join(' & ')
                    : viewerLikes[0]?.display_name || 'Someone';
                if (isOwn) {
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: viewerLikes.length > 0 ? '#E05C6A' : 'var(--text-3)' }}>
                        <i className={`ti ${viewerLikes.length > 0 ? 'ti-heart-filled' : 'ti-heart'}`} style={{ fontSize: 22 }} />
                        {viewerLikes.length > 0 && <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>{viewerLikes.length}</span>}
                      </div>
                      {viewerLikes.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'Inter, sans-serif' }}>{likeNames}</span>}
                    </div>
                  );
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                    <button onClick={handleToggleLike} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: userHasLiked ? '#E05C6A' : 'var(--text-3)', fontFamily: 'Inter, sans-serif' }}>
                      <i className={`ti ${userHasLiked ? 'ti-heart-filled' : 'ti-heart'}`} style={{ fontSize: 22 }} />
                      {viewerLikes.length > 0 && <span style={{ fontSize: 13, fontWeight: 600 }}>{viewerLikes.length}</span>}
                    </button>
                    {viewerLikes.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'Inter, sans-serif' }}>{likeNames}</span>}
                  </div>
                );
              })()}
            </div>
            {/* Scrollable comments — threaded */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} onClick={e => e.stopPropagation()}>
              {(() => {
                const topLevel = viewerComments.filter(c => !c.parent_id);
                const repliesMap = {};
                viewerComments.filter(c => c.parent_id).forEach(r => {
                  if (!repliesMap[r.parent_id]) repliesMap[r.parent_id] = [];
                  repliesMap[r.parent_id].push(r);
                });
                return topLevel.map(c => (
                  <div key={c.id}>
                    <div style={{ padding: '6px 16px', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'Inter, sans-serif' }}>{c.display_name || 'Someone'} </span>
                        <span style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: 'Inter, sans-serif' }}>{c.body}</span>
                        <button onClick={() => setReplyTarget({ id: c.id, display_name: c.display_name || 'Someone', user_id: c.user_id })} style={{ display: 'block', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, padding: '3px 0 0', fontFamily: 'Inter, sans-serif' }}>Reply</button>
                      </div>
                      {c.user_id === session?.user?.id && (
                        <button onClick={async () => { setViewerComments(prev => prev.filter(x => x.id !== c.id && x.parent_id !== c.id)); await supabase.from('entry_comments').delete().eq('id', c.id).eq('user_id', session.user.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '1px 0', flexShrink: 0 }}>
                          <i className="ti ti-trash" style={{ fontSize: 13 }} />
                        </button>
                      )}
                    </div>
                    {(repliesMap[c.id] || []).map(r => (
                      <div key={r.id} style={{ display: 'flex', paddingLeft: 16, paddingRight: 16, paddingBottom: 4 }}>
                        <div style={{ width: 2, borderRadius: 2, background: 'var(--border)', flexShrink: 0, margin: '2px 10px 2px 8px' }} />
                        <div style={{ flex: 1, minWidth: 0, paddingTop: 2, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', fontFamily: 'Inter, sans-serif' }}>{r.display_name || 'Someone'} </span>
                            <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'Inter, sans-serif' }}>{r.body}</span>
                          </div>
                          {r.user_id === session?.user?.id && (
                            <button onClick={async () => { setViewerComments(prev => prev.filter(x => x.id !== r.id)); await supabase.from('entry_comments').delete().eq('id', r.id).eq('user_id', session.user.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '1px 0', flexShrink: 0 }}>
                              <i className="ti ti-trash" style={{ fontSize: 12 }} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ));
              })()}
            </div>

            {/* Fixed bottom — reply banner + comment input */}
            <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
              {replyTarget && (
                <div style={{ padding: '6px 16px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>Replying to <strong style={{ color: 'var(--text-2)' }}>{replyTarget.display_name}</strong></span>
                  <button onClick={() => setReplyTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex', marginLeft: 'auto' }}><i className="ti ti-x" style={{ fontSize: 13 }} /></button>
                </div>
              )}
              <div style={{ padding: '10px 16px 24px', display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  value={viewerCommentText}
                  onChange={e => setViewerCommentText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmitComment(); } }}
                  placeholder={replyTarget ? `Reply to ${replyTarget.display_name}…` : 'Add a comment…'}
                  style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 20, padding: '8px 14px', fontSize: 14, background: 'var(--bg-input)', color: 'var(--text)', outline: 'none', fontFamily: 'Inter, sans-serif' }}
                />
                <button
                  onClick={handleSubmitComment}
                  disabled={!viewerCommentText.trim()}
                  style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: viewerCommentText.trim() ? 1 : 0.35, flexShrink: 0 }}
                >
                  <i className="ti ti-send" style={{ fontSize: 15, color: '#fff' }} />
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Journal timeline ────────────────────────────────────────────────────

const JournalEntryRow = memo(function JournalEntryRow({ entry, entryKids, onOpen, onLongPress, reactionCount }) {
  const m = entry.milestone ? milestoneInfo(entry.milestone) : null;
  const d = new Date(entry.date + 'T12:00:00');
  const dayNum = d.getDate();
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const rawText = (entry.text || '').replace(/^dear\s+[\w\s,&]+[,.]?\s*/i, '').trim();
  const text = rawText.length > 160 ? rawText.slice(0, 160) + '...' : rawText;
  const nameLabel = entryKids.map(k => k.name.split(' ')[0]).join(' & ');
  const lp = useLongPress(onLongPress ? () => onLongPress(entry) : null);
  const [playingHero, setPlayingHero] = useState(false);

  const hasMedia = entry.media && entry.media.length > 0;
  const heroMedia = hasMedia ? entry.media[0] : null;
  const extraMedia = hasMedia ? entry.media.slice(1, 4) : [];

  return (
    <div className={`journal-entry${m ? ' milestone-entry' : ''}`} onClick={lp.wrapClick(() => onOpen(entry))} onTouchStart={lp.onTouchStart} onTouchMove={lp.onTouchMove} onTouchEnd={lp.onTouchEnd} style={hasMedia ? { padding: 0 } : undefined}>
      {heroMedia && (
        <div style={{ margin: 0, borderRadius: '13px 13px 0 0', overflow: 'hidden', aspectRatio: '4/3', position: 'relative' }}>
          {heroMedia.type === 'video'
            ? playingHero
              ? <video src={heroMedia.url} autoPlay controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              : <img src={videoThumbUrl(heroMedia.url, 'so_0,w_800,e_sharpen:60,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" />
            : <FadeImg src={cloudinaryTransform(heroMedia.url, 'w_1200,q_auto,f_auto')} loading="lazy" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `center ${entry.cropY ?? 50}%`, display: 'block' }} />
          }
          {heroMedia.type === 'video' && !playingHero && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { e.stopPropagation(); setPlayingHero(true); }}>
              <div className="video-play-overlay"><i className="ti ti-player-play" style={{ fontSize: 20 }} /></div>
            </div>
          )}
          {entry.media.length > 1 && (
            <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.45)', borderRadius: 6, padding: '2px 7px', display: 'flex', alignItems: 'center', gap: 3 }}>
              <i className="ti ti-photos" style={{ fontSize: 11, color: '#fff' }} />
              <span style={{ fontSize: 11, color: '#fff', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>{entry.media.length}</span>
            </div>
          )}
        </div>
      )}
      <div style={hasMedia ? { padding: '12px 16px 14px' } : undefined}>
        {!hasMedia && <span className="day-quote-mark">"</span>}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ textAlign: 'center', flexShrink: 0, width: 40 }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0, lineHeight: 1, fontFamily: "'Playfair Display', serif" }}>{dayNum}</p>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '2px 0 0', fontWeight: 600, textTransform: 'uppercase' }}>{weekday}</p>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <div style={{ display: 'flex' }}>
                {entryKids.map((k, i) => (
                  <div key={k.id} style={{ marginLeft: i > 0 ? -6 : 0, zIndex: entryKids.length - i, position: 'relative' }}>
                    <KidThumb kid={k} size={20} />
                  </div>
                ))}
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{nameLabel}</span>
              {entryKids.length === 1 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {exactAgeLabel(entryKids[0].birthdate, entry.date)}</span>}
              <div style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                {entry.type === 'note' && <i className={`ti ${entry.prompt ? 'ti-bulb' : 'ti-notebook'}`} style={{ fontSize: 11, color: entry.prompt ? PROMPT_ACCENT : 'var(--text-muted)' }} />}
                {reactionCount?.likes > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11, color: '#E05C6A', fontWeight: 600 }}>
                    <i className="ti ti-heart-filled" style={{ fontSize: 11 }} />
                    {reactionCount.likes}
                  </span>
                )}
                {reactionCount?.comments > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                    <i className="ti ti-message-circle" style={{ fontSize: 11 }} />
                    {reactionCount.comments}
                  </span>
                )}
                {entry.favorited && <i className="ti ti-star-filled" style={{ fontSize: 11, color: '#C8993E' }} />}
                {m && <span style={{ fontSize: 10, fontWeight: 700, color: '#C8993E' }}>{m.label}</span>}
              </div>
            </div>
            <p style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.65, margin: 0, fontFamily: "'Source Serif 4', serif", fontStyle: text ? 'italic' : 'normal' }}>{text}</p>
            {extraMedia.length > 0 && (
              <div className="journal-thumb-strip">
                {extraMedia.map((mm, i) => (
                  <div key={i} className="journal-thumb" style={{ position: 'relative' }}>
                    {mm.type === 'video'
                      ? <img src={videoThumbUrl(mm.url, 'so_0,w_200,h_200,c_fill,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: 8 }} alt="" />
                      : <FadeImg src={cloudinaryTransform(mm.url, 'w_200,h_200,c_fill,q_auto,f_auto')} loading="lazy" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: 8 }} />
                    }
                    {mm.type === 'video' && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="ti ti-player-play" style={{ fontSize: 12, color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} /></div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

function JournalScreen({ entries, kids, onOpenEntry, onNewEntry, kidFilter, setKidFilter, memberCount, scrollPos, onRefresh, onToggleFavorite, onDeleteEntry, reactionCounts = {}, onBack }) {
  const scrollRef = useRef(null);
  const [longPressEntry, setLongPressEntry] = useState(null);
  const handleLongPress = useCallback((entry) => setLongPressEntry(entry), []);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef(null);
  const ptr = usePullToRefresh(scrollRef, onRefresh);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = scrollPos?.current ?? 0;
    const onScroll = () => { if (scrollPos) scrollPos.current = el.scrollTop; };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const rows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = entries
      .filter(e => kidFilter === null || (kidFilter === 'both' ? e.kids.length >= 2 : e.kids.includes(kidFilter)))
      .filter(e => {
        if (!q) return true;
        if (q === 'note' || q === 'notes') return e.type === 'note' && !e.prompt;
        if (q === 'prompt' || q === 'prompts') return e.type === 'note' && !!e.prompt;
        if ((e.text || '').toLowerCase().includes(q)) return true;
        if ((e.prompt || '').toLowerCase().includes(q)) return true;
        const [y, m] = (e.date || '').split('-');
        if (y && m) {
          const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toLowerCase();
          if (label.includes(q)) return true;
        }
        return false;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    let currentMonth = null;
    const result = [];
    filtered.forEach(entry => {
      const d = new Date(entry.date + 'T12:00:00');
      const monthLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (monthLabel !== currentMonth) {
        currentMonth = monthLabel;
        result.push(
          <div className="month-divider" key={'divider-' + monthLabel}>
            <i className="ti ti-leaf" style={{ fontSize: 13, color: 'var(--text-3)', flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.3 }}>{monthLabel.toUpperCase()}</span>
            <div className="month-divider-line" />
          </div>
        );
      }
      const entryKids = entry.kids.map(id => kids.find(k => k.id === id)).filter(Boolean);
      result.push(<JournalEntryRow key={entry.id} entry={entry} entryKids={entryKids} onOpen={onOpenEntry} onLongPress={handleLongPress} reactionCount={reactionCounts[entry.id]} />);
    });
    return result;
  }, [entries, kids, kidFilter, searchQuery, onOpenEntry, handleLongPress]);

  return (
    <div className="screen" style={{ position: 'relative' }}>
      <div className="scroll-area" ref={scrollRef} style={{ overscrollBehaviorY: 'contain' }} {...ptr.handlers}>
        {ptr.indicator}
        <div className="scrollpad" style={{ paddingBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {onBack && <button className="icon-btn" onClick={onBack} style={{ flexShrink: 0 }}><i className="ti ti-arrow-left" /></button>}
            <h2 style={{ fontSize: 16, color: 'var(--accent)', margin: 0, fontWeight: 700, flex: 1, textAlign: 'center' }}>{memberCount > 1 ? 'Our letters' : 'My letters'}</h2>
            <button className="icon-btn" onClick={() => { setShowSearch(s => !s); setSearchQuery(''); setTimeout(() => searchInputRef.current?.focus(), 50); }} style={{ flexShrink: 0 }}>
              <i className={`ti ${showSearch ? 'ti-x' : 'ti-search'}`} />
            </button>
          </div>
          <KidSelector kids={kids} selected={kidFilter} onSelect={setKidFilter} showBoth />
          {showSearch && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <i className="ti ti-search" style={{ color: 'var(--text-muted)', fontSize: 16 }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search letters…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', flex: 1, fontSize: 15, background: 'transparent', color: 'var(--text)', fontFamily: "'Urbanist', sans-serif" }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex', alignItems: 'center' }}>
                  <i className="ti ti-x" style={{ fontSize: 14 }} />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="scrollpad" style={{ paddingTop: 0 }}>
          {rows.length === 0 ? (
            <div className="empty-state">
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <i className="ti ti-notebook" style={{ fontSize: 24, color: 'var(--text-muted)' }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', margin: '0 0 6px' }}>Nothing written yet</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', maxWidth: 240, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
                Your first journal entry will show up here. Big moment or small one — they all count.
              </p>
              <button className="btn btn-primary" style={{ width: 'auto', padding: '11px 22px', margin: '0 auto' }} onClick={onNewEntry}>
                Write your first entry
              </button>
            </div>
          ) : rows}
        </div>
      </div>
      {longPressEntry && (
        <QuickActionSheet
          entry={longPressEntry}
          allKids={kids}
          onClose={() => setLongPressEntry(null)}
          onFavorite={() => { onToggleFavorite?.(longPressEntry.id); setLongPressEntry(null); }}
          onShare={() => { shareEntry(longPressEntry, kids).catch(() => {}); setLongPressEntry(null); }}
          onDelete={() => { setLongPressEntry(null); onDeleteEntry?.(longPressEntry.id); }}
        />
      )}
    </div>
  );
}

// ─── Song player ─────────────────────────────────────────────────────────

const SongPlayer = memo(function SongPlayer({ song }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().catch(() => {}); setPlaying(true); }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-elevated)', borderRadius: 14, padding: '10px 12px' }}>
      <audio
        ref={audioRef}
        src={song.previewUrl}
        onEnded={() => { setPlaying(false); setProgress(0); }}
        onTimeUpdate={() => { const a = audioRef.current; if (a && a.duration) setProgress(a.currentTime / a.duration); }}
      />
      <img src={song.artworkUrl} style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} alt="" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.name}</p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.artist}</p>
        <div style={{ marginTop: 6, height: 2, background: 'var(--border)', borderRadius: 1 }}>
          <div style={{ height: '100%', width: `${progress * 100}%`, background: 'var(--accent)', borderRadius: 1, transition: 'width 0.5s linear' }} />
        </div>
      </div>
      <button onClick={toggle} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, fontSize: 15 }}>
        <i className={`ti ti-player-${playing ? 'pause' : 'play'}-filled`} />
      </button>
    </div>
  );
});

// ─── Voice memo player ───────────────────────────────────────────────────

const VoiceMemoPlayer = memo(function VoiceMemoPlayer({ url }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().catch(() => {}); setPlaying(true); }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-elevated)', borderRadius: 14, padding: '10px 14px' }}>
      <audio ref={audioRef} src={url} onEnded={() => { setPlaying(false); setProgress(0); }} onTimeUpdate={() => { const a = audioRef.current; if (a && a.duration) setProgress(a.currentTime / a.duration); }} />
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className="ti ti-microphone" style={{ fontSize: 16, color: '#fff' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Voice memo</p>
        <div style={{ marginTop: 5, height: 2, background: 'var(--border)', borderRadius: 1 }}>
          <div style={{ height: '100%', width: `${progress * 100}%`, background: 'var(--accent)', borderRadius: 1, transition: 'width 0.5s linear' }} />
        </div>
      </div>
      <button onClick={toggle} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, fontSize: 15 }}>
        <i className={`ti ti-player-${playing ? 'pause' : 'play'}-filled`} />
      </button>
    </div>
  );
});

// ─── Entry detail ────────────────────────────────────────────────────────

function EntryDetailScreen({ entry, kid, allKids, onBack, onEdit, onToggleFavorite, onDelete, onUpdateCrop, onUpdateLocation, onUpdatePeople, onUpdateKids, onToggleShared, allPeople = [], friendKids = [], supabase, session, socialName = '' }) {
  const isNote = entry.type === 'note';
  const m = entry.milestone ? milestoneInfo(entry.milestone) : null;
  const media = entry.media || [];
  const [activeSlide, setActiveSlide] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [cropY, setCropY] = useState(entry.cropY ?? 50);
  const [people, setPeople] = useState(entry.people || []);
  const [showPeopleTagger, setShowPeopleTagger] = useState(false);
  const [peopleInput, setPeopleInput] = useState('');
  const [isShared, setIsShared] = useState(entry.shared ?? true);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [detailLikes, setDetailLikes] = useState([]);
  const [detailComments, setDetailComments] = useState([]);
  const [detailCommentText, setDetailCommentText] = useState('');
  const [detailReplyTarget, setDetailReplyTarget] = useState(null);
  const detailSwipeStart = useRef(null);

  useEffect(() => {
    if (!supabase || !session) return;
    Promise.all([
      supabase.from('entry_likes').select('id, user_id, display_name').eq('entry_id', entry.id),
      supabase.from('entry_comments').select('id, user_id, display_name, body, created_at, parent_id').eq('entry_id', entry.id).order('created_at'),
    ]).then(([{ data: likes }, { data: comments }]) => {
      setDetailLikes(likes || []);
      setDetailComments(comments || []);
    });
  }, [entry.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDetailSubmitComment() {
    const body = detailCommentText.trim();
    if (!body || !supabase || !session) return;
    setDetailCommentText('');
    const parentId = detailReplyTarget?.id || null;
    setDetailReplyTarget(null);
    const temp = { id: 'opt-' + Date.now(), user_id: session.user.id, display_name: socialName, body, created_at: new Date().toISOString(), parent_id: parentId };
    setDetailComments(prev => [...prev, temp]);
    const insertData = { entry_id: entry.id, user_id: session.user.id, display_name: socialName, body };
    if (parentId) insertData.parent_id = parentId;
    const { data } = await supabase.from('entry_comments').insert(insertData).select('id, user_id, display_name, body, created_at, parent_id').single();
    if (data) setDetailComments(prev => prev.map(c => c.id === temp.id ? data : c));
  }

  function handleDetailTouchStart(e) {
    detailSwipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function handleDetailTouchEnd(e) {
    if (!detailSwipeStart.current) return;
    const dx = e.changedTouches[0].clientX - detailSwipeStart.current.x;
    const dy = e.changedTouches[0].clientY - detailSwipeStart.current.y;
    detailSwipeStart.current = null;
    if (dx > 60 && Math.abs(dx) > Math.abs(dy)) onBack();
  }
  const [showCrop, setShowCrop] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [location, setLocation] = useState(entry.location || '');
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationDraft, setLocationDraft] = useState('');
  const [locationDraftCoords, setLocationDraftCoords] = useState(null);
  const [actionToast, setActionToast] = useState(null);
  const toastTimer = useRef(null);

  function showToast(msg) {
    clearTimeout(toastTimer.current);
    setActionToast(msg);
    toastTimer.current = setTimeout(() => setActionToast(null), 1800);
  }

  async function handleShare() {
    setSharing(true);
    try { await shareEntry(entry, allKids); } catch (e) { if (e?.name !== 'AbortError') console.error(e); }
    setSharing(false);
  }

  return (
    <div className="screen" onTouchStart={handleDetailTouchStart} onTouchEnd={handleDetailTouchEnd}>
      {actionToast && (
        <div style={{ position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', background: 'rgba(44,56,40,0.88)', color: '#fff', fontSize: 13, fontWeight: 500, padding: '8px 16px', borderRadius: 20, zIndex: 50, whiteSpace: 'nowrap', pointerEvents: 'none', fontFamily: 'Inter, sans-serif' }}>
          {actionToast}
        </div>
      )}
      <div className="scroll-area">
        <div style={{ position: 'relative' }}>
          {media.length > 0 ? (
            <>
              <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 10, opacity: videoPlaying ? 0 : 1, transition: 'opacity 0.2s', pointerEvents: videoPlaying ? 'none' : 'auto' }}>
                <button className="icon-btn-ghost" onClick={onBack}><i className="ti ti-arrow-left" /></button>
              </div>
              <div
                className="gallery-stage"
                onClick={() => { if (media[activeSlide]?.type !== 'video') setShowLightbox(true); }}
                style={{ cursor: media[activeSlide]?.type !== 'video' ? 'pointer' : 'default' }}
              >
                {media.map((item, i) => (
                  <div key={i} className="gallery-slide" style={{ opacity: i === activeSlide ? 1 : 0, backgroundImage: item.type === 'video' ? 'none' : `url('${cloudinaryTransform(item.url, 'w_1200,e_sharpen:60,q_auto,f_auto')}')`, backgroundPosition: `center ${cropY}%` }}>
                    {item.type === 'video'
                      ? <video src={item.url} poster={videoThumbUrl(item.url, `so_0,e_sharpen:60,q_auto,f_auto`)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `center ${cropY}%` }} preload="metadata" playsInline controls onPlay={() => setVideoPlaying(true)} onPause={() => setVideoPlaying(false)} onEnded={() => setVideoPlaying(false)} />
                      : <div className="video-play-overlay" style={{ display: 'none' }} />
                    }
                  </div>
                ))}
                {onUpdateCrop && !videoPlaying && (
                  <button
                    onClick={e => { e.stopPropagation(); setShowCrop(true); }}
                    style={{ position: 'absolute', bottom: 12, right: 12, width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 5 }}
                  >
                    <i className="ti ti-crop" style={{ fontSize: 16 }} />
                  </button>
                )}
                {media[activeSlide]?.type !== 'video' && (
                  <button
                    onClick={e => { e.stopPropagation(); setShowPeopleTagger(true); }}
                    style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,0,0,0.38)', borderRadius: 999, padding: '5px 10px 5px 7px', border: 'none', cursor: 'pointer' }}
                  >
                    <i className="ti ti-user-plus" style={{ fontSize: 12, color: '#fff' }} />
                    <span style={{ fontSize: 11, color: '#fff', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
                      {(() => {
                        const taggedFriendNames = friendKids.filter(k => entry.kids.includes(k.id)).map(k => k.name.split(' ')[0]);
                        const all = [...taggedFriendNames, ...people];
                        return all.length > 0 ? all.join(', ') : 'Tag people';
                      })()}
                    </span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <div style={{ padding: '14px 14px 0' }}>
              <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            </div>
          )}
        </div>
        <div className="scrollpad">
          {m && (
            <div className="milestone-entry" style={{ borderRadius: 16, padding: '18px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#C8993E', letterSpacing: 1.4, textTransform: 'uppercase', margin: '0 0 8px' }}>Milestone</p>
              <i className={`ti ${m.icon}`} style={{ fontSize: 28, color: '#C8993E', display: 'block', marginBottom: 8 }} />
              <p style={{ fontSize: 15, fontWeight: 700, color: '#7A6030', margin: 0 }}>{m.label}</p>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(allKids ? entry.kids.map(id => allKids.find(k => k.id === id)).filter(Boolean) : [kid]).map(k => (
              <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <KidThumb kid={k} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 16, color: 'var(--accent)', margin: 0, fontWeight: 700 }}>{k.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    {exactAgeLabel(k.birthdate, entry.date)} old · {new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}{entry.mood ? ` · ${entry.mood}` : ''}
                  </p>
                  {location && (
                    <span onClick={() => { setLocationDraft(location); setLocationDraftCoords(null); setEditingLocation(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 3, cursor: 'pointer' }}>
                      <i className="ti ti-map-pin" style={{ fontSize: 11, color: 'var(--text-muted)' }} />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{location}</span>
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => { onToggleFavorite(entry.id); showToast(entry.favorited ? 'Removed from favorites' : 'Saved to favorites'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: entry.favorited ? '#C8993E' : 'var(--text-muted)', fontSize: 20, display: 'flex', alignItems: 'center' }}>
                    <i className={`ti ti-star${entry.favorited ? '-filled' : ''}`} />
                  </button>
                  <button onClick={() => setShowActionSheet(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--text-muted)', fontSize: 20, display: 'flex', alignItems: 'center' }}>
                    <i className="ti ti-dots" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {entry.song && <SongPlayer song={entry.song} />}
          {entry.voiceMemoUrl && <VoiceMemoPlayer url={entry.voiceMemoUrl} />}
          {isNote ? (() => {
            const isPrompt = !!entry.prompt;
            if (isPrompt) return (
              <div style={{ borderRadius: 13, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div style={{ background: PROMPT_ACCENT, padding: '13px 17px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <i className="ti ti-bulb" style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)' }} />
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>Prompt</span>
                  </div>
                  <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 16, lineHeight: 1.5, color: '#fff', margin: 0 }}>{entry.prompt}</p>
                </div>
                <div style={{ background: 'var(--bg-card)', padding: '14px 17px' }}>
                  <p style={{ fontSize: 16, color: 'var(--text)', lineHeight: 1.7, margin: 0, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>{entry.text}</p>
                </div>
              </div>
            );
            const noteAccent = kid?.accent || KID_ACCENTS[0];
            return (
            <div style={{ position: 'relative', background: hexToRgba(noteAccent, 0.13), border: `1px solid ${hexToRgba(noteAccent, 0.3)}`, borderRadius: 13, padding: '15px 17px 13px' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderStyle: 'solid', borderWidth: '0 15px 15px 0', borderColor: `transparent ${hexToRgba(noteAccent, 0.48)} transparent transparent`, borderRadius: '0 13px 0 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <i className="ti ti-notebook" style={{ fontSize: 12, color: noteAccent }} />
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: noteAccent }}>Note</span>
              </div>
              <p style={{ fontSize: 16, color: 'var(--text)', lineHeight: 1.7, margin: 0, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>{entry.text}</p>
            </div>
            );
          })() : (
            <>
              <p style={{ fontSize: 17, color: 'var(--accent)', lineHeight: 1.8, margin: 0, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic' }}>
                Dear {buildSalutation(entry, allKids)},
              </p>
              <p style={{ fontSize: 17, color: 'var(--text)', lineHeight: 1.8, margin: 0, fontFamily: "'Source Serif 4', serif", fontStyle: entry.text ? 'italic' : 'normal', whiteSpace: 'pre-wrap' }}>{entry.text.replace(/^dear\s+[\w\s,&]+[,.]?\s*/i, '').trim()}</p>
              {entry.signedAs && (
                <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 17, color: 'var(--text-muted)', margin: 0, textAlign: 'right' }}>
                  Love, {entry.signedAs}
                </p>
              )}
            </>
          )}
          {supabase && session && (
            <>
              <div style={{ height: 1, background: 'var(--border)' }} />
              {/* Likes */}
              {detailLikes.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-heart-filled" style={{ fontSize: 13, color: '#E05C6A' }} />
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                    {detailLikes.map(l => l.display_name || 'Someone').join(', ')}
                  </span>
                </div>
              )}
              {/* Threaded comments */}
              {(() => {
                const topLevel = detailComments.filter(c => !c.parent_id);
                const repliesMap = {};
                detailComments.filter(c => c.parent_id).forEach(r => {
                  if (!repliesMap[r.parent_id]) repliesMap[r.parent_id] = [];
                  repliesMap[r.parent_id].push(r);
                });
                return topLevel.map(c => (
                  <div key={c.id}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.display_name || 'Someone'} </span>
                        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{c.body}</span>
                        <button onClick={() => setDetailReplyTarget({ id: c.id, display_name: c.display_name || 'Someone', user_id: c.user_id })} style={{ display: 'block', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, padding: '3px 0 0', fontFamily: 'Inter, sans-serif' }}>Reply</button>
                      </div>
                      {c.user_id === session?.user?.id && (
                        <button onClick={async () => { setDetailComments(prev => prev.filter(x => x.id !== c.id && x.parent_id !== c.id)); await supabase.from('entry_comments').delete().eq('id', c.id).eq('user_id', session.user.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '1px 0', flexShrink: 0 }}>
                          <i className="ti ti-trash" style={{ fontSize: 13 }} />
                        </button>
                      )}
                    </div>
                    {(repliesMap[c.id] || []).map(r => (
                      <div key={r.id} style={{ display: 'flex', paddingLeft: 0, paddingBottom: 2 }}>
                        <div style={{ width: 2, borderRadius: 2, background: 'var(--border)', flexShrink: 0, margin: '2px 10px 2px 8px' }} />
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{r.display_name || 'Someone'} </span>
                            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.body}</span>
                          </div>
                          {r.user_id === session?.user?.id && (
                            <button onClick={async () => { setDetailComments(prev => prev.filter(x => x.id !== r.id)); await supabase.from('entry_comments').delete().eq('id', r.id).eq('user_id', session.user.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '1px 0', flexShrink: 0 }}>
                              <i className="ti ti-trash" style={{ fontSize: 12 }} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ));
              })()}
              {/* Reply banner */}
              {detailReplyTarget && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', borderRadius: 8, padding: '6px 10px' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>Replying to <strong style={{ color: 'var(--text-2)' }}>{detailReplyTarget.display_name}</strong></span>
                  <button onClick={() => setDetailReplyTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}><i className="ti ti-x" style={{ fontSize: 13 }} /></button>
                </div>
              )}
              {/* Comment input */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={detailCommentText}
                  onChange={e => setDetailCommentText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleDetailSubmitComment(); } }}
                  placeholder={detailReplyTarget ? `Reply to ${detailReplyTarget.display_name}…` : 'Add a comment…'}
                  style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 20, padding: '8px 14px', fontSize: 13, background: 'var(--bg-input)', color: 'var(--text)', fontFamily: 'Inter, sans-serif', outline: 'none' }}
                />
                <button onClick={handleDetailSubmitComment} disabled={!detailCommentText.trim()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: detailCommentText.trim() ? 'var(--accent)' : 'var(--border)', padding: 0, fontSize: 20, display: 'flex', alignItems: 'center' }}>
                  <i className="ti ti-send" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {showActionSheet && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 11 }} onClick={() => setShowActionSheet(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', width: '100%', paddingBottom: 36 }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '12px auto 20px' }} />
            {[
              { icon: 'ti-edit', label: 'Edit entry', action: () => { setShowActionSheet(false); onEdit(entry); } },
              onToggleShared && { icon: isShared ? 'ti-lock' : 'ti-users', label: isShared ? 'Private' : 'Share', action: () => { const next = !isShared; setIsShared(next); onToggleShared(entry.id, { partner: next, friends: next }); showToast(next ? 'Visible to friends' : 'Post is private'); setShowActionSheet(false); } },
              { icon: 'ti-share', label: 'Send', action: () => { setShowActionSheet(false); handleShare(); } },
              { icon: 'ti-trash', label: 'Delete entry', action: () => { setShowActionSheet(false); setShowDeleteConfirm(true); }, danger: true },
            ].filter(Boolean).map(item => (
              <button key={item.label} onClick={item.action} style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', background: 'none', border: 'none', padding: '14px 24px', cursor: 'pointer', color: item.danger ? '#D4856A' : 'var(--text)', fontFamily: 'Inter, sans-serif', fontSize: 15, fontWeight: 500 }}>
                <i className={`ti ${item.icon}`} style={{ fontSize: 20, width: 24, flexShrink: 0 }} />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {showDeleteConfirm && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 11 }} onClick={() => setShowDeleteConfirm(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', padding: '28px 24px 36px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(212,133,106,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <i className="ti ti-trash" style={{ fontSize: 19, color: '#D4856A' }} />
            </div>
            <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px', textAlign: 'center' }}>Delete this entry?</p>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', textAlign: 'center' }}>This can't be undone.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="btn" style={{ flex: 1, background: '#D4856A', color: '#fff' }} onClick={() => { setShowDeleteConfirm(false); onDelete(entry.id); }}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {showCrop && media[activeSlide] && (
        <CropModal
          url={media[activeSlide].type === 'video'
            ? videoThumbUrl(media[activeSlide].url, 'so_0,w_1200,q_auto,f_auto')
            : cloudinaryTransform(media[activeSlide].url, 'w_1200,q_auto,f_auto')}
          cropY={cropY}
          cardHeight={260}
          onSave={newY => { setCropY(newY); onUpdateCrop?.(entry.id, newY); setShowCrop(false); }}
          onClose={() => setShowCrop(false)}
        />
      )}
      {showLightbox && media[activeSlide] && media[activeSlide].type !== 'video' && (
        <div
          onClick={() => setShowLightbox(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <button
            onClick={e => { e.stopPropagation(); setShowLightbox(false); }}
            style={{ position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 1 }}
          >
            <i className="ti ti-x" />
          </button>
          <img
            src={cloudinaryTransform(media[activeSlide].url, 'w_1200,q_auto,f_auto')}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            alt=""
          />
        </div>
      )}
      {showPeopleTagger && (() => {
        function addPerson(name) {
          const trimmed = name.trim();
          if (!trimmed || people.includes(trimmed)) return;
          const next = [...people, trimmed];
          setPeople(next);
          onUpdatePeople?.(entry.id, next);
        }
        function removePerson(name) {
          const next = people.filter(n => n !== name);
          setPeople(next);
          onUpdatePeople?.(entry.id, next);
        }
        function addKid(kidId) {
          if (entry.kids.includes(kidId)) return;
          onUpdateKids?.(entry.id, [...entry.kids, kidId]);
        }
        function closeTagger() {
          if (peopleInput.trim()) addPerson(peopleInput.trim());
          setPeopleInput('');
          setShowPeopleTagger(false);
        }
        return (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 20 }} onClick={closeTagger}>
            <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Who else was there?</p>
                <button onClick={closeTagger} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}><i className="ti ti-x" style={{ fontSize: 18 }} /></button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 13, padding: '10px 14px' }}>
                {people.map(p => (
                  <div key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'var(--bg-elevated)', borderRadius: 999, padding: '3px 6px 3px 10px', fontSize: 13, color: 'var(--text-2)' }}>
                    {p}
                    <button onMouseDown={e => { e.preventDefault(); removePerson(p); }} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', borderRadius: '50%' }}>
                      <i className="ti ti-x" style={{ fontSize: 10 }} />
                    </button>
                  </div>
                ))}
                <div style={{ position: 'relative' }}>
                  <input
                    autoFocus
                    value={peopleInput}
                    onChange={e => setPeopleInput(e.target.value)}
                    onKeyDown={e => {
                      if ((e.key === 'Enter' || e.key === ',') && peopleInput.trim()) {
                        e.preventDefault();
                        addPerson(peopleInput.trim().replace(/,$/, ''));
                        setPeopleInput('');
                      } else if (e.key === 'Backspace' && !peopleInput && people.length > 0) {
                        removePerson(people[people.length - 1]);
                      }
                    }}
                    placeholder={people.length === 0 ? 'Add a name…' : '+'}
                    style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 16, color: 'var(--text)', fontFamily: 'Inter, sans-serif', width: peopleInput ? `${Math.max(peopleInput.length + 2, 4)}ch` : people.length === 0 ? '12ch' : '3ch', minWidth: '2ch' }}
                  />
                  {peopleInput.trim().length > 0 && (() => {
                    const q = peopleInput.toLowerCase();
                    const peopleSuggestions = allPeople.filter(p => p.toLowerCase().includes(q) && !people.includes(p)).slice(0, 5);
                    const kidSuggestions = friendKids.filter(k => k.name.toLowerCase().includes(q) && !entry.kids.includes(k.id));
                    if (peopleSuggestions.length === 0 && kidSuggestions.length === 0) return null;
                    return (
                      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 150 }}>
                        {kidSuggestions.map(k => (
                          <button key={k.id} onMouseDown={e => { e.preventDefault(); addKid(k.id); setPeopleInput(''); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, color: 'var(--text)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                            <KidThumb kid={k} size={20} />
                            {k.name}
                          </button>
                        ))}
                        {peopleSuggestions.map(p => (
                          <button key={p} onMouseDown={e => { e.preventDefault(); addPerson(p); setPeopleInput(''); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, color: 'var(--text)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                            <i className="ti ti-user" style={{ fontSize: 12, color: 'var(--text-muted)' }} />
                            {p}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {editingLocation && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 20 }} onClick={() => setEditingLocation(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', padding: '24px 20px 44px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Location</p>
              <button onClick={() => setEditingLocation(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}><i className="ti ti-x" style={{ fontSize: 18 }} /></button>
            </div>
            <LocationInput value={locationDraft} onChange={setLocationDraft} onChangeCoords={(lat, lng) => setLocationDraftCoords(lat != null ? { lat, lng } : null)} autoFocus inline />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setEditingLocation(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => {
                const val = locationDraft.trim();
                setLocation(val); onUpdateLocation?.(entry.id, val || null, locationDraftCoords?.lat ?? null, locationDraftCoords?.lng ?? null); setEditingLocation(false);
              }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── New entry form ────────────────────────────────────────────────────────

function NewEntryScreen({ kids, friendKids = [], onCancel, onSave, onDelete, existingEntry, signedDefault, draftKey, allPeople = [], familyMembers = [], currentUserId, sharingDefaults = { partner: true, family: false, friends: false }, initialKidIds, initialMilestone, initialCustomMilestone, mode: modeProp, promptText: promptTextProp }) {
  const [promptText, setPromptText] = useState(promptTextProp || existingEntry?.prompt || null);
  const mode = modeProp || existingEntry?.type || 'letter';
  const isNote = mode === 'note';
  const [selectedKids, setSelectedKids] = useState(
    existingEntry ? existingEntry.kids : (initialKidIds?.length ? initialKidIds : (kids.length === 1 ? [kids[0].id] : []))
  );
  const [text, setText] = useState(existingEntry?.text || '');
  const [mood, setMood] = useState(existingEntry?.mood || null);
  const [people, setPeople] = useState(existingEntry?.people || []);
  const [peopleInput, setPeopleInput] = useState('');
  const existingMilestone = existingEntry?.milestone || null;
  const [milestoneType, setMilestoneType] = useState(
    existingMilestone?.startsWith('custom:') ? 'custom' : (existingMilestone ?? initialMilestone ?? null)
  );
  const [customMilestoneText, setCustomMilestoneText] = useState(
    existingMilestone?.startsWith('custom:') ? existingMilestone.slice(7) : (initialCustomMilestone || '')
  );
  const [media, setMedia] = useState(existingEntry?.media || []);
  const [fileObjects, setFileObjects] = useState(existingEntry?.media?.map(() => null) || []);
  const [mediaError, setMediaError] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [signedAs, setSignedAs] = useState(existingEntry?.signedAs ?? (isNote ? '' : signedDefault) ?? '');
  const [sharedWith, setSharedWith] = useState(existingEntry?.sharedWith || sharingDefaults);
  const [showSharePicker, setShowSharePicker] = useState(false);
  const [location, setLocation] = useState(existingEntry?.location || '');
  const [locationCoords, setLocationCoords] = useState(existingEntry?.locationLat != null ? { lat: existingEntry.locationLat, lng: existingEntry.locationLng } : null);
  const [locationFromPhoto, setLocationFromPhoto] = useState(false);
  const [song, setSong] = useState(existingEntry?.song || null);
  const [songQuery, setSongQuery] = useState('');
  const [songResults, setSongResults] = useState([]);
  const [songSearching, setSongSearching] = useState(false);
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [previewMedia, setPreviewMedia] = useState(null);
  const [entryDate, setEntryDate] = useState(existingEntry?.date || TODAY);
  const [dateFromPhoto, setDateFromPhoto] = useState(false);
  const [showExtras, setShowExtras] = useState(
    !!(existingEntry?.mood || existingEntry?.milestone || existingEntry?.song || existingEntry?.people?.length || existingEntry?.voiceMemoUrl || initialMilestone)
  );
  const [showKidPicker, setShowKidPicker] = useState(false);
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [editMonth, setEditMonth] = useState('');
  const [editDay, setEditDay] = useState('');
  const [editYear, setEditYear] = useState('');
  const [draftRestored, setDraftRestored] = useState(false);
  const cameraInputRef = useRef(null);
  const uploadInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [voiceMemoBlob, setVoiceMemoBlob] = useState(null);
  const [voiceMemoUrl, setVoiceMemoUrl] = useState(existingEntry?.voiceMemoUrl || null);

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) document.activeElement?.blur(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  const mountedRef = useRef(true);
  const compressedFilesRef = useRef(new Map()); // blobUrl → Promise<File>
  const [listening, setListening] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      media.forEach(item => {
        if (item.url?.startsWith('blob:')) URL.revokeObjectURL(item.url);
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore draft on mount (new entries only)
  useEffect(() => {
    if (existingEntry || !draftKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) || 'null');
      if (!saved) return;
      if (saved.text) setText(saved.text);
      if (saved.selectedKids?.length && !initialKidIds?.length) setSelectedKids(saved.selectedKids);
      if (saved.mood) setMood(saved.mood);
      if (saved.milestoneType && !initialMilestone) setMilestoneType(saved.milestoneType);
      if (saved.customMilestoneText && !initialCustomMilestone) setCustomMilestoneText(saved.customMilestoneText);
      if (saved.signedAs) setSignedAs(saved.signedAs);
      if (saved.location) setLocation(saved.location);
      if (saved.entryDate) setEntryDate(saved.entryDate);
      if (saved.song) setSong(saved.song);
      if (saved.people?.length) setPeople(saved.people);
      if (saved.mood || saved.milestoneType || saved.song || saved.people?.length) setShowExtras(true);
      setDraftRestored(true);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save draft (new entries only)
  useEffect(() => {
    if (existingEntry || !draftKey) return;
    const t = setTimeout(() => {
      try {
        if (!text.trim() && selectedKids.length === 0) {
          localStorage.removeItem(draftKey);
        } else {
          localStorage.setItem(draftKey, JSON.stringify({ text, selectedKids, mood, milestoneType, customMilestoneText, signedAs, location, entryDate, song, people }));
        }
      } catch {}
    }, 800);
    return () => clearTimeout(t);
  }, [text, selectedKids, mood, milestoneType, customMilestoneText, signedAs, location, entryDate, song, people]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const q = songQuery.trim();
    if (q.length < 2) { setSongResults([]); return; }
    const t = setTimeout(async () => {
      setSongSearching(true);
      try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=8`);
        const data = await res.json();
        setSongResults((data.results || []).filter(r => r.previewUrl));
      } catch {}
      setSongSearching(false);
    }, 500);
    return () => clearTimeout(t);
  }, [songQuery]);

  function toggleListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition is not supported in this browser.'); return; }
    if (listening) {
      recognitionRef.current?.stop();
      mediaRecorderRef.current?.stop();
      setListening(false);
      return;
    }
    // Capture audio alongside transcription so it can be saved with the entry
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        audioChunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
        recorder.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          if (audioChunksRef.current.length > 0) {
            const mimeType = audioChunksRef.current[0].type || 'audio/webm';
            const blob = new Blob(audioChunksRef.current, { type: mimeType });
            setVoiceMemoBlob(URL.createObjectURL(blob));
            setVoiceMemoUrl(null);
            setShowExtras(true);
          }
        };
        mediaRecorderRef.current = recorder;
        recorder.start();
      }).catch(() => {});
    }
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results).slice(e.resultIndex).map(r => r[0].transcript).join('');
      setText(prev => prev ? prev + ' ' + transcript : transcript);
    };
    recognition.onend = () => { mediaRecorderRef.current?.stop(); setListening(false); };
    recognition.onerror = () => { mediaRecorderRef.current?.stop(); setListening(false); };
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  const dateDisplay = new Date(entryDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const salutationName = useMemo(() => {
    if (selectedKids.length === 0) return null;
    const allTaggableKids = [...kids, ...friendKids];
    const names = selectedKids.map(id => allTaggableKids.find(k => k.id === id)?.name.split(' ')[0]).filter(Boolean);
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
  }, [selectedKids, kids]);

  function openDateEdit() {
    const [y, m, d] = entryDate.split('-');
    setEditYear(y); setEditMonth(m); setEditDay(String(parseInt(d)));
    setEditingDate(true);
  }

  function applyDate() {
    if (editMonth && editDay && editYear && editYear.length === 4) {
      setEntryDate(`${editYear}-${editMonth}-${editDay.padStart(2, '0')}`);
      setDateFromPhoto(false);
    }
    setEditingDate(false);
  }

  async function handleFileChange(e) {
    const raw = Array.from(e.target.files);
    e.target.value = '';

    const oversized = raw.filter(f => f.type.startsWith('video') && f.size > 100 * 1024 * 1024);
    const files = raw.filter(f => !oversized.includes(f));
    if (oversized.length > 0) {
      setMediaError(`Video too large (${Math.round(oversized[0].size / 1024 / 1024)}MB) — please trim it under 100MB before uploading.`);
    } else {
      setMediaError('');
    }
    if (files.length === 0) return;

    // Show previews immediately — don't wait for compression
    const fileEntries = files.map(file => ({
      url: URL.createObjectURL(file),
      isVideo: file.type.startsWith('video'),
      file,
    }));
    setMedia(prev => [...prev, ...fileEntries.map(({ url, isVideo }) => ({
      url, type: isVideo ? 'video' : 'image', thumbnail: null,
    }))]);
    setFileObjects(prev => [...prev, ...fileEntries.map(e => e.file)]);

    // Compress images + generate video thumbnails in background
    fileEntries.forEach(({ url, isVideo, file }) => {
      if (!isVideo) {
        compressedFilesRef.current.set(url, compressImage(file));
      } else {
        generateVideoThumbnail(file).then(thumbnail => {
          if (!mountedRef.current || !thumbnail) return;
          setMedia(prev => prev.map(m => m.url === url ? { ...m, thumbnail } : m));
        });
      }
    });
    if (!dateFromPhoto) {
      for (const file of files) {
        if (file.type.startsWith('image')) {
          try {
            const exifr = await loadExifr();
            const tags = await exifr.parse(file, ['DateTimeOriginal']);
            if (tags?.DateTimeOriginal) {
              const d = new Date(tags.DateTimeOriginal);
              setEntryDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
              setDateFromPhoto(true);
              break;
            }
          } catch {}
        } else if (file.type.startsWith('video') && file.lastModified) {
          const d = new Date(file.lastModified);
          setEntryDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
          setDateFromPhoto(true);
          break;
        }
      }
    }
    if (!locationFromPhoto) {
      for (const file of files) {
        if (!file.type.startsWith('image')) continue;
        try {
          const exifr = await loadExifr();
          const tags = await exifr.parse(file, ['GPSLatitude', 'GPSLongitude']);
          if (tags?.GPSLatitude && tags?.GPSLongitude) {
            const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${tags.GPSLatitude},${tags.GPSLongitude}&key=${import.meta.env.VITE_GOOGLE_PLACES_KEY}`);
            const geo = await res.json();
            const components = geo.results?.[0]?.address_components || [];
            const get = type => components.find(c => c.types.includes(type))?.long_name;
            const loc = [get('locality') || get('sublocality'), get('administrative_area_level_1')].filter(Boolean).join(', ');
            if (loc && mountedRef.current) { setLocation(loc); setLocationFromPhoto(true); }
            break;
          }
        } catch {}
      }
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const imagePayloads = [];
      let location = null;
      for (let i = 0; i < media.length; i++) {
        if (media[i].type !== 'image') continue;
        const file = fileObjects[i];
        if (!file) continue;
        // Extract GPS from first image
        if (!location) {
          try {
            const exifr = await loadExifr();
            const tags = await exifr.parse(file, ['GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef']);
            if (tags?.GPSLatitude && tags?.GPSLongitude) {
              const lat = tags.GPSLatitude;
              const lng = tags.GPSLongitude;
              const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${import.meta.env.VITE_GOOGLE_PLACES_KEY}`);
              const geo = await res.json();
              const comps = geo.results?.[0]?.address_components || [];
              const getC = type => comps.find(c => c.types.includes(type))?.long_name;
              location = [getC('locality') || getC('sublocality'), getC('administrative_area_level_1')].filter(Boolean).join(', ');
            }
          } catch {}
        }
        const base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result.split(',')[1]);
          reader.readAsDataURL(file);
        });
        imagePayloads.push({ data: base64, mediaType: file.type || 'image/jpeg' });
      }
      const _allTaggable = [...kids, ...friendKids];
      const kidNames = selectedKids
        .map(id => _allTaggable.find(k => k.id === id)?.name.split(' ')[0])
        .filter(Boolean).join(' and ');
      const primaryKid = kids.find(k => selectedKids.includes(k.id)) ?? friendKids.find(k => selectedKids.includes(k.id));
      const ageMonths = primaryKid ? Math.max(0,
        (new Date(entryDate + 'T12:00:00').getFullYear() - new Date(primaryKid.birthdate + 'T12:00:00').getFullYear()) * 12 +
        (new Date(entryDate + 'T12:00:00').getMonth() - new Date(primaryKid.birthdate + 'T12:00:00').getMonth())
      ) : null;
      const { data, error } = await supabase.functions.invoke('generate-entry', {
        body: { images: imagePayloads, kidNames, ageMonths, location },
      });
      if (error) throw new Error(data?.error || error.message);
      if (data?.text) setText(data.text);
    } catch (err) {
      alert('Could not generate — try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function handlePolish() {
    if (!text.trim()) return;
    setPolishing(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-entry', {
        body: { mode: 'polish', draftText: text.trim() },
      });
      if (error) throw new Error(data?.error || error.message);
      if (data?.text) setText(data.text);
    } catch {
      alert('Could not fix grammar — try again.');
    } finally {
      setPolishing(false);
    }
  }

  async function handleSave() {
    if (draftKey) { try { localStorage.removeItem(draftKey); } catch {} }
    setSaving(true);
    try {
      await onSave({
        kids: selectedKids,
        text: text.trim(),
        mood: mood || null,
        milestone: milestoneType === 'custom' ? (customMilestoneText.trim() ? `custom:${customMilestoneText.trim()}` : null) : milestoneType || null,
        media,
        fileObjects,
        compressedFiles: compressedFilesRef.current,
        date: entryDate,
        entryId: existingEntry?.id,
        signedAs: signedAs.trim() || null,
        location: location.trim() || null,
        locationLat: locationCoords?.lat ?? null,
        locationLng: locationCoords?.lng ?? null,
        song: song || null,
        sharedWith,
        people: peopleInput.trim() && !people.includes(peopleInput.trim())
          ? [...people, peopleInput.trim()]
          : people,
        voiceMemoBlob,
        voiceMemoUrl,
        type: mode,
        prompt: isNote ? (promptText || null) : null,
      });
    } catch (err) {
      alert('Something went wrong saving your entry: ' + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  }

  const canSave = selectedKids.length > 0 && (text.trim().length > 0 || media.length > 0);

  return (
    <div className="screen" style={{ background: 'var(--bg-card)', position: 'relative' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', flexShrink: 0, position: 'relative' }}>
        <button className="icon-btn" onClick={onCancel}><i className="ti ti-x" /></button>
        {isNote && (
          <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: "'Urbanist', sans-serif" }}>
            {existingEntry ? 'Edit note' : 'New note'}
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {existingEntry && onDelete && (
            <button className="icon-btn" onClick={() => setShowDeleteConfirm(true)} style={{ color: '#D4856A', borderColor: 'rgba(212,133,106,0.35)' }}>
              <i className="ti ti-trash" />
            </button>
          )}
          <button
            className="btn btn-primary"
            style={{ padding: '9px 22px', fontSize: 14, borderRadius: 10, opacity: canSave && !saving ? 1 : 0.4 }}
            disabled={!canSave || saving}
            onClick={handleSave}
          >
            {saving ? 'Saving…' : existingEntry ? 'Update' : 'Save'}
          </button>
        </div>
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileChange} />
        <input ref={uploadInputRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={handleFileChange} />
      </div>

      {/* Letter body */}
      <div className="scroll-area" style={{ padding: '4px 24px 20px' }}>

        {draftRestored && (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <i className="ti ti-pencil" style={{ color: 'var(--accent)', fontSize: 14, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--accent)', fontWeight: 500 }}>Draft restored</span>
            <button
              onClick={() => {
                try { if (draftKey) localStorage.removeItem(draftKey); } catch {}
                setText('');
                setSelectedKids(kids.length === 1 ? [kids[0].id] : []);
                setMood(null); setMilestoneType(null); setCustomMilestoneText('');
                setSignedAs(signedDefault ?? ''); setLocation(''); setEntryDate(TODAY);
                setDraftRestored(false);
              }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: 0, flexShrink: 0 }}
            >
              Discard
            </button>
          </div>
        )}


        {/* Kid picker + greeting/date */}
        {isNote ? (
          <div style={{ marginBottom: 20 }}>
            <div className="scrollx" style={{ marginBottom: 4 }}>
              {kids.map(k => (
                <KidChip key={k.id} kid={k} active={selectedKids.includes(k.id)} onClick={() => setSelectedKids(prev => prev.includes(k.id) ? prev.filter(id => id !== k.id) : [...prev, k.id])} />
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif", margin: '10px 2px 0' }}>Today &middot; {dateDisplay}</p>
          </div>
        ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          {selectedKids.length > 0 ? (
            <>
              <div
                style={{ display: 'flex', justifyContent: 'center', cursor: 'pointer' }}
                onClick={() => { setShowKidPicker(true);}}
              >
                {selectedKids.map((id, i) => {
                  const k = kids.find(kid => kid.id === id) ?? friendKids.find(kid => kid.id === id);
                  if (!k) return null;
                  return (
                    <div key={id} style={{ width: 68, height: 68, borderRadius: '50%', background: k.accent || 'var(--border)', border: '3px solid var(--bg-card)', marginLeft: i > 0 ? -18 : 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {k.avatar
                        ? <img src={cloudinaryTransform(k.avatar, 'w_136,h_136,c_fill,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: 26, fontWeight: 700, color: '#fff' }}>{k.name.charAt(0)}</span>}
                    </div>
                  );
                })}
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 20, color: 'var(--accent)', margin: '0 0 6px' }}>
                  Dear {salutationName},
                </p>
                <button onClick={openDateEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif", padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <i className="ti ti-calendar" style={{ fontSize: 12 }} />
                  {dateDisplay}
                  {dateFromPhoto && <span style={{ fontSize: 10 }}>· photo</span>}
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <button onClick={() => { setShowKidPicker(true);}} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 15, color: 'var(--border)', fontFamily: "'Urbanist', sans-serif", fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                Who is this for?
                <i className="ti ti-chevron-down" style={{ fontSize: 13 }} />
              </button>
              <button onClick={openDateEdit} style={{ background: 'var(--bg-card)', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-2)', fontFamily: "'Urbanist', sans-serif", padding: '6px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
                <i className="ti ti-calendar" style={{ fontSize: 13 }} />
                {dateDisplay}
                {dateFromPhoto && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>· photo</span>}
              </button>
            </div>
          )}
        </div>
        )}

        {/* Photo preview */}
        {mediaError && (
          <div style={{ background: 'rgba(196,160,156,0.15)', border: '1px solid rgba(196,160,156,0.4)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <i className="ti ti-alert-circle" style={{ color: '#C4A09C', fontSize: 15, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: '#C4A09C' }}>{mediaError}</span>
            <button onClick={() => setMediaError('')} style={{ background: 'none', border: 'none', color: '#C4A09C', cursor: 'pointer', padding: 0, fontSize: 14 }}><i className="ti ti-x" /></button>
          </div>
        )}

        {media.length > 0 && (
          <div style={{ marginBottom: 20, display: 'flex', gap: 8, justifyContent: 'center', overflowX: 'auto', paddingBottom: 2 }}>
            {media.map((item, i) => (
              <div key={i} style={{ width: 165, aspectRatio: '4/3', borderRadius: 12, overflow: 'hidden', position: 'relative', flexShrink: 0, cursor: 'pointer' }} onClick={() => setPreviewMedia(item)}>
                {item.type === 'video'
                  ? item.thumbnail
                    ? <img src={item.thumbnail} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : <video src={item.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} preload="metadata" muted playsInline />
                  : <img src={item.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                }
                <button onClick={e => { e.stopPropagation(); const it = media[i]; if (it.url?.startsWith('blob:')) URL.revokeObjectURL(it.url); setMedia(prev => prev.filter((_, idx) => idx !== i)); setFileObjects(prev => prev.filter((_, idx) => idx !== i)); }} style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ti ti-x" />
                </button>
                {item.type === 'video' && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="ti ti-player-play-filled" style={{ color: '#fff', fontSize: 12 }} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}


        {/* Tap to speak */}
        {!isNote && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <button
            onClick={toggleListening}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '14px 28px', borderRadius: 999,
              background: listening ? '#F0897A' : 'var(--bg-elevated)',
              border: 'none', cursor: 'pointer',
              color: listening ? '#fff' : 'var(--accent)',
              animation: listening ? 'mic-pulse 1.5s ease-in-out infinite' : 'none',
              transition: 'background 0.2s, color 0.2s',
            }}
          >
            <i className="ti ti-microphone" style={{ fontSize: 20 }} />
            <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "'Urbanist', sans-serif", letterSpacing: 0.2 }}>
              {listening ? 'Listening…' : 'Tap to speak'}
            </span>
          </button>
        </div>
        )}

        {/* Prompt banner */}
        {isNote && promptText && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(200,153,62,0.12)', border: '1px solid rgba(200,153,62,0.3)', borderRadius: 12, padding: '11px 12px', marginBottom: 14 }}>
            <i className="ti ti-bulb" style={{ fontSize: 16, color: '#C8993E', flexShrink: 0 }} />
            <p style={{ flex: 1, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 14, color: 'var(--text)', margin: 0, lineHeight: 1.4 }}>{promptText}</p>
            <button
              onClick={() => setPromptText(NOTE_PROMPTS[Math.floor(Math.random() * NOTE_PROMPTS.length)])}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C8993E', padding: 4, display: 'flex', flexShrink: 0 }}
            >
              <i className="ti ti-refresh" style={{ fontSize: 15 }} />
            </button>
          </div>
        )}

        {/* Writing area */}
        <textarea
          autoFocus={isNote}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={isNote ? (promptText ? 'Type your answer…' : 'What just happened?') : 'You did the most surprising thing today. I never want you to forget what it felt like to be there…'}
          style={isNote ? {
            width: '100%', border: '1px solid rgba(74,94,80,0.16)', outline: 'none', resize: 'none',
            background: 'rgba(74,94,80,0.06)', borderRadius: 14, fontFamily: "'Source Serif 4', serif",
            fontStyle: 'italic', fontSize: 17, lineHeight: 1.75, color: 'var(--text)',
            minHeight: '30vh', padding: 16,
          } : {
            width: '100%', border: 'none', outline: 'none', resize: 'none',
            background: 'transparent', fontFamily: "'Source Serif 4', serif",
            fontStyle: 'italic', fontSize: 17, lineHeight: 1.85, color: 'var(--text)',
            minHeight: 'calc(60vh - 80px)', padding: 0,
          }}
        />


        {/* Sign-off */}
        {!isNote && signedDefault && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16 }}>
            <span style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 17, color: 'var(--text-muted)' }}>Love,</span>
            <input
              value={signedAs}
              onChange={e => setSignedAs(e.target.value)}
              placeholder={signedDefault}
              style={{ border: 'none', outline: 'none', background: 'transparent', fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 17, color: 'var(--accent)', width: '100%', padding: 0 }}
            />
          </div>
        )}

        {/* Location row */}
        {!isNote && (
        <div style={{ marginTop: 10 }}>
          <LocationInput value={location} onChange={v => { setLocation(v); if (!v) setLocationCoords(null); }} onChangeCoords={(lat, lng) => setLocationCoords(lat != null ? { lat, lng } : null)} placeholder="Add location" compact />
        </div>
        )}

        {/* Fullscreen photo preview */}
        {previewMedia && (
          <div onClick={() => setPreviewMedia(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {previewMedia.type === 'video'
              ? <video src={previewMedia.url} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} controls autoPlay playsInline onClick={e => e.stopPropagation()} />
              : <img src={previewMedia.url} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} alt="" />
            }
            <button onClick={() => setPreviewMedia(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18 }}>
              <i className="ti ti-x" />
            </button>
          </div>
        )}

        {/* Extras: mood + milestone */}
        {!isNote && showExtras && (
          <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #D4E4D0', display: 'flex', flexDirection: 'column', gap: 24 }}>

            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Soundtrack</p>
              {song ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 13, padding: '12px 14px' }}>
                  <i className="ti ti-music" style={{ fontSize: 15, color: '#F45B54', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>{song.artist}</p>
                  </div>
                  <button onClick={() => setSong(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 4, display: 'flex' }}><i className="ti ti-x" /></button>
                </div>
              ) : (
                <button onClick={() => setShowSongPicker(true)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-input)', border: '1px dashed var(--border)', borderRadius: 13, padding: '12px 14px', width: '100%', cursor: 'pointer', fontFamily: "'Urbanist', sans-serif" }}>
                  <i className="ti ti-music" style={{ fontSize: 15, color: '#F45B54' }} />
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>Add a soundtrack</span>
                </button>
              )}
            </div>

            {(voiceMemoBlob || voiceMemoUrl) && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Voice Memo</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 13, padding: '12px 14px' }}>
                  <i className="ti ti-microphone" style={{ fontSize: 15, color: 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>Voice captured</span>
                  <button onClick={() => { setVoiceMemoBlob(null); setVoiceMemoUrl(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 4, display: 'flex' }}><i className="ti ti-x" /></button>
                </div>
              </div>
            )}

            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>How are you feeling?</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  { label: 'Proud',     emoji: '🌟' },
                  { label: 'Joyful',    emoji: '☀️' },
                  { label: 'Surprised', emoji: '✨' },
                  { label: 'Exhausted', emoji: '🌙' },
                  { label: 'Grateful',  emoji: '🤍' },
                  { label: 'Nostalgic', emoji: '🍂' },
                ].map(({ label, emoji }) => {
                  const active = mood === label;
                  return (
                    <div
                      key={label}
                      onClick={() => setMood(active ? null : label)}
                      style={{
                        background: active ? 'var(--accent)' : 'var(--bg-input)',
                        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 14, padding: '14px 8px 12px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontSize: 24, lineHeight: 1 }}>{emoji}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: active ? '#fff' : 'var(--text-2)', letterSpacing: 0.2 }}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Mark as milestone?</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {MILESTONE_TYPES.map(mt => {
                  const active = milestoneType === mt.id;
                  return (
                    <div
                      key={mt.id}
                      onClick={() => setMilestoneType(active ? null : mt.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 13,
                        background: active ? 'var(--accent)' : 'var(--bg-input)',
                        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 13, padding: '13px 16px', cursor: 'pointer',
                      }}
                    >
                      <i className={`ti ${mt.icon}`} style={{ fontSize: 19, color: active ? '#C8993E' : 'var(--text-muted)', flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: active ? '#fff' : 'var(--text)', flex: 1 }}>{mt.label}</span>
                      {active && <i className="ti ti-check" style={{ color: '#C8993E', fontSize: 16 }} />}
                    </div>
                  );
                })}
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 13,
                    background: milestoneType === 'custom' ? 'var(--accent)' : 'var(--bg-input)',
                    border: `1px solid ${milestoneType === 'custom' ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 13, padding: '13px 16px', cursor: 'pointer',
                  }}
                  onClick={() => setMilestoneType(milestoneType === 'custom' ? null : 'custom')}
                >
                  <i className="ti ti-star" style={{ fontSize: 19, color: milestoneType === 'custom' ? '#C8993E' : 'var(--text-muted)', flexShrink: 0 }} />
                  {milestoneType === 'custom' ? (
                    <input
                      autoFocus
                      value={customMilestoneText}
                      onChange={e => setCustomMilestoneText(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      placeholder="Name this milestone…"
                      style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, fontWeight: 600, color: '#fff', fontFamily: "'Urbanist', sans-serif" }}
                    />
                  ) : (
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', flex: 1 }}>Something else…</span>
                  )}
                </div>
              </div>
            </div>

            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Who else was there?</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 13, padding: '10px 14px' }}>
                {people.map(p => (
                  <div key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'var(--bg-elevated)', borderRadius: 999, padding: '3px 6px 3px 10px', fontSize: 13, color: 'var(--text-2)' }}>
                    {p}
                    <button onClick={() => setPeople(prev => prev.filter(n => n !== p))} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', borderRadius: '50%' }}>
                      <i className="ti ti-x" style={{ fontSize: 10 }} />
                    </button>
                  </div>
                ))}
                <div style={{ position: 'relative' }}>
                  <input
                    value={peopleInput}
                    onChange={e => setPeopleInput(e.target.value)}
                    onKeyDown={e => {
                      if ((e.key === 'Enter' || e.key === ',') && peopleInput.trim()) {
                        e.preventDefault();
                        const name = peopleInput.trim().replace(/,$/, '');
                        if (name && !people.includes(name)) setPeople(prev => [...prev, name]);
                        setPeopleInput('');
                      } else if (e.key === 'Backspace' && !peopleInput && people.length > 0) {
                        setPeople(prev => prev.slice(0, -1));
                      }
                    }}
                    onBlur={() => {
                      const name = peopleInput.trim();
                      if (name && !people.includes(name)) setPeople(prev => [...prev, name]);
                      setPeopleInput('');
                    }}
                    placeholder={people.length === 0 ? 'Add a name…' : '+'}
                    style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 16, color: 'var(--text)', fontFamily: 'Inter, sans-serif', width: peopleInput ? `${Math.max(peopleInput.length + 2, 4)}ch` : people.length === 0 ? '12ch' : '3ch', minWidth: '2ch' }}
                  />
                  {peopleInput.trim().length > 0 && (() => {
                    const q = peopleInput.toLowerCase();
                    const kidSuggestions = friendKids.filter(k => k.name.toLowerCase().includes(q) && !selectedKids.includes(k.id));
                    const peopleSuggestions = allPeople.filter(p => p.toLowerCase().includes(q) && !people.includes(p)).slice(0, 5);
                    if (kidSuggestions.length === 0 && peopleSuggestions.length === 0) return null;
                    return (
                      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 150 }}>
                        {kidSuggestions.map(k => (
                          <button key={k.id} onMouseDown={e => { e.preventDefault(); setSelectedKids(prev => [...prev, k.id]); setPeopleInput(''); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, color: 'var(--text)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                            <KidThumb kid={k} size={20} />
                            {k.name}
                          </button>
                        ))}
                        {peopleSuggestions.map(p => (
                          <button key={p} onMouseDown={e => { e.preventDefault(); setPeople(prev => [...prev, p]); setPeopleInput(''); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, color: 'var(--text)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                            <i className="ti ti-user" style={{ fontSize: 12, color: 'var(--text-muted)' }} />
                            {p}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Bottom toolbar */}
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border-light)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: isNote ? 'flex-start' : 'space-evenly', gap: isNote ? 8 : 0, padding: isNote ? '6px 12px' : '6px 8px', paddingBottom: `max(6px, env(safe-area-inset-bottom))` }}>
        {/* Camera */}
        <div style={{ position: 'relative' }}>
          {showMediaMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setShowMediaMenu(false)} />
              <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 -4px 20px rgba(0,0,0,0.1)', minWidth: 210, zIndex: 10 }}>
                <button onClick={() => { cameraInputRef.current?.click(); setShowMediaMenu(false); }} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '13px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text)', fontFamily: "'Urbanist', sans-serif", fontWeight: 500 }}>
                  <i className="ti ti-camera" style={{ fontSize: 17, color: 'var(--accent)' }} /> Take a photo
                </button>
                <div style={{ height: 1, background: 'var(--border)' }} />
                <button onClick={() => { uploadInputRef.current?.click(); setShowMediaMenu(false); }} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '13px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text)', fontFamily: "'Urbanist', sans-serif", fontWeight: 500 }}>
                  <i className="ti ti-photo" style={{ fontSize: 17, color: 'var(--accent)' }} /> Upload from library
                </button>
              </div>
            </>
          )}
          <button onClick={() => setShowMediaMenu(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: showMediaMenu ? 'var(--accent)' : 'var(--text-muted)', fontSize: 22, borderRadius: 10 }}>
            <i className="ti ti-camera" />
          </button>
        </div>
        {isNote && (
          <>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif" }}>Add a photo &mdash; optional</span>
            <button onClick={() => setShowSharePicker(true)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, padding: '7px 10px', borderRadius: 10, color: Object.values(sharedWith).some(Boolean) ? 'var(--accent)' : 'var(--text-muted)', fontSize: 12, fontWeight: 600, fontFamily: "'Urbanist', sans-serif" }}>
              <i className={`ti ${Object.values(sharedWith).some(Boolean) ? 'ti-users' : 'ti-lock'}`} style={{ fontSize: 15 }} />
              {Object.values(sharedWith).some(Boolean) ? 'Share' : 'Private'}
            </button>
          </>
        )}
        {!isNote && (
        <>
        {/* Mic */}
        <button onClick={toggleListening} style={{ background: 'none', border: 'none', cursor: 'pointer', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: listening ? '#F0897A' : 'var(--text-muted)', fontSize: 22, borderRadius: 10, animation: listening ? 'mic-pulse 1.5s ease-in-out infinite' : 'none' }}>
          <i className="ti ti-microphone" />
        </button>
        {/* Write for me */}
        {selectedKids.length > 0 && (
          <button onClick={handleGenerate} disabled={generating || polishing} style={{ background: 'none', border: 'none', cursor: generating ? 'default' : 'pointer', height: 44, display: 'flex', alignItems: 'center', gap: 5, padding: '0 10px', color: generating ? 'var(--border)' : 'var(--accent)', fontSize: 13, fontWeight: 600, fontFamily: "'Urbanist', sans-serif", borderRadius: 10 }}>
            <i className="ti ti-sparkles" style={{ fontSize: 15, animation: generating ? 'spin 1s linear infinite' : 'none' }} />
            {generating ? 'Writing…' : 'Write for me'}
          </button>
        )}
        {/* Fix grammar */}
        {text.trim().length > 0 && !generating && (
          <button onClick={handlePolish} disabled={polishing} style={{ background: 'none', border: 'none', cursor: polishing ? 'default' : 'pointer', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: polishing ? 'var(--border)' : 'var(--text-muted)', fontSize: 22, borderRadius: 10 }}>
            <i className="ti ti-writing" style={{ animation: polishing ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        )}
        {/* Sharing */}
        <button onClick={() => setShowSharePicker(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', width: 44, height: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, color: Object.values(sharedWith).some(Boolean) ? 'var(--accent)' : 'var(--text-muted)', borderRadius: 10 }}>
          <i className={`ti ${Object.values(sharedWith).some(Boolean) ? 'ti-users' : 'ti-lock'}`} style={{ fontSize: 18 }} />
          <span style={{ fontSize: 9, fontWeight: 600, fontFamily: "'Urbanist', sans-serif", letterSpacing: 0.2, lineHeight: 1 }}>
            {Object.values(sharedWith).some(Boolean) ? 'All' : 'Private'}
          </span>
        </button>
        {/* More */}
        <button onClick={() => setShowExtras(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: showExtras ? 'var(--accent)' : 'var(--text-muted)', fontSize: 22, borderRadius: 10 }}>
          <i className="ti ti-dots" />
        </button>
        </>
        )}
      </div>

      {/* Song picker sheet */}
      {showSongPicker && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 11 }} onClick={() => { setShowSongPicker(false); setSongQuery(''); setSongResults([]); }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <i className="ti ti-music" style={{ fontSize: 20, color: '#F45B54' }} />
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0, flex: 1 }}>Soundtrack</p>
              {song && (
                <button onClick={() => { setSong(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif", padding: 0 }}>Remove</button>
              )}
            </div>
            {song ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-elevated)', borderRadius: 14, padding: '12px 14px' }}>
                <img src={song.artworkUrl} style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} alt="" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>{song.artist}</p>
                </div>
                <button onClick={() => { setSong(null); setSongQuery(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', fontFamily: "'Urbanist', sans-serif", padding: 0, fontWeight: 600 }}>Change</button>
              </div>
            ) : (
              <div>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <input
                    autoFocus
                    value={songQuery}
                    onChange={e => setSongQuery(e.target.value)}
                    placeholder="Search for a song…"
                    className="input-field"
                    style={{ paddingRight: 40 }}
                  />
                  {songSearching && (
                    <i className="ti ti-loader-2" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', animation: 'spin 1s linear infinite', color: 'var(--text-muted)', fontSize: 16 }} />
                  )}
                </div>
                {songResults.length > 0 && (
                  <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    {songResults.map((r, i) => (
                      <button
                        key={r.trackId}
                        onClick={() => { setSong({ name: r.trackName, artist: r.artistName, artworkUrl: r.artworkUrl100.replace('100x100bb', '300x300bb'), previewUrl: r.previewUrl }); setSongQuery(''); setSongResults([]); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', border: 'none', borderBottom: i < songResults.length - 1 ? '1px solid var(--border)' : 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: "'Urbanist', sans-serif" }}
                      >
                        <img src={r.artworkUrl100} style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} alt="" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.trackName}</p>
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.artistName}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Date edit sheet */}
      {editingDate && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '0 16px' }} onClick={() => setEditingDate(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>When did this happen?</p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <div style={{ position: 'relative', flex: 2.2 }}>
                <select value={editMonth} onChange={e => setEditMonth(e.target.value)} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 36px 14px 14px', fontSize: 16, outline: 'none', background: 'var(--bg-input)', color: editMonth ? 'var(--text)' : 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif", appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}>
                  <option value="" disabled>Month</option>
                  {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                    <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                  ))}
                </select>
                <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13, pointerEvents: 'none' }} />
              </div>
              <input type="number" placeholder="Day" value={editDay} min={1} max={31} onChange={e => setEditDay(e.target.value)} style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 10, padding: '14px 10px', fontSize: 16, outline: 'none', background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'Urbanist', sans-serif", textAlign: 'center' }} />
              <input type="number" placeholder="Year" value={editYear} min={1900} max={2030} onChange={e => setEditYear(e.target.value)} style={{ flex: 1.5, border: '1px solid var(--border)', borderRadius: 10, padding: '14px 10px', fontSize: 16, outline: 'none', background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'Urbanist', sans-serif", textAlign: 'center' }} />
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={applyDate}>Done</button>
          </div>
        </div>
      )}

      {/* Delete confirmation sheet */}
      {showDeleteConfirm && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 11 }} onClick={() => setShowDeleteConfirm(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', padding: '28px 24px 36px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(212,133,106,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <i className="ti ti-trash" style={{ fontSize: 19, color: '#D4856A' }} />
            </div>
            <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px', textAlign: 'center' }}>Delete this entry?</p>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', textAlign: 'center' }}>This can't be undone.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="btn" style={{ flex: 1, background: '#D4856A', color: '#fff' }} onClick={() => { setShowDeleteConfirm(false); onDelete(existingEntry.id); }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Kid picker sheet */}
      {showSharePicker && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.4)', zIndex: 30, display: 'flex', alignItems: 'flex-end' }} onClick={() => setShowSharePicker(false)}>
          <div className="quick-sheet" style={{ background: 'var(--bg)', borderRadius: '24px 24px 0 0', width: '100%', padding: '20px 20px 36px' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 20px' }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 14px' }}>Who can see this?</p>
            {[
              { icon: 'ti-lock', label: 'Private', sub: 'Only you', value: { partner: false, friends: false } },
              { icon: 'ti-world', label: 'All', sub: 'Your friends and family', value: { partner: true, friends: true } },
            ].map(opt => {
              const active = opt.value.partner === Object.values(sharedWith).some(Boolean);
              return (
                <div key={opt.label} onClick={() => { setSharedWith(opt.value); setShowSharePicker(false); }} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: active ? 'var(--accent)' : 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s' }}>
                    <i className={`ti ${opt.icon}`} style={{ fontSize: 18, color: active ? '#fff' : 'var(--accent)' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{opt.label}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{opt.sub}</p>
                  </div>
                  {active && <i className="ti ti-check" style={{ fontSize: 16, color: 'var(--accent)' }} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showKidPicker && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '0 16px' }} onClick={() => setShowKidPicker(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>Who's this for?</p>
            <>
              {kids.map(k => {
                const selected = selectedKids.includes(k.id);
                return (
                  <div key={k.id} onClick={() => setSelectedKids(prev => selected ? prev.filter(id => id !== k.id) : [...prev, k.id])} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                    <KidThumb kid={k} size={36} />
                    <span style={{ fontSize: 16, color: 'var(--text)', fontWeight: 600 }}>{k.name}</span>
                    <div style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: '50%', border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`, background: selected ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {selected && <i className="ti ti-check" style={{ color: '#fff', fontSize: 12 }} />}
                    </div>
                  </div>
                );
              })}
            </>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 20 }} onClick={() => setShowKidPicker(false)}>Done</button>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Celebration overlay ───────────────────────────────────────────────────

function CelebrationOverlay({ kid, milestoneType, onDone }) {
  const m = milestoneInfo(milestoneType) || { label: 'Milestone', icon: 'ti-star' };
  const colors = ['#C8993E', '#D4856A', '#7BA99A', '#6A9EB0', '#A889B0'];
  const [pieces, setPieces] = useState([]);

  useEffect(() => {
    const newPieces = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      size: 5 + Math.random() * 6,
      left: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 0.4,
    }));
    setPieces(newPieces);
  }, []);

  return (
    <div className="celebrate-overlay">
      {pieces.map(p => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{ width: p.size, height: p.size, left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s` }}
        />
      ))}
      <div style={{ width: 76, height: 76, borderRadius: '50%', overflow: 'hidden' }}>
        <KidThumb kid={kid} size={76} />
      </div>
      <h2 style={{ fontSize: 23, color: 'var(--accent)', margin: 0, fontWeight: 800 }}>Milestone unlocked</h2>
      <p style={{ fontSize: 15, color: 'var(--text-2)', margin: 0 }}>
        {kid.name} just hit: <strong style={{ color: 'var(--accent)' }}>{m.label}</strong>
      </p>
      <button className="btn btn-primary" style={{ marginTop: 10, width: 'auto', padding: '13px 28px' }} onClick={onDone}>
        See it in the journal
      </button>
    </div>
  );
}

// ─── Circle feed screen ───────────────────────────────────────────────────

function CircleFeedScreen({ onBack, friendKids = [], friendFamilyMap = {}, onCompareAtAge, onSwitchSection }) {
  const { userId: currentUserId, myDisplayName, familyMembers = [] } = useSession() ?? {};
  const { pendingRequestCount = 0, circleBadge = 0 } = useNotif() ?? {};
  const socialName = familyMembers.find(m => m.user_id === currentUserId)?.real_name || myDisplayName || '';
  const [loading, setLoading] = useState(true);
  const [feedEntries, setFeedEntries] = useState([]);
  const [likesMap, setLikesMap] = useState({});   // entryId -> [{id, user_id, display_name}]
  const [commentsMap, setCommentsMap] = useState({}); // entryId -> [{id, user_id, display_name, body, created_at}]
  const [commentDrafts, setCommentDrafts] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef(null);
  const [profileFamilyId, setProfileFamilyId] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [likeAnimId, setLikeAnimId] = useState(null);
  const [playingVideoId, setPlayingVideoId] = useState(null);
  const lastTapRef = useRef({});

  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

  const familyIds = useMemo(() => Object.keys(friendFamilyMap), [friendFamilyMap]);
  const scrollRef = useRef(null);

  async function loadFeed() {
    if (!supabase || familyIds.length === 0) return;
    const { data: entriesData } = await supabase
      .from('entries')
      .select('id, date, created_at, kid_ids, mood, milestone, age_months, family_id, user_id, entry_media!inner(url, type)')
      .in('family_id', familyIds)
      .neq('shared', false)
      .order('created_at', { ascending: false })
      .limit(200);

    const normalized = (entriesData || []).map(e => ({
      id: e.id,
      date: e.date,
      createdAt: e.created_at,
      kids: e.kid_ids || [],
      milestone: e.milestone || null,
      ageMonths: e.age_months,
      familyId: e.family_id,
      userId: e.user_id,
      media: (e.entry_media || []).map(m => ({ url: m.url, type: m.type })),
    }));

    setFeedEntries(normalized);

    if (normalized.length > 0) {
      const ids = normalized.map(e => e.id);
      const [{ data: likes }, { data: comments }] = await Promise.all([
        supabase.from('entry_likes').select('id, entry_id, user_id, display_name').in('entry_id', ids),
        supabase.from('entry_comments').select('id, entry_id, user_id, display_name, body, created_at').in('entry_id', ids).is('parent_id', null).order('created_at'),
      ]);
      const lMap = {};
      (likes || []).forEach(l => {
        if (!lMap[l.entry_id]) lMap[l.entry_id] = [];
        lMap[l.entry_id].push(l);
      });
      const cMap = {};
      (comments || []).forEach(c => {
        if (!cMap[c.entry_id]) cMap[c.entry_id] = [];
        cMap[c.entry_id].push(c);
      });
      setLikesMap(lMap);
      setCommentsMap(cMap);
    }
  }

  useEffect(() => {
    if (!supabase || familyIds.length === 0) { setLoading(false); return; }
    loadFeed().finally(() => setLoading(false));
  }, [familyIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const ptr = usePullToRefresh(scrollRef, loadFeed);

  async function handleToggleLike(entryId) {
    if (!supabase || !currentUserId) return;
    const existing = (likesMap[entryId] || []).find(l => l.user_id === currentUserId);
    if (existing) {
      setLikesMap(prev => ({ ...prev, [entryId]: prev[entryId].filter(l => l.id !== existing.id) }));
      await supabase.from('entry_likes').delete().eq('id', existing.id).eq('user_id', currentUserId);
    } else {
      const temp = { id: 'tmp-' + Date.now(), entry_id: entryId, user_id: currentUserId, display_name: socialName };
      setLikesMap(prev => ({ ...prev, [entryId]: [...(prev[entryId] || []), temp] }));
      setLikeAnimId(entryId);
      setTimeout(() => setLikeAnimId(id => id === entryId ? null : id), 800);
      const { data } = await supabase.from('entry_likes').insert({ entry_id: entryId, user_id: currentUserId, display_name: socialName }).select('id, entry_id, user_id, display_name').single();
      if (data) setLikesMap(prev => ({ ...prev, [entryId]: (prev[entryId] || []).map(l => l.id === temp.id ? data : l) }));
    }
  }

  async function handleSubmitComment(entryId) {
    const body = (commentDrafts[entryId] || '').trim();
    if (!body || !supabase || !currentUserId) return;
    setCommentDrafts(prev => ({ ...prev, [entryId]: '' }));
    const temp = { id: 'tmp-' + Date.now(), entry_id: entryId, user_id: currentUserId, display_name: socialName, body, created_at: new Date().toISOString() };
    setCommentsMap(prev => ({ ...prev, [entryId]: [...(prev[entryId] || []), temp] }));
    const { data } = await supabase.from('entry_comments').insert({ entry_id: entryId, user_id: currentUserId, display_name: socialName, body }).select('id, entry_id, user_id, display_name, body, created_at').single();
    if (data) setCommentsMap(prev => ({ ...prev, [entryId]: (prev[entryId] || []).map(c => c.id === temp.id ? data : c) }));
  }

  const displayedEntries = useMemo(() => {
    let pool = profileFamilyId
      ? feedEntries.filter(e => e.familyId === profileFamilyId)
      : feedEntries;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      pool = pool.filter(e => {
        const entryKids = friendKids.filter(k => e.kids.includes(k.id));
        const friendInfo = friendFamilyMap[e.familyId] || {};
        return (friendInfo.name || '').toLowerCase().includes(q)
          || entryKids.some(k => k.name.toLowerCase().includes(q));
      });
    }
    return pool;
  }, [feedEntries, searchQuery, profileFamilyId, friendKids, friendFamilyMap]);

  const profileInfo = profileFamilyId ? friendFamilyMap[profileFamilyId] : null;

  function renderPost(entry) {
    const entryKids = friendKids.filter(k => entry.kids.includes(k.id));
    const friendInfo = friendFamilyMap[entry.familyId] || {};
    const likes = likesMap[entry.id] || [];
    const comments = commentsMap[entry.id] || [];
    const iLiked = likes.some(l => l.user_id === currentUserId);
    const entryDate = new Date(entry.createdAt || (entry.date + 'T12:00:00'));
    const daysAgo = Math.round((Date.now() - entryDate.getTime()) / 86400000);
    const dateLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`;
    const photoDate = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const likeLabel = likes.length === 0
      ? null
      : likes.length >= 3
        ? `${likes.length} people loved this`
        : `${likes.map(l => l.display_name?.split(' ')[0] || 'Someone').join(' & ')} loved this`;

    return (
      <div key={entry.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(44,56,40,0.08)' }}>
        {/* Poster row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px 10px' }}>
          <span className="thumb" style={{ width: 42, height: 42, fontSize: 15, flexShrink: 0 }}>
            {friendInfo.avatar
              ? <img src={cloudinaryTransform(friendInfo.avatar, 'w_84,h_84,c_fill,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
              : (friendInfo.name || '?')[0]}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <button
              onClick={() => !profileFamilyId && setProfileFamilyId(entry.familyId)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: profileFamilyId ? 'default' : 'pointer', fontFamily: "'Urbanist', sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--text)', display: 'block', textAlign: 'left' }}
            >
              {friendInfo.name || 'Friend'}
            </button>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', marginTop: 1 }}>{dateLabel}</p>
          </div>
          {onCompareAtAge && entry.ageMonths != null && (
            <button
              onClick={() => onCompareAtAge(entryKids[0]?.id ?? null, entry.ageMonths)}
              title="At the same age"
              style={{ background: 'var(--bg-elevated)', border: 'none', borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--accent)', fontSize: 16, flexShrink: 0 }}
            >
              <i className="ti ti-arrows-diff" />
            </button>
          )}
        </div>

        {/* Photo, no overlay */}
        {entry.media.length > 0 && (
          <div
            onClick={() => {
              const isVideo = entry.media[0].type === 'video';
              if (isVideo && playingVideoId !== entry.id) { setPlayingVideoId(entry.id); return; }
              const now = Date.now();
              const wasDoubleTap = now - (lastTapRef.current[entry.id] || 0) < 320;
              lastTapRef.current[entry.id] = now;
              if (!wasDoubleTap) return;
              if (!iLiked) handleToggleLike(entry.id);
              setLikeAnimId(entry.id);
              setTimeout(() => setLikeAnimId(id => id === entry.id ? null : id), 800);
            }}
            style={{ margin: '0 14px', borderRadius: 16, overflow: 'hidden', aspectRatio: '4/5', background: 'var(--border)', position: 'relative', cursor: 'pointer' }}
          >
            {entry.media[0].type === 'video' ? (
              playingVideoId === entry.id ? (
                <video src={entry.media[0].url} autoPlay controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onClick={e => e.stopPropagation()} />
              ) : (
                <>
                  <img src={videoThumbUrl(entry.media[0].url)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" loading="lazy" />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="video-play-overlay"><i className="ti ti-player-play" style={{ fontSize: 20 }} /></div>
                  </div>
                </>
              )
            ) : (
              <img src={cloudinaryTransform(entry.media[0].url, 'w_800,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" loading="lazy" />
            )}
            {likeAnimId === entry.id && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <i className="ti ti-heart-filled" style={{ fontSize: 90, color: '#fff', filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.35))', animation: 'likeHeartPop 0.8s ease forwards' }} />
              </div>
            )}
          </div>
        )}

        {/* Kid caption, below the photo like a letter salutation */}
        {entryKids.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px 0' }}>
            <div style={{ display: 'flex', flexShrink: 0 }}>
              {entryKids.map((k, i) => (
                <span key={k.id} style={{ marginLeft: i > 0 ? -8 : 0, display: 'inline-block', width: 24, height: 24, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--bg-card)', background: k.accent || 'var(--bg-elevated)', flexShrink: 0 }}>
                  {k.avatar
                    ? <img src={cloudinaryTransform(k.avatar, 'w_48,h_48,c_fill,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" />
                    : <span style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff' }}>{k.name[0]}</span>
                  }
                </span>
              ))}
            </div>
            <p style={{ margin: 0, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 13, color: 'var(--text-2)' }}>
              {entryKids.map(k => k.name.split(' ')[0]).join(' & ')}
              {entryKids[0]?.birthdate && ` · ${exactAgeLabel(entryKids[0].birthdate, entry.date)} · ${photoDate}`}
            </p>
          </div>
        )}

        {/* Love + notes, in words instead of icon counters */}
        <div style={{ padding: '10px 16px 4px' }}>
          <button
            onClick={() => handleToggleLike(entry.id)}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: iLiked ? '#D4856A' : 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif" }}
          >
            <i className={`ti ti-heart${iLiked ? '-filled' : ''}`} style={{ fontSize: 18 }} />
            {likeLabel && <span style={{ fontSize: 13, fontWeight: 600 }}>{likeLabel}</span>}
          </button>
        </div>

        {/* Notes */}
        {comments.length > 0 && (
          <div style={{ padding: '8px 16px 4px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {comments.map(c => (
              <p key={c.id} style={{ margin: 0, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
                <span style={{ fontWeight: 700, fontStyle: 'normal', color: 'var(--text)' }}>{c.display_name || 'Someone'}</span>
                {' — '}{c.body}
              </p>
            ))}
          </div>
        )}

        {/* Note input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px 16px' }}>
          <input
            value={commentDrafts[entry.id] || ''}
            onChange={e => setCommentDrafts(prev => ({ ...prev, [entry.id]: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmitComment(entry.id); } }}
            placeholder="Leave a note…"
            style={{ flex: 1, border: 'none', padding: '2px 0', fontSize: 13, fontStyle: 'italic', fontFamily: "'Source Serif 4', serif", background: 'transparent', color: 'var(--text)', outline: 'none' }}
          />
          <button
            onClick={() => handleSubmitComment(entry.id)}
            disabled={!(commentDrafts[entry.id] || '').trim()}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: (commentDrafts[entry.id] || '').trim() ? 'var(--accent)' : 'var(--border)', fontSize: 18, display: 'flex', alignItems: 'center', padding: 0, flexShrink: 0 }}
          >
            <i className="ti ti-send" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="scroll-area" ref={scrollRef} style={{ overscrollBehaviorY: 'contain' }} {...ptr.handlers}>
        {ptr.indicator}
        {profileFamilyId ? (
          /* ── Profile grid view ── */
          <div>
            <div style={{ padding: '16px 16px 0', marginBottom: 16 }}>
              <button className="icon-btn" onClick={() => { setProfileFamilyId(null); setSelectedEntry(null); }}>
                <i className="ti ti-arrow-left" />
              </button>
            </div>

            {/* Profile header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 20px 20px' }}>
              {profileInfo?.avatar
                ? <img src={cloudinaryTransform(profileInfo.avatar, 'w_128,h_128,c_fill,q_auto,f_auto')} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} alt="" />
                : <span style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {(profileInfo?.name || '?')[0]}
                  </span>
              }
              <div>
                <p style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--text)', fontFamily: "'Urbanist', sans-serif", letterSpacing: '-0.2px' }}>{profileInfo?.name || 'Friend'}</p>
                <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>{displayedEntries.length} {displayedEntries.length === 1 ? 'post' : 'posts'}</p>
              </div>
            </div>

            {/* Photo grid */}
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
                <i className="ti ti-loader-2" style={{ fontSize: 28, color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />
              </div>
            ) : displayedEntries.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, paddingTop: 40 }}>Nothing shared yet.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
                {displayedEntries.map(entry => {
                  const thumb = entry.media[0];
                  return (
                    <div key={entry.id} onClick={() => setSelectedEntry(entry)} style={{ aspectRatio: '1', background: 'var(--border)', cursor: 'pointer', overflow: 'hidden', position: 'relative' }}>
                      {thumb ? (
                        thumb.type === 'video'
                          ? <img src={videoThumbUrl(thumb.url, 'so_0,w_400,h_400,c_fill,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" />
                          : <img src={cloudinaryTransform(thumb.url, 'w_400,h_400,c_fill,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" loading="lazy" />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i className="ti ti-letter" style={{ fontSize: 24, color: 'var(--text-muted)' }} />
                        </div>
                      )}
                      {entry.media.length > 1 && (
                        <i className="ti ti-copy" style={{ position: 'absolute', top: 6, right: 6, fontSize: 13, color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* ── Feed view ── */
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 0' }}>
              <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: 'var(--accent)', margin: 0, textAlign: 'center' }}>Friends</h2>
              <button className="icon-btn" onClick={() => { if (showSearch) setSearchQuery(''); setShowSearch(s => !s); }}>
                <i className={`ti ${showSearch ? 'ti-x' : 'ti-search'}`} />
              </button>
            </div>
            <div style={{ padding: '10px 20px 18px' }}>
              <SectionSwitcher
                tabs={[{ id: 'circle-feed', label: 'Glimpse' }, { id: 'friends', label: 'Activity', badge: pendingRequestCount + circleBadge }]}
                active="circle-feed"
                onChange={onSwitchSection}
              />
            </div>

            {showSearch && (
              <div style={{ position: 'relative', margin: '0 16px 16px' }}>
                <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14, pointerEvents: 'none' }} />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by name…"
                  style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 36, paddingRight: 12, paddingTop: 10, paddingBottom: 10, border: '1px solid var(--border)', borderRadius: 12, fontSize: 14, background: 'var(--bg-input)', color: 'var(--text)', fontFamily: 'Inter, sans-serif', outline: 'none' }}
                />
              </div>
            )}

            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
                <i className="ti ti-loader-2" style={{ fontSize: 28, color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />
              </div>
            ) : displayedEntries.length === 0 ? (
              <div className="empty-state">
                <i className="ti ti-users" style={{ fontSize: 36, color: 'var(--border)', display: 'block', marginBottom: 12 }} />
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
                  {familyIds.length === 0 ? 'Add friends to see the moments they share with you.' : searchQuery ? 'No matches found.' : 'Nothing shared yet.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '0 16px 16px' }}>
                {displayedEntries.map(entry => renderPost(entry))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Entry detail modal (from profile grid tap) */}
      {selectedEntry && (() => {
        const entry = selectedEntry;
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end' }} onClick={() => setSelectedEntry(null)}>
            <div style={{ background: 'var(--bg)', borderRadius: '24px 24px 0 0', width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '12px auto 0' }} />
              {renderPost(entry)}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Compare screen ──────────────────────────────────────────────────────

function CompareScreen({ entries, kids, friendKids = [], friendEntries = [], friends = [], currentUserId, onBack, onOpenEntry, initialFriendKidId = null, initialCompareAge = null, onSwitchSection }) {
  const [filterTab, setFilterTab] = useState('age');
  const [compareAge, setCompareAge] = useState(initialCompareAge ?? 24);
  const [photoViewer, setPhotoViewer] = useState(null); // { entry, kid, ageStr, isFriend, friendName, friendAvatar }
  const [playingVideoId, setPlayingVideoId] = useState(null);

  const friendInfoMap = useMemo(() => {
    const map = {};
    friends.forEach(fr => {
      const friendId = fr.requester_id === currentUserId ? fr.addressee_id : fr.requester_id;
      map[friendId] = {
        name: fr.requester_id === currentUserId ? fr.addressee_display_name : fr.requester_display_name,
        avatar: fr.requester_id === currentUserId ? fr.addressee_avatar_url : fr.requester_avatar_url,
      };
    });
    return map;
  }, [friends, currentUserId]);
  const [milestoneFilter, setMilestoneFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFriendKidIds, setSelectedFriendKidIds] = useState(initialFriendKidId ? [initialFriendKidId] : []);
  const [excludedKidIds, setExcludedKidIds] = useState([]);
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const ages = [12, 18, 24, 36, 48, 60, 72, 84, 96, 108, 120];

  const selectedFriendKids = friendKids.filter(k => selectedFriendKidIds.includes(k.id));
  const isSearching = searchQuery.trim().length > 0;
  const isMilestoneFiltering = !isSearching && filterTab === 'milestone' && milestoneFilter !== null;
  const customMilestoneChips = useMemo(() => {
    const seen = new Set();
    return entries
      .filter(e => e.milestone?.startsWith('custom:'))
      .map(e => e.milestone)
      .filter(m => seen.has(m) ? false : seen.add(m));
  }, [entries]);

  function switchTab(tab) {
    setFilterTab(tab);
    setMilestoneFilter(null);
    setSearchQuery('');
  }

  function matchesAgeBucket(entryAgeMonths) {
    const currentIndex = ages.indexOf(compareAge);
    if (currentIndex === -1) return false;
    const nextAge = ages[currentIndex + 1];
    if (nextAge == null) return entryAgeMonths >= compareAge;
    return entryAgeMonths >= compareAge && entryAgeMonths < nextAge;
  }

  function entryMatchesSearch(e) {
    const q = searchQuery.trim().toLowerCase();
    if (q === 'note' || q === 'notes') return e.type === 'note' && !e.prompt;
    if (q === 'prompt' || q === 'prompts') return e.type === 'note' && !!e.prompt;
    const m = e.milestone ? milestoneInfo(e.milestone) : null;
    return (e.text || '').toLowerCase().includes(q)
      || (e.prompt || '').toLowerCase().includes(q)
      || (m && m.label.toLowerCase().includes(q))
      || e.location?.toLowerCase().includes(q)
      || (e.people || []).some(p => p.toLowerCase().includes(q));
  }

  const showMeta = isSearching || isMilestoneFiltering;
  const emptyLabel = isSearching ? 'No matches'
    : filterTab === 'milestone' && !milestoneFilter ? 'Pick a milestone above'
    : isMilestoneFiltering ? 'None logged yet'
    : 'No moments yet at this age';

  const tabStyle = (tab) => ({
    border: 'none', borderRadius: 7, padding: '11px 16px',
    fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    background: filterTab === tab ? 'var(--bg-input)' : 'transparent',
    color: filterTab === tab ? 'var(--accent)' : 'var(--text-muted)',
    boxShadow: filterTab === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
  });

  // Own kids are always present (never removed, only faded when excluded); friend kids are added/removed outright.
  const allKidColumns = [...kids, ...selectedFriendKids.map(k => ({ ...k, isFriend: true }))];
  const includedKidColumns = allKidColumns.filter(k => k.isFriend || !excludedKidIds.includes(k.id));

  // Flat sorted list of all entries for the age grid (2+ kids)
  const ageGridItems = (filterTab === 'age' && allKidColumns.length >= 2)
    ? includedKidColumns.flatMap(kid => {
        const pool = kid.isFriend ? friendEntries : entries;
        return pool
          .filter(e => e.kids.length === 1 && e.kids.includes(kid.id) && matchesAgeBucket(e.ageMonths) && e.media?.length > 0)
          .map(e => ({ e, kid }));
      }).sort((a, b) => {
        const toDays = ({ e, kid }) => (kid.birthdate && e.date)
          ? (new Date(e.date) - new Date(kid.birthdate)) / 86400000
          : e.ageMonths * 30.44;
        return toDays(a) - toDays(b);
      })
    : null;

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: 'var(--accent)', margin: 0, textAlign: 'center' }}>Keepsakes</h2>
              <button className="icon-btn" onClick={() => filterTab === 'search' ? switchTab('age') : switchTab('search')}>
                <i className={`ti ${filterTab === 'search' ? 'ti-x' : 'ti-search'}`} />
              </button>
            </div>

            <div>
              <SectionSwitcher
                tabs={[{ id: 'recap', label: 'Recap' }, { id: 'partner-letters', label: 'All letters' }, { id: 'compare', label: 'At the same age' }]}
                active="compare"
                onChange={onSwitchSection}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'flex', background: 'var(--bg-card)', borderRadius: 9, padding: 3 }}>
              <button style={tabStyle('age')} onClick={() => switchTab('age')}>By Age</button>
              <button style={tabStyle('milestone')} onClick={() => switchTab('milestone')}>Milestones</button>
            </div>
          </div>

          {filterTab === 'search' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <i className="ti ti-search" style={{ color: 'var(--text-muted)', fontSize: 16 }} />
              <input
                autoFocus
                type="text"
                placeholder="Search moments..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', flex: 1, fontSize: 16, background: 'transparent', color: 'var(--accent)', fontFamily: 'Inter, sans-serif' }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex', alignItems: 'center' }}>
                  <i className="ti ti-x" style={{ fontSize: 14 }} />
                </button>
              )}
            </div>
          )}

          {filterTab === 'age' && (
            <div className="scrollx">
              {ages.map(age => (
                <div
                  key={age}
                  className={`kid-chip ${compareAge === age ? 'active' : ''}`}
                  style={{ padding: '7px 14px', ...(compareAge === age ? { background: 'var(--accent)' } : {}) }}
                  onClick={() => setCompareAge(age)}
                >
                  {ageLabel(age)}
                </div>
              ))}
            </div>
          )}

          {filterTab === 'milestone' && (
            <div className="scrollx">
              {MILESTONE_TYPES.map(ms => {
                const active = milestoneFilter === ms.id;
                return (
                  <div
                    key={ms.id}
                    className="kid-chip"
                    style={{ padding: '7px 14px', ...(active ? { background: '#C8993E', borderColor: '#C8993E', color: '#fff' } : {}) }}
                    onClick={() => setMilestoneFilter(active ? null : ms.id)}
                  >
                    <i className={`ti ${ms.icon}`} style={{ fontSize: 13 }} />
                    {ms.label}
                  </div>
                );
              })}
              {customMilestoneChips.map(m => {
                const active = milestoneFilter === m;
                return (
                  <div
                    key={m}
                    className="kid-chip"
                    style={{ padding: '7px 14px', ...(active ? { background: '#C8993E', borderColor: '#C8993E', color: '#fff' } : {}) }}
                    onClick={() => setMilestoneFilter(active ? null : m)}
                  >
                    <i className="ti ti-star" style={{ fontSize: 13 }} />
                    {m.slice(7)}
                  </div>
                );
              })}
            </div>
          )}

          {filterTab === 'milestone' && !milestoneFilter ? (
            <div className="empty-state">
              <i className="ti ti-star" style={{ fontSize: 36, color: 'var(--border)', display: 'block', marginBottom: 12 }} />
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>Pick a milestone above to compare</p>
            </div>
          ) : ageGridItems ? (
            /* ── Free-flowing 2-col grid: By Age with 2+ kids ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Kid tags */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {allKidColumns.map(kid => {
                  const isExcluded = !kid.isFriend && excludedKidIds.includes(kid.id);
                  return (
                    <div
                      key={kid.id}
                      onClick={() => !kid.isFriend && setExcludedKidIds(prev => isExcluded ? prev.filter(id => id !== kid.id) : [...prev, kid.id])}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--bg-elevated)', borderRadius: 99, padding: '4px 10px 4px 5px', opacity: isExcluded ? 0.4 : 1, cursor: kid.isFriend ? 'default' : 'pointer', transition: 'opacity 0.15s' }}
                    >
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: kid.accent || 'var(--border)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {kid.avatar
                          ? <img src={cloudinaryTransform(kid.avatar, 'w_36,h_36,c_fill,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ fontSize: 8, fontWeight: 700, color: '#fff' }}>{kid.name.charAt(0)}</span>}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{kid.name}</span>
                      {kid.isFriend && (
                        <button
                          onClick={() => setSelectedFriendKidIds(prev => prev.filter(id => id !== kid.id))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex', marginLeft: 2 }}
                        >
                          <i className="ti ti-x" style={{ fontSize: 11 }} />
                        </button>
                      )}
                    </div>
                  );
                })}
                {friendKids.length > 0 && selectedFriendKidIds.length < 10 && (
                  <button onClick={() => setShowFriendPicker(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: '1.5px dashed var(--border)', borderRadius: 99, padding: '4px 10px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
                    <i className="ti ti-plus" style={{ fontSize: 12 }} /> Add
                  </button>
                )}
              </div>

              {ageGridItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 24px' }}>
                  <i className="ti ti-camera" style={{ fontSize: 22, color: 'var(--border-light)', display: 'block', marginBottom: 8 }} />
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Nothing captured at this age yet</p>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  {[0, 1].map(col => (
                    <div key={col} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {ageGridItems.filter((_, i) => i % 2 === col).map(({ e, kid }) => {
                        const m = e.milestone ? milestoneInfo(e.milestone) : null;
                        const ageStr = exactAgeLabel(kid.birthdate, e.date);
                        const isFriendKid = !!kid.isFriend;
                        const fi = isFriendKid ? (friendInfoMap[kid.userId] || {}) : null;
                        return (
                          <div key={e.id} className={m ? 'milestone-entry' : undefined}
                            style={{ borderRadius: 12, cursor: 'pointer', padding: m ? 2 : 0 }}
                            onClick={() => isFriendKid
                              ? setPhotoViewer({ entry: e, kid, ageStr, isFriend: true, friendName: fi?.name || 'Friend', friendAvatar: fi?.avatar || null })
                              : onOpenEntry(e)}>
                            <div style={{ borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
                              {playingVideoId === e.id ? (
                                <div style={{ aspectRatio: '3/4', background: '#000', position: 'relative' }}>
                                  <video
                                    src={e.media[0].url}
                                    autoPlay playsInline controls
                                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                                    onClick={ev => ev.stopPropagation()}
                                    onEnded={() => setPlayingVideoId(null)}
                                  />
                                  <button
                                    onClick={ev => { ev.stopPropagation(); setPlayingVideoId(null); }}
                                    style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.4)', border: 'none', borderRadius: '50%', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', zIndex: 4 }}>
                                    <i className="ti ti-x" style={{ fontSize: 12 }} />
                                  </button>
                                </div>
                              ) : (
                                <div className="compare-photo" style={entryBgStyle(e)}>
                                  <div className="scrim" style={tintedScrimStyle(e, 0.5)} />
                                  {e.media?.[0]?.type === 'video' && (
                                    <button
                                      onClick={ev => { ev.stopPropagation(); setPlayingVideoId(e.id); }}
                                      style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', zIndex: 2 }}>
                                      <i className="ti ti-player-play-filled" style={{ fontSize: 15, color: '#fff', marginLeft: 2 }} />
                                    </button>
                                  )}
                                  <div style={{ position: 'relative', zIndex: 2, padding: 10, width: '100%' }}>
                                    <p style={{ fontSize: 11, color: '#fff', margin: 0, fontWeight: 700 }}>{ageStr}</p>
                                  </div>
                                </div>
                              )}
                              {playingVideoId !== e.id && (
                                <div style={{ position: 'absolute', top: 7, right: 7, width: 22, height: 22, borderRadius: '50%', background: kid.accent || 'var(--border)', border: '2px solid rgba(255,255,255,0.9)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}>
                                  {kid.avatar
                                    ? <img src={cloudinaryTransform(kid.avatar, 'w_44,h_44,c_fill,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    : <span style={{ fontSize: 8, fontWeight: 700, color: '#fff' }}>{kid.name.charAt(0)}</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* ── Original column layout: milestone/search tabs or single kid ── */
            <div className="scrollx" style={{ alignItems: 'flex-start', gap: 12, paddingBottom: 8 }}>
              {allKidColumns.map(kid => {
                const isFriendKid = !!kid.isFriend;
                const isExcluded = !isFriendKid && excludedKidIds.includes(kid.id);
                const pool = isFriendKid ? friendEntries : entries;
                const matches = isSearching
                  ? pool.filter(e => e.kids.includes(kid.id) && entryMatchesSearch(e))
                  : isMilestoneFiltering
                    ? pool.filter(e => e.kids.length === 1 && e.kids.includes(kid.id) && e.milestone === milestoneFilter)
                    : pool.filter(e => e.kids.length === 1 && e.kids.includes(kid.id) && matchesAgeBucket(e.ageMonths))
                      .sort((a, b) => {
                        if (a.ageMonths !== b.ageMonths) return a.ageMonths - b.ageMonths;
                        if (!kid.birthdate || !a.date || !b.date) return (a.date || '').localeCompare(b.date || '');
                        const bd = new Date(kid.birthdate);
                        return (new Date(a.date) - bd) - (new Date(b.date) - bd);
                      });
                return (
                  <div key={kid.id} style={{ width: 170, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, opacity: isExcluded ? 0.4 : 1, transition: 'opacity 0.15s' }}>
                    <div
                      onClick={() => !isFriendKid && setExcludedKidIds(prev => isExcluded ? prev.filter(id => id !== kid.id) : [...prev, kid.id])}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: isFriendKid ? 'default' : 'pointer' }}
                    >
                      <KidThumb kid={kid} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kid.name}</p>
                        {isFriendKid && <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>friend</p>}
                      </div>
                      {isFriendKid && (
                        <button
                          onClick={e => { e.stopPropagation(); setSelectedFriendKidIds(prev => prev.filter(id => id !== kid.id)); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', flexShrink: 0 }}
                        >
                          <i className="ti ti-x" style={{ fontSize: 13 }} />
                        </button>
                      )}
                    </div>
                    {matches.length === 0 ? (
                      <div style={{ background: 'var(--bg-input)', border: '1px dashed #D8CFBC', borderRadius: 12, padding: '28px 12px', textAlign: 'center' }}>
                        <i className={isFriendKid ? 'ti ti-lock' : 'ti ti-camera'} style={{ fontSize: 22, color: 'var(--border-light)', display: 'block', marginBottom: 8 }} />
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                          {isFriendKid ? 'Nothing shared\nat this age yet' : isSearching ? 'No matches' : isMilestoneFiltering ? 'None logged yet' : 'Nothing captured\nat this age yet'}
                        </p>
                      </div>
                    ) : matches.map(e => {
                      const m = e.milestone ? milestoneInfo(e.milestone) : null;
                      const ageStr = exactAgeLabel(kid.birthdate, e.date);
                      const dateStr = new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                      const fi = isFriendKid ? (friendInfoMap[kid.userId] || {}) : null;
                      return (
                        <div key={e.id} className={m ? 'milestone-entry' : undefined} style={{ borderRadius: 12, cursor: 'pointer', padding: m ? 2 : 0 }} onClick={() => {
                          if (isFriendKid) {
                            setPhotoViewer({ entry: e, kid, ageStr, isFriend: true, friendName: fi?.name || 'Friend', friendAvatar: fi?.avatar || null });
                          } else {
                            onOpenEntry(e);
                          }
                        }}>
                          <div style={{ borderRadius: 10, overflow: 'hidden' }}>
                            <div className="compare-photo" style={entryBgStyle(e)}>
                              <div className="scrim" style={tintedScrimStyle(e, 0.5)} />
                              <div style={{ position: 'relative', zIndex: 2, padding: 10, width: '100%' }}>
                                <p style={{ fontSize: 11, color: '#fff', margin: '0 0 2px', fontWeight: 700 }}>{ageStr}</p>
                                {showMeta && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', margin: '0 0 2px' }}>{dateStr}</p>}
                                {m && !isMilestoneFiltering && <p style={{ fontSize: 11, color: '#fff', margin: 0, fontWeight: 600, opacity: 0.9 }}>{m.label}</p>}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {friendKids.length > 0 && selectedFriendKidIds.length < 10 && (
                <div style={{ width: 44, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    onClick={() => setShowFriendPicker(true)}
                    style={{ width: 44, height: 44, borderRadius: '50%', background: 'none', border: '1.5px dashed var(--border)', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <i className="ti ti-plus" style={{ fontSize: 18 }} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {photoViewer && (() => {
        const { entry, kid, ageStr, isFriend, friendName, friendAvatar } = photoViewer;
        const media = entry.media?.[0];
        const dateStr = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        return (
          <div onClick={() => setPhotoViewer(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ position: 'absolute', top: 16, left: 16 }}>
              <button onClick={() => setPhotoViewer(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: 18 }}>
                <i className="ti ti-arrow-left" />
              </button>
            </div>
            {isFriend && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, alignSelf: 'flex-start', paddingLeft: 4 }}>
                <FriendAvatar name={friendName} avatarUrl={friendAvatar} size={36} />
                <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{friendName}</span>
              </div>
            )}
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', borderRadius: 16, overflow: 'hidden' }}>
              {media?.type === 'video'
                ? <video src={media.url} controls autoPlay playsInline style={{ width: '100%', display: 'block', maxHeight: '65vh', objectFit: 'contain', background: '#000' }} />
                : <img src={media?.url || ''} alt="" style={{ width: '100%', display: 'block', maxHeight: '65vh', objectFit: 'contain', background: entry.palette?.bg || '#111' }} />
              }
            </div>
            <div style={{ marginTop: 14, alignSelf: 'flex-start', paddingLeft: 4 }}>
              <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: '0 0 3px' }}>{kid.name} · {ageStr}</p>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: 0 }}>{dateStr}</p>
            </div>
          </div>
        );
      })()}

      {showFriendPicker && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 20 }} onClick={() => { setShowFriendPicker(false); setPickerQuery(''); }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxHeight: '70%', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>At the same age</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
              <i className="ti ti-search" style={{ color: 'var(--text-muted)', fontSize: 15 }} />
              <input
                autoFocus
                type="text"
                placeholder="Search by name..."
                value={pickerQuery}
                onChange={e => setPickerQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', flex: 1, fontSize: 15, background: 'transparent', color: 'var(--text)', fontFamily: 'Inter, sans-serif' }}
              />
              {pickerQuery && <button onClick={() => setPickerQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}><i className="ti ti-x" style={{ fontSize: 13 }} /></button>}
            </div>
            {friends.map(fr => {
              const uid = fr.requester_id === currentUserId ? fr.addressee_id : fr.requester_id;
              const name = fr.requester_id === currentUserId ? fr.addressee_display_name : fr.requester_display_name;
              const q = pickerQuery.toLowerCase();
              const theirKids = friendKids.filter(k => k.userId === uid && !selectedFriendKidIds.includes(k.id) && (!q || k.name.toLowerCase().includes(q) || name.toLowerCase().includes(q)));
              return theirKids.length > 0 ? (
                <div key={fr.id} style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px', fontWeight: 600 }}>{name}</p>
                  {theirKids.map(k => (
                    <div key={k.id}
                      onClick={() => { setSelectedFriendKidIds(prev => [...prev, k.id]); setShowFriendPicker(false); setPickerQuery(''); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                    >
                      <KidThumb kid={k} size={30} />
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{k.name}</p>
                    </div>
                  ))}
                </div>
              ) : null;
            })}
            {friends.every(fr => friendKids.filter(k => k.userId === (fr.requester_id === currentUserId ? fr.addressee_id : fr.requester_id) && (!pickerQuery || k.name.toLowerCase().includes(pickerQuery.toLowerCase()))).length === 0) && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', margin: '16px 0 0' }}>{pickerQuery ? 'No matches found.' : "Your friends haven't shared any moments yet."}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Search screen ─────────────────────────────────────────────────────────

function haversine(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function PartnerToast({ toast, onView, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div style={{
      position: 'absolute', top: 12, left: 12, right: 12, zIndex: 50,
      background: 'var(--text)', borderRadius: 14, padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
      animation: 'screenIn 0.2s ease-out',
    }}>
      <i className="ti ti-sparkles" style={{ color: '#C8993E', fontSize: 18, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13, color: '#fff', fontWeight: 500 }}>
        {toast.authorName} added a new letter
      </span>
      <button onClick={onView} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, padding: '5px 10px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', flexShrink: 0 }}>
        View
      </button>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 16, padding: 2, display: 'flex', flexShrink: 0 }}>
        <i className="ti ti-x" />
      </button>
    </div>
  );
}

function ReactionToast({ message, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div style={{
      position: 'absolute', top: 12, left: 12, right: 12, zIndex: 50,
      background: 'var(--text)', borderRadius: 14, padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
      animation: 'screenIn 0.2s ease-out',
    }}>
      <i className="ti ti-heart-filled" style={{ color: '#E05C6A', fontSize: 18, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13, color: '#fff', fontWeight: 500 }}>{message}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 16, padding: 2, display: 'flex', flexShrink: 0 }}>
        <i className="ti ti-x" />
      </button>
    </div>
  );
}

function PartnerLettersScreen({ entries, kids, unseenIds, authorId, currentUserId, self, partner, onBack, onOpenEntry, onMarkAllRead, scrollPos, onSwitchSection }) {
  const scrollRef = useRef(null);
  const [activeAuthorId, setActiveAuthorId] = useState(authorId);
  const isSelf = activeAuthorId != null && currentUserId && activeAuthorId === currentUserId;
  const [query, setQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

  function matchesQuery(e) {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    if (q === 'note' || q === 'notes') return e.type === 'note' && !e.prompt;
    if (q === 'prompt' || q === 'prompts') return e.type === 'note' && !!e.prompt;
    const m = e.milestone ? milestoneInfo(e.milestone) : null;
    const entryKids = (e.kids || []).map(id => kids.find(k => k.id === id)).filter(Boolean);
    return (e.text || '').toLowerCase().includes(q)
      || (e.prompt || '').toLowerCase().includes(q)
      || (m && m.label.toLowerCase().includes(q))
      || entryKids.some(k => k.name.toLowerCase().includes(q))
      || e.location?.toLowerCase().includes(q)
      || (e.people || []).some(p => p.toLowerCase().includes(q));
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !scrollPos) return;
    requestAnimationFrame(() => { el.scrollTop = scrollPos.current; });
  }, []);

  function handleOpenEntry(entry) {
    if (scrollRef.current && scrollPos) scrollPos.current = scrollRef.current.scrollTop;
    onOpenEntry(entry);
  }
  const showAll = activeAuthorId === null;
  const partnerName = partner?.real_name || partner?.display_name || 'Partner';
  const unseenEntriesAll = useMemo(
    () => (isSelf || showAll) ? [] : entries.filter(e => unseenIds.includes(e.id)).sort((a, b) => new Date(b.date) - new Date(a.date)),
    [entries, unseenIds, isSelf, showAll]
  );
  const earlierEntriesAll = useMemo(
    () => entries
      .filter(e => showAll ? true : (activeAuthorId && e.authorId === activeAuthorId && (isSelf || !unseenIds.includes(e.id))))
      .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [entries, activeAuthorId, unseenIds, isSelf, showAll]
  );
  const unseenEntries = useMemo(() => unseenEntriesAll.filter(matchesQuery), [unseenEntriesAll, query, kids]);
  const earlierEntries = useMemo(() => earlierEntriesAll.filter(matchesQuery), [earlierEntriesAll, query, kids]);
  const hasAny = unseenEntriesAll.length > 0 || earlierEntriesAll.length > 0;
  const hasMatches = unseenEntries.length > 0 || earlierEntries.length > 0;

  return (
    <div className="screen">
      <div className="scroll-area" ref={scrollRef}>
        <div className="scrollpad">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
              <h2 onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: 'var(--accent)', margin: 0, textAlign: 'center', cursor: 'pointer' }}>Keepsakes</h2>
              {hasAny ? (
                <button className="icon-btn" onClick={() => { if (showSearch) setQuery(''); setShowSearch(s => !s); }}>
                  <i className={`ti ${showSearch ? 'ti-x' : 'ti-search'}`} />
                </button>
              ) : <div style={{ width: 36 }} />}
            </div>

            <div>
              <SectionSwitcher
                tabs={[{ id: 'recap', label: 'Recap' }, { id: 'partner-letters', label: 'All letters' }, { id: 'compare', label: 'At the same age' }]}
                active="partner-letters"
                onChange={onSwitchSection}
              />
            </div>
          </div>

          {partner && (
            <div className="scrollx">
              <KidChip active={showAll} onClick={() => setActiveAuthorId(null)} icon="ti-layout-list" label="All" />
              {self && <AuthorChip member={self} active={isSelf} onClick={() => setActiveAuthorId(currentUserId)} />}
              <AuthorChip member={partner} active={!showAll && !isSelf} onClick={() => setActiveAuthorId(partner.user_id)} />
            </div>
          )}

          {!hasAny && (
            <div className="empty-state">
              <i className="ti ti-mail" style={{ fontSize: 36, color: 'var(--border)', display: 'block', marginBottom: 12 }} />
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>No letters yet</p>
            </div>
          )}

          {hasAny && showSearch && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px' }}>
              <i className="ti ti-search" style={{ color: 'var(--text-muted)' }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search these letters..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', flex: 1, fontSize: 15, background: 'transparent', color: 'var(--accent)', fontFamily: 'Inter, sans-serif' }}
              />
              {query && (
                <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
                  <i className="ti ti-x" style={{ fontSize: 14 }} />
                </button>
              )}
            </div>
          )}

          {hasAny && !hasMatches && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>No letters match "{query}"</p>
          )}

          {unseenEntries.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', margin: 0 }}>New</p>
                <button onClick={onMarkAllRead} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: 0 }}>
                  Mark all as read
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {unseenEntries.map(e => {
                  const entryKids = (e.kids || []).map(id => kids.find(k => k.id === id)).filter(Boolean);
                  return <JournalEntryRow key={e.id} entry={e} entryKids={entryKids} onOpen={handleOpenEntry} />;
                })}
              </div>
            </>
          )}

          {earlierEntries.length > 0 && (
            <>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', margin: 0 }}>
                {unseenEntries.length > 0 ? 'Earlier' : query.trim() ? `${earlierEntries.length} letter${earlierEntries.length === 1 ? '' : 's'} found` : `All ${earlierEntries.length} letter${earlierEntries.length === 1 ? '' : 's'}`}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {earlierEntries.map(e => {
                  const entryKids = (e.kids || []).map(id => kids.find(k => k.id === id)).filter(Boolean);
                  return <JournalEntryRow key={e.id} entry={e} entryKids={entryKids} onOpen={handleOpenEntry} />;
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SearchScreen({ entries, kids, onBack, onOpenEntry }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Coordinate-based home detection: the cluster center with the most neighbors within 25 miles
  const homePt = useMemo(() => {
    const pts = entries.filter(e => e.locationLat != null && e.locationLng != null);
    if (pts.length < 2) return null;
    let best = null, bestCount = 0;
    pts.forEach(p => {
      const count = pts.filter(q => haversine(p.locationLat, p.locationLng, q.locationLat, q.locationLng) <= 25).length;
      if (count > bestCount) { bestCount = count; best = p; }
    });
    if (!best || bestCount < 2) return null;
    return { lat: best.locationLat, lng: best.locationLng };
  }, [entries]);

  const matches = useMemo(() => debouncedQuery.trim() ? entries.filter(e => {
    const m = e.milestone ? milestoneInfo(e.milestone) : null;
    const kid = kids.find(k => k.id === e.kids[0]);
    const q = debouncedQuery.toLowerCase();
    const hasVideo = e.media?.some(m => m.type === 'video' || /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(m.url || ''));
    const isTrip = e.locationLat != null && homePt != null && haversine(homePt.lat, homePt.lng, e.locationLat, e.locationLng) > 25;
    return (e.text || '').toLowerCase().includes(q) || (m && m.label.toLowerCase().includes(q)) || kid?.name.toLowerCase().includes(q) || e.location?.toLowerCase().includes(q) || (hasVideo && 'video'.includes(q)) || (e.milestone && 'milestone'.includes(q)) || (e.favorited && 'favorites'.includes(q)) || (isTrip && 'trips'.includes(q)) || (e.people || []).some(p => p.toLowerCase().includes(q));
  }) : [], [debouncedQuery, entries, kids, homePt]);

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            <h2 style={{ fontSize: 16, color: 'var(--accent)', margin: 0, fontWeight: 700 }}>Search</h2>
            <div style={{ width: 36 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px' }}>
            <i className="ti ti-search" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search moments, people, places..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ border: 'none', outline: 'none', flex: 1, fontSize: 16, background: 'transparent', color: 'var(--accent)', fontFamily: 'Inter, sans-serif' }}
            />
          </div>
          {!query.trim() && (
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { label: 'video', icon: 'ti-video' },
                { label: 'trips', icon: 'ti-map-pin' },
                { label: 'milestone', icon: 'ti-star' },
                { label: 'favorites', icon: 'ti-heart' },
              ].map(({ label, icon }) => (
                <button key={label} onClick={() => setQuery(label)} className="chip" style={{ flex: 1, justifyContent: 'center', padding: '7px 6px', fontSize: 12 }}>
                  <i className={`ti ${icon}`} style={{ fontSize: 12 }} />
                  {label}
                </button>
              ))}
            </div>
          )}
          {query.trim() && matches.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>No moments found</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: matches.length > 0 ? 14 : 0 }}>
            {matches.map(e => {
              const entryKids = (e.kids || []).map(id => kids.find(k => k.id === id)).filter(Boolean);
              return <JournalEntryRow key={e.id} entry={e} entryKids={entryKids} onOpen={onOpenEntry} />;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── Profile / manage kids ─────────────────────────────────────────────────

function ProfileScreen({ kids, entries, onBack, onAvatarUpload, onSignOut, familyMembers, myDisplayName, onInvite, onUpdateDisplayName, onUpdateRealName, onAddKid, onFamilyAvatarUpload, avatarUploading, currentUserId, onRenameKid, onUpdateKidSex, onUpdateKidWishlist, onOpenGrowth, onCreateBook, onDeleteAccount, hasPartner, darkMode, onToggleDarkMode, onSetDarkMode, discoverable, onToggleDiscoverable, onHidePostsFromFriends, sharingDefaults = { partner: true, family: false, friends: false }, onToggleSharingDefault, onShowPrivacy, onShowTerms }) {
  const fileInputRef = useRef(null);
  const familyAvatarInputRef = useRef(null);
  const [uploadKidId, setUploadKidId] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showHidePostsPrompt, setShowHidePostsPrompt] = useState(false);
  const [hidingPosts, setHidingPosts] = useState(false);
  const [activeFamilyAvatarId, setActiveFamilyAvatarId] = useState(null);
  const [inviteCode, setInviteCode] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(myDisplayName);
  const [editingRealName, setEditingRealName] = useState(false);
  const [realNameInput, setRealNameInput] = useState('');
  const [editingKid, setEditingKid] = useState(null);
  const [kidNameInput, setKidNameInput] = useState('');
  const [kidSexInput, setKidSexInput] = useState(null);
  const [kidWishlistInput, setKidWishlistInput] = useState('');
  const [addingKid, setAddingKid] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBdMonth, setNewBdMonth] = useState('');
  const [newBdDay, setNewBdDay] = useState('');
  const [newBdYear, setNewBdYear] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [newSex, setNewSex] = useState(null);
  const [cropState, setCropState] = useState(null);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [pickerStep, setPickerStep] = useState('type');
  const [pickerRole, setPickerRole] = useState(null);
  const newBirthdate = (newBdMonth && newBdDay && newBdYear && newBdYear.length === 4)
    ? `${newBdYear}-${newBdMonth}-${newBdDay.padStart(2, '0')}` : '';

  async function handleSaveNewKid() {
    if (!newName.trim() || !newBirthdate) return;
    setAddSaving(true);
    await onAddKid({ name: newName.trim(), birthdate: newBirthdate, sex: newSex });
    setAddingKid(false);
    setNewName(''); setNewBdMonth(''); setNewBdDay(''); setNewBdYear(''); setNewSex(null);
    setAddSaving(false);
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file || !uploadKidId) return;
    const kidId = uploadKidId;
    setCropState({
      src: URL.createObjectURL(file),
      onConfirm: blob => onAvatarUpload(kidId, new File([blob], 'avatar.jpg', { type: 'image/jpeg' })),
    });
    setUploadKidId(null);
    e.target.value = '';
  }

  function handleFamilyAvatarFile(e) {
    const file = e.target.files[0];
    if (!file || !activeFamilyAvatarId) return;
    const memberId = activeFamilyAvatarId;
    setCropState({
      src: URL.createObjectURL(file),
      onConfirm: blob => onFamilyAvatarUpload?.(memberId, new File([blob], 'avatar.jpg', { type: 'image/jpeg' })),
    });
    setActiveFamilyAvatarId(null);
    e.target.value = '';
  }

  async function handleInvite() {
    setInviteLoading(true);
    const code = await onInvite();
    setInviteCode(code);
    setInviteLoading(false);
  }

  async function handlePickerInvite(role) {
    setPickerRole(role);
    setPickerStep('invite-code');
    setInviteLoading(true);
    const code = await onInvite();
    setInviteCode(code);
    setInviteLoading(false);
  }

  function handleSaveName() {
    if (nameInput.trim()) onUpdateDisplayName(nameInput.trim());
    setEditingName(false);
  }

  const selfMember = familyMembers?.find(m => m.user_id === currentUserId);
  const otherMembers = familyMembers?.filter(m => m.user_id !== currentUserId) || [];
  const sectionLabel = { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '4px 0 8px 2px' };

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            <h2 style={{ fontSize: 16, color: 'var(--accent)', margin: 0, fontWeight: 700 }}>Your Family</h2>
            <div style={{ width: 36 }} />
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
          <input ref={familyAvatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFamilyAvatarFile} />

          {/* ── Kids ── */}
          {kids.map(k => {
            const kEntries = entries.filter(e => e.kids.includes(k.id));
            const kMilestones = kEntries.filter(e => e.milestone).length;
            const bornLabel = (() => { const [y,m,d] = k.birthdate.split('-').map(Number); return new Date(y,m-1,d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); })();
            return (
              <div key={k.id} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 16px 16px', textAlign: 'center' }}>
                <div
                  className="avatar-upload-zone"
                  style={{ width: 84, height: 84, margin: '0 auto 12px', position: 'relative', border: k.avatar ? 'none' : undefined }}
                  onClick={() => { setUploadKidId(k.id); fileInputRef.current?.click(); }}
                  title="Tap to change photo"
                >
                  <AvatarImg src={cloudinaryTransform(k.avatar, 'w_200,h_200,c_fill,q_auto,f_auto')} alt={k.name} fallback={<i className="ti ti-camera" />} />
                  {avatarUploading && uploadKidId === k.id && (
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(44,56,40,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="ti ti-loader-2" style={{ fontSize: 22, color: '#fff', animation: 'spin 1s linear infinite' }} />
                    </div>
                  )}
                </div>
                <p
                  style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)', margin: '0 0 2px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  onClick={() => { setEditingKid(k); setKidNameInput(k.name); setKidSexInput(k.sex ?? null); setKidWishlistInput(k.wishlistUrl || ''); }}
                >
                  {k.name} <i className="ti ti-pencil" style={{ fontSize: 12, color: 'var(--text-muted)' }} />
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>Born {bornLabel}</p>
                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                  <div className="stat-tile">
                    <p style={{ fontSize: 18, color: 'var(--accent)', margin: 0, fontWeight: 700 }}>{kEntries.length}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '3px 0 0' }}>moments</p>
                  </div>
                  <div className="stat-tile">
                    <p style={{ fontSize: 18, color: 'var(--accent)', margin: 0, fontWeight: 700 }}>{kMilestones}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '3px 0 0' }}>milestones</p>
                  </div>
                </div>
                <button
                  className="btn btn-outline"
                  style={{ width: '100%', fontSize: 13, padding: '10px 16px' }}
                  onClick={() => onOpenGrowth?.(k.id)}
                >
                  <i className="ti ti-ruler" style={{ fontSize: 15 }} />Growth chart
                </button>
              </div>
            );
          })}

          {/* ── Parents card ── */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            {[selfMember, ...otherMembers].filter(Boolean).map((m, i, arr) => {
              const isSelf = m.user_id === currentUserId;
              return (
                <div key={m.id || m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div
                    onClick={() => { if (!isSelf) return; setActiveFamilyAvatarId(m.id || m.user_id); familyAvatarInputRef.current?.click(); }}
                    style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: isSelf ? 'pointer' : 'default', flexShrink: 0, position: 'relative' }}
                  >
                    <AvatarImg src={cloudinaryTransform(m.avatar_url, 'w_200,h_200,c_fill,q_auto,f_auto')} alt={m.display_name} fallback={<i className="ti ti-user" style={{ fontSize: 16, color: 'var(--accent)' }} />} />
                    {avatarUploading && isSelf && <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(44,56,40,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="ti ti-loader-2" style={{ fontSize: 14, color: '#fff', animation: 'spin 1s linear infinite' }} /></div>}
                  </div>
                  <div
                    style={{ flex: 1, cursor: isSelf ? 'pointer' : 'default' }}
                    onClick={() => { if (!isSelf) return; setNameInput(myDisplayName); setRealNameInput(m.real_name || ''); setEditingName(true); }}
                  >
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {m.real_name || m.display_name}
                      {isSelf && <i className="ti ti-pencil" style={{ fontSize: 11, color: 'var(--text-muted)' }} />}
                    </p>
                    {m.real_name && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '1px 0 0' }}>{m.display_name}</p>}
                  </div>
                </div>
              );
            })}
          </div>

          <button className="btn btn-primary" style={{ background: '#7A9E8C' }} onClick={() => { setMemberPickerOpen(true); setPickerStep('type'); setPickerRole(null); setInviteCode(null); }}>
            <i className="ti ti-plus" />Add a family member
          </button>

          {/* ── Discoverable ── */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px' }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Discoverable</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{discoverable ? 'A shared journey, just different chapters.' : 'A quiet journey, just your close ones.'}</p>
            </div>
            <div onClick={() => {
              const next = !discoverable;
              onToggleDiscoverable?.(next);
              if (!next) setShowHidePostsPrompt(true);
            }} style={{ width: 44, height: 26, borderRadius: 13, background: discoverable ? 'var(--accent)' : 'var(--border)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 3, left: discoverable ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            </div>
          </div>

          {/* ── Appearance ── */}
          <div>
            <p style={sectionLabel}>Appearance</p>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px' }}>
              <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: 10, padding: 3 }}>
                {[['light', 'sun', 'Light'], ['auto', 'clock', 'Auto'], ['dark', 'moon', 'Dark']].map(([mode, icon, label]) => (
                  <button key={mode} onClick={() => onSetDarkMode(mode)} style={{ flex: 1, padding: '8px 4px', border: 'none', borderRadius: 8, background: darkMode === mode ? 'var(--bg-input)' : 'transparent', color: darkMode === mode ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, fontFamily: "'Urbanist', sans-serif", transition: 'background 0.15s' }}>
                    <i className={`ti ti-${icon}`} style={{ fontSize: 17 }} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Create a book ── */}
          {onCreateBook && (
            <button onClick={onCreateBook} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '14px 18px', background: darkMode ? 'linear-gradient(180deg, #2E4A34 0%, #1E3425 100%)' : 'linear-gradient(180deg, #3A4D40 0%, #1E2E24 100%)', border: darkMode ? '1px solid rgba(107,158,109,0.18)' : 'none', borderRadius: 14, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", boxShadow: darkMode ? '0 2px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 3px 10px rgba(20,35,25,0.38), inset 0 1px 0 rgba(255,255,255,0.08)' }} onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.opacity = '0.88'; }} onMouseUp={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.opacity = ''; }} onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.opacity = ''; }} onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.opacity = '0.88'; }} onTouchEnd={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.opacity = ''; }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="ti ti-book" style={{ fontSize: 18, color: '#C8993E' }} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0 }}>Create a book</p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: '2px 0 0' }}>The entries were for you. The book is for them.</p>
                </div>
              </div>
              <i className="ti ti-arrow-right" style={{ fontSize: 16, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
            </button>
          )}

          {/* ── Account ── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 4 }}>
            <button onClick={onSignOut} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif", padding: '8px 0', fontWeight: 600 }}>
              Sign out
            </button>
            {onDeleteAccount && (
              <button onClick={() => setShowDeleteConfirm(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#C4A09C', fontFamily: "'Urbanist', sans-serif", padding: '4px 0', fontWeight: 500 }}>
                Delete account
              </button>
            )}
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingTop: 4, paddingBottom: 8 }}>
              <button onClick={onShowPrivacy} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif", padding: 0 }}>Privacy Policy</button>
              <span style={{ fontSize: 11, color: 'var(--border)' }}>·</span>
              <button onClick={onShowTerms} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif", padding: 0 }}>Terms of Service</button>
            </div>
          </div>

          {/* Member type picker */}
          {memberPickerOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 20 }} onClick={() => setMemberPickerOpen(false)}>
              <div style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 480 }} onClick={e => e.stopPropagation()}>
                {pickerStep === 'type' ? (
                  <>
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 18px' }}>Who are you adding?</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[
                        { icon: 'ti-heart', label: 'A child', sub: 'Newborn, toddler, or older kid', action: () => { setMemberPickerOpen(false); setAddingKid(true); } },
                        { icon: 'ti-users', label: 'Your partner', sub: 'Invite them to co-author your family journal', action: () => handlePickerInvite('partner') },
                      ].map(opt => (
                        <button key={opt.label} onClick={opt.action} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 13, cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: "'Urbanist', sans-serif" }}>
                          <div style={{ width: 42, height: 42, borderRadius: 11, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <i className={`ti ${opt.icon}`} style={{ fontSize: 20, color: 'var(--accent)' }} />
                          </div>
                          <div>
                            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{opt.label}</p>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{opt.sub}</p>
                          </div>
                          <i className="ti ti-chevron-right" style={{ fontSize: 14, color: 'var(--border)', marginLeft: 'auto' }} />
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                      <button onClick={() => setPickerStep('type')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, padding: 0, display: 'flex' }}><i className="ti ti-arrow-left" /></button>
                      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Invite your partner</p>
                    </div>
                    {inviteLoading ? (
                      <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>Generating invite code…</div>
                    ) : inviteCode ? (
                      <div style={{ padding: '20px 16px', background: 'var(--bg-input)', borderRadius: 14, border: '1px solid var(--border)', textAlign: 'center' }}>
                        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 10px', fontWeight: 600 }}>Share this code with your partner</p>
                        <p style={{ fontSize: 30, fontWeight: 700, color: 'var(--accent)', letterSpacing: 5, margin: '0 0 14px', fontFamily: "'Urbanist', sans-serif" }}>{inviteCode}</p>
                        <p style={{ fontSize: 11, color: 'var(--border-light)', margin: '0 0 14px', lineHeight: 1.5 }}>They'll enter this code during sign-up to join your family journal.</p>
                        <button onClick={() => { navigator.clipboard?.writeText(inviteCode); }} style={{ background: 'var(--bg-card)', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--accent)', fontFamily: "'Urbanist', sans-serif", padding: '10px 20px', borderRadius: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <i className="ti ti-copy" style={{ fontSize: 14 }} />Copy code
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Add kid sheet */}
          {addingKid && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, padding: '0 16px' }} onClick={() => setAddingKid(false)}>
              <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>Add a child</p>
                <input
                  className="input-field"
                  placeholder="Name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  style={{ marginBottom: 10, fontSize: 16 }}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                  <div style={{ position: 'relative', flex: 2.2 }}>
                    <select value={newBdMonth} onChange={e => setNewBdMonth(e.target.value)} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '13px 32px 13px 14px', fontSize: 15, outline: 'none', background: 'var(--bg-input)', color: newBdMonth ? 'var(--text)' : 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif", appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}>
                      <option value="" disabled>Month</option>
                      {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                        <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                      ))}
                    </select>
                    <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12, pointerEvents: 'none' }} />
                  </div>
                  <input type="number" placeholder="Day" value={newBdDay} min={1} max={31} onChange={e => setNewBdDay(e.target.value)} style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 10, padding: '13px 8px', fontSize: 15, outline: 'none', background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'Urbanist', sans-serif", textAlign: 'center' }} />
                  <input type="number" placeholder="Year" value={newBdYear} min={1900} max={2030} onChange={e => setNewBdYear(e.target.value)} style={{ flex: 1.5, border: '1px solid var(--border)', borderRadius: 10, padding: '13px 8px', fontSize: 15, outline: 'none', background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'Urbanist', sans-serif", textAlign: 'center' }} />
                </div>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '12px 0 8px' }}>Sex <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional — improves growth chart accuracy)</span></p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  {[['M', 'Boy'], ['F', 'Girl']].map(([val, label]) => (
                    <button key={val} onClick={() => setNewSex(newSex === val ? null : val)} style={{ flex: 1, border: `1px solid ${newSex === val ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, padding: '11px 0', fontSize: 14, fontWeight: 600, fontFamily: "'Urbanist', sans-serif", background: newSex === val ? 'var(--accent)' : 'var(--bg-input)', color: newSex === val ? '#fff' : 'var(--text-2)', cursor: 'pointer' }}>{label}</button>
                  ))}
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', opacity: newName.trim() && newBirthdate && !addSaving ? 1 : 0.4 }}
                  disabled={!newName.trim() || !newBirthdate || addSaving}
                  onClick={handleSaveNewKid}
                >
                  {addSaving ? 'Saving…' : 'Add'}
                </button>
              </div>
            </div>
          )}

          {/* Edit kid sheet */}
          {editingKid && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, padding: '0 16px' }} onClick={() => setEditingKid(null)}>
              <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>Edit {editingKid.name}</p>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>Name</p>
                <input
                  className="input-field"
                  value={kidNameInput}
                  onChange={e => setKidNameInput(e.target.value)}
                  placeholder="Name"
                  style={{ marginBottom: 16, fontSize: 16 }}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter' && kidNameInput.trim()) { onRenameKid(editingKid.id, kidNameInput.trim()); onUpdateKidSex?.(editingKid.id, kidSexInput); setEditingKid(null); } }}
                />
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>Sex <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(for growth chart percentiles)</span></p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                  {[['M', 'Boy'], ['F', 'Girl']].map(([val, label]) => (
                    <button key={val} onClick={() => setKidSexInput(kidSexInput === val ? null : val)} style={{ flex: 1, border: `1px solid ${kidSexInput === val ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, padding: '11px 0', fontSize: 14, fontWeight: 600, fontFamily: "'Urbanist', sans-serif", background: kidSexInput === val ? 'var(--accent)' : 'var(--bg-input)', color: kidSexInput === val ? '#fff' : 'var(--text-2)', cursor: 'pointer' }}>{label}</button>
                  ))}
                </div>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>Amazon wishlist <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional — shown to friends near their birthday)</span></p>
                <input
                  className="input-field"
                  type="url"
                  value={kidWishlistInput}
                  onChange={e => setKidWishlistInput(e.target.value)}
                  placeholder="https://www.amazon.com/hz/wishlist/ls/..."
                  style={{ marginBottom: 20, fontSize: 14 }}
                />
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', opacity: kidNameInput.trim() ? 1 : 0.4 }}
                  disabled={!kidNameInput.trim()}
                  onClick={() => { onRenameKid(editingKid.id, kidNameInput.trim()); onUpdateKidSex?.(editingKid.id, kidSexInput); onUpdateKidWishlist?.(editingKid.id, kidWishlistInput.trim() || null); setEditingKid(null); }}
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Edit name sheet */}
          {editingName && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, padding: '0 16px' }} onClick={() => setEditingName(false)}>
              <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>Your name</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>How friends find you on Patina</p>
                <input
                  className="input-field"
                  value={realNameInput}
                  onChange={e => setRealNameInput(e.target.value)}
                  placeholder="e.g. Alex, Pearl…"
                  style={{ marginBottom: 20, fontSize: 18 }}
                  autoFocus
                />
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>What do your kids call you?</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>Shown in journal entries</p>
                <input
                  className="input-field"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  placeholder="Mom, Dad, Mama…"
                  style={{ marginBottom: 20, fontSize: 18 }}
                />
                <button
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => {
                    if (realNameInput.trim()) onUpdateRealName?.(realNameInput.trim());
                    if (nameInput.trim()) onUpdateDisplayName(nameInput.trim());
                    setEditingName(false);
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Edit real name sheet */}
          {editingRealName && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, padding: '0 16px' }} onClick={() => setEditingRealName(false)}>
              <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>Your name</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>How friends will find you on Patina.</p>
                <input
                  className="input-field"
                  value={realNameInput}
                  onChange={e => setRealNameInput(e.target.value)}
                  placeholder="e.g. Meg, Alex…"
                  style={{ marginBottom: 16, fontSize: 18 }}
                  autoFocus
                />
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', opacity: realNameInput.trim() ? 1 : 0.4 }}
                  disabled={!realNameInput.trim()}
                  onClick={() => { onUpdateRealName?.(realNameInput.trim()); setEditingRealName(false); }}
                >
                  Save
                </button>
              </div>
            </div>
          )}


        </div>
      </div>

      {cropState && (
        <AvatarCropModal
          imageSrc={cropState.src}
          onConfirm={blob => { cropState.onConfirm(blob); setCropState(null); }}
          onCancel={() => setCropState(null)}
        />
      )}

      {showDeleteConfirm && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.4)', display: 'flex', alignItems: 'flex-end', zIndex: 20 }} onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', padding: '28px 24px 44px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(212,133,106,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <i className="ti ti-trash" style={{ fontSize: 20, color: '#D4856A' }} />
            </div>
            <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px', textAlign: 'center' }}>Delete your account?</p>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', textAlign: 'center', lineHeight: 1.55 }}>
              {hasPartner
                ? "You'll be removed from the family, but all your posts and photos will stay — your partner won't lose anything."
                : "This permanently deletes all your entries, photos, and kids' profiles. This cannot be undone."}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Cancel</button>
              <button
                className="btn"
                style={{ flex: 1, background: '#D4856A', color: '#fff', opacity: deleting ? 0.6 : 1 }}
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  await onDeleteAccount();
                  setDeleting(false);
                  setShowDeleteConfirm(false);
                }}
              >
                {deleting ? <><i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} /> Deleting…</> : 'Delete everything'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showHidePostsPrompt && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.4)', display: 'flex', alignItems: 'flex-end', zIndex: 20 }} onClick={() => !hidingPosts && setShowHidePostsPrompt(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', padding: '28px 24px 44px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <i className="ti ti-eye-off" style={{ fontSize: 20, color: 'var(--accent)' }} />
            </div>
            <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px', textAlign: 'center' }}>Hide your previous posts from friends?</p>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', textAlign: 'center', lineHeight: 1.55 }}>
              Turning off discoverable only stops new people from finding you — friends you already have can still see what you've shared with them. Hiding your past posts removes them from friends only; your partner and family keep seeing everything.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowHidePostsPrompt(false)} disabled={hidingPosts}>Keep them visible</button>
              <button
                className="btn"
                style={{ flex: 1, background: '#D4856A', color: '#fff', opacity: hidingPosts ? 0.6 : 1 }}
                disabled={hidingPosts}
                onClick={async () => {
                  setHidingPosts(true);
                  await onHidePostsFromFriends?.();
                  setHidingPosts(false);
                  setShowHidePostsPrompt(false);
                }}
              >
                {hidingPosts ? <><i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} /> Hiding…</> : 'Hide from friends'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Privacy Policy screen ────────────────────────────────────────────────

function PrivacyPolicyScreen({ onBack }) {
  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>Privacy Policy</h2>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 20px' }}>Effective July 4, 2026</p>

          {[
            { title: 'Who We Are', body: 'Patina is a private family journaling app. Contact us at hello@patinafamily.com.' },
            { title: 'What We Collect', body: 'Account information (email, display name), family information (children\'s names, birthdates, photos), journal entries (text, photos, videos), and friend connections you choose to make. We do not use ad networks or behavioral tracking.' },
            { title: 'How We Use It', body: 'To provide the app, display your entries to your family, and send account-related emails (password resets, etc.). We do not sell your data or use it for advertising.' },
            { title: 'Sharing', body: 'We use Supabase for database and authentication, and Cloudinary for photo and video storage. We share your data with no one else. Within the app, your letter text is visible only to family members — friends see only photos and basic context.' },
            { title: 'Children\'s Information', body: 'Patina is for parents journaling about their children. Parents control all accounts. We do not knowingly collect information directly from children under 13. Contact hello@patinafamily.com if you believe a child has independently created an account.' },
            { title: 'Deletion', body: 'You can delete your account anytime from the Profile screen. This permanently removes your profile, entries, media, and family data. If others remain in your family, only your personal data is removed.' },
            { title: 'Security', body: 'We use HTTPS and Supabase\'s row-level security so users can only access their own data. No system is 100% secure; we encourage you to keep personal backups of entries that matter to you.' },
            { title: 'California Residents (CCPA)', body: 'You have the right to know what data we collect, request deletion, and opt out of the sale of your data (we do not sell data). Email hello@patinafamily.com to exercise these rights.' },
            { title: 'Changes', body: 'We may update this policy. Continued use after changes constitutes acceptance.' },
            { title: 'Contact', body: 'hello@patinafamily.com' },
          ].map(({ title, body }) => (
            <div key={title} style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>{title}</p>
              <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.65 }}>{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Terms of Service screen ──────────────────────────────────────────────

function TermsScreen({ onBack }) {
  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>Terms of Service</h2>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 20px' }}>Effective July 4, 2026</p>

          {[
            { title: 'Acceptance', body: 'By creating an account or using Patina, you agree to these Terms. If you do not agree, do not use the app.' },
            { title: 'What Patina Is', body: 'Patina is a private family journaling app, currently free to use. We reserve the right to introduce paid features in the future and will notify existing users before doing so.' },
            { title: 'Your Account', body: 'You must be 18 or older to create an account. You are responsible for keeping your credentials secure and for all activity under your account. Notify us at hello@patinafamily.com if you suspect unauthorized access.' },
            { title: 'Your Content', body: 'You retain full ownership of everything you post. By uploading content, you grant us a limited license to store and display it within the app solely to provide the service to you and your family.' },
            { title: 'Prohibited Uses', body: 'You agree not to use Patina for any unlawful purpose, upload illegal or abusive content, attempt to access another user\'s data, or reverse-engineer the service. Content involving child exploitation will be reported to authorities and result in immediate account termination.' },
            { title: 'Friends Feature', body: 'You control who you add as a friend. Friends can see your photos and milestones by default. Sharing your letter text with friends is optional — you choose the sharing level for each entry (Private, Partner only, or All). You can remove friends at any time, which immediately revokes their access.' },
            { title: 'Termination', body: 'We reserve the right to suspend or terminate accounts that violate these Terms. You may delete your account anytime from the Profile screen.' },
            { title: 'Disclaimer', body: 'Patina is provided "as is" without warranties of any kind. We do not guarantee the service will be uninterrupted or error-free. We strongly encourage you to keep personal backups of entries that matter to you.' },
            { title: 'Limitation of Liability', body: 'To the fullest extent permitted by law, Patina and its creators shall not be liable for any indirect, incidental, or consequential damages arising from your use of the app, including data loss.' },
            { title: 'Governing Law', body: 'These Terms are governed by the laws of the State of California, without regard to conflict of law principles.' },
            { title: 'Changes', body: 'We may update these Terms. Continued use after changes constitutes acceptance.' },
            { title: 'Contact', body: 'hello@patinafamily.com' },
          ].map(({ title, body }) => (
            <div key={title} style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>{title}</p>
              <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.65 }}>{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Join family screen ───────────────────────────────────────────────────

function JoinFamilyScreen({ onJoin, onBack }) {
  const [step, setStep] = useState('code');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleJoin() {
    if (!code.trim() || !displayName.trim()) return;
    setLoading(true);
    setError('');
    const result = await onJoin(code, displayName.trim());
    if (result?.cancelled) { setLoading(false); return; }
    if (result?.error) { setError(result.error); setLoading(false); }
  }

  const backFn = step === 'name' ? () => setStep('code') : onBack;

  return (
    <div className="screen">
      <div className="scroll-area">
        <div style={{ padding: '60px 28px 48px', display: 'flex', flexDirection: 'column', minHeight: 560, justifyContent: 'center' }}>
          <button onClick={backFn} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 36px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, fontFamily: "'Urbanist', sans-serif", alignSelf: 'flex-start' }}>
            <i className="ti ti-arrow-left" style={{ fontSize: 16 }} /> Back
          </button>

          {step === 'code' && (
            <>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: 'var(--text)', margin: '0 0 10px', lineHeight: 1.2 }}>
                Enter your<br />invite code
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.7, margin: '0 0 32px' }}>
                Ask your partner for the code from the Family screen.
              </p>
              <input
                className="input-field"
                placeholder="XK7P2M"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                style={{ fontSize: 28, letterSpacing: 6, textAlign: 'center', fontWeight: 700, marginBottom: 20 }}
                autoFocus
                autoCapitalize="characters"
                onKeyDown={e => { if (e.key === 'Enter' && code.trim().length >= 4) setStep('name'); }}
              />
              <button
                className="btn btn-primary"
                style={{ width: '100%', opacity: code.trim().length >= 4 ? 1 : 0.4 }}
                disabled={code.trim().length < 4}
                onClick={() => setStep('name')}
              >
                Continue
              </button>
            </>
          )}

          {step === 'name' && (
            <>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: 'var(--text)', margin: '0 0 10px', lineHeight: 1.2 }}>
                What do the<br />kids call you?
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.7, margin: '0 0 32px' }}>
                This is how you'll appear in the journal.
              </p>
              <input
                className="input-field"
                placeholder="Mom, Dad, Mama…"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                style={{ fontSize: 20, marginBottom: 20 }}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && displayName.trim()) handleJoin(); }}
              />
              {error && <p style={{ fontSize: 13, color: '#D4856A', marginBottom: 12, textAlign: 'center' }}>{error}</p>}
              <button
                className="btn btn-primary"
                style={{ width: '100%', opacity: displayName.trim() && !loading ? 1 : 0.4 }}
                disabled={!displayName.trim() || loading}
                onClick={handleJoin}
              >
                {loading ? 'Joining…' : 'Join family'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Nav bar ────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────

// ─── Friends screen ────────────────────────────────────────────────────────

function FriendAvatar({ name, avatarUrl, size = 38 }) {
  const [broken, setBroken] = useState(false);
  if (avatarUrl && !broken) {
    return (
      <span className="thumb" style={{ width: size, height: size, flexShrink: 0 }}>
        <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setBroken(true)} />
      </span>
    );
  }
  return (
    <span className="thumb" style={{ width: size, height: size, fontSize: Math.round(size * 0.4), background: 'var(--bg-elevated)', flexShrink: 0 }}>
      {name?.[0]?.toUpperCase() || '?'}
    </span>
  );
}

function FriendsScreen({ friends, friendKids, friendEntries = [], familyMemberIds = [], onBack, onSearch, onSendRequest, onInviteFriend, onRespond, onUnfriend, onOpenFriendEntry, onFriendBirthdayClick, socialName, friendUserFamilyMap = {}, onSwitchSection }) {
  const { reactionNotifications = [], birthdayNotifications = [], friendRequests = [], onClearReactions, onDismissReaction, onDismissBirthday } = useNotif() ?? {};
  const { userId: currentUserId, session } = useSession() ?? {};
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef(null);
  const [sentIds, setSentIds] = useState(new Set());
  const [inviting, setInviting] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [selectedFriendUid, setSelectedFriendUid] = useState(null);
  const [friendViewer, setFriendViewer] = useState(null);
  const [viewerLikes, setViewerLikes] = useState([]);
  const [viewerComments, setViewerComments] = useState([]);
  const [viewerCommentText, setViewerCommentText] = useState('');
  const [showLikeAnim, setShowLikeAnim] = useState(false);
  const lastTapRef = useRef(0);
  const searchTimer = useRef(null);

  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

  // Merge birthday notifications with the same kid name into one card with combined family names
  const groupedBirthdayNotifs = useMemo(() => {
    const groups = new Map();
    for (const n of birthdayNotifications) {
      const key = n.kidName?.toLowerCase() || n.id;
      if (groups.has(key)) {
        const g = groups.get(key);
        if (n.familyName && !g.familyNames.includes(n.familyName)) g.familyNames.push(n.familyName);
        g.kidIds.push(n.kidId);
        g.ids.push(n.id);
      } else {
        groups.set(key, { ...n, familyNames: n.familyName ? [n.familyName] : [], kidIds: [n.kidId], ids: [n.id] });
      }
    }
    return Array.from(groups.values());
  }, [birthdayNotifications]);

  useEffect(() => {
    if (!friendViewer || !supabase) return;
    const id = friendViewer.entry.id;
    Promise.all([
      supabase.from('entry_likes').select('*').eq('entry_id', id),
      supabase.from('entry_comments').select('*').eq('entry_id', id).is('parent_id', null).order('created_at'),
    ]).then(([{ data: lks }, { data: cms }]) => {
      setViewerLikes(lks || []);
      setViewerComments(cms || []);
    });
  }, [friendViewer]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleViewerLike() {
    if (!supabase || !session || !friendViewer) return;
    const entryId = friendViewer.entry.id;
    const userId = session.user.id;
    const already = viewerLikes.some(l => l.user_id === userId);
    if (already) {
      setViewerLikes(p => p.filter(l => l.user_id !== userId));
      await supabase.from('entry_likes').delete().eq('entry_id', entryId).eq('user_id', userId);
    } else {
      const fake = { entry_id: entryId, user_id: userId, display_name: socialName || '' };
      setViewerLikes(p => [...p, fake]);
      await supabase.from('entry_likes').insert({ entry_id: entryId, user_id: userId, display_name: socialName || '' });
    }
  }

  async function handleViewerComment() {
    if (!supabase || !session || !viewerCommentText.trim() || !friendViewer) return;
    const body = viewerCommentText.trim();
    setViewerCommentText('');
    const { data } = await supabase.from('entry_comments').insert({ entry_id: friendViewer.entry.id, user_id: session.user.id, display_name: socialName || '', body }).select().single();
    if (data) setViewerComments(p => [...p, data]);
  }

  const pendingIncoming = friendRequests.filter(r => r.addressee_id === currentUserId);
  const pendingOutgoing = friendRequests.filter(r => r.requester_id === currentUserId);

  const friendAvatarMap = useMemo(() => {
    const map = {};
    friends.forEach(fr => {
      const isReq = fr.requester_id === currentUserId;
      const id = isReq ? fr.addressee_id : fr.requester_id;
      map[id] = isReq ? fr.addressee_avatar_url : fr.requester_avatar_url;
    });
    return map;
  }, [friends, currentUserId]);

  function handleQueryChange(val) {
    setSearchQuery(val);
    clearTimeout(searchTimer.current);
    if (!val.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const results = await onSearch(val);
      setSearchResults(results);
      setSearching(false);
    }, 400);
  }

  function friendUserId(fr) {
    return fr.requester_id === currentUserId ? fr.addressee_id : fr.requester_id;
  }
  function friendDisplayName(fr) {
    return fr.requester_id === currentUserId ? fr.addressee_display_name : fr.requester_display_name;
  }

  async function handleInvite() {
    if (!onInviteFriend || inviting) return;
    setInviting(true);
    const code = await onInviteFriend();
    setInviting(false);
    if (!code) return;
    const link = `${getAuthRedirectUrl()}/?invite=${code}`;
    const shareData = {
      title: 'Join me on Patina',
      text: `I've been writing letters to my kids on Patina, and it seemed like something you and your family might enjoy. Join me?`,
      url: link,
    };
    if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
      try { await navigator.share(shareData); return; } catch (_) { /* user cancelled */ return; }
    }
    try {
      await navigator.clipboard.writeText(link);
      setInviteLinkCopied(true);
      setTimeout(() => setInviteLinkCopied(false), 2000);
    } catch (_) {}
  }

  return (
    <div className="screen" style={{ position: 'relative' }}>
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: 'var(--accent)', margin: 0, textAlign: 'center' }}>Friends</h2>
              <button className="icon-btn" onClick={() => { if (showSearch) { setSearchQuery(''); setSearchResults([]); } setShowSearch(s => !s); }}>
                <i className={`ti ${showSearch ? 'ti-x' : 'ti-search'}`} />
              </button>
            </div>

            <div>
              <SectionSwitcher
                tabs={[{ id: 'circle-feed', label: 'Glimpse' }, { id: 'friends', label: 'Activity' }]}
                active="friends"
                onChange={onSwitchSection}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div style={{ background: 'var(--accent)', borderRadius: 14, padding: '14px 12px' }}>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#C8993E', margin: 0, lineHeight: 1 }}>{friends.length}</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: '5px 0 0', fontWeight: 600 }}>friend{friends.length !== 1 ? 's' : ''}</p>
            </div>
            <div style={{ background: pendingIncoming.length > 0 ? '#D4856A' : 'rgba(212,133,106,0.12)', borderRadius: 14, padding: '14px 12px' }}>
              <p style={{ fontSize: 28, fontWeight: 800, color: pendingIncoming.length > 0 ? '#fff' : '#D4856A', margin: 0, lineHeight: 1 }}>{pendingIncoming.length}</p>
              <p style={{ fontSize: 11, fontWeight: 600, color: pendingIncoming.length > 0 ? 'rgba(255,255,255,0.75)' : '#D4856A', margin: '5px 0 0' }}>requests</p>
            </div>
            <div style={{ background: (reactionNotifications.length + birthdayNotifications.length) > 0 ? '#C8993E' : 'rgba(200,153,62,0.12)', borderRadius: 14, padding: '14px 12px' }}>
              <p style={{ fontSize: 28, fontWeight: 800, color: (reactionNotifications.length + birthdayNotifications.length) > 0 ? '#fff' : '#C8993E', margin: 0, lineHeight: 1 }}>{reactionNotifications.length + birthdayNotifications.length}</p>
              <p style={{ fontSize: 11, fontWeight: 600, color: (reactionNotifications.length + birthdayNotifications.length) > 0 ? 'rgba(255,255,255,0.75)' : '#C8993E', margin: '5px 0 0' }}>new activity</p>
            </div>
          </div>

          <button onClick={handleInvite} disabled={inviting} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, cursor: inviting ? 'default' : 'pointer', fontFamily: "'Urbanist', sans-serif", opacity: inviting ? 0.75 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(74,94,80,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="ti ti-user-plus" style={{ fontSize: 16, color: 'var(--accent)' }} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{inviting ? 'Generating invite…' : inviteLinkCopied ? 'Link copied!' : 'Invite a friend'}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>Growing alone, but walking together</p>
              </div>
            </div>
            <i className="ti ti-chevron-right" style={{ fontSize: 14, color: 'var(--text-muted)', flexShrink: 0 }} />
          </button>

          {showSearch && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <i className="ti ti-search" style={{ color: 'var(--text-muted)', fontSize: 16 }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search by name…"
                value={searchQuery}
                onChange={e => handleQueryChange(e.target.value)}
                style={{ border: 'none', outline: 'none', flex: 1, fontSize: 16, background: 'transparent', color: 'var(--text)', fontFamily: 'Inter, sans-serif' }}
              />
              {searching && <i className="ti ti-loader-2" style={{ fontSize: 14, color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />}
              {searchQuery && !searching && (
                <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
                  <i className="ti ti-x" style={{ fontSize: 14 }} />
                </button>
              )}
            </div>
          )}

          {searchResults.length > 0 && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              {searchResults.map((user, idx) => {
                const isFriend = friends.some(f => friendUserId(f) === user.id);
                const isPending = pendingOutgoing.some(r => r.addressee_id === user.id) || sentIds.has(user.id);
                const isFamily = familyMemberIds.includes(user.id);
                return (
                  <div key={user.id} style={{ padding: '12px 16px', borderBottom: idx < searchResults.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <FriendAvatar name={user.display_name} avatarUrl={user.avatar_url} />
                      <p style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{user.display_name || 'User'}</p>
                      {isFamily ? (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Family</span>
                      ) : isFriend ? (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Friends</span>
                      ) : isPending ? (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sent</span>
                      ) : (
                        <button
                          style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                          onClick={async () => {
                            const { error } = await onSendRequest(user.id, user.display_name, user.avatar_url);
                            if (!error) setSentIds(prev => new Set([...prev, user.id]));
                          }}
                        >
                          Add
                        </button>
                      )}
                    </div>
                    {user.kid_names?.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, paddingLeft: 44 }}>
                        {user.kid_names.map((name, i) => (
                          <span key={i} style={{ fontSize: 11, color: 'var(--text-2)', background: 'var(--bg-elevated)', borderRadius: 999, padding: '3px 10px' }}>
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {searchQuery && !searching && searchResults.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>No users found</p>
          )}

          {(reactionNotifications.length > 0 || birthdayNotifications.length > 0) && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Activity</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                {(reactionNotifications.length > 0 || birthdayNotifications.length > 0) && <button onClick={() => { onClearReactions?.(); birthdayNotifications.forEach(n => onDismissBirthday?.(n.id)); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: 0 }}>Mark all as read</button>}
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                {groupedBirthdayNotifs.map((n, idx) => {
                  const kid = friendKids.find(k => k.id === n.kidId) || { id: n.kidId, name: n.kidName, birthdate: n.birthdate };
                  const isToday = n.ts ? new Date(n.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) === new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : false;
                  const familyLabel = n.familyNames.length > 1
                    ? n.familyNames.slice(0, -1).join(', ') + ' and ' + n.familyNames.slice(-1) + "'s family"
                    : n.familyNames[0] ? `${n.familyNames[0]}'s family` : null;
                  return (
                    <div key={n.id} onClick={() => onFriendBirthdayClick?.(kid)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: (idx < groupedBirthdayNotifs.length - 1 || reactionNotifications.length > 0) ? '1px solid var(--border)' : 'none', cursor: 'pointer', background: 'rgba(74,94,80,0.08)' }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(74,94,80,0.15)', border: '1px solid rgba(74,94,80,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <i className="ti ti-cake" style={{ fontSize: 16, color: 'var(--accent)' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>
                          <strong>{n.kidName}</strong> turned {n.age} {isToday ? 'today' : n.ts ? 'on ' + new Date(n.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'recently'}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                          {familyLabel ? `${familyLabel} · ` : ''}{n.ts ? timeAgo(n.ts) : 'Recently'}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(200,153,62,0.12)', border: '1px solid rgba(200,153,62,0.3)', borderRadius: '50%', width: 28, height: 28, flexShrink: 0 }}>
                        <i className="ti ti-player-play-filled" style={{ fontSize: 11, color: '#C8993E' }} />
                      </div>
                    </div>
                  );
                })}
                {reactionNotifications.map((n, idx) => (
                  <div key={n.id} onClick={() => {
                    if (onDismissReaction) onDismissReaction(n.id);
                    if (onOpenFriendEntry) onOpenFriendEntry(n.entryId);
                  }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: idx < reactionNotifications.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <FriendAvatar name={n.fromName} avatarUrl={friendAvatarMap[n.fromUserId]} size={36} />
                      <span style={{ position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: '50%', background: n.type === 'like' ? '#E05C6A' : n.type === 'reply' ? '#7A6A8A' : 'var(--accent)', border: '1.5px solid var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className={n.type === 'like' ? 'ti ti-heart-filled' : n.type === 'reply' ? 'ti ti-arrow-back-up' : 'ti ti-message-circle'} style={{ fontSize: 8, color: '#fff' }} />
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>
                        <strong>{n.fromName}</strong>
                        {n.type === 'like' ? ` liked ${n.kidNames}'s photo` : n.type === 'reply' ? ` replied to your comment` : ` commented on ${n.kidNames}'s photo`}
                      </p>
                      {(n.type === 'comment' || n.type === 'reply') && n.body && (
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-2)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>&ldquo;{n.body}&rdquo;</p>
                      )}
                      {n.ts && <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(n.ts)}</p>}
                    </div>
                    <i className="ti ti-chevron-right" style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {pendingIncoming.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Friend Requests</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 11, color: 'var(--border-light)', fontWeight: 600 }}>{pendingIncoming.length}</span>
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                {pendingIncoming.map((req, idx) => (
                  <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: idx < pendingIncoming.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <FriendAvatar name={req.requester_display_name} avatarUrl={req.requester_avatar_url} />
                    <p style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{req.requester_display_name || 'User'}</p>
                    <button onClick={() => onRespond(req.id, true)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Accept</button>
                    <button onClick={() => onRespond(req.id, false)} style={{ background: 'var(--bg-elevated)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Decline</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {friends.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>My Friends</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 11, color: 'var(--border-light)', fontWeight: 600 }}>{friends.length}</span>
              </div>
              {friends.map(fr => {
                const uid = friendUserId(fr);
                const name = friendDisplayName(fr);
                const avatar = fr.requester_id === currentUserId ? fr.addressee_avatar_url : fr.requester_avatar_url;
                const friendFamilyId = friendUserFamilyMap[uid];
                const theirKids = friendKids.filter(k => friendFamilyId ? k.familyId === friendFamilyId : k.userId === uid);
                return (
                  <div key={fr.id} onClick={() => setSelectedFriendUid(uid)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 10, cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: theirKids.length > 0 ? 10 : 0 }}>
                      <FriendAvatar name={name} avatarUrl={avatar} />
                      <p style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{name || 'Friend'}</p>
                      <i className="ti ti-chevron-right" style={{ fontSize: 14, color: 'var(--text-muted)' }} />
                    </div>
                    {theirKids.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {theirKids.map(k => (
                          <span key={k.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-2)', background: 'var(--bg-elevated)', borderRadius: 999, padding: '3px 10px 3px 4px' }}>
                            <span style={{ width: 20, height: 20, borderRadius: '50%', background: k.accent || KID_ACCENTS[0], overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {k.avatar
                                ? <img src={cloudinaryTransform(k.avatar, 'w_40,h_40,c_fill,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                                : <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{k.name?.[0]?.toUpperCase()}</span>}
                            </span>
                            {k.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {friends.length === 0 && pendingIncoming.length === 0 && reactionNotifications.length === 0 && birthdayNotifications.length === 0 && !searchQuery && (
            <div className="empty-state">
              <i className="ti ti-users" style={{ fontSize: 36, color: 'var(--border)', display: 'block', marginBottom: 12 }} />
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>We believe that your personal letters should stay between you and your family. Friends will only see your photos and a little context, nothing more.</p>
            </div>
          )}
        </div>
      </div>

      {selectedFriendUid && (() => {
        const fr = friends.find(f => friendUserId(f) === selectedFriendUid);
        if (!fr) return null;
        const name = friendDisplayName(fr);
        const avatar = fr.requester_id === currentUserId ? fr.addressee_avatar_url : fr.requester_avatar_url;
        const selectedFamilyId = friendUserFamilyMap[selectedFriendUid];
        const theirKids = friendKids.filter(k => selectedFamilyId ? k.familyId === selectedFamilyId : k.userId === selectedFriendUid);
        const theirKidIds = new Set(theirKids.map(k => k.id));
        const theirEntries = selectedFamilyId
          ? friendEntries.filter(e => e.media?.length > 0 && e.familyId === selectedFamilyId)
          : friendEntries.filter(e => e.media?.length > 0 && e.kids.some(kid => theirKidIds.has(kid)));
        return (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.4)', zIndex: 30, display: 'flex', alignItems: 'flex-end' }} onClick={() => setSelectedFriendUid(null)}>
            <div className="quick-sheet" style={{ background: 'var(--bg)', borderRadius: '24px 24px 0 0', width: '100%', maxHeight: '88%', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', margin: '12px auto 4px' }} />

              <div style={{ padding: '16px 20px 14px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: '1px solid var(--border)' }}>
                <FriendAvatar name={name} avatarUrl={avatar} size={54} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: '0 0 5px' }}>{name || 'Friend'}</p>
                  {theirKids.length > 0 && (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {theirKids.map(k => (
                        <span key={k.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-2)', background: 'var(--bg-elevated)', borderRadius: 999, padding: '3px 10px 3px 4px' }}>
                          <span style={{ width: 20, height: 20, borderRadius: '50%', background: k.accent || KID_ACCENTS[0], overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {k.avatar
                              ? <img src={cloudinaryTransform(k.avatar, 'w_40,h_40,c_fill,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                              : <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{k.name?.[0]?.toUpperCase()}</span>}
                          </span>
                          {k.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => { setSelectedFriendUid(null); onUnfriend(fr.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: 0, flexShrink: 0 }}>Remove</button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto' }}>
                {theirEntries.length === 0 ? (
                  <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                    <i className="ti ti-camera-off" style={{ fontSize: 28, color: 'var(--border)', display: 'block', marginBottom: 10 }} />
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No shared photos yet</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, padding: 2 }}>
                    {theirEntries.map(e => {
                      const m = e.media[0];
                      const isVideo = m.type === 'video';
                      const thumbSrc = isVideo
                        ? videoThumbUrl(m.url, 'so_0,w_400,h_400,c_fill,q_auto,f_auto')
                        : cloudinaryTransform(m.url, 'w_400,h_400,c_fill,q_auto,f_auto');
                      return (
                        <div key={e.id} style={{ aspectRatio: '1', overflow: 'hidden', cursor: 'pointer', position: 'relative', background: 'var(--bg-elevated)' }}
                          onClick={() => { const entryKids = theirKids.filter(k => (e.kids || []).includes(k.id)); setFriendViewer({ entry: e, entryKids: entryKids.length ? entryKids : theirKids, friendName: name, friendAvatar: avatar }); }}>
                          <img src={thumbSrc} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" />
                          {isVideo && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className="ti ti-player-play-filled" style={{ color: '#fff', fontSize: 12 }} />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {friendViewer && (() => {
        const { entry, entryKids, friendName, friendAvatar } = friendViewer;
        const bgStyle = entryBgStyle(entry);
        const kidLabel = entryKids.map(k => k.name).join(' & ');
        const age = entryKids[0]?.birthdate ? exactAgeLabel(entryKids[0].birthdate, entry.date) : null;
        const entryDate = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const userHasLiked = viewerLikes.some(l => l.user_id === session?.user?.id);
        return (
          <div style={{ position: 'absolute', inset: 0, background: 'var(--bg)', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 16px 12px', flexShrink: 0 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>
                {friendAvatar ? <img src={cloudinaryTransform(friendAvatar, 'w_72,h_72,c_fill,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : friendName?.charAt(0) || '?'}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{friendName || 'Friend'}</p>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>{entryDate}</p>
              </div>
              <button onClick={() => { setFriendViewer(null); setViewerLikes([]); setViewerComments([]); }} style={{ background: 'var(--bg-elevated)', border: 'none', borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-2)', fontSize: 16, flexShrink: 0 }}>
                <i className="ti ti-x" />
              </button>
            </div>
            {/* Photo */}
            <div onClick={() => { const now = Date.now(); if (now - lastTapRef.current < 320) { handleViewerLike(); setShowLikeAnim(true); setTimeout(() => setShowLikeAnim(false), 800); } lastTapRef.current = now; }} style={{ width: '100%', aspectRatio: '4/3', flexShrink: 0, ...bgStyle, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative', cursor: 'pointer' }}>
              {entry.media?.[0]?.type === 'video' && <video src={entry.media[0].url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} controls playsInline onClick={e => e.stopPropagation()} />}
              {showLikeAnim && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}><i className="ti ti-heart-filled" style={{ fontSize: 80, color: '#fff', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.35))', animation: 'likeHeartPop 0.8s ease forwards' }} /></div>}
            </div>
            {/* Kid + like */}
            <div style={{ padding: '12px 16px 8px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, borderBottom: viewerComments.length > 0 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: '0 0 1px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{kidLabel}</p>
                {age && <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>{age}</p>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                <button onClick={handleViewerLike} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: userHasLiked ? '#E05C6A' : 'var(--text-3)', padding: 0 }}>
                  <i className={`ti ${userHasLiked ? 'ti-heart-filled' : 'ti-heart'}`} style={{ fontSize: 22 }} />
                  {viewerLikes.length > 0 && <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>{viewerLikes.length}</span>}
                </button>
                {viewerLikes.length > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'Inter, sans-serif' }}>
                    {viewerLikes.length >= 3
                      ? `${viewerLikes.length} likes`
                      : viewerLikes.length === 2
                        ? viewerLikes.map(l => l.display_name?.split(' ')[0] || 'Someone').join(' & ')
                        : viewerLikes[0]?.display_name || 'Someone'}
                  </span>
                )}
              </div>
            </div>
            {/* Comments */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '8px 16px' }}>
              {viewerComments.map(c => (
                <div key={c.id} style={{ marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginRight: 6 }}>{c.user_id === session?.user?.id ? (socialName || c.display_name) : (c.display_name || 'Someone')}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{c.body}</span>
                  </div>
                  {c.user_id === session?.user?.id && (
                    <button onClick={async () => { setViewerComments(p => p.filter(x => x.id !== c.id)); await supabase.from('entry_comments').delete().eq('id', c.id).eq('user_id', session.user.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '1px 0', flexShrink: 0 }}>
                      <i className="ti ti-trash" style={{ fontSize: 13 }} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {/* Comment input */}
            <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <input value={viewerCommentText} onChange={e => setViewerCommentText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleViewerComment()} placeholder="Add a comment…" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--text)', fontFamily: "'Urbanist', sans-serif" }} />
              {viewerCommentText.trim() && <button onClick={handleViewerComment} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif" }}>Post</button>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const NavBar = memo(function NavBar({ active, onNavigate, myAvatarUrl, onAdd }) {
  const { pendingRequestCount = 0, circleBadge = 0 } = useNotif() ?? {};
  const tabs = [
    { id: 'home', icon: 'ti-home', label: 'Home', group: ['home'] },
    { id: 'circle-feed', icon: 'ti-users', label: 'Friends', group: ['circle-feed', 'friends'], badge: pendingRequestCount + circleBadge },
  ];
  const tabsRight = [
    { id: 'recap', icon: 'ti-calendar', label: 'Keepsakes', group: ['recap', 'partner-letters', 'compare'] },
    { id: 'profile', icon: 'ti-user', label: 'Profile', group: ['profile'] },
  ];

  function tabStyle(tab) {
    const isActive = tab.group.includes(active);
    return {
      backgroundColor: isActive ? 'rgba(74,94,80,0.12)' : 'transparent',
      color: isActive ? 'var(--accent)' : 'var(--text-muted)',
    };
  }

  return (
    <>
      <div className="nav-frame">
        <div className="nav-bar">
          {tabs.map(tab => (
            <button key={tab.id} className="nv-tab" style={{ ...tabStyle(tab), position: 'relative' }} onClick={() => onNavigate(tab.id)}>
              <i className={`ti ${tab.icon}`} />
              <span>{tab.label}</span>
              {tab.badge > 0 && (
                <span style={{ position: 'absolute', top: 2, right: '50%', transform: 'translateX(14px)', minWidth: 16, height: 16, borderRadius: 999, background: '#E05C6A', border: '1.5px solid var(--bg-nav)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', lineHeight: 1, fontFamily: 'Inter, sans-serif' }}>
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                </span>
              )}
            </button>
          ))}
          <div className="nv-add-wrap">
            <button className="nv-add" onClick={onAdd ?? (() => onNavigate('new-entry'))}><i className="ti ti-plus" /></button>
          </div>
          {tabsRight.map(tab => (
            <button key={tab.id} className="nv-tab" style={tabStyle(tab)} onClick={() => onNavigate(tab.id)}>
              {tab.id === 'profile' ? (
                myAvatarUrl ? (
                  <span style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', display: 'block', border: `2px solid ${tab.group.includes(active) ? 'var(--accent)' : 'transparent'}` }}>
                    <img src={cloudinaryTransform(myAvatarUrl, 'w_144,h_144,c_fill,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" />
                  </span>
                ) : (
                  <i className={`ti ${tab.icon}`} style={{ fontSize: 38 }} />
                )
              ) : (
                <>
                  <i className={`ti ${tab.icon}`} />
                  <span>{tab.label}</span>
                </>
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  );
});

// ─── Auth screen ───────────────────────────────────────────────────────────

function AuthScreen() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkEmail, setCheckEmail] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit() {
    if (mode === 'reset') {
      if (!email) return;
      setLoading(true);
      setError('');
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getAuthRedirectUrl(),
      });
      setLoading(false);
      if (error) setError(error.message);
      else setResetSent(true);
      return;
    }
    if (!email || !password) return;
    setLoading(true);
    setError('');
    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getAuthRedirectUrl(),
        },
      });
      if (error) setError(error.message);
      else setCheckEmail(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    }
    setLoading(false);
  }

  if (checkEmail) {
    return (
      <div className="screen">
        <div className="scroll-area">
          <div style={{ padding: '60px 28px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 560, textAlign: 'center', gap: 16 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <i className="ti ti-mail-check" style={{ fontSize: 32, color: 'var(--accent)' }} />
            </div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: 'var(--text)', margin: 0 }}>Check your inbox</h2>
            <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.7, margin: 0 }}>
              We sent a confirmation link to<br />
              <strong style={{ color: 'var(--accent)' }}>{email}</strong>
            </p>
            <button onClick={() => setCheckEmail(false)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", marginTop: 8 }}>
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (resetSent) {
    return (
      <div className="screen">
        <div className="scroll-area">
          <div style={{ padding: '60px 28px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 560, textAlign: 'center', gap: 16 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <i className="ti ti-mail-check" style={{ fontSize: 32, color: 'var(--accent)' }} />
            </div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: 'var(--text)', margin: 0 }}>Check your inbox</h2>
            <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.7, margin: 0 }}>
              If an account exists for<br />
              <strong style={{ color: 'var(--accent)' }}>{email}</strong>,<br />
              we sent a link to reset your password.
            </p>
            <button onClick={() => { setResetSent(false); setMode('signin'); }} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", marginTop: 8 }}>
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="scroll-area">
        <div style={{ padding: '60px 28px 48px', display: 'flex', flexDirection: 'column', minHeight: 560, justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <img src="/icon-192.png" style={{ width: 76, height: 76, borderRadius: 17, display: 'block', margin: '0 auto 20px' }} alt="" />
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, color: 'var(--text)', margin: '0 0 10px' }}>Patina</h1>
            <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 15, color: 'var(--text-3)', margin: 0, textAlign: 'center' }}>
              For all the things you wish they knew, and all the moments you never want them to forget.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            <input
              className="input-field"
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              onKeyDown={e => e.key === 'Enter' && mode === 'reset' && handleSubmit()}
            />
            {mode !== 'reset' && (
              <input
                className="input-field"
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            )}
          </div>
          {mode === 'signin' && (
            <p style={{ textAlign: 'right', margin: '-8px 0 16px' }}>
              <button
                onClick={() => { setMode('reset'); setError(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: 0, fontFamily: "'Urbanist', sans-serif" }}
              >
                Forgot password?
              </button>
            </p>
          )}
          {error && (
            <p style={{ fontSize: 13, color: '#D4856A', marginBottom: 12, textAlign: 'center', lineHeight: 1.4 }}>{error}</p>
          )}
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginBottom: 16, opacity: loading || !email || (mode !== 'reset' && !password) ? 0.5 : 1 }}
            disabled={loading || !email || (mode !== 'reset' && !password)}
            onClick={handleSubmit}
          >
            {loading ? 'Please wait…' : mode === 'reset' ? 'Send reset link' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            {mode === 'reset'
              ? null
              : mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
            <button
              onClick={() => { setMode(mode === 'reset' ? 'signin' : mode === 'signup' ? 'signin' : 'signup'); setError(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 13, padding: 0, fontFamily: "'Urbanist', sans-serif" }}
            >
              {mode === 'reset' ? 'Back to sign in' : mode === 'signup' ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Update password (landing from a reset-password email link) ──────────

function UpdatePasswordScreen({ onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!password || password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords don’t match.'); return; }
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setDone(true);
  }

  if (done) {
    return (
      <div className="screen">
        <div className="scroll-area">
          <div style={{ padding: '60px 28px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 560, textAlign: 'center', gap: 16 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <i className="ti ti-circle-check" style={{ fontSize: 32, color: 'var(--accent)' }} />
            </div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: 'var(--text)', margin: 0 }}>Password updated</h2>
            <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.7, margin: 0 }}>
              You're all set — continue into your journal.
            </p>
            <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={onDone}>Continue</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="scroll-area">
        <div style={{ padding: '60px 28px 48px', display: 'flex', flexDirection: 'column', minHeight: 560, justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <img src="/icon-192.png" style={{ width: 76, height: 76, borderRadius: 17, display: 'block', margin: '0 auto 20px' }} alt="" />
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: 'var(--text)', margin: '0 0 10px' }}>Set a new password</h1>
            <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
              Choose a new password for your account.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            <input
              className="input-field"
              type="password"
              placeholder="New password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <input
              className="input-field"
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          {error && (
            <p style={{ fontSize: 13, color: '#D4856A', marginBottom: 12, textAlign: 'center', lineHeight: 1.4 }}>{error}</p>
          )}
          <button
            className="btn btn-primary"
            style={{ width: '100%', opacity: loading || !password || !confirm ? 0.5 : 1 }}
            disabled={loading || !password || !confirm}
            onClick={handleSubmit}
          >
            {loading ? 'Please wait…' : 'Update password'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Avatar crop / zoom modal ─────────────────────────────────────────────

function AvatarCropModal({ imageSrc, onConfirm, onCancel }) {
  const DISPLAY = 296;
  const CIRCLE_R = 128;
  const OUTPUT = 400;

  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  // All mutable state lives in a plain object via ref to avoid stale-closure issues
  const st = useRef({
    scale: 1, ox: 0, oy: 0, nw: 0, nh: 0, minScale: 0.1,
    dragging: false, lx: 0, ly: 0, pd: null, ps: 1, loaded: false,
  }).current;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    imgRef.current = img;
    let raf = null;

    function draw() {
      ctx.clearRect(0, 0, DISPLAY, DISPLAY);
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, DISPLAY, DISPLAY);
      if (!st.loaded) return;
      const dw = st.nw * st.scale;
      const dh = st.nh * st.scale;
      const dx = DISPLAY / 2 - dw / 2 + st.ox;
      const dy = DISPLAY / 2 - dh / 2 + st.oy;
      ctx.drawImage(img, dx, dy, dw, dh);
      // Dark overlay outside crop circle using evenodd fill
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, DISPLAY, DISPLAY);
      ctx.arc(DISPLAY / 2, DISPLAY / 2, CIRCLE_R, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(0,0,0,0.58)';
      ctx.fill('evenodd');
      ctx.restore();
      // Circle border
      ctx.strokeStyle = 'rgba(255,255,255,0.72)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(DISPLAY / 2, DISPLAY / 2, CIRCLE_R, 0, Math.PI * 2);
      ctx.stroke();
    }

    function schedule() {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    }

    img.onload = () => {
      st.nw = img.naturalWidth;
      st.nh = img.naturalHeight;
      st.loaded = true;
      const shorter = Math.min(st.nw, st.nh);
      st.minScale = (CIRCLE_R * 2) / shorter;
      st.scale = st.minScale;
      st.ox = 0; st.oy = 0;
      schedule();
    };
    img.src = imageSrc;

    function onWheel(e) {
      e.preventDefault();
      st.scale = Math.min(10, Math.max(st.minScale, st.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      schedule();
    }
    function onMouseDown(e) { st.dragging = true; st.lx = e.clientX; st.ly = e.clientY; }
    function onMouseMove(e) {
      if (!st.dragging) return;
      st.ox += e.clientX - st.lx; st.oy += e.clientY - st.ly;
      st.lx = e.clientX; st.ly = e.clientY;
      schedule();
    }
    function onMouseUp() { st.dragging = false; }

    function onTouchStart(e) {
      if (e.touches.length === 1) {
        st.dragging = true; st.pd = null;
        st.lx = e.touches[0].clientX; st.ly = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        st.dragging = false;
        st.pd = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
        st.ps = st.scale;
      }
    }
    function onTouchMove(e) {
      e.preventDefault();
      if (e.touches.length === 1 && st.dragging) {
        st.ox += e.touches[0].clientX - st.lx; st.oy += e.touches[0].clientY - st.ly;
        st.lx = e.touches[0].clientX; st.ly = e.touches[0].clientY;
        schedule();
      } else if (e.touches.length === 2 && st.pd !== null) {
        const d = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
        st.scale = Math.min(10, Math.max(st.minScale, st.ps * (d / st.pd)));
        schedule();
      }
    }
    function onTouchEnd() { st.dragging = false; st.pd = null; }

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleConfirm() {
    const img = imgRef.current;
    if (!img || !st.loaded) return;
    const out = document.createElement('canvas');
    out.width = OUTPUT; out.height = OUTPUT;
    const ctx = out.getContext('2d');
    const dw = st.nw * st.scale;
    const dh = st.nh * st.scale;
    const imgLeft = DISPLAY / 2 - dw / 2 + st.ox;
    const imgTop = DISPLAY / 2 - dh / 2 + st.oy;
    const cropLeft = DISPLAY / 2 - CIRCLE_R;
    const cropTop = DISPLAY / 2 - CIRCLE_R;
    const srcX = (cropLeft - imgLeft) / st.scale;
    const srcY = (cropTop - imgTop) / st.scale;
    const srcSize = (CIRCLE_R * 2) / st.scale;
    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT, OUTPUT);
    out.toBlob(blob => { if (blob) onConfirm(blob); }, 'image/jpeg', 0.92);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '0 20px' }}>
      <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, margin: '0 0 14px', fontFamily: 'Inter, sans-serif' }}>
        Drag to reposition · Pinch or scroll to zoom
      </p>
      <canvas
        ref={canvasRef}
        width={DISPLAY}
        height={DISPLAY}
        style={{ display: 'block', borderRadius: 12, cursor: 'grab', touchAction: 'none', maxWidth: '100%' }}
      />
      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button onClick={onCancel} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, padding: '12px 28px', borderRadius: 12, cursor: 'pointer' }}>
          Cancel
        </button>
        <button onClick={handleConfirm} style={{ background: 'var(--accent)', border: 'none', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, padding: '12px 28px', borderRadius: 12, cursor: 'pointer' }}>
          Use Photo
        </button>
      </div>
    </div>
  );
}

// ─── Onboarding ────────────────────────────────────────────────────────────

const ONBOARDING_LETTER = "Patina is the beauty that comes with age. These letters capture the mark you left on the quiet, seemingly unremarkable days that turned out to matter most. Writing them is our quiet, perilous attempt to slow down time. A gift for you to one day hold, and an anchor for us to inhabit today.";

function OnboardingScreen({ onDone, onJoinFamily, onSignOut, hasBackend, onGenerateInvite, onFinish }) {
  const [step, setStep] = useState('welcome');
  const [doneKids, setDoneKids] = useState([]);
  const [name, setName] = useState('');
  const [bdMonth, setBdMonth] = useState('');
  const [bdDay, setBdDay] = useState('');
  const [bdYear, setBdYear] = useState('');
  const birthdate = (bdMonth && bdDay && bdYear && bdYear.length === 4)
    ? `${bdYear}-${bdMonth}-${bdDay.padStart(2, '0')}`
    : '';
  const [avatar, setAvatar] = useState(null);
  const [cropSrc, setCropSrc] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [realName, setRealName] = useState('');
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [profilePhotoBlob, setProfilePhotoBlob] = useState(null);
  const [profileCropSrc, setProfileCropSrc] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [inviteCode, setInviteCode] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const fileInputRef = useRef(null);
  const profilePhotoInputRef = useRef(null);

  const [typed, setTyped] = useState(0);
  const [letterDone, setLetterDone] = useState(false);

  useEffect(() => {
    if (letterDone || typed >= ONBOARDING_LETTER.length) { setLetterDone(true); return; }
    const t = setTimeout(() => setTyped(p => p + 1), 28);
    return () => clearTimeout(t);
  }, [typed, letterDone]);

  const kidIndex = doneKids.length;
  const accent = KID_ACCENTS[kidIndex % KID_ACCENTS.length];
  const initial = name.trim() ? name.trim()[0].toUpperCase() : null;

  function goBack() {
    if (step === 'name') setStep('welcome');
    else if (step === 'birthdate') setStep('name');
    else if (step === 'photo') setStep('birthdate');
    else if (step === 'another') setStep('photo');
    else if (step === 'profile') setStep('another');
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setCropSrc(URL.createObjectURL(file));
    e.target.value = '';
  }

  function handleAnother() {
    setDoneKids(prev => [...prev, {
      id: kidIndex, name: name.trim(),
      accent: KID_ACCENTS[kidIndex % KID_ACCENTS.length],
      birthdate, avatar,
    }]);
    setName(''); setBdMonth(''); setBdDay(''); setBdYear(''); setAvatar(null);
    setStep('name');
  }

  function handleFinish() {
    setSaveError('');
    setDoneKids(prev => [...prev, {
      id: kidIndex, name: name.trim(),
      accent: KID_ACCENTS[kidIndex % KID_ACCENTS.length],
      birthdate, avatar,
    }]);
    setStep('profile');
  }

  async function handleReallyDone() {
    setSavingProfile(true);
    setSaveError('');
    try {
      const result = await onDone(doneKids, displayName.trim() || 'Parent', realName.trim(), profilePhotoBlob);
      if (result?.error) {
        setSaveError(result.error);
      } else if (hasBackend) {
        setStep('invite-partner');
        setInviteLoading(true);
        try {
          const code = await onGenerateInvite?.(result.familyId);
          setInviteCode(code);
        } finally {
          setInviteLoading(false);
        }
      }
    } catch (e) {
      setSaveError('Something went wrong. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <div className="screen" data-theme="light">
      <div className="scroll-area">
        <div style={{ padding: '60px 28px 48px', display: 'flex', flexDirection: 'column', minHeight: 560 }}>

          {step !== 'welcome' && step !== 'invite-partner' && (
            <button onClick={goBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 24px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, fontFamily: "'Urbanist', sans-serif", alignSelf: 'flex-start' }}>
              <i className="ti ti-arrow-left" style={{ fontSize: 16 }} /> Back
            </button>
          )}

          {step !== 'welcome' && (() => {
            const DOT_STEPS = ['name', 'birthdate', 'photo', 'profile', 'invite-partner'];
            const activeIdx = step === 'another' ? 2 : DOT_STEPS.indexOf(step);
            if (activeIdx < 0) return null;
            return (
              <div style={{ display: 'flex', gap: 6, marginBottom: 20, alignSelf: 'center' }}>
                {DOT_STEPS.map((_, i) => (
                  <div key={i} style={{ width: i === activeIdx ? 20 : 6, height: 6, borderRadius: 3, background: i <= activeIdx ? 'var(--accent)' : 'var(--border)', transition: 'width 0.2s, background 0.2s' }} />
                ))}
              </div>
            );
          })()}

          {step !== 'welcome' && step !== 'invite-partner' && (() => {
            const kidFirstNames = [
              ...doneKids.map(k => k.name.split(' ')[0]),
              ...(step !== 'profile' && name.trim() ? [name.trim().split(' ')[0]] : []),
            ];
            const salutation = kidFirstNames.length > 0 ? kidFirstNames.join(' & ') : null;
            return (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px 12px', marginBottom: 16 }}>
                <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 11, color: 'var(--text-muted)', margin: '0 0 6px' }}>
                  Dear {salutation
                    ? <span style={{ color: 'var(--text)' }}>{salutation},</span>
                    : '___,'}
                </p>
                <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 12, color: 'var(--text)', lineHeight: 1.65, margin: '0 0 8px' }}>
                  {ONBOARDING_LETTER}
                </p>
                <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                  Love, {displayName.trim()
                    ? <span style={{ color: 'var(--text)' }}>{displayName.trim()}</span>
                    : '___'}
                </p>
              </div>
            );
          })()}

          {step === 'welcome' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/icon-192.png" style={{ width: 64, height: 64, borderRadius: 14, display: 'block', marginBottom: 20 }} alt="" />
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, color: '#C8993E', margin: '0 0 8px', lineHeight: 1.1 }}>Patina</h1>
              <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 15, color: 'var(--text-3)', lineHeight: 1.8, margin: '0 0 32px', textAlign: 'center' }}>
                For all the things you wish they knew, and all the moments you never want them to forget.
               </p>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '22px 22px 18px', width: '100%', marginBottom: 32, textAlign: 'left' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                    {[{ initial: 'E', color: KID_ACCENTS[0] }, { initial: 'M', color: KID_ACCENTS[1] }].map((k, i) => (
                      <div key={i} style={{ width: 42, height: 42, borderRadius: '50%', background: k.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: i > 0 ? -12 : 0, border: '3px solid var(--bg-card)', flexShrink: 0 }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{k.initial}</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Dear Ellie &amp; Miles,</p>
                </div>
                <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 15, color: 'var(--text)', lineHeight: 1.75, margin: '0 0 14px', minHeight: 120 }}>
                  {ONBOARDING_LETTER.slice(0, typed)}
                  {!letterDone && <span style={{ display: 'inline-block', width: 2, height: 15, background: 'var(--accent)', marginLeft: 1, verticalAlign: 'middle', animation: 'blink-cursor 0.8s step-end infinite' }} />}
                </p>
                <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Love, your family</p>
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setStep('name')}>
                Begin
              </button>
              {onJoinFamily && (
                <button onClick={onJoinFamily} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif", fontWeight: 500, marginTop: 18, textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>
                  Have an invite code?
                </button>
              )}
              {onSignOut && (
                <button onClick={onSignOut} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--border-light)', fontFamily: "'Urbanist', sans-serif", fontWeight: 500, marginTop: 14 }}>
                  Sign out
                </button>
              )}
            </div>
          )}

          {step === 'name' && (
            <div style={{ flex: 1 }}>
              {doneKids.length > 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
                  {doneKids.map(k => k.name).join(' & ')} {doneKids.length === 1 ? 'is' : 'are'} added. One more?
                </p>
              )}
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: 'var(--text)', lineHeight: 1.25, margin: '0 0 10px' }}>
                What's your<br />child's name?
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 28px' }}>Add one at a time — you can add more after.</p>
              <input
                className="input-field"
                placeholder="Name"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && name.trim() && setStep('birthdate')}
                autoFocus
                style={{ fontSize: 20, padding: '16px 18px', marginBottom: 24 }}
              />
              <button
                className="btn btn-primary"
                style={{ width: '100%', opacity: name.trim() ? 1 : 0.4 }}
                disabled={!name.trim()}
                onClick={() => setStep('birthdate')}
              >
                Continue
              </button>
            </div>
          )}

          {step === 'birthdate' && (
            <div style={{ flex: 1 }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: 'var(--text)', lineHeight: 1.25, margin: '0 0 36px' }}>
                When was<br />{name} born?
              </h2>
              <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
                <div style={{ position: 'relative', flex: 2.2 }}>
                  <select
                    value={bdMonth}
                    onChange={e => setBdMonth(e.target.value)}
                    style={{
                      width: '100%', border: '1px solid var(--border)', borderRadius: 10,
                      padding: '15px 36px 15px 16px', fontSize: 16, outline: 'none',
                      background: 'var(--bg-input)', color: bdMonth ? 'var(--text)' : 'var(--text-muted)',
                      fontFamily: "'Urbanist', sans-serif", appearance: 'none',
                      WebkitAppearance: 'none', cursor: 'pointer',
                    }}
                  >
                    <option value="" disabled>Month</option>
                    {['January','February','March','April','May','June',
                      'July','August','September','October','November','December'].map((m, i) => (
                      <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                    ))}
                  </select>
                  <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13, pointerEvents: 'none' }} />
                </div>
                <input
                  type="number"
                  placeholder="Day"
                  value={bdDay}
                  min={1} max={31}
                  onChange={e => setBdDay(e.target.value)}
                  style={{
                    flex: 1, border: '1px solid var(--border)', borderRadius: 10,
                    padding: '15px 10px', fontSize: 16, outline: 'none',
                    background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'Urbanist', sans-serif",
                    textAlign: 'center', MozAppearance: 'textfield',
                  }}
                />
                <input
                  type="number"
                  placeholder="Year"
                  value={bdYear}
                  min={1900} max={2030}
                  onChange={e => setBdYear(e.target.value)}
                  style={{
                    flex: 1.5, border: '1px solid var(--border)', borderRadius: 10,
                    padding: '15px 10px', fontSize: 16, outline: 'none',
                    background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'Urbanist', sans-serif",
                    textAlign: 'center', MozAppearance: 'textfield',
                  }}
                />
              </div>
              <button
                className="btn btn-primary"
                style={{ width: '100%', opacity: birthdate ? 1 : 0.4 }}
                disabled={!birthdate}
                onClick={() => setStep('photo')}
              >
                Continue
              </button>
            </div>
          )}

          {step === 'photo' && (
            <div style={{ flex: 1, textAlign: 'center' }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: 'var(--text)', lineHeight: 1.25, margin: '0 0 8px' }}>
                Add a photo<br />of {name}?
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 40 }}>You can always add one later.</p>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 128, height: 128, borderRadius: '50%', margin: '0 auto 44px',
                  background: avatar ? 'transparent' : accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', overflow: 'hidden',
                  border: avatar ? '3px solid #ECE5D6' : '3px dashed rgba(255,255,255,0.45)',
                }}
              >
                {avatar
                  ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initial
                    ? <span style={{ fontSize: 48, fontWeight: 700, color: '#fff', fontFamily: "'Urbanist', sans-serif" }}>{initial}</span>
                    : <i className="ti ti-camera" style={{ fontSize: 32, color: 'rgba(255,255,255,0.7)' }} />
                }
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setStep('another')}>
                {avatar ? 'Looks good' : 'Skip for now'}
              </button>
            </div>
          )}

          {step === 'another' && (
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ marginBottom: 44 }}>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%', margin: '0 auto 14px',
                  background: avatar ? 'transparent' : accent,
                  overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: avatar ? '2px solid #ECE5D6' : 'none',
                }}>
                  {avatar
                    ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 32, fontWeight: 700, color: '#fff', fontFamily: "'Urbanist', sans-serif" }}>{initial}</span>
                  }
                </div>
                <p style={{ fontSize: 15, color: 'var(--text-3)', fontFamily: "'Source Serif 4', serif", fontStyle: 'italic' }}>{name} is all set.</p>
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: 'var(--text)', lineHeight: 1.25, margin: '0 0 32px' }}>
                Do you have<br />another child?
              </h2>
              {kidIndex < 3 && (
                <button className="btn btn-outline" style={{ width: '100%', marginBottom: 12 }} onClick={handleAnother}>
                  Yes, add another
                </button>
              )}
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleFinish}>
                Continue
              </button>
            </div>
          )}

          {step === 'invite-partner' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <i className="ti ti-users" style={{ fontSize: 28, color: 'var(--accent)' }} />
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: 'var(--text)', lineHeight: 1.25, margin: '0 0 10px' }}>
                Invite your<br />partner?
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 36px', lineHeight: 1.65 }}>
                Share this code so they can join<br />your family journal on their device.
              </p>
              {inviteLoading ? (
                <div style={{ padding: '32px 0', color: 'var(--text-muted)', fontSize: 14 }}>Generating code…</div>
              ) : inviteCode ? (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '22px 24px', width: '100%', marginBottom: 28 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1.5, margin: '0 0 10px', textTransform: 'uppercase' }}>Invite code</p>
                  <p style={{ fontSize: 36, fontWeight: 700, color: 'var(--accent)', letterSpacing: 8, margin: '0 0 16px', fontFamily: "'Urbanist', sans-serif" }}>{inviteCode}</p>
                  <button
                    onClick={() => { navigator.clipboard?.writeText(inviteCode); setInviteCopied(true); setTimeout(() => setInviteCopied(false), 2000); }}
                    style={{ background: 'var(--bg-elevated)', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--accent)', fontFamily: "'Urbanist', sans-serif", padding: '10px 20px', borderRadius: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <i className={`ti ${inviteCopied ? 'ti-check' : 'ti-copy'}`} style={{ fontSize: 14 }} />
                    {inviteCopied ? 'Copied!' : 'Copy code'}
                  </button>
                </div>
              ) : (
                <div style={{ padding: '20px 0 28px', color: 'var(--text-muted)', fontSize: 13 }}>Could not generate a code. You can invite from the Family screen later.</div>
              )}
              <button
                className="btn btn-primary"
                style={{ width: '100%', marginBottom: 14 }}
                onClick={onFinish}
              >
                {inviteCode ? 'Start writing' : 'Go to journal'}
              </button>
              {inviteCode && (
                <button
                  onClick={onFinish}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif", fontWeight: 500, textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}
                >
                  I'll share later
                </button>
              )}
            </div>
          )}

          {step === 'profile' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: 'var(--text)', lineHeight: 1.25, margin: '0 0 28px' }}>
                Almost there —<br />about you.
              </h2>
              <input ref={profilePhotoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) { setProfileCropSrc(URL.createObjectURL(f)); } e.target.value = ''; }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 28 }}>
                <div
                  className="avatar-upload-zone"
                  style={{ width: 88, height: 88, border: profilePhoto ? 'none' : undefined }}
                  onClick={() => profilePhotoInputRef.current?.click()}
                >
                  {profilePhoto
                    ? <img src={profilePhoto} alt="You" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <i className="ti ti-camera" style={{ fontSize: 24 }} />
                  }
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                  {profilePhoto ? 'Tap to change photo' : 'Add your photo (optional)'}
                </p>
              </div>
              <input
                className="input-field"
                placeholder="What the kids call you — Mom, Dad, Mama…"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                autoFocus
                style={{ fontSize: 16, padding: '15px 18px', marginBottom: 10 }}
              />
              <input
                className="input-field"
                placeholder="Your name, for friends to find you"
                value={realName}
                onChange={e => setRealName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleReallyDone()}
                style={{ fontSize: 16, padding: '15px 18px', marginBottom: 24 }}
              />
              {saveError && (
                <p style={{ fontSize: 13, color: '#D4856A', margin: '0 0 12px', textAlign: 'center', lineHeight: 1.5 }}>{saveError}</p>
              )}
              <button className="btn btn-primary" style={{ width: '100%', opacity: savingProfile ? 0.6 : 1 }} onClick={handleReallyDone} disabled={savingProfile}>
                {savingProfile ? 'Saving…' : 'Continue'}
              </button>
            </div>
          )}

        </div>
      </div>

      {cropSrc && (
        <AvatarCropModal
          imageSrc={cropSrc}
          onConfirm={blob => { setAvatar(URL.createObjectURL(blob)); setCropSrc(null); }}
          onCancel={() => setCropSrc(null)}
        />
      )}
      {profileCropSrc && (
        <AvatarCropModal
          imageSrc={profileCropSrc}
          onConfirm={blob => { setProfilePhoto(URL.createObjectURL(blob)); setProfilePhotoBlob(blob); setProfileCropSrc(null); }}
          onCancel={() => setProfileCropSrc(null)}
        />
      )}
    </div>
  );
}

// ─── Root App ──────────────────────────────────────────────────────────────

function normalizeEntry(e) {
  return {
    id: e.id,
    userId: e.user_id || null,
    kids: e.kid_ids,
    date: e.date,
    type: e.type || 'letter',
    prompt: e.prompt || null,
    text: e.text || '',
    mood: e.mood,
    milestone: e.milestone,
    ageMonths: e.age_months,
    palette: e.palette || PALETTES[0],
    media: (e.entry_media || []).filter(m => m.url?.startsWith('http')).map(m => ({ url: m.url, type: m.type })),
    createdAt: e.created_at || null,
    signedAs: e.signed_as,
    authorId: e.author_id || null,
    favorited: e.favorited || false,
    cropY: e.crop_y ?? null,
    location: e.location || null,
    locationLat: e.location_lat ?? null,
    locationLng: e.location_lng ?? null,
    song: e.song || null,
    people: e.people || [],
    shared: e.shared ?? true,
    sharedWith: e.shared_with || { partner: true, family: false, friends: false },
    voiceMemoUrl: e.voice_memo_url || null,
  };
}

export default function App() {
  const localMode = !supabaseConfigured;
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(!localMode);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [kids, setKids] = useState(() => localMode ? loadLocalData().kids : []);
  const [entries, setEntries] = useState(() => localMode ? loadLocalData().entries : []);
  const [screen, setScreen] = useState('home');
  const [circleViewerEntry, setCircleViewerEntry] = useState(null);
  const [journalBackScreen, setJournalBackScreen] = useState('home');
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const installPromptRef = useRef(null);
  const journalScrollPos = useRef(0);
  const partnerLettersScrollPos = useRef(0);
  const [kidFilter, setKidFilter] = useState(null);
  const [activeEntry, setActiveEntry] = useState(null);
  const [entrySource, setEntrySource] = useState('home');
  const [profileKidId, setProfileKidId] = useState(() => localMode ? (loadLocalData().kids[0]?.id ?? null) : null);
  const [growthKidId, setGrowthKidId] = useState(null);
  const [celebration, setCelebration] = useState(null);
  const [familyId, setFamilyId] = useState(null);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [myDisplayName, setMyDisplayName] = useState('');
  const [joiningFamily, setJoiningFamily] = useState(false);
  const [bookConfig, setBookConfig] = useState(null);
  const [monthlyRecap, setMonthlyRecap] = useState(null);
  const [partnerToast, setPartnerToast] = useState(null); // { entry, authorName }
  const [reactionToast, setReactionToast] = useState(null); // { message }
  const [reactionNotifications, setReactionNotifications] = useState([]); // { id, type, fromName, entryId, kidNames, body?, ts }
  const [letterAuthorId, setLetterAuthorId] = useState(null);
  const [unseenPartnerIds, setUnseenPartnerIds] = useState([]);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [friendKids, setFriendKids] = useState([]);
  const [friendEntries, setFriendEntries] = useState([]);
  const [friendFamilyIds, setFriendFamilyIds] = useState([]);
  const [friendFamilyMap, setFriendFamilyMap] = useState({});
  const [friendUserFamilyMap, setFriendUserFamilyMap] = useState({});
  const [compareTarget, setCompareTarget] = useState(null);
  // Once a user visits either sub-tab in a merged section, keep the whole
  // group mounted (just hidden) so switching between its tabs is instant —
  // no remount flash, no scroll/filter reset, no refetch.
  const [circleGroupMounted, setCircleGroupMounted] = useState(false);
  const [keepsakesGroupMounted, setKeepsakesGroupMounted] = useState(false);
  const [newEntryInitial, setNewEntryInitial] = useState(null);
  const [composeMode, setComposeMode] = useState('letter');
  const [showComposePicker, setShowComposePicker] = useState(false);
  const [activePrompt, setActivePrompt] = useState(null);
  const [birthdaySlideshow, setBirthdaySlideshow] = useState(null);
  const [birthdaySlideshowFriend, setBirthdaySlideshowFriend] = useState(null); // { kid, entries }
  const [birthdayNotifications, setBirthdayNotifications] = useState([]);
  const [reactionCounts, setReactionCounts] = useState({});
  const [pendingOpenEntryId, setPendingOpenEntryId] = useState(null);
  const [discoverable, setDiscoverable] = useState(true);
  const [sharingDefaults, setSharingDefaults] = useState({ partner: true, family: false, friends: false });
  const [postOnboardInvite, setPostOnboardInvite] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('patina_dark_mode');
    if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved;
    if (saved === 'true') return 'dark';
    if (saved === 'false') return 'light';
    return 'light';
  });

  const setDarkModeValue = useCallback((val) => {
    setDarkMode(val);
    localStorage.setItem('patina_dark_mode', val);
  }, []);

  const toggleDarkMode = useCallback(() => {
    setDarkModeValue(darkMode === 'light' ? 'dark' : darkMode === 'dark' ? 'auto' : 'light');
  }, [darkMode, setDarkModeValue]);

  const [effectiveDarkAuto, setEffectiveDarkAuto] = useState(() => isDarkTime());
  useEffect(() => {
    if (darkMode !== 'auto') return;
    const id = setInterval(() => {
      const now = isDarkTime();
      setEffectiveDarkAuto(prev => prev === now ? prev : now);
    }, 60_000);
    return () => clearInterval(id);
  }, [darkMode]);

  const effectiveDark = darkMode === 'dark' || (darkMode === 'auto' && effectiveDarkAuto);

  // Auth listener
  useEffect(() => {
    if (localMode || !supabase) {
      setAuthLoading(false);
      return undefined;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (_event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (!session) { setKids([]); setEntries([]); setScreen('home'); }
    });
    return () => subscription.unsubscribe();
  }, [localMode]);

  // Capture an "invite a friend" link (?invite=CODE) before it's lost to a
  // signup/email-confirm redirect that lands back on a bare URL.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('invite');
    if (!invite) return;
    localStorage.setItem('patina_pending_invite', invite.toUpperCase());
    params.delete('invite');
    const rest = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
  }, []);

  // Redeem a pending invite link once we have a session
  useEffect(() => {
    if (!supabase || !session?.user?.id) return;
    const code = localStorage.getItem('patina_pending_invite');
    if (!code) return;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('redeem-invite', { body: { code } });
        localStorage.removeItem('patina_pending_invite');
        if (error || !data?.success) return;
        const friendUserId = data.inviterId;
        setFriends(prev => prev.some(f => f.id === data.friendRequestId) ? prev : [...prev, {
          id: data.friendRequestId,
          requester_id: friendUserId,
          addressee_id: session.user.id,
          status: 'accepted',
          requester_display_name: data.inviterName || '',
          requester_avatar_url: data.inviterAvatarUrl || null,
          addressee_display_name: myDisplayName,
          addressee_avatar_url: null,
        }]);
        setReactionToast({ message: data.inviterName ? `You're connected with ${data.inviterName}!` : "You're connected!" });
        try {
          const [{ data: fKids }, { data: fEntries }] = await Promise.all([
            supabase.from('kids').select('*').eq('user_id', friendUserId),
            supabase.from('entries').select('*, entry_media(*)').eq('user_id', friendUserId).eq('shared', true).order('date', { ascending: false }),
          ]);
          setFriendKids(prev => { const ids = new Set(prev.map(k => k.id)); return [...prev, ...(fKids || []).map(k => ({ id: k.id, name: k.name, birthdate: k.birthdate, accent: k.accent || KID_ACCENTS[0], avatar: k.avatar_url, sex: k.sex || null, userId: k.user_id, wishlistUrl: k.wishlist_url || null })).filter(k => !ids.has(k.id))]; });
          setFriendEntries(prev => { const ids = new Set(prev.map(e => e.id)); return [...prev, ...(fEntries || []).map(normalizeEntry).filter(e => !ids.has(e.id))]; });
        } catch (_) {}
      } catch (_) {
        localStorage.removeItem('patina_pending_invite');
      }
    })();
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!localMode || typeof window === 'undefined') return;
    const id = setTimeout(() => {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ kids, entries }));
    }, 500);
    return () => clearTimeout(id);
  }, [entries, kids, localMode]);

  // Monthly recap check — show once per month on first open
  useEffect(() => {
    if (entries.length === 0) return;
    const lastMonth = (() => {
      const d = new Date(TODAY + 'T12:00:00');
      d.setMonth(d.getMonth() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    })();
    const seenKey = `patina-recap-seen-${session?.user?.id}`;
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem(seenKey) || '{}'); } catch {}
    if (seen[lastMonth]) return;
    const lastMonthEntries = entries.filter(e => e.date.startsWith(lastMonth));
    if (lastMonthEntries.length === 0) return;
    const milestones = lastMonthEntries.filter(e => e.milestone).length;
    const photos = lastMonthEntries.reduce((sum, e) => sum + (e.media?.length || 0), 0);
    const favorites = lastMonthEntries.filter(e => e.favorited).length;
    const label = new Date(lastMonth + '-15T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    setMonthlyRecap({ label, letters: lastMonthEntries.length, milestones, photos, favorites });
    seen[lastMonth] = true;
    try { localStorage.setItem(seenKey, JSON.stringify(seen)); } catch {}
  }, [entries.length, session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load kids and entries after sign-in
  useEffect(() => {
    if (localMode || !session || !supabase) return;
    setDataLoading(true);
    async function loadData() {
      // Check family membership — always pick the family with the most members (the shared one)
      const { data: memberships } = await supabase
        .from('family_members').select('id, user_id, family_id, display_name, avatar_url').eq('user_id', session.user.id);

      let myMembership = memberships?.[0] ?? null;
      if (memberships?.length > 1) {
        const counts = await Promise.all(
          memberships.map(async m => {
            const { count } = await supabase.from('family_members').select('*', { count: 'exact', head: true }).eq('family_id', m.family_id);
            return { ...m, count: count ?? 0 };
          })
        );
        counts.sort((a, b) => b.count - a.count);
        myMembership = counts[0];
        // Clean up solo memberships that are just noise
        const toRemove = counts.filter(m => m.family_id !== myMembership.family_id && m.count <= 1).map(m => m.family_id);
        if (toRemove.length > 0) {
          await supabase.from('family_members').delete().eq('user_id', session.user.id).in('family_id', toRemove);
        }
      }

      let currentFamilyId = myMembership?.family_id ?? null;
      let familyUserIds = [session.user.id];
      if (myMembership) {
        setFamilyId(currentFamilyId);
        setMyDisplayName(myMembership.display_name);
      }

      const entriesQ = currentFamilyId
        ? supabase.from('entries').select('*, entry_media(*)').eq('family_id', currentFamilyId).order('date', { ascending: false })
        : supabase.from('entries').select('*, entry_media(*)').eq('user_id', session.user.id).order('date', { ascending: false });
      const kidsQ = currentFamilyId
        ? supabase.from('kids').select('id, name, birthdate, accent, avatar_url, user_id, sex, growth_log, family_id, wishlist_url').eq('family_id', currentFamilyId).order('created_at')
        : supabase.from('kids').select('id, name, birthdate, accent, avatar_url, user_id, sex, growth_log, family_id, wishlist_url').eq('user_id', session.user.id).order('created_at');
      const [{ data: kidsData, error: kidsError }, { data: entriesData, error: entriesError }] = await Promise.all([
        kidsQ,
        entriesQ,
      ]);

      // Bad/expired session — sign out so the login screen appears
      if (kidsError && !kidsData) {
        await supabase.auth.signOut();
        setDataLoading(false);
        return;
      }

      // Auto-migrate existing user who has kids but no family yet
      // Only run if memberships query explicitly returned zero rows — never if it errored (null)
      if (memberships !== null && memberships.length === 0 && kidsData && kidsData.length > 0) {
        const { data: family } = await supabase.from('families').insert({}).select().single();
        if (family) {
          currentFamilyId = family.id;
          setFamilyId(currentFamilyId);
          const { data: mem } = await supabase.from('family_members').insert({
            family_id: currentFamilyId, user_id: session.user.id, display_name: 'Parent',
          }).select().single();
          setMyDisplayName('Parent');
          setFamilyMembers(mem ? [mem] : []);
          await supabase.from('kids').update({ family_id: currentFamilyId }).eq('user_id', session.user.id);
          await supabase.from('entries').update({ family_id: currentFamilyId }).eq('user_id', session.user.id);
        }
      } else if (currentFamilyId) {
        const { data: membersData } = await supabase.from('family_members').select('id, user_id, family_id, display_name, avatar_url').eq('family_id', currentFamilyId);
        if (membersData) {
          const memberUserIds = membersData.map(m => m.user_id).filter(Boolean);
          familyUserIds = memberUserIds.length > 0 ? [...new Set([session.user.id, ...memberUserIds])] : [session.user.id];
          familyUserIdsRef.current = familyUserIds;
          const { data: memberProfiles } = await supabase.from('profiles').select('id, display_name').in('id', memberUserIds);
          const profileMap = {};
          memberProfiles?.forEach(p => { profileMap[p.id] = p.display_name || null; });
          const enriched = membersData.map(m => ({ ...m, real_name: profileMap[m.user_id] || null }));
          setFamilyMembers(enriched);
          // real_name is used for social contexts; keep myDisplayName as the journal signature (Mom/Dad)

        }
      }

      if (kidsData) {
        setKids(kidsData.map(k => ({ id: k.id, name: k.name, birthdate: k.birthdate, accent: k.accent || KID_ACCENTS[0], avatar: k.avatar_url, sex: k.sex || null, growthLog: k.growth_log || [], wishlistUrl: k.wishlist_url || null })));
        setProfileKidId(kidsData[0]?.id ?? null);
      }
      if (entriesData) {
        let savedCrops = {};
        try { savedCrops = JSON.parse(localStorage.getItem(`patina-crop-positions-${session.user.id}`) || '{}'); } catch {}
        setEntries(entriesData.map(e => {
          const n = normalizeEntry(e);
          if (savedCrops[n.id] != null) n.cropY = savedCrops[n.id];
          return n;
        }));
      }
      // Seed last-seen so the badge doesn't fire for all pre-existing entries on first load
      const lsKey = `patina-last-seen-${session.user.id}`;
      if (!localStorage.getItem(lsKey)) localStorage.setItem(lsKey, new Date().toISOString());

      // Load friend data (gracefully skipped if tables don't exist yet)
      try {
        const { data: frData } = await supabase
          .from('friend_requests')
          .select('id, requester_id, addressee_id, status, created_at')
          .or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`);

        const pMap = {};
        if (frData && frData.length > 0) {
          const involvedIds = [...new Set(frData.flatMap(fr => [fr.requester_id, fr.addressee_id]).filter(id => id !== session.user.id))];
          const { data: profilesData } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', involvedIds);
          profilesData?.forEach(p => { pMap[p.id] = p; });
          const profileName = p => p?.display_name || '';
          const enrichFr = fr => ({
            ...fr,
            requester_display_name: profileName(pMap[fr.requester_id]),
            requester_avatar_url: pMap[fr.requester_id]?.avatar_url || null,
            addressee_display_name: profileName(pMap[fr.addressee_id]),
            addressee_avatar_url: pMap[fr.addressee_id]?.avatar_url || null,
          });
          const accepted = frData.filter(fr => fr.status === 'accepted').map(enrichFr);
          const pending = frData.filter(fr => fr.status === 'pending').map(enrichFr);
          setFriends(accepted);
          setFriendRequests(pending);

          const friendUserIds = accepted.map(fr => fr.requester_id === session.user.id ? fr.addressee_id : fr.requester_id);
          if (friendUserIds.length > 0) {
            // Query both sources: family_members is authoritative but profiles.family_id is a fallback
            const [{ data: friendMembers }, { data: friendProfiles }] = await Promise.all([
              supabase.from('family_members').select('user_id, family_id').in('user_id', friendUserIds),
              supabase.from('profiles').select('id, family_id').in('id', friendUserIds),
            ]);
            // Build user_id → family_id map; family_members wins, profiles is fallback; exclude own family
            const userFamilyMap = {};
            (friendProfiles || []).forEach(p => { if (p.family_id && p.family_id !== currentFamilyId) userFamilyMap[p.id] = p.family_id; });
            (friendMembers || []).forEach(m => { if (m.family_id && m.family_id !== currentFamilyId) userFamilyMap[m.user_id] = m.family_id; else if (m.family_id === currentFamilyId) delete userFamilyMap[m.user_id]; });
            const friendFamilyIds = [...new Set(Object.values(userFamilyMap))];
            setFriendFamilyIds(friendFamilyIds);
            setFriendUserFamilyMap(userFamilyMap);
            const ffMap = {};
            friendUserIds.forEach(uid => {
              const familyId = userFamilyMap[uid];
              if (!familyId) return;
              const fr = accepted.find(f => f.requester_id === uid || f.addressee_id === uid);
              if (fr) {
                const isReq = fr.requester_id === uid;
                const memberName = isReq ? fr.requester_display_name : fr.addressee_display_name;
                const memberAvatar = isReq ? fr.requester_avatar_url : fr.addressee_avatar_url;
                if (!ffMap[familyId]) ffMap[familyId] = { names: [], avatar: memberAvatar };
                if (memberName && !ffMap[familyId].names.includes(memberName)) ffMap[familyId].names.push(memberName);
                ffMap[familyId].name = ffMap[familyId].names.join(' and ');
              }
            });
            setFriendFamilyMap(ffMap);
            if (friendFamilyIds.length > 0) {
              const twoWeeksAgo = new Date(); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
              const [{ data: fKids }, { data: fEntries }] = await Promise.all([
                supabase.from('kids').select('id, name, birthdate, accent, avatar_url, user_id, sex, family_id, wishlist_url').in('family_id', friendFamilyIds),
                supabase.from('entries').select('id, date, created_at, kid_ids, mood, milestone, age_months, family_id, user_id, shared, shared_with, type, prompt, entry_media(url, type)').in('family_id', friendFamilyIds).neq('shared', false).gte('created_at', twoWeeksAgo.toISOString()).order('created_at', { ascending: false }),
              ]);
              setFriendKids((fKids || []).map(k => ({ id: k.id, name: k.name, birthdate: k.birthdate, accent: k.accent || KID_ACCENTS[0], avatar: k.avatar_url, sex: k.sex || null, userId: k.user_id, familyId: k.family_id, wishlistUrl: k.wishlist_url || null })));
              setFriendEntries((fEntries || []).filter(e => e.shared !== false).map(e => ({ ...normalizeEntry(e), familyId: e.family_id })));
            }
          }
        }

        // Load reaction counts for own shared entries (so poster sees hearts on their cards)
        if (entriesData?.length > 0) {
          const sharedIds = entriesData.filter(e => e.shared !== false).map(e => e.id);
          if (sharedIds.length > 0) {
            const [{ data: lks }, { data: cms }] = await Promise.all([
              supabase.from('entry_likes').select('entry_id').in('entry_id', sharedIds),
              supabase.from('entry_comments').select('entry_id').in('entry_id', sharedIds),
            ]);
            const counts = {};
            lks?.forEach(l => { if (!counts[l.entry_id]) counts[l.entry_id] = { likes: 0, comments: 0 }; counts[l.entry_id].likes++; });
            cms?.forEach(c => { if (!counts[c.entry_id]) counts[c.entry_id] = { likes: 0, comments: 0 }; counts[c.entry_id].comments++; });
            setReactionCounts(counts);
          }
        }

        // Load own profile (discoverable setting + notification read-state)
        const { data: ownProfile } = await supabase.from('profiles').select('discoverable, sharing_defaults, notif_cleared_at').eq('id', session.user.id).maybeSingle();
        if (ownProfile) {
          setDiscoverable(ownProfile.discoverable ?? true);
          if (ownProfile.sharing_defaults) setSharingDefaults(ownProfile.sharing_defaults);
        }

        // Load recent reactions on the user's entries to seed the activity feed
        {
          const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          const cutoff = thirtyDaysAgo.toISOString();
          const all = [];
          if (entriesData?.length > 0) {
            const sharedIds = entriesData.filter(e => e.shared !== false).map(e => e.id);
            if (sharedIds.length > 0) {
              const kidMap = {};
              (kidsData || []).forEach(k => { kidMap[k.id] = k.name; });
              const entryKidMap = {};
              (entriesData || []).forEach(e => {
                const ids = e.kid_ids || [];
                entryKidMap[e.id] = ids.map(id => (kidMap[id] || '').split(' ')[0]).filter(Boolean).join(' & ') || 'a photo';
              });
              const familyExclude = `(${familyUserIds.join(',')})`;
              const [{ data: recentLikes }, { data: recentComments }] = await Promise.all([
                supabase.from('entry_likes').select('id, entry_id, user_id, display_name, created_at').in('entry_id', sharedIds).not('user_id', 'in', familyExclude).gte('created_at', cutoff).order('created_at', { ascending: false }),
                supabase.from('entry_comments').select('id, entry_id, user_id, display_name, body, created_at').in('entry_id', sharedIds).not('user_id', 'in', familyExclude).gte('created_at', cutoff).is('parent_id', null).order('created_at', { ascending: false }),
              ]);
              all.push(
                ...(recentLikes || []).map(l => ({ id: `like-${l.id}`, type: 'like', fromName: l.display_name || pMap[l.user_id]?.display_name || 'Someone', fromUserId: l.user_id, entryId: l.entry_id, kidNames: entryKidMap[l.entry_id] || 'a photo', ts: new Date(l.created_at).getTime() })),
                ...(recentComments || []).map(c => ({ id: `comment-${c.id}`, type: 'comment', fromName: c.display_name || pMap[c.user_id]?.display_name || 'Someone', fromUserId: c.user_id, entryId: c.entry_id, kidNames: entryKidMap[c.entry_id] || 'a photo', body: c.body, ts: new Date(c.created_at).getTime() })),
              );
            }
          }
          // Always load replies to current user's comments — runs even if user has no own posts
          const { data: recentReplies } = await supabase.from('entry_comments').select('id, entry_id, user_id, display_name, body, created_at, parent_id').not('parent_id', 'is', null).neq('user_id', session.user.id).gte('created_at', cutoff).order('created_at', { ascending: false }).limit(50);
          if (recentReplies?.length) {
            const parentIds = [...new Set(recentReplies.map(r => r.parent_id))];
            const { data: myParents } = await supabase.from('entry_comments').select('id').in('id', parentIds).eq('user_id', session.user.id);
            const myParentIds = new Set((myParents || []).map(c => c.id));
            recentReplies.filter(r => myParentIds.has(r.parent_id)).forEach(r => {
              all.push({ id: `reply-${r.id}`, type: 'reply', fromName: r.display_name || 'Someone', fromUserId: r.user_id, entryId: r.entry_id, kidNames: 'a photo', body: r.body, ts: new Date(r.created_at).getTime() });
            });
          }
          all.sort((a, b) => b.ts - a.ts);
          if (all.length > 0) {
            const clearedAt = ownProfile?.notif_cleared_at ? new Date(ownProfile.notif_cleared_at).getTime() : 0;
            const { data: dismissedRows } = await supabase.from('dismissed_notifications').select('notification_id').eq('user_id', session.user.id);
            const dismissedIds = new Set((dismissedRows || []).map(r => r.notification_id));
            const unseen = all.filter(n => n.ts > clearedAt && !dismissedIds.has(n.id));
            if (unseen.length > 0) setReactionNotifications(unseen);
          }
        }

        // Create profile if none exists — never overwrite (real name set during onboarding)
        const myName = myMembership?.display_name || '';
        if (myName) {
          await supabase.from('profiles').upsert({ id: session.user.id, display_name: myName, family_id: currentFamilyId }, { onConflict: 'id', ignoreDuplicates: true });
        }
        // Backfill family_id on profiles created before the family existed (never touches display_name)
        if (currentFamilyId) {
          await supabase.from('profiles').update({ family_id: currentFamilyId }).eq('id', session.user.id).is('family_id', null);
        }
      } catch (e) { console.error('[friends] load error:', e); }

      setDataLoading(false);
    }
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  // Load birthday notifications from Supabase on session start
  useEffect(() => {
    if (!session?.user?.id || !supabase) return;
    supabase
      .from('birthday_notifications')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('dismissed', false)
      .then(({ data }) => {
        if (data) setBirthdayNotifications(data.map(n => ({ id: n.id, kidId: n.kid_id, kidName: n.kid_name, familyName: n.family_name, birthdate: n.birthdate, age: n.age, ts: n.ts })));
      });
  }, [session?.user?.id]);

  // Detect friend birthdays in the last 7 days and persist to Supabase
  useEffect(() => {
    if (!friendKids.length || !session?.user?.id || !supabase) return;
    const WINDOW = 7;
    const year = new Date().getFullYear();
    const rows = [];
    for (const k of friendKids) {
      if (!k.birthdate) continue;
      const since = daysSinceBirthday(k.birthdate);
      if (since < 0 || since > WINDOW) continue;
      const [, bm, bd] = k.birthdate.split('-').map(Number);
      const age = year - parseInt(k.birthdate.split('-')[0]);
      const familyName = friendFamilyMap[k.familyId]?.name || null;
      rows.push({ id: `bday-${k.id}-${year}`, user_id: session.user.id, kid_id: k.id, kid_name: k.name, family_name: familyName, birthdate: k.birthdate, age, ts: new Date(year, bm - 1, bd).getTime() });
    }
    if (!rows.length) return;
    const normalize = n => ({ id: n.id, kidId: n.kid_id, kidName: n.kid_name, familyName: n.family_name, birthdate: n.birthdate, age: n.age, ts: n.ts });
    supabase.from('birthday_notifications').upsert(rows, { onConflict: 'id', ignoreDuplicates: true }).select().then(({ data }) => {
      if (data?.length) {
        setBirthdayNotifications(prev => {
          const prevIds = new Set(prev.map(n => n.id));
          const fresh = data.filter(n => !prevIds.has(n.id)).map(normalize);
          return fresh.length ? [...fresh, ...prev] : prev;
        });
      }
    });
  }, [friendKids, friendFamilyMap, session?.user?.id]);

  // Background geocode entries that have a location text but no coordinates yet
  const geocodedIdsRef = useRef(new Set());
  useEffect(() => {
    if (localMode || !supabase || !session) return;
    const toGeocode = entries.filter(e => e.location && e.locationLat == null && !geocodedIdsRef.current.has(e.id));
    if (toGeocode.length === 0) return;
    toGeocode.forEach(e => geocodedIdsRef.current.add(e.id));
    const controller = new AbortController();
    const results = {};
    Promise.all(toGeocode.map(async e => {
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': import.meta.env.VITE_GOOGLE_PLACES_KEY,
            'X-Goog-FieldMask': 'places.location',
          },
          body: JSON.stringify({ textQuery: e.location, maxResultCount: 1 }),
        });
        const data = await res.json();
        const loc = data.places?.[0]?.location;
        if (loc) {
          results[e.id] = { lat: loc.latitude, lng: loc.longitude };
          supabase.from('entries').update({ location_lat: loc.latitude, location_lng: loc.longitude }).eq('id', e.id).then(() => {});
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    })).then(() => {
      if (!controller.signal.aborted && Object.keys(results).length > 0) {
        setEntries(prev => prev.map(en => results[en.id] ? { ...en, locationLat: results[en.id].lat, locationLng: results[en.id].lng } : en));
      }
    });
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length]);

  // ── Partner activity: unseen badge (option 1) ─────────────────────────────
  useEffect(() => {
    if (!session?.user?.id || entries.length === 0) return;
    const lastSeen = localStorage.getItem(`patina-last-seen-${session.user.id}`);
    if (!lastSeen) return;
    const seenIds = new Set(JSON.parse(localStorage.getItem(`patina-seen-partner-${session.user.id}`) || '[]'));
    const unseen = entries.filter(e =>
      e.authorId && e.authorId !== session.user.id &&
      e.createdAt && e.createdAt > lastSeen &&
      !seenIds.has(e.id)
    );
    setUnseenPartnerIds(unseen.map(e => e.id));
  }, [entries.length, session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function markAllSeen() {
    if (!session?.user?.id) return;
    localStorage.setItem(`patina-last-seen-${session.user.id}`, new Date().toISOString());
    localStorage.removeItem(`patina-seen-partner-${session.user.id}`);
    setUnseenPartnerIds([]);
  }

  function markPartnerEntrySeen(entryId) {
    if (!session?.user?.id) return;
    setUnseenPartnerIds(prev => {
      const next = prev.filter(id => id !== entryId);
      if (next.length === 0) {
        markAllSeen();
      } else {
        try {
          const key = `patina-seen-partner-${session.user.id}`;
          const seen = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
          seen.add(entryId);
          localStorage.setItem(key, JSON.stringify([...seen]));
        } catch {}
      }
      return next;
    });
  }

  const prevScreenRef = useRef(null);
  useEffect(() => {
    prevScreenRef.current = screen;
  }, [screen]);

  // ── Partner activity: real-time toast (option 2) ───────────────────────────
  const familyMembersRef = useRef(familyMembers);
  familyMembersRef.current = familyMembers;

  // Keep a ref of own entry IDs so realtime handlers can check without stale closure
  const ownEntryIdsRef = useRef(new Set());
  useEffect(() => { ownEntryIdsRef.current = new Set(entries.map(e => e.id)); }, [entries]);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const kidsRef = useRef(kids);
  kidsRef.current = kids;
  const currentUserIdRef = useRef(session?.user?.id);
  currentUserIdRef.current = session?.user?.id;
  const familyUserIdsRef = useRef([session?.user?.id].filter(Boolean));

  const [installBannerType, setInstallBannerType] = useState(null); // 'ios-safari' | 'ios-other' | 'android'
  useEffect(() => {
    if (localStorage.getItem('pwa-install-dismissed')) return;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;
    if (isIOS) {
      const isSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios|opios/i.test(navigator.userAgent);
      setInstallBannerType(isSafari ? 'ios-safari' : 'ios-other');
      setShowInstallBanner(true);
      return;
    }
    const handler = e => { e.preventDefault(); installPromptRef.current = e; setInstallBannerType('android'); setShowInstallBanner(true); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if (localMode || !supabase || !session?.user?.id || !familyId) return;
    const channel = supabase
      .channel(`family-entries-${familyId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'entries', filter: `family_id=eq.${familyId}` }, payload => {
        const row = payload.new;
        if (!row || row.author_id === currentUserIdRef.current) return;
        const author = familyMembersRef.current.find(m => m.user_id === row.author_id);
        const authorName = author?.real_name || author?.display_name || 'Your partner';
        const newEntry = {
          id: row.id, kids: row.kid_ids, date: row.date, text: row.text || '',
          mood: row.mood, milestone: row.milestone, ageMonths: row.age_months,
          palette: row.palette || PALETTES[0],
          media: [], // entry_media not included in the change event; will load on next full refresh
          createdAt: row.created_at || null,
          signedAs: row.signed_as, authorId: row.author_id,
          cropY: null, location: row.location || null, locationLat: null, locationLng: null,
        };
        setEntries(prev => [newEntry, ...prev.filter(e => e.id !== newEntry.id)]);
        setPartnerToast({ entry: newEntry, authorName });
        setUnseenPartnerIds(prev => [...prev, newEntry.id]);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'entry_likes' }, payload => {
        const { entry_id, user_id } = payload.new;
        if (user_id === currentUserIdRef.current || familyUserIdsRef.current.includes(user_id)) return;
        if (!ownEntryIdsRef.current.has(entry_id)) return;
        setReactionCounts(prev => {
          const cur = prev[entry_id] || { likes: 0, comments: 0 };
          return { ...prev, [entry_id]: { ...cur, likes: cur.likes + 1 } };
        });
        const liker = payload.new.display_name || 'Someone';
        setReactionToast({ message: `${liker} liked your photo ❤️` });
        const likedEntry = entriesRef.current.find(e => e.id === entry_id);
        const kidNames = (likedEntry?.kids || []).map(id => kidsRef.current.find(k => k.id === id)?.name?.split(' ')[0]).filter(Boolean).join(' & ') || 'a photo';
        const likeNotifId = `like-${payload.new.id || entry_id}`;
        setReactionNotifications(prev => prev.some(n => n.id === likeNotifId) ? prev : [{ id: likeNotifId, type: 'like', fromName: liker, fromUserId: payload.new.user_id, entryId: entry_id, kidNames, ts: Date.now() }, ...prev]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'entry_likes' }, payload => {
        const { entry_id } = payload.old;
        if (!ownEntryIdsRef.current.has(entry_id)) return;
        setReactionCounts(prev => {
          const cur = prev[entry_id];
          if (!cur) return prev;
          return { ...prev, [entry_id]: { ...cur, likes: Math.max(0, cur.likes - 1) } };
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'entry_comments' }, async payload => {
        const { entry_id, user_id } = payload.new;
        if (familyUserIdsRef.current.includes(user_id)) return;
        // If this is a reply, check if the parent comment belongs to the current user
        if (payload.new.parent_id) {
          const { data: parentComment } = await supabase.from('entry_comments').select('user_id').eq('id', payload.new.parent_id).single();
          if (parentComment?.user_id === currentUserIdRef.current) {
            const repliedEntry = entriesRef.current.find(e => e.id === entry_id);
            const replyKidNames = (repliedEntry?.kids || []).map(id => kidsRef.current.find(k => k.id === id)?.name?.split(' ')[0]).filter(Boolean).join(' & ') || 'a photo';
            const replyNotifId = `reply-${payload.new.id}`;
            setReactionNotifications(prev => prev.some(n => n.id === replyNotifId) ? prev : [{ id: replyNotifId, type: 'reply', fromName: payload.new.display_name || 'Someone', fromUserId: user_id, entryId: entry_id, kidNames: replyKidNames, body: payload.new.body, ts: Date.now() }, ...prev]);
          }
          return;
        }
        if (!ownEntryIdsRef.current.has(entry_id)) return;
        setReactionCounts(prev => {
          const cur = prev[entry_id] || { likes: 0, comments: 0 };
          return { ...prev, [entry_id]: { ...cur, comments: cur.comments + 1 } };
        });
        const commenter = payload.new.display_name || 'Someone';
        const preview = payload.new.body?.slice(0, 40);
        setReactionToast({ message: `${commenter}: "${preview}"` });
        const commentedEntry = entriesRef.current.find(e => e.id === entry_id);
        const commentKidNames = (commentedEntry?.kids || []).map(id => kidsRef.current.find(k => k.id === id)?.name?.split(' ')[0]).filter(Boolean).join(' & ') || 'a photo';
        const commentNotifId = `comment-${payload.new.id || entry_id}`;
        setReactionNotifications(prev => prev.some(n => n.id === commentNotifId) ? prev : [{ id: commentNotifId, type: 'comment', fromName: commenter, fromUserId: payload.new.user_id, entryId: entry_id, kidNames: commentKidNames, body: payload.new.body, ts: Date.now() }, ...prev]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'entry_comments' }, payload => {
        const { entry_id } = payload.old;
        if (!ownEntryIdsRef.current.has(entry_id)) return;
        setReactionCounts(prev => {
          const cur = prev[entry_id];
          if (!cur) return prev;
          return { ...prev, [entry_id]: { ...cur, comments: Math.max(0, cur.comments - 1) } };
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, familyId]);

  // Separate subscription for cross-family reply notifications (family channel only covers own-family events)
  useEffect(() => {
    if (!supabase || !session?.user?.id) return;
    const userId = session.user.id;
    const replyCh = supabase
      .channel(`my-comment-replies-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'entry_comments' }, async payload => {
        if (!payload.new.parent_id) return;
        if (payload.new.user_id === userId) return;
        const { data: parentComment } = await supabase
          .from('entry_comments')
          .select('user_id')
          .eq('id', payload.new.parent_id)
          .single();
        if (parentComment?.user_id !== userId) return;
        const replyNotifId = `reply-${payload.new.id}`;
        setReactionNotifications(prev =>
          prev.some(n => n.id === replyNotifId)
            ? prev
            : [{ id: replyNotifId, type: 'reply', fromName: payload.new.display_name || 'Someone', fromUserId: payload.new.user_id, entryId: payload.new.entry_id, kidNames: 'a photo', body: payload.new.body, ts: Date.now() }, ...prev]
        );
      })
      .subscribe();
    return () => { supabase.removeChannel(replyCh); };
  }, [session?.user?.id]);

  const screenRef = useRef(screen);
  useEffect(() => { screenRef.current = screen; }, [screen]);

  const handleNavigate = useCallback((s) => setScreen(s), []);

  // Lateral navigation between sibling sub-tabs within the Circle (Feed/Friends)
  // and Keepsakes (Recap/All letters/At the same age) sections — resets any
  // deep-link context so switching sections lands on a generic, not stale, view.
  const switchSection = useCallback((id) => {
    if (id === 'compare') setCompareTarget(null);
    if (id === 'partner-letters') setLetterAuthorId(null);
    setScreen(id);
  }, []);

  useEffect(() => {
    if (screen === 'circle-feed' || screen === 'friends') setCircleGroupMounted(true);
    if (screen === 'recap' || screen === 'partner-letters' || screen === 'compare') setKeepsakesGroupMounted(true);
  }, [screen]);

  const openEntry = useCallback((entry) => {
    setEntrySource(screenRef.current);
    setActiveEntry(entry);
    setScreen('entry-detail');
  }, []);

  async function handleUpdateCrop(entryId, y) {
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, cropY: y } : e));
    setActiveEntry(prev => prev?.id === entryId ? { ...prev, cropY: y } : prev);
    try {
      const stored = JSON.parse(localStorage.getItem(`patina-crop-positions-${session?.user?.id}`) || '{}');
      localStorage.setItem(`patina-crop-positions-${session?.user?.id}`, JSON.stringify({ ...stored, [entryId]: y }));
    } catch {}
    if (!localMode && supabase && session) {
      await supabase.from('entries').update({ crop_y: y }).eq('id', entryId);
    }
  }

  async function handleToggleFavorite(entryId) {
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;
    const newFavorited = !entry.favorited;
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, favorited: newFavorited } : e));
    setActiveEntry(prev => prev?.id === entryId ? { ...prev, favorited: newFavorited } : prev);
    if (localMode || !supabase || !session) return;
    await supabase.from('entries').update({ favorited: newFavorited }).eq('id', entryId);
  }

  async function uploadToCloudinary(fileOrBlob, resourceType = 'image') {
    const { data: sig, error: sigError } = await supabase.functions.invoke('sign-upload');
    if (sigError || !sig) throw new Error('Could not authorize upload: ' + (sigError?.message || 'unknown error'));
    const fd = new FormData();
    fd.append('file', fileOrBlob);
    fd.append('upload_preset', sig.preset);
    fd.append('api_key', sig.apiKey);
    fd.append('timestamp', String(sig.timestamp));
    fd.append('signature', sig.signature);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), resourceType === 'video' ? 300_000 : 30_000);
    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/${resourceType}/upload`, { method: 'POST', body: fd, signal: controller.signal });
      if (!res.ok) {
        const errText = await res.text().catch(() => res.status);
        throw new Error(`Cloudinary ${res.status}: ${errText}`);
      }
      const json = await res.json();
      return json.secure_url;
    } finally {
      clearTimeout(timer);
    }
  }

  function storagePathsFromMedia(mediaItems) {
    const paths = [];
    const marker = '/object/public/media/';
    for (const item of (mediaItems || [])) {
      if (!item.url) continue;
      const idx = item.url.indexOf(marker);
      if (idx === -1) continue;
      const path = item.url.slice(idx + marker.length);
      paths.push(path);
      if (item.type === 'video') paths.push(path.replace(/\.[^.]+$/, '') + '-thumb.jpg');
    }
    return paths;
  }

  async function handleDeleteEntry(entryId) {
    setEntries(prev => prev.filter(e => e.id !== entryId));
    setScreen('home');
    setActiveEntry(null);
    if (localMode || !supabase || !session) return;
    await supabase.from('entry_media').delete().eq('entry_id', entryId);
    await supabase.from('entries').delete().eq('id', entryId);
  }

  async function handleQuickDelete(entryId) {
    setEntries(prev => prev.filter(e => e.id !== entryId));
    if (localMode || !supabase || !session) return;
    await supabase.from('entry_media').delete().eq('entry_id', entryId);
    await supabase.from('entries').delete().eq('id', entryId);
  }

  async function handleRefresh() {
    if (localMode || !supabase || !session) return;
    const promises = [supabase.from('entries').select('*, entry_media(*)').eq('family_id', familyId).order('date', { ascending: false })];
    if (friendFamilyIds.length > 0) {
      const twoWeeksAgo = new Date(); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      promises.push(supabase.from('entries').select('id, date, created_at, kid_ids, mood, milestone, age_months, family_id, user_id, shared, shared_with, type, prompt, entry_media(url, type)').in('family_id', friendFamilyIds).neq('shared', false).gte('created_at', twoWeeksAgo.toISOString()).order('created_at', { ascending: false }));
    }
    const [{ data }, friendResult] = await Promise.all(promises);
    if (data) {
      let savedCrops = {};
      try { savedCrops = JSON.parse(localStorage.getItem(`patina-crop-positions-${session?.user?.id}`) || '{}'); } catch {}
      setEntries(data.map(e => { const n = normalizeEntry(e); if (savedCrops[n.id] != null) n.cropY = savedCrops[n.id]; return n; }));
      const sharedIds = data.filter(e => e.shared !== false).map(e => e.id);
      if (sharedIds.length > 0) {
        const [{ data: lks }, { data: cms }] = await Promise.all([
          supabase.from('entry_likes').select('entry_id').in('entry_id', sharedIds),
          supabase.from('entry_comments').select('entry_id').in('entry_id', sharedIds),
        ]);
        const counts = {};
        lks?.forEach(l => { if (!counts[l.entry_id]) counts[l.entry_id] = { likes: 0, comments: 0 }; counts[l.entry_id].likes++; });
        cms?.forEach(c => { if (!counts[c.entry_id]) counts[c.entry_id] = { likes: 0, comments: 0 }; counts[c.entry_id].comments++; });
        setReactionCounts(counts);
      }
    }
    if (friendResult?.data) setFriendEntries(friendResult.data.filter(e => e.shared !== false).map(e => ({ ...normalizeEntry(e), familyId: e.family_id })));
  }

  const allPeople = useMemo(() => {
    const set = new Set();
    entries.forEach(e => (e.people || []).forEach(p => set.add(p)));
    return [...set].sort();
  }, [entries]);


  function editEntry(entry) {
    setActiveEntry(entry);
    setScreen('edit-entry');
  }

  async function handleSaveEntry({ kids: kidIds, text, mood, milestone, media, fileObjects, compressedFiles, date, entryId, signedAs, location, locationLat, locationLng, song, sharedWith = { partner: true, family: false, friends: false }, people, voiceMemoBlob, voiceMemoUrl, type: entryType = 'letter', prompt = null }) {
    const shared = Object.values(sharedWith).some(Boolean);
    const primaryKid = kids.find(k => kidIds.includes(k.id)) ?? friendKids.find(k => kidIds.includes(k.id));
    if (!primaryKid) throw new Error('Could not find kid — please close and reopen the entry.');
    const { years, months } = exactAge(primaryKid.birthdate, date);
    const ageMonths = years * 12 + months;

    // Compress all new image files in parallel (shared by create + update paths)
    async function prepareAndUpload(mediaItems, fileObjs, entryRowId) {
      const results = await Promise.all(mediaItems.map(async (item, i) => {
        // Await background compression if still in progress; fall back to raw file
        let fileObj = item.type === 'image' && compressedFiles?.has(item.url)
          ? await compressedFiles.get(item.url)
          : fileObjs?.[i];
        if (!fileObj) return { url: item.url, type: item.type };
        const isVid = item.type === 'video';
        if (isVid && fileObj.size > 100 * 1024 * 1024) return { url: null, type: item.type, err: `Video is ${Math.round(fileObj.size / 1024 / 1024)}MB — please trim it to under 100MB` };
        try {
          const uploaded = await uploadToCloudinary(fileObj, isVid ? 'video' : 'image');
          return { url: uploaded, type: item.type };
        } catch (e) {
          console.error('Media upload failed:', e);
          return { url: null, type: item.type, err: e?.message || 'Unknown error' };
        }
      }));

      const saved = results.filter(r => r.url && !r.url.startsWith('blob:') && !r.url.startsWith('data:'));
      const failed = results.find(r => r.err);
      if (saved.length > 0) {
        await supabase.from('entry_media').insert(saved.map(m => ({ entry_id: entryRowId, url: m.url, type: m.type })));
      }
      return { saved, failed };
    }

    // Upload voice memo blob to Cloudinary if a new recording was made
    let voiceMemoUrlFinal = voiceMemoUrl || null;
    if (voiceMemoBlob && supabase && session) {
      try {
        const res = await fetch(voiceMemoBlob);
        const blob = await res.blob();
        const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
        voiceMemoUrlFinal = await uploadToCloudinary(new File([blob], `voice.${ext}`, { type: blob.type }), 'video');
      } catch (_) {}
    }

    // ── UPDATE existing entry ──
    if (entryId) {
      if (localMode || !supabase || !session) {
        setEntries(prev => prev.map(e => e.id === entryId ? { ...e, kids: kidIds, text: text || '', mood, milestone, date, ageMonths, media, type: entryType, prompt } : e));
        setScreen('home');
        return;
      }
      const { error: updateError } = await supabase.from('entries').update({ kid_ids: kidIds, text: text || '', mood, milestone, date, age_months: ageMonths, signed_as: signedAs || null, location: location || null, location_lat: locationLat ?? null, location_lng: locationLng ?? null, song: song || null, people: people || [], shared, shared_with: sharedWith, voice_memo_url: voiceMemoUrlFinal, type: entryType, prompt }).eq('id', entryId);
      if (updateError) {
        alert('Could not save your changes. Please try again.\n' + updateError.message);
        return;
      }
      await supabase.from('entry_media').delete().eq('entry_id', entryId);
      setScreen('home');
      const { saved, failed } = await prepareAndUpload(media, fileObjects, entryId);
      setEntries(prev => prev.map(e => e.id === entryId ? { ...e, kids: kidIds, text: text || '', mood, milestone, date, ageMonths, media: saved, signedAs: signedAs || null, location: location || null, locationLat: locationLat ?? null, locationLng: locationLng ?? null, song: song || null, people: people || [], shared, sharedWith, voiceMemoUrl: voiceMemoUrlFinal, type: entryType, prompt } : e));
      if (failed) alert(`Media upload failed (${failed.err}) — your text was saved. Please try again.`);
      return;
    }

    // ── CREATE new entry ──
    const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];

    if (localMode || !supabase || !session) {
      const newEntry = {
        id: Date.now(),
        kids: kidIds,
        date,
        type: entryType,
        prompt,
        createdAt: new Date().toISOString(),
        text: text || '',
        mood,
        milestone,
        ageMonths,
        palette,
        media: media.map(item => ({ url: item.url, type: item.type })),
        song: song || null,
      };
      setEntries(prev => [newEntry, ...prev]);
      if (milestone) {
        setCelebration({ kid: primaryKid, milestoneType: milestone, entry: newEntry });
      } else {
        setScreen('home');
      }
      return;
    }

    const { data: entry, error } = await supabase.from('entries').insert({
      user_id: session.user.id,
      family_id: familyId,
      author_id: session.user.id,
      signed_as: signedAs || null,
      kid_ids: kidIds,
      text: text || '',
      mood,
      milestone,
      date,
      age_months: ageMonths,
      palette,
      location: location || null,
      location_lat: locationLat ?? null,
      location_lng: locationLng ?? null,
      song: song || null,
      people: people || [],
      shared,
      shared_with: sharedWith,
      voice_memo_url: voiceMemoUrlFinal,
      type: entryType,
      prompt,
    }).select().single();

    if (error || !entry) {
      alert('Could not save your entry. Please try again.\n' + (error?.message || ''));
      return;
    }

    // Optimistically show entry and navigate away immediately
    const optimisticEntry = { id: entry.id, kids: kidIds, date, type: entryType, prompt, createdAt: entry.created_at || new Date().toISOString(), text: text || '', mood, milestone, ageMonths, palette, media: [], signedAs: signedAs || null, location: location || null, locationLat: locationLat ?? null, locationLng: locationLng ?? null, song: song || null, people: people || [], shared, sharedWith, voiceMemoUrl: voiceMemoUrlFinal };
    setEntries(prev => [optimisticEntry, ...prev]);
    if (milestone) {
      setCelebration({ kid: primaryKid, milestoneType: milestone, entry: optimisticEntry });
    } else {
      setScreen('home');
    }

    // Notify partner (fire and forget)
    const partnerMember = familyMembers.find(m => m.user_id !== session.user.id);
    if (partnerMember?.user_id && text?.trim()) {
      const myMember = familyMembers.find(m => m.user_id === session.user.id);
      const authorName = myMember?.real_name || myMember?.display_name || 'Your partner';
      const kidNames = kidIds.map(id => kids.find(k => k.id === id)?.name.split(' ')[0]).filter(Boolean).join(' & ');
      supabase.functions.invoke('notify-partner', {
        body: { authorName, partnerUserId: partnerMember.user_id, kidNames, entryDate: date, entryText: text },
      }).catch(() => {});
    }

    // Upload media in background, then update entry with real URLs
    if (media.length > 0) {
      const { saved, failed } = await prepareAndUpload(media, fileObjects, entry.id);
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, media: saved } : e));
      if (failed) alert(`Media upload failed (${failed.err}) — your entry was saved. Please try again.`);
    }
  }

  async function handleAvatarUpload(kidId, file) {
    const previousAvatar = kids.find(k => k.id === kidId)?.avatar ?? null;
    const localUrl = URL.createObjectURL(file);
    setKids(prev => prev.map(k => k.id === kidId ? { ...k, avatar: localUrl } : k));
    if (localMode || !supabase || !session) return;
    const { data: { session: activeSession } } = await supabase.auth.getSession();
    const activeUserId = activeSession?.user?.id;
    if (!activeUserId) {
      setKids(prev => prev.map(k => k.id === kidId ? { ...k, avatar: previousAvatar } : k));
      alert('Upload failed because your session expired. Please sign out and sign back in, then try again.');
      return;
    }
    let publicUrl;
    try {
      publicUrl = await uploadToCloudinary(file, 'image');
    } catch (e) {
      setKids(prev => prev.map(k => k.id === kidId ? { ...k, avatar: previousAvatar } : k));
      alert('Photo upload failed: ' + e.message);
      return;
    }
    setKids(prev => prev.map(k => k.id === kidId ? { ...k, avatar: publicUrl } : k));
    const { error: dbError } = await supabase.from('kids').update({ avatar_url: publicUrl }).eq('id', kidId);
    if (dbError) {
      setKids(prev => prev.map(k => k.id === kidId ? { ...k, avatar: previousAvatar } : k));
      alert('Photo saved locally but failed to sync: ' + dbError.message);
    }
  }

  async function handleUpdateLocation(entryId, location, lat, lng) {
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, location: location || null, locationLat: lat ?? null, locationLng: lng ?? null } : e));
    if (!localMode && supabase && session) {
      await supabase.from('entries').update({ location: location || null, location_lat: lat ?? null, location_lng: lng ?? null }).eq('id', entryId);
    }
  }

  async function handleUpdatePeople(entryId, people) {
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, people: people || [] } : e));
    if (!localMode && supabase && session) {
      await supabase.from('entries').update({ people: people || [] }).eq('id', entryId);
    }
  }

  async function handleUpdateKids(entryId, kidIds) {
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, kids: kidIds } : e));
    if (!localMode && supabase && session) {
      await supabase.from('entries').update({ kid_ids: kidIds }).eq('id', entryId);
    }
  }

  async function handleToggleEntryShared(entryId, sharedWith) {
    const shared = Object.values(sharedWith).some(Boolean);
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, shared, sharedWith } : e));
    if (!localMode && supabase && session) {
      await supabase.from('entries').update({ shared, shared_with: sharedWith }).eq('id', entryId);
    }
  }

  async function handleDeleteAccount() {
    if (!supabase || !session) return;
    try {
      const { error } = await supabase.rpc('delete_my_account');
      if (error) throw error;
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Delete account error:', e);
      alert('Something went wrong. Please try again.');
    }
  }

  function openProfile(kidId) {
    setProfileKidId(kidId);
    setScreen('profile');
  }

  async function uploadKidAvatars(newKids, insertedRows) {
    return Promise.all(
      newKids.map(async (k, i) => {
        if (!k.avatar?.startsWith('blob:')) return null;
        try {
          const res = await fetch(k.avatar);
          const blob = await res.blob();
          const url = await uploadToCloudinary(new File([blob], 'avatar.jpg', { type: blob.type || 'image/jpeg' }), 'image');
          if (url && insertedRows[i]) await supabase.from('kids').update({ avatar_url: url }).eq('id', insertedRows[i].id);
          return url || null;
        } catch (_) { return null; }
      })
    );
  }

  async function handleOnboardingDone(newKids, displayName = 'Parent', realName = '', profilePhotoBlob = null) {
    if (localMode || !supabase || !session) {
      const normalizedKids = newKids.map((kid, i) => ({
        ...kid,
        id: kid.id ?? Date.now() + i,
        accent: kid.accent || KID_ACCENTS[i % KID_ACCENTS.length],
      }));
      setKids(normalizedKids);
      setProfileKidId(normalizedKids[0]?.id ?? null);
      return { success: true };
    }
    const userId = session.user.id;
    // Don't create a new family if already in one
    const { data: existingMemberships } = await supabase.from('family_members').select('family_id').eq('user_id', userId);
    if (existingMemberships?.length > 0) {
      const existingFamilyId = existingMemberships[0].family_id;
      setFamilyId(existingFamilyId);
      const { data: kidsData } = await supabase.from('kids').select('id, name, birthdate, accent, avatar_url, sex, growth_log, wishlist_url').eq('family_id', existingFamilyId).order('created_at');
      if (kidsData?.length > 0) {
        // Already have kids — just load them
        setKids(kidsData.map(k => ({ id: k.id, name: k.name, birthdate: k.birthdate, accent: k.accent || KID_ACCENTS[0], avatar: k.avatar_url, sex: k.sex || null, growthLog: k.growth_log || [], wishlistUrl: k.wishlist_url || null })));
        setProfileKidId(kidsData[0]?.id ?? null);
        setPostOnboardInvite(true);
        return { success: true, familyId: existingFamilyId };
      }
      // Family exists but no kids yet (partial previous attempt) — insert them now
      const { data: inserted, error: insertError } = await supabase.from('kids').insert(
        newKids.map((k, i) => ({
          user_id: userId,
          family_id: existingFamilyId,
          name: k.name,
          birthdate: k.birthdate,
          accent: k.accent || KID_ACCENTS[i % KID_ACCENTS.length],
          avatar_url: null,
        }))
      ).select();
      if (insertError) return { error: insertError.message };
      if (inserted?.length > 0) {
        const avatarUrls = await uploadKidAvatars(newKids, inserted);
        setKids(inserted.map((k, i) => ({ id: k.id, name: k.name, birthdate: k.birthdate, accent: k.accent, avatar: avatarUrls[i] || k.avatar_url })));
        setProfileKidId(inserted[0]?.id ?? null);
      }
      setPostOnboardInvite(true);
      return { success: true, familyId: existingFamilyId };
    }
    const { data: family, error: familyError } = await supabase.from('families').insert({}).select().single();
    if (familyError || !family) {
      return { error: familyError?.message || 'Could not create your family yet.' };
    }
    const newFamilyId = family.id;
    setFamilyId(newFamilyId);
    const { data: mem, error: memberError } = await supabase.from('family_members').insert({
      family_id: newFamilyId, user_id: userId, display_name: displayName,
    }).select().single();
    if (memberError) {
      return { error: memberError.message };
    }
    setMyDisplayName(displayName);
    setFamilyMembers(mem ? [mem] : []);
    const { data, error: kidsError } = await supabase.from('kids').insert(
      newKids.map((k, i) => ({
        user_id: userId,
        family_id: newFamilyId,
        name: k.name,
        birthdate: k.birthdate,
        accent: k.accent || KID_ACCENTS[i % KID_ACCENTS.length],
        avatar_url: null,
      }))
    ).select();
    if (kidsError) {
      return { error: kidsError.message };
    }
    if (data) {
      const avatarUrls = await uploadKidAvatars(newKids, data);
      setPostOnboardInvite(true);
      setKids(data.map((k, i) => ({ id: k.id, name: k.name, birthdate: k.birthdate, accent: k.accent, avatar: avatarUrls[i] || k.avatar_url })));
      setProfileKidId(data[0]?.id ?? null);
    }
    // Save real name + optional profile photo to profiles table
    const profileName = realName || displayName;
    try {
      let avatarUrl = null;
      if (profilePhotoBlob) {
        try { avatarUrl = await uploadToCloudinary(new File([profilePhotoBlob], 'avatar.jpg', { type: 'image/jpeg' }), 'image'); } catch (_) {}
      }
      await supabase.from('profiles').upsert({ id: userId, display_name: profileName, ...(avatarUrl ? { avatar_url: avatarUrl } : {}) }, { onConflict: 'id' });
      if (avatarUrl) {
        await supabase.from('family_members').update({ avatar_url: avatarUrl }).eq('family_id', newFamilyId).eq('user_id', userId);
        setFamilyMembers(prev => prev.map(m => m.user_id === userId ? { ...m, avatar_url: avatarUrl } : m));
      }
    } catch (_) {}
    return { success: true, familyId: newFamilyId };
  }

  async function handleJoinFamily(code, displayName) {
    if (!supabase || !session) return { error: 'Not authenticated' };
    const { data: invite } = await supabase
      .from('family_invites').select('id, family_id, token, accepted_at')
      .eq('token', code.toUpperCase().trim()).is('accepted_at', null).maybeSingle();
    if (!invite) return { error: 'Invalid or expired code — check with your partner' };
    // Warn if already in a different family
    const { data: existing } = await supabase.from('family_members').select('family_id').eq('user_id', session.user.id);
    const inDifferentFamily = existing?.some(m => m.family_id !== invite.family_id);
    if (inDifferentFamily) {
      const confirmed = window.confirm(
        "You're already part of a family journal. Joining this one will switch you to the new family.\n\nIf you need to write for multiple families (e.g. grandchildren and your own children), use a separate account for each.\n\nSwitch to the new family?"
      );
      if (!confirmed) return { cancelled: true };
    }
    // Leave any existing families before joining the new one
    await supabase.from('family_members').delete().eq('user_id', session.user.id).neq('family_id', invite.family_id);
    const { error: joinError } = await supabase.from('family_members').insert({
      family_id: invite.family_id, user_id: session.user.id, display_name: displayName,
    });
    if (joinError) return { error: 'Could not join — you may already be in this family' };
    await supabase.from('family_invites').update({ accepted_at: new Date().toISOString() }).eq('id', invite.id);
    await Promise.all([
      supabase.from('entries').update({ family_id: invite.family_id }).eq('user_id', session.user.id),
      supabase.from('kids').update({ family_id: invite.family_id }).eq('user_id', session.user.id),
    ]);
    setFamilyId(invite.family_id);
    setMyDisplayName(displayName);
    const [{ data: kidsData }, { data: entriesData }, { data: membersData }] = await Promise.all([
      supabase.from('kids').select('id, name, birthdate, accent, avatar_url, user_id, sex, growth_log, family_id, wishlist_url').eq('family_id', invite.family_id).order('created_at'),
      supabase.from('entries').select('*, entry_media(*)').eq('family_id', invite.family_id).order('date', { ascending: false }),
      supabase.from('family_members').select('id, user_id, family_id, display_name, avatar_url').eq('family_id', invite.family_id),
    ]);
    if (kidsData) {
      setKids(kidsData.map(k => ({ id: k.id, name: k.name, birthdate: k.birthdate, accent: k.accent || KID_ACCENTS[0], avatar: k.avatar_url, sex: k.sex || null, growthLog: k.growth_log || [], wishlistUrl: k.wishlist_url || null })));
      setProfileKidId(kidsData[0]?.id ?? null);
    }
    if (entriesData) {
      setEntries(entriesData.map(normalizeEntry));
    }
    if (membersData) setFamilyMembers(membersData);
    setScreen('home');
    return { success: true };
  }

  async function handleInvitePartner(explicitFamilyId) {
    const fid = explicitFamilyId || familyId;
    if (!fid || !supabase || !session) return null;
    const token = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { error } = await supabase.from('family_invites').insert({
      family_id: fid, invited_by: session.user.id, token,
    });
    return error ? null : token;
  }

  async function handleInviteFriend() {
    if (!supabase || !session) return null;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { error } = await supabase.from('friend_invites').insert({ code, inviter_id: session.user.id });
    return error ? null : code;
  }

  async function handleBookWaitlist(email) {
    if (!supabase || !session) return;
    await supabase.from('book_waitlist').upsert(
      { user_id: session.user.id, email },
      { onConflict: 'user_id' }
    );
  }

  async function handleRenameKid(kidId, name) {
    setKids(prev => prev.map(k => k.id === kidId ? { ...k, name } : k));
    if (localMode || !supabase || !session) return;
    await supabase.from('kids').update({ name }).eq('id', kidId);
  }

  async function handleUpdateKidSex(kidId, sex) {
    setKids(prev => prev.map(k => k.id === kidId ? { ...k, sex } : k));
    if (localMode || !supabase || !session) return;
    await supabase.from('kids').update({ sex }).eq('id', kidId);
  }

  async function handleUpdateKidWishlist(kidId, wishlistUrl) {
    setKids(prev => prev.map(k => k.id === kidId ? { ...k, wishlistUrl } : k));
    if (localMode || !supabase || !session) return;
    await supabase.from('kids').update({ wishlist_url: wishlistUrl }).eq('id', kidId);
  }

  async function handleAddKid({ name, birthdate, sex }) {
    const accent = KID_ACCENTS[kids.length % KID_ACCENTS.length];
    if (localMode || !supabase || !session) {
      const newKid = { id: Date.now(), name, birthdate, accent, avatar: null, sex: sex || null, growthLog: [] };
      setKids(prev => [...prev, newKid]);
      return;
    }
    const { data } = await supabase.from('kids').insert({
      user_id: session.user.id,
      family_id: familyId,
      name,
      birthdate,
      accent,
      avatar_url: null,
      sex: sex || null,
      growth_log: [],
    }).select().single();
    if (data) {
      setKids(prev => [...prev, { id: data.id, name: data.name, birthdate: data.birthdate, accent: data.accent, avatar: null, sex: data.sex || null, growthLog: [] }]);
    }
  }

  async function handleSaveGrowthEntry(kidId, entry) {
    const kid = kids.find(k => k.id === kidId);
    if (!kid) return;
    const newLog = [...(kid.growthLog || []).filter(e => e.date !== entry.date), entry].sort((a, b) => a.date.localeCompare(b.date));
    setKids(prev => prev.map(k => k.id === kidId ? { ...k, growthLog: newLog } : k));
    if (localMode || !supabase || !session) return;
    await supabase.from('kids').update({ growth_log: newLog }).eq('id', kidId);
  }

  async function handleDeleteGrowthEntry(kidId, date) {
    const kid = kids.find(k => k.id === kidId);
    if (!kid) return;
    const newLog = (kid.growthLog || []).filter(e => e.date !== date);
    setKids(prev => prev.map(k => k.id === kidId ? { ...k, growthLog: newLog } : k));
    if (localMode || !supabase || !session) return;
    await supabase.from('kids').update({ growth_log: newLog }).eq('id', kidId);
  }

  async function handleUpdateDisplayName(name) {
    setMyDisplayName(name);
    setFamilyMembers(prev => prev.map(m => m.user_id === session?.user.id ? { ...m, display_name: name } : m));
    if (!supabase || !session || !familyId) return;
    await supabase.from('family_members').update({ display_name: name }).eq('family_id', familyId).eq('user_id', session.user.id);
  }

  async function handleUpdateRealName(name) {
    if (!supabase || !session) return;
    setFamilyMembers(prev => prev.map(m => m.user_id === session.user.id ? { ...m, real_name: name } : m));
    await supabase.from('profiles').upsert({ id: session.user.id, display_name: name }, { onConflict: 'id' });
  }

  // ── Friend handlers ───────────────────────────────────────────────────────

  async function handleSearchUsers(query) {
    if (!query.trim() || !supabase || !session) return [];
    const { data } = await supabase
      .from('discoverable_profiles')
      .select('id, display_name, avatar_url, kid_names')
      .ilike('display_name', `%${query}%`)
      .neq('id', session.user.id)
      .limit(20);
    return data || [];
  }

  async function handleToggleDiscoverable(val) {
    setDiscoverable(val);
    if (supabase && session) {
      await supabase.from('profiles').update({ discoverable: val }).eq('id', session.user.id);
    }
  }

  async function handleHidePostsFromFriends() {
    const toUpdate = entries.filter(e => e.sharedWith?.friends);
    if (toUpdate.length === 0) {
      setReactionToast({ message: "You don't have any posts shared with friends" });
      return;
    }
    const nextSharedWith = e => ({ ...e.sharedWith, friends: false });
    setEntries(prev => prev.map(e => e.sharedWith?.friends
      ? { ...e, sharedWith: nextSharedWith(e), shared: Object.values(nextSharedWith(e)).some(Boolean) }
      : e));
    if (!localMode && supabase && session) {
      await Promise.all(toUpdate.map(e => {
        const sw = nextSharedWith(e);
        return supabase.from('entries').update({ shared: Object.values(sw).some(Boolean), shared_with: sw }).eq('id', e.id);
      }));
    }
    setReactionToast({ message: `Hidden from friends — ${toUpdate.length} post${toUpdate.length !== 1 ? 's' : ''}` });
  }

  async function handleToggleSharingDefault(key, val) {
    const next = { ...sharingDefaults, [key]: val };
    setSharingDefaults(next);
    if (supabase && session) {
      await supabase.from('profiles').update({ sharing_defaults: next }).eq('id', session.user.id);
    }
  }

  async function handleSendFriendRequest(userId, displayName, avatarUrl) {
    if (!supabase || !session) return { error: 'Not signed in' };
    const { data, error } = await supabase
      .from('friend_requests')
      .insert({ requester_id: session.user.id, addressee_id: userId })
      .select().single();
    if (!error && data) {
      setFriendRequests(prev => [...prev, { ...data, requester_display_name: myDisplayName, requester_avatar_url: null, addressee_display_name: displayName, addressee_avatar_url: avatarUrl || null }]);
    }
    return { error };
  }

  async function handleRespondFriendRequest(id, accept) {
    if (!supabase || !session) return;
    const status = accept ? 'accepted' : 'declined';
    const { error } = await supabase.from('friend_requests').update({ status }).eq('id', id);
    if (error) return;
    const req = friendRequests.find(r => r.id === id);
    setFriendRequests(prev => prev.filter(r => r.id !== id));
    if (accept && req) {
      setFriends(prev => [...prev, { ...req, status: 'accepted' }]);
      const friendUserId = req.requester_id === session.user.id ? req.addressee_id : req.requester_id;
      try {
        const [{ data: fKids }, { data: fEntries }] = await Promise.all([
          supabase.from('kids').select('*').eq('user_id', friendUserId),
          supabase.from('entries').select('*, entry_media(*)').eq('user_id', friendUserId).eq('shared', true).order('date', { ascending: false }),
        ]);
        setFriendKids(prev => { const ids = new Set(prev.map(k => k.id)); return [...prev, ...(fKids || []).map(k => ({ id: k.id, name: k.name, birthdate: k.birthdate, accent: k.accent || KID_ACCENTS[0], avatar: k.avatar_url, sex: k.sex || null, userId: k.user_id })).filter(k => !ids.has(k.id))]; });
        setFriendEntries(prev => { const ids = new Set(prev.map(e => e.id)); return [...prev, ...(fEntries || []).map(normalizeEntry).filter(e => !ids.has(e.id))]; });
      } catch (_) {}
    }
  }

  async function handleUnfriend(friendshipId) {
    if (!supabase || !session) return;
    const fr = friends.find(f => f.id === friendshipId);
    const { error } = await supabase.from('friend_requests').delete().eq('id', friendshipId);
    if (error) return;
    if (fr) {
      const removedUserId = fr.requester_id === session.user.id ? fr.addressee_id : fr.requester_id;
      setFriends(prev => prev.filter(f => f.id !== friendshipId));
      setFriendKids(prev => prev.filter(k => k.userId !== removedUserId));
      setFriendEntries(prev => prev.filter(e => e.userId !== removedUserId));
    }
  }

  const [avatarUploading, setAvatarUploading] = useState(false);

  async function handleFamilyAvatarUpload(memberId, file) {
    const previousAvatar = familyMembers.find(m => m.id === memberId || m.user_id === memberId)?.avatar_url ?? null;
    const localUrl = URL.createObjectURL(file);
    setFamilyMembers(prev => prev.map(m => (m.id === memberId || m.user_id === memberId) ? { ...m, avatar_url: localUrl } : m));
    if (localMode || !supabase || !session || !familyId) return;
    setAvatarUploading(true);
    const { data: { session: activeSession } } = await supabase.auth.getSession();
    const activeUserId = activeSession?.user?.id;
    if (!activeUserId) {
      setFamilyMembers(prev => prev.map(m => (m.id === memberId || m.user_id === memberId) ? { ...m, avatar_url: previousAvatar } : m));
      alert('Upload failed because your session expired. Please sign out and sign back in, then try again.');
      return;
    }
    let publicUrl;
    try {
      publicUrl = await uploadToCloudinary(file, 'image');
    } catch (e) {
      setFamilyMembers(prev => prev.map(m => (m.id === memberId || m.user_id === memberId) ? { ...m, avatar_url: previousAvatar } : m));
      alert('Photo upload failed: ' + e.message);
      setAvatarUploading(false);
      return;
    }
    setFamilyMembers(prev => prev.map(m => (m.id === memberId || m.user_id === memberId) ? { ...m, avatar_url: publicUrl } : m));
    const { error: dbError } = await supabase.from('family_members').update({ avatar_url: publicUrl })
      .eq('family_id', familyId).eq('user_id', session.user.id);
    if (dbError) {
      setFamilyMembers(prev => prev.map(m => (m.id === memberId || m.user_id === memberId) ? { ...m, avatar_url: previousAvatar } : m));
      if (dbError.message?.includes("avatar_url")) {
        alert("Your photo uploaded, but your Supabase database is missing the family_members.avatar_url column. Run the SQL in family-members-avatar-column.sql, then try again.");
      } else {
        alert('Photo saved locally but failed to sync: ' + dbError.message);
      }
    } else {
      // Keep profiles in sync so avatar shows in friend search
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', session.user.id);
    }
    setAvatarUploading(false);
  }

  const handleClearReactions = useCallback(() => {
    setReactionNotifications([]);
    if (supabase && session?.user?.id) {
      supabase.from('profiles').update({ notif_cleared_at: new Date().toISOString() }).eq('id', session.user.id).then(() => {});
      // Mark dismissed rather than delete — the birthday-detection effect upserts
      // on a deterministic id and relies on the row still existing (ignoreDuplicates)
      // to avoid recreating a notification for a birthday still inside the 7-day window.
      supabase.from('birthday_notifications').update({ dismissed: true }).eq('user_id', session.user.id).then(() => {});
    }
    setBirthdayNotifications([]);
    setReactionToast({ message: 'All caught up' });
  }, [session?.user?.id]);

  const handleDismissReaction = useCallback(id => {
    setReactionNotifications(p => p.filter(n => n.id !== id));
    if (supabase && session?.user?.id) supabase.from('dismissed_notifications').insert({ user_id: session.user.id, notification_id: id }).then(() => {});
  }, [session?.user?.id]);

  const handleDismissBirthday = useCallback(id => {
    if (supabase && session?.user?.id) supabase.from('birthday_notifications').update({ dismissed: true }).eq('id', id).eq('user_id', session.user.id).then(() => {});
    setBirthdayNotifications(p => p.filter(n => n.id !== id));
  }, [session?.user?.id]);

  const sessionValue = useMemo(() => ({
    session, userId: session?.user?.id, familyId, familyMembers, myDisplayName, localMode,
  }), [session, familyId, familyMembers, myDisplayName]);

  const dataValue = useMemo(() => ({
    entries, kids,
  }), [entries, kids]);

  const notifValue = useMemo(() => ({
    reactionNotifications, birthdayNotifications, reactionCounts,
    partnerToast, reactionToast, unseenPartnerIds, friendRequests,
    pendingRequestCount: friendRequests.filter(r => r.addressee_id === session?.user?.id).length,
    circleBadge: reactionNotifications.length + birthdayNotifications.length,
    onClearReactions: handleClearReactions,
    onDismissReaction: handleDismissReaction,
    onDismissBirthday: handleDismissBirthday,
  }), [reactionNotifications, birthdayNotifications, reactionCounts, partnerToast, reactionToast, unseenPartnerIds, friendRequests, session?.user?.id, handleClearReactions, handleDismissReaction, handleDismissBirthday]);

  if (authLoading || dataLoading) {
    return (
      <div className="app-root" data-theme={effectiveDark ? 'dark' : undefined} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <i className="ti ti-loader-2" style={{ fontSize: 32, color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (passwordRecovery && session) {
    return (
      <div className="app-root" data-theme={effectiveDark ? 'dark' : undefined}>
        <UpdatePasswordScreen onDone={() => setPasswordRecovery(false)} />
      </div>
    );
  }

  if (!session && !localMode) {
    return (
      <div className="app-root" data-theme={effectiveDark ? 'dark' : undefined}>
        <AuthScreen />
      </div>
    );
  }

  if (kids.length === 0 || postOnboardInvite) {
    return (
      <div className="app-root" data-theme={effectiveDark ? 'dark' : undefined}>
        {joiningFamily
          ? <JoinFamilyScreen onJoin={handleJoinFamily} onBack={() => setJoiningFamily(false)} />
          : <OnboardingScreen
              onDone={handleOnboardingDone}
              onJoinFamily={() => setJoiningFamily(true)}
              onSignOut={() => supabase ? supabase.auth.signOut() : undefined}
              hasBackend={!localMode && !!supabase && !!session}
              onGenerateInvite={handleInvitePartner}
              onFinish={() => setPostOnboardInvite(false)}
            />
        }
      </div>
    );
  }

  return (
    <SessionCtx.Provider value={sessionValue}>
    <DataCtx.Provider value={dataValue}>
    <NotifCtx.Provider value={notifValue}>
    <div className="app-root" data-theme={effectiveDark ? 'dark' : undefined}>
      {partnerToast && (
        <PartnerToast
          toast={partnerToast}
          onView={() => { setLetterAuthorId(partnerToast.entry.authorId); setScreen('partner-letters'); setPartnerToast(null); }}
          onDismiss={() => setPartnerToast(null)}
        />
      )}
      {reactionToast && (
        <ReactionToast message={reactionToast.message} onDismiss={() => setReactionToast(null)} />
      )}
      {screen === 'home' && (() => {
        const partnerMember = familyMembers.find(m => m.user_id !== session?.user?.id) || null;
        const selfMember = familyMembers.find(m => m.user_id === session?.user?.id) || null;
        return (
          <HomeScreen
            kidFilter={kidFilter}
            setKidFilter={setKidFilter}
            onOpenEntry={openEntry}
            onSearch={() => setScreen('search')}
            onAddMoment={() => { setComposeMode('letter'); setScreen('new-entry'); }}
            onStartPrompt={(prompt, kidId) => { setActivePrompt(prompt); setNewEntryInitial({ kidIds: [kidId] }); setComposeMode('note'); setScreen('new-entry'); }}
            onSeeAll={() => { setJournalBackScreen('home'); setScreen('journal'); }}
            onCompare={() => setScreen('compare')}
            onUpdateCrop={handleUpdateCrop}
            onSeePartnerLetters={() => { setLetterAuthorId(partnerMember?.user_id || null); setScreen('partner-letters'); }}
            self={selfMember}
            onRefresh={handleRefresh}
            onToggleFavorite={handleToggleFavorite}
            onDeleteEntry={handleQuickDelete}
            friendEntries={friendEntries}
            friendKids={friendKids}
            friends={friends}
            friendFamilyMap={friendFamilyMap}
            onCompareAtAge={(kidId, ageMonths) => {
              const ages = [12, 18, 24, 36, 48, 60, 72, 84, 96, 108, 120];
              const bucket = ages.reduce((best, a) => ageMonths >= a ? a : best, ages[0]);
              setCompareTarget({ kidId, compareAge: bucket });
              setScreen('compare');
            }}
            pendingOpenEntryId={pendingOpenEntryId}
            onClearPendingOpen={() => setPendingOpenEntryId(null)}
            initialCircleViewer={circleViewerEntry}
            onClearInitialCircleViewer={() => setCircleViewerEntry(null)}
            onAvatarUpload={handleAvatarUpload}
            onBirthdayNextWeekClick={(kid, age) => {
              setNewEntryInitial({ kidIds: [kid.id], milestone: 'custom', customMilestone: `${ordinal(age)} Birthday` });
              setComposeMode('letter');
              setScreen('new-entry');
            }}
            onBirthdayTodayClick={kid => setBirthdaySlideshow(kid)}
            onFriendBirthdayClick={kid => setBirthdaySlideshowFriend({ kid, entries: friendEntries })}
          />
        );
      })()}

      {keepsakesGroupMounted && (() => {
        const partnerMember = familyMembers.find(m => m.user_id !== session?.user?.id) || null;
        const selfMember = familyMembers.find(m => m.user_id === session?.user?.id) || null;
        return (
          <div style={{ display: screen === 'partner-letters' ? 'contents' : 'none' }}>
            <PartnerLettersScreen
              entries={entries}
              kids={kids}
              unseenIds={unseenPartnerIds}
              authorId={letterAuthorId}
              currentUserId={session?.user?.id}
              self={selfMember}
              partner={partnerMember}
              onBack={() => setScreen('home')}
              onOpenEntry={(entry) => { markPartnerEntrySeen(entry.id); openEntry(entry); }}
              onMarkAllRead={markAllSeen}
              scrollPos={partnerLettersScrollPos}
              onSwitchSection={switchSection}
            />
          </div>
        );
      })()}

      {screen === 'journal' && (
        <JournalScreen
          entries={entries}
          kids={kids}
          kidFilter={kidFilter}
          setKidFilter={setKidFilter}
          onOpenEntry={openEntry}
          onNewEntry={() => { setComposeMode('letter'); setScreen('new-entry'); }}
          memberCount={familyMembers.length}
          scrollPos={journalScrollPos}
          onRefresh={handleRefresh}
          onToggleFavorite={handleToggleFavorite}
          onDeleteEntry={handleQuickDelete}
          reactionCounts={reactionCounts}
          onBack={() => setScreen(journalBackScreen)}
        />
      )}

      {screen === 'entry-detail' && activeEntry && (
        <EntryDetailScreen
          entry={entries.find(e => e.id === activeEntry.id) || activeEntry}
          kid={kids.find(k => k.id === activeEntry.kids[0])}
          allKids={kids}
          onBack={() => setScreen(entrySource)}
          onEdit={editEntry}
          onToggleFavorite={handleToggleFavorite}
          onDelete={handleDeleteEntry}
          onUpdateCrop={handleUpdateCrop}
          onUpdateLocation={handleUpdateLocation}
          onUpdatePeople={handleUpdatePeople}
          onUpdateKids={handleUpdateKids}
          onToggleShared={!localMode ? handleToggleEntryShared : undefined}
          allPeople={allPeople}
          friendKids={friendKids}
          supabase={supabase}
          session={session}
          socialName={myDisplayName || ''}
        />
      )}

      {screen === 'new-entry' && (
        <NewEntryScreen kids={kids} friendKids={friendKids} mode={composeMode} promptText={activePrompt} onCancel={() => { setScreen('home'); setNewEntryInitial(null); setActivePrompt(null); }} onSave={(...args) => { handleSaveEntry(...args); setNewEntryInitial(null); setActivePrompt(null); }} signedDefault={myDisplayName || undefined} draftKey={newEntryInitial ? null : (session?.user?.id ? `patina-new-draft-${composeMode}-${session.user.id}` : `patina-new-draft-${composeMode}`)} allPeople={allPeople} familyMembers={familyMembers} currentUserId={session?.user?.id} sharingDefaults={sharingDefaults} initialKidIds={newEntryInitial?.kidIds} initialMilestone={newEntryInitial?.milestone} initialCustomMilestone={newEntryInitial?.customMilestone} />
      )}

      {screen === 'edit-entry' && activeEntry && (
        <NewEntryScreen
          kids={kids}
          friendKids={friendKids}
          existingEntry={activeEntry}
          onCancel={() => setScreen('entry-detail')}
          onSave={handleSaveEntry}
          onDelete={handleDeleteEntry}
          signedDefault={myDisplayName || undefined}
          allPeople={allPeople}
          familyMembers={familyMembers}
          currentUserId={session?.user?.id}
        />
      )}

      {keepsakesGroupMounted && (
        <div style={{ display: screen === 'recap' ? 'contents' : 'none' }}>
          <ScreenErrorBoundary onBack={() => setScreen('home')}>
            <RecapScreen
              entries={entries}
              kids={kids}
              onBack={() => setScreen('home')}
              onOpenEntry={openEntry}
              onSwitchSection={switchSection}
            />
          </ScreenErrorBoundary>
        </div>
      )}

      {circleGroupMounted && (
        <div style={{ display: screen === 'circle-feed' ? 'contents' : 'none' }}>
          <CircleFeedScreen
            onBack={() => setScreen('home')}
            friendKids={friendKids}
            friendFamilyMap={friendFamilyMap}
            onCompareAtAge={(kidId, ageMonths) => {
              const ages = [12, 18, 24, 36, 48, 60, 72, 84, 96, 108, 120];
              const bucket = ages.reduce((best, a) => ageMonths >= a ? a : best, ages[0]);
              setCompareTarget({ kidId, compareAge: bucket });
              setScreen('compare');
            }}
            onSwitchSection={switchSection}
          />
        </div>
      )}

      {keepsakesGroupMounted && (
        <div style={{ display: screen === 'compare' ? 'contents' : 'none' }}>
          <CompareScreen
            entries={entries}
            kids={kids}
            friendKids={friendKids}
            friendEntries={friendEntries}
            friends={friends}
            currentUserId={session?.user?.id}
            onBack={() => { setScreen('home'); setCompareTarget(null); }}
            onOpenEntry={openEntry}
            initialFriendKidId={compareTarget?.kidId ?? null}
            initialCompareAge={compareTarget?.compareAge ?? null}
            onSwitchSection={switchSection}
          />
        </div>
      )}

      {circleGroupMounted && (
        <div style={{ display: screen === 'friends' ? 'contents' : 'none' }}>
        <FriendsScreen
          friends={friends}
          friendKids={friendKids}
          friendEntries={friendEntries}
          familyMemberIds={familyMembers.filter(m => m.user_id !== session?.user?.id).map(m => m.user_id)}
          onBack={() => setScreen('home')}
          onSearch={handleSearchUsers}
          onSendRequest={handleSendFriendRequest}
          onInviteFriend={handleInviteFriend}
          onRespond={handleRespondFriendRequest}
          onUnfriend={handleUnfriend}
          onOpenFriendEntry={(entryId) => {
            const entry = entries.find(e => e.id === entryId);
            if (!entry) return;
            const entryKids = kids.filter(k => (entry.kids || []).includes(k.id));
            const kidLabel = entryKids.map(k => k.name).join(' & ') || 'Photo';
            const age = entryKids[0]?.birthdate ? exactAgeLabel(entryKids[0].birthdate, entry.date) : null;
            const entryDate = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const member = familyMembers.find(m => m.user_id === entry.user_id);
            setCircleViewerEntry({ entry, entryKids, kidLabel, age, friendName: member?.real_name || member?.display_name || '', friendAvatar: member?.avatar_url || null, entryDate });
            setScreen('home');
          }}
          onFriendBirthdayClick={kid => setBirthdaySlideshowFriend({ kid, entries: friendEntries })}
          socialName={familyMembers.find(m => m.user_id === session?.user?.id)?.real_name || myDisplayName}
          friendUserFamilyMap={friendUserFamilyMap}
          onSwitchSection={switchSection}
        />
        </div>
      )}

      {screen === 'search' && (
        <SearchScreen entries={entries} kids={kids} onBack={() => setScreen('home')} onOpenEntry={openEntry} />
      )}

      {screen === 'book-builder' && (
        <ScreenErrorBoundary onBack={() => setScreen('profile')}>
          <BookBuilderScreen
            kids={kids}
            entries={entries}
            familyMembers={familyMembers}
            myDisplayName={myDisplayName}
            darkMode={effectiveDark}
            onBack={() => setScreen('profile')}
            onPreview={config => { setBookConfig(config); setScreen('book-preview'); }}
          />
        </ScreenErrorBoundary>
      )}

      {screen === 'book-preview' && bookConfig && (
        <ScreenErrorBoundary onBack={() => setScreen('book-builder')}>
          <Suspense fallback={<div className="screen" />}>
            <LazyBookPreviewScreen
              kids={kids}
              bookConfig={bookConfig}
              onBack={() => setScreen('book-builder')}
              onUpdateCrop={handleUpdateCrop}
              currentUserId={session?.user?.id}
              onNotifyMe={handleBookWaitlist}
              userEmail={session?.user?.email}
            />
          </Suspense>
        </ScreenErrorBoundary>
      )}

{screen === 'profile' && (
        <ProfileScreen
          kids={kids}
          entries={entries}
          onBack={() => setScreen('home')}
          onAvatarUpload={handleAvatarUpload}
          familyMembers={familyMembers}
          myDisplayName={myDisplayName}
          onInvite={handleInvitePartner}
          onUpdateDisplayName={handleUpdateDisplayName}
          onUpdateRealName={handleUpdateRealName}
          onAddKid={handleAddKid}
          onRenameKid={handleRenameKid}
          onUpdateKidSex={handleUpdateKidSex}
          onUpdateKidWishlist={handleUpdateKidWishlist}
          onFamilyAvatarUpload={handleFamilyAvatarUpload}
          avatarUploading={avatarUploading}
          currentUserId={session?.user?.id}
          onOpenGrowth={kidId => { setGrowthKidId(kidId); setScreen('growth'); }}
          onCreateBook={() => setScreen('book-builder')}
          onDeleteAccount={localMode ? undefined : handleDeleteAccount}
          hasPartner={familyMembers.filter(m => m.user_id !== session?.user?.id).length > 0}
          darkMode={darkMode}
          onToggleDarkMode={toggleDarkMode}
          onSetDarkMode={setDarkModeValue}
          discoverable={discoverable}
          onToggleDiscoverable={handleToggleDiscoverable}
          onHidePostsFromFriends={handleHidePostsFromFriends}
          sharingDefaults={sharingDefaults}
          onToggleSharingDefault={handleToggleSharingDefault}
          onShowPrivacy={() => setScreen('privacy')}
          onShowTerms={() => setScreen('terms')}
          onSignOut={() => {
            if (localMode || !supabase) {
              setKids([]);
              setEntries([]);
              setProfileKidId(null);
              setScreen('home');
              if (typeof window !== 'undefined') {
                window.localStorage.removeItem(LOCAL_STORAGE_KEY);
              }
              return;
            }
            setScreen('home');
            supabase.auth.signOut();
          }}
        />
      )}

      {screen === 'privacy' && <PrivacyPolicyScreen onBack={() => setScreen('profile')} />}
      {screen === 'terms' && <TermsScreen onBack={() => setScreen('profile')} />}

      {screen === 'growth' && growthKidId && (() => {
        const kid = kids.find(k => k.id === growthKidId);
        return kid ? (
          <ScreenErrorBoundary onBack={() => setScreen('profile')}>
            <Suspense fallback={<div className="screen" />}>
              <LazyGrowthScreen
                kid={kid}
                onBack={() => setScreen('profile')}
                onSave={entry => handleSaveGrowthEntry(growthKidId, entry)}
                onDelete={date => handleDeleteGrowthEntry(growthKidId, date)}
              />
            </Suspense>
          </ScreenErrorBoundary>
        ) : null;
      })()}

      {showInstallBanner && (
        <div style={{ padding: '0 12px 8px', flexShrink: 0 }}>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, padding: '10px 12px 10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="ti ti-leaf" style={{ fontSize: 18, color: 'var(--accent)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                {installBannerType === 'ios-other' ? 'Open in Safari to install' : 'Add Patina to your home screen'}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4 }}>
                {installBannerType === 'ios-safari' && 'Tap \u{1F4E4} Share → Add to Home Screen'}
                {installBannerType === 'ios-other' && 'Chrome on iOS can\'t install apps — Safari can'}
                {installBannerType === 'android' && 'Install for the full app experience'}
              </p>
            </div>
            {installPromptRef.current && (
              <button onClick={async () => { installPromptRef.current.prompt(); const { outcome } = await installPromptRef.current.userChoice; if (outcome === 'accepted') { localStorage.setItem('pwa-install-dismissed', '1'); setShowInstallBanner(false); } }} style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer', flexShrink: 0, fontFamily: "'Urbanist', sans-serif" }}>
                Install
              </button>
            )}
            <button onClick={() => { localStorage.setItem('pwa-install-dismissed', '1'); setShowInstallBanner(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <i className="ti ti-x" style={{ fontSize: 14 }} />
            </button>
          </div>
        </div>
      )}

      {screen !== 'entry-detail' && screen !== 'new-entry' && screen !== 'edit-entry' && screen !== 'growth' && screen !== 'book-builder' && screen !== 'book-preview' && (
        <NavBar active={screen} onNavigate={handleNavigate} myAvatarUrl={familyMembers.find(m => m.user_id === session?.user?.id)?.avatar_url} onAdd={() => setShowComposePicker(true)} />
      )}
      {(screen === 'growth' || screen === 'book-builder') && <NavBar active="profile" onNavigate={handleNavigate} myAvatarUrl={familyMembers.find(m => m.user_id === session?.user?.id)?.avatar_url} onAdd={() => setShowComposePicker(true)} />}

      {showComposePicker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.4)', zIndex: 30, display: 'flex', alignItems: 'flex-end' }} onClick={() => setShowComposePicker(false)}>
          <div className="quick-sheet" style={{ background: 'var(--bg)', borderRadius: '24px 24px 0 0', width: '100%', padding: '20px 20px 36px' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 20px' }} />
            {[
              { icon: 'ti-mail', label: 'Write a letter', sub: 'For moments worth writing home about', mode: 'letter' },
              { icon: 'ti-notebook', label: 'Quick note', sub: 'For the funny, fleeting, and forever', mode: 'note' },
              { icon: 'ti-bulb', label: 'Try a prompt', sub: 'For when you need inspiration', mode: 'prompt' },
            ].map((opt, i) => (
              <div key={opt.mode} onClick={() => {
                if (opt.mode === 'prompt') setActivePrompt(NOTE_PROMPTS[Math.floor(Math.random() * NOTE_PROMPTS.length)]);
                else setActivePrompt(null);
                setComposeMode(opt.mode === 'prompt' ? 'note' : opt.mode);
                setShowComposePicker(false);
                setScreen('new-entry');
              }} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderBottom: i < 2 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(74,94,80,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`ti ${opt.icon}`} style={{ fontSize: 18, color: 'var(--accent)' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{opt.label}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{opt.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {birthdaySlideshow && (
        <Suspense fallback={<div className="screen" />}>
          <LazyBirthdaySlideshowScreen
            kid={birthdaySlideshow}
            age={turningAge(birthdaySlideshow.birthdate)}
            entries={entries}
            onClose={() => setBirthdaySlideshow(null)}
          />
        </Suspense>
      )}
      {birthdaySlideshowFriend && (
        <Suspense fallback={<div className="screen" />}>
          <LazyBirthdaySlideshowScreen
            kid={birthdaySlideshowFriend.kid}
            age={turningAge(birthdaySlideshowFriend.kid.birthdate)}
            entries={birthdaySlideshowFriend.entries}
            onClose={() => setBirthdaySlideshowFriend(null)}
            isFriend
            viewerEntries={entries}
            viewerKids={kids}
          />
        </Suspense>
      )}

      {celebration && (
        <CelebrationOverlay
          kid={celebration.kid}
          milestoneType={celebration.milestoneType}
          onDone={() => { const e = celebration.entry; setCelebration(null); if (e) openEntry(e); else setScreen('journal'); }}
        />
      )}

      {monthlyRecap && (
        <div style={{ position: 'absolute', inset: 0, background: '#1E2A1E', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '0 32px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(200,153,62,0.8)', letterSpacing: 1.6, textTransform: 'uppercase', margin: '0 0 16px' }}>{monthlyRecap.label}</p>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: '#fff', textAlign: 'center', margin: '0 0 6px', lineHeight: 1.35 }}>
            "Isn't it funny how day by day nothing changes, but when you look back, everything is different."
          </h1>
          <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.3)', textAlign: 'center', margin: '0 0 32px', letterSpacing: 0.5 }}>
            — C.S. Lewis
          </p>

          <div style={{ display: 'flex', gap: 12, width: '100%', marginBottom: 40 }}>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 12px', textAlign: 'center' }}>
              <p style={{ fontSize: 36, fontWeight: 800, color: '#C8993E', margin: '0 0 4px', lineHeight: 1 }}>{monthlyRecap.letters}</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: 0, fontWeight: 600 }}>letter{monthlyRecap.letters !== 1 ? 's' : ''}</p>
            </div>
            {monthlyRecap.milestones > 0 && (
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 12px', textAlign: 'center' }}>
                <p style={{ fontSize: 36, fontWeight: 800, color: '#C8993E', margin: '0 0 4px', lineHeight: 1 }}>{monthlyRecap.milestones}</p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: 0, fontWeight: 600 }}>milestone{monthlyRecap.milestones !== 1 ? 's' : ''}</p>
              </div>
            )}
            {monthlyRecap.photos > 0 && (
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 12px', textAlign: 'center' }}>
                <p style={{ fontSize: 36, fontWeight: 800, color: '#C8993E', margin: '0 0 4px', lineHeight: 1 }}>{monthlyRecap.photos}</p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: 0, fontWeight: 600 }}>photo{monthlyRecap.photos !== 1 ? 's' : ''}</p>
              </div>
            )}
          </div>

          <button
            onClick={() => setMonthlyRecap(null)}
            className="btn btn-gold"
            style={{ border: 'none', borderRadius: 14, padding: '15px 40px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif" }}
          >
            Keep going
          </button>
        </div>
      )}
    </div>
    </NotifCtx.Provider>
    </DataCtx.Provider>
    </SessionCtx.Provider>
  );
}
