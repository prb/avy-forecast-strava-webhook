/**
 * Structured JSON logger shared by all Lambdas
 *
 * Each line is a single JSON object: `{ level, event, ...data }`. CloudWatch
 * Logs Insights queries and the processor's error metric filter
 * (`$.level = "ERROR"`) depend on this shape.
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
    console.log(JSON.stringify({ level: 'INFO', event, ...data }));
  },

  warn(event: string, data: LogData = {}): void {
    console.warn(JSON.stringify({ level: 'WARN', event, ...data }));
  },

  error(event: string, error: unknown, data: LogData = {}): void {
    console.error(JSON.stringify({ level: 'ERROR', event, ...errorFields(error), ...data }));
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
