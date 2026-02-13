# Architecture

## Overview

`@effect-email/core` provides a foundational layer for building email functionality in Effect-based applications. The library is designed to be provider-agnostic, allowing you to swap email providers without changing your application code.

## Core Concepts

### Email Models

The library uses Effect Schema to define type-safe email models:

- **EmailAddress**: Validated email address string
- **Recipient**: Email address with optional name
- **EmailMessage**: Complete email with all metadata
- **Attachment**: File attachments with base64 content
- **EmailSendResult**: Result of sending an email

### EmailService Interface

All email providers implement the `EmailService` interface:

```typescript
interface EmailService {
  send(message: EmailMessage): Effect<EmailSendResult, EmailSendError | EmailValidationError>
  sendBatch(messages: ReadonlyArray<EmailMessage>): Effect<ReadonlyArray<EmailSendResult>, EmailSendError | EmailValidationError>
}
```

### Error Handling

The library defines two main error types:

- **EmailSendError**: Errors that occur during email transmission
- **EmailValidationError**: Errors in email validation

Both errors are Effect-compatible and can be handled using Effect's error handling utilities.

### Dependency Injection

The library uses Effect's Context system for dependency injection:

```typescript
const EmailService = Context.GenericTag<EmailService>("@effect-email/EmailService");
```

This allows you to:
1. Easily swap implementations
2. Test with mock providers
3. Compose multiple email services

## Creating a Provider

To create a new email provider:

1. Implement the `EmailService` interface
2. Convert your provider's API responses to the standard types
3. Handle errors appropriately
4. Create a Layer for dependency injection

### Example Provider Structure

```typescript
class MyProvider implements EmailService {
  constructor(private config: MyProviderConfig) {}

  send(message: EmailMessage) {
    return Effect.tryPromise({
      try: async () => {
        // Convert message to provider format
        const providerMessage = this.toProviderFormat(message);
        
        // Send via provider API
        const result = await this.api.send(providerMessage);
        
        // Convert result to standard format
        return this.fromProviderFormat(result);
      },
      catch: (error) => new EmailSendError({
        message: "Send failed",
        cause: error
      }),
    });
  }

  sendBatch(messages: ReadonlyArray<EmailMessage>) {
    // Implement batch sending
    return Effect.all(messages.map(msg => this.send(msg)));
  }
}

export const MyProviderLive = Layer.effect(
  EmailService,
  Effect.gen(function* () {
    const config = yield* MyProviderConfig;
    return new MyProvider(config);
  })
);
```

## Provider Packages

Provider implementations should be published as separate packages:

- `@effect-email/sendgrid`
- `@effect-email/mailgun`
- `@effect-email/postmark`
- `@effect-email/resend`
- etc.

This keeps the core lightweight and allows users to install only what they need.

## Testing Strategy

### Unit Tests

Test email models and validation:

```typescript
test("should validate email address", () => {
  const result = Schema.decodeUnknownSync(EmailAddress)("test@example.com");
  expect(result).toBe("test@example.com");
});
```

### Integration Tests

Test provider implementations with mock APIs or test modes:

```typescript
const MockProvider = Layer.succeed(EmailService, new MockEmailService());

test("should send email", () => {
  const program = Effect.gen(function* () {
    const service = yield* EmailService;
    const result = yield* service.send(testEmail);
    expect(result.id).toBeDefined();
  });

  return Effect.runPromise(program.pipe(Effect.provide(MockProvider)));
});
```

## Extension Points

The architecture supports various extensions:

1. **Templates**: Create template rendering services
2. **Tracking**: Add email tracking capabilities
3. **Queuing**: Integrate with job queues for async sending
4. **Retry Logic**: Add retry strategies for failed sends
5. **Rate Limiting**: Implement rate limiting for providers
6. **Monitoring**: Add metrics and logging

All these can be composed using Effect's Layer system.
