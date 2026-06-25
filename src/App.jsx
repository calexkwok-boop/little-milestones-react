import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback, memo } from 'react';
import './App.css';
import exifr from 'exifr';
import { supabase, supabaseConfigured } from './supabase.js';
import {
  KIDS_INITIAL, ENTRIES_INITIAL,
  MOODS, MILESTONE_TYPES, PALETTES, TODAY,
  ageLabel, exactAge, exactAgeLabel, milestoneInfo, entryBgStyle, tintedScrimStyle,
} from './constants.js';

const KID_ACCENTS = ['#D4856A', '#7BA99A', '#6A9EB0', '#C8993E', '#A889B0'];
const LOCAL_STORAGE_KEY = 'patina-local-data';

// ─── Growth chart reference data (CDC 2000) ───────────────────────────────
// [ageMonths, p5, p25, p50, p75, p95]  height = inches, weight = lbs
const GROWTH_REF = {
  height: {
    M: [
      [0,18.5,19.2,19.7,20.3,21.0],[3,22.7,23.4,24.1,24.8,25.7],
      [6,25.1,25.9,26.7,27.4,28.2],[9,27.0,27.8,28.6,29.5,30.3],
      [12,28.5,29.3,30.2,31.0,32.0],[18,31.0,32.0,32.9,33.8,34.9],
      [24,33.0,34.0,35.1,36.1,37.4],[30,34.9,36.0,37.0,38.0,39.2],
      [36,36.5,37.6,38.6,39.6,40.8],[48,39.1,40.3,41.5,42.6,44.0],
      [60,41.7,43.0,44.1,45.4,46.9],[72,43.9,45.4,46.7,48.1,49.7],
      [84,46.2,47.8,49.2,50.6,52.2],[96,48.3,50.0,51.5,53.0,54.8],
      [108,50.3,52.0,53.6,55.2,57.2],[120,52.2,54.1,55.7,57.5,59.7],
    ],
    F: [
      [0,18.3,18.9,19.4,20.0,20.7],[3,22.1,22.8,23.5,24.2,25.1],
      [6,24.7,25.5,26.2,27.0,27.9],[9,26.6,27.4,28.2,29.0,30.0],
      [12,28.2,29.0,29.9,30.8,31.8],[18,30.7,31.7,32.6,33.6,34.7],
      [24,32.8,33.8,34.8,35.8,37.0],[30,34.6,35.7,36.7,37.8,39.0],
      [36,36.1,37.3,38.3,39.4,40.7],[48,38.8,40.1,41.2,42.4,43.9],
      [60,41.4,42.8,44.0,45.3,46.9],[72,43.9,45.3,46.5,47.8,49.4],
      [84,46.2,47.6,48.9,50.3,52.1],[96,48.3,49.8,51.2,52.7,54.6],
      [108,50.3,52.0,53.5,55.3,57.5],[120,52.4,54.3,56.0,58.0,60.5],
    ],
  },
  weight: {
    M: [
      [0,5.5,6.4,7.3,8.3,9.7],[3,11.0,12.8,14.1,15.6,17.5],
      [6,14.3,16.1,17.6,19.3,21.5],[9,16.2,18.1,19.8,21.8,24.3],
      [12,18.0,20.1,22.0,24.2,27.0],[18,21.0,23.5,25.7,28.3,31.5],
      [24,23.5,26.2,28.7,31.7,35.5],[30,25.8,28.9,31.7,35.1,39.5],
      [36,27.7,31.1,34.2,37.9,42.8],[48,31.3,35.4,39.1,43.7,50.0],
      [60,34.6,39.4,44.0,49.6,57.7],[72,38.2,43.7,49.5,56.7,67.3],
      [84,41.9,48.7,55.9,65.1,79.2],[96,46.1,54.3,63.2,75.0,94.1],
      [108,50.9,61.0,72.1,87.2,111.8],[120,56.2,68.5,82.0,100.8,131.5],
    ],
    F: [
      [0,5.4,6.2,7.3,8.3,9.6],[3,10.4,12.1,13.4,15.0,17.0],
      [6,13.2,15.0,16.5,18.3,20.7],[9,15.1,17.0,18.8,21.0,23.8],
      [12,16.9,19.1,21.2,23.7,27.0],[18,19.6,22.2,24.7,27.7,31.7],
      [24,22.3,25.1,28.0,31.6,36.6],[30,24.7,28.0,31.3,35.5,41.5],
      [36,26.6,30.2,33.9,38.6,45.5],[48,30.3,34.7,39.4,45.3,54.0],
      [60,33.5,38.8,44.5,51.8,62.8],[72,36.7,43.2,50.4,59.8,74.2],
      [84,40.3,48.2,57.5,69.5,88.4],[96,44.2,53.8,65.5,80.9,105.5],
      [108,48.8,60.4,75.0,94.5,125.7],[120,54.1,68.3,86.0,110.5,148.1],
    ],
  },
};

function lerpRef(table, ageMo) {
  if (ageMo <= table[0][0]) return table[0].slice(1);
  if (ageMo >= table[table.length - 1][0]) return table[table.length - 1].slice(1);
  let i = 0;
  while (i < table.length - 1 && table[i + 1][0] < ageMo) i++;
  const t = (ageMo - table[i][0]) / (table[i + 1][0] - table[i][0]);
  return table[i].slice(1).map((v, j) => v + (table[i + 1][j + 1] - v) * t);
}

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

