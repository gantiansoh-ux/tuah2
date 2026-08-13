/**
 * TUAH2 Enhanced Draw Engine
 * Supports: Knockout, Round Robin, Swiss, Double Elimination,
 *           Group + Knockout, Manual, Protected Draw, Club Separation
 */

export interface DrawEntry {
  entry_id: string;
  name: string;
  seed?: number;
  club?: string | null; // from profiles.club via player_1_id
}

export interface DrawMatch {
  match_number: number;
  round: string;
  round_index: number;
  entry_1_id: string | null;
  entry_2_id: string | null;
  court_number: number;
  next_match_id: string | null;
  loser_match_id?: string | null; // "loser:N" target for the loser (DE)
  bracket_group?: string | null; // "winners", "losers", "group-A", etc.
}

// ──────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────

function getRoundName(rIdx: number, bracketSize: number): string {
  const playersRemaining = bracketSize / Math.pow(2, rIdx);
  if (playersRemaining <= 2) return "Final";
  if (playersRemaining <= 4) return "SF";
  if (playersRemaining <= 8) return "QF";
  if (playersRemaining <= 16) return "R16";
  if (playersRemaining <= 32) return "R32";
  if (playersRemaining <= 64) return "R64";
  if (playersRemaining <= 128) return "R128";
  return `Round ${rIdx + 1}`;
}

