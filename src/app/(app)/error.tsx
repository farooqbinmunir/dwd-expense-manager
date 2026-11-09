"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto max-w-lg p-6 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">{error.message || "An unexpected error occurred while loading this page."}</p>
      <button onClick={reset} className="btn-primary mt-4">Try again</button>
    </div>
  );
}
