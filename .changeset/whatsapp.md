---
"@thomasfosterau/effect-connect": minor
"@thomasfosterau/effect-connect-twilio": minor
---

A WhatsApp channel. The core gains `WhatsAppMessage`, a union on `_tag` of a free-form text message (`{ _tag: "Text", to, from?, body }`, valid only inside WhatsApp's 24-hour customer-service window) and a template message (`{ _tag: "Template", to, from?, template: { id, variables? } }`), with `WhatsAppSendResult`, `decodeWhatsAppMessage`, the `WhatsAppService` contract (`send`, `sendBatch`, `layerRecording`), the `sendWhatsApp` / `sendWhatsAppBatch` accessors and the `WhatsAppSendError` / `WhatsAppValidationError` errors.

The Twilio provider implements it over the same Messages resource as SMS: `layerWhatsApp(config)`, `layerWhatsAppConfig`, `layerWhatsAppService`, `noopWhatsApp` and `resolveWhatsAppTransport(env)`. `To` / `From` are sent `whatsapp:`-prefixed; a text message becomes `Body`, a template `ContentSid` + `ContentVariables` (JSON). The WhatsApp default sender is a new, separate `whatsappFrom` setting (`TWILIO_WHATSAPP_FROM`), never the SMS `from`; a configured Messaging Service is used for both channels. The SMS API is unchanged: `layer(config)` still provides exactly `SmsService`.
