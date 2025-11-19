# AWS Lambda Deployment Options Comparison

## Overview

For a multi-user Strava webhook service, we need to consider:
- Lambda function deployment
- API Gateway setup
- Database for user tokens (DynamoDB)
- OAuth token storage strategy
- Infrastructure as Code (IaC)

## Strava Token Lifecycle (Important Context)

**Access Tokens:**
- Expire every **6 hours**
- Must be refreshed using refresh token

**Refresh Tokens:**
- **Never expire** (no documented expiration)
- **Single-use** - Each refresh gives you a new access token AND new refresh token
- Must always use the most recent refresh token

**Implication:** You need a database to store per-user tokens and update them on each refresh.

---

## Token Storage: SSM Parameter Store vs Secrets Manager

### AWS Systems Manager Parameter Store (Lower Cost ✅)

**Pricing:**
- Standard parameters: **FREE**
- Advanced parameters: $0.05 per parameter per month
- API calls: $0.05 per 10,000 API calls

**Pros:**
- ✅ Free for standard tier (up to 10,000 parameters)
- ✅ Simple key-value storage
- ✅ Built-in versioning
- ✅ Good for simple secrets
- ✅ Native AWS service, no additional setup

**Cons:**
- ❌ 4KB limit per parameter (standard tier)
- ❌ No automatic rotation
- ❌ Basic access control (IAM only)
- ❌ Not ideal for many users (1 parameter per user token pair)

**Multi-User Issue:**
- For 100 users: 100 parameters (still free)
- For 1000 users: 1000 parameters (still free, but management becomes complex)
- Querying all users' tokens = individual GetParameter calls (can get expensive)

### AWS Secrets Manager

**Pricing:**
- **$0.40 per secret per month**
- $0.05 per 10,000 API calls

**Pros:**
- ✅ Automatic rotation support
- ✅ Fine-grained access control
- ✅ Cross-account access
- ✅ Integration with RDS, etc.
- ✅ Larger size limit (64KB)

**Cons:**
- ❌ Expensive for many users ($0.40 × 100 users = $40/month!)
- ❌ Overkill for simple token storage
- ❌ Same multi-user management issue as SSM

### **Recommended for Multi-User: DynamoDB** 💡

**Pricing:**
- **FREE** for up to 25GB storage
- On-demand: $1.25 per million read requests, $1.25 per million write requests
- Provisioned: Free tier includes 25 read/25 write capacity units

**Schema:**
```
Table: strava_users
PK: user_id (athlete_id from Strava)
Attributes:
  - access_token (encrypted at rest)
  - refresh_token (encrypted at rest)
  - expires_at (timestamp)
  - created_at
  - updated_at
```

**Pros:**
- ✅ **FREE for typical usage** (likely <$1/month for 1000 users)
- ✅ Designed for this use case (key-value per user)
- ✅ Automatic encryption at rest
- ✅ Fast lookups by user_id
- ✅ Easy to query and update
- ✅ Scales infinitely
- ✅ Can add additional user metadata (email, settings, etc.)

**Cons:**
- ❌ Requires additional setup
- ❌ Need to implement encryption/decryption

**Cost Example (1000 active users):**
- Storage: <1GB = **$0**
- Reads: 1000 webhook events/day × 30 days = 30K reads = **$0.04**
- Writes: 1000 token refreshes/week × 4 = 4K writes = **$0.01**
- **Total: ~$0.05/month**

---

## Deployment Mechanisms Comparison

### 1. AWS SAM (Serverless Application Model)

**What it is:**
- AWS's official framework for serverless applications
- Extension of CloudFormation with simplified syntax
- CLI tool for local testing and deployment

**Example Structure:**
```yaml
# template.yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Resources:
  StravaWebhookFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: index.handler
      Runtime: nodejs20.x
      Events:
        WebhookApi:
          Type: Api
          Properties:
            Path: /webhook
            Method: ANY
      Environment:
        Variables:
          STRAVA_CLIENT_ID: !Ref StravaClientId
```

**Pros:**
- ✅ Official AWS tool - well maintained
- ✅ Excellent local testing (`sam local start-api`)
- ✅ Simplified CloudFormation syntax
- ✅ Built-in API Gateway and Lambda integration
- ✅ Good documentation
- ✅ Free (no additional cost)
- ✅ Native AWS - no third-party dependencies

**Cons:**
- ❌ Learning curve if new to CloudFormation
- ❌ YAML/JSON configuration (verbose for complex apps)
- ❌ Less flexible than pure CloudFormation
- ❌ Slower deployments than Serverless Framework

**Best for:**
- AWS-native projects
- Teams already using CloudFormation
- Applications that will stay on AWS

**Setup:**
```bash
npm install -g aws-sam-cli
sam init
sam build
sam local start-api  # Test locally
sam deploy --guided
```

---

### 2. Serverless Framework

**What it is:**
- Popular third-party framework for serverless apps
- Provider-agnostic (AWS, Azure, GCP, etc.)
- Large plugin ecosystem

**Example Structure:**
```yaml
# serverless.yml
service: strava-webhook

provider:
  name: aws
  runtime: nodejs20.x
  region: us-west-2

functions:
  webhook:
    handler: src/handler.webhook
    events:
      - http:
          path: webhook
          method: ANY

plugins:
  - serverless-offline  # Local testing
```

**Pros:**
- ✅ Very popular, huge community
- ✅ Simple, clean YAML syntax
- ✅ Excellent plugin ecosystem (offline testing, etc.)
- ✅ Provider-agnostic (can switch clouds)
- ✅ Fast deployments
- ✅ Great local development (serverless-offline plugin)
- ✅ Well-documented

