import Link from "next/link";
import { notFound } from "next/navigation";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

interface PublicProfile {
  id: string;
  full_name: string;
  nickname: string | null;
  avatar_url: string | null;
  club: string | null;
  rank: string | null;
  bio: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  showcase_video_url: string | null;
  playing_hand: string | null;
  gender: string | null;
  player_ranking: number | null;
  tournament_count: number;
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let profile: PublicProfile | null = null;
  try {
    profile = await queryOne(
      `SELECT p.id, p.full_name, p.nickname, p.avatar_url, p.club, p.rank,
              p.bio, p.country, p.state, p.city, p.showcase_video_url,
              p.playing_hand, p.gender,
              pp.ranking AS player_ranking,
              (SELECT COUNT(*) FROM entries e WHERE e.player_1_id = p.id OR e.player_2_id = p.id) AS tournament_count
       FROM profiles p
       LEFT JOIN player_profiles pp ON pp.profile_id = p.id
       WHERE p.id = $1`,
      [id]
    );
  } catch (err) {
    console.error("Public profile error:", err);
  }

  if (!profile) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-emerald-900 text-white px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-black">TUAH</span>
          <span className="text-xs bg-emerald-700 px-2 py-0.5 rounded-full">Player Profile</span>
        </Link>
        <Link href="/" className="text-sm text-emerald-200 hover:text-emerald-100">← Home</Link>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Header banner */}
          <div className="bg-gradient-to-r from-emerald-800 to-emerald-950 h-28" />

          <div className="px-8 pb-8">
            {/* Avatar + name */}
            <div className="flex items-end gap-4 -mt-10 mb-6">
              <div className="w-20 h-20 rounded-2xl bg-white shadow-md flex items-center justify-center overflow-hidden border-4 border-white">
                {profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-black text-emerald-700">
                    {(profile.full_name || "P")[0].toUpperCase()}
                  </span>
                )}
              </div>
              <div className="pb-1">
                <h1 className="text-2xl font-black text-gray-900">{profile.full_name}</h1>
                <p className="text-sm text-gray-500">
                  {[profile.club, profile.city, profile.state, profile.country].filter(Boolean).join(" · ") || "Player"}
                  {profile.player_ranking ? ` · Rank #${profile.player_ranking}` : ""}
                </p>
              </div>
            </div>

            {/* Stats */}
            <div className="flex gap-6 mb-6">
              <div className="text-center">
                <div className="text-2xl font-black text-emerald-700">{profile.tournament_count}</div>
                <div className="text-xs text-gray-400">Tournaments</div>
              </div>
              {profile.playing_hand && (
                <div className="text-center">
                  <div className="text-2xl font-black text-gray-900 capitalize">{profile.playing_hand === "ambidextrous" ? "Both" : profile.playing_hand}</div>
                  <div className="text-xs text-gray-400">Playing Hand</div>
                </div>
              )}
              {profile.rank && (
                <div className="text-center">
                  <div className="text-2xl font-black text-gray-900">{profile.rank}</div>
                  <div className="text-xs text-gray-400">Level</div>
                </div>
              )}
            </div>

            {/* Showcase video */}
            {profile.showcase_video_url ? (
              <div className="mb-6">
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">🎥 Showcase Video</h2>
                <video controls src={profile.showcase_video_url} className="w-full max-h-96 rounded-2xl bg-black" />
              </div>
            ) : (
              <div className="mb-6 bg-gray-50 rounded-2xl p-6 text-center">
                <div className="text-4xl mb-2">🎥</div>
                <p className="text-sm text-gray-400">No showcase video yet</p>
              </div>
            )}

            {/* Bio */}
            {profile.bio && (
              <div>
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">About</h2>
                <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{profile.bio}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
