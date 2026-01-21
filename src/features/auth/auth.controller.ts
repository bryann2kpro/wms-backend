// Model
import { CompanyAdminType, SuperAdminType, UserLogin, UserType, UserRoleType, RolePermission, RolePermissionType } from '@/features/auth/auth.model.js';
// Repository
import { getUserByEmail, getUserByContactNo, getSuperAdminByContactNo, getCompanyAdminByContactNo, getSuperAdminByEmail, getCompanyAdminByEmail, createUser, createCompanyAdmin, getUserDataByToken, getCompanyAdminDataByToken, getSuperAdminDataByToken, createUserRole, getUserRole, updateUserRole, getRolePermissionByRoleId, createRolePermission, updateRolePermission, getRolePermision } from '@/features/auth/auth.repository.js';
// Types
import { Request, Response, NextFunction } from 'express';
// JWT
import { generateAccessToken, generateRefreshToken, verifyToken } from '@/features/jwt/index.js';
// Error Types
import { Error } from '@/error/index.js';
// Util
import { isEmail } from '@/util/email.js';
import { isContactNo } from '@/util/contactNo.js';
import { hashPassword, comparePassword } from '@/util/password.js';

// Type definition for UserTokenInfo
type UserTokenInfo = {
  username: string;
  loginType: 'EMAIL' | 'CONTACT_NO';
};

