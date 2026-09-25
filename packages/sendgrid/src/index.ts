/**
 * `@thomasfosterau/effect-email-sendgrid` — the SendGrid provider for
 * `@thomasfosterau/effect-email`: the core `EmailService` over SendGrid's v3
 * Mail Send API, a batched `send`, and a typed client for the Templates,
 * Marketing Contacts, API Keys and User Profile resources. HTTP goes through
 * `effect/unstable/http`; there is no SDK.
 *
 * @module index
 */

import * as Layer from "effect/Layer";
import type { EmailService } from "@thomasfosterau/effect-email";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import { layerEmailService } from "./Mail.ts";
import { SendGridClient } from "./SendGridClient.ts";
import { SendGridConfig, type SendGridConfigInput } from "./SendGridConfig.ts";

export * from "./Errors.ts";
export * from "./Mail.ts";
export * from "./Resources.ts";
export * from "./SendGridClient.ts";
export * from "./SendGridConfig.ts";

/**
 * The SendGrid provider from literal configuration: the core `EmailService`
 * and the {@link SendGridClient}, over the `HttpClient` in context (provide
 * `FetchHttpClient.layer` on Workers, browsers and Node).
 */
export const layer = (
  config: SendGridConfigInput,
): Layer.Layer<EmailService | SendGridClient, never, HttpClient.HttpClient> =>
  layerEmailService.pipe(
    Layer.provideMerge(SendGridClient.layer),
    Layer.provide(SendGridConfig.layer(config)),
  );

/**
 * The SendGrid provider configured through `effect/Config`
 * (`SENDGRID_API_KEY`, optional `SENDGRID_BASE_URL`).
 */
export const layerConfig = layerEmailService.pipe(
  Layer.provideMerge(SendGridClient.layer),
  Layer.provide(SendGridConfig.layerConfig),
);
