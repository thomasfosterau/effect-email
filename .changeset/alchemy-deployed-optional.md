---
"@thomasfosterau/effect-connect-alchemy": patch
---

`Deployed<B>` now types an optional binding as an optional `string`. It typed every optional key (`TWILIO_FROM`, `VONAGE_FROM`, …) as `never`, so a Worker typed with it could not read an optional value. Found by the new compile-time check that each bindings record's `Deployed` view equals the env alchemy's `Cloudflare.InferEnv` gives a Worker bound with it.
