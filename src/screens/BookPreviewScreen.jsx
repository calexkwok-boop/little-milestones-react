import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { cloudinaryTransform, exactAgeLabel, milestoneInfo, sameAgeSides, videoThumbUrl } from '../constants.js';

// `cropY` is saved as "the point in the photo that should stay centered" (0-100, top-to-bottom),
// not a raw scroll-percentage — so it has to be re-projected into an `object-position` value
// specific to THIS container's actual measured size, otherwise a crop chosen in the editor's tall
// preview frame shows a completely different slice of the photo in a short book thumbnail.
function CroppedPhoto({ src, cropY = 50, height = 200, width, style }) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [objY, setObjY] = useState(cropY);

  const recompute = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container || !img.naturalWidth || !img.naturalHeight) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (!cw || !ch) return;
    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const scaledH = img.naturalHeight * scale;
    const extra = scaledH - ch;
    if (extra <= 0.5) { setObjY(50); return; }
    const focusPx = (cropY / 100) * scaledH;
    const top = Math.min(extra, Math.max(0, focusPx - ch / 2));
    setObjY((top / extra) * 100);
  }, [cropY]);

  useLayoutEffect(() => {
    recompute();
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [recompute, src]);

  return (
    <div ref={containerRef} style={{ height, width, overflow: 'hidden', flexShrink: 0, ...style }}>
      <img ref={imgRef} src={src} onLoad={recompute} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `center ${objY}%`, display: 'block' }} alt="" loading="lazy" />
    </div>
  );
}

function hexToRgba(hex, alpha) {
  const clean = (hex || '').replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function letterFontSize(charCount, hasPhoto) {
  if (hasPhoto) return charCount < 300 ? 11.5 : charCount < 500 ? 10.5 : 9;
  return charCount < 600 ? 11.5 : charCount < 950 ? 10.5 : charCount < 1250 ? 9.5 : 9;
}

function breakAt(text, max) {
  if (text.length <= max) return text;
  let i = max;
  while (i > 0 && !/\s/.test(text[i])) i--;
  if (i === 0) return text.slice(0, max);
  // Only avoid orphan if the last newline is within 40 chars of the split point
  const lastNl = text.lastIndexOf('\n', i - 1);
  if (lastNl > 0 && i - lastNl <= 40) {
    const lastLine = text.slice(lastNl + 1, i).trim();
    if (lastLine.split(/\s+/).filter(Boolean).length <= 2) {
      return text.slice(0, lastNl).trimEnd();
    }
  }
  return text.slice(0, i);
}

// Measures actual rendered height of `text` at `fontSize`/`width` using a hidden,
// off-screen clone of the letter-page paragraph — so pagination fits real layout
// instead of guessing from a character count (which drifts whenever font, width,
// or photo height changes, and silently clips since the container is overflow:hidden).
function measureTextHeight(el, text, fontSize, width) {
  el.style.width = width + 'px';
  el.style.fontSize = fontSize + 'px';
  el.textContent = text;
  return el.scrollHeight;
}

function splitTextToFit(text, el, fontSize, width, maxHeight) {
  if (!text) return ['', ''];
  if (measureTextHeight(el, text, fontSize, width) <= maxHeight) return [text, ''];
  let lo = 1, hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measureTextHeight(el, text.slice(0, mid), fontSize, width) <= maxHeight) lo = mid;
    else hi = mid - 1;
  }
  const snapped = breakAt(text, lo) || text.slice(0, Math.max(1, lo));
  return [snapped, text.slice(snapped.length).trimStart()];
}

// Fixed chrome heights around the letter body — small, predictable single-line
// elements, unlike the body paragraph which is why that part gets measured instead.
const LETTER_TOP_PAD = 18, LETTER_BOTTOM_PAD = 12, LETTER_DATE_H = 21, LETTER_DEAR_H = 25, LETTER_SIGNED_H = 23, LETTER_FOOTER_H = 35;
const LETTER_PHOTO_H = 220;
const LETTER_SIDE_PAD = 48; // 24px left + right
const LETTER_AUDIO_ITEM_H = 64; // one AudioQRCard: 8px padding top/bottom + 1px border top/bottom + 36px content row + 8px bottom margin, plus a couple px buffer

