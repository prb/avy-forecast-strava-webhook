// @ts-ignore
import { handler as untypedHandler } from '../dist/lambda/web.mjs';
import fs from 'node:fs';
import path from 'node:path';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const handler = untypedHandler as (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

// Mock APIGatewayProxyEvent
const mockEvent = {} as APIGatewayProxyEvent;

async function generatePreview() {
    console.log('Generating landing page preview...');

    // The handler tries to read assets/logo.svg relative to __dirname.
    // When running with ts-node from this script, we need to ensure it finds the asset.
    // Since we can't easily change __dirname of the imported module, we might see the default logo
    // unless we run this against the built output or mock fs.
    // However, for a quick HTML structure check, this is fine.

    // To make it work perfectly locally, we'd need to point to the source asset.
    // Let's just run it and see.

    const result = await handler(mockEvent);

    if (result.statusCode === 200 && typeof result.body === 'string') {
        const outputPath = path.join(process.cwd(), 'landing-page-preview.html');
        fs.writeFileSync(outputPath, result.body);
        console.log(`Preview saved to: ${outputPath}`);
        console.log('Open this file in your browser to view the landing page.');
    } else {
        console.error('Failed to generate preview:', result);
    }
}

generatePreview();
