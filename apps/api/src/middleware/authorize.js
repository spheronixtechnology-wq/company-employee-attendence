const { forbidden } = require('../utils/response');

const authorize = (...roles) => (req, res, next) => {
  if (req.user && roles.includes(req.user.role)) {
    return next();
  }
  return forbidden(res, 'Access denied.');
};

module.exports = authorize;
