import { describe, expect, test } from "bun:test";
import * as Schema from "@effect/schema/Schema";
import { EmailAddress, Recipient, EmailMessage } from "../src/Email.js";

describe("Email", () => {
  test("should validate a correct email address", () => {
    const result = Schema.decodeUnknownSync(EmailAddress)("test@example.com");
    expect(result).toBe("test@example.com");
  });

  test("should reject an invalid email address", () => {
    expect(() => {
      Schema.decodeUnknownSync(EmailAddress)("invalid-email");
    }).toThrow();
  });

  test("should create a valid recipient", () => {
    const recipient = Schema.decodeUnknownSync(Recipient)({
      email: "test@example.com",
      name: "Test User",
    });
    expect(recipient.email).toBe("test@example.com");
    expect(recipient.name).toBe("Test User");
  });

  test("should create a valid email message", () => {
    const message = Schema.decodeUnknownSync(EmailMessage)({
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
});
