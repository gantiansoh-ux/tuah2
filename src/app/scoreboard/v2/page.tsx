"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ScoreboardV2Landing() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tournamentId, setTournamentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = searchParams.get("t");
    if (t) setTournamentId(t);
  }, [searchParams]);

  async function handleGo() {
    if (!tournamentId.trim()) {
      setError("Please enter a Tournament ID");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/tournaments/${tournamentId.trim()}`);
      if (!res.ok) throw new Error("Tournament not found");
      router.push(`/scoreboard/v2/${tournamentId.trim()}`);
    } catch {
      setError("Tournament not found. Check the ID.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8">
      <div className="bg-black rounded-3xl p-8 md:p-12 max-w-md w-full border border-gray-800 shadow-2xl">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">📺</div>
          <h1 className="text-2xl font-black tracking-widest">TUAH SCOREBOARD</h1>
          <p className="text-gray-500 text-sm mt-2">Dynamic court layout from organizer</p>
        </div>

        <input
          type="text"
          value={tournamentId}
          onChange={(e) => setTournamentId(e.target.value)}
          placeholder="Enter Tournament ID"
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 mb-4"
          onKeyDown={(e) => e.key === "Enter" && handleGo()}
        />

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <button
          onClick={handleGo}
          disabled={loading}
          className="w-full bg-emerald-700 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold disabled:opacity-50 transition-all"
        >
          {loading ? "Loading..." : "Go to Scoreboard →"}
        </button>

        <p className="text-gray-600 text-[10px] mt-4 text-center">
          Or use: /scoreboard/v2/TOURNAMENT_ID
        </p>
      </div>
    </div>
  );
}
