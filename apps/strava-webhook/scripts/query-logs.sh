#!/bin/bash
set -e

# CloudWatch Logs Insights Query Runner
# Usage: ./scripts/query-logs.sh <query-name> [days-back]

QUERY_NAME="${1:-MonthlyActiveUsers}"
DAYS_BACK="${2:-7}"
REGION="us-west-2"

# Get the processor log group name from CDK output
LOG_GROUP=$(aws logs describe-log-groups --region $REGION --log-group-name-prefix "/aws/lambda/StravaWebhookStack-ProcessorHandler" --query 'logGroups[0].logGroupName' --output text)

if [ "$LOG_GROUP" == "None" ]; then
  echo "Error: Could not find ProcessorHandler log group"
  exit 1
fi

echo "Log Group: $LOG_GROUP"
echo "Query: StravaWebhook/$QUERY_NAME"
echo "Time Range: Last $DAYS_BACK days"
echo ""

# Get query definition
QUERY_DEF=$(aws logs describe-query-definitions --region $REGION --query-definition-name-prefix "StravaWebhook/$QUERY_NAME" --query 'queryDefinitions[0]')

if [ "$QUERY_DEF" == "null" ]; then
  echo "Error: Query 'StravaWebhook/$QUERY_NAME' not found"
  echo ""
  echo "Available queries:"
  aws logs describe-query-definitions --region $REGION --query-definition-name-prefix "StravaWebhook" --query 'queryDefinitions[].name' --output table
  exit 1
fi

QUERY_STRING=$(echo $QUERY_DEF | jq -r '.queryString')

# Calculate time range (last N days)
END_TIME=$(date -u +%s)
START_TIME=$(date -u -v-${DAYS_BACK}d +%s)

# Start the query
echo "Starting query..."
QUERY_ID=$(aws logs start-query \
  --log-group-name "$LOG_GROUP" \
  --start-time $START_TIME \
  --end-time $END_TIME \
  --query-string "$QUERY_STRING" \
  --region $REGION \
  --query 'queryId' \
  --output text)

echo "Query ID: $QUERY_ID"
echo "Waiting for results..."

# Poll for results
for i in {1..10}; do
  sleep 2
  STATUS=$(aws logs get-query-results --query-id $QUERY_ID --region $REGION --query 'status' --output text)
  
  if [ "$STATUS" == "Complete" ]; then
    echo ""
    echo "Results:"
    aws logs get-query-results --query-id $QUERY_ID --region $REGION --query 'results' --output table
    
    echo ""
    echo "Statistics:"
    aws logs get-query-results --query-id $QUERY_ID --region $REGION --query 'statistics' --output table
    exit 0
  fi
  
  if [ "$STATUS" == "Failed" ]; then
    echo "Query failed!"
    aws logs get-query-results --query-id $QUERY_ID --region $REGION
    exit 1
  fi
  
  echo "Status: $STATUS (attempt $i/10)"
done

echo "Query timed out"
exit 1
