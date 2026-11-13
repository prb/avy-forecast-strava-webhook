---
inclusion: always
---

# TypeScript Guidelines & Best Practices

Apply these guidelines when writing, refactoring, or reviewing TypeScript code across this monorepo (`forecast-api`, `forecast-formatter`, and `strava-webhook`).

---

## 1. Type Safety & Strictness

- **Adhere to Strict Mode**: The compiler enforces `strict: true`, `noUnusedLocals`, `noUnusedParameters`, and `noImplicitReturns`. Code must compile cleanly with `tsc --noEmit`.
- **Avoid `any`**:
  - Prefer `unknown` when incoming data shape is not guaranteed (e.g., external API responses, webhook payloads).
  - Use type guards, discriminating unions, or assertion functions to narrow `unknown` safely before access.
  - If a 3rd-party library forces a type cast, use the most specific type possible or document why a cast was required.
- **Explicit Return Types on Public APIs**: Annotate return types on exported functions, package APIs, and AWS Lambda handlers.
- **Consolidate Domain Types**:
  - Keep domain types in dedicated `types/` folders or `types.ts` files within each package.
  - Reuse shared types rather than duplicating ad-hoc interfaces.

---

## 2. ESM & Module Resolution

- **Native ESM Imports**:
  - The project uses `"type": "module"` with `"moduleResolution": "bundler"`.
  - Always include the `.js` extension when importing local TypeScript files (e.g., `import { fetchProduct } from './api-base.js';`).
- **Type-Only Imports**:
  - Use `import type { ... } from '...'` when importing interfaces, type aliases, or types. This clarifies runtime dependencies and facilitates tree-shaking.

---

## 3. Asynchronous Code & Error Handling

- **`async` / `await` Over Raw Promises**: Avoid raw `.then()` / `.catch()` chains. Use `async`/`await` with standard `try`/`catch`.
- **External API Resilience**:
  - Validate response status (`response.ok`) AND payload content before trusting data. Upstream APIs (like Avalanche.org) may return HTTP 200 with empty/null skeletons for invalid IDs.
  - Handle rate limits, timeouts, and network exceptions gracefully.
- **Never Silently Swallow Errors**:
  - If an error is caught and cannot be recovered from, either re-throw with context (`new Error("Context: " + err.message)`) or log structured diagnostic details.
  - In AWS Lambda handlers, ensure unhandled errors propagate or result in appropriate HTTP status responses (e.g. 500) rather than hanging or returning misleading 200s.

---

## 4. AWS Lambda & Serverless Conventions

- **Esbuild Compatibility**:
  - Keep Lambda handlers modular (`lambda/ingest.ts`, `lambda/processor.ts`, `lambda/oauth.ts`, `lambda/web.ts`).
  - `@aws-sdk/*` dependencies are externalized during Lambda bundling—ensure any non-SDK dependencies are cleanly bundled without native binary incompatibilities.
- **Structured Logging**:
  - Use structured JSON logs in Lambda handlers rather than unstructured `console.log()` strings:
    ```typescript
    console.log(JSON.stringify({
      level: 'INFO',
      event: 'ActivityProcessed',
      activityId,
      athleteId,
    }));
    ```
- **Idempotency & Safe Retries**:
  - Lambda processors consume from SQS queues. Handlers should be designed to handle duplicate messages safely.

---

## 5. Testing with Vitest

- **Fast & Deterministic Unit Tests**:
  - Unit tests must not depend on live network services. Mock external HTTP calls (`fetch`) and AWS SDK clients.
  - Keep integration tests that hit external endpoints (e.g. Avalanche.org) clearly segregated or guarded with timeouts and error resilience.
- **Descriptive Assertions**:
  - Test both happy paths and edge cases (e.g., missing coordinates, activities outside avalanche zones, empty API responses, expired OAuth tokens).
