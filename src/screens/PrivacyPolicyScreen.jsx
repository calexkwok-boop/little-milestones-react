import { Icon } from '../icons';

function PrivacyPolicyScreen({ onBack }) {
  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <button className="icon-btn" onClick={onBack}><Icon name="ti-arrow-left" /></button>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>Privacy Policy</h2>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 20px' }}>Effective July 4, 2026</p>

          {[
            { title: 'Who We Are', body: 'Patina is a private family journaling app. Contact us at hello@patinafamily.com.' },
            { title: 'What We Collect', body: 'Account information (email, display name), family information (children\'s names, birthdates, photos), journal entries (text, photos, videos), and friend connections you choose to make. We do not use ad networks or behavioral tracking.' },
            { title: 'How We Use It', body: 'To provide the app, display your entries to your family, and send account-related emails (password resets, etc.). We do not sell your data or use it for advertising.' },
            { title: 'Sharing', body: 'We use Supabase for database and authentication, and Cloudinary for photo and video storage. We share your data with no one else. Within the app, your letter text is visible only to family members — friends see only photos and basic context.' },
            { title: 'Children\'s Information', body: 'Patina is for parents journaling about their children. Parents control all accounts. We do not knowingly collect information directly from children under 13. Contact hello@patinafamily.com if you believe a child has independently created an account.' },
            { title: 'Deletion', body: 'You can delete your account anytime from the Profile screen. This permanently removes your profile, entries, media, and family data. If others remain in your family, only your personal data is removed.' },
            { title: 'Security', body: 'We use HTTPS and Supabase\'s row-level security so users can only access their own data. No system is 100% secure; we encourage you to keep personal backups of entries that matter to you.' },
            { title: 'California Residents (CCPA)', body: 'You have the right to know what data we collect, request deletion, and opt out of the sale of your data (we do not sell data). Email hello@patinafamily.com to exercise these rights.' },
            { title: 'Changes', body: 'We may update this policy. Continued use after changes constitutes acceptance.' },
            { title: 'Contact', body: 'hello@patinafamily.com' },
          ].map(({ title, body }) => (
            <div key={title} style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>{title}</p>
              <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.65 }}>{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default PrivacyPolicyScreen;
