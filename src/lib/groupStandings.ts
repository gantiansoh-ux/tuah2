/**
 * groupStandings.ts — Group-stage standings engine + KO cross-pairing (Work Order #47)
 *
 * Pure functions, no DB access. Callers assemble the data from the database.
 *
 * Tiebreak order (official): wins → set difference → points difference →
 * head-to-head (among tied) → seed.
 */
import type { DrawEntry } from "./drawEngine";

export interface GroupEntryInfo {
  entry_id: string;
  seed?: number | null;
  withdrawn?: boolean;
  name?: string;
}

export interface GroupGameInfo {
  score_entry_1?: number | null;
  score_entry_2?: number | null;
  score_1?: number | null; // DB column name (games table)
  score_2?: number | null;
  winner_id?: string | null;
  is_complete?: boolean | null;
}

export interface GroupMatchInfo {
  id: string;
  entry_1_id: string | null;
  entry_2_id: string | null;
  winner_entry_id?: string | null;
  status?: string | null;
  bracket_group?: string | null;
  games?: GroupGameInfo[];
}

export interface GroupStandingRow {
  entry_id: string;
  name: string;
  seed: number;
  withdrawn: boolean;
  played: number;
  wins: number;
  losses: number;
  sets_won: number;
  sets_lost: number;
  points_won: number;
  points_lost: number;
  set_diff: number;
  points_diff: number;
  rank: number;
}

export interface GroupStandings {
  label: string; // "A"
  entries: GroupStandingRow[]; // ranked 1..n
}

export interface KOQualifier {
  entry_id: string;
  label: string; // "A1"
  group: string; // "A"
  rank: number; // 1-based within group
  seed: number;
  wins: number;
  set_diff: number;
  points_diff: number;
}

export interface KOPair {
  e1: KOQualifier | null;
  e2: KOQualifier | null;
}

export function groupLabel(i: number): string {
  return String.fromCharCode(65 + i);
}

function generateSeedOrder(size: number): number[] {
  if (size <= 1) return [1];
  if (size === 2) return [1, 2];
  let order = [1, 2];
  for (let r = 4; r <= size; r *= 2) {
    const next: number[] = [];
    for (let i = 0; i < order.length; i++) {
      next.push(order[i]);
      next.push(r + 1 - order[i]);
    }
    order = next;
  }
  return order;
}

/**
 * Derive per-group membership from group matches (ground truth), then fill any
 * gaps (e.g. 1-player groups with no matches) using the engine's seed
 * distribution rule: entries sorted by seed, assigned i % numGroups.
 */
export function deriveGroups(
  entries: GroupEntryInfo[],
  numGroups: number,
  groupMatches: GroupMatchInfo[]
): { label: string; entries: GroupEntryInfo[] }[] {
  const count = Math.max(1, numGroups || 1);
  const groups: { label: string; entries: GroupEntryInfo[] }[] = Array.from(
    { length: count },
    (_, i) => ({ label: groupLabel(i), entries: [] })
  );
  const entryMap = new Map<string, GroupEntryInfo>();
  for (const e of entries) entryMap.set(e.entry_id, e);
  const assigned = new Set<string>();

  for (const m of groupMatches) {
    if (!m.bracket_group) continue;
    const label = m.bracket_group.replace(/^group-/, "");
    const g = groups.find((x) => x.label === label);
    if (!g) continue;
    for (const id of [m.entry_1_id, m.entry_2_id]) {
      if (id && entryMap.has(id) && !assigned.has(id)) {
        g.entries.push(entryMap.get(id)!);
        assigned.add(id);
      }
    }
  }

  // Fill unassigned entries using the engine distribution rule
  const sorted = [...entries].sort((a, b) => {
    const sa = a.seed ?? 9999;
    const sb = b.seed ?? 9999;
    if (sa !== sb) return sa - sb;
    return a.entry_id.localeCompare(b.entry_id);
  });
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    if (assigned.has(e.entry_id)) continue;
    const g = groups[i % groups.length];
    g.entries.push(e);
    assigned.add(e.entry_id);
  }
  return groups;
}

function cmpByPrimary(
  a: Pick<GroupStandingRow, "wins" | "set_diff" | "points_diff">,
  b: Pick<GroupStandingRow, "wins" | "set_diff" | "points_diff">
): number {
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.set_diff !== a.set_diff) return b.set_diff - a.set_diff;
  if (b.points_diff !== a.points_diff) return b.points_diff - a.points_diff;
  return 0;
}

/**
 * Compute ranked standings per group from completed group matches + games.
 * Tiebreak chain: wins → set diff → points diff → head-to-head → seed.
 */