function generateSeedOrder(size: number): number[] {
  if (size === 1) return [1];
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

function sortBySeed(entries: DrawEntry[]): DrawEntry[] {
  return [...entries].sort((a, b) => {
    if (a.seed && b.seed) return a.seed - b.seed;
    if (a.seed) return -1;
    if (b.seed) return 1;
    return a.name.localeCompare(b.name);
  });
}

function makeByeEntry(): DrawEntry {
  return { entry_id: "BYE", name: "BYE", seed: 9999 };
}

// ──────────────────────────────────────────
// KNOCKOUT (existing, enhanced with club support)
// ──────────────────────────────────────────

export function generateKnockoutBracket(
  entries: DrawEntry[],
  options?: { protectClubRounds?: number; clubSeparation?: boolean },
  courtCount: number = 10
): DrawMatch[] {
  const sorted = sortBySeed(entries);
  const size = Math.pow(2, Math.ceil(Math.log2(sorted.length)));
  const seedOrder = generateSeedOrder(size);

  const positions: (DrawEntry | null)[] = new Array(size).fill(null);

  // If club separation or protected draw, redistribute to keep clubs apart
  if (options?.clubSeparation || (options?.protectClubRounds ?? 0) > 0) {
    // Place entries with club info into bracket halves
    const placedIndices = new Set<number>();
    const clubGroups = new Map<string, DrawEntry[]>();

    for (const entry of sorted) {
      const club = entry.club || "__NO_CLUB__";
      if (!clubGroups.has(club)) clubGroups.set(club, []);
      clubGroups.get(club)!.push(entry);
    }

    // Place one per club into alternating halves
    const halves: DrawEntry[][] = [[], []]; // top half, bottom half
    let halfIdx = 0;
    let placedCount = 0;

    while (placedCount < sorted.length) {
      let anyPlaced = false;
      for (const [, group] of clubGroups) {
        const unplaced = group.filter((e) => !placedIndices.has(sorted.indexOf(e)));
        if (unplaced.length > 0) {
          halves[halfIdx % 2].push(unplaced[0]);
          placedIndices.add(sorted.indexOf(unplaced[0]));
          placedCount++;
          halfIdx++;
          anyPlaced = true;
        }
      }
      if (!anyPlaced) break;
    }

    const reordered = [...halves[0], ...halves[1]];

    for (let i = 0; i < reordered.length; i++) {
      const posIndex = seedOrder.indexOf(i + 1);
      if (posIndex !== -1 && posIndex < size) {
        positions[posIndex] = reordered[i];
      } else {
        const idx = positions.indexOf(null);
        if (idx !== -1) positions[idx] = reordered[i];
      }
    }
  } else {
    for (let i = 0; i < sorted.length; i++) {
      const posIndex = seedOrder.indexOf(i + 1);
      if (posIndex !== -1 && posIndex < size) {
        positions[posIndex] = sorted[i];
      } else {
        const idx = positions.indexOf(null);
        if (idx !== -1) positions[idx] = sorted[i];
      }
    }
  }

  // Fill empty positions with bye
  for (let i = 0; i < positions.length; i++) {
    if (!positions[i]) positions[i] = makeByeEntry();
  }

  const firstRound: { e1: DrawEntry; e2: DrawEntry }[] = [];
  for (let i = 0; i < size; i += 2) {
    firstRound.push({ e1: positions[i]!, e2: positions[i + 1]! });
  }

  // ── BYE HANDLING ────────────────────────────────────────────────────
  // Byes exist only in round 1 (size is a power of 2). The draw route
  // auto-completes bye matches (single real player wins) and auto-advances
  // the winner into the next round, so the engine itself only fills
  // round-1 slots. Later rounds are filled at runtime by auto-advance.
  type Pair = { e1: DrawEntry | null; e2: DrawEntry | null };
  const roundPairs: Pair[][] = [
    firstRound.map((p) => ({
      e1: p.e1.entry_id === "BYE" ? null : p.e1,
      e2: p.e2.entry_id === "BYE" ? null : p.e2,
    })),
  ];
  // Rounds 2+: all TBD (filled at runtime by match results).
  {
    let count = Math.floor(roundPairs[0].length / 2);
    while (count >= 1) {
      roundPairs.push(Array.from({ length: count }, () => ({ e1: null, e2: null })));
      count = Math.floor(count / 2);
    }
  }
  // ── END BYE HANDLING ────────────────────────────────────────────────

  const roundInfo: { start: number; count: number; rIdx: number }[] = [];
  let totalMatches = size / 2;
  let startNum = 1;
  let ri = 0;
  while (totalMatches >= 1) {
    roundInfo.push({ start: startNum, count: totalMatches, rIdx: ri });
    startNum += totalMatches;
    totalMatches = Math.floor(totalMatches / 2);
    ri++;
  }

  const matches: DrawMatch[] = [];
  for (const ri of roundInfo) {
    const { start, count } = ri;
    for (let i = 0; i < count; i++) {
      const matchNum = start + i;
      const roundName = getRoundName(ri.rIdx, size);
      let nextMatchId: string | null = null;
      const parentRound = roundInfo.find((r) => r.rIdx === ri.rIdx + 1);
      if (parentRound) {
        const parentIdx = Math.floor(i / 2);
        nextMatchId = `next:${parentRound.start + parentIdx}`;
      }
      const pair = roundPairs[ri.rIdx]?.[i];
      matches.push({
        match_number: matchNum,
        round: roundName,
        round_index: ri.rIdx,
        entry_1_id: pair?.e1?.entry_id ?? null,
        entry_2_id: pair?.e2?.entry_id ?? null,
        court_number: (matchNum % courtCount) + 1,
        next_match_id: nextMatchId,
      });
    }
  }
  return matches;
}

// ──────────────────────────────────────────
// ROUND ROBIN (existing)
// ──────────────────────────────────────────

export function generateRoundRobin(entries: DrawEntry[], courtCount: number = 10): DrawMatch[] {
  const n = entries.length;
  const matches: DrawMatch[] = [];
  let matchNum = 1;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      matches.push({
        match_number: matchNum,
        round: "Round Robin",
        round_index: 0,
        entry_1_id: entries[i].entry_id,
        entry_2_id: entries[j].entry_id,
        court_number: (matchNum % courtCount) + 1,
        next_match_id: null,
      });
      matchNum++;
    }
  }
  return matches;
}

// ──────────────────────────────────────────
// SWISS SYSTEM
// ──────────────────────────────────────────

