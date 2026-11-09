import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-lg font-semibold">Not found</h1>
        <p className="mt-1 text-sm text-muted">This page or record does not exist, or you don’t have access to it.</p>
        <Link href="/" className="btn-primary mt-4">Back to dashboard</Link>
      </div>
    </main>
  );
}
