import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, '../data/zones/tmp');
const ZONES_DIR = path.join(__dirname, '../data/zones');

async function downloadCaicZones() {
    const caicFile = path.join(TMP_DIR, 'CAIC-zones.json');

    try {
        const content = await fs.readFile(caicFile, 'utf-8');
        const zones = JSON.parse(content);

        // Filter for backcountry forecast zones
        // Based on inspection: type='backcountry_zone' and category='backcountry'
        const forecastZones = zones.filter((z: any) =>
            z.type === 'backcountry_zone' &&
            z.category === 'backcountry' &&
            z.geojson_url
        );

        console.log(`Found ${forecastZones.length} CAIC backcountry zones.`);

        const configEntries = [];
        // Start ID for CAIC (arbitrary base, UAC was 2000)
        let currentId = 3000;

        for (const zone of forecastZones) {
            console.log(`Downloading ${zone.title} (${zone.slug})...`);

            try {
                const response = await fetch(zone.geojson_url);
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
