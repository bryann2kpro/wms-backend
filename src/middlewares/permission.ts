import { authRepository } from '@/composition-root.js';
import { Request, Response, NextFunction } from 'express';
import { Error } from '../error/index.js';

export const requiredPermission = (moduleName: string, permission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const permissionGranted = await hasPermission(req, moduleName, permission);
    if (!permissionGranted) {
      return res.status(403).json({ message: Error.FORBIDDEN });
    }
    next();
  }
}

export const hasPermission = async (req: Request, moduleName: string, permission: string) => {
  const token = req.header('Authorization')?.split(' ')[1];

  if (!token) {
    return false;
  }

  const user = await authRepository.getUserDataByToken(token);

  if (!user) {
    return false;
  }

  const userRoleWithPermission = await authRepository.getUserRoles(user.id);

  return userRoleWithPermission.some((role: any) => 
    role.moduleName === moduleName && role.permissionType === permission
  );
}
