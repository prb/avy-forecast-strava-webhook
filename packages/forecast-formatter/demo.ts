/**
 * Demo script to test forecast formatter
 *
 * This fetches a real forecast and formats it using the formatter
 */

import { formatForecast } from './src/index.js';
import type { ForecastProduct } from '@multifarious/forecast-api';

async function demo() {
  console.log('🏔️  Forecast Formatter Demo\n');

  // Fetch Mt. Hood forecast from April 9, 2025
  const productId = 166378;
  const url = `https://api.avalanche.org/v2/public/product/${productId}`;

  console.log(`Fetching forecast ${productId} from avalanche.org API...\n`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const product = (await response.json()) as ForecastProduct;

    console.log('Zone:', product.forecast_zone[0].name);
    console.log('Date:', product.published_time);
    console.log('Danger ratings:');
    if (product.danger) {
      for (const d of product.danger) {
        console.log(
          `  ${d.valid_day}: upper=${d.upper}, middle=${d.middle}, lower=${d.lower}`
        );
      }
    }
    console.log();

    // Format the forecast
    const formatted = formatForecast(product);
    console.log('Formatted output:');
    console.log(`  ${formatted}`);
    console.log();

    // Also show tomorrow's forecast
    if (product.danger && product.danger.length > 1) {
      const tomorrowFormatted = formatForecast(product, { day: 'tomorrow' });
      console.log('Tomorrow:');
      console.log(`  ${tomorrowFormatted}`);
      console.log();
    }

    // Show without NWAC prefix
    const withoutNWAC = formatForecast(product, { includeNWAC: false });
    console.log('Without NWAC prefix:');
    console.log(`  ${withoutNWAC}`);
    console.log();

    console.log('✅ Demo complete!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

demo();
