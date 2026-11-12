# Strava Avalanche Forecast Enrichment

Automatically enrich Strava backcountry ski activities with avalanche forecast information from the Northwest Avalanche Center (NWAC).

## What It Does

When you upload a BackcountrySki activity to Strava, this system automatically:
1. Detects the activity location and date
2. Fetches the relevant NWAC avalanche forecast
3. Appends formatted forecast data to your activity description

**Manual Trigger**: Add `#avy_forecast` to any activity title to manually request a forecast.

**Example output:**
```
NWAC Mt Hood Zone forecast: 3🟧/3🟧/2🟨 (https://nwac.us/avalanche-forecast/#/forecast/10/166378)
```

## Quick Start

### Prerequisites
- Node.js 22+
- AWS Account (for deployment)
- Strava API application

### Installation
```bash
npm install
```

### Build
```bash
npm run build
```

### Test
```bash
npm test            # all tests, including live avalanche.org API suites
npm run test:unit   # hermetic tests only (what CI runs)
```

Use `npm run test:watch -w <workspace>` for watch mode.

## Project Structure

This is a TypeScript monorepo with three main components:

**Packages:**
- **forecast-api** - Fetch NWAC forecasts by GPS coordinates ([docs](packages/forecast-api/README.md))
- **forecast-formatter** - Format forecasts with colored danger indicators ([docs](packages/forecast-formatter/README.md))

**Application:**
- **strava-webhook** - AWS Lambda application for Strava webhook integration ([docs](apps/strava-webhook/README.md))

## Documentation

- **[OPERATIONS.md](OPERATIONS.md)** - Deployment, monitoring, and operations guide
- **[SPECIFICATION.md](SPECIFICATION.md)** - Complete system specification and architecture
- **[RESEARCH_FINDINGS.md](packages/forecast-api/RESEARCH_FINDINGS.md)** - NWAC API research and findings
- **[Deployment Guide](apps/strava-webhook/README.md)** - AWS deployment instructions

## Status

**Production Ready** - All components complete with 120+ passing tests.

- ✅ Forecast API (66 tests)
- ✅ Forecast formatter (14 tests)
- ✅ Strava webhook handler (40 tests)
- ✅ Multi-user OAuth flow
- ✅ AWS CDK infrastructure

## License

[CC0 1.0 Universal](LICENSE) - Public Domain Dedication
