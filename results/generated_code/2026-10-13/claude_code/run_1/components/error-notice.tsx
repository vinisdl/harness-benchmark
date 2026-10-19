type ErrorNoticeProps = { message: string; onRetry?: () => void };

export function ErrorNotice({ message, onRetry }: ErrorNoticeProps) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <p>{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-md font-semibold underline underline-offset-4"
        >
          Try again
        </button>
      )}
    </div>
  );
}
