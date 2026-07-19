"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import type { Tournament } from "@/lib/types";
import Link from "next/link";

export default function OrganizerDashboard() {
  const { session, profile, loading: authLoading, signOut } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const router = useRouter();

  const supabase = createClient();

  useEffect(() => {
    if (!authLoading && !session) {
      router.push("/auth/login");
    }
  }, [session, authLoading]);

  useEffect(() => {
    if (!session) return;
    loadTournaments();
  }, [session]);

  async function loadTournaments() {
    setLoading(true);
    const { data } = await supabase
      .from("tournaments")
      .select("*")
      .eq("organizer_id", session!.user.id)
      .order("created_at", { ascending: false });
    setTournaments(data as Tournament[] || []);
    setLoading(false);
  }

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" /></div>;
  if (!session) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-emerald-900 text-white px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-black">TUAH</span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-sm text-emerald-200">{profile?.full_name || session.user.email}</span>
          <button onClick={signOut} className="text-sm bg-emerald-700 px-4 py-2 rounded-lg hover:bg-emerald-600">Sign Out</button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-gray-900">Organizer Dashboard</h1>
            <p className="text-gray-500 mt-1">Manage your tournaments</p>
          </div>
          <Link
            href="/organizer/create"
            className="bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg"
          >
            + New Tournament
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading...</div>
        ) : tournaments.length === 0 && !showWizard ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No tournaments yet</h2>
            <p className="text-gray-400 mb-6">Create your first tournament to get started</p>
            <Link href="/organizer/create" className="bg-emerald-700 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-600">
              Create Tournament
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tournaments.map((t) => (
              <Link
                key={t.id}
                href={`/organizer/${t.id}`}
                className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
              >
                <h3 className="font-bold text-gray-900 mb-2">{t.name}</h3>
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                  <span className={
                    `px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.status === "draft" ? "bg-gray-100 text-gray-600" :
                      t.status === "published" ? "bg-blue-100 text-blue-700" :
                      t.status === "live" ? "bg-green-100 text-green-700" :
                      "bg-purple-100 text-purple-700"
                    }`
                  }>
                    {t.status}
                  </span>
                  <span>{t.start_date?.slice(0, 10)}</span>
                </div>
                {t.location && <p className="text-sm text-gray-400">📍 {t.location}</p>}
              </Link>
            ))}
          </div>
        )}

        {/* Hidden wizard - inline for now, will be full page later */}
      </div>
    </div>
  );
}
