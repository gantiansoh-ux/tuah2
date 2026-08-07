"use client";

// BracketView — single-elimination bracket TREE layout (SPEC 1, Lucy's math)
// Columns: first round leftmost, FINAL rightmost; each later-round match is
// vertically centered between its two feeder matches (indices 2i, 2i+1 of the
// previous round). Connector polylines drawn in an SVG behind the cards.
// Canvas height is exact by construction -> FINAL sits at the vertical center.

interface BracketMatch {
  id: string;
  match_number: number;
  round: string;
  round_index?: number;
  entry_1_id: string | null;
  entry_2_id: string | null;
  next_match_id: string | null;
  status: string;
  court_name: string | null;
  court_number?: number | null;
  winner_entry_id: string | null;
  game1_1?: number; game1_2?: number;
  game2_1?: number; game2_2?: number;
  game3_1?: number; game3_2?: number;
}

interface BracketViewProps {
  matches: BracketMatch[];
  getPlayerName: (entryId: string | null) => string;
  courtLabel?: (match: BracketMatch) => string;
  /** #47: entry_id -> group badge ("A1", "B2") for Group+KO qualifiers */
  entryBadges?: Record<string, string>;
  /** #47: true while group stage is still running (KO slots empty) */
  awaitingGroupResults?: boolean;
}

const ROUND_RANK: Record<string, number> = {
  "Final": 0, "SF": 1, "QF": 2, "R16": 3, "R32": 4, "R64": 5, "R128": 6,
};
const ROUND_RANK_MAX = 6;

/** Display column index: 0 = first round (leftmost). Engine data carries
 *  round_index (0 = first KO round) — use it directly. Legacy fallback maps
 *  ROUND_RANK (Final=0) inverted so the first round is still leftmost. */
function getRoundIndex(m: BracketMatch): number {
  if (m.round_index !== undefined) return m.round_index;
  if (ROUND_RANK[m.round] !== undefined) return ROUND_RANK_MAX - ROUND_RANK[m.round];
  const match = m.round.match(/Round (\d+)/);
  if (match) return parseInt(match[1]) - 1;
  return 0;
}

function bracketRows(matches: BracketMatch[]): BracketMatch[][] {
  const grouped: Record<number, BracketMatch[]> = {};
  for (const m of matches) {
    const ri = getRoundIndex(m);
    if (!grouped[ri]) grouped[ri] = [];
    grouped[ri].push(m);
  }
  const keys = Object.keys(grouped).map(Number).sort((a, b) => a - b);
  return keys.map((k) => grouped[k].sort((a, b) => a.match_number - b.match_number));
}

function getScoreDisplay(m: BracketMatch, isP1: boolean): string {
  if (m.game1_1 === undefined) return "";
  const gs: number[] = [m.game1_1 === undefined ? 0 : (isP1 ? m.game1_1! : m.game1_2!)];
  if (m.game2_1 !== undefined) {
    gs.push(isP1 ? m.game2_1! : m.game2_2!);
    if (m.game3_1 !== undefined) gs.push(isP1 ? m.game3_1! : m.game3_2!);
  }
  return gs.join("-");
}

// ---------- SPEC 1 layout constants ----------
const CARD_W = 240;
const CARD_H = 116; // 2 rows x 48 + 20px footer room (court tag) - Lucy v3 QA
const GAP_Y = 24;
const GAP_X = 96;
const PAD = 24;

