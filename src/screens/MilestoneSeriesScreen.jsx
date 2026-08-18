import { Icon } from '../icons';
import KidThumb from '../KidThumb.jsx';
import { milestoneInfo, exactAgeLabel, cloudinaryTransform, videoThumbUrl, PHOTO_MD } from '../constants.js';

// One entry per year a milestone recurred, in a vertical timeline. Nothing
// here is data the app didn't already have -- every card is one of the
// user's own entries, matched to the others purely by sharing the same
// milestone type and kid (see HomeScreen's featuredMilestoneSeries).
function MilestoneSeriesScreen({ series, onBack, onOpenEntry }) {
  const info = milestoneInfo(series.milestone);
  const entries = series.entries;
  const latestId = entries[entries.length - 1].id;

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <button className="icon-btn" onClick={onBack}><Icon name="ti-arrow-left" /></button>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ width: 28, height: 1, background: 'rgba(200,153,62,0.4)', margin: '0 auto 5px' }} />
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>{info?.label || 'Milestone'}</h2>
            </div>
            <div style={{ width: 36 }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', margin: '4px 0 22px' }}>
            <KidThumb kid={series.kid} size={22} />
            <p style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 13.5, color: 'var(--text-2)', margin: 0 }}>
              Same moment. Never quite the same {series.kid.name}.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'var(--bg-elevated)', border: '1px dashed var(--border)', borderRadius: 10, padding: '9px 12px', marginBottom: 22 }}>
            <Icon name="ti-sparkles" style={{ fontSize: 13, color: '#C8993E', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 11.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.45 }}>
              Matched automatically. Every letter below has the same milestone tag for {series.kid.name}.
            </p>
          </div>

          <div style={{ position: 'relative', paddingLeft: 22 }}>
            <div style={{ position: 'absolute', left: 5, top: 8, bottom: 8, width: 2, background: 'var(--border)' }} />
            {entries.map(entry => {
              const isLatest = entry.id === latestId;
              const thumb = entry.media?.[0];
              const preview = entry.text?.length > 160 ? entry.text.slice(0, 160) + '…' : entry.text;
              return (
                <div key={entry.id} style={{ position: 'relative', marginBottom: 26 }}>
                  <div style={{
                    position: 'absolute', left: -22, top: 3, width: 12, height: 12, borderRadius: '50%',
                    background: isLatest ? '#C8993E' : 'var(--bg-card)',
                    border: `2px solid ${isLatest ? '#C8993E' : 'var(--accent)'}`,
                    boxShadow: isLatest ? '0 0 0 4px rgba(200,153,62,0.18)' : 'none',
                  }} />
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{exactAgeLabel(series.kid.birthdate, entry.date)}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                      · {new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    {isLatest && (
                      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: '#fff', background: '#C8993E', padding: '2px 6px', borderRadius: 5 }}>Newest</span>
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

export default MilestoneSeriesScreen;
