# Deployment Guide

This document outlines the steps to deploy the Quiz Application.

## Local Deployment

1. Install dependencies:
```bash
npm install
```

2. Set up AWS credentials:
- Configure your AWS credentials either through AWS CLI or environment variables
- Ensure you have the necessary permissions for DynamoDB

3. Create required DynamoDB tables:
```bash
node create-tables.js
```

4. Start the application:
```bash
npm start
```

## Production Deployment

### Prerequisites
- Node.js environment
- AWS account with DynamoDB access
- Domain name (optional)

### Steps

1. Set up environment:
   - Install Node.js and npm
   - Configure AWS credentials
   - Set up environment variables

2. Deploy application:
   ```bash
   npm install --production
   npm start
   ```

3. Configure reverse proxy (optional):
   - Set up Nginx/Apache
   - Configure SSL certificates
   - Set up domain routing

### Environment Variables

Required environment variables:
```
AWS_REGION=your-aws-region
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
PORT=3000
```

### Security Considerations

1. Always use environment variables for sensitive data
2. Implement proper AWS IAM roles and permissions
3. Use HTTPS in production
4. Regularly update dependencies
5. Monitor application logs and metrics
