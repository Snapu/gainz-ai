import { errAsync, type Result, ResultAsync } from "neverthrow";
import { useAuthErrorHandler } from "../composables/useAuthErrorHandler";

export interface RetryOnAuthErrorOptions<E extends string> {
  fallbackError: NoInfer<E>;
  isCancelled?: () => boolean;
}

/**
 * Wraps a repository operation in a single transparent retry when it fails with `"auth-failed"`.
 * Maps unexpected throws to a typed fallback error and aborts recovery if the caller has been cancelled.
 */
export function retryOnAuthError<T, E extends string>(
  context: string,
  execute: () => PromiseLike<Result<T, E>>,
  options: RetryOnAuthErrorOptions<E>,
): ResultAsync<T, E> {
  const { handleAuthError } = useAuthErrorHandler();

  const runAttempt = (): ResultAsync<T, E> =>
    ResultAsync.fromPromise((async () => await execute())(), (thrown) => {
      console.error(`[${context}] Unexpected error during operation:`, thrown);
      return options.fallbackError;
    }).andThen((result) => result);

  return runAttempt().orElse((error) => {
    if (error !== "auth-failed" || options.isCancelled?.()) {
      return errAsync(error);
    }

    return ResultAsync.fromPromise(
      (async () => {
        const recovered = await handleAuthError(context);
        return recovered && !options.isCancelled?.();
      })(),
      () => error,
    ).andThen((shouldRetry) => (shouldRetry ? runAttempt() : errAsync(error)));
  });
}
