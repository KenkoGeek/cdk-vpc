import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkVpcStack } from '../lib/cdk-vpc-stack';

const app = new cdk.App();


new CdkVpcStack(app, 'CdkVpcStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  envName: app.node.tryGetContext('envName') || 'dev',
  stackName: `vpc-stack-${app.node.tryGetContext('envName')}`,
  description: 'VPC with multiAZ configuration and best practices'
});
