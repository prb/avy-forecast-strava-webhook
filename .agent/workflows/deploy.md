---
description: How to deploy the Strava webhook application to production
---

To deploy the production environment, we use the `npm run deploy` script in the `apps/strava-webhook` package. This script automatically loads secrets from the `STRAVA.secrets` file in the project root.

### Prerequisites
1. Ensure the `STRAVA.secrets` file is present in the project root with the following format:
   ```bash
   export STRAVA_CLIENT_ID="xxx"
   export STRAVA_CLIENT_SECRET="xxx"
   export STRAVA_VERIFY_TOKEN="xxx"
   ```

### Recommended Workflow (Safe Production Deploy)
1. **Clean and Install** (Optional, recommended for a clean state):
   ```bash
   npm run clean && npm install
   ```
2. **Build and Test**:
   Ensure all packages are built and tests pass before deploying.
   ```bash
   npm run build
   npm test
   ```
3. **Deploy**:
   Navigate to the root or use workspace flag:
   ```bash
   npm run deploy -w apps/strava-webhook -- --context environment=prod
   ```

### Verification
1. After deployment, check the CloudWatch logs for the `Ingest` Lambda to verify it is receiving events without 403 errors.
2. Verify that the `Processor` Lambda successfully refreshes tokens and enriches Strava activities.
