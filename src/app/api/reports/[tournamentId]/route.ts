import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { queryAll, queryOne } from "@/lib/db";
import * as XLSX from "xlsx";

// GET /api/reports/[tournamentId]?type=draw|completed
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { tournamentId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tournamentId)) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }
  const type = req.nextUrl.searchParams.get("type") || "completed";
  if (type !== "draw" && type !== "completed") {
    return NextResponse.json({ error: "Invalid type. Use ?type=draw or ?type=completed" }, { status: 400 });
  }

  // Auth: organizer (or admin) only — reports expose full player PII (names, docs)
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // 1) Tournament
    const tournament = await queryOne("SELECT * FROM tournaments WHERE id = $1", [tournamentId]);
    if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    if (tournament.organizer_id !== payload.userId && payload.role !== 'admin') {
      return NextResponse.json({ error: "Forbidden — not your tournament" }, { status: 403 });
    }

    // 2) Categories
    const categories = await queryAll(
      "SELECT * FROM categories WHERE tournament_id = $1 ORDER BY name",
      [tournamentId]
    );

    // 3) Matches with related data
    const matches = await queryAll(
      `SELECT m.*, c.name AS category_name,
              e1p.full_name AS entry1_p1, e1p2.full_name AS entry1_p2,
              e2p.full_name AS entry2_p1, e2p2.full_name AS entry2_p2,
              up.full_name AS umpire_name
       FROM matches m
       JOIN categories c ON m.category_id = c.id
       LEFT JOIN entries e1 ON m.entry_1_id = e1.id
       LEFT JOIN profiles e1p ON e1.player_1_id = e1p.id
       LEFT JOIN profiles e1p2 ON e1.player_2_id = e1p2.id
       LEFT JOIN entries e2 ON m.entry_2_id = e2.id
       LEFT JOIN profiles e2p ON e2.player_1_id = e2p.id
       LEFT JOIN profiles e2p2 ON e2.player_2_id = e2p2.id
       LEFT JOIN profiles up ON m.umpire_id = up.id
       WHERE m.tournament_id = $1
       ORDER BY c.name, m.round DESC, m.match_number`,
      [tournamentId]
    );

    // 4) Games
    const games = await queryAll(
      `SELECT g.*, m.match_number, m.round, c.name AS category_name
       FROM games g
       JOIN matches m ON g.match_id = m.id
       JOIN categories c ON m.category_id = c.id
       WHERE m.tournament_id = $1
       ORDER BY c.name, m.round DESC, m.match_number, g.game_number`,
      [tournamentId]
    );

    // 5) Entries with player names
    const entries = await queryAll(
      `SELECT e.*, p1.full_name AS player_1_name, p2.full_name AS player_2_name, c.name AS category_name
       FROM entries e
       LEFT JOIN profiles p1 ON e.player_1_id = p1.id
       LEFT JOIN profiles p2 ON e.player_2_id = p2.id
       JOIN categories c ON e.category_id = c.id
       WHERE e.category_id IN (SELECT id FROM categories WHERE tournament_id = $1)
       ORDER BY c.name, e.seed NULLS LAST`,
      [tournamentId]
    );

    // Build workbook
    const wb = XLSX.utils.book_new();

    if (type === "draw") {
      buildDrawReport(wb, tournament, categories, matches, entries);
    } else {
      buildCompletedReport(wb, tournament, categories, matches, entries, games);
    }

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `${tournament.title || "tournament"}_${type === "draw" ? "draw" : "results"}.xlsx`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (err: any) {
    console.error("Report error:", err);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}

function pn(m: any, prefix: string): string {
  const p1 = m[prefix + "_p1"] || "";
  const p2 = m[prefix + "_p2"] || "";
  if (p1 && p2) return p1 + " / " + p2;
  return p1 || "TBD";
}

