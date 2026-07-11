function SectionSwitcher({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{ display: 'flex', background: 'var(--bg-card)', borderRadius: 9, padding: 3, gap: 2 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              border: 'none', borderRadius: 7, padding: '6px 14px', position: 'relative',
              fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: active === t.id ? 'var(--bg-input)' : 'transparent',
              color: active === t.id ? 'var(--accent)' : 'var(--text-muted)',
              boxShadow: active === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {t.label}
            {t.badge > 0 && (
              <span style={{ position: 'absolute', top: 3, right: 4, width: 7, height: 7, borderRadius: '50%', background: '#E05C6A' }} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default SectionSwitcher;
