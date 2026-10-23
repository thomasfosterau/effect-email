/**
 * Unit coverage for `./WhatsApp`, `./WhatsAppService` and the WhatsApp
 * errors — the text / template union, its boundary decoder, the contract's
 * accessors and the recording double.
 */

import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  decodeWhatsAppMessage,
  sendWhatsApp,
  sendWhatsAppBatch,
  WhatsAppMessage,
  WhatsAppSendError,
  WhatsAppSendResult,
  WhatsAppService,
  WhatsAppValidationError,
} from "../src/index.ts";

const decodeMessage = Schema.decodeUnknownSync(WhatsAppMessage);
const TO = "+61412345678";

describe("WhatsAppMessage", () => {
  it("decodes a free-form text message, leaving an absent from absent", () => {
    expect(decodeMessage({ _tag: "Text", to: TO, body: "hi" })).toEqual({
      _tag: "Text",
      to: TO,
      body: "hi",
    });
  });

  it("decodes a template message with and without variables", () => {
    expect(
      decodeMessage({
        _tag: "Template",
        to: TO,
        from: "+61400000000",
        template: { id: "HX1", variables: { "1": "123456" } },
      }),
    ).toEqual({
      _tag: "Template",
      to: TO,
      from: "+61400000000",
      template: { id: "HX1", variables: { "1": "123456" } },
    });
    expect(decodeMessage({ _tag: "Template", to: TO, template: { id: "HX1" } })).toEqual({
      _tag: "Template",
      to: TO,
      template: { id: "HX1" },
    });
  });

  it("rejects an empty body, an empty template id, a non-E.164 sender and an unknown tag", () => {
    expect(() => decodeMessage({ _tag: "Text", to: TO, body: "" })).toThrow();
    expect(() => decodeMessage({ _tag: "Template", to: TO, template: { id: "" } })).toThrow();
    expect(() => decodeMessage({ _tag: "Text", to: TO, from: "Example", body: "hi" })).toThrow();
    expect(() => decodeMessage({ _tag: "Media", to: TO, body: "hi" })).toThrow();
    expect(() => decodeMessage({ to: TO, body: "hi" })).toThrow();
  });

  it("rejects non-string template variables", () => {
    expect(() =>
      decodeMessage({ _tag: "Template", to: TO, template: { id: "HX1", variables: { "1": 1 } } }),
    ).toThrow();
  });
});

describe("decodeWhatsAppMessage", () => {
  it("succeeds with the typed message", async () => {
    const message = await Effect.runPromise(
      decodeWhatsAppMessage({ _tag: "Text", to: TO, body: "Your code is 123456" }),
    );
    expect(message._tag).toBe("Text");
  });

  it("fails with a WhatsAppValidationError listing each issue", async () => {
    const error = await Effect.runPromise(
      Effect.flip(decodeWhatsAppMessage({ _tag: "Text", to: "0412 345 678", body: 1 })),
    );
    expect(error).toBeInstanceOf(WhatsAppValidationError);
    expect(error._tag).toBe("WhatsAppValidationError");
    expect(error.issues.join("\n")).toContain("to");
    expect(error.issues.join("\n")).toContain("body");
  });
});

describe("WhatsAppSendResult", () => {
  it("encodes `none` as an absent key, so a result is plain JSON", () => {
    expect(Schema.encodeSync(WhatsAppSendResult)({ id: Option.none() })).toEqual({});
    expect(Schema.decodeUnknownSync(WhatsAppSendResult)({ id: "SM1" }).id).toStrictEqual(
      Option.some("SM1"),
    );
  });
});

describe("WhatsAppService.layerRecording", () => {
  it("records every send and numbers the ids from 1", async () => {
    const sent: Array<WhatsAppMessage> = [];
    const results = await Effect.runPromise(
      Effect.gen(function* () {
        const first = yield* sendWhatsApp({ _tag: "Text", to: TO, body: "one" });
        const rest = yield* sendWhatsAppBatch([
          { _tag: "Template", to: TO, template: { id: "HX2" } },
          { _tag: "Text", to: TO, body: "three" },
        ]);
        return [first, ...rest];
      }).pipe(Effect.provide(WhatsAppService.layerRecording(sent))),
    );
    expect(sent.map((m) => m._tag)).toEqual(["Text", "Template", "Text"]);
    expect(results.map((r) => r.id)).toStrictEqual([
      Option.some("recorded-1"),
      Option.some("recorded-2"),
      Option.some("recorded-3"),
    ]);
  });
});

describe("WhatsAppSendError", () => {
  it("is yieldable and tagged", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.gen(function* () {
          return yield* new WhatsAppSendError({
            provider: "test",
            message: "rejected",
            status: Option.some(400),
          });
        }),
      ),
    );
    expect(error._tag).toBe("WhatsAppSendError");
    expect(error.status).toStrictEqual(Option.some(400));
  });
});
