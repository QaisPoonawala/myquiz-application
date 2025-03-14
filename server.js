const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const { createAdapter } = require('@socket.io/redis-adapter');
const { connectDB, docClient } = require('./config/db');
const Participant = require('./models/Participant');
const Quiz = require('./models/Quiz');

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Socket.IO setup with optional Redis adapter
let io;
if (process.env.REDIS_URL) {
    // Redis setup for Socket.IO scaling in production
    const redisOptions = {
        retryStrategy: (times) => {
            const delay = Math.min(times * 500, 5000);
            console.log(`Redis connection attempt ${times}, retrying in ${delay}ms`);
            return delay;
        },
        maxRetriesPerRequest: 5,
        enableReadyCheck: true,
        reconnectOnError: (err) => {
            console.error('Redis reconnect on error:', err);
            const targetError = 'READONLY';
            if (err.message.includes(targetError)) {
                // Only reconnect if it's a READONLY error
                return true;
            }
            return false;
        },
        // TLS options for AWS ElastiCache
        tls: process.env.REDIS_TLS_ENABLED === 'true' ? {
            rejectUnauthorized: false // Required for self-signed certs
        } : undefined,
        retryUnfulfilledCommands: true,
        maxReconnectAttempts: 10,
        connectTimeout: 20000,
        disconnectTimeout: 20000
    };

    const pubClient = new Redis(process.env.REDIS_URL, redisOptions);

    const subClient = pubClient.duplicate();

    // Monitor Redis connection state
    const monitorRedisConnection = (client, name) => {
        client.on('connect', () => {
            console.log(`Redis ${name} client connected`);
        });

        client.on('ready', () => {
            console.log(`Redis ${name} client ready`);
        });

        client.on('error', (err) => {
            console.error(`Redis ${name} client error:`, err);
        });

        client.on('close', () => {
            console.log(`Redis ${name} client closed`);
        });

        client.on('reconnecting', (delay) => {
            console.log(`Redis ${name} client reconnecting in ${delay}ms`);
        });

        client.on('end', () => {
            console.log(`Redis ${name} client ended`);
        });
    };

    monitorRedisConnection(pubClient, 'pub');
    monitorRedisConnection(subClient, 'sub');

    // Enhanced error handlers and connection monitoring
    pubClient.on('error', (err) => {
        console.error('Redis Pub Client Error:', err);
    });

    pubClient.on('connect', () => {
        console.log('Redis Pub Client Connected');
    });

    pubClient.on('ready', () => {
        console.log('Redis Pub Client Ready');
    });

    subClient.on('error', (err) => {
        console.error('Redis Sub Client Error:', err);
    });

    subClient.on('connect', () => {
        console.log('Redis Sub Client Connected');
    });

    subClient.on('ready', () => {
        console.log('Redis Sub Client Ready');
    });

    // Store Redis client in app for use in routes
    app.set('redisClient', pubClient);

    io = new Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        },
        adapter: createAdapter(pubClient, subClient),
        connectTimeout: 45000,
        pingTimeout: 30000,
        pingInterval: 25000,
        transports: ['websocket', 'polling'],
        allowUpgrades: true,
        upgradeTimeout: 10000,
        maxHttpBufferSize: 1e8
    });

    // Monitor socket connections
    io.engine.on('connection_error', (err) => {
        console.error('Socket.IO connection error:', err);
    });
    console.log('Socket.IO initialized with Redis adapter for AWS');

    // Monitor Redis adapter events
    io.of('/').adapter.on('error', (error) => {
        console.error('Redis adapter error:', error);
    });

    io.of('/').adapter.on('join-room', (room, id) => {
        console.log(`Socket ${id} joined room ${room}`);
    });

    io.of('/').adapter.on('leave-room', (room, id) => {
        console.log(`Socket ${id} left room ${room}`);
    });
} else {
    // Basic Socket.IO setup for local development
    io = new Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        },
        connectTimeout: 45000, // Consistent timeout even in development
        pingTimeout: 30000,
        pingInterval: 25000
    });
    console.log('Socket.IO initialized without Redis (local development mode)');
}

// Health check endpoint for AWS
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

// Connect to database
connectDB();

// Share io instance with Express app
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use('/api/quiz', require('./routes/quizRoutes'));
app.use('/api/live', require('./routes/liveQuizRoutes'));

