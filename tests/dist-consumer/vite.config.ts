import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      // Type-checks the emitted declarations; depends on every package's build
      // so `vp run check` at the root always exercises fresh `dist/` output.
      check: {
        command: "tsc -p tsconfig.json",
        dependsOn: [
          "@thomasfosterau/effect-email#build",
          "@thomasfosterau/effect-email-sendgrid#build",
          "@thomasfosterau/effect-email-resend#build",
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