**Cons:**
- ❌ Third-party dependency (not AWS-official)
- ❌ Can generate complex CloudFormation (harder to debug)
- ❌ Some plugins are abandoned
- ❌ Abstraction can hide AWS details

**Best for:**
- Fast prototyping
- Multi-cloud or cloud-agnostic projects
- Teams familiar with Serverless Framework

**Setup:**
```bash
npm install -g serverless
serverless create -t aws-nodejs-typescript
serverless offline  # Local testing
serverless deploy
```

---

### 3. AWS CDK (Cloud Development Kit)

**What it is:**
- Infrastructure as Code using programming languages (TypeScript, Python, etc.)
- Generates CloudFormation templates from code
- Object-oriented approach to infrastructure

**Example Structure:**
```typescript
// lib/strava-webhook-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

export class StravaWebhookStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string) {
    super(scope, id);

    const webhookFn = new lambda.Function(this, 'WebhookHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('dist'),
    });

    new apigateway.LambdaRestApi(this, 'WebhookApi', {
      handler: webhookFn,
    });
  }
}
```

**Pros:**
- ✅ **TypeScript** - type safety and IDE autocomplete
- ✅ Programmatic infrastructure (loops, conditionals, etc.)
- ✅ Official AWS tool
- ✅ Excellent for complex infrastructure
- ✅ Reusable constructs
- ✅ Great testing support
- ✅ Fits well with TypeScript monorepo

**Cons:**
- ❌ Steeper learning curve
- ❌ More boilerplate than Serverless
- ❌ Slower deployments (CloudFormation)
- ❌ Requires more setup

**Best for:**
- Complex applications
- Teams that prefer code over config
- TypeScript projects (like yours!)
- When you need programmatic infrastructure

**Setup:**
```bash
npm install -g aws-cdk
cdk init app --language typescript
cdk synth     # Generate CloudFormation
cdk deploy
```

---

### 4. Manual CloudFormation

**What it is:**
- Direct AWS infrastructure templates
- No abstraction layer

**Pros:**
- ✅ Complete control
- ✅ No dependencies
- ✅ Official AWS

**Cons:**
- ❌ Very verbose YAML/JSON
- ❌ No local testing tools
- ❌ Slow development cycle
- ❌ Easy to make mistakes

**Best for:**
- Simple, one-time deployments
- Learning CloudFormation
- Not recommended for this project

---

### 5. Manual Console (Not Recommended)

**What it is:**
- Creating resources via AWS web console

**Pros:**
- ✅ Visual interface
- ✅ No code needed

**Cons:**
- ❌ Not reproducible
- ❌ Hard to maintain
- ❌ No version control
- ❌ Error-prone
- ❌ Can't easily replicate to other environments

**Best for:**
- Quick experiments only
- **Never use for production**

---

## Recommendation Matrix

### For Your Project (Multi-User TypeScript Monorepo):

| Factor | AWS SAM | Serverless | CDK | Manual CF |
|--------|---------|------------|-----|-----------|
| TypeScript integration | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐ |
| Local testing | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐ |
| Learning curve | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| Deployment speed | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| AWS native | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Flexibility | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Monorepo fit | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| Cost | Free | Free | Free | Free |

### **My Recommendation: AWS CDK** 🏆

**Reasons:**
1. **TypeScript Native** - Perfect for your monorepo
2. **Type Safety** - Catch infrastructure errors at compile time
3. **Programmatic** - Easy to add DynamoDB, API Gateway, etc.
4. **Testable** - Unit test your infrastructure
5. **Reusable** - Create constructs for common patterns
6. **AWS Official** - Long-term support

**Alternative: Serverless Framework** (if you want faster iteration)

---

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AWS Account                              │
│                                                              │
│  ┌──────────────┐         ┌────────────────┐               │
│  │ API Gateway  │────────▶│ Lambda Function│               │
│  │              │         │ (Node.js 20)   │               │
│  │ /webhook     │         │                │               │
│  └──────────────┘         └────────┬───────┘               │
│                                    │                        │
│                                    │ Read/Write             │
│                                    ▼                        │
│                           ┌─────────────────┐               │
│                           │   DynamoDB      │               │
│                           │                 │               │
│                           │ Table: users    │               │
│                           │ PK: athlete_id  │               │
│                           │ - access_token  │               │
│                           │ - refresh_token │               │
│                           │ - expires_at    │               │
│                           └─────────────────┘               │
│                                                              │
│  ┌──────────────┐                                          │
│  │ Lambda Layer │ (Optional - for forecast packages)       │
│  │ - forecast-api                                          │
│  │ - forecast-formatter                                    │
│  └──────────────┘                                          │
└─────────────────────────────────────────────────────────────┘

External:
  - Strava API (OAuth + Activity API)
  - Avalanche.org API (Forecasts)
```

## Next Steps

1. **Choose deployment tool** (I recommend CDK)
2. **Set up DynamoDB table** for user tokens
3. **Implement OAuth flow** (separate from webhook)
   - Landing page for users to connect Strava
   - OAuth callback handler
   - Store tokens in DynamoDB
4. **Implement webhook handler**
5. **Deploy and test**

## Cost Estimate (1000 Users)

| Service | Cost/Month |
|---------|------------|
| Lambda (10K invocations) | $0.00 (free tier) |
| API Gateway (10K requests) | $0.04 |
| DynamoDB (reads/writes) | $0.05 |
| S3 Forecast Cache | $0.004 |
| **Total** | **~$0.10/month** |

**Note:** This assumes typical hobby/personal use. If each user creates 10 activities/month, that's 10K webhook events.

Would you like me to start setting up the CDK infrastructure, or would you prefer Serverless Framework for faster iteration?
