export function Notice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mx-5 mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-sm text-amber-200"
    >
      {message}
    </div>
  );
}