class AuthControllerClass {
  // User Login
  async userLogin(req: Request, res: Response) {
    try {
      const userInfo: UserLogin = req.body;

      // Validate input
      if (!userInfo.username || !userInfo.password) {
        return res.status(400).json({
          success: false,
          message: 'Username and Password are required',
          data: null,
        });
      }

      const username = userInfo.username;

      let user: UserType | null = null;
      let loginType = '';

      // Fetch user based on username type
      if (isEmail(username)) {
        user = await getUserByEmail(username);
        loginType = 'EMAIL';  
      } else if (isContactNo(username)) {
        user = await getUserByContactNo(username);
        loginType = 'CONTACT_NO';
      } 

      // User not found
      if (!user) {
        return res.status(404).json({
          success: false,
          message: Error.INVALID_CREDENTIALS,
          data: null,
        });
      }

      const userTokenInfo: UserTokenInfo = {
        username: userInfo.username,
        loginType: loginType as 'EMAIL' | 'CONTACT_NO', 
      };

      const hashedPassword = user.userPassword; 

      this.verifyPassword(userTokenInfo, userInfo.password, hashedPassword, res);

    } catch (error) {
      console.error('User Login error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  // Admin Login (Company Admin and Super Admin)
  async adminLogin(req: Request, res: Response) {
    try {
      const userInfo: UserLogin = req.body;

      if (!userInfo.username) {
        return res.status(400).json({
          status: false,
          message: 'Username and Password are required',
          data: null,
        });
      }
      
      const username = userInfo.username;
      
      let user: SuperAdminType | CompanyAdminType | null = null;
      let loginType = '';
      let userType = '';
      
      const fetchSuperAdmin  = async () => {
        if (isEmail(username)) {
          loginType = 'EMAIL';
          return await getSuperAdminByEmail(username);
        } else if (isContactNo(username)) {
          loginType = 'CONTACT_NO';
          return await getSuperAdminByContactNo(username);
        }
        return null;
      };
      
      const fetchCompanyAdmin = async () => {
        if (isEmail(username)) {
          loginType = 'EMAIL';
          return await getCompanyAdminByEmail(username);
        } else if (isContactNo(username)) {
          loginType = 'CONTACT_NO';
          return await getCompanyAdminByContactNo(username);
        }
        return null;
      };
      
      // Try to get Super Admin
      user = await fetchSuperAdmin();
      userType = user ? 'SUPER_ADMIN' : '';
      
      // If no Super Admin found, try Company Admin
      if (!user) {
        user = await fetchCompanyAdmin();
        userType = user ? 'COMPANY_ADMIN' : '';
      }
      
      // User not found
      if (!user) {
        return res.status(404).json({
          success: false,
          message: Error.INVALID_CREDENTIALS,
          data: null,
        });
      }
      
      const userTokenInfo: UserTokenInfo = {
        username: userInfo.username,
        loginType: loginType as 'EMAIL' | 'CONTACT_NO',
      };
      
      const getHashedPassword = (user: any, userType: string): string => {
        if (userType === 'SUPER_ADMIN') {
          return Array.isArray(user) ? user[0].superAdminPassword : user.superAdminPassword;
        } else if (userType === 'COMPANY_ADMIN') {
          return Array.isArray(user) ? user[0].companyAdminPassword : user.companyAdminPassword;
        }
        return '';
      };
      
      const hashedPassword = getHashedPassword(user, userType);
      
      this.verifyPassword(userTokenInfo, userInfo.password, hashedPassword, res);
     
    } catch (error) {
      console.error('Admin Login error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null
      });
    }
  }

  // User Registration
  async registerUser(req: Request, res: Response) {
    const userInfo = req.body;

    try {
    // Check if a user with the same email or contact already exists
    const existingUser = await getUserByEmail(userInfo.userEmail) 
      || await getUserByContactNo(userInfo.userContactNo);

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: Error.USER_ALREADY_EXISTS,
        data: null
      });
    }

    // Hash the password
    const hashedPassword = await hashPassword(userInfo.userPassword);
    
    const userData: UserType = {
      userCode: '3', // TODO: Generate user code (Create a helper function)
      userEmail: userInfo.userEmail,
      userContactNo: userInfo.userContactNo,
      userPassword: hashedPassword,
      icNo: userInfo.icNo,
      icFrontPicture: 'front_picture', // TODO: Add default image 
      icBackPicture: 'back_picture', // TODO: Add default image
      userFirstName: userInfo.userFirstName,
      userLastName: userInfo.userLastName,
      gender: userInfo.gender,
      addressId: userInfo.addressId,
      companyId: userInfo.companyId,
      vehicleId: userInfo.vehicleId,
      walletId: userInfo.walletId,
      userSkillId: userInfo.userSkillId,
      jobReviewId: userInfo.jobReviewId,
      roleId: userInfo.roleId,
      sessionId: null,
      status: 'ACTIVE',
      createdBy: 'system',
      updatedBy: 'system'
    };

    await createUser(userData);

    res.status(201).json({
      success: true,
      message: 'User registration successful',
      data: null
    });

  } catch (error) {
    console.error('User Registration error:', error);
    res.status(500).json({
      success: false,
      message: Error.INTERNAL_SERVER_ERROR,
      data: null
    });
    }
  }

  // Role Create
  async roleCreate(req: Request, res: Response) {
    const roleInfo = req.body;
    console.log(roleInfo)
    try {
    // Check if a user role with the same role name already exists
    const existingUserRole = await getUserRole(roleInfo.roleName);

    if (existingUserRole) {
      return res.status(409).json({
        success: false,
        message: Error.USER_ROLE_ALREADY_EXISTS,
        data: null
      });
    }

    const currentDateTime = new Date();
    const userRole: UserRoleType = {
      roleName:      roleInfo.roleName,
      permissionId:  roleInfo.permissionId,
      status:        roleInfo.status,
      createdAt:    currentDateTime, // Timestamp type
      updatedAt:    currentDateTime, // Timestamp type
      createdBy: 'system',
      updatedBy: 'system'
    };

    await createUserRole(userRole);

    res.status(201).json({
      success: true,
      message: 'User role registration successful',
      data: userRole
    });

  } catch (error) {
    console.error('User Role Registration error:', error);
    res.status(500).json({
      success: false,
      message: Error.INTERNAL_SERVER_ERROR,
      data: null
    });
    }
  }

  async getCurrentUser(req: Request, res: Response) {
    const token = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : null;
  if (!token) {
    return res.status(401).json({
      success: false,
      message: Error.UNAUTHORIZED,
      data: null
    });
  }

  const user = await getUserDataByToken(token);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: Error.USER_NOT_FOUND,
      data: null
    });
  }

    return user;
  }

  // Role Update
  async roleUpdate(req: Request, res: Response) {
    const roleInfo = req.body;
    console.log(roleInfo)

    try {
    // Check if a user role with the same role name already exists
    const existingUserRole = await getUserRole(roleInfo.roleName);

    if (existingUserRole) {
      return res.status(409).json({
        success: false,
        message: Error.USER_ROLE_ALREADY_EXISTS,
        data: null
      });
    }

    const currentDateTime = new Date();

    // Ensure roleId is a string without curly braces
    const userRole: UserRoleType = {
      roleId:         roleInfo.roleId,
      roleName:       roleInfo.roleName,
      permissionId:   roleInfo.permissionId,
      status:         roleInfo.status,
      createdAt:      roleInfo.createdAt, // Timestamp type
      updatedAt:      currentDateTime, // Timestamp type
      createdBy:      roleInfo.createdBy,
      updatedBy:      roleInfo.updatedBy
    };

    await updateUserRole(userRole);

    res.status(201).json({
      success: true,
      message: 'User role update successful',
      data: userRole
    });

  } catch (error) {
    console.error('User Role update error:', error);
    res.status(500).json({
      success: false,
      message: Error.INTERNAL_SERVER_ERROR,
      data: null
    });
    }
  }

  // Permission Create
  async permissionCreate(req: Request, res: Response) {
    const permissionInfo = req.body;
    console.log(permissionInfo)
    try {
    // Check if a user role with the same role name already exists
    const existingRolePermission = await getRolePermision(permissionInfo.permissionName);

    if (existingRolePermission) {
      return res.status(409).json({
        success: false,
        message: Error.ROLE_PERMISSION_ALREADY_EXISTS,
        data: null
      });
    }

    const currentDateTime = new Date();
    const rolePermission: RolePermissionType = {
      permissionId:  permissionInfo.permissionId,
      permissionName:      permissionInfo.permissionName,
      policy:        permissionInfo.policy,
      status:        permissionInfo.status,
      createdAt:    currentDateTime, // Timestamp type
      updatedAt:    currentDateTime, // Timestamp type
      createdBy: 'system',
      updatedBy: 'system'
    };

    await createRolePermission(rolePermission);

    res.status(201).json({
      success: true,
      message: 'Role Permission created successful',
      data: rolePermission
    });

  } catch (error) {
    console.error('Role Permission Registration error:', error);
    res.status(500).json({
      success: false,
      message: Error.INTERNAL_SERVER_ERROR,
      data: null
    });
    }
  }

  // Permission Update
  async permissionUpdate(req: Request, res: Response) {
    const permissionInfo = req.body;
    console.log(permissionInfo)

    try {
    // Check if a role permission with the same permission name already exists
    const existingRolePermission = await getRolePermision(permissionInfo.permissionName);

    if (existingRolePermission) {
      return res.status(409).json({
        success: false,
        message: Error.ROLE_PERMISSION_ALREADY_EXISTS,
        data: null
      });
    }

    const currentDateTime = new Date();

    // Ensure roleId is a string without curly braces
    const rolePermission: RolePermissionType = {
      permissionId:  permissionInfo.permissionId,
      permissionName:      permissionInfo.permissionName,
      policy:        permissionInfo.policy,
      status:        permissionInfo.status,
      createdAt:    permissionInfo.createdAt, // Timestamp type
      updatedAt:    currentDateTime, // Timestamp type
      createdBy:      permissionInfo.createdBy,
      updatedBy:      permissionInfo.updatedBy
    };

    await updateRolePermission(rolePermission);

    res.status(201).json({
      success: true,
      message: 'Role Permission update successful',
      data: rolePermission
    });

  } catch (error) {
    console.error('Role Permission update error:', error);
    res.status(500).json({
      success: false,
      message: Error.INTERNAL_SERVER_ERROR,
      data: null
    });
    }
  }

  // Company Admin Registration
  async registerCompanyAdmin(req: Request, res: Response) {
    const adminInfo = req.body;

    try {
    // Check if a company admin with the same email or contact already exists
    const existingAdmin = await getCompanyAdminByEmail(adminInfo.companyAdminEmail) 
      || await getCompanyAdminByContactNo(adminInfo.companyAdminContactNo);

    if (existingAdmin) {
      return res.status(409).json({
        success: false,
        message: Error.USER_ALREADY_EXISTS,
        data: null
      });
    }

    // Hash the password
    const hashedPassword = await hashPassword(adminInfo.companyAdminPassword);
    
    const adminData: CompanyAdminType = {
      companyAdminFirstName: adminInfo.companyAdminFirstName,
      companyAdminLastName: adminInfo.companyAdminLastName,
      companyAdminContactNo: adminInfo.companyAdminContactNo,
      companyAdminPassword: hashedPassword,
      companyAdminEmail: adminInfo.companyAdminEmail,
      companyId: adminInfo.companyId,
      boolModule: adminInfo.boolModule,
      moduleAccessId: adminInfo.moduleAccessId,
      boolPermission: adminInfo.boolPermission,
      roleId: adminInfo.roleId,
      sessionId: null,
      status: 'ACTIVE',
      createdBy: 'system',
      updatedBy: 'system'
    };

    await createCompanyAdmin(adminData);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: null
    });

  } catch (error) {
    console.error('Company Admin Registration error:', error);
    res.status(500).json({
      success: false,
      message: Error.INTERNAL_SERVER_ERROR,
      data: null
    });
    }
  }

  async getUserByToken(req: Request, res: Response) {
    // get Bearer token from header
    const token = req.headers.authorization?.startsWith('Bearer ') 
      ? req.headers.authorization.split(' ')[1] 
      : null; // Check for Bearer prefix

    if (!token) {
      return res.status(401).json({
        success: false,
        message: Error.TOKEN_IS_REQUIRED,
        data: null
      });
    }

    try {
      const user = await getUserDataByToken(token);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: Error.USER_NOT_FOUND,
          data: null
        });
      }

      const permissionId = await getRolePermissionByRoleId(user.roleId ? user.roleId : '');

      return res.status(200).json({
        success: true,
        message: "User fetched successfully",
        data: {
          userId: user.userId,
          roleId: user.roleId,
          permissionId: permissionId
        }
      });
    } catch (error) {
      console.error('Error in getUserByToken:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null
      });
    }
  }

  async getCompanyAdminByToken(req: Request, res: Response) {
    // get Bearer token from header
    const token = req.headers.authorization?.startsWith('Bearer ') 
      ? req.headers.authorization.split(' ')[1] 
      : null; // Check for Bearer prefix

    if (!token) {
      return res.status(401).json({
        success: false,
        message: Error.UNAUTHORIZED,
        data: null
      });
    }

    const user = await getCompanyAdminDataByToken(token);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: Error.USER_NOT_FOUND,
        data: null
      });
    } 
  }

  async getSuperAdminByToken(req: Request, res: Response) {
    // get Bearer token from header
    const token = req.headers.authorization?.startsWith('Bearer ') 
      ? req.headers.authorization.split(' ')[1] 
      : null; // Check for Bearer prefix

    if (!token) {
      return res.status(401).json({
        success: false,
        message: Error.UNAUTHORIZED,
        data: null
      });
    }

    const user = await getSuperAdminDataByToken(token);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: Error.USER_NOT_FOUND,
        data: null
      });
    } 
  }

  // Refresh Token - Need to be updated

  // Verify Password
  private async verifyPassword(userTokenInfo: UserTokenInfo, password: string, hashedPassword: string, res: Response) {
    try {
      const isPasswordCorrect = await comparePassword(password, hashedPassword);
      if (!isPasswordCorrect) {
        return res.status(401).json({
          success: false,
          message: 'Username or Password Incorrect',
          data: null
        });
      }

      const accessToken = generateAccessToken(userTokenInfo);
      const refreshToken = generateRefreshToken(userTokenInfo);
      const accessTokenExpiration = verifyToken(accessToken).exp;

      if (accessTokenExpiration === undefined) {
        console.error('Verify Password Error: Token expiration is undefined');
        return res.status(500).json({
          success: false,
          message: Error.INTERNAL_SERVER_ERROR,
          data: null
        });
      }

      res.status(200).json({
        success: true,
        message: '',
        data: {
          accessToken: accessToken,
          refreshToken: refreshToken,
          expiredAt: accessTokenExpiration * 1000,
        }
      });
    } catch (error) {
      console.error('Password verification error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null
      });
    }
  }
}

// Export an instance of the class
export const authController = new AuthControllerClass();

// Export individual methods for backward compatibility
export const userLogin = authController.userLogin.bind(authController);
export const adminLogin = authController.adminLogin.bind(authController);
export const registerUser = authController.registerUser.bind(authController);
export const roleCreate = authController.roleCreate.bind(authController);
export const getCurrentUser = authController.getCurrentUser.bind(authController);
export const roleUpdate = authController.roleUpdate.bind(authController);
export const permissionCreate = authController.permissionCreate.bind(authController);
export const permissionUpdate = authController.permissionUpdate.bind(authController);
export const registerCompanyAdmin = authController.registerCompanyAdmin.bind(authController);
export const getUserByToken = authController.getUserByToken.bind(authController);
export const getCompanyAdminByToken = authController.getCompanyAdminByToken.bind(authController);
export const getSuperAdminByToken = authController.getSuperAdminByToken.bind(authController);