export function generateSwissSystem(entries: DrawEntry[], rounds?: number, courtCount: number = 10): DrawMatch[] {
  const n = entries.length;
  if (n < 2) return [];

  // If rounds not specified, calculate: log2(n) + 1 rounded up
  const swissRounds = rounds ?? Math.ceil(Math.log2(n)) + 1;

  const matches: DrawMatch[] = [];
  let matchNum = 1;

  // Track standings: { entry_id, wins: number, opponents: Set<string> }
  const standings = new Map<string, { wins: number; opponents: Set<string> }>();
  for (const e of entries) {
    standings.set(e.entry_id, { wins: 0, opponents: new Set() });
  }

  // Map entry_id -> DrawEntry for quick lookup
  const entryMap = new Map<string, DrawEntry>();
  for (const e of entries) {
    entryMap.set(e.entry_id, e);
  }

  for (let roundIdx = 0; roundIdx < swissRounds; roundIdx++) {
    // Get unpaired entries sorted by wins (desc), then by seed (asc) for tiebreaker
    const unpaired = new Set<string>();
    for (const e of entries) {
      unpaired.add(e.entry_id);
    }

    const sortedEntries = [...entries].sort((a, b) => {
      const sa = standings.get(a.entry_id)!;
      const sb = standings.get(b.entry_id)!;
      if (sb.wins !== sa.wins) return sb.wins - sa.wins; // more wins first
      // Tiebreaker by seed
      const seedA = a.seed ?? 999;
      const seedB = b.seed ?? 999;
      return seedA - seedB;
    });

    // #46 fix: backtracking maximum matching per round.
    // Greedy first-fit could strand players (even n -> idle with no match AND no
    // bye). Backtracking maximizes the number of pairs; same-win opponents are
    // tried first. Bye is only awarded to the single leftover (odd n).
    const ids = [...unpaired];
    const sortedByIdx = ids
      .map((eid, i) => ({ eid, i }))
      .sort((a, b) => {
        const sa = standings.get(a.eid)!;
        const sb = standings.get(b.eid)!;
        if (sb.wins !== sa.wins) return sb.wins - sa.wins;
        const seedA = entryMap.get(a.eid)!.seed ?? 999;
        const seedB = entryMap.get(b.eid)!.seed ?? 999;
        return seedA - seedB;
      });

    let bestPairs: Array<[number, number]> = [];
    const used = new Array(ids.length).fill(false);

    const tryPair = (startIdx: number, pairs: Array<[number, number]>) => {
      // Prune: can't beat current best even if everything pairs
      const remaining = ids.length - pairs.length * 2;
      if (pairs.length + Math.floor(remaining / 2) <= bestPairs.length) return;
      // Find next unused (by sorted order, keeps determinism)
      let i = startIdx;
      while (i < sortedByIdx.length && used[sortedByIdx[i].i]) i++;
      if (i >= sortedByIdx.length) {
        if (pairs.length > bestPairs.length) bestPairs = [...pairs];
        return;
      }
      const iAbs = sortedByIdx[i].i;
      used[iAbs] = true;
      const e1Id = ids[iAbs];
      const e1Standing = standings.get(e1Id)!;
      // Candidate opponents: later in sorted order, unused, not played before.
      // Same-win opponents first (stable sort by win diff then seed).
      const candidates: number[] = [];
      for (let j = i + 1; j < sortedByIdx.length; j++) {
        const jAbs = sortedByIdx[j].i;
        if (used[jAbs]) continue;
        if (e1Standing.opponents.has(ids[jAbs])) continue;
        candidates.push(jAbs);
      }
      candidates.sort((a, b) => {
        const wa = standings.get(ids[a])!.wins;
        const wb = standings.get(ids[b])!.wins;
        const diff = Math.abs(e1Standing.wins - wa) - Math.abs(e1Standing.wins - wb);
        if (diff !== 0) return diff;
        const seedA = entryMap.get(ids[a])!.seed ?? 999;
        const seedB = entryMap.get(ids[b])!.seed ?? 999;
        return seedA - seedB;
      });
      for (const jAbs of candidates) {
        used[jAbs] = true;
        pairs.push([iAbs, jAbs]);
        tryPair(i + 1, pairs);
        pairs.pop();
        used[jAbs] = false;
        // If we already have a perfect pairing, stop early
        if (bestPairs.length === Math.floor(ids.length / 2)) break;
      }
      // Option: leave iAbs unpaired (only valid if odd total)
      tryPair(i + 1, pairs);
      used[iAbs] = false;
    };

    tryPair(0, []);

    // Commit best pairs
    for (const [aIdx, bIdx] of bestPairs) {
      const e1Id = ids[aIdx];
      const e2Id = ids[bIdx];
      unpaired.delete(e1Id);
      unpaired.delete(e2Id);
      standings.get(e1Id)!.opponents.add(e2Id);
      standings.get(e2Id)!.opponents.add(e1Id);
      matches.push({
        match_number: matchNum++,
        round: `Round ${roundIdx + 1}`,
        round_index: roundIdx,
        entry_1_id: e1Id,
        entry_2_id: e2Id,
        court_number: (matchNum % courtCount) + 1,
        next_match_id: null,
      });
    }

    // Handle odd player out — give a bye (recorded as win but no match)
    if (unpaired.size > 0) {
      const byeEntry = unpaired.values().next().value;
      if (byeEntry) {
        standings.get(byeEntry)!.wins += 1; // awarded win
      }
    }
  }

  return matches;
}

