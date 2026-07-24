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
  const bubbleWidth = 210;
  const left = Math.max(16, Math.min(rect.left, window.innerWidth - bubbleWidth - 16));
  // Rendered via a portal straight into <body> rather than in place — every
  // `.screen` plays a mount animation that animates `transform`, which makes
  // it a new containing block for any `position: fixed` descendant for the
  // duration of that animation. Left in place, these overlays would measure
  // the target correctly (getBoundingClientRect is always viewport-relative)
  // but then render themselves relative to that animating screen instead of
  // the real viewport — visibly offset from the button they're supposed to
  // be spotlighting. A portal sidesteps the whole containing-block problem.
  return createPortal(
    <>
      <div
        style={{
          position: 'fixed', zIndex: 9998, pointerEvents: 'none',
          top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
          borderRadius: 999, boxShadow: '0 0 0 2000px rgba(20,26,20,0.62)',
        }}
      />
      <div
        style={{
          position: 'fixed', zIndex: 9999, left, width: bubbleWidth,
          top: placement === 'bottom' ? rect.bottom + 14 : undefined,
          bottom: placement === 'top' ? window.innerHeight - rect.top + 14 : undefined,
          background: '#2C3828', color: '#F8F4EC', borderRadius: 14, padding: '12px 14px',
          fontSize: 12, lineHeight: 1.5, fontFamily: "'Urbanist', sans-serif", boxShadow: '0 8px 20px rgba(0,0,0,0.3)', pointerEvents: 'none',
        }}
      >
        {text}
        <div style={{ marginTop: 8, fontSize: 10.5, fontWeight: 700, color: '#C8D9C4', textTransform: 'uppercase', letterSpacing: 0.5 }}>Got it</div>
      </div>
    </>,
    document.body
  );
}
