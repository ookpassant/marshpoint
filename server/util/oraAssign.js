// ORA Team auto-assignment.
//
// Team A: marshals on Thursday + Saturday; off Friday + Sunday
// Team B: marshals on Friday + Sunday; off Thursday + Saturday
//
// Input: array of application-like objects:
//   { id, full_name, preferred_name, departure_option, marshalling_days,
//     travelling_with_names, sharing_with_names, role_preference }
//   (caller pre-filters to role_preference IN ('ora','flexible'))
//
// Returns: { assignments: {appId: 'A'|'B'}, flagged: [{id, name, reason}],
//            teamA, teamB }

function normaliseName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Can this marshal be on Team A? (needs Thu + Sat)
function canBeA(days) {
  const set = new Set((days || []).map((d) => d.toLowerCase()));
  return set.has('thursday') && set.has('saturday');
}
// Can this marshal be on Team B? (needs Fri + Sun)
function canBeB(days) {
  const set = new Set((days || []).map((d) => d.toLowerCase()));
  return set.has('friday') && set.has('sunday');
}

// Union-find for grouping marshals who reference each other.
class UnionFind {
  constructor(ids) {
    this.parent = {};
    ids.forEach((id) => { this.parent[id] = id; });
  }
  find(x) {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

function autoAssignOra(apps, target = 20) {
  const flagged = [];
  const assignments = {};

  // Build a lookup of name tokens -> application id for group matching.
  const nameIndex = [];
  for (const a of apps) {
    const names = [a.full_name, a.preferred_name].filter(Boolean).map(normaliseName);
    nameIndex.push({ id: a.id, names });
  }

  // Group via union-find on referenced names.
  const uf = new UnionFind(apps.map((a) => a.id));
  for (const a of apps) {
    const refs = `${a.travelling_with_names || ''} ${a.sharing_with_names || ''}`;
    const refNorm = normaliseName(refs);
    if (!refNorm) continue;
    for (const other of nameIndex) {
      if (other.id === a.id) continue;
      // Match if any of the other marshal's names appears in the reference text.
      const hit = other.names.some((n) => n.length > 2 && refNorm.includes(n));
      if (hit) uf.union(a.id, other.id);
    }
  }

  // Collect groups.
  const groups = {};
  for (const a of apps) {
    const root = uf.find(a.id);
    (groups[root] = groups[root] || []).push(a);
  }

  let teamA = 0, teamB = 0;
  const byId = Object.fromEntries(apps.map((a) => [a.id, a]));

  // Determine each group's forced/viable team.
  const groupList = Object.values(groups);
  // Process forced groups first, balance flexible ones last.
  const pending = [];

  for (const group of groupList) {
    let forcedA = false, forcedB = false;
    let viableA = true, viableB = true;
    let conflict = false;

    for (const a of group) {
      // Rule 1: departure before prizes -> Team A.
      if (a.departure_option === 'sunday_before_prizes') forcedA = true;
      // Rule 3: marshalling-days viability.
      if (!canBeA(a.marshalling_days)) viableA = false;
      if (!canBeB(a.marshalling_days)) viableB = false;
    }

    // Conflict: forced A but A not viable for someone in group.
    if (forcedA && !viableA) conflict = true;
    if (forcedB && !viableB) conflict = true;
    if (forcedA && forcedB) conflict = true;
    if (!viableA && !viableB) conflict = true;

    if (conflict) {
      for (const a of group) {
        flagged.push({
          id: a.id,
          name: a.full_name,
          reason: 'Conflicting or unsatisfiable team constraints — needs manual review.',
        });
      }
      continue;
    }

    if (forcedA && viableA) {
      group.forEach((a) => { assignments[a.id] = 'A'; teamA++; });
    } else if (forcedB && viableB) {
      group.forEach((a) => { assignments[a.id] = 'B'; teamB++; });
    } else if (viableA && !viableB) {
      group.forEach((a) => { assignments[a.id] = 'A'; teamA++; });
    } else if (viableB && !viableA) {
      group.forEach((a) => { assignments[a.id] = 'B'; teamB++; });
    } else {
      // Both viable — defer to balancing pass.
      pending.push(group);
    }
  }

  // Balancing pass: assign remaining groups to the smaller team.
  pending.sort((a, b) => b.length - a.length); // larger groups first
  for (const group of pending) {
    if (teamA <= teamB) {
      group.forEach((a) => { assignments[a.id] = 'A'; });
      teamA += group.length;
    } else {
      group.forEach((a) => { assignments[a.id] = 'B'; });
      teamB += group.length;
    }
  }

  return { assignments, flagged, teamA, teamB, target };
}

module.exports = { autoAssignOra, canBeA, canBeB };