function videoThumbUrl(videoUrl) {
  if (!videoUrl || !videoUrl.startsWith('http')) return null;
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

  ctx.fillStyle = '#E8F0E4';
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

  ctxRoundRect(ctx, 0, cardTop, W, H - cardTop + 20, 44, '#F8FAF6');

  let y = cardTop + 80;

  if (!hasPhoto) {
    ctx.font = '400 140px "Source Serif 4"';
    ctx.fillStyle = '#CCDAC8';
    ctx.textAlign = 'right';
    ctx.fillText('“', W - PAD + 10, cardTop + 118);
    ctx.textAlign = 'left';
  }

  const name = buildSalutation(entry, allKids);
  ctx.font = 'italic 400 38px "Source Serif 4"';
  ctx.fillStyle = '#4A5E50';
  ctx.fillText(`Dear ${name},`, PAD, y);
  y += 60;

  const cleanText = entry.text.replace(/^dear\s+[\w\s,&]+[,.]?\s*/i, '').trim();
  ctx.font = 'italic 400 42px "Source Serif 4"';
  ctx.fillStyle = '#2C3828';
  const maxLines = hasPhoto ? 7 : 10;
  const bodyLines = ctxWrapText(ctx, cleanText, W - PAD * 2);
  bodyLines.slice(0, maxLines).forEach(line => { ctx.fillText(line, PAD, y); y += 64; });
  if (bodyLines.length > maxLines) {
    ctx.fillStyle = '#9AA89C'; ctx.fillText('…', PAD, y); y += 64;
  }
  y += 12;

  if (entry.signedAs) {
    ctx.font = 'italic 400 36px "Source Serif 4"';
    ctx.fillStyle = '#4A5E50';
    ctx.fillText(`Love, ${entry.signedAs}`, PAD, y);
    y += 52;
  }

  y += 28;
  ctx.fillStyle = '#CCDAC8';
  ctx.fillRect(PAD, y, W - PAD * 2, 1.5);
  y += 36;

  const dateStr = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  ctx.font = '600 28px Inter';
  ctx.fillStyle = '#4A5E50';
  ctx.fillText(dateStr, PAD, y);
  const ICON_SIZE = 36, ICON_GAP = 10;
  ctx.font = '600 28px Inter';
  ctx.fillStyle = '#C8993E';
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

function compressImage(file, maxDim = 1600, quality = 0.78) {
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

function avgTable(tM, tF) {
  return tM.map((rowM, i) => [rowM[0], ...rowM.slice(1).map((v, j) => (v + tF[i][j + 1]) / 2)]);
}

function ageInMonthsAt(birthdate, date) {
  const b = new Date(birthdate + 'T12:00:00');
  const d = new Date(date + 'T12:00:00');
  return Math.max(0, (d.getFullYear() - b.getFullYear()) * 12 + (d.getMonth() - b.getMonth()) + (d.getDate() - b.getDate()) / 30.5);
}

function fmtHeight(inches) {
  if (!inches) return '—';
  const ft = Math.floor(inches / 12);
  const remIn = inches % 12;
  const remStr = Number.isInteger(remIn) ? String(remIn) : remIn.toFixed(1);
  return ft > 0 ? `${ft}′ ${remStr}″` : `${remStr}″`;
}

function fmtWeight(lbs) {
  if (!lbs) return '—';
  const lb = Math.floor(lbs);
  const oz = Math.round((lbs - lb) * 16);
  if (lbs < 25 && oz > 0) return `${lb} lb ${oz} oz`;
  return `${lbs % 1 === 0 ? lb : lbs.toFixed(1)} lb`;
}
const PROD_APP_URL = 'https://patina-react.vercel.app';

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

function KidThumb({ kid, size = 24 }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [kid.avatar]);
  if (kid.avatar && !broken) {
    return (
      <span className="thumb" style={{ width: size, height: size }}>
        <img src={kid.avatar} alt={kid.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setBroken(true)} />
      </span>
    );
  }
  return (
    <span
      className="thumb"
      style={{ width: size, height: size, background: kid.accent, color: '#fff', fontSize: Math.round(size * 0.42) }}
    >
      {kid.name[0]}
    </span>
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
      style={active ? { background: kid ? kid.accent : '#4A5E50' } : {}}
      onClick={onClick}
    >
      {kid ? <KidThumb kid={kid} /> : <span className="thumb"><i className={`ti ${icon}`} style={{ fontSize: 11 }} /></span>}
      {label ?? kid?.name}
    </div>
  );
}

function AuthorChip({ member, onClick }) {
  return (
    <div className="kid-chip" onClick={onClick} style={{ cursor: 'pointer' }}>
      <span className="thumb" style={member.avatar_url ? {} : { background: '#EBF2E8', color: '#4A5E50', fontSize: 10, fontWeight: 700 }}>
        {member.avatar_url
          ? <img src={member.avatar_url} alt="" />
          : member.display_name?.charAt(0)?.toUpperCase() || '?'}
      </span>
      {member.display_name?.split(' ')[0] || 'Me'}
    </div>
  );
}

function KidSelector({ kids, selected, onSelect, onManage, showBoth, partner, onPartner, self, onSelf }) {
  return (
    <div className="scrollx">
      <KidChip active={selected === null} onClick={() => onSelect(null)} icon="ti-layout-list" label="All" />
      {showBoth && kids.length >= 2 && (
        <KidChip active={selected === 'both'} onClick={() => onSelect('both')} icon="ti-users" label="Both" />
      )}
      {kids.map(k => (
        <KidChip key={k.id} kid={k} active={selected === k.id} onClick={() => onSelect(k.id)} />
      ))}
      {self && <AuthorChip member={self} onClick={onSelf} />}
      {partner && <AuthorChip member={partner} onClick={onPartner} />}
      {onManage && <KidChip icon="ti-home-heart" label="Family" onClick={onManage} />}
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
  const debounceRef = useRef(null);
  const blurRef = useRef(null);

  function handleChange(e) {
    const q = e.target.value;
    onChange(q);
    onChangeCoords?.(null, null);
    clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': import.meta.env.VITE_GOOGLE_PLACES_KEY,
          },
          body: JSON.stringify({ input: q }),
        });
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
    if (!s.placeId || !onChangeCoords) return;
    try {
      const res = await fetch(`https://places.googleapis.com/v1/places/${s.placeId}?fields=location`, {
        headers: { 'X-Goog-Api-Key': import.meta.env.VITE_GOOGLE_PLACES_KEY },
      });
      const data = await res.json();
      if (data.location) onChangeCoords(data.location.latitude, data.location.longitude);
    } catch {}
  }

  const hasSuggestions = suggestions.length > 0;

  if (compact) {
    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#EEF2EA', borderRadius: hasSuggestions ? '8px 8px 0 0' : 8, padding: '5px 10px' }}>
          <i className="ti ti-map-pin" style={{ fontSize: 12, color: '#5C6B5E', flexShrink: 0 }} />
          <input
            autoFocus={autoFocus}
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12, color: '#5C6B5E', fontFamily: "'Inter', sans-serif", fontWeight: 500, width: value ? Math.max(80, Math.min(value.length * 7.5, 200)) : 90 }}
            onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Enter') setSuggestions([]); }}
            onBlur={() => { blurRef.current = setTimeout(() => setSuggestions([]), 150); }}
            onFocus={() => clearTimeout(blurRef.current)}
          />
          {value && <button onMouseDown={e => e.preventDefault()} onClick={() => { onChange(''); setSuggestions([]); onChangeCoords?.(null, null); }} style={{ background: 'none', border: 'none', color: '#9AA89C', cursor: 'pointer', padding: 0, display: 'flex' }}><i className="ti ti-x" style={{ fontSize: 11 }} /></button>}
        </div>
        {hasSuggestions && (
          <div style={{ position: 'absolute', top: '100%', left: 0, background: '#fff', border: '1px solid #CCDAC8', borderRadius: '0 8px 8px 8px', overflow: 'hidden', zIndex: 50, boxShadow: '0 4px 16px rgba(44,56,40,0.12)', minWidth: 220 }}>
            {suggestions.map((s, i) => (
              <div key={i} onMouseDown={e => { e.preventDefault(); pick(s); }} style={{ padding: '10px 12px', fontSize: 13, color: '#2C3828', cursor: 'pointer', borderBottom: i < suggestions.length - 1 ? '1px solid #F0F4EE' : 'none', display: 'flex', alignItems: 'center', gap: 7 }}>
                <i className="ti ti-map-pin" style={{ fontSize: 12, color: '#9AA89C', flexShrink: 0 }} />
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #CCDAC8', borderRadius: hasSuggestions && inline ? '10px 10px 0 0' : 10, padding: '11px 14px' }}>
        <i className="ti ti-map-pin" style={{ color: '#9AA89C', fontSize: 15, flexShrink: 0 }} />
        <input
          autoFocus={autoFocus}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          style={{ border: 'none', outline: 'none', flex: 1, fontSize: 15, background: 'transparent', color: '#2C3828', fontFamily: 'Inter, sans-serif' }}
          onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Enter') setSuggestions([]); }}
          onBlur={() => { blurRef.current = setTimeout(() => setSuggestions([]), 150); }}
          onFocus={() => clearTimeout(blurRef.current)}
        />
        {value ? <button onMouseDown={e => e.preventDefault()} onClick={() => { onChange(''); setSuggestions([]); onChangeCoords?.(null, null); }} style={{ background: 'none', border: 'none', color: '#9AA89C', cursor: 'pointer', padding: 0 }}><i className="ti ti-x" style={{ fontSize: 14 }} /></button> : null}
      </div>
      {hasSuggestions && (
        <div style={inline ? {
          border: '1px solid #CCDAC8', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden', background: '#fff',
        } : {
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid #CCDAC8', borderRadius: 10, overflow: 'hidden', zIndex: 50, boxShadow: '0 4px 16px rgba(44,56,40,0.12)', maxHeight: 200, overflowY: 'auto',
        }}>
          {suggestions.map((s, i) => (
            <div key={i} onMouseDown={e => { e.preventDefault(); pick(s); }} style={{ padding: '12px 14px', fontSize: 14, color: '#2C3828', cursor: 'pointer', borderBottom: i < suggestions.length - 1 ? '1px solid #F0F4EE' : 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-map-pin" style={{ fontSize: 13, color: '#9AA89C', flexShrink: 0 }} />
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
        <button onClick={handleSave} style={{ flex: 1, padding: '13px', background: '#4A5E50', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
          Done
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

function LetterCard({ entry, kid, allKids, featured, onClick, cropY = 50, onCropEdit }) {
  const cardH = featured ? 200 : 150;
  const photoRef = useRef(null);
  const cleanText = entry.text.replace(/^dear\s+[\w\s,&]+[,.]?\s*/i, '').trim();
  const preview = cleanText.length > (featured ? 160 : 110)
    ? cleanText.slice(0, featured ? 160 : 110) + '…'
    : cleanText;
  const dateLabel = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div onClick={onClick} style={{ background: '#F8FAF6', border: '1px solid #C4D8C0', borderRadius: 16, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 2px 8px rgba(44,56,40,0.08)' }}>
      {entry.media && entry.media.length > 0 && (
        <div
          ref={photoRef}
          onClick={e => { e.stopPropagation(); onCropEdit && onCropEdit(entry.id, cardH, photoRef.current?.offsetWidth); }}
          style={{ position: 'relative', height: cardH, overflow: 'hidden', cursor: onCropEdit ? 'move' : 'pointer' }}
        >
          {entry.media[0].type === 'video' ? (
            <div style={{ width: '100%', height: '100%', position: 'relative', background: '#1a1a1a' }}>
              <img src={videoThumbUrl(entry.media[0].url)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `center ${cropY}%`, display: 'block' }} alt="" onError={e => { e.target.style.display = 'none'; }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ti ti-player-play-filled" style={{ color: '#fff', fontSize: 16 }} />
                </div>
              </div>
            </div>
          ) : <img src={entry.media[0].url} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `center ${cropY}%`, display: 'block' }} alt="" />
          }
        </div>
      )}
      <div style={{ padding: '16px 18px 14px' }}>
        <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 12, color: '#9AA89C', margin: '0 0 7px' }}>
          Dear {allKids ? buildSalutation(entry, allKids) : kid.name},
        </p>
        {preview && (
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: featured ? 16 : 14, color: '#2C3828', margin: '0 0 8px', lineHeight: 1.65 }}>
            {preview}
          </p>
        )}
        {entry.signedAs && (
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 12, color: '#9AA89C', margin: '0 0 10px' }}>
            Love, {entry.signedAs}
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(allKids ? entry.kids.map(id => allKids.find(k => k.id === id)).filter(Boolean) : [kid]).map(k => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <KidThumb kid={k} size={18} />
              <span style={{ fontSize: 11, color: '#9AA89C' }}>
                {exactAgeLabel(k.birthdate, entry.date)} · {dateLabel}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OnThisDayCard({ entry, kid, allKids, yearsAgo, onClick, cropY = 50, onCropEdit }) {
  const cardH = 250;
  const photoRef = useRef(null);
  const preview = entry.text.length > 200 ? entry.text.slice(0, 200) + '…' : entry.text;
  const yearLabel = yearsAgo === 1 ? 'One year ago today' : `${yearsAgo} years ago today`;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1, height: 1, background: '#CCDAC8' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: '#9AA89C', letterSpacing: 0.8, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{yearLabel}</span>
        <div style={{ flex: 1, height: 1, background: '#CCDAC8' }} />
      </div>
      <div onClick={onClick} style={{ background: '#F8FAF6', border: '1px solid #C4D8C0', borderRadius: 16, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 2px 8px rgba(44,56,40,0.08)' }}>
        {entry.media && entry.media.length > 0 && (
          <div
            ref={photoRef}
            onClick={e => { e.stopPropagation(); onCropEdit && onCropEdit(entry.id, cardH, photoRef.current?.offsetWidth); }}
            style={{ position: 'relative', height: cardH, overflow: 'hidden', cursor: onCropEdit ? 'move' : 'pointer' }}
          >
            {entry.media[0].type === 'video' ? (
              <div style={{ width: '100%', height: '100%', position: 'relative', background: '#1a1a1a' }}>
                <img src={videoThumbUrl(entry.media[0].url)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `center ${cropY}%`, display: 'block' }} alt="" onError={e => { e.target.style.display = 'none'; }} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="ti ti-player-play-filled" style={{ color: '#fff', fontSize: 18 }} />
                  </div>
                </div>
              </div>
            ) : <img src={entry.media[0].url} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `center ${cropY}%`, display: 'block' }} alt="" />
            }
          </div>
        )}
        <div style={{ padding: '20px 20px 18px' }}>
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 13, color: '#9AA89C', margin: '0 0 10px' }}>
            Dear {allKids ? buildSalutation(entry, allKids) : kid.name},
          </p>
          {preview && (
            <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 17, color: '#2C3828', margin: '0 0 16px', lineHeight: 1.75 }}>
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
                  <span style={{ fontSize: 12, color: '#9AA89C' }}>{k.name} was {exactAgeLabel(k.birthdate, entry.date)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionDivider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 1, background: '#CCDAC8' }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: '#9AA89C', letterSpacing: 0.8, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: '#CCDAC8' }} />
    </div>
  );
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function daysUntilBirthday(birthdate) {
  const [, bm, bd] = birthdate.split('-').map(Number);
  const [ty, tm, td] = TODAY.split('-').map(Number);
  const today = new Date(ty, tm - 1, td);
  let next = new Date(ty, bm - 1, bd);
  if (next < today) next = new Date(ty + 1, bm - 1, bd);
  return Math.round((next - today) / 86400000);
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
  const slot = Math.floor(d.getHours() / 6) * 6;
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

function HomeScreen({ entries, kids, onOpenEntry, onSearch, onManage, kidFilter, setKidFilter, onAddMoment, onSeeAll, onCompare, onUpdateCrop, unseenPartnerIds = [], familyMembers = [], currentUserId, onSeePartnerLetters, partner, self, onSeeMyLetters }) {
  const [currentDate, setCurrentDate] = useState(todayString);
  const [currentSlot, setCurrentSlot] = useState(slotString);

  useEffect(() => {
    function scheduleRefresh() {
      const now = new Date();
      const nextSlotHour = (Math.floor(now.getHours() / 6) + 1) * 6;
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

  const [cropPositions, setCropPositions] = useState(() => {
    try { return JSON.parse(localStorage.getItem('patina-crop-positions') || '{}'); } catch { return {}; }
  });
  const [cropModal, setCropModal] = useState(null); // { entryId, url, cardH }

  function openCropModal(entryId, cardH, cardW) {
    const entry = entries.find(e => e.id === entryId);
    if (!entry?.media?.[0]?.url) return;
    setCropModal({ entryId, url: entry.media[0].url, mediaType: entry.media[0].type, cardH, cardW });
  }

  function saveCropY(y) {
    const next = { ...cropPositions, [cropModal.entryId]: y };
    setCropPositions(next);
    try { localStorage.setItem('patina-crop-positions', JSON.stringify(next)); } catch {}
    onUpdateCrop?.(cropModal.entryId, y);
    setCropModal(null);
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

  const recentlyAdded = useMemo(() => entries
    .filter(e => kidFilter === null || (kidFilter === 'both' ? e.kids.length >= 2 : e.kids.includes(kidFilter)))
    .sort((a, b) => {
      const aTime = entryAddedTime(a);
      const bTime = entryAddedTime(b);
      return bTime - aTime;
    })
    .slice(0, 2),
  [entries, kidFilter]);

  const kidMap = useMemo(() => new Map(kids.map(k => [k.id, k])), [kids]);

  const letterCounts = useMemo(() => {
    const countMap = new Map(kids.map(k => [k.id, 0]));
    for (const e of entries) for (const id of e.kids) if (countMap.has(id)) countMap.set(id, countMap.get(id) + 1);
    return kids.map(k => ({ kid: k, count: countMap.get(k.id) ?? 0 }));
  }, [kids, entries]);

  const birthdayToday = useMemo(() => kids.filter(k => daysUntilBirthday(k.birthdate) === 0), [kids]);
  const birthdayNextWeek = useMemo(() => kids.filter(k => daysUntilBirthday(k.birthdate) === 7), [kids]);

  const onceUponATime = useMemo(() => {
    if (onThisDay.length > 0) return null;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 180);
    const pool = entries.filter(e => new Date(e.date + 'T12:00:00') < cutoff);
    if (pool.length === 0) return null;
    const daySeed = parseInt(currentSlot.replace(/-/g, ''));
    const score = (id) => {
      const s = String(id).replace(/-/g, '');
      let h = daySeed;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff;
      return h;
    };
    return pool.reduce((best, e) => score(e.id) > score(best.id) ? e : best);
  }, [entries, onThisDay, currentSlot]);

  const Header = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <p style={{ fontSize: 12, color: '#9AA89C', margin: '0 0 6px' }}>{todayLabel}</p>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: '#2C3828', margin: 0, fontWeight: 700 }}>Patina</h1>
      </div>
      <button className="icon-btn" onClick={onSearch}><i className="ti ti-search" /></button>
    </div>
  );

  if (entries.length === 0) {
    const onlyChild = kids.length === 1 ? kids[0].name.split(' ')[0] : null;
    const emptyGreeting = onlyChild ? `Dear ${onlyChild},` : 'To my children,';
    return (
      <div className="screen">
        <div className="scroll-area" style={{ overflowY: 'hidden' }}>
          <div style={{ padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 28 }}>
            {Header()}
            <KidSelector kids={kids} selected={kidFilter} onSelect={setKidFilter} onManage={onManage} self={self} onSelf={onSeeMyLetters} partner={partner} onPartner={onSeePartnerLetters} />
            <div
              onClick={onAddMoment}
              style={{ background: '#F8FAF6', border: '1px solid #C4D8C0', borderRadius: 16, padding: '24px 22px 28px', cursor: 'pointer' }}
            >
              <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 19, color: '#4A5E50', margin: '0 0 22px' }}>
                {emptyGreeting}
              </p>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{ height: 28, borderBottom: '1px solid #D4E4D0' }} />
              ))}
              <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 14, color: '#9AA89C', margin: '20px 0 0', lineHeight: 1.65 }}>
                {onlyChild ? `Write something you want ${onlyChild} to know...` : 'Write something you want them to know...'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="scroll-area">
        <div style={{ padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Header />

          {(kids.length > 1 || partner || self) && (
            <KidSelector kids={kids} selected={kidFilter} onSelect={setKidFilter} onManage={onManage} self={self} onSelf={onSeeMyLetters} partner={partner} onPartner={onSeePartnerLetters} />
          )}

          {unseenPartnerIds.length > 0 && (() => {
            const partner = familyMembers.find(m => m.user_id !== currentUserId);
            const name = partner?.display_name || 'Your partner';
            const count = unseenPartnerIds.length;
            return (
              <div style={{ background: '#EEF5EB', border: '1px solid #C4D8C0', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className="ti ti-sparkles" style={{ color: '#C8993E', fontSize: 17, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, color: '#4A5E50', fontWeight: 500 }}>
                  {name} added {count === 1 ? 'a new letter' : `${count} new letters`}
                </span>
                <button
                  onClick={() => onSeePartnerLetters?.()}
                  style={{ background: '#4A5E50', border: 'none', borderRadius: 8, padding: '5px 10px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', flexShrink: 0 }}
                >
                  See all
                </button>
              </div>
            );
          })()}

          {birthdayToday.map(k => (
            <div key={k.id} style={{ background: '#4A5E50', borderRadius: 16, padding: '22px 20px', textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <i className="ti ti-cake" style={{ fontSize: 24, color: '#C8993E' }} />
              </div>
              <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>
                Happy Birthday, {k.name}!
              </p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', margin: 0 }}>
                {k.name} turns {ordinal(turningAge(k.birthdate))} today
              </p>
            </div>
          ))}

          {birthdayNextWeek.map(k => (
            <div key={k.id} style={{ background: '#EDE8DE', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(200,153,62,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="ti ti-cake" style={{ fontSize: 20, color: '#C8993E' }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#4A5E50', margin: '0 0 2px' }}>
                  {k.name}'s {ordinal(turningAge(k.birthdate))} birthday is in one week
                </p>
                <p style={{ fontSize: 12, color: '#9AA89C', margin: 0 }}>
                  Write something special for the occasion
                </p>
              </div>
            </div>
          ))}

          {onThisDay.length > 0 && (() => {
            const entry = onThisDay[0];
            const kid = kidMap.get(entry.kids[0]);
            const yearsAgo = todayYear - parseInt(entry.date.slice(0, 4));
            return <OnThisDayCard entry={entry} kid={kid} allKids={kids} yearsAgo={yearsAgo} onClick={() => onOpenEntry(entry)} cropY={cropPositions[entry.id] ?? entry.cropY ?? 50} onCropEdit={openCropModal} />;
          })()}

          {onceUponATime && (() => {
            const entry = onceUponATime;
            const kid = kidMap.get(entry.kids[0]);
            return (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ flex: 1, height: 1, background: '#CCDAC8' }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#9AA89C', letterSpacing: 0.8, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Once upon a time</span>
                  <div style={{ flex: 1, height: 1, background: '#CCDAC8' }} />
                </div>
                <LetterCard entry={entry} kid={kid} allKids={kids} featured={true} onClick={() => onOpenEntry(entry)} cropY={cropPositions[entry.id] ?? entry.cropY ?? 50} onCropEdit={openCropModal} />
              </div>
            );
          })()}

          {recent.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SectionDivider label="Recent letters" />
              {recent.map(entry => {
                const kid = kidMap.get(entry.kids[0]);
                return <LetterCard key={entry.id} entry={entry} kid={kid} allKids={kids} featured={true} onClick={() => onOpenEntry(entry)} cropY={cropPositions[entry.id] ?? entry.cropY ?? 50} onCropEdit={openCropModal} />;
              })}
              {entries.length > 3 && (
                <button onClick={onSeeAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#7A8C78', fontFamily: "'Inter', sans-serif", fontWeight: 600, padding: '4px 0', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
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
                return <LetterCard key={entry.id} entry={entry} kid={kid} allKids={kids} featured={true} onClick={() => onOpenEntry(entry)} cropY={cropPositions[entry.id] ?? entry.cropY ?? 50} onCropEdit={openCropModal} />;
              })}
            </div>
          )}

          <div style={{ background: '#EEF2EA', borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {letterCounts.map(({ kid, count }) => (
              <div key={kid.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <KidThumb kid={kid} size={26} />
                <p style={{ fontSize: 14, color: '#2C3828', margin: 0, lineHeight: 1.3 }}>
                  <strong>{count}</strong>
                  <span style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', color: '#7A8C78' }}> letter{count !== 1 ? 's' : ''} to {kid.name}</span>
                </p>
              </div>
            ))}
          </div>

          {kids.length > 1 && onCompare && (
            <button onClick={onCompare} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '14px 18px', background: '#EBF2E8', border: 'none', borderRadius: 14, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#4A5E50' }}>At the same age</span>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#4A5E50', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="ti ti-arrow-right" style={{ fontSize: 13, color: '#fff' }} />
              </div>
            </button>
          )}

        </div>
      </div>
      {cropModal && (
        <BookCropModal
          url={cropModal.url}
          mediaType={cropModal.mediaType}
          cropY={cropPositions[cropModal.entryId] ?? 50}
          cardHeight={cropModal.cardH}
          photoWidth={cropModal.cardW}
          onSave={saveCropY}
          onClose={() => setCropModal(null)}
        />
      )}
    </div>
  );
}

// ─── Journal timeline ────────────────────────────────────────────────────

const JournalEntryRow = memo(function JournalEntryRow({ entry, entryKids, onOpen }) {
  const m = entry.milestone ? milestoneInfo(entry.milestone) : null;
  const d = new Date(entry.date + 'T12:00:00');
  const dayNum = d.getDate();
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const rawText = entry.text.replace(/^dear\s+[\w\s,&]+[,.]?\s*/i, '').trim();
  const text = rawText.length > 160 ? rawText.slice(0, 160) + '...' : rawText;
  const nameLabel = entryKids.map(k => k.name.split(' ')[0]).join(' & ');

  return (
    <div className={`journal-entry${m ? ' milestone-entry' : ''}`} onClick={() => onOpen(entry)}>
      <span className="day-quote-mark">"</span>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ textAlign: 'center', flexShrink: 0, width: 40 }}>
          <p style={{ fontSize: 22, fontWeight: 700, color: '#2C3828', margin: 0, lineHeight: 1, fontFamily: "'Playfair Display', serif" }}>{dayNum}</p>
          <p style={{ fontSize: 10, color: '#9AA89C', margin: '2px 0 0', fontWeight: 600, textTransform: 'uppercase' }}>{weekday}</p>
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
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4A5E50' }}>{nameLabel}</span>
            {entryKids.length === 1 && <span style={{ fontSize: 11, color: '#9AA89C' }}>· {exactAgeLabel(entryKids[0].birthdate, entry.date)}</span>}
            <div style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              {entry.favorited && <i className="ti ti-heart-filled" style={{ fontSize: 11, color: '#C8993E' }} />}
              {m && <span style={{ fontSize: 10, fontWeight: 700, color: '#C8993E' }}>{m.label}</span>}
            </div>
          </div>
          <p style={{ fontSize: 15, color: '#3A3020', lineHeight: 1.65, margin: 0, fontFamily: "'Source Serif 4', serif", fontStyle: text ? 'italic' : 'normal' }}>{text}</p>
          {entry.media && entry.media.length > 0 && (
            <div className="journal-thumb-strip">
              {entry.media.slice(0, 4).map((mm, i) => (
                <div key={i} className="journal-thumb" style={{ position: 'relative' }}>
                  {mm.type === 'video'
                    ? <video src={mm.url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: 8 }} preload="metadata" muted playsInline />
                    : <img src={mm.url} loading="lazy" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: 8 }} />
                  }
                  {mm.type === 'video' && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="ti ti-player-play" style={{ fontSize: 12, color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} /></div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function JournalScreen({ entries, kids, onOpenEntry, onNewEntry, kidFilter, setKidFilter, memberCount, scrollPos }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = scrollPos?.current ?? 0;
    const onScroll = () => { if (scrollPos) scrollPos.current = el.scrollTop; };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const rows = useMemo(() => {
    const filtered = entries
      .filter(e => kidFilter === null || (kidFilter === 'both' ? e.kids.length >= 2 : e.kids.includes(kidFilter)))
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
            <span style={{ fontSize: 12, fontWeight: 700, color: '#9AA89C', letterSpacing: 0.3 }}>{monthLabel.toUpperCase()}</span>
            <div className="month-divider-line" />
          </div>
        );
      }
      const entryKids = entry.kids.map(id => kids.find(k => k.id === id)).filter(Boolean);
      result.push(<JournalEntryRow key={entry.id} entry={entry} entryKids={entryKids} onOpen={onOpenEntry} />);
    });
    return result;
  }, [entries, kids, kidFilter, onOpenEntry]);

  return (
    <div className="screen">
      <div className="scroll-area" ref={scrollRef}>
        <div className="scrollpad" style={{ paddingBottom: 6 }}>
          <div>
            <p style={{ fontSize: 12, color: '#9AA89C', margin: 0 }}>Patina</p>
            <h1 style={{ fontSize: 23, color: '#4A5E50', margin: '4px 0 0', fontWeight: 700 }}>{memberCount > 1 ? 'From us, with love' : 'From you, with love'}</h1>
          </div>
          <KidSelector kids={kids} selected={kidFilter} onSelect={setKidFilter} showBoth />
        </div>
        <div className="scrollpad" style={{ paddingTop: 0 }}>
          {rows.length === 0 ? (
            <div className="empty-state">
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F5EFE3', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <i className="ti ti-notebook" style={{ fontSize: 24, color: '#9AA89C' }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#4A5E50', margin: '0 0 6px' }}>Nothing written yet</p>
              <p style={{ fontSize: 13, color: '#9AA89C', margin: '0 0 20px', maxWidth: 240, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
                Your first journal entry will show up here. Big moment or small one — they all count.
              </p>
              <button className="btn btn-primary" style={{ width: 'auto', padding: '11px 22px', margin: '0 auto' }} onClick={onNewEntry}>
                Write your first entry
              </button>
            </div>
          ) : rows}
        </div>
      </div>
    </div>
  );
}

// ─── Entry detail ────────────────────────────────────────────────────────

function EntryDetailScreen({ entry, kid, allKids, onBack, onEdit, onToggleFavorite, onDelete, onUpdateCrop, onUpdateLocation }) {
  const m = entry.milestone ? milestoneInfo(entry.milestone) : null;
  const media = entry.media || [];
  const [activeSlide, setActiveSlide] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [cropY, setCropY] = useState(entry.cropY ?? 50);
  const [showCrop, setShowCrop] = useState(false);
  const [location, setLocation] = useState(entry.location || '');
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationDraft, setLocationDraft] = useState('');
  const [locationDraftCoords, setLocationDraftCoords] = useState(null);

  async function handleShare() {
    setSharing(true);
    try { await shareEntry(entry, allKids); } catch (e) { if (e?.name !== 'AbortError') console.error(e); }
    setSharing(false);
  }

  return (
    <div className="screen">
      <div className="scroll-area">
        <div style={{ position: 'relative' }}>
          {media.length > 0 ? (
            <>
              <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10, opacity: videoPlaying ? 0 : 1, transition: 'opacity 0.2s', pointerEvents: videoPlaying ? 'none' : 'auto' }}>
                <button className="icon-btn-ghost" onClick={onBack}><i className="ti ti-arrow-left" /></button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="icon-btn-ghost" onClick={() => onToggleFavorite(entry.id)} style={entry.favorited ? { color: '#C8993E' } : {}}><i className={`ti ti-heart${entry.favorited ? '-filled' : ''}`} /></button>
                  <button className="icon-btn-ghost" onClick={handleShare} disabled={sharing}><i className={`ti ${sharing ? 'ti-loader-2' : 'ti-share'}`} style={sharing ? { animation: 'spin 1s linear infinite' } : {}} /></button>
                  <button className="icon-btn-ghost" onClick={() => onEdit(entry)}><i className="ti ti-edit" /></button>
                  <button className="icon-btn-ghost" onClick={() => setShowDeleteConfirm(true)}><i className="ti ti-trash" /></button>
                </div>
              </div>
              <div className="gallery-stage">
                {media.map((item, i) => (
                  <div key={i} className="gallery-slide" style={{ opacity: i === activeSlide ? 1 : 0, backgroundImage: item.type === 'video' ? 'none' : `url('${item.url}')`, backgroundPosition: `center ${cropY}%` }}>
                    {item.type === 'video'
                      ? <video src={item.url} poster={videoThumbUrl(item.url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} preload="metadata" playsInline controls onPlay={() => setVideoPlaying(true)} onPause={() => setVideoPlaying(false)} onEnded={() => setVideoPlaying(false)} />
                      : <div className="video-play-overlay" style={{ display: 'none' }} />
                    }
                  </div>
                ))}
                {onUpdateCrop && media[activeSlide]?.type !== 'video' && (
                  <button
                    onClick={() => setShowCrop(true)}
                    style={{ position: 'absolute', bottom: 12, right: 12, width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 5 }}
                  >
                    <i className="ti ti-crop" style={{ fontSize: 16 }} />
                  </button>
                )}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px 0' }}>
              <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="icon-btn" onClick={() => onToggleFavorite(entry.id)} style={entry.favorited ? { color: '#C8993E', borderColor: '#C8993E' } : {}}><i className={`ti ti-heart${entry.favorited ? '-filled' : ''}`} /></button>
                <button className="icon-btn" onClick={handleShare} disabled={sharing}><i className={`ti ${sharing ? 'ti-loader-2' : 'ti-share'}`} style={sharing ? { animation: 'spin 1s linear infinite' } : {}} /></button>
                <button className="icon-btn" onClick={() => onEdit(entry)}><i className="ti ti-edit" /></button>
                <button className="icon-btn" onClick={() => setShowDeleteConfirm(true)}><i className="ti ti-trash" /></button>
              </div>
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
                <div>
                  <p style={{ fontSize: 16, color: '#4A5E50', margin: 0, fontWeight: 700 }}>{k.name}</p>
                  <p style={{ fontSize: 12, color: '#9AA89C', margin: '2px 0 0' }}>
                    {exactAgeLabel(k.birthdate, entry.date)} old · {new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 17, color: '#4A5E50', lineHeight: 1.8, margin: 0, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic' }}>
            Dear {buildSalutation(entry, allKids)},
          </p>
          <p style={{ fontSize: 17, color: '#2C3828', lineHeight: 1.8, margin: 0, fontFamily: "'Source Serif 4', serif", fontStyle: entry.text ? 'italic' : 'normal', whiteSpace: 'pre-wrap' }}>{entry.text.replace(/^dear\s+[\w\s,&]+[,.]?\s*/i, '').trim()}</p>
          {entry.signedAs && (
            <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 17, color: '#9AA89C', margin: 0, textAlign: 'right' }}>
              Love, {entry.signedAs}
            </p>
          )}
          <div style={{ height: 1, background: '#CCDAC8' }} />
          <div
            onClick={() => { setLocationDraft(location); setLocationDraftCoords(null); setEditingLocation(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}
          >
            <i className="ti ti-map-pin" style={{ fontSize: 13, color: location ? '#9AA89C' : '#C4D4C0' }} />
            <span style={{ fontSize: 13, color: location ? '#9AA89C' : '#C4D4C0' }}>
              {location || 'Add location'}
            </span>
          </div>
          {entry.mood && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 12, color: '#9AA89C' }}>Feeling</span>
              <span className="chip selected" style={{ cursor: 'default' }}>{entry.mood}</span>
            </div>
          )}
        </div>
      </div>
      {showDeleteConfirm && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 11 }} onClick={() => setShowDeleteConfirm(false)}>
          <div style={{ background: '#F8FAF6', borderRadius: '24px 24px 0 0', padding: '28px 24px 36px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#FEF0ED', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <i className="ti ti-trash" style={{ fontSize: 19, color: '#D4856A' }} />
            </div>
            <p style={{ fontSize: 17, fontWeight: 700, color: '#2C3828', margin: '0 0 6px', textAlign: 'center' }}>Delete this entry?</p>
            <p style={{ fontSize: 14, color: '#9AA89C', margin: '0 0 24px', textAlign: 'center' }}>This can't be undone.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="btn" style={{ flex: 1, background: '#D4856A', color: '#fff' }} onClick={() => { setShowDeleteConfirm(false); onDelete(entry.id); }}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {showCrop && media[activeSlide] && (
        <CropModal
          url={media[activeSlide].url}
          cropY={cropY}
          cardHeight={260}
          onSave={newY => { setCropY(newY); onUpdateCrop?.(entry.id, newY); setShowCrop(false); }}
          onClose={() => setShowCrop(false)}
        />
      )}
      {editingLocation && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 20 }} onClick={() => setEditingLocation(false)}>
          <div style={{ background: '#F8FAF6', borderRadius: '24px 24px 0 0', padding: '24px 20px 44px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#2C3828', margin: 0 }}>Location</p>
              <button onClick={() => setEditingLocation(false)} style={{ background: 'none', border: 'none', color: '#9AA89C', cursor: 'pointer', padding: 4 }}><i className="ti ti-x" style={{ fontSize: 18 }} /></button>
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

function NewEntryScreen({ kids, onCancel, onSave, onDelete, existingEntry, signedDefault, draftKey }) {
  const [selectedKids, setSelectedKids] = useState(
    existingEntry ? existingEntry.kids : (kids.length === 1 ? [kids[0].id] : [])
  );
  const [text, setText] = useState(existingEntry?.text || '');
  const [mood, setMood] = useState(existingEntry?.mood || null);
  const existingMilestone = existingEntry?.milestone || null;
  const [milestoneType, setMilestoneType] = useState(
    existingMilestone?.startsWith('custom:') ? 'custom' : existingMilestone
  );
  const [customMilestoneText, setCustomMilestoneText] = useState(
    existingMilestone?.startsWith('custom:') ? existingMilestone.slice(7) : ''
  );
  const [media, setMedia] = useState(existingEntry?.media || []);
  const [fileObjects, setFileObjects] = useState(existingEntry?.media?.map(() => null) || []);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [signedAs, setSignedAs] = useState(existingEntry?.signedAs ?? signedDefault ?? '');
  const [location, setLocation] = useState(existingEntry?.location || '');
  const [locationCoords, setLocationCoords] = useState(existingEntry?.locationLat != null ? { lat: existingEntry.locationLat, lng: existingEntry.locationLng } : null);
  const [locationFromPhoto, setLocationFromPhoto] = useState(false);
  const [previewMedia, setPreviewMedia] = useState(null);
  const [entryDate, setEntryDate] = useState(existingEntry?.date || TODAY);
  const [dateFromPhoto, setDateFromPhoto] = useState(false);
  const [showExtras, setShowExtras] = useState(true);
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

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) document.activeElement?.blur(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  const mountedRef = useRef(true);
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
      if (saved.selectedKids?.length) setSelectedKids(saved.selectedKids);
      if (saved.mood) setMood(saved.mood);
      if (saved.milestoneType) setMilestoneType(saved.milestoneType);
      if (saved.customMilestoneText) setCustomMilestoneText(saved.customMilestoneText);
      if (saved.signedAs) setSignedAs(saved.signedAs);
      if (saved.location) setLocation(saved.location);
      if (saved.entryDate) setEntryDate(saved.entryDate);
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
          localStorage.setItem(draftKey, JSON.stringify({ text, selectedKids, mood, milestoneType, customMilestoneText, signedAs, location, entryDate }));
        }
      } catch {}
    }, 800);
    return () => clearTimeout(t);
  }, [text, selectedKids, mood, milestoneType, customMilestoneText, signedAs, location, entryDate]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition is not supported in this browser.'); return; }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results).slice(e.resultIndex).map(r => r[0].transcript).join('');
      setText(prev => prev ? prev + ' ' + transcript : transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  const dateDisplay = new Date(entryDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const salutationName = (() => {
    if (selectedKids.length === 0) return null;
    const names = selectedKids.map(id => kids.find(k => k.id === id)?.name.split(' ')[0]).filter(Boolean);
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
  })();

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
    const files = Array.from(e.target.files);
    const newMedia = await Promise.all(files.map(async file => {
      const isVideo = file.type.startsWith('video');
      const thumbnail = isVideo ? await generateVideoThumbnail(file) : null;
      return { url: URL.createObjectURL(file), type: isVideo ? 'video' : 'image', thumbnail };
    }));
    if (!mountedRef.current) { newMedia.forEach(m => { if (m.url?.startsWith('blob:')) URL.revokeObjectURL(m.url); }); return; }
    setMedia(prev => [...prev, ...newMedia]);
    setFileObjects(prev => [...prev, ...files]);
    e.target.value = '';
    if (!dateFromPhoto) {
      for (const file of files) {
        if (file.type.startsWith('image')) {
          try {
            const tags = await exifr.parse(file, ['DateTimeOriginal']);
            if (tags?.DateTimeOriginal) {
              const d = new Date(tags.DateTimeOriginal);
              setEntryDate(d.toISOString().slice(0, 10));
              setDateFromPhoto(true);
              break;
            }
          } catch {}
        } else if (file.type.startsWith('video') && file.lastModified) {
          const d = new Date(file.lastModified);
          setEntryDate(d.toISOString().slice(0, 10));
          setDateFromPhoto(true);
          break;
        }
      }
    }
    if (!locationFromPhoto) {
      for (const file of files) {
        if (!file.type.startsWith('image')) continue;
        try {
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
      const kidNames = selectedKids
        .map(id => kids.find(k => k.id === id)?.name.split(' ')[0])
        .filter(Boolean).join(' and ');
      const primaryKid = kids.find(k => k.id === selectedKids[0]);
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
    await onSave({
      kids: selectedKids,
      text: text.trim(),
      mood: mood || null,
      milestone: milestoneType === 'custom' ? (customMilestoneText.trim() ? `custom:${customMilestoneText.trim()}` : null) : milestoneType || null,
      media,
      fileObjects,
      date: entryDate,
      entryId: existingEntry?.id,
      signedAs: signedAs.trim() || null,
      location: location.trim() || null,
      locationLat: locationCoords?.lat ?? null,
      locationLng: locationCoords?.lng ?? null,
    });
    setSaving(false);
  }

  const canSave = selectedKids.length > 0 && (text.trim().length > 0 || media.length > 0);

  return (
    <div className="screen" style={{ background: '#F8FAF6', position: 'relative' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', flexShrink: 0, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="icon-btn" onClick={onCancel}><i className="ti ti-x" /></button>
          <div style={{ position: 'relative' }}>
            {showMediaMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setShowMediaMenu(false)} />
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: '#fff', border: '1px solid #CCDAC8', borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', minWidth: 210, zIndex: 10 }}>
                  <button onClick={() => { cameraInputRef.current?.click(); setShowMediaMenu(false); }} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '13px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: '#2C3828', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>
                    <i className="ti ti-camera" style={{ fontSize: 17, color: '#4A5E50' }} />
                    Take a photo
                  </button>
                  <div style={{ height: 1, background: '#CCDAC8' }} />
                  <button onClick={() => { uploadInputRef.current?.click(); setShowMediaMenu(false); }} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '13px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: '#2C3828', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>
                    <i className="ti ti-photo" style={{ fontSize: 17, color: '#4A5E50' }} />
                    Upload from library
                  </button>
                </div>
              </>
            )}
            <button onClick={() => setShowMediaMenu(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', color: showMediaMenu ? '#4A5E50' : '#9AA89C', fontSize: 20, borderRadius: 10 }}>
              <i className="ti ti-camera" />
            </button>
          </div>
          <button onClick={toggleListening} style={{ background: listening ? '#F0897A' : 'none', border: 'none', cursor: 'pointer', width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', color: listening ? '#fff' : '#9AA89C', fontSize: 20, borderRadius: 10 }}>
            <i className={`ti ti-${listening ? 'microphone' : 'microphone'}`} />
          </button>
          <button onClick={() => setShowExtras(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', color: showExtras ? '#4A5E50' : '#9AA89C', fontSize: 20, borderRadius: 10 }}>
            <i className="ti ti-dots" />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {existingEntry && onDelete && (
            <button
              className="icon-btn"
              onClick={() => setShowDeleteConfirm(true)}
              style={{ color: '#D4856A', borderColor: '#F2C4B8' }}
            >
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
          <div style={{ background: '#EEF5EB', border: '1px solid #C4D8C0', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <i className="ti ti-pencil" style={{ color: '#4A5E50', fontSize: 14, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: '#4A5E50', fontWeight: 500 }}>Draft restored</span>
            <button
              onClick={() => {
                try { if (draftKey) localStorage.removeItem(draftKey); } catch {}
                setText('');
                setSelectedKids(kids.length === 1 ? [kids[0].id] : []);
                setMood(null); setMilestoneType(null); setCustomMilestoneText('');
                setSignedAs(signedDefault ?? ''); setLocation(''); setEntryDate(TODAY);
                setDraftRestored(false);
              }}
              style={{ background: 'none', border: 'none', color: '#9AA89C', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: 0, flexShrink: 0 }}
            >
              Discard
            </button>
          </div>
        )}

        {/* For + Date row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          {kids.length === 1 ? (
            <span style={{ fontSize: 15, color: '#9AA89C', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>
              For {salutationName}
            </span>
          ) : (
            <button onClick={() => setShowKidPicker(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 15, color: salutationName ? '#4A5E50' : '#C4D8C0', fontFamily: "'Inter', sans-serif", fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              {salutationName ? `For ${salutationName}` : 'Who is this for?'}
              <i className="ti ti-chevron-down" style={{ fontSize: 13 }} />
            </button>
          )}
          <button onClick={openDateEdit} style={{ background: '#EEF2EA', border: 'none', cursor: 'pointer', fontSize: 12, color: '#5C6B5E', fontFamily: "'Inter', sans-serif", padding: '6px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
            <i className="ti ti-calendar" style={{ fontSize: 13 }} />
            {dateDisplay}
            {dateFromPhoto && <span style={{ fontSize: 10, color: '#9AA89C' }}>· photo</span>}
          </button>
        </div>

        {/* Writing area */}
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="You did the most surprising thing today. I never want you to forget what it felt like to be there…"
          style={{
            width: '100%', border: 'none', outline: 'none', resize: 'none',
            background: 'transparent', fontFamily: "'Source Serif 4', serif",
            fontStyle: 'italic', fontSize: 17, lineHeight: 1.85, color: '#2C3828',
            minHeight: 'calc(60vh - 80px)', padding: 0,
          }}
        />

        {/* AI buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {selectedKids.length > 0 && (
            <button
              onClick={handleGenerate}
              disabled={generating || polishing}
              style={{ background: 'none', border: '1px solid #CCDAC8', borderRadius: 10, padding: '8px 14px', fontSize: 13, color: generating ? '#B8CCB4' : '#4A5E50', fontFamily: "'Inter', sans-serif", fontWeight: 600, cursor: generating ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <i className="ti ti-sparkles" style={{ fontSize: 14, animation: generating ? 'spin 1s linear infinite' : 'none' }} />
              {generating ? 'Writing…' : 'Write for me'}
            </button>
          )}
          {text.trim().length > 0 && (
            <button
              onClick={handlePolish}
              disabled={polishing || generating}
              style={{ background: 'none', border: '1px solid #CCDAC8', borderRadius: 10, padding: '8px 14px', fontSize: 13, color: polishing ? '#B8CCB4' : '#4A5E50', fontFamily: "'Inter', sans-serif", fontWeight: 600, cursor: polishing ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <i className="ti ti-writing" style={{ fontSize: 14, animation: polishing ? 'spin 1s linear infinite' : 'none' }} />
              {polishing ? 'Fixing…' : 'Fix grammar'}
            </button>
          )}
        </div>

        {/* Sign-off */}
        {signedDefault && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16 }}>
            <span style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 17, color: '#9AA89C' }}>Love,</span>
            <input
              value={signedAs}
              onChange={e => setSignedAs(e.target.value)}
              placeholder={signedDefault}
              style={{ border: 'none', outline: 'none', background: 'transparent', fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 17, color: '#4A5E50', width: '100%', padding: 0 }}
            />
          </div>
        )}

        {/* Location row */}
        <div style={{ marginTop: 10 }}>
          <LocationInput value={location} onChange={v => { setLocation(v); if (!v) setLocationCoords(null); }} onChangeCoords={(lat, lng) => setLocationCoords(lat != null ? { lat, lng } : null)} placeholder="Add location" compact />
        </div>

        {/* Photo strip */}
        {media.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            {media.map((item, i) => (
              <div key={i} style={{ width: 76, height: 76, borderRadius: 10, overflow: 'hidden', position: 'relative', flexShrink: 0, cursor: 'pointer' }} onClick={() => setPreviewMedia(item)}>
                {item.type === 'video'
                  ? item.thumbnail
                    ? <img src={item.thumbnail} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : <video src={item.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} preload="metadata" muted playsInline />
                  : <img src={item.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                }
                <button onClick={e => { e.stopPropagation(); const it = media[i]; if (it.url?.startsWith('blob:')) URL.revokeObjectURL(it.url); setMedia(prev => prev.filter((_, idx) => idx !== i)); setFileObjects(prev => prev.filter((_, idx) => idx !== i)); }} style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ti ti-x" />
                </button>
              </div>
            ))}
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
        {showExtras && (
          <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #D4E4D0', display: 'flex', flexDirection: 'column', gap: 24 }}>

            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#9AA89C', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>How are you feeling?</p>
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
                        background: active ? '#4A5E50' : '#fff',
                        border: `1px solid ${active ? '#4A5E50' : '#CCDAC8'}`,
                        borderRadius: 14, padding: '14px 8px 12px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontSize: 24, lineHeight: 1 }}>{emoji}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: active ? '#fff' : '#5C6B5E', letterSpacing: 0.2 }}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#9AA89C', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Mark as milestone?</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {MILESTONE_TYPES.map(mt => {
                  const active = milestoneType === mt.id;
                  return (
                    <div
                      key={mt.id}
                      onClick={() => setMilestoneType(active ? null : mt.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 13,
                        background: active ? '#4A5E50' : '#fff',
                        border: `1px solid ${active ? '#4A5E50' : '#CCDAC8'}`,
                        borderRadius: 13, padding: '13px 16px', cursor: 'pointer',
                      }}
                    >
                      <i className={`ti ${mt.icon}`} style={{ fontSize: 19, color: active ? '#C8993E' : '#9AA89C', flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: active ? '#fff' : '#2C3828', flex: 1 }}>{mt.label}</span>
                      {active && <i className="ti ti-check" style={{ color: '#C8993E', fontSize: 16 }} />}
                    </div>
                  );
                })}
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 13,
                    background: milestoneType === 'custom' ? '#4A5E50' : '#fff',
                    border: `1px solid ${milestoneType === 'custom' ? '#4A5E50' : '#CCDAC8'}`,
                    borderRadius: 13, padding: '13px 16px', cursor: 'pointer',
                  }}
                  onClick={() => setMilestoneType(milestoneType === 'custom' ? null : 'custom')}
                >
                  <i className="ti ti-star" style={{ fontSize: 19, color: milestoneType === 'custom' ? '#C8993E' : '#9AA89C', flexShrink: 0 }} />
                  {milestoneType === 'custom' ? (
                    <input
                      autoFocus
                      value={customMilestoneText}
                      onChange={e => setCustomMilestoneText(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      placeholder="Name this milestone…"
                      style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, fontWeight: 600, color: '#fff', fontFamily: "'Inter', sans-serif" }}
                    />
                  ) : (
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#2C3828', flex: 1 }}>Something else…</span>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Date edit sheet */}
      {editingDate && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '0 16px' }} onClick={() => setEditingDate(false)}>
          <div style={{ background: '#F2F4EC', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#2C3828', margin: '0 0 16px' }}>When did this happen?</p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <div style={{ position: 'relative', flex: 2.2 }}>
                <select value={editMonth} onChange={e => setEditMonth(e.target.value)} style={{ width: '100%', border: '1px solid #CCDAC8', borderRadius: 10, padding: '14px 36px 14px 14px', fontSize: 16, outline: 'none', background: '#fff', color: editMonth ? '#2C3828' : '#9AA89C', fontFamily: "'Inter', sans-serif", appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}>
                  <option value="" disabled>Month</option>
                  {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                    <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                  ))}
                </select>
                <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#9AA89C', fontSize: 13, pointerEvents: 'none' }} />
              </div>
              <input type="number" placeholder="Day" value={editDay} min={1} max={31} onChange={e => setEditDay(e.target.value)} style={{ flex: 1, border: '1px solid #CCDAC8', borderRadius: 10, padding: '14px 10px', fontSize: 16, outline: 'none', background: '#fff', color: '#2C3828', fontFamily: "'Inter', sans-serif", textAlign: 'center' }} />
              <input type="number" placeholder="Year" value={editYear} min={1900} max={2030} onChange={e => setEditYear(e.target.value)} style={{ flex: 1.5, border: '1px solid #CCDAC8', borderRadius: 10, padding: '14px 10px', fontSize: 16, outline: 'none', background: '#fff', color: '#2C3828', fontFamily: "'Inter', sans-serif", textAlign: 'center' }} />
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={applyDate}>Done</button>
          </div>
        </div>
      )}

      {/* Delete confirmation sheet */}
      {showDeleteConfirm && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 11 }} onClick={() => setShowDeleteConfirm(false)}>
          <div style={{ background: '#F8FAF6', borderRadius: '24px 24px 0 0', padding: '28px 24px 36px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#FEF0ED', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <i className="ti ti-trash" style={{ fontSize: 19, color: '#D4856A' }} />
            </div>
            <p style={{ fontSize: 17, fontWeight: 700, color: '#2C3828', margin: '0 0 6px', textAlign: 'center' }}>Delete this entry?</p>
            <p style={{ fontSize: 14, color: '#9AA89C', margin: '0 0 24px', textAlign: 'center' }}>This can't be undone.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="btn" style={{ flex: 1, background: '#D4856A', color: '#fff' }} onClick={() => { setShowDeleteConfirm(false); onDelete(existingEntry.id); }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Kid picker sheet */}
      {showKidPicker && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '0 16px' }} onClick={() => setShowKidPicker(false)}>
          <div style={{ background: '#F2F4EC', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#2C3828', margin: '0 0 16px' }}>Who are you writing to?</p>
            {kids.map(k => {
              const selected = selectedKids.includes(k.id);
              return (
                <div key={k.id} onClick={() => setSelectedKids(prev => selected ? prev.filter(id => id !== k.id) : [...prev, k.id])} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: '1px solid #CCDAC8', cursor: 'pointer' }}>
                  <KidThumb kid={k} size={36} />
                  <span style={{ fontSize: 16, color: '#2C3828', fontWeight: 600 }}>{k.name}</span>
                  <div style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: '50%', border: `2px solid ${selected ? '#4A5E50' : '#CCDAC8'}`, background: selected ? '#4A5E50' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {selected && <i className="ti ti-check" style={{ color: '#fff', fontSize: 12 }} />}
                  </div>
                </div>
              );
            })}
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
      <h2 style={{ fontSize: 23, color: '#4A5E50', margin: 0, fontWeight: 800 }}>Milestone unlocked</h2>
      <p style={{ fontSize: 15, color: '#5C6B5E', margin: 0 }}>
        {kid.name} just hit: <strong style={{ color: '#4A5E50' }}>{m.label}</strong>
      </p>
      <button className="btn btn-primary" style={{ marginTop: 10, width: 'auto', padding: '13px 28px' }} onClick={onDone}>
        See it in the journal
      </button>
    </div>
  );
}

// ─── Recap screen ──────────────────────────────────────────────────────────

function RecapEntryRow({ entry, kids, onOpenEntry }) {
  const entryKids = (entry.kids || []).map(id => kids.find(k => k.id === id)).filter(Boolean);
  if (entryKids.length === 0) return null;
  const m = entry.milestone ? milestoneInfo(entry.milestone) : null;
  const dayLabel = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const snippet = (entry.text || '').slice(0, 120) + (entry.text?.length > 120 ? '…' : '');
  const nameLabel = entryKids.map(k => k.name).join(' & ');
  return (
    <div
      onClick={() => onOpenEntry(entry)}
      className={m ? 'journal-entry milestone-entry' : undefined}
      style={m ? { cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start' } : { cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start', padding: '13px 0', borderBottom: '1px solid #EEF2EA' }}
    >
      <div style={{ display: 'flex', flexShrink: 0 }}>
        {entryKids.map((kid, i) => (
          <div key={kid.id} style={{ marginLeft: i > 0 ? -8 : 0, zIndex: entryKids.length - i, position: 'relative' }}>
            <KidThumb kid={kid} size={30} />
          </div>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: snippet ? 3 : 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#4A5E50' }}>{nameLabel}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
            {entry.favorited && <i className="ti ti-heart-filled" style={{ fontSize: 11, color: '#C8993E' }} />}
            <span style={{ fontSize: 11, color: '#B8CCB4' }}>{dayLabel}</span>
          </div>
        </div>
        {snippet && (
          <p style={{ fontSize: 13, color: '#8A9A8C', margin: 0, lineHeight: 1.5, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {snippet}
          </p>
        )}
        {m && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 5, fontSize: 10, fontWeight: 700, color: '#C8993E' }}>
            {m.label}
          </span>
        )}
      </div>
    </div>
  );
}

function RecapScreen({ entries, kids, onBack, onOpenEntry, onCompare }) {
  const [viewMode, setViewMode] = useState('month');
  const [selectedMonth, setSelectedMonth] = useState(TODAY.slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(TODAY.slice(0, 4));
  const [recapFilter, setRecapFilter] = useState(null);
  const [kidFilter, setKidFilter] = useState(null);

  const segTabStyle = (tab) => ({
    border: 'none', borderRadius: 7, padding: '6px 14px',
    fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    background: viewMode === tab ? '#fff' : 'transparent',
    color: viewMode === tab ? '#4A5E50' : '#9AA89C',
    boxShadow: viewMode === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
  });

  const monthLabel = new Date(selectedMonth + '-15T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const canGoNextMonth = selectedMonth < TODAY.slice(0, 7);
  const canGoNextYear = selectedYear < TODAY.slice(0, 4);

  function prevMonth() {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  function nextMonth() {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (next <= TODAY.slice(0, 7)) setSelectedMonth(next);
  }

  const monthEntries = useMemo(() => {
    const filtered = kidFilter ? entries.filter(e => e.date.startsWith(selectedMonth) && e.kids.includes(kidFilter)) : entries.filter(e => e.date.startsWith(selectedMonth));
    return [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [entries, selectedMonth, kidFilter]);

  const { yearEntries, yearGroups } = useMemo(() => {
    const filtered = kidFilter ? entries.filter(e => e.date.startsWith(selectedYear) && e.kids.includes(kidFilter)) : entries.filter(e => e.date.startsWith(selectedYear));
    const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));
    const groups = [];
    let cur = null;
    for (const e of sorted) {
      const label = new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long' });
      if (label !== cur) { cur = label; groups.push({ label, entries: [] }); }
      groups[groups.length - 1].entries.push(e);
    }
    return { yearEntries: sorted, yearGroups: groups };
  }, [entries, selectedYear, kidFilter]);

  const { allEntries, allGroups } = useMemo(() => {
    const sorted = kidFilter ? [...entries].filter(e => e.kids.includes(kidFilter)) : [...entries];
    sorted.sort((a, b) => new Date(b.date) - new Date(a.date));
    const groups = [];
    let cur = null;
    for (const e of sorted) {
      const label = new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (label !== cur) { cur = label; groups.push({ label, entries: [] }); }
      groups[groups.length - 1].entries.push(e);
    }
    return { allEntries: sorted, allGroups: groups };
  }, [entries, kidFilter]);

  const periodEntries = viewMode === 'month' ? monthEntries : viewMode === 'year' ? yearEntries : allEntries;

  const { momentCount, milestoneCount, photoCount, favoriteCount } = useMemo(() => {
    let milestoneCount = 0, photoCount = 0, favoriteCount = 0;
    for (const e of periodEntries) {
      if (e.milestone) milestoneCount++;
      if (e.favorited) favoriteCount++;
      photoCount += e.media?.length || 0;
    }
    return { momentCount: periodEntries.length, milestoneCount, photoCount, favoriteCount };
  }, [periodEntries]);
  const periodEmpty = viewMode === 'month' ? `No moments logged in ${monthLabel}.` : viewMode === 'year' ? `No moments logged in ${selectedYear}.` : 'No moments logged yet.';

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            <div style={{ display: 'flex', background: '#E8EDE4', borderRadius: 9, padding: 3 }}>
              <button style={segTabStyle('month')} onClick={() => setViewMode('month')}>Month</button>
              <button style={segTabStyle('year')} onClick={() => setViewMode('year')}>Year</button>
              <button style={segTabStyle('all')} onClick={() => setViewMode('all')}>All</button>
            </div>
            <div style={{ width: 36 }} />
          </div>

          {viewMode !== 'all' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <button
                onClick={viewMode === 'month' ? prevMonth : () => setSelectedYear(y => String(Number(y) - 1))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9AA89C', fontSize: 16, padding: 4, display: 'flex' }}
              >
                <i className="ti ti-chevron-left" />
              </button>
              <h2 style={{ fontSize: 17, color: '#4A5E50', margin: 0, fontWeight: 700, minWidth: 150, textAlign: 'center' }}>
                {viewMode === 'month' ? monthLabel : selectedYear}
              </h2>
              <button
                onClick={viewMode === 'month' ? nextMonth : () => { if (canGoNextYear) setSelectedYear(y => String(Number(y) + 1)); }}
                style={{ background: 'none', border: 'none', cursor: (viewMode === 'month' ? canGoNextMonth : canGoNextYear) ? 'pointer' : 'default', color: (viewMode === 'month' ? canGoNextMonth : canGoNextYear) ? '#9AA89C' : 'transparent', fontSize: 16, padding: 4, display: 'flex' }}
              >
                <i className="ti ti-chevron-right" />
              </button>
            </div>
          )}

          {kids.length > 1 && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
              <button
                onClick={() => setKidFilter(null)}
                style={{ width: 48, height: 48, borderRadius: '50%', border: kidFilter === null ? '2.5px solid #4A5E50' : '2px solid #CCDAC8', background: kidFilter === null ? '#4A5E50' : '#fff', color: kidFilter === null ? '#fff' : '#9AA89C', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', flexShrink: 0 }}
              >All</button>
              {kids.map(kid => (
                <button
                  key={kid.id}
                  onClick={() => setKidFilter(f => f === kid.id ? null : kid.id)}
                  style={{ width: 48, height: 48, borderRadius: '50%', border: kidFilter === kid.id ? '2.5px solid #4A5E50' : '2px solid transparent', padding: 0, cursor: 'pointer', overflow: 'hidden', flexShrink: 0, opacity: kidFilter !== null && kidFilter !== kid.id ? 0.4 : 1, transition: 'opacity 0.15s, border-color 0.15s' }}
                >
                  <KidThumb kid={kid} size={48} />
                </button>
              ))}
            </div>
          )}

          {momentCount === 0 ? (
            <div className="empty-state">
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#EEF2EA', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <i className="ti ti-calendar" style={{ fontSize: 22, color: '#9AA89C' }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#4A5E50', margin: '0 0 6px' }}>Nothing written</p>
              <p style={{ fontSize: 13, color: '#9AA89C', margin: 0 }}>{periodEmpty}</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div onClick={() => setRecapFilter(null)} style={{ background: '#4A5E50', borderRadius: 14, padding: '14px 16px', opacity: recapFilter !== null ? 0.4 : 1, transition: 'opacity 0.15s', cursor: recapFilter !== null ? 'pointer' : 'default' }}>
                  <p style={{ fontSize: 32, fontWeight: 800, color: '#C8993E', margin: 0, lineHeight: 1 }}>{momentCount}</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: '5px 0 0', fontWeight: 600 }}>moment{momentCount !== 1 ? 's' : ''} logged</p>
                </div>
                <div
                  onClick={() => setRecapFilter(f => f === 'milestones' ? null : 'milestones')}
                  style={{ background: recapFilter === 'milestones' ? '#D4856A' : '#FAF0ED', borderRadius: 14, padding: '14px 16px', cursor: milestoneCount > 0 ? 'pointer' : 'default', opacity: recapFilter !== null && recapFilter !== 'milestones' ? 0.4 : 1, transition: 'opacity 0.15s' }}
                >
                  <p style={{ fontSize: 32, fontWeight: 800, color: recapFilter === 'milestones' ? '#fff' : '#D4856A', margin: 0, lineHeight: 1 }}>{milestoneCount}</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: recapFilter === 'milestones' ? 'rgba(255,255,255,0.75)' : '#D4856A', margin: '5px 0 0' }}>milestones</p>
                </div>
                <div
                  onClick={() => setRecapFilter(f => f === 'photos' ? null : 'photos')}
                  style={{ background: recapFilter === 'photos' ? '#A09080' : '#F0ECE8', borderRadius: 14, padding: '14px 16px', cursor: photoCount > 0 ? 'pointer' : 'default', opacity: recapFilter !== null && recapFilter !== 'photos' ? 0.4 : 1, transition: 'opacity 0.15s' }}
                >
                  <p style={{ fontSize: 32, fontWeight: 800, color: recapFilter === 'photos' ? '#fff' : '#A09080', margin: 0, lineHeight: 1 }}>{photoCount}</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: recapFilter === 'photos' ? 'rgba(255,255,255,0.75)' : '#A09080', margin: '5px 0 0' }}>photos</p>
                </div>
                <div
                  onClick={() => setRecapFilter(f => f === 'favorites' ? null : 'favorites')}
                  style={{ background: recapFilter === 'favorites' ? '#C8993E' : '#FDF3E0', borderRadius: 14, padding: '14px 16px', cursor: favoriteCount > 0 ? 'pointer' : 'default', opacity: recapFilter !== null && recapFilter !== 'favorites' ? 0.4 : 1, transition: 'opacity 0.15s' }}
                >
                  <p style={{ fontSize: 32, fontWeight: 800, color: recapFilter === 'favorites' ? '#fff' : '#C8993E', margin: 0, lineHeight: 1 }}>{favoriteCount}</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: recapFilter === 'favorites' ? 'rgba(255,255,255,0.75)' : '#C8993E', margin: '5px 0 0' }}>favorites</p>
                </div>
              </div>

              {recapFilter === 'photos' ? (
                (() => {
                  const allPhotos = periodEntries.flatMap(e => (e.media || []).map(m => ({ ...m, entry: e })));
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                      {allPhotos.map((item, i) => (
                        <div
                          key={i}
                          onClick={() => onOpenEntry(item.entry)}
                          style={{ aspectRatio: '1', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', background: '#EEF2EA' }}
                        >
                          <img src={item.url} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" />
                        </div>
                      ))}
                    </div>
                  );
                })()
              ) : recapFilter === 'favorites' ? (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {periodEntries.filter(e => e.favorited).map(e => <RecapEntryRow key={e.id} entry={e} kids={kids} onOpenEntry={onOpenEntry} />)}
                </div>
              ) : recapFilter === 'milestones' ? (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {periodEntries.filter(e => e.milestone).map(e => <RecapEntryRow key={e.id} entry={e} kids={kids} onOpenEntry={onOpenEntry} />)}
                </div>
              ) : viewMode === 'month' ? (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {monthEntries.map(e => <RecapEntryRow key={e.id} entry={e} kids={kids} onOpenEntry={onOpenEntry} />)}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {(viewMode === 'year' ? yearGroups : allGroups).map(group => (
                    <div key={group.label} style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#9AA89C', letterSpacing: 0.4, textTransform: 'uppercase' }}>{group.label}</span>
                        <div style={{ flex: 1, height: 1, background: '#CCDAC8' }} />
                        <span style={{ fontSize: 11, color: '#B8CCB4', fontWeight: 600 }}>{group.entries.length}</span>
                      </div>
                      {group.entries.map(e => <RecapEntryRow key={e.id} entry={e} kids={kids} onOpenEntry={onOpenEntry} />)}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <button onClick={onCompare} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '14px 18px', background: '#EBF2E8', border: 'none', borderRadius: 14, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#4A5E50' }}>At the same age</span>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#4A5E50', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="ti ti-arrow-right" style={{ fontSize: 13, color: '#fff' }} />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Compare screen ──────────────────────────────────────────────────────

function CompareScreen({ entries, kids, onBack, onOpenEntry }) {
  const [filterTab, setFilterTab] = useState('age');
  const [compareAge, setCompareAge] = useState(24);
  const [milestoneFilter, setMilestoneFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const ages = [12, 18, 24, 36, 48, 60, 72];
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
    const q = searchQuery.toLowerCase();
    const m = e.milestone ? milestoneInfo(e.milestone) : null;
    return (e.text || '').toLowerCase().includes(q)
      || (m && m.label.toLowerCase().includes(q))
      || e.location?.toLowerCase().includes(q);
  }

  const showMeta = isSearching || isMilestoneFiltering;
  const emptyLabel = isSearching ? 'No matches'
    : filterTab === 'milestone' && !milestoneFilter ? 'Pick a milestone above'
    : isMilestoneFiltering ? 'None logged yet'
    : 'No moments yet at this age';

  const tabStyle = (tab) => ({
    flex: 1, border: 'none', borderRadius: 8, padding: '8px 0',
    fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    background: filterTab === tab ? '#fff' : 'transparent',
    color: filterTab === tab ? '#4A5E50' : '#9AA89C',
    boxShadow: filterTab === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
    transition: 'all 0.15s',
  });

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            <h2 style={{ fontSize: 16, color: '#4A5E50', margin: 0, fontWeight: 700 }}>At this age</h2>
            <div style={{ width: 36 }} />
          </div>

          <div style={{ display: 'flex', background: '#E8EDE4', borderRadius: 10, padding: 3 }}>
            <button style={tabStyle('age')} onClick={() => switchTab('age')}>By Age</button>
            <button style={tabStyle('milestone')} onClick={() => switchTab('milestone')}>Milestones</button>
            <button style={tabStyle('search')} onClick={() => switchTab('search')}>Search</button>
          </div>

          {filterTab === 'search' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: '1px solid #ECE5D6', borderRadius: 10, padding: '10px 14px' }}>
              <i className="ti ti-search" style={{ color: '#9AA89C', fontSize: 16 }} />
              <input
                autoFocus
                type="text"
                placeholder="Search moments..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', flex: 1, fontSize: 16, background: 'transparent', color: '#4A5E50', fontFamily: 'Inter, sans-serif' }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9AA89C', padding: 0, display: 'flex', alignItems: 'center' }}>
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
                  style={{ padding: '7px 14px', ...(compareAge === age ? { background: '#4A5E50' } : {}) }}
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
            <div className="empty-state" style={{ padding: '32px 24px' }}>
              <p style={{ fontSize: 13, color: '#9AA89C', margin: 0 }}>Pick a milestone above to compare</p>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 12 }}>
              {kids.map(kid => {
                const matches = isSearching
                  ? entries.filter(e => e.kids.includes(kid.id) && entryMatchesSearch(e))
                  : isMilestoneFiltering
                    ? entries.filter(e => e.kids.length === 1 && e.kids.includes(kid.id) && e.milestone === milestoneFilter)
                    : entries.filter(e => e.kids.length === 1 && e.kids.includes(kid.id) && matchesAgeBucket(e.ageMonths));
                return (
                  <div key={kid.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <KidThumb kid={kid} />
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#4A5E50', margin: 0 }}>{kid.name}</p>
                    </div>
                    {matches.length === 0 ? (
                      <div style={{ background: '#fff', border: '1px dashed #D8CFBC', borderRadius: 12, padding: '24px 12px', textAlign: 'center' }}>
                        <p style={{ fontSize: 12, color: '#9AA89C', margin: 0 }}>{emptyLabel}</p>
                      </div>
                    ) : matches.map(e => {
                      const m = e.milestone ? milestoneInfo(e.milestone) : null;
                      const ageStr = exactAgeLabel(kid.birthdate, e.date);
                      const dateStr = new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                      return (
                        <div key={e.id} className={m ? 'milestone-entry' : undefined} style={{ borderRadius: 12, cursor: 'pointer', padding: m ? 2 : 0 }} onClick={() => onOpenEntry(e)}>
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
                          <p style={{ fontSize: 12, color: '#5C6B5E', lineHeight: 1.5, margin: '8px 2px 0' }}>
                            {e.text.slice(0, 70)}{e.text.length > 70 ? '...' : ''}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
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
      background: '#2C3828', borderRadius: 14, padding: '12px 14px',
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

function PartnerLettersScreen({ entries, kids, unseenIds, authorName, authorId, currentUserId, onBack, onOpenEntry, onMarkAllRead }) {
  const isSelf = authorId && currentUserId && authorId === currentUserId;
  const unseenEntries = useMemo(
    () => isSelf ? [] : entries.filter(e => unseenIds.includes(e.id)).sort((a, b) => new Date(b.date) - new Date(a.date)),
    [entries, unseenIds, isSelf]
  );
  const earlierEntries = useMemo(
    () => entries
      .filter(e => authorId && e.authorId === authorId && (isSelf || !unseenIds.includes(e.id)))
      .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [entries, authorId, unseenIds, isSelf]
  );
  const hasAny = unseenEntries.length > 0 || earlierEntries.length > 0;
  const title = isSelf ? 'My letters' : (authorName ? `${authorName}'s letters` : "Partner's letters");

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            <h2 style={{ fontSize: 16, color: '#4A5E50', margin: 0, fontWeight: 700 }}>{title}</h2>
            <div style={{ width: 36 }} />
          </div>

          {!hasAny && (
            <p style={{ fontSize: 13, color: '#9AA89C', textAlign: 'center', padding: '40px 0' }}>No letters yet</p>
          )}

          {unseenEntries.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: 11, color: '#9AA89C', fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', margin: 0 }}>New</p>
                <button onClick={onMarkAllRead} style={{ background: 'none', border: 'none', color: '#9AA89C', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: 0 }}>
                  Mark all as read
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {unseenEntries.map(e => {
                  const entryKids = (e.kids || []).map(id => kids.find(k => k.id === id)).filter(Boolean);
                  return <JournalEntryRow key={e.id} entry={e} entryKids={entryKids} onOpen={onOpenEntry} />;
                })}
              </div>
            </>
          )}

          {earlierEntries.length > 0 && (
            <>
              <p style={{ fontSize: 11, color: '#9AA89C', fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', margin: 0 }}>
                {unseenEntries.length > 0 ? 'Earlier' : 'All letters'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {earlierEntries.map(e => {
                  const entryKids = (e.kids || []).map(id => kids.find(k => k.id === id)).filter(Boolean);
                  return <JournalEntryRow key={e.id} entry={e} entryKids={entryKids} onOpen={onOpenEntry} />;
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
    return (e.text || '').toLowerCase().includes(q) || (m && m.label.toLowerCase().includes(q)) || kid?.name.toLowerCase().includes(q) || e.location?.toLowerCase().includes(q) || (hasVideo && 'video'.includes(q)) || (e.milestone && 'milestone'.includes(q)) || (e.favorited && 'favorites'.includes(q)) || (isTrip && 'trips'.includes(q));
  }) : [], [debouncedQuery, entries, kids, homePt]);

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            <h2 style={{ fontSize: 16, color: '#4A5E50', margin: 0, fontWeight: 700 }}>Search</h2>
            <div style={{ width: 36 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: '1px solid #ECE5D6', borderRadius: 10, padding: '11px 14px' }}>
            <i className="ti ti-search" style={{ color: '#9AA89C' }} />
            <input
              type="text"
              placeholder="Search moments, people, places..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ border: 'none', outline: 'none', flex: 1, fontSize: 16, background: 'transparent', color: '#4A5E50', fontFamily: 'Inter, sans-serif' }}
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
            <p style={{ fontSize: 13, color: '#9AA89C', textAlign: 'center', padding: '24px 0' }}>No moments found</p>
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


// ─── Growth chart ─────────────────────────────────────────────────────────

function GrowthChart({ measurements, refTable, color }) {
  const W = 320, H = 200;
  const PL = 38, PR = 12, PT = 14, PB = 30;
  const cW = W - PL - PR, cH = H - PT - PB;

  const hasMeasurements = measurements && measurements.length > 0;
  const refMax = refTable ? refTable[refTable.length - 1][0] : 120;
  const maxAgeMo = hasMeasurements
    ? Math.min(refMax, Math.max(...measurements.map(m => m.age)) + 12)
    : 36;

  const allVals = [
    ...(hasMeasurements ? measurements.map(m => m.value) : []),
    ...(refTable ? refTable.map(r => r[1]) : []),
    ...(refTable ? refTable.map(r => r[5]) : []),
  ];
  if (allVals.length === 0) return null;
  const minVal = Math.floor(Math.min(...allVals) * 0.97);
  const maxVal = Math.ceil(Math.max(...allVals) * 1.03);

  const tx = age => PL + (age / maxAgeMo) * cW;
  const ty = val => PT + (1 - (val - minVal) / (maxVal - minVal)) * cH;

  const refPts = i => refTable ? refTable.map(r => `${tx(r[0]).toFixed(1)},${ty(r[i]).toFixed(1)}`).join(' ') : '';
  const bandPoly = refTable ? [
    ...refTable.map(r => `${tx(r[0]).toFixed(1)},${ty(r[2]).toFixed(1)}`),
    ...refTable.slice().reverse().map(r => `${tx(r[0]).toFixed(1)},${ty(r[4]).toFixed(1)}`),
  ].join(' ') : '';
  const kidLine = hasMeasurements ? measurements.map(m => `${tx(m.age).toFixed(1)},${ty(m.value).toFixed(1)}`).join(' ') : '';

  const xTicks = [];
  for (let mo = 0; mo <= maxAgeMo; mo += (maxAgeMo > 36 ? 12 : 6)) xTicks.push(mo);
  const yRange = maxVal - minVal;
  const yStep = yRange <= 12 ? 2 : yRange <= 30 ? 5 : yRange <= 60 ? 10 : 15;
  const yTicks = [];
  for (let v = Math.ceil(minVal / yStep) * yStep; v <= maxVal; v += yStep) yTicks.push(v);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {yTicks.map(v => (
        <line key={v} x1={PL} y1={ty(v)} x2={PL + cW} y2={ty(v)} stroke="#EEF2EA" strokeWidth={1} />
      ))}
      {refTable && bandPoly && <polygon points={bandPoly} fill={color} opacity={0.13} />}
      {refTable && <polyline points={refPts(1)} fill="none" stroke={color} strokeWidth={0.8} strokeOpacity={0.25} strokeDasharray="3,3" />}
      {refTable && <polyline points={refPts(5)} fill="none" stroke={color} strokeWidth={0.8} strokeOpacity={0.25} strokeDasharray="3,3" />}
      {refTable && <polyline points={refPts(3)} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.45} strokeDasharray="5,4" />}
      {hasMeasurements && measurements.length > 1 && (
        <polyline points={kidLine} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {hasMeasurements && measurements.map((m, i) => (
        <circle key={i} cx={tx(m.age)} cy={ty(m.value)} r={4.5} fill={color} stroke="#fff" strokeWidth={1.5} />
      ))}
      <line x1={PL} y1={PT + cH} x2={PL + cW} y2={PT + cH} stroke="#CCDAC8" strokeWidth={1} />
      <line x1={PL} y1={PT} x2={PL} y2={PT + cH} stroke="#CCDAC8" strokeWidth={1} />
      {xTicks.map(mo => (
        <text key={mo} x={tx(mo)} y={PT + cH + 14} fontSize={8.5} fill="#9AA89C" textAnchor="middle" fontFamily="Inter,sans-serif">
          {mo === 0 ? 'birth' : mo >= 24 ? `${mo / 12}y` : `${mo}m`}
        </text>
      ))}
      {yTicks.map(v => (
        <text key={v} x={PL - 5} y={ty(v) + 3} fontSize={8.5} fill="#9AA89C" textAnchor="end" fontFamily="Inter,sans-serif">{v}</text>
      ))}
    </svg>
  );
}

function GrowthScreen({ kid, onBack, onSave, onDelete }) {
  const [metric, setMetric] = useState('height');
  const [addingEntry, setAddingEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [entryDate, setEntryDate] = useState(TODAY);
  const [editMonth, setEditMonth] = useState('');
  const [editDay, setEditDay] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editingDate, setEditingDate] = useState(false);
  const [newFt, setNewFt] = useState('');
  const [newIn, setNewIn] = useState('');
  const [newLb, setNewLb] = useState('');
  const [newOz, setNewOz] = useState('');

  const growthLog = [...(kid.growthLog || [])].sort((a, b) => a.date.localeCompare(b.date));
  const refH = GROWTH_REF.height[kid.sex] || avgTable(GROWTH_REF.height.M, GROWTH_REF.height.F);
  const refW = GROWTH_REF.weight[kid.sex] || avgTable(GROWTH_REF.weight.M, GROWTH_REF.weight.F);
  const heightPts = growthLog.filter(e => e.height).map(e => ({ age: ageInMonthsAt(kid.birthdate, e.date), value: e.height }));
  const weightPts = growthLog.filter(e => e.weight).map(e => ({ age: ageInMonthsAt(kid.birthdate, e.date), value: e.weight }));
  const latest = growthLog[growthLog.length - 1];
  const color = kid.accent || '#4A5E50';

  function openDateEdit() {
    const [y, m, d] = entryDate.split('-');
    setEditYear(y); setEditMonth(m); setEditDay(String(parseInt(d)));
    setEditingDate(true);
  }
  function applyDate() {
    if (editMonth && editDay && editYear && editYear.length === 4)
      setEntryDate(`${editYear}-${editMonth}-${editDay.padStart(2, '0')}`);
    setEditingDate(false);
  }

  function closeSheet() {
    setAddingEntry(false);
    setEditingEntry(null);
    setNewFt(''); setNewIn(''); setNewLb(''); setNewOz('');
    setEntryDate(TODAY);
  }

  function openEdit(entry) {
    setEditingEntry(entry);
    setEntryDate(entry.date);
    if (entry.height != null) {
      setNewFt(String(Math.floor(entry.height / 12)));
      setNewIn(String(parseFloat((entry.height % 12).toFixed(2))));
    } else { setNewFt(''); setNewIn(''); }
    if (entry.weight != null) {
      const lb = Math.floor(entry.weight);
      const oz = parseFloat(((entry.weight - lb) * 16).toFixed(1));
      setNewLb(String(lb));
      setNewOz(oz > 0 ? String(oz) : '');
    } else { setNewLb(''); setNewOz(''); }
    setAddingEntry(true);
  }

  function handleAdd() {
    const height = (newFt || newIn) ? parseFloat(newFt || 0) * 12 + parseFloat(newIn || 0) : null;
    const weight = (newLb || newOz) ? parseFloat(newLb || 0) + parseFloat(newOz || 0) / 16 : null;
    if (!height && !weight) return;
    onSave({ date: entryDate, height: height || null, weight: weight || null });
    closeSheet();
  }

  function handleDelete() {
    if (editingEntry) onDelete(editingEntry.date);
    closeSheet();
  }

  const canSave = newFt || newIn || newLb || newOz;
  const dateDisplay = new Date(entryDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const segBtn = (tab) => ({
    flex: 1, border: 'none', borderRadius: 7, padding: '7px 0',
    fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    background: metric === tab ? '#fff' : 'transparent',
    color: metric === tab ? '#4A5E50' : '#9AA89C',
    boxShadow: metric === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
  });

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <KidThumb kid={kid} size={22} />
              <h2 style={{ fontSize: 16, color: '#4A5E50', margin: 0, fontWeight: 700 }}>{kid.name}'s growth</h2>
            </div>
            <button className="icon-btn" onClick={() => setAddingEntry(true)}><i className="ti ti-plus" /></button>
          </div>

          {latest && (
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="stat-tile">
                <p style={{ fontSize: 17, color: '#4A5E50', margin: 0, fontWeight: 700 }}>{fmtHeight(latest.height)}</p>
                <p style={{ fontSize: 11, color: '#9AA89C', margin: '3px 0 0' }}>height</p>
              </div>
              <div className="stat-tile">
                <p style={{ fontSize: 17, color: '#4A5E50', margin: 0, fontWeight: 700 }}>{fmtWeight(latest.weight)}</p>
                <p style={{ fontSize: 11, color: '#9AA89C', margin: '3px 0 0' }}>weight</p>
              </div>
            </div>
          )}

          {growthLog.length > 0 && (
            <>
              <div style={{ display: 'flex', background: '#E8EDE4', borderRadius: 9, padding: 3 }}>
                <button style={segBtn('height')} onClick={() => setMetric('height')}>Height</button>
                <button style={segBtn('weight')} onClick={() => setMetric('weight')}>Weight</button>
              </div>
              <div style={{ background: '#fff', border: '1px solid #ECE5D6', borderRadius: 14, padding: '12px 8px 8px' }}>
                <GrowthChart
                  measurements={metric === 'height' ? heightPts : weightPts}
                  refTable={metric === 'height' ? refH : refW}
                  color={color}
                />
                <p style={{ fontSize: 10, color: '#B8CCB4', textAlign: 'center', margin: '4px 0 2px', fontFamily: 'Inter, sans-serif' }}>
                  {kid.sex ? 'Shaded = 25th–75th · Dashed = 50th percentile' : 'Average of all children'} · CDC 2000
                </p>
              </div>
            </>
          )}

          {growthLog.length === 0 ? (
            <div className="empty-state">
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#EEF2EA', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <i className="ti ti-ruler" style={{ fontSize: 24, color: '#9AA89C' }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#4A5E50', margin: '0 0 6px' }}>No measurements yet</p>
              <p style={{ fontSize: 13, color: '#9AA89C', margin: '0 0 20px', lineHeight: 1.5 }}>Tap + to log {kid.name}'s first height and weight.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#9AA89C', textTransform: 'uppercase', letterSpacing: 0.8, margin: 0 }}>Log</p>
              {[...growthLog].reverse().map((entry, i) => {
                const ageMo = ageInMonthsAt(kid.birthdate, entry.date);
                const dateStr = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                const [p5H, , p50H, , p95H] = lerpRef(refH, ageMo);
                const [p5W, , p50W, , p95W] = lerpRef(refW, ageMo);
                const hPct = entry.height ? Math.round(((entry.height - p5H) / (p95H - p5H)) * 90 + 5) : null;
                const wPct = entry.weight ? Math.round(((entry.weight - p5W) / (p95W - p5W)) * 90 + 5) : null;
                return (
                  <div key={i} style={{ background: '#fff', border: '1px solid #ECE5D6', borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#4A5E50', margin: 0 }}>{dateStr}</p>
                        <p style={{ fontSize: 11, color: '#9AA89C', margin: '2px 0 0' }}>{ageLabel(Math.round(ageMo))} old</p>
                      </div>
                      <button onClick={() => openEdit(entry)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9AA89C', fontSize: 15, padding: 4, display: 'flex' }}>
                        <i className="ti ti-pencil" />
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {entry.height && (
                        <div style={{ flex: 1, background: '#F6FAF4', borderRadius: 9, padding: '8px 10px' }}>
                          <p style={{ fontSize: 15, fontWeight: 700, color: '#2C3828', margin: '0 0 2px' }}>{fmtHeight(entry.height)}</p>
                          {hPct !== null && <p style={{ fontSize: 10, color: '#9AA89C', margin: 0 }}>~{Math.min(99, Math.max(1, hPct))}th percentile</p>}
                        </div>
                      )}
                      {entry.weight && (
                        <div style={{ flex: 1, background: '#F6FAF4', borderRadius: 9, padding: '8px 10px' }}>
                          <p style={{ fontSize: 15, fontWeight: 700, color: '#2C3828', margin: '0 0 2px' }}>{fmtWeight(entry.weight)}</p>
                          {wPct !== null && <p style={{ fontSize: 10, color: '#9AA89C', margin: 0 }}>~{Math.min(99, Math.max(1, wPct))}th percentile</p>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add / edit measurement sheet */}
      {addingEntry && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 20 }} onClick={closeSheet}>
          <div style={{ background: '#F2F4EC', borderRadius: '20px 20px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#2C3828', margin: 0 }}>{editingEntry ? 'Edit measurement' : 'Add measurement'}</p>
              {editingEntry ? (
                <span style={{ fontSize: 12, color: '#9AA89C', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="ti ti-calendar" style={{ fontSize: 13 }} />{dateDisplay}
                </span>
              ) : (
                <button onClick={openDateEdit} style={{ background: '#EEF2EA', border: 'none', cursor: 'pointer', fontSize: 12, color: '#5C6B5E', fontFamily: "'Inter', sans-serif", padding: '6px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
                  <i className="ti ti-calendar" style={{ fontSize: 13 }} />{dateDisplay}
                </button>
              )}
            </div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#9AA89C', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>Height</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input type="number" placeholder="0" value={newFt} onChange={e => setNewFt(e.target.value)} className="input-field" style={{ paddingRight: 30 }} />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#9AA89C', pointerEvents: 'none' }}>ft</span>
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <input type="number" placeholder="0" step="0.1" value={newIn} onChange={e => setNewIn(e.target.value)} className="input-field" style={{ paddingRight: 30 }} />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#9AA89C', pointerEvents: 'none' }}>in</span>
              </div>
            </div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#9AA89C', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>Weight</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input type="number" placeholder="0" value={newLb} onChange={e => setNewLb(e.target.value)} className="input-field" style={{ paddingRight: 30 }} />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#9AA89C', pointerEvents: 'none' }}>lb</span>
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <input type="number" placeholder="0" value={newOz} onChange={e => setNewOz(e.target.value)} className="input-field" style={{ paddingRight: 30 }} />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#9AA89C', pointerEvents: 'none' }}>oz</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {editingEntry && (
                <button className="btn btn-outline" style={{ flex: 1, color: '#C0523A', borderColor: '#F0C4BA' }} onClick={handleDelete}>Delete</button>
              )}
              <button className="btn btn-primary" style={{ flex: editingEntry ? 2 : 1, opacity: canSave ? 1 : 0.4 }} disabled={!canSave} onClick={handleAdd}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Date sheet */}
      {editingDate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30, padding: '0 16px' }} onClick={() => setEditingDate(false)}>
          <div style={{ background: '#F2F4EC', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#2C3828', margin: '0 0 16px' }}>When was this measured?</p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <div style={{ position: 'relative', flex: 2.2 }}>
                <select value={editMonth} onChange={e => setEditMonth(e.target.value)} style={{ width: '100%', border: '1px solid #CCDAC8', borderRadius: 10, padding: '14px 36px 14px 14px', fontSize: 16, outline: 'none', background: '#fff', color: editMonth ? '#2C3828' : '#9AA89C', fontFamily: "'Inter', sans-serif", appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}>
                  <option value="" disabled>Month</option>
                  {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
                </select>
                <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#9AA89C', fontSize: 13, pointerEvents: 'none' }} />
              </div>
              <input type="number" placeholder="Day" value={editDay} min={1} max={31} onChange={e => setEditDay(e.target.value)} style={{ flex: 1, border: '1px solid #CCDAC8', borderRadius: 10, padding: '14px 10px', fontSize: 16, outline: 'none', background: '#fff', color: '#2C3828', fontFamily: "'Inter', sans-serif", textAlign: 'center' }} />
              <input type="number" placeholder="Year" value={editYear} min={2000} max={2030} onChange={e => setEditYear(e.target.value)} style={{ flex: 1.5, border: '1px solid #CCDAC8', borderRadius: 10, padding: '14px 10px', fontSize: 16, outline: 'none', background: '#fff', color: '#2C3828', fontFamily: "'Inter', sans-serif", textAlign: 'center' }} />
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={applyDate}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Profile / manage kids ─────────────────────────────────────────────────

function ProfileScreen({ kids, entries, onBack, onAvatarUpload, onSignOut, familyMembers, myDisplayName, onInvite, onUpdateDisplayName, onAddKid, onFamilyAvatarUpload, avatarUploading, currentUserId, onRenameKid, onUpdateKidSex, onOpenGrowth, onCreateBook, onDeleteAccount, hasPartner }) {
  const fileInputRef = useRef(null);
  const familyAvatarInputRef = useRef(null);
  const [uploadKidId, setUploadKidId] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeFamilyAvatarId, setActiveFamilyAvatarId] = useState(null);
  const [inviteCode, setInviteCode] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(myDisplayName);
  const [editingKid, setEditingKid] = useState(null);
  const [kidNameInput, setKidNameInput] = useState('');
  const [kidSexInput, setKidSexInput] = useState(null);
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

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            <h2 style={{ fontSize: 16, color: '#4A5E50', margin: 0, fontWeight: 700 }}>Your family</h2>
            <div style={{ width: 36 }} />
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

          {kids.map(k => {
            const kEntries = entries.filter(e => e.kids.includes(k.id));
            const kMilestones = kEntries.filter(e => e.milestone).length;
            const bornLabel = (() => { const [y,m,d] = k.birthdate.split('-').map(Number); return new Date(y,m-1,d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); })();
            return (
              <div key={k.id} style={{ background: '#fff', border: '1px solid #ECE5D6', borderRadius: 14, padding: '20px 16px 16px', textAlign: 'center' }}>
                <div
                  className="avatar-upload-zone"
                  style={{ width: 84, height: 84, margin: '0 auto 12px', position: 'relative' }}
                  onClick={() => { setUploadKidId(k.id); fileInputRef.current?.click(); }}
                  title="Tap to change photo"
                >
                  <AvatarImg src={k.avatar} alt={k.name} fallback={<i className="ti ti-camera" />} />
                  {avatarUploading && uploadKidId === k.id && (
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(44,56,40,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="ti ti-loader-2" style={{ fontSize: 22, color: '#fff', animation: 'spin 1s linear infinite' }} />
                    </div>
                  )}
                </div>
                <p
                  style={{ fontSize: 15, fontWeight: 700, color: '#4A5E50', margin: '0 0 2px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  onClick={() => { setEditingKid(k); setKidNameInput(k.name); setKidSexInput(k.sex ?? null); }}
                >
                  {k.name} <i className="ti ti-pencil" style={{ fontSize: 12, color: '#9AA89C' }} />
                </p>
                <p style={{ fontSize: 12, color: '#9AA89C', margin: '0 0 14px' }}>Born {bornLabel}</p>
                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                  <div className="stat-tile">
                    <p style={{ fontSize: 18, color: '#4A5E50', margin: 0, fontWeight: 700 }}>{kEntries.length}</p>
                    <p style={{ fontSize: 11, color: '#9AA89C', margin: '3px 0 0' }}>moments</p>
                  </div>
                  <div className="stat-tile">
                    <p style={{ fontSize: 18, color: '#4A5E50', margin: 0, fontWeight: 700 }}>{kMilestones}</p>
                    <p style={{ fontSize: 11, color: '#9AA89C', margin: '3px 0 0' }}>milestones</p>
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

          <button className="btn btn-primary" style={{ background: '#7A9E8C' }} onClick={() => { setMemberPickerOpen(true); setPickerStep('type'); setPickerRole(null); setInviteCode(null); }}>
            <i className="ti ti-plus" />Add a family member
          </button>

          {/* Family members section */}
          {familyMembers && familyMembers.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #ECE5D6', borderRadius: 14, padding: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#9AA89C', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 14px' }}>Family</p>
              {familyMembers.map(m => (
                <div key={m.id || m.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      onClick={() => {
                        if (!onFamilyAvatarUpload || m.user_id !== currentUserId) return;
                        setActiveFamilyAvatarId(m.id || m.user_id);
                        familyAvatarInputRef.current?.click();
                      }}
                      style={{ width: 34, height: 34, borderRadius: '50%', background: '#EEF2EA', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: m.user_id === currentUserId ? 'pointer' : 'default' }}
                    >
                      <AvatarImg src={m.avatar_url} alt={m.display_name} fallback={<i className="ti ti-user" style={{ fontSize: 16, color: '#4A5E50' }} />} />
                    </div>
                    {m.user_id === currentUserId ? (
                      <span
                        style={{ fontSize: 14, color: '#2C3828', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                        onClick={() => { setNameInput(myDisplayName); setEditingName(true); }}
                      >
                        {m.display_name} <i className="ti ti-pencil" style={{ fontSize: 12, color: '#9AA89C' }} />
                      </span>
                    ) : (
                      <span style={{ fontSize: 14, color: '#2C3828', fontWeight: 600 }}>{m.display_name}</span>
                    )}
                  </div>
                </div>
              ))}
              <input ref={familyAvatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFamilyAvatarFile} />
            </div>
          )}

          {/* Member type picker */}
          {memberPickerOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 20 }} onClick={() => setMemberPickerOpen(false)}>
              <div style={{ background: '#F2F4EC', borderRadius: '20px 20px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 480 }} onClick={e => e.stopPropagation()}>
                {pickerStep === 'type' ? (
                  <>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#2C3828', margin: '0 0 18px' }}>Who are you adding?</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[
                        { icon: 'ti-heart', label: 'Child', sub: 'Newborn, toddler, or older kid', action: () => { setMemberPickerOpen(false); setAddingKid(true); } },
                        { icon: 'ti-user', label: 'Parent', sub: 'Mom, Dad, or another caregiver', action: () => handlePickerInvite('parent') },
                        { icon: 'ti-user-heart', label: 'Grandparent', sub: 'Grandma, Grandpa, Nana, Pop…', action: () => handlePickerInvite('grandparent') },
                        { icon: 'ti-users', label: 'Other', sub: 'Auntie, uncle, cousin, close friend', action: () => handlePickerInvite('other') },
                      ].map(opt => (
                        <button key={opt.label} onClick={opt.action} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: '#fff', border: '1px solid #ECE5D6', borderRadius: 13, cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: "'Inter', sans-serif" }}>
                          <div style={{ width: 42, height: 42, borderRadius: 11, background: '#EEF2EA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <i className={`ti ${opt.icon}`} style={{ fontSize: 20, color: '#4A5E50' }} />
                          </div>
                          <div>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#2C3828', margin: 0 }}>{opt.label}</p>
                            <p style={{ fontSize: 12, color: '#9AA89C', margin: '2px 0 0' }}>{opt.sub}</p>
                          </div>
                          <i className="ti ti-chevron-right" style={{ fontSize: 14, color: '#C4D8C0', marginLeft: 'auto' }} />
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                      <button onClick={() => setPickerStep('type')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9AA89C', fontSize: 18, padding: 0, display: 'flex' }}><i className="ti ti-arrow-left" /></button>
                      <p style={{ fontSize: 15, fontWeight: 700, color: '#2C3828', margin: 0 }}>
                        Invite a {pickerRole === 'other' ? 'family member' : pickerRole}
                      </p>
                    </div>
                    {inviteLoading ? (
                      <div style={{ textAlign: 'center', padding: '24px 0', color: '#9AA89C', fontSize: 13 }}>Generating invite code…</div>
                    ) : inviteCode ? (
                      <div style={{ padding: '20px 16px', background: '#fff', borderRadius: 14, border: '1px solid #ECE5D6', textAlign: 'center' }}>
                        <p style={{ fontSize: 12, color: '#7A8C78', margin: '0 0 10px', fontWeight: 600 }}>
                          {pickerRole === 'grandparent' ? 'Share this code with a grandparent' : pickerRole === 'other' ? 'Share this invite code' : 'Share this code with them'}
                        </p>
                        <p style={{ fontSize: 30, fontWeight: 700, color: '#4A5E50', letterSpacing: 5, margin: '0 0 14px', fontFamily: "'Inter', sans-serif" }}>{inviteCode}</p>
                        <p style={{ fontSize: 11, color: '#B8CCB4', margin: '0 0 14px', lineHeight: 1.5 }}>They'll enter this code during sign-up to join your family journal.</p>
                        <button onClick={() => { navigator.clipboard?.writeText(inviteCode); }} style={{ background: '#EEF2EA', border: 'none', cursor: 'pointer', fontSize: 13, color: '#4A5E50', fontFamily: "'Inter', sans-serif", padding: '10px 20px', borderRadius: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
              <div style={{ background: '#F2F4EC', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#2C3828', margin: '0 0 16px' }}>Add a child</p>
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
                    <select value={newBdMonth} onChange={e => setNewBdMonth(e.target.value)} style={{ width: '100%', border: '1px solid #CCDAC8', borderRadius: 10, padding: '13px 32px 13px 14px', fontSize: 15, outline: 'none', background: '#fff', color: newBdMonth ? '#2C3828' : '#9AA89C', fontFamily: "'Inter', sans-serif", appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}>
                      <option value="" disabled>Month</option>
                      {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                        <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                      ))}
                    </select>
                    <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#9AA89C', fontSize: 12, pointerEvents: 'none' }} />
                  </div>
                  <input type="number" placeholder="Day" value={newBdDay} min={1} max={31} onChange={e => setNewBdDay(e.target.value)} style={{ flex: 1, border: '1px solid #CCDAC8', borderRadius: 10, padding: '13px 8px', fontSize: 15, outline: 'none', background: '#fff', color: '#2C3828', fontFamily: "'Inter', sans-serif", textAlign: 'center' }} />
                  <input type="number" placeholder="Year" value={newBdYear} min={1900} max={2030} onChange={e => setNewBdYear(e.target.value)} style={{ flex: 1.5, border: '1px solid #CCDAC8', borderRadius: 10, padding: '13px 8px', fontSize: 15, outline: 'none', background: '#fff', color: '#2C3828', fontFamily: "'Inter', sans-serif", textAlign: 'center' }} />
                </div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#9AA89C', textTransform: 'uppercase', letterSpacing: 0.8, margin: '12px 0 8px' }}>Sex <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional — improves growth chart accuracy)</span></p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  {[['M', 'Boy'], ['F', 'Girl']].map(([val, label]) => (
                    <button key={val} onClick={() => setNewSex(newSex === val ? null : val)} style={{ flex: 1, border: `1px solid ${newSex === val ? '#4A5E50' : '#CCDAC8'}`, borderRadius: 10, padding: '11px 0', fontSize: 14, fontWeight: 600, fontFamily: "'Inter', sans-serif", background: newSex === val ? '#4A5E50' : '#fff', color: newSex === val ? '#fff' : '#5C6B5E', cursor: 'pointer' }}>{label}</button>
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
              <div style={{ background: '#F2F4EC', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#2C3828', margin: '0 0 16px' }}>Edit {editingKid.name}</p>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#9AA89C', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>Name</p>
                <input
                  className="input-field"
                  value={kidNameInput}
                  onChange={e => setKidNameInput(e.target.value)}
                  placeholder="Name"
                  style={{ marginBottom: 16, fontSize: 16 }}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter' && kidNameInput.trim()) { onRenameKid(editingKid.id, kidNameInput.trim()); onUpdateKidSex?.(editingKid.id, kidSexInput); setEditingKid(null); } }}
                />
                <p style={{ fontSize: 11, fontWeight: 700, color: '#9AA89C', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>Sex <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(for growth chart percentiles)</span></p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                  {[['M', 'Boy'], ['F', 'Girl']].map(([val, label]) => (
                    <button key={val} onClick={() => setKidSexInput(kidSexInput === val ? null : val)} style={{ flex: 1, border: `1px solid ${kidSexInput === val ? '#4A5E50' : '#CCDAC8'}`, borderRadius: 10, padding: '11px 0', fontSize: 14, fontWeight: 600, fontFamily: "'Inter', sans-serif", background: kidSexInput === val ? '#4A5E50' : '#fff', color: kidSexInput === val ? '#fff' : '#5C6B5E', cursor: 'pointer' }}>{label}</button>
                  ))}
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', opacity: kidNameInput.trim() ? 1 : 0.4 }}
                  disabled={!kidNameInput.trim()}
                  onClick={() => { onRenameKid(editingKid.id, kidNameInput.trim()); onUpdateKidSex?.(editingKid.id, kidSexInput); setEditingKid(null); }}
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Edit display name sheet */}
          {editingName && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, padding: '0 16px' }} onClick={() => setEditingName(false)}>
              <div style={{ background: '#F2F4EC', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#2C3828', margin: '0 0 16px' }}>What do the kids call you?</p>
                <input
                  className="input-field"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  placeholder="Mom, Dad, Mama…"
                  style={{ marginBottom: 16, fontSize: 18 }}
                  autoFocus
                />
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleSaveName}>Save</button>
              </div>
            </div>
          )}


          {onCreateBook && (
            <button onClick={onCreateBook} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '14px 18px', background: 'linear-gradient(180deg, #3A4D40 0%, #1E2E24 100%)', border: 'none', borderRadius: 14, cursor: 'pointer', fontFamily: "'Inter', sans-serif", boxShadow: '0 3px 10px rgba(20,35,25,0.38), inset 0 1px 0 rgba(255,255,255,0.08)', transition: 'transform 0.1s ease, box-shadow 0.1s ease, opacity 0.1s ease' }} onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.opacity = '0.88'; }} onMouseUp={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.opacity = ''; }} onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.opacity = ''; }} onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.opacity = '0.88'; }} onTouchEnd={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.opacity = ''; }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="ti ti-book" style={{ fontSize: 18, color: '#C8993E' }} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0 }}>Create a book</p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: '2px 0 0' }}>Turn your letters into print</p>
                </div>
              </div>
              <i className="ti ti-arrow-right" style={{ fontSize: 16, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
            </button>
          )}

          <button onClick={onSignOut} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#9AA89C', fontFamily: "'Inter', sans-serif", padding: '8px 0', fontWeight: 600, alignSelf: 'center' }}>
            Sign out
          </button>
          {onDeleteAccount && (
            <button onClick={() => setShowDeleteConfirm(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#C4A09C', fontFamily: "'Inter', sans-serif", padding: '4px 0', fontWeight: 500, alignSelf: 'center' }}>
              Delete account
            </button>
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
          <div style={{ background: '#F8FAF6', borderRadius: '24px 24px 0 0', padding: '28px 24px 44px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#FEF0ED', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <i className="ti ti-trash" style={{ fontSize: 20, color: '#D4856A' }} />
            </div>
            <p style={{ fontSize: 18, fontWeight: 700, color: '#2C3828', margin: '0 0 8px', textAlign: 'center' }}>Delete your account?</p>
            <p style={{ fontSize: 14, color: '#9AA89C', margin: '0 0 24px', textAlign: 'center', lineHeight: 1.55 }}>
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
          <button onClick={backFn} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 36px', display: 'flex', alignItems: 'center', gap: 6, color: '#9AA89C', fontSize: 13, fontWeight: 600, fontFamily: "'Inter', sans-serif", alignSelf: 'flex-start' }}>
            <i className="ti ti-arrow-left" style={{ fontSize: 16 }} /> Back
          </button>

          {step === 'code' && (
            <>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: '#2C3828', margin: '0 0 10px', lineHeight: 1.2 }}>
                Enter your<br />invite code
              </h2>
              <p style={{ fontSize: 14, color: '#9AA89C', lineHeight: 1.7, margin: '0 0 32px' }}>
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
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: '#2C3828', margin: '0 0 10px', lineHeight: 1.2 }}>
                What do the<br />kids call you?
              </h2>
              <p style={{ fontSize: 14, color: '#9AA89C', lineHeight: 1.7, margin: '0 0 32px' }}>
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

// ─── Cropped photo (book / anywhere needing scroll-accurate crop) ──────────

function CroppedPhoto({ src, cropY = 50, height = 200 }) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);

  function applyScroll() {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;
    const scale = container.offsetWidth / img.naturalWidth;
    const scaledH = img.naturalHeight * scale;
    const extra = scaledH - height;
    if (extra > 0) container.scrollTop = (cropY / 100) * extra;
  }

  return (
    <div ref={containerRef} style={{ height, overflow: 'hidden', flexShrink: 0 }}>
      <img ref={imgRef} src={src} style={{ width: '100%', display: 'block' }} onLoad={applyScroll} alt="" />
    </div>
  );
}

// ─── Book builder ──────────────────────────────────────────────────────────

function BookBuilderScreen({ kids, entries, familyMembers, myDisplayName, onBack, onPreview }) {
  const currentYear = new Date().getFullYear();
  const [selectedKids, setSelectedKids] = useState(kids.map(k => k.id));
  const [dateRange, setDateRange] = useState('all');
  const [customFrom, setCustomFrom] = useState(String(currentYear - 1));
  const [customTo, setCustomTo] = useState(String(currentYear));
  const fromOptions = Array.from(new Set(
    [
      kids.length > 1 ? 'Our family' : null,
      myDisplayName,
      ...(familyMembers || []).map(m => m.display_name),
    ].filter(Boolean)
  ));
  const [authorLabel, setAuthorLabel] = useState(fromOptions[0] || 'Our family');
  const [favoritesOnly, setFavoritesOnly] = useState(true);

  const fromDate = dateRange === 'year' ? `${currentYear}-01-01` : dateRange === 'custom' ? `${customFrom}-01-01` : null;
  const toDate   = dateRange === 'year' ? `${currentYear}-12-31` : dateRange === 'custom' ? `${customTo}-12-31`   : null;

  // Resolve the chosen author to a user_id so we can filter by who wrote each entry
  const isAllAuthors = authorLabel.toLowerCase() === 'our family';
  const authorMember = isAllAuthors ? null : (familyMembers || []).find(m => m.display_name === authorLabel);
  const authorUserId = authorMember?.user_id || null;

  const filtered = entries.filter(e => {
    // Recipient: all selected kids must appear in the entry's kid list
    const kidMatch = selectedKids.length >= kids.length
      ? true
      : e.kids.some(id => selectedKids.includes(id));
    // Author: if a specific author is chosen, only include entries they wrote
    // Entries with no author_id (written before tracking) are included to avoid hiding old content
    const authorMatch = !authorUserId || !e.authorId || e.authorId === authorUserId;
    const afterFrom = !fromDate || e.date >= fromDate;
    const beforeTo  = !toDate   || e.date <= toDate;
    const favoriteMatch = !favoritesOnly || e.favorited;
    return kidMatch && authorMatch && afterFrom && beforeTo && favoriteMatch;
  });

  const kidLabel = selectedKids.length === 0 ? 'nobody'
    : selectedKids.length >= kids.length ? (kids.length > 1 ? 'the family' : kids[0]?.name.split(' ')[0])
    : selectedKids.map(id => kids.find(k => k.id === id)?.name.split(' ')[0]).filter(Boolean).join(' & ');

  const years = Array.from({ length: 11 }, (_, i) => currentYear - i);
  const allKidNames = kids.map(k => k.name.split(' ')[0]);
  const recipientSummary = selectedKids.length >= kids.length
    ? (kids.length > 1
        ? allKidNames.slice(0, -1).join(', ') + ' and ' + allKidNames[allKidNames.length - 1]
        : kids[0]?.name.split(' ')[0] || 'Your child')
    : selectedKids.map(id => kids.find(k => k.id === id)?.name.split(' ')[0]).filter(Boolean).join(' & ');

  const maternalNames = new Set(['mom', 'mama', 'mommy', 'mother', 'mum', 'mummy', 'nana', 'grandma', 'grandmother']);
  const allMemberNames = (familyMembers || [])
    .map(m => m.display_name)
    .sort((a, b) => {
      const aM = maternalNames.has(a.toLowerCase());
      const bM = maternalNames.has(b.toLowerCase());
      if (aM && !bM) return -1;
      if (!aM && bM) return 1;
      return 0;
    });
  const authorSummary = isAllAuthors && allMemberNames.length > 1
    ? allMemberNames.slice(0, -1).join(', ') + ' and ' + allMemberNames[allMemberNames.length - 1]
    : authorLabel;
  const dateSummary = dateRange === 'all'
    ? ''
    : dateRange === 'year'
      ? `Just the letters from ${currentYear}`
      : `${customFrom} through ${customTo}`;

  return (
    <div className="screen" style={{ background: '#F8FAF6' }}>
      <div className="scroll-area">
        <div className="scrollpad">

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-x" /></button>
            <p style={{ fontSize: 12, color: '#9AA89C', margin: 0, fontWeight: 600, letterSpacing: 0.3 }}>Create a book</p>
          </div>

          <div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 27, color: '#2C3828', margin: '0 0 8px', lineHeight: 1.25 }}>
              Let them hold all the little moments you've held.
            </h1>
            <p style={{ fontSize: 14, color: '#9AA89C', margin: 0, lineHeight: 1.6 }}>
              The entries were for you. The book is for them.
            </p>
          </div>

          <div style={{ width: '100%', height: 1, background: '#DDE7D9' }} />

          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#B8CCB4', letterSpacing: 1.3, textTransform: 'uppercase', margin: '0 0 12px' }}>Who's it for?</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {kids.length > 1 && (
                <button className={`chip ${selectedKids.length >= kids.length ? 'selected' : ''}`} onClick={() => setSelectedKids(kids.map(k => k.id))}>
                  Everyone
                </button>
              )}
              {kids.map(k => (
                <button key={k.id} className={`chip ${selectedKids.length === 1 && selectedKids[0] === k.id ? 'selected' : ''}`} onClick={() => setSelectedKids([k.id])}>
                  {k.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          {fromOptions.length > 1 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#B8CCB4', letterSpacing: 1.3, textTransform: 'uppercase', margin: '0 0 12px' }}>Who's it from?</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {fromOptions.map(name => (
                  <button key={name} className={`chip ${authorLabel === name ? 'selected' : ''}`} onClick={() => setAuthorLabel(name)}>
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#B8CCB4', letterSpacing: 1.3, textTransform: 'uppercase', margin: '0 0 12px' }}>Which years?</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[{ id: 'all', label: 'All time' }, { id: 'year', label: String(currentYear) }, { id: 'custom', label: 'Custom' }].map(opt => (
                <button key={opt.id} className={`chip ${dateRange === opt.id ? 'selected' : ''}`} onClick={() => setDateRange(opt.id)}>{opt.label}</button>
              ))}
            </div>
            {dateRange === 'custom' && (
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 11, color: '#9AA89C', margin: '0 0 6px', fontWeight: 600 }}>From</p>
                  <select value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="input-field" style={{ padding: '10px 12px', fontSize: 14 }}>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 11, color: '#9AA89C', margin: '0 0 6px', fontWeight: 600 }}>To</p>
                  <select value={customTo} onChange={e => setCustomTo(e.target.value)} className="input-field" style={{ padding: '10px 12px', fontSize: 14 }}>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              onClick={() => setFavoritesOnly(v => !v)}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#2C3828', margin: 0 }}>Favorites only</p>
                <p style={{ fontSize: 12, color: '#9AA89C', margin: '3px 0 0' }}>Only include entries you've hearted</p>
              </div>
              <div style={{
                width: 44, height: 26, borderRadius: 13, background: favoritesOnly ? '#4A5E50' : '#DDE7D9',
                position: 'relative', transition: 'background 0.2s', flexShrink: 0, cursor: 'pointer'
              }}>
                <div style={{
                  position: 'absolute', top: 3, left: favoritesOnly ? 21 : 3, width: 20, height: 20,
                  borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                }} />
              </div>
            </div>
          </div>

          <div style={{ width: '100%', height: 1, background: '#DDE7D9' }} />

          <div style={{ background: '#2C3828', borderRadius: 18, padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {filtered.length === 0 ? (
              <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 16, color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.6 }}>
                {favoritesOnly ? 'No favorited letters match that selection yet.' : 'No letters match that selection yet.'}
              </p>
            ) : (
              <div>
                <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 17, color: '#fff', margin: '0 0 5px', lineHeight: 1.55 }}>
                  {filtered.length} {favoritesOnly ? 'favorite ' : ''}letter{filtered.length !== 1 ? 's' : ''} from {authorSummary} to {recipientSummary}.
                </p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                  {dateSummary}
                </p>
              </div>
            )}
            <button
              className="btn"
              className={filtered.length === 0 ? 'btn' : 'btn btn-gold'}
              style={{ width: '100%', background: filtered.length === 0 ? 'rgba(255,255,255,0.08)' : undefined, color: filtered.length === 0 ? 'rgba(255,255,255,0.25)' : undefined, borderRadius: 14 }}
              disabled={filtered.length === 0}
              onClick={() => onPreview({ kidIds: selectedKids, fromDate, toDate, bookEntries: filtered, authorLabel, authorSummary, recipientSummary })}
            >
              <i className="ti ti-eye" style={{ fontSize: 16 }} />
              Preview your book
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}


function LetterPage({ entry, index, sortedLength, kids, cropPositions, homeCropPositions, onCrop }) {
  const entryKids = entry.kids.map(id => kids.find(k => k.id === id)).filter(Boolean);
  const salutation = entryKids.map(k => k.name.split(' ')[0]).join(' & ');
  const dateLabel = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const photo = entry.media?.[0]?.type === 'image' ? entry.media[0] : null;
  const cropY = cropPositions[entry.id] ?? homeCropPositions[entry.id] ?? 50;
  const photoRef = useRef(null);
  const photoHeight = 176;
  const charCount = entry.text.length;
  const textFontSize = photo
    ? (charCount < 250 ? 11.5 : charCount < 420 ? 10.5 : charCount < 620 ? 9.5 : charCount < 850 ? 8.5 : 7.5)
    : (charCount < 420 ? 11.5 : charCount < 700 ? 10.5 : charCount < 1050 ? 9.5 : charCount < 1400 ? 8.5 : 7.5);
  return (
    <div style={{ background: '#FDFBF6', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {photo && (
        <div ref={photoRef} style={{ position: 'relative', flexShrink: 0 }} onClick={() => onCrop(entry, photoHeight, photoRef.current?.offsetWidth)}>
          <CroppedPhoto src={photo.url} cropY={cropY} height={photoHeight} />
          <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.4)', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti ti-crop" style={{ fontSize: 12, color: '#fff' }} />
          </div>
        </div>
      )}
      <div style={{ flex: 1, padding: '18px 24px 12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, fontWeight: 700, color: '#C4D8C0', letterSpacing: 1.4, textTransform: 'uppercase', margin: '0 0 10px' }}>{dateLabel}</p>
        <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 14, color: '#4A5E50', margin: '0 0 8px' }}>Dear {salutation},</p>
        <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: textFontSize, color: '#3A3020', lineHeight: 1.72, margin: 0, flex: 1, whiteSpace: 'pre-wrap', overflow: 'hidden' }}>
          {entry.text}
        </p>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, color: '#D4E4D0', textAlign: 'right', margin: '8px 0 0', letterSpacing: 0.5 }}>
          {index + 1} / {sortedLength}
        </p>
        {entry.signedAs && (
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 10.5, color: '#9AA89C', margin: '4px 0 0', textAlign: 'right' }}>
            Love, {entry.signedAs}
          </p>
        )}
        <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 10, color: '#C4D8C0', margin: '8px 0 0', textAlign: 'center' }}>Patina</p>
      </div>
    </div>
  );
}
// ─── Book preview ──────────────────────────────────────────────────────────

function BookPreviewScreen({ kids, bookConfig, onBack, onUpdateCrop }) {
  const { kidIds, fromDate, toDate, bookEntries, authorLabel, authorSummary, recipientSummary } = bookConfig;
  const sorted = [...bookEntries].sort((a, b) => a.date > b.date ? 1 : -1);

  // Build pages array with chapter dividers inserted at year boundaries
  const { contentPages, yearTOC } = useMemo(() => {
    const pages = [];
    const toc = []; // [{ year, pageIndex }]  pageIndex = index within contentPages
    let currentYear = null;
    let letterNum = 0;
    sorted.forEach(entry => {
      const year = entry.date.slice(0, 4);
      if (year !== currentYear) {
        currentYear = year;
        toc.push({ year, pageIndex: pages.length });
        pages.push({ type: 'chapter', year });
      }
      pages.push({ type: 'letter', entry, letterNum: letterNum++ });
    });
    return { contentPages: pages, yearTOC: toc };
  }, [sorted]);

  // page 0 = cover, page 1 = TOC, pages 2..N = content, last = back cover
  const totalPages = contentPages.length + 3;
  const [page, setPage] = useState(0);
  const [cropPositions, setCropPositions] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('patina-book-crop-positions') || '{}');
      const fromEntries = Object.fromEntries(
        bookConfig.bookEntries.filter(e => e.cropY != null).map(e => [e.id, e.cropY])
      );
      return { ...stored, ...fromEntries };
    } catch { return {}; }
  });
  const [homeCropPositions] = useState(() => {
    try { return JSON.parse(localStorage.getItem('patina-crop-positions') || '{}'); } catch { return {}; }
  });
  const [bookCropModal, setBookCropModal] = useState(null);

  function saveBookCrop(y) {
    const next = { ...cropPositions, [bookCropModal.entryId]: y };
    setCropPositions(next);
    try { localStorage.setItem('patina-book-crop-positions', JSON.stringify(next)); } catch {}
    onUpdateCrop?.(bookCropModal.entryId, y);
    setBookCropModal(null);
  }

  const kidNameDisplay = recipientSummary || (kidIds.map(id => kids.find(k => k.id === id)?.name.split(' ')[0]).filter(Boolean).join(' & '));

  const dateRangeLabel = (() => {
    if (!fromDate && !toDate && sorted.length > 0) {
      const first = new Date(sorted[0].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const last  = new Date(sorted[sorted.length - 1].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      return first === last ? first : `${first} – ${last}`;
    }
    if (fromDate && toDate) return `${fromDate.slice(0, 4)} – ${toDate.slice(0, 4)}`;
    return fromDate?.slice(0, 4) || toDate?.slice(0, 4) || '';
  })();


  const renderCoverPage = () => {
    return (
      <div style={{ background: '#4A5E50', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 32px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 6px), repeating-linear-gradient(0deg, rgba(0,0,0,0.02) 0px, rgba(0,0,0,0.02) 1px, transparent 1px, transparent 6px)", pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.1) 100%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.22)' }} />
          <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, letterSpacing: 0.5, color: '#C8993E', margin: 0, lineHeight: 1 }}>Patina</p>
          <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.22)' }} />
          <h1 style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 30, color: '#F8F4EC', margin: 0, lineHeight: 1.25, textAlign: 'center' }}>
            Letters to<br />{kidNameDisplay}
          </h1>
          {authorSummary && authorSummary.toLowerCase() !== kidNameDisplay.toLowerCase() && (
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: 'rgba(255,255,255,0.7)', margin: 0, letterSpacing: 1.2, textTransform: 'uppercase' }}>
              Love, {authorSummary}
            </p>
          )}
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: 'rgba(255,255,255,0.62)', margin: 0, lineHeight: 1.7, textAlign: 'center', maxWidth: 240 }}>
            For all the moments you may have forgotten, and all the things I never want you to forget
          </p>
          {dateRangeLabel && <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: 'rgba(255,255,255,0.48)', margin: 0, letterSpacing: 1 }}>{dateRangeLabel.toUpperCase()}</p>}
        </div>
      </div>
    );
  };

  const renderTOCPage = () => (
    <div style={{ background: '#FDFBF6', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '40px 36px 32px' }}>
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, fontWeight: 700, color: '#C4D8C0', letterSpacing: 1.8, textTransform: 'uppercase', margin: '0 0 28px' }}>Contents</p>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {yearTOC.map(({ year, pageIndex }) => {
          const displayPage = pageIndex + 2 + 1; // +2 for cover+TOC, +1 for 1-based
          return (
            <div
              key={year}
              onClick={() => setPage(pageIndex + 2)}
              style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '10px 0', borderBottom: '1px solid #EEF2EE', cursor: 'pointer' }}
            >
              <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: '#2C3828', fontWeight: 700 }}>{year}</span>
              <span style={{ flex: 1, borderBottom: '1px dotted #C4D8C0', margin: '0 8px 4px' }} />
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#9AA89C', fontWeight: 600 }}>{displayPage}</span>
            </div>
          );
        })}
      </div>
      <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 10, color: '#C4D8C0', margin: '20px 0 0', textAlign: 'center' }}>Patina</p>
    </div>
  );

  const renderChapterPage = (year) => (
    <div style={{ background: '#4A5E50', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 32px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 6px), repeating-linear-gradient(0deg, rgba(0,0,0,0.02) 0px, rgba(0,0,0,0.02) 1px, transparent 1px, transparent 6px)", pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
        <div style={{ width: 40, height: 1, background: 'rgba(255,255,255,0.3)', margin: '0 auto 20px' }} />
        <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 52, color: '#F8F4EC', margin: 0, lineHeight: 1, letterSpacing: -1 }}>{year}</p>
        <div style={{ width: 40, height: 1, background: 'rgba(255,255,255,0.3)', margin: '20px auto 0' }} />
      </div>
      <div style={{ position: 'absolute', bottom: 28, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <img src="/quill-no-background.png" style={{ width: 32, height: 32, opacity: 0.6 }} alt="" />
      </div>
    </div>
  );


  const renderBackCover = () => {
    const weOrI = authorLabel?.toLowerCase() === 'our family' || (authorSummary || '').includes(' and ') ? 'We' : 'I';
    return (
      <div style={{ background: '#4A5E50', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 32px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 6px), repeating-linear-gradient(0deg, rgba(0,0,0,0.02) 0px, rgba(0,0,0,0.02) 1px, transparent 1px, transparent 6px)", pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.1) 100%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: '100%' }}>
          <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: 'rgba(255,255,255,0.85)', margin: 0 }}>Patina</p>
          <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.2)' }} />
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.9, textAlign: 'center' }}>
            Patina is the beauty that comes with age. These letters capture the mark you left on the quiet, seemingly unremarkable days that turned out to matter most. Writing them is our quiet attempt to slow down time—a gift for you to one day hold, and an anchor for us to inhabit today.
          </p>
          <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.2)' }} />
        </div>
        <div style={{ position: 'absolute', bottom: 28, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
          <img src="/quill-no-background.png" style={{ width: 32, height: 32, opacity: 0.6 }} alt="" />
        </div>
      </div>
    );
  };

  const renderPage = () => {
    if (page === 0) return renderCoverPage();
    if (page === 1) return renderTOCPage();
    if (page === totalPages - 1) return renderBackCover();
    const content = contentPages[page - 2];
    if (!content) return null;
    if (content.type === 'chapter') return renderChapterPage(content.year);
    return <LetterPage entry={content.entry} index={content.letterNum} sortedLength={sorted.length} kids={kids} cropPositions={cropPositions} homeCropPositions={homeCropPositions} onCrop={(entry, h, w) => setBookCropModal({ entryId: entry.id, url: entry.media[0].url, cardH: h, photoWidth: w })} />;
  };

  const pageLabel = (() => {
    if (page === 0) return 'Cover';
    if (page === 1) return 'Contents';
    if (page === totalPages - 1) return 'Back cover';
    const content = contentPages[page - 2];
    if (!content) return '';
    if (content.type === 'chapter') return content.year;
    return `Letter ${content.letterNum + 1} of ${sorted.length}`;
  })();

  return (
    <div className="screen" style={{ background: '#1E2820' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', flexShrink: 0 }}>
        <button className="icon-btn-ghost" onClick={onBack}><i className="ti ti-x" /></button>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0, fontWeight: 600 }}>{pageLabel}</p>
        <div style={{ width: 36 }} />
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', minHeight: 0 }}>
        <div style={{ width: '100%', aspectRatio: '3/4', borderRadius: 6, overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.6), 4px 0 0 rgba(0,0,0,0.3)', maxHeight: '100%' }}>
          {renderPage()}
        </div>
      </div>

      <div style={{ padding: '16px 20px 8px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => setPage(p => p === 0 ? totalPages - 1 : p - 1)}
          style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>
          <i className="ti ti-chevron-left" />
        </button>
        <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'rgba(255,255,255,0.4)', borderRadius: 99, width: `${((page + 1) / totalPages) * 100}%`, transition: 'width 0.2s' }} />
        </div>
        <button onClick={() => setPage(p => p === totalPages - 1 ? 0 : p + 1)}
          style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>
          <i className="ti ti-chevron-right" />
        </button>
      </div>

      <div style={{ padding: '0 20px 8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}>Page</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          placeholder={page + 1}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const val = parseInt(e.target.value);
              if (!isNaN(val) && val >= 1 && val <= totalPages) setPage(val - 1);
              e.target.value = '';
              e.target.blur();
            }
          }}
          style={{ width: 52, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '5px 8px', fontSize: 12, color: '#fff', fontFamily: "'Inter', sans-serif", textAlign: 'center', outline: 'none' }}
        />
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}>of {totalPages}</span>
      </div>

      <div style={{ padding: '8px 20px 28px', flexShrink: 0 }}>
        <button className="btn btn-gold" style={{ width: '100%', borderRadius: 14 }}
          onClick={() => alert('Print ordering is coming soon. Your book is ready — we\'ll let you know when you can order!')}>
          <i className="ti ti-shopping-cart" style={{ fontSize: 16 }} />
          Order this book
        </button>
      </div>

      {bookCropModal && (
        <BookCropModal
          url={bookCropModal.url}
          cropY={cropPositions[bookCropModal.entryId] ?? 50}
          cardHeight={bookCropModal.cardH}
          photoWidth={bookCropModal.photoWidth}
          onSave={saveBookCrop}
          onClose={() => setBookCropModal(null)}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────

function NavBar({ active, onNavigate }) {

  const tabs = [
    { id: 'home', icon: 'ti-home', label: 'Home', color: '#F0897A' },
  ];
  const tabsRight = [
    { id: 'recap', icon: 'ti-calendar', label: 'Keepsakes', color: '#F0897A' },
  ];

  function tabStyle(tab) {
    const isActive = active === tab.id;
    return { backgroundColor: isActive ? tab.color : 'transparent', color: isActive ? '#ffffff' : '#A89A85' };
  }

  return (
    <>
      <div className="nav-frame">
        <div className="nav-bar">
          {tabs.map(tab => (
            <button key={tab.id} className="nv-tab" style={tabStyle(tab)} onClick={() => onNavigate(tab.id)}>
              <i className={`ti ${tab.icon}`} />
              <span>{tab.label}</span>
            </button>
          ))}
          <div className="nv-add-wrap">
            <button className="nv-add" onClick={() => onNavigate('new-entry')}><i className="ti ti-plus" /></button>
          </div>
          {tabsRight.map(tab => (
            <button key={tab.id} className="nv-tab" style={tabStyle(tab)} onClick={() => onNavigate(tab.id)}>
              <i className={`ti ${tab.icon}`} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Auth screen ───────────────────────────────────────────────────────────

function AuthScreen() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit() {
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
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#EEF2EA', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <i className="ti ti-mail-check" style={{ fontSize: 32, color: '#4A5E50' }} />
            </div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: '#2C3828', margin: 0 }}>Check your inbox</h2>
            <p style={{ fontSize: 14, color: '#7A8C78', lineHeight: 1.7, margin: 0 }}>
              We sent a confirmation link to<br />
              <strong style={{ color: '#4A5E50' }}>{email}</strong>
            </p>
            <button onClick={() => setCheckEmail(false)} style={{ background: 'none', border: 'none', color: '#4A5E50', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif", marginTop: 8 }}>
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
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, color: '#2C3828', margin: '0 0 10px' }}>Patina</h1>
            <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 15, color: '#7A8C78', margin: 0, textAlign: 'center' }}>
              For all the things you wish they knew.
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
            />
            <input
              className="input-field"
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          {error && (
            <p style={{ fontSize: 13, color: '#D4856A', marginBottom: 12, textAlign: 'center', lineHeight: 1.4 }}>{error}</p>
          )}
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginBottom: 16, opacity: loading || !email || !password ? 0.5 : 1 }}
            disabled={loading || !email || !password}
            onClick={handleSubmit}
          >
            {loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
          <p style={{ textAlign: 'center', fontSize: 13, color: '#9AA89C', margin: 0 }}>
            {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
            <button
              onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4A5E50', fontWeight: 600, fontSize: 13, padding: 0, fontFamily: "'Inter', sans-serif" }}
            >
              {mode === 'signup' ? 'Sign in' : 'Sign up'}
            </button>
          </p>
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
        <button onClick={handleConfirm} style={{ background: '#4A5E50', border: 'none', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, padding: '12px 28px', borderRadius: 12, cursor: 'pointer' }}>
          Use Photo
        </button>
      </div>
    </div>
  );
}

// ─── Onboarding ────────────────────────────────────────────────────────────

const ONBOARDING_LETTER = "Patina is the beauty that comes with age. These letters capture the mark you left on the quiet, seemingly unremarkable days that turned out to matter most. Writing them is our quiet attempt to slow down time—a gift for you to one day hold, and an anchor for us to inhabit today.";

function OnboardingScreen({ onDone, onJoinFamily, onSignOut }) {
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
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveError, setSaveError] = useState('');
  const fileInputRef = useRef(null);

  const [typed, setTyped] = useState(0);
  const [letterDone, setLetterDone] = useState(false);

  useEffect(() => {
    if (letterDone || typed >= ONBOARDING_LETTER.length) { setLetterDone(true); return; }
    const t = setTimeout(() => setTyped(p => p + 1), 22);
    return () => clearTimeout(t);
  }, [typed, letterDone]);

  const kidIndex = doneKids.length;
  const accent = KID_ACCENTS[kidIndex % KID_ACCENTS.length];
  const initial = name.trim() ? name.trim()[0].toUpperCase() : null;

  function goBack() {
    if (step === 'join-or-new') setStep('welcome');
    else if (step === 'name') setStep('join-or-new');
    else if (step === 'birthdate') setStep('name');
    else if (step === 'photo') setStep('birthdate');
    else if (step === 'another') setStep('photo');
    else if (step === 'yourname') setStep('another');
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
    setStep('yourname');
  }

  async function handleReallyDone() {
    setSavingProfile(true);
    setSaveError('');
    const result = await onDone(doneKids, displayName.trim() || 'Parent');
    if (result?.error) {
      setSaveError(result.error);
      setSavingProfile(false);
    }
  }

  return (
    <div className="screen">
      <div className="scroll-area">
        <div style={{ padding: '60px 28px 48px', display: 'flex', flexDirection: 'column', minHeight: 560 }}>

          {step !== 'welcome' && (
            <button onClick={goBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 24px', display: 'flex', alignItems: 'center', gap: 6, color: '#9AA89C', fontSize: 13, fontWeight: 600, fontFamily: "'Inter', sans-serif", alignSelf: 'flex-start' }}>
              <i className="ti ti-arrow-left" style={{ fontSize: 16 }} /> Back
            </button>
          )}

          {!['welcome', 'join-or-new'].includes(step) && (() => {
            const kidFirstNames = [
              ...doneKids.map(k => k.name.split(' ')[0]),
              ...(name.trim() ? [name.trim().split(' ')[0]] : []),
            ];
            const salutation = kidFirstNames.length > 0 ? kidFirstNames.join(' & ') : null;
            return (
              <div style={{ background: '#F8FAF6', border: '1px solid #C4D8C0', borderRadius: 12, padding: '14px 16px 12px', marginBottom: 16 }}>
                <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 11, color: '#9AA89C', margin: '0 0 6px' }}>
                  Dear {salutation
                    ? <span style={{ color: '#2C3828' }}>{salutation},</span>
                    : '___,'}
                </p>
                <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 12, color: '#2C3828', lineHeight: 1.65, margin: '0 0 8px' }}>
                  {ONBOARDING_LETTER}
                </p>
                <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 11, color: '#9AA89C', margin: 0 }}>
                  Love, {displayName.trim()
                    ? <span style={{ color: '#2C3828' }}>{displayName.trim()}</span>
                    : '___'}
                </p>
              </div>
            );
          })()}

          {step === 'welcome' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/icon-192.png" style={{ width: 64, height: 64, borderRadius: 14, display: 'block', marginBottom: 20 }} alt="" />
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, color: '#2C3828', margin: '0 0 8px', lineHeight: 1.1 }}>Patina</h1>
              <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 15, color: '#7A8C78', lineHeight: 1.8, margin: '0 0 32px', textAlign: 'center' }}>
                For all the things you wish they knew.
              </p>
              <div style={{ background: '#F8FAF6', border: '1px solid #C4D8C0', borderRadius: 16, padding: '22px 22px 18px', width: '100%', marginBottom: 32, textAlign: 'left' }}>
                <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 12, color: '#9AA89C', margin: '0 0 10px' }}>Dear Ellie &amp; Miles,</p>
                <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 15, color: '#2C3828', lineHeight: 1.75, margin: '0 0 14px', minHeight: 120 }}>
                  {ONBOARDING_LETTER.slice(0, typed)}
                  {!letterDone && <span style={{ display: 'inline-block', width: 2, height: 15, background: '#4A5E50', marginLeft: 1, verticalAlign: 'middle', animation: 'blink-cursor 0.8s step-end infinite' }} />}
                </p>
                <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 13, color: '#9AA89C', margin: 0 }}>Love, your family</p>
              </div>
              <button className="btn btn-primary" style={{ width: '100%', opacity: letterDone ? 1 : 0.35 }} disabled={!letterDone} onClick={() => setStep('join-or-new')}>
                Begin
              </button>
              {onSignOut && (
                <button onClick={onSignOut} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#B8CCB4', fontFamily: "'Inter', sans-serif", fontWeight: 500, marginTop: 24 }}>
                  Sign out
                </button>
              )}
            </div>
          )}

          {step === 'join-or-new' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: '#2C3828', lineHeight: 1.25, margin: '0 0 14px' }}>
                Ordinary days, extraordinary memories.
              </h2>
              <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 17, color: '#7A8C78', margin: '0 0 28px' }}>
                Is this a new journal?
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setStep('name')}>
                  Yes, start fresh
                </button>
                {onJoinFamily && (
                  <button className="btn btn-outline" style={{ width: '100%' }} onClick={onJoinFamily}>
                    No, I have an invite code
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 'name' && (
            <div style={{ flex: 1 }}>
              {doneKids.length > 0 && (
                <p style={{ fontSize: 13, color: '#9AA89C', marginBottom: 10 }}>
                  {doneKids.map(k => k.name).join(' & ')} {doneKids.length === 1 ? 'is' : 'are'} added. One more?
                </p>
              )}
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: '#2C3828', lineHeight: 1.25, margin: '0 0 10px' }}>
                What's your<br />child's name?
              </h2>
              <p style={{ fontSize: 13, color: '#9AA89C', margin: '0 0 28px' }}>Add one at a time — you can add more after.</p>
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
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: '#2C3828', lineHeight: 1.25, margin: '0 0 36px' }}>
                When was<br />{name} born?
              </h2>
              <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
                <div style={{ position: 'relative', flex: 2.2 }}>
                  <select
                    value={bdMonth}
                    onChange={e => setBdMonth(e.target.value)}
                    style={{
                      width: '100%', border: '1px solid #CCDAC8', borderRadius: 10,
                      padding: '15px 36px 15px 16px', fontSize: 16, outline: 'none',
                      background: '#fff', color: bdMonth ? '#2C3828' : '#9AA89C',
                      fontFamily: "'Inter', sans-serif", appearance: 'none',
                      WebkitAppearance: 'none', cursor: 'pointer',
                    }}
                  >
                    <option value="" disabled>Month</option>
                    {['January','February','March','April','May','June',
                      'July','August','September','October','November','December'].map((m, i) => (
                      <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                    ))}
                  </select>
                  <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#9AA89C', fontSize: 13, pointerEvents: 'none' }} />
                </div>
                <input
                  type="number"
                  placeholder="Day"
                  value={bdDay}
                  min={1} max={31}
                  onChange={e => setBdDay(e.target.value)}
                  style={{
                    flex: 1, border: '1px solid #CCDAC8', borderRadius: 10,
                    padding: '15px 10px', fontSize: 16, outline: 'none',
                    background: '#fff', color: '#2C3828', fontFamily: "'Inter', sans-serif",
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
                    flex: 1.5, border: '1px solid #CCDAC8', borderRadius: 10,
                    padding: '15px 10px', fontSize: 16, outline: 'none',
                    background: '#fff', color: '#2C3828', fontFamily: "'Inter', sans-serif",
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
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: '#2C3828', lineHeight: 1.25, margin: '0 0 8px' }}>
                Add a photo<br />of {name}?
              </h2>
              <p style={{ fontSize: 14, color: '#9AA89C', marginBottom: 40 }}>You can always add one later.</p>
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
                    ? <span style={{ fontSize: 48, fontWeight: 700, color: '#fff', fontFamily: "'Inter', sans-serif" }}>{initial}</span>
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
                    : <span style={{ fontSize: 32, fontWeight: 700, color: '#fff', fontFamily: "'Inter', sans-serif" }}>{initial}</span>
                  }
                </div>
                <p style={{ fontSize: 15, color: '#7A8C78', fontFamily: "'Source Serif 4', serif", fontStyle: 'italic' }}>{name} is all set.</p>
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: '#2C3828', lineHeight: 1.25, margin: '0 0 32px' }}>
                Do you have<br />another child?
              </h2>
              {kidIndex < 3 && (
                <button className="btn btn-outline" style={{ width: '100%', marginBottom: 12 }} onClick={handleAnother}>
                  Yes, add another
                </button>
              )}
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleFinish}>
                No, let's start writing
              </button>
            </div>
          )}

          {step === 'yourname' && (
            <div style={{ flex: 1 }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: '#2C3828', lineHeight: 1.25, margin: '0 0 12px' }}>
                One last thing —
              </h2>
              <p style={{ fontSize: 15, color: '#7A8C78', lineHeight: 1.7, margin: '0 0 32px' }}>
                What do the kids call you?
              </p>
              <input
                className="input-field"
                placeholder="Mom, Dad, Mama…"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleReallyDone()}
                autoFocus
                style={{ fontSize: 20, padding: '16px 18px', marginBottom: 24 }}
              />
              {saveError && (
                <p style={{ fontSize: 13, color: '#D4856A', margin: '0 0 12px', textAlign: 'center', lineHeight: 1.5 }}>{saveError}</p>
              )}
              <button className="btn btn-primary" style={{ width: '100%', opacity: savingProfile ? 0.6 : 1 }} onClick={handleReallyDone} disabled={savingProfile}>
                {savingProfile ? 'Saving…' : 'Start writing'}
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
    </div>
  );
}

// ─── Root App ──────────────────────────────────────────────────────────────

function normalizeEntry(e) {
  return {
    id: e.id,
    kids: e.kid_ids,
    date: e.date,
    text: e.text || '',
    mood: e.mood,
    milestone: e.milestone,
    ageMonths: e.age_months,
    palette: e.palette || PALETTES[0],
    media: (e.entry_media || []).map(m => ({ url: m.url, type: m.type })),
    createdAt: e.created_at || null,
    signedAs: e.signed_as,
    authorId: e.author_id || null,
    favorited: e.favorited || false,
    cropY: e.crop_y ?? null,
    location: e.location || null,
    locationLat: e.location_lat ?? null,
    locationLng: e.location_lng ?? null,
  };
}

export default function App() {
  const localMode = !supabaseConfigured;
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(!localMode);
  const [dataLoading, setDataLoading] = useState(false);
  const [kids, setKids] = useState(() => localMode ? loadLocalData().kids : []);
  const [entries, setEntries] = useState(() => localMode ? loadLocalData().entries : []);
  const [screen, setScreen] = useState('home');
  const journalScrollPos = useRef(0);
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
  const [letterAuthorId, setLetterAuthorId] = useState(null);
  const [unseenPartnerIds, setUnseenPartnerIds] = useState([]);

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
      if (!session) { setKids([]); setEntries([]); }
    });
    return () => subscription.unsubscribe();
  }, [localMode]);

  useEffect(() => {
    if (!localMode || typeof window === 'undefined') return;
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ kids, entries }));
  }, [entries, kids, localMode]);

  // Monthly recap check — show once per month on first open
  useEffect(() => {
    if (entries.length === 0) return;
    const lastMonth = (() => {
      const d = new Date(TODAY + 'T12:00:00');
      d.setMonth(d.getMonth() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    })();
    const seenKey = 'patina-recap-seen';
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
  }, [entries]);

  // Load kids and entries after sign-in
  useEffect(() => {
    if (localMode || !session || !supabase) return;
    setDataLoading(true);
    async function loadData() {
      // Check family membership — always pick the family with the most members (the shared one)
      const { data: memberships } = await supabase
        .from('family_members').select('*').eq('user_id', session.user.id);

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
      if (myMembership) {
        setFamilyId(currentFamilyId);
        setMyDisplayName(myMembership.display_name);
      }

      const [{ data: kidsData, error: kidsError }, { data: entriesData, error: entriesError }] = await Promise.all([
        supabase.from('kids').select('*').order('created_at'),
        supabase.from('entries').select('*, entry_media(*)').order('date', { ascending: false }),
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
        const { data: membersData } = await supabase.from('family_members').select('*').eq('family_id', currentFamilyId);
        if (membersData) setFamilyMembers(membersData);
      }

      if (kidsData) {
        setKids(kidsData.map(k => ({ id: k.id, name: k.name, birthdate: k.birthdate, accent: k.accent || KID_ACCENTS[0], avatar: k.avatar_url, sex: k.sex || null, growthLog: k.growth_log || [] })));
        setProfileKidId(kidsData[0]?.id ?? null);
      }
      if (entriesData) {
        setEntries(entriesData.map(normalizeEntry));
      }
      // Seed last-seen so the badge doesn't fire for all pre-existing entries on first load
      const lsKey = `patina-last-seen-${session.user.id}`;
      if (!localStorage.getItem(lsKey)) localStorage.setItem(lsKey, new Date().toISOString());

      setDataLoading(false);
    }
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  // Background geocode entries that have a location text but no coordinates yet
  const geocodedIdsRef = useRef(new Set());
  useEffect(() => {
    if (localMode || !supabase || !session) return;
    const toGeocode = entries.filter(e => e.location && e.locationLat == null && !geocodedIdsRef.current.has(e.id));
    if (toGeocode.length === 0) return;
    toGeocode.forEach(e => geocodedIdsRef.current.add(e.id));
    const results = {};
    Promise.all(toGeocode.map(async e => {
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
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
      } catch {}
    })).then(() => {
      if (Object.keys(results).length > 0) {
        setEntries(prev => prev.map(en => results[en.id] ? { ...en, locationLat: results[en.id].lat, locationLng: results[en.id].lng } : en));
      }
    });
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
  }, [entries, session?.user?.id]);

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
  useEffect(() => { familyMembersRef.current = familyMembers; }, [familyMembers]);

  useEffect(() => {
    if (localMode || !supabase || !session?.user?.id || !familyId) return;
    const channel = supabase
      .channel(`family-entries-${familyId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'entries', filter: `family_id=eq.${familyId}` }, payload => {
        const row = payload.new;
        if (!row || row.author_id === session.user.id) return;
        const author = familyMembersRef.current.find(m => m.user_id === row.author_id);
        const authorName = author?.display_name || 'Your partner';
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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, familyId]);

  const screenRef = useRef(screen);
  useEffect(() => { screenRef.current = screen; }, [screen]);

  const openEntry = useCallback((entry) => {
    setEntrySource(screenRef.current);
    setActiveEntry(entry);
    setScreen('entry-detail');
  }, []);

  async function handleUpdateCrop(entryId, y) {
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, cropY: y } : e));
    try {
      const stored = JSON.parse(localStorage.getItem('patina-crop-positions') || '{}');
      localStorage.setItem('patina-crop-positions', JSON.stringify({ ...stored, [entryId]: y }));
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
    const entry = entries.find(e => e.id === entryId);
    setEntries(prev => prev.filter(e => e.id !== entryId));
    setScreen('home');
    setActiveEntry(null);
    if (localMode || !supabase || !session) return;
    const paths = storagePathsFromMedia(entry?.media);
    if (paths.length > 0) supabase.storage.from('media').remove(paths).then(() => {});
    await supabase.from('entry_media').delete().eq('entry_id', entryId);
    await supabase.from('entries').delete().eq('id', entryId);
  }

  function editEntry(entry) {
    setActiveEntry(entry);
    setScreen('edit-entry');
  }

  async function handleSaveEntry({ kids: kidIds, text, mood, milestone, media, fileObjects, date, entryId, signedAs, location, locationLat, locationLng }) {
    const primaryKid = kids.find(k => k.id === kidIds[0]);
    const { years, months } = exactAge(primaryKid.birthdate, date);
    const ageMonths = years * 12 + months;

    // ── UPDATE existing entry ──
    if (entryId) {
      if (localMode || !supabase || !session) {
        setEntries(prev => prev.map(e => e.id === entryId ? { ...e, kids: kidIds, text: text || '', mood, milestone, date, ageMonths, media } : e));
        setScreen('home');
        return;
      }
      await supabase.from('entries').update({ kid_ids: kidIds, text: text || '', mood, milestone, date, age_months: ageMonths, signed_as: signedAs || null, location: location || null, location_lat: locationLat ?? null, location_lng: locationLng ?? null }).eq('id', entryId);

      // Fetch old URLs before wiping rows so we can clean up storage after
      const { data: oldMediaRows } = await supabase.from('entry_media').select('url, type').eq('entry_id', entryId);
      await supabase.from('entry_media').delete().eq('entry_id', entryId);
      const finalMedia = [];
      for (let i = 0; i < media.length; i++) {
        let fileObj = fileObjects?.[i];
        let url = media[i].url;
        if (fileObj) {
          try {
            const isVid = fileObj.type.startsWith('video');
            if (!isVid) fileObj = await compressImage(fileObj);
            const mimeType = fileObj.type || (isVid ? 'video/mp4' : 'image/jpeg');
            const ext = isVid
              ? (mimeType === 'video/quicktime' ? 'mov' : mimeType === 'video/webm' ? 'webm' : 'mp4')
              : (fileObj.type === 'image/webp' ? 'webp' : 'jpg');
            const base = `${entryId}-edit${Date.now()}-${i}`;
            const path = `${session.user.id}/${base}.${ext}`;
            const { error } = await supabase.storage.from('media').upload(path, fileObj, { contentType: mimeType });
            if (!error) {
              const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path);
              url = publicUrl;
              if (isVid && media[i].thumbnail) {
                try {
                  const thumbBlob = dataUrlToBlob(media[i].thumbnail);
                  await supabase.storage.from('media').upload(`${session.user.id}/${base}-thumb.jpg`, thumbBlob, { contentType: 'image/jpeg' });
                } catch {}
              }
            }
          } catch {}
        }
        finalMedia.push({ url, type: media[i].type });
      }
      if (finalMedia.length > 0) {
        await supabase.from('entry_media').insert(finalMedia.map(m => ({ entry_id: entryId, url: m.url, type: m.type })));
      }
      // Remove old storage files that are no longer referenced
      const newUrls = new Set(finalMedia.map(m => m.url));
      const oldPaths = storagePathsFromMedia((oldMediaRows || []).filter(m => !newUrls.has(m.url)));
      if (oldPaths.length > 0) supabase.storage.from('media').remove(oldPaths).then(() => {});
      setEntries(prev => prev.map(e => e.id === entryId ? { ...e, kids: kidIds, text: text || '', mood, milestone, date, ageMonths, media: finalMedia, signedAs: signedAs || null, location: location || null, locationLat: locationLat ?? null, locationLng: locationLng ?? null } : e));
      setScreen('home');
      return;
    }

    // ── CREATE new entry ──
    const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];

    if (localMode || !supabase || !session) {
      const newEntry = {
        id: Date.now(),
        kids: kidIds,
        date,
        createdAt: new Date().toISOString(),
        text: text || '',
        mood,
        milestone,
        ageMonths,
        palette,
        media: media.map(item => ({ url: item.url, type: item.type })),
      };
      setEntries(prev => [newEntry, ...prev]);
      if (milestone) {
        setCelebration({ kid: primaryKid, milestoneType: milestone });
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
    }).select().single();

    if (error || !entry) {
      alert('Could not save your entry. Please try again.\n' + (error?.message || ''));
      return;
    }

    const savedMedia = [];
    for (let i = 0; i < media.length; i++) {
      const item = media[i];
      let fileObj = fileObjects?.[i];
      let url = item.url;
      if (fileObj) {
        try {
          if (!fileObj.type.startsWith('video')) fileObj = await compressImage(fileObj);
          const mimeType = fileObj.type || 'video/mp4';
          const ext = mimeType.startsWith('video/')
            ? (mimeType.includes('quicktime') ? 'mov' : mimeType.includes('webm') ? 'webm' : 'mp4')
            : fileObj.type === 'image/webp' ? 'webp' : 'jpg';
          const path = `${session.user.id}/${entry.id}-${i}.${ext}`;
          const { error: uploadError } = await supabase.storage.from('media').upload(path, fileObj, { contentType: mimeType });
          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path);
            url = publicUrl;
            if (mimeType.startsWith('video/') && item.thumbnail) {
              try {
                const thumbBlob = dataUrlToBlob(item.thumbnail);
                const thumbPath = `${session.user.id}/${entry.id}-${i}-thumb.jpg`;
                await supabase.storage.from('media').upload(thumbPath, thumbBlob, { contentType: 'image/jpeg' });
              } catch {}
            }
          } else {
            console.error('Media upload error:', uploadError.message);
          }
        } catch (e) {
          console.error('Media upload exception:', e);
        }
      }
      savedMedia.push({ url, type: item.type });
    }

    if (savedMedia.length > 0) {
      await supabase.from('entry_media').insert(savedMedia.map(m => ({ entry_id: entry.id, url: m.url, type: m.type })));
    }

    const newEntry = { id: entry.id, kids: kidIds, date, createdAt: entry.created_at || new Date().toISOString(), text: text || '', mood, milestone, ageMonths, palette, media: savedMedia, signedAs: signedAs || null, location: location || null, locationLat: locationLat ?? null, locationLng: locationLng ?? null };
    setEntries(prev => [newEntry, ...prev]);

    if (milestone) {
      setCelebration({ kid: primaryKid, milestoneType: milestone });
    } else {
      setScreen('home');
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
    const ext = file.name?.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${activeUserId}/avatar-${kidId}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('media').upload(path, file);
    if (uploadError) {
      setKids(prev => prev.map(k => k.id === kidId ? { ...k, avatar: previousAvatar } : k));
      const hint = uploadError.message?.includes('row-level security')
        ? ' Your account may not be fully signed in on this device yet. Try signing out and back in, then retry.'
        : '';
      alert('Photo upload failed: ' + uploadError.message + hint);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path);
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

  async function handleDeleteAccount() {
    if (!supabase || !session) return;
    const userId = session.user.id;
    const hasPartner = familyId && familyMembers.filter(m => m.user_id !== userId).length > 0;
    try {
      if (hasPartner) {
        // Leave family — keep all entries/kids so partner still sees them
        await supabase.from('family_members').delete().eq('family_id', familyId).eq('user_id', userId);
      } else {
        // Solo account — full wipe
        const { data: files } = await supabase.storage.from('media').list(userId);
        if (files && files.length > 0) {
          await supabase.storage.from('media').remove(files.map(f => `${userId}/${f.name}`));
        }
        await supabase.from('entries').delete().eq('user_id', userId);
        await supabase.from('kids').delete().eq('user_id', userId);
        if (familyId) {
          await supabase.from('family_members').delete().eq('family_id', familyId).eq('user_id', userId);
        }
      }
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

  async function handleOnboardingDone(newKids, displayName = 'Parent') {
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
    if (existingMemberships?.length > 0) return { success: true };
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
      setKids(data.map(k => ({ id: k.id, name: k.name, birthdate: k.birthdate, accent: k.accent, avatar: k.avatar_url })));
      setProfileKidId(data[0]?.id ?? null);
    }
    return { success: true };
  }

  async function handleJoinFamily(code, displayName) {
    if (!supabase || !session) return { error: 'Not authenticated' };
    const { data: invite } = await supabase
      .from('family_invites').select('*')
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
      supabase.from('kids').select('*').order('created_at'),
      supabase.from('entries').select('*, entry_media(*)').order('date', { ascending: false }),
      supabase.from('family_members').select('*').eq('family_id', invite.family_id),
    ]);
    if (kidsData) {
      setKids(kidsData.map(k => ({ id: k.id, name: k.name, birthdate: k.birthdate, accent: k.accent || KID_ACCENTS[0], avatar: k.avatar_url })));
      setProfileKidId(kidsData[0]?.id ?? null);
    }
    if (entriesData) {
      setEntries(entriesData.map(normalizeEntry));
    }
    if (membersData) setFamilyMembers(membersData);
    setScreen('home');
    return { success: true };
  }

  async function handleInvitePartner() {
    if (!familyId || !supabase || !session) return null;
    const token = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { error } = await supabase.from('family_invites').insert({
      family_id: familyId, invited_by: session.user.id, token,
    });
    return error ? null : token;
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
    await supabase.from('family_members').update({ display_name: name })
      .eq('family_id', familyId).eq('user_id', session.user.id);
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
    const ext = file.name?.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${activeUserId}/family-avatar-${memberId}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('media').upload(path, file);
    if (uploadError) {
      setFamilyMembers(prev => prev.map(m => (m.id === memberId || m.user_id === memberId) ? { ...m, avatar_url: previousAvatar } : m));
      const hint = uploadError.message?.includes('row-level security')
        ? ' Your account may not be fully signed in on this device yet. Try signing out and back in, then retry.'
        : '';
      alert('Photo upload failed: ' + uploadError.message + hint);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path);
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
    }
    setAvatarUploading(false);
  }

  if (authLoading || dataLoading) {
    return (
      <div className="app-root" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <i className="ti ti-loader-2" style={{ fontSize: 32, color: '#9AA89C', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (!session && !localMode) {
    return (
      <div className="app-root">
        <AuthScreen />
      </div>
    );
  }

  if (kids.length === 0) {
    return (
      <div className="app-root">
        {joiningFamily
          ? <JoinFamilyScreen onJoin={handleJoinFamily} onBack={() => setJoiningFamily(false)} />
          : <OnboardingScreen onDone={handleOnboardingDone} onJoinFamily={() => setJoiningFamily(true)} onSignOut={() => supabase ? supabase.auth.signOut() : undefined} />
        }
      </div>
    );
  }

  return (
    <div className="app-root">
      {partnerToast && (
        <PartnerToast
          toast={partnerToast}
          onView={() => { setLetterAuthorId(partnerToast.entry.authorId); setScreen('partner-letters'); setPartnerToast(null); }}
          onDismiss={() => setPartnerToast(null)}
        />
      )}
      {screen === 'home' && (() => {
        const partnerMember = familyMembers.find(m => m.user_id !== session?.user?.id) || null;
        const selfMember = familyMembers.find(m => m.user_id === session?.user?.id) || null;
        return (
          <HomeScreen
            entries={entries}
            kids={kids}
            kidFilter={kidFilter}
            setKidFilter={setKidFilter}
            onOpenEntry={openEntry}
            onSearch={() => setScreen('search')}
            onManage={() => openProfile(kids[0].id)}
            onAddMoment={() => setScreen('new-entry')}
            onSeeAll={() => setScreen('journal')}
            onCompare={() => setScreen('compare')}
            onUpdateCrop={handleUpdateCrop}
            unseenPartnerIds={unseenPartnerIds}
            familyMembers={familyMembers}
            currentUserId={session?.user?.id}
            onSeePartnerLetters={() => { setLetterAuthorId(partnerMember?.user_id || null); setScreen('partner-letters'); }}
            onSeeMyLetters={() => { setLetterAuthorId(session?.user?.id || null); setScreen('partner-letters'); }}
            partner={partnerMember}
            self={selfMember}
          />
        );
      })()}

      {screen === 'partner-letters' && (() => {
        const authorMember = familyMembers.find(m => m.user_id === letterAuthorId);
        const partnerMember = familyMembers.find(m => m.user_id !== session?.user?.id);
        return (
          <PartnerLettersScreen
            entries={entries}
            kids={kids}
            unseenIds={unseenPartnerIds}
            authorName={authorMember?.display_name || partnerMember?.display_name || ''}
            authorId={letterAuthorId}
            currentUserId={session?.user?.id}
            onBack={() => setScreen('home')}
            onOpenEntry={(entry) => { markPartnerEntrySeen(entry.id); openEntry(entry); }}
            onMarkAllRead={markAllSeen}
          />
        );
      })()}

      {screen === 'journal' && (
        <JournalScreen
          entries={entries}
          kids={kids}
          kidFilter={kidFilter}
          setKidFilter={setKidFilter}
          onOpenEntry={openEntry}
          onNewEntry={() => setScreen('new-entry')}
          memberCount={familyMembers.length}
          scrollPos={journalScrollPos}
        />
      )}

      {screen === 'entry-detail' && activeEntry && (
        <EntryDetailScreen
          entry={activeEntry}
          kid={kids.find(k => k.id === activeEntry.kids[0])}
          allKids={kids}
          onBack={() => setScreen(entrySource)}
          onEdit={editEntry}
          onToggleFavorite={handleToggleFavorite}
          onDelete={handleDeleteEntry}
          onUpdateCrop={handleUpdateCrop}
          onUpdateLocation={handleUpdateLocation}
        />
      )}

      {screen === 'new-entry' && (
        <NewEntryScreen kids={kids} onCancel={() => setScreen('home')} onSave={handleSaveEntry} signedDefault={myDisplayName || undefined} draftKey={session?.user?.id ? `patina-new-draft-${session.user.id}` : 'patina-new-draft'} />
      )}

      {screen === 'edit-entry' && activeEntry && (
        <NewEntryScreen
          kids={kids}
          existingEntry={activeEntry}
          onCancel={() => setScreen('entry-detail')}
          onSave={handleSaveEntry}
          onDelete={handleDeleteEntry}
          signedDefault={myDisplayName || undefined}
        />
      )}

      {screen === 'recap' && (
        <RecapScreen
          entries={entries}
          kids={kids}
          onBack={() => setScreen('home')}
          onOpenEntry={openEntry}
          onCompare={() => setScreen('compare')}
        />
      )}

      {screen === 'compare' && (
        <CompareScreen entries={entries} kids={kids} onBack={() => setScreen('home')} onOpenEntry={openEntry} />
      )}

      {screen === 'search' && (
        <SearchScreen entries={entries} kids={kids} onBack={() => setScreen('home')} onOpenEntry={openEntry} />
      )}

      {screen === 'book-builder' && (
        <BookBuilderScreen
          kids={kids}
          entries={entries}
          familyMembers={familyMembers}
          myDisplayName={myDisplayName}
          onBack={() => setScreen('profile')}
          onPreview={config => { setBookConfig(config); setScreen('book-preview'); }}
        />
      )}

      {screen === 'book-preview' && bookConfig && (
        <BookPreviewScreen
          kids={kids}
          bookConfig={bookConfig}
          onBack={() => setScreen('book-builder')}
          onUpdateCrop={handleUpdateCrop}
        />
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
          onAddKid={handleAddKid}
          onRenameKid={handleRenameKid}
          onUpdateKidSex={handleUpdateKidSex}
          onFamilyAvatarUpload={handleFamilyAvatarUpload}
          avatarUploading={avatarUploading}
          currentUserId={session?.user?.id}
          onOpenGrowth={kidId => { setGrowthKidId(kidId); setScreen('growth'); }}
          onCreateBook={() => setScreen('book-builder')}
          onDeleteAccount={localMode ? undefined : handleDeleteAccount}
          hasPartner={familyMembers.filter(m => m.user_id !== session?.user?.id).length > 0}
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
            supabase.auth.signOut();
          }}
        />
      )}

      {screen === 'growth' && growthKidId && (() => {
        const kid = kids.find(k => k.id === growthKidId);
        return kid ? (
          <GrowthScreen
            kid={kid}
            onBack={() => setScreen('profile')}
            onSave={entry => handleSaveGrowthEntry(growthKidId, entry)}
            onDelete={date => handleDeleteGrowthEntry(growthKidId, date)}
          />
        ) : null;
      })()}

      {screen !== 'entry-detail' && screen !== 'new-entry' && screen !== 'edit-entry' && screen !== 'profile' && screen !== 'growth' && screen !== 'book-builder' && screen !== 'book-preview' && (
        <NavBar active={screen} onNavigate={setScreen} />
      )}
      {(screen === 'profile' || screen === 'growth' || screen === 'book-builder') && <NavBar active="home" onNavigate={setScreen} />}

      {celebration && (
        <CelebrationOverlay
          kid={celebration.kid}
          milestoneType={celebration.milestoneType}
          onDone={() => { setCelebration(null); setScreen('journal'); }}
        />
      )}

      {monthlyRecap && (
        <div style={{ position: 'absolute', inset: 0, background: '#2C3828', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '0 32px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(200,153,62,0.8)', letterSpacing: 1.6, textTransform: 'uppercase', margin: '0 0 16px' }}>{monthlyRecap.label}</p>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, color: '#fff', textAlign: 'center', margin: '0 0 10px', lineHeight: 1.25 }}>
            The days are long, but the years are short.
          </h1>
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 16, color: 'rgba(255,255,255,0.5)', textAlign: 'center', margin: '0 0 40px', lineHeight: 1.6 }}>
            They're lucky to have you.
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
            style={{ border: 'none', borderRadius: 14, padding: '15px 40px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}
          >
            Keep going
          </button>
        </div>
      )}
    </div>
  );
}
