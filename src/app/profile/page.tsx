"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";

// ─── Types ──────────────────────────────────────
interface ProfileData {
  id: string;
  email: string;
  full_name: string;
  nickname: string;
  phone: string;
  avatar_url: string;
  country: string;
  state: string;
  city: string;
  gender: string;
  date_of_birth: string;
  playing_hand: string;
  club: string;
  school: string;
  occupation: string;
  social_media: Record<string, string>;
  website: string;
  roles: string[];
  created_at: string;
}

interface SocialLink {
  platform: string;
  url: string;
}

const SOCIAL_PLATFORMS = [
  { value: "facebook", label: "Facebook", icon: "📘", placeholder: "https://facebook.com/..." },
  { value: "instagram", label: "Instagram", icon: "📸", placeholder: "https://instagram.com/..." },
  { value: "twitter", label: "Twitter / X", icon: "🐦", placeholder: "https://twitter.com/..." },
  { value: "tiktok", label: "TikTok", icon: "🎵", placeholder: "https://tiktok.com/..." },
];

// ─── FileUpload Component ───────────────────────
function AvatarUpload({
  currentUrl,
  onUpload,
}: {
  currentUrl: string;
  onUpload: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(currentUrl);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Add cache-busting timestamp to avatar URLs
    if (currentUrl && currentUrl.startsWith('/')) {
      const separator = currentUrl.includes('?') ? '&' : '?';
      setPreview(`${currentUrl}${separator}_t=${Date.now()}`);
    } else {
      setPreview(currentUrl);
    }
  }, [currentUrl]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", "avatars");

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const data = await res.json();
      setPreview(data.url);
      setUploading(false);
      onUpload(data.url);
    } catch (err: any) {
      setError(err.message);
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        {preview ? (
          <img
            src={preview}
            alt="Avatar"
            className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center text-3xl text-emerald-500 border-2 border-dashed border-emerald-300">
            📷
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
            <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
          </div>
        )}
      </div>
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="px-4 py-2 bg-emerald-700 text-white rounded-xl text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "Change Photo"}
        </button>
        <p className="text-xs text-gray-400 mt-1">JPG, PNG or WebP. Max 10MB.</p>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    </div>
  );
}

