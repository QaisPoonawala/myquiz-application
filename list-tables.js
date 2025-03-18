const { DynamoDB } = require('@aws-sdk/client-dynamodb');

const dynamodb = new DynamoDB({
    endpoint: 'http://localhost:8000',
    region: 'local',
    credentials: {
        accessKeyId: 'dummy',
        secretAccessKey: 'dummy'
    }
});

async function listTables() {
    try {
        const result = await dynamodb.listTables({});
        console.log('Available tables:', result.TableNames);
    } catch (error) {
        console.error('Error listing tables:', error);
    }
}

listTables();
