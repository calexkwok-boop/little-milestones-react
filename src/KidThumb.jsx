import { useState, useEffect, memo } from 'react';
import { cloudinaryTransform, AVATAR_TRANSFORM_SM } from './constants.js';

const KidThumb = memo(function KidThumb({ kid, size = 24 }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [kid.avatar]);
  if (kid.avatar && !broken) {
    return (
      <span className="thumb" style={{ width: size, height: size }}>
        <img src={cloudinaryTransform(kid.avatar, AVATAR_TRANSFORM_SM)} alt={kid.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setBroken(true)} loading="lazy" />
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
});

export default KidThumb;
