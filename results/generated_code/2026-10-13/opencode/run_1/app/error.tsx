"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-xl p-12">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="my-4 text-zinc-400">Please try loading the demo again.</p>
      <button
        onClick={reset}
        className="rounded-xl bg-lime-300 px-5 py-3 text-zinc-950"
      >
        Try again
      </button>
    </main>
  );
}
