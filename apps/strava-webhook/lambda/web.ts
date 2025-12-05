/**
 * Web UI Handler Lambda
 *
 * Serves simple landing page for user onboarding
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_LOGO = `<svg class="footer-logo" viewBox="0 0 432 100" xmlns="http://www.w3.org/2000/svg">
<path d="M113.8 55.8L95.2 13.5l-18.6 42.3h13.2l5.4-12.3 5.4 12.3h13.2zm21.6-33.9c-10.8 0-18.6 8.7-18.6 19.5s7.8 19.5 18.6 19.5c10.8 0 18.6-8.7 18.6-19.5s-7.8-19.5-18.6-19.5zm0 29.1c-5.4 0-9.3-4.2-9.3-9.6s3.9-9.6 9.3-9.6 9.3 4.2 9.3 9.6-3.9 9.6-9.3 9.6zm42.9-28.8c-3.6 0-6.9 1.5-9 4.2V23h-9v32.8h9v-17.4c0-4.5 2.7-7.2 6.6-7.2 3.9 0 6 2.7 6 7.2v17.4h9V36.9c0-9-5.4-14.7-12.6-14.7zm42 0c-3.6 0-6.9 1.5-9 4.2V23h-9v32.8h9v-17.4c0-4.5 2.7-7.2 6.6-7.2 3.9 0 6 2.7 6 7.2v17.4h9V36.9c0-9-5.4-14.7-12.6-14.7zm61.8 14.7c0-8.4-6.3-14.7-15-14.7s-15.3 6.6-15.3 14.7c0 8.1 6.6 14.7 15.3 14.7 6 0 11.1-2.7 13.5-7.5l-7.5-4.2c-1.2 2.1-3.3 3.6-6 3.6-3.6 0-6.6-2.4-7.2-5.7h22.2v-.9zm-22.2-3.6c.6-3.3 3.3-5.7 7.2-5.7s6.6 2.4 7.2 5.7h-14.4zM306 32.1c-3.9 0-7.2 1.8-9 4.8V23h-9v32.8h9v-17.1c0-4.8 3-7.8 7.5-7.8 1.5 0 3 .3 4.2.9V23c-.9-.6-1.8-.9-2.7-.9zm-273.9 0c-3.6 0-6.9 1.5-9 4.2V23h-9v32.8h9v-17.4c0-4.5 2.7-7.2 6.6-7.2 3.9 0 6 2.7 6 7.2v17.4h9V36.9c0-9-5.4-14.7-12.6-14.7zm51 5.1c-2.1-3.3-6-5.1-10.5-5.1-7.8 0-13.8 6.6-13.8 14.7s6 14.7 13.8 14.7c4.5 0 8.4-1.8 10.5-5.1v4.5h9V23.6h-9v13.6zm-1.5 9.6c0 4.8-3.3 8.1-7.8 8.1s-7.8-3.3-7.8-8.1 3.3-8.1 7.8-8.1 7.8 3.3 7.8 8.1zM348.9 23h-9v32.8h9V23zm0-11.4h-9V19h9v-7.4z"/>
</svg>`;

function getLogoSvg(): string {
  try {
    // In Lambda, __dirname is usually the task root or /var/task
    const assetPath = join(__dirname, 'assets', 'logo.svg');
    const content = readFileSync(assetPath, 'utf-8');
    // Ensure the class is added for styling if user didn't add it
    if (content.includes('<svg') && !content.includes('class="footer-logo"')) {
      return content.replace('<svg', '<svg class="footer-logo"');
    }
    return content;
  } catch (error) {
    console.warn('Could not load custom logo.svg, using default.', error);
    return DEFAULT_LOGO;
  }
}

/**
 * Main Lambda handler
 */