function splitLetterToPages(entry, el, fontSize, pageWidth) {
  const text = entry.text || '';
  const hasPhoto = entry.media?.length > 0;
  const audioItemCount = (entry.song?.previewUrl ? 1 : 0) + (entry.voiceMemoUrl ? 1 : 0);
  const textWidth = pageWidth - LETTER_SIDE_PAD;
  const pageHeight = pageWidth * 4 / 3;
  const chunks = [];
  let rest = text;
  let isFirst = true;
  do {
    const photoH = isFirst && hasPhoto ? LETTER_PHOTO_H : 0;
    const dearH = isFirst ? LETTER_DEAR_H : 0;
    const audioH = isFirst ? audioItemCount * LETTER_AUDIO_ITEM_H : 0;
    const signedH = entry.signedAs ? LETTER_SIGNED_H : 0; // reserved on every page, since we don't know the last chunk yet
    const available = pageHeight - photoH - audioH - LETTER_TOP_PAD - LETTER_BOTTOM_PAD - LETTER_DATE_H - dearH - signedH - LETTER_FOOTER_H;
    const [chunk, remainder] = splitTextToFit(rest, el, fontSize, textWidth, Math.max(available, 60));
    chunks.push(chunk);
    rest = remainder;
    isFirst = false;
  } while (rest.length > 0);
  return chunks;
}

// Printed pages can't play audio, so a song or voice memo gets a scannable QR
// code linking straight to the clip instead. The title/artist (and album art,
// for a song) print alongside it as a fallback — if Apple ever rotates the
// iTunes preview URL a printed QR code points at, the words are still there.
function AudioQRCard({ title, subtitle, art, qrValue }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(74,94,80,0.06)', border: '1px solid rgba(74,94,80,0.15)', borderRadius: 10, padding: '8px 10px', marginBottom: 8 }}>
      {art ? (
        <img src={art} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} alt="" loading="lazy" />
      ) : (
        <div style={{ width: 36, height: 36, borderRadius: 6, background: '#4A5E50', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="ti ti-microphone" style={{ fontSize: 15, color: '#fff' }} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9.5, fontWeight: 700, color: '#2C3828', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</p>
        {subtitle && <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 8, color: '#7A8C78', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</p>}
        <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 7, color: '#B8944A', margin: '2px 0 0', letterSpacing: 0.4, textTransform: 'uppercase' }}>Scan to listen</p>
      </div>
      <div style={{ background: '#fff', padding: 2, borderRadius: 4, flexShrink: 0, width: 32, height: 32 }}>
        <QRCodeSVG value={qrValue} size={32} level="M" fgColor="#2C3828" />
      </div>
    </div>
  );
}

function LetterPage({ entry, pageText, index, sortedLength, kids, isContinued, hasMore, fontSize }) {
  const entryKids = entry.kids.map(id => kids.find(k => k.id === id)).filter(Boolean);
  const salutation = entryKids.map(k => k.name.split(' ')[0]).join(' & ');
  const dateLabel = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const photo = !isContinued && entry.media?.length > 0 ? entry.media[0] : null;
  const photoIsVideo = photo?.type === 'video';
  const photoSrc = photo ? (photoIsVideo ? videoThumbUrl(photo.url, 'so_0,w_700,q_auto,f_auto') : cloudinaryTransform(photo.url, 'w_700,q_auto,f_auto')) : null;
  const cropY = entry.cropY ?? 50;
  const photoHeight = 220;
  const audioItems = !isContinued ? [
    entry.song?.previewUrl && { title: entry.song.name, subtitle: entry.song.artist, art: entry.song.artworkUrl, qrValue: entry.song.previewUrl },
    entry.voiceMemoUrl && { title: 'Voice memo', subtitle: salutation, art: null, qrValue: entry.voiceMemoUrl },
  ].filter(Boolean) : [];
  return (
    <div style={{ background: '#FDFBF6', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {photoSrc && (
        <div style={{ position: 'relative' }}>
          <CroppedPhoto src={photoSrc} cropY={cropY} height={photoHeight} />
        </div>
      )}
      <div style={{ flex: 1, padding: '18px 24px 12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, fontWeight: 700, color: '#B8C8B4', letterSpacing: 1.4, textTransform: 'uppercase', margin: '0 0 10px' }}>
          {dateLabel}{isContinued ? ' — cont\'d' : ''}
        </p>
        {!isContinued && (
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 14, color: '#4A5E50', margin: '0 0 8px' }}>Dear {salutation},</p>
        )}
        {audioItems.map((item, i) => <AudioQRCard key={i} {...item} />)}
        <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: fontSize, color: '#2C3828', lineHeight: 1.72, margin: 0, whiteSpace: 'pre-wrap', overflow: 'hidden' }}>
          {pageText}
        </p>
        {!hasMore && entry.signedAs && (
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 10.5, color: '#9AA89C', margin: '10px 0 0', textAlign: 'right' }}>
            Love, {entry.signedAs}
          </p>
        )}
        <div style={{ marginTop: 'auto', paddingTop: 8 }}>
          {hasMore ? (
            <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, color: '#B8C8B4', textAlign: 'right', margin: '0 0 4px', letterSpacing: 0.5 }}>continued →</p>
          ) : (
            <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, color: '#C4D8C0', textAlign: 'right', margin: '0 0 4px', letterSpacing: 0.5 }}>
              {index + 1} / {sortedLength}
            </p>
          )}
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 10, color: '#B8C8B4', margin: 0, textAlign: 'center' }}>Patina</p>
        </div>
      </div>
    </div>
  );
}

