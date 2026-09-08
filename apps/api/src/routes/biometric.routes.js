const express = require('express');
const router = express.Router();
const biometricController = require('../controllers/biometric.controller');

router.get('/status', biometricController.getStatus);
router.post('/enroll/options', biometricController.getEnrollOptions);
router.post('/enroll/verify', biometricController.verifyEnroll);
router.post('/auth/options', biometricController.getAuthOptions);
router.post('/auth/verify', biometricController.verifyAuth);

module.exports = router;
