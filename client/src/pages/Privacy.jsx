import React from 'react';
import { Link } from 'react-router-dom';
import PublicLayout from '../components/PublicLayout';

// Privacy notice. This is a TEMPLATE — the organising club must review it with
// its own details and legal advice before relying on it. Keep the version in
// step with server PRIVACY_POLICY_VERSION when the substance changes.
const VERSION = '1.0';

export default function Privacy() {
  return (
    <PublicLayout>
      <div className="card">
        <div className="eyebrow">Privacy notice · v{VERSION}</div>
        <h1 style={{ marginTop: 6 }}>How we use your data</h1>
        <p className="metadata">
          Template — the organising club should complete the bracketed details and
          have this reviewed before use.
        </p>

        <h3>Who we are</h3>
        <p>
          <strong>[ORGANISING CLUB NAME]</strong> ("we") is the data controller for the
          personal data you provide when applying to marshal. Contact us at
          <strong> [CONTACT EMAIL]</strong>. [If registered with the ICO, add your
          registration number here.]
        </p>

        <h3>What we collect</h3>
        <ul>
          <li>Your name, contact details and address.</li>
          <li>Your MSUK licence number, grade(s) and a copy of your licence document.</li>
          <li>Club membership number and marshalling experience.</li>
          <li>Your availability, role and shift preferences, accommodation and travel notes.</li>
          <li>Kit (shirt) orders and any optional add-on, and payment status.</li>
        </ul>

        <h3>Why we use it &amp; our lawful basis</h3>
        <p>
          We use this data solely to organise the marshalling team for the event —
          assigning roles, verifying licences, arranging kit and payment, and
          contacting you about the event. Our lawful basis is
          <strong> [consent / legitimate interests — choose and state]</strong>.
        </p>

        <h3>Who we share it with</h3>
        <p>
          We do not sell your data or use third-party analytics. Data is held on our
          own server. We use an email provider to send you messages, and may share
          relevant details with event organisers and MSUK as required to run the event.
        </p>

        <h3>How long we keep it</h3>
        <p>
          We keep your data only as long as needed to run events you take part in, then
          for a limited retention period, after which it is automatically erased.
          Licence documents are deleted when no longer required.
        </p>

        <h3>Your rights</h3>
        <p>
          You have the right to access, correct, or erase your data, and to object to or
          restrict its use. From your personal status page you can
          <strong> download a copy of your data</strong> or
          <strong> request erasure</strong> at any time. You can also complain to the
          Information Commissioner's Office (ico.org.uk).
        </p>

        <p className="mt"><Link to="/">← Back</Link></p>
      </div>
    </PublicLayout>
  );
}
