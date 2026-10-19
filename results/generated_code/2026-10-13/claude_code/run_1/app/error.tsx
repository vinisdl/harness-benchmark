'use client';

import { ErrorNotice } from '@/components/error-notice';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <ErrorNotice
        message="Something went wrong opening Local Chat. Please try again."
        onRetry={reset}
      />
    </main>
  );
}
