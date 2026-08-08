import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

// A one-time contextual tooltip that spotlights a real UI element the moment
// it's actually on screen, instead of explaining a feature in the abstract
// before there's any content to point at. Dismissal — a tap anywhere, same as
// most coachmark UIs — is remembered per user per feature id via localStorage,
// mirroring the existing `patina-recap-seen-*` / bday-dismissed pattern
// elsewhere in the app, so it only ever interrupts once.
function useCoachmarkSeen(id, userId) {
  const key = `patina-coachmarks-seen-${userId || 'anon'}`;
  const [seen, setSeen] = useState(() => {
    try { return !!JSON.parse(localStorage.getItem(key) || '{}')[id]; } catch { return false; }
  });
  const markSeen = useCallback(() => {
    setSeen(true);
    try {
      const all = JSON.parse(localStorage.getItem(key) || '{}');
      all[id] = true;
      localStorage.setItem(key, JSON.stringify(all));
    } catch {}
  }, [key, id]);
  return [seen, markSeen];
}

export function Coachmark({ id, userId, active, targetRef, text, placement = 'bottom' }) {
  const [seen, markSeen] = useCoachmarkSeen(id, userId);
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (seen || !active || !targetRef.current) { setRect(null); return; }
    function measure() { if (targetRef.current) setRect(targetRef.current.getBoundingClientRect()); }
    // Every `.screen` plays a 220ms translateY mount animation (screenIn in
    // App.css) — measuring immediately on mount catches the target mid-slide,
    // so the spotlight lands wherever the button was partway through that
    // animation instead of its resting position. Waiting it out first avoids
    // that; resize/scroll stay live afterward for anything that moves later.
    const t = setTimeout(measure, 260);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [seen, active, targetRef]);

  // Any tap anywhere dismisses it — including the real button underneath the
  // spotlight, which still fires its own click normally since this listener
  // only observes (capture phase, no preventDefault/stopPropagation).
  useEffect(() => {
    if (seen || !active || !rect) return;
    function onAnyClick() { markSeen(); }
    document.addEventListener('click', onAnyClick, true);
    return () => document.removeEventListener('click', onAnyClick, true);
  }, [seen, active, rect, markSeen]);

  if (seen || !active || !rect) return null;
  const pad = 6;
  const bubbleWidth = 240;
  // Anchored to the target's horizontal center (not its left edge) — the tail
  // below always points at the bubble's own midpoint, so keeping the bubble
  // itself centered on the target is what keeps the tail actually pointing at
  // the thing it's spotlighting, not just floating near it.
  const centerX = rect.left + rect.width / 2;
  const left = Math.max(16, Math.min(centerX - bubbleWidth / 2, window.innerWidth - bubbleWidth - 16));
  // Rendered via a portal straight into <body> rather than in place — every
  // `.screen` plays a 220ms translateY mount animation (screenIn in App.css)
  // which makes it a new containing block for any `position: fixed`
  // descendant for the duration of that animation. Left in place, these
  // overlays would measure the target correctly (getBoundingClientRect is
  // always viewport-relative) but then render themselves relative to that
  // animating screen instead of the real viewport — visibly offset from the
  // button they're supposed to be spotlighting. A portal sidesteps the whole
  // containing-block problem.
  return createPortal(
    <>
      <div
        style={{
          position: 'fixed', zIndex: 9998, pointerEvents: 'none',
          top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
          borderRadius: 999, boxShadow: '0 0 0 2000px rgba(20,26,20,0.62)',
        }}
      />
      {/* Hardcoded accent green, not var(--accent) -- this portals straight
          into <body>, outside .app-root where every theme token is scoped,
          so the CSS variable is invalid here. It used to silently fail: the
          bubble's own background happened to look fine only because the
          dark dimming scrim behind it filled in for the missing color, but
          the "Got it" button's now-invalid text color inherited the
          bubble's white, landing on the button's own literal white
          background -- invisible white-on-white text. */}
      <div
        style={{
          position: 'fixed', zIndex: 9999, left, width: bubbleWidth,
          top: placement === 'bottom' ? rect.bottom + 14 : undefined,
          bottom: placement === 'top' ? window.innerHeight - rect.top + 14 : undefined,
          background: '#4A5E50', color: '#fff', borderRadius: 14, padding: '14px 16px',
          textAlign: 'center', boxShadow: '0 10px 24px rgba(44,56,40,0.28)',
          animation: `coachmark-in-${placement} 0.3s ease both`,
        }}
      >
        <div
          style={{
            position: 'absolute', left: Math.max(20, Math.min(centerX - left, bubbleWidth - 20)) - 7,
            [placement === 'bottom' ? 'top' : 'bottom']: -7,
            width: 14, height: 14, background: '#4A5E50', transform: 'rotate(45deg)',
            borderRadius: placement === 'bottom' ? '3px 0 0 0' : '0 3px 0 0',
          }}
        />
        <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 13.5, fontWeight: 600, lineHeight: 1.4, margin: '0 0 10px' }}>{text}</p>
        <button
          type="button"
          onClick={markSeen}
          style={{
            background: '#fff', color: '#4A5E50', border: 'none', boxShadow: 'none',
            padding: '8px 20px', fontSize: 13, width: 'auto', borderRadius: 12,
            fontFamily: "'Urbanist', sans-serif", fontWeight: 600, cursor: 'pointer',
          }}
        >
          Got it
        </button>
      </div>
      <style>{`
        @keyframes coachmark-in-bottom { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes coachmark-in-top { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </>,
    document.body
  );
}
