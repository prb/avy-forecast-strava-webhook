import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';

export class StravaWebhookStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ============================================
    // DynamoDB Table for User Tokens
    // ============================================
    const environment = this.node.tryGetContext('environment') || 'dev';
    const isProd = environment === 'prod';
    const removalPolicy = isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    console.log(`Environment: ${environment}, Removal Policy: ${isProd ? 'RETAIN' : 'DESTROY'}`);

    const usersTable = new dynamodb.Table(this, 'StravaUsersTable', {
      partitionKey: {
        name: 'athlete_id',
        type: dynamodb.AttributeType.NUMBER,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-demand pricing
      encryption: dynamodb.TableEncryption.AWS_MANAGED, // Encrypt at rest
      removalPolicy: removalPolicy,
      pointInTimeRecovery: true, // Enable backups
      tableName: 'strava-avy-users',
    });

    // ============================================
    // DynamoDB Table for OAuth State Tokens (CSRF protection)
    // ============================================
    const oauthStateTable = new dynamodb.Table(this, 'OAuthStateTable', {
      partitionKey: {
        name: 'state',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-demand pricing
      encryption: dynamodb.TableEncryption.AWS_MANAGED, // Encrypt at rest
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Safe to delete - states are ephemeral
      timeToLiveAttribute: 'ttl', // Automatically delete expired states
      tableName: 'strava-avy-oauth-states',
    });

    // ============================================
    // SQS Queue for Webhook Events
    // ============================================
    const webhookQueue = new sqs.Queue(this, 'StravaWebhookQueue', {
      visibilityTimeout: cdk.Duration.seconds(60), // Give Lambda 60s to process
      retentionPeriod: cdk.Duration.days(4), // Keep messages for 4 days
    });

    // ============================================
    // Environment Variables for All Lambdas
    // ============================================
    const commonEnvironment = {
      TABLE_NAME: usersTable.tableName,
      STATE_TABLE_NAME: oauthStateTable.tableName,
      STRAVA_CLIENT_ID: process.env.STRAVA_CLIENT_ID || '',
      STRAVA_CLIENT_SECRET: process.env.STRAVA_CLIENT_SECRET || '',
      STRAVA_VERIFY_TOKEN: process.env.STRAVA_VERIFY_TOKEN || '',
      QUEUE_URL: webhookQueue.queueUrl,
    };

    // ============================================
    // Lambda Function: Ingest Handler (API Gateway -> SQS)
    // ============================================
    const ingestFunction = new lambda.Function(this, 'IngestHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'ingest.handler',
      code: lambda.Code.fromAsset('dist/lambda'),
      timeout: cdk.Duration.seconds(3), // Fast response required
      memorySize: 128,
      environment: commonEnvironment,
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: 'Ingests Strava webhook events and pushes to SQS',
    });

    // Grant SQS permissions
    webhookQueue.grantSendMessages(ingestFunction);

    // ============================================
    // Lambda Function: Processor Handler (SQS -> Logic)
    // ============================================
    const processorFunction = new lambda.Function(this, 'ProcessorHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'processor.handler',
      code: lambda.Code.fromAsset('dist/lambda'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnvironment,
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: 'Processes Strava webhook events from SQS',
    });

    // Grant DynamoDB permissions
    usersTable.grantReadWriteData(processorFunction);

    // Add SQS Event Source
    processorFunction.addEventSource(new lambdaEventSources.SqsEventSource(webhookQueue, {
      batchSize: 1, // Process one at a time for simplicity
    }));

    // ============================================
    // Lambda Function: OAuth Flow
    // ============================================
    const oauthFunction = new lambda.Function(this, 'OAuthHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'oauth.handler',
      code: lambda.Code.fromAsset('dist/lambda'),
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: commonEnvironment,
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: 'Handles Strava OAuth authorization flow',
    });

    // Grant DynamoDB permissions
    usersTable.grantReadWriteData(oauthFunction);
    oauthStateTable.grantReadWriteData(oauthFunction);

    // ============================================
    // Lambda Function: Web UI
    // ============================================
    const webFunction = new lambda.Function(this, 'WebHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'web.handler',
      code: lambda.Code.fromAsset('dist/lambda'),
      timeout: cdk.Duration.seconds(5),
      memorySize: 128,
      environment: commonEnvironment,
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: 'Serves simple web UI for user onboarding',
    });

    // ============================================
    // API Gateway REST API
    // ============================================
    const api = new apigateway.RestApi(this, 'StravaWebhookApi', {
      restApiName: 'Strava Avalanche Forecast Service',
      description: 'API for Strava webhook and OAuth flow',
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apigateway.MethodLoggingLevel.OFF, // Disable logging to avoid CloudWatch role requirement
        metricsEnabled: true,
      },
      cloudWatchRole: false, // Don't create CloudWatch role
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // ============================================
    // API Routes
    // ============================================

    // Root: GET / - Web UI landing page
    const root = api.root;
    root.addMethod('GET', new apigateway.LambdaIntegration(webFunction));

    // Webhook: GET/POST /webhook - Strava webhook endpoint (Points to Ingest)
    const webhook = api.root.addResource('webhook');
    webhook.addMethod('GET', new apigateway.LambdaIntegration(ingestFunction), {
      // Webhook verification
      requestParameters: {
        'method.request.querystring.hub.mode': true,
        'method.request.querystring.hub.challenge': true,
        'method.request.querystring.hub.verify_token': true,
      },
    });
    webhook.addMethod('POST', new apigateway.LambdaIntegration(ingestFunction));

    // OAuth: GET /connect - Start OAuth flow (redirect to Strava)
    const connect = api.root.addResource('connect');
    connect.addMethod('GET', new apigateway.LambdaIntegration(oauthFunction));

    // OAuth: GET /callback - OAuth callback from Strava
    const callback = api.root.addResource('callback');
    callback.addMethod('GET', new apigateway.LambdaIntegration(oauthFunction), {
      requestParameters: {
        'method.request.querystring.code': true,
        'method.request.querystring.scope': false,
        'method.request.querystring.state': false,
      },
    });

    // ============================================
    // Outputs
    // ============================================
    const callbackUrl = `${api.url}callback`;
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'WebhookUrl', {
      value: `${api.url}webhook`,
      description: 'Strava Webhook Endpoint URL (register this with Strava)',
    });

    new cdk.CfnOutput(this, 'ConnectUrl', {
      value: `${api.url}connect`,
      description: 'OAuth Connect URL (users visit this to authorize)',
    });

    new cdk.CfnOutput(this, 'CallbackUrl', {
      value: callbackUrl,
      description: 'OAuth Callback URL (configure in Strava app settings)',
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: usersTable.tableName,
      description: 'DynamoDB table name for user tokens',
    });

    // ============================================
    // Observability: Alarms & Insights
    // ============================================

    // 1. SNS Topic for Alerts
    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      displayName: 'Strava Webhook Alerts',
    });

    // Add email subscription
    const alertEmail = `avywebhook-${environment}@mult.ifario.us`;
    alarmTopic.addSubscription(new subs.EmailSubscription(alertEmail));

    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: alarmTopic.topicArn,
      description: 'SNS Topic for critical alerts',
    });

    new cdk.CfnOutput(this, 'AlertEmail', {
      value: alertEmail,
      description: 'Email address subscribed to alerts',
    });

    // 2. Metric Filter for Errors
    // Counts log events with { $.level = "ERROR" }
    const errorMetricFilter = processorFunction.logGroup.addMetricFilter('ErrorCountFilter', {
      metricNamespace: 'StravaWebhook',
      metricName: 'ProcessingErrors',
      filterPattern: logs.FilterPattern.stringValue('$.level', '=', 'ERROR'),
      metricValue: '1',
    });

    // 3. CloudWatch Alarm
    // Trigger if >= 1 error in 5 minutes
    const errorAlarm = new cloudwatch.Alarm(this, 'ProcessingErrorAlarm', {
      metric: errorMetricFilter.metric({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription: 'Alerts when the Processor Lambda logs an error',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    errorAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(alarmTopic));

    // 4. CloudWatch Logs Insights Saved Queries
    // Monthly Active Users
    new logs.CfnQueryDefinition(this, 'QueryMAU', {
      name: 'StravaWebhook/MonthlyActiveUsers',
      queryString: `fields athleteId
| filter event = "ActivityProcessed"
| stats count_distinct(athleteId) as UniqueAthletes by bin(1d)`,
      logGroupNames: [processorFunction.logGroup.logGroupName],
    });

    // Total Processed
    new logs.CfnQueryDefinition(this, 'QueryTotalProcessed', {
      name: 'StravaWebhook/TotalProcessed',
      queryString: `fields @timestamp, athleteId, activityId
| filter event = "ActivityProcessed"
| sort @timestamp desc`,
      logGroupNames: [processorFunction.logGroup.logGroupName],
    });

    // Forecast Failures
    new logs.CfnQueryDefinition(this, 'QueryFailures', {
      name: 'StravaWebhook/ForecastFailures',
      queryString: `fields @timestamp, error, athleteId
| filter level = "ERROR"
| sort @timestamp desc`,
      logGroupNames: [processorFunction.logGroup.logGroupName],
    });
  }
}
