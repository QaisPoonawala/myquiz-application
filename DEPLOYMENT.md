# AWS Deployment Guide for Quiz Platform

## Prerequisites

1. AWS CLI installed and configured with appropriate credentials
2. Docker and Docker Compose installed locally
3. An AWS account with necessary permissions
4. Node.js 18 or later installed

## Local Docker Testing

Before deploying to AWS, test the application locally using Docker Compose:

```bash
# Build and start the containers
docker-compose up --build

# Verify the application is running
curl http://localhost:5001/health

# Stop the containers
docker-compose down
```

## Building and Pushing Docker Image

## Step-by-Step Deployment Instructions

### 1. Create an ECR Repository and Build Docker Image

```bash
# Create ECR repository
aws ecr create-repository --repository-name quiz-platform

# Get the ECR login command
aws ecr get-login-password --region YOUR_REGION | docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com

# Build and tag the Docker image
docker build -t quiz-platform .
docker tag quiz-platform:latest YOUR_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com/quiz-platform:latest

# Push the image to ECR
docker push YOUR_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com/quiz-platform:latest
```

### 2. Deploy the CloudFormation Stack

```bash
# Create the CloudFormation stack
aws cloudformation create-stack \
  --stack-name quiz-platform \
  --template-body file://cloudformation.yaml \
  --capabilities CAPABILITY_IAM \
  --parameters \
    ParameterKey=ContainerImage,ParameterValue=YOUR_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com/quiz-platform:latest \
    ParameterKey=Environment,ParameterValue=Production

# Wait for stack creation to complete
aws cloudformation wait stack-create-complete --stack-name quiz-platform
```

### 3. Verify Deployment

1. Check if the stack was created successfully:
```bash
aws cloudformation describe-stacks --stack-name quiz-platform --query 'Stacks[0].StackStatus'
```

2. Get the Application Load Balancer DNS:
```bash
aws cloudformation describe-stacks \
  --stack-name quiz-platform \
  --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDNS`].OutputValue' \
  --output text
```

3. Verify DynamoDB tables are created:
```bash
aws dynamodb list-tables
```

4. Check ECS service status:
```bash
aws ecs list-services --cluster QuizCluster
```

### 4. Monitoring and Scaling

1. Monitor the application through CloudWatch:
   - ECS service metrics
   - DynamoDB metrics
   - Redis metrics
   - Application logs

2. The infrastructure automatically scales based on:
   - CPU utilization (target: 70%)
   - Memory utilization (target: 70%)
   - ECS service scales between 2 and 10 tasks
   - DynamoDB auto-scales with on-demand capacity

### 5. Cost Tracking

All resources are tagged with "Name: QuizPlatform" for easy cost tracking:
1. Use AWS Cost Explorer to filter by the tag
2. Set up cost alerts in AWS Budgets
3. Monitor resource utilization through CloudWatch

### 6. Cleanup

To delete all resources when no longer needed:
```bash
aws cloudformation delete-stack --stack-name quiz-platform
aws cloudformation wait stack-delete-complete --stack-name quiz-platform
```

## Environment Variables

The following environment variables are automatically configured in the ECS task:

- `NODE_ENV`: Set to 'production'
- `REDIS_URL`: Auto-configured to use ElastiCache Redis endpoint
- `REDIS_TLS_ENABLED`: Set to 'true' for secure Redis connection
- `AWS_REGION`: Set to the deployment region
- `PORT`: Set to 5001
- `CORS_ORIGIN`: Set to the ALB DNS name
- `DYNAMODB_PARTICIPANTS_TABLE`: Set to the Participants table name
- `DYNAMODB_QUIZZES_TABLE`: Set to the Quizzes table name
- `SOCKET_PATH`: Set to '/socket.io'

## Service Connectivity

1. **DynamoDB**:
   - Tables are created with the stack name prefix
   - ECS tasks have IAM roles for DynamoDB access
   - Auto-scaling with on-demand capacity
   - Tables are tagged with "Name: QuizPlatform" for cost tracking

2. **Redis (ElastiCache)**:
   - Encrypted in transit and at rest
   - Multi-AZ deployment for high availability
   - Automatic failover enabled
   - Runs in private subnets
   - Connection is secured via security groups

3. **Socket.IO**:
   - Runs through Application Load Balancer
   - Supports both WebSocket and long-polling
   - Automatic reconnection handling
   - Sticky sessions for connection persistence
   - Redis adapter for multi-container support

4. **Application Load Balancer**:
   - Routes traffic to ECS tasks
   - Health checks ensure container availability
   - Handles WebSocket connections
   - Public endpoint for client access

## Infrastructure Overview

The deployment creates:
- VPC with public/private subnets across 2 AZs
- ECS Fargate cluster with auto-scaling
- Application Load Balancer
- DynamoDB tables with on-demand capacity
- Redis cluster for session management
- CloudWatch logs and metrics
- IAM roles and security groups

## Security Considerations

1. All services run in private subnets
2. Redis cluster uses encryption at rest and in transit
3. Security groups restrict access between services
4. IAM roles follow least privilege principle
5. VPC endpoints can be added for enhanced security

## Troubleshooting

1. Check CloudWatch Logs for application errors
2. Verify security group rules if connectivity issues occur
3. Check ECS task definitions if containers fail to start
4. Monitor Redis metrics for cache performance
5. Review DynamoDB capacity metrics for throttling

## Support

For issues or questions:
1. Check CloudWatch logs
2. Review ECS task status
3. Verify network connectivity
4. Check security group configurations
