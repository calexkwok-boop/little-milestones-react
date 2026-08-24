import { Icon } from './icons';
// Sage by default -- gold is reserved for milestone contexts elsewhere in
// the app, and this switcher is used for plain section navigation (Recap,
// Compare, Letters, Reels, etc.), none of which are milestones. A genuinely
// gold-appropriate usage can still override accentRgb/accentColor.
function SectionSwitcher({ tabs, active, onChange, fill, accentRgb = 'var(--accent-rgb)', accentColor = 'var(--accent)' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{ display: 'flex', background: 'var(--bg-card)', borderRadius: 10, padding: 3, gap: 2, border: `1px solid rgba(${accentRgb}, 0.14)`, width: fill ? '100%' : undefined }}>
        {tabs.map(t => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                flex: fill ? 1 : undefined,
                minHeight: 40, textAlign: 'center', lineHeight: 1.15,
                border: 'none', borderRadius: 7, padding: '7px 10px', position: 'relative',
                fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: isActive ? `linear-gradient(180deg, rgba(${accentRgb},0.16), rgba(${accentRgb},0.09))` : 'transparent',
                color: isActive ? accentColor : 'var(--text-muted)',
                boxShadow: isActive ? `inset 0 0 0 1px rgba(${accentRgb}, 0.3)` : 'none',
              }}
            >
              {t.icon && <Icon name={t.icon} style={{ fontSize: 12 }} />}
              {t.label}
              {t.badge > 0 && (
                <span style={{ position: 'absolute', top: 3, right: 4, width: 7, height: 7, borderRadius: '50%', background: '#E05C6A' }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default SectionSwitcher;
