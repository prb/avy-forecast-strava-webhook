#!/usr/bin/env node
import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import { StravaWebhookStack } from '../lib/strava-webhook-stack.js';

const app = new cdk.App();

new StravaWebhookStack(app, 'StravaWebhookStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-west-2',
  },
  description: 'Strava webhook handler with NWAC avalanche forecast enrichment',
});

app.synth();
