import { Icon } from '../icons';

function TermsScreen({ onBack }) {
  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <button className="icon-btn" onClick={onBack}><Icon name="ti-arrow-left" /></button>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>Terms of Service</h2>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 20px' }}>Effective July 4, 2026</p>

          {[
            { title: 'Acceptance', body: 'By creating an account or using Patina, you agree to these Terms. If you do not agree, do not use the app.' },
            { title: 'What Patina Is', body: 'Patina is a private family journaling app, currently free to use. We reserve the right to introduce paid features in the future and will notify existing users before doing so.' },
            { title: 'Your Account', body: 'You must be 18 or older to create an account. You are responsible for keeping your credentials secure and for all activity under your account. Notify us at hello@patinafamily.com if you suspect unauthorized access.' },
            { title: 'Your Content', body: 'You retain full ownership of everything you post. By uploading content, you grant us a limited license to store and display it within the app solely to provide the service to you and your family.' },
            { title: 'Prohibited Uses', body: 'You agree not to use Patina for any unlawful purpose, upload illegal or abusive content, attempt to access another user\'s data, or reverse-engineer the service. Content involving child exploitation will be reported to authorities and result in immediate account termination.' },
            { title: 'Friends Feature', body: 'You control who you add as a friend. Friends can see your photos and milestones by default. Sharing your letter text with friends is optional — you choose the sharing level for each entry (Private, Partner only, or All). You can remove friends at any time, which immediately revokes their access.' },
            { title: 'Termination', body: 'We reserve the right to suspend or terminate accounts that violate these Terms. You may delete your account anytime from the Profile screen.' },
            { title: 'Disclaimer', body: 'Patina is provided "as is" without warranties of any kind. We do not guarantee the service will be uninterrupted or error-free. We strongly encourage you to keep personal backups of entries that matter to you.' },
            { title: 'Limitation of Liability', body: 'To the fullest extent permitted by law, Patina and its creators shall not be liable for any indirect, incidental, or consequential damages arising from your use of the app, including data loss.' },
            { title: 'Governing Law', body: 'These Terms are governed by the laws of the State of California, without regard to conflict of law principles.' },
            { title: 'Changes', body: 'We may update these Terms. Continued use after changes constitutes acceptance.' },
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

export default TermsScreen;
