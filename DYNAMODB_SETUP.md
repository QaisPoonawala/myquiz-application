# DynamoDB Local Setup Guide for Windows

This guide explains how to set up DynamoDB locally for development on Windows.

## Prerequisites

1. Java Runtime Environment (JRE) version 8.x or newer
2. AWS CLI v2 for Windows
3. Node.js v18+ installed
4. Docker Desktop for Windows (alternative method)

## Setup Methods

### Method 1: Using Docker (Recommended)

```powershell
# Pull DynamoDB Local image
docker pull amazon/dynamodb-local

# Run DynamoDB Local container
docker run --name dynamodb-local -p 8000:8000 -d amazon/dynamodb-local

# Verify DynamoDB is running
aws dynamodb list-tables --endpoint-url http://localhost:8000
```

### Method 2: Using Downloadable Version

1. Download DynamoDB Local:
```powershell
# Create directory for DynamoDB
New-Item -ItemType Directory -Force -Path "C:\dynamodb_local"
cd C:\dynamodb_local

# Download DynamoDB Local
Invoke-WebRequest -Uri "https://d1ni2b6xgvw0s0.cloudfront.net/dynamodb_local_latest.zip" -OutFile "dynamodb_local_latest.zip"

# Extract the zip file
Expand-Archive -Path "dynamodb_local_latest.zip" -DestinationPath "."
```

2. Start DynamoDB Local:
```powershell
# Start DynamoDB Local
java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -sharedDb
```

## Application Configuration

1. Update `.env` file:
```env
NODE_ENV=development
AWS_REGION=local
DYNAMODB_ENDPOINT=http://localhost:8000
```

2. Create DynamoDB tables:
```powershell
# Create Quiz table
aws dynamodb create-table `
    --table-name Quizzes `
    --attribute-definitions `
        AttributeName=id,AttributeType=S `
    --key-schema `
        AttributeName=id,KeyType=HASH `
    --provisioned-throughput `
        ReadCapacityUnits=5,WriteCapacityUnits=5 `
    --endpoint-url http://localhost:8000

# Create Participants table
aws dynamodb create-table `
    --table-name Participants `
    --attribute-definitions `
        AttributeName=id,AttributeType=S `
        AttributeName=quizId,AttributeType=S `
    --key-schema `
        AttributeName=id,KeyType=HASH `
    --global-secondary-indexes `
        "[{\"IndexName\": \"quizId-index\",\"KeySchema\":[{\"AttributeName\":\"quizId\",\"KeyType\":\"HASH\"}],\"Projection\":{\"ProjectionType\":\"ALL\"},\"ProvisionedThroughput\":{\"ReadCapacityUnits\":5,\"WriteCapacityUnits\":5}}]" `
    --provisioned-throughput `
        ReadCapacityUnits=5,WriteCapacityUnits=5 `
    --endpoint-url http://localhost:8000
```

## Verify Setup

```powershell
# List tables
aws dynamodb list-tables --endpoint-url http://localhost:8000

# Scan a table
aws dynamodb scan --table-name Quizzes --endpoint-url http://localhost:8000
```

## Common Issues and Solutions

### 1. Port Already in Use
```powershell
# Find process using port 8000
netstat -ano | findstr :8000

# Kill process
taskkill /PID <process_id> /F
```

### 2. Docker Container Issues
```powershell
# Check container logs
docker logs dynamodb-local

# Restart container
docker restart dynamodb-local
```

### 3. Java Installation
If you see "java is not recognized":
1. Download and install JRE from Oracle website
2. Add Java to PATH:
```powershell
$javaHome = "C:\Program Files\Java\jre1.8.0_xxx"
[Environment]::SetEnvironmentVariable("JAVA_HOME", $javaHome, "User")
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";$javaHome\bin", "User")
```

## AWS CLI Configuration for Local Development

```powershell
# Configure AWS CLI with dummy credentials for local development
aws configure set aws_access_key_id "local"
aws configure set aws_secret_access_key "local"
aws configure set region "local"
```

## Cleanup

```powershell
# Using Docker
docker stop dynamodb-local
docker rm dynamodb-local

# Using downloadable version
# Simply stop the Java process (Ctrl+C)
```

## DynamoDB Admin UI (Optional)

1. Install dynamodb-admin:
```powershell
npm install -g dynamodb-admin
```

2. Start the admin interface:
```powershell
$env:DYNAMO_ENDPOINT="http://localhost:8000"
dynamodb-admin
```

Access the UI at http://localhost:8001

## Testing DynamoDB Connection

Create a test file `test-dynamodb.js`:
```javascript
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({
    region: 'local',
    endpoint: 'http://localhost:8000'
});

const docClient = DynamoDBDocumentClient.from(client);

async function testConnection() {
    try {
        // Test write
        await docClient.send(new PutCommand({
            TableName: 'Quizzes',
            Item: {
                id: 'test-quiz',
                title: 'Test Quiz',
                description: 'Testing DynamoDB connection'
            }
        }));

        // Test read
        const response = await docClient.send(new GetCommand({
            TableName: 'Quizzes',
            Key: {
                id: 'test-quiz'
            }
        }));

        console.log('Test successful:', response.Item);
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testConnection();
```

Run the test:
```powershell
node test-dynamodb.js
```

## Next Steps

After setting up DynamoDB locally:
1. Update application models to use DynamoDB
2. Update controllers to use DynamoDB operations
3. Test the application with `npm run dev`
