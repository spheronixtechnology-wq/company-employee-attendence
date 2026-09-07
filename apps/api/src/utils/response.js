/**
 * Standard API response helpers.
 * All routes must use these to ensure consistent response shape.
 */

const success = (res, message = 'Success', data = null, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const error = (res, message = 'An error occurred', statusCode = 500, details = null) => {
  const response = { success: false, message };
  if (details && process.env.NODE_ENV === 'development') {
    response.error = details;
  }
  return res.status(statusCode).json(response);
};

const created = (res, message = 'Created successfully', data = null) => {
  return success(res, message, data, 201);
};

const notFound = (res, message = 'Resource not found') => {
  return error(res, message, 404);
};

const unauthorized = (res, message = 'Unauthorized') => {
  return error(res, message, 401);
};

const forbidden = (res, message = 'Forbidden') => {
  return error(res, message, 403);
};

const badRequest = (res, message = 'Bad request', details = null) => {
  return error(res, message, 400, details);
};

module.exports = { success, error, created, notFound, unauthorized, forbidden, badRequest };
