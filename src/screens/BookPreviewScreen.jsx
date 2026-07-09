import { useState, useEffect, useMemo, useRef } from 'react';
import { cloudinaryTransform } from '../constants.js';

function CroppedPhoto({ src, cropY = 50, height = 200 }) {
  return (
    <div style={{ height, overflow: 'hidden', flexShrink: 0 }}>
      <img src={src} style={{ width: '100%', height: `${height}px`, objectFit: 'cover', objectPosition: `center ${cropY}%`, display: 'block' }} alt="" />
    </div>
  );
}

function letterFontSize(charCount, hasPhoto) {
  if (hasPhoto) return charCount < 300 ? 11.5 : charCount < 500 ? 10.5 : 9;
  return charCount < 600 ? 11.5 : charCount < 950 ? 10.5 : charCount < 1250 ? 9.5 : 9;
}

function charsPerPage(fontSize, hasPhoto) {
  return Math.round((hasPhoto ? 700 : 1900) * (9 / fontSize));
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

function splitLetterText(text, fontSize, hasPhoto) {
  if (!text) return [''];
  const firstCap = charsPerPage(fontSize, hasPhoto);
  const contCap = charsPerPage(fontSize, false);
  if (text.length <= firstCap) return [text];
  const chunks = [];
  const first = breakAt(text, firstCap);
  chunks.push(first);
  let rest = text.slice(first.length).trimStart();
  while (rest.length > 0) {
    if (rest.length <= contCap) { chunks.push(rest); break; }
    const chunk = breakAt(rest, contCap);
    chunks.push(chunk);
    rest = rest.slice(chunk.length).trimStart();
  }
  return chunks;
}

function LetterPage({ entry, pageText, index, sortedLength, kids, isContinued, hasMore, fontSize }) {
  const entryKids = entry.kids.map(id => kids.find(k => k.id === id)).filter(Boolean);
  const salutation = entryKids.map(k => k.name.split(' ')[0]).join(' & ');
  const dateLabel = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const photo = !isContinued && entry.media?.length > 0 && entry.media[0].type !== 'video' ? entry.media[0] : null;
  const cropY = entry.cropY ?? 50;
  const photoHeight = 176;
  return (
    <div style={{ background: '#FDFBF6', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {photo && <CroppedPhoto src={cloudinaryTransform(photo.url, 'w_700,q_auto,f_auto')} cropY={cropY} height={photoHeight} />}
      <div style={{ flex: 1, padding: '18px 24px 12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, fontWeight: 700, color: '#B8C8B4', letterSpacing: 1.4, textTransform: 'uppercase', margin: '0 0 10px' }}>
          {dateLabel}{isContinued ? ' — cont\'d' : ''}
        </p>
        {!isContinued && (
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 14, color: '#4A5E50', margin: '0 0 8px' }}>Dear {salutation},</p>
        )}
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

function BookPreviewScreen({ kids, bookConfig, onBack, onUpdateCrop, currentUserId, onNotifyMe, userEmail }) {
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
      const hasPhoto = entry.media?.length > 0 && entry.media[0].type !== 'video';
      const fs = letterFontSize((entry.text || '').length, hasPhoto);
      const chunks = splitLetterText(entry.text || '', fs, hasPhoto);
      const thisNum = letterNum++;
      chunks.forEach((chunk, i) => {
        pages.push({ type: 'letter', entry, pageText: chunk, letterNum: thisNum, isContinued: i > 0, hasMore: i < chunks.length - 1, fontSize: fs });
      });
    });
    return { contentPages: pages, yearTOC: toc };
  }, [sorted]);

  // page 0 = cover, page 1 = TOC, pages 2..N = content, last = back cover
  const totalPages = contentPages.length + 3;
  const [page, setPage] = useState(0);
  const swipeStart = useRef(null);
  const pageDir = useRef(1);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState(userEmail || '');
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);

  function goNext() { pageDir.current = 1;  setPage(p => Math.min(p + 1, totalPages - 1)); }
  function goPrev() { pageDir.current = -1; setPage(p => Math.max(p - 1, 0)); }

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
    return <LetterPage entry={content.entry} pageText={content.pageText} index={content.letterNum} sortedLength={sorted.length} kids={kids} isContinued={content.isContinued} hasMore={content.hasMore} fontSize={content.fontSize} />;
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
        <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0, fontWeight: 600 }}>{pageLabel}</p>
        <div style={{ width: 36 }} />
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', minHeight: 0 }}
        onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}>
        <div style={{ width: '100%', aspectRatio: '3/4', borderRadius: 6, overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.6), 4px 0 0 rgba(0,0,0,0.3)', maxHeight: '100%' }}>
          <div key={page} className={pageDir.current > 0 ? 'page-enter-right' : 'page-enter-left'} style={{ width: '100%', height: '100%' }}>
            {renderPage()}
          </div>
        </div>
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
          <i className="ti ti-shopping-cart" style={{ fontSize: 16 }} />
          Order this book
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