export function computeGroupStandings(
  groups: { label: string; entries: GroupEntryInfo[] }[],
  matches: GroupMatchInfo[]
): GroupStandings[] {
  const result: GroupStandings[] = [];

  for (const g of groups) {
    const rows = new Map<string, GroupStandingRow>();
    for (const e of g.entries) {
      rows.set(e.entry_id, {
        entry_id: e.entry_id,
        name: e.name || "",
        seed: e.seed ?? 9999,
        withdrawn: !!e.withdrawn,
        played: 0,
        wins: 0,
        losses: 0,
        sets_won: 0,
        sets_lost: 0,
        points_won: 0,
        points_lost: 0,
        set_diff: 0,
        points_diff: 0,
        rank: 0,
      });
    }

    const groupMatches = matches.filter(
      (m) => m.bracket_group === `group-${g.label}`
    );
    const h2h = new Map<string, Map<string, number>>(); // entry_id -> opponent -> wins

    for (const m of groupMatches) {
      const r1 = rows.get(m.entry_1_id ?? "");
      const r2 = rows.get(m.entry_2_id ?? "");
      if (!r1 || !r2) continue;
      if (m.status !== "completed") continue;
      const winner = m.winner_entry_id;
      if (winner === m.entry_1_id) {
        r1.wins++; r2.losses++; r1.played++; r2.played++;
      } else if (winner === m.entry_2_id) {
        r2.wins++; r1.losses++; r1.played++; r2.played++;
      } else {
        continue; // completed without winner — ignore
      }

      // head-to-head bookkeeping
      if (!h2h.has(r1.entry_id)) h2h.set(r1.entry_id, new Map());
      if (!h2h.has(r2.entry_id)) h2h.set(r2.entry_id, new Map());
      const h1 = h2h.get(r1.entry_id)!;
      const h2 = h2h.get(r2.entry_id)!;
      if (winner === m.entry_1_id) {
        h1.set(r2.entry_id, (h1.get(r2.entry_id) ?? 0) + 1);
        if (!h2.has(r1.entry_id)) h2.set(r1.entry_id, 0);
      } else {
        h2.set(r1.entry_id, (h2.get(r1.entry_id) ?? 0) + 1);
        if (!h1.has(r2.entry_id)) h1.set(r2.entry_id, 0);
      }

      const games = m.games || [];
      if (games.length === 0) {
        // Walkover with no games recorded: count as a 1-0 set win
        if (winner === m.entry_1_id) {
          r1.sets_won++; r2.sets_lost++;
        } else {
          r2.sets_won++; r1.sets_lost++;
        }
      } else {
        for (const gm of games) {
          // DB games rows use score_1/score_2; the engine-style shape uses
          // score_entry_1/score_entry_2 — support both.
          const s1 = gm.score_entry_1 ?? gm.score_1 ?? 0;
          const s2 = gm.score_entry_2 ?? gm.score_2 ?? 0;
          r1.points_won += s1; r2.points_lost += s1;
          r2.points_won += s2; r1.points_lost += s2;
          const gWinner = gm.winner_id;
          if (gWinner === m.entry_1_id) {
            r1.sets_won++; r2.sets_lost++;
          } else if (gWinner === m.entry_2_id) {
            r2.sets_won++; r1.sets_lost++;
          } else if (gm.is_complete && s1 > s2) {
            r1.sets_won++; r2.sets_lost++;
          } else if (gm.is_complete && s2 > s1) {
            r2.sets_won++; r1.sets_lost++;
          }
        }
      }
    }

    for (const row of rows.values()) {
      row.set_diff = row.sets_won - row.sets_lost;
      row.points_diff = row.points_won - row.points_lost;
    }

    const list = [...rows.values()];
    list.sort(cmpByPrimary);

    // Head-to-head pass: for runs tied on (wins, set_diff, points_diff),
    // order by wins against the other members of the run, then seed.
    const runKey = (r: GroupStandingRow) =>
      `${r.wins}|${r.set_diff}|${r.points_diff}`;
    let i = 0;
    while (i < list.length) {
      let j = i;
      while (j + 1 < list.length && runKey(list[j + 1]) === runKey(list[i])) j++;
      if (j > i) {
        const run = list.slice(i, j + 1);
        run.sort((a, b) => {
          const ha = h2h.get(a.entry_id)?.get(b.entry_id) ?? 0;
          const hb = h2h.get(b.entry_id)?.get(a.entry_id) ?? 0;
          if (ha !== hb) return hb - ha;
          return (a.seed ?? 9999) - (b.seed ?? 9999);
        });
        list.splice(i, run.length, ...run);
      }
      i = j + 1;
    }

    list.forEach((r, idx) => {
      r.rank = idx + 1;
    });
    result.push({ label: g.label, entries: list });
  }
  return result;
}

