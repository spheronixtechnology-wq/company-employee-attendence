const express = require('express');
const router = express.Router();

const { login, logout, getMe, requestDeviceAccess } = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');
const { body, validationResult } = require('express-validator');
const { badRequest } = require('../utils/response');

// Validation middleware
const validateLogin = [
  body('email').isEmail().withMessage('Invalid email format').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return badRequest(res, errors.array()[0].msg);
    }
    next();
  },
];

/**
 * @route   POST /api/auth/login
 * @desc    Login and receive JWT cookie
 * @access  Public
 */
router.post('/login', validateLogin, login);

/**
 * @route   POST /api/auth/device-access-request
 * @desc    Submit device replacement/access request from login screen
 * @access  Public (credential-verified)
 */
router.post('/device-access-request', requestDeviceAccess);

/**
 * @route   POST /api/auth/logout
 * @desc    Clear JWT cookie and logout
 * @access  Private
 */
router.post('/logout', authenticate, logout);

/**
 * @route   GET /api/auth/me
 * @desc    Get current logged-in user profile + permissions
 * @access  Private
 */
router.get('/me', authenticate, getMe);

module.exports = router;
