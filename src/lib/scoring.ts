import { ScoringConfig } from "./types";

/**
 * TUAH2 Scoring Engine (ported from TUAH1)
 * Configurable: 11/15/21/31 points, best of 1/3, deuce on/off
 */

export function checkGameOver(
  score1: number,
  score2: number,
  config: ScoringConfig
): { isGameOver: boolean; winner: "player1" | "player2" | null } {
  const target = config.points_per_game;
  const diff = Math.abs(score1 - score2);

  if (config.deuce) {
    const cap = config.max_cap || target + 9;
    if (score1 >= target || score2 >= target) {
      if (diff >= 2) {
        if (score1 > score2) return { isGameOver: true, winner: "player1" };
        if (score2 > score1) return { isGameOver: true, winner: "player2" };
      }
      if (score1 >= cap && score2 >= cap) {
        if (score1 > score2) return { isGameOver: true, winner: "player1" };
        if (score2 > score1) return { isGameOver: true, winner: "player2" };
      }
    }
  } else {
    if (score1 >= target && score1 > score2) return { isGameOver: true, winner: "player1" };
    if (score2 >= target && score2 > score1) return { isGameOver: true, winner: "player2" };
  }

  return { isGameOver: false, winner: null };
}

export function checkMatchOver(
  games: { game_number: number; winner: "player1" | "player2" | null }[],
  config: ScoringConfig
): { isMatchOver: boolean; winner: "player1" | "player2" | null } {
  const needed = Math.ceil(config.best_of / 2);
  let p1Wins = 0;
  let p2Wins = 0;

  for (const g of games) {
    if (g.winner === "player1") p1Wins++;
    if (g.winner === "player2") p2Wins++;
  }

  if (p1Wins >= needed) return { isMatchOver: true, winner: "player1" };
  if (p2Wins >= needed) return { isMatchOver: true, winner: "player2" };
  return { isMatchOver: false, winner: null };
}