// ──────────────────────────────────────────
// DOUBLE ELIMINATION
// ──────────────────────────────────────────

export function generateDoubleElimination(entries: DrawEntry[], courtCount: number = 10): DrawMatch[] {
  const n = entries.length;

  // Must be power of 2: 4, 8, 16, 32
  if (n < 2) return [];
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));

  const matches: DrawMatch[] = [];
  let matchNum = 1;

  const sorted = sortBySeed(entries);
  const seedOrder = generateSeedOrder(bracketSize);

  const positions: (DrawEntry | null)[] = new Array(bracketSize).fill(null);
  for (let i = 0; i < sorted.length; i++) {
    const posIndex = seedOrder.indexOf(i + 1);
    if (posIndex !== -1 && posIndex < bracketSize) {
      positions[posIndex] = sorted[i];
    } else {
      const idx = positions.indexOf(null);
      if (idx !== -1) positions[idx] = sorted[i];
    }
  }
  // Fill byes
  for (let i = 0; i < positions.length; i++) {
    if (!positions[i]) positions[i] = makeByeEntry();
  }

  // Winners bracket: same as knockout
  const wbRounds: { start: number; count: number; rIdx: number }[] = [];
  let wbTotal = bracketSize / 2;
  let wbStart = 1;
  let wbRI = 0;
  while (wbTotal >= 1) {
    wbRounds.push({ start: wbStart, count: wbTotal, rIdx: wbRI });
    wbStart += wbTotal;
    wbTotal = Math.floor(wbTotal / 2);
    wbRI++;
  }

  // Winners bracket matches
  const wbFirstRound: { e1: DrawEntry; e2: DrawEntry }[] = [];
  for (let i = 0; i < bracketSize; i += 2) {
    wbFirstRound.push({ e1: positions[i]!, e2: positions[i + 1]! });
  }

  // ── BYE HANDLING (double elim winners bracket) ───────────────────────
  // Same rule: engine fills only round-1 slots; the draw route auto-
  // completes bye matches and advances winners. Later WB rounds are TBD.
  type WBPair = { e1: DrawEntry | null; e2: DrawEntry | null };
  const wbRoundPairs: WBPair[][] = [
    wbFirstRound.map((p) => ({
      e1: p.e1.entry_id === "BYE" ? null : p.e1,
      e2: p.e2.entry_id === "BYE" ? null : p.e2,
    })),
  ];
  {
    let count = Math.floor(wbRoundPairs[0].length / 2);
    while (count >= 1) {
      wbRoundPairs.push(Array.from({ length: count }, () => ({ e1: null, e2: null })));
      count = Math.floor(count / 2);
    }
  }
  // ── END BYE HANDLING ────────────────────────────────────────────────

  // Losers bracket rounds: one fewer than winners, losers from each WB round (except final)
  // WB Round 0 -> LB Round 0 (losers of WB R0 play each other)
  // WB Round 1 -> LB Round 1 (losers of WB R1 play winners of LB R0)
  // etc.

  // #49: correct LB structure. Counts: [B/4, B/4, B/8, B/8, ...] until 1.
  // Total LB matches = B - 2 (standard double elimination).
  const lbRounds: { start: number; count: number; rIdx: number }[] = [];
  let lbStart = wbStart; // continues from where WB ended
  // Standard DE LB: each match count appears TWICE, halving each pair:
  // [B/4, B/4, B/8, B/8, B/16, B/16, ...] down to 1. Total = B - 2 matches.
  // TUA10: correct LB counts. Each count appears TWICE, halving down to the
  // terminal pair of 1s: [B/4, B/4, B/8, B/8, ..., 1, 1]. Total LB matches = B-2.
  // KEEP BOTH trailing 1s: the last count-1 round is the LB champion match and
  // must receive exactly [winner of the second-to-last LB round] vs [WB Final
  // loser]. The OLD code ceil-halved and trimmed a duplicate 1, producing
  // [2,2,1] for B=8 (5 matches) so that single final round got 3 feeders
  // (2 LB winners + WB Final loser) -> the 3rd entrant was silently dropped
  // (publicated disappearing LB winner). floor()-halving terminates cleanly.
  const lbCounts: number[] = [];
  let c = Math.floor(bracketSize / 4);
  while (c >= 1) {
    lbCounts.push(c, c);
    c = Math.floor(c / 2);
  }
  let lbRI = 0;
  for (const lbCount of lbCounts) {
    lbRounds.push({ start: lbStart, count: lbCount, rIdx: lbRI });
    lbStart += lbCount;
    lbRI++;
  }

  // Generate Winners Bracket matches
  for (const r of wbRounds) {
    const { start, count } = r;

    // Only last round is labeled as Final
    const roundName =
      r.rIdx === wbRounds.length - 1 ? "WB Final" :
      r.rIdx === wbRounds.length - 2 ? "WB SF" :
      r.rIdx === wbRounds.length - 3 ? "WB QF" :
      r.rIdx === wbRounds.length - 4 ? "WB R16" :
      r.rIdx === wbRounds.length - 5 ? "WB R32" :
      `WB Round ${r.rIdx + 1}`;

    for (let i = 0; i < count; i++) {
      const matchNumVal = start + i;
      let nextMatch: string | null = null;
      const parent = wbRounds.find((wr) => wr.rIdx === r.rIdx + 1);
      if (parent) {
        const parentIdx = Math.floor(i / 2);
        nextMatch = `next:${parent.start + parentIdx}`;
      }

      // #49: loser -> LB. WB round r match i loser enters LB round (2r-1)
      // (WB R0 losers enter LB R0). Slot chosen by PATCH (first empty slot).
      let loserMatch: string | null = null;
      const isLastWb = r.rIdx === wbRounds.length - 1;
      if (r.rIdx === 0) {
        // WB R0 losers -> LB R0 match floor(i/2) (two QF losers share one LB match)
        const lb0 = lbRounds[0];
        if (lb0) loserMatch = `loser:${lb0.start + Math.floor(i / 2)}`;
      } else if (!isLastWb) {
        // WB round r (1..k-2) losers -> LB round (2r-1), 1:1 per match (+i)
        const lbTarget = lbRounds[2 * r.rIdx - 1];
        if (lbTarget) loserMatch = `loser:${lbTarget.start + i}`;
      } else {
        // WB Final loser -> last LB round (LB champion match)
        const lastLb = lbRounds[lbRounds.length - 1];
        if (lastLb) loserMatch = `loser:${lastLb.start}`;
      }

      const wbPair = wbRoundPairs[r.rIdx]?.[i];
      matches.push({
        match_number: matchNumVal,
        round: roundName,
        round_index: r.rIdx,
        entry_1_id: wbPair?.e1?.entry_id ?? null,
        entry_2_id: wbPair?.e2?.entry_id ?? null,
        court_number: (matchNumVal % courtCount) + 1,
        next_match_id: nextMatch,
        loser_match_id: loserMatch,
        bracket_group: "winners",
      });
    }
  }

  // Generate Losers Bracket matches
  for (const lr of lbRounds) {
    const { start, count } = lr;

    const roundName =
      lr.rIdx === 0 ? "LB Round 1" :
      `LB Round ${lr.rIdx + 1}`;

    for (let i = 0; i < count; i++) {
      const matchNumVal = start + i;
      let nextMatch: string | null = null;
      let loserMatch: string | null = null;

      // Losers advance to next LB round (they're out if this is the last LB round)
      const nextLbRound = lbRounds.find((lr2) => lr2.rIdx === lr.rIdx + 1);
      if (nextLbRound) {
        // 1:1 when counts equal (same-size rounds), else two feed one (halving)
        const parentIdx = nextLbRound.count === lr.count ? i : Math.floor(i / 2);
        nextMatch = `next:${nextLbRound.start + parentIdx}`;
        loserMatch = null; // loser of this LB round is eliminated in standard DE
      } else {
        // Last LB round winner feeds into Grand Final; loser is eliminated
        nextMatch = `next:gf`;
        loserMatch = null;
      }

      matches.push({
        match_number: matchNumVal,
        round: roundName,
        round_index: wbRounds.length + lr.rIdx,
        entry_1_id: null,
        entry_2_id: null,
        court_number: (matchNumVal % courtCount) + 1,
        next_match_id: nextMatch,
        loser_match_id: loserMatch,
        bracket_group: "losers",
      });
    }
  }

  // Grand Final (Winners Bracket champ vs Losers Bracket champ)
  // If WB champ wins, tournament over. If LB champ wins, a second match is played.
  const gfMatchNum = lbStart;
  matches.push({
    match_number: gfMatchNum,
    round: "Grand Final",
    round_index: wbRounds.length + lbRounds.length,
    entry_1_id: null,
    entry_2_id: null,
    court_number: 1,
    next_match_id: null,
    loser_match_id: `loser:${gfMatchNum + 1}`, // GF loser -> GF2 (PATCH decides when)
    bracket_group: "grand_final",
  });

  // Second Grand Final (if needed)
  matches.push({
    match_number: gfMatchNum + 1,
    round: "Grand Final (2nd)",
    round_index: wbRounds.length + lbRounds.length + 1,
    entry_1_id: null,
    entry_2_id: null,
    court_number: 2,
    next_match_id: null,
    loser_match_id: null, // winner of GF2 is champion
    bracket_group: "grand_final",
  });

  // Wire up WB final to GF
  const wbFinal = wbRounds[wbRounds.length - 1];
  if (wbFinal) {
    // Update WB final match to point to GF
    const wbFinalIdx = matches.findIndex(
      (m) => m.match_number === wbFinal.start
    );
    if (wbFinalIdx !== -1) {
      matches[wbFinalIdx] = {
        ...matches[wbFinalIdx],
        next_match_id: `next:${gfMatchNum}`,
      };
    }
  }

  // Wire up last LB round to GF
  const lastLb = lbRounds[lbRounds.length - 1];
  if (lastLb) {
    const lastLbIdx = matches.findIndex(
      (m) => m.match_number === lastLb.start + lastLb.count - 1
    );
    if (lastLbIdx !== -1) {
      matches[lastLbIdx] = {
        ...matches[lastLbIdx],
        next_match_id: `next:${gfMatchNum}`,
      };
    }
  }

  return matches;
}

