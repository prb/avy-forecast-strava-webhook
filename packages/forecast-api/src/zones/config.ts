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
}

export const ZONE_CONFIGS: ZoneConfig[] = [
  {
    id: 1645,
    zone_id: '1',
    name: 'Olympics',
    filename: 'NWAC-1645.geojson',
  },
  {
    id: 1646,
    zone_id: '4',
    name: 'West Slopes North',
    filename: 'NWAC-1646.geojson',
  },
  {
    id: 1647,
    zone_id: '5',
    name: 'West Slopes Central',
    filename: 'NWAC-1647.geojson',
  },
  {
    id: 1648,
    zone_id: '6',
    name: 'West Slopes South',
    filename: 'NWAC-1648.geojson',
  },
  {
    id: 1649,
    zone_id: '2',
    name: 'Stevens Pass',
    filename: 'NWAC-1649.geojson',
  },
  {
    id: 1653,
    zone_id: '3',
    name: 'Snoqualmie Pass',
    filename: 'NWAC-1653.geojson',
  },
  {
    id: 1654,
    zone_id: '7',
    name: 'East Slopes North',
    filename: 'NWAC-1654.geojson',
  },
  {
    id: 1655,
    zone_id: '8',
    name: 'East Slopes Central',
    filename: 'NWAC-1655.geojson',
  },
  {
    id: 1656,
    zone_id: '9',
    name: 'East Slopes South',
    filename: 'NWAC-1656.geojson',
  },
  {
    id: 1657,
    zone_id: '10',
    name: 'Mt Hood',
    filename: 'NWAC-1657.geojson',
  },
];
