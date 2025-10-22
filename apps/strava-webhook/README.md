# Strava Webhook - Avalanche Forecast Enrichment

> **Last Updated:** October 2025

AWS Lambda application that automatically adds NWAC avalanche forecasts to Strava BackcountrySki activities.

## Architecture

- **AWS CDK** - Infrastructure as Code
- **Lambda Functions** - Serverless handlers for webhook, OAuth, and web UI
- **DynamoDB** - User token storage
- **API Gateway** - HTTP endpoints
- **Dependencies** - Uses `@multifarious/forecast-api` and `@multifarious/forecast-formatter`

## Features

✅ Multi-user OAuth flow
✅ Automatic token refresh (6-hour expiration)
✅ Webhook event processing (create and update events)
✅ Manual forecast trigger via `#avy_forecast` command
✅ Location-based forecast lookup
✅ Rich forecast formatting with colored danger squares (🟩🟨🟧🟥⬛)
✅ Activity description updates with full zone information
✅ Idempotent updates (won't duplicate forecasts)
✅ Simple web UI for onboarding
✅ Comprehensive test suite (40 tests: 9 OAuth + 22 webhook + 9 Strava utilities)

## Prerequisites

1. **AWS Account** with CDK configured
2. **Strava API Application** registered at https://www.strava.com/settings/api
3. **Node.js 20+**
4. **AWS CLI** configured with credentials

## Environment Setup

### 1. Strava API Credentials

From your Strava API application settings, you'll need:
- **Client ID**
- **Client Secret**

### 2. Create Environment File

Create `.env` file in this directory:

```bash
# Strava API credentials
STRAVA_CLIENT_ID=your_client_id_here
STRAVA_CLIENT_SECRET=your_client_secret_here

# Webhook verification token (generate a random string)
STRAVA_VERIFY_TOKEN=$(openssl rand -hex 32)

# AWS region (optional, defaults to us-west-2)
CDK_DEFAULT_REGION=us-west-2
```

### 3. Export Environment Variables

```bash
# Load environment variables
export $(grep -v '^#' .env | xargs)

# Or source them
source .env
```

## Installation

```bash
# Install dependencies (from monorepo root)
npm install

# Or just for this app
cd apps/strava-webhook
npm install
```

## Build

```bash
# Build TypeScript and bundle Lambda functions
npm run build

# This runs:
# 1. tsc - Compile TypeScript
# 2. esbuild - Bundle Lambda handlers
```

## Deployment

### Initial Deployment

```bash
# Synthesize CloudFormation template (preview)
npm run synth

# Deploy to AWS
npm run deploy

# This will:
# 1. Create DynamoDB table
# 2. Deploy Lambda functions
# 3. Create API Gateway
# 4. Output URLs for webhook and OAuth
```

### Outputs

After deployment, CDK will output:

```
Outputs:
StravaWebhookStack.ApiUrl = https://abc123.execute-api.us-west-2.amazonaws.com/prod/
StravaWebhookStack.WebhookUrl = https://abc123.execute-api.us-west-2.amazonaws.com/prod/webhook
StravaWebhookStack.ConnectUrl = https://abc123.execute-api.us-west-2.amazonaws.com/prod/connect
StravaWebhookStack.CallbackUrl = https://abc123.execute-api.us-west-2.amazonaws.com/prod/callback
StravaWebhookStack.TableName = strava-avy-users
```

**Save these URLs!** You'll need them for Strava configuration.

## Strava Configuration

### 1. Update Authorization Callback Domain

In your Strava API application settings (https://www.strava.com/settings/api):

1. Set **Authorization Callback Domain** to: `abc123.execute-api.us-west-2.amazonaws.com`
   (Use your actual API Gateway domain from the `CallbackUrl` output)

### 2. Register Webhook Subscription

Use `curl` to register your webhook with Strava:

```bash
# Set variables
WEBHOOK_URL="https://abc123.execute-api.us-west-2.amazonaws.com/prod/webhook"
CLIENT_ID="your_client_id"
CLIENT_SECRET="your_client_secret"
VERIFY_TOKEN="your_verify_token_from_env"

# Register webhook
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=$CLIENT_ID \
  -F client_secret=$CLIENT_SECRET \
  -F callback_url=$WEBHOOK_URL \
  -F verify_token=$VERIFY_TOKEN
```

**Expected response:**
```json
{
  "id": 12345,
  "callback_url": "https://...",
  "active": true
}
```

**Save the subscription ID!**

### 3. Verify Webhook Subscription

```bash
# List active subscriptions
curl -G https://www.strava.com/api/v3/push_subscriptions \
  -d client_id=$CLIENT_ID \
  -d client_secret=$CLIENT_SECRET
```

## Usage

### User Onboarding Flow

1. **User visits landing page**: `https://abc123.execute-api.us-west-2.amazonaws.com/prod/`
2. **Clicks "Connect with Strava"**: Redirects to `/connect`
3. **OAuth flow**: User authorizes on Strava
4. **Callback**: Tokens stored in DynamoDB
5. **Success page**: Confirms connection

### Automatic Forecast Enrichment

Once connected:

1. **User creates BackcountrySki activity** on Strava
2. **Webhook event** sent to Lambda
3. **Activity details** fetched from Strava API
4. **Forecast lookup** using activity location & date
5. **Description updated** with forecast data

**Example:**
```
Original: "Great powder day!"

Updated: "Great powder day!

NWAC Mt Hood Zone forecast: 3🟧/3🟧/2🟨 (https://nwac.us/avalanche-forecast/#/forecast/10/166378)"
```

The forecast format shows danger ratings by elevation:
- **Upper/Middle/Lower** (above treeline / near treeline / below treeline)
- **Colored squares**: 🟩 Low, 🟨 Moderate, 🟧 Considerable, 🟥 High, ⬛ Extreme

### Manual Forecast Trigger: #avy_forecast Command

You can manually add forecasts to any activity (even non-BackcountrySki activities) using the `#avy_forecast` command:

1. **Edit the activity title** on Strava and add `#avy_forecast` anywhere in the title
2. **Save the activity** - this triggers an update webhook
3. **Forecast is added** to the description
4. **Command is removed** from the title automatically

**Use cases:**
- Add forecasts to existing activities uploaded without GPS data initially
- Add forecasts to activities categorized as "Hike" or "Alpine Ski"
- Retry forecast lookup for pre-season activities after forecasts become available

**Example:**
```
Title: "Sheep Lake Couloir #avy_forecast"  →  "Sheep Lake Couloir"
Description: (forecast added)
```

If no forecast is available, you'll see a message explaining why:
```
[No avalanche forecast available: No forecast available for West Slopes South]
```

## Development

### Local Testing

```bash
# Run test suite (40 tests with mock data)
npm test

# Run tests in watch mode
npm test -- --watch

# Type check
npm run type-check

# Watch mode for development
npm run watch
```

**Test Coverage:**
- ✅ Webhook verification (GET requests)
- ✅ Event filtering (activity types, locations)
- ✅ Forecast fetching and formatting
- ✅ Rich forecast with colored danger squares
- ✅ Idempotency (no duplicate forecasts)
- ✅ Error handling (missing forecasts, API failures)
- ✅ Natural NWAC mentions (doesn't interfere with user text)
- ✅ #avy_forecast command processing
- ✅ Title cleanup (command removal)
- ✅ Non-BackcountrySki activities with command
- ✅ OAuth state generation and validation
- ✅ OAuth CSRF protection (invalid/missing state rejection)

### CDK Commands

```bash
# Preview changes
npm run diff

# Synthesize CloudFormation
npm run synth

# Deploy updates
npm run deploy

# Destroy stack (careful!)
npm run destroy
```

## Monitoring

### CloudWatch Logs

Lambda logs are automatically sent to CloudWatch:

```bash
# View webhook handler logs
aws logs tail /aws/lambda/StravaWebhookStack-WebhookHandler --follow

# View OAuth handler logs
aws logs tail /aws/lambda/StravaWebhookStack-OAuthHandler --follow
```

### DynamoDB

View user records:

```bash
# Scan all users
aws dynamodb scan --table-name strava-avy-users

# Get specific user
aws dynamodb get-item \
  --table-name strava-avy-users \
  --key '{"athlete_id": {"N": "12345"}}'
```

## Troubleshooting

### Webhook Not Receiving Events

1. **Verify subscription**:
   ```bash
   curl -G https://www.strava.com/api/v3/push_subscriptions \
     -d client_id=$CLIENT_ID \
     -d client_secret=$CLIENT_SECRET
   ```

2. **Check CloudWatch logs** for webhook verification

3. **Test webhook endpoint**:
   ```bash
   curl -G "$WEBHOOK_URL?hub.mode=subscribe&hub.verify_token=$VERIFY_TOKEN&hub.challenge=test"
   ```

### OAuth Not Working

1. **Verify callback domain** in Strava settings matches API Gateway domain
2. **Check environment variables** are set correctly
3. **View Lambda logs** for errors

### Token Refresh Failures

1. **Check DynamoDB** for user record
2. **Verify refresh token** is being updated
3. **Check Strava API status**

## Cost Estimate

For 10 users with ~50 activities/month each:

| Service | Usage | Cost/Month |
|---------|-------|------------|
| Lambda | ~500 invocations × 2s | $0.00 (free tier) |
| API Gateway | ~500 requests | $0.01 |
| DynamoDB | 10 users, ~500 reads/writes | $0.01 |
| CloudWatch Logs | 1GB | $0.00 (free tier) |
| **Total** | | **~$0.02/month** |

## Security

- ✅ **OAuth CSRF Protection**: State parameter validation prevents session fixation attacks
- ✅ **DynamoDB encryption at rest** (AWS-managed)
- ✅ **HTTPS-only API Gateway**
- ✅ **IAM roles for Lambda** (principle of least privilege)
- ✅ **Webhook verification token**
- ✅ **OAuth token expiration** (6 hours)
- ✅ **Point-in-time recovery for DynamoDB**

### OAuth Security Details

The OAuth flow implements CSRF protection using cryptographically secure state tokens:

1. **State Generation**: When users visit `/connect`, a 64-character random hex token is generated using `crypto.randomBytes(32)`
2. **State Storage**: Tokens are stored in a separate DynamoDB table with 5-minute TTL
3. **State Validation**: On `/callback`, the state parameter is validated before exchanging the authorization code
4. **Single-Use Tokens**: State tokens are deleted immediately after validation, preventing replay attacks
5. **Auto-Cleanup**: DynamoDB TTL automatically removes expired state tokens (older than 5 minutes)

This prevents:
- **CSRF attacks**: Attackers can't trick users into authorizing the wrong request
- **Session fixation**: State tokens ensure the callback matches the original authorization request
- **Replay attacks**: Each state token can only be used once

## Future Enhancements

- [ ] Custom domain name
- [ ] CloudWatch alarms for monitoring
- [ ] User preferences (opt-in/out zones)
- [ ] Email notifications
- [ ] Activity statistics dashboard
- [ ] CI/CD pipeline for automated deployments
- [ ] Support for other avalanche centers (CAIC, UAC, etc.)

## License

MIT
