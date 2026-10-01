---
"@thomasfosterau/effect-email": minor
"@thomasfosterau/effect-email-sendgrid": minor
"@thomasfosterau/effect-email-resend": minor
---

**Breaking:** requires `effect@>=4.0.0-rc.118`.

Effect rc.118 removed the `effect/unstable/*` export paths, so the previous peer range (`>=4.0.0-rc.115`) admitted versions that fail at import. The peer floor is now `>=4.0.0-rc.118` and the packages import `effect/http/*` (previously `effect/unstable/http/*`); the emitted `dist/*.d.ts` reference the new paths, so consumers must be on rc.118 or newer.

Behaviour change from rc.118's `ConfigProvider`: an empty environment variable now counts as missing. `layerConfig` in the SendGrid and Resend packages therefore falls back to the default base URL when `*_BASE_URL` is set to `""`, and fails with a missing-config error when the API key variable is set to `""`.
