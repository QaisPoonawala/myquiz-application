const { DynamoDB } = require('@aws-sdk/client-dynamodb');

require('dotenv').config();

const isLocal = process.env.USE_LOCAL_DB === 'true' || process.argv.includes('--local');
const dynamodb = new DynamoDB({
    region: process.env.AWS_REGION,
    endpoint: isLocal ? 'http://localhost:8000' : undefined,
    ...(isLocal && {
        credentials: {
            accessKeyId: 'local',
            secretAccessKey: 'local'
        }
    })
});

async function createTables() {
    try {
        // Check if tables exist and create if they don't
        try {
            await dynamodb.describeTable({ TableName: process.env.DYNAMODB_QUIZZES_TABLE });
            console.log('Quizzes table exists');
        } catch (error) {
            if (error.name === 'ResourceNotFoundException') {
                await dynamodb.createTable({
            TableName: process.env.DYNAMODB_QUIZZES_TABLE,
            AttributeDefinitions: [
                { AttributeName: 'id', AttributeType: 'S' }
            ],
            KeySchema: [
                { AttributeName: 'id', KeyType: 'HASH' }
            ],
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        });

                console.log('Quizzes table created');
            } else {
                throw error;
            }
        }

        try {
            await dynamodb.describeTable({ TableName: process.env.DYNAMODB_PARTICIPANTS_TABLE });
            console.log('Participants table exists');
        } catch (error) {
            if (error.name === 'ResourceNotFoundException') {
                await dynamodb.createTable({
            TableName: process.env.DYNAMODB_PARTICIPANTS_TABLE,
            AttributeDefinitions: [
                { AttributeName: 'id', AttributeType: 'S' },
                { AttributeName: 'quizId', AttributeType: 'S' },
                { AttributeName: 'sessionId', AttributeType: 'S' },
                { AttributeName: 'socketId', AttributeType: 'S' }
            ],
            KeySchema: [
                { AttributeName: 'id', KeyType: 'HASH' }
            ],
            GlobalSecondaryIndexes: [
                {
                    IndexName: 'quizId-index',
                    KeySchema: [
                        { AttributeName: 'quizId', KeyType: 'HASH' }
                    ],
                    Projection: { ProjectionType: 'ALL' },
                    ProvisionedThroughput: {
                        ReadCapacityUnits: 5,
                        WriteCapacityUnits: 5
                    }
                },
                {
                    IndexName: 'sessionId-index',
                    KeySchema: [
                        { AttributeName: 'sessionId', KeyType: 'HASH' }
                    ],
                    Projection: { ProjectionType: 'ALL' },
                    ProvisionedThroughput: {
                        ReadCapacityUnits: 5,
                        WriteCapacityUnits: 5
                    }
                },
                {
                    IndexName: 'socketId-index',
                    KeySchema: [
                        { AttributeName: 'socketId', KeyType: 'HASH' }
                    ],
                    Projection: { ProjectionType: 'ALL' },
                    ProvisionedThroughput: {
                        ReadCapacityUnits: 5,
                        WriteCapacityUnits: 5
                    }
                }
            ],
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        });

                console.log('Participants table created');
            } else {
                throw error;
            }
        }

        console.log('Tables verification completed');
    } catch (error) {
        console.error('Error creating tables:', error);
        process.exit(1);
    }
}

createTables();
