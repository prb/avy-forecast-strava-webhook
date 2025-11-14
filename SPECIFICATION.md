# Strava Avalanche Forecast Enrichment - System Specification

## 1. System Overview

### Purpose
Automatically enrich Strava backcountry ski activities with avalanche forecast information from the Northwest Avalanche Center (NWAC). When users upload a BackcountrySki activity, the system fetches the relevant avalanche forecast based on location and date, then appends it to the activity description.

### Key Features
- **Automatic enrichment** - BackcountrySki activities automatically get forecast data
- **Manual trigger** - Users can add `#avy_forecast` to any activity title to request a forecast
- **Multi-user support** - OAuth 2.0 flow with per-user token management
- **Location-aware** - Point-in-polygon lookup determines forecast zone
- **Rich formatting** - Colored emoji squares show danger ratings by elevation
- **Idempotent** - Won't duplicate forecasts on multiple updates
- **Smart caching** - Recent forecasts cached for 60 min, historical forecasts cached permanently

### Target Users
Backcountry skiers and snowboarders in the Pacific Northwest who use Strava to track their activities and want automatic avalanche forecast documentation.

## 2. Architecture

### High-Level System Diagram

```
┌──────────────┐
│   Strava     │
│   Webhook    │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│              AWS Infrastructure                          │
│                                                          │
│  ┌──────────────┐        ┌─────────────────────┐       │
│  │ API Gateway  │───────▶│ Lambda Functions    │       │
│  │              │        │ - webhook           │       │
│  │ /webhook     │        │ - oauth             │       │
│  │ /connect     │        │ - web               │       │
│  │ /callback    │        └────────┬────────────┘       │
│  └──────────────┘                 │                     │
│                                   │                     │
│                          ┌────────┴─────────┐           │
│                          │                  │           │
│                          ▼                  ▼           │
│                  ┌────────────┐    ┌────────────┐      │
│                  │ DynamoDB   │    │ DynamoDB   │      │
│                  │ Users      │    │ OAuth      │      │
│                  │ Table      │    │ State      │      │
│                  └────────────┘    └────────────┘      │
└─────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          │                               │
          ▼                               ▼
┌──────────────────┐           ┌──────────────────┐
│  Strava API      │           │ Avalanche.org    │
│  - Activities    │           │ API              │
│  - OAuth         │           │ - Forecasts      │
└──────────────────┘           └──────────────────┘
```

### Technology Stack

**Language:** TypeScript (Node.js 20+)
**Infrastructure:** AWS CDK (TypeScript)
**Runtime:** AWS Lambda (serverless)
**API Gateway:** AWS API Gateway (HTTP API)
**Database:** AWS DynamoDB (2 tables)
**Storage:** Amazon S3 (forecast cache - optional)
**Build:** esbuild (Lambda bundling)
**Testing:** Vitest
**Package Management:** npm workspaces (monorepo)

### Package Structure

```
avy-forecast-strava-webhook/
├── packages/
│   ├── forecast-api/          # NWAC forecast API client
│   │   ├── src/
│   │   │   ├── api/           # avalanche.org API client
│   │   │   ├── cache/         # Local & S3 caching
│   │   │   ├── zones/         # Point-in-polygon zone lookup
│   │   │   ├── types/         # TypeScript types
│   │   │   ├── forecast.ts    # Main API entry point
│   │   │   └── index.ts
│   │   └── data/zones/        # GeoJSON zone boundaries (10 zones)
│   │
│   └── forecast-formatter/    # String formatter with danger colors
│       └── src/
│           ├── formatter.ts   # Main formatting logic
│           └── index.ts
│
└── apps/
    └── strava-webhook/        # AWS Lambda application
        ├── bin/
        │   └── app.ts         # CDK app entry point
        ├── lib/
        │   └── strava-webhook-stack.ts  # Infrastructure definition
        └── lambda/
            ├── webhook.ts     # Webhook event handler
            ├── oauth.ts       # OAuth flow handlers
            ├── web.ts         # Landing page
            ├── strava.ts      # Strava API client
            ├── db.ts          # DynamoDB access layer
            └── types.ts       # TypeScript types
```

