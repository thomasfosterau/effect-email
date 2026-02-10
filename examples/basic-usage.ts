import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Email, EmailService } from "@effect-email/core";

/**
 * Example: Creating and sending an email with a mock provider
 */

// Mock email provider implementation
class MockEmailProvider implements EmailService.EmailService {
  send(message: typeof Email.EmailMessage.Type) {
    return Effect.sync(() => {
      console.log("Sending email:", {
        from: message.from.email,
        to: message.to.map((r) => r.email),
        subject: message.subject,
      });

      return {
        id: `mock-${Date.now()}`,
        accepted: message.to.map((r) => r.email),
        rejected: [],
      };
    });
  }

  sendBatch(messages: ReadonlyArray<typeof Email.EmailMessage.Type>) {
    return Effect.all(messages.map((msg) => this.send(msg)));
  }
}

// Create a Layer for the mock provider
const MockEmailProviderLive = Layer.succeed(
  EmailService.EmailService,
  new MockEmailProvider()
);

// Example usage
const program = Effect.gen(function* () {
  const emailService = yield* EmailService.EmailService;

  // Create an email message
  const email: typeof Email.EmailMessage.Type = {
    from: {
      email: "sender@example.com",
      name: "Sender Name",
    },
    to: [
      {
        email: "recipient@example.com",
        name: "Recipient Name",
      },
    ],
    subject: "Hello from Effect Email!",
    html: "<h1>Hello</h1><p>This is a test email from the Effect Email library.</p>",
    text: "Hello\n\nThis is a test email from the Effect Email library.",
  };

  // Send the email
  const result = yield* emailService.send(email);

  console.log("Email sent successfully!");
  console.log("Message ID:", result.id);
  console.log("Accepted:", result.accepted);

  return result;
});

// Run the program with the mock provider
const runnable = program.pipe(Effect.provide(MockEmailProviderLive));

Effect.runPromise(runnable).catch(console.error);
