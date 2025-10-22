# Strava Avalanche Enrichment

Monorepo for Strava webhook integration with avalanche forecast enrichment.

## Project Structure

```
strava-avy-enrich/
├── packages/
│   ├── forecast-api/         # NWAC forecast API (@multifarious/forecast-api)
│   └── forecast-formatter/   # Forecast formatter (@multifarious/forecast-formatter)
└── apps/                      # (Future) Main applications
    └── strava-webhook/        # (Future) AWS Lambda Strava webhook handler
```

## Packages

### @multifarious/forecast-api

API to fetch NWAC (Northwest Avalanche Center) avalanche forecasts by GPS coordinates and date.

**Features:**
- GPS coordinate → avalanche zone lookup (point-in-polygon)
- Forecast retrieval from avalanche.org API
- Smart caching (local filesystem and S3)
- TypeScript with full type definitions
- 66 tests, all passing

**See:** [packages/forecast-api/README.md](packages/forecast-api/README.md)

### @multifarious/forecast-formatter

String formatter for NWAC avalanche forecasts with colored danger level indicators.

**Features:**
- Converts forecast data to compact string representation
- Colored unicode squares for danger levels (🟩🟨🟧🟥⬛)
- Shows all elevation bands (above/near/below treeline)
- 14 tests, all passing

**Example output:**
```
NWAC Mt Hood Zone forecast: 3🟧/3🟧/2🟨 (https://nwac.us/avalanche-forecast/#/forecast/10/166378)
```

**See:** [packages/forecast-formatter/README.md](packages/forecast-formatter/README.md)

## Getting Started

### Prerequisites

- Node.js v18+ (currently using v24.9.0)
- npm v9+ (currently using v11.6.2)

### Installation

```bash
npm install
```

This will install dependencies for all workspace packages.

### Building

```bash
# Build all packages
npm run build

# Build specific package
npm run build -w @multifarious/forecast-api
```

### Testing

```bash
# Run tests for all packages
npm test

# Run tests for specific package
npm test -w @multifarious/forecast-api
```

### Type Checking

```bash
# Type check all packages
npm run type-check
```

## Development

### Adding a New Package

1. Create a new directory under `packages/` or `apps/`
2. Initialize with `package.json` using `@multifarious` scope
3. Add TypeScript config that extends root `tsconfig.json`
4. The package will be automatically included in workspace commands

### Using forecast-api in Other Packages

```typescript
import { getForecastForCoordinate } from '@multifarious/forecast-api';
import type { Coordinate, ForecastResponse } from '@multifarious/forecast-api';

const result = await getForecastForCoordinate(
  { latitude: 47.7455, longitude: -121.0886 },
  '2025-01-15'
);

if (result.forecast) {
  console.log(`Danger rating: ${result.forecast.danger_rating}`);
  console.log(`URL: ${result.forecast.url}`);
}
```

## Project Status

- [x] Forecast API package (complete, 66 tests passing)
- [x] Forecast formatter package (complete, 14 tests passing)
- [ ] Strava webhook Lambda handler (planned)
- [ ] Additional packages TBD

## License

MIT
