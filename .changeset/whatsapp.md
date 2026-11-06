---
"@thomasfosterau/effect-connect": minor
---

A WhatsApp channel. The core gains `WhatsAppMessage`, a union on `_tag` of a free-form text message (`{ _tag: "Text", to, from?, body }`, valid only inside WhatsApp's 24-hour customer-service window) and a template message (`{ _tag: "Template", to, from?, template: { id, variables? } }`), with `WhatsAppSendResult`, `decodeWhatsAppMessage`, the `WhatsAppService` contract (`send`, `sendBatch`, `layerRecording`), the `sendWhatsApp` / `sendWhatsAppBatch` accessors and the `WhatsAppSendError` / `WhatsAppValidationError` errors.