## 3. Components Deep Dive

### 3.1 forecast-api Package

**Purpose:** Fetch NWAC avalanche forecasts by GPS coordinates and date.

**Key Modules:**

- **zones/** - Point-in-polygon lookup to find NWAC zone from GPS coordinates
  - Loads 10 GeoJSON zone boundary files
  - Uses Turf.js for geometric operations
  - Caches loaded zones in memory
  - Zone IDs: 1645-1657 (Olympics, West/East Slopes, Mt Hood, etc.)

- **api/** - Client for avalanche.org public API
  - Base URL: `https://api.avalanche.org/v2/public/`
  - Fetches products by date range and avalanche center (NWAC)
  - Returns full forecast product with danger ratings, bottom line, URL

- **cache/** - Smart caching with configurable backends
  - Local filesystem cache (development)
  - S3 cache (production)
  - TTL logic: 60 min for recent forecasts (≤72h), permanent for historical
  - Caches both positive (forecast found) and negative (no forecast) results

**Main API:**
```typescript
getForecastForCoordinate(coord: Coordinate, date: string, useCache: boolean)
  → Promise<ForecastLookupResult>
```

**Test Coverage:** 66 tests (25 zones + 12 API + 10 forecast + 19 cache)

### 3.2 forecast-formatter Package

**Purpose:** Format forecast data into compact, readable strings with colored danger indicators.

**Key Features:**
- Colored emoji squares: 🟩 Low, 🟨 Moderate, 🟧 Considerable, 🟥 High, ⬛ Extreme
- Shows danger ratings for 3 elevation bands (upper/middle/lower)
- Includes zone name and permalink URL
- Supports current day and tomorrow forecasts

**Output Format:**
```
NWAC Mt Hood Zone forecast: 3🟧/3🟧/2🟨 (https://nwac.us/avalanche-forecast/#/forecast/10/166378)
```

**Main API:**
```typescript
formatForecast(product: ForecastProduct, options?: {
  includeNWAC?: boolean,
  day?: 'current' | 'tomorrow'
})
  → string
```

**Test Coverage:** 14 tests

### 3.3 strava-webhook Application

**Purpose:** AWS Lambda application handling Strava webhooks, OAuth, and activity enrichment.

**Lambda Functions:**

1. **WebhookHandler** (`lambda/webhook.ts`)
   - Handles GET requests for webhook verification
   - Handles POST requests for activity events
   - Filters for BackcountrySki activities or `#avy_forecast` command
   - Fetches activity details, looks up forecast, updates description
   - Implements idempotency (checks for existing NWAC forecast URL)

2. **OAuthHandler** (`lambda/oauth.ts`)
   - `/connect` - Initiates OAuth flow with CSRF protection
   - `/callback` - Handles OAuth callback, stores tokens in DynamoDB

3. **WebHandler** (`lambda/web.ts`)
   - `/` - Landing page with "Connect with Strava" button
   - Simple HTML UI for user onboarding

**Infrastructure (CDK):**
- DynamoDB table: `strava-avy-users` (athlete_id → access/refresh tokens)
- DynamoDB table: `oauth-state` (CSRF state tokens, 5-min TTL)
- API Gateway with 4 routes (/, /connect, /callback, /webhook)
- Lambda execution roles with least-privilege IAM permissions
- Environment variables for Strava credentials

**Test Coverage:** 40 tests (22 webhook + 9 OAuth + 9 Strava utilities)

## 4. Data Models & Types

### 4.1 Strava Webhook Event

```typescript
interface StravaWebhookEvent {
  object_type: 'activity' | 'athlete';
  object_id: number;              // Activity ID
  aspect_type: 'create' | 'update' | 'delete';
  owner_id: number;               // Athlete ID
  subscription_id: number;
  event_time: number;             // Unix timestamp
  updates?: Record<string, unknown>;
}
```

### 4.2 Strava Activity (partial)

```typescript
interface StravaActivity {
  id: number;
  type: string;                   // e.g., "BackcountrySki"
  name: string;                   // Activity title
  start_date: string;             // ISO 8601 timestamp
  start_latlng: [number, number] | null;  // [lat, lon]
  description: string | null;
}
```

### 4.3 NWAC Zone

```typescript
interface Zone {
  id: number;                     // 1645-1657
  zone_id: string;                // "1"-"10" (for URL construction)
  name: string;                   // "Mt Hood", "West Slopes South", etc.
}
```

### 4.4 Forecast Product

```typescript
interface ForecastProduct {
  id: number;                     // Product ID
  published_time: string;         // ISO 8601 timestamp
  expires_time: string;
  forecast_zone: Array<{
    id: number;
    zone_id: string;
    name: string;
  }>;
  forecast_avalanche_problems?: Array<{
    // ... problem details
  }>;
  danger: Array<{
    lower: number;                // Danger rating 0-5
    middle: number;
    upper: number;
    valid_day: string;            // 'current' or 'tomorrow'
  }>;
  bottom_line?: string;
}
```

### 4.5 DynamoDB User Record

```typescript
interface UserRecord {
  athlete_id: number;             // Partition key
  access_token: string;
  refresh_token: string;
  expires_at: number;             // Unix timestamp
  username?: string;
  created_at: string;
  updated_at: string;
}
```

### 4.6 OAuth State Record

```typescript
interface OAuthState {
  state: string;                  // Partition key (64-char hex)
  created_at: number;             // Unix timestamp
  ttl: number;                    // DynamoDB TTL (5 minutes)
}
```

## 5. Integration Points

### 5.1 Strava API

**Base URL:** `https://www.strava.com/api/v3/`

**Authentication:** OAuth 2.0 with automatic token refresh

**Required Scopes:**
- `read` - Read public activity data
- `read_all` - Read private activity data
- `activity:write` - Update activity descriptions

**Key Endpoints:**

1. **OAuth Authorization**
   ```
   GET https://www.strava.com/oauth/authorize
     ?client_id={id}
     &redirect_uri={callback}
     &response_type=code
     &scope=read,read_all,activity:write
     &state={csrf_token}
   ```

2. **OAuth Token Exchange**
   ```
   POST https://www.strava.com/oauth/token
   Body: {
     client_id, client_secret, code, grant_type: "authorization_code"
   }
   Response: { access_token, refresh_token, expires_at, athlete }
   ```

3. **Token Refresh**
   ```
   POST https://www.strava.com/oauth/token
   Body: {
     client_id, client_secret, refresh_token, grant_type: "refresh_token"
   }
   ```

4. **Get Activity**
   ```
   GET /api/v3/activities/{id}
   Authorization: Bearer {access_token}
   ```

5. **Update Activity**
   ```
   PUT /api/v3/activities/{id}
   Authorization: Bearer {access_token}
   Body: { description?: string, name?: string }
   ```

6. **Register Webhook**
   ```
   POST https://www.strava.com/api/v3/push_subscriptions
   Form: client_id, client_secret, callback_url, verify_token
   ```

**Rate Limits:**
- 600 requests per 15 minutes
- 30,000 requests per day

**Token Expiration:**
- Access tokens expire every 6 hours
- System automatically refreshes using refresh token

### 5.2 Avalanche.org API

**Base URL:** `https://api.avalanche.org/v2/public/`

**Authentication:** None (public API)

**Key Endpoints:**

1. **Get Products by Date Range**
   ```
   GET /products
     ?avalanche_center_id=NWAC
     &date_start={YYYY-MM-DD}
     &date_end={YYYY-MM-DD}

   Returns: Array of forecast products with zone information
   ```

2. **Get Individual Product**
   ```
   GET /product/{product_id}

   Returns: Detailed forecast with danger ratings, problems, discussion
   ```

**Forecast Permalink Structure:**
```
https://nwac.us/avalanche-forecast/#/forecast/{zone_id}/{product_id}
```

**NWAC Zone IDs:**

| ID | zone_id | Name |
|----|---------|------|
| 1645 | 1 | Olympics |
| 1646 | 4 | West Slopes North |
| 1647 | 5 | West Slopes Central |
| 1648 | 6 | West Slopes South |
| 1649 | 2 | Stevens Pass |
| 1653 | 3 | Snoqualmie Pass |
| 1654 | 7 | East Slopes North |
| 1655 | 8 | East Slopes Central |
| 1656 | 9 | East Slopes South |
| 1657 | 10 | Mt Hood |

### 5.3 AWS Services

**Lambda:**
- Runtime: Node.js 20.x
- Memory: 512 MB (configurable)
- Timeout: 30 seconds
- Handler: ESM modules

**API Gateway:**
- Type: HTTP API (not REST API)
- CORS: Enabled for web UI
- Routes: /, /connect, /callback, /webhook

**DynamoDB:**
- Tables: 2 (users + oauth state)
- Billing: On-demand (pay per request)
- Encryption: AWS-managed keys
- Point-in-time recovery: Enabled
- TTL: Enabled on oauth-state table

**S3 (optional):**
- Forecast cache storage
- Encryption: AES-256
- Lifecycle: Not configured (historical forecasts kept indefinitely)

## 6. Deployment Specification

### 6.1 Infrastructure as Code

**Tool:** AWS CDK (TypeScript)

**Stack Definition:** `apps/strava-webhook/lib/strava-webhook-stack.ts`

**Resources Created:**
1. DynamoDB table: `strava-avy-users`
   - Partition key: `athlete_id` (Number)
   - Retention policy: RETAIN (preserves data on stack deletion)
2. DynamoDB table: `oauth-state`
   - Partition key: `state` (String)
   - TTL attribute: `ttl`
3. Lambda function: WebhookHandler
4. Lambda function: OAuthHandler
5. Lambda function: WebHandler
6. API Gateway HTTP API
7. IAM roles and policies

**CDK Commands:**
```bash
npm run synth     # Generate CloudFormation template
npm run deploy    # Deploy to AWS
npm run diff      # Preview changes
npm run destroy   # Delete stack
```

### 6.2 Environment Variables

**Required:**
```bash
STRAVA_CLIENT_ID          # From Strava API application
STRAVA_CLIENT_SECRET      # From Strava API application
STRAVA_VERIFY_TOKEN       # Random string for webhook verification
```

**Optional:**
```bash
CDK_DEFAULT_REGION        # AWS region (default: us-west-2)
CACHE_TYPE                # 'local' or 's3' (default: local)
S3_BUCKET                 # S3 bucket for forecast cache
S3_PREFIX                 # S3 key prefix (default: forecasts/)
LOCAL_CACHE_DIR           # Local cache directory (default: /tmp/nwac-cache)
```

### 6.3 AWS Resource Configuration

**Lambda Environment Variables (injected by CDK):**
- `TABLE_NAME` - DynamoDB users table name
- `OAUTH_STATE_TABLE_NAME` - DynamoDB state table name
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_VERIFY_TOKEN`

**IAM Permissions Required:**
- `dynamodb:GetItem` - Read user tokens
- `dynamodb:PutItem` - Write/update tokens
- `dynamodb:DeleteItem` - Clean up OAuth state
- `logs:CreateLogGroup` - CloudWatch logging
- `logs:CreateLogStream`
- `logs:PutLogEvents`

## 7. Behavior Specification

### 7.1 Webhook Event Handling

**Workflow:**

1. **Receive Webhook POST**
   - Parse JSON body as `StravaWebhookEvent`
   - Validate event structure

2. **Filter Events**
   - Accept: `object_type === "activity"`
   - Accept: `aspect_type === "create"` OR `"update"`
   - Reject: `aspect_type === "delete"`
   - Reject: `object_type === "athlete"`

3. **Fetch Activity Details**
   - Look up user tokens from DynamoDB by `owner_id`
   - Refresh access token if expired
   - Call Strava API: `GET /api/v3/activities/{object_id}`

4. **Determine Processing**
   - **Auto-process:** `type === "BackcountrySki"` AND `aspect_type === "create"`
   - **Manual trigger:** Activity title contains `"#avy_forecast"`
   - **Skip:** Otherwise, return 200 OK

5. **Check Idempotency**
   - Scan activity description for existing NWAC forecast URL pattern
   - Pattern: `https://nwac.us/avalanche-forecast/#/forecast/`
   - If found: Skip processing (already has forecast)

6. **Validate Location**
   - Check `start_latlng` is not null
   - If null: Log warning, return 200 OK

7. **Lookup Forecast**
   - Extract: `{ latitude, longitude } = start_latlng`
   - Extract: `date = start_date.split('T')[0]`
   - Call: `getForecastForCoordinate(coord, date, useCache=true)`

8. **Handle Forecast Result**
   - **Forecast found:**
     - Format using `formatForecast(product)`
     - Append to description: `{original}\n\n{forecast}`
   - **No forecast:**
     - Append: `[No avalanche forecast available: {reason}]`
   - **Outside zones:**
     - Skip (don't update activity)

9. **Update Activity**
   - Call Strava API: `PUT /api/v3/activities/{object_id}`
   - Body: `{ description: newDescription }`
   - If `#avy_forecast` command present: Also update `{ name: titleWithoutCommand }`

10. **Return Response**
    - Always return `200 OK` to Strava (prevents retries)
    - Log errors but don't fail webhook

**Example Event Processing:**

```
Event: { object_type: "activity", aspect_type: "create", object_id: 123456 }
  ↓
Fetch Activity: { type: "BackcountrySki", start_latlng: [47.7, -121.1], description: "Great day!" }
  ↓
Check Description: No NWAC URL found → Continue
  ↓
Lookup Forecast: { zone: "Stevens Pass", forecast: {...} }
  ↓
Format: "NWAC Stevens Pass forecast: 3🟧/3🟧/2🟨 (...)"
  ↓
Update: { description: "Great day!\n\nNWAC Stevens Pass forecast: 3🟧/3🟧/2🟨 (...)" }
  ↓
Return: 200 OK
```

### 7.2 OAuth Flow

**User Journey:**

1. **Landing Page**
   - User visits: `https://{api-gateway-url}/`
   - Web handler returns HTML with "Connect with Strava" button
   - Button links to: `/connect`

2. **Initiate OAuth**
   - User clicks "Connect with Strava"
   - Request: `GET /connect`
   - OAuth handler:
     - Generates CSRF state token (64-char hex from `crypto.randomBytes(32)`)
     - Stores state in DynamoDB `oauth-state` table with 5-minute TTL
     - Redirects to Strava authorization URL with state parameter

3. **User Authorizes**
   - Strava shows authorization prompt
   - User approves scopes: `read,read_all,activity:write`
   - Strava redirects to: `/callback?code={auth_code}&state={state}`

4. **Handle Callback**
   - Request: `GET /callback?code={code}&state={state}`
   - OAuth handler:
     - Validates state token (exists in DynamoDB, matches)
     - Deletes state token (single-use)
     - Exchanges code for tokens via Strava API
     - Stores tokens in `strava-avy-users` table
     - Returns success HTML

5. **User Ready**
   - System now has user's tokens
   - Webhooks will process user's activities

**CSRF Protection:**
- State tokens are cryptographically random (32 bytes)
- Stored in DynamoDB with 5-minute TTL (auto-cleanup)
- Validated and deleted on callback (single-use)
- Prevents session fixation and CSRF attacks

### 7.3 Forecast Enrichment Logic

**Input:** Activity with location and date
**Output:** Activity description with forecast or error message

**Steps:**

1. **Zone Lookup**
   ```typescript
   const zone = await findZoneForCoordinate({ latitude, longitude });
   if (!zone) {
     return "Activity location outside NWAC forecast areas";
   }
   ```

2. **Forecast Fetch**
   ```typescript
   const result = await getForecastForCoordinate({ latitude, longitude }, date);
   if (!result.forecast) {
     return `No forecast available: ${result.error}`;
   }
   ```

3. **Format Forecast**
   ```typescript
   const formatted = formatForecast(result.forecast);
   // "NWAC Mt Hood Zone forecast: 3🟧/3🟧/2🟨 (...)"
   ```

4. **Append to Description**
   ```typescript
   const newDescription = activity.description
     ? `${activity.description}\n\n${formatted}`
     : formatted;
   ```

5. **Update Activity**
   ```typescript
   await updateActivity(activity.id, { description: newDescription });
   ```

### 7.4 Idempotency Rules

**Problem:** Strava may send duplicate webhook events, or users may re-upload activities.

**Solution:** URL-based detection

**Implementation:**
```typescript
const hasExistingForecast = activity.description?.includes(
  'https://nwac.us/avalanche-forecast/#/forecast/'
);

if (hasExistingForecast) {
  return; // Skip processing
}
```

**Benefits:**
- Prevents duplicate forecasts in description
- Allows natural mentions of "NWAC" in user text
- Works across multiple webhook triggers

**Limitations:**
- Won't detect forecasts without NWAC URL (shouldn't happen)
- Won't update if forecast changes after initial processing (intentional)

### 7.5 Error Handling

**Philosophy:** Fail gracefully, never break webhooks

**Error Scenarios:**

1. **Activity has no location** (`start_latlng: null`)
   - Log: Warning
   - Action: Return 200, skip processing
   - User impact: No forecast added

2. **Location outside NWAC zones**
   - Log: Info
   - Action: Return 200, skip processing
   - User impact: No forecast added

3. **No forecast available for date**
   - Log: Info
   - Action: Add message to description: `[No avalanche forecast available: ...]`
   - User impact: Sees explanation in activity

4. **Strava API rate limit**
   - Log: Error
   - Action: Return 200, skip processing
   - User impact: Forecast not added (webhook won't retry)
   - Future: Could implement queuing/retry

5. **OAuth token expired**
   - Log: Info (automatic refresh)
   - Action: Refresh token, retry request
   - User impact: None (transparent)

6. **Token refresh fails**
   - Log: Error
   - Action: Return 200, skip processing
   - User impact: Forecast not added (user may need to reconnect)

7. **Strava API error (4xx/5xx)**
   - Log: Error with details
   - Action: Return 200, skip processing
   - User impact: Forecast not added

8. **Avalanche.org API unavailable**
   - Log: Error
   - Action: Add message: `[Forecast service temporarily unavailable]`
   - User impact: Sees error message, can retry with `#avy_forecast`

9. **DynamoDB errors**
   - Log: Error
   - Action: Return 500 (allow Strava retry)
   - User impact: Strava retries webhook

**Logging Strategy:**
- All errors logged to CloudWatch with context (activity ID, athlete ID, zone)
- Stack traces included for exceptions
- No sensitive data (tokens) in logs

## 8. Security Considerations

### 8.1 OAuth Security

**CSRF Protection:**
- State parameter: 64-character cryptographically random token
- State storage: DynamoDB with 5-minute TTL
- State validation: Required on callback, single-use
- Prevents: CSRF attacks, session fixation, replay attacks

**Token Security:**
- Storage: DynamoDB with encryption at rest (AWS-managed keys)
- Transmission: HTTPS only (API Gateway enforces TLS)
- Logging: Tokens never logged (sanitized from debug output)
- Access: Lambda IAM roles with least-privilege permissions
- Rotation: Access tokens expire every 6 hours (auto-refreshed)

### 8.2 Webhook Security

**Verification Token:**
- Random string verified on subscription setup
- Validates webhook requests from Strava
- Stored in environment variables (injected by CDK)

**Input Validation:**
- All webhook event fields validated
- Activity data from Strava API treated as untrusted input
- TypeScript types enforce structure

### 8.3 AWS Security

**IAM Roles:**
- Lambda execution role: Least-privilege permissions
- No inline policies (all managed by CDK)
- No credential storage (IAM role credentials)

**DynamoDB:**
- Encryption at rest: AWS-managed keys
- Encryption in transit: TLS
- Point-in-time recovery: Enabled
- No public access

**API Gateway:**
- HTTPS only (HTTP redirects to HTTPS)
- CORS: Configured for web UI origin
- No API keys required (webhook verification via token)

### 8.4 Cost Controls

**DynamoDB:**
- On-demand billing (no provisioned capacity)
- Scales automatically
- ~$0.02/month for 10 users with 50 activities/month

**Lambda:**
- 30-second timeout (prevents runaway executions)
- 512 MB memory (configurable)
- ~$0.00/month for typical usage (free tier)

**API Gateway:**
- No throttling configured (relies on Strava rate limits)
- ~$0.01/month for typical usage

**Total estimated cost:** ~$0.02-$0.05/month for personal use

## 9. Testing & Validation

### Test Coverage Summary

| Package | Test Files | Test Count | Coverage |
|---------|-----------|------------|----------|
| forecast-api | 6 | 66 | 100% (key paths) |
| forecast-formatter | 2 | 14 | 100% |
| strava-webhook | 3 | 40 | 95% (mocked integrations) |
| **Total** | **11** | **120** | **High** |

### Testing Strategy

**Unit Tests:**
- All business logic
- Format functions
- Utility functions
- Mock external APIs (Strava, Avalanche.org, AWS)

**Integration Tests:**
- End-to-end webhook flow with fixtures
- OAuth flow with state management
- Token refresh logic
- Cache behavior (local and S3)

**Manual Testing Checklist:**
1. Register webhook with Strava (curl)
2. Connect Strava account (OAuth flow)
3. Upload BackcountrySki activity with GPS track
4. Verify forecast appears in description
5. Re-upload same activity (test idempotency)
6. Test `#avy_forecast` command on existing activity
7. Test activity outside NWAC zones
8. Test activity without GPS data

### Test Fixtures

**Location Test Points:**
- Stevens Pass: (47.7455, -121.0886)
- Mt Hood: (45.3733, -121.6959)
- Olympics: (47.8039, -123.4125)
- Outside zones: (46.7297, -117.0002)

---

## Appendix A: Forecast URL Structure

**NWAC Permalink Format:**
```
https://nwac.us/avalanche-forecast/#/forecast/{zone_id}/{product_id}
```

**Components:**
- `zone_id`: 1-10 (from `forecast_zone[0].zone_id` in API response)
- `product_id`: Unique forecast product ID (from `id` field)

**Example:**
```
https://nwac.us/avalanche-forecast/#/forecast/10/166378
```
- Zone: Mt Hood (zone_id=10)
- Product: 166378

## Appendix B: Danger Rating Mapping

| Level | Name | Color | Emoji | Description |
|-------|------|-------|-------|-------------|
| 0/-1 | No Rating | Gray | ⬜ | Forecast not available |
| 1 | Low | Green | 🟩 | Generally safe conditions |
| 2 | Moderate | Yellow | 🟨 | Heightened avalanche conditions on specific terrain |
| 3 | Considerable | Orange | 🟧 | Dangerous avalanche conditions |
| 4 | High | Red | 🟥 | Very dangerous avalanche conditions |
| 5 | Extreme | Black | ⬛ | Avoid all avalanche terrain |

## Appendix C: Strava Activity Types

**Auto-processed types:**
- `BackcountrySki` (only this type auto-processes on create)

**Manual trigger (`#avy_forecast`) works for:**
- Any activity type with location data
- Common: `BackcountrySki`, `NordicSki`, `Hike`, `AlpineSki`, `Snowshoe`

## Appendix D: Known Limitations

1. **Geography:** Only supports NWAC forecast areas (WA, OR)
2. **Forecast timing:** Forecasts typically available by 5 AM PT
3. **Pre-season:** No forecasts before October (approx)
4. **Post-season:** No forecasts after June (approx)
5. **Rate limits:** Strava API limits (600/15min) could throttle high-traffic periods
6. **Webhook retries:** Failed processing won't retry (returns 200 to prevent loops)
7. **Token expiration:** Users must reconnect if refresh token invalidated by Strava

## Appendix E: Key Dependencies

**Production:**
- `aws-cdk-lib` ^2.171.1 - Infrastructure as code
- `@aws-sdk/client-dynamodb` ^3.x - DynamoDB access
- `@turf/boolean-point-in-polygon` ^7.2.0 - Zone lookup
- `node-fetch` ^3.3.2 - HTTP client

**Development:**
- `typescript` ^5.7.2
- `vitest` ^3.0.5 - Testing framework
- `esbuild` ^0.24.2 - Lambda bundling
