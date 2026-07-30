import { memo, useState } from 'react';
import { Icon } from './icons';
import KidThumb from './KidThumb.jsx';
import CroppedImg from './CroppedImg.jsx';
import useLongPress from './useLongPress.js';
import {
  milestoneInfo, cloudinaryTransform, VIDEO_DELIVERY_TRANSFORM, videoThumbUrl, photoCropY, exactAgeLabel, PROMPT_ACCENT,
} from './constants.js';

const JournalEntryRow = memo(function JournalEntryRow({ entry, entryKids, onOpen, onLongPress, reactionCount }) {
  const m = entry.milestone ? milestoneInfo(entry.milestone) : null;
  const d = new Date(entry.date + 'T12:00:00');
  const dayNum = d.getDate();
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const rawText = (entry.text || '').replace(/^dear\s+[\w\s,&]+[,.]?\s*/i, '').trim();
  const text = rawText.length > 160 ? rawText.slice(0, 160) + '...' : rawText;
  const nameLabel = entryKids.map(k => k.name.split(' ')[0]).join(' & ');
  const lp = useLongPress(onLongPress ? () => onLongPress(entry) : null);
  const [playingHero, setPlayingHero] = useState(false);

  const hasMedia = entry.media && entry.media.length > 0;
  const heroMedia = hasMedia ? entry.media[0] : null;
  const extraMedia = hasMedia ? entry.media.slice(1, 4) : [];

  return (
    <div className={`journal-entry${m ? ' milestone-entry' : ''}`} onClick={lp.wrapClick(() => onOpen(entry))} onTouchStart={lp.onTouchStart} onTouchMove={lp.onTouchMove} onTouchEnd={lp.onTouchEnd} style={hasMedia ? { padding: 0 } : undefined}>
      {heroMedia && (
        <div style={{ margin: 0, borderRadius: '13px 13px 0 0', overflow: 'hidden', aspectRatio: '4/3', position: 'relative' }}>
          {heroMedia.type === 'video'
            ? playingHero
              ? <video src={cloudinaryTransform(heroMedia.url, VIDEO_DELIVERY_TRANSFORM)} autoPlay controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              : <img src={videoThumbUrl(heroMedia.url, 'so_0,w_800,e_sharpen:60,q_auto,f_auto')} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" loading="lazy" />
            : <CroppedImg src={cloudinaryTransform(heroMedia.url, 'w_1000,q_auto,f_auto')} cropY={photoCropY(entry.media, 0, entry)} fade />
          }
          {heroMedia.type === 'video' && !playingHero && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { e.stopPropagation(); setPlayingHero(true); }}>
              <div className="video-play-overlay"><Icon name="ti-player-play" style={{ fontSize: 15 }} /></div>
            </div>
          )}
          {entry.media.length > 1 && (
            <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.45)', borderRadius: 6, padding: '2px 7px', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Icon name="ti-photos" style={{ fontSize: 11, color: '#fff' }} />
              <span style={{ fontSize: 11, color: '#fff', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>{entry.media.length}</span>
            </div>
          )}
        </div>
      )}
      <div style={hasMedia ? { padding: '12px 16px 14px' } : undefined}>
        {!hasMedia && <span className="day-quote-mark">"</span>}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ textAlign: 'center', flexShrink: 0, width: 40 }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0, lineHeight: 1, fontFamily: "'Playfair Display', serif" }}>{dayNum}</p>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '2px 0 0', fontWeight: 600, textTransform: 'uppercase' }}>{weekday}</p>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <div style={{ display: 'flex' }}>
                {entryKids.map((k, i) => (
                  <div key={k.id} style={{ marginLeft: i > 0 ? -6 : 0, zIndex: entryKids.length - i, position: 'relative' }}>
                    <KidThumb kid={k} size={20} />
                  </div>
                ))}
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{nameLabel}</span>
              {entryKids.length === 1 && entryKids[0].birthdate && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {exactAgeLabel(entryKids[0].birthdate, entry.date)}</span>}
              <div style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                {entry.type === 'note' && <Icon name={entry.prompt ? 'ti-bulb' : 'ti-notebook'} style={{ fontSize: 11, color: entry.prompt ? PROMPT_ACCENT : 'var(--text-muted)' }} />}
                {reactionCount?.likes > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11, color: '#E05C6A', fontWeight: 600 }}>
                    <Icon name="ti-heart-filled" style={{ fontSize: 11 }} />
                    {reactionCount.likes}
                  </span>
                )}
                {reactionCount?.comments > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                    <Icon name="ti-message-circle" style={{ fontSize: 11 }} />
                    {reactionCount.comments}
                  </span>
                )}
                {entry.favorited && <Icon name="ti-star-filled" style={{ fontSize: 11, color: '#C8993E' }} />}
                {m && <span style={{ fontSize: 10, fontWeight: 700, color: '#C8993E' }}>{m.label}</span>}
              </div>
            </div>
            <p style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.65, margin: 0, fontFamily: "'Source Serif 4', serif", fontStyle: text ? 'italic' : 'normal' }}>{text}</p>
            {extraMedia.length > 0 && (
              <div className="journal-thumb-strip">
                {extraMedia.map((mm, i) => (
                  <div key={i} className="journal-thumb" style={{ position: 'relative' }}>
                    <CroppedImg
                      src={mm.type === 'video' ? videoThumbUrl(mm.url, 'so_0,w_200,q_auto,f_auto') : cloudinaryTransform(mm.url, 'w_200,q_auto,f_auto')}
                      cropY={photoCropY(entry.media, i + 1, entry)}
                      style={{ borderRadius: 8, overflow: 'hidden' }}
                    />
                    {mm.type === 'video' && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="ti-player-play" style={{ fontSize: 12, color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} /></div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default JournalEntryRow;
