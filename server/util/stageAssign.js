// Rally stage AM/PM auto-assignment.
//
// Unlike ORA (a single A/B team), stage marshals are assigned per day to one
// shift — AM or PM — honouring their shift preference and balancing each day's
// shifts toward the per-shift target.
//
// Input:
//   apps: [{ id, name, marshalling_days, stage_shift_preference, role_preference, ora_team }]
//   eventDays: [{ id, day_name }]
//   target: marshals wanted per shift
//   existing: Map "appId:dayId" -> { role, provisional }  (current assignments)
//
// Returns:
//   { assignments: [{ application_id, event_day_id, role }],
//     perDay: { [dayId]: { day_name, am, pm } },
//     flagged: [{ id, name, reason }],
//     changes: number }

function dayKey(name) {
  return String(name || '').toLowerCase();
}

function autoAssignStage(apps, eventDays, target, existing = new Map()) {
  // Map marshalling-day names to event_day ids.
  const dayByName = new Map(eventDays.map((d) => [dayKey(d.day_name), d]));
  const perDay = {};
  for (const d of eventDays) perDay[d.id] = { day_name: d.day_name, am: 0, pm: 0 };

  const flagged = [];
  // Build per-marshal list of assignable event days.
  const tasks = []; // { app, dayId, pref }
  for (const a of apps) {
    const days = (a.marshalling_days || [])
      .map((n) => dayByName.get(dayKey(n)))
      .filter(Boolean);
    if (days.length === 0) {
      flagged.push({ id: a.id, name: a.name, reason: 'No marshalling days match this event — assign manually.' });
      continue;
    }
    let pref = 'either';
    if (a.stage_shift_preference === 'am') pref = 'am';
    else if (a.stage_shift_preference === 'pm') pref = 'pm';
    for (const d of days) tasks.push({ app: a, dayId: d.id, pref });
  }

  const assignments = [];
  const place = (task, shift) => {
    perDay[task.dayId][shift] += 1;
    assignments.push({ application_id: task.app.id, event_day_id: task.dayId, role: shift === 'am' ? 'stage_am' : 'stage_pm' });
  };

  // Pass 1: honour explicit AM/PM preferences.
  for (const task of tasks) {
    if (task.pref === 'am') place(task, 'am');
    else if (task.pref === 'pm') place(task, 'pm');
  }
  // Pass 2: distribute "either" marshals to the emptier shift each day (toward target).
  for (const task of tasks) {
    if (task.pref !== 'either') continue;
    const d = perDay[task.dayId];
    // Prefer the shift further from target; tie-break to AM.
    const amRoom = target - d.am;
    const pmRoom = target - d.pm;
    place(task, pmRoom > amRoom ? 'pm' : 'am');
  }

  // Count changes vs existing (new or differing role), and don't clobber locked cells.
  let changes = 0;
  const final = [];
  for (const as of assignments) {
    const cur = existing.get(`${as.application_id}:${as.event_day_id}`);
    if (cur && cur.provisional === false) continue; // leave locked assignments alone
    if (!cur || cur.role !== as.role) changes += 1;
    final.push(as);
  }

  return { assignments: final, perDay, flagged, changes };
}

module.exports = { autoAssignStage };
