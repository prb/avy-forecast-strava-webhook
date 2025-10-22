# @multifarious/forecast-formatter

String formatter for NWAC avalanche forecasts with colored danger level indicators.

## Features

- Converts forecast data to compact string representation
- Uses colored unicode squares to indicate danger levels
- Shows danger ratings for all elevation bands (above/near/below treeline)
- Supports both current day and tomorrow forecasts

## Installation

```bash
npm install @multifarious/forecast-formatter @multifarious/forecast-api
```

## Usage

### Basic Formatting

```typescript
import { getForecastForCoordinate } from '@multifarious/forecast-api';
import { formatForecast } from '@multifarious/forecast-formatter';

// Fetch forecast
const result = await getForecastForCoordinate(
  { latitude: 45.4, longitude: -121.7 },
  '2025-04-09'
);

if (result.forecast) {
  // Get full product details to access danger ratings
  const product = await fetchNWACForecastForZone(result.zone.id, '2025-04-09');

  if (product) {
    const formatted = formatForecast(product);
    console.log(formatted);
    // Output: "NWAC Mt Hood forecast: 3🟧/3🟧/2🟨 (https://nwac.us/avalanche-forecast/#/forecast/10/166378)"
  }
}
```

### Format Options

```typescript
// Without "NWAC" prefix
formatForecast(product, { includeNWAC: false });
// Output: "Mt Hood forecast: 3🟧/3🟧/2🟨 (...)"

// Tomorrow's forecast
formatForecast(product, { day: 'tomorrow' });
// Output: "NWAC Mt Hood forecast: 2🟨/2🟨/1🟩 (...)"
```

## Danger Level Colors

The formatter uses colored unicode squares to represent avalanche danger levels:

| Level | Name         | Square |
|-------|--------------|--------|
| 5     | Extreme      | ⬛ Black |
| 4     | High         | 🟥 Red |
| 3     | Considerable | 🟧 Orange |
| 2     | Moderate     | 🟨 Yellow |
| 1     | Low          | 🟩 Green |
| 0/-1  | No Rating    | ⬜ Gray |

## Format Structure

The format shows danger ratings for three elevation bands:

```
{upper}/{middle}/{lower}
```

- **upper**: Above treeline
- **middle**: Near treeline
- **lower**: Below treeline

Example: `3🟧/3🟧/2🟨` means:
- Above treeline: 3 (Considerable) 🟧
- Near treeline: 3 (Considerable) 🟧
- Below treeline: 2 (Moderate) 🟨

## API Reference

### `formatForecast(product, options?)`

Main formatting function.

**Parameters:**
- `product`: ForecastProduct - Forecast data from API
- `options?`:
  - `includeNWAC`: boolean - Include "NWAC" prefix (default: true)
  - `day`: 'current' | 'tomorrow' - Which forecast day (default: 'current')

**Returns:** String in format: `"NWAC {Zone} forecast: {danger} ({url})"`

### `formatDangerRatings(danger)`

Format danger ratings for elevation bands.

**Parameters:**
- `danger`: DangerRating - Object with upper/middle/lower ratings

**Returns:** String like `"3🟧/3🟧/2🟨"`

### `getDangerSquare(level)`

Get colored square for a danger level.

**Parameters:**
- `level`: number - Danger level (0-5)

**Returns:** Unicode colored square

### `getDangerLevelName(level)`

Get human-readable name for danger level.

**Parameters:**
- `level`: number - Danger level (0-5)

**Returns:** String like "Considerable", "High", etc.

## Testing

```bash
npm test
```

All 14 tests passing.

## License

MIT
