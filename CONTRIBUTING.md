# Contributing to @effect-email/core

Thank you for your interest in contributing to @effect-email/core! We welcome contributions of all kinds.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/effect-email.git`
3. Install dependencies: `bun install`
4. Create a new branch: `git checkout -b my-feature`

## Development

### Prerequisites

- [Bun](https://bun.sh) v1.0 or higher
- Node.js v20 or higher (see .nvmrc)

### Commands

```bash
# Install dependencies
bun install

# Run type checking
bun run typecheck

# Build the project
bun run build

# Run tests
bun test

# Clean build output
bun run clean
```

## Making Changes

1. Make your changes in the `src/` directory
2. Add or update tests in `*.test.ts` files
3. Run tests to ensure they pass: `bun test`
4. Run type checking: `bun run typecheck`
5. Build the project: `bun run build`

## Adding a Changeset

We use [Changesets](https://github.com/changesets/changesets) to manage versioning and changelogs. When you make a change, you need to add a changeset:

```bash
bun run changeset
```

Follow the prompts to:
1. Select the type of change (major, minor, patch)
2. Provide a description of the change

This will create a new file in `.changeset/` that will be included in your PR.

## Submitting a Pull Request

1. Push your changes to your fork
2. Open a pull request against the `main` branch
3. Ensure your PR description clearly describes the changes
4. Link any relevant issues

### PR Checklist

- [ ] Tests pass (`bun test`)
- [ ] Type checking passes (`bun run typecheck`)
- [ ] Build succeeds (`bun run build`)
- [ ] Changeset added (`bun run changeset`)
- [ ] Code follows the existing style
- [ ] Documentation updated if needed

## Code Style

- Use TypeScript with strict mode enabled
- Follow the Effect ecosystem conventions
- Write tests for new features
- Keep changes focused and minimal

## Creating Provider Packages

If you want to create a provider package (e.g., `@effect-email/sendgrid`), follow these guidelines:

1. Implement the `EmailService` interface
2. Use Effect for all async operations
3. Provide proper error handling with typed errors
4. Include comprehensive tests
5. Document usage examples

## Questions?

Feel free to open an issue if you have any questions or need help!
