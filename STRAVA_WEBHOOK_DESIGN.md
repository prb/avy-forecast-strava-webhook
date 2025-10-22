# Strava Webhook Handler - Design Document

> **Last Reviewed:** October 2025
> **Status:** Reflects current implementation in `apps/strava-webhook/`

## Overview

AWS Lambda function that listens for Strava webhook events, detects new BackcountrySki activities, fetches NWAC avalanche forecasts, and automatically appends forecast information to the activity description.

## Architecture

```
┌─────────────────┐
│  Strava Webhook │
│     Events      │
└────────┬────────┘
         │
         │ POST webhook event
         │ (object_id, aspect_type, etc.)
         ▼
┌─────────────────────────────────┐
│   AWS Lambda Function           │
│   (API Gateway endpoint)        │
│                                 │
│  1. Validate webhook event      │
│  2. Filter: BackcountrySki +    │
│     aspect_type=create          │
│  3. Get activity details        │
│  4. Fetch NWAC forecast         │
│  5. Format forecast string      │
│  6. Update activity description │
└─────────────────────────────────┘
         │
         ├──────► Strava API
         │        - GET /activities/{id}
         │        - PUT /activities/{id}
         │
         └──────► NWAC Forecast API
                  (@multifarious/forecast-api)
                  (@multifarious/forecast-formatter)
```

## Webhook Event Flow

### 1. Webhook Subscription Validation (GET)

**Initial Setup:** Strava sends a GET request to validate the webhook endpoint.

**Request:**
```
GET /webhook?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=15f7d1a91c1f40f8a748fd134752feb3
```

**Response:**
```json
{
  "hub.challenge": "15f7d1a91c1f40f8a748fd134752feb3"
}
```

### 2. Webhook Event Notification (POST)

**Event Structure:**
```json
{
  "object_type": "activity",
  "object_id": 1360128428,
  "aspect_type": "create",
  "owner_id": 134815,
  "subscription_id": 120475,
  "event_time": 1516126040,
  "updates": {}
}
```

**Event Types:**
- `aspect_type: "create"` - New activity created ✅ **Auto-process BackcountrySki activities**
- `aspect_type: "update"` - Activity updated ✅ **Process when #avy_forecast command is present**
- `aspect_type: "delete"` - Activity deleted ❌ Ignore

**Object Types:**
- `object_type: "activity"` ✅ **Handle this**
- `object_type: "athlete"` ❌ Ignore

### 3. Processing Flow

```
1. Receive webhook POST
   ├─ object_type !== "activity" → Return 200 (ignore)
   ├─ aspect_type === "create" AND type === "BackcountrySki" → Auto-process
   ├─ aspect_type === "update" AND title contains "#avy_forecast" → Process manually
   └─ Otherwise → Return 200 (ignore)

2. Get activity details from Strava API
   GET https://www.strava.com/api/v3/activities/{object_id}
   Headers: { Authorization: "Bearer {access_token}" }

   Response includes:
   {
     "id": 1360128428,
     "type": "BackcountrySki",
     "start_date": "2025-04-09T10:30:00Z",
     "start_latlng": [45.4, -121.7],
     "description": "Great day on the mountain!",
     ...
   }

3. Filter by activity type
   ├─ type !== "BackcountrySki" → Return 200 (ignore)
   └─ type === "BackcountrySki" → Continue

4. Extract data for forecast lookup
   - start_latlng → { latitude: 45.4, longitude: -121.7 }
   - start_date → "2025-04-09"

5. Fetch NWAC forecast
   import { getForecastForCoordinate } from '@multifarious/forecast-api'
   const result = await getForecastForCoordinate(coord, date)

6. Format forecast
   import { formatForecast } from '@multifarious/forecast-formatter'
   const formatted = formatForecast(result.forecast)
   // "NWAC Mt Hood Zone forecast: 3🟧/3🟧/2🟨 (...)"

7. Update activity description
   PUT https://www.strava.com/api/v3/activities/{object_id}
   Body: {
     "description": "{original_description}\n\n{formatted_forecast}"
   }

8. Return 200 to Strava
```

## Strava API Integration

### Authentication

**OAuth 2.0 Flow:**
- Client ID and Client Secret (from Strava app registration)
- Access Token (stored securely)
- Refresh Token (for token renewal)

**Token Storage:**
- DynamoDB table with per-user OAuth tokens
- Refresh token automatically when expired (6-hour expiration)

**Required Scopes:**
- `read` - Read public activity data
- `read_all` - Read private activity data
- `activity:write` - Update activities

### API Endpoints

#### 1. Get Activity Details
```
GET /api/v3/activities/{id}
Authorization: Bearer {access_token}
```

**Response Fields (relevant):**
- `id`: Activity ID
- `type`: Activity type (e.g., "BackcountrySki")
- `start_date`: Start time (ISO 8601)
- `start_latlng`: [latitude, longitude] array
- `description`: Current activity description

#### 2. Update Activity
```
PUT /api/v3/activities/{id}
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "description": "New description text"
}
```

**Important:** Only include fields you want to update.

## Data Structures

### TypeScript Interfaces

