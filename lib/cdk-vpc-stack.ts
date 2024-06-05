import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

interface CdkVpcStackProps extends cdk.StackProps {
  envName: string;
}

export class CdkVpcStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CdkVpcStackProps) {
    super(scope, id, props);

    const environment = props.envName;

    // Load variables from cdk.json
    const config = this.node.tryGetContext(environment);

    // VPC
    const vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr(config.vpc_cidr_block),
      enableDnsHostnames: true,
      enableDnsSupport: true,
      maxAzs: config.az_count,
      natGateways: config.nat_gateway_count,
      subnetConfiguration: config.create_public_subnets ? [ // Conditional subnet creation
        {
          cidrMask: config.public_subnet_mask_bits,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          mapPublicIpOnLaunch: false,
        },
        ...Object.entries(config.subnet_layers).map(([layerName, cidrMask]) => ({
          cidrMask: parseInt(cidrMask as string, 10),
          name: layerName,
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
        })),
      ] : [
        ...Object.entries(config.subnet_layers).map(([layerName, cidrMask]) => ({
          cidrMask: parseInt(cidrMask as string, 10),
          name: layerName,
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
        })),
      ], 
    });

    let tgwAttachment: ec2.CfnTransitGatewayVpcAttachment | undefined;
    const lastLayerName = Object.keys(config.subnet_layers)[Object.keys(config.subnet_layers).length - 1]; // Find last layer
    const lastLayerSubnets = vpc.privateSubnets.filter(subnet => subnet.node.path.includes(lastLayerName)); // Select last layer subnets for TGW attachment
    const subnets = vpc.selectSubnets(); // Find all the created subnets

    if (config.use_transit_gateway) {
      if (lastLayerSubnets.length === 0) {
        throw new Error(`No subnets found for the last layer: ${lastLayerName}`);
      }

      tgwAttachment = new ec2.CfnTransitGatewayVpcAttachment(this, 'TgwAttachment', {
        transitGatewayId: config.transit_gateway_id,
        vpcId: vpc.vpcId,
        subnetIds: lastLayerSubnets.map(subnet => subnet.subnetId),  // Use lastLayerSubnets
      });
      tgwAttachment.node.addDependency(vpc);

      subnets.subnets.forEach((subnet, index) => { 
        const routeTable = subnet.routeTable;
        
        const internetRoute = new ec2.CfnRoute(this, `TransitGatewayRoute${index}`, { 
            routeTableId: routeTable.routeTableId,  
            destinationCidrBlock: '0.0.0.0/0',
            transitGatewayId: config.transit_gateway_id,
          });
          internetRoute.node.addDependency(tgwAttachment ?? this);

          if (config.additional_cidrs) {
            if (config.public_subnet_with_tgw_enabled) {
              for (const subnet of vpc.publicSubnets.concat(vpc.privateSubnets)) { 
                const routeTable = subnet.routeTable;
                for (const [cidrIndex, cidr] of config.additional_cidrs.entries()) { 
                  new ec2.CfnRoute(this, `AdditionalCidrRoute-${subnet.node.id}-${cidrIndex}`, {
                    routeTableId: routeTable.routeTableId,
                    destinationCidrBlock: cidr,  
                    transitGatewayId: config.transit_gateway_id,
                  }).node.addDependency(tgwAttachment ?? this); 
                }
              }
            } else {
              config.additional_cidrs.forEach((cidr: string, cidrIndex: number) => { 
                const additionalCidrRoute = new ec2.CfnRoute(this, `AdditionalCidrRoute${index}-${cidrIndex}`, {
                     routeTableId: routeTable.routeTableId,
                     destinationCidrBlock: cidr,  
                     transitGatewayId: config.transit_gateway_id,
                 });
                 additionalCidrRoute.node.addDependency(tgwAttachment ?? this); 
             });
            }
          }
      });
    }

    // Prettier names for VPC and Subnets
    cdk.Tags.of(vpc).add("Name", `vpc-${config.project_name}-${environment}`);

    vpc.publicSubnets.forEach((subnet) => {
      const azIdentifier = subnet.availabilityZone.split('-').pop();
      cdk.Tags.of(subnet).add("Name", `public-${config.project_name}-${environment}-${azIdentifier}`);
    });
    
    vpc.privateSubnets.forEach((subnet) => {
      const layerName = Object.keys(config.subnet_layers).find(
        (layer) => subnet.node.id.includes(layer)
      );
      const azIdentifier = subnet.availabilityZone.split('-').pop();
      if (layerName) {
        cdk.Tags.of(subnet).add(
          "Name",
          `private-${config.project_name}-${environment}-${layerName}-${azIdentifier}`
        );
      } else {
        console.warn(
          `Unable to determine layer name for private subnet with ID: ${subnet.node.id}`
        );
      }
    });

    // VPC Endpoints
    if (config.s3_vpc_endpoint_enabled) {
      new ec2.GatewayVpcEndpoint(this, 'S3VpcEndpoint', {
        vpc, service: ec2.GatewayVpcEndpointAwsService.S3
      }).node.addDependency(vpc);
    }
    if (config.dynamodb_vpc_endpoint_enabled) {
      new ec2.GatewayVpcEndpoint(this, 'DynamoDbVpcEndpoint', {
        vpc, service: ec2.GatewayVpcEndpointAwsService.DYNAMODB, 
      }).node.addDependency(vpc);
    }
    
    if (config.session_manager_vpc_endpoints_enabled) {
      const vpcEndpointSecurityGroup = new ec2.SecurityGroup(this, 'VpcEndpointSecurityGroup', {
        vpc,
        description: 'Security group for VPC endpoints',
        allowAllOutbound: false,
        securityGroupName: `vpc-endpoints-${config.project_name}-${environment}-sg`
      });

      vpcEndpointSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(vpc.vpcCidrBlock),
        ec2.Port.tcp(443),
        'Allow inbound HTTPS from VPC'
      );

      vpcEndpointSecurityGroup.addEgressRule(
        ec2.Peer.ipv4(vpc.vpcCidrBlock),
        ec2.Port.tcp(443),
        'Allow outbound HTTPS to VPC'
      );

      new ec2.InterfaceVpcEndpoint(this, 'SsmEndpoint', {
        vpc,
        service: ec2.InterfaceVpcEndpointAwsService.SSM,
        securityGroups: [vpcEndpointSecurityGroup],
        privateDnsEnabled: true,
        subnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        }
      });
      
      new ec2.InterfaceVpcEndpoint(this, 'SsmMessagesEndpoint', {
        vpc,
        service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
        securityGroups: [vpcEndpointSecurityGroup],
        privateDnsEnabled: true,
        subnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        }
      });
      
      new ec2.InterfaceVpcEndpoint(this, 'Ec2Endpoint', {
        vpc,
        service: ec2.InterfaceVpcEndpointAwsService.EC2,
        securityGroups: [vpcEndpointSecurityGroup],
        privateDnsEnabled: true,
        subnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        }
      });
    }

    // Flow Logs
    const flowLogRole = new iam.Role(this, 'FlowLogsRole', {
      assumedBy: new iam.ServicePrincipal('logs.amazonaws.com'),
    });

    let flowLogKey: kms.IKey;

    if (config.encryption_key) {
      flowLogKey = kms.Key.fromKeyArn(this, 'FlowLogsEncryptionKey', config.encryption_key);
    } else {
      flowLogKey = new kms.Key(this, 'FlowLogsEncryptionKey', {
        enableKeyRotation: true,
        description: 'Used for cloudwatch logs encryption key',
        alias: 'Logs',
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        policy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                "kms:Encrypt*",
                "kms:Decrypt*",
                "kms:ReEncrypt*",
                "kms:GenerateDataKey*",
                "kms:Describe*"
              ],
              resources: ['*'],
              principals: [new iam.ServicePrincipal('logs.amazonaws.com')]
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["kms:*"],
              resources: ['*'],
              principals: [new iam.AccountPrincipal(this.account)]
            })
          ]
        })
      });
    }

    const flowLogLogGroup = new logs.LogGroup(this, 'FlowLogsLogGroup', {
      retention: logs.RetentionDays.ONE_YEAR,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      logGroupName: `/vpc/flowlogs/${config.project_name}-${environment}`,
      encryptionKey: flowLogKey
    });
    
    new ec2.FlowLog(this, 'FlowLogs', {
      resourceType: ec2.FlowLogResourceType.fromVpc(vpc),
      destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogLogGroup, flowLogRole),
      trafficType: ec2.FlowLogTrafficType.ALL
    }).node.addDependency(vpc);

    // Tags
    const tags = config.tags;
    for (const [key, value] of Object.entries(tags)) {
      cdk.Tags.of(this).add(key, value as string);
    }

    // Outputs
    new cdk.CfnOutput(this, "VPCId", {
      description: "VPC ID",
      value: vpc.vpcId,
      exportName: `${this.stackName}-VPCId`
    });

    new cdk.CfnOutput(this, "VPCCidr", {
      description: "VPC CIDR",
      value: vpc.vpcCidrBlock,
      exportName: `${this.stackName}-VPCCidr`
    });
  }
}
