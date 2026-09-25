/**
 * Typed helpers over the {@link SendGridClient} for the resources the
 * original `effect-sendgrid` wrapper covered: dynamic templates, marketing
 * contacts, API keys and the user profile. Each is a plain object of
 * functions (not a `namespace`, which `erasableSyntaxOnly` forbids), and each
 * response body is decoded with the resource's schema — unknown keys pass
 * through untouched.
 *
 * @module Resources
 */

import * as Schema from "effect/Schema";
import { request, requestJson } from "./SendGridClient.ts";

// ---------------------------------------------------------------------------
// Templates — https://www.twilio.com/docs/sendgrid/api-reference/transactional-templates
// ---------------------------------------------------------------------------

/** One version of a transactional template. */
export const TemplateVersion = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  template_id: Schema.optionalKey(Schema.String),
  active: Schema.optionalKey(Schema.Int),
  name: Schema.optionalKey(Schema.String),
  subject: Schema.optionalKey(Schema.String),
});
export type TemplateVersion = typeof TemplateVersion.Type;

/** A transactional template. */
export const TemplateData = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  name: Schema.String,
  generation: Schema.optionalKey(Schema.Literals(["legacy", "dynamic"])),
  updated_at: Schema.optionalKey(Schema.String),
  versions: Schema.optionalKey(Schema.Array(TemplateVersion)),
});
export type TemplateData = typeof TemplateData.Type;

const TemplateList = Schema.Struct({ result: Schema.Array(TemplateData) });

