import winston from 'winston';
import LokiTransport from 'winston-loki';
import dotenv from 'dotenv';
import { env } from '@/env';

dotenv.config();

const { combine, timestamp, json } = winston.format;

export const logger = winston.createLogger({
    // set LOG_LEVEL to 'debug' to see all logs and for production set to 'info'
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',  
    format: combine(
      timestamp({
        format: 'YYYY-MM-DD hh:mm:ss.SSS A',
      }),
      json()
    ),
    transports: [
      new winston.transports.Console(),
      new LokiTransport({
        host: process.env.LOKI_HOST || 'http://localhost:3100',
        labels: {
          service: 'optimal-api',
          environment: env.NODE_ENV || 'development'
        },
        json: true,
        replaceTimestamp: true,
      })
    ],
});