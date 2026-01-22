/**
 * JWT Controller
 * 
 * @description Handles JWT token generation and verification.
 */

import jwt, {JwtPayload} from 'jsonwebtoken';
import dotenv from 'dotenv';
import { UserTokenInfo } from './jwt.model.js';
import { logger } from '@/util/logger.js';

// Load environment variables
dotenv.config();

interface TokenPayload extends JwtPayload {
  [key: string]: any;
  username: string;
  loginType: 'EMAIL' | 'CONTACT_NO';
  sessionId: string;
}

class JwtControllerClass {
  private privateKey: string;
  private publicKey: string;

  constructor() {
    this.privateKey = process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n') ?? '';
    this.publicKey = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n') ?? '';
    
    if (!this.privateKey || !this.publicKey) {
      logger.warn('⚠️ [JwtController] JWT keys not properly configured');
    }
  }

  /**
   * Generate Access Token
   * @param userTokenInfo - User token payload
   * @returns JWT access token string
   */
  generateAccessToken(userTokenInfo: UserTokenInfo): string {
    if (!this.privateKey) {
      logger.error('❌ [JwtController.generateAccessToken] Private key is not defined');
      throw new Error('Private key is not defined in environment variables');
    }
    
    logger.debug('🔍 [JwtController.generateAccessToken] Generating access token for:', userTokenInfo.username);
    
    const token = jwt.sign(
      userTokenInfo,
      this.privateKey,
      {
        algorithm: process.env.JWT_ALGORITHM as jwt.Algorithm,
        expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRATION
      }
    );
    
    logger.debug('✅ [JwtController.generateAccessToken] Access token generated successfully');
    
    return token;
  }

  /**
   * Generate Refresh Token
   * @param userTokenInfo - User token payload
   * @returns JWT refresh token string
   */
  generateRefreshToken(userTokenInfo: UserTokenInfo): string {
    if (!this.privateKey) {
      logger.error('❌ [JwtController.generateRefreshToken] Private key is not defined');
      throw new Error('Private key is not defined in environment variables');
    }
    
    logger.debug('🔍 [JwtController.generateRefreshToken] Generating refresh token for:', userTokenInfo.username);
    
    const token = jwt.sign(
      userTokenInfo,
      this.privateKey,
      {
        algorithm: process.env.JWT_ALGORITHM as jwt.Algorithm,
        expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRATION
      }
    );
    
    logger.debug('✅ [JwtController.generateRefreshToken] Refresh token generated successfully');
    
    return token;
  }

  /**
   * Verify Token
   * @param token - JWT token string
   * @returns Decoded token payload
   */
  verifyToken(token: string): TokenPayload {
    if (!this.publicKey) {
      logger.error('❌ [JwtController.verifyToken] Public key is not defined');
      throw new Error('Public key is not defined in environment variables');
    }
    
    try {
      const decoded = jwt.verify(
        token,
        this.publicKey,
        {
          algorithms: [process.env.JWT_ALGORITHM as jwt.Algorithm]
        }
      ) as TokenPayload;
      
      logger.debug('✅ [JwtController.verifyToken] Token verified successfully for:', decoded.username);
      
      return decoded;
    } catch (error) {
      logger.warn('⚠️ [JwtController.verifyToken] Token verification failed:', error);
      throw new Error('Invalid token');
    }
  }
}

// Export class
export { JwtControllerClass };
