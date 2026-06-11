import type { Metadata } from 'next';
import {
  LegalPageShell,
  LegalSection
} from '@/components/legal/legal-page-shell';

export const metadata: Metadata = {
  title: 'Privacy Policy | BuildCon CRM',
  description:
    'Privacy Policy for BuildCon CRM — how we collect, use, and protect your information.'
};

const LAST_UPDATED = 'June 11, 2026';

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <p>
        This Privacy Policy explains how BuildCon CRM (&quot;BuildCon,&quot;
        &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) collects, uses,
        shares, and protects information when you use our web application and
        related services (the &quot;Service&quot;).
      </p>

      <LegalSection title="1. Who this policy applies to">
        <p>
          This policy applies to staff users who sign in to BuildCon CRM and to
          administrators who manage projects and team access. Information about
          homebuyers, brokers, and other third parties entered into the Service
          by your organization (&quot;Customer Data&quot;) is processed on
          behalf of your organization, which remains responsible for providing
          appropriate notices and obtaining required consents.
        </p>
      </LegalSection>

      <LegalSection title="2. Information we collect">
        <p>
          <strong className="text-ds-gray-800">Account information.</strong>{' '}
          Name, email address, authentication credentials, and role or project
          assignments provided by you or your administrator.
        </p>
        <p>
          <strong className="text-ds-gray-800">Usage information.</strong> Log
          data such as IP address, browser type, device information, pages
          viewed, and actions taken in the Service for security, auditing, and
          product improvement.
        </p>
        <p>
          <strong className="text-ds-gray-800">Customer Data.</strong> Data your
          organization enters about inquiries, customers, units, bookings,
          payments, documents, and communications. The categories depend on how
          your team uses BuildCon.
        </p>
        <p>
          <strong className="text-ds-gray-800">Support communications.</strong>{' '}
          Information you provide when contacting us for help or feedback.
        </p>
      </LegalSection>

      <LegalSection title="3. How we use information">
        <p>We use information to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Provide, maintain, and secure the Service</li>
          <li>Authenticate users and enforce access controls</li>
          <li>Generate documents, reports, and notifications you request</li>
          <li>Monitor performance, diagnose issues, and prevent abuse</li>
          <li>Comply with legal obligations and respond to lawful requests</li>
          <li>Improve features and user experience where permitted</li>
        </ul>
        <p>
          We do not sell personal information. We do not use Customer Data to
          train public AI models.
        </p>
      </LegalSection>

      <LegalSection title="4. How we share information">
        <p>We may share information with:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-ds-gray-800">Service providers</strong> who
            host infrastructure, databases, authentication, email, or analytics
            under contractual confidentiality and security obligations (for
            example, cloud hosting and Supabase)
          </li>
          <li>
            <strong className="text-ds-gray-800">Your organization</strong>{' '}
            administrators and authorized project members according to role-based
            access
          </li>
          <li>
            <strong className="text-ds-gray-800">Legal and safety</strong>{' '}
            parties when required by law, court order, or to protect rights,
            safety, and security
          </li>
        </ul>
        <p>
          If your organization enables integrations (such as email or messaging
          providers), data may be shared with those providers according to your
          configuration.
        </p>
      </LegalSection>

      <LegalSection title="5. Data retention">
        <p>
          We retain account and usage data for as long as your account is active
          and as needed to provide the Service, resolve disputes, and meet legal
          obligations. Customer Data retention is controlled by your
          organization&apos;s policies and contractual terms with BuildCon.
        </p>
      </LegalSection>

      <LegalSection title="6. Security">
        <p>
          We implement administrative, technical, and organizational measures
          designed to protect information, including encrypted transport,
          access controls, and project-scoped permissions. No method of
          transmission or storage is completely secure; please use strong
          passwords and report suspected incidents promptly.
        </p>
      </LegalSection>

      <LegalSection title="7. Your choices and rights">
        <p>
          Staff users may update certain profile information through their
          administrator or support channels. Depending on applicable law, you may
          have rights to access, correct, delete, or restrict processing of your
          personal information. Requests can be submitted to your organization or
          to{' '}
          <a
            href="mailto:privacy@buildcon.app"
            className="font-medium text-ds-primary-600 hover:text-ds-primary-700"
          >
            privacy@buildcon.app
          </a>
          . We will respond in accordance with applicable law.
        </p>
      </LegalSection>

      <LegalSection title="8. International transfers">
        <p>
          Information may be processed in countries where we or our service
          providers operate. Where required, we use appropriate safeguards for
          cross-border transfers.
        </p>
      </LegalSection>

      <LegalSection title="9. Children">
        <p>
          The Service is not directed to children under 18. We do not knowingly
          collect personal information from children.
        </p>
      </LegalSection>

      <LegalSection title="10. Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. We will post the
          revised version on this page and update the &quot;Last updated&quot;
          date. Material changes may also be communicated through the Service
          or to your administrator.
        </p>
      </LegalSection>

      <LegalSection title="11. Contact">
        <p>
          For privacy questions or requests, contact{' '}
          <a
            href="mailto:privacy@buildcon.app"
            className="font-medium text-ds-primary-600 hover:text-ds-primary-700"
          >
            privacy@buildcon.app
          </a>
          . For terms governing use of the Service, see our{' '}
          <a
            href="/terms-of-service"
            className="font-medium text-ds-primary-600 hover:text-ds-primary-700"
          >
            Terms of Service
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
