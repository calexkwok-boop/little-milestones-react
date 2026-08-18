import { Icon } from '../icons';
import KidThumb from '../KidThumb.jsx';
import { cloudinaryTransform, videoThumbUrl, PHOTO_MD } from '../constants.js';

// The manually-linked counterpart to MilestoneSeriesScreen -- same timeline
// treatment, but the entries here got here by an explicit "Link to another
// letter" choice (entry.linkGroupId) rather than sharing a milestone tag,
// so there's no single kid or milestone label to build a header around.
// Each card shows whichever kids that specific entry was actually about.
function LinkedLettersScreen({ entries, kids, onBack, onOpenEntry }) {
  const sorted = entries.slice().sort((a, b) => a.date.localeCompare(b.date));
  const latestId = sorted[sorted.length - 1].id;

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <button className="icon-btn" onClick={onBack}><Icon name="ti-arrow-left" /></button>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ width: 28, height: 1, background: 'rgba(200,153,62,0.4)', margin: '0 auto 5px' }} />
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>Linked Letters</h2>
            </div>
            <div style={{ width: 36 }} />
          </div>

          <p style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 13.5, color: 'var(--text-2)', textAlign: 'center', margin: '4px 0 22px' }}>
            Some things, you go back to.
          </p>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'var(--bg-elevated)', border: '1px dashed var(--border)', borderRadius: 10, padding: '9px 12px', marginBottom: 22 }}>
            <Icon name="ti-link" style={{ fontSize: 13, color: '#C8993E', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 11.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.45 }}>
              Linked by hand from each letter's "..." menu — not automatic, just the two (or more) you chose to connect.
            </p>
          </div>

          <div style={{ position: 'relative', paddingLeft: 22 }}>
            <div style={{ position: 'absolute', left: 5, top: 8, bottom: 8, width: 2, background: 'var(--border)' }} />
            {sorted.map(entry => {
              const isLatest = entry.id === latestId;
              const thumb = entry.media?.[0];
              const preview = entry.text?.length > 160 ? entry.text.slice(0, 160) + '…' : entry.text;
              const entryKids = (entry.kids || []).map(id => kids.find(k => k.id === id)).filter(Boolean);
              return (
                <div key={entry.id} style={{ position: 'relative', marginBottom: 26 }}>
                  <div style={{
                    position: 'absolute', left: -22, top: 3, width: 12, height: 12, borderRadius: '50%',
                    background: isLatest ? '#C8993E' : 'var(--bg-card)',
                    border: `2px solid ${isLatest ? '#C8993E' : 'var(--accent)'}`,
                    boxShadow: isLatest ? '0 0 0 4px rgba(200,153,62,0.18)' : 'none',
                  }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                      {new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    {entryKids.length > 0 && (
                      <div style={{ display: 'flex', flexShrink: 0 }}>
                        {entryKids.map((k, i) => (
                          <div key={k.id} style={{ marginLeft: i > 0 ? -8 : 0, border: '2px solid var(--bg-card)', borderRadius: '50%' }}>
                            <KidThumb kid={k} size={20} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div
                    onClick={() => onOpenEntry(entry)}
                    style={{ cursor: 'pointer', borderRadius: 14, overflow: 'hidden', background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                  >
                    {thumb && (
                      <div style={{ width: '100%', aspectRatio: '4 / 3', position: 'relative', background: 'var(--bg-input)' }}>
                        <img
                          src={thumb.type === 'video' ? videoThumbUrl(thumb.url, `so_0,${PHOTO_MD}`) : cloudinaryTransform(thumb.url, PHOTO_MD)}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                        {thumb.type === 'video' && (
                          <Icon name="ti-player-play-filled" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: '#fff', fontSize: 20, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))' }} />
                        )}
                      </div>
                    )}
                    {preview && (
                      <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6, margin: 0, padding: 14 }}>
                        {preview}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LinkedLettersScreen;
