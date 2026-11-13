# Forecast Cache

A generic key/value cache (local files or S3) used for avalanche forecasts.
The store only stores and reads JSON values under string keys; callers decide
the key, the expiry and whether a value is worth caching (#61).

## Features

- **Generic store**: `CacheStore` with `get<T>(key)`, `set<T>(key, value, { expiresAt, reason })`, `delete(key)`, `clear()`
- **Zone forecast helpers** (`zone-forecast.ts`): avalanche.org forecasts keyed by zone and date
- **Read-through cache**: Automatic cache population on miss
- **Smart TTL** (zone forecasts):
  - Recent forecasts (≤72 hours old): 60 minute cache
  - Older forecasts (>72 hours old): Permanent cache
- **Positive and negative caching**: Caches both "forecast found" and "no forecast" responses
- **Multiple backends**:
  - **Local filesystem** (development/testing)
  - **Amazon S3** (production)
- **Graceful degradation**: Cache failures don't break the API

## Cache Strategy

### TTL Logic

```
┌─────────────────────────────────────────────────────────┐
│ Forecast Age │ TTL      │ Reason                        │
├───────────────┼──────────┼───────────────────────────────┤
│ ≤ 72 hours    │ 60 min   │ May still be updated by NWAC  │
│ > 72 hours    │ Permanent│ Immutable historical data     │
└─────────────────────────────────────────────────────────┘
```

### Why This Strategy?

- NWAC forecasters may update forecasts within 24-72 hours of publication
- After 72 hours, forecasts are historical and won't change
- Balances freshness for recent data with efficiency for historical lookups

## Configuration

### Environment Variables

```bash
# Cache type: 'local' or 's3'
CACHE_TYPE=local

# Local cache (development)
LOCAL_CACHE_DIR=/tmp/nwac-cache

# S3 cache (production)
S3_BUCKET=nwac-forecast-cache
S3_PREFIX=forecasts/
AWS_REGION=us-west-2

# AWS credentials (local development)
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret

# On AWS (ECS/Lambda/EC2), IAM role credentials are used automatically
```

## Usage

### Programmatic

```typescript
import {
  getCache,
  LocalCacheStore,
  S3CacheStore,
  getCachedZoneForecast,
  cacheZoneForecast,
} from './cache/index.js';

// Use global cache (auto-configured from env)
const cache = getCache();

// Or create specific cache
const localCache = new LocalCacheStore('/tmp/my-cache');
const s3Cache = new S3CacheStore('my-bucket', 'forecasts/');

// Zone forecasts (key and TTL chosen for you)
const cached = await getCachedZoneForecast(cache, zoneId, date); // cached?.value
await cacheZoneForecast(cache, zoneId, date, forecast);

// Anything else: choose your own key and expiry
await cache.set('caic-v1-date-2026-02-16', bundle, { expiresAt: null, reason: 'historical' });
const entry = await cache.get<typeof bundle>('caic-v1-date-2026-02-16');
await cache.delete('caic-v1-date-2026-02-16');
await cache.clear();
```

### Integrated into Forecast API

```typescript
import { getForecastForCoordinate } from './forecast.js';

// With cache (default)
const result = await getForecastForCoordinate(coord, date);

// Without cache (bypass)
const result = await getForecastForCoordinate(coord, date, false);
```

## Cache Entry Format

```json
{
  "value": { /* any JSON value, e.g. a ForecastProduct or null */ },
  "cachedAt": "2025-01-20T12:00:00Z",
  "expiresAt": "2025-01-20T13:00:00Z", // or null for permanent
  "reason": "Recent forecast (24h old) - cached for 60 minutes"
}
```

Entries written before #61 stored the value under `"forecast"`; they're still read.

Keys may contain only letters, digits, `.`, `_` and `-` (they become file and
S3 object names), so a key can never escape the cache directory or prefix.

## Local File Cache

**Structure:**
```
/tmp/nwac-cache/
  v2-zone-1645-date-2025-01-15.json
  v2-zone-1646-date-2025-01-15.json
  v2-zone-1647-date-2025-01-16.json
  ...
```

**Use for:**
- Local development
- Testing
- Quick prototyping

## S3 Cache

**Structure:**
```
s3://bucket-name/
  forecasts/
    v2-zone-1645-date-2025-01-15.json
    v2-zone-1646-date-2025-01-15.json
    ...
```

**Authentication:**
- Local: Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
- AWS: IAM role (ECS task role, Lambda execution role, EC2 instance profile)

**Use for:**
- Production deployments
- Shared cache across multiple instances
- Persistent storage

## Testing

```bash
# Run cache tests only
npm test -- src/cache

# Run all tests with caching
npm test
```

## Cost Estimation (S3)

**Storage:**
- ~10 zones × 365 days = 3,650 objects/year
- ~50 KB per forecast JSON
- Total: ~180 MB/year
- **Cost: $0.004/month** ($0.05/year)

**Requests:**
- 1,000 GET requests: $0.0004
- 1,000 PUT requests: $0.005
- **Negligible** for typical usage

## Cache Key Format

Zone forecasts:

```
v2-zone-{zoneId}-date-{YYYY-MM-DD}
```

The `v2-` prefix is `CACHE_KEY_VERSION` in `zone-forecast.ts`; bump it whenever existing entries may be wrong (entries older than 72h never expire). v2 was introduced in #51.

Examples:
- `v2-zone-1648-date-2025-01-15`
- `v2-zone-1649-date-2025-01-20`

## Implementation Notes

- Cache failures (read/write errors) are logged but don't break the API
- Expired entries are automatically deleted on read
- Both positive (forecast found) and negative (no forecast) zone results are cached; API errors are not
- Other kinds of data should use their own key prefix and version (e.g. `caic-v1-…`), so bumping one never invalidates another
- Cache is initialized lazily on first use
