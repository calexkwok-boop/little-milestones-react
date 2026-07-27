import { Icon } from './icons';
import KidThumb from './KidThumb.jsx';
import { cloudinaryTransform, AVATAR_TRANSFORM_SM } from './constants.js';

function KidChip({ kid, active, onClick, icon, label, badge }) {
  return (
    <div
      className={`kid-chip ${active ? 'active' : ''}`}
      style={active ? { background: kid ? kid.accent : 'var(--accent)' } : {}}
      onClick={onClick}
    >
      <span style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
        {kid ? <KidThumb kid={kid} /> : <span className="thumb"><Icon name={icon} style={{ fontSize: 11 }} /></span>}
        {badge && (
          <span style={{ position: 'absolute', top: -1, right: -1, width: 9, height: 9, borderRadius: '50%', background: '#E05C6A', border: '1.5px solid var(--bg-input)' }} />
        )}
      </span>
      {label ?? kid?.name}
    </div>
  );
}

export function AuthorChip({ member, onClick, active }) {
  return (
    <div className={`kid-chip ${active ? 'active' : ''}`} onClick={onClick} style={{ cursor: 'pointer', ...(active ? { background: 'var(--accent)' } : {}) }}>
      <span className="thumb" style={member.avatar_url ? {} : { background: 'var(--bg-elevated)', color: 'var(--accent)', fontSize: 10, fontWeight: 700 }}>
        {member.avatar_url
          ? <img src={cloudinaryTransform(member.avatar_url, AVATAR_TRANSFORM_SM)} alt="" loading="lazy" />
          : (member.real_name || member.display_name)?.charAt(0)?.toUpperCase() || '?'}
      </span>
      {(member.real_name || member.display_name)?.split(' ')[0] || 'Me'}
    </div>
  );
}

export function KidSelector({ kids, selected, onSelect, showBoth, unseenKidIds }) {
  return (
    <div className="scrollx">
      <KidChip active={selected === null} onClick={() => onSelect(null)} icon="ti-layout-list" label="All" />
      {kids.map(k => (
        <KidChip key={k.id} kid={k} active={selected === k.id} onClick={() => onSelect(k.id)} badge={unseenKidIds?.has(k.id)} />
      ))}
      {showBoth && kids.length >= 2 && (
        <KidChip active={selected === 'both'} onClick={() => onSelect('both')} icon="ti-users" label="Together" />
      )}
    </div>
  );
}

export default KidChip;
