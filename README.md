# @effect-email/core

A very generic Effect-native Email library that abstracts over most transactional and marketing email APIs.

## Features

- 🎯 **Effect-native**: Built with Effect for type-safe, composable email operations
- 🔌 **Provider agnostic**: Abstract interface for any email service provider
- 📧 **Transactional & Marketing**: Support for both use cases
- 🛡️ **Type-safe**: Full TypeScript support with Effect Schema validation
- 🧩 **Composable**: Leverage Effect's powerful composition utilities

## Installation

```bash
npm install @effect-email/core effect
# or
bun add @effect-email/core effect
# or
yarn add @effect-email/core effect
# or
pnpm add @effect-email/core effect
```

## Usage

### Basic Email Structure

```typescript
import { Email, EmailService } from "@effect-email/core";
import * as Effect from "effect/Effect";

// Create an email message
const email: typeof Email.EmailMessage.Type = {
  from: { email: "sender@example.com", name: "Sender" },
  to: [{ email: "recipient@example.com", name: "Recipient" }],
  subject: "Hello from Effect Email!",
  html: "<p>This is a test email</p>",
  text: "This is a test email",
};

// Send email using the EmailService
const program = Effect.gen(function* () {
  const emailService = yield* EmailService.EmailService;
  const result = yield* emailService.send(email);
  console.log("Email sent:", result.id);
});
```

### Implementing a Provider

To implement a custom email provider, implement the `EmailService` interface:

```typescript
import { EmailService } from "@effect-email/core";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

class MyEmailProvider implements EmailService.EmailService {
  send(message) {
    return Effect.tryPromise({
      try: async () => {
        // Your provider-specific implementation
        const result = await myProviderApi.send(message);
        return {
          id: result.messageId,
          accepted: message.to.map(r => r.email),
          rejected: [],
        };
      },
      catch: (error) => new EmailService.EmailSendError(
        "Failed to send email",
        error
      ),
    });
  }

  sendBatch(messages) {
    return Effect.all(messages.map((msg) => this.send(msg)));
  }
}

export const MyEmailProviderLive = Layer.succeed(
  EmailService.EmailService,
  new MyEmailProvider()
);
```

## Architecture

The library provides a core abstraction layer with:

- **Email Models**: Type-safe email message schemas using Effect Schema
- **EmailService Interface**: Standard interface for all providers
- **Error Types**: Structured error handling with EmailSendError and EmailValidationError

## Development

This project uses Bun as the package manager and runtime:

```bash
# Install dependencies
bun install

# Run type checking
bun run typecheck

# Build the project
bun run build

# Run tests
bun test

# Run linting
bun run lint
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT © Thomas Foster

