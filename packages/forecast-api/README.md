# NWAC Forecast API

API to fetch NWAC avalanche forecasts by GPS coordinates and date.

## Setup

### Prerequisites
- Node.js v18+ (currently using v24.9.0)
- npm v9+ (currently using v11.6.2)

### Installation

```bash
npm install
```

## Development

### Run in development mode with auto-reload
```bash
npm run dev
```

### Type checking
```bash
npm run type-check
```

### Build for production
```bash
npm run build
```

### Run production build
```bash
npm start
```

## Project Structure

```
nwac-forecast-api/
├── src/
│   ├── index.ts           # Main entry point
│   ├── types/             # TypeScript type definitions
│   ├── api/               # API client for avalanche.org
│   └── zones/             # Zone lookup and boundary logic
├── data/
│   └── zones/             # GeoJSON zone boundary files
├── RESEARCH_FINDINGS.md   # API research and documentation
├── package.json
└── tsconfig.json
```

## Usage

### Programmatic API

```typescript
import { getForecastForCoordinate } from './src/forecast.js';

// Get forecast for Stevens Pass on a specific date
const result = await getForecastForCoordinate(
  { latitude: 47.7455, longitude: -121.0886 },
  '2025-01-15'
);

if (result.forecast) {
  console.log(`Zone: ${result.zone.name}`);
  console.log(`Danger Rating: ${result.forecast.danger_rating}`);
  console.log(`Permalink: ${result.forecast.url}`);
} else {
  console.log(`Error: ${result.error}`);
}
```

### Caching

The API includes smart caching with TTL based on forecast age:
- **Recent forecasts (≤72 hours)**: Cached for 60 minutes
- **Older forecasts (>72 hours)**: Cached permanently

```bash
# Configure cache (defaults to local file cache)
export CACHE_TYPE=local  # or 's3'
export LOCAL_CACHE_DIR=/tmp/nwac-cache

# For S3 cache (production)
export CACHE_TYPE=s3
export S3_BUCKET=your-bucket
export S3_PREFIX=forecasts/
export AWS_REGION=us-west-2
```

See [src/cache/README.md](src/cache/README.md) for detailed caching documentation.

### Planned HTTP API Design

### Endpoint
```
GET /forecast?lat={latitude}&lon={longitude}&date={YYYY-MM-DD}
```

### Response
```json
{
  "zone": {
    "id": 1648,
    "zone_id": "6",
    "name": "West Slopes South"
  },
  "forecast": {
    "product_id": 166672,
    "date": "2025-04-13",
    "published_time": "2025-04-13T01:30:00+00:00",
    "danger_rating": 1,
    "bottom_line": "With a frozen snow surface...",
    "url": "https://nwac.us/avalanche-forecast/#/forecast/6/166672"
  }
}
```

## Implementation Status

- [x] TypeScript project setup
- [x] Type definitions
- [x] Download zone GeoJSON boundaries (10 zones)
- [x] Implement point-in-polygon zone lookup
- [x] Testing framework (Vitest)
- [x] Zone lookup tests (25 tests, all passing)
- [x] Implement avalanche.org API client
- [x] Build forecast query logic (GPS + date → forecast)
- [x] API client tests (12 tests, all passing)
- [x] Forecast logic tests (10 tests, all passing)
- [x] Complete integration demo
- [x] Smart forecast caching (local & S3)
- [x] Cache tests (19 tests, all passing)
- [ ] Add HTTP server (Express/Fastify)

**Current Status:** Core API with caching complete! **66 tests passing.** Ready to add HTTP server layer.

## Data Sources

- **Avalanche.org API**: https://api.avalanche.org/v2/public/
- **Zone Boundaries**: https://www.jareddillard.com/assets/json/avalanche-zones/

## License

MIT