// ──────────────────────────────────────────
// GROUP + KNOCKOUT
// ──────────────────────────────────────────

export function generateGroupKnockout(
  entries: DrawEntry[],
  numGroups: number | undefined = undefined,
  advancePerGroup: number = 2
,
  courtCount: number = 10
): DrawMatch[] {
  const n = entries.length;
  if (n < 2) return [];
  // Smart default: groups of ~4-5 players so group stage is meaningful.
  // 8 -> 2 groups x 4, 16 -> 4 groups x 4, 10 -> 2 groups x 5.
  const defaultGroups = Math.max(1, Math.min(4, Math.floor(n / 4)));
  const effectiveGroups = Math.min(numGroups ?? defaultGroups, n);
  const sorted = sortBySeed(entries);

  const matches: DrawMatch[] = [];
  let matchNum = 1;

  // Distribute players into groups (snake draft by seed)
  const groups: DrawEntry[][] = Array.from({ length: effectiveGroups }, () => []);
  for (let i = 0; i < sorted.length; i++) {
    const groupIdx = i % effectiveGroups;
    groups[groupIdx].push(sorted[i]);
  }

  // Group Round Robin matches
  for (let gIdx = 0; gIdx < groups.length; gIdx++) {
    const group = groups[gIdx];
    const groupLabel = String.fromCharCode(65 + gIdx); // A, B, C, ...

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        matches.push({
          match_number: matchNum++,
          round: `Group ${groupLabel}`,
          round_index: 0,
          entry_1_id: group[i].entry_id,
          entry_2_id: group[j].entry_id,
          court_number: (matchNum % courtCount) + 1,
          next_match_id: null,
          bracket_group: `group-${groupLabel}`,
        });
      }
    }
  }

  // #47: Knockout stage is created with EMPTY slots ("awaiting group results").
  // Slots are filled with cross-group pairings (A1-B2, B1-A2, ...) by the
  // standings engine once ALL group matches complete.
  const minGroupSize = groups.reduce(
    (acc, g) => Math.min(acc, g.length),
    Infinity
  );
  const advance = Math.max(1, advancePerGroup ?? 2);
  const qualifierCount = Math.min(advance, minGroupSize) * effectiveGroups;
  const koSize = Math.pow(2, Math.ceil(Math.log2(Math.max(2, qualifierCount))));

  const koRoundInfo: { start: number; count: number; rIdx: number }[] = [];
  let totalMatches = koSize / 2;
  let koRI = 0;
  while (totalMatches >= 1) {
    koRoundInfo.push({ start: matchNum, count: totalMatches, rIdx: koRI });
    matchNum += totalMatches;
    totalMatches = Math.floor(totalMatches / 2);
    koRI++;
  }

  for (const r of koRoundInfo) {
    for (let i = 0; i < r.count; i++) {
      const mNum = r.start + i;
      const roundName = getRoundName(r.rIdx, koSize);
      let nextMatchId: string | null = null;
      const parent = koRoundInfo.find((x) => x.rIdx === r.rIdx + 1);
      if (parent) {
        nextMatchId = `next:${parent.start + Math.floor(i / 2)}`;
      }
      matches.push({
        match_number: mNum,
        round: roundName,
        round_index: r.rIdx,
        entry_1_id: null,
        entry_2_id: null,
        court_number: (mNum % courtCount) + 1,
        next_match_id: nextMatchId,
        bracket_group: "ko",
      });
    }
  }

  return matches;
}

