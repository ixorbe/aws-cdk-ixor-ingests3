#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { AwsCdkIxorIngests3Stack } from '../lib/aws-cdk-ixor-ingests3-stack';

const app = new cdk.App();
new AwsCdkIxorIngests3Stack(app, 'AwsCdkIxorIngests3Stack');
