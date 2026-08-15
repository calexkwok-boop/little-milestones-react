import { useState, useEffect, useRef, useMemo } from 'react';
import { Icon } from '../icons';
import SectionSwitcher from '../SectionSwitcher.jsx';
import KidThumb from '../KidThumb.jsx';
import FriendAvatar from '../FriendAvatar.jsx';
import {
  TODAY,
  milestoneInfo, sameAgeSides, exactAge, exactAgeLabel, ageLabel,
  cloudinaryTransform, AVATAR_TRANSFORM_SM, VIDEO_DELIVERY_TRANSFORM, videoThumbUrl, entryBgStyle, tintedScrimStyle, PHOTO_LG,
} from '../constants.js';

function CompareScreen({ entries, kids, friendKids = [], friendEntries = [], friends = [], currentUserId, onBack, onOpenEntry, initialFriendKidId = null, initialCompareAge = null, initialEntryId = null, onSwitchSection, onSameAge }) {
  const [filterTab, setFilterTab] = useState('age');
  const [compareAge, setCompareAge] = useState(initialCompareAge ?? 24);
  const [photoViewer, setPhotoViewer] = useState(null); // { entry, kid, ageStr, isFriend, friendName, friendAvatar }
  const [playingVideoId, setPlayingVideoId] = useState(null);
  const [highlightEntryId, setHighlightEntryId] = useState(null);
  const mediaRefs = useRef({});

  // Stop the playing video the moment it's scrolled out of view.
  useEffect(() => {
    if (!playingVideoId) return;
    const el = mediaRefs.current[playingVideoId];
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) setPlayingVideoId(id => id === playingVideoId ? null : id);
    }, { threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [playingVideoId]);

  const friendInfoMap = useMemo(() => {
    const map = {};
    friends.forEach(fr => {
      const friendId = fr.requester_id === currentUserId ? fr.addressee_id : fr.requester_id;
      map[friendId] = {
        name: fr.requester_id === currentUserId ? fr.addressee_display_name : fr.requester_display_name,
        avatar: fr.requester_id === currentUserId ? fr.addressee_avatar_url : fr.requester_avatar_url,
      };
    });
    return map;
  }, [friends, currentUserId]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFriendKidIds, setSelectedFriendKidIds] = useState(initialFriendKidId ? [initialFriendKidId] : []);
  const [excludedKidIds, setExcludedKidIds] = useState([]);
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const ages = [0, 12, 18, 24, 36, 48, 60, 72, 84, 96, 108, 120];

  // CompareScreen is kept mounted in the background (see keepsakesGroupMounted
  // in App), so initialFriendKidId/initialCompareAge only apply via useState
  // on the very first mount — a later "Compare" tap from the friends feed
  // updates the props but wouldn't otherwise reach an already-mounted screen.
  useEffect(() => {
    if (!initialFriendKidId) return;
    setSelectedFriendKidIds(prev => prev.includes(initialFriendKidId) ? prev : [...prev, initialFriendKidId]);
    setFilterTab('age');
  }, [initialFriendKidId]);
  useEffect(() => {
    if (initialCompareAge == null) return;
    setCompareAge(initialCompareAge);
  }, [initialCompareAge]);
  // Jumping to the right age bucket isn't enough if that bucket has several
  // photos — scroll straight to the one that was tapped and flash it briefly
  // so it's obvious which card is "the" one. Deferred a beat so the age-bucket
  // and friend-kid effects above have a chance to re-render the grid first.
  useEffect(() => {
    if (!initialEntryId) return;
    const t = setTimeout(() => {
      const el = mediaRefs.current[initialEntryId];
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightEntryId(initialEntryId);
      setTimeout(() => setHighlightEntryId(id => id === initialEntryId ? null : id), 1800);
    }, 300);
    return () => clearTimeout(t);
  }, [initialEntryId]);

  const selectedFriendKids = friendKids.filter(k => selectedFriendKidIds.includes(k.id));
  const isSearching = searchQuery.trim().length > 0;

  function switchTab(tab) {
    setFilterTab(tab);
    setSearchQuery('');
  }

  function matchesAgeBucket(entryAgeMonths) {
    const currentIndex = ages.indexOf(compareAge);
    if (currentIndex === -1) return false;
    const nextAge = ages[currentIndex + 1];
    if (nextAge == null) return entryAgeMonths >= compareAge;
    return entryAgeMonths >= compareAge && entryAgeMonths < nextAge;
  }

  function entryMatchesSearch(e) {
    const q = searchQuery.trim().toLowerCase();
    if (q === 'note' || q === 'notes') return e.type === 'note' && !e.prompt;
    if (q === 'prompt' || q === 'prompts') return e.type === 'note' && !!e.prompt;
    const m = e.milestone ? milestoneInfo(e.milestone) : null;
    return (e.text || '').toLowerCase().includes(q)
      || (e.prompt || '').toLowerCase().includes(q)
      || (m && m.label.toLowerCase().includes(q))
      || e.location?.toLowerCase().includes(q)
      || (e.people || []).some(p => p.toLowerCase().includes(q));
  }

  const showMeta = isSearching;

  // Own kids are always present (never removed, only faded when excluded); friend kids are added/removed outright.
  const allKidColumns = [...kids, ...selectedFriendKids.map(k => ({ ...k, isFriend: true }))];
  const includedKidColumns = allKidColumns.filter(k => k.isFriend || !excludedKidIds.includes(k.id));

  // Flat sorted list of all entries for the age grid (2+ kids). Same-age merged
  // posts (one entry, two kids) get shown once per kid — each appearance uses a
  // per-kid "view" of the entry (that kid's own date/age and their tagged photo)
  // so it slots into the grid exactly like any other solo photo, just twice.
  const ageGridItems = (filterTab === 'age' && allKidColumns.length >= 2)
    ? includedKidColumns.flatMap(kid => {
        const pool = kid.isFriend ? friendEntries : entries;
        const kidList = kid.isFriend ? friendKids : kids;
        const solo = pool
          .filter(e => e.kids.length === 1 && e.kids.includes(kid.id) && e.media?.length > 0)
          .map(e => ({ e, kid }));
        const sameAge = pool
          .filter(e => e.sameAgeDates && e.kids.includes(kid.id))
          .map(e => {
            const sides = sameAgeSides(e, kidList);
            if (!sides) return null;
            const side = sides.find(s => s.kid.id === kid.id);
            if (!side || !side.photo) return null;
            const { years, months } = exactAge(kid.birthdate, side.date);
            const otherMedia = e.media.filter(m => m !== side.photo);
            return { e: { ...e, date: side.date, ageMonths: years * 12 + months, media: [side.photo, ...otherMedia] }, kid };
          })
          .filter(Boolean);
        // A multi-kid entry that isn't a same-age match (e.g. two siblings, or
        // a friend's two kids, tagged together in one photo) still belongs on
        // each tagged kid's own age timeline — it was just missing from the
        // grid entirely before. Recompute this kid's actual age at the entry's
        // date rather than trusting the stored age_months, which only reflects
        // whichever kid was primary when the entry was created.
        const multiKid = pool
          .filter(e => e.kids.length > 1 && !e.sameAgeDates && e.kids.includes(kid.id) && e.media?.length > 0 && kid.birthdate)
          .map(e => {
            const { years, months } = exactAge(kid.birthdate, e.date);
            return { e: { ...e, ageMonths: years * 12 + months }, kid };
          });
        return [...solo, ...sameAge, ...multiKid].filter(({ e }) => matchesAgeBucket(e.ageMonths));
      }).sort((a, b) => {
        const toDays = ({ e, kid }) => (kid.birthdate && e.date)
          ? (new Date(e.date) - new Date(kid.birthdate)) / 86400000
          : e.ageMonths * 30.44;
        return toDays(a) - toDays(b);
      })
    : null;

  // When one of your own kids has a photo at this age bucket and a sibling
  // doesn't, that gap is exactly the moment to invite creating a same-age
  // comparison — reuses the same match/confirm flow the entry-detail icon
  // already opens, just entered from here instead. Friend kids are excluded
  // (their entries aren't yours to merge into), there must be a real anchor
  // entry to attach the new match to, and the "missing" kid must have actually
  // reached this age already — a 2-year-old isn't "missing" an 8yr photo, that
  // moment just hasn't happened yet.
  const sameAgeGap = useMemo(() => {
    if (!ageGridItems || !onSameAge) return null;
    const ownKids = includedKidColumns.filter(k => !k.isFriend);
    if (ownKids.length < 2) return null;
    const ownItems = ageGridItems.filter(({ kid }) => !kid.isFriend);
    const presentIds = new Set(ownItems.map(({ kid }) => kid.id));
    const missingKids = ownKids.filter(k => {
      if (presentIds.has(k.id)) return false;
      const { years, months } = exactAge(k.birthdate, TODAY);
      return years * 12 + months >= compareAge;
    });
    if (missingKids.length === 0 || !ownItems[0]) return null;
    const anchorEntry = entries.find(e => e.id === ownItems[0].e.id);
    if (!anchorEntry) return null;
    return { anchorEntry, anchorKid: ownItems[0].kid, missingKids };
  }, [ageGridItems, includedKidColumns, entries, onSameAge, compareAge]);

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <button className="icon-btn" onClick={onBack}><Icon name="ti-arrow-left" /></button>
              </div>
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div style={{ width: 28, height: 1, background: 'rgba(200,153,62,0.4)', margin: '0 auto 5px' }} />
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>Keepsakes</h2>
              </div>
              <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                <button className="icon-btn" onClick={() => filterTab === 'search' ? switchTab('age') : switchTab('search')}>
                  <Icon name={filterTab === 'search' ? 'ti-x' : 'ti-search'} />
                </button>
              </div>
            </div>

            <div>
              <SectionSwitcher
                tabs={[{ id: 'recap', label: 'Recap', icon: 'ti-sparkles' }, { id: 'partner-letters', label: 'Letters', icon: 'ti-mail' }, { id: 'compare', label: 'Same age', icon: 'ti-arrows-diff' }, { id: 'reels', label: 'Reels', icon: 'ti-player-play' }]}
                active="compare"
                onChange={onSwitchSection}
                fill
              />
            </div>
          </div>

          {filterTab === 'search' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <Icon name="ti-search" style={{ color: 'var(--text-muted)', fontSize: 16 }} />
              <input
                autoFocus
                type="text"
                placeholder="Search moments..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', flex: 1, fontSize: 16, background: 'transparent', color: 'var(--accent)', fontFamily: 'Inter, sans-serif' }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex', alignItems: 'center' }}>
                  <Icon name="ti-x" style={{ fontSize: 14 }} />
                </button>
              )}
            </div>
          )}

          {filterTab === 'age' && (
            <div className="scrollx">
              {ages.map(age => (
                <div
                  key={age}
                  className={`kid-chip ${compareAge === age ? 'active' : ''}`}
                  style={{ padding: '7px 14px', ...(compareAge === age ? { background: 'var(--accent)' } : {}) }}
                  onClick={() => setCompareAge(age)}
                >
                  {age === 0 ? 'Under 1yr' : ageLabel(age)}
                </div>
              ))}
            </div>
          )}

          {ageGridItems ? (
            /* ── Free-flowing 2-col grid: By Age with 2+ kids ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Kid tags */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {allKidColumns.map(kid => {
                  const isExcluded = !kid.isFriend && excludedKidIds.includes(kid.id);
                  return (
                    <div
                      key={kid.id}
                      onClick={() => !kid.isFriend && setExcludedKidIds(prev => isExcluded ? prev.filter(id => id !== kid.id) : [...prev, kid.id])}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--bg-elevated)', borderRadius: 99, padding: '4px 10px 4px 5px', opacity: isExcluded ? 0.4 : 1, cursor: kid.isFriend ? 'default' : 'pointer', transition: 'opacity 0.15s' }}
                    >
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: kid.accent || 'var(--border)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {kid.avatar
                          ? <img src={cloudinaryTransform(kid.avatar, AVATAR_TRANSFORM_SM)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                          : <span style={{ fontSize: 8, fontWeight: 700, color: '#fff' }}>{kid.name.charAt(0)}</span>}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{kid.name}</span>
                      {kid.isFriend && (
                        <button
                          onClick={() => setSelectedFriendKidIds(prev => prev.filter(id => id !== kid.id))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex', marginLeft: 2 }}
                        >
                          <Icon name="ti-x" style={{ fontSize: 11 }} />
                        </button>
                      )}
                    </div>
                  );
                })}
                {friendKids.length > 0 && selectedFriendKidIds.length < 10 && (
                  <button onClick={() => setShowFriendPicker(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: '1.5px dashed var(--border)', borderRadius: 99, padding: '4px 10px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
                    <Icon name="ti-plus" style={{ fontSize: 12 }} /> Add
                  </button>
                )}
              </div>

              {sameAgeGap && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sameAgeGap.missingKids.map(missingKid => (
                    <button
                      key={missingKid.id}
                      onClick={() => onSameAge(sameAgeGap.anchorEntry, sameAgeGap.anchorKid, [missingKid])}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'var(--bg-elevated)', border: '1px dashed var(--border)', borderRadius: 12, padding: '10px 14px', cursor: 'pointer', textAlign: 'left' }}
                    >
                      <KidThumb kid={missingKid} size={30} />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>Add {missingKid.name.split(' ')[0]}'s photo from around this age</span>
                      <Icon name="ti-arrows-diff" style={{ fontSize: 16, color: 'var(--accent)' }} />
                    </button>
                  ))}
                </div>
              )}

              {ageGridItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 24px' }}>
                  <Icon name="ti-camera" style={{ fontSize: 22, color: 'var(--border-light)', display: 'block', marginBottom: 8 }} />
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Nothing captured at this age yet</p>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  {[0, 1].map(col => (
                    <div key={col} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {ageGridItems.filter((_, i) => i % 2 === col).map(({ e, kid }) => {
                        const m = e.milestone ? milestoneInfo(e.milestone) : null;
                        const ageStr = exactAgeLabel(kid.birthdate, e.date);
                        const isFriendKid = !!kid.isFriend;
                        const fi = isFriendKid ? (friendInfoMap[kid.userId] || {}) : null;
                        return (
                          <div key={`${e.id}-${kid.id}`} className={m ? 'milestone-entry' : undefined}
                            style={{ borderRadius: 12, cursor: 'pointer', padding: m ? 2 : 0 }}
                            onClick={() => isFriendKid
                              ? setPhotoViewer({ entry: e, kid, ageStr, isFriend: true, friendName: fi?.name || 'Friend', friendAvatar: fi?.avatar || null })
                              : onOpenEntry(e)}>
                            <div ref={el => { mediaRefs.current[e.id] = el; }} style={{ borderRadius: 10, overflow: 'hidden', position: 'relative', boxShadow: e.id === highlightEntryId ? '0 0 0 3px var(--accent)' : 'none', transition: 'box-shadow 0.3s' }}>
                              {playingVideoId === e.id ? (
                                <div style={{ aspectRatio: '3/4', background: '#000', position: 'relative' }}>
                                  <video
                                    src={cloudinaryTransform(e.media[0].url, VIDEO_DELIVERY_TRANSFORM)}
                                    poster={videoThumbUrl(e.media[0].url, `so_0,${PHOTO_LG}`)}
                                    autoPlay playsInline controls
                                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                                    onClick={ev => ev.stopPropagation()}
                                    onEnded={() => setPlayingVideoId(null)}
                                  />
                                  <button
                                    onClick={ev => { ev.stopPropagation(); setPlayingVideoId(null); }}
                                    style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.4)', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', zIndex: 4 }}>
                                    <Icon name="ti-x" style={{ fontSize: 14 }} />
                                  </button>
                                </div>
                              ) : (
                                <div className="compare-photo" style={entryBgStyle(e)}>
                                  <div className="scrim" style={tintedScrimStyle(e, 0.5)} />
                                  {e.media?.[0]?.type === 'video' && (
                                    <button
                                      onClick={ev => { ev.stopPropagation(); setPlayingVideoId(e.id); }}
                                      style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', zIndex: 2 }}>
                                      <Icon name="ti-player-play-filled" style={{ fontSize: 12, color: '#fff', marginLeft: 2 }} />
                                    </button>
                                  )}
                                  <div style={{ position: 'relative', zIndex: 2, padding: 10, width: '100%' }}>
                                    <p style={{ fontSize: 11, color: '#fff', margin: 0, fontWeight: 700 }}>{ageStr}</p>
                                  </div>
                                </div>
                              )}
                              {playingVideoId !== e.id && (() => {
                                // A post written to more than one kid (siblings tagged together,
                                // or a same-age match) should show every kid it's written to here,
                                // not just whichever kid this particular grid appearance belongs to.
                                const pool = kid.isFriend ? friendKids : kids;
                                const badgeKids = e.kids.length > 1
                                  ? [...e.kids.filter(id => id !== kid.id).map(id => pool.find(k => k.id === id)).filter(Boolean), kid]
                                  : [kid];
                                return (
                                  <div style={{ position: 'absolute', top: 7, right: 7, display: 'flex', zIndex: 3 }}>
                                    {badgeKids.map((bk, i) => (
                                      <div key={bk.id} style={{ width: 22, height: 22, borderRadius: '50%', background: bk.accent || 'var(--border)', border: '2px solid rgba(255,255,255,0.9)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: i > 0 ? -10 : 0, flexShrink: 0 }}>
                                        {bk.avatar
                                          ? <img src={cloudinaryTransform(bk.avatar, AVATAR_TRANSFORM_SM)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                          : <span style={{ fontSize: 8, fontWeight: 700, color: '#fff' }}>{bk.name.charAt(0)}</span>}
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* ── Original column layout: search tab or single kid ── */
            <div className="scrollx" style={{ alignItems: 'flex-start', gap: 12, paddingBottom: 8 }}>
              {allKidColumns.map(kid => {
                const isFriendKid = !!kid.isFriend;
                const isExcluded = !isFriendKid && excludedKidIds.includes(kid.id);
                const pool = isFriendKid ? friendEntries : entries;
                const matches = isSearching
                  ? pool.filter(e => e.kids.includes(kid.id) && entryMatchesSearch(e))
                  : pool.filter(e => e.kids.length === 1 && e.kids.includes(kid.id) && matchesAgeBucket(e.ageMonths))
                      .sort((a, b) => {
                        if (a.ageMonths !== b.ageMonths) return a.ageMonths - b.ageMonths;
                        if (!kid.birthdate || !a.date || !b.date) return (a.date || '').localeCompare(b.date || '');
                        const bd = new Date(kid.birthdate);
                        return (new Date(a.date) - bd) - (new Date(b.date) - bd);
                      });
                return (
                  <div key={kid.id} style={{ width: 170, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, opacity: isExcluded ? 0.4 : 1, transition: 'opacity 0.15s' }}>
                    <div
                      onClick={() => !isFriendKid && setExcludedKidIds(prev => isExcluded ? prev.filter(id => id !== kid.id) : [...prev, kid.id])}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: isFriendKid ? 'default' : 'pointer' }}
                    >
                      <KidThumb kid={kid} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kid.name}</p>
                        {isFriendKid && <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>friend</p>}
                      </div>
                      {isFriendKid && (
                        <button
                          onClick={e => { e.stopPropagation(); setSelectedFriendKidIds(prev => prev.filter(id => id !== kid.id)); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', flexShrink: 0 }}
                        >
                          <Icon name="ti-x" style={{ fontSize: 13 }} />
                        </button>
                      )}
                    </div>
                    {matches.length === 0 ? (
                      <div style={{ background: 'var(--bg-input)', border: '1px dashed #D8CFBC', borderRadius: 12, padding: '28px 12px', textAlign: 'center' }}>
                        <Icon name={isFriendKid ? 'ti-lock' : 'ti-camera'} style={{ fontSize: 22, color: 'var(--border-light)', display: 'block', marginBottom: 8 }} />
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                          {isFriendKid ? 'Nothing shared\nat this age yet' : isSearching ? 'No matches' : 'Nothing captured\nat this age yet'}
                        </p>
                      </div>
                    ) : matches.map(e => {
                      const m = e.milestone ? milestoneInfo(e.milestone) : null;
                      const ageStr = exactAgeLabel(kid.birthdate, e.date);
                      const dateStr = new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                      const fi = isFriendKid ? (friendInfoMap[kid.userId] || {}) : null;
                      return (
                        <div key={e.id} className={m ? 'milestone-entry' : undefined} style={{ borderRadius: 12, cursor: 'pointer', padding: m ? 2 : 0 }} onClick={() => {
                          if (isFriendKid) {
                            setPhotoViewer({ entry: e, kid, ageStr, isFriend: true, friendName: fi?.name || 'Friend', friendAvatar: fi?.avatar || null });
                          } else {
                            onOpenEntry(e);
                          }
                        }}>
                          <div style={{ borderRadius: 10, overflow: 'hidden' }}>
                            <div className="compare-photo" style={entryBgStyle(e)}>
                              <div className="scrim" style={tintedScrimStyle(e, 0.5)} />
                              <div style={{ position: 'relative', zIndex: 2, padding: 10, width: '100%' }}>
                                <p style={{ fontSize: 11, color: '#fff', margin: '0 0 2px', fontWeight: 700 }}>{ageStr}</p>
                                {showMeta && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', margin: '0 0 2px' }}>{dateStr}</p>}
                                {m && <p style={{ fontSize: 11, color: '#fff', margin: 0, fontWeight: 600, opacity: 0.9 }}>{m.label}</p>}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {friendKids.length > 0 && selectedFriendKidIds.length < 10 && (
                <div style={{ width: 44, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    onClick={() => setShowFriendPicker(true)}
                    style={{ width: 44, height: 44, borderRadius: '50%', background: 'none', border: '1.5px dashed var(--border)', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icon name="ti-plus" style={{ fontSize: 18 }} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {photoViewer && (() => {
        const { entry, kid, ageStr, isFriend, friendName, friendAvatar } = photoViewer;
        const media = entry.media?.[0];
        const dateStr = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        return (
          <div onClick={() => setPhotoViewer(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ position: 'absolute', top: 16, left: 16 }}>
              <button onClick={() => setPhotoViewer(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: 14 }}>
                <Icon name="ti-arrow-left" />
              </button>
            </div>
            {isFriend && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, alignSelf: 'flex-start', paddingLeft: 4 }}>
                <FriendAvatar name={friendName} avatarUrl={friendAvatar} size={36} />
                <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{friendName}</span>
              </div>
            )}
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', borderRadius: 16, overflow: 'hidden' }}>
              {media?.type === 'video'
                ? <video src={cloudinaryTransform(media.url, VIDEO_DELIVERY_TRANSFORM)} controls autoPlay playsInline style={{ width: '100%', display: 'block', maxHeight: '65vh', objectFit: 'contain', background: '#000' }} />
                : <img src={media?.url || ''} alt="" style={{ width: '100%', display: 'block', maxHeight: '65vh', objectFit: 'contain', background: entry.palette?.bg || '#111' }} loading="lazy" />
              }
            </div>
            <div style={{ marginTop: 14, alignSelf: 'flex-start', paddingLeft: 4 }}>
              <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: '0 0 3px' }}>{kid.name} · {ageStr}</p>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: 0 }}>{dateStr}</p>
            </div>
          </div>
        );
      })()}

      {showFriendPicker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 20 }} onClick={() => { setShowFriendPicker(false); setPickerQuery(''); }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxHeight: '70%', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>At the same age</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
              <Icon name="ti-search" style={{ color: 'var(--text-muted)', fontSize: 15 }} />
              <input
                autoFocus
                type="text"
                placeholder="Search by name..."
                value={pickerQuery}
                onChange={e => setPickerQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', flex: 1, fontSize: 15, background: 'transparent', color: 'var(--text)', fontFamily: 'Inter, sans-serif' }}
              />
              {pickerQuery && <button onClick={() => setPickerQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}><Icon name="ti-x" style={{ fontSize: 13 }} /></button>}
            </div>
            {friends.map(fr => {
              const uid = fr.requester_id === currentUserId ? fr.addressee_id : fr.requester_id;
              const name = fr.requester_id === currentUserId ? fr.addressee_display_name : fr.requester_display_name;
              const q = pickerQuery.toLowerCase();
              const theirKids = friendKids.filter(k => k.userId === uid && !selectedFriendKidIds.includes(k.id) && (!q || k.name.toLowerCase().includes(q) || name.toLowerCase().includes(q)));
              return theirKids.length > 0 ? (
                <div key={fr.id} style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px', fontWeight: 600 }}>{name}</p>
                  {theirKids.map(k => (
                    <div key={k.id}
                      onClick={() => { setSelectedFriendKidIds(prev => [...prev, k.id]); setShowFriendPicker(false); setPickerQuery(''); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                    >
                      <KidThumb kid={k} size={30} />
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{k.name}</p>
                    </div>
                  ))}
                </div>
              ) : null;
            })}
            {friends.every(fr => friendKids.filter(k => k.userId === (fr.requester_id === currentUserId ? fr.addressee_id : fr.requester_id) && (!pickerQuery || k.name.toLowerCase().includes(pickerQuery.toLowerCase()))).length === 0) && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', margin: '16px 0 0' }}>{pickerQuery ? 'No matches found.' : "Your friends haven't shared any moments yet."}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CompareScreen;