// WebSocket handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('host-quiz', async ({ quizId }) => {
        try {
            const roomId = quizId.toString();
            socket.join(roomId);
            console.log(`Host joined room ${roomId}`);
            
            // Get current participant count
            const quiz = await Quiz.findById(quizId);
            const participants = await Participant.findByQuizId(quizId);
            const participantCount = participants.filter(p => p.connected).length;
            
            console.log(`Broadcasting participant count to room ${roomId}:`, {
                count: participantCount,
                participants: participants.filter(p => p.connected).map(p => p.name)
            });
            
            io.in(roomId).emit('participant-count', { 
                count: participantCount,
                participants: participants.filter(p => p.connected).map(p => ({ name: p.name }))
            });
        } catch (error) {
            socket.emit('error', error.message);
        }
    });

    socket.on('join-quiz', async ({ sessionId }) => {
        try {
            const participants = await Participant.findBySessionId(sessionId);
            const participant = participants[0];
            if (!participant) {
                socket.emit('error', 'Invalid session');
                return;
            }

            const quiz = await Quiz.findById(participant.quizId);
            if (!quiz || quiz.isLive !== 1) {
                socket.emit('error', 'Quiz not active');
                return;
            }

            const roomId = quiz.id.toString();
            socket.join(roomId);
            console.log(`Client ${socket.id} joined room ${roomId}`);
            
            await Participant.update(participant.id, { 
                connected: 1, 
                socketId: socket.id 
            });

            // If there's an active question, send it immediately
            if (quiz.currentQuestion >= 0) {
                const currentQuestion = quiz.questions[quiz.currentQuestion];
                console.log(`Sending current question to new participant in room ${roomId}:`, {
                    questionIndex: quiz.currentQuestion,
                    questionText: currentQuestion.questionText
                });
                socket.emit('new-question', {
                    question: {
                        questionText: currentQuestion.questionText,
                        options: currentQuestion.options.map(opt => ({
                            text: opt.text,
                            isCorrect: opt.isCorrect
                        }))
                    },
                    timeLimit: currentQuestion.timeLimit,
                    questionStartTime: quiz.questionStartTime
                });
            }

            // Update participant count
            const allParticipants = await Participant.findByQuizId(quiz.id);
            const participantCount = allParticipants.filter(p => p.connected).length;
            io.in(roomId).emit('participant-count', { 
                count: participantCount,
                participants: allParticipants.filter(p => p.connected).map(p => ({ name: p.name }))
            });

            if (quiz.currentQuestion >= 0) {
                socket.emit('quiz-joined', {
                    currentQuestion: quiz.currentQuestion,
                    questionStartTime: quiz.questionStartTime,
                    question: quiz.questions[quiz.currentQuestion],
                    timeLimit: quiz.questions[quiz.currentQuestion].timeLimit
                });
            } else {
                socket.emit('quiz-joined', {
                    currentQuestion: -1
                });
            }
        } catch (error) {
            socket.emit('error', error.message);
        }
    });

    socket.on('submit-answer', async ({ sessionId, answer, timeTaken }) => {
        try {
            const participants = await Participant.findBySessionId(sessionId);
            const participant = participants[0];
            if (!participant) {
                socket.emit('error', 'Invalid session');
                return;
            }

            const quiz = await Quiz.findById(participant.quizId);
            if (!quiz || quiz.isLive !== 1) {
                socket.emit('error', 'Quiz not active');
                return;
            }

            const currentQuestion = quiz.questions[quiz.currentQuestion];
            
            // Validate answer index
            if (answer < 0 || answer >= currentQuestion.options.length) {
                socket.emit('error', 'Invalid answer index');
                return;
            }

            const isCorrect = currentQuestion.options[answer].isCorrect === 1;
            
            // Calculate points based on time taken (max 100 points)
            // If correct: points = max(10, 100 - (timeTaken/timeLimit * 90))
            // This ensures minimum 10 points for correct answers, scaling up to 100 based on speed
            const timeLimit = currentQuestion.timeLimit || 30; // default 30 seconds if not specified
            let points = 0;
            if (isCorrect) {
                const timeRatio = Math.min(timeTaken / timeLimit, 1); // Cap at 1 to prevent negative points
                points = Math.round(100 - (timeRatio * 90)); // Scales from 100 down to 10
                points = Math.max(10, points); // Ensure minimum 10 points for correct answers
            }

            console.log('Processing answer:', {
                questionIndex: quiz.currentQuestion,
                answerIndex: answer,
                optionSelected: currentQuestion.options[answer],
                isCorrect,
                timeTaken,
                timeLimit,
                points
            });

            // Update participant score and answers
            const newScore = (participant.score || 0) + points;
            // Store answer with points
            const newAnswer = {
                questionIndex: quiz.currentQuestion,
                answeredAt: new Date().toISOString(),
                isCorrect: isCorrect ? 1 : 0,
                timeTaken,
                points,
                answer // Store which option was selected
            };

            console.log('Submitting answer:', {
                isCorrect,
                timeTaken,
                points,
                answer,
                questionIndex: quiz.currentQuestion
            });

            await Participant.update(participant.id, {
                score: newScore,
                answers: [...(participant.answers || []), newAnswer]
            });

            // Update leaderboard
            const allParticipants = await Participant.findByQuizId(quiz.id);
            const leaderboard = allParticipants
                .map(p => ({
                    name: p.name,
                    score: p.score || 0,
                    answeredQuestions: (p.answers || []).length,
                    correctAnswers: (p.answers || []).filter(a => a.isCorrect === 1).length
                }))
                .sort((a, b) => b.score - a.score);

            // Emit both leaderboard update and answer result
            const roomId = quiz.id.toString();
            io.in(roomId).emit('leaderboard-update', leaderboard);
            socket.emit('answer-result', {
                isCorrect: isCorrect ? 1 : 0,
                points,
                score: newScore,
                totalScore: newScore // Include total score for display
            });

            // Log the points being awarded
            console.log('Points awarded:', {
                participantId: participant.id,
                questionIndex: quiz.currentQuestion,
                isCorrect,
                timeTaken,
                points,
                newTotalScore: newScore
            });

        } catch (error) {
            socket.emit('error', error.message);
        }
    });

    socket.on('disconnect', async () => {
        try {
            const participants = await Participant.findBySocketId(socket.id);
            const participant = participants[0];
            if (participant) {
                await Participant.update(participant.id, { 
                    connected: 0, 
                    lastActive: new Date().toISOString() 
                });

                // Update participant count
                const allParticipants = await Participant.findByQuizId(participant.quizId);
                const participantCount = allParticipants.filter(p => p.connected).length;
                const roomId = participant.quizId.toString();
                io.in(roomId).emit('participant-count', { 
                    count: participantCount,
                    participants: allParticipants.filter(p => p.connected).map(p => ({ name: p.name }))
                });
            }
        } catch (error) {
            console.error('Disconnect error:', error);
        }
    });
});

const PORT = process.env.PORT || 5001;

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
