// Email templates.
//
// The six user-facing templates are stored as raw {{merge}} strings in
// `defaultStrings` so they can be edited by admins (overridden in the
// email_templates table) and rendered uniformly. See email/render.js.
//
// Merge fields available to these templates:
//   {{marshal_name}} {{marshal_full_name}} {{marshal_surname}}
//   {{event_name}} {{event_dates}} {{event_year}} {{event_short}}
//   {{organisation_name}} {{coordinator_name}} {{signoff}} {{licence_year}}
//   {{apply_url}} {{status_url}}
//   payment_request also: {{total_due}} {{shirt_total}} {{addon_line}}
//     {{payment_ref}} {{bacs_account_name}} {{bacs_sort_code}} {{bacs_account_number}}

const EDITABLE_TYPES = ['invitation', 'reminder', 'confirmation', 'schedule_update', 'payment_request', 'licence_nudge'];

const TYPE_LABELS = {
  invitation: 'Invitation',
  reminder: 'Reminder',
  confirmation: 'Confirmation',
  schedule_update: 'Schedule update',
  payment_request: 'Payment request',
  licence_nudge: 'Licence nudge',
};

const defaultStrings = {
  invitation: {
    subject: '{{event_name}} — Your marshalling invitation',
    body: `Hi {{marshal_name}},

You've been invited to marshal at {{event_name}}, {{event_dates}}.

To register your interest and complete your application, please use your personal link below:

{{apply_url}}

Please reply as soon as possible — even if you can't make it, a quick reply helps enormously.

If you'd like to decline, just reply to this email with "Not this year" and I won't be offended!

Many thanks,
{{signoff}}`,
  },

  reminder: {
    subject: 'Reminder — {{event_name}} marshalling application',
    body: `Hi {{marshal_name}},

Just a quick nudge — I haven't heard back from you yet about {{event_name}}.

If you'd like to come, please complete your application here:
{{apply_url}}

If you can't make it, please just reply and let me know.

Thanks,
{{signoff}}`,
  },

  confirmation: {
    subject: "You're confirmed for {{event_name}}!",
    body: `Hi {{marshal_name}},

Great news — you're confirmed as part of the marshalling team for {{event_name}}.

You can check your current status and assignment at any time here:
{{status_url}}

I'll be in touch once the schedule is finalised and when payment becomes due.

See you there!
{{signoff}}`,
  },

  schedule_update: {
    subject: '{{event_name}} — Your schedule has been updated',
    body: `Hi {{marshal_name}},

Your marshalling schedule for {{event_name}} has been updated.

View your current assignment here:
{{status_url}}

If you have any questions, just reply to this email.

{{signoff}}`,
  },

  payment_request: {
    subject: '{{event_name}} — Payment now due',
    body: `Hi {{marshal_name}},

Shirts have been ordered! Payment is now due for your {{event_name}} booking.

Amount due: £{{total_due}}
  - Shirts: £{{shirt_total}}{{addon_line}}

Please pay by BACS:
  Account name: {{bacs_account_name}}
  Sort code: {{bacs_sort_code}}
  Account number: {{bacs_account_number}}
  Reference: {{payment_ref}}

If you have any problems, just reply to this email.

Thanks,
{{signoff}}`,
  },

  licence_nudge: {
    subject: '{{event_name}} — Please upload your MSUK licence',
    body: `Hi {{marshal_name}},

We still need a copy of your {{licence_year}}MSUK marshal's licence before we can confirm your place.

Please upload it here:
{{apply_url}}

No licence = no marshalling, so please don't leave this too long!

{{signoff}}`,
  },
};

// Internal notifications — not admin-editable.
function new_application_to_coordinator(d) {
  return {
    subject: `New application received from ${d.marshal_name}`,
    text: `A new marshalling application has been submitted for ${d.event_name}.

Name: ${d.marshal_full_name}
Email: ${d.marshal_email}
Role preference: ${d.role_preference || '—'}
Marshalling days: ${d.marshalling_days || '—'}

Review it in the dashboard.`,
  };
}

function application_receipt(d) {
  const addonLine = d.addon_label ? `\n${d.addon_label}: ${d.addon_attending ? 'Yes' : 'No'}` : '';
  return {
    subject: `Thanks for applying — ${d.event_name}`,
    text: `Hi ${d.marshal_name},

Thanks for applying to marshal at ${d.event_name}. Here's a summary of what you submitted:

Role preference: ${d.role_preference || '—'}
Marshalling days: ${d.marshalling_days || '—'}
Shirts: ${d.shirt_summary || '—'}${addonLine}
Total due (payable later): £${d.total_due}

You won't be asked to pay yet — ${d.coordinator_name} will contact you when shirts are ordered.

You can check your status here at any time:
${d.status_url}

${d.licence_outstanding ? '\nNOTE: We still need your MSUK licence. Please upload it from your status page above.\n' : ''}
Thanks,
${d.signoff || d.coordinator_name}`,
  };
}

const templates = { new_application_to_coordinator, application_receipt };

module.exports = { templates, defaultStrings, EDITABLE_TYPES, TYPE_LABELS };
