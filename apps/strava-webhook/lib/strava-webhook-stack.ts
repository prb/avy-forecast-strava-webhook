import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export class StravaWebhookStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ============================================
    // DynamoDB Table for User Tokens
    // ============================================
    const usersTable = new dynamodb.Table(this, 'StravaUsersTable', {
      partitionKey: {
        name: 'athlete_id',
        type: dynamodb.AttributeType.NUMBER,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-demand pricing
      encryption: dynamodb.TableEncryption.AWS_MANAGED, // Encrypt at rest
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Don't delete table on stack deletion
      pointInTimeRecovery: true, // Enable backups
      tableName: 'strava-avy-users',
    });

    // ============================================
    // Environment Variables for All Lambdas
    // ============================================
    const commonEnvironment = {
      TABLE_NAME: usersTable.tableName,
      STRAVA_CLIENT_ID: process.env.STRAVA_CLIENT_ID || '',
      STRAVA_CLIENT_SECRET: process.env.STRAVA_CLIENT_SECRET || '',
      STRAVA_VERIFY_TOKEN: process.env.STRAVA_VERIFY_TOKEN || '',
      // OAuth redirect URI will be constructed from request headers in the Lambda
    };

    // ============================================
    // Lambda Function: Webhook Handler
    // ============================================
    const webhookFunction = new lambda.Function(this, 'WebhookHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'webhook.handler',
      code: lambda.Code.fromAsset('dist/lambda'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnvironment,
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: 'Handles Strava webhook events for activity creation',
    });

    // Grant DynamoDB permissions
    usersTable.grantReadWriteData(webhookFunction);

    // ============================================
    // Lambda Function: OAuth Flow
    // ============================================
    const oauthFunction = new lambda.Function(this, 'OAuthHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
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

    // ============================================
    // Lambda Function: Web UI
    // ============================================
    const webFunction = new lambda.Function(this, 'WebHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
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

    // Webhook: GET/POST /webhook - Strava webhook endpoint
    const webhook = api.root.addResource('webhook');
    webhook.addMethod('GET', new apigateway.LambdaIntegration(webhookFunction), {
      // Webhook verification
      requestParameters: {
        'method.request.querystring.hub.mode': true,
        'method.request.querystring.hub.challenge': true,
        'method.request.querystring.hub.verify_token': true,
      },
    });
    webhook.addMethod('POST', new apigateway.LambdaIntegration(webhookFunction));

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
  }
}
