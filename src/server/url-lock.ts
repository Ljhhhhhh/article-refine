/**
 * Serializes async operations per-key. Used to prevent racing writes to
 * `source-index.json` when the same URL is processed concurrently.
 *
 * Different keys run in parallel; same-key operations run in FIFO order.
 */
export class UrlLock {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tails.set(key, mine);

    await prev;
    try {
      return await task();
    } finally {
      release();
      // Only clean up if nothing else queued behind us.
      if (this.tails.get(key) === mine) {
        this.tails.delete(key);
      }
    }
  }
}
