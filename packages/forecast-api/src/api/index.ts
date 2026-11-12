/**
 * Avalanche.org API Client
 *
 * Provides functions to fetch avalanche forecasts from avalanche.org
 */

export {
  fetchProducts,
  fetchProduct,
  fetchForecastsForDate,
  fetchNWACForecastsForDate,
  fetchForecastForZone,
  buildForecastUrl,
  type ProductsQuery,
} from './client.js';
