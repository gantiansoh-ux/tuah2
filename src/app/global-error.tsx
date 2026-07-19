"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div
          className="min-h-screen flex items-center justify-center bg-gray-50"
          style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f9fafb" }}
        >
          <div className="text-center p-8">
            <div style={{ fontSize: "64px", marginBottom: "16px" }}>🏸</div>
            <h1 style={{ fontSize: "36px", fontWeight: "bold", color: "#111827", marginBottom: "16px" }}>
              Something went wrong
            </h1>
            <p style={{ color: "#6b7280", marginBottom: "24px" }}>An unexpected error occurred</p>
            <button
              onClick={() => reset()}
              style={{
                backgroundColor: "#047857",
                color: "white",
                padding: "12px 24px",
                borderRadius: "12px",
                fontWeight: "bold",
                border: "none",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
