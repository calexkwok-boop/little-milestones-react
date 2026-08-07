import { useState, useEffect, useRef } from 'react';
import { Icon } from '../icons';
import { KID_ACCENTS, ASSET_BASE } from '../constants.js';
import usePushNotifications from '../usePushNotifications.js';
import AvatarCropModal from '../AvatarCropModal.jsx';

const ONBOARDING_LETTER = "Patina is the beauty that comes with age. These letters capture the mark you left on the quiet, seemingly unremarkable days that turned out to matter most. Writing them is our quiet, perilous attempt to slow down time. A gift for you to one day hold, and an anchor for us to inhabit today.";

function OnboardingScreen({ onDone, onJoinFamily, onSignOut, hasBackend, onGenerateInvite, onFinish, currentUserId }) {
  const notif = usePushNotifications(currentUserId);
  const [step, setStep] = useState('welcome');
  const [doneKids, setDoneKids] = useState([]);
  const [name, setName] = useState('');
  const [bdMonth, setBdMonth] = useState('');
  const [bdDay, setBdDay] = useState('');
  const [bdYear, setBdYear] = useState('');
  const birthdate = (bdMonth && bdDay && bdYear && bdYear.length === 4)
    ? `${bdYear}-${bdMonth}-${bdDay.padStart(2, '0')}`
    : '';
  const [avatar, setAvatar] = useState(null);
  const [cropSrc, setCropSrc] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [realName, setRealName] = useState('');
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [profilePhotoBlob, setProfilePhotoBlob] = useState(null);
  const [profileCropSrc, setProfileCropSrc] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [inviteCode, setInviteCode] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const fileInputRef = useRef(null);
  const profilePhotoInputRef = useRef(null);

  const [typed, setTyped] = useState(0);
  const [letterDone, setLetterDone] = useState(false);

  useEffect(() => {
    if (letterDone || typed >= ONBOARDING_LETTER.length) { setLetterDone(true); return; }
    const t = setTimeout(() => setTyped(p => p + 1), 28);
    return () => clearTimeout(t);
  }, [typed, letterDone]);

  const kidIndex = doneKids.length;
  const accent = KID_ACCENTS[kidIndex % KID_ACCENTS.length];
  const initial = name.trim() ? name.trim()[0].toUpperCase() : null;

  function goBack() {
    if (step === 'name') setStep('welcome');
    else if (step === 'birthdate') setStep('name');
    else if (step === 'photo') setStep('birthdate');
    else if (step === 'another') setStep('photo');
    else if (step === 'profile') setStep('another');
  }

  // Skip the notifications step entirely on a browser that can't support it at all —
  // no point showing a screen whose only button would be a no-op.
  function goToNotificationsOrFinish() {
    if (notif.status === 'unsupported') onFinish();
    else setStep('notifications');
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setCropSrc(URL.createObjectURL(file));
    e.target.value = '';
  }

  function handleAnother() {
    setDoneKids(prev => [...prev, {
      id: kidIndex, name: name.trim(),
      accent: KID_ACCENTS[kidIndex % KID_ACCENTS.length],
      birthdate, avatar,
    }]);
    setName(''); setBdMonth(''); setBdDay(''); setBdYear(''); setAvatar(null);
    setStep('name');
  }

  function handleFinish() {
    setSaveError('');
    setDoneKids(prev => [...prev, {
      id: kidIndex, name: name.trim(),
      accent: KID_ACCENTS[kidIndex % KID_ACCENTS.length],
      birthdate, avatar,
    }]);
    setStep('profile');
  }

  async function handleReallyDone() {
    setSavingProfile(true);
    setSaveError('');
    try {
      const result = await onDone(doneKids, displayName.trim() || 'Parent', realName.trim(), profilePhotoBlob);
      if (result?.error) {
        setSaveError(result.error);
      } else if (hasBackend) {
        setStep('invite-partner');
        setInviteLoading(true);
        try {
          const code = await onGenerateInvite?.(result.familyId);
          setInviteCode(code);
        } finally {
          setInviteLoading(false);
        }
      }
    } catch (e) {
      setSaveError('Something went wrong. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <div className="screen" data-theme="light">
      <div className="scroll-area">
        <div style={{ padding: '60px 28px 48px', display: 'flex', flexDirection: 'column', minHeight: 560 }}>

          {step !== 'welcome' && step !== 'invite-partner' && step !== 'notifications' && (
            <button onClick={goBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 24px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, fontFamily: "'Urbanist', sans-serif", alignSelf: 'flex-start' }}>
              <Icon name="ti-arrow-left" style={{ fontSize: 16 }} /> Back
            </button>
          )}

          {step !== 'welcome' && (() => {
            const DOT_STEPS = ['name', 'birthdate', 'photo', 'profile', 'invite-partner', 'notifications'];
            const activeIdx = step === 'another' ? 2 : DOT_STEPS.indexOf(step);
            if (activeIdx < 0) return null;
            return (
              <div style={{ display: 'flex', gap: 6, marginBottom: 20, alignSelf: 'center' }}>
                {DOT_STEPS.map((_, i) => (
                  <div key={i} style={{ width: i === activeIdx ? 20 : 6, height: 6, borderRadius: 3, background: i <= activeIdx ? 'var(--accent)' : 'var(--border)', transition: 'width 0.2s, background 0.2s' }} />
                ))}
              </div>
            );
          })()}

          {step !== 'welcome' && step !== 'invite-partner' && step !== 'notifications' && (() => {
            const kidFirstNames = [
              ...doneKids.map(k => k.name.split(' ')[0]),
              ...(step !== 'profile' && name.trim() ? [name.trim().split(' ')[0]] : []),
            ];
            const salutation = kidFirstNames.length > 0 ? kidFirstNames.join(' & ') : null;
            return (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px 12px', marginBottom: 16 }}>
                <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 11, color: 'var(--text-muted)', margin: '0 0 6px' }}>
                  Dear {salutation
                    ? <span style={{ color: 'var(--text)' }}>{salutation},</span>
                    : '___,'}
                </p>
                <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 12, color: 'var(--text)', lineHeight: 1.65, margin: '0 0 8px' }}>
                  {ONBOARDING_LETTER}
                </p>
                <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                  Love, {displayName.trim()
                    ? <span style={{ color: 'var(--text)' }}>{displayName.trim()}</span>
                    : '___'}
                </p>
              </div>
            );
          })()}

          {step === 'welcome' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <img src={`${ASSET_BASE}icon-192.png`} style={{ width: 64, height: 64, borderRadius: 14, display: 'block', marginBottom: 20 }} alt="" />
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, color: '#C8993E', margin: '0 0 8px', lineHeight: 1.1 }}>Patina</h1>
              <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 15, color: 'var(--text-3)', lineHeight: 1.8, margin: '0 0 32px', textAlign: 'center' }}>
                For all the things you wish they knew
               </p>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '22px 22px 18px', width: '100%', marginBottom: 32, textAlign: 'left' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                    {[{ initial: 'E', color: KID_ACCENTS[0] }, { initial: 'M', color: KID_ACCENTS[1] }].map((k, i) => (
                      <div key={i} style={{ width: 42, height: 42, borderRadius: '50%', background: k.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: i > 0 ? -12 : 0, border: '3px solid var(--bg-card)', flexShrink: 0 }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{k.initial}</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Dear Ellie &amp; Miles,</p>
                </div>
                <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 15, color: 'var(--text)', lineHeight: 1.75, margin: '0 0 14px', minHeight: 120 }}>
                  {ONBOARDING_LETTER.slice(0, typed)}
                  {!letterDone && <span style={{ display: 'inline-block', width: 2, height: 15, background: 'var(--accent)', marginLeft: 1, verticalAlign: 'middle', animation: 'blink-cursor 0.8s step-end infinite' }} />}
                </p>
                <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Love, your family</p>
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setStep('name')}>
                Begin
              </button>
              {onJoinFamily && (
                <button onClick={onJoinFamily} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif", fontWeight: 500, marginTop: 18, textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>
                  Have an invite code?
                </button>
              )}
              {onSignOut && (
                <button onClick={onSignOut} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--border-light)', fontFamily: "'Urbanist', sans-serif", fontWeight: 500, marginTop: 14 }}>
                  Sign out
                </button>
              )}
            </div>
          )}

          {step === 'name' && (
            <div style={{ flex: 1 }}>
              {doneKids.length > 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
                  {doneKids.map(k => k.name).join(' & ')} {doneKids.length === 1 ? 'is' : 'are'} added. One more?
                </p>
              )}
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: 'var(--text)', lineHeight: 1.25, margin: '0 0 10px' }}>
                What's your<br />child's name?
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 28px' }}>Add one at a time — you can add more after.</p>
              <input
                className="input-field"
                placeholder="Name"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { e.target.blur(); setStep('birthdate'); } }}
                autoFocus
                style={{ fontSize: 20, padding: '16px 18px', marginBottom: 24 }}
              />
              <button
                className="btn btn-primary"
                style={{ width: '100%', opacity: name.trim() ? 1 : 0.4 }}
                disabled={!name.trim()}
                onClick={() => { document.activeElement?.blur?.(); setStep('birthdate'); }}
              >
                Continue
              </button>
            </div>
          )}

          {step === 'birthdate' && (
            <div style={{ flex: 1 }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: 'var(--text)', lineHeight: 1.25, margin: '0 0 36px' }}>
                When was<br />{name} born?
              </h2>
              <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
                <div style={{ position: 'relative', flex: 2.2 }}>
                  <select
                    value={bdMonth}
                    onChange={e => setBdMonth(e.target.value)}
                    style={{
                      width: '100%', border: '1px solid var(--border)', borderRadius: 10,
                      padding: '15px 36px 15px 16px', fontSize: 16, outline: 'none',
                      background: 'var(--bg-input)', color: bdMonth ? 'var(--text)' : 'var(--text-muted)',
                      fontFamily: "'Urbanist', sans-serif", appearance: 'none',
                      WebkitAppearance: 'none', cursor: 'pointer',
                    }}
                  >
                    <option value="" disabled>Month</option>
                    {['January','February','March','April','May','June',
                      'July','August','September','October','November','December'].map((m, i) => (
                      <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                    ))}
                  </select>
                  <Icon name="ti-chevron-down" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13, pointerEvents: 'none' }} />
                </div>
                <input
                  type="number"
                  placeholder="Day"
                  value={bdDay}
                  min={1} max={31}
                  onChange={e => setBdDay(e.target.value)}
                  style={{
                    flex: 1, border: '1px solid var(--border)', borderRadius: 10,
                    padding: '15px 10px', fontSize: 16, outline: 'none',
                    background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'Urbanist', sans-serif",
                    textAlign: 'center', MozAppearance: 'textfield',
                  }}
                />
                <input
                  type="number"
                  placeholder="Year"
                  value={bdYear}
                  min={1900} max={2030}
                  onChange={e => setBdYear(e.target.value)}
                  style={{
                    flex: 1.5, border: '1px solid var(--border)', borderRadius: 10,
                    padding: '15px 10px', fontSize: 16, outline: 'none',
                    background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'Urbanist', sans-serif",
                    textAlign: 'center', MozAppearance: 'textfield',
                  }}
                />
              </div>
              <button
                className="btn btn-primary"
                style={{ width: '100%', opacity: birthdate ? 1 : 0.4 }}
                disabled={!birthdate}
                onClick={() => setStep('photo')}
              >
                Continue
              </button>
            </div>
          )}

          {step === 'photo' && (
            <div style={{ flex: 1, textAlign: 'center' }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: 'var(--text)', lineHeight: 1.25, margin: '0 0 8px' }}>
                Add a photo<br />of {name}?
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 40 }}>You can always add one later.</p>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 128, height: 128, borderRadius: '50%', margin: '0 auto 44px',
                  background: avatar ? 'transparent' : accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', overflow: 'hidden',
                  border: avatar ? '3px solid #ECE5D6' : '3px dashed rgba(255,255,255,0.45)',
                }}
              >
                {avatar
                  ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                  : initial
                    ? <span style={{ fontSize: 48, fontWeight: 700, color: '#fff', fontFamily: "'Urbanist', sans-serif" }}>{initial}</span>
                    : <Icon name="ti-camera" style={{ fontSize: 32, color: 'rgba(255,255,255,0.7)' }} />
                }
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setStep('another')}>
                {avatar ? 'Looks good' : 'Skip for now'}
              </button>
            </div>
          )}

          {step === 'another' && (
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ marginBottom: 44 }}>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%', margin: '0 auto 14px',
                  background: avatar ? 'transparent' : accent,
                  overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: avatar ? '2px solid #ECE5D6' : 'none',
                }}>
                  {avatar
                    ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                    : <span style={{ fontSize: 32, fontWeight: 700, color: '#fff', fontFamily: "'Urbanist', sans-serif" }}>{initial}</span>
                  }
                </div>
                <p style={{ fontSize: 15, color: 'var(--text-3)', fontFamily: "'Source Serif 4', serif", fontStyle: 'italic' }}>{name} is all set.</p>
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: 'var(--text)', lineHeight: 1.25, margin: '0 0 32px' }}>
                Do you have<br />another child?
              </h2>
              {kidIndex < 3 && (
                <button className="btn btn-outline" style={{ width: '100%', marginBottom: 12 }} onClick={handleAnother}>
                  Yes, add another
                </button>
              )}
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleFinish}>
                Continue
              </button>
            </div>
          )}

          {step === 'invite-partner' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Icon name="ti-users" style={{ fontSize: 28, color: 'var(--accent)' }} />
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: 'var(--text)', lineHeight: 1.25, margin: '0 0 10px' }}>
                Invite your<br />partner?
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 36px', lineHeight: 1.65 }}>
                Share this code so they can join<br />your family journal on their device.
              </p>
              {inviteLoading ? (
                <div style={{ padding: '32px 0', color: 'var(--text-muted)', fontSize: 14 }}>Generating code…</div>
              ) : inviteCode ? (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '22px 24px', width: '100%', marginBottom: 28 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1.5, margin: '0 0 10px', textTransform: 'uppercase' }}>Invite code</p>
                  <p style={{ fontSize: 36, fontWeight: 700, color: 'var(--accent)', letterSpacing: 8, margin: '0 0 16px', fontFamily: "'Urbanist', sans-serif" }}>{inviteCode}</p>
                  <button
                    onClick={() => { navigator.clipboard?.writeText(inviteCode); setInviteCopied(true); setTimeout(() => setInviteCopied(false), 2000); }}
                    style={{ background: 'var(--bg-elevated)', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--accent)', fontFamily: "'Urbanist', sans-serif", padding: '10px 20px', borderRadius: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Icon name={inviteCopied ? 'ti-check' : 'ti-copy'} style={{ fontSize: 14 }} />
                    {inviteCopied ? 'Copied!' : 'Copy code'}
                  </button>
                </div>
              ) : (
                <div style={{ padding: '20px 0 28px', color: 'var(--text-muted)', fontSize: 13 }}>Could not generate a code. You can invite from the Family screen later.</div>
              )}
              <button
                className="btn btn-primary"
                style={{ width: '100%', marginBottom: 14 }}
                onClick={goToNotificationsOrFinish}
              >
                {inviteCode ? 'Start writing' : 'Go to journal'}
              </button>
              {inviteCode && (
                <button
                  onClick={goToNotificationsOrFinish}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif", fontWeight: 500, textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}
                >
                  I'll share later
                </button>
              )}
            </div>
          )}

          {step === 'notifications' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                <Icon name="ti-bell" style={{ fontSize: 26, color: 'var(--accent)' }} />
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 27, color: 'var(--text)', lineHeight: 1.22, margin: '0 0 9px' }}>
                Don't miss<br />a moment
              </h2>
              <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '0 0 32px', lineHeight: 1.6, maxWidth: 260 }}>
                Get a nudge for birthdays, friend activity, and letters from your partner.
              </p>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', width: '100%', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 30, textAlign: 'left' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#C8993E', flexShrink: 0 }} />
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text)', lineHeight: 1.4 }}>
                  <strong>Patina</strong> — Alex liked your letter to Piper
                </p>
              </div>
              <div style={{ flex: 1 }} />
              <button
                className="btn btn-primary"
                style={{ width: '100%', marginBottom: 14 }}
                disabled={notif.busy}
                onClick={async () => { await notif.enable(); onFinish(); }}
              >
                {notif.busy ? 'Enabling…' : 'Enable notifications'}
              </button>
              <button
                onClick={onFinish}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif", fontWeight: 500, textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}
              >
                Not now
              </button>
            </div>
          )}

          {step === 'profile' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: 'var(--text)', lineHeight: 1.25, margin: '0 0 28px' }}>
                Almost there —<br />about you.
              </h2>
              <input ref={profilePhotoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) { setProfileCropSrc(URL.createObjectURL(f)); } e.target.value = ''; }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 28 }}>
                <div
                  className="avatar-upload-zone"
                  style={{ width: 88, height: 88, border: profilePhoto ? 'none' : undefined }}
                  onClick={() => profilePhotoInputRef.current?.click()}
                >
                  {profilePhoto
                    ? <img src={profilePhoto} alt="You" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                    : <Icon name="ti-camera" style={{ fontSize: 24 }} />
                  }
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                  {profilePhoto ? 'Tap to change photo' : 'Add your photo (optional)'}
                </p>
              </div>
              <input
                className="input-field"
                placeholder="What the kids call you — Mom, Dad, Mama…"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                autoFocus
                style={{ fontSize: 16, padding: '15px 18px', marginBottom: 10 }}
              />
              <input
                className="input-field"
                placeholder="Your name, for friends to find you"
                value={realName}
                onChange={e => setRealName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleReallyDone()}
                style={{ fontSize: 16, padding: '15px 18px', marginBottom: 24 }}
              />
              {saveError && (
                <p style={{ fontSize: 13, color: 'var(--coral)', margin: '0 0 12px', textAlign: 'center', lineHeight: 1.5 }}>{saveError}</p>
              )}
              <button className="btn btn-primary" style={{ width: '100%', opacity: savingProfile ? 0.6 : 1 }} onClick={handleReallyDone} disabled={savingProfile}>
                {savingProfile ? 'Saving…' : 'Continue'}
              </button>
            </div>
          )}

        </div>
      </div>

      {cropSrc && (
        <AvatarCropModal
          imageSrc={cropSrc}
          onConfirm={blob => { setAvatar(URL.createObjectURL(blob)); setCropSrc(null); }}
          onCancel={() => setCropSrc(null)}
        />
      )}
      {profileCropSrc && (
        <AvatarCropModal
          imageSrc={profileCropSrc}
          onConfirm={blob => { setProfilePhoto(URL.createObjectURL(blob)); setProfilePhotoBlob(blob); setProfileCropSrc(null); }}
          onCancel={() => setProfileCropSrc(null)}
        />
      )}
    </div>
  );
}

export default OnboardingScreen;
