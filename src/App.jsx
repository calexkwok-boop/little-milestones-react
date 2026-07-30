import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback, memo, lazy, Suspense } from 'react';
import { Icon } from './icons';
import { createPortal } from 'react-dom';
import './App.css';
// exifr is only needed when reading photo metadata — lazy-load so it's excluded from the initial bundle
let _exifr = null;
const loadExifr = () => _exifr ?? (_exifr = import('exifr').then(m => m.default));
import { supabase, supabaseConfigured } from './supabase.js';
import { SessionCtx, DataCtx, NotifCtx, useSession, useData, useNotif } from './contexts.js';
import KidThumb from './KidThumb.jsx';
import SectionSwitcher from './SectionSwitcher.jsx';
import { Coachmark } from './Coachmark.jsx';
const LazyAuthScreen = lazy(() => import('./screens/AuthScreen'));
const LazyUpdatePasswordScreen = lazy(() => import('./screens/UpdatePasswordScreen'));
const LazyJoinFamilyScreen = lazy(() => import('./screens/JoinFamilyScreen'));
const LazyOnboardingScreen = lazy(() => import('./screens/OnboardingScreen'));
const LazyCircleFeedScreen = lazy(() => import('./screens/CircleFeedScreen'));
const LazyFriendsScreen = lazy(() => import('./screens/FriendsScreen'));
const LazyCompareScreen = lazy(() => import('./screens/CompareScreen'));
const LazyPartnerLettersScreen = lazy(() => import('./screens/PartnerLettersScreen'));
const LazySearchScreen = lazy(() => import('./screens/SearchScreen'));
const LazyProfileScreen = lazy(() => import('./screens/ProfileScreen'));
const LazyPrivacyPolicyScreen = lazy(() => import('./screens/PrivacyPolicyScreen'));
const LazyTermsScreen = lazy(() => import('./screens/TermsScreen'));
const LazyBirthdaySlideshowScreen = lazy(() => import('./screens/BirthdaySlideshowScreen'));
const LazyMonthlyReelScreen = lazy(() => import('./screens/MonthlyReelScreen'));
const LazyReelEditScreen = lazy(() => import('./screens/ReelEditScreen'));
import RecapScreen from './screens/RecapScreen';
import SavedReelsScreen from './screens/SavedReelsScreen';
const LazyGrowthScreen = lazy(() => import('./screens/GrowthScreen'));
const LazyPatinaJarScreen = lazy(() => import('./screens/PatinaJarScreen'));
const LazyPatinaJarRecordScreen = lazy(() => import('./screens/PatinaJarRecordScreen'));
const LazyBookPreviewScreen = lazy(() => import('./screens/BookPreviewScreen'));
const LazyNotificationHistoryScreen = lazy(() => import('./screens/NotificationHistoryScreen'));
const LazySharedEntryScreen = lazy(() => import('./screens/SharedEntryScreen'));
const LazySharedReelScreen = lazy(() => import('./screens/SharedReelScreen'));
import BookBuilderScreen from './screens/BookBuilderScreen';
import SameAgeMatchScreen from './screens/SameAgeMatchScreen';
import {
  KIDS_INITIAL, ENTRIES_INITIAL, KID_ACCENTS, PROMPT_ACCENT,
  MOODS, MILESTONE_TYPES, PALETTES, TODAY, AMAZON_GIFT_FALLBACK_URL,
  ageLabel, exactAge, exactAgeLabel, milestoneInfo, entryBgStyle, tintedScrimStyle, photoCropY, cloudinaryTransform, sameAgeSides, sameAgeDaysApart, videoThumbUrl,
  AVATAR_TRANSFORM_SM, AVATAR_TRANSFORM_LG, VIDEO_DELIVERY_TRANSFORM, getAuthRedirectUrl, timeAgo, daysUntilBirthday,
} from './constants.js';
import usePullToRefresh from './usePullToRefresh.jsx';
import triggerPush from './triggerPush.js';
import CroppedImg, { CroppedBg, useImageCropPosition } from './CroppedImg.jsx';
import useLongPress from './useLongPress.js';
import JournalEntryRow from './JournalEntryRow.jsx';
import KidChip from './KidChip.jsx';

// Used for note/prompt cards tagging more than one kid — a card "about everyone"
// shouldn't borrow any single kid's color, so it gets a warm neutral instead.
const MULTI_KID_ACCENT = '#9C9284';
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