// ──────────────────────────────────────────
// MANUAL DRAW
// ──────────────────────────────────────────

export function generateManualDraw(entries: DrawEntry[], courtCount: number = 10): DrawMatch[] {
  // Manual draw: all entries placed in first round, organizer assigns positions later
  // Just create placeholder matches with empty slots
  const n = entries.length;
  if (n < 2) return [];

  const size = Math.pow(2, Math.ceil(Math.log2(n)));
  const roundName = "Manual Round 1";
  const matches: DrawMatch[] = [];
  let matchNum = 1;

  // Place entries in order, let organizer rearrange
  const sorted = sortBySeed(entries);
  const slotCount = size / 2;

  for (let i = 0; i < slotCount; i++) {
    const e1 = sorted[i * 2]?.entry_id || null;
    const e2 = sorted[i * 2 + 1]?.entry_id || null;

    matches.push({
      match_number: matchNum++,
      round: roundName,
      round_index: 0,
      entry_1_id: e1,
      entry_2_id: e2,
      court_number: (i % courtCount) + 1,
      next_match_id: null, // organizer sets progression manually
    });
  }

  return matches;
}

// ──────────────────────────────────────────
// PROTECTED DRAW (same club avoidance)
// ──────────────────────────────────────────

export function generateProtectedDraw(
  entries: DrawEntry[],
  separationRounds: number = 2,
  courtCount: number = 10
): DrawMatch[] {
  const sorted = sortBySeed(entries);
  const size = Math.pow(2, Math.ceil(Math.log2(sorted.length)));

  // Group entries by club
  const clubGroups = new Map<string, DrawEntry[]>();
  for (const e of sorted) {
    const club = e.club || null;
    const key = club || `__no_club_${e.entry_id}`;
    if (!clubGroups.has(key)) clubGroups.set(key, []);
    clubGroups.get(key)!.push(e);
  }

  // Distribute: place one entry from each club at a time into bracket positions
  const seedOrder = generateSeedOrder(size);
  const positions: (DrawEntry | null)[] = new Array(size).fill(null);
  const placedIndices = new Set<number>();
  const allEntries = [...sorted];
  let posIdx = 0;

  while (placedIndices.size < allEntries.length) {
    let anyPlaced = false;
    for (const [, group] of clubGroups) {
      const unplaced = group.filter(
        (e) => !placedIndices.has(allEntries.indexOf(e))
      );
      if (unplaced.length > 0) {
        // Place at next available seed position
        while (posIdx < seedOrder.length) {
          const seedPos = seedOrder.indexOf(posIdx + 1);
          if (seedPos !== -1 && seedPos < size && !positions[seedPos]) {
            positions[seedPos] = unplaced[0];
            placedIndices.add(allEntries.indexOf(unplaced[0]));
            posIdx++;
            anyPlaced = true;
            break;
          }
          posIdx++;
        }
      }
    }
    if (!anyPlaced) break;
  }

  // Fill remaining with bye or remaining entries
  for (let i = 0; i < size; i++) {
    if (!positions[i]) {
      const remaining = allEntries.find((e) => !placedIndices.has(allEntries.indexOf(e)));
      if (remaining) {
        positions[i] = remaining;
        placedIndices.add(allEntries.indexOf(remaining));
      } else {
        positions[i] = makeByeEntry();
      }
    }
  }

  // Generate knockout matches with club protection
  const matches: DrawMatch[] = [];
  const firstRound: { e1: DrawEntry; e2: DrawEntry }[] = [];
  for (let i = 0; i < size; i += 2) {
    firstRound.push({ e1: positions[i]!, e2: positions[i + 1]! });
  }

  const roundInfo: { start: number; count: number; rIdx: number }[] = [];
  let totalMatches = size / 2;
  let startNum = 1;
  let ri = 0;
  while (totalMatches >= 1) {
    roundInfo.push({ start: startNum, count: totalMatches, rIdx: ri });
    startNum += totalMatches;
    totalMatches = Math.floor(totalMatches / 2);
    ri++;
  }

  for (const r of roundInfo) {
    const { start, count } = r;
    for (let i = 0; i < count; i++) {
      const matchNum = start + i;
      const roundName = r.rIdx < separationRounds
        ? `Protected Round ${r.rIdx + 1}`
        : getRoundName(r.rIdx, size);

      let nextMatchId: string | null = null;
      const parentRound = roundInfo.find((pr) => pr.rIdx === r.rIdx + 1);
      if (parentRound) {
        const parentIdx = Math.floor(i / 2);
        nextMatchId = `next:${parentRound.start + parentIdx}`;
      }

      let e1: string | null = null;
      let e2: string | null = null;
      if (r.rIdx === 0) {
        const f = firstRound[i];
        e1 = f?.e1?.entry_id === "BYE" ? null : f?.e1?.entry_id || null;
        e2 = f?.e2?.entry_id === "BYE" ? null : f?.e2?.entry_id || null;
      }

      matches.push({
        match_number: matchNum,
        round: roundName,
        round_index: r.rIdx,
        entry_1_id: e1,
        entry_2_id: e2,
        court_number: (matchNum % courtCount) + 1,
        next_match_id: nextMatchId,
      });
    }
  }

  return matches;
}

