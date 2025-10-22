import { getForecastForCoordinate, isValidCoordinate, isValidDate } from './forecast.js';
import type { Coordinate } from './types/index.js';

/**
 * NWAC Forecast API
 *
 * Fetches avalanche forecasts for a given GPS coordinate and date.
 */

async function demo() {
  console.log('🏔️  NWAC Forecast API - Complete Demo\n');
  console.log('=' .repeat(60));

  // Test coordinates with forecasts
  const testCases: Array<{ name: string; coord: Coordinate; date: string }> = [
    {
      name: 'Stevens Pass Ski Area',
      coord: { latitude: 47.7455, longitude: -121.0886 },
      date: '2025-01-15',
    },
    {
      name: 'Mt Rainier (Paradise)',
      coord: { latitude: 46.7865, longitude: -121.7361 },
      date: '2025-01-15',
    },
    {
      name: 'Mt Baker Ski Area',
      coord: { latitude: 48.8608, longitude: -121.6747 },
      date: '2025-01-15',
    },
    {
      name: 'Mt Hood',
      coord: { latitude: 45.4, longitude: -121.7 },
      date: '2025-01-15',
    },
  ];

  console.log('\n📍 Testing Forecast Retrieval:\n');

  for (const { name, coord, date } of testCases) {
    // Validate inputs
    if (!isValidCoordinate(coord)) {
      console.log(`❌ ${name}: Invalid coordinates`);
      continue;
    }

    if (!isValidDate(date)) {
      console.log(`❌ ${name}: Invalid date format`);
      continue;
    }

    console.log(`\n🔍 ${name}`);
    console.log(`   Coordinates: ${coord.latitude}, ${coord.longitude}`);
    console.log(`   Date: ${date}`);

    try {
      const result = await getForecastForCoordinate(coord, date);

      console.log(`   Zone: ${result.zone.name} (ID: ${result.zone.zone_id})`);

      if (result.forecast) {
        console.log(`   ✅ Forecast Found!`);
        console.log(`      Product ID: ${result.forecast.product_id}`);
        console.log(`      Danger Rating: ${getDangerRatingText(result.forecast.danger_rating)}`);
        console.log(`      Published: ${new Date(result.forecast.published_time).toLocaleString()}`);
        if (result.forecast.bottom_line) {
          const stripped = result.forecast.bottom_line.replace(/<[^>]*>/g, '').trim();
          const preview = stripped.length > 100 ? stripped.substring(0, 100) + '...' : stripped;
          console.log(`      Summary: ${preview}`);
        }
        console.log(`      🔗 ${result.forecast.url}`);
      } else {
        console.log(`   ⚠️  No forecast available`);
        if (result.error) {
          console.log(`      Error: ${result.error}`);
        }
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Test coordinate outside zones
  console.log(`\n\n🔍 Seattle (Outside NWAC Zones)`);
  console.log(`   Coordinates: 47.6062, -122.3321`);
  const seattleResult = await getForecastForCoordinate(
    { latitude: 47.6062, longitude: -122.3321 },
    '2025-01-15'
  );
  console.log(`   Zone: ${seattleResult.zone.name}`);
  console.log(`   ⚠️  ${seattleResult.error}`);

  console.log('\n' + '='.repeat(60));
  console.log('✅ Demo complete!\n');
}

function getDangerRatingText(rating: number): string {
  const ratings: Record<number, string> = {
    '-1': 'No Rating',
    '0': 'No Rating',
    '1': 'Low (1)',
    '2': 'Moderate (2)',
    '3': 'Considerable (3)',
    '4': 'High (4)',
    '5': 'Extreme (5)',
  };
  return ratings[rating] || `Unknown (${rating})`;
}

// Run demo if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  demo().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Public API exports
export { getForecastForCoordinate, isValidCoordinate, isValidDate } from './forecast.js';
export { fetchNWACForecastForZone, buildForecastUrl } from './api/index.js';
export { getCache, createCache, LocalCacheStore, S3CacheStore } from './cache/index.js';

// Type exports
export type { Coordinate, ForecastResponse, ForecastProductResponse, ForecastProduct, NWACZone, DangerRating } from './types/index.js';
export type { CachedForecast, ForecastCache, CacheConfig } from './cache/types.js';

// Demo function for development/testing
export { demo };
