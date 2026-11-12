import { describe, it, expect, vi } from 'vitest';
import { fetchNWACForecastsForDate, fetchForecastForZone } from './client.js';
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

describe('fetchForecastForZone unit tests', () => {
    const forecastFor = (id: number, zone: { id: number; zone_id: string; name: string }) => ({
        id,
        product_type: 'forecast',
        start_date: '2026-02-16T02:00:00+00:00',
        avalanche_center: { name: 'Northwest Avalanche Center' },
        forecast_zone: [{ ...zone, url: '', config: null }],
    });

    it('matches on the stable zone_id slug, not the numeric avalanche.org ID (#51)', async () => {
        // 2025-26 season numbering: Stevens Pass is id 3024, zone_id '2'
        (apiBase.fetchProducts as any).mockResolvedValue([
            forecastFor(100, { id: 3020, zone_id: '1', name: 'Olympics' }),
            forecastFor(101, { id: 3024, zone_id: '2', name: 'Stevens Pass' }),
        ]);

        const forecast = await fetchForecastForZone('NWAC', '2', '2026-02-16');

        expect(forecast?.id).toBe(101);
    });

    it('queries the requested avalanche center', async () => {
        (apiBase.fetchProducts as any).mockResolvedValue([]);

        await fetchForecastForZone('UAC', 'salt-lake', '2026-02-16');

        expect(apiBase.fetchProducts).toHaveBeenCalledWith(
            expect.objectContaining({ avalanche_center_id: 'UAC' })
        );
    });

    it('returns null when no product covers the zone', async () => {
        (apiBase.fetchProducts as any).mockResolvedValue([
            forecastFor(100, { id: 3020, zone_id: '1', name: 'Olympics' }),
        ]);

        expect(await fetchForecastForZone('NWAC', '2', '2026-02-16')).toBeNull();
    });
});
