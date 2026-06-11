import type { Metadata } from 'next';
import {
  LegalPageShell,
  LegalSection
} from '@/components/legal/legal-page-shell';

export const metadata: Metadata = {
  title: 'Terms of Service | BuildCon CRM',
  description:
    'Terms of Service for BuildCon CRM — project CRM for redevelopment sales, inventory, and collections.'
};

const LAST_UPDATED = 'June 11, 2026';

export default function TermsOfServicePage() {
  return (
    <LegalPageShell title="Terms of Service" lastUpdated={LAST_UPDATED}>
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of
        BuildCon CRM (&quot;BuildCon,&quot; &quot;we,&quot; &quot;us,&quot; or
        &quot;our&quot;), including our web application, APIs, and related
        services (collectively, the &quot;Service&quot;). By creating an account
        or using the Service, you agree to these Terms.
      </p>

      <LegalSection title="1. Eligibility and accounts">
        <p>
          The Service is intended for authorized staff of real estate developers,
          brokers, and related businesses. You must be at least 18 years old and
          have authority to bind your organization when you register.
        </p>
        <p>
          You are responsible for maintaining the confidentiality of your login
          credentials and for all activity under your account. Notify your
          administrator or us promptly if you suspect unauthorized access.
        </p>
      </LegalSection>

      <LegalSection title="2. Permitted use">
        <p>
          You may use the Service only for lawful business purposes related to
          project sales, customer relationship management, inventory, bookings,
          collections, and associated workflows enabled in your workspace.
        </p>
        <p>You agree not to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Access data or projects you are not authorized to view</li>
          <li>Reverse engineer, scrape, or overload the Service</li>
          <li>Upload malware or content that infringes third-party rights</li>
          <li>Misrepresent customer, booking, or financial information</li>
          <li>Use the Service in violation of applicable law or regulation</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Customer and project data">
        <p>
          Your organization controls the customer, booking, financial, and
          document data entered into the Service (&quot;Customer Data&quot;). You
          represent that you have the rights and consents needed to collect,
          store, and process Customer Data through BuildCon.
        </p>
        <p>
          We process Customer Data only to provide, secure, and improve the
          Service, as described in our{' '}
          <a
            href="/privacy-policy"
            className="font-medium text-ds-primary-600 hover:text-ds-primary-700"
          >
            Privacy Policy
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="4. Intellectual property">
        <p>
          BuildCon and its licensors retain all rights in the Service, including
          software, branding, and documentation. These Terms do not grant you any
          ownership in the Service.
        </p>
        <p>
          You retain ownership of Customer Data. You grant us a limited license
          to host, back up, and process Customer Data solely to operate the
          Service.
        </p>
      </LegalSection>

      <LegalSection title="5. Availability and changes">
        <p>
          We strive for reliable uptime but do not guarantee uninterrupted
          access. We may modify features, suspend access for maintenance, or
          update these Terms. Material changes will be posted on this page with
          an updated &quot;Last updated&quot; date. Continued use after changes
          constitutes acceptance.
        </p>
      </LegalSection>

      <LegalSection title="6. Disclaimers">
        <p>
          The Service is provided &quot;as is&quot; and &quot;as available.&quot;
          To the fullest extent permitted by law, we disclaim warranties of
          merchantability, fitness for a particular purpose, and non-infringement.
          BuildCon is a business tool; it does not provide legal, tax, or
          regulatory advice. You are responsible for compliance with RERA and
          other obligations applicable to your projects.
        </p>
      </LegalSection>

      <LegalSection title="7. Limitation of liability">
        <p>
          To the maximum extent permitted by law, BuildCon and its affiliates
          will not be liable for indirect, incidental, special, consequential, or
          punitive damages, or for loss of profits, data, or goodwill arising
          from your use of the Service.
        </p>
        <p>
          Our total liability for any claim relating to the Service is limited to
          the amount you paid us for the Service in the twelve (12) months
          before the event giving rise to the claim, or one hundred U.S. dollars
          if no fees were paid.
        </p>
      </LegalSection>

      <LegalSection title="8. Termination">
        <p>
          Your organization may revoke your access at any time. We may suspend
          or terminate access if you breach these Terms or if required for
          security or legal reasons. Upon termination, your right to use the
          Service ends, but provisions that by nature should survive (including
          limitations of liability) will remain in effect.
        </p>
      </LegalSection>

      <LegalSection title="9. Governing law">
        <p>
          These Terms are governed by the laws of India, without regard to
          conflict-of-law principles. Courts in Mumbai, Maharashtra shall have
          exclusive jurisdiction over disputes arising from these Terms, subject
          to mandatory consumer protections where applicable.
        </p>
      </LegalSection>

      <LegalSection title="10. Contact">
        <p>
          Questions about these Terms may be directed to your BuildCon account
          administrator or to{' '}
          <a
            href="mailto:legal@buildcon.app"
            className="font-medium text-ds-primary-600 hover:text-ds-primary-700"
          >
            legal@buildcon.app
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
