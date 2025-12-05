import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadZones,
  findZoneForCoordinate,
  clearZonesCache,
  getZoneById,
  getAllZones,
} from './lookup.js';
import type { Coordinate } from '../types/index.js';

describe('Zone Lookup', () => {
  beforeEach(() => {
    // Clear cache before each test to ensure clean state
    clearZonesCache();
  });

  describe('loadZones', () => {
    it('should load all zones', async () => {
      const zones = await loadZones();
      expect(zones.length).toBeGreaterThan(0);
    });

    it('should have correct zone properties', async () => {
      const zones = await loadZones();
      const firstZone = zones[0];

      expect(firstZone).toHaveProperty('id');
      expect(firstZone).toHaveProperty('zone_id');
      expect(firstZone).toHaveProperty('name');
      expect(firstZone).toHaveProperty('boundary');
      expect(firstZone.boundary.geometry.type).toBe('Polygon');
    });

    it('should cache zones on subsequent calls', async () => {
      const zones1 = await loadZones();
      const zones2 = await loadZones();
      expect(zones1).toBe(zones2); // Same reference = cached
    });

    it('should include NWAC zone IDs', async () => {
      const zones = await loadZones();
      const zoneIds = zones.map(z => z.id);
      const nwacIds = [1645, 1646, 1647, 1648, 1649, 1653, 1654, 1655, 1656, 1657];

      nwacIds.forEach(id => {
        expect(zoneIds).toContain(id);
      });
    });
  });

  describe('findZoneForCoordinate', () => {
    // Test coordinates for each zone (approximate center points)
    const testCases: Array<{
      name: string;
      coordinate: Coordinate;
      expectedZoneId: number;
      expectedZoneName: string;
    }> = [
        {
          name: 'Olympics',
          coordinate: { latitude: 47.8, longitude: -123.5 },
          expectedZoneId: 1645,
          expectedZoneName: 'Olympics',
        },
        {
          name: 'West Slopes North - Mt Baker area',
          coordinate: { latitude: 48.8, longitude: -121.7 },
          expectedZoneId: 1646,
          expectedZoneName: 'West Slopes North',
        },
        {
          name: 'West Slopes Central',
          coordinate: { latitude: 47.9, longitude: -121.4 },
          expectedZoneId: 1647,
          expectedZoneName: 'West Slopes Central',
        },
        {
          name: 'West Slopes South',
          coordinate: { latitude: 46.5, longitude: -121.7 },
          expectedZoneId: 1648,
          expectedZoneName: 'West Slopes South',
        },
        {
          name: 'Stevens Pass',
          coordinate: { latitude: 47.75, longitude: -121.1 },
          expectedZoneId: 1649,
          expectedZoneName: 'Stevens Pass',
        },
        {
          name: 'Snoqualmie Pass',
          coordinate: { latitude: 47.45, longitude: -121.4 },
          expectedZoneId: 1653,
          expectedZoneName: 'Snoqualmie Pass',
        },
        {
          name: 'East Slopes North',
          coordinate: { latitude: 48.5, longitude: -120.3 },
          expectedZoneId: 1654,
          expectedZoneName: 'East Slopes North',
        },
        {
          name: 'East Slopes Central',
          coordinate: { latitude: 47.5, longitude: -120.7 },
          expectedZoneId: 1655,
          expectedZoneName: 'East Slopes Central',
        },
        {
          name: 'East Slopes South',
          coordinate: { latitude: 46.9, longitude: -121.15 },
          expectedZoneId: 1656,
          expectedZoneName: 'East Slopes South',
        },
        {
          name: 'Mt Hood',
          coordinate: { latitude: 45.4, longitude: -121.7 },
          expectedZoneId: 1657,
          expectedZoneName: 'Mt Hood',
        },
      ];

    testCases.forEach(({ name, coordinate, expectedZoneId, expectedZoneName }) => {
      it(`should find ${name}`, async () => {
        const zone = await findZoneForCoordinate(coordinate);
        expect(zone).not.toBeNull();
        expect(zone?.id).toBe(expectedZoneId);
        expect(zone?.name).toBe(expectedZoneName);
      });
    });

    it('should return null for coordinates outside all zones (Pacific Ocean)', async () => {
      const coordinate: Coordinate = { latitude: 47.0, longitude: -125.0 };
      const zone = await findZoneForCoordinate(coordinate);
      expect(zone).toBeNull();
    });

    it('should return null for coordinates far outside all zones (Idaho)', async () => {
      const coordinate: Coordinate = { latitude: 47.0, longitude: -116.0 };
      const zone = await findZoneForCoordinate(coordinate);
      expect(zone).toBeNull();
    });

    it('should return null for coordinates in different region (California)', async () => {
      const coordinate: Coordinate = { latitude: 39.0, longitude: -120.0 };
      const zone = await findZoneForCoordinate(coordinate);
      expect(zone).toBeNull();
    });
  });

  describe('getZoneById', () => {
    it('should return zone by valid ID', async () => {
      const zone = await getZoneById(1648);
      expect(zone).not.toBeNull();
      expect(zone?.id).toBe(1648);
      expect(zone?.name).toBe('West Slopes South');
    });

    it('should return null for invalid ID', async () => {
      const zone = await getZoneById(9999);
      expect(zone).toBeNull();
    });
  });

  describe('getAllZones', () => {
    it('should return all zones', async () => {
      const zones = await getAllZones();
      expect(zones.length).toBeGreaterThan(0);
    });

    it('should return zones with boundary data', async () => {
      const zones = await getAllZones();
      zones.forEach(zone => {
        expect(zone.boundary).toBeDefined();
        expect(zone.boundary.geometry.type).toBe('Polygon');
        expect(zone.boundary.geometry.coordinates).toBeDefined();
        expect(zone.boundary.geometry.coordinates.length).toBeGreaterThan(0);
      });
    });
  });

  describe('clearZonesCache', () => {
    it('should clear the cache', async () => {
      const zones1 = await loadZones();
      clearZonesCache();
      const zones2 = await loadZones();
      expect(zones1).not.toBe(zones2); // Different references = cache cleared
    });
  });

  describe('Edge Cases', () => {
    it('should handle coordinates at extreme latitudes', async () => {
      const coordinate: Coordinate = { latitude: 90, longitude: -121.0 };
      const zone = await findZoneForCoordinate(coordinate);
      expect(zone).toBeNull();
    });

    it('should handle coordinates at extreme longitudes', async () => {
      const coordinate: Coordinate = { latitude: 47.0, longitude: -180 };
      const zone = await findZoneForCoordinate(coordinate);
      expect(zone).toBeNull();
    });

    it('should handle coordinates near zone boundaries', async () => {
      // Test a point very close to a zone boundary
      const coordinate: Coordinate = { latitude: 47.0, longitude: -121.9 };
      const zone = await findZoneForCoordinate(coordinate);
      // Should either be in West Slopes South or null, but not crash
      expect(zone === null || zone.id === 1648).toBe(true);
    });
  });
});
