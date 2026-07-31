import { useState, useEffect, useRef, useMemo } from 'react';
import { Icon } from '../icons';
import { supabase } from '../supabase.js';
import { useSession, useNotif } from '../contexts.js';
import KidThumb from '../KidThumb.jsx';
import SectionSwitcher from '../SectionSwitcher.jsx';
import FriendAvatar from '../FriendAvatar.jsx';
import usePullToRefresh from '../usePullToRefresh.jsx';
import triggerPush from '../triggerPush.js';
import {
  PROMPT_ACCENT, AVATAR_TRANSFORM_SM, AVATAR_TRANSFORM_LG, VIDEO_DELIVERY_TRANSFORM,
  cloudinaryTransform, sameAgeSides, sameAgeDaysApart, videoThumbUrl, exactAgeLabel,
  PHOTO_MD, PHOTO_LG, PHOTO_SQUARE,
} from '../constants.js';

function CircleFeedScreen({ onBack, friendKids = [], friendFamilyMap = {}, onCompareAtAge, onSwitchSection, friends = [], familyMemberIds = [], onSearchUsers, onSendRequest }) {
  const { userId: currentUserId, myDisplayName, familyMembers = [] } = useSession() ?? {};
  const { pendingRequestCount = 0, circleBadge = 0, friendRequests = [] } = useNotif() ?? {};
  const socialName = familyMembers.find(m => m.user_id === currentUserId)?.real_name || myDisplayName || '';
  const [loading, setLoading] = useState(true);
  const [feedEntries, setFeedEntries] = useState([]);
  const [likesMap, setLikesMap] = useState({});   // entryId -> [{id, user_id, display_name}]
  const [commentsMap, setCommentsMap] = useState({}); // entryId -> [{id, user_id, display_name, body, created_at}]
  const [commentDrafts, setCommentDrafts] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  // Searching here filters posts already shared with you, which misses anyone
  // you haven't friended yet — so the same query also checks discoverable
  // users, same as the Activity tab's search, instead of making people switch
  // tabs just to find and add someone.
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [userSearching, setUserSearching] = useState(false);
  const [sentIds, setSentIds] = useState(new Set());
  const userSearchTimer = useRef(null);
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef(null);
  const [profileFamilyId, setProfileFamilyId] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [likeAnimId, setLikeAnimId] = useState(null);
  const [activeVideoId, setActiveVideoId] = useState(null); // whichever video tile is currently scrolled far enough into view to autoplay
  const [unmutedId, setUnmutedId] = useState(null); // which video (if any) has been tapped to unmute — cleared whenever the active one changes
  const [pausedVideoId, setPausedVideoId] = useState(null); // the active video, if it's been tapped to pause — cleared whenever the active one changes
  const [zoomedPhoto, setZoomedPhoto] = useState(null); // { url, type }
  const lastTapRef = useRef({});
  const tapTimerRef = useRef({});
  const mediaRefs = useRef({});
  const videoRefs = useRef({}); // same keys as mediaRefs, but video tiles only
  const videoElRefs = useRef({}); // same keys, but the actual <video> node — for imperative play()/pause()
  const visibleRatios = useRef({}); // key -> latest intersection ratio, video tiles only

  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

  const familyIds = useMemo(() => Object.keys(friendFamilyMap), [friendFamilyMap]);
  const scrollRef = useRef(null);

  async function loadFeed() {
    if (!supabase || familyIds.length === 0) return;
    const { data: entriesData } = await supabase
      .from('entries')
      .select('id, date, created_at, kid_ids, mood, milestone, age_months, family_id, user_id, same_age_dates, entry_media!inner(url, type, kid_id)')
      .in('family_id', familyIds)
      .neq('shared', false)
      .order('created_at', { ascending: false })
      .limit(200);

    const normalized = (entriesData || []).map(e => ({
      id: e.id,
      date: e.date,
      createdAt: e.created_at,
      kids: e.kid_ids || [],
      milestone: e.milestone || null,
      ageMonths: e.age_months,
      familyId: e.family_id,
      userId: e.user_id,
      sameAgeDates: e.same_age_dates || null,
      media: (e.entry_media || []).map(m => ({ url: m.url, type: m.type, kidId: m.kid_id || null })),
    }));

    setFeedEntries(normalized);

    if (normalized.length > 0) {
      const ids = normalized.map(e => e.id);
      const [{ data: likes }, { data: comments }] = await Promise.all([
        supabase.from('entry_likes').select('id, entry_id, user_id, display_name').in('entry_id', ids),
        supabase.from('entry_comments').select('id, entry_id, user_id, display_name, body, created_at').in('entry_id', ids).is('parent_id', null).order('created_at'),
      ]);
      const lMap = {};
      (likes || []).forEach(l => {
        if (!lMap[l.entry_id]) lMap[l.entry_id] = [];
        lMap[l.entry_id].push(l);
      });
      const cMap = {};
      (comments || []).forEach(c => {
        if (!cMap[c.entry_id]) cMap[c.entry_id] = [];
        cMap[c.entry_id].push(c);
      });
      setLikesMap(lMap);
      setCommentsMap(cMap);
    }
  }

  useEffect(() => {
    if (!supabase || familyIds.length === 0) { setLoading(false); return; }
    loadFeed().finally(() => setLoading(false));
  }, [familyIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const ptr = usePullToRefresh(scrollRef, loadFeed);

  async function handleToggleLike(entryId) {
    if (!supabase || !currentUserId) return;
    const existing = (likesMap[entryId] || []).find(l => l.user_id === currentUserId);
    if (existing) {
      setLikesMap(prev => ({ ...prev, [entryId]: prev[entryId].filter(l => l.id !== existing.id) }));
      await supabase.from('entry_likes').delete().eq('id', existing.id).eq('user_id', currentUserId);
    } else {
      const temp = { id: 'tmp-' + Date.now(), entry_id: entryId, user_id: currentUserId, display_name: socialName };
      setLikesMap(prev => ({ ...prev, [entryId]: [...(prev[entryId] || []), temp] }));
      setLikeAnimId(entryId);
      setTimeout(() => setLikeAnimId(id => id === entryId ? null : id), 800);
      const { data } = await supabase.from('entry_likes').insert({ entry_id: entryId, user_id: currentUserId, display_name: socialName }).select('id, entry_id, user_id, display_name').single();
      if (data) setLikesMap(prev => ({ ...prev, [entryId]: (prev[entryId] || []).map(l => l.id === temp.id ? data : l) }));
      const owner = feedEntries.find(e => e.id === entryId)?.userId;
      if (owner) triggerPush({ targetUserId: owner, kind: 'like', entryId, fromName: socialName });
    }
  }

  async function handleSubmitComment(entryId) {
    const body = (commentDrafts[entryId] || '').trim();
    if (!body || !supabase || !currentUserId) return;
    setCommentDrafts(prev => ({ ...prev, [entryId]: '' }));
    const temp = { id: 'tmp-' + Date.now(), entry_id: entryId, user_id: currentUserId, display_name: socialName, body, created_at: new Date().toISOString() };
    setCommentsMap(prev => ({ ...prev, [entryId]: [...(prev[entryId] || []), temp] }));
    const { data } = await supabase.from('entry_comments').insert({ entry_id: entryId, user_id: currentUserId, display_name: socialName, body }).select('id, entry_id, user_id, display_name, body, created_at').single();
    if (data) setCommentsMap(prev => ({ ...prev, [entryId]: (prev[entryId] || []).map(c => c.id === temp.id ? data : c) }));
    const owner = feedEntries.find(e => e.id === entryId)?.userId;
    if (owner) triggerPush({ targetUserId: owner, kind: 'comment', entryId, fromName: socialName, commentPreview: body });
  }

  async function handleDeleteComment(entryId, commentId) {
    if (!supabase || !currentUserId) return;
    setCommentsMap(prev => ({ ...prev, [entryId]: (prev[entryId] || []).filter(c => c.id !== commentId) }));
    await supabase.from('entry_comments').delete().eq('id', commentId).eq('user_id', currentUserId);
  }

  function friendUserId(fr) {
    return fr.requester_id === currentUserId ? fr.addressee_id : fr.requester_id;
  }

  function handleSearchQueryChange(val) {
    setSearchQuery(val);
    clearTimeout(userSearchTimer.current);
    if (!val.trim() || !onSearchUsers) { setUserSearchResults([]); return; }
    userSearchTimer.current = setTimeout(async () => {
      setUserSearching(true);
      const results = await onSearchUsers(val);
      setUserSearchResults(results || []);
      setUserSearching(false);
    }, 300);
  }

  const displayedEntries = useMemo(() => {
    let pool = profileFamilyId
      ? feedEntries.filter(e => e.familyId === profileFamilyId)
      : feedEntries;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      pool = pool.filter(e => {
        const entryKids = friendKids.filter(k => e.kids.includes(k.id));
        const friendInfo = friendFamilyMap[e.familyId] || {};
        return (friendInfo.name || '').toLowerCase().includes(q)
          || entryKids.some(k => k.name.toLowerCase().includes(q));
      });
    }
    return pool;
  }, [feedEntries, searchQuery, profileFamilyId, friendKids, friendFamilyMap]);

  // Autoplay whichever video tile is most visible as you scroll (muted, since
  // browsers block unmuted autoplay without a direct user gesture) — tapping
  // a video unmutes it; scrolling to a different one resets that back to muted.
  // Re-observes whenever the rendered list changes, since new video tiles
  // (and their refs) only exist after that render.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const key = entry.target.dataset.videoKey;
        if (key) visibleRatios.current[key] = entry.isIntersecting ? entry.intersectionRatio : 0;
      });
      let bestKey = null, bestRatio = 0.6;
      for (const [key, ratio] of Object.entries(visibleRatios.current)) {
        if (ratio > bestRatio) { bestRatio = ratio; bestKey = key; }
      }
      setActiveVideoId(prev => {
        if (bestKey === prev) return prev;
        setUnmutedId(null);
        setPausedVideoId(null);
        return bestKey;
      });
    }, { threshold: [0, 0.25, 0.5, 0.6, 0.75, 1] });
    Object.values(videoRefs.current).forEach(el => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [displayedEntries]);

  const profileInfo = profileFamilyId ? friendFamilyMap[profileFamilyId] : null;

  function renderPost(entry) {
    const entryKids = friendKids.filter(k => entry.kids.includes(k.id));
    const sides = sameAgeSides(entry, friendKids);
    const friendInfo = friendFamilyMap[entry.familyId] || {};
    const likes = likesMap[entry.id] || [];
    const comments = commentsMap[entry.id] || [];
    const iLiked = likes.some(l => l.user_id === currentUserId);
    const entryDate = new Date(entry.createdAt || (entry.date + 'T12:00:00'));
    const daysAgo = Math.round((Date.now() - entryDate.getTime()) / 86400000);
    const dateLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`;
    const photoDate = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const likeLabel = likes.length === 0
      ? null
      : likes.length >= 3
        ? `${likes.length} people loved this`
        : `${likes.map(l => l.display_name?.split(' ')[0] || 'Someone').join(' & ')} loved this`;

    return (
      <div key={entry.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(44,56,40,0.08)' }}>
        {/* Poster row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px 8px' }}>
          <span className="thumb" style={{ width: 42, height: 42, fontSize: 15, flexShrink: 0 }}>
            {friendInfo.avatar
              ? <img src={cloudinaryTransform(friendInfo.avatar, AVATAR_TRANSFORM_SM)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" loading="lazy" />
              : (friendInfo.name || '?')[0]}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <button
              onClick={() => !profileFamilyId && setProfileFamilyId(entry.familyId)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: profileFamilyId ? 'default' : 'pointer', fontFamily: "'Urbanist', sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--text)', display: 'block', textAlign: 'left' }}
            >
              {friendInfo.name || 'Friend'}
            </button>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', marginTop: 1 }}>{dateLabel}</p>
          </div>
        </div>

        {/* Photo — a same-age post shows every kid's photo side by side (2) or as a
            scrollable strip (3+), instead of just the first kid's cover photo. */}
        {sides ? (
          <div style={{ margin: '0 14px', borderRadius: 16, overflow: 'hidden', position: 'relative' }}>
            <div style={{ display: 'flex', gap: 2, overflowX: sides.length > 2 ? 'auto' : 'hidden' }}>
              {sides.map((side, i) => {
                const photo = side.photo;
                const isVideo = photo?.type === 'video';
                const videoKey = `${entry.id}:${i}`;
                const isActive = isVideo && activeVideoId === videoKey;
                const isUnmuted = isActive && unmutedId === videoKey;
                const isPaused = isActive && pausedVideoId === videoKey;
                return (
                  <div
                    key={i}
                    ref={el => {
                      mediaRefs.current[videoKey] = el;
                      if (isVideo) videoRefs.current[videoKey] = el; else delete videoRefs.current[videoKey];
                    }}
                    data-video-key={isVideo ? videoKey : undefined}
                    onClick={() => {
                      if (isVideo) {
                        const now = Date.now();
                        const wasDoubleTap = now - (lastTapRef.current[entry.id] || 0) < 320;
                        lastTapRef.current[entry.id] = now;
                        if (wasDoubleTap) {
                          if (tapTimerRef.current[entry.id]) { clearTimeout(tapTimerRef.current[entry.id]); delete tapTimerRef.current[entry.id]; }
                          if (!iLiked) handleToggleLike(entry.id);
                          setLikeAnimId(entry.id);
                          setTimeout(() => setLikeAnimId(id => id === entry.id ? null : id), 800);
                          return;
                        }
                        tapTimerRef.current[entry.id] = setTimeout(() => {
                          delete tapTimerRef.current[entry.id];
                          if (activeVideoId === videoKey) {
                            const el = videoElRefs.current[videoKey];
                            if (pausedVideoId === videoKey) { if (el?.ended) el.currentTime = 0; el?.play(); setPausedVideoId(null); }
                            else { el?.pause(); setPausedVideoId(videoKey); }
                          } else {
                            setActiveVideoId(videoKey); setUnmutedId(videoKey); setPausedVideoId(null);
                          }
                        }, 320);
                        return;
                      }
                      const now = Date.now();
                      const wasDoubleTap = now - (lastTapRef.current[entry.id] || 0) < 320;
                      lastTapRef.current[entry.id] = now;
                      if (wasDoubleTap) {
                        if (tapTimerRef.current[entry.id]) { clearTimeout(tapTimerRef.current[entry.id]); delete tapTimerRef.current[entry.id]; }
                        if (!iLiked) handleToggleLike(entry.id);
                        setLikeAnimId(entry.id);
                        setTimeout(() => setLikeAnimId(id => id === entry.id ? null : id), 800);
                        return;
                      }
                      if (photo) {
                        tapTimerRef.current[entry.id] = setTimeout(() => { setZoomedPhoto(photo); delete tapTimerRef.current[entry.id]; }, 320);
                      }
                    }}
                    style={{ flex: sides.length > 2 ? '0 0 70%' : 1, aspectRatio: '4/5', background: 'var(--border)', position: 'relative', cursor: 'pointer' }}
                  >
                    {photo && (isVideo ? (
                      <>
                        {isActive ? (
                          <video ref={el => { videoElRefs.current[videoKey] = el; }} src={cloudinaryTransform(photo.url, VIDEO_DELIVERY_TRANSFORM)} autoPlay muted={!isUnmuted} playsInline onEnded={() => setPausedVideoId(videoKey)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <img src={videoThumbUrl(photo.url, `so_0,${PHOTO_MD}`)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" loading="lazy" />
                        )}
                        <div style={{ position: 'absolute', bottom: 8, right: 8, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name={isUnmuted ? 'ti-volume' : 'ti-volume-off'} style={{ fontSize: 11, color: '#fff' }} />
                        </div>
                        {isPaused && (
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Icon name="ti-player-play-filled" style={{ fontSize: 15, color: '#fff', marginLeft: 2 }} />
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <img src={cloudinaryTransform(photo.url, PHOTO_MD)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" loading="lazy" />
                    ))}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '22px 10px 8px', background: 'linear-gradient(transparent, rgba(0,0,0,0.6))' }}>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#fff' }}>{side.kid.name.split(' ')[0]}</p>
                      <p style={{ margin: 0, fontSize: 10.5, color: 'rgba(255,255,255,0.85)' }}>{exactAgeLabel(side.kid.birthdate, side.date)} old</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {likeAnimId === entry.id && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <Icon name="ti-heart-filled" style={{ fontSize: 90, color: '#fff', filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.35))', animation: 'likeHeartPop 0.8s ease forwards' }} />
              </div>
            )}
          </div>
        ) : entry.media.length > 0 && (() => {
          const isVideo = entry.media[0].type === 'video';
          const isActive = isVideo && activeVideoId === entry.id;
          const isUnmuted = isActive && unmutedId === entry.id;
          const isPaused = isActive && pausedVideoId === entry.id;
          return (
          <div
            ref={el => {
              mediaRefs.current[entry.id] = el;
              if (isVideo) videoRefs.current[entry.id] = el; else delete videoRefs.current[entry.id];
            }}
            data-video-key={isVideo ? entry.id : undefined}
            onClick={() => {
              if (isVideo) {
                const now = Date.now();
                const wasDoubleTap = now - (lastTapRef.current[entry.id] || 0) < 320;
                lastTapRef.current[entry.id] = now;
                if (wasDoubleTap) {
                  if (tapTimerRef.current[entry.id]) { clearTimeout(tapTimerRef.current[entry.id]); delete tapTimerRef.current[entry.id]; }
                  if (!iLiked) handleToggleLike(entry.id);
                  setLikeAnimId(entry.id);
                  setTimeout(() => setLikeAnimId(id => id === entry.id ? null : id), 800);
                  return;
                }
                tapTimerRef.current[entry.id] = setTimeout(() => {
                  delete tapTimerRef.current[entry.id];
                  if (activeVideoId === entry.id) {
                    const el = videoElRefs.current[entry.id];
                    if (pausedVideoId === entry.id) { if (el?.ended) el.currentTime = 0; el?.play(); setPausedVideoId(null); }
                    else { el?.pause(); setPausedVideoId(entry.id); }
                  } else {
                    setActiveVideoId(entry.id); setUnmutedId(entry.id); setPausedVideoId(null);
                  }
                }, 320);
                return;
              }
              const now = Date.now();
              const wasDoubleTap = now - (lastTapRef.current[entry.id] || 0) < 320;
              lastTapRef.current[entry.id] = now;
              if (wasDoubleTap) {
                if (tapTimerRef.current[entry.id]) { clearTimeout(tapTimerRef.current[entry.id]); delete tapTimerRef.current[entry.id]; }
                if (!iLiked) handleToggleLike(entry.id);
                setLikeAnimId(entry.id);
                setTimeout(() => setLikeAnimId(id => id === entry.id ? null : id), 800);
                return;
              }
              tapTimerRef.current[entry.id] = setTimeout(() => { setZoomedPhoto(entry.media[0]); delete tapTimerRef.current[entry.id]; }, 320);
            }}
            style={{ margin: '0 14px', borderRadius: 16, overflow: 'hidden', aspectRatio: '4/5', background: 'var(--border)', position: 'relative', cursor: 'pointer' }}
          >
            {isVideo ? (
              <>
                {isActive ? (
                  <video ref={el => { videoElRefs.current[entry.id] = el; }} src={cloudinaryTransform(entry.media[0].url, VIDEO_DELIVERY_TRANSFORM)} autoPlay muted={!isUnmuted} playsInline onEnded={() => setPausedVideoId(entry.id)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <img src={videoThumbUrl(entry.media[0].url, `so_0,${PHOTO_LG}`)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" loading="lazy" />
                )}
                <div style={{ position: 'absolute', bottom: 10, right: 10, width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={isUnmuted ? 'ti-volume' : 'ti-volume-off'} style={{ fontSize: 13, color: '#fff' }} />
                </div>
                {isPaused && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="ti-player-play-filled" style={{ fontSize: 20, color: '#fff', marginLeft: 2 }} />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <img src={cloudinaryTransform(entry.media[0].url, PHOTO_LG)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" loading="lazy" />
            )}
            {likeAnimId === entry.id && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <Icon name="ti-heart-filled" style={{ fontSize: 90, color: '#fff', filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.35))', animation: 'likeHeartPop 0.8s ease forwards' }} />
              </div>
            )}
          </div>
          );
        })()}

        {/* Kid caption, below the photo like a letter salutation — a same-age post
            already shows each kid's name/age on their own photo tile above, so this
            just adds the "same age" framing + how far apart they were. */}
        {sides ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px 0' }}>
            <Icon name="ti-arrows-diff" style={{ fontSize: 13, color: PROMPT_ACCENT }} />
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: PROMPT_ACCENT }}>
              At the same age · {(() => { const d = sameAgeDaysApart(sides); return d === 0 ? 'exact match' : `${d} day${d !== 1 ? 's' : ''} apart`; })()}
            </p>
          </div>
        ) : entryKids.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 16px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{ display: 'flex', flexShrink: 0 }}>
                {entryKids.map((k, i) => (
                  <span key={k.id} style={{ marginLeft: i > 0 ? -8 : 0, display: 'inline-block', width: 24, height: 24, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--bg-card)', background: k.accent || 'var(--bg-elevated)', flexShrink: 0 }}>
                    {k.avatar
                      ? <img src={cloudinaryTransform(k.avatar, AVATAR_TRANSFORM_SM)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" loading="lazy" />
                      : <span style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff' }}>{k.name[0]}</span>
                    }
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {entryKids.map(k => (
                  <p key={k.id} style={{ margin: 0, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 13, color: 'var(--text-2)' }}>
                    {k.name.split(' ')[0]}
                    {k.birthdate && ` · ${exactAgeLabel(k.birthdate, entry.date)} · ${photoDate}`}
                  </p>
                ))}
              </div>
            </div>
            {onCompareAtAge && entry.ageMonths != null && (
              <button
                onClick={() => onCompareAtAge(entryKids[0]?.id ?? null, entry.ageMonths, entry.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 10px 4px 4px', cursor: 'pointer', color: 'var(--accent)', fontSize: 11.5, fontWeight: 700, fontFamily: "'Urbanist', sans-serif", flexShrink: 0 }}
              >
                {entryKids[0] ? <KidThumb kid={entryKids[0]} size={18} /> : <Icon name="ti-arrows-diff" style={{ fontSize: 12 }} />} Same age
              </button>
            )}
          </div>
        )}

        {/* Love + notes, in words instead of icon counters */}
        <div style={{ padding: '8px 16px 2px' }}>
          <button
            onClick={() => handleToggleLike(entry.id)}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: iLiked ? 'var(--coral)' : 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif" }}
          >
            <Icon name={`ti-heart${iLiked ? '-filled' : ''}`} style={{ fontSize: 18 }} />
            {likeLabel && <span style={{ fontSize: 13, fontWeight: 600 }}>{likeLabel}</span>}
          </button>
        </div>

        {/* Notes */}
        {comments.length > 0 && (
          <div style={{ padding: '6px 16px 2px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {comments.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <p style={{ flex: 1, minWidth: 0, margin: 0, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
                  <span style={{ fontWeight: 700, fontStyle: 'normal', color: 'var(--text)' }}>{c.display_name || 'Someone'}</span>
                  {' — '}{c.body}
                </p>
                {c.user_id === currentUserId && (
                  <button onClick={() => handleDeleteComment(entry.id, c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 0', flexShrink: 0 }}>
                    <Icon name="ti-trash" style={{ fontSize: 12 }} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Note input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 16px 14px' }}>
          <input
            value={commentDrafts[entry.id] || ''}
            onChange={e => setCommentDrafts(prev => ({ ...prev, [entry.id]: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmitComment(entry.id); } }}
            placeholder="Leave a note…"
            style={{ flex: 1, border: 'none', padding: '2px 0', fontSize: 13, fontStyle: 'italic', fontFamily: "'Source Serif 4', serif", background: 'transparent', color: 'var(--text)', outline: 'none' }}
          />
          <button
            onClick={() => handleSubmitComment(entry.id)}
            disabled={!(commentDrafts[entry.id] || '').trim()}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: (commentDrafts[entry.id] || '').trim() ? 'var(--accent)' : 'var(--border)', fontSize: 18, display: 'flex', alignItems: 'center', padding: 0, flexShrink: 0 }}
          >
            <Icon name="ti-send" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="scroll-area" ref={scrollRef} style={{ overscrollBehaviorY: 'contain' }} {...ptr.handlers}>
        {ptr.indicator}
        {profileFamilyId ? (
          /* ── Profile grid view ── */
          <div>
            <div style={{ padding: '16px 16px 0', marginBottom: 16 }}>
              <button className="icon-btn" onClick={() => { setProfileFamilyId(null); setSelectedEntry(null); }}>
                <Icon name="ti-arrow-left" />
              </button>
            </div>

            {/* Profile header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 20px 20px' }}>
              {profileInfo?.avatar
                ? <img src={cloudinaryTransform(profileInfo.avatar, AVATAR_TRANSFORM_LG)} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} alt="" loading="lazy" />
                : <span style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {(profileInfo?.name || '?')[0]}
                  </span>
              }
              <div>
                <p style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--text)', fontFamily: "'Urbanist', sans-serif", letterSpacing: '-0.2px' }}>{profileInfo?.name || 'Friend'}</p>
                <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>{displayedEntries.length} {displayedEntries.length === 1 ? 'post' : 'posts'}</p>
              </div>
            </div>

            {/* Photo grid */}
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
                <Icon name="ti-loader-2" style={{ fontSize: 28, color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />
              </div>
            ) : displayedEntries.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, paddingTop: 40 }}>Nothing shared yet.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
                {displayedEntries.map(entry => {
                  const thumb = entry.media[0];
                  return (
                    <div key={entry.id} onClick={() => setSelectedEntry(entry)} style={{ aspectRatio: '1', background: 'var(--border)', cursor: 'pointer', overflow: 'hidden', position: 'relative' }}>
                      {thumb ? (
                        thumb.type === 'video'
                          ? <img src={videoThumbUrl(thumb.url, `so_0,${PHOTO_SQUARE}`)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" loading="lazy" />
                          : <img src={cloudinaryTransform(thumb.url, PHOTO_SQUARE)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" loading="lazy" />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="ti-letter" style={{ fontSize: 24, color: 'var(--text-muted)' }} />
                        </div>
                      )}
                      {entry.media.length > 1 && (
                        <Icon name="ti-copy" style={{ position: 'absolute', top: 6, right: 6, fontSize: 13, color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* ── Feed view ── */
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 0' }}>
              <button className="icon-btn" onClick={onBack}><Icon name="ti-arrow-left" /></button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 28, height: 1, background: 'rgba(200,153,62,0.4)', margin: '0 auto 5px' }} />
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>Friends</h2>
              </div>
              <button className="icon-btn" onClick={() => { if (showSearch) { setSearchQuery(''); setUserSearchResults([]); } setShowSearch(s => !s); }}>
                <Icon name={showSearch ? 'ti-x' : 'ti-search'} />
              </button>
            </div>
            <div style={{ padding: '10px 20px 18px' }}>
              <SectionSwitcher
                tabs={[{ id: 'circle-feed', label: 'Glimpse', icon: 'ti-eye' }, { id: 'friends', label: 'Activity', icon: 'ti-activity', badge: pendingRequestCount + circleBadge }]}
                active="circle-feed"
                onChange={onSwitchSection}
                fill
              />
            </div>

            {showSearch && (
              <div style={{ position: 'relative', margin: '0 16px 16px' }}>
                <Icon name="ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14, pointerEvents: 'none' }} />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={e => handleSearchQueryChange(e.target.value)}
                  placeholder="Search people…"
                  style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 36, paddingRight: 12, paddingTop: 10, paddingBottom: 10, border: '1px solid var(--border)', borderRadius: 12, fontSize: 14, background: 'var(--bg-input)', color: 'var(--text)', fontFamily: 'Inter, sans-serif', outline: 'none' }}
                />
              </div>
            )}

            {/* Same query also checks for people to add — not just filtering
                posts you already have shared with you — so finding and adding
                someone new doesn't require switching to the Activity tab. */}
            {showSearch && searchQuery && (
              <div style={{ margin: '0 16px 16px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>People</p>
                {userSearching ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
                    <Icon name="ti-loader-2" style={{ fontSize: 16, color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />
                  </div>
                ) : userSearchResults.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>No users found</p>
                ) : (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    {userSearchResults.map((user, idx) => {
                      const isFriend = friends.some(f => friendUserId(f) === user.id);
                      const isPending = friendRequests.some(r => r.requester_id === currentUserId && r.addressee_id === user.id) || sentIds.has(user.id);
                      const isFamily = familyMemberIds.includes(user.id);
                      return (
                        <div key={user.id} style={{ padding: '12px 16px', borderBottom: idx < userSearchResults.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <FriendAvatar name={user.display_name} avatarUrl={user.avatar_url} />
                            <p style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{user.display_name || 'User'}</p>
                            {isFamily ? (
                              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Family</span>
                            ) : isFriend ? (
                              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Friends</span>
                            ) : isPending ? (
                              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sent</span>
                            ) : (
                              <button
                                style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                                onClick={async () => {
                                  const { error } = await onSendRequest?.(user.id, user.display_name, user.avatar_url);
                                  if (!error) setSentIds(prev => new Set([...prev, user.id]));
                                }}
                              >
                                Add
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {searchQuery && (
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 16px 8px' }}>Posts</p>
            )}
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
                <Icon name="ti-loader-2" style={{ fontSize: 28, color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />
              </div>
            ) : displayedEntries.length === 0 ? (
              <div className="empty-state">
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <Icon name="ti-users" style={{ fontSize: 24, color: 'var(--text-muted)' }} />
                </div>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', margin: searchQuery && familyIds.length > 0 ? 0 : '0 0 6px' }}>
                  {familyIds.length === 0 ? 'No friends yet' : searchQuery ? `No posts match "${searchQuery}"` : 'Nothing shared yet'}
                </p>
                {!(searchQuery && familyIds.length > 0) && (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                    {familyIds.length === 0 ? 'Add friends to see the moments they share with you.' : "When friends share moments, they'll show up here."}
                  </p>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '0 16px 16px' }}>
                {displayedEntries.map(entry => renderPost(entry))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Entry detail modal (from profile grid tap) */}
      {selectedEntry && (() => {
        const entry = selectedEntry;
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end' }} onClick={() => setSelectedEntry(null)}>
            <div style={{ background: 'var(--bg)', borderRadius: '24px 24px 0 0', width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '12px auto 0' }} />
              {renderPost(entry)}
            </div>
          </div>
        );
      })()}

      {/* Single-photo lightbox — a plain tap on any photo (same-age tile or the
          normal cover photo) enlarges it; a second quick tap likes instead. */}
      {zoomedPhoto && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setZoomedPhoto(null)}>
          <button onClick={() => setZoomedPhoto(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: 14 }}>
            <Icon name="ti-x" />
          </button>
          <img
            src={cloudinaryTransform(zoomedPhoto.url, PHOTO_LG)}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        </div>
      )}
    </div>
  );
}

export default CircleFeedScreen;
