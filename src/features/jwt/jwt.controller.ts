import jwt, {JwtPayload} from 'jsonwebtoken';
import dotenv from 'dotenv';
import { UserTokenInfo } from './jwt.model.js';

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
  }

  generateAccessToken(userTokenInfo: UserTokenInfo): string {
    if (!this.privateKey) {
      throw new Error('Private key is not defined in environment variables');
    }
    
    return jwt.sign(
      userTokenInfo,
      this.privateKey,
      {
        algorithm: process.env.JWT_ALGORITHM as jwt.Algorithm,
        expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRATION
      }
    );
  }

  generateRefreshToken(userTokenInfo: UserTokenInfo): string {
    if (!this.privateKey) {
      throw new Error('Private key is not defined in environment variables');
    }
    
    return jwt.sign(
      userTokenInfo,
      this.privateKey,
      {
        algorithm: process.env.JWT_ALGORITHM as jwt.Algorithm,
        expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRATION
      }
    );
  }

  // Verify Token
  verifyToken(token: string): TokenPayload {
    if (!this.publicKey) {
      throw new Error('Public key is not defined in environment variables');
    }
    
    try {
      return jwt.verify(
        token,
        this.publicKey,
        {
          algorithms: [process.env.JWT_ALGORITHM as jwt.Algorithm]
        }
      ) as TokenPayload;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }
}

// Export class
export { JwtControllerClass };
