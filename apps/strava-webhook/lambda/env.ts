/**
 * Environment variable access
 */

/**
 * Read a required environment variable, failing with a clear message if it is
 * missing or empty.
 *
 * The CDK stack sets the Strava secrets to '' when they're absent at deploy
 * time, so an empty value is treated as missing. This is read when the value is
 * used (not at module load) so an unrelated handler in the same bundle isn't
 * broken by it.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}
