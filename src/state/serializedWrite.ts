/** Keep asynchronous storage writes in the same order as state updates. */
export function createSerializedWriter<T>(write: (value: T) => Promise<void>): (value: T) => Promise<void> {
  let pending: Promise<void> = Promise.resolve();
  return (value) => {
    const next = pending.catch(() => undefined).then(() => write(value));
    pending = next;
    return next;
  };
}
