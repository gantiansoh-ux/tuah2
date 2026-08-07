"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8">
        <div className="text-6xl mb-4">🏸</div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Page Not Found</h1>
        <p className="text-gray-500 mb-6">This page doesn't exist or has been moved.</p>
        <Link href="/" className="inline-block bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-600">
          Go Home
        </Link>
      </div>
    </div>
  );
}
