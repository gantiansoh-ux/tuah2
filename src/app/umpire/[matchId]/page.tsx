"use client";

// ============================================================================
// BLOCKER 2 (release): retire v1 umpire pad as a LIVE scoring surface.
// ----------------------------------------------------------------------------
// The v1 legacy pad at /umpire/[matchId] is no longer a scoring entry point.
// This page exists ONLY to forward to the single production pad
// (/umpire/v2/[matchId]). It must NEVER render as a scoring surface, so it does
// not mount any of the v1 scoring state/API calls.
//
// Redirect is gated on an AUTHENTICATED session (same source of truth the rest
// of the app uses: AuthProvider -> /api/auth/me). This guarantees that a
// directly-opened saved URL `/umpire/<matchId>` resolves to v2 for an
// authenticated umpire, and that v1 never renders. Unauthenticated users are
// sent to the login page (the umpire flow currently routes logged-in umpires to
// the /umpire dashboard, from which the v2 pad is opened for a match).
// ============================================================================

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function LegacyUmpirePadRedirect({
  params,
  searchParams,
}: {
  params: { matchId: string };
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const { matchId } = params;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // Preserve any query context that may exist on a saved legacy URL so nothing
  // is lost in the forward to v2.
  const query = searchParams
    ? new URLSearchParams(
        Object.entries(searchParams).flatMap(([k, v]) =>
          v === undefined ? [] : Array.isArray(v) ? v.map((s) => [k, s]) : [[k, String(v)]]
        )
      ).toString()
    : "";
  const target = `/umpire/v2/${matchId}${query ? `?${query}` : ""}`;

  useEffect(() => {
    if (authLoading) return;
    // Gate the redirect on an established authenticated session so v1 does not
    // render as a scoring surface pre-auth and does not bounce a logged-in user.
    if (user) {
      router.replace(target);
    } else {
      router.replace("/auth/login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, target]);

  // Neutral placeholder while auth resolves / redirecting. v1 scoring UI is
  // never mounted here, so there is no score surface on this route.
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-gray-100 text-lg flex items-center gap-3">
        <span className="animate-spin inline-block w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full" />
        Redirecting to scoring pad&hellip;
      </div>
    </div>
  );
}
