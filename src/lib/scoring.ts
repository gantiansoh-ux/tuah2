import { ScoringConfig } from "./types";

/**
 * TUAH2 Scoring Engine
 * Configurable: 11/15/21/31 points, best of 1/3, deuce on/off
 *
 * Rules:
 * - A game ends when a player reaches `points_per_game` with ≥2 point lead (if deuce is on)
 * - If deuce is on and neither player leads by 2, game continues until someone leads by 2
 * - A cap (`deuce_cap` or `max_cap`) ends the game at that score even without a 2-point lead
 * - If deuce is off, first player to reach `points_per_game` wins
 */

export function checkGameOver(
  score1: number,
  score2: number,
  config: ScoringConfig
): { isGameOver: boolean; winner: "player1" | "player2" | null } {
  const target = config.points_per_game;
  const diff = Math.abs(score1 - score2);

  if (config.deuce) {
    // Use deuce_cap if available, fall back to max_cap for backward compat, or target + 9 as last resort
    const cap = config.deuce_cap ?? config.max_cap ?? target + 9;

    if (score1 >= target && score2 >= target) {
      // Both at or above target: deuce scoring, need 2-point lead OR reaching cap
      if (diff >= 2) {
        if (score1 > score2) return { isGameOver: true, winner: "player1" };
        if (score2 > score1) return { isGameOver: true, winner: "player2" };
      }
      // Cap check: if either player hits the cap with any lead, they win
      if (score1 >= cap && score1 > score2) return { isGameOver: true, winner: "player1" };
      if (score2 >= cap && score2 > score1) return { isGameOver: true, winner: "player2" };
    } else if (score1 >= target || score2 >= target) {
      // One player reached target, other is below
      if (diff >= 2) {
        if (score1 > score2) return { isGameOver: true, winner: "player1" };
        if (score2 > score1) return { isGameOver: true, winner: "player2" };
      }
      // Cap also applies here
      if (score1 >= cap && score1 > score2) return { isGameOver: true, winner: "player1" };
      if (score2 >= cap && score2 > score1) return { isGameOver: true, winner: "player2" };
    }
  } else {
    // No deuce: first to reach target wins (must be strictly ahead)
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
