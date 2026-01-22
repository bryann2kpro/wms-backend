import { Request, Response, NextFunction } from 'express';
import { jwtController } from '@/composition-root.js';
import { Error } from '../error/index.js';

const authenticateJWT = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.header('Authorization')?.split(' ')[1];

  if (!token) {
    console.log("No Token: ", token);
    return res.status(401).json({ message: Error.UNAUTHORIZED });
  }

  try {
    const user = await jwtController.verifyToken(token);
    if (user.statusCode === 401) {
      return res.status(401).json({ message: Error.UNAUTHORIZED });
    }
    next();
  } catch (error) {
    console.log("Error: ", error);
    return res.status(401).json({ message: Error.UNAUTHORIZED });
  }
};

export default authenticateJWT;