export default function BracketView({
  matches,
  getPlayerName,
  courtLabel,
  entryBadges,
  awaitingGroupResults,
}: BracketViewProps) {
  const rounds = bracketRows(matches);

  if (rounds.length === 0) {
    return (
      <div className="flex items-center justify-center bg-white rounded-xl border border-dashed border-gray-300 py-16 text-gray-400 text-sm">
        🏸 Draw not generated yet
      </div>
    );
  }

  const n0 = rounds[0].length;
  const ROUNDS = rounds.length;
  const canvasW = PAD * 2 + ROUNDS * CARD_W + (ROUNDS - 1) * GAP_X;
  const canvasH = PAD * 2 + n0 * CARD_H + (n0 - 1) * GAP_Y;
  const roundXs = rounds.map((_, r) => PAD + r * (CARD_W + GAP_X));

  /** Top y of match i in round r (feeder-centering for r>0). */
  const yOf = (r: number, i: number): number => {
    if (r === 0) return PAD + i * (CARD_H + GAP_Y);
    const A = rounds[r - 1][2 * i];
    const B = rounds[r - 1][2 * i + 1];
    const yA = A ? yOf(r - 1, 2 * i) : null;
    const yB = B ? yOf(r - 1, 2 * i + 1) : null;
    if (yA !== null && yB !== null) return (yA + yB) / 2;
    if (yA !== null) return yA; // bye: sit on the single feeder
    if (yB !== null) return yB;
    return PAD + i * (CARD_H + GAP_Y);
  };

  const centerY = (r: number, i: number) => yOf(r, i) + CARD_H / 2;

  /** Build polyline connector geometry for round r > 0. */
  const connectors: {
    key: string;
    path: string;
    feederWinners: number; // how many feeders have a decided winner
  }[] = [];
  for (let r = 1; r < ROUNDS; r++) {
    for (let i = 0; i < rounds[r].length; i++) {
      const A = rounds[r - 1][2 * i];
      const B = rounds[r - 1][2 * i + 1];
      if (!A && !B) continue;
      const xFromRight = roundXs[r - 1] + CARD_W;
      const xMid = roundXs[r - 1] + CARD_W + GAP_X / 2;
      const xTo = roundXs[r];
      let feederWinners = 0;
      const segs: string[] = [];
      if (A) {
        const cA = centerY(r - 1, 2 * i);
        segs.push(`M ${xFromRight} ${cA} L ${xMid} ${cA}`);
        if (A.winner_entry_id) feederWinners++;
      }
      if (B) {
        const cB = centerY(r - 1, 2 * i + 1);
        segs.push(`M ${xFromRight} ${cB} L ${xMid} ${cB}`);
        if (B.winner_entry_id) feederWinners++;
      }
      const cA = A ? centerY(r - 1, 2 * i) : centerY(r - 1, 2 * i + 1);
      const cB = B ? centerY(r - 1, 2 * i + 1) : cA;
      const cM = centerY(r, i);
      segs.push(`M ${xMid} ${cA} L ${xMid} ${cB}`);
      segs.push(`M ${xMid} ${cM} L ${xTo} ${cM}`);
      connectors.push({ key: `c-${r}-${i}`, path: segs.join(" "), feederWinners });
    }
  }

  return (
    <div className="overflow-x-auto pb-4">
      <div
        className="relative"
        style={{ width: canvasW, height: canvasH, minWidth: canvasW }}
      >
        {/* Connector lines (behind cards) */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={canvasW}
          height={canvasH}
          style={{ zIndex: 0 }}
        >
          {connectors.map((c) => (
            <path
              key={c.key}
              d={c.path}
              fill="none"
              stroke={c.feederWinners > 0 ? "#16a34a" : "#cbd5e1"}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={c.feederWinners > 0 ? 0.9 : 1}
            />
          ))}
        </svg>

        {/* Round labels (sit in the top padding band; math untouched) */}
        {rounds.map((col, r) => (
          <div
            key={`h-${r}`}
            className="absolute text-center"
            style={{ left: roundXs[r] + CARD_W / 2, top: 3, transform: "translateX(-50%)", zIndex: 5 }}
          >
            <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full uppercase tracking-wider whitespace-nowrap">
              {col[0]?.round || `Round ${r + 1}`}
            </span>
          </div>
        ))}

        {/* Match cards */}
        {rounds.map((col, r) =>
          col.map((m, mi) => {
            const p1Raw = m.entry_1_id ? getPlayerName(m.entry_1_id) : null;
            const p2Raw = m.entry_2_id ? getPlayerName(m.entry_2_id) : null;
            const isFirstRound = r === 0;
            const awaiting1 = awaitingGroupResults && isFirstRound && !m.entry_1_id;
            const awaiting2 = awaitingGroupResults && isFirstRound && !m.entry_2_id;
            const p1 = p1Raw ?? (awaiting1 ? "Awaiting group results" : "TBD");
            const p2 = p2Raw ?? (awaiting2 ? "Awaiting group results" : "TBD");
            const b1 = m.entry_1_id ? entryBadges?.[m.entry_1_id] : undefined;
            const b2 = m.entry_2_id ? entryBadges?.[m.entry_2_id] : undefined;
            const isP1Winner = !!m.entry_1_id && m.winner_entry_id === m.entry_1_id;
            const isP2Winner = !!m.entry_2_id && m.winner_entry_id === m.entry_2_id;
            const isLive = m.status === "playing" || m.status === "in_progress";
            const isDone = m.status === "completed";
            const isBye = !m.entry_1_id || !m.entry_2_id;
            const p1Score = getScoreDisplay(m, true);
            const p2Score = getScoreDisplay(m, false);
            const hasScores = p1Score.length > 0;
            const courtTxt = courtLabel ? courtLabel(m) : "";

            const Row = ({
              side,
              name,
              badge,
              score,
              isWinner,
              awaiting,
            }: {
              side: "1" | "2";
              name: string;
              badge?: string;
              score: string;
              isWinner: boolean;
              awaiting: boolean;
            }) => (
              <div
                className={`px-3 flex items-center justify-between h-12 border-b border-gray-50 ${
                  side === "2" ? "border-b-0" : ""
                } ${isWinner ? "bg-emerald-50" : ""}`}
              >
                <span className="flex items-center gap-1 min-w-0">
                  {badge && (
                    <span className="text-[9px] font-bold bg-indigo-100 text-indigo-700 px-1 py-0.5 rounded shrink-0">
                      {badge}
                    </span>
                  )}
                  <span
                    className={`text-xs truncate max-w-[130px] ${
                      awaiting
                        ? "italic text-gray-300"
                        : isWinner
                          ? "font-bold text-emerald-700"
                          : "text-gray-700"
                    }`}
                  >
                    {name}
                  </span>
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  {score && (
                    <span className={`text-[11px] font-mono ${isWinner ? "font-bold text-emerald-600" : "text-gray-400"}`}>
                      {score}
                    </span>
                  )}
                  {isWinner && <span className="text-emerald-600 text-xs font-bold">✓</span>}
                  {isLive && !score && (
                    <span className={`text-[10px] ${side === "1" ? "text-green-600" : "text-blue-600"}`}>●</span>
                  )}
                </span>
              </div>
            );

            return (
              <div
                key={m.id}
                className={`absolute bg-white rounded-lg border border-gray-200 shadow-sm
                  ${isLive ? "border-l-4 border-l-green-500 ring-2 ring-green-100" : ""}
                  ${isBye ? "opacity-40" : ""}
                  transition-all hover:shadow-md`}
                style={{ left: roundXs[r], top: yOf(r, mi), width: CARD_W, height: CARD_H, zIndex: 20 }}
              >
                {/* Match number badge */}
                <div className="absolute -top-1 -right-1 bg-gray-100 rounded-bl-md px-1.5 py-0.5 z-30">
                  <span className="text-[10px] text-gray-400 font-mono">{m.match_number}</span>
                </div>
                {courtTxt && (
                  <div className="absolute -bottom-1 -left-1 bg-gray-50 rounded-tr-md px-1.5 py-0.5 z-30">
                    <span className="text-[9px] text-gray-400 font-mono">{courtTxt}</span>
                  </div>
                )}
                <Row side="1" name={p1} badge={b1} score={p1Score} isWinner={isP1Winner} awaiting={awaiting1} />
                <Row side="2" name={p2} badge={b2} score={p2Score} isWinner={isP2Winner} awaiting={awaiting2} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
