const express = require('express');
const router = express.Router();
const {
    createQuiz,
    getQuizzes,
    getQuiz,
    updateQuiz,
    deleteQuiz,
    getArchivedQuizzes,
    exportQuizResults,
    copyQuiz,
    startQuiz,
    endQuiz
} = require('../controllers/quizController');

// Main quiz routes
router.route('/')
    .get(getQuizzes)
    .post(createQuiz);

// Archive routes
router.get('/archived', getArchivedQuizzes);
router.get('/:id/export', exportQuizResults);
router.post('/:id/copy', copyQuiz);
router.post('/:id/start', startQuiz);
router.post('/:id/end', endQuiz);

// Individual quiz routes
router.route('/:id')
    .get(getQuiz)
    .put(updateQuiz)
    .delete(deleteQuiz);

module.exports = router;
