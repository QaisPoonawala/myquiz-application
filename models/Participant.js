const { PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class Participant {
    static tableName = process.env.DYNAMODB_PARTICIPANTS_TABLE || 'xquizite-Participants';

    static async create(participantData) {
        const participant = {
            id: uuidv4(),
            name: participantData.name,
            sessionId: participantData.sessionId,
            quizId: participantData.quizId,
            score: 0,
            answers: [],
            lastActive: new Date().toISOString(),
            connected: 1,
            socketId: participantData.socketId
        };

        await docClient.send(new PutCommand({
            TableName: this.tableName,
            Item: participant
        }));

        return participant;
    }

    static async findById(id) {
        const response = await docClient.send(new GetCommand({
            TableName: this.tableName,
            Key: { id }
        }));
        return response.Item;
    }

    static async findByQuizId(quizId) {
        const response = await docClient.send(new QueryCommand({
            TableName: this.tableName,
            IndexName: 'quizId-index',
            KeyConditionExpression: 'quizId = :quizId',
            ExpressionAttributeValues: {
                ':quizId': quizId
            }
        }));
        return response.Items;
    }

    static async findBySessionId(sessionId) {
        const response = await docClient.send(new QueryCommand({
            TableName: this.tableName,
            IndexName: 'sessionId-index',
            KeyConditionExpression: 'sessionId = :sessionId',
            ExpressionAttributeValues: {
                ':sessionId': sessionId
            }
        }));
        return response.Items;
    }

    static async findBySocketId(socketId) {
        const response = await docClient.send(new QueryCommand({
            TableName: this.tableName,
            IndexName: 'socketId-index',
            KeyConditionExpression: 'socketId = :socketId',
            ExpressionAttributeValues: {
                ':socketId': socketId
            }
        }));
        return response.Items;
    }

    static async update(id, updateData) {
        try {
            console.log('Updating participant:', {
                id,
                updateData: JSON.stringify(updateData, null, 2)
            });

            const updateExpressions = [];
            const expressionAttributeNames = {};
            const expressionAttributeValues = {};

            Object.entries(updateData).forEach(([key, value]) => {
                if (value !== undefined) {
                    updateExpressions.push(`#${key} = :${key}`);
                    expressionAttributeNames[`#${key}`] = key;
                    expressionAttributeValues[`:${key}`] = value;
                }
            });

            const params = {
                TableName: this.tableName,
                Key: { id },
                UpdateExpression: `SET ${updateExpressions.join(', ')}`,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ReturnValues: 'ALL_NEW'
            };

            console.log('DynamoDB update params:', JSON.stringify(params, null, 2));

            const response = await docClient.send(new UpdateCommand(params));
            console.log('DynamoDB update response:', JSON.stringify(response.Attributes, null, 2));

            return response.Attributes;
        } catch (error) {
            console.error('Error updating participant:', error);
            throw error;
        }
    }

    static async addAnswer(id, answer) {
        await docClient.send(new UpdateCommand({
            TableName: this.tableName,
            Key: { id },
            UpdateExpression: 'SET answers = list_append(if_not_exists(answers, :empty_list), :answer)',
            ExpressionAttributeValues: {
                ':empty_list': [],
                ':answer': [answer]
            }
        }));
    }

    static async updateConnection(id, connected) {
        await docClient.send(new UpdateCommand({
            TableName: this.tableName,
            Key: { id },
            UpdateExpression: 'SET connected = :connected, lastActive = :lastActive',
            ExpressionAttributeValues: {
                ':connected': connected ? 1 : 0,
                ':lastActive': new Date().toISOString()
            }
        }));
    }

    static async delete(id) {
        await docClient.send(new DeleteCommand({
            TableName: this.tableName,
            Key: { id }
        }));
    }
}

module.exports = Participant;