const NOTES_PAGE_BUDGET = 480;

const NOTE_ACCENT_FALLBACK = '#8AA98C';
const PROMPT_ACCENT = '#C8993E';

function NotesPage({ notes, monthKey, kids, isContinued, hasMore }) {
  const monthLabel = new Date(monthKey + '-01T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return (
    <div style={{ background: '#FDFBF6', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, padding: '18px 20px 12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, fontWeight: 700, color: '#B8C8B4', letterSpacing: 1.4, textTransform: 'uppercase', margin: '0 0 12px' }}>
          Notes &middot; {monthLabel}{isContinued ? ' — cont\'d' : ''}
        </p>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: 12, padding: '4px 2px' }}>
          {notes.map((entry, i) => {
            const entryKids = entry.kids.map(id => kids.find(k => k.id === id)).filter(Boolean);
            const nameLabel = entryKids.map(k => k.name.split(' ')[0]).join(' & ');
            const dateLabel = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const isPrompt = !!entry.prompt;

            const photo = entry.media?.[0];
            const photoSrc = photo ? (photo.type === 'video' ? videoThumbUrl(photo.url, 'so_0,w_140,q_auto,f_auto') : cloudinaryTransform(photo.url, 'w_140,q_auto,f_auto')) : null;

            if (isPrompt) {
              return (
                <div key={entry.id} style={{ width: photo ? '100%' : 'calc(50% - 6px)', borderRadius: 8, overflow: 'hidden', boxShadow: '0 3px 8px rgba(0,0,0,0.1)', border: '1px solid rgba(200,153,62,0.4)' }}>
                  <div style={{ background: PROMPT_ACCENT, padding: '6px 9px 5px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 2 }}>
                      <i className="ti ti-bulb" style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.9)' }} />
                      <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 7, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>Prompt</span>
                    </div>
                    <p style={{
                      fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 8, lineHeight: 1.3, color: '#fff', margin: 0,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {entry.prompt}
                    </p>
                  </div>
                  <div style={{ background: '#FFFDF8', padding: '8px 9px 7px', display: photo ? 'flex' : 'block', gap: 9 }}>
                    {photo && (
                      <CroppedPhoto src={photoSrc} cropY={entry.cropY} height={66} width={66} style={{ borderRadius: 6 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 9.5, lineHeight: 1.45, color: '#2C3828',
                        margin: '0 0 6px', whiteSpace: 'pre-wrap',
                      }}>
                        {entry.text}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 7.5, color: '#B8944A' }}>{nameLabel}</span>
                        <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 7.5, color: '#B8944A' }}>{dateLabel}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            const accent = entryKids[0]?.accent || NOTE_ACCENT_FALLBACK;
            const seed = String(entry.id).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
            const rotation = photo ? 0 : ((seed % 7) - 3) * 0.9;
            return (
              <div
                key={entry.id}
                style={{
                  position: 'relative',
                  width: photo ? '100%' : 'calc(50% - 6px)',
                  background: hexToRgba(accent, 0.16),
                  border: `1px solid ${hexToRgba(accent, 0.32)}`,
                  borderRadius: 8,
                  padding: '10px 11px 8px',
                  boxShadow: '0 3px 8px rgba(0,0,0,0.1)',
                  transform: `rotate(${rotation}deg)`,
                  display: photo ? 'flex' : 'block',
                  gap: 9,
                }}
              >
                <div style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderStyle: 'solid', borderWidth: '0 10px 10px 0', borderColor: `transparent ${hexToRgba(accent, 0.5)} transparent transparent`, borderRadius: '0 8px 0 0' }} />
                {photo && (
                  <CroppedPhoto src={photoSrc} cropY={entry.cropY} height={66} width={66} style={{ borderRadius: 6 }} />
                )}
                <div style={{ flex: photo ? 1 : undefined, minWidth: 0 }}>
                <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: hexToRgba(accent, 0.9) }}>{nameLabel}</span>
                <p style={{
                  fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 9.5, lineHeight: 1.45, color: '#2C3828',
                  margin: '4px 0 6px', whiteSpace: 'pre-wrap',
                }}>
                  {entry.text}
                </p>
                <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 7.5, color: hexToRgba(accent, 0.75), display: 'block', textAlign: 'right' }}>{dateLabel}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 'auto', paddingTop: 8 }}>
          {hasMore && (
            <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, color: '#B8C8B4', textAlign: 'right', margin: '0 0 4px', letterSpacing: 0.5 }}>continued &rarr;</p>
          )}
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 10, color: '#B8C8B4', margin: 0, textAlign: 'center' }}>Patina</p>
        </div>
      </div>
    </div>
  );
}

