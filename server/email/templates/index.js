// Plain-text email templates. Each function takes a data object and returns
// { subject, text }. Copy is club- and event-agnostic: it's driven by the
// event name/dates and the (optional) organisation name — no hardcoded club or
// event references.
//
// Common data fields:
//   marshal_name, marshal_surname, event_name, event_dates, event_year,
//   event_short, organisation_name, coordinator_name, apply_url, status_url,
//   total_due, shirt_total, addon_total, addon_label,
//   bacs_account_name, bacs_sort_code, bacs_account_number

// Sign-off: coordinator name, with the organisation underneath when set.
function sign(d) {
  return d.organisation_name ? `${d.coordinator_name}\n${d.organisation_name}` : d.coordinator_name;
}

function invitation(d) {
  return {
    subject: `${d.event_name} — Your marshalling invitation`,
    text: `Hi ${d.marshal_name},

You've been invited to marshal at ${d.event_name}, ${d.event_dates}.

To register your interest and complete your application, please use your personal link below:

${d.apply_url}

Please reply as soon as possible — even if you can't make it, a quick reply helps enormously.

If you'd like to decline, just reply to this email with "Not this year" and I won't be offended!

Many thanks,
${sign(d)}`,
  };
}

function reminder(d) {
  return {
    subject: `Reminder — ${d.event_name} marshalling application`,
    text: `Hi ${d.marshal_name},

Just a quick nudge — I haven't heard back from you yet about ${d.event_name}.

If you'd like to come, please complete your application here:
${d.apply_url}

If you can't make it, please just reply and let me know.

Thanks,
${sign(d)}`,
  };
}

function confirmation(d) {
  return {
    subject: `You're confirmed for ${d.event_name}!`,
    text: `Hi ${d.marshal_name},

Great news — you're confirmed as part of the marshalling team for ${d.event_name}.

You can check your current status and assignment at any time here:
${d.status_url}

I'll be in touch once the schedule is finalised and when payment becomes due.

See you there!
${sign(d)}`,
  };
}

function schedule_update(d) {
  return {
    subject: `${d.event_name} — Your schedule has been updated`,
    text: `Hi ${d.marshal_name},

Your marshalling schedule for ${d.event_name} has been updated.

View your current assignment here:
${d.status_url}

If you have any questions, just reply to this email.

${sign(d)}`,
  };
}

function payment_request(d) {
  // Generic add-on line only when an add-on applies.
  const addonLine = Number(d.addon_total) > 0
    ? `\n  - ${d.addon_label || 'Optional extra'}: £${d.addon_total}`
    : '';
  const reference = `${d.event_short || 'EVENT'}/${d.marshal_surname}`;
  return {
    subject: `${d.event_name} — Payment now due`,
    text: `Hi ${d.marshal_name},

Shirts have been ordered! Payment is now due for your ${d.event_name} booking.

Amount due: £${d.total_due}
  - Shirts: £${d.shirt_total}${addonLine}

Please pay by BACS:
  Account name: ${d.bacs_account_name || '[ACCOUNT NAME]'}
  Sort code: ${d.bacs_sort_code || '[SORT CODE]'}
  Account number: ${d.bacs_account_number || '[ACCOUNT NUMBER]'}
  Reference: ${reference}

If you have any problems, just reply to this email.

Thanks,
${sign(d)}`,
  };
}

function licence_nudge(d) {
  const year = d.event_year ? `${d.event_year} ` : '';
  return {
    subject: `${d.event_name} — Please upload your MSUK licence`,
    text: `Hi ${d.marshal_name},

We still need a copy of your ${year}MSUK marshal's licence before we can confirm your place.

Please upload it here:
${d.apply_url}

No licence = no marshalling, so please don't leave this too long!

${sign(d)}`,
  };
}

// Internal notifications (to the coordinator) and applicant receipt.
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
${sign(d)}`,
  };
}

const templates = {
  invitation,
  reminder,
  confirmation,
  schedule_update,
  payment_request,
  licence_nudge,
  new_application_to_coordinator,
  application_receipt,
};

// type -> comms_log type mapping for the user-facing templates
const commsType = {
  invitation: 'invitation',
  reminder: 'reminder',
  confirmation: 'confirmation',
  schedule_update: 'schedule_update',
  payment_request: 'payment_request',
  licence_nudge: 'licence_nudge',
};

module.exports = { templates, commsType };
