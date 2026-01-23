import { authRepository } from '@/composition-root.js';
import { Request, Response, NextFunction } from 'express';
import { Error } from '../error/index.js';

export const requiredPermission = (moduleName: string, permission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const permissionGranted = await hasPermission(req, moduleName, permission);
    if (!permissionGranted) {
      return res.status(403).json({
        success: false,
        message: Error.FORBIDDEN,
        data: null,
      });
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

  const userRoleWithPermission = await authRepository.getUserRoleWithPermission(user.id);

  // Straight Allow Access for Super Admin
  if (userRoleWithPermission[0]?.roleName === "Super Admin") {
    return true;
  }


  return userRoleWithPermission.some((role) => {
    console.log("--------------------------------");
    console.log("Role Module Name:", role.moduleName);
    console.log("Module Name:", moduleName);
    console.log("Role Permission Type:", role.permissionType);
    console.log("Permission Type:", permission);  
    console.log("--------------------------------");
    return role.moduleName === moduleName && role.permissionType === permission
  }
  );
}