```typescript
// Strava webhook event
interface StravaWebhookEvent {
  object_type: 'activity' | 'athlete';
  object_id: number;
  aspect_type: 'create' | 'update' | 'delete';
  owner_id: number;
  subscription_id: number;
  event_time: number;
  updates?: Record<string, unknown>;
}

// Strava activity (partial)
interface StravaActivity {
  id: number;
  type: string;
  start_date: string;
  start_latlng: [number, number] | null;
  description: string | null;
  name: string;
  // ... many other fields
}

// Lambda event
interface LambdaEvent {
  httpMethod: 'GET' | 'POST';
  queryStringParameters?: {
    'hub.mode'?: string;
    'hub.verify_token'?: string;
    'hub.challenge'?: string;
  };
  body?: string;
}
```

## Environment Variables

```bash
# Strava API credentials
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret
STRAVA_VERIFY_TOKEN=random_string_for_webhook_verification

# OAuth tokens (stored in DynamoDB per-user)
# DynamoDB table: strava-avy-users
# Fields: athlete_id, access_token, refresh_token, expires_at, username

# AWS Configuration
AWS_REGION=us-west-2
```

## Error Handling

### Scenarios

1. **Activity has no start location** (`start_latlng: null`)
   - Log warning
   - Return 200 (don't process)

2. **Location outside NWAC zones**
   - Log info
   - Return 200 (don't add forecast)

3. **No forecast available for date**
   - Log info
   - Return 200 (don't add forecast)

4. **Strava API rate limit**
   - Implement exponential backoff
   - Queue for retry if needed

5. **OAuth token expired**
   - Refresh token automatically
   - Retry request

6. **Strava API error (4xx/5xx)**
   - Log error with details
   - Return 200 to Strava (don't retry)

### Response Strategy

**Always return 200 OK to Strava** unless there's a server error. Strava will retry failed webhooks, which could cause duplicate processing.

## Implementation Phases

### Phase 1: Basic Webhook Handler ✅ **Start Here**
- [ ] Create Lambda package structure
- [ ] Implement webhook validation (GET handler)
- [ ] Implement basic POST handler
- [ ] Deploy to AWS Lambda + API Gateway
- [ ] Register webhook with Strava

### Phase 2: Activity Processing
- [ ] Integrate Strava API client
- [ ] Implement activity retrieval
- [ ] Filter BackcountrySki activities
- [ ] Extract location and date

### Phase 3: Forecast Integration
- [ ] Integrate @multifarious/forecast-api
- [ ] Integrate @multifarious/forecast-formatter
- [ ] Handle edge cases (no location, outside zones)

### Phase 4: Activity Update
- [ ] Implement description update logic
- [ ] Handle existing forecast in description (idempotency)
- [ ] Test end-to-end flow

### Phase 5: Production Readiness
- [ ] Implement OAuth token refresh
- [ ] Add comprehensive error handling
- [ ] Add logging and monitoring
- [ ] Add rate limiting/throttling
- [ ] Security hardening

## Security Considerations

1. **Webhook Verification**
   - Validate `hub.verify_token` on subscription
   - Consider validating webhook signature if Strava provides one

2. **OAuth Token Storage**
   - Store tokens in DynamoDB with encryption at rest
   - Never log tokens (sanitize logging output)
   - Use IAM roles for Lambda access to DynamoDB

3. **API Rate Limiting**
   - Strava API has rate limits (600 requests/15 min, 30,000/day)
   - Implement queuing if processing many activities

4. **Input Validation**
   - Validate all webhook event fields
   - Validate API responses

## Testing Strategy

### Unit Tests
- Webhook event parsing
- Activity filtering logic
- Description formatting
- Error handling

### Integration Tests
- Mock Strava API responses
- Test with real forecast API
- Test description updates

### End-to-End Tests
- Use Strava API sandbox if available
- Test with real webhook events (development)

## Monitoring

### Metrics
- Webhook events received
- Activities processed
- Forecasts added successfully
- Errors by type
- API latency

### Logs
- Structured JSON logging
- Include activity ID, zone, date in logs
- Log all errors with stack traces

### Alerts
- High error rate
- API failures
- Token refresh failures
- Rate limit warnings

## Cost Estimation

### AWS Lambda
- Invocations: ~10-100/day (depending on usage)
- Duration: ~3-5 seconds per invocation
- **Cost: $0.00-$0.10/month**

### API Gateway
- Requests: ~10-100/day
- **Cost: $0.00-$0.01/month**

### S3 Cache
- As estimated in forecast-api README
- **Cost: $0.004/month**

**Total: <$0.15/month** (for typical personal use)

## Next Steps

1. **Review this design** - Approve architecture and approach
2. **Create Lambda package** - Set up `packages/strava-webhook/` or `apps/strava-webhook/`
3. **Implement Phase 1** - Basic webhook handling
4. **Test webhook validation** - Register with Strava
5. **Iterate through phases** - Build out functionality

## Questions / Decisions Needed

1. **OAuth Setup**: Do you already have a Strava API application registered?
2. **Token Storage**: Prefer AWS Secrets Manager or SSM Parameter Store?
3. **Single User vs Multi-User**: Is this for your personal use only, or multiple users?
4. **Deployment**: Use AWS SAM, Serverless Framework, or manual CloudFormation?
5. **Testing**: Want to implement webhook testing infrastructure first?
