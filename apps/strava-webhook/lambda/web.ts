/**
 * Web UI Handler Lambda
 *
 * Serves simple landing page for user onboarding
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * Main Lambda handler
 */
export async function handler(_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Web UI handler invoked');

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Strava Avalanche Forecast Enrichment</title>
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

            .cta-button {
              display: inline-block;
              background: #fc4c02;
              color: white;
              padding: 15px 40px;
              border-radius: 8px;
              text-decoration: none;
              font-weight: 600;
              font-size: 1.1em;
              transition: transform 0.2s, box-shadow 0.2s;
              margin-top: 20px;
            }

            .cta-button:hover {
              transform: translateY(-2px);
              box-shadow: 0 10px 20px rgba(252, 76, 2, 0.3);
            }

            .strava-logo {
              width: 30px;
              height: 30px;
              vertical-align: middle;
              margin-right: 8px;
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
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
              color: #999;
              font-size: 0.85em;
            }

            .footer a {
              color: #667eea;
              text-decoration: none;
            }

            .footer a:hover {
              text-decoration: underline;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="emoji">🏔️⛷️</div>
            <h1>Strava Avalanche Forecast Enrichment</h1>
            <p class="subtitle">
              Automatically add NWAC avalanche forecasts to your backcountry ski activities
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

            <a href="connect" class="cta-button">
              Connect with Strava
            </a>

            <div class="footer">
              <p>Powered by <a href="https://nwac.us/" target="_blank" rel="noopener">NWAC (Northwest Avalanche Center)</a> data</p>
              <p>Open source project by <a href="https://mult.ifario.us/" target="_blank" rel="noopener">mult.ifario.us</a></p>
            </div>
          </div>
        </body>
      </html>
    `,
  };
}
