function SectionSwitcher({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{ display: 'flex', background: 'var(--bg-card)', borderRadius: 10, padding: 3, gap: 2, border: '1px solid rgba(200,153,62,0.14)' }}>
        {tabs.map(t => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                border: 'none', borderRadius: 7, padding: '7px 10px', position: 'relative',
                fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: isActive ? 'linear-gradient(180deg, rgba(200,153,62,0.16), rgba(200,153,62,0.09))' : 'transparent',
                color: isActive ? '#C8993E' : 'var(--text-muted)',
                boxShadow: isActive ? 'inset 0 0 0 1px rgba(200,153,62,0.3)' : 'none',
              }}
            >
              {t.icon && <i className={`ti ${t.icon}`} style={{ fontSize: 12 }} />}
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
