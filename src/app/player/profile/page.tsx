"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function PlayerProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ fullName: "", phone: "", bio: "", club: "", rank: "" });
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => {
        if (!d.user) { router.push("/auth/login"); return; }
        setUser(d.user);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch("/api/profile")
      .then(r => r.json())
      .then(d => {
        if (d.profile) {
          setProfile(d.profile);
          setForm({
            fullName: d.profile.name || d.profile.full_name || "",
            phone: d.profile.phone || "",
            bio: d.profile.bio || "",
            club: d.profile.club || "",
            rank: d.profile.rank || "",
          });
          if (d.profile.showcase_video_url) {
            setVideoUrl(d.profile.showcase_video_url);
          }
        }
      })
      .catch(() => {});
  }, [user]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setMessage("Profile updated!");
        const d = await res.json();
        setProfile(d.profile);
      } else {
        const d = await res.json();
        setMessage("Error: " + (d.error || "Failed"));
      }
    } catch (err: any) {
      setMessage("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "videos");
      const res = await fetch("/api/upload", { method: "POST", credentials: "include", body: fd });
      const d = await res.json();
      if (res.ok) {
        // Persist the URL so it survives reloads (profiles.showcase_video_url)
        const save = await fetch("/api/profile", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ showcase_video_url: d.url }),
        });
        if (save.ok) {
          setVideoUrl(d.url);
          setUploadMsg("✅ Video uploaded & saved to your profile!");
        } else {
          setUploadMsg("⚠️ Video uploaded but could not be saved. " + ((await save.json().catch(() => ({}))).error || ""));
        }
      } else {
        setUploadMsg("Error: " + (d.error || "Upload failed"));
      }
    } catch (err: any) {
      setUploadMsg("Error: " + err.message);
    } finally {
      setUploading(false);
      if (e.target) e.target.value = "";
    }
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" /></div>;
  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-emerald-900 text-white px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2"><span className="text-xl font-black">TUAH</span></Link>
        <div className="flex items-center gap-4">
          <Link href="/player" className="text-sm text-emerald-200 hover:underline">Dashboard</Link>
          <span className="text-emerald-400/40">|</span>
          <span className="text-sm text-emerald-200">{user.name}</span>
          <button onClick={() => { fetch("/api/auth/logout",{method:"POST"}).then(() => router.push("/auth/login")); }} className="text-sm bg-emerald-700 px-5 py-2 rounded-lg hover:bg-emerald-600">Sign Out</button>
        </div>
      </nav>
      <main className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-black text-gray-900 mb-2">My Profile</h1>
        <p className="text-gray-600 mb-8">Manage your player information</p>

        <form onSubmit={handleSave} className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input type="text" value={form.fullName} onChange={e => setForm({...form, fullName: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none" placeholder="+60 12-345 6789" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Club / Academy</label>
            <input type="text" value={form.club} onChange={e => setForm({...form, club: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none" placeholder="e.g. KL Badminton Club" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rank / Level</label>
            <input type="text" value={form.rank} onChange={e => setForm({...form, rank: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none" placeholder="e.g. U18, Intermediate" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
            <textarea value={form.bio} onChange={e => setForm({...form, bio: e.target.value})} rows={3}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none" placeholder="Tell others about yourself..." />
          </div>

          {message && (
            <div className={"px-4 py-3 rounded-xl text-sm " + (message.startsWith("Error") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600")}>
              {message}
            </div>
          )}

          <button type="submit" disabled={saving}
            className="w-full bg-emerald-700 text-white font-bold py-3 rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-all">
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </form>

        {/* Video upload — advertised on homepage, now actually works */}
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 mt-6">
          <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-emerald-700" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="5" width="14" height="12" rx="2"></rect>
              <path d="M16 10l6-3v10l-6-3"></path>
            </svg>
            Showcase Video
          </h2>
          <p className="text-gray-600 text-sm mb-4">Upload a highlight video to attract sponsors (MP4/WebM/MOV, max 100 MB).</p>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center h-10 px-4 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 cursor-pointer transition-colors">
              Choose File
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                onChange={handleVideoUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
            <span className={`text-sm ${uploading ? "text-gray-400" : "text-slate-600"}`}>
              {uploading ? "Uploading…" : videoUrl ? "Video uploaded" : "No file chosen"}
            </span>
          </div>
          {uploadMsg && (
            <div className={"mt-3 px-4 py-3 rounded-xl text-sm " + (uploadMsg.startsWith("Error") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600")}>
              {uploadMsg}
            </div>
          )}
          {videoUrl && (
            <div className="mt-4">
              <video controls src={videoUrl} className="w-full max-h-72 rounded-xl bg-black" />
              <p className="text-xs text-gray-400 mt-1 break-all">{videoUrl}</p>
              <a href={`/profile/${user.id}`} target="_blank" rel="noopener noreferrer"
                className="inline-block mt-2 text-sm text-emerald-700 font-medium hover:underline">
                View my public profile →
              </a>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
