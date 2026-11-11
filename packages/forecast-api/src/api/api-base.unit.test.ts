import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchProduct, fetchProducts } from './api-base.js';

describe('api-base unit tests', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    describe('fetchProduct', () => {
        it('should return product when valid product is returned', async () => {
            const mockProduct = {
                id: 12345,
                product_type: 'forecast',
                published_time: '2025-01-15T00:00:00Z',
                avalanche_center: { name: 'NWAC' },
            };

            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => mockProduct,
            } as Response);

            const result = await fetchProduct(12345);
            expect(result).toEqual(mockProduct);
            expect(globalThis.fetch).toHaveBeenCalledWith(
                'https://api.avalanche.org/v2/public/product/12345'
            );
        });

        it('should throw error when upstream returns HTTP 200 with empty skeleton / null fields', async () => {
            const emptySkeleton = {
                avalanche_center: null,
                media: null,
                weather_data: null,
                published_time: null,
                expires_time: null,
                created_at: null,
                updated_at: null,
                forecast_avalanche_problems: [],
                danger: [],
                forecast_zone: [],
            };

            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => emptySkeleton,
            } as Response);

            await expect(fetchProduct(999999999)).rejects.toThrow(
                'Failed to fetch product 999999999: Product 999999999 not found'
            );
        });

        it('should throw error when HTTP request fails with non-200 status', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            } as Response);

            await expect(fetchProduct(12345)).rejects.toThrow(
                'Failed to fetch product 12345: API request failed: 404 Not Found'
            );
        });

        it('should rethrow network errors', async () => {
            globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

            await expect(fetchProduct(12345)).rejects.toThrow(
                'Failed to fetch product 12345: Network error'
            );
        });
    });

    describe('fetchProducts', () => {
        it('should return products array when valid array is returned', async () => {
            const mockList = [{ id: 1, product_type: 'forecast' }];

            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => mockList,
            } as Response);

            const results = await fetchProducts({
                avalanche_center_id: 'NWAC',
                date_start: '2025-01-01',
                date_end: '2025-01-02',
            });

            expect(results).toEqual(mockList);
        });

        it('should throw error when response is not an array', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ error: 'bad request' }),
            } as Response);

            await expect(
                fetchProducts({
                    avalanche_center_id: 'NWAC',
                    date_start: '2025-01-01',
                    date_end: '2025-01-02',
                })
            ).rejects.toThrow('API response is not an array');
        });
    });
});
