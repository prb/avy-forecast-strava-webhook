# Operations Guide

This guide covers deployment, monitoring, and operational procedures for the Strava Avalanche Forecast Enrichment service.

## Table of Contents

1. [Deployment](#deployment)
2. [Monitoring & Observability](#monitoring--observability)
3. [User Management](#user-management)
4. [Troubleshooting](#troubleshooting)
5. [Maintenance](#maintenance)

---

## Deployment

### Prerequisites

- **AWS Account** with appropriate permissions
- **AWS CLI** configured
- **Node.js 22+** installed
- **Strava API Application** created at https://www.strava.com/settings/api

### Environment Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/prb/avy-forecast-strava-webhook.git
   cd avy-forecast-strava-webhook
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set environment variables**
   ```bash
   export STRAVA_CLIENT_ID="your_client_id"
   export STRAVA_CLIENT_SECRET="your_client_secret"
   export STRAVA_VERIFY_TOKEN="random_string_for_webhooks"
   export CDK_DEFAULT_REGION="us-west-2"  # Optional
   ```

4. **Build the project**
   ```bash
   npm run build
   ```

### Deploy to AWS

1. **Bootstrap CDK** (first time only)
   ```bash
   cd apps/strava-webhook
   cdk bootstrap
   ```

2. **Review changes**
   ```bash
   cd deploy --context environment=prod
   ```

3. **Deploy the stack**
   ```bash
   # For development
   cdk deploy
   
   # For production (retains DynamoDB data)
   cdk deploy --context environment=prod
   ```

4. **Note the outputs**
   ```
   Outputs:
   StravaWebhookStack.ApiUrl = https://...
   StravaWebhookStack.WebhookUrl = https://.../webhook
   StravaWebhookStack.ConnectUrl = https://.../connect
   StravaWebhookStack.CallbackUrl = https://.../callback
   StravaWebhookStack.AlarmTopicArn = arn:aws:sns:...
   StravaWebhookStack.AlertEmail = avywebhook-{env}@mult.ifario.us
   ```

### Configure Strava Application

1. **Set Authorization Callback Domain**
   - Go to https://www.strava.com/settings/api
   - Set "Authorization Callback Domain" to your API Gateway domain
   - Example: `h4x46oe6cb.execute-api.us-west-2.amazonaws.com`

2. **Register Webhook Subscription**
   ```bash
   curl -X POST https://www.strava.com/api/v3/push_subscriptions \
     -F client_id=$STRAVA_CLIENT_ID \
     -F client_secret=$STRAVA_CLIENT_SECRET \
     -F callback_url=$WEBHOOK_URL \
     -F verify_token=$STRAVA_VERIFY_TOKEN
   ```

3. **Verify subscription**
   ```bash
   curl -G https://www.strava.com/api/v3/push_subscriptions \
     -d client_id=$STRAVA_CLIENT_ID \
     -d client_secret=$STRAVA_CLIENT_SECRET
   ```

### Configure Email Alerts

After deployment, you'll receive a subscription confirmation email at the configured alert address. Click the confirmation link to activate email alerts.

---

## Monitoring & Observability

### Structured Logging

All logs use JSON format for easy querying:
```json
{
  "level": "INFO",
  "event": "ActivityProcessed",
  "athleteId": 12345,
  "activityId": 67890,
  "zone": "Mt Hood"
}
```

### CloudWatch Logs Insights Queries

Three saved queries are automatically created:

#### 1. Monthly Active Users
```
fields athleteId
| filter event = "ActivityProcessed"
| stats count_distinct(athleteId) as UniqueAthletes by bin(1d)
```

#### 2. Total Processed Activities
```
fields @timestamp, athleteId, activityId
| filter event = "ActivityProcessed"
| sort @timestamp desc
```

#### 3. Forecast Failures
```
fields @timestamp, error, athleteId
| filter level = "ERROR"
| sort @timestamp desc
```

### Running Queries from CLI

Use the helper script:

```bash
cd apps/strava-webhook

# Query monthly active users (last 7 days)
./scripts/query-logs.sh MonthlyActiveUsers

# Query total processed (last 30 days)
./scripts/query-logs.sh TotalProcessed 30

# Query forecast failures (last day)
./scripts/query-logs.sh ForecastFailures 1
```

### CloudWatch Alarms

**Processing Error Alarm**
- **Metric**: `StravaWebhook/ProcessingErrors`
- **Threshold**: >= 1 error in 5 minutes
- **Action**: Sends email to configured alert address
- **Status**: Check CloudWatch Console → Alarms

### Metrics Dashboard

View in AWS Console:
1. Navigate to CloudWatch → Dashboards
2. Key metrics to monitor:
   - Lambda invocations
   - Lambda errors
   - Lambda duration
   - DynamoDB read/write capacity
   - API Gateway 4xx/5xx errors

### Manual Monitoring

**Check Lambda logs:**
```bash
aws logs tail /aws/lambda/StravaWebhookStack-ProcessorHandler... --follow --region us-west-2
```

**Check recent errors:**
```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/StravaWebhookStack-ProcessorHandler... \
  --filter-pattern '{ $.level = "ERROR" }' \
  --region us-west-2 \
  --start-time $(date -u -v-1H +%s)000
```

---

## User Management

### Onboarding New Users

1. **Share connect URL**
   ```
   https://{api-gateway-url}/connect
   ```

2. **User clicks "Connect with Strava"**
   - Redirected to Strava OAuth page
   - User authorizes required scopes
   - Tokens stored in DynamoDB

3. **Verify user added**
   ```bash
   aws dynamodb scan \
     --table-name strava-avy-users \
     --region us-west-2 \
     --query 'Items[*].{AthleteId:athlete_id.N,Username:username.S}'
   ```

### Viewing User Tokens

```bash
aws dynamodb get-item \
  --table-name strava-avy-users \
  --key '{"athlete_id": {"N": "12345"}}' \
  --region us-west-2
```

### Removing a User

```bash
aws dynamodb delete-item \
  --table-name strava-avy-users \
  --key '{"athlete_id": {"N": "12345"}}' \
  --region us-west-2
```

### Token Refresh

Tokens are automatically refreshed when expired. Manual refresh is not needed.

---

## Troubleshooting

### Activity Not Getting Forecast

**Check 1: Activity Type**
```
Only "BackcountrySki" activities are auto-processed.
Manual trigger: Add #avy_forecast to activity title.
```

**Check 2: Location**
```bash
# Verify activity has GPS coordinates
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  https://www.strava.com/api/v3/activities/ACTIVITY_ID \
  | jq '.start_latlng'
  
# Should return: [latitude, longitude], not null
```

**Check 3: NWAC Zone Coverage**
```
Activity must be in a NWAC forecast zone:
- Olympics
- West Slopes (North/Central/South)
- Stevens Pass / Snoqualmie Pass
- East Slopes (North/Central/South)
- Mt Hood
```

**Check 4: Idempotency**
```
If description already contains a NWAC URL, processing is skipped.
This prevents duplicate forecasts.
```

**Check 5: Logs**
```bash
# Search logs for activity ID
aws logs filter-log-events \
  --log-group-name /aws/lambda/StravaWebhookStack-ProcessorHandler... \
  --filter-pattern 'ACTIVITY_ID' \
  --region us-west-2 \
  --start-time $(date -u -v-1d +%s)000
```

### Webhook Not Receiving Events

**Verify subscription**
```bash
curl -G https://www.strava.com/api/v3/push_subscriptions \
  -d client_id=$STRAVA_CLIENT_ID \
  -d client_secret=$STRAVA_CLIENT_SECRET
```

**Check API Gateway logs** (if enabled)
```bash
aws logs tail /aws/apigateway/StravaWebhookStack... --follow --region us-west-2
```

**Test webhook manually**
```bash
curl -X POST $WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d '{
    "object_type": "activity",
    "aspect_type": "create",
    "object_id": 123456,
    "owner_id": YOUR_ATHLETE_ID
  }'
```

### OAuth Errors

**"Invalid state"**
- State token expired (5-minute TTL)
- Have user retry from `/connect`

**"Invalid grant"**
- Authorization code already used
- Have user retry OAuth flow

**"Token refresh failed"**
- User may need to re-authorize
- Direct them to `/connect` again

### DynamoDB Errors

**ProvisionedThroughputExceededException**
- Should not occur (using on-demand billing)
- Check AWS Service Health Dashboard

**ItemCollectionSizeLimitExceededException**
- Should not occur (items are small)
- Contact AWS support if seen

### Lambda Timeout

**Symptoms:**
- Webhook returns 504 Gateway Timeout
- Lambda duration > 30 seconds

**Investigation:**
```bash
./scripts/query-logs.sh TotalProcessed 1 | grep duration
```

**Solutions:**
- Check external API latency (Strava, Avalanche.org)
- Increase Lambda timeout in CDK stack
- Add caching to reduce API calls

---

## Maintenance

### Updating Code

1. **Create feature branch**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes and test**
   ```bash
   npm test
   npm run build
   ```

3. **Deploy to development**
   ```bash
   cd apps/strava-webhook
   cdk deploy  # Uses dev environment by default
   ```

4. **Test in development**
   - Trigger test activities
   - Monitor CloudWatch logs
   - Verify behavior

5. **Deploy to production**
   ```bash
   cdk deploy --context environment=prod
   ```

### Database Backup

DynamoDB Point-in-Time Recovery is enabled. To restore:

```bash
aws dynamodb restore-table-from-point-in-time \
  --source-table-name strava-avy-users \
  --target-table-name strava-avy-users-restored \
  --restore-date-time 2024-01-15T00:00:00Z \
  --region us-west-2
```

### Cost Monitoring

**View current month costs:**
```bash
aws ce get-cost-and-usage \
  --time-period Start=$(date -u +%Y-%m-01),End=$(date -u +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter file://filter.json
```

**Typical costs (per month):**
- Lambda: $0.00 (free tier)
- DynamoDB: $0.02-0.05
- API Gateway: $0.01
- **Total: ~$0.03-0.06/month**

### Scaling Considerations

**Current limits:**
- Strava: 600 requests/15min, 30,000/day
- Lambda: 1000 concurrent executions per region
- DynamoDB: Unlimited (on-demand)
- SQS: Unlimited messages

**If traffic increases:**
1. Monitor Lambda concurrency in CloudWatch
2. Consider Lambda reserved concurrency
3. Add DLQ for failed SQS messages
4. Implement exponential backoff for external APIs

### Security Updates

1. **Update Node.js runtime**
   ```typescript
   // In strava-webhook-stack.ts
   runtime: lambda.Runtime.NODEJS_22_X
   ```

2. **Update npm dependencies**
   ```bash
   npm audit
   npm update
   npm run build
   npm test
   ```

3. **Rotate Strava credentials (if compromised)**
   - Generate new credentials in Strava API settings
   - Update environment variables
   - Redeploy: `cdk deploy`

### Disaster Recovery

**Complete stack recreation:**

1. **Export DynamoDB data**
   ```bash
   aws dynamodb scan --table-name strava-avy-users > backup.json
   ```

2. **Destroy and recreate stack**
   ```bash
   cdk destroy
   cdk deploy --context environment=prod
   ```

3. **Restore data**
   ```bash
   # Script to restore items from backup.json
   jq -c '.Items[]' backup.json | while read item; do
     aws dynamodb put-item --table-name strava-avy-users --item "$item"
   done
   ```

4. **Re-register webhook**
   ```bash
   curl -X POST https://www.strava.com/api/v3/push_subscriptions \
     -F client_id=$STRAVA_CLIENT_ID \
     -F client_secret=$STRAVA_CLIENT_SECRET \
     -F callback_url=$NEW_WEBHOOK_URL \
     -F verify_token=$STRAVA_VERIFY_TOKEN
   ```

---

## Support & Contact

- **GitHub Issues**: https://github.com/prb/avy-forecast-strava-webhook/issues
- **AWS Support**: https://console.aws.amazon.com/support/
- **Strava API**: https://developers.strava.com/docs/
