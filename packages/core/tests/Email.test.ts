/**
 * Unit coverage for `./Email` — the message model and its boundary decoder.
 *
 * The four decode cases are the original scaffold's `src/Email.test.ts`
 * ported onto `effect/Schema`; the rest pins the boundary decoder's error
 * shape and the recipient projection the providers build their payloads from.
 */

import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  decodeEmailMessage,
  EmailAddress,
  EmailMessage,
  EmailSendResult,
  EmailValidationError,
  Recipient,
  recipientAddresses,
} from "../src/index.ts";

const decodeAddress = Schema.decodeUnknownSync(EmailAddress);
const decodeRecipient = Schema.decodeUnknownSync(Recipient);
const decodeMessage = Schema.decodeUnknownSync(EmailMessage);

describe("EmailAddress", () => {
  it("accepts a well-formed address", () => {
    expect(decodeAddress("test@example.com")).toBe("test@example.com");
  });

  it("rejects an address with no domain", () => {
    expect(() => decodeAddress("invalid-email")).toThrow();
  });

  it("rejects whitespace inside the address", () => {
    expect(() => decodeAddress("some one@example.com")).toThrow();
  });
});

describe("Recipient", () => {
  it("decodes an address with a display name", () => {
    const recipient = decodeRecipient({ email: "test@example.com", name: "Test User" });
    expect(recipient.email).toBe("test@example.com");
    expect(recipient.name).toBe("Test User");
  });

  it("leaves the name key absent when it was absent", () => {
    // `optionalKey`, not `optional`: an absent name must not become
    // `name: undefined`, which a provider would serialise as `"name": null`.
    expect(decodeRecipient({ email: "test@example.com" })).toEqual({ email: "test@example.com" });
  });
});

describe("EmailMessage", () => {
  it("decodes a complete message", () => {
    const message = decodeMessage({
      from: { email: "sender@example.com", name: "Sender" },
      to: [{ email: "recipient@example.com", name: "Recipient" }],
      subject: "Test Subject",
      html: "<p>Test Body</p>",
      text: "Test Body",
    });
    expect(message.subject).toBe("Test Subject");
    expect(message.from.email).toBe("sender@example.com");
    expect(message.to).toHaveLength(1);
  });

  it("requires at least one recipient", () => {
    expect(() =>
      decodeMessage({ from: { email: "sender@example.com" }, to: [], subject: "s" }),
    ).toThrow();
  });

  it("rejects an invalid address anywhere in the envelope", () => {
    expect(() =>
      decodeMessage({
        from: { email: "sender@example.com" },
        to: [{ email: "recipient@example.com" }],
        bcc: [{ email: "not-an-address" }],
        subject: "s",
      }),
    ).toThrow();
  });

  it("carries headers and tags through untouched", () => {
    const message = decodeMessage({
      from: { email: "sender@example.com" },
      to: [{ email: "recipient@example.com" }],
      subject: "s",
      headers: { "X-Entity-Ref-ID": "abc" },
      tags: ["welcome"],
    });
    expect(message.headers).toEqual({ "X-Entity-Ref-ID": "abc" });
    expect(message.tags).toEqual(["welcome"]);
  });
});

describe("decodeEmailMessage", () => {
  it("succeeds with the typed message", async () => {
    const message = await Effect.runPromise(
      decodeEmailMessage({
        from: { email: "sender@example.com" },
        to: [{ email: "recipient@example.com" }],
        subject: "s",
        text: "t",
      }),
    );
    expect(message.to[0].email).toBe("recipient@example.com");
  });

  it("fails with an EmailValidationError listing each issue", async () => {
    const exit = await Effect.runPromiseExit(
      decodeEmailMessage({ from: { email: "nope" }, to: [], subject: 1 }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    const error = await Effect.runPromise(
      Effect.flip(decodeEmailMessage({ from: { email: "nope" }, to: [], subject: 1 })),
    );
    expect(error).toBeInstanceOf(EmailValidationError);
    expect(error._tag).toBe("EmailValidationError");
    expect(error.issues.length).toBeGreaterThan(0);
    expect(error.issues.join("\n")).toContain("subject");
  });
});

describe("EmailSendResult", () => {
  it("decodes the provider id from an optional key", () => {
    expect(Schema.decodeUnknownSync(EmailSendResult)({ id: "msg_1" }).id).toStrictEqual(
      Option.some("msg_1"),
    );
    expect(Schema.decodeUnknownSync(EmailSendResult)({}).id).toStrictEqual(Option.none());
  });

  it("encodes `none` as an absent key, so a result is plain JSON", () => {
    expect(Schema.encodeSync(EmailSendResult)({ id: Option.none() })).toEqual({});
    expect(Schema.encodeSync(EmailSendResult)({ id: Option.some("msg_1") })).toEqual({
      id: "msg_1",
    });
  });
});

describe("recipientAddresses", () => {
  it("lists to, cc and bcc addresses in that order", () => {
    const message = decodeMessage({
      from: { email: "sender@example.com" },
      to: [{ email: "a@example.com" }],
      cc: [{ email: "b@example.com" }],
      bcc: [{ email: "c@example.com" }, { email: "d@example.com" }],
      subject: "s",
    });
    expect(recipientAddresses(message)).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
      "d@example.com",
    ]);
  });

  it("is just `to` when cc and bcc are absent", () => {
    const message = decodeMessage({
      from: { email: "sender@example.com" },
      to: [{ email: "a@example.com" }],
      subject: "s",
    });
    expect(recipientAddresses(message)).toEqual(["a@example.com"]);
  });
});
