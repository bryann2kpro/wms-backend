import { getUserRoleWithPermission } from '../features/rbac/rbac.repository.js';
import { getAdminDataByToken } from '../features/admin/admin.repository.js';
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

  const user = await getAdminDataByToken(token);

  if (!user) {
    return false;
  }

  const userRoleWithPermission = await getUserRoleWithPermission(user.adminId);

  return userRoleWithPermission.some((role) => 
    role.moduleName === moduleName && role.permissionType === permission
  );
}
