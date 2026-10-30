/**
 * Unit coverage for `./Sms`, `./SmsService` and the SMS errors — the SMS
 * message model, its boundary decoder, the contract's accessors and the
 * recording double.
 */

import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  decodeSmsMessage,
  PhoneNumber,
  sendSms,
  sendSmsBatch,
  SmsMessage,
  SmsSender,
  SmsSendError,
  SmsSendResult,
  SmsService,
  SmsValidationError,
} from "../src/index.ts";

const decodePhone = Schema.decodeUnknownSync(PhoneNumber);
const decodeSender = Schema.decodeUnknownSync(SmsSender);
const decodeMessage = Schema.decodeUnknownSync(SmsMessage);

describe("PhoneNumber", () => {
  it("accepts an E.164 number", () => {
    expect(decodePhone("+61412345678")).toBe("+61412345678");
    expect(decodePhone("+14155550100")).toBe("+14155550100");
  });

  it("rejects a national-format, punctuated, leading-zero or over-long number", () => {
    expect(() => decodePhone("0412345678")).toThrow(Schema.SchemaError);
    expect(() => decodePhone("+61 412 345 678")).toThrow(Schema.SchemaError);
    expect(() => decodePhone("+0412345678")).toThrow(Schema.SchemaError);
    expect(() => decodePhone(`+1${"2".repeat(15)}`)).toThrow(Schema.SchemaError);
  });
});

describe("SmsSender", () => {
  it("accepts an E.164 number, a short code and an alphanumeric sender ID", () => {
    expect(decodeSender("+61412345678")).toBe("+61412345678");
    expect(decodeSender("12345")).toBe("12345");
    expect(decodeSender("Example Co")).toBe("Example Co");
  });

  it("rejects an alphanumeric sender over 11 characters or with punctuation", () => {
    expect(() => decodeSender("Example Company")).toThrow(Schema.SchemaError);
    expect(() => decodeSender("Example!")).toThrow(Schema.SchemaError);
    expect(() => decodeSender("")).toThrow(Schema.SchemaError);
  });
});

describe("SmsMessage", () => {
  it("leaves the from key absent when it was absent", () => {
    expect(decodeMessage({ to: "+61412345678", body: "hi" })).toEqual({
      to: "+61412345678",
      body: "hi",
    });
  });

  it("rejects an empty body", () => {
    expect(() => decodeMessage({ to: "+61412345678", body: "" })).toThrow(Schema.SchemaError);
  });
});

describe("decodeSmsMessage", () => {
  it("succeeds with the typed message", async () => {
    const message = await Effect.runPromise(
      decodeSmsMessage({ to: "+61412345678", from: "Example", body: "Your code is 123456" }),
    );
    expect(message.from).toBe("Example");
  });

  it("fails with an SmsValidationError listing each issue", async () => {
    const error = await Effect.runPromise(
      Effect.flip(decodeSmsMessage({ to: "0412 345 678", body: 1 })),
    );
    expect(error).toBeInstanceOf(SmsValidationError);
    expect(error._tag).toBe("SmsValidationError");
    // `errors: "all"`: both the recipient and the body are reported.
    expect(error.issues.join("\n")).toContain("to");
    expect(error.issues.join("\n")).toContain("body");
  });
});

describe("SmsSendResult", () => {
  it("encodes `none` as an absent key, so a result is plain JSON", () => {
    expect(Schema.encodeSync(SmsSendResult)({ id: Option.none() })).toEqual({});
    expect(Schema.decodeUnknownSync(SmsSendResult)({ id: "SM1" }).id).toStrictEqual(
      Option.some("SM1"),
    );
  });
});

describe("SmsService.layerRecording", () => {
  it("records every send and numbers the ids from 1", async () => {
    const sent: Array<SmsMessage> = [];
    const results = await Effect.runPromise(
      Effect.gen(function* () {
        const first = yield* sendSms({ to: "+61400000001", body: "one" });
        const rest = yield* sendSmsBatch([
          { to: "+61400000002", body: "two" },
          { to: "+61400000003", body: "three" },
        ]);
        return [first, ...rest];
      }).pipe(Effect.provide(SmsService.layerRecording(sent))),
    );
    expect(sent.map((m) => m.body)).toEqual(["one", "two", "three"]);
    expect(results.map((r) => r.id)).toStrictEqual([
      Option.some("recorded-1"),
      Option.some("recorded-2"),
      Option.some("recorded-3"),
    ]);
  });
});

describe("SmsSendError", () => {
  it("is yieldable and tagged", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.gen(function* () {
          return yield* new SmsSendError({
            provider: "test",
            message: "rejected",
            status: Option.some(400),
          });
        }),
      ),
    );
    expect(error._tag).toBe("SmsSendError");
    expect(error.status).toStrictEqual(Option.some(400));
  });
});
