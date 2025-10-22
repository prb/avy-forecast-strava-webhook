/**
 * Zone lookup module
 *
 * Provides functions to:
 * - Load NWAC zone boundaries from GeoJSON files
 * - Find which zone contains a given GPS coordinate
 * - Get zones by ID or retrieve all zones
 */

export {
  loadZones,
  findZoneForCoordinate,
  clearZonesCache,
  getZoneById,
  getAllZones,
} from './lookup.js';

export { ZONE_CONFIGS, type ZoneConfig } from './config.js';
