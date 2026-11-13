/**
 * Mapping of avalanche forecast zones to their GeoJSON boundary files
 *
 * Zone IDs:
 * - id: Internal numeric zone key, used for caching and lookups. For NWAC
 *   this was the avalanche.org zone ID at the time the boundaries were
 *   captured, but avalanche.org renumbers zones between seasons (e.g.
 *   1645-1657 became 3020-3032 for 2025-26), so it MUST NOT be used to match
 *   API products. See #51.
 * - zone_id: The center's stable zone identifier (the slug used in forecast
 *   URLs, e.g. '1'-'10' for NWAC, 'salt-lake' for UAC). Products are matched
 *   on (center_id, zone_id).
 * - name: Human-readable zone name
 * - filename: GeoJSON file in data/zones/ directory
 * - center_id: avalanche.org avalanche center identifier
 */

/** avalanche.org identifiers for the avalanche centers we have boundaries for */
export type AvalancheCenterId = 'NWAC' | 'UAC' | 'CAIC';

/**
 * Centers whose forecasts can currently be fetched and formatted end-to-end.
 *
 * - UAC: supported since #53. avalanche.org doesn't publish the Abajos or
 *   Southwest zones, so those return "no forecast available".
 * - CAIC: supported since #52, from CAIC's own AvID API rather than
 *   avalanche.org (whose CAIC sub-zones don't map onto our boundaries).
 *   Our regional boundaries only name the zone; see caic/forecast.ts.
 */
export const SUPPORTED_CENTERS: ReadonlySet<AvalancheCenterId> = new Set(['NWAC', 'UAC', 'CAIC']);

export interface ZoneConfig {
  id: number;
  zone_id: string;
  name: string;
  filename: string;
  center_id: AvalancheCenterId;
}

export const ZONE_CONFIGS: ZoneConfig[] = [
  {
    id: 1645,
    zone_id: '1',
    name: 'Olympics',
    filename: 'NWAC-1645.geojson',
    center_id: 'NWAC',
  },
  {
    id: 1646,
    zone_id: '4',
    name: 'West Slopes North',
    filename: 'NWAC-1646.geojson',
    center_id: 'NWAC',
  },
  {
    id: 1647,
    zone_id: '5',
    name: 'West Slopes Central',
    filename: 'NWAC-1647.geojson',
    center_id: 'NWAC',
  },
  {
    id: 1648,
    zone_id: '6',
    name: 'West Slopes South',
    filename: 'NWAC-1648.geojson',
    center_id: 'NWAC',
  },
  {
    id: 1649,
    zone_id: '2',
    name: 'Stevens Pass',
    filename: 'NWAC-1649.geojson',
    center_id: 'NWAC',
  },
  {
    id: 1653,
    zone_id: '3',
    name: 'Snoqualmie Pass',
    filename: 'NWAC-1653.geojson',
    center_id: 'NWAC',
  },
  {
    id: 1654,
    zone_id: '7',
    name: 'East Slopes North',
    filename: 'NWAC-1654.geojson',
    center_id: 'NWAC',
  },
  {
    id: 1655,
    zone_id: '8',
    name: 'East Slopes Central',
    filename: 'NWAC-1655.geojson',
    center_id: 'NWAC',
  },
  {
    id: 1656,
    zone_id: '9',
    name: 'East Slopes South',
    filename: 'NWAC-1656.geojson',
    center_id: 'NWAC',
  },
  {
    id: 1657,
    zone_id: '10',
    name: 'Mt Hood',
    filename: 'NWAC-1657.geojson',
    center_id: 'NWAC',
  },
  // UAC Zones
  {
    id: 2000,
    zone_id: 'abajos',
    name: 'Abajos',
    filename: 'UAC-abajos.geojson',
    center_id: 'UAC',
  },
  {
    id: 2001,
    zone_id: 'logan',
    name: 'Logan',
    filename: 'UAC-logan.geojson',
    center_id: 'UAC',
  },
  {
    id: 2002,
    zone_id: 'moab',
    name: 'Moab',
    filename: 'UAC-moab.geojson',
    center_id: 'UAC',
  },
  {
    id: 2003,
    zone_id: 'ogden',
    name: 'Ogden',
    filename: 'UAC-ogden.geojson',
    center_id: 'UAC',
  },
  {
    id: 2004,
    zone_id: 'provo',
    name: 'Provo',
    filename: 'UAC-provo.geojson',
    center_id: 'UAC',
  },
  {
    id: 2005,
    zone_id: 'salt-lake',
    name: 'Salt Lake',
    filename: 'UAC-salt-lake.geojson',
    center_id: 'UAC',
  },
  {
    id: 2006,
    zone_id: 'skyline',
    name: 'Skyline',
    filename: 'UAC-skyline.geojson',
    center_id: 'UAC',
  },
  {
    id: 2007,
    zone_id: 'southwest',
    name: 'Southwest',
    filename: 'UAC-southwest.geojson',
    center_id: 'UAC',
  },
  {
    id: 2008,
    zone_id: 'uintas',
    name: 'Uintas',
    filename: 'UAC-uintas.geojson',
    center_id: 'UAC',
  },
  // CAIC Zones
  {
    "id": 3000,
    "zone_id": "aspen",
    "name": "Aspen",
    "filename": "CAIC-aspen.geojson",
    "center_id": "CAIC"
  },
  {
    "id": 3001,
    "zone_id": "front-range",
    "name": "Front Range",
    filename: 'CAIC-front-range.geojson',
    center_id: 'CAIC'
  },
  {
    id: 3002,
    zone_id: 'grand-mesa',
    name: 'Grand Mesa',
    filename: 'CAIC-grand-mesa.geojson',
    center_id: 'CAIC',
  },
  {
    "id": 3003,
    "zone_id": "gunnison",
    "name": "Gunnison",
    "filename": "CAIC-gunnison.geojson",
    "center_id": "CAIC"
  },
  {
    "id": 3004,
    "zone_id": "northern-san-juan",
    "name": "Northern San Juan",
    "filename": "CAIC-northern-san-juan.geojson",
    "center_id": "CAIC"
  },
  {
    "id": 3005,
    "zone_id": "sangre-de-cristo",
    "name": "Sangre de Cristo",
    "filename": "CAIC-sangre-de-cristo.geojson",
    "center_id": "CAIC"
  },
  {
    "id": 3006,
    "zone_id": "sawatch",
    "name": "Sawatch",
    "filename": "CAIC-sawatch.geojson",
    "center_id": "CAIC"
  },
  {
    "id": 3007,
    "zone_id": "southern-san-juan",
    "name": "Southern San Juan",
    "filename": "CAIC-southern-san-juan.geojson",
    "center_id": "CAIC"
  },
  {
    "id": 3008,
    "zone_id": "steamboat-and-flat-tops",
    "name": "Steamboat & Flat Tops",
    "filename": "CAIC-steamboat-and-flat-tops.geojson",
    "center_id": "CAIC"
  },
  {
    "id": 3009,
    "zone_id": "vail-and-summit-county",
    "name": "Vail & Summit County",
    "filename": "CAIC-vail-and-summit-county.geojson",
    "center_id": "CAIC"
  },
];
