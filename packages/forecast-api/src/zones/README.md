# Zone Lookup Module

This module handles loading NWAC zone boundaries and finding which zone contains a given GPS coordinate.

## Usage

```typescript
import { findZoneForCoordinate } from './zones/index.js';

// Find zone for a GPS coordinate
const zone = await findZoneForCoordinate({
  latitude: 47.5,
  longitude: -121.4
});

if (zone) {
  console.log(`Zone: ${zone.name} (ID: ${zone.id}, zone_id: ${zone.zone_id})`);
} else {
  console.log('Coordinate is outside all NWAC zones');
}
```

## Functions

### `findZoneForCoordinate(coordinate: Coordinate): Promise<ZoneWithBoundary | null>`

Find which NWAC zone contains the given GPS coordinate.

**Parameters:**
- `coordinate` - GPS coordinate with `latitude` and `longitude` properties

**Returns:**
- Zone information with boundary data if found
- `null` if coordinate is outside all zones

### `loadZones(): Promise<ZoneWithBoundary[]>`

Load all zone boundaries from GeoJSON files. Results are cached after first load.

### `getZoneById(id: number): Promise<ZoneWithBoundary | null>`

Get a specific zone by its ID (1645-1657).

### `getAllZones(): Promise<ZoneWithBoundary[]>`

Get all loaded zones with their boundary data.

### `clearZonesCache(): void`

Clear the zones cache. Useful for testing or when you need to reload zone data.

## Zone IDs

| Zone ID | Zone ID (URL) | Name |
|---------|---------------|------|
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

## Testing

Run tests with:
```bash
npm test
```

The test suite includes:
- Loading and caching zones
- Point-in-polygon lookup for all zones
- Edge cases (coordinates outside zones, extreme values)
- Cache management
