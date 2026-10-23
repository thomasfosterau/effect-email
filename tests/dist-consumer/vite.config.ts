import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      // Type-checks the emitted declarations; depends on every package's build
      // so `vp run check` at the root always exercises fresh `dist/` output.
      check: {
        command: "tsc -p tsconfig.json",
        dependsOn: [
          "@thomasfosterau/effect-connect#build",
          "@thomasfosterau/effect-connect-sendgrid#build",
          "@thomasfosterau/effect-connect-resend#build",
          "@thomasfosterau/effect-connect-twilio#build",
          "@thomasfosterau/effect-connect-vonage#build",
          "@thomasfosterau/effect-connect-slack#build",
          "@thomasfosterau/effect-connect-discord#build",
        ],
        cache: {
          input: [
            { auto: true },
            "!node_modules/**",
            { pattern: "packages/*/dist/**", base: "workspace" as const },
          ],
          output: [],
        },
      },
    },
  },
});
