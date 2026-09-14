import { ASSET_BASE } from './constants.js';

// A soft brand mark faded behind a screen's own title -- same technique
// Patina Boards uses in the trivia app (a per-screen mark image, low
// opacity, centered behind the heading). Drop as the first child of a
// `position: relative` title wrapper; the title itself needs its own
// `position: relative, zIndex: 1` (or an inner wrapper with those) to
// paint above it, since an absolutely-positioned sibling otherwise paints
// after normal in-flow content regardless of DOM order.
export default function TitleWatermark({ size = 56, opacity = 0.14 }) {
  return (
    <img
      src={`${ASSET_BASE}icon-mark-gold.png`}
      alt=""
      style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: size, height: size, opacity, pointerEvents: 'none',
      }}
    />
  );
}