// ─── Page Component ─────────────────────────────
export default function ProfilePage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  // Form state
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [fullName, setFullName] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [playingHand, setPlayingHand] = useState("");
  const [club, setClub] = useState("");
  const [school, setSchool] = useState("");
  const [occupation, setOccupation] = useState("");
  const [website, setWebsite] = useState("");
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([
    { platform: "facebook", url: "" },
    { platform: "instagram", url: "" },
    { platform: "twitter", url: "" },
    { platform: "tiktok", url: "" },
  ]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    loadProfile();
  }, [user]);

  async function loadProfile() {
    setLoading(true);
    try {
      const res = await fetch("/api/profile");
      if (res.ok) {
        const data = await res.json();
        const p = data.profile;
        setProfile(p);
        setFullName(p.full_name || "");
        setNickname(p.nickname || "");
        setPhone(p.phone || "");
        setAvatarUrl(p.avatar_url || "");
        setCountry(p.country || "");
        setState(p.state || "");
        setCity(p.city || "");
        setGender(p.gender || "");
        setDateOfBirth(p.date_of_birth ? p.date_of_birth.slice(0, 10) : "");
        setPlayingHand(p.playing_hand || "");
        setClub(p.club || "");
        setSchool(p.school || "");
        setOccupation(p.occupation || "");
        setWebsite(p.website || "");

        // Load social media
        if (p.social_media && typeof p.social_media === "object") {
          setSocialLinks(
            SOCIAL_PLATFORMS.map((sp) => ({
              platform: sp.value,
              url: p.social_media[sp.value] || "",
            }))
          );
        }
      }
    } catch (err) {
      console.error("Failed to load profile:", err);
      setError("Failed to load profile");
    } finally {
      setLoading(false);
    }
  }

  function handleSocialChange(platform: string, url: string) {
    setSocialLinks((prev) =>
      prev.map((s) => (s.platform === platform ? { ...s, url } : s))
    );
  }

  async function handleSave() {
    setError("");
    setSuccess("");
    setSaving(true);

    // Build social_media object
    const socialMedia: Record<string, string> = {};
    for (const link of socialLinks) {
      if (link.url.trim()) {
        socialMedia[link.platform] = link.url.trim();
      }
    }

    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          nickname: nickname.trim(),
          phone: phone.trim(),
          avatar_url: avatarUrl,
          country: country.trim(),
          state: state.trim(),
          city: city.trim(),
          gender,
          date_of_birth: dateOfBirth || null,
          playing_hand: playingHand,
          club: club.trim(),
          school: school.trim(),
          occupation: occupation.trim(),
          social_media: socialMedia,
          website: website.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save profile");
      }

      setSuccess("Profile saved successfully! 🎉");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Close profile menu on outside click
  useEffect(() => {
    function handleClick() {
      setProfileMenuOpen(false);
    }
    if (profileMenuOpen) {
      document.addEventListener("click", handleClick);
      return () => document.removeEventListener("click", handleClick);
    }
  }, [profileMenuOpen]);

  if (authLoading || loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <nav className="bg-emerald-900 text-white px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-black">TUAH</span>
        </Link>
        <div className="flex items-center gap-4">
          {user?.role === 'organizer' || user?.role === 'admin' ? (
            <Link href="/organizer" className="text-sm text-emerald-200 hover:text-emerald-100">
              Dashboard
            </Link>
          ) : user?.role === 'player' ? (
            <Link href="/player" className="text-sm text-emerald-200 hover:text-emerald-100">
              Tournaments
            </Link>
          ) : null}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setProfileMenuOpen(!profileMenuOpen);
              }}
              className="flex items-center gap-2 text-sm text-emerald-200 hover:text-emerald-100 bg-emerald-800 px-3 py-2 rounded-lg"
            >
              <span className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-xs font-bold text-white">
                {(user.name || user.email || "U")[0].toUpperCase()}
              </span>
              <span>{user.name || user.email}</span>
            </button>
            {profileMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50">
                <hr className="my-1 border-gray-100" />
                <button
                  onClick={() => {
                    setProfileMenuOpen(false);
                    signOut();
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  🚪 Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-8">
          <Link
            href={user?.role === 'organizer' || user?.role === 'admin' ? "/organizer" : "/player"}
            className="text-sm text-emerald-600 hover:text-emerald-500 mb-2 inline-block"
          >
            ← Back to {user?.role === 'organizer' || user?.role === 'admin' ? 'Dashboard' : 'Tournaments'}
          </Link>
          <h1 className="text-3xl font-black text-gray-900">My Profile</h1>
          <p className="text-gray-500 mt-1">
            Manage your personal details and preferences
          </p>
        </div>

        {/* Success / Error messages */}
        {success && (
          <div className="mb-6 bg-green-50 text-green-700 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2">
            <span>✅</span> {success}
          </div>
        )}
        {error && (
          <div className="mb-6 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* ─── Avatar ──────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Profile Photo</h2>
            <AvatarUpload currentUrl={avatarUrl} onUpload={setAvatarUrl} />
          </div>

          {/* ─── Personal Info ────────────────────────────────────── */}
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm space-y-5">
            <h2 className="text-lg font-bold text-gray-900">Personal Information</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name *
                </label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Your full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nickname</label>
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="What everyone calls you"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  value={profile?.email || user?.email || ""}
                  disabled
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-400 outline-none cursor-not-allowed"
                />
                <p className="text-xs text-gray-400 mt-1">Email cannot be changed</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="e.g. +60 12-345 6789"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* ─── Location ────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm space-y-5">
            <h2 className="text-lg font-bold text-gray-900">Location</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="e.g. Malaysia"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="e.g. Selangor"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="e.g. Petaling Jaya"
                />
              </div>
            </div>
          </div>

          {/* ─── Badminton Details ───────────────────────────────── */}
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm space-y-5">
            <h2 className="text-lg font-bold text-gray-900">Badminton Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Playing Hand
                </label>
                <select
                  value={playingHand}
                  onChange={(e) => setPlayingHand(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="">Select hand</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                  <option value="ambidextrous">Ambidextrous</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Club</label>
                <input
                  value={club}
                  onChange={(e) => setClub(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="e.g. KL Badminton Club"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">School</label>
                <input
                  value={school}
                  onChange={(e) => setSchool(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="e.g. SMK Taman Tun"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Occupation</label>
              <input
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="e.g. Software Engineer, Student, Coach"
              />
            </div>
          </div>

          {/* ─── Social Media ────────────────────────────────────── */}
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm space-y-5">
            <h2 className="text-lg font-bold text-gray-900">Social Media</h2>
            <p className="text-sm text-gray-500">
              Add your social media links so others can find you
            </p>
            {socialLinks.map((link) => {
              const platformInfo = SOCIAL_PLATFORMS.find(
                (p) => p.value === link.platform
              );
              return (
                <div key={link.platform} className="flex items-center gap-3">
                  <span className="text-xl w-8 text-center">
                    {platformInfo?.icon || "🔗"}
                  </span>
                  <span className="text-sm font-medium text-gray-600 w-20">
                    {platformInfo?.label || link.platform}
                  </span>
                  <input
                    value={link.url}
                    onChange={(e) => handleSocialChange(link.platform, e.target.value)}
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder={platformInfo?.placeholder || "Enter URL"}
                  />
                </div>
              );
            })}
          </div>

          {/* ─── Website ─────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm space-y-5">
            <h2 className="text-lg font-bold text-gray-900">Website</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Personal Website
              </label>
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="https://yourwebsite.com"
              />
            </div>
          </div>

          {/* ─── Save Button ──────────────────────────────────────── */}
          <div className="flex justify-end gap-4 pb-8">
            <Link
              href={user?.role === 'organizer' || user?.role === 'admin' ? "/organizer" : "/player"}
              className="px-6 py-3 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-8 py-3 bg-emerald-700 text-white rounded-xl font-bold hover:bg-emerald-600 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {saving ? (
                <>
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Saving...
                </>
              ) : (
                "💾 Save Profile"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
