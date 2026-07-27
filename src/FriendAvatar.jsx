import { useState } from 'react';
import { cloudinaryTransform, AVATAR_TRANSFORM_SM } from './constants.js';

function FriendAvatar({ name, avatarUrl, size = 38 }) {
  const [broken, setBroken] = useState(false);
  if (avatarUrl && !broken) {
    return (
      <span className="thumb" style={{ width: size, height: size, flexShrink: 0 }}>
        <img src={cloudinaryTransform(avatarUrl, AVATAR_TRANSFORM_SM)} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setBroken(true)} loading="lazy" />
      </span>
    );
  }
  return (
    <span className="thumb" style={{ width: size, height: size, fontSize: Math.round(size * 0.4), background: 'var(--bg-elevated)', flexShrink: 0 }}>
      {name?.[0]?.toUpperCase() || '?'}
    </span>
  );
}

export default FriendAvatar;