// ──────────────────────────────────────────
// CLUB SEPARATION (full enforcement)
// ──────────────────────────────────────────

export function generateClubSeparation(entries: DrawEntry[], courtCount: number = 10): DrawMatch[] {
  // Same as protected draw but enforced for all rounds
  return generateProtectedDraw(entries, 99);
}

// ──────────────────────────────────────────
// AUTO DRAW (detect & route)
// ──────────────────────────────────────────

export type DrawFormatType =
  | 'knockout'
  | 'round_robin'
  | 'swiss'
  | 'double_elimination'
  | 'group_knockout'
  | 'manual'
  | 'protected'
  | 'club_separation';

export interface DrawOptions {
  format: DrawFormatType;
  swissRounds?: number;
  numGroups?: number;
  advancePerGroup?: number;
  separationRounds?: number;
  courtCount?: number; // number of courts for round-robin scheduling
}

export function autoGenerateDraw(
  entries: DrawEntry[],
  format?: DrawFormatType | 'knockout' | 'round_robin',
  options?: Partial<DrawOptions>
): {
  type: DrawFormatType | 'round-robin' | 'knockout';
  matches: DrawMatch[];
} {
  const courtCount = Math.max(1, options?.courtCount || 10);
  const fmt: DrawFormatType = format
    ? (format as DrawFormatType)
    : entries.length <= 4
    ? 'round_robin'
    : 'knockout';

  switch (fmt) {
    case 'swiss':
      return { type: 'swiss', matches: generateSwissSystem(entries, options?.swissRounds, courtCount) };
    case 'double_elimination':
      return { type: 'double_elimination', matches: generateDoubleElimination(entries, courtCount) };
    case 'group_knockout':
      return {
        type: 'group_knockout',
        matches: generateGroupKnockout(entries, options?.numGroups, options?.advancePerGroup ?? 2, courtCount),
      };
    case 'manual':
      return { type: 'manual', matches: generateManualDraw(entries, courtCount) };
    case 'protected':
      return { type: 'protected', matches: generateProtectedDraw(entries, options?.separationRounds ?? 2, courtCount) };
    case 'club_separation':
      return { type: 'club_separation', matches: generateClubSeparation(entries, courtCount) };
    case 'round_robin':
      return { type: 'round-robin', matches: generateRoundRobin(entries, courtCount) };
    case 'knockout':
    default:
      return { type: 'knockout', matches: generateKnockoutBracket(entries, undefined, courtCount) };
  }
}
