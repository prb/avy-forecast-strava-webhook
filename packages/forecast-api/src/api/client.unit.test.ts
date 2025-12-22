import { describe, it, expect, vi } from 'vitest';
import { fetchNWACForecastsForDate } from './client.js';
import * as apiBase from './api-base.js';

// We need to mock the external call to fetchProducts in api-base
vi.mock('./api-base.js', async () => {
    const actual = await vi.importActual('./api-base.js') as any;
    return {
        ...actual,
        fetchProducts: vi.fn()
    };
});

describe('fetchNWACForecastsForDate unit tests', () => {
    it('should filter products matching the date exactly', async () => {
        const mockProducts = [
            {
                id: 1,
                product_type: 'forecast',
                start_date: '2025-12-21T02:19:00+00:00',
                avalanche_center: { name: 'Northwest Avalanche Center' }
            },
            {
                id: 2,
                product_type: 'forecast',
                start_date: '2025-12-21',
                avalanche_center: { name: 'Northwest Avalanche Center' }
            },
            {
                id: 3,
                product_type: 'forecast',
                start_date: '2025-12-22T00:00:00Z',
                avalanche_center: { name: 'Northwest Avalanche Center' }
            },
            {
                id: 4,
                product_type: 'summary',
                start_date: '2025-12-21T10:00:00Z',
                avalanche_center: { name: 'Northwest Avalanche Center' }
            }
        ];

        (apiBase.fetchProducts as any).mockResolvedValue(mockProducts);

        const results = await fetchNWACForecastsForDate('2025-12-21');

        expect(results).toHaveLength(2);
        expect(results.map(r => r.id)).toContain(1);
        expect(results.map(r => r.id)).toContain(2);
        expect(results.map(r => r.id)).not.toContain(3);
        expect(results.map(r => r.id)).not.toContain(4);
    });
});
