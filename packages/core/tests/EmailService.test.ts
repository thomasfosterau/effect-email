/**
 * Unit coverage for `./EmailService` and `./Errors` — the contract's
 * accessors, the recording double, and the error classes' shape.
 */

import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  EmailSendError,
  EmailService,
  send,
  sendBatch,
  truncateUpstreamBody,
  UPSTREAM_BODY_LIMIT,
  type EmailMessage,
} from "../src/index.ts";

const message = (to: string): EmailMessage => ({
  from: { email: "sender@example.com" },
  to: [{ email: to }],
  subject: "s",
  text: "t",
});

describe("EmailService.layerRecording", () => {
  it("records every send and numbers the ids from 1", async () => {
    const sent: Array<EmailMessage> = [];
    const results = await Effect.runPromise(
      Effect.gen(function* () {
        const first = yield* send(message("a@example.com"));
        const rest = yield* sendBatch([message("b@example.com"), message("c@example.com")]);
        return [first, ...rest];
      }).pipe(Effect.provide(EmailService.layerRecording(sent))),
    );
    expect(sent.map((m) => m.to[0].email)).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
    ]);
    expect(results.map((r) => r.id)).toStrictEqual([
      Option.some("recorded-1"),
      Option.some("recorded-2"),
      Option.some("recorded-3"),
    ]);
  });

  it("is a fresh recorder per layer build, sharing nothing between arrays", async () => {
    const one: Array<EmailMessage> = [];
    const two: Array<EmailMessage> = [];
    await Effect.runPromise(
      send(message("a@example.com")).pipe(Effect.provide(EmailService.layerRecording(one))),
    );
    await Effect.runPromise(
      send(message("b@example.com")).pipe(Effect.provide(EmailService.layerRecording(two))),
    );
    expect(one).toHaveLength(1);
    expect(two).toHaveLength(1);
  });
});

describe("EmailSendError", () => {
  it("is yieldable and tagged", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.gen(function* () {
          return yield* new EmailSendError({
            provider: "test",
            message: "rejected",
            status: Option.some(422),
          });
        }),
      ),
    );
    expect(error._tag).toBe("EmailSendError");
    expect(error.provider).toBe("test");
    expect(error.status).toStrictEqual(Option.some(422));
    expect(error.message).toBe("rejected");
  });

  it("carries an optional cause for diagnostics", () => {
    const cause = new Error("boom");
    const error = new EmailSendError({
      provider: "test",
      message: "unreachable",
      status: Option.none(),
      cause,
    });
    expect(error.cause).toBe(cause);
  });
});

describe("truncateUpstreamBody", () => {
  it("bounds a vendor body to the limit", () => {
    expect(truncateUpstreamBody("x".repeat(5_000))).toHaveLength(UPSTREAM_BODY_LIMIT);
  });

  it("leaves a short body alone", () => {
    expect(truncateUpstreamBody("short")).toBe("short");
  });
});
