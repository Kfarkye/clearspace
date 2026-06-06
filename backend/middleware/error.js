import { SubstrateErrorCode, structuredError, Severity } from '../lib/errors.js';

export function errorHandler(err, req, res, next) {
  // If headers already sent, delegate to default express handler
  if (res.headersSent) {
    return next(err);
  }

  // Determine error code and status
  let errorCode = err.code || SubstrateErrorCode.TRANSFORM_FAULT;
  let statusCode = err.status || 500;
  
  if (statusCode === 500 && !err.code) {
      errorCode = SubstrateErrorCode.TRANSFORM_FAULT;
  }

  // Log structured error
  structuredError(errorCode, err.message, { 
    path: req.path, 
    method: req.method,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined 
  }, statusCode >= 500 ? Severity.ERROR : Severity.WARNING);

  // Send predictable response contract
  res.status(statusCode).json({
    error: {
      code: errorCode,
      message: err.message || 'Internal Server Error'
    }
  });
}
