/**
 * The recording double every channel's `layerRecording` shares. Internal:
 * not re-exported from the package index, and excluded from docgen.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

/**
 * A `send` / `sendBatch` pair that succeeds and appends every message to
 * `sent`, answering `recorded-<n>` ids numbered from 1 in send order.
 */
export const recordingSender = <M>(sent: Array<M>) => {
  const record = (message: M) => {
    sent.push(message);
    return { id: Option.some(`recorded-${sent.length}`) };
  };
  return {
    send: (message: M) => Effect.sync(() => record(message)),
    sendBatch: (messages: ReadonlyArray<M>) => Effect.sync(() => messages.map(record)),
  };
};
