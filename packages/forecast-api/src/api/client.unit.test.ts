import { describe, it, expect, vi } from 'vitest';
import { fetchNWACForecastsForDate, fetchForecastForZone, buildForecastUrl } from './client.js';
import type { ForecastProduct } from '../types/index.js';
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

describe('buildForecastUrl unit tests', () => {
    const product = (
        zone: { zone_id: string; name: string; url: string },
        overrides: Partial<ForecastProduct> = {}
    ): ForecastProduct => ({
        id: 180554,
        product_type: 'forecast',
        published_time: '2026-02-16T02:00:00+00:00',
        start_date: '2026-02-16T02:00:00+00:00',
        end_date: '2026-02-17T02:00:00+00:00',
        expires_time: '2026-02-17T02:00:00+00:00',
        danger_rating: 2,
        bottom_line: null,
        hazard_discussion: null,
        weather_discussion: null,
        status: 'published',
        author: 'Test',
        avalanche_center: { name: 'Test Center', url: 'https://example.org' },
        forecast_zone: [{ id: 3027, config: null, ...zone }],
        ...overrides,
    });

    it('links NWAC forecasts to the zone page with the forecast hash route', () => {
        const url = buildForecastUrl(product({
            zone_id: '3',
            name: 'Snoqualmie Pass',
            url: 'https://nwac.us/forecasts/avalanche/snoqualmie-pass',
        }));
        expect(url).toBe('https://nwac.us/forecasts/avalanche/snoqualmie-pass#/forecast/3/180554');
    });

    it('builds the NWAC zone page from the zone name when the zone URL is old or missing', () => {
        for (const zoneUrl of ['http://www.nwac.us/avalanche-forecast/#/mt-hood', '']) {
            const url = buildForecastUrl(product({ zone_id: '10', name: 'Mt Hood', url: zoneUrl }));
            expect(url).toBe('https://nwac.us/forecasts/avalanche/mt-hood#/forecast/10/180554');
        }
    });

    it('links UAC forecasts to the dated forecast page for the forecast day', () => {
        const url = buildForecastUrl(product(
            { zone_id: 'salt-lake', name: 'Salt Lake', url: 'https://utahavalanchecenter.org/forecast/salt-lake' },
            { start_date: '2026-02-16T14:16:00+00:00' }
        ), 'UAC');
        expect(url).toBe('https://utahavalanchecenter.org/forecast/salt-lake/2/16/2026');
    });

    it('falls back to the center home page when a zone has no URL', () => {
        const url = buildForecastUrl(product({ zone_id: 'aspen', name: 'Aspen', url: '' }), 'CAIC');
        expect(url).toBe('https://example.org');
    });
});
