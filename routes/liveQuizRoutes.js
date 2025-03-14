const express = require('express');
const router = express.Router();
const {
    startLiveQuiz,
    joinQuiz,
    nextQuestion,
    submitAnswer,
    getLeaderboard,
    generateReport,
    handleDisconnect,
    handleReconnect
} = require('../controllers/liveQuizController');

router.post('/start/:id', startLiveQuiz);
router.post('/join', joinQuiz);
router.post('/next/:id', nextQuestion);
router.post('/answer', submitAnswer);
router.get('/leaderboard/:id', getLeaderboard);
router.get('/report/:id', generateReport);
router.post('/disconnect', handleDisconnect);
router.post('/reconnect', handleReconnect);

module.exports = router;