// notification_log.url is written server-side as `/?open=<entryId>` (see
// send-push/index.ts buildPayload) — pulls the entryId back out for tap-through.
function entryIdFromNotifUrl(url) {
  const m = /\?open=([^&]+)/.exec(url || '');
  return m ? m[1] : null;
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
          <Icon name="ti-map-pin" style={{ fontSize: 12, color: 'var(--text-2)', flexShrink: 0 }} />
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
          {value && <button onMouseDown={e => e.preventDefault()} onClick={() => { onChange(''); setSuggestions([]); onChangeCoords?.(null, null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex' }}><Icon name="ti-x" style={{ fontSize: 11 }} /></button>}
        </div>
        {hasSuggestions && (
          <div style={{ position: 'absolute', top: '100%', left: 0, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '0 8px 8px 8px', overflow: 'hidden', zIndex: 50, boxShadow: '0 4px 16px rgba(44,56,40,0.12)', minWidth: 220 }}>
            {suggestions.map((s, i) => (
              <div key={i} onMouseDown={e => { e.preventDefault(); pick(s); }} style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text)', cursor: 'pointer', borderBottom: i < suggestions.length - 1 ? '1px solid #F0F4EE' : 'none', display: 'flex', alignItems: 'center', gap: 7 }}>
                <Icon name="ti-map-pin" style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }} />
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
        <Icon name="ti-map-pin" style={{ color: 'var(--text-muted)', fontSize: 15, flexShrink: 0 }} />
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
        {value ? <button onMouseDown={e => e.preventDefault()} onClick={() => { onChange(''); setSuggestions([]); onChangeCoords?.(null, null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}><Icon name="ti-x" style={{ fontSize: 14 }} /></button> : null}
      </div>
      {hasSuggestions && (
        <div style={inline ? {
          border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden', background: 'var(--bg-input)',
        } : {
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', zIndex: 50, boxShadow: '0 4px 16px rgba(44,56,40,0.12)', maxHeight: 200, overflowY: 'auto',
        }}>
          {suggestions.map((s, i) => (
            <div key={i} onMouseDown={e => { e.preventDefault(); pick(s); }} style={{ padding: '12px 14px', fontSize: 14, color: 'var(--text)', cursor: 'pointer', borderBottom: i < suggestions.length - 1 ? '1px solid #F0F4EE' : 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="ti-map-pin" style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }} />
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const CROP_PREVIEW_TARGETS = [
  { label: 'Note', w: 84, h: 40 },
  { label: 'Letter', w: 84, h: 50 },
  { label: 'Book', w: 40, h: 40 },
];

function CropModal({ url, cropY, cardHeight, onSave, onClose }) {
  const scrollRef = useRef(null);
  const imgRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [liveCropY, setLiveCropY] = useState(cropY);
  const rafRef = useRef(null);
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // `cropY` means "this % down the photo should stay centered wherever it's shown" — not a raw
  // scroll position — so cards of other heights (a 140px note thumb vs this editor's frame) can
  // re-center that same focus point correctly. Convert to/from this editor's own scroll position here.
  function scrollToCropY(y) {
    const img = imgRef.current;
    const container = scrollRef.current;
    if (!img || !container) return;
    const scale = container.offsetWidth / img.naturalWidth;
    const scaledH = img.naturalHeight * scale;
    const extra = scaledH - cardHeight;
    if (extra > 0) {
      const focusPx = (y / 100) * scaledH;
      container.scrollTop = Math.min(extra, Math.max(0, focusPx - cardHeight / 2));
    }
  }

  function computeLiveCropY() {
    const img = imgRef.current;
    const container = scrollRef.current;
    if (!img || !container || !img.naturalWidth) return cropY;
    const scale = container.offsetWidth / img.naturalWidth;
    const scaledH = img.naturalHeight * scale;
    const focusPx = container.scrollTop + cardHeight / 2;
    return scaledH > 0 ? Math.min(100, Math.max(0, (focusPx / scaledH) * 100)) : 50;
  }

  function handleLoad() {
    setLoaded(true);
    scrollToCropY(cropY);
    setLiveCropY(computeLiveCropY());
  }

  function handleScroll() {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setLiveCropY(computeLiveCropY());
    });
  }

  function handleSave() {
    onSave(Math.round(computeLiveCropY()));
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <p style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', fontSize: 13, margin: '0 0 14px', fontFamily: 'Inter, sans-serif' }}>
        Scroll to reposition
      </p>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ height: cardHeight, overflowY: 'scroll', WebkitOverflowScrolling: 'touch', margin: '0 0' }}
      >
        <img ref={imgRef} src={url} style={{ width: '100%', display: 'block' }} onLoad={handleLoad} alt="" loading="lazy" />
      </div>
      {loaded && (
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', padding: '16px 24px 0' }}>
          {CROP_PREVIEW_TARGETS.map(p => (
            <div key={p.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ width: p.w, height: p.h, borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.18)' }}>
                <CroppedImg src={url} cropY={liveCropY} />
              </div>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: 0.5 }}>{p.label}</span>
            </div>
          ))}
        </div>
      )}
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
            <img ref={mediaRef} src={isVideo ? videoThumbUrl(url) : url} style={{ width: '100%', display: 'block' }} onLoad={handleReady} alt="" loading="lazy" />
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

// Auto-stops a playing inline video once its container scrolls out of the
// viewport, so a card the user scrolled past doesn't keep playing (audio and
// all) behind whatever they scrolled to next. Only watches while `active` is
// true, so idle feed cards don't each carry a live observer.
function useVideoAutoPause(containerRef, active, onLeave) {
  useEffect(() => {
    if (!active) return;
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) onLeave();
    }, { threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

function QuickActionSheet({ entry, allKids, onClose, onFavorite, onShare, onDelete, isOwn = true }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const preview = (entry.text || '').replace(/^dear\s+[\w\s,&]+[,.]?\s*/i, '').trim();
  const actions = [
    { icon: entry.favorited ? 'ti-star-filled' : 'ti-star', label: entry.favorited ? 'Remove from favorites' : 'Add to favorites', color: entry.favorited ? '#C8993E' : 'var(--text)', fn: onFavorite },
    // Share-link and delete touch content/ownership, not just the shared
    // "favorited" flag, so they stay author-only — same rule as the full
    // entry-detail action sheet.
    isOwn && { icon: 'ti-link', label: 'Share link', color: 'var(--text)', fn: onShare },
    isOwn && { icon: 'ti-trash', label: 'Delete', color: '#D4856A', fn: () => setConfirmingDelete(true) },
  ].filter(Boolean);
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
                <Icon name={icon} style={{ fontSize: 20, color, width: 24, textAlign: 'center' }} />
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
  const cardH = featured ? 240 : 160;
  const photoRef = useRef(null);
  const lp = useLongPress(onLongPress ? () => onLongPress(entry) : null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  useVideoAutoPause(photoRef, videoPlaying, () => setVideoPlaying(false));
  const cleanText = entry.text.replace(/^dear\s+[\w\s,&]+[,.]?\s*/i, '').trim();
  const preview = cleanText.length > 70 ? cleanText.slice(0, 70) + '…' : cleanText;
  const dateLabel = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div onClick={lp.wrapClick(onClick)} onTouchStart={lp.onTouchStart} onTouchMove={lp.onTouchMove} onTouchEnd={lp.onTouchEnd} style={{ position: 'relative', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 2px 8px rgba(44,56,40,0.08)' }}>
      {entry.shared === false && (
        <div style={{ position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }} title="Private">
          <Icon name="ti-lock" style={{ color: '#fff', fontSize: 12 }} />
        </div>
      )}
      {entry.media && entry.media.length === 1 && (
        <div
          ref={photoRef}
          onClick={e => { if (lp.didFire.current) { lp.didFire.current = false; return; } e.stopPropagation(); onClick?.(); }}
          style={{ position: 'relative', height: cardH, overflow: 'hidden', cursor: 'pointer' }}
        >
          {entry.media[0].type === 'video' ? (
            <div style={{ width: '100%', height: '100%', position: 'relative', background: '#1a1a1a' }}>
              {videoPlaying ? (
                <CroppedVideo src={entry.media[0].url} poster={videoThumbUrl(entry.media[0].url, 'so_0,w_800,e_sharpen:60,q_auto,f_auto')} cropY={photoCropY(entry.media, 0, entry)} autoPlay playsInline controls style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onClick={e => e.stopPropagation()} />
              ) : (
                <>
                  <CroppedImg src={videoThumbUrl(entry.media[0].url, 'so_0,w_800,e_sharpen:60,q_auto,f_auto')} cropY={photoCropY(entry.media, 0, entry)} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { e.stopPropagation(); setVideoPlaying(true); }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="ti-player-play-filled" style={{ color: '#fff', fontSize: 14 }} />
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : <CroppedImg src={cloudinaryTransform(entry.media[0].url, 'w_800,e_sharpen:60,q_auto,f_auto')} cropY={photoCropY(entry.media, 0, entry)} fade />
          }
        </div>
      )}
      {entry.media && entry.media.length > 1 && (
        <div
          onClick={e => { if (lp.didFire.current) { lp.didFire.current = false; return; } e.stopPropagation(); onClick?.(); }}
          style={{ display: 'flex', gap: 2, overflowX: 'auto', height: cardH, cursor: 'pointer' }}
        >
          {entry.media.map((item, i) => (
            <div key={i} style={{ flexShrink: 0, width: cardH * (4 / 3), height: cardH, position: 'relative' }}>
              <FeedMediaThumb item={item} cropY={photoCropY(entry.media, i, entry)} transform="w_800,e_sharpen:60,q_auto,f_auto" />
            </div>
          ))}
        </div>
      )}
      <div style={{ padding: '10px 14px 12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: preview ? 6 : 0 }}>
          {(allKids ? entry.kids.map(id => allKids.find(k => k.id === id)).filter(Boolean) : [kid]).map(k => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <KidThumb kid={k} size={18} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {exactAgeLabel(k.birthdate, entry.date)} · {dateLabel}
              </span>
            </div>
          ))}
        </div>
        {preview && (
          <p style={{
            fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {preview}
          </p>
        )}
      </div>
    </div>
  );
});


function AmazonIcon({ size = 13, aColor = 'currentColor', arrowColor = '#FF9900', style }) {
  return (
    <svg width={size} height={size * (38 / 32)} viewBox="0 0 32 38" fill="none" style={{ display: 'inline-block', flexShrink: 0, ...style }}>
      <text x="16" y="24" textAnchor="middle" fontFamily="Arial, 'Helvetica Neue', Helvetica, sans-serif" fontWeight="800" fontSize="30" fill={aColor} style={{ transform: 'scaleY(1.1) scaleX(0.88)', transformOrigin: '16px 12px' }}>a</text>
      <path d="M3 30 C 9 36.5 23 36.5 29 29" stroke={arrowColor} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M24 27 L29.5 28.8 L26 35.5" stroke={arrowColor} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CroppedVideo({ src, poster, cropY = 50, style, ...props }) {
  const videoRef = useRef(null);
  const objY = useImageCropPosition(poster, cropY, videoRef);
  // Always mounted (native poster attribute, not a poster/video swap), so on
  // scrolling out of view just pause it directly rather than unmounting.
  useVideoAutoPause(videoRef, true, () => videoRef.current?.pause());
  return <video ref={videoRef} src={cloudinaryTransform(src, VIDEO_DELIVERY_TRANSFORM)} poster={poster} style={{ ...style, objectPosition: `center ${objY}%` }} {...props} />;
}

const FeedMediaThumb = memo(function FeedMediaThumb({ item, cropY = 50, transform }) {
  const [playing, setPlaying] = useState(false);
  const containerRef = useRef(null);
  useVideoAutoPause(containerRef, playing, () => setPlaying(false));
  if (item.type !== 'video') {
    return <CroppedImg src={cloudinaryTransform(item.url, transform)} cropY={cropY} />;
  }
  if (playing) {
    return (
      <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
        <CroppedVideo src={item.url} poster={videoThumbUrl(item.url, `so_0,${transform}`)} cropY={cropY} autoPlay controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} onClick={e => e.stopPropagation()} />
      </div>
    );
  }
  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }} onClick={e => { e.stopPropagation(); setPlaying(true); }}>
      <CroppedImg src={videoThumbUrl(item.url, `so_0,${transform}`)} cropY={cropY} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="ti-player-play-filled" style={{ color: '#fff', fontSize: 12 }} />
        </div>
      </div>
    </div>
  );
});

const NoteCard = memo(function NoteCard({ entry, kid, allKids, featured = true, onClick, onLongPress }) {
  const lp = useLongPress(onLongPress ? () => onLongPress(entry) : null);
  const entryKids = (allKids ? entry.kids.map(id => allKids.find(k => k.id === id)).filter(Boolean) : [kid]).filter(Boolean);
  const sides = allKids ? sameAgeSides(entry, allKids) : null;
  const accent = sides ? PROMPT_ACCENT : entryKids.length > 1 ? MULTI_KID_ACCENT : (entryKids[0]?.accent || kid?.accent || KID_ACCENTS[0]);
  const tintBg = hexToRgba(accent, 0.13);
  const tintBorder = hexToRgba(accent, 0.3);
  const tintFold = hexToRgba(accent, 0.48);
  const seed = String(entry.id).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const rotation = ((seed % 7) - 3) * 0.45;
  const dateLabel = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const previewLen = featured ? 200 : 90;
  const preview = entry.text.length > previewLen ? entry.text.slice(0, previewLen) + '…' : entry.text;
  const photoH = featured ? 140 : 92;

  return (
    <div
      onClick={lp.wrapClick(onClick)} onTouchStart={lp.onTouchStart} onTouchMove={lp.onTouchMove} onTouchEnd={lp.onTouchEnd}
      style={{ position: 'relative', background: tintBg, border: `1px solid ${tintBorder}`, borderRadius: 13, padding: featured ? '15px 17px 13px' : '12px 13px 11px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.07)', transform: `rotate(${rotation}deg)` }}
    >
      <div style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderStyle: 'solid', borderWidth: '0 15px 15px 0', borderColor: `transparent ${tintFold} transparent transparent`, borderRadius: '0 13px 0 0' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: featured ? 8 : 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name={sides ? 'ti-arrows-diff' : 'ti-notebook'} style={{ fontSize: featured ? 12 : 10, color: accent }} />
          <span style={{ fontSize: featured ? 10 : 9, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: accent }}>{sides ? 'Same age note' : 'Note'}</span>
        </div>
        {entry.shared === false && <Icon name="ti-lock" style={{ fontSize: featured ? 12 : 10, color: accent }} title="Private" />}
      </div>
      <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: featured ? 15 : 12.5, lineHeight: 1.5, color: 'var(--text)', margin: featured ? '0 0 12px' : '0 0 8px', whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {preview}
      </p>
      {entry.media?.length === 1 && (
        <div style={{ marginBottom: featured ? 12 : 8, borderRadius: 10, overflow: 'hidden', height: photoH }}>
          <FeedMediaThumb item={entry.media[0]} cropY={photoCropY(entry.media, 0, entry)} transform="w_500,q_auto,f_auto" />
        </div>
      )}
      {entry.media?.length > 1 && (
        <div style={{ marginBottom: featured ? 12 : 8, display: 'flex', gap: 2, overflowX: 'auto', height: photoH, borderRadius: 10 }}>
          {entry.media.map((m, i) => (
            <div key={i} style={{ flexShrink: 0, width: photoH * (4 / 3), height: photoH, position: 'relative' }}>
              <FeedMediaThumb item={m} cropY={photoCropY(entry.media, i, entry)} transform="w_800,e_sharpen:60,q_auto,f_auto" />
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {entryKids.map(k => {
          const kidDate = entry.sameAgeDates?.[k.id] ?? entry.date;
          return (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: k.accent || KID_ACCENTS[0], flexShrink: 0 }} />
              <KidThumb kid={k} size={featured ? 18 : 15} />
              <span style={{ fontSize: featured ? 11 : 10, color: 'var(--text-muted)' }}>
                {exactAgeLabel(k.birthdate, kidDate)} &middot; {new Date(kidDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          );
        })}
        {sides && (() => {
          const daysApart = sameAgeDaysApart(sides);
          return (
            <span style={{ fontSize: featured ? 10.5 : 9.5, fontWeight: 600, color: accent, marginTop: 2 }}>
              {daysApart === 0 ? 'Exact same age' : `${daysApart} day${daysApart !== 1 ? 's' : ''} apart`}
            </span>
          );
        })()}
      </div>
    </div>
  );
});

const PromptCard = memo(function PromptCard({ entry, kid, allKids, featured = true, onClick, onLongPress }) {
  const lp = useLongPress(onLongPress ? () => onLongPress(entry) : null);
  const dateLabel = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const entryKids = (allKids ? entry.kids.map(id => allKids.find(k => k.id === id)).filter(Boolean) : [kid]).filter(Boolean);
  const sides = allKids ? sameAgeSides(entry, allKids) : null;
  const previewLen = featured ? 200 : 90;
  const preview = entry.text.length > previewLen ? entry.text.slice(0, previewLen) + '…' : entry.text;
  const photoH = featured ? 140 : 92;

  return (
    <div
      onClick={lp.wrapClick(onClick)} onTouchStart={lp.onTouchStart} onTouchMove={lp.onTouchMove} onTouchEnd={lp.onTouchEnd}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 2px 8px rgba(44,56,40,0.08)' }}
    >
      <div style={{ background: PROMPT_ACCENT, padding: featured ? '13px 17px' : '10px 13px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: featured ? 6 : 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name={sides ? 'ti-arrows-diff' : 'ti-bulb'} style={{ fontSize: featured ? 13 : 11, color: 'rgba(255,255,255,0.9)' }} />
            <span style={{ fontSize: featured ? 10 : 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>{sides ? 'Same age prompt' : 'Prompt'}</span>
          </div>
          {entry.shared === false && <Icon name="ti-lock" style={{ fontSize: featured ? 12 : 10, color: 'rgba(255,255,255,0.9)' }} title="Private" />}
        </div>
        <p style={{
          fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: featured ? 15 : 12, lineHeight: 1.4, color: '#fff', margin: 0,
          ...(featured ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
        }}>
          {entry.prompt}
        </p>
      </div>
      <div style={{ padding: featured ? '14px 17px 13px' : '11px 13px 10px' }}>
        <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: featured ? 15 : 12.5, lineHeight: 1.5, color: 'var(--text)', margin: featured ? '0 0 12px' : '0 0 8px', whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {preview}
        </p>
        {entry.media?.length === 1 && (
          <div style={{ marginBottom: featured ? 12 : 8, borderRadius: 10, overflow: 'hidden', height: photoH }}>
            <FeedMediaThumb item={entry.media[0]} cropY={photoCropY(entry.media, 0, entry)} transform="w_500,q_auto,f_auto" />
          </div>
        )}
        {entry.media?.length > 1 && (
          <div style={{ marginBottom: featured ? 12 : 8, display: 'flex', gap: 2, overflowX: 'auto', height: photoH, borderRadius: 10 }}>
            {entry.media.map((m, i) => (
              <div key={i} style={{ flexShrink: 0, width: photoH * (4 / 3), height: photoH, position: 'relative' }}>
                <FeedMediaThumb item={m} cropY={photoCropY(entry.media, i, entry)} transform="w_800,e_sharpen:60,q_auto,f_auto" />
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {entryKids.map(k => {
            const kidDate = entry.sameAgeDates?.[k.id] ?? entry.date;
            return (
              <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <KidThumb kid={k} size={featured ? 18 : 15} />
                <span style={{ fontSize: featured ? 11 : 10, color: 'var(--text-muted)' }}>
                  {exactAgeLabel(k.birthdate, kidDate)} &middot; {new Date(kidDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            );
          })}
          {sides && (() => {
            const daysApart = sameAgeDaysApart(sides);
            return (
              <span style={{ fontSize: featured ? 10.5 : 9.5, fontWeight: 600, color: PROMPT_ACCENT, marginTop: 2 }}>
                {daysApart === 0 ? 'Exact same age' : `${daysApart} day${daysApart !== 1 ? 's' : ''} apart`}
              </span>
            );
          })()}
        </div>
      </div>
    </div>
  );
});

const OnThisDayCard = memo(function OnThisDayCard({ entry, kid, allKids, yearsAgo, onClick, cropY = 50 }) {
  const cardH = 250;
  const photoRef = useRef(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  useVideoAutoPause(photoRef, videoPlaying, () => setVideoPlaying(false));
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
            <Icon name="ti-lock" style={{ color: '#fff', fontSize: 12 }} />
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
                  <CroppedVideo src={entry.media[0].url} poster={videoThumbUrl(entry.media[0].url, 'so_0,w_1600,e_sharpen:60,q_auto,f_auto')} cropY={photoCropY(entry.media, 0, entry)} autoPlay playsInline controls style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onClick={e => e.stopPropagation()} />
                ) : (
                  <>
                    <CroppedImg src={videoThumbUrl(entry.media[0].url, 'so_0,w_1600,e_sharpen:60,q_auto,f_auto')} cropY={photoCropY(entry.media, 0, entry)} onError={e => { e.target.style.display = 'none'; }} />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { e.stopPropagation(); setVideoPlaying(true); }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="ti-player-play-filled" style={{ color: '#fff', fontSize: 14 }} />
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : <CroppedImg src={cloudinaryTransform(entry.media[0].url, 'w_800,e_sharpen:60,q_auto,f_auto')} cropY={photoCropY(entry.media, 0, entry)} fade />
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
  if (entry.type === 'note' && entry.prompt) return <PromptCard entry={entry} kid={kid} allKids={allKids} featured={featured} onClick={onClick} onLongPress={onLongPress} />;
  if (entry.type === 'note') return <NoteCard entry={entry} kid={kid} allKids={allKids} featured={featured} onClick={onClick} onLongPress={onLongPress} />;
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

// One cell per entry, photo or not — mirrors RecapScreen's RecapGridCell so
// Home's "Recent"/"Recently added" lists read as the same kind of dense grid
// as Keepsakes → Recap, rather than the old stacked full-width letter cards.
function HomeGridCell({ entry, onOpenEntry }) {
  const m = entry.milestone ? milestoneInfo(entry.milestone) : null;
  const media = entry.media?.[0];
  const isVideo = media?.type === 'video';
  return (
    <div
      onClick={() => onOpenEntry(entry)}
      style={{ aspectRatio: '1', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', position: 'relative', background: media ? 'var(--bg-card)' : entry.palette.bg, boxShadow: m ? '0 0 0 2px #C8993E' : 'none' }}
    >
      {media ? (
        <>
          {isVideo ? (
            <CroppedImg src={videoThumbUrl(media.url, 'so_0,w_240,q_auto,f_auto')} cropY={photoCropY(entry.media, 0, entry)} fade />
          ) : (
            <CroppedImg src={cloudinaryTransform(media.url, 'w_240,q_auto,f_auto')} cropY={photoCropY(entry.media, 0, entry)} fade />
          )}
          {isVideo && (
            <div style={{ position: 'absolute', bottom: 5, right: 5, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="ti-player-play-filled" style={{ fontSize: 8, color: '#fff' }} />
            </div>
          )}
        </>
      ) : (
        <div style={{ padding: '9px 8px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, lineHeight: 0.6, color: entry.palette.tint, opacity: 0.55 }}>"</span>
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 10, lineHeight: 1.4, margin: '5px 0 0', color: entry.palette.tint, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }}>
            {(entry.text || '').slice(0, 100)}
          </p>
        </div>
      )}
      {m && (
        <Icon name="ti-star-filled" style={{ position: 'absolute', top: 5, right: 5, fontSize: 13, color: '#C8993E', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }} />
      )}
    </div>
  );
}

// Circular avatar filter row, styled after RecapScreen's kid-filter circles —
// replaces KidSelector's pill chips on Home specifically (KidSelector stays
// as-is for Journal/other screens that still use the pill style).
function HomeKidFilter({ kids, selected, onSelect, unseenKidIds }) {
  return (
    <div className="scrollx" style={{ gap: 12, justifyContent: kids.length <= 4 ? 'center' : 'flex-start' }}>
      <button
        onClick={() => onSelect(null)}
        style={{ width: 48, height: 48, borderRadius: '50%', border: selected === null ? '2.5px solid var(--accent)' : '2px solid var(--border)', background: selected === null ? 'var(--accent)' : 'var(--bg-input)', color: selected === null ? '#fff' : 'var(--text-muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', flexShrink: 0 }}
      >All</button>
      {kids.map(kid => (
        <button
          key={kid.id}
          onClick={() => onSelect(kid.id)}
          style={{ position: 'relative', width: 48, height: 48, borderRadius: '50%', border: selected === kid.id ? '2.5px solid var(--accent)' : '2px solid transparent', padding: 0, cursor: 'pointer', flexShrink: 0, opacity: selected !== null && selected !== kid.id ? 0.4 : 1, transition: 'opacity 0.15s, border-color 0.15s' }}
        >
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden' }}>
            <KidThumb kid={kid} size={48} />
          </div>
          {unseenKidIds?.has(kid.id) && (
            <span style={{ position: 'absolute', top: -1, right: -1, width: 11, height: 11, borderRadius: '50%', background: '#E05C6A', border: '2px solid var(--bg)' }} />
          )}
        </button>
      ))}
      {kids.length >= 2 && (
        <button
          onClick={() => onSelect('both')}
          style={{ width: 48, height: 48, borderRadius: '50%', border: selected === 'both' ? '2.5px solid var(--accent)' : '2px solid var(--border)', background: selected === 'both' ? 'var(--accent)' : 'var(--bg-input)', color: selected === 'both' ? '#fff' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <Icon name="ti-users" style={{ fontSize: 16 }} />
        </button>
      )}
    </div>
  );
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Aggregate stats for the monthly recap card — pure function over already-loaded
// entries (no query), so it's cheap to recompute live for any month, past or
// present, and automatically picks up entries backfilled after the fact.
function computeMonthRecap(entriesList, month) {
  const monthEntries = entriesList.filter(e => e.date.startsWith(month));
  const milestones = monthEntries.filter(e => e.milestone).length;
  const photos = monthEntries.reduce((sum, e) => sum + (e.media?.length || 0), 0);
  const favorites = monthEntries.filter(e => e.favorited).length;
  const label = new Date(month + '-15T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return { label, letters: monthEntries.length, milestones, photos, favorites };
}

// Same as computeMonthRecap, but for an arbitrary date range instead of a
// calendar month — a custom "saved reel" spanning e.g. a trip that crosses a
// month boundary. `startDate`/`endDate` are ISO 'YYYY-MM-DD', inclusive, and
// compare correctly as plain strings. `label` is caller-supplied since an
// arbitrary range has no single natural label the way a month does.
function computeRangeRecap(entriesList, startDate, endDate, label) {
  const rangeEntries = entriesList.filter(e => e.date >= startDate && e.date <= endDate);
  const milestones = rangeEntries.filter(e => e.milestone).length;
  const photos = rangeEntries.reduce((sum, e) => sum + (e.media?.length || 0), 0);
  const favorites = rangeEntries.filter(e => e.favorited).length;
  return { label, letters: rangeEntries.length, milestones, photos, favorites };
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
  const slot = Math.floor(d.getHours() / 2) * 2;
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

function HomeScreen({ onOpenEntry, onSearch, kidFilter, setKidFilter, onAddMoment, onSeeAll, onCompare, onUpdateCrop, self, onRefresh, onToggleFavorite, onDeleteEntry, friendEntries = [], friendKids = [], friends = [], friendFamilyMap = {}, onCompareAtAge, pendingOpenEntryId, onClearPendingOpen, onAvatarUpload, initialCircleViewer = null, onClearInitialCircleViewer, onBirthdayNextWeekClick, onBirthdayTodayClick, onFriendBirthdayClick, onStartPrompt, onUpdateKidWishlist, onGenerateShareLink }) {
  const [quickToast, setQuickToast] = useState(null);
  function showQuickToast(msg) {
    setQuickToast(msg);
    setTimeout(() => setQuickToast(null), 1800);
  }
  async function handleQuickShareLink(entry) {
    if (!onGenerateShareLink) return;
    const token = await onGenerateShareLink(entry);
    if (!token) { showQuickToast('Could not create link'); return; }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?shared=${token}`);
      showQuickToast('Link copied!');
    } catch { showQuickToast('Could not copy link'); }
  }
  const { entries, kids } = useData() ?? {};
  const { unseenPartnerIds = [], reactionCounts = {}, pendingRequestCount = 0, circleBadge = 0, birthdayNotifications = [], onDismissBirthday } = useNotif() ?? {};
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
  const [viewerPlayingIdx, setViewerPlayingIdx] = useState(null); // which same-age side's video is playing, if any
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
  const [wishlistPromptKid, setWishlistPromptKid] = useState(null);
  const [wishlistPromptInput, setWishlistPromptInput] = useState('');
  const scrollRef = useRef(null);
  const ptr = usePullToRefresh(scrollRef, onRefresh);

  useEffect(() => {
    function scheduleRefresh() {
      const now = new Date();
      const nextSlotHour = (Math.floor(now.getHours() / 2) + 1) * 2;
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
    setViewerPlayingIdx(null);
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
      if (circleViewer.entry.userId) triggerPush({ targetUserId: circleViewer.entry.userId, kind: 'like', entryId, fromName: socialName, kidNames: circleViewer.kidLabel });
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
    if (circleViewer.entry.userId) triggerPush({ targetUserId: circleViewer.entry.userId, kind: parentId ? 'reply' : 'comment', entryId: circleViewer.entry.id, fromName: socialName, commentPreview: body });
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


  // Which kid pills get the "new letter" dot — every kid tagged on an entry
  // a family member (not me) wrote that I haven't opened yet. Tapping that
  // kid's pill already filters the feed to just them, which is where the
  // new letter actually lives — no separate banner/screen needed.
  const unseenKidIds = useMemo(() => {
    const set = new Set();
    if (unseenPartnerIds.length === 0) return set;
    const unseenSet = new Set(unseenPartnerIds);
    entries.forEach(e => { if (unseenSet.has(e.id)) e.kids?.forEach(id => set.add(id)); });
    return set;
  }, [entries, unseenPartnerIds]);

  const onThisDay = useMemo(() => entries
    .filter(e => e.date.slice(5) === todayMMDD && parseInt(e.date.slice(0, 4)) < todayYear
      && (kidFilter === null || (kidFilter === 'both' ? e.kids.length >= 2 : e.kids.includes(kidFilter))))
    .sort((a, b) => new Date(b.date) - new Date(a.date)),
  [entries, todayMMDD, todayYear, kidFilter]);

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

  // Nudge toward whichever kid has gone quietest lately (by recency of their last
  // entry, not lifetime volume — an older kid naturally has more entries but isn't
  // necessarily "more written about right now"). Only shows once someone's actually
  // overdue, and never repeats a prompt already answered for that specific kid.
  const promptOfDay = useMemo(() => {
    const activeKidsForPrompt = kids.filter(k => !k.archivedAt);
    if (activeKidsForPrompt.length === 0) return null;
    const now = Date.now();
    const gaps = activeKidsForPrompt.map(kid => {
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

  const birthdayToday = useMemo(() => kids.filter(k => k.birthdate && !k.archivedAt && daysUntilBirthday(k.birthdate) === 0), [kids]);
  const birthdayTodayIds = useMemo(() => new Set(birthdayToday.map(k => k.id)), [birthdayToday]);
  // Anywhere in the final week counts, not just exactly 7 days out — a birthday
  // 3 days away should still surface the banner, not just the 7-day and day-of marks.
  const birthdayNextWeek = useMemo(() => kids.filter(k => { if (k.archivedAt) return false; const d = daysUntilBirthday(k.birthdate); return d > 0 && d <= 7; }), [kids]);
  const friendBirthdaysToday = useMemo(() => friendKids.filter(k => k.birthdate && daysUntilBirthday(k.birthdate) === 0), [friendKids]);
  const friendBirthdayNextWeek = useMemo(() => friendKids.filter(k => { if (!k.birthdate) return false; const d = daysUntilBirthday(k.birthdate); return d > 0 && d <= 7; }), [friendKids]);

  // "Recent" and "Recently added" already claim these entries at the top of the
  // feed, so the look-back sections below must not pull the same post back in.
  const recentAndAddedIds = useMemo(() => new Set([...recent, ...recentlyAdded].map(e => e.id)), [recent, recentlyAdded]);

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
    const pool = entries.filter(e => e.type !== 'note' && new Date(e.date + 'T12:00:00') < cutoff
      && !recentAndAddedIds.has(e.id)
      && (kidFilter === null || (kidFilter === 'both' ? e.kids.length >= 2 : e.kids.includes(kidFilter))));
    if (pool.length === 0) return null;
    return pool.reduce((best, e) => onceUponATimeScore('letter', e.id) > onceUponATimeScore('letter', best.id) ? e : best);
  }, [entries, onThisDay, currentSlot, kidFilter, recentAndAddedIds]);

  const onceUponATimeNote = useMemo(() => {
    if (onThisDay.length > 0) return null;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const pool = entries.filter(e => e.type === 'note' && new Date(e.date + 'T12:00:00') < cutoff
      && !recentAndAddedIds.has(e.id)
      && (kidFilter === null || (kidFilter === 'both' ? e.kids.length >= 2 : e.kids.includes(kidFilter))));
    if (pool.length === 0) return null;
    return pool.reduce((best, e) => onceUponATimeScore('note', e.id) > onceUponATimeScore('note', best.id) ? e : best);
  }, [entries, onThisDay, currentSlot, kidFilter, recentAndAddedIds]);

  const sameAgeGroups = useMemo(() => {
    if (kids.length < 2) return null;
    const kidItems = kids.map(kid => ({
      kid,
      items: entries
        .filter(e => e.kids[0] === kid.id && e.media?.length > 0 && !recentAndAddedIds.has(e.id))
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
  }, [entries, kids, recentAndAddedIds]);

  // Deterministic per-2-hour-slot pick, same approach as onceUponATimeScore above —
  // otherwise a plain Math.random() re-rolls on every mount (i.e. every time you
  // navigate away and back), not just once per slot.
  const sameAgeGroup = useMemo(() => {
    if (!sameAgeGroups || sameAgeGroups.length === 0) return null;
    const h = onceUponATimeScore('sameAge-pick', sameAgeGroups.length);
    return sameAgeGroups[h % sameAgeGroups.length];
  }, [sameAgeGroups, currentSlot]);

  // "Once upon a time" and "At the same age" both compete for the same kind of home-feed
  // real estate (a nostalgic look-back), so only show one per visit instead of stacking both —
  // alternating by the existing 2-hour slot so each still gets airtime over the course of a day.
  // "On this day" is an exact-anniversary match and stays independent/always-shown when present.
  const lookBackChoice = useMemo(() => {
    const hasOnce = !!(onceUponATime || onceUponATimeNote);
    const hasSameAge = !!sameAgeGroup && (!kidFilter || kidFilter === 'both');
    if (!hasOnce && !hasSameAge) return null;
    if (hasOnce && !hasSameAge) return 'once';
    if (!hasOnce && hasSameAge) return 'sameAge';
    const s = currentSlot.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return s % 2 === 0 ? 'once' : 'sameAge';
  }, [onceUponATime, onceUponATimeNote, sameAgeGroup, kidFilter, currentSlot]);

  const Header = () => {
    const scoped = entries.filter(e => kidFilter === null || (kidFilter === 'both' ? e.kids.length >= 2 : e.kids.includes(kidFilter)));
    const letterCount = scoped.filter(e => e.type !== 'note').length;
    const noteCount = scoped.filter(e => e.type === 'note').length;
    return (
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 6px' }}>{todayLabel}</p>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, color: '#C8993E', margin: 0, fontWeight: 700 }}>Patina</h1>
        {letterCount > 0 && (
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '4px 0 0', fontFamily: "'Source Serif 4', serif", fontStyle: 'italic' }}>
            {letterCount} letter{letterCount !== 1 ? 's' : ''}{noteCount > 0 ? ` · ${noteCount} note${noteCount !== 1 ? 's' : ''}` : ''}
          </p>
        )}
      </div>
    );
  };

  if (entries.length === 0) {
    const prompt = 'For all the things you wish they knew, and all the moments you never want to forget.';
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
                      ? <img src={cloudinaryTransform(k.avatar, 'w_232,h_232,c_fill,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
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
                        <Icon name={opt.icon} style={{ fontSize: 20, color: 'var(--accent)', width: 24 }} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 16, color: 'var(--text-3)', lineHeight: 1.7, textAlign: 'center', margin: 0 }}>{prompt}</p>

              <button onClick={onAddMoment} className="btn btn-primary" style={{ width: '100%' }}>
                <Icon name="ti-pencil" style={{ fontSize: 17 }} />
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
            <HomeKidFilter kids={kids} selected={kidFilter} onSelect={setKidFilter} unseenKidIds={unseenKidIds} />
          )}

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
                  ? <img src={cloudinaryTransform(k.avatar, AVATAR_TRANSFORM_SM)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" loading="lazy" />
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
                <Icon name="ti-player-play-filled" style={{ fontSize: 13, color: '#C8993E' }} />
              </div>
            </div>
          ))}

          {birthdayNextWeek.filter(k => !dismissedBdays[`${k.id}-${turningAge(k.birthdate)}`]).map(k => (
            <div key={k.id} onClick={() => onBirthdayNextWeekClick?.(k, turningAge(k.birthdate))} style={{ background: 'var(--bg-nav)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', position: 'relative' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(200,153,62,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="ti-cake" style={{ fontSize: 20, color: '#C8993E' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', margin: '0 0 2px' }}>
                  {k.name}'s {ordinal(turningAge(k.birthdate))} birthday is in one week!
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                  Write something special for the occasion
                </p>
              </div>
              {onUpdateKidWishlist && !k.wishlistUrl && (
                <button
                  onClick={e => { e.stopPropagation(); setWishlistPromptKid(k); setWishlistPromptInput(''); }}
                  style={{ background: 'rgba(200,153,62,0.12)', border: '1px solid rgba(200,153,62,0.3)', borderRadius: '50%', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                  title={`Add ${k.name}'s Amazon wishlist`}
                >
                  <AmazonIcon size={13} aColor="var(--text)" />
                </button>
              )}
              <button onClick={e => { e.stopPropagation(); dismissBirthday(k.id, turningAge(k.birthdate)); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 4, flexShrink: 0, lineHeight: 1 }}>
                <Icon name="ti-x" />
              </button>
            </div>
          ))}

          {wishlistPromptKid && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', zIndex: 30, display: 'flex', alignItems: 'flex-end' }} onClick={() => setWishlistPromptKid(null)}>
              <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', width: '100%', padding: '20px 20px 32px' }} onClick={e => e.stopPropagation()}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 18px' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <AmazonIcon size={16} aColor="var(--text)" />
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Add {wishlistPromptKid.name}'s wishlist</p>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
                  Friends will see a link to shop for {wishlistPromptKid.name} near their birthday.
                </p>
                <input
                  className="input-field"
                  value={wishlistPromptInput}
                  onChange={e => setWishlistPromptInput(e.target.value)}
                  placeholder="https://www.amazon.com/hz/wishlist/ls/..."
                  style={{ marginBottom: 16, fontSize: 14 }}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setWishlistPromptKid(null)}>Skip</button>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1, opacity: wishlistPromptInput.trim() ? 1 : 0.5 }}
                    disabled={!wishlistPromptInput.trim()}
                    onClick={() => { onUpdateKidWishlist?.(wishlistPromptKid.id, wishlistPromptInput.trim()); setWishlistPromptKid(null); }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {friendBirthdayNextWeek.filter(k => !dismissedBdays[`${k.id}-${turningAge(k.birthdate)}`]).map(k => (
            <div
              key={k.id}
              onClick={() => window.open(k.wishlistUrl || AMAZON_GIFT_FALLBACK_URL, '_blank', 'noopener,noreferrer')}
              style={{ background: 'var(--bg-nav)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', position: 'relative' }}
            >
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(200,153,62,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="ti-cake" style={{ fontSize: 20, color: '#C8993E' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', margin: '0 0 2px' }}>
                  {k.name}'s birthday is in one week!
                </p>
                {k.wishlistUrl ? (
                  <p style={{ fontSize: 12, color: '#C8993E', margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <AmazonIcon size={14} aColor="var(--text)" />
                    View gift ideas on Amazon
                  </p>
                ) : (
                  <p style={{ fontSize: 12, color: '#C8993E', margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <AmazonIcon size={14} aColor="var(--text)" />
                    Shop gift ideas on Amazon
                  </p>
                )}
              </div>
              <button onClick={e => { e.stopPropagation(); dismissBirthday(k.id, turningAge(k.birthdate)); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 4, flexShrink: 0, lineHeight: 1 }}>
                <Icon name="ti-x" />
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
                <Icon name="ti-bulb" style={{ fontSize: 14, color: '#C8993E', flexShrink: 0 }} />
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
                <Icon name="ti-refresh" style={{ fontSize: 13 }} />
              </button>
              <button
                onClick={() => { setPromptDismissed(true); try { localStorage.setItem('patina-prompt-of-day-dismissed', todayString()); } catch {} }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', flexShrink: 0 }}
              >
                <Icon name="ti-x" style={{ fontSize: 13 }} />
              </button>
            </div>
          )}

          {lookBackChoice === 'once' && (() => {
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

          {lookBackChoice === 'sameAge' && (
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
                  <Icon name="ti-arrow-right" style={{ fontSize: 14, color: 'var(--accent)' }} />
                </button>
              )}
            </div>
          )}

          {recent.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SectionDivider label="Recent" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {recent.map(entry => <HomeGridCell key={entry.id} entry={entry} onOpenEntry={handleOpenEntry} />)}
              </div>
              {entries.length > 3 && (
                <button onClick={onSeeAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-3)', fontFamily: "'Urbanist', sans-serif", fontWeight: 600, padding: '4px 0', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  See all letters <Icon name="ti-arrow-right" style={{ fontSize: 13 }} />
                </button>
              )}
            </div>
          )}

          {recentlyAdded.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SectionDivider label="Recently added" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {recentlyAdded.map(entry => <HomeGridCell key={entry.id} entry={entry} onOpenEntry={handleOpenEntry} />)}
              </div>
            </div>
          )}


          {(circleSnapshot.length > 0 || friendBirthdaysToday.length > 0) && (() => {
            const sharedMoments = circleSnapshot;
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Just a glimpse</span>
                  {friendBirthdaysToday.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(200,153,62,0.12)', border: '1px solid rgba(200,153,62,0.3)', borderRadius: 999, padding: '2px 7px' }}>
                      <Icon name="ti-cake" style={{ fontSize: 10, color: '#C8993E' }} />
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
                      <div key={`bday-${k.id}`} onClick={() => { birthdayNotifications.filter(n => n.kidId === k.id).forEach(n => onDismissBirthday?.(n.id)); onFriendBirthdayClick?.(k); }} style={{ width: 136, flexShrink: 0, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(200,153,62,0.35)', background: 'linear-gradient(160deg, #2A4035 0%, #3A5548 100%)', display: 'flex', flexDirection: 'column', cursor: 'pointer' }}>
                        <div style={{ height: 136, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 10px', position: 'relative' }}>
                          <button
                            onClick={e => { e.stopPropagation(); window.open(k.wishlistUrl || AMAZON_GIFT_FALLBACK_URL, '_blank', 'noopener,noreferrer'); }}
                            style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.35)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            title={k.wishlistUrl ? `${k.name}'s Amazon wishlist` : 'Shop gift ideas on Amazon'}
                          >
                            <AmazonIcon size={14} aColor="#fff" />
                          </button>
                          <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(200,153,62,0.5)', background: k.accent || '#4A5E50', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {k.avatar
                              ? <img src={cloudinaryTransform(k.avatar, AVATAR_TRANSFORM_SM)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" loading="lazy" />
                              : <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 18, color: '#fff' }}>{k.name?.charAt(0)}</span>
                            }
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(200,153,62,0.15)', border: '1px solid rgba(200,153,62,0.3)', borderRadius: '50%', width: 28, height: 28 }}>
                            <Icon name="ti-player-play-filled" style={{ fontSize: 11, color: '#C8993E' }} />
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
                              ? <img src={cloudinaryTransform(friendAvatar, AVATAR_TRANSFORM_SM)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
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
          isOwn={longPressEntry.userId === currentUserId}
          onClose={() => setLongPressEntry(null)}
          onFavorite={() => { onToggleFavorite?.(longPressEntry.id); setLongPressEntry(null); }}
          onShare={() => { handleQuickShareLink(longPressEntry); setLongPressEntry(null); }}
          onDelete={() => { setLongPressEntry(null); onDeleteEntry?.(longPressEntry.id); }}
        />
      )}
      {quickToast && (
        <div style={{ position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', background: 'rgba(44,56,40,0.88)', color: '#fff', fontSize: 13, fontWeight: 500, padding: '8px 16px', borderRadius: 20, zIndex: 50, whiteSpace: 'nowrap', pointerEvents: 'none', fontFamily: 'Inter, sans-serif' }}>
          {quickToast}
        </div>
      )}
      {circleViewer && (() => {
        const { entry, kidLabel, age, friendName, friendAvatar, entryDate, isOwn, entryKids } = circleViewer;
        const sides = sameAgeSides(entry, entryKids);
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
                  ? <img src={cloudinaryTransform(resolvedAvatar, AVATAR_TRANSFORM_SM)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                  : resolvedName?.charAt(0) || '?'}
              </div>
              <div style={{ flex: 1 }}>
                {resolvedName && <p style={{ margin: '0 0 1px', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{resolvedName}</p>}
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>{entryDate}</p>
              </div>
              {onCompareAtAge && circleViewer.entryKids[0] && !isOwn && (
                <button onClick={e => { e.stopPropagation(); setCircleViewer(null); onCompareAtAge(circleViewer.entryKids[0].id, circleViewer.entry.ageMonths, circleViewer.entry.id); }} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 999, padding: '5px 12px 5px 5px', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, fontWeight: 700, fontFamily: "'Urbanist', sans-serif", flexShrink: 0 }}>
                  <KidThumb kid={circleViewer.entryKids[0]} size={22} /> Same age
                </button>
              )}
              {isOwn && (
                <button onClick={e => { e.stopPropagation(); setCircleViewer(null); onOpenEntry(entry); }} title="Edit" style={{ background: 'var(--bg-elevated)', border: 'none', borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--accent)', fontSize: 16, flexShrink: 0 }}>
                  <Icon name="ti-pencil" />
                </button>
              )}
              <button onClick={() => setCircleViewer(null)} style={{ background: 'var(--bg-elevated)', border: 'none', borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-2)', fontSize: 16, flexShrink: 0 }}>
                <Icon name="ti-x" />
              </button>
            </div>

            {/* Photo/video — a same-age post shows every kid's photo (split for 2,
                scrollable strip for 3+) instead of just the first kid's cover photo */}
            {sides ? (
              <div style={{ width: '100%', flexShrink: 0, position: 'relative' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', gap: 2, overflowX: sides.length > 2 ? 'auto' : 'hidden' }}>
                  {sides.map((side, i) => {
                    const photo = side.photo;
                    const isVid = photo?.type === 'video';
                    const playing = viewerPlayingIdx === i;
                    return (
                      <div
                        key={i}
                        onClick={e => {
                          e.stopPropagation();
                          if (isVid && !playing) { setViewerPlayingIdx(i); return; }
                          const now = Date.now();
                          if (now - lastTapRef.current < 320) {
                            const alreadyLiked = viewerLikes.some(l => l.user_id === session?.user?.id);
                            if (!alreadyLiked && !isOwn) handleToggleLike();
                            setShowLikeAnim(true);
                            setTimeout(() => setShowLikeAnim(false), 800);
                          }
                          lastTapRef.current = now;
                        }}
                        style={{ flex: sides.length > 2 ? '0 0 80%' : 1, aspectRatio: '1', background: 'var(--bg-elevated)', position: 'relative', cursor: 'pointer' }}
                      >
                        {photo && (isVid ? (
                          playing ? (
                            <video src={cloudinaryTransform(photo.url, VIDEO_DELIVERY_TRANSFORM)} autoPlay controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onClick={e => e.stopPropagation()} />
                          ) : (
                            <>
                              <img src={videoThumbUrl(photo.url)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" loading="lazy" />
                              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <div className="video-play-overlay"><Icon name="ti-player-play" style={{ fontSize: 15 }} /></div>
                              </div>
                            </>
                          )
                        ) : (
                          <img src={cloudinaryTransform(photo.url, 'w_700,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" loading="lazy" />
                        ))}
                      </div>
                    );
                  })}
                </div>
                {showLikeAnim && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <Icon name="ti-heart-filled" style={{ fontSize: 80, color: '#fff', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.35))', animation: 'likeHeartPop 0.8s ease forwards' }} />
                  </div>
                )}
              </div>
            ) : (
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
                  <video src={cloudinaryTransform(heroMedia.url, VIDEO_DELIVERY_TRANSFORM)} autoPlay controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onClick={e => e.stopPropagation()} />
                )}
                {isVideo && !viewerPlaying && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="video-play-overlay"><Icon name="ti-player-play" style={{ fontSize: 15 }} /></div>
                  </div>
                )}
                {showLikeAnim && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <Icon name="ti-heart-filled" style={{ fontSize: 80, color: '#fff', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.35))', animation: 'likeHeartPop 0.8s ease forwards' }} />
                  </div>
                )}
              </div>
            )}

            {/* Kid name + heart inline, then scrollable comments */}
            <div style={{ padding: '12px 16px 8px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, borderBottom: viewerComments.length > 0 ? '1px solid var(--border)' : 'none' }} onClick={e => e.stopPropagation()}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {sides ? sides.map((side, i) => (
                  <p key={i} style={{ margin: i === 0 ? '0 0 1px' : '2px 0 0', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                    {side.kid.name} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-3)' }}>{exactAgeLabel(side.kid.birthdate, side.date)}</span>
                  </p>
                )) : (
                  <>
                    <p style={{ margin: '0 0 1px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{kidLabel}</p>
                    {age && <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>{age}</p>}
                  </>
                )}
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
                        <Icon name={viewerLikes.length > 0 ? 'ti-heart-filled' : 'ti-heart'} style={{ fontSize: 22 }} />
                        {viewerLikes.length > 0 && <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>{viewerLikes.length}</span>}
                      </div>
                      {viewerLikes.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'Inter, sans-serif' }}>{likeNames}</span>}
                    </div>
                  );
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                    <button onClick={handleToggleLike} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: userHasLiked ? '#E05C6A' : 'var(--text-3)', fontFamily: 'Inter, sans-serif' }}>
                      <Icon name={userHasLiked ? 'ti-heart-filled' : 'ti-heart'} style={{ fontSize: 22 }} />
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
                          <Icon name="ti-trash" style={{ fontSize: 13 }} />
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
                              <Icon name="ti-trash" style={{ fontSize: 12 }} />
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
                  <button onClick={() => setReplyTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex', marginLeft: 'auto' }}><Icon name="ti-x" style={{ fontSize: 13 }} /></button>
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
                  <Icon name="ti-send" style={{ fontSize: 15, color: '#fff' }} />
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

function JournalScreen({ entries, kids, onOpenEntry, onNewEntry, kidFilter, setKidFilter, memberCount, scrollPos, onRefresh, onToggleFavorite, onDeleteEntry, reactionCounts = {}, onBack, onGenerateShareLink, milestonesOnly = false }) {
  const { userId: currentUserId } = useSession() ?? {};
  const [quickToast, setQuickToast] = useState(null);
  function showQuickToast(msg) {
    setQuickToast(msg);
    setTimeout(() => setQuickToast(null), 1800);
  }
  async function handleQuickShareLink(entry) {
    if (!onGenerateShareLink) return;
    const token = await onGenerateShareLink(entry);
    if (!token) { showQuickToast('Could not create link'); return; }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?shared=${token}`);
      showQuickToast('Link copied!');
    } catch { showQuickToast('Could not copy link'); }
  }
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
      .filter(e => !milestonesOnly || e.milestone)
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
            <Icon name="ti-leaf" style={{ fontSize: 13, color: 'var(--text-3)', flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.3 }}>{monthLabel.toUpperCase()}</span>
            <div className="month-divider-line" />
          </div>
        );
      }
      const entryKids = entry.kids.map(id => kids.find(k => k.id === id)).filter(Boolean);
      result.push(<JournalEntryRow key={entry.id} entry={entry} entryKids={entryKids} onOpen={onOpenEntry} onLongPress={handleLongPress} reactionCount={reactionCounts[entry.id]} />);
    });
    return result;
  }, [entries, kids, kidFilter, milestonesOnly, searchQuery, onOpenEntry, handleLongPress]);

  return (
    <div className="screen" style={{ position: 'relative' }}>
      <div className="scroll-area" ref={scrollRef} style={{ overscrollBehaviorY: 'contain' }} {...ptr.handlers}>
        {ptr.indicator}
        <div className="scrollpad" style={{ paddingBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {onBack && <button className="icon-btn" onClick={onBack} style={{ flexShrink: 0 }}><Icon name="ti-arrow-left" /></button>}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ width: 28, height: 1, background: 'rgba(200,153,62,0.4)', margin: '0 auto 5px' }} />
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, color: 'var(--accent)', margin: 0, fontWeight: 700 }}>{milestonesOnly ? 'Milestones' : memberCount > 1 ? 'Our letters' : 'My letters'}</h2>
            </div>
            <button className="icon-btn" onClick={() => { setShowSearch(s => !s); setSearchQuery(''); setTimeout(() => searchInputRef.current?.focus(), 50); }} style={{ flexShrink: 0 }}>
              <Icon name={showSearch ? 'ti-x' : 'ti-search'} />
            </button>
          </div>
          <HomeKidFilter kids={kids} selected={kidFilter} onSelect={setKidFilter} />
          {showSearch && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <Icon name="ti-search" style={{ color: 'var(--text-muted)', fontSize: 16 }} />
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
                  <Icon name="ti-x" style={{ fontSize: 14 }} />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="scrollpad" style={{ paddingTop: 0 }}>
          {rows.length === 0 ? (
            <div className="empty-state">
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Icon name="ti-notebook" style={{ fontSize: 24, color: 'var(--text-muted)' }} />
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
          isOwn={longPressEntry.userId === currentUserId}
          onClose={() => setLongPressEntry(null)}
          onFavorite={() => { onToggleFavorite?.(longPressEntry.id); setLongPressEntry(null); }}
          onShare={() => { handleQuickShareLink(longPressEntry); setLongPressEntry(null); }}
          onDelete={() => { setLongPressEntry(null); onDeleteEntry?.(longPressEntry.id); }}
        />
      )}
      {quickToast && (
        <div style={{ position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', background: 'rgba(44,56,40,0.88)', color: '#fff', fontSize: 13, fontWeight: 500, padding: '8px 16px', borderRadius: 20, zIndex: 50, whiteSpace: 'nowrap', pointerEvents: 'none', fontFamily: 'Inter, sans-serif' }}>
          {quickToast}
        </div>
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
      <img src={song.artworkUrl} style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} alt="" loading="lazy" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.name}</p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.artist}</p>
        <div style={{ marginTop: 6, height: 2, background: 'var(--border)', borderRadius: 1 }}>
          <div style={{ height: '100%', width: `${progress * 100}%`, background: 'var(--accent)', borderRadius: 1, transition: 'width 0.5s linear' }} />
        </div>
      </div>
      <button onClick={toggle} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, fontSize: 15 }}>
        <Icon name={`ti-player-${playing ? 'pause' : 'play'}-filled`} />
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
        <Icon name="ti-microphone" style={{ fontSize: 16, color: '#fff' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Voice memo</p>
        <div style={{ marginTop: 5, height: 2, background: 'var(--border)', borderRadius: 1 }}>
          <div style={{ height: '100%', width: `${progress * 100}%`, background: 'var(--accent)', borderRadius: 1, transition: 'width 0.5s linear' }} />
        </div>
      </div>
      <button onClick={toggle} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, fontSize: 15 }}>
        <Icon name={`ti-player-${playing ? 'pause' : 'play'}-filled`} />
      </button>
    </div>
  );
});

// ─── Entry detail ────────────────────────────────────────────────────────

function EntryDetailScreen({ entry, kid, allKids, onBack, onEdit, onToggleFavorite, onDelete, onUpdateCrop, onUpdateLocation, onUpdatePeople, onUpdateKids, onToggleShared, onGenerateShareLink, onRevokeShareLink, onReorderMedia, allPeople = [], friendKids = [], supabase, session, socialName = '', onSameAge, onRemoveSameAgeMatch, pendingSameAgeMatch, onConfirmSameAgeMatch, onCancelSameAgeMatch }) {
  // Only the author can edit or delete an entry's content — family members
  // may only adjust the photo crop (handled separately, below).
  const isOwn = entry.userId === session?.user?.id;
  const isNote = entry.type === 'note';
  const m = entry.milestone ? milestoneInfo(entry.milestone) : null;
  const media = entry.media || [];
  // The kid this entry was originally about — the one with no key in sameAgeDates.
  // Every kid folded in later gets compared against this same anchor.
  const anchorKidId = entry.kids.find(id => !(entry.sameAgeDates || {})[id]);
  const sides = allKids ? sameAgeSides(entry, allKids) : null;
  // Only offer siblings who've actually reached the anchor's age at this entry —
  // otherwise the match flow ends up asking for a photo dated in the future
  // (e.g. a 2-year-old "at age 8").
  const sameAgeEligibleOthers = useMemo(() => {
    if (!allKids) return [];
    const anchorKid = allKids.find(ak => ak.id === anchorKidId);
    if (!anchorKid) return [];
    const anchorAge = exactAge(anchorKid.birthdate, entry.date);
    const anchorAgeMonths = anchorAge.years * 12 + anchorAge.months;
    return allKids.filter(ak => {
      if (entry.kids.includes(ak.id) || ak.archivedAt) return false;
      const { years, months } = exactAge(ak.birthdate, TODAY);
      return years * 12 + months >= anchorAgeMonths;
    });
  }, [allKids, anchorKidId, entry.kids, entry.date]);
  const [activeSlide, setActiveSlide] = useState(0);

  function handleSetCoverPhoto(photo) {
    if (!photo || media[0] === photo || !onReorderMedia) return;
    setActiveSlide(0);
    onReorderMedia(entry.id, [photo, ...media.filter(m => m !== photo)]);
  }
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [people, setPeople] = useState(entry.people || []);
  const [showPeopleTagger, setShowPeopleTagger] = useState(false);
  const [peopleInput, setPeopleInput] = useState('');
  const [isShared, setIsShared] = useState(entry.shared ?? true);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showSameAgePicker, setShowSameAgePicker] = useState(false);
  const [sameAgePickerSelection, setSameAgePickerSelection] = useState([]);
  const [showShareLinkSheet, setShowShareLinkSheet] = useState(false);
  const [shareToken, setShareToken] = useState(entry.shareToken ?? null);
  const [shareLinkBusy, setShareLinkBusy] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [detailLikes, setDetailLikes] = useState([]);
  const [detailComments, setDetailComments] = useState([]);
  const [detailCommentText, setDetailCommentText] = useState('');
  const [detailReplyTarget, setDetailReplyTarget] = useState(null);
  const [showDetailLikeAnim, setShowDetailLikeAnim] = useState(false);
  const detailLastTapRef = useRef(0);
  const detailTapTimerRef = useRef(null);
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

  async function handleDetailToggleLike() {
    if (!supabase || !session) return;
    const userId = session.user.id;
    const existing = detailLikes.find(l => l.user_id === userId);
    if (existing) {
      setDetailLikes(prev => prev.filter(l => l.user_id !== userId));
      await supabase.from('entry_likes').delete().eq('entry_id', entry.id).eq('user_id', userId);
    } else {
      const optimistic = { id: 'opt-' + Date.now(), user_id: userId, display_name: socialName };
      setDetailLikes(prev => [...prev, optimistic]);
      const { data } = await supabase.from('entry_likes').insert({ entry_id: entry.id, user_id: userId, display_name: socialName }).select('id, user_id, display_name').single();
      if (data) setDetailLikes(prev => prev.map(l => l.id === optimistic.id ? data : l));
      if (entry.authorId) triggerPush({ targetUserId: entry.authorId, kind: 'like', entryId: entry.id, fromName: socialName });
    }
  }

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
    if (entry.authorId) triggerPush({ targetUserId: entry.authorId, kind: parentId ? 'reply' : 'comment', entryId: entry.id, fromName: socialName, commentPreview: body });
  }

  async function handleGenerateShareLink() {
    if (!onGenerateShareLink || shareLinkBusy) return;
    setShareLinkBusy(true);
    const token = await onGenerateShareLink({ ...entry, shareToken });
    if (token) setShareToken(token);
    setShareLinkBusy(false);
  }

  async function handleRevokeShareLink() {
    if (!onRevokeShareLink || shareLinkBusy) return;
    setShareLinkBusy(true);
    await onRevokeShareLink(entry.id);
    setShareToken(null);
    setShareLinkBusy(false);
  }

  function handleCopyShareLink() {
    if (!shareToken) return;
    const url = `${window.location.origin}/?shared=${shareToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareLinkCopied(true);
      setTimeout(() => setShareLinkCopied(false), 2000);
    }).catch(() => {});
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
                <button className="icon-btn-ghost" onClick={onBack} style={{ width: 28, height: 28, fontSize: 14 }}><Icon name="ti-arrow-left" /></button>
              </div>
              <div
                className="gallery-stage"
                onClick={() => {
                  if (media[activeSlide]?.type === 'video') return;
                  const now = Date.now();
                  if (now - detailLastTapRef.current < 320) {
                    clearTimeout(detailTapTimerRef.current);
                    detailLastTapRef.current = 0;
                    if (supabase && session) {
                      const alreadyLiked = detailLikes.some(l => l.user_id === session.user.id);
                      if (!alreadyLiked) handleDetailToggleLike();
                      setShowDetailLikeAnim(true);
                      setTimeout(() => setShowDetailLikeAnim(false), 800);
                    }
                  } else {
                    detailLastTapRef.current = now;
                    detailTapTimerRef.current = setTimeout(() => setShowLightbox(true), 320);
                  }
                }}
                style={{ cursor: media[activeSlide]?.type !== 'video' ? 'pointer' : 'default' }}
              >
                {media.map((item, i) => (
                  item.type === 'video' ? (
                    <div key={i} className="gallery-slide" style={{ opacity: i === activeSlide ? 1 : 0 }}>
                      <CroppedVideo
                        src={item.url}
                        poster={videoThumbUrl(item.url, `so_0,e_sharpen:60,q_auto,f_auto`)}
                        cropY={photoCropY(media, i, entry)}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        preload="metadata" playsInline controls
                        onPlay={() => setVideoPlaying(true)} onPause={() => setVideoPlaying(false)} onEnded={() => setVideoPlaying(false)}
                      />
                    </div>
                  ) : (
                    <CroppedBg key={i} className="gallery-slide" style={{ opacity: i === activeSlide ? 1 : 0 }} src={cloudinaryTransform(item.url, 'w_1200,e_sharpen:60,q_auto,f_auto')} cropY={photoCropY(media, i, entry)}>
                      <div className="video-play-overlay" style={{ display: 'none' }} />
                    </CroppedBg>
                  )
                ))}
                {onUpdateCrop && !videoPlaying && (
                  <button
                    onClick={e => { e.stopPropagation(); setShowCrop(true); }}
                    style={{ position: 'absolute', bottom: 12, right: 12, width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 5 }}
                  >
                    <Icon name="ti-crop" style={{ fontSize: 12 }} />
                  </button>
                )}
                {media[activeSlide]?.type !== 'video' && (
                  <button
                    onClick={e => { e.stopPropagation(); if (isOwn) setShowPeopleTagger(true); }}
                    style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.38)', borderRadius: 999, padding: '4px 8px 4px 6px', border: 'none', cursor: isOwn ? 'pointer' : 'default' }}
                  >
                    <Icon name="ti-user-plus" style={{ fontSize: 10, color: '#fff' }} />
                    <span style={{ fontSize: 10, color: '#fff', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
                      {(() => {
                        const taggedFriendNames = friendKids.filter(k => entry.kids.includes(k.id)).map(k => k.name.split(' ')[0]);
                        const all = [...taggedFriendNames, ...people];
                        return all.length > 0 ? all.join(', ') : 'Tag people';
                      })()}
                    </span>
                  </button>
                )}
                {showDetailLikeAnim && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <Icon name="ti-heart-filled" style={{ fontSize: 80, color: '#fff', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.35))', animation: 'likeHeartPop 0.8s ease forwards' }} />
                  </div>
                )}
                {media.length > 1 && (
                  <div style={{ opacity: videoPlaying ? 0 : 1, pointerEvents: videoPlaying ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
                    <button
                      onClick={e => { e.stopPropagation(); setActiveSlide(i => (i - 1 + media.length) % media.length); }}
                      style={{ position: 'absolute', top: '50%', left: 10, transform: 'translateY(-50%)', width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 5 }}
                    >
                      <Icon name="ti-chevron-left" style={{ fontSize: 13 }} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setActiveSlide(i => (i + 1) % media.length); }}
                      style={{ position: 'absolute', top: '50%', right: 10, transform: 'translateY(-50%)', width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 5 }}
                    >
                      <Icon name="ti-chevron-right" style={{ fontSize: 13 }} />
                    </button>
                    <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 5, zIndex: 5 }}>
                      {media.map((_, i) => (
                        <span
                          key={i}
                          onClick={e => { e.stopPropagation(); setActiveSlide(i); }}
                          style={{ width: i === activeSlide ? 14 : 6, height: 6, borderRadius: 999, background: i === activeSlide ? '#fff' : 'rgba(255,255,255,0.45)', cursor: 'pointer', transition: 'width 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ padding: '14px 14px 0' }}>
              <button className="icon-btn" onClick={onBack}><Icon name="ti-arrow-left" /></button>
            </div>
          )}
        </div>
        <div className="scrollpad">
          {m && (
            <div className="milestone-entry" style={{ borderRadius: 16, padding: '18px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#C8993E', letterSpacing: 1.4, textTransform: 'uppercase', margin: '0 0 10px' }}>Milestone</p>
              <div style={{ width: 52, height: 52, borderRadius: '50%', margin: '0 auto 10px', background: 'linear-gradient(160deg, #F5D78E 0%, #C8993E 100%)', boxShadow: '0 3px 10px rgba(200,153,62,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={m.icon} style={{ fontSize: 24, color: '#fff' }} />
              </div>
              <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 700, color: '#7A6030', margin: 0 }}>{m.label}</p>
            </div>
          )}
          {sides && (() => {
            const daysApart = sameAgeDaysApart(sides);
            const twoUp = sides.length === 2;
            return (
              <div className="milestone-entry" style={{ borderRadius: 16, padding: 12 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#C8993E', letterSpacing: 1.4, textTransform: 'uppercase', margin: '0 0 10px', textAlign: 'center' }}>Same age</p>
                <div style={twoUp ? { display: 'flex', gap: 8 } : { display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
                  {sides.map((side, i) => {
                    const isCover = !!side.photo && media[0] === side.photo;
                    const isMatched = side.kid.id in (entry.sameAgeDates || {});
                    return (
                    <div key={i} style={twoUp ? { flex: 1, minWidth: 0 } : { width: 92, flexShrink: 0 }}>
                      <div
                        onClick={() => handleSetCoverPhoto(side.photo)}
                        title={onReorderMedia && side.photo ? (isCover ? 'Current cover photo' : 'Set as cover photo') : undefined}
                        style={{ aspectRatio: '1', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-elevated)', position: 'relative', cursor: onReorderMedia && side.photo && !isCover ? 'pointer' : 'default' }}
                      >
                        {side.photo && <img src={cloudinaryTransform(side.photo.url, 'w_400,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" loading="lazy" />}
                        {isCover && (
                          <span style={{ position: 'absolute', top: 5, left: 5, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', padding: '3px 6px', borderRadius: 6 }}>Cover</span>
                        )}
                        {isOwn && isMatched && onRemoveSameAgeMatch && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              if (window.confirm(`Remove ${side.kid.name.split(' ')[0]}'s photo from this match? This will delete that photo and can't be undone.`)) {
                                onRemoveSameAgeMatch(entry, side.kid.id);
                              }
                            }}
                            title={`Remove ${side.kid.name.split(' ')[0]} from this match`}
                            style={{ position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 2 }}
                          >
                            <Icon name="ti-x" style={{ fontSize: 11, color: '#fff' }} />
                          </button>
                        )}
                      </div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', margin: '6px 0 0', textAlign: 'center' }}>{side.kid.name.split(' ')[0]}</p>
                      <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '1px 0 0', textAlign: 'center' }}>{exactAgeLabel(side.kid.birthdate, side.date)} old</p>
                    </div>
                    );
                  })}
                </div>
                <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: '10px 0 0', textAlign: 'center' }}>
                  {daysApart === 0 ? 'Exact match' : `${daysApart} day${daysApart !== 1 ? 's' : ''} apart`}
                </p>
              </div>
            );
          })()}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(() => {
              return (allKids ? entry.kids.map(id => allKids.find(k => k.id === id)).filter(Boolean) : [kid]).map(k => {
              const kidDate = entry.sameAgeDates?.[k.id] ?? entry.date;
              return (
              <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <KidThumb kid={k} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 16, color: 'var(--accent)', margin: 0, fontWeight: 700 }}>{k.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    {exactAgeLabel(k.birthdate, kidDate)} old · {new Date(kidDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}{entry.mood ? ` · ${entry.mood}` : ''}
                  </p>
                  {location && (
                    <span onClick={() => { if (isOwn) { setLocationDraft(location); setLocationDraftCoords(null); setEditingLocation(true); } }} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 3, cursor: isOwn ? 'pointer' : 'default' }}>
                      <Icon name="ti-map-pin" style={{ fontSize: 11, color: 'var(--text-muted)' }} />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{location}</span>
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => { onToggleFavorite(entry.id); showToast(entry.favorited ? 'Removed from favorites' : 'Saved to favorites'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: entry.favorited ? '#C8993E' : 'var(--text-muted)', fontSize: 20, display: 'flex', alignItems: 'center' }}>
                    <Icon name={`ti-star${entry.favorited ? '-filled' : ''}`} />
                  </button>
                  {isOwn && (
                    <button onClick={() => setShowActionSheet(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--text-muted)', fontSize: 20, display: 'flex', alignItems: 'center' }}>
                      <Icon name="ti-dots" />
                    </button>
                  )}
                </div>
              </div>
              );
            });
            })()}
          </div>
          {entry.song && <SongPlayer song={entry.song} />}
          {entry.voiceMemoUrl && <VoiceMemoPlayer url={entry.voiceMemoUrl} />}
          {isNote ? (() => {
            const isPrompt = !!entry.prompt;
            if (isPrompt) return (
              <div style={{ borderRadius: 13, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div style={{ background: PROMPT_ACCENT, padding: '13px 17px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Icon name="ti-bulb" style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)' }} />
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
                <Icon name="ti-notebook" style={{ fontSize: 12, color: noteAccent }} />
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
          {!sides && onSameAge && allKids && (() => {
            // A bare "⇄" icon doesn't explain itself — nobody's going to guess
            // what it does on first sight. A compact duo-avatar pill is the
            // entry point now (the old icon-only button, in the per-kid row
            // above, is gone). Sits below the letter/note itself rather than
            // above the kid info — a secondary, trailing action instead of
            // something competing with the actual content for attention.
            const anchorKid = allKids.find(ak => ak.id === anchorKidId);
            const others = sameAgeEligibleOthers;
            if (!anchorKid || others.length === 0) return null;
            const other = others[0];
            return (
              <button
                onClick={() => { if (others.length === 1) onSameAge(entry, anchorKid, others); else { setSameAgePickerSelection([]); setShowSameAgePicker(true); } }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', borderRadius: 999, padding: '8px 14px 8px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}
              >
                <span style={{ position: 'relative', width: 34, height: 26, flexShrink: 0 }}>
                  <span style={{ position: 'absolute', left: 0, top: 0, borderRadius: '50%', boxShadow: '0 0 0 2px var(--bg-card)' }}><KidThumb kid={anchorKid} size={22} /></span>
                  <span style={{ position: 'absolute', left: 14, top: 0, borderRadius: '50%', boxShadow: '0 0 0 2px var(--bg-card)' }}><KidThumb kid={other} size={22} /></span>
                </span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                  {others.length === 1 ? `Compare with ${other.name.split(' ')[0]} at the same age` : 'Compare at the same age'}
                </span>
                <Icon name="ti-chevron-right" style={{ fontSize: 14, color: 'var(--text-muted)', flexShrink: 0 }} />
              </button>
            );
          })()}
          {supabase && session && (
            <>
              <div style={{ height: 1, background: 'var(--border)' }} />
              {/* Likes */}
              {(() => {
                const iLiked = detailLikes.some(l => l.user_id === session?.user?.id);
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button onClick={handleDetailToggleLike} style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: iLiked ? '#E05C6A' : 'var(--text-muted)' }}>
                      <Icon name={`ti-heart${iLiked ? '-filled' : ''}`} style={{ fontSize: 18 }} />
                    </button>
                    {detailLikes.length > 0 && (
                      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                        {detailLikes.map(l => l.display_name || 'Someone').join(', ')}
                      </span>
                    )}
                  </div>
                );
              })()}
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
                          <Icon name="ti-trash" style={{ fontSize: 13 }} />
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
                              <Icon name="ti-trash" style={{ fontSize: 12 }} />
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
                  <button onClick={() => setDetailReplyTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}><Icon name="ti-x" style={{ fontSize: 13 }} /></button>
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
                  <Icon name="ti-send" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {showSameAgePicker && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 11 }} onClick={() => setShowSameAgePicker(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', width: '100%', padding: '20px 24px 32px' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 20px' }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px', textAlign: 'center' }}>Same age as who?</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px', textAlign: 'center' }}>Pick as many as you'd like to add.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
              {sameAgeEligibleOthers.map(other => {
                const selected = sameAgePickerSelection.includes(other.id);
                return (
                  <button
                    key={other.id}
                    onClick={() => setSameAgePickerSelection(prev => selected ? prev.filter(id => id !== other.id) : [...prev, other.id])}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px 8px 8px', borderRadius: 40, border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`, background: selected ? 'var(--bg-elevated)' : 'transparent', cursor: 'pointer' }}
                  >
                    <KidThumb kid={other} size={28} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{other.name.split(' ')[0]}</span>
                    {selected && <Icon name="ti-check" style={{ fontSize: 14, color: 'var(--accent)' }} />}
                  </button>
                );
              })}
            </div>
            <button
              className="btn btn-gold"
              style={{ width: '100%', opacity: sameAgePickerSelection.length > 0 ? 1 : 0.4 }}
              disabled={sameAgePickerSelection.length === 0}
              onClick={() => {
                const targets = allKids.filter(ak => sameAgePickerSelection.includes(ak.id));
                setShowSameAgePicker(false);
                onSameAge(entry, allKids.find(ak => ak.id === anchorKidId), targets);
              }}
            >
              {sameAgePickerSelection.length > 1 ? `Continue with ${sameAgePickerSelection.length}` : 'Continue'}
            </button>
          </div>
        </div>
      )}
      {pendingSameAgeMatch && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.4)', display: 'flex', alignItems: 'flex-end', zIndex: 12 }} onClick={onCancelSameAgeMatch}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', width: '100%', padding: '20px 24px 32px' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 20px' }} />
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 18 }}>
              <div style={{ width: 64, height: 64, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: 'var(--bg-elevated)' }}>
                {pendingSameAgeMatch.file?.type?.startsWith('video')
                  ? <video src={pendingSameAgeMatch.previewUrl} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : <img src={pendingSameAgeMatch.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" loading="lazy" />}
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Add {pendingSameAgeMatch.targetKid.name.split(' ')[0]} to this post?</p>
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '4px 0 0' }}>This {pendingSameAgeMatch.file?.type?.startsWith('video') ? 'video' : 'photo'} will be added and the post will show both kids.</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={onCancelSameAgeMatch}>Cancel</button>
              <button className="btn btn-gold" style={{ flex: 1 }} onClick={onConfirmSameAgeMatch}>Add {pendingSameAgeMatch.file?.type?.startsWith('video') ? 'video' : 'photo'}</button>
            </div>
          </div>
        </div>
      )}
      {showActionSheet && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 11 }} onClick={() => setShowActionSheet(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', width: '100%', paddingBottom: 36 }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '12px auto 20px' }} />
            {[
              { icon: 'ti-edit', label: 'Edit entry', action: () => { setShowActionSheet(false); onEdit(entry); } },
              onToggleShared && { icon: isShared ? 'ti-lock' : 'ti-users', label: isShared ? 'Private' : 'Share', action: () => { const next = !isShared; setIsShared(next); onToggleShared(entry.id, { partner: next, friends: next }); showToast(next ? 'Visible to friends' : 'Post is private'); setShowActionSheet(false); } },
              supabase && { icon: 'ti-link', label: 'Share link', action: () => { setShowActionSheet(false); setShowShareLinkSheet(true); } },
              { icon: 'ti-trash', label: 'Delete entry', action: () => { setShowActionSheet(false); setShowDeleteConfirm(true); }, danger: true },
            ].filter(Boolean).map(item => (
              <button key={item.label} onClick={item.action} style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', background: 'none', border: 'none', padding: '14px 24px', cursor: 'pointer', color: item.danger ? '#D4856A' : 'var(--text)', fontFamily: 'Inter, sans-serif', fontSize: 15, fontWeight: 500 }}>
                <Icon name={item.icon} style={{ fontSize: 20, width: 24, flexShrink: 0 }} />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {showShareLinkSheet && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 11 }} onClick={() => setShowShareLinkSheet(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', width: '100%', padding: '20px 24px 32px' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 20px' }} />
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon name="ti-link" style={{ fontSize: 19, color: 'var(--accent)' }} />
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px', textAlign: 'center' }}>Share this moment</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: 1.6, textAlign: 'center' }}>
              Anyone with this link can view this photo and letter — no Patina account needed. You can revoke it anytime.
            </p>
            {shareToken ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                  <p style={{ flex: 1, fontSize: 12, color: 'var(--text-2)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {`${typeof window !== 'undefined' ? window.location.origin : ''}/?shared=${shareToken}`}
                  </p>
                </div>
                <button onClick={handleCopyShareLink} className="btn btn-primary" style={{ width: '100%', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", marginBottom: 10 }}>
                  {shareLinkCopied ? 'Copied!' : 'Copy link'}
                </button>
                <button onClick={handleRevokeShareLink} disabled={shareLinkBusy} style={{ width: '100%', background: 'none', border: 'none', color: '#D4856A', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", padding: '4px', opacity: shareLinkBusy ? 0.6 : 1 }}>
                  Revoke link
                </button>
              </>
            ) : (
              <button onClick={handleGenerateShareLink} disabled={shareLinkBusy} className="btn btn-primary" style={{ width: '100%', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", opacity: shareLinkBusy ? 0.6 : 1 }}>
                {shareLinkBusy ? 'Creating…' : 'Create link'}
              </button>
            )}
          </div>
        </div>
      )}
      {showDeleteConfirm && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 11 }} onClick={() => setShowDeleteConfirm(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', padding: '28px 24px 36px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(212,133,106,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon name="ti-trash" style={{ fontSize: 19, color: '#D4856A' }} />
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
          cropY={photoCropY(media, activeSlide, entry)}
          cardHeight={260}
          onSave={newY => { onUpdateCrop?.(entry.id, media[activeSlide].url, newY); setShowCrop(false); }}
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
            style={{ position: 'absolute', top: 16, right: 16, width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 1 }}
          >
            <Icon name="ti-x" />
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
                <button onClick={closeTagger} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}><Icon name="ti-x" style={{ fontSize: 18 }} /></button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 13, padding: '10px 14px' }}>
                {people.map(p => (
                  <div key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'var(--bg-elevated)', borderRadius: 999, padding: '3px 6px 3px 10px', fontSize: 13, color: 'var(--text-2)' }}>
                    {p}
                    <button onMouseDown={e => { e.preventDefault(); removePerson(p); }} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', borderRadius: '50%' }}>
                      <Icon name="ti-x" style={{ fontSize: 10 }} />
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
                            <Icon name="ti-user" style={{ fontSize: 12, color: 'var(--text-muted)' }} />
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
              <button onClick={() => setEditingLocation(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}><Icon name="ti-x" style={{ fontSize: 18 }} /></button>
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
  const [showNoExifHint, setShowNoExifHint] = useState(false);
  const noExifHintShownRef = useRef(false);
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
        const { data, error } = await supabase.functions.invoke('itunes-search', { body: { term: q, limit: 8 } });
        if (error) throw error;
        setSongResults((data?.results || []).filter(r => r.previewUrl));
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
      }).catch(() => {
        // Dictation itself runs through the browser's own speech-recognition
        // audio pipeline, entirely separate from this getUserMedia call — so
        // this failing doesn't stop the words from being typed out, it just
        // means nothing gets saved as a playable voice memo alongside them.
        // That's easy to miss silently, since the text still shows up fine.
        setMediaError("Couldn't access the microphone to save a voice memo — your dictated text will still be typed out, just without the audio.");
      });
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
    setShowNoExifHint(false);
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
      let foundDate = false;
      for (const file of files) {
        if (file.type.startsWith('image')) {
          try {
            const exifr = await loadExifr();
            const tags = await exifr.parse(file, ['DateTimeOriginal']);
            if (tags?.DateTimeOriginal) {
              const d = new Date(tags.DateTimeOriginal);
              setEntryDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
              setDateFromPhoto(true);
              foundDate = true;
              break;
            }
          } catch {}
        } else if (file.type.startsWith('video') && file.lastModified) {
          const d = new Date(file.lastModified);
          setEntryDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
          setDateFromPhoto(true);
          foundDate = true;
          break;
        }
      }
      // Professional/edited photos (gallery downloads, Lightroom exports, etc.) often
      // have no DateTimeOriginal tag at all — surface that once instead of silently
      // leaving the date unchanged, so it doesn't read as the feature being broken.
      if (!foundDate && !noExifHintShownRef.current) {
        noExifHintShownRef.current = true;
        setShowNoExifHint(true);
      }
    }
    if (!locationFromPhoto) {
      for (const file of files) {
        if (!file.type.startsWith('image')) continue;
        try {
          const exifr = await loadExifr();
          const tags = await exifr.parse(file, ['GPSLatitude', 'GPSLongitude']);
          if (tags?.GPSLatitude && tags?.GPSLongitude && supabase) {
            // Routed through the reverse-geocode edge function — Google's
            // Geocoding API rejects referrer-restricted keys (the only kind
            // safe to ship in a client bundle), so this can't be a direct fetch.
            const { data } = await supabase.functions.invoke('reverse-geocode', { body: { lat: tags.GPSLatitude, lng: tags.GPSLongitude } });
            if (data?.location && mountedRef.current) { setLocation(data.location); setLocationFromPhoto(true); }
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
            if (tags?.GPSLatitude && tags?.GPSLongitude && supabase) {
              const { data } = await supabase.functions.invoke('reverse-geocode', { body: { lat: tags.GPSLatitude, lng: tags.GPSLongitude } });
              location = data?.location || null;
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

  const [sameAgeDates, setSameAgeDates] = useState({});

  function buildSavePayload() {
    return {
      kids: selectedKids,
      text: text.trim(),
      mood: mood || null,
      milestone: milestoneType === 'custom' ? (customMilestoneText.trim() ? `custom:${customMilestoneText.trim()}` : null) : milestoneType || null,
      media,
      fileObjects,
      compressedFiles: compressedFilesRef.current,
      date: entryDate,
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
      sameAgeDates: Object.keys(sameAgeDates).length > 0 ? sameAgeDates : null,
    };
  }

  async function handleSave() {
    if (draftKey) { try { localStorage.removeItem(draftKey); } catch {} }
    setSaving(true);
    try {
      await onSave({
        ...buildSavePayload(),
        entryId: existingEntry?.id,
      });
    } catch (err) {
      alert('Something went wrong saving your entry: ' + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  }

  const [showDraftSameAgePicker, setShowDraftSameAgePicker] = useState(false);
  const [draftSameAgePickerSelection, setDraftSameAgePickerSelection] = useState([]);
  const [draftSameAgeTarget, setDraftSameAgeTarget] = useState(null); // kid object, once chosen — shows SameAgeMatchScreen
  const [draftSameAgeQueue, setDraftSameAgeQueue] = useState([]); // remaining kids after draftSameAgeTarget, when several were picked at once
  const [draftSameAgeQueueTotal, setDraftSameAgeQueueTotal] = useState(0);

  // Folds the matched kid + their photo straight into this still-unsaved draft —
  // no early save/navigate needed, since nothing exists yet to link to. If more
  // kids were queued up from a multi-select in the picker, moves on to the next
  // one instead of closing, so picking several kids only asks for one photo at a time.
  function handleConfirmDraftSameAge(photoDate, file) {
    const targetKid = draftSameAgeTarget;
    const url = URL.createObjectURL(file);
    const mediaType = file.type.startsWith('video') ? 'video' : 'image';
    setMedia(prev => [...prev, { url, type: mediaType, kidId: targetKid.id }]);
    setFileObjects(prev => [...prev, file]);
    setSelectedKids(prev => prev.includes(targetKid.id) ? prev : [...prev, targetKid.id]);
    setSameAgeDates(prev => ({ ...prev, [targetKid.id]: photoDate }));
    if (draftSameAgeQueue.length > 0) {
      const [next, ...rest] = draftSameAgeQueue;
      setDraftSameAgeQueue(rest);
      setDraftSameAgeTarget(next);
    } else {
      setDraftSameAgeTarget(null);
      setDraftSameAgeQueueTotal(0);
    }
  }

  const canSave = selectedKids.length > 0 && (text.trim().length > 0 || media.length > 0);
  const sameAgeTargets = kids.filter(k => !selectedKids.includes(k.id));
  const canSameAgeFromDraft = !existingEntry && media.length > 0 && sameAgeTargets.length > 0;
  const draftSameAgeBtnRef = useRef(null);

  return (
    <div className="screen" style={{ background: 'var(--bg-card)', position: 'relative' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', flexShrink: 0, position: 'relative' }}>
        <button className="icon-btn" onClick={onCancel}><Icon name="ti-x" /></button>
        {isNote && (
          <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: "'Urbanist', sans-serif" }}>
            {existingEntry ? 'Edit note' : 'New note'}
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {existingEntry && onDelete && (
            <button className="icon-btn" onClick={() => setShowDeleteConfirm(true)} style={{ color: '#D4856A', borderColor: 'rgba(212,133,106,0.35)' }}>
              <Icon name="ti-trash" />
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
            <Icon name="ti-pencil" style={{ color: 'var(--accent)', fontSize: 14, flexShrink: 0 }} />
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
            <button onClick={openDateEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif", margin: '10px 0 0', padding: '0 2px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="ti-calendar" style={{ fontSize: 12 }} />
              {dateDisplay}
              {dateFromPhoto && <span style={{ fontSize: 10 }}>&middot; photo</span>}
            </button>
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
                        ? <img src={cloudinaryTransform(k.avatar, AVATAR_TRANSFORM_LG)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
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
                  <Icon name="ti-calendar" style={{ fontSize: 12 }} />
                  {dateDisplay}
                  {dateFromPhoto && <span style={{ fontSize: 10 }}>· photo</span>}
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <button onClick={() => { setShowKidPicker(true);}} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 15, color: 'var(--border)', fontFamily: "'Urbanist', sans-serif", fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                Who is this for?
                <Icon name="ti-chevron-down" style={{ fontSize: 13 }} />
              </button>
              <button onClick={openDateEdit} style={{ background: 'var(--bg-card)', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-2)', fontFamily: "'Urbanist', sans-serif", padding: '6px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
                <Icon name="ti-calendar" style={{ fontSize: 13 }} />
                {dateDisplay}
                {dateFromPhoto && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>· photo</span>}
              </button>
            </div>
          )}
        </div>
        )}

        {showNoExifHint && (
          <div style={{ background: 'rgba(200,153,62,0.12)', border: '1px solid rgba(200,153,62,0.3)', borderRadius: 10, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Icon name="ti-calendar-exclamation" style={{ color: '#C8993E', fontSize: 15, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-2)' }}>Couldn't read a date from that photo — tap the date above to set it.</span>
            <button onClick={() => setShowNoExifHint(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: 14 }}><Icon name="ti-x" /></button>
          </div>
        )}

        {/* Photo preview */}
        {mediaError && (
          <div style={{ background: 'rgba(196,160,156,0.15)', border: '1px solid rgba(196,160,156,0.4)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Icon name="ti-alert-circle" style={{ color: '#C4A09C', fontSize: 15, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: '#C4A09C' }}>{mediaError}</span>
            <button onClick={() => setMediaError('')} style={{ background: 'none', border: 'none', color: '#C4A09C', cursor: 'pointer', padding: 0, fontSize: 14 }}><Icon name="ti-x" /></button>
          </div>
        )}

        {media.length > 0 && (
          <div style={{ marginBottom: 20, display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, justifyContent: media.length === 1 ? 'center' : 'flex-start' }}>
            {media.map((item, i) => (
              <div key={i} style={{ width: 165, aspectRatio: '4/3', borderRadius: 12, overflow: 'hidden', position: 'relative', flexShrink: 0, cursor: 'pointer' }} onClick={() => setPreviewMedia(item)}>
                {item.type === 'video'
                  ? item.thumbnail
                    ? <img src={item.thumbnail} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" loading="lazy" />
                    : <video src={cloudinaryTransform(item.url, VIDEO_DELIVERY_TRANSFORM)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} preload="metadata" muted playsInline />
                  : <img src={item.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" loading="lazy" />
                }
                <button onClick={e => { e.stopPropagation(); const it = media[i]; if (it.url?.startsWith('blob:')) URL.revokeObjectURL(it.url); setMedia(prev => prev.filter((_, idx) => idx !== i)); setFileObjects(prev => prev.filter((_, idx) => idx !== i)); }} style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="ti-x" />
                </button>
                {i === 0 && canSameAgeFromDraft && (
                  <>
                    <button ref={draftSameAgeBtnRef} onClick={e => {
                      e.stopPropagation();
                      if (sameAgeTargets.length === 1) {
                        setDraftSameAgeQueueTotal(1);
                        setDraftSameAgeTarget(sameAgeTargets[0]);
                      } else {
                        setDraftSameAgePickerSelection([]);
                        setShowDraftSameAgePicker(true);
                      }
                    }} title="Same age" style={{ position: 'absolute', bottom: 6, right: 6, width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="ti-arrows-diff" />
                    </button>
                    <Coachmark
                      id="draft-same-age-badge"
                      userId={currentUserId}
                      active={true}
                      targetRef={draftSameAgeBtnRef}
                      placement="top"
                      text="This photo can be matched to a sibling at the same age — tap the icon to start a comparison."
                    />
                  </>
                )}
                {item.type === 'video' && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="ti-player-play-filled" style={{ color: '#fff', fontSize: 10 }} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}


        {/* Tap to speak */}
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
            <Icon name="ti-microphone" style={{ fontSize: 20 }} />
            <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "'Urbanist', sans-serif", letterSpacing: 0.2 }}>
              {listening ? 'Listening…' : 'Tap to speak'}
            </span>
          </button>
        </div>

        {isNote && (voiceMemoBlob || voiceMemoUrl) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 13, padding: '12px 14px', marginBottom: 14 }}>
            <Icon name="ti-microphone" style={{ fontSize: 15, color: 'var(--accent)', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>Voice captured</span>
            <button onClick={() => { setVoiceMemoBlob(null); setVoiceMemoUrl(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 4, display: 'flex' }}><Icon name="ti-x" /></button>
          </div>
        )}

        {isNote && song && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 13, padding: '12px 14px', marginBottom: 14 }}>
            <Icon name="ti-music" style={{ fontSize: 15, color: '#F45B54', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.name}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>{song.artist}</p>
            </div>
            <button onClick={() => setSong(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 4, display: 'flex' }}><Icon name="ti-x" /></button>
          </div>
        )}

        {/* Prompt banner */}
        {isNote && promptText && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(200,153,62,0.12)', border: '1px solid rgba(200,153,62,0.3)', borderRadius: 12, padding: '11px 12px', marginBottom: 14 }}>
            <Icon name="ti-bulb" style={{ fontSize: 16, color: '#C8993E', flexShrink: 0 }} />
            <p style={{ flex: 1, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 14, color: 'var(--text)', margin: 0, lineHeight: 1.4 }}>{promptText}</p>
            <button
              onClick={() => setPromptText(NOTE_PROMPTS[Math.floor(Math.random() * NOTE_PROMPTS.length)])}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C8993E', padding: 4, display: 'flex', flexShrink: 0 }}
            >
              <Icon name="ti-refresh" style={{ fontSize: 15 }} />
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
              ? <video src={cloudinaryTransform(previewMedia.url, VIDEO_DELIVERY_TRANSFORM)} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} controls autoPlay playsInline onClick={e => e.stopPropagation()} />
              : <img src={previewMedia.url} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} alt="" loading="lazy" />
            }
            <button onClick={() => setPreviewMedia(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 14 }}>
              <Icon name="ti-x" />
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
                  <Icon name="ti-music" style={{ fontSize: 15, color: '#F45B54', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>{song.artist}</p>
                  </div>
                  <button onClick={() => setSong(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 4, display: 'flex' }}><Icon name="ti-x" /></button>
                </div>
              ) : (
                <button onClick={() => setShowSongPicker(true)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-input)', border: '1px dashed var(--border)', borderRadius: 13, padding: '12px 14px', width: '100%', cursor: 'pointer', fontFamily: "'Urbanist', sans-serif" }}>
                  <Icon name="ti-music" style={{ fontSize: 15, color: '#F45B54' }} />
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>Add a soundtrack</span>
                </button>
              )}
            </div>

            {(voiceMemoBlob || voiceMemoUrl) && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Voice Memo</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 13, padding: '12px 14px' }}>
                  <Icon name="ti-microphone" style={{ fontSize: 15, color: 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>Voice captured</span>
                  <button onClick={() => { setVoiceMemoBlob(null); setVoiceMemoUrl(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 4, display: 'flex' }}><Icon name="ti-x" /></button>
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
                      <Icon name={mt.icon} style={{ fontSize: 19, color: active ? '#C8993E' : 'var(--text-muted)', flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: active ? '#fff' : 'var(--text)', flex: 1 }}>{mt.label}</span>
                      {active && <Icon name="ti-check" style={{ color: '#C8993E', fontSize: 16 }} />}
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
                  <Icon name="ti-star" style={{ fontSize: 19, color: milestoneType === 'custom' ? '#C8993E' : 'var(--text-muted)', flexShrink: 0 }} />
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
                      <Icon name="ti-x" style={{ fontSize: 10 }} />
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
                            <Icon name="ti-user" style={{ fontSize: 12, color: 'var(--text-muted)' }} />
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
                  <Icon name="ti-camera" style={{ fontSize: 17, color: 'var(--accent)' }} /> Take a photo
                </button>
                <div style={{ height: 1, background: 'var(--border)' }} />
                <button onClick={() => { uploadInputRef.current?.click(); setShowMediaMenu(false); }} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '13px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text)', fontFamily: "'Urbanist', sans-serif", fontWeight: 500 }}>
                  <Icon name="ti-photo" style={{ fontSize: 17, color: 'var(--accent)' }} /> Upload from library
                </button>
              </div>
            </>
          )}
          <button onClick={() => setShowMediaMenu(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: showMediaMenu ? 'var(--accent)' : 'var(--text-muted)', fontSize: 22, borderRadius: 10 }}>
            <Icon name="ti-camera" />
          </button>
        </div>
        {isNote && (
          <>
            <button onClick={() => setShowSongPicker(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: song ? '#F45B54' : 'var(--text-muted)', fontSize: 22, borderRadius: 10 }}>
              <Icon name="ti-music" />
            </button>
            <button onClick={() => setShowSharePicker(true)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, padding: '7px 10px', borderRadius: 10, color: Object.values(sharedWith).some(Boolean) ? 'var(--accent)' : 'var(--text-muted)', fontSize: 12, fontWeight: 600, fontFamily: "'Urbanist', sans-serif" }}>
              <Icon name={Object.values(sharedWith).some(Boolean) ? 'ti-users' : 'ti-lock'} style={{ fontSize: 15 }} />
              {Object.values(sharedWith).some(Boolean) ? 'Share' : 'Private'}
            </button>
          </>
        )}
        {!isNote && (
        <>
        {/* Mic */}
        <button onClick={toggleListening} style={{ background: 'none', border: 'none', cursor: 'pointer', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: listening ? '#F0897A' : 'var(--text-muted)', fontSize: 22, borderRadius: 10, animation: listening ? 'mic-pulse 1.5s ease-in-out infinite' : 'none' }}>
          <Icon name="ti-microphone" />
        </button>
        {/* Write for me */}
        {selectedKids.length > 0 && (
          <button onClick={handleGenerate} disabled={generating || polishing} style={{ background: 'none', border: 'none', cursor: generating ? 'default' : 'pointer', height: 44, display: 'flex', alignItems: 'center', gap: 5, padding: '0 10px', color: generating ? 'var(--border)' : 'var(--accent)', fontSize: 13, fontWeight: 600, fontFamily: "'Urbanist', sans-serif", borderRadius: 10 }}>
            <Icon name="ti-sparkles" style={{ fontSize: 15, animation: generating ? 'spin 1s linear infinite' : 'none' }} />
            {generating ? 'Writing…' : 'Write for me'}
          </button>
        )}
        {/* Fix grammar */}
        {text.trim().length > 0 && !generating && (
          <button onClick={handlePolish} disabled={polishing} style={{ background: 'none', border: 'none', cursor: polishing ? 'default' : 'pointer', height: 44, display: 'flex', alignItems: 'center', gap: 5, padding: '0 10px', color: polishing ? 'var(--border)' : 'var(--text-muted)', fontSize: 13, fontWeight: 600, fontFamily: "'Urbanist', sans-serif", borderRadius: 10 }}>
            <Icon name="ti-writing" style={{ fontSize: 16, animation: polishing ? 'spin 1s linear infinite' : 'none' }} />
            {polishing ? 'Fixing…' : 'Fix grammar'}
          </button>
        )}
        {/* Sharing */}
        <button onClick={() => setShowSharePicker(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', width: 44, height: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, color: Object.values(sharedWith).some(Boolean) ? 'var(--accent)' : 'var(--text-muted)', borderRadius: 10 }}>
          <Icon name={Object.values(sharedWith).some(Boolean) ? 'ti-users' : 'ti-lock'} style={{ fontSize: 18 }} />
          <span style={{ fontSize: 9, fontWeight: 600, fontFamily: "'Urbanist', sans-serif", letterSpacing: 0.2, lineHeight: 1 }}>
            {Object.values(sharedWith).some(Boolean) ? 'All' : 'Private'}
          </span>
        </button>
        {/* More */}
        <button onClick={() => setShowExtras(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: showExtras ? 'var(--accent)' : 'var(--text-muted)', fontSize: 22, borderRadius: 10 }}>
          <Icon name="ti-dots" />
        </button>
        </>
        )}
      </div>

      {/* Song picker sheet */}
      {showSongPicker && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 11 }} onClick={() => { setShowSongPicker(false); setSongQuery(''); setSongResults([]); }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <Icon name="ti-music" style={{ fontSize: 20, color: '#F45B54' }} />
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0, flex: 1 }}>Soundtrack</p>
              {song && (
                <button onClick={() => { setSong(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif", padding: 0 }}>Remove</button>
              )}
            </div>
            {song ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-elevated)', borderRadius: 14, padding: '12px 14px' }}>
                <img src={song.artworkUrl} style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} alt="" loading="lazy" />
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
                    <Icon name="ti-loader-2" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', animation: 'spin 1s linear infinite', color: 'var(--text-muted)', fontSize: 16 }} />
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
                <Icon name="ti-chevron-down" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13, pointerEvents: 'none' }} />
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
              <Icon name="ti-trash" style={{ fontSize: 19, color: '#D4856A' }} />
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

      {/* Same-age target-kid picker sheet */}
      {showDraftSameAgePicker && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 11 }} onClick={() => setShowDraftSameAgePicker(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', width: '100%', padding: '20px 24px 32px' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 20px' }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px', textAlign: 'center' }}>Same age as who?</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px', textAlign: 'center' }}>Pick as many as you'd like to add.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
              {sameAgeTargets.map(other => {
                const selected = draftSameAgePickerSelection.includes(other.id);
                return (
                  <button
                    key={other.id}
                    onClick={() => setDraftSameAgePickerSelection(prev => selected ? prev.filter(id => id !== other.id) : [...prev, other.id])}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px 8px 8px', borderRadius: 40, border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`, background: selected ? 'var(--bg-elevated)' : 'transparent', cursor: 'pointer' }}
                  >
                    <KidThumb kid={other} size={28} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{other.name.split(' ')[0]}</span>
                    {selected && <Icon name="ti-check" style={{ fontSize: 14, color: 'var(--accent)' }} />}
                  </button>
                );
              })}
            </div>
            <button
              className="btn btn-gold"
              style={{ width: '100%', opacity: draftSameAgePickerSelection.length > 0 ? 1 : 0.4 }}
              disabled={draftSameAgePickerSelection.length === 0}
              onClick={() => {
                const targets = sameAgeTargets.filter(k => draftSameAgePickerSelection.includes(k.id));
                const [first, ...rest] = targets;
                setShowDraftSameAgePicker(false);
                setDraftSameAgeQueueTotal(targets.length);
                setDraftSameAgeQueue(rest);
                setDraftSameAgeTarget(first);
              }}
            >
              {draftSameAgePickerSelection.length > 1 ? `Continue with ${draftSameAgePickerSelection.length}` : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {draftSameAgeTarget && (
        <div style={{ position: 'absolute', inset: 0, background: 'var(--bg)', zIndex: 12 }}>
          <SameAgeMatchScreen
            sourceEntry={{ date: entryDate, media }}
            sourceKid={kids.find(k => k.id === selectedKids[0])}
            targetKid={draftSameAgeTarget}
            stepLabel={draftSameAgeQueueTotal > 1 ? `${draftSameAgeQueueTotal - draftSameAgeQueue.length} of ${draftSameAgeQueueTotal}` : null}
            onCancel={() => { setDraftSameAgeTarget(null); setDraftSameAgeQueue([]); setDraftSameAgeQueueTotal(0); }}
            onConfirm={handleConfirmDraftSameAge}
          />
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
                    <Icon name={opt.icon} style={{ fontSize: 18, color: active ? '#fff' : 'var(--accent)' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{opt.label}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{opt.sub}</p>
                  </div>
                  {active && <Icon name="ti-check" style={{ fontSize: 16, color: 'var(--accent)' }} />}
                </div>
              );
            })}
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '14px 0 0', lineHeight: 1.55, textAlign: 'center' }}>
              Letters stay private either way. Sharing with friends only ever shows the photo, the date, and your child's age.
            </p>
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
                      {selected && <Icon name="ti-check" style={{ color: '#fff', fontSize: 12 }} />}
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

// ─── Search screen ─────────────────────────────────────────────────────────

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
      <Icon name="ti-sparkles" style={{ color: '#C8993E', fontSize: 18, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13, color: '#fff', fontWeight: 500 }}>
        {toast.authorName} added a new letter
      </span>
      <button onClick={onView} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, padding: '5px 10px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', flexShrink: 0 }}>
        View
      </button>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 16, padding: 2, display: 'flex', flexShrink: 0 }}>
        <Icon name="ti-x" />
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
      <Icon name="ti-heart-filled" style={{ color: '#E05C6A', fontSize: 18, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13, color: '#fff', fontWeight: 500 }}>{message}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 16, padding: 2, display: 'flex', flexShrink: 0 }}>
        <Icon name="ti-x" />
      </button>
    </div>
  );
}


// ─── Join family screen ───────────────────────────────────────────────────

// ─── Nav bar ────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────

const NavBar = memo(function NavBar({ active, onNavigate, myAvatarUrl, onAdd }) {
  const { pendingRequestCount = 0, circleBadge = 0, unseenPartnerIds = [] } = useNotif() ?? {};
  const { kids = [] } = useData() ?? {};
  // Only child in the family — Home's kid-pill row (and its per-kid unseen
  // dot) never renders, since there's nothing to filter. That's the only
  // place a new partner letter would otherwise surface, so this tab needs
  // its own badge as the fallback for exactly that case.
  const homeBadge = kids.length <= 1 ? unseenPartnerIds.length : 0;
  const tabs = [
    { id: 'home', icon: 'ti-home', label: 'Home', group: ['home'], badge: homeBadge },
    { id: 'recap', icon: 'ti-keepsakes', label: 'Keepsakes', group: ['recap', 'partner-letters', 'compare'] },
  ];
  const tabsRight = [
    { id: 'circle-feed', icon: 'ti-users', label: 'Friends', group: ['circle-feed', 'friends'], badge: pendingRequestCount + circleBadge },
    { id: 'profile', icon: 'ti-profile-quill', label: 'Profile', group: ['profile'] },
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
              <Icon name={tab.icon} />
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
            <button className="nv-add" onClick={onAdd ?? (() => onNavigate('new-entry'))}><Icon name="ti-plus" /></button>
          </div>
          {tabsRight.map(tab => (
            <button key={tab.id} className="nv-tab" style={tabStyle(tab)} onClick={() => onNavigate(tab.id)}>
              {tab.id === 'profile' ? (
                <>
                  {myAvatarUrl ? (
                    <span style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', display: 'block', border: `2px solid ${tab.group.includes(active) ? 'var(--accent)' : 'transparent'}` }}>
                      <img src={cloudinaryTransform(myAvatarUrl, AVATAR_TRANSFORM_LG)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" loading="lazy" />
                    </span>
                  ) : (
                    <>
                      <Icon name={tab.icon} style={{ fontSize: 19 }} />
                      <span>{tab.label}</span>
                    </>
                  )}
                </>
              ) : (
                <>
                  <Icon name={tab.icon} />
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
    media: (e.entry_media || []).filter(m => m.url?.startsWith('http')).map(m => ({ url: m.url, type: m.type, kidId: m.kid_id || null, cropY: m.crop_y ?? null })),
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
    shareToken: e.share_token || null,
    sameAgeDates: e.same_age_dates || null,
  };
}

export default function App() {
  const localMode = !supabaseConfigured;
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(!localMode);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [kids, setKids] = useState(() => localMode ? loadLocalData().kids : []);
  // Archived kids stay in `kids` (so their existing letters/photos keep resolving
  // name/birthdate/avatar correctly) but drop out of anywhere you'd pick a kid for
  // something new — new-letter picker, home avatar row, same-age targets, etc.
  const activeKids = useMemo(() => kids.filter(k => !k.archivedAt), [kids]);
  const [entries, setEntries] = useState(() => localMode ? loadLocalData().entries : []);
  const [screen, setScreen] = useState('home');
  // Several screens (recap/partner-letters/compare/circle-feed/friends) stay
  // mounted with display:none instead of unmounting when you navigate away,
  // so any video/audio playing inside them would otherwise keep playing
  // invisibly. A blanket pause on every navigation is simpler and more
  // robust than instrumenting every media-playing surface individually.
  useEffect(() => {
    document.querySelectorAll('video, audio').forEach(v => { if (!v.paused) v.pause(); });
  }, [screen]);
  const [circleViewerEntry, setCircleViewerEntry] = useState(null);
  const [journalBackScreen, setJournalBackScreen] = useState('home');
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const installPromptRef = useRef(null);
  const journalScrollPos = useRef(0);
  const partnerLettersScrollPos = useRef(0);
  const [kidFilter, setKidFilter] = useState(null);
  const [journalMilestonesOnly, setJournalMilestonesOnly] = useState(false);
  const [activeEntry, setActiveEntry] = useState(null);
  const [entrySource, setEntrySource] = useState('home');
  const [profileKidId, setProfileKidId] = useState(() => localMode ? (loadLocalData().kids[0]?.id ?? null) : null);
  const [growthKidId, setGrowthKidId] = useState(null);
  const [celebration, setCelebration] = useState(null);
  const [familyId, setFamilyId] = useState(null);
  const [familyName, setFamilyName] = useState(null);
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
  const [recapTarget, setRecapTarget] = useState(null);
  const [sameAgeMatch, setSameAgeMatch] = useState(null); // { sourceEntry, sourceKid, targetKid }
  const [pendingSameAgeMatch, setPendingSameAgeMatch] = useState(null); // { sourceEntry, targetKid, photoDate, file, previewUrl } — awaiting explicit confirmation before writing
  // Once a user visits either sub-tab in a merged section, keep the whole
  // group mounted (just hidden) so switching between its tabs is instant —
  // no remount flash, no scroll/filter reset, no refetch.
  const [circleGroupMounted, setCircleGroupMounted] = useState(false);
  // Split per-tab (rather than one shared flag for the whole Keepsakes group)
  // so visiting any one of Recap/Letters/Compare/Reels for the first time
  // doesn't force-mount all four screens' full entry lists in one synchronous
  // burst — each still stays mounted once visited, so switching back to it is
  // still instant, but the other three only mount when actually opened.
  const [recapMounted, setRecapMounted] = useState(false);
  const [partnerLettersMounted, setPartnerLettersMounted] = useState(false);
  const [compareMounted, setCompareMounted] = useState(false);
  const [reelsMounted, setReelsMounted] = useState(false);
  const [newEntryInitial, setNewEntryInitial] = useState(null);
  const [composeMode, setComposeMode] = useState('letter');
  const [showComposePicker, setShowComposePicker] = useState(false);
  const [activePrompt, setActivePrompt] = useState(null);
  const [birthdaySlideshow, setBirthdaySlideshow] = useState(null);
  const [birthdaySlideshowFriend, setBirthdaySlideshowFriend] = useState(null); // { kid, entries }
  const [reelMonth, setReelMonth] = useState(null); // 'YYYY-MM' string — which month's reel to watch, or null when closed
  const [rangeReel, setRangeReel] = useState(null); // { startDate, endDate, title } — the currently-open custom-range reel, or null when closed
  const [savedReels, setSavedReels] = useState([]); // saved_reels rows: { id, title, startDate, endDate, song, song2, durationSec, slideRefs }
  const [editingReel, setEditingReel] = useState(null); // the saved_reels row currently open in the reel editor, or null when closed
  const [patinaJarKidId, setPatinaJarKidId] = useState(null); // which kid's Patina Jar/record screen is open
  const [patinaJarBackScreen, setPatinaJarBackScreen] = useState('profile'); // where "back" returns to — 'profile' or 'reels'
  const [patinaJarEntries, setPatinaJarEntries] = useState([]); // patina_jar_entries rows: { id, kidId, year, monthIndex, videoUrl, createdAt }
  const [showNotificationHistory, setShowNotificationHistory] = useState(false);
  const [showFriendsPrivacyExplainer, setShowFriendsPrivacyExplainer] = useState(false);
  const [birthdayNotifications, setBirthdayNotifications] = useState([]);
  const [reactionCounts, setReactionCounts] = useState({});
  const [pendingOpenEntryId, setPendingOpenEntryId] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('open'); } catch { return null; }
  });
  // A public share link (?shared=<token>) needs no auth and no app data —
  // read once at mount, checked ahead of every other gate in the render below.
  const [sharedEntryToken] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('shared'); } catch { return null; }
  });
  const [sharedReelToken] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('reel'); } catch { return null; }
  });
  const [pendingOpenBirthdayKidId, setPendingOpenBirthdayKidId] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('openBirthday'); } catch { return null; }
  });
  const [pendingOpenPatinaJarKidId, setPendingOpenPatinaJarKidId] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('openPatinaJar'); } catch { return null; }
  });

  // Deep-link from a push notification tap: ?open=<entryId> is handled by the existing
  // pendingOpenEntryId flow already used for in-app notification taps; ?openBirthday=<kidId>
  // waits for friendKids to load, then opens that friend's birthday slideshow.
  useEffect(() => {
    if (window.location.search) window.history.replaceState({}, '', window.location.pathname);
  }, []);
  useEffect(() => {
    if (!pendingOpenBirthdayKidId || friendKids.length === 0) return;
    const kid = friendKids.find(k => k.id === pendingOpenBirthdayKidId);
    if (kid) {
      setBirthdaySlideshowFriend({ kid, entries: friendEntries });
      setPendingOpenBirthdayKidId(null);
    }
  }, [pendingOpenBirthdayKidId, friendKids, friendEntries]);
  // ?openPatinaJar=<kidId> from the monthly reminder push — waits for this
  // family's own kids (not friendKids) to load, then jumps straight to that
  // kid's Patina Jar screen instead of leaving the tap at plain Home.
  useEffect(() => {
    if (!pendingOpenPatinaJarKidId || kids.length === 0) return;
    const kid = kids.find(k => k.id === pendingOpenPatinaJarKidId);
    if (kid) {
      setPatinaJarKidId(kid.id);
      setPatinaJarBackScreen('profile');
      setScreen('patina-jar');
      setPendingOpenPatinaJarKidId(null);
    }
  }, [pendingOpenPatinaJarKidId, kids]);
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
    const recap = computeMonthRecap(entries, lastMonth);
    if (recap.letters === 0) return;
    setMonthlyRecap(recap);
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
        ? supabase.from('kids').select('id, name, birthdate, accent, avatar_url, user_id, sex, growth_log, family_id, wishlist_url, archived_at, patina_jar_song').eq('family_id', currentFamilyId).order('created_at')
        : supabase.from('kids').select('id, name, birthdate, accent, avatar_url, user_id, sex, growth_log, family_id, wishlist_url, archived_at, patina_jar_song').eq('user_id', session.user.id).order('created_at');
      const familyNameQ = currentFamilyId
        ? supabase.from('families').select('name').eq('id', currentFamilyId).maybeSingle()
        : Promise.resolve({ data: null });
      const [{ data: kidsData, error: kidsError }, { data: entriesData, error: entriesError }, { data: familyRow }] = await Promise.all([
        kidsQ,
        entriesQ,
        familyNameQ,
      ]);
      if (currentFamilyId) setFamilyName(familyRow?.name ?? null);

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
        setKids(kidsData.map(k => ({ id: k.id, name: k.name, birthdate: k.birthdate, accent: k.accent || KID_ACCENTS[0], avatar: k.avatar_url, sex: k.sex || null, growthLog: k.growth_log || [], wishlistUrl: k.wishlist_url || null, archivedAt: k.archived_at || null, patinaJarSong: k.patina_jar_song || null })));
        setProfileKidId(kidsData[0]?.id ?? null);
      }
      if (entriesData) {
        let savedCrops = {};
        try { savedCrops = JSON.parse(localStorage.getItem(`patina-crop-positions-${session.user.id}`) || '{}'); } catch {}
        setEntries(entriesData.map(e => {
          const n = normalizeEntry(e);
          n.media = n.media.map(m => savedCrops[`${n.id}::${m.url}`] != null ? { ...m, cropY: savedCrops[`${n.id}::${m.url}`] } : m);
          return n;
        }));
      }
      // Seed last-seen so the badge doesn't fire for all pre-existing entries on first load
      const lsKey = `patina-last-seen-${session.user.id}`;
      if (!localStorage.getItem(lsKey)) localStorage.setItem(lsKey, new Date().toISOString());

      if (currentFamilyId) {
        const { data: savedReelsData } = await supabase.from('saved_reels').select('id, title, start_date, end_date, song, song2, duration_sec, slide_refs, created_at').eq('family_id', currentFamilyId).order('created_at', { ascending: false });
        if (savedReelsData) setSavedReels(savedReelsData.map(r => ({ id: r.id, title: r.title, startDate: r.start_date, endDate: r.end_date, song: r.song || null, song2: r.song2 || null, durationSec: r.duration_sec || 30, slideRefs: r.slide_refs || null })));

        const { data: patinaJarData } = await supabase.from('patina_jar_entries').select('id, kid_id, year, month_index, video_url, created_at').eq('family_id', currentFamilyId);
        if (patinaJarData) setPatinaJarEntries(patinaJarData.map(r => ({ id: r.id, kidId: r.kid_id, year: r.year, monthIndex: r.month_index, videoUrl: r.video_url, createdAt: r.created_at })));
      }

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
              // No time cutoff — the friends feed is a normal scrollable list, so
              // there's no reason to silently hide a friend's older posts instead
              // of just letting people scroll to them.
              const [{ data: fKids }, { data: fEntries }] = await Promise.all([
                supabase.from('kids').select('id, name, birthdate, accent, avatar_url, user_id, sex, family_id, wishlist_url').in('family_id', friendFamilyIds),
                supabase.from('entries').select('id, date, created_at, kid_ids, mood, milestone, age_months, family_id, user_id, shared, shared_with, type, prompt, entry_media(url, type)').in('family_id', friendFamilyIds).neq('shared', false).order('created_at', { ascending: false }),
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

        // Load own profile (discoverable setting)
        const { data: ownProfile } = await supabase.from('profiles').select('discoverable, sharing_defaults').eq('id', session.user.id).maybeSingle();
        if (ownProfile) {
          setDiscoverable(ownProfile.discoverable ?? true);
          if (ownProfile.sharing_defaults) setSharingDefaults(ownProfile.sharing_defaults);
        }
        // Activity feed (likes/comments/replies) is seeded separately, from
        // notification_log — see the backfill effect below. This used to also
        // run its own raw entry_likes/entry_comments query here with a different
        // id scheme, which double-counted the same event under two different ids.

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
        // Seeing the live toast counts as "notified" on its own — no need to
        // also leave a persistent badge for something that just got announced
        // in real time. The badge is reserved for entries that arrived while
        // this session wasn't open to catch the toast at all.
        markPartnerEntrySeen(newEntry.id);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'entry_likes' }, payload => {
        const { entry_id, user_id } = payload.new;
        if (user_id === currentUserIdRef.current) return;
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
        if (user_id === currentUserIdRef.current) return;
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

  // Backfill unread activity from notification_log on load — the realtime
  // listeners above only ever populate reactionNotifications for events that
  // arrive while a socket is actually connected, so anything that happened
  // while the app was closed (exactly when a push notification would have
  // mattered) would otherwise never show up as a badge or Activity row at all.
  useEffect(() => {
    if (!supabase || !session?.user?.id) return;
    supabase
      .from('notification_log')
      .select('id, kind, title, body, url, created_at, from_user_id')
      .eq('user_id', session.user.id)
      .is('read_at', null)
      .in('kind', ['like', 'comment', 'reply'])
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        const backfilled = data.map(row => ({
          id: row.id,
          type: row.kind,
          fromName: null,
          fromUserId: row.from_user_id || null,
          entryId: entryIdFromNotifUrl(row.url),
          kidNames: null,
          body: row.body,
          ts: new Date(row.created_at).getTime(),
          fromLog: true,
        }));
        setReactionNotifications(prev => {
          const ids = new Set(prev.map(n => n.id));
          return [...prev, ...backfilled.filter(n => !ids.has(n.id))];
        });
      });
  }, [session?.user?.id]);

  const screenRef = useRef(screen);
  useEffect(() => { screenRef.current = screen; }, [screen]);

  const handleNavigate = useCallback((s) => setScreen(s), []);

  // Lateral navigation between sibling sub-tabs within the Circle (Feed/Friends)
  // and Keepsakes (Recap/All letters/At the same age) sections — resets any
  // deep-link context so switching sections lands on a generic, not stale, view.
  const switchSection = useCallback((id) => {
    if (id === 'compare') setCompareTarget(null);
    if (id === 'recap') setRecapTarget(null);
    if (id === 'partner-letters') setLetterAuthorId(null);
    setScreen(id);
  }, []);

  // Deep-link into the Recap screen (from a reel/slideshow's closing-card
  // stat tiles) pre-filtered to a specific month and/or stat — reuses
  // Recap's own filter UI instead of re-implementing it inside the reel.
  // Like compareTarget above, this only takes effect on Recap's *next*
  // fresh mount's initial state, not a live re-filter of an already-mounted
  // Recap screen — same accepted tradeoff this codebase already makes for
  // compareTarget's own deep-link into Compare.
  const openRecapFor = useCallback((target) => {
    setRecapTarget(target);
    setScreen('recap');
  }, []);

  useEffect(() => {
    if (screen === 'circle-feed' || screen === 'friends') setCircleGroupMounted(true);
    if (screen === 'recap') setRecapMounted(true);
    if (screen === 'partner-letters') setPartnerLettersMounted(true);
    if (screen === 'compare') setCompareMounted(true);
    if (screen === 'reels') setReelsMounted(true);
  }, [screen]);

  const openEntry = useCallback((entry) => {
    markPartnerEntrySeen(entry.id);
    setEntrySource(screenRef.current);
    setActiveEntry(entry);
    setScreen('entry-detail');
  // markPartnerEntrySeen is a plain function redeclared every render (it
  // closes over `session`), not a stable useCallback — with an empty dep
  // array here, this useCallback froze the very first render's closure,
  // which closed over `session` while it was still null (auth resolves
  // after mount). That stale closure's own `if (!session?.user?.id) return`
  // guard silently no-oped on every call forever, so opening an entry never
  // actually cleared the unseen-partner badge. Depending on the id here
  // forces a fresh closure once session becomes real (and again on
  // sign-out/in), which is the only part of that closure that can go stale.
  }, [session?.user?.id]);

  async function handleUpdateCrop(entryId, mediaUrl, y) {
    const applyCrop = media => (media || []).map(m => m.url === mediaUrl ? { ...m, cropY: y } : m);
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, media: applyCrop(e.media) } : e));
    setActiveEntry(prev => prev?.id === entryId ? { ...prev, media: applyCrop(prev.media) } : prev);
    try {
      const key = `patina-crop-positions-${session?.user?.id}`;
      const stored = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(key, JSON.stringify({ ...stored, [`${entryId}::${mediaUrl}`]: y }));
    } catch {}
    if (!localMode && supabase && session) {
      // .select() forces the response to report which rows actually matched —
      // a bare .update() returns 200 with no data even when RLS silently
      // excluded every row, so without this an update that never persisted
      // looks identical to one that succeeded.
      const { data, error } = await supabase.from('entry_media').update({ crop_y: y }).eq('entry_id', entryId).eq('url', mediaUrl).select();
      if (error || !data || data.length === 0) {
        console.error('Crop did not persist — entry_media update matched no rows.', error);
      }
    }
  }

  // Single source of truth for share_token so the full entry action sheet and
  // the feed's long-press quick menu never generate two different tokens for
  // the same entry (which would silently invalidate whichever link was made
  // first — the DB column only holds one value at a time).
  async function handleGenerateShareLink(entry) {
    if (entry.shareToken) return entry.shareToken;
    if (!supabase) return null;
    const token = crypto.randomUUID();
    const { error } = await supabase.from('entries').update({ share_token: token }).eq('id', entry.id);
    if (error) return null;
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, shareToken: token } : e));
    setActiveEntry(prev => prev?.id === entry.id ? { ...prev, shareToken: token } : prev);
    return token;
  }

  async function handleRevokeShareLink(entryId) {
    if (!supabase) return;
    const { error } = await supabase.from('entries').update({ share_token: null }).eq('id', entryId);
    if (error) return;
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, shareToken: null } : e));
    setActiveEntry(prev => prev?.id === entryId ? { ...prev, shareToken: null } : prev);
  }

  // Unlike an entry's single mutable share_token column, a reel isn't a
  // persistent row — it's computed client-side each time. So sharing a reel
  // freezes a snapshot (the exact slides/song/stats it just showed) into its
  // own reel_shares row, rather than reusing a token; revoking deletes it.
  async function handleGenerateReelShare({ reelType, title, payload }) {
    if (!supabase || !session || !familyId) return null;
    const { data, error } = await supabase.from('reel_shares').insert({
      family_id: familyId,
      created_by: session.user.id,
      reel_type: reelType,
      title,
      payload,
    }).select('id, share_token').single();
    if (error || !data) {
      console.error('[reel share] failed to create share link', error);
      return null;
    }
    return data;
  }

  async function handleRevokeReelShare(id) {
    if (!supabase) return;
    await supabase.from('reel_shares').delete().eq('id', id);
  }

  // Saves the *definition* of a custom-range reel (title + date range) — not
  // a frozen snapshot like reel_shares. It's regenerated live from current
  // entries every time it's opened (see the rangeReel render block), so
  // entries added later within that range enrich it automatically.
  async function handleCreateSavedReel({ title, startDate, endDate, song = null, song2 = null, durationSec = 30, slideRefs = null }) {
    if (localMode || !supabase || !session || !familyId) {
      const reel = { id: Date.now(), title, startDate, endDate, song, song2, durationSec, slideRefs };
      setSavedReels(prev => [reel, ...prev]);
      return reel;
    }
    const { data, error } = await supabase.from('saved_reels').insert({
      family_id: familyId,
      created_by: session.user.id,
      title,
      start_date: startDate,
      end_date: endDate,
      song,
      song2,
      duration_sec: durationSec,
      slide_refs: slideRefs,
    }).select('id, title, start_date, end_date, song, song2, duration_sec, slide_refs').single();
    if (error || !data) {
      alert('Could not save this reel. Please try again.\n' + (error?.message || ''));
      return null;
    }
    const reel = { id: data.id, title: data.title, startDate: data.start_date, endDate: data.end_date, song: data.song || null, song2: data.song2 || null, durationSec: data.duration_sec || 30, slideRefs: data.slide_refs || null };
    setSavedReels(prev => [reel, ...prev]);
    return reel;
  }

  // Persists title/length/song(s)/slide arrangement from the reel editor in
  // one shot — the editor always sends all five, whether or not each one
  // actually changed, so this stays a plain overwrite rather than a partial
  // patch (simpler, and safe since the editor always initializes from the
  // reel's current values anyway).
  async function handleUpdateSavedReel(id, { title, song, song2, durationSec, slideRefs }) {
    setSavedReels(prev => prev.map(r => r.id === id ? { ...r, title, song, song2, durationSec, slideRefs } : r));
    if (!localMode && supabase) {
      await supabase.from('saved_reels').update({ title, song, song2, duration_sec: durationSec, slide_refs: slideRefs }).eq('id', id);
    }
    return { id, title, song, song2, durationSec, slideRefs };
  }

  async function handleDeleteSavedReel(id) {
    setSavedReels(prev => prev.filter(r => r.id !== id));
    if (!localMode && supabase) await supabase.from('saved_reels').delete().eq('id', id);
  }

  // Freezes an auto-picked song into an already-saved reel's row the first
  // time it resolves — same permanence the slides already have. Without this,
  // a saved reel with no user-chosen soundtrack would re-derive its song from
  // the pool on every open, which drifts the moment the pool itself changes.
  async function handleUpdateSavedReelSong(id, field, song) {
    setSavedReels(prev => prev.map(r => r.id === id ? { ...r, [field]: song } : r));
    if (!localMode && supabase) await supabase.from('saved_reels').update({ [field]: song }).eq('id', id);
  }

  // One row per kid per (year, month) — re-recording a month is delete-then-
  // insert (see the unique constraint in patina-jar-entries-table.sql), not
  // an update, so there's no corresponding handleUpdatePatinaJarEntry.
  async function handleCreatePatinaJarEntry({ kidId, year, monthIndex, videoUrl }) {
    if (localMode || !supabase || !session || !familyId) {
      const row = { id: Date.now(), kidId, year, monthIndex, videoUrl, createdAt: new Date().toISOString() };
      setPatinaJarEntries(prev => [...prev, row]);
      return row;
    }
    const { data, error } = await supabase.from('patina_jar_entries').insert({
      kid_id: kidId, family_id: familyId, year, month_index: monthIndex, video_url: videoUrl, created_by: session.user.id,
    }).select('id, kid_id, year, month_index, video_url, created_at').single();
    if (error || !data) {
      // 23505 = unique_violation — someone else in the family recorded this
      // exact kid+year+month between this screen loading and this insert
      // landing (both parents recording around the same time). Not a
      // transient failure "try again" would ever fix, so surface it as what
      // it actually is and pull in the real row that won the race, rather
      // than leaving this client's grid stuck showing the month as empty.
      if (error?.code === '23505') {
        const { data: existing } = await supabase.from('patina_jar_entries').select('id, kid_id, year, month_index, video_url, created_at').eq('kid_id', kidId).eq('year', year).eq('month_index', monthIndex).maybeSingle();
        if (existing) {
          const row = { id: existing.id, kidId: existing.kid_id, year: existing.year, monthIndex: existing.month_index, videoUrl: existing.video_url, createdAt: existing.created_at };
          setPatinaJarEntries(prev => prev.some(r => r.id === row.id) ? prev : [...prev, row]);
        }
        alert("Someone in your family already recorded this month's question — you can watch it from the jar instead.");
      } else {
        alert('Could not save this recording. Please try again.\n' + (error?.message || ''));
      }
      return null;
    }
    const row = { id: data.id, kidId: data.kid_id, year: data.year, monthIndex: data.month_index, videoUrl: data.video_url, createdAt: data.created_at };
    setPatinaJarEntries(prev => [...prev, row]);
    return row;
  }

  async function handleDeletePatinaJarEntry(id) {
    const removed = patinaJarEntries.find(r => r.id === id);
    setPatinaJarEntries(prev => prev.filter(r => r.id !== id));
    if (!localMode && supabase) await supabase.from('patina_jar_entries').delete().eq('id', id);
    if (removed?.videoUrl) deleteCloudinaryMedia([], [removed.videoUrl]);
  }

  async function handleUpdatePatinaJarSong(kidId, song) {
    setKids(prev => prev.map(k => k.id === kidId ? { ...k, patinaJarSong: song } : k));
    if (!localMode && supabase) await supabase.from('kids').update({ patina_jar_song: song }).eq('id', kidId);
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

  async function uploadToCloudinary(fileOrBlob, resourceType = 'image', attempt = 1) {
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
    } catch (e) {
      // Videos are the slow, flaky case on mobile data — one dropped connection
      // shouldn't be the difference between saved and lost, so retry a couple
      // times with backoff before surfacing a failure to the user.
      if (resourceType === 'video' && attempt < 3) {
        await new Promise(r => setTimeout(r, 2000 * attempt));
        return uploadToCloudinary(fileOrBlob, resourceType, attempt + 1);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  // Cloudinary secure_urls we store are always the raw upload response (no
  // transformation segment baked in), so the public_id is reliably whatever
  // sits between the version segment and the file extension.
  function cloudinaryPublicId(url) {
    if (!url || !url.includes('res.cloudinary.com')) return null;
    const m = url.match(/\/upload\/(?:v\d+\/)?(.+?)\.[a-zA-Z0-9]+(?:$|\?)/);
    return m ? m[1] : null;
  }

  // Deleting an entry (or replacing its media on edit) only ever removed the
  // Supabase rows — the actual Cloudinary asset was never destroyed, so every
  // deleted/replaced photo or video just sat there counting against storage
  // and bandwidth credits forever. Fire this alongside every deletion/edit path.
  async function deleteCloudinaryMedia(mediaItems, extraVideoUrls = []) {
    if (!supabase || !session) return;
    const resources = [];
    for (const item of mediaItems || []) {
      const publicId = cloudinaryPublicId(item?.url);
      if (publicId) resources.push({ publicId, resourceType: item.type === 'video' ? 'video' : 'image' });
    }
    for (const url of extraVideoUrls) {
      const publicId = cloudinaryPublicId(url);
      if (publicId) resources.push({ publicId, resourceType: 'video' }); // voice memos upload as 'video'
    }
    if (resources.length === 0) return;
    try {
      await supabase.functions.invoke('delete-media', { body: { resources } });
    } catch (err) {
      console.error('Cloudinary cleanup failed (non-fatal — Supabase rows are already gone):', err);
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
    const removed = entries.find(e => e.id === entryId);
    setEntries(prev => prev.filter(e => e.id !== entryId));
    setScreen('home');
    setActiveEntry(null);
    if (localMode || !supabase || !session) return;
    // Likes/comments reference the entry — clear them first so the entries
    // delete below doesn't get silently blocked by a foreign key constraint.
    await supabase.from('entry_likes').delete().eq('entry_id', entryId);
    await supabase.from('entry_comments').delete().eq('entry_id', entryId);
    await supabase.from('entry_media').delete().eq('entry_id', entryId);
    // .select() so we can tell a real delete apart from an RLS policy quietly
    // matching zero rows — Postgrest reports that as success with no error.
    const { data, error } = await supabase.from('entries').delete().eq('id', entryId).select('id');
    if (error || !data || data.length === 0) {
      console.error('Delete entry failed:', error || 'no rows deleted (blocked by RLS?)');
      if (removed) setEntries(prev => prev.some(e => e.id === entryId) ? prev : [removed, ...prev]);
      alert('Could not delete this entry. Please try again.\n' + (error?.message || 'You may not have permission to delete this post.'));
      return;
    }
    if (removed) deleteCloudinaryMedia(removed.media, removed.voiceMemoUrl ? [removed.voiceMemoUrl] : []);
  }

  async function handleQuickDelete(entryId) {
    const removed = entries.find(e => e.id === entryId);
    setEntries(prev => prev.filter(e => e.id !== entryId));
    if (localMode || !supabase || !session) return;
    await supabase.from('entry_likes').delete().eq('entry_id', entryId);
    await supabase.from('entry_comments').delete().eq('entry_id', entryId);
    await supabase.from('entry_media').delete().eq('entry_id', entryId);
    // .select() so we can tell a real delete apart from an RLS policy quietly
    // matching zero rows — Postgrest reports that as success with no error.
    const { data, error } = await supabase.from('entries').delete().eq('id', entryId).select('id');
    if (error || !data || data.length === 0) {
      console.error('Delete entry failed:', error || 'no rows deleted (blocked by RLS?)');
      if (removed) setEntries(prev => prev.some(e => e.id === entryId) ? prev : [removed, ...prev]);
      alert('Could not delete this entry. Please try again.\n' + (error?.message || 'You may not have permission to delete this post.'));
      return;
    }
    if (removed) deleteCloudinaryMedia(removed.media, removed.voiceMemoUrl ? [removed.voiceMemoUrl] : []);
  }

  async function handleRefresh() {
    if (localMode || !supabase || !session) return;
    const promises = [supabase.from('entries').select('*, entry_media(*)').eq('family_id', familyId).order('date', { ascending: false })];
    if (friendFamilyIds.length > 0) {
      promises.push(supabase.from('entries').select('id, date, created_at, kid_ids, mood, milestone, age_months, family_id, user_id, shared, shared_with, type, prompt, entry_media(url, type)').in('family_id', friendFamilyIds).neq('shared', false).order('created_at', { ascending: false }));
    }
    const [{ data }, friendResult] = await Promise.all(promises);
    if (data) {
      let savedCrops = {};
      try { savedCrops = JSON.parse(localStorage.getItem(`patina-crop-positions-${session?.user?.id}`) || '{}'); } catch {}
      setEntries(data.map(e => {
        const n = normalizeEntry(e);
        n.media = n.media.map(m => savedCrops[`${n.id}::${m.url}`] != null ? { ...m, cropY: savedCrops[`${n.id}::${m.url}`] } : m);
        return n;
      }));
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

  // One synthetic card per kid with >=1 Patina Jar recording, for the Reels
  // tab — kept as its own list (not merged into savedReels itself) since
  // SavedReelsScreen's empty-state check and swipe-hint effect are both
  // keyed directly off savedReels.length/savedReels[0], and these cards have
  // no startDate/endDate for formatRangeLabel to work with anyway.
  const patinaJarCards = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const kidIdsWithClips = [...new Set(patinaJarEntries.map(r => r.kidId))];
    return kids.filter(k => kidIdsWithClips.includes(k.id)).map(k => ({
      id: `patina-jar-${k.id}`,
      kidId: k.id,
      kidName: k.name,
      kidAvatar: k.avatar,
      kidAccent: k.accent,
      countThisYear: patinaJarEntries.filter(r => r.kidId === k.id && r.year === currentYear).length,
    }));
  }, [patinaJarEntries, kids]);


  function editEntry(entry) {
    setActiveEntry(entry);
    setScreen('edit-entry');
  }

  async function handleSaveEntry({ kids: kidIds, text, mood, milestone, media, fileObjects, compressedFiles, date, entryId, signedAs, location, locationLat, locationLng, song, sharedWith = { partner: true, family: false, friends: false }, people, voiceMemoBlob, voiceMemoUrl, type: entryType = 'letter', prompt = null, sameAgeDates = null }) {
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
        if (!fileObj) return { url: item.url, type: item.type, kidId: item.kidId ?? null, cropY: item.cropY ?? null };
        const isVid = item.type === 'video';
        if (isVid && fileObj.size > 100 * 1024 * 1024) return { url: null, type: item.type, err: `Video is ${Math.round(fileObj.size / 1024 / 1024)}MB — please trim it to under 100MB` };
        try {
          const uploaded = await uploadToCloudinary(fileObj, isVid ? 'video' : 'image');
          return { url: uploaded, type: item.type, kidId: item.kidId ?? null, cropY: item.cropY ?? null };
        } catch (e) {
          console.error('Media upload failed:', e);
          return { url: null, type: item.type, err: e?.message || 'Unknown error' };
        }
      }));

      const saved = results.filter(r => r.url && !r.url.startsWith('blob:') && !r.url.startsWith('data:'));
      const failed = results.find(r => r.err);
      if (saved.length > 0) {
        // entry_media is fully deleted and re-inserted on every edit (see the
        // caller above) — omitting crop_y here would silently wipe every
        // photo's crop the next time the entry is saved for any reason.
        await supabase.from('entry_media').insert(saved.map(m => ({ entry_id: entryRowId, url: m.url, type: m.type, kid_id: m.kidId ?? null, crop_y: m.cropY ?? null })));
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
      // Whatever old media/voice memo this edit drops (removed photos, a re-recorded
      // voice memo) is about to become an orphaned Cloudinary asset otherwise — the
      // entry_media rows below are gone either way, but nothing destroys the asset itself.
      const oldEntry = entries.find(e => e.id === entryId);
      const droppedMedia = (oldEntry?.media || []).filter(m => !media.some(nm => nm.url === m.url));
      const droppedVoiceMemo = oldEntry?.voiceMemoUrl && oldEntry.voiceMemoUrl !== voiceMemoUrlFinal ? [oldEntry.voiceMemoUrl] : [];
      deleteCloudinaryMedia(droppedMedia, droppedVoiceMemo);

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
        media: media.map(item => ({ url: item.url, type: item.type, kidId: item.kidId ?? null })),
        song: song || null,
        sameAgeDates,
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
      same_age_dates: sameAgeDates,
    }).select().single();

    if (error || !entry) {
      alert('Could not save your entry. Please try again.\n' + (error?.message || ''));
      return;
    }

    // Optimistically show entry and navigate away immediately
    const optimisticEntry = { id: entry.id, userId: session.user.id, kids: kidIds, date, type: entryType, prompt, createdAt: entry.created_at || new Date().toISOString(), text: text || '', mood, milestone, ageMonths, palette, media: [], signedAs: signedAs || null, location: location || null, locationLat: locationLat ?? null, locationLng: locationLng ?? null, song: song || null, people: people || [], shared, sharedWith, voiceMemoUrl: voiceMemoUrlFinal, sameAgeDates };
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
        body: { authorName, partnerUserId: partnerMember.user_id, kidNames, entryDate: date, entryText: text, entryId: entry.id },
      }).then(({ data, error }) => {
        if (error || data?.emailError || data?.pushError) console.error('notify-partner did not fully succeed:', error || data?.emailError, data?.pushError);
      }).catch(err => console.error('notify-partner request failed:', err));
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
      return;
    }
    if (previousAvatar) deleteCloudinaryMedia([{ url: previousAvatar, type: 'image' }]);
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

  async function handleUpdateFamilyName(name) {
    setFamilyName(name || null);
    if (!localMode && supabase && familyId) {
      await supabase.from('families').update({ name: name || null }).eq('id', familyId);
    }
  }

  // Folds another kid + their matching-age photo into an existing entry, turning
  // it into one merged post addressed to all of them — rather than creating a
  // separate entry per matched kid. Returns the updated entry (or null on failure)
  // so a caller matching several kids in a row can chain off the freshest kid_ids/
  // sameAgeDates instead of a stale pre-update reference.
  async function handleAddSameAgeMatch(sourceEntry, targetKid, photoDate, file) {
    const newKidIds = [...sourceEntry.kids, targetKid.id];
    const newSameAgeDates = { ...(sourceEntry.sameAgeDates || {}), [targetKid.id]: photoDate };
    const mediaType = file.type.startsWith('video') ? 'video' : 'image';
    if (localMode || !supabase || !session) {
      const url = URL.createObjectURL(file);
      const updated = { ...sourceEntry, kids: newKidIds, sameAgeDates: newSameAgeDates, media: [...sourceEntry.media, { url, type: mediaType, kidId: targetKid.id }] };
      setEntries(prev => prev.map(e => e.id === sourceEntry.id ? updated : e));
      return updated;
    }
    try {
      const url = await uploadToCloudinary(file, mediaType);
      await supabase.from('entry_media').insert({ entry_id: sourceEntry.id, url, type: mediaType, kid_id: targetKid.id });
      await supabase.from('entries').update({ kid_ids: newKidIds, same_age_dates: newSameAgeDates }).eq('id', sourceEntry.id);
      const updated = { ...sourceEntry, kids: newKidIds, sameAgeDates: newSameAgeDates, media: [...sourceEntry.media, { url, type: mediaType, kidId: targetKid.id }] };
      setEntries(prev => prev.map(e => e.id === sourceEntry.id ? updated : e));
      return updated;
    } catch (err) {
      alert('Could not save that photo. Please try again.\n' + (err?.message || ''));
      return null;
    }
  }

  // The inverse of handleAddSameAgeMatch — undoes a wrong match by deleting the
  // matched kid's photo outright and reverting the entry back to its original
  // solo post. (An earlier version spun the removed photo off into its own new
  // note instead of deleting it — but that new note inherited the original
  // post's likes/comments, which made it look like the post itself had just
  // been renamed rather than actually undone. A plain delete is what "undo a
  // mistaken match" actually means, so that's what this does now.)
  async function handleRemoveSameAgeMatch(entry, kidId) {
    if (!(entry.sameAgeDates?.[kidId])) return; // only a matched (non-anchor) kid can be removed
    const removedMedia = entry.media.filter(m => m.kidId === kidId);
    const remainingMedia = entry.media.filter(m => m.kidId !== kidId);
    const newKidIds = entry.kids.filter(id => id !== kidId);
    const newSameAgeDates = { ...entry.sameAgeDates };
    delete newSameAgeDates[kidId];

    if (!localMode && supabase && session) {
      await supabase.from('entry_media').delete().eq('entry_id', entry.id).eq('kid_id', kidId);
      await supabase.from('entries').update({ kid_ids: newKidIds, same_age_dates: newSameAgeDates }).eq('id', entry.id);
      deleteCloudinaryMedia(removedMedia);
    }
    const updatedEntry = { ...entry, kids: newKidIds, sameAgeDates: newSameAgeDates, media: remainingMedia };
    setEntries(prev => prev.map(e => e.id === entry.id ? updatedEntry : e));
  }

  // Reorders an entry's photos/videos — used to let the user pick which of a
  // same-age pair's two photos shows as the post's cover. Media has no explicit
  // position column, so persisting a new order means delete + re-insert in the
  // desired sequence (mirroring the same technique handleSaveEntry's edit path
  // already uses whenever an entry's media set changes).
  async function handleReorderMedia(entryId, orderedMedia) {
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, media: orderedMedia } : e));
    if (localMode || !supabase || !session) return;
    await supabase.from('entry_media').delete().eq('entry_id', entryId);
    await supabase.from('entry_media').insert(orderedMedia.map(m => ({ entry_id: entryId, url: m.url, type: m.type, kid_id: m.kidId ?? null, crop_y: m.cropY ?? null })));
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
      const { data: kidsData } = await supabase.from('kids').select('id, name, birthdate, accent, avatar_url, sex, growth_log, wishlist_url, archived_at, patina_jar_song').eq('family_id', existingFamilyId).order('created_at');
      if (kidsData?.length > 0) {
        // Already have kids — just load them
        setKids(kidsData.map(k => ({ id: k.id, name: k.name, birthdate: k.birthdate, accent: k.accent || KID_ACCENTS[0], avatar: k.avatar_url, sex: k.sex || null, growthLog: k.growth_log || [], wishlistUrl: k.wishlist_url || null, archivedAt: k.archived_at || null, patinaJarSong: k.patina_jar_song || null })));
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
      supabase.from('kids').select('id, name, birthdate, accent, avatar_url, user_id, sex, growth_log, family_id, wishlist_url, archived_at, patina_jar_song').eq('family_id', invite.family_id).order('created_at'),
      supabase.from('entries').select('*, entry_media(*)').eq('family_id', invite.family_id).order('date', { ascending: false }),
      supabase.from('family_members').select('id, user_id, family_id, display_name, avatar_url').eq('family_id', invite.family_id),
    ]);
    if (kidsData) {
      setKids(kidsData.map(k => ({ id: k.id, name: k.name, birthdate: k.birthdate, accent: k.accent || KID_ACCENTS[0], avatar: k.avatar_url, sex: k.sex || null, growthLog: k.growth_log || [], wishlistUrl: k.wishlist_url || null, archivedAt: k.archived_at || null })));
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

  // Archiving keeps every existing letter/photo intact — it only stops a kid
  // from showing up on new-letter pickers, the home avatar row, same-age
  // targets, birthday checks, and wishlist nudges (all of which read from
  // `activeKids`, not the raw `kids` list, so old entries keep rendering fine).
  async function handleArchiveKid(kidId) {
    const archivedAt = new Date().toISOString();
    setKids(prev => prev.map(k => k.id === kidId ? { ...k, archivedAt } : k));
    if (localMode || !supabase || !session) return;
    await supabase.from('kids').update({ archived_at: archivedAt }).eq('id', kidId);
  }

  async function handleRestoreKid(kidId) {
    setKids(prev => prev.map(k => k.id === kidId ? { ...k, archivedAt: null } : k));
    if (localMode || !supabase || !session) return;
    await supabase.from('kids').update({ archived_at: null }).eq('id', kidId);
  }

  // Permanently erases a kid: entries solely about them are fully deleted
  // (mirroring handleDeleteEntry's cascade), entries shared with a sibling
  // just lose this kid's side (their tagged photo + kid_ids/same_age_dates
  // entry), then the kid row itself and its avatar asset are removed.
  async function handleEraseKid(kidId) {
    const kid = kids.find(k => k.id === kidId);
    if (!kid) return;
    const affected = entries.filter(e => e.kids.includes(kidId));
    const soloEntries = affected.filter(e => e.kids.length === 1);
    const sharedEntries = affected.filter(e => e.kids.length > 1);

    setKids(prev => prev.filter(k => k.id !== kidId));
    const soloIds = new Set(soloEntries.map(e => e.id));
    setEntries(prev => prev
      .filter(e => !soloIds.has(e.id))
      .map(e => {
        if (!sharedEntries.some(se => se.id === e.id)) return e;
        const newSameAgeDates = e.sameAgeDates ? { ...e.sameAgeDates } : null;
        if (newSameAgeDates) { delete newSameAgeDates[kidId]; }
        return {
          ...e,
          kids: e.kids.filter(id => id !== kidId),
          media: e.media.filter(m => m.kidId !== kidId),
          sameAgeDates: newSameAgeDates && Object.keys(newSameAgeDates).length > 0 ? newSameAgeDates : null,
        };
      }));

    if (localMode || !supabase || !session) return;

    for (const entry of soloEntries) {
      await supabase.from('entry_likes').delete().eq('entry_id', entry.id);
      await supabase.from('entry_comments').delete().eq('entry_id', entry.id);
      await supabase.from('entry_media').delete().eq('entry_id', entry.id);
      await supabase.from('entries').delete().eq('id', entry.id);
      deleteCloudinaryMedia(entry.media, entry.voiceMemoUrl ? [entry.voiceMemoUrl] : []);
    }

    for (const entry of sharedEntries) {
      const droppedMedia = entry.media.filter(m => m.kidId === kidId);
      await supabase.from('entry_media').delete().eq('entry_id', entry.id).eq('kid_id', kidId);
      const newKidIds = entry.kids.filter(id => id !== kidId);
      const newSameAgeDates = entry.sameAgeDates ? { ...entry.sameAgeDates } : null;
      if (newSameAgeDates) delete newSameAgeDates[kidId];
      await supabase.from('entries').update({
        kid_ids: newKidIds,
        same_age_dates: newSameAgeDates && Object.keys(newSameAgeDates).length > 0 ? newSameAgeDates : null,
      }).eq('id', entry.id);
      if (droppedMedia.length > 0) deleteCloudinaryMedia(droppedMedia);
    }

    if (kid.avatar) deleteCloudinaryMedia([{ url: kid.avatar, type: 'image' }]);
    await supabase.from('birthday_notifications').delete().eq('kid_id', kidId);
    await supabase.from('kids').delete().eq('id', kidId);
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

  async function handleSendFriendRequest(userId, displayName, avatarUrl) {
    if (!supabase || !session) return { error: 'Not signed in' };
    const { data, error } = await supabase
      .from('friend_requests')
      .insert({ requester_id: session.user.id, addressee_id: userId })
      .select().single();
    if (!error && data) {
      setFriendRequests(prev => [...prev, { ...data, requester_display_name: myDisplayName, requester_avatar_url: null, addressee_display_name: displayName, addressee_avatar_url: avatarUrl || null }]);
      triggerPush({ targetUserId: userId, kind: 'friend_request', fromName: myDisplayName || 'Someone' });
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
      // First-ever accepted friend — explain the sharing model once, right after
      // the moment it becomes relevant, rather than front-loading it in onboarding
      // before the user has any friends to apply it to.
      try {
        if (!localStorage.getItem('patina_seen_friends_privacy')) {
          localStorage.setItem('patina_seen_friends_privacy', '1');
          setShowFriendsPrivacyExplainer(true);
        }
      } catch {}
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
      if (previousAvatar) deleteCloudinaryMedia([{ url: previousAvatar, type: 'image' }]);
    }
    setAvatarUploading(false);
  }

  const handleClearReactions = useCallback(() => {
    setReactionNotifications([]);
    if (supabase && session?.user?.id) {
      // Mark dismissed rather than delete — the birthday-detection effect upserts
      // on a deterministic id and relies on the row still existing (ignoreDuplicates)
      // to avoid recreating a notification for a birthday still inside the 7-day window.
      supabase.from('birthday_notifications').update({ dismissed: true }).eq('user_id', session.user.id).then(() => {});
      // Also clears whatever was backfilled from notification_log on load, so it
      // doesn't reappear as unread the next time the app opens.
      supabase.from('notification_log').update({ read_at: new Date().toISOString() }).eq('user_id', session.user.id).is('read_at', null).then(() => {});
    }
    setBirthdayNotifications([]);
    setReactionToast({ message: 'All caught up' });
  }, [session?.user?.id]);

  const handleDismissReaction = useCallback(id => {
    setReactionNotifications(p => {
      const target = p.find(n => n.id === id);
      if (supabase && session?.user?.id) {
        // Items backfilled from notification_log are real rows there — mark
        // that row read directly rather than going through the separate
        // dismissed_notifications table used for purely-live (never persisted
        // with this exact id) reaction notifications.
        if (target?.fromLog) {
          supabase.from('notification_log').update({ read_at: new Date().toISOString() }).eq('id', id).then(() => {});
        } else {
          supabase.from('dismissed_notifications').insert({ user_id: session.user.id, notification_id: id }).then(() => {});
        }
      }
      return p.filter(n => n.id !== id);
    });
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

  if (sharedEntryToken) {
    return (
      <Suspense fallback={<div className="app-root" data-theme={effectiveDark ? 'dark' : undefined} style={{ alignItems: 'center', justifyContent: 'center' }} />}>
        <LazySharedEntryScreen token={sharedEntryToken} effectiveDark={effectiveDark} />
      </Suspense>
    );
  }

  if (sharedReelToken) {
    return (
      <Suspense fallback={<div className="app-root" data-theme={effectiveDark ? 'dark' : undefined} style={{ alignItems: 'center', justifyContent: 'center' }} />}>
        <LazySharedReelScreen token={sharedReelToken} effectiveDark={effectiveDark} />
      </Suspense>
    );
  }

  if (authLoading || dataLoading) {
    return (
      <div className="app-root" data-theme={effectiveDark ? 'dark' : undefined} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="ti-loader-2" style={{ fontSize: 32, color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (passwordRecovery && session) {
    return (
      <div className="app-root" data-theme={effectiveDark ? 'dark' : undefined}>
        <Suspense fallback={<div className="app-root" data-theme={effectiveDark ? 'dark' : undefined} style={{ alignItems: 'center', justifyContent: 'center' }} />}>
          <LazyUpdatePasswordScreen onDone={() => setPasswordRecovery(false)} />
        </Suspense>
      </div>
    );
  }

  if (!session && !localMode) {
    return (
      <div className="app-root" data-theme={effectiveDark ? 'dark' : undefined}>
        <Suspense fallback={<div className="app-root" data-theme={effectiveDark ? 'dark' : undefined} style={{ alignItems: 'center', justifyContent: 'center' }} />}>
          <LazyAuthScreen />
        </Suspense>
      </div>
    );
  }

  if (kids.length === 0 || postOnboardInvite) {
    return (
      <div className="app-root" data-theme={effectiveDark ? 'dark' : undefined}>
        <Suspense fallback={<div className="app-root" data-theme={effectiveDark ? 'dark' : undefined} style={{ alignItems: 'center', justifyContent: 'center' }} />}>
          {joiningFamily
            ? <LazyJoinFamilyScreen onJoin={handleJoinFamily} onBack={() => setJoiningFamily(false)} />
            : <LazyOnboardingScreen
                onDone={handleOnboardingDone}
                onJoinFamily={() => setJoiningFamily(true)}
                onSignOut={() => supabase ? supabase.auth.signOut() : undefined}
                hasBackend={!localMode && !!supabase && !!session}
                onGenerateInvite={handleInvitePartner}
                onFinish={() => setPostOnboardInvite(false)}
                currentUserId={session?.user?.id}
              />
          }
        </Suspense>
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
        const selfMember = familyMembers.find(m => m.user_id === session?.user?.id) || null;
        return (
          <HomeScreen
            kidFilter={kidFilter}
            setKidFilter={setKidFilter}
            onOpenEntry={openEntry}
            onSearch={() => setScreen('search')}
            onAddMoment={() => { setComposeMode('letter'); setScreen('new-entry'); }}
            onStartPrompt={(prompt, kidId) => { setActivePrompt(prompt); setNewEntryInitial({ kidIds: [kidId] }); setComposeMode('note'); setScreen('new-entry'); }}
            onSeeAll={() => { setJournalBackScreen('home'); setJournalMilestonesOnly(false); setScreen('journal'); }}
            onCompare={() => setScreen('compare')}
            onUpdateCrop={handleUpdateCrop}
            onGenerateShareLink={handleGenerateShareLink}
            self={selfMember}
            onRefresh={handleRefresh}
            onToggleFavorite={handleToggleFavorite}
            onDeleteEntry={handleQuickDelete}
            friendEntries={friendEntries}
            friendKids={friendKids}
            friends={friends}
            friendFamilyMap={friendFamilyMap}
            onCompareAtAge={(kidId, ageMonths, entryId) => {
              const ages = [0, 12, 18, 24, 36, 48, 60, 72, 84, 96, 108, 120];
              const bucket = ages.reduce((best, a) => ageMonths >= a ? a : best, ages[0]);
              setCompareTarget({ kidId, compareAge: bucket, entryId: entryId ?? null });
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
            onUpdateKidWishlist={handleUpdateKidWishlist}
          />
        );
      })()}

      {partnerLettersMounted && (() => {
        const partnerMember = familyMembers.find(m => m.user_id !== session?.user?.id) || null;
        const selfMember = familyMembers.find(m => m.user_id === session?.user?.id) || null;
        return (
          <div style={{ display: screen === 'partner-letters' ? 'contents' : 'none' }}>
            <ScreenErrorBoundary onBack={() => setScreen('home')}>
              <Suspense fallback={<div className="screen" />}>
                <LazyPartnerLettersScreen
                  entries={entries}
                  kids={kids}
                  unseenIds={unseenPartnerIds}
                  authorId={letterAuthorId}
                  currentUserId={session?.user?.id}
                  self={selfMember}
                  partner={partnerMember}
                  onBack={() => setScreen('home')}
                  onOpenEntry={openEntry}
                  onMarkAllRead={markAllSeen}
                  scrollPos={partnerLettersScrollPos}
                  onSwitchSection={switchSection}
                />
              </Suspense>
            </ScreenErrorBoundary>
          </div>
        );
      })()}

      {screen === 'journal' && (
        <ScreenErrorBoundary onBack={() => setScreen(journalBackScreen)}>
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
            onGenerateShareLink={handleGenerateShareLink}
            milestonesOnly={journalMilestonesOnly}
          />
        </ScreenErrorBoundary>
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
          onReorderMedia={handleReorderMedia}
          onToggleShared={!localMode ? handleToggleEntryShared : undefined}
          onGenerateShareLink={handleGenerateShareLink}
          onRevokeShareLink={handleRevokeShareLink}
          allPeople={allPeople}
          friendKids={friendKids}
          supabase={supabase}
          session={session}
          socialName={familyMembers.find(m => m.user_id === session?.user?.id)?.real_name || myDisplayName || ''}
          onSameAge={(sourceEntry, sourceKid, targets) => {
            const [targetKid, ...queue] = targets;
            setSameAgeMatch({ sourceEntry, sourceKid, targetKid, queue, queueTotal: targets.length });
            setScreen('same-age-match');
          }}
          onRemoveSameAgeMatch={handleRemoveSameAgeMatch}
          pendingSameAgeMatch={pendingSameAgeMatch?.sourceEntry.id === entries.find(e => e.id === activeEntry.id)?.id ? pendingSameAgeMatch : null}
          onConfirmSameAgeMatch={async () => {
            const { sourceEntry, sourceKid, targetKid, queue, photoDate, file, previewUrl, queueTotal } = pendingSameAgeMatch;
            const updated = await handleAddSameAgeMatch(sourceEntry, targetKid, photoDate, file);
            URL.revokeObjectURL(previewUrl);
            setPendingSameAgeMatch(null);
            if (updated && queue.length > 0) {
              const [nextTarget, ...rest] = queue;
              setSameAgeMatch({ sourceEntry: updated, sourceKid, targetKid: nextTarget, queue: rest, queueTotal });
              setScreen('same-age-match');
            }
          }}
          onCancelSameAgeMatch={() => {
            URL.revokeObjectURL(pendingSameAgeMatch.previewUrl);
            setPendingSameAgeMatch(null);
          }}
        />
      )}

      {screen === 'same-age-match' && sameAgeMatch && (
        <SameAgeMatchScreen
          sourceEntry={sameAgeMatch.sourceEntry}
          sourceKid={sameAgeMatch.sourceKid}
          targetKid={sameAgeMatch.targetKid}
          stepLabel={sameAgeMatch.queueTotal > 1 ? `${sameAgeMatch.queueTotal - sameAgeMatch.queue.length} of ${sameAgeMatch.queueTotal}` : null}
          onCancel={() => { setScreen('entry-detail'); setSameAgeMatch(null); }}
          onConfirm={(photoDate, file) => {
            setPendingSameAgeMatch({ sourceEntry: sameAgeMatch.sourceEntry, sourceKid: sameAgeMatch.sourceKid, targetKid: sameAgeMatch.targetKid, queue: sameAgeMatch.queue, queueTotal: sameAgeMatch.queueTotal, photoDate, file, previewUrl: URL.createObjectURL(file) });
            setScreen('entry-detail');
            setSameAgeMatch(null);
          }}
        />
      )}

      {screen === 'new-entry' && (
        <NewEntryScreen kids={activeKids} friendKids={friendKids} mode={composeMode} promptText={activePrompt} onCancel={() => { setScreen('home'); setNewEntryInitial(null); setActivePrompt(null); }} onSave={(...args) => { handleSaveEntry(...args); setNewEntryInitial(null); setActivePrompt(null); }} signedDefault={myDisplayName || undefined} draftKey={newEntryInitial ? null : (session?.user?.id ? `patina-new-draft-${composeMode}-${session.user.id}` : `patina-new-draft-${composeMode}`)} allPeople={allPeople} familyMembers={familyMembers} currentUserId={session?.user?.id} sharingDefaults={sharingDefaults} initialKidIds={newEntryInitial?.kidIds} initialMilestone={newEntryInitial?.milestone} initialCustomMilestone={newEntryInitial?.customMilestone} />
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

      {recapMounted && (
        <div style={{ display: screen === 'recap' ? 'contents' : 'none' }}>
          <ScreenErrorBoundary onBack={() => setScreen('home')}>
            <RecapScreen
              entries={entries}
              kids={kids}
              onBack={() => setScreen('home')}
              onOpenEntry={openEntry}
              onSwitchSection={switchSection}
              initialTarget={recapTarget}
              userId={session?.user?.id}
              onWatchMonthReel={month => setReelMonth(month)}
              onEditMonthReel={month => {
                const [y, m] = month.split('-').map(Number);
                const recap = computeMonthRecap(entries, month);
                const startDate = `${month}-01`;
                const endDate = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
                const existingSaved = savedReels.find(r => r.startDate === startDate && r.endDate === endDate);
                setEditingReel(existingSaved
                  ? { id: existingSaved.id, title: existingSaved.title, startDate, endDate, song: existingSaved.song ?? null, song2: existingSaved.song2 ?? null, durationSec: existingSaved.durationSec ?? 30, slideRefs: existingSaved.slideRefs ?? null }
                  : { id: null, title: recap.label, startDate, endDate, song: null, song2: null, durationSec: 30, slideRefs: null });
              }}
            />
          </ScreenErrorBoundary>
        </div>
      )}

      {reelsMounted && (
        <div style={{ display: screen === 'reels' ? 'contents' : 'none' }}>
          <ScreenErrorBoundary onBack={() => setScreen('home')}>
            <SavedReelsScreen
              entries={entries}
              savedReels={savedReels}
              patinaJarReels={patinaJarCards}
              onBack={() => setScreen('home')}
              onSwitchSection={switchSection}
              onDeleteReel={handleDeleteSavedReel}
              onWatchReel={reel => setRangeReel({ id: reel.id, startDate: reel.startDate, endDate: reel.endDate, title: reel.title, song: reel.song || null, song2: reel.song2 || null, durationSec: reel.durationSec || 30, slideRefs: reel.slideRefs || null })}
              onWatchPatinaJar={kidId => { setPatinaJarKidId(kidId); setPatinaJarBackScreen('reels'); setScreen('patina-jar'); }}
              onEditReel={reel => setEditingReel(reel)}
              onStartBuilding={({ title, startDate, endDate }) => setEditingReel({ id: null, title, startDate, endDate, song: null, song2: null, durationSec: 30, slideRefs: null })}
            />
          </ScreenErrorBoundary>
        </div>
      )}

      {circleGroupMounted && (
        <div style={{ display: screen === 'circle-feed' ? 'contents' : 'none' }}>
          <Suspense fallback={<div className="screen" />}>
            <LazyCircleFeedScreen
              onBack={() => setScreen('home')}
              friendKids={friendKids}
              friendFamilyMap={friendFamilyMap}
              friends={friends}
              familyMemberIds={familyMembers.filter(m => m.user_id !== session?.user?.id).map(m => m.user_id)}
              onSearchUsers={handleSearchUsers}
              onSendRequest={handleSendFriendRequest}
              onCompareAtAge={(kidId, ageMonths, entryId) => {
                const ages = [0, 12, 18, 24, 36, 48, 60, 72, 84, 96, 108, 120];
                const bucket = ages.reduce((best, a) => ageMonths >= a ? a : best, ages[0]);
                setCompareTarget({ kidId, compareAge: bucket, entryId: entryId ?? null });
                setScreen('compare');
              }}
              onSwitchSection={switchSection}
            />
          </Suspense>
        </div>
      )}

      {compareMounted && (
        <div style={{ display: screen === 'compare' ? 'contents' : 'none' }}>
          <Suspense fallback={<div className="screen" />}>
            <LazyCompareScreen
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
              initialEntryId={compareTarget?.entryId ?? null}
              onSwitchSection={switchSection}
              onSameAge={(sourceEntry, sourceKid, targets) => {
                // Same-age's match/confirm flow always lands back on entry-detail
                // for the anchor entry — set that up first since, unlike the
                // entry-detail icon, we're not already viewing it from here.
                setEntrySource('compare');
                setActiveEntry(sourceEntry);
                const [targetKid, ...queue] = targets;
                setSameAgeMatch({ sourceEntry, sourceKid, targetKid, queue, queueTotal: targets.length });
                setScreen('same-age-match');
              }}
            />
          </Suspense>
        </div>
      )}

      {circleGroupMounted && (
        <div style={{ display: screen === 'friends' ? 'contents' : 'none' }}>
          <Suspense fallback={<div className="screen" />}>
            <LazyFriendsScreen
              friends={friends}
              friendKids={friendKids}
              friendEntries={friendEntries}
              familyMemberIds={familyMembers.filter(m => m.user_id !== session?.user?.id).map(m => m.user_id)}
              familyMembers={familyMembers}
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
              onOpenNotificationHistory={() => setShowNotificationHistory(true)}
            />
          </Suspense>
        </div>
      )}

      {screen === 'search' && (
        <Suspense fallback={<div className="screen" />}>
          <LazySearchScreen entries={entries} kids={kids} onBack={() => setScreen('home')} onOpenEntry={openEntry} />
        </Suspense>
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
        <Suspense fallback={<div className="screen" />}>
        <LazyProfileScreen
          kids={kids}
          entries={entries}
          onBack={() => setScreen('home')}
          onAvatarUpload={handleAvatarUpload}
          familyMembers={familyMembers}
          myDisplayName={myDisplayName}
          familyName={familyName}
          onUpdateFamilyName={handleUpdateFamilyName}
          onInvite={handleInvitePartner}
          onUpdateDisplayName={handleUpdateDisplayName}
          onUpdateRealName={handleUpdateRealName}
          onAddKid={handleAddKid}
          onRenameKid={handleRenameKid}
          onUpdateKidSex={handleUpdateKidSex}
          onUpdateKidWishlist={handleUpdateKidWishlist}
          onArchiveKid={handleArchiveKid}
          onRestoreKid={handleRestoreKid}
          onEraseKid={handleEraseKid}
          onFamilyAvatarUpload={handleFamilyAvatarUpload}
          avatarUploading={avatarUploading}
          currentUserId={session?.user?.id}
          onOpenGrowth={kidId => { setGrowthKidId(kidId); setScreen('growth'); }}
          patinaJarEntries={patinaJarEntries}
          onOpenPatinaJar={kidId => { setPatinaJarKidId(kidId); setPatinaJarBackScreen('profile'); setScreen('patina-jar'); }}
          onViewKidMoments={kidId => { setKidFilter(kidId); setJournalMilestonesOnly(false); setJournalBackScreen('profile'); setScreen('journal'); }}
          onViewKidMilestones={kidId => { setKidFilter(kidId); setJournalMilestonesOnly(true); setJournalBackScreen('profile'); setScreen('journal'); }}
          onCreateBook={() => setScreen('book-builder')}
          onDeleteAccount={localMode ? undefined : handleDeleteAccount}
          hasPartner={familyMembers.filter(m => m.user_id !== session?.user?.id).length > 0}
          darkMode={darkMode}
          onToggleDarkMode={toggleDarkMode}
          onSetDarkMode={setDarkModeValue}
          discoverable={discoverable}
          onToggleDiscoverable={handleToggleDiscoverable}
          onHidePostsFromFriends={handleHidePostsFromFriends}
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
        </Suspense>
      )}

      {screen === 'privacy' && (
        <Suspense fallback={<div className="screen" />}>
          <LazyPrivacyPolicyScreen onBack={() => setScreen('profile')} />
        </Suspense>
      )}
      {screen === 'terms' && (
        <Suspense fallback={<div className="screen" />}>
          <LazyTermsScreen onBack={() => setScreen('profile')} />
        </Suspense>
      )}

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

      {screen === 'patina-jar' && patinaJarKidId && (() => {
        const kid = kids.find(k => k.id === patinaJarKidId);
        return kid ? (
          <ScreenErrorBoundary onBack={() => setScreen(patinaJarBackScreen)}>
            <Suspense fallback={<div className="screen" />}>
              <LazyPatinaJarScreen
                kid={kid}
                entries={patinaJarEntries.filter(r => r.kidId === kid.id)}
                song={kid.patinaJarSong}
                onUpdateSong={song => handleUpdatePatinaJarSong(kid.id, song)}
                onBack={() => setScreen(patinaJarBackScreen)}
                onRecord={() => setScreen('patina-jar-record')}
                onDeleteEntry={handleDeletePatinaJarEntry}
              />
            </Suspense>
          </ScreenErrorBoundary>
        ) : null;
      })()}

      {screen === 'patina-jar-record' && patinaJarKidId && (() => {
        const kid = kids.find(k => k.id === patinaJarKidId);
        const now = new Date();
        return kid ? (
          <Suspense fallback={<div className="screen" />}>
            <LazyPatinaJarRecordScreen
              kid={kid}
              year={now.getFullYear()}
              monthIndex={now.getMonth() + 1}
              onCancel={() => setScreen('patina-jar')}
              onUploadToCloudinary={uploadToCloudinary}
              onSave={async ({ year, monthIndex, videoUrl }) => {
                await handleCreatePatinaJarEntry({ kidId: kid.id, year, monthIndex, videoUrl });
                setScreen('patina-jar');
              }}
            />
          </Suspense>
        ) : null;
      })()}

      {showInstallBanner && (
        <div style={{ padding: '0 12px 8px', flexShrink: 0 }}>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, padding: '10px 12px 10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="ti-leaf" style={{ fontSize: 18, color: 'var(--accent)', flexShrink: 0 }} />
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
              <Icon name="ti-x" style={{ fontSize: 14 }} />
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
                  <Icon name={opt.icon} style={{ fontSize: 18, color: 'var(--accent)' }} />
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
            kids={kids}
            familyMembers={familyMembers}
            onClose={() => setBirthdaySlideshow(null)}
            onGenerateReelShare={handleGenerateReelShare}
            onRevokeReelShare={handleRevokeReelShare}
            onStatClick={filter => { const kidId = birthdaySlideshow.id; setBirthdaySlideshow(null); openRecapFor({ viewMode: 'all', kidFilter: kidId, recapFilter: filter }); }}
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

      {reelMonth && (() => {
        const [y, m] = reelMonth.split('-').map(Number);
        const recap = computeMonthRecap(entries, reelMonth);
        const stats = { letters: recap.letters, milestones: recap.milestones, photos: recap.photos, favorites: recap.favorites };
        const startDate = `${reelMonth}-01`;
        const endDate = `${reelMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
        // If this month already has a saved counterpart in Keepsakes, treat it as
        // saved from the very first open too — not just after tapping the bookmark
        // this session — so it's stable on every future reopen, however you get here.
        const existingSaved = savedReels.find(r => r.startDate === startDate && r.endDate === endDate);
        return (
          <ScreenErrorBoundary onBack={() => setReelMonth(null)}>
            <Suspense fallback={<div className="screen" />}>
              <LazyMonthlyReelScreen
                entries={entries}
                kids={kids}
                familyMembers={familyMembers}
                startDate={startDate}
                endDate={endDate}
                monthLabel={recap.label}
                stats={stats}
                reelId={existingSaved?.id ?? null}
                customSong={existingSaved?.song ?? null}
                customSong2={existingSaved?.song2 ?? null}
                slideRefs={existingSaved?.slideRefs ?? null}
                onAutoPickSong={existingSaved ? (field, song) => handleUpdateSavedReelSong(existingSaved.id, field, song) : undefined}
                onClose={() => setReelMonth(null)}
                onGenerateReelShare={handleGenerateReelShare}
                onRevokeReelShare={handleRevokeReelShare}
                onSaveReel={({ song, song2 } = {}) => handleCreateSavedReel({ title: recap.label, startDate, endDate, song: song || null, song2: song2 || null })}
                onUnsaveReel={handleDeleteSavedReel}
                onStatClick={filter => { const month = reelMonth; setReelMonth(null); openRecapFor({ viewMode: 'month', month, recapFilter: filter }); }}
                userId={session?.user?.id}
              />
            </Suspense>
          </ScreenErrorBoundary>
        );
      })()}
      {rangeReel && (() => {
        const recap = computeRangeRecap(entries, rangeReel.startDate, rangeReel.endDate, rangeReel.title);
        const stats = { letters: recap.letters, milestones: recap.milestones, photos: recap.photos, favorites: recap.favorites };
        return (
          <ScreenErrorBoundary onBack={() => setRangeReel(null)}>
            <Suspense fallback={<div className="screen" />}>
              <LazyMonthlyReelScreen
                entries={entries}
                kids={kids}
                familyMembers={familyMembers}
                startDate={rangeReel.startDate}
                endDate={rangeReel.endDate}
                monthLabel={rangeReel.title}
                stats={stats}
                reelType="range"
                customSong={rangeReel.song}
                customSong2={rangeReel.song2}
                forceLongReel={rangeReel.durationSec === 60}
                reelId={rangeReel.id}
                slideRefs={rangeReel.slideRefs}
                onAutoPickSong={(field, song) => handleUpdateSavedReelSong(rangeReel.id, field, song)}
                onClose={() => setRangeReel(null)}
                onGenerateReelShare={handleGenerateReelShare}
                onRevokeReelShare={handleRevokeReelShare}
                userId={session?.user?.id}
              />
            </Suspense>
          </ScreenErrorBoundary>
        );
      })()}

      {editingReel && (
        <ScreenErrorBoundary onBack={() => setEditingReel(null)}>
          <Suspense fallback={<div className="screen" />}>
            <LazyReelEditScreen
              entries={entries}
              kids={kids}
              familyMembers={familyMembers}
              reel={editingReel}
              onBack={() => setEditingReel(null)}
              onSave={async updates => {
                // A brand-new reel (opened straight from "+ New reel", never
                // saved yet) creates its row here instead of updating one —
                // the row doesn't exist until this exact moment, so nothing
                // shows up in Keepsakes until the user has actually finished
                // customizing it and tapped "Build reel".
                const saved = editingReel.id == null
                  ? await handleCreateSavedReel({ title: updates.title, startDate: editingReel.startDate, endDate: editingReel.endDate, song: updates.song, song2: updates.song2, durationSec: updates.durationSec, slideRefs: updates.slideRefs })
                  : await handleUpdateSavedReel(editingReel.id, updates);
                if (!saved) return; // creation/update failed — stay on the editor, error already shown
                setEditingReel(null);
                // Once a reel's been through the editor its content (slideRefs)
                // and format (length/songs) are both explicit, saved choices —
                // so playback always goes through the range-reel path from here
                // on, regardless of whether this reel started as a monthly
                // bookmark or a custom build, straight into watching the result.
                setRangeReel({
                  id: saved.id, startDate: editingReel.startDate, endDate: editingReel.endDate,
                  title: saved.title, song: saved.song, song2: saved.song2, durationSec: saved.durationSec, slideRefs: saved.slideRefs,
                });
              }}
            />
          </Suspense>
        </ScreenErrorBoundary>
      )}

      {showNotificationHistory && (
        <Suspense fallback={<div className="screen" />}>
          <LazyNotificationHistoryScreen
            currentUserId={session?.user?.id}
            onBack={() => setShowNotificationHistory(false)}
            onOpenEntry={id => setPendingOpenEntryId(id)}
            onOpenBirthdayKid={id => setPendingOpenBirthdayKidId(id)}
          />
        </Suspense>
      )}

      {showFriendsPrivacyExplainer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }} onClick={() => setShowFriendsPrivacyExplainer(false)}>
          <div className="quick-sheet" style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%', padding: '20px 24px 32px' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 20px' }} />
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon name="ti-shield-lock" style={{ fontSize: 20, color: 'var(--accent)' }} />
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px', textAlign: 'center' }}>Your words stay private</p>
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '0 0 22px', lineHeight: 1.65, textAlign: 'center' }}>
              Letters are always just between you and your family (added via invite code). Friends never see what you wrote. When you mark a moment <strong style={{ color: 'var(--text-2)' }}>"All"</strong>, they'll only see the photo or video, the date, and your child's age.
            </p>
            <button
              onClick={() => setShowFriendsPrivacyExplainer(false)}
              className="btn btn-gold"
              style={{ width: '100%', border: 'none', borderRadius: 14, padding: '14px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif" }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {celebration && (
        <CelebrationOverlay
          kid={celebration.kid}
          milestoneType={celebration.milestoneType}
          onDone={() => { const e = celebration.entry; setCelebration(null); if (e) openEntry(e); else { setJournalMilestonesOnly(false); setScreen('journal'); } }}
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
            {monthlyRecap.fromList ? 'Back' : 'Keep going'}
          </button>
        </div>
      )}
    </div>
    </NotifCtx.Provider>
    </DataCtx.Provider>
    </SessionCtx.Provider>
  );
}