/* oxlint-disable effect/prefer-option-over-null -- consumer-facing option bags: an omitted key IS "use SendGrid's default", exactly as the query string has it */
/** Template management. */
export const Template = {
  /** List templates, optionally by generation and page size. */
  list: (options?: { readonly generations?: "legacy" | "dynamic"; readonly page_size?: number }) =>
    requestJson(TemplateList)({ url: "/v3/templates", method: "GET", qs: options ?? {} }),

  /** Get one template by id. */
  get: (templateId: string) =>
    requestJson(TemplateData)({
      url: `/v3/templates/${encodeURIComponent(templateId)}`,
      method: "GET",
    }),

  /** Create a template. */
  create: (template: { readonly name: string; readonly generation?: "legacy" | "dynamic" }) =>
    requestJson(TemplateData)({ url: "/v3/templates", method: "POST", body: template }),

  /** Rename a template. */
  update: (templateId: string, template: { readonly name?: string }) =>
    requestJson(TemplateData)({
      url: `/v3/templates/${encodeURIComponent(templateId)}`,
      method: "PATCH",
      body: template,
    }),

  /** Delete a template. SendGrid answers `204` with no body. */
  remove: (templateId: string) =>
    request({ url: `/v3/templates/${encodeURIComponent(templateId)}`, method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// Marketing contacts — https://www.twilio.com/docs/sendgrid/api-reference/contacts
// ---------------------------------------------------------------------------

/** A marketing contact. */
export const ContactData = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  email: Schema.String,
  first_name: Schema.optionalKey(Schema.String),
  last_name: Schema.optionalKey(Schema.String),
  alternate_emails: Schema.optionalKey(Schema.Array(Schema.String)),
  address_line_1: Schema.optionalKey(Schema.String),
  address_line_2: Schema.optionalKey(Schema.String),
  city: Schema.optionalKey(Schema.String),
  state_province_region: Schema.optionalKey(Schema.String),
  postal_code: Schema.optionalKey(Schema.String),
  country: Schema.optionalKey(Schema.String),
  phone_number: Schema.optionalKey(Schema.String),
  whatsapp: Schema.optionalKey(Schema.String),
  line: Schema.optionalKey(Schema.String),
  facebook: Schema.optionalKey(Schema.String),
  unique_name: Schema.optionalKey(Schema.String),
  custom_fields: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
export type ContactData = typeof ContactData.Type;

const ContactJob = Schema.Struct({ job_id: Schema.String });
const ContactSearchResult = Schema.Struct({
  result: Schema.Array(ContactData),
  contact_count: Schema.Int,
});

/** Marketing contacts. */
export const Contact = {
  /** Add or update contacts. SendGrid processes them asynchronously and answers a job id. */
  upsert: (contacts: ReadonlyArray<ContactData>) =>
    requestJson(ContactJob)({ url: "/v3/marketing/contacts", method: "PUT", body: { contacts } }),

  /** Search contacts with SendGrid's query language. */
  search: (query?: {
    readonly query?: string;
    readonly page_size?: number;
    readonly page_token?: string;
  }) =>
    requestJson(ContactSearchResult)({
      url: "/v3/marketing/contacts/search",
      method: "POST",
      body: query ?? {},
    }),

  /** Get one contact by id. */
  get: (contactId: string) =>
    requestJson(ContactData)({
      url: `/v3/marketing/contacts/${encodeURIComponent(contactId)}`,
      method: "GET",
    }),

  /**
   * Delete contacts by id. SendGrid's DELETE takes comma-separated ids in
   * the query string and answers a job id.
   */
  remove: (contactIds: ReadonlyArray<string>) =>
    requestJson(ContactJob)({
      url: "/v3/marketing/contacts",
      method: "DELETE",
      qs: { ids: contactIds.join(",") },
    }),
};

// ---------------------------------------------------------------------------
// API keys — https://www.twilio.com/docs/sendgrid/api-reference/api-keys
// ---------------------------------------------------------------------------

/** An API key. `api_key` (the secret) is only ever present on `create`. */
export const ApiKeyData = Schema.Struct({
  api_key_id: Schema.optionalKey(Schema.String),
  name: Schema.String,
  scopes: Schema.optionalKey(Schema.Array(Schema.String)),
  api_key: Schema.optionalKey(Schema.String),
});
export type ApiKeyData = typeof ApiKeyData.Type;

const ApiKeyList = Schema.Struct({ result: Schema.Array(ApiKeyData) });

/** API key management. */
export const ApiKey = {
  /** List API keys. */
  list: (options?: { readonly limit?: number }) =>
    requestJson(ApiKeyList)({ url: "/v3/api_keys", method: "GET", qs: options ?? {} }),

  /** Get one API key by id. */
  get: (apiKeyId: string) =>
    requestJson(ApiKeyData)({
      url: `/v3/api_keys/${encodeURIComponent(apiKeyId)}`,
      method: "GET",
    }),

  /** Create an API key. The answer carries the secret, once. */
  create: (apiKey: { readonly name: string; readonly scopes?: ReadonlyArray<string> }) =>
    requestJson(ApiKeyData)({ url: "/v3/api_keys", method: "POST", body: apiKey }),

  /** Rename an API key. */
  update: (apiKeyId: string, name: string) =>
    requestJson(ApiKeyData)({
      url: `/v3/api_keys/${encodeURIComponent(apiKeyId)}`,
      method: "PATCH",
      body: { name },
    }),

  /** Delete an API key. SendGrid answers `204` with no body. */
  remove: (apiKeyId: string) =>
    request({ url: `/v3/api_keys/${encodeURIComponent(apiKeyId)}`, method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// User profile — https://www.twilio.com/docs/sendgrid/api-reference/users-api
// ---------------------------------------------------------------------------

/** The account's user profile. */
export const UserProfileData = Schema.Struct({
  username: Schema.optionalKey(Schema.String),
  email: Schema.optionalKey(Schema.String),
  first_name: Schema.optionalKey(Schema.String),
  last_name: Schema.optionalKey(Schema.String),
  company: Schema.optionalKey(Schema.String),
  phone: Schema.optionalKey(Schema.String),
  website: Schema.optionalKey(Schema.String),
  address: Schema.optionalKey(Schema.String),
  address2: Schema.optionalKey(Schema.String),
  city: Schema.optionalKey(Schema.String),
  state: Schema.optionalKey(Schema.String),
  zip: Schema.optionalKey(Schema.String),
  country: Schema.optionalKey(Schema.String),
});
export type UserProfileData = typeof UserProfileData.Type;

/** The current user's profile. */
export const UserProfile = {
  /** Get the profile. */
  get: () => requestJson(UserProfileData)({ url: "/v3/user/profile", method: "GET" }),

  /** Update the profile. */
  update: (profile: Partial<UserProfileData>) =>
    requestJson(UserProfileData)({ url: "/v3/user/profile", method: "PATCH", body: profile }),
};
/* oxlint-enable effect/prefer-option-over-null */
