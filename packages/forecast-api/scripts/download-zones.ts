import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZONES_DIR = path.join(__dirname, '../data/zones');
const ZONES_URL = 'https://api.avalanche.state.co.us/api/v2/zones.json';
const ZONE_MAP_URL = 'https://api.avalanche.state.co.us/api/v2/zones/map';

async function downloadCaicZones() {
    try {
        // CAIC's zone list (data/zones/tmp/ is no longer tracked, #55)
        const listResponse = await fetch(ZONES_URL);
        if (!listResponse.ok) {
            throw new Error(`Failed to fetch ${ZONES_URL}: ${listResponse.status}`);
        }
        const zones = await listResponse.json();

        // Filter for backcountry forecast zones
        // Based on inspection: type='backcountry_zone' and category='backcountry'
        const forecastZones = zones.filter((z: any) =>
            z.type === 'backcountry_zone' &&
            z.category === 'backcountry' &&
            z.id
        ).sort((a: any, b: any) => a.slug.localeCompare(b.slug)); // IDs below follow slug order

        console.log(`Found ${forecastZones.length} CAIC backcountry zones.`);

        const configEntries = [];
        // Start ID for CAIC (arbitrary base, UAC was 2000)
        let currentId = 3000;

        for (const zone of forecastZones) {
            console.log(`Downloading ${zone.title} (${zone.slug})...`);

            try {
                // Download by ID, not by the slug in geojson_url: slugs aren't
                // unique (Grand Mesa is also a highway zone), and the slug URL
                // for grand-mesa returns 404 (#41)
                const response = await fetch(`${ZONE_MAP_URL}/${zone.id}.geojson`);
                if (!response.ok) {
                    console.error(`Failed to fetch ${zone.slug}: ${response.status}`);
                    continue;
                }

                const geojson = await response.json();
                const filename = `CAIC-${zone.slug}.geojson`;
                const filePath = path.join(ZONES_DIR, filename);

                await fs.writeFile(filePath, JSON.stringify(geojson, null, 2));
                console.log(`Saved ${filename}`);

                configEntries.push({
                    id: currentId++,
                    zone_id: zone.slug,
                    name: zone.title,
                    filename: filename,
                    center_id: 'CAIC'
                });

            } catch (e) {
                console.error(`Error processing ${zone.slug}:`, e);
            }
        }

        console.log('\n--- CAIC Config Entries for config.ts ---');
        console.log(JSON.stringify(configEntries, null, 2));

    } catch (error) {
        console.error('Error in downloadCaicZones:', error);
    }
}

downloadCaicZones();
