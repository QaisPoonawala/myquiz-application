# CloudFormation Deployment Guide (Windows)

This guide explains how to deploy the xQuizite platform using AWS CloudFormation on Windows.

## Prerequisites

1. AWS CLI installed and configured on Windows
2. Docker Desktop for Windows installed
3. PowerShell 5.1 or later

## Deployment Steps

### 1. Build and Push Docker Image

```powershell
# Build the Docker image
docker build -t quiz-app .

# Create ECR repository
aws ecr create-repository --repository-name quiz-app

# Login to ECR (PowerShell)
Invoke-Expression -Command (aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_AWS_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com)

# Tag and push image
docker tag quiz-app:latest YOUR_AWS_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/quiz-app:latest
docker push YOUR_AWS_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/quiz-app:latest
```

### 2. Deploy CloudFormation Stack

```powershell
# Create the stack (PowerShell)
aws cloudformation create-stack `
  --stack-name xquizite `
  --template-body file://cloudformation.yaml `
  --parameters `
    ParameterKey=Environment,ParameterValue=production `
    ParameterKey=ContainerImage,ParameterValue=YOUR_AWS_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/quiz-app:latest `
  --capabilities CAPABILITY_IAM

# Monitor stack creation
aws cloudformation describe-stacks --stack-name xquizite --query 'Stacks[0].StackStatus'
```

### 3. Test the Deployment

```powershell
# Get Load Balancer URL (PowerShell)
$ALB_URL = aws cloudformation describe-stacks `
  --stack-name xquizite `
  --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDNS`].OutputValue' `
  --output text

Write-Host "Application URL: http://$ALB_URL:5001"
```

## Stack Resources

The CloudFormation template creates:

1. **Network Infrastructure**
   - VPC with public and private subnets
   - Internet Gateway
   - Security Groups

2. **Backend**
   - ECS Fargate Cluster
   - Application Load Balancer
   - Auto Scaling configuration

3. **Database & Cache**
   - DynamoDB Tables
   - ElastiCache Redis Cluster

## Scaling Configuration

- **ECS Tasks**: 2-10 instances
- **Auto Scaling Triggers**:
  - CPU utilization > 70%
  - Memory utilization > 70%
- **Cooldown Period**: 60 seconds

## Monitoring

Monitor your deployment using CloudWatch:

```powershell
# View ECS service logs (PowerShell)
aws logs tail "/ecs/xquizite" --follow

# Get CPU utilization (PowerShell)
$StartTime = [DateTime]::UtcNow.AddHours(-1).ToString("yyyy-MM-ddTHH:mm:ssZ")
$EndTime = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")

aws cloudwatch get-metric-statistics `
  --namespace AWS/ECS `
  --metric-name CPUUtilization `
  --dimensions Name=ClusterName,Value=xquizite-cluster Name=ServiceName,Value=xquizite-service `
  --start-time $StartTime `
  --end-time $EndTime `
  --period 300 `
  --statistics Average

# Monitor DynamoDB metrics
aws cloudwatch get-metric-statistics `
  --namespace AWS/DynamoDB `
  --metric-name ConsumedReadCapacityUnits `
  --dimensions Name=TableName,Value=Participants `
  --start-time $StartTime `
  --end-time $EndTime `
  --period 300 `
  --statistics Sum
```

## Cleanup

To delete all resources:

```powershell
# Delete the stack
aws cloudformation delete-stack --stack-name xquizite

# Monitor deletion
aws cloudformation describe-stacks --stack-name xquizite --query 'Stacks[0].StackStatus'
```

## Troubleshooting

1. **Stack Creation Fails**
   - Check CloudFormation events (PowerShell):
     ```powershell
     aws cloudformation describe-stack-events --stack-name xquizite
     ```
   - Common issues:
     - VPC limits reached
     - IAM permissions

2. **Container Health Check Fails**
   - Check ECS task logs in CloudWatch
   - Verify DynamoDB access
   - Check Redis connection
   - Verify environment variables

3. **Application Not Loading**
   - Check ALB health checks
   - Verify security group rules
   - Check ECS service status

4. **DynamoDB Issues**
   - Check provisioned capacity
   - Verify IAM roles and policies
   - Monitor throttling metrics

5. **Windows-Specific Issues**
   - Docker Desktop not running
     ```powershell
     # Check Docker status
     docker info
     ```
   - PowerShell execution policy
     ```powershell
     # Check current policy
     Get-ExecutionPolicy
     # If needed, set to RemoteSigned
     Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
     ```
   - Line ending issues in scripts
     ```powershell
     # Convert line endings if needed
     (Get-Content .\script.sh) | Set-Content -Encoding UTF8 .\script.sh
     ```

## Cost Optimization

Monitor costs using AWS Cost Explorer:

```powershell
# Get estimated monthly cost (PowerShell)
$StartDate = Get-Date -Format "yyyy-MM-01"
$EndDate = (Get-Date).AddMonths(1).ToString("yyyy-MM-01")

aws ce get-cost-forecast `
  --time-period Start=$StartDate,End=$EndDate `
  --metric UNBLENDED_COST `
  --granularity MONTHLY
```

Estimated monthly costs:
- ECS Fargate: ~$150-300
- DynamoDB: ~$50-100
- ElastiCache: ~$100
- ALB: ~$50
- Other: ~$50

Total: ~$400-600/month

## Windows Environment Tips

1. **Path Length Limitations**
   - Use short paths when possible
   - Consider enabling long path support:
     ```powershell
     # Enable long paths in Windows
     Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1
     ```

2. **Docker Desktop Settings**
   - Allocate sufficient resources in Docker Desktop settings
   - Enable WSL 2 backend for better performance
   - Configure file sharing if needed

3. **AWS CLI Configuration**
   - Store credentials in %UserProfile%\.aws\credentials
   - Use AWS CLI v2 for Windows
   - Configure default region in %UserProfile%\.aws\config