function formatScore(g: any): string {
  if (!g) return "";
  const s1 = g.score_1 ?? "";
  const s2 = g.score_2 ?? "";
  return s1 + "-" + s2;
}

function rndSortKey(round: string): number {
  const order: Record<string, number> = { "Final": 0, "SF": 1, "QF": 2, "R16": 3, "R32": 4 };
  return order[round] ?? 99;
}

function buildDrawReport(wb: XLSX.WorkBook, tournament: any, categories: any[], matches: any[], entries: any[]) {
  // Sheet 1: Overview
  const rows1: any[][] = [
    ["Tournament", tournament.title || ""],
    ["Draw Report"],
    [],
    ["Category", "Entries", "Matches", "Rounds"],
  ];
  for (const cat of categories) {
    const cm = matches.filter((m: any) => m.category_id === cat.id);
    const ce = entries.filter((e: any) => e.category_id === cat.id);
    const rounds = new Set(cm.map((m: any) => m.round)).size;
    rows1.push([cat.name, ce.length, cm.length, rounds]);
  }
  const ws1 = XLSX.utils.aoa_to_sheet(rows1);
  ws1["!cols"] = [{ wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Overview");

  // Sheet 2: Match Fixtures (Bracket)
  const rows2: any[][] = [
    ["Category", "Round", "Match#", "Player 1", "Player 2", "Status", "Court", "Umpire"],
  ];
  for (const cat of categories) {
    const cm = matches.filter((m: any) => m.category_id === cat.id)
      .sort((a: any, b: any) => rndSortKey(b.round) - rndSortKey(a.round) || a.match_number - b.match_number);
    for (const m of cm) {
      rows2.push([
        cat.name,
        m.round,
        m.match_number,
        pn(m, "entry1"),
        pn(m, "entry2"),
        m.status === "completed" ? "Done" : m.status === "playing" ? "Live" : "Pending",
        m.court_number ? "Court " + m.court_number : "",
        m.umpire_name || "",
      ]);
    }
  }
  const ws2 = XLSX.utils.aoa_to_sheet(rows2);
  ws2["!cols"] = [{ wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 30 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Bracket");

  // Sheet 3: Entries
  const rows3: any[][] = [
    ["Category", "Seed", "Player / Pair", "Status"],
  ];
  for (const e of entries) {
    rows3.push([
      e.category_name,
      e.seed || "-",
      e.player_1_name + (e.player_2_name ? " / " + e.player_2_name : ""),
      e.status === "approved" ? "Confirmed" : "Pending",
    ]);
  }
  const ws3 = XLSX.utils.aoa_to_sheet(rows3);
  ws3["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 30 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws3, "Entries");
}

function buildCompletedReport(wb: XLSX.WorkBook, tournament: any, categories: any[], matches: any[], entries: any[], games: any[]) {
  // Sheet 1: Results Overview
  const rows1: any[][] = [
    ["Tournament", tournament.title || ""],
    ["Results Report"],
    [],
    ["Category", "Champion", "Runner-Up", "Semifinalists", "Total Matches", "Completed"],
  ];
  for (const cat of categories) {
    const cm = matches.filter((m: any) => m.category_id === cat.id);
    const total = cm.length;
    const done = cm.filter((m: any) => m.status === "completed").length;

    const finalMatch = cm.find((m: any) => m.round === "Final");
    const sfMatches = cm.filter((m: any) => m.round === "SF");

    let champ = "", runner = "";
    if (finalMatch && finalMatch.winner_entry_id) {
      const wId = finalMatch.winner_entry_id;
      const lId = finalMatch.entry_1_id === wId ? finalMatch.entry_2_id : finalMatch.entry_1_id;
      const wEntry = entries.find((e: any) => e.id === wId);
      const lEntry = entries.find((e: any) => e.id === lId);
      champ = wEntry ? (wEntry.player_1_name + (wEntry.player_2_name ? " / " + wEntry.player_2_name : "")) : "TBD";
      runner = lEntry ? (lEntry.player_1_name + (lEntry.player_2_name ? " / " + lEntry.player_2_name : "")) : "TBD";
    }

    const sfs: string[] = [];
    for (const sf of sfMatches) {
      for (const eid of [sf.entry_1_id, sf.entry_2_id]) {
        if (eid) {
          const e = entries.find((en: any) => en.id === eid);
          if (e) sfs.push(e.player_1_name + (e.player_2_name ? " / " + e.player_2_name : ""));
        }
      }
    }

    rows1.push([cat.name, champ, runner, sfs.join("; "), total, done]);
  }
  const ws1 = XLSX.utils.aoa_to_sheet(rows1);
  ws1["!cols"] = [{ wch: 20 }, { wch: 28 }, { wch: 28 }, { wch: 40 }, { wch: 14 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Results");

  // Sheet 2: Match Details with Scores
  const rows2: any[][] = [
    ["Category", "Round", "Match#", "Player 1", "Game 1 S1", "Game 1 S2", "Game 2 S1", "Game 2 S2", "Game 3 S1", "Game 3 S2", "Player 2", "Winner", "Court", "Umpire"],
  ];
  for (const cat of categories) {
    const cm = matches.filter((m: any) => m.category_id === cat.id)
      .sort((a: any, b: any) => rndSortKey(b.round) - rndSortKey(a.round) || a.match_number - b.match_number);
    for (const m of cm) {
      const mg = games.filter((g: any) => g.match_id === m.id);
      const g1 = mg.find((g: any) => g.game_number === 1);
      const g2 = mg.find((g: any) => g.game_number === 2);
      const g3 = mg.find((g: any) => g.game_number === 3);

      const p1Name = pn(m, "entry1");
      const p2Name = pn(m, "entry2");
      const winner = m.winner_entry_id === m.entry_1_id ? p1Name : m.winner_entry_id === m.entry_2_id ? p2Name : "";

      rows2.push([
        cat.name,
        m.round,
        m.match_number,
        p1Name,
        g1 ? g1.score_1 : "",
        g1 ? g1.score_2 : "",
        g2 ? g2.score_1 : "",
        g2 ? g2.score_2 : "",
        g3 ? g3.score_1 : "",
        g3 ? g3.score_2 : "",
        p2Name,
        winner,
        m.court_number ? "Court " + m.court_number : "",
        m.umpire_name || "",
      ]);
    }
  }
  const ws2 = XLSX.utils.aoa_to_sheet(rows2);
  ws2["!cols"] = [
    { wch: 18 }, { wch: 8 }, { wch: 8 }, { wch: 26 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 26 }, { wch: 22 },
    { wch: 10 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, "Match Details");

  // Sheet 3: Winners by Category
  const rows3: any[][] = [
    ["Category", "Champion", "Runner-Up"],
  ];
  for (const cat of categories) {
    const fm = matches.find((m: any) => m.category_id === cat.id && m.round === "Final");
    if (fm && fm.winner_entry_id) {
      const wId = fm.winner_entry_id;
      const lId = fm.entry_1_id === wId ? fm.entry_2_id : fm.entry_1_id;
      const wEntry = entries.find((e: any) => e.id === wId);
      const lEntry = entries.find((e: any) => e.id === lId);
      rows3.push([
        cat.name,
        wEntry ? (wEntry.player_1_name + (wEntry.player_2_name ? " / " + wEntry.player_2_name : "")) : "TBD",
        lEntry ? (lEntry.player_1_name + (lEntry.player_2_name ? " / " + lEntry.player_2_name : "")) : "TBD",
      ]);
    } else {
      rows3.push([cat.name, "Not yet decided", "Not yet decided"]);
    }
  }
  const ws3 = XLSX.utils.aoa_to_sheet(rows3);
  ws3["!cols"] = [{ wch: 20 }, { wch: 28 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, ws3, "Winners");
}
