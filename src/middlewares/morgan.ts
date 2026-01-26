import morgan from 'morgan';
import { Request } from 'express';
import { http_logger } from '../util/logger.js';

const getIpAddress = (req: Request) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // Convert to string if it's an array
    const ipString = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    return ipString.split(',')[0].trim();
  }

  // Check for other common proxy headers
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return realIp;
  }

  // Fall back to remote address
  return (
    req.socket?.remoteAddress || ''
  );
};

export const morganMiddleware = morgan(
  function (tokens, req: Request, res) {
    return JSON.stringify({
      method: tokens.method(req, res),
      url: tokens.url(req, res) ?? '',
      status: Number.parseFloat(tokens.status(req, res) ?? '0'),
      content_length: tokens.res(req, res, 'content-length') ?? '',
      response_time: Number.parseFloat(tokens['response-time'](req, res) ?? '0'),
      ip_address: getIpAddress(req),
      user_agent: req.headers['user-agent'] ?? '',
    });
  },
  {
    stream: {
      // Configure Morgan to use our custom logger with the http severity
      write: (message) => {
        const data = JSON.parse(message);
        http_logger.http(JSON.stringify(data));
      },
    },
  }
);