/**
 * Build the knockout first-round pairings from group standings.
 *
 * - advance=1: group winners only, seeded by standings tiebreak, standard
 *   seed-order bracket placement (top seeds get byes if padded).
 * - advance>=2, even group count, no byes: clean cross-group pattern
 *   (Olympics-style): A1-B2, C1-D2, B1-A2, D1-C2 — group winners land on
 *   opposite bracket halves and can only meet in the final.
 * - Otherwise (byes / odd groups / withdrawals): top-ranked qualifiers get
 *   byes; the rest pair cross-group with same-group avoidance.
 *
 * Returns exactly bracketSize/2 pairs (bracketSize = next power of 2 of the
 * qualifier count); null slots are padded where needed.
 */
export function buildKOPairings(
  standings: GroupStandings[],
  advance: number
): KOPair[] {
  const adv = Math.max(1, advance ?? 2);
  const quals: KOQualifier[] = [];
  for (const g of standings) {
    const eligible = g.entries.filter((e) => !e.withdrawn).slice(0, adv);
    eligible.forEach((e, ri) => {
      quals.push({
        entry_id: e.entry_id,
        label: `${g.label}${ri + 1}`,
        group: g.label,
        rank: ri + 1,
        seed: e.seed ?? 9999,
        wins: e.wins,
        set_diff: e.set_diff,
        points_diff: e.points_diff,
      });
    });
  }

  const n = quals.length;
  if (n === 0) return [];
  const size = Math.pow(2, Math.ceil(Math.log2(n)));
  const byes = size - n;

  const byStats = (a: KOQualifier, b: KOQualifier): number => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.set_diff !== a.set_diff) return b.set_diff - a.set_diff;
    if (b.points_diff !== a.points_diff) return b.points_diff - a.points_diff;
    return (a.seed ?? 9999) - (b.seed ?? 9999);
  };

  const qual = (g: GroupStandings, r: number): KOQualifier | null =>
    quals.find((x) => x.group === g.label && x.rank === r) ?? null;

  let pairs: KOPair[] = [];

  if (
    byes === 0 &&
    adv >= 2 &&
    standings.length > 1 &&
    standings.length % 2 === 0
  ) {
    // Clean cross-group pattern (spec: A1-B2, C1-D2, B1-A2, D1-C2).
    // Cross pairs of a group-pair go on OPPOSITE halves (slots pIdx and
    // pIdx + half) so group winners can only meet in the final.
    const half = standings.length / 2;
    for (let gi = 0; gi + 1 < standings.length; gi += 2) {
      const g1 = standings[gi];
      const g2 = standings[gi + 1];
      const pIdx = gi / 2;
      const slotA = pIdx;
      const slotB = pIdx + half;
      while (pairs.length <= Math.max(slotA, slotB)) {
        pairs.push({ e1: null, e2: null });
      }
      pairs[slotA] = { e1: qual(g1, 1), e2: qual(g2, 2) };
      pairs[slotB] = { e1: qual(g2, 1), e2: qual(g1, 2) };
    }
  } else {
    // Seeded placement: rank asc, then stats desc; the top-ranked qualifiers
    // get byes (single-entry slots); the rest pair cross-group with
    // same-group avoidance.
    const ordered = [...quals].sort(
      (a, b) => a.rank - b.rank || byStats(a, b)
    );
    const byeIds = new Set(ordered.slice(0, byes).map((q) => q.entry_id));
    const rest = ordered.filter((q) => !byeIds.has(q.entry_id));
    pairs = [];
    for (const b of ordered.slice(0, byes)) pairs.push({ e1: b, e2: null });
    pairs.push(...pairCrossGroup(rest));
  }

  while (pairs.length < size / 2) pairs.push({ e1: null, e2: null });
  return pairs.slice(0, size / 2);
}

/** Pair qualifiers avoiding same-group pairs; singles when count is odd. */
function pairCrossGroup(rest: KOQualifier[]): KOPair[] {
  const arr = [...rest].sort(
    (a, b) => a.rank - b.rank || byStats2(a, b)
  );
  const pairs: KOPair[] = [];
  let i = 0;
  while (i < arr.length) {
    if (i + 1 >= arr.length) {
      pairs.push({ e1: arr[i], e2: null });
      break;
    }
    let j = i + 1;
    if (arr[j].group === arr[i].group) {
      let k = j + 1;
      while (k < arr.length && arr[k].group === arr[i].group) k++;
      if (k < arr.length) {
        const tmp = arr[j];
        arr[j] = arr[k];
        arr[k] = tmp;
      } else {
        pairs.push({ e1: arr[i], e2: null });
        i++;
        continue;
      }
    }
    pairs.push({ e1: arr[i], e2: arr[j] });
    i += 2;
  }
  return pairs;
}

function byStats2(a: KOQualifier, b: KOQualifier): number {
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.set_diff !== a.set_diff) return b.set_diff - a.set_diff;
  if (b.points_diff !== a.points_diff) return b.points_diff - a.points_diff;
  return (a.seed ?? 9999) - (b.seed ?? 9999);
}
