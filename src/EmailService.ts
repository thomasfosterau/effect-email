import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type * as Email from "./Email.js";

/**
 * Error types for email operations
 */
export class EmailSendError extends Data.TaggedError("EmailSendError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class EmailValidationError extends Data.TaggedError("EmailValidationError")<{
  readonly message: string;
  readonly errors: ReadonlyArray<string>;
}> {}

/**
 * Core email service interface
 * All email providers should implement this interface
 */
export interface EmailService {
  /**
   * Send a single email
   */
  readonly send: (
    message: typeof Email.EmailMessage.Type
  ) => Effect.Effect<
    typeof Email.EmailSendResult.Type,
    EmailSendError | EmailValidationError
  >;

  /**
   * Send multiple emails in batch
   */
  readonly sendBatch: (
    messages: ReadonlyArray<typeof Email.EmailMessage.Type>
  ) => Effect.Effect<
    ReadonlyArray<typeof Email.EmailSendResult.Type>,
    EmailSendError | EmailValidationError
  >;
}

/**
 * Email service tag for dependency injection
 */
export const EmailService = Context.GenericTag<EmailService>("@effect-email/EmailService");