export async function handler(_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Web UI handler invoked');

  const logoSvg = getLogoSvg();

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Avy Forecast Webhook</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }

            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
            }

            .container {
              background: white;
              border-radius: 12px;
              box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
              max-width: 600px;
              padding: 40px;
              text-align: center;
            }

            h1 {
              color: #333;
              font-size: 2em;
              margin-bottom: 10px;
            }

            .emoji {
              font-size: 3em;
              margin: 20px 0;
            }

            .subtitle {
              color: #666;
              font-size: 1.1em;
              margin-bottom: 30px;
            }

            .feature-list {
              text-align: left;
              margin: 30px 0;
              padding: 0 20px;
            }

            .feature {
              margin: 15px 0;
              display: flex;
              align-items: flex-start;
            }

            .feature-icon {
              font-size: 1.5em;
              margin-right: 10px;
              flex-shrink: 0;
            }

            .feature-text {
              color: #555;
              line-height: 1.6;
            }

            .strava-connect-button {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              margin-top: 20px;
              padding: 12px 24px;
              background-color: #FC4C02;
              color: white;
              border-radius: 4px;
              text-decoration: none;
              font-weight: bold;
              font-size: 16px;
              transition: background-color 0.2s;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }

            .strava-connect-button:hover {
              background-color: #df4300;
              text-decoration: none;
            }

            .strava-connect-button svg {
              margin-right: 8px;
              fill: white;
              width: 20px;
              height: 20px;
            }

            .example {
              background: #f8f9fa;
              border-left: 4px solid #fc4c02;
              padding: 15px;
              margin: 20px 0;
              text-align: left;
              font-family: monospace;
              font-size: 0.9em;
              color: #333;
              line-height: 1.6;
            }

            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #eee;
              color: #999;
              font-size: 0.8em;
              text-align: center;
              line-height: 1.6;
            }

            .footer a {
              color: #999;
              text-decoration: none;
              transition: color 0.2s;
            }

            .footer a:hover {
              color: #667eea;
            }

            .footer-logo {
              height: 14px;
              width: auto;
              vertical-align: middle;
              fill: #999;
              transition: fill 0.2s;
              margin: 0 2px;
            }

            .footer a:hover .footer-logo {
              fill: #FC4C02;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="emoji">🏔️⛷️</div>
            <h1>Avy Forecast Webhook</h1>
            <p class="subtitle">
              Automatically add NWAC avalanche forecasts to your Strava backcountry ski activities
            </p>

            <div class="feature-list">
              <div class="feature">
                <span class="feature-icon">✅</span>
                <span class="feature-text">
                  <strong>Automatic enrichment</strong> - Every BackcountrySki activity gets forecast data
                </span>
              </div>
              <div class="feature">
                <span class="feature-icon">🗺️</span>
                <span class="feature-text">
                  <strong>Location-aware</strong> - Uses your activity's start point to find the right zone
                </span>
              </div>
              <div class="feature">
                <span class="feature-icon">📊</span>
                <span class="feature-text">
                  <strong>Danger ratings</strong> - Shows avalanche danger for all elevation bands
                </span>
              </div>
              <div class="feature">
                <span class="feature-icon">🔗</span>
                <span class="feature-text">
                  <strong>Direct links</strong> - Quick access to full NWAC forecast details
                </span>
              </div>
            </div>

            <div class="example">
              <strong>Example:</strong><br/>
              Original: "Great day on Mt Hood!"<br/><br/>
              Updated: "Great day on Mt Hood!<br/><br/>
              🏔️ NWAC Mt Hood Zone forecast<br/>
              Danger Rating: 3🟧/3🟧/2🟨<br/>
              https://nwac.us/avalanche-forecast/#/forecast/10/166378"
            </div>

            <a href="connect" class="strava-connect-button">
              <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M6.731 0 2 9.125h2.788L6.73 5.497l1.93 3.628h2.766zm4.694 9.125-1.372 2.756L8.66 9.125H6.547L10.053 16l3.484-6.875z"/>
              </svg>
              Connect with Strava
            </a>

            <div class="footer">
              <p>
                <a href="https://www.strava.com" target="_blank" rel="noopener" aria-label="Strava">
                  ${logoSvg}
                </a>
                &bull; Using <a href="https://nwac.us/" target="_blank" rel="noopener">NWAC</a> data
                &bull; Built by <a href="https://mult.ifario.us/" target="_blank" rel="noopener">mult.ifario.us</a>
              </p>
            </div>
          </div>
        </body>
      </html>
    `,
  };
}
