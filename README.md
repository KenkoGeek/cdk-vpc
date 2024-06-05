## AWS CDK VPC Constructor

This AWS Cloud Development Kit (CDK) construct provides a flexible and customizable way to provision a Virtual Private Cloud (VPC) within your AWS environment. It supports both non production and production configurations, allowing you to tailor network settings, VPC endpoints, and security measures to your project's specific needs.

**Key Features**

* **Configurable Subnets:** Easily define public and private subnets across multiple Availability Zones (AZs) and layers (e.g., app, database, transit gateway).
* **Transit Gateway Integration:** Optionally connect your VPC to an existing Transit Gateway for seamless communication across AWS accounts, premises and regions.
* **VPC Endpoints:** Enable secure and private access to AWS services like S3, DynamoDB, SSM, SSM Messages, and EC2.
* **Flow Logs:** Capture VPC network traffic data for monitoring and troubleshooting.
* **Environment-Specific Configuration:** Use the `cdk.json` file to manage settings for different environments (development, testing, production).

**Prerequisites**

* **AWS CDK:** Make sure you have the AWS CDK installed and configured. Refer to the [AWS CDK documentation](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html) for setup instructions.
* **TypeScript:** This project is built with TypeScript. You'll need a TypeScript development environment.
* **AWS Account:** You'll need an AWS account to deploy the VPC stack.

**Getting Started**

1. **Clone the Repository:**
   ```bash
   git clone <your-repository-url>
   cd <your-repository-directory>
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environments (cdk.json):**
   * Modify the `cdk.json` file to match your project's requirements. Customize the VPC CIDR block, subnet masks, transit gateway ID (if used), VPC endpoint settings, and tags. You can add or remove environments.

4. **Deploy:**
   ```bash
   cdk deploy --context envName=dev
   ```
   This will synthesize and deploy your VPC stack to the specified environment.

**Destroy Resources**

1. **Eliminate the resources:**
   ```bash
   cdk destroy --all --force --context envName=dev
   ```
   This will destroy all resources associated with the stack in the specified environment.

**How It Works**

This CDK project defines a stack (`CdkVpcStack`) that encapsulates the creation of the VPC and associated resources. The `cdk.json` file drives the configuration based on the environment you choose during deployment.

**Customization (cdk.json)**

| Parameter                           | Description                                                                                                                                 | Default Value                                   |
|-------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------|
| `project_name`                      | The name of your project. Used for resource naming and tagging.                                                                             | `"my-project"`                                 |
| `vpc_cidr_block`                    | The CIDR block for your VPC.                                                                                                                | `"10.1.0.0/20"`                                |
| `az_count`                          | The number of Availability Zones to use.                                                                                                     | `2`                                            |
| `nat_gateway_count`                 | The number of NAT gateways to create (0 if using a Transit Gateway).                                                                         | `1`                                            |
| `use_transit_gateway`               | Set to `true` to use a existent Transit Gateway.                                                                                                      | `true`                                         |
| `transit_gateway_id`                | The ID of your Transit Gateway (if you're using one). `use_transit_gateway` must be set to `true`.                                                                                     | `""`                      |
| `create_public_subnets`             | Set to `true` to create public subnets in addition to private subnets.                                                                       | `true`                                         |
| `public_subnet_mask_bits`           | The bitmask for your public subnets.                                                                                                         | `27`                                           |
| `public_subnet_with_tgw_enabled`    | Set to `true` to route traffic from public subnets through the Transit Gateway.                                                              | `false`                                        |
| `subnet_layers`                     | Define private subnet layers names with their bitmasks (e.g., `{"app": 23, "db": 27, "tgw": 28}`).                                                  | `{"app": 23, "db": 27, "tgw": 28}`             |
| `encryption_key`                    | The ARN of the KMS key to use for flow log encryption (leave empty to create a new key).                                                     | `""`                                           |
| `s3_vpc_endpoint_enabled`           | Set to `true` to create a gateway S3 VPC endpoint.                                                                                                  | `true`                                         |
| `dynamodb_vpc_endpoint_enabled`     | Set to `true` to create a gateway DynamoDB VPC endpoint.                                                                                            | `true`                                         |
| `session_manager_vpc_endpoints_enabled` | Set to `false` to not create interfaces VPC endpoints for SSM, SSM Messages, and EC2.                                                                    | `false`                                        |
| `additional_cidrs`                  | An array of additional CIDR blocks to route through the Transit Gateway (e.g., `["192.168.0.0/16", "172.16.0.0/12"]`). If is empty will no create additional routes to VPC.                        | `[]`           |
| `tags`                              | A dictionary of tags (key-value pairs) to apply to the VPC and its resources (e.g., `{"owner": "John Doe", "project": "my-project"}`).       | `{}`|