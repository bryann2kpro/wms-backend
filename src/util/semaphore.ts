/**
 * Creates a semaphore that limits concurrent async operations.
 * @param limit Maximum number of concurrent executions.
 */
export function createSemaphore(limit: number) {
  let running = 0;
  const queue: Array<() => void> = [];

  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (running >= limit) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    running++;
    try {
      return await fn();
    } finally {
      running--;
      queue.shift()?.();
    }
  };
}
