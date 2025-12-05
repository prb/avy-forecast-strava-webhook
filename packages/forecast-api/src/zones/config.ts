/**
 * Mapping of NWAC zones from avalanche.org API to their GeoJSON files
 *
 * Zone IDs:
 * - id: Zone ID from avalanche.org API (1645-1657)
 * - zone_id: Zone ID used in NWAC URLs (1-10)
 * - name: Human-readable zone name
 * - filename: GeoJSON file in data/zones/ directory
 */

export interface ZoneConfig {
  id: number;
  zone_id: string;
  name: string;
  filename: string;
  center_id: string;
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
    "filename": "CAIC-front-range.geojson",
    "center_id": "CAIC"
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
