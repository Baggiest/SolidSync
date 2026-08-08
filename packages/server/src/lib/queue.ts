// Minimal, serialized async task queue. The server uses it so SQLite writes and
// git commits for a single mutation never interleave across concurrent requests.
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve()

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(() => fn())
    // Keep the chain alive even if a job rejects; the error is delivered to the
    // caller of enqueue, not swallowed here.
    this.tail = run.catch(() => undefined)
    return run
  }
}