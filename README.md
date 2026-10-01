# effect-email

An Effect-native email abstraction, published as three npm packages.

| Package | What it is |
| --- | --- |
| [`@thomasfosterau/effect-email`](packages/core/README.md) | The core: the message model (`effect/Schema`), the `EmailService` contract (`Context.Service`) and its errors. Provider-agnostic. Peer: `effect`. |
| [`@thomasfosterau/effect-email-sendgrid`](packages/sendgrid/README.md) | The SendGrid provider: the v3 Mail Send API over Effect's `HttpClient` with request batching, plus a typed client for the Templates, Marketing Contacts, API Keys and User Profile resources. Absorbs the former `thomasfosterau/effect-sendgrid`. |
| [`@thomasfosterau/effect-email-resend`](packages/resend/README.md) | The Resend provider: `POST /emails` over Effect's `HttpClient` with no SDK, a `Redacted` key, a no-op layer for un-provisioned stages and an env-driven resolver. |

A consumer sends through `EmailService` and provides one provider's layer at the edge; swapping providers is a one-line layer change. Every provider talks HTTP through `effect/http`, so it runs on Cloudflare Workers, browsers and Node alike. Start with the [core README](packages/core/README.md); each package README is its API reference.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and the pre-PR checklist, and [PUBLISHING.md](PUBLISHING.md) for the release pipeline.

## License

MIT
