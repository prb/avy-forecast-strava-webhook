/**
 * Structured JSON logger shared by all Lambdas
 *
 * Each line is a single JSON object: `{ level, event, ...data }`. CloudWatch
 * Logs Insights queries and the processor's error metric filter
 * (`$.level = "ERROR"`) depend on this shape, so `data` can't override
 * `level`, `event`, or (for `error`) the `error`/`stack` fields.
 *
 * Convention: helper modules that log and then rethrow use `warn`; the handler
 * that finally handles the failure logs `error`, so each failure counts once
 * towards the error alarm.
 */

type LogData = Record<string, unknown>;

function errorFields(error: unknown): LogData {
  return {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
}

export const logger = {
  info(event: string, data: LogData = {}): void {
    console.log(JSON.stringify({ ...data, level: 'INFO', event }));
  },

  warn(event: string, data: LogData = {}): void {
    console.warn(JSON.stringify({ ...data, level: 'WARN', event }));
  },

  error(event: string, error: unknown, data: LogData = {}): void {
    console.error(JSON.stringify({ ...data, level: 'ERROR', event, ...errorFields(error) }));
  },
};

/**
 * Request fields that are safe and useful to log (no headers, body or query
 * string, which can carry tokens, codes and personal data)
 */
export function requestSummary(event: {
  httpMethod?: string;
  path?: string;
  resource?: string;
  requestContext?: { requestId?: string };
}): LogData {
  return {
    method: event.httpMethod,
    path: event.path ?? event.resource,
    requestId: event.requestContext?.requestId,
  };
}
