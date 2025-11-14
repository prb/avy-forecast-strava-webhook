# Strava Webhook Deployment Guide

AWS Lambda application that automatically adds NWAC avalanche forecasts to Strava BackcountrySki activities.

For system architecture and detailed specifications, see the [root SPECIFICATION.md](../../SPECIFICATION.md).

## Prerequisites

1. **AWS Account** with CDK configured
2. **Strava API Application** registered at https://www.strava.com/settings/api
3. **Node.js 20+**
4. **AWS CLI** configured with credentials

## Setup

### 1. Configure Strava API Credentials

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

### 3. Load Environment Variables

```bash
export $(grep -v '^#' .env | xargs)
```

## Deployment

### Initial Deployment

```bash
# Install dependencies (from repo root)
cd ../..
npm install

# Build and deploy
cd apps/strava-webhook
npm run build
npm run deploy
```

### Deployment Outputs

After deployment, CDK will output important URLs:

```
StravaWebhookStack.WebhookUrl = https://abc123.execute-api.us-west-2.amazonaws.com/prod/webhook
StravaWebhookStack.ConnectUrl = https://abc123.execute-api.us-west-2.amazonaws.com/prod/connect
StravaWebhookStack.CallbackUrl = https://abc123.execute-api.us-west-2.amazonaws.com/prod/callback
```

**Save these URLs** - you'll need them for Strava configuration.

## Strava Configuration

### 1. Update Authorization Callback Domain

In your Strava API application settings (https://www.strava.com/settings/api):

Set **Authorization Callback Domain** to your API Gateway domain (e.g., `abc123.execute-api.us-west-2.amazonaws.com`)

### 2. Register Webhook Subscription

Use `curl` to register your webhook with Strava:

```bash
WEBHOOK_URL="https://abc123.execute-api.us-west-2.amazonaws.com/prod/webhook"
CLIENT_ID="your_client_id"
CLIENT_SECRET="your_client_secret"
VERIFY_TOKEN="your_verify_token_from_env"

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

### 3. Verify Webhook Subscription

```bash
curl -G https://www.strava.com/api/v3/push_subscriptions \
  -d client_id=$CLIENT_ID \
  -d client_secret=$CLIENT_SECRET
```

## Usage

### User Onboarding

1. User visits landing page: `https://{api-gateway-url}/`
2. Clicks "Connect with Strava"
3. Authorizes on Strava
4. Tokens stored in DynamoDB
5. User's BackcountrySki activities now auto-enriched

### Manual Forecast Trigger

Users can add `#avy_forecast` to any activity title to manually request a forecast:

1. Edit activity title on Strava, add `#avy_forecast`
2. Save activity
3. Forecast is added to description
4. Command is removed from title

## Maintenance

### View Logs

```bash
# Webhook handler logs
aws logs tail /aws/lambda/StravaWebhookStack-WebhookHandler --follow

# OAuth handler logs
aws logs tail /aws/lambda/StravaWebhookStack-OAuthHandler --follow
```

### View User Records

```bash
# Scan all connected users
aws dynamodb scan --table-name strava-avy-users

# Get specific user
aws dynamodb get-item \
  --table-name strava-avy-users \
  --key '{"athlete_id": {"N": "12345"}}'
```

### Update Deployment

```bash
npm run build
npm run deploy
```

### Preview Changes

```bash
npm run diff
```

### Remove Deployment

```bash
npm run destroy
```

**Warning:** This will delete the Lambda functions and API Gateway, but DynamoDB tables are retained (RETAIN policy) to preserve user data.

## Troubleshooting

### Webhook Not Receiving Events

1. Verify subscription is active:
   ```bash
   curl -G https://www.strava.com/api/v3/push_subscriptions \
     -d client_id=$CLIENT_ID \
     -d client_secret=$CLIENT_SECRET
   ```

2. Check CloudWatch logs for errors

3. Test webhook endpoint:
   ```bash
   curl -G "$WEBHOOK_URL?hub.mode=subscribe&hub.verify_token=$VERIFY_TOKEN&hub.challenge=test"
   ```

### OAuth Not Working

1. Verify callback domain in Strava settings matches API Gateway domain
2. Check environment variables are set correctly
3. View Lambda logs for errors

### Token Refresh Failures

1. Check DynamoDB for user record
2. Verify refresh token is being updated
3. User may need to reconnect if Strava invalidated tokens

## Cost Estimate

For 10 users with ~50 activities/month each:

| Service | Cost/Month |
|---------|------------|
| Lambda | $0.00 (free tier) |
| API Gateway | $0.01 |
| DynamoDB | $0.01 |
| CloudWatch Logs | $0.00 (free tier) |
| **Total** | **~$0.02/month** |

## Development

### Run Tests

```bash
npm test
```

### Watch Mode

```bash
npm run watch
```

### Type Check

```bash
npm run type-check
```

## Security

- OAuth CSRF protection with state tokens
- DynamoDB encryption at rest (AWS-managed keys)
- HTTPS-only API Gateway
- Least-privilege IAM roles
- Webhook verification token
- No tokens in logs (sanitized)

## License

CC0 1.0 Universal (Public Domain)
