import { useState } from 'react';
import { Icon } from '../icons';

function JoinFamilyScreen({ onJoin, onBack }) {
  const [step, setStep] = useState('code');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleJoin() {
    if (!code.trim() || !displayName.trim()) return;
    setLoading(true);
    setError('');
    const result = await onJoin(code, displayName.trim());
    if (result?.cancelled) { setLoading(false); return; }
    if (result?.error) { setError(result.error); setLoading(false); }
  }

  const backFn = step === 'name' ? () => setStep('code') : onBack;

  return (
    <div className="screen">
      <div className="scroll-area">
        <div style={{ padding: '60px 28px 48px', display: 'flex', flexDirection: 'column', minHeight: 560, justifyContent: 'center' }}>
          <button onClick={backFn} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 36px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, fontFamily: "'Urbanist', sans-serif", alignSelf: 'flex-start' }}>
            <Icon name="ti-arrow-left" style={{ fontSize: 16 }} /> Back
          </button>

          {step === 'code' && (
            <>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: 'var(--text)', margin: '0 0 10px', lineHeight: 1.2 }}>
                Enter your<br />invite code
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.7, margin: '0 0 32px' }}>
                Ask your partner for the code from the Family screen.
              </p>
              <input
                className="input-field"
                placeholder="XK7P2M"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                style={{ fontSize: 28, letterSpacing: 6, textAlign: 'center', fontWeight: 700, marginBottom: 20 }}
                autoFocus
                autoCapitalize="characters"
                onKeyDown={e => { if (e.key === 'Enter' && code.trim().length >= 4) setStep('name'); }}
              />
              <button
                className="btn btn-primary"
                style={{ width: '100%', opacity: code.trim().length >= 4 ? 1 : 0.4 }}
                disabled={code.trim().length < 4}
                onClick={() => setStep('name')}
              >
                Continue
              </button>
            </>
          )}

          {step === 'name' && (
            <>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, color: 'var(--text)', margin: '0 0 10px', lineHeight: 1.2 }}>
                What do the<br />kids call you?
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.7, margin: '0 0 32px' }}>
                This is how you'll appear in the journal.
              </p>
              <input
                className="input-field"
                placeholder="Mom, Dad, Mama…"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                style={{ fontSize: 20, marginBottom: 20 }}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && displayName.trim()) handleJoin(); }}
              />
              {error && <p style={{ fontSize: 13, color: '#D4856A', marginBottom: 12, textAlign: 'center' }}>{error}</p>}
              <button
                className="btn btn-primary"
                style={{ width: '100%', opacity: displayName.trim() && !loading ? 1 : 0.4 }}
                disabled={!displayName.trim() || loading}
                onClick={handleJoin}
              >
                {loading ? 'Joining…' : 'Join family'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default JoinFamilyScreen;
