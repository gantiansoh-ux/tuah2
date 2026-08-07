import Link from "next/link";

export const dynamic = "force-dynamic";

export default function CourtOwnerPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-emerald-900 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-xl font-black">TUAH</Link>
        </div>
        <Link href="/auth/register" className="text-sm bg-emerald-600 px-4 py-2 rounded-lg hover:bg-emerald-500 font-semibold">
          Get Started
        </Link>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <div className="text-6xl mb-6">🏟️</div>
        <h1 className="text-4xl font-black text-gray-900 mb-4">Court Owner Hub</h1>
        <p className="text-lg text-gray-500 mb-8 max-w-xl mx-auto">
          List your badminton courts for organizers and players to book.
          Manage availability and set hourly rates — all in one place.
        </p>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-8 text-left">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Coming soon — here's what's in the pipeline:</h2>
          <ul className="space-y-3 text-gray-600 text-sm">
            <li className="flex items-start gap-2">✅ <span><b>Court listing</b> — photos, location, facilities</span></li>
            <li className="flex items-start gap-2">✅ <span><b>Availability management</b> — block off hours, set rates</span></li>
            <li className="flex items-start gap-2">✅ <span><b>Tournament bookings</b> — organizers book courts for events</span></li>
          </ul>
        </div>

        <Link href="/auth/register"
          className="inline-block bg-emerald-700 text-white font-bold px-10 py-4 rounded-2xl text-lg hover:bg-emerald-600 transition-all">
          Create an Account →
        </Link>
        <p className="text-sm text-gray-400 mt-4">Register now and your courts will be ready when Court Owner Hub launches.</p>
      </div>
    </div>
  );
}
