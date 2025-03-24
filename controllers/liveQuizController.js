const Quiz = require('../models/Quiz');
const Participant = require('../models/Participant');
const xlsx = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/db');

// Start a live quiz session
exports.startLiveQuiz = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) {
            return res.status(404).json({ success: false, error: 'Quiz not found' });
        }

        // Clear any existing participants for this quiz
        const participants = await Participant.findByQuizId(quiz.id);
        for (const participant of participants) {
            await Participant.delete(participant.id);
        }

        const sessionCode = uuidv4().substring(0, 6).toUpperCase();
        const updatedQuiz = await Quiz.findByIdAndUpdate(req.params.id, {
            isLive: 1,
            currentQuestion: -1,
            sessionCode: sessionCode,
            participants: []
        });

        // Publish participant update to Redis
        const io = req.app.get('io');
        const roomId = quiz.id.toString();
        // Only publish to Redis if available
        const redisClient = req.app.get('redisClient');
        if (redisClient) {
            await redisClient.publish('participant-update', JSON.stringify({
                roomId,
                count: 0,
                participants: []
            }));
        }

        res.status(200).json({
            success: true,
            data: {
                sessionCode: sessionCode,
                quizId: quiz.id
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// Join a live quiz
exports.joinQuiz = async (req, res) => {
    try {
        const { sessionCode, name } = req.body;
        
        // Use scan to find quiz by sessionCode
        const response = await docClient.send(new ScanCommand({
            TableName: Quiz.tableName,
            FilterExpression: '#sc = :sessionCode AND #il = :isLive',
            ExpressionAttributeValues: {
                ':sessionCode': sessionCode,
                ':isLive': 1
            },
            ExpressionAttributeNames: {
                '#sc': 'sessionCode',
                '#il': 'isLive'
            }
        }));
        const quizzes = response.Items;
        
        if (!quizzes || quizzes.length === 0) {
            return res.status(404).json({ success: false, error: 'Quiz session not found' });
        }
        const quiz = quizzes[0];

        // Create participant
        const participantId = uuidv4();
        const sessionId = uuidv4();
        // Check if a participant with this device ID already exists
        const existingParticipants = await docClient.send(new ScanCommand({
            TableName: Participant.tableName,
            FilterExpression: '#qi = :quizId AND #di = :deviceId',
            ExpressionAttributeNames: {
                '#qi': 'quizId',
                '#di': 'deviceId'
            },
            ExpressionAttributeValues: {
                ':quizId': quiz.id,
                ':deviceId': req.body.deviceId
            }
        }));

        let participant;
        if (existingParticipants.Items && existingParticipants.Items.length > 0) {
            // Update existing participant
            participant = existingParticipants.Items[0];
            await Participant.update(participant.id, {
                connected: 1,
                lastActive: new Date().toISOString(),
                sessionId: sessionId,
                socketId: req.body.socketId
            });
        } else {
            // Create new participant
            participant = {
                id: participantId,
                name,
                sessionId,
                quizId: quiz.id,
                score: 0,
                answers: [],
                connected: 1,
                lastActive: new Date().toISOString(),
                deviceId: req.body.deviceId
            };
            await Participant.create(participant);
        }

        // Update quiz with new participant
        await Quiz.findByIdAndUpdate(quiz.id, {
            participants: [...(quiz.participants || []), participantId]
        });

        // Get all participants and publish update to Redis
        const allParticipants = await Participant.findByQuizId(quiz.id);
        const io = req.app.get('io');
        const roomId = quiz.id.toString();
        const connectedParticipants = allParticipants.filter(p => p.connected === 1);
        console.log(`Publishing participant update to Redis for room ${roomId}:`, {
            count: connectedParticipants.length,
            participants: connectedParticipants.map(p => p.name)
        });
        
        // Only publish to Redis if available
        const redisClient = req.app.get('redisClient');
        if (redisClient) {
            await redisClient.publish('participant-update', JSON.stringify({
                roomId,
                count: connectedParticipants.length,
                participants: connectedParticipants.map(p => ({ name: p.name }))
            }));
        }

        res.status(200).json({
            success: true,
            data: {
                sessionId: sessionId,
                name: name,
                quizId: quiz.id
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// Move to next question
exports.nextQuestion = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz || quiz.isLive !== 1) {
            return res.status(404).json({ success: false, error: 'Live quiz not found' });
        }

        const currentQuestion = quiz.currentQuestion + 1;
        const questionStartTime = new Date().toISOString();

        if (currentQuestion >= quiz.questions.length) {
            await Quiz.findByIdAndUpdate(req.params.id, {
                isLive: 0,
                currentQuestion: -1,
                sessionCode: ''
            });
            return res.status(200).json({ success: true, finished: true });
        }

        // Update quiz with new question
        const updatedQuiz = await Quiz.findByIdAndUpdate(req.params.id, {
            currentQuestion,
            questionStartTime
        }, { new: true }); // Get the updated document

        console.log('Moving to question:', {
            quizId: req.params.id,
            currentQuestion,
            questionStartTime
        });

        // Get leaderboard data
        const participants = await Participant.findByQuizId(quiz.id);

        const leaderboardData = participants
            .map(p => ({
                name: p.name,
                score: p.score || 0,
                answeredQuestions: (p.answers || []).length,
                correctAnswers: (p.answers || []).filter(a => a.isCorrect === 1).length
            }))
            .sort((a, b) => b.score - a.score)
            .map((p, index) => ({
                ...p,
                rank: index + 1,
                totalParticipants: participants.length
            }));

        const nextQuestion = updatedQuiz.questions[currentQuestion];
        if (!nextQuestion) {
            console.error('Question not found:', {
                quizId: req.params.id,
                currentQuestion,
                totalQuestions: updatedQuiz.questions.length
            });
            return res.status(400).json({ success: false, error: 'Question not found' });
        }

        // Emit new question and leaderboard to all participants
        const io = req.app.get('io');
        
        // Get participant names
        const participantNames = participants.map(p => ({ name: p.name }));
        
        const roomId = quiz.id.toString();
        const connectedParticipants = participants.filter(p => p.connected === 1);
        
        console.log(`Broadcasting to room ${roomId}:`, {
            participantCount: connectedParticipants.length,
            questionIndex: currentQuestion
        });
        
        // Only publish to Redis if available
        const redisClient = req.app.get('redisClient');
        if (redisClient) {
            await redisClient.publish('participant-update', JSON.stringify({
                roomId,
                count: connectedParticipants.length,
                participants: connectedParticipants.map(p => ({ name: p.name }))
            }));
        }
        
        console.log('Broadcasting new question:', {
            roomId,
            questionIndex: currentQuestion,
            questionText: nextQuestion.questionText,
            timeLimit: nextQuestion.timeLimit
        });

        io.in(roomId).emit('new-question', {
            question: {
                questionText: nextQuestion.questionText,
                options: nextQuestion.options.map(opt => ({
                    text: opt.text,
                    isCorrect: opt.isCorrect
                })),
                totalQuestions: quiz.questions.length
            },
            timeLimit: nextQuestion.timeLimit,
            questionStartTime: questionStartTime,
            currentQuestion: currentQuestion,
            totalQuestions: quiz.questions.length
        });
        io.in(roomId).emit('leaderboard-update', leaderboardData);
        res.status(200).json({
            success: true,
            data: {
                questionIndex: currentQuestion,
                timeLimit: nextQuestion.timeLimit,
                leaderboard: leaderboardData
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// Submit answer
exports.submitAnswer = async (req, res) => {
    try {
        const { sessionId, answers } = req.body;
        
        // Ensure answers is an array
        if (!Array.isArray(answers)) {
            return res.status(400).json({ success: false, error: 'Answers must be an array' });
        }
        
        // Find participant by sessionId and deviceId
        const participants = await docClient.send(new ScanCommand({
            TableName: Participant.tableName,
            FilterExpression: '(#si = :sessionId OR #di = :deviceId)',
            ExpressionAttributeNames: {
                '#si': 'sessionId',
                '#di': 'deviceId'
            },
            ExpressionAttributeValues: {
                ':sessionId': sessionId,
                ':deviceId': req.body.deviceId
            }
        }));
        
        if (!participants.Items || participants.Items.length === 0) {
            return res.status(404).json({ success: false, error: 'Participant not found' });
        }
        const participant = participants.Items[0];

        // Get quiz
        const quiz = await Quiz.findById(participant.quizId);
        if (!quiz || quiz.isLive !== 1) {
            return res.status(400).json({ success: false, error: 'Quiz is not live' });
        }

        const currentQuestion = quiz.questions[quiz.currentQuestion];
        const timeTaken = (new Date() - new Date(quiz.questionStartTime)) / 1000;
        
        if (timeTaken > currentQuestion.timeLimit) {
            return res.status(400).json({ success: false, error: 'Time limit exceeded' });
        }

        // Validate answer indices
        if (answers.some(answer => answer < 0 || answer >= currentQuestion.options.length)) {
            return res.status(400).json({ success: false, error: 'Invalid answer index' });
        }

        // Get all correct options
        const correctOptions = currentQuestion.options
            .map((opt, idx) => ({ idx, isCorrect: opt.isCorrect === 1 || opt.isCorrect === true }))
            .filter(opt => opt.isCorrect)
            .map(opt => opt.idx);

        // Calculate correctness ratio
        const correctSelections = answers.filter(answer => 
            currentQuestion.options[answer].isCorrect === 1 || 
            currentQuestion.options[answer].isCorrect === true
        ).length;
        const incorrectSelections = answers.filter(answer => 
            !currentQuestion.options[answer].isCorrect
        ).length;

        // Calculate score based on correct and incorrect selections
        const totalCorrectOptions = correctOptions.length;
        let correctnessRatio = 0;

        if (totalCorrectOptions > 0) {
            // Perfect score if all correct options are selected and no incorrect ones
            if (correctSelections === totalCorrectOptions && incorrectSelections === 0) {
                correctnessRatio = 1;
            } else {
                // Partial credit based on correct selections minus penalties for incorrect ones
                correctnessRatio = Math.max(0, 
                    (correctSelections / totalCorrectOptions) - 
                    (incorrectSelections / currentQuestion.options.length)
                );
            }
        }

        console.log('Processing answers:', {
            questionIndex: quiz.currentQuestion,
            selectedAnswers: answers,
            correctSelections,
            incorrectSelections,
            totalCorrectOptions,
            correctnessRatio,
            timeTaken
        });

        // Calculate points (max 1000)
        const timeLimit = currentQuestion.timeLimit || 30; // default 30 seconds if not specified
        let points = 0;
        if (correctnessRatio > 0) {
            // Scale points by correctness ratio
            const timeRatio = Math.min(timeTaken / timeLimit, 1);
            points = Math.round((1000 - (timeRatio * 900)) * correctnessRatio);
            points = Math.max(Math.round(100 * correctnessRatio), points);
        }

        console.log('Points calculation:', {
            correctnessRatio,
            timeTaken,
            timeLimit,
            timeRatio: timeTaken / timeLimit,
            calculatedPoints: points,
            finalPoints: points
        });

        // Update participant with new answer and score
        const currentScore = participant.score || 0;
        const newScore = currentScore + points;
        console.log('Score update:', {
            participantId: participant.id,
            oldScore: currentScore,
            pointsToAdd: points,
            newScore: newScore
        });

        const newAnswer = {
            questionIndex: quiz.currentQuestion,
            answeredAt: new Date().toISOString(),
            isCorrect: correctnessRatio === 1 ? 1 : 0,
            timeTaken,
            points,
            answers, // Store all selected options
            correctnessRatio // Store the ratio for detailed reporting
        };

        try {
            await Participant.update(participant.id, {
                answers: [...(participant.answers || []), newAnswer],
                score: newScore,
                lastActive: new Date().toISOString()
            });
            console.log('Successfully updated participant score in DynamoDB');
        } catch (error) {
            console.error('Error updating participant:', error);
            throw error;
        }

        // Get updated leaderboard data
        const allParticipants = await Participant.findByQuizId(quiz.id);

        const leaderboardData = allParticipants
            .map(p => ({
                name: p.name,
                score: p.score || 0,
                answeredQuestions: (p.answers || []).length,
                correctAnswers: (p.answers || []).filter(a => a.isCorrect === 1).length
            }))
            .sort((a, b) => b.score - a.score);

        // Emit updated leaderboard to all participants
        const io = req.app.get('io');
        const roomId = quiz.id.toString();
        io.in(roomId).emit('leaderboard-update', leaderboardData);

        // Get updated participant data
        const updatedParticipant = await Participant.findById(participant.id);

        // Get all correct answer indices
        const correctAnswerIndices = currentQuestion.options
            .map((opt, idx) => ({ idx, isCorrect: opt.isCorrect === 1 || opt.isCorrect === true }))
            .filter(opt => opt.isCorrect)
            .map(opt => opt.idx);

        res.status(200).json({ 
            success: true, 
            data: { 
                isCorrect: correctnessRatio === 1 ? 1 : 0,
                correctnessRatio,
                points,
                score: updatedParticipant.score || 0,
                leaderboard: leaderboardData,
                correctAnswers: correctAnswerIndices
            } 
        });

        console.log('Answer submitted:', {
            participantId: participant.id,
            score: updatedParticipant.score,
            points,
            correctnessRatio
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// Get leaderboard
exports.getLeaderboard = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) {
            return res.status(404).json({ success: false, error: 'Quiz not found' });
        }

        // Get all participants for this quiz
        const participants = await Participant.findByQuizId(quiz.id);

        const leaderboard = participants
            .map(p => ({
                name: p.name,
                score: p.score || 0,
                answeredQuestions: (p.answers || []).length,
                correctAnswers: (p.answers || []).filter(a => a.isCorrect === 1).length
            }))
            .sort((a, b) => b.score - a.score)
            .map((p, index) => ({
                ...p,
                rank: index + 1,
                totalParticipants: participants.length
            }));

        res.status(200).json({ success: true, data: leaderboard });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// Handle participant disconnect
exports.handleDisconnect = async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        // Find participant by sessionId and deviceId
        const participants = await docClient.send(new ScanCommand({
            TableName: Participant.tableName,
            FilterExpression: '(#si = :sessionId OR #di = :deviceId)',
            ExpressionAttributeNames: {
                '#si': 'sessionId',
                '#di': 'deviceId'
            },
            ExpressionAttributeValues: {
                ':sessionId': sessionId,
                ':deviceId': req.body.deviceId
            }
        }));
        
        if (!participants.Items || participants.Items.length === 0) {
            return res.status(404).json({ success: false, error: 'Participant not found' });
        }
        const participant = participants.Items[0];

        // Update participant connection status
        await Participant.update(participant.id, {
            connected: 0,
            lastActive: new Date().toISOString()
        });

        // Get all participants and publish update to Redis
        const allParticipants = await Participant.findByQuizId(participant.quizId);
        const connectedParticipants = allParticipants.filter(p => p.connected === 1);
        
        // Only publish to Redis if available
        const redisClient = req.app.get('redisClient');
        if (redisClient) {
            await redisClient.publish('participant-update', JSON.stringify({
                roomId: participant.quizId.toString(),
                count: connectedParticipants.length,
                participants: connectedParticipants.map(p => ({ name: p.name }))
            }));
        }

        res.status(200).json({ success: true });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// Handle participant reconnect
exports.handleReconnect = async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        // Find participant by sessionId and deviceId
        const participants = await docClient.send(new ScanCommand({
            TableName: Participant.tableName,
            FilterExpression: '(#si = :sessionId OR #di = :deviceId)',
            ExpressionAttributeNames: {
                '#si': 'sessionId',
                '#di': 'deviceId'
            },
            ExpressionAttributeValues: {
                ':sessionId': sessionId,
                ':deviceId': req.body.deviceId
            }
        }));
        
        if (!participants.Items || participants.Items.length === 0) {
            return res.status(404).json({ success: false, error: 'Participant not found' });
        }
        const participant = participants.Items[0];

        // Update participant connection status
        await Participant.update(participant.id, {
            connected: 1,
            lastActive: new Date().toISOString()
        });

        // Get all participants and publish update to Redis
        const allParticipants = await Participant.findByQuizId(participant.quizId);
        const connectedParticipants = allParticipants.filter(p => p.connected === 1);
        
        const redisClient = req.app.get('redisClient');
        await redisClient.publish('participant-update', JSON.stringify({
            roomId: participant.quizId.toString(),
            count: connectedParticipants.length,
            participants: connectedParticipants.map(p => ({ name: p.name }))
        }));

        res.status(200).json({ 
            success: true,
            data: {
                quizId: participant.quizId
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// Generate report
exports.generateReport = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) {
            return res.status(404).json({ success: false, error: 'Quiz not found' });
        }

        // Get all participants for this quiz
        const participants = await Participant.findByQuizId(quiz.id);

        const reportData = participants.map(p => ({
            'Participant Name': p.name,
            'Total Score': p.score || 0,
            'Questions Attempted': (p.answers || []).length,
            'Correct Answers': (p.answers || []).filter(a => a.isCorrect === 1).length,
            'Average Time per Question': p.answers && p.answers.length > 0 
                ? (p.answers.reduce((acc, curr) => acc + (curr.timeTaken || 0), 0) / p.answers.length).toFixed(2)
                : 0
        }));

        // Calculate question statistics from participant answers
        const questionStats = quiz.questions.map((q, idx) => {
            const questionAttempts = participants.filter(p => 
                (p.answers || []).some(a => a.questionIndex === idx)
            ).length;
            const correctAnswers = participants.filter(p =>
                (p.answers || []).some(a => a.questionIndex === idx && a.isCorrect === 1)
            ).length;

            return {
                'Question': q.questionText,
                'Total Attempts': questionAttempts,
                'Correct Answers': correctAnswers,
                'Success Rate': questionAttempts > 0 
                    ? `${Math.round((correctAnswers/questionAttempts) * 100)}%`
                    : '0%'
            };
        });

        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(reportData), 'Participants');
        xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(questionStats), 'Questions');

        // Generate Excel file
        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        // Generate unique filename
        const filename = `quiz-results-${uuidv4()}.xlsx`;
        const filePath = `public/exports/${filename}`;
        
        // Ensure exports directory exists
        const fs = require('fs');
        if (!fs.existsSync('public/exports')) {
            fs.mkdirSync('public/exports', { recursive: true });
        }
        
        // Write file to disk
        fs.writeFileSync(filePath, buffer);
        
        // Send file URL instead of buffer
        res.json({
            success: true,
            data: {
                fileUrl: `/exports/${filename}`
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};