// Fixed chrome heights around a paired page's text — mirrors the LETTER_* consts
// above, used by splitPairedToPages to budget how much text actually fits.
const PAIRED_EYEBROW_H = 37, PAIRED_DATE_ROW_H = 46, PAIRED_HEADING_H = 24, PAIRED_TEXT_PAD = 22, PAIRED_FOOTER_H = 35;
const PAIRED_TEXT_FONT_SIZE = 10.5;

// A dedicated spread for a merged "same age" entry (entry.sameAgeDates set) — one
// post addressed to every tagged kid, each with their own photo and age. Two kids
// keeps the original fixed two-column layout; 3+ wraps into a grid since a book
// page can't scroll the way the app's filmstrip variant does. Deliberately
// independent of the chronological letter stream (the photos can be years apart
// in real time), so it's excluded from the normal per-entry pagination and instead
// paginated on its own via splitPairedToPages — same measure-and-split approach as
// a regular letter, so a long same-age note continues onto its own page(s) instead
// of silently clipping.
function splitPairedToPages(entry, kids, el, pageWidth) {
  const text = entry.text || '';
  const sides = sameAgeSides(entry, kids);
  const twoUp = !sides || sides.length === 2;
  const photoRowH = twoUp ? 150 : 110;
  const textWidth = pageWidth - LETTER_SIDE_PAD;
  const pageHeight = pageWidth * 4 / 3;
  const chunks = [];
  let rest = text;
  let isFirst = true;
  do {
    const photoH = isFirst ? photoRowH : 0;
    const dateH = isFirst ? PAIRED_DATE_ROW_H : 0;
    const headingH = isFirst ? PAIRED_HEADING_H : 0;
    const available = pageHeight - PAIRED_EYEBROW_H - photoH - dateH - headingH - PAIRED_TEXT_PAD - PAIRED_FOOTER_H;
    const [chunk, remainder] = splitTextToFit(rest, el, PAIRED_TEXT_FONT_SIZE, textWidth, Math.max(available, 60));
    chunks.push(chunk);
    rest = remainder;
    isFirst = false;
  } while (rest.length > 0);
  return chunks;
}

