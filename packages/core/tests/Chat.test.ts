/**
 * Unit coverage for `./Chat`, `./ChatService` and the chat errors — the chat
 * message model, its boundary decoder, the contract's accessors and the
 * recording double.
 */

import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  ChatMessage,
  ChatSendError,
  ChatSendResult,
  ChatService,
  ChatValidationError,
  decodeChatMessage,
  sendChat,
  sendChatBatch,
} from "../src/index.ts";

const decodeMessage = Schema.decodeUnknownSync(ChatMessage);

describe("ChatMessage", () => {
  it("leaves the username key absent when it was absent", () => {
    expect(decodeMessage({ text: "hi" })).toEqual({ text: "hi" });
  });

  it("carries a username override", () => {
    expect(decodeMessage({ text: "hi", username: "CI" })).toEqual({ text: "hi", username: "CI" });
  });

  it("rejects empty text and an empty username", () => {
    expect(() => decodeMessage({ text: "" })).toThrow();
    expect(() => decodeMessage({ text: "hi", username: "" })).toThrow();
  });
});

describe("decodeChatMessage", () => {
  it("succeeds with the typed message", async () => {
    const message = await Effect.runPromise(decodeChatMessage({ text: "Deploy finished" }));
    expect(message.text).toBe("Deploy finished");
  });

  it("fails with a ChatValidationError listing each issue", async () => {
    const error = await Effect.runPromise(
      Effect.flip(decodeChatMessage({ text: 1, username: "" })),
    );
    expect(error).toBeInstanceOf(ChatValidationError);
    expect(error._tag).toBe("ChatValidationError");
    // `errors: "all"`: both the text and the username are reported.
    expect(error.issues.join("\n")).toContain("text");
    expect(error.issues.join("\n")).toContain("username");
  });
});

describe("ChatSendResult", () => {
  it("encodes `none` as an absent key, so a result is plain JSON", () => {
    expect(Schema.encodeSync(ChatSendResult)({ id: Option.none() })).toEqual({});
    expect(Schema.decodeUnknownSync(ChatSendResult)({ id: "1" }).id).toStrictEqual(
      Option.some("1"),
    );
  });
});

describe("ChatService.layerRecording", () => {
  it("records every send in order and numbers the ids from 1", async () => {
    const sent: Array<ChatMessage> = [];
    const results = await Effect.runPromise(
      Effect.gen(function* () {
        const first = yield* sendChat({ text: "one" });
        const rest = yield* sendChatBatch([{ text: "two" }, { text: "three", username: "CI" }]);
        return [first, ...rest];
      }).pipe(Effect.provide(ChatService.layerRecording(sent))),
    );
    expect(sent.map((m) => m.text)).toEqual(["one", "two", "three"]);
    expect(results.map((r) => r.id)).toStrictEqual([
      Option.some("recorded-1"),
      Option.some("recorded-2"),
      Option.some("recorded-3"),
    ]);
  });
});

describe("ChatSendError", () => {
  it("is yieldable and tagged", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.gen(function* () {
          return yield* new ChatSendError({
            provider: "test",
            message: "rejected",
            status: Option.some(404),
          });
        }),
      ),
    );
    expect(error._tag).toBe("ChatSendError");
    expect(error.status).toStrictEqual(Option.some(404));
  });
});
