# NWAC Forecast API Research Findings

## Summary
This document contains research findings on how to fetch NWAC avalanche forecasts for a given GPS coordinate and date.

**Key Finding**: Use the **Avalanche.org Public API** (https://api.avalanche.org/v2/) instead of the NWAC API directly. It provides better data structure and permalink URLs.

## Avalanche.org Public API (RECOMMENDED)

### Base URL
```
https://api.avalanche.org/v2/public/
```

### Key Endpoints

1. **Get Products by Date Range**
   ```
   GET /v2/public/products?avalanche_center_id=NWAC&date_start={YYYY-MM-DD}&date_end={YYYY-MM-DD}
   ```
   - Returns all forecast products for NWAC within the date range
   - Product types include: `forecast`, `summary`
   - Each product includes zone information and dates

2. **Get Individual Product**
   ```
   GET /v2/public/product/{product_id}
   ```
   - Returns detailed forecast data for a specific product
   - Includes danger ratings, problems, bottom line, hazard discussion, media, etc.

### Forecast Permalink URL Structure

**This is the permanent URL for any NWAC forecast:**
```
https://nwac.us/avalanche-forecast/#/forecast/{zone_id}/{product_id}
```

Where:
- `zone_id` is from `forecast_zone[0].zone_id` field in the API response
- `product_id` is the forecast's `id` field

**Example:**
```
https://nwac.us/avalanche-forecast/#/forecast/9/166585
```
This URL will permanently link to product 166585 for East Slopes South (zone_id 9).

### Zone Mapping (Avalanche.org API)

| Zone ID | Zone Name | API zone_id |
|---------|-----------|-------------|
| 1645 | Olympics | 1 |
| 1646 | West Slopes North | 4 |
| 1647 | West Slopes Central | 5 |
| 1648 | West Slopes South | 6 |
| 1649 | Stevens Pass | 2 |
| 1653 | Snoqualmie Pass | 3 |
| 1654 | East Slopes North | 7 |
| 1655 | East Slopes Central | 8 |
| 1656 | East Slopes South | 9 |
| 1657 | Mt Hood | 10 |

Note: The avalanche.org API uses different IDs (1645-1657) than NWAC's native API, but also includes a `zone_id` field (1-10) needed for URL construction.

## NWAC Native API (Alternative)

### Base URL
```
https://nwac.us/api/v2/
```

### Key Endpoints

1. **Avalanche Region Forecast**
   ```
   GET /api/v2/avalanche-region-forecast
   ```
   - Returns forecast data including danger ratings, problems, and zone information
   - Supports pagination with `limit` and `offset` query parameters
   - Each forecast includes a `day1_date` field (format: "YYYY-MM-DD")
   - Contains a `zones` array with zone details

2. **Observations**
   ```
   GET /api/v2/observations
   ```

3. **Individual Observation**
   ```
   GET /api/v2/observation/{observation_id}
   ```

## NWAC Forecast Zones

The NWAC covers 8 forecast zones across Washington State and northern Oregon:

| Zone ID | Zone Name | Slug | Abbreviation |
|---------|-----------|------|--------------|
| 1 | Olympics | olympics | Olympics |
| 2 | Stevens Pass | cascade-west-stevens-pass | Stevens Pass |
| 3 | Snoqualmie Pass | cascade-west-snoqualmie-pass | Snoqualmie Pass |
| 13 | Mt Hood | mt-hood | Mt Hood |
| 14 | West Slopes North - Canadian Border to Skagit River | cascade-west-north-baker | West North |
| 15 | West Slopes Central - Skagit River to South of I-90 | cascade-west-central | West Central |
| 16 | West Slopes South - South of I-90 to Columbia River | cascade-west-south | West South |
| 19 | East Slopes South - South of I-90 to Columbia River | cascade-east-south | East South |

## Forecast URL Structure

Forecasts can be accessed via web at:
```
https://nwac.us/avalanche-forecast/current/{zone-slug}
```

Example:
```
https://nwac.us/avalanche-forecast/current/cascade-west-north-baker
```

## Zone Boundary Data

### GeoJSON Format
Zone boundaries are available in GeoJSON format with lat/long coordinates (WGS84).

### Source
Found GeoJSON files hosted at:
```
https://www.jareddillard.com/assets/json/avalanche-zones/NWAC-{id}.geojson
```

Example file structure:
```json
{
  "type": "FeatureCollection",
  "features": [{
    "properties": {
      "title": "East Slopes Central",
      "description": "",
      ...
    },
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [-121.0176, 47.6265],
          [-120.9006, 47.6513],
          ...
        ]
      ]
    }
  }]
}
```

Note: Not all zone GeoJSON files may be available from this third-party source. For official zone boundary data, contact NWAC at forecasters@nwac.us.

## Forecast Data Structure

Example forecast object:
```json
{
  "id": 8006,
  "publish_date": "2020-03-23T18:00:00",
  "day1_date": "2020-03-24",
  "day1_danger_elev_high": "Moderate",
  "day1_danger_elev_middle": "Moderate",
  "day1_danger_elev_low": "Low",
  "day1_warning": "none",
  "bottom_line_summary": "<p>Keep your risk tolerance to a minimum...</p>",
  "snowpack_discussion": "<p>...</p>",
  "problems": [...],
  "zones": [{
    "id": 14,
    "zone_name": "West Slopes North - Canadian Border to Skagit River",
    "slug": "cascade-west-north-baker",
    "zone_abbrev": "West North"
  }]
}
```

## Implementation Approach

To build an API that fetches avalanche forecasts for a given GPS coordinate and date:

### 1. Zone Lookup from GPS Coordinates
- Load zone boundary GeoJSON files
- Use point-in-polygon algorithm to determine which zone contains the GPS coordinate
- Libraries to consider:
  - Python: `shapely` (for point-in-polygon)
  - Node.js: `turf.js` or `@turf/boolean-point-in-polygon`

### 2. Forecast Retrieval
- Query Avalanche.org API: `GET /v2/public/products?avalanche_center_id=NWAC&date_start={date}&date_end={date}`
- Filter by zone ID from step 1 (match against `forecast_zone[0].id` field - values 1645-1657)
- Filter by `product_type == "forecast"`

### 3. Proposed API Endpoint
```
GET /forecast?lat={latitude}&lon={longitude}&date={YYYY-MM-DD}
```

Response:
```json
{
  "zone": {
    "id": 1648,
    "zone_id": 6,
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

## Next Steps

1. Download/collect all zone GeoJSON files
2. Set up point-in-polygon lookup service
3. Implement NWAC API client
4. Build REST API endpoint
5. Add caching layer (optional, to reduce load on NWAC API)
6. Add error handling for:
   - GPS coordinates outside all zones
   - No forecast available for the specified date
   - NWAC API unavailability

## References

- **Avalanche.org Public API**: https://api.avalanche.org/v2/public/ (RECOMMENDED)
- Avalanche.org API Docs: https://github.com/NationalAvalancheCenter/Avalanche.org-Public-API-Docs
- NWAC Homepage: https://nwac.us/
- NWAC Native API: https://nwac.us/api/v2/
- Interactive WA Avalanche Map (GeoJSON source): https://www.jareddillard.com/avy/wa
- Contact for official NWAC API access: forecasters@nwac.us