function PairedPage({ entry, kids, pageText, isContinued = false, hasMore = false }) {
  const sides = sameAgeSides(entry, kids);
  if (!sides) return null;
  const twoUp = sides.length === 2;
  const names = sides.map(s => s.kid.name.split(' ')[0]).join(' & ');
  const m = entry.milestone ? milestoneInfo(entry.milestone) : null;
  const heading = m ? `${names}'s ${m.label.charAt(0).toLowerCase()}${m.label.slice(1)}` : names;
  const cardHeight = twoUp ? 150 : 110;
  const text = pageText != null ? pageText : entry.text;
  return (
    <div style={{ background: '#FDFBF6', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, fontWeight: 700, color: '#C8993E', letterSpacing: 1.4, textTransform: 'uppercase', margin: '16px 24px 10px', textAlign: 'center' }}>
        At the same age{isContinued ? ' — cont\'d' : ''}
      </p>
      {!isContinued && (
        <>
          <div style={{ display: 'flex', flexWrap: twoUp ? 'nowrap' : 'wrap', gap: 2 }}>
            {sides.map((side, i) => {
              const cardStyle = twoUp ? { flex: 1, position: 'relative' } : { flex: '1 1 30%', minWidth: '30%', position: 'relative' };
              if (!side.photo) return <div key={i} style={{ ...cardStyle, height: cardHeight, background: '#EDE8DE' }} />;
              const isVideo = side.photo.type === 'video';
              const src = isVideo ? videoThumbUrl(side.photo.url, `so_0,w_${twoUp ? 400 : 300},q_auto,f_auto`) : cloudinaryTransform(side.photo.url, `w_${twoUp ? 400 : 300},q_auto,f_auto`);
              return (
                <div key={i} style={cardStyle}>
                  <CroppedPhoto src={src} cropY={entry.cropY} height={cardHeight} />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', flexWrap: twoUp ? 'nowrap' : 'wrap', background: 'rgba(200,153,62,0.1)' }}>
            {sides.map((side, i) => {
              const dateLabel = new Date(side.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              return (
                <div key={i} style={twoUp
                  ? { flex: 1, padding: '8px 14px', borderLeft: i > 0 ? '1px solid rgba(200,153,62,0.25)' : 'none' }
                  : { flex: '1 1 30%', minWidth: '30%', padding: '6px 10px' }}>
                  <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 12.5, color: '#9A7526', margin: '0 0 3px' }}>{side.kid.name.split(' ')[0]}</p>
                  <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, color: '#B8944A', margin: 0 }}>{exactAgeLabel(side.kid.birthdate, side.date)} old &middot; {dateLabel}</p>
                </div>
              );
            })}
          </div>
        </>
      )}
      <div style={{ flex: 1, padding: '10px 24px 12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!isContinued && (
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 14, color: '#4A5E50', margin: '0 0 6px' }}>{heading}</p>
        )}
        <p style={{
          fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: PAIRED_TEXT_FONT_SIZE, lineHeight: 1.55, color: '#2C3828',
          margin: 0, whiteSpace: 'pre-wrap', overflow: 'hidden',
        }}>
          {text}
        </p>
        <div style={{ marginTop: 'auto', paddingTop: 8 }}>
          {hasMore && (
            <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, color: '#B8C8B4', textAlign: 'right', margin: '0 0 4px', letterSpacing: 0.5 }}>continued &rarr;</p>
          )}
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 10, color: '#B8C8B4', margin: 0, textAlign: 'center' }}>Patina</p>
        </div>
      </div>
    </div>
  );
}

