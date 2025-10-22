import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import type { FeatureCollection, Polygon } from 'geojson';
import type { Coordinate, ZoneWithBoundary } from '../types/index.js';
import { ZONE_CONFIGS } from './config.js';

// Get the directory of this module (for loading data files)
// Handle both ESM and CommonJS (when bundled by esbuild)
function getDataDir(): string {
  // In Lambda/bundled environment, check for zone files in current directory first
  // This handles the case where zone files are copied alongside the bundle
  const bundledPath = join(process.cwd(), 'data/zones');

  // In development/ESM, use import.meta.url
  try {
    const moduleDirname = dirname(fileURLToPath(import.meta.url));
    return join(moduleDirname, '../../data/zones');
  } catch {
    // CommonJS fallback - return bundled path
    return bundledPath;
  }
}

const DATA_DIR = getDataDir();

/**
 * Cached zone boundaries loaded from GeoJSON files
 */
let zonesCache: ZoneWithBoundary[] | null = null;

/**
 * Load all zone boundaries from GeoJSON files
 */
export async function loadZones(): Promise<ZoneWithBoundary[]> {
  if (zonesCache) {
    return zonesCache;
  }

  const zones: ZoneWithBoundary[] = [];

  for (const config of ZONE_CONFIGS) {
    const filePath = join(DATA_DIR, config.filename);

    try {
      const content = await readFile(filePath, 'utf-8');
      const geojson = JSON.parse(content) as FeatureCollection<Polygon>;

      if (!geojson.features || geojson.features.length === 0) {
        console.warn(`No features found in ${config.filename}`);
        continue;
      }

      const feature = geojson.features[0];

      if (feature.geometry.type !== 'Polygon') {
        console.warn(`Expected Polygon geometry in ${config.filename}, got ${feature.geometry.type}`);
        continue;
      }

      zones.push({
        id: config.id,
        zone_id: config.zone_id,
        name: config.name,
        boundary: feature as any, // Type assertion - we know this is a valid Feature<Polygon>
      });
    } catch (error) {
      console.error(`Failed to load zone ${config.filename}:`, error);
      throw new Error(`Failed to load zone ${config.name}: ${error}`);
    }
  }

  zonesCache = zones;
  return zones;
}

/**
 * Find which NWAC zone contains the given GPS coordinate
 *
 * @param coordinate GPS coordinate (latitude, longitude)
 * @returns Zone information if found, null if coordinate is outside all zones
 */
export async function findZoneForCoordinate(
  coordinate: Coordinate
): Promise<ZoneWithBoundary | null> {
  const zones = await loadZones();

  // Create a turf point from the coordinate
  // Note: GeoJSON uses [longitude, latitude] order, not [lat, lon]
  const pt = point([coordinate.longitude, coordinate.latitude]);

  // Check each zone to see if the point is inside
  for (const zone of zones) {
    if (booleanPointInPolygon(pt, zone.boundary)) {
      return zone;
    }
  }

  // Point is not in any zone
  return null;
}

/**
 * Clear the zones cache (useful for testing)
 */
export function clearZonesCache(): void {
  zonesCache = null;
}

/**
 * Get zone by ID
 */
export async function getZoneById(id: number): Promise<ZoneWithBoundary | null> {
  const zones = await loadZones();
  return zones.find(z => z.id === id) || null;
}

/**
 * Get all loaded zones
 */
export async function getAllZones(): Promise<ZoneWithBoundary[]> {
  return loadZones();
}
