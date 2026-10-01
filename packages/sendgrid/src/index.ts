/**
 * `@thomasfosterau/effect-email-sendgrid` — the SendGrid provider for
 * `@thomasfosterau/effect-email`: the core `EmailService` over SendGrid's v3
 * Mail Send API, a batched `send`, and a typed client for the Templates,
 * Marketing Contacts, API Keys and User Profile resources. HTTP goes through
 * `effect/http`; there is no SDK.
 *
 * @module index
 */

import * as Layer from "effect/Layer";
import type { EmailService } from "@thomasfosterau/effect-email";
import type * as HttpClient from "effect/http/HttpClient";
import { layerEmailService } from "./Mail.ts";
import { SendGridClient } from "./SendGridClient.ts";
import { SendGridConfig, type SendGridConfigInput } from "./SendGridConfig.ts";

/** The failures the SendGrid client admits. */
export * from "./Errors.ts";
/** The mail sender: the payload mapping, the `EmailService` layer and the batched `send`. */
export * from "./Mail.ts";
/** Typed helpers for templates, marketing contacts, API keys and the user profile. */
export * from "./Resources.ts";
/** The generic SendGrid v3 REST client. */
export * from "./SendGridClient.ts";
/** The SendGrid credential and host, as a service. */
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
