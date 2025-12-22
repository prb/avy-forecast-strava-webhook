import type { ForecastProduct } from '../types/index.js';

const API_BASE_URL = 'https://api.avalanche.org/v2/public';

/**
 * Query parameters for products endpoint
 */
export interface ProductsQuery {
    /** Avalanche center ID (e.g., "NWAC") */
    avalanche_center_id: string;
    /** Start date (ISO format: YYYY-MM-DD) */
    date_start: string;
    /** End date (ISO format: YYYY-MM-DD) */
    date_end: string;
}

/**
 * Fetch products from avalanche.org API
 *
 * @param query Query parameters
 * @returns Array of forecast products
 */
export async function fetchProducts(query: ProductsQuery): Promise<ForecastProduct[]> {
    const params = new URLSearchParams({
        avalanche_center_id: query.avalanche_center_id,
        date_start: query.date_start,
        date_end: query.date_end,
    });

    const url = `${API_BASE_URL}/products?${params}`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error('API response is not an array');
        }

        return data as ForecastProduct[];
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Failed to fetch products: ${error.message}`);
        }
        throw error;
    }
}

/**
 * Fetch a single product by ID
 *
 * @param productId Product ID
 * @returns Forecast product
 */
export async function fetchProduct(productId: number): Promise<ForecastProduct> {
    const url = `${API_BASE_URL}/product/${productId}`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data as ForecastProduct;
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Failed to fetch product ${productId}: ${error.message}`);
        }
        throw error;
    }
}
