// Plain-text email templates. Each function takes a data object and returns
// { subject, text }. Merge fields are documented in the project spec.
//
// Common data fields:
//   marshal_name, marshal_surname, event_name, event_dates, coordinator_name,
//   apply_url, status_url, total_due, shirt_total, barbie_total,
//   bacs_account_name, bacs_sort_code, bacs_account_number

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
${d.coordinator_name}`,
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
${d.coordinator_name}`,
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
${d.coordinator_name}`,
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

${d.coordinator_name}`,
  };
}

function payment_request(d) {
  return {
    subject: `${d.event_name} — Payment now due`,
    text: `Hi ${d.marshal_name},

Shirts have been ordered! Payment is now due for your GFoS booking.

Amount due: £${d.total_due}
  - Shirts: £${d.shirt_total}
  - Sunday barbie: £${d.barbie_total}

Please pay by BACS:
  Account name: ${d.bacs_account_name || '[ACCOUNT NAME]'}
  Sort code: ${d.bacs_sort_code || '[SORT CODE]'}
  Account number: ${d.bacs_account_number || '[ACCOUNT NUMBER]'}
  Reference: GFoS/${d.marshal_surname}

If you have any problems, just reply to this email.

Thanks,
${d.coordinator_name}`,
  };
}

function licence_nudge(d) {
  return {
    subject: `${d.event_name} — Please upload your MSUK licence`,
    text: `Hi ${d.marshal_name},

We still need a copy of your 2026 MSUK marshal's licence before we can confirm your place.

Please upload it here:
${d.apply_url}

No licence = no GFoS, so please don't leave this too long!

${d.coordinator_name}`,
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
  return {
    subject: `Thanks for applying — ${d.event_name}`,
    text: `Hi ${d.marshal_name},

Thanks for applying to marshal at ${d.event_name}. Here's a summary of what you submitted:

Role preference: ${d.role_preference || '—'}
Marshalling days: ${d.marshalling_days || '—'}
Shirts: ${d.shirt_summary || '—'}
Sunday barbie: ${d.barbie_attending ? 'Yes' : 'No'}
Total due (payable later): £${d.total_due}

You won't be asked to pay yet — ${d.coordinator_name} will contact you when shirts are ordered.

You can check your status here at any time:
${d.status_url}

${d.licence_outstanding ? '\nNOTE: We still need your MSUK licence. Please upload it from your status page above.\n' : ''}
Thanks,
${d.coordinator_name}`,
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