function BookPreviewScreen({ kids, bookConfig, onBack, onUpdateCrop, currentUserId, onNotifyMe, userEmail }) {
  const { kidIds, fromDate, toDate, bookEntries, authorLabel, authorSummary, recipientSummary } = bookConfig;
  const sorted = useMemo(() => [...bookEntries].sort((a, b) => a.date > b.date ? 1 : -1), [bookEntries]);

  const letterEntries = useMemo(() => sorted.filter(e => e.type !== 'note'), [sorted]);
  const totalLetters = letterEntries.length;

  const stageRef = useRef(null);
  const measureRef = useRef(null);
  const [contentPages, setContentPages] = useState([]);
  const [yearTOC, setYearTOC] = useState([]);
  const [page, setPage] = useState(0);

  // Build pages array with chapter dividers inserted at year boundaries.
  // Notes are too short for their own page — they're compiled one page per month,
  // interleaved chronologically with Letters (sorted by the 1st of that month).
  // Letter text is paginated by actually measuring it against the live page's DOM
  // width via the hidden `measureRef` node, rather than a character-count guess —
  // the guess drifts whenever font size, page width, or photo height changes, and
  // silently clips since the page container is overflow:hidden.
  useLayoutEffect(() => {
    function build() {
      const pageWidth = stageRef.current?.getBoundingClientRect().width;
      if (!pageWidth || !measureRef.current) return;
      const el = measureRef.current;

      // A merged "same age" entry (entry.sameAgeDates set) is a single row already —
      // route it to the paired spread instead of the normal letter/note handling,
      // regardless of whether it was written as a letter or a note. Matches
      // sameAgeSides' own definition of "actually a match" (a non-empty object) —
      // a leftover empty {} (e.g. after removing every side of a match) falls back
      // to the normal path instead of producing a page nothing can render.
      const isPaired = e => e.sameAgeDates && Object.keys(e.sameAgeDates).length > 0;
      const notesByMonth = new Map();
      sorted.filter(e => e.type === 'note' && !isPaired(e)).forEach(entry => {
        const key = entry.date.slice(0, 7);
        if (!notesByMonth.has(key)) notesByMonth.set(key, []);
        notesByMonth.get(key).push(entry);
      });

      const items = letterEntries.filter(e => !isPaired(e)).map(entry => ({ sortDate: entry.date, kind: 'letter', entry }));
      sorted.filter(isPaired).forEach(entry => {
        items.push({ sortDate: entry.date, kind: 'paired', entry });
      });
      notesByMonth.forEach((notes, monthKey) => {
        items.push({ sortDate: `${monthKey}-01`, kind: 'notes', monthKey, notes });
      });
      items.sort((a, b) => a.sortDate < b.sortDate ? -1 : a.sortDate > b.sortDate ? 1 : (a.kind === 'notes' ? -1 : 1));

      const pages = [];
      const toc = []; // [{ year, pageIndex }]  pageIndex = index within contentPages
      let currentYear = null;
      let letterNum = 0;
      items.forEach(item => {
        const year = item.sortDate.slice(0, 4);
        if (year !== currentYear) {
          currentYear = year;
          toc.push({ year, pageIndex: pages.length });
          pages.push({ type: 'chapter', year });
        }
        if (item.kind === 'letter') {
          const entry = item.entry;
          const hasPhoto = entry.media?.length > 0;
          const fs = letterFontSize((entry.text || '').length, hasPhoto);
          const chunks = splitLetterToPages(entry, el, fs, pageWidth);
          const thisNum = letterNum++;
          chunks.forEach((chunk, i) => {
            pages.push({ type: 'letter', entry, pageText: chunk, letterNum: thisNum, isContinued: i > 0, hasMore: i < chunks.length - 1, fontSize: fs });
          });
        } else if (item.kind === 'paired') {
          // Not folded into the numbered "x / N" letter sequence — like a chapter
          // divider, it's a standalone spread rather than one more counted letter.
          const entry = item.entry;
          const chunks = splitPairedToPages(entry, kids, el, pageWidth);
          chunks.forEach((chunk, i) => {
            pages.push({ type: 'paired', entry, pageText: chunk, isContinued: i > 0, hasMore: i < chunks.length - 1 });
          });
        } else {
          // Notes render at their natural height (no text clamping), so pack a page by an
          // estimated content budget rather than a flat item count — entries that don't fit
          // spill onto a continuation page instead of getting visually cut off.
          let chunk = [];
          let weight = 0;
          let chunkStart = 0;
          item.notes.forEach((note, idx) => {
            const hasPhoto = note.media?.length > 0;
            const cost = (hasPhoto ? 90 : 45) + (note.prompt ? 35 : 0) + (note.text || '').length;
            if (weight + cost > NOTES_PAGE_BUDGET && chunk.length > 0) {
              pages.push({ type: 'notes', monthKey: item.monthKey, notes: chunk, isContinued: chunkStart > 0, hasMore: true });
              chunk = [];
              weight = 0;
              chunkStart = idx;
            }
            chunk.push(note);
            weight += cost;
          });
          if (chunk.length > 0) {
            pages.push({ type: 'notes', monthKey: item.monthKey, notes: chunk, isContinued: chunkStart > 0, hasMore: false });
          }
        }
      });
      setContentPages(pages);
      setYearTOC(toc);
      setPage(p => Math.min(p, pages.length + 2));
    }
    build();
    window.addEventListener('resize', build);
    return () => window.removeEventListener('resize', build);
  }, [sorted, letterEntries]);

  // page 0 = cover, page 1 = TOC, pages 2..N = content, last = back cover
  const totalPages = contentPages.length + 3;
  const swipeStart = useRef(null);
  const pageDir = useRef(1);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState(userEmail || '');
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);

  function goNext() { pageDir.current = 1;  setPage(p => p >= totalPages - 1 ? 0 : p + 1); }
  function goPrev() { pageDir.current = -1; setPage(p => p <= 0 ? totalPages - 1 : p - 1); }

  function handleSwipeStart(e) {
    const t = e.touches[0];
    swipeStart.current = { x: t.clientX, y: t.clientY };
  }

  function handleSwipeEnd(e) {
    if (!swipeStart.current) return;
    const dx = e.changedTouches[0].clientX - swipeStart.current.x;
    const dy = e.changedTouches[0].clientY - swipeStart.current.y;
    swipeStart.current = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) goNext(); else goPrev();
  }

  useEffect(() => {
    [-1, 1].forEach(offset => {
      const content = contentPages[page - 2 + offset];
      if (content?.type !== 'letter' || content.isContinued) return;
      const photo = content.entry.media?.[0];
      if (photo && photo.type !== 'video') {
        const img = new Image();
        img.src = cloudinaryTransform(photo.url, 'w_700,q_auto,f_auto');
      }
    });
  }, [page, contentPages]);


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
            <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'rgba(255,255,255,0.7)', margin: 0, letterSpacing: 1.2, textTransform: 'uppercase' }}>
              Love, {authorSummary}
            </p>
          )}
          <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'rgba(255,255,255,0.62)', margin: 0, lineHeight: 1.7, textAlign: 'center', maxWidth: 240 }}>
            For all the moments you may have forgotten, and all the things I never want you to forget
          </p>
          {dateRangeLabel && <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'rgba(255,255,255,0.48)', margin: 0, letterSpacing: 1 }}>{dateRangeLabel.toUpperCase()}</p>}
        </div>
      </div>
    );
  };

  const renderTOCPage = () => (
    <div style={{ background: '#FDFBF6', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '40px 36px 32px' }}>
      <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, fontWeight: 700, color: '#B8C8B4', letterSpacing: 1.8, textTransform: 'uppercase', margin: '0 0 28px' }}>Contents</p>
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
              <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: '#9AA89C', fontWeight: 600 }}>{displayPage}</span>
            </div>
          );
        })}
      </div>
      <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 10, color: '#B8C8B4', margin: '20px 0 0', textAlign: 'center' }}>Patina</p>
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
        <img src="/quill-no-background.png" style={{ width: 32, height: 32, opacity: 0.6 }} alt="" loading="lazy" />
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
          <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: '#C8993E', margin: 0 }}>Patina</p>
          <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.2)' }} />
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.9, textAlign: 'center' }}>
            Patina is the beauty that comes with age. These letters capture the mark you left on the quiet, seemingly unremarkable days that turned out to matter most. Writing them is our quiet, perilous attempt to slow down time. A gift for you to one day hold, and an anchor for us to inhabit today.
          </p>
          <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.2)' }} />
        </div>
        <div style={{ position: 'absolute', bottom: 28, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
          <img src="/quill-no-background.png" style={{ width: 32, height: 32, opacity: 0.6 }} alt="" loading="lazy" />
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
    if (content.type === 'notes') return <NotesPage notes={content.notes} monthKey={content.monthKey} kids={kids} isContinued={content.isContinued} hasMore={content.hasMore} />;
    if (content.type === 'paired') return <PairedPage entry={content.entry} kids={kids} pageText={content.pageText} isContinued={content.isContinued} hasMore={content.hasMore} />;
    return <LetterPage entry={content.entry} pageText={content.pageText} index={content.letterNum} sortedLength={totalLetters} kids={kids} isContinued={content.isContinued} hasMore={content.hasMore} fontSize={content.fontSize} />;
  };

  const pageLabel = (() => {
    if (page === 0) return 'Cover';
    if (page === 1) return 'Contents';
    if (page === totalPages - 1) return 'Back cover';
    const content = contentPages[page - 2];
    if (!content) return '';
    if (content.type === 'chapter') return content.year;
    if (content.type === 'notes') return `Notes · ${new Date(content.monthKey + '-01T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
    if (content.type === 'paired') return 'Same age';
    return `Letter ${content.letterNum + 1} of ${totalLetters}`;
  })();

  return (
    <div className="screen" style={{ background: '#1E2820' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', flexShrink: 0 }}>
        <button className="icon-btn-ghost" onClick={onBack}><i className="ti ti-x" /></button>
        <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0, fontWeight: 600 }}>{pageLabel}</p>
        <div style={{ width: 36 }} />
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', minHeight: 0 }}
        onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}>
        <div ref={stageRef} style={{ width: '100%', aspectRatio: '3/4', borderRadius: 6, overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.6), 4px 0 0 rgba(0,0,0,0.3)', maxHeight: '100%' }}>
          <div key={page} className={pageDir.current > 0 ? 'page-enter-right' : 'page-enter-left'} style={{ width: '100%', height: '100%' }}>
            {renderPage()}
          </div>
        </div>
        <div
          ref={measureRef}
          aria-hidden="true"
          style={{
            position: 'fixed', top: 0, left: -9999, visibility: 'hidden', pointerEvents: 'none',
            fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', lineHeight: 1.72,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
          }}
        />
      </div>

      <div style={{ padding: '16px 20px 8px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={goPrev}
          style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>
          <i className="ti ti-chevron-left" />
        </button>
        <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'rgba(255,255,255,0.4)', borderRadius: 99, width: `${((page + 1) / totalPages) * 100}%`, transition: 'width 0.2s' }} />
        </div>
        <button onClick={goNext}
          style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>
          <i className="ti ti-chevron-right" />
        </button>
      </div>

      <div style={{ padding: '0 20px 8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: "'Urbanist', sans-serif" }}>Page</span>
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
          style={{ width: 52, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '5px 8px', fontSize: 12, color: '#fff', fontFamily: "'Urbanist', sans-serif", textAlign: 'center', outline: 'none' }}
        />
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: "'Urbanist', sans-serif" }}>of {totalPages}</span>
      </div>

      <div style={{ padding: '8px 20px 28px', flexShrink: 0 }}>
        <button className="btn btn-gold" style={{ width: '100%', borderRadius: 14 }}
          onClick={() => setShowWaitlist(true)}>
          <i className="ti ti-bell" style={{ fontSize: 16 }} />
          Join the book waitlist
        </button>
      </div>

      {showWaitlist && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end' }}
          onClick={() => setShowWaitlist(false)}>
          <div style={{ background: 'var(--bg)', borderRadius: '22px 22px 0 0', padding: '28px 24px 40px', width: '100%' }}
            onClick={e => e.stopPropagation()}>
            {!waitlistDone ? (
              <>
                <img src="/icon-192.png" style={{ width: 48, height: 48, borderRadius: 12, display: 'block', marginBottom: 16 }} alt="Patina" />
                <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: 'var(--text)', margin: '0 0 8px', lineHeight: 1.25 }}>Print ordering<br />is coming soon</h3>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.6 }}>
                  Your book is ready to go. Leave your email and we'll let you know the moment print ordering opens.
                </p>
                <input
                  className="input-field"
                  type="email"
                  placeholder="your@email.com"
                  value={waitlistEmail}
                  onChange={e => setWaitlistEmail(e.target.value)}
                  style={{ marginBottom: 12 }}
                />
                <button
                  className="btn btn-gold"
                  style={{ width: '100%', opacity: (!waitlistEmail.trim() || waitlistSubmitting) ? 0.5 : 1 }}
                  disabled={!waitlistEmail.trim() || waitlistSubmitting}
                  onClick={async () => {
                    setWaitlistSubmitting(true);
                    await onNotifyMe?.(waitlistEmail.trim());
                    setWaitlistSubmitting(false);
                    setWaitlistDone(true);
                  }}
                >
                  {waitlistSubmitting ? 'Saving…' : 'Notify me when it\'s ready'}
                </button>
                <button onClick={() => setShowWaitlist(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', marginTop: 14, fontSize: 13, color: 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif" }}>
                  Maybe later
                </button>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <i className="ti ti-circle-check" style={{ fontSize: 40, color: '#C8993E', display: 'block', marginBottom: 14 }} />
                <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: 'var(--text)', margin: '0 0 8px' }}>You're on the list</h3>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 28px', lineHeight: 1.6 }}>We'll email you at <strong>{waitlistEmail}</strong> when print ordering is available.</p>
                <button className="btn btn-outline" style={{ width: '100%' }} onClick={() => setShowWaitlist(false)}>Done</button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

export default BookPreviewScreen;
