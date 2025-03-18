# Local Testing Guide (Windows)

This guide explains how to test the xQuizite platform locally before AWS deployment.

## Prerequisites

1. Node.js v18+ installed
2. MongoDB Community Edition installed
3. Docker Desktop for Windows
4. Redis (via Docker)

## Setup Steps

### 1. Start Local MongoDB

```powershell
# Create data directory if it doesn't exist
New-Item -ItemType Directory -Force -Path "C:\data\db"

# Start MongoDB (PowerShell Admin)
& 'C:\Program Files\MongoDB\Server\{version}\bin\mongod.exe' --dbpath="C:\data\db"
```

Or use MongoDB Compass to create a local database.

### 2. Start Redis using Docker

```powershell
# Pull Redis image
docker pull redis

# Run Redis container
docker run --name quiz-redis -p 6379:6379 -d redis

# Verify Redis is running
docker ps
```

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/quiz-app
REDIS_URL=redis://localhost:6379
PORT=5001
```

### 4. Install Dependencies

```powershell
# Install project dependencies
npm install

# Install development dependencies
npm install nodemon -D
```

### 5. Run the Application

```powershell
# Start the development server
npm run dev

# In a new terminal, check the server is running
Invoke-WebRequest -Uri http://localhost:5001/health
```

## Local Testing Scenarios

### 1. Test Quiz Creation

```powershell
# Create a test quiz using PowerShell
$body = @{
    title = "Test Quiz"
    description = "Testing locally"
    questions = @(
        @{
            questionText = "Test Question"
            timeLimit = 30
            options = @(
                @{
                    text = "Option 1"
                    isCorrect = $true
                },
                @{
                    text = "Option 2"
                    isCorrect = $false
                }
            )
        }
    )
} | ConvertTo-Json -Depth 10

Invoke-WebRequest -Uri http://localhost:5001/api/quiz `
    -Method Post `
    -Body $body `
    -ContentType "application/json"
```

### 2. Test Multiple Users

1. Open multiple browser windows to simulate multiple participants
2. Use browser's DevTools to monitor WebSocket connections
3. Test real-time updates across sessions

### 3. Load Testing

```powershell
# Install Artillery for load testing
npm install -g artillery

# Create a load test configuration (loadtest.yml)
$loadTest = @"
config:
  target: "http://localhost:5001"
  phases:
    - duration: 60
      arrivalRate: 10
      rampTo: 50
scenarios:
  - flow:
      - get:
          url: "/health"
"@

$loadTest | Out-File -FilePath "loadtest.yml" -Encoding UTF8

# Run load test
artillery run loadtest.yml
```

### 4. Test WebSocket Scaling

```powershell
# Start multiple server instances (different ports)
$env:PORT=5001; npm run dev
# In new terminal
$env:PORT=5002; npm run dev
# In new terminal
$env:PORT=5003; npm run dev
```

Redis will handle session synchronization between instances.

## Debugging

### 1. Server Debugging

```powershell
# Start server in debug mode
$env:DEBUG="*"; npm run dev

# Or use VS Code debugging
# Launch configuration (.vscode/launch.json):
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "node",
            "request": "launch",
            "name": "Debug Server",
            "program": "${workspaceFolder}/server.js",
            "envFile": "${workspaceFolder}/.env"
        }
    ]
}
```

### 2. WebSocket Debugging

1. Open browser DevTools
2. Go to Network tab
3. Filter by "WS" to monitor WebSocket connections
4. Check Console for Socket.IO logs

### 3. Database Debugging

```powershell
# Connect to MongoDB shell
& 'C:\Program Files\MongoDB\Server\{version}\bin\mongo.exe'

# Basic commands
use quiz-app
db.quizzes.find()
db.participants.find()
```

### 4. Redis Debugging

```powershell
# Connect to Redis CLI in Docker container
docker exec -it quiz-redis redis-cli

# Basic commands
KEYS *
MONITOR
```

## Common Issues and Solutions

### 1. Port Already in Use

```powershell
# Find process using port 5001
netstat -ano | findstr :5001

# Kill process
taskkill /PID <process_id> /F
```

### 2. MongoDB Connection Issues

```powershell
# Check MongoDB service status
Get-Service MongoDB

# Start MongoDB service if stopped
Start-Service MongoDB
```

### 3. Redis Connection Issues

```powershell
# Check Redis container logs
docker logs quiz-redis

# Restart Redis container
docker restart quiz-redis
```

### 4. WebSocket Connection Issues

1. Check CORS settings in server.js
2. Verify Redis is running
3. Check browser console for errors

## Performance Testing

### 1. Memory Usage

```powershell
# Monitor Node.js memory usage
Get-Process -Name node | Select-Object WorkingSet, CPU

# Monitor Docker containers
docker stats
```

### 2. CPU Usage

```powershell
# Monitor system resources
Get-Counter '\Processor(_Total)\% Processor Time' -Continuous
```

### 3. Network Usage

```powershell
# Monitor network connections
netstat -an | findstr :5001
```

## Cleanup

```powershell
# Stop MongoDB
Stop-Service MongoDB

# Stop Redis container
docker stop quiz-redis
docker rm quiz-redis

# Clean up node_modules (if needed)
Remove-Item -Recurse -Force node_modules
```

This local testing setup allows you to verify all functionality before deploying to AWS, ensuring your application works correctly at scale.
