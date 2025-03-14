# Real-Time Quiz Application

A real-time quiz application built with Node.js, Express, and WebSocket for conducting live quizzes.

## Features

- Real-time quiz hosting and participation
- Live participant tracking
- Instant result calculation
- Quiz result exports
- Support for multiple quiz formats

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- AWS Account (for DynamoDB)

## Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd [repository-name]
```

2. Install dependencies:
```bash
npm install
```

3. Set up AWS credentials:
- Create an AWS account if you don't have one
- Configure AWS credentials locally
- Create required DynamoDB tables (see below)

4. Create DynamoDB tables:
```bash
node create-tables.js
```

5. Start the server:
```bash
npm start
```

The application will be available at `http://localhost:3000`

## DynamoDB Setup

The application requires two DynamoDB tables:
1. Quizzes table
2. Participants table

Run the provided script to create these tables:
```bash
node create-tables.js
```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
AWS_REGION=your-aws-region
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
PORT=3000
```

## Usage

1. Access the application at `http://localhost:3000`
2. Create a new quiz or join an existing one
3. Follow the on-screen instructions

## Development

For development with hot-reload:
```bash
npm run dev
```

## License

MIT
