import 'dotenv/config';

import { hashPassword } from '@/util/password-checker';
import { UserType } from '@/features/auth/auth.model';
import { RoleCode, ModuleName, PermissionTypeCode, ModuleType, PermissionType } from '@/features/rbac/rbac.model';
import { logger } from '@/util/logger';
import { authRepository, rbacRepository } from '@/composition-root';

type CreateUserData = Omit<UserType, 'id' | 'createdAt' | 'updatedAt'>;

// ============================================
// RBAC MODULE INITIALIZATION
// ============================================

/**
 * Get or create a module by name, returns the module
 */
async function getOrCreateModule(moduleName: string): Promise<ModuleType> {
  const existingModule = await rbacRepository.getModuleByName(moduleName);
  
  if (existingModule) {
    logger.info(`✓ Module "${moduleName}" already exists`);
    return existingModule;
  }

  const newModule = await rbacRepository.createModule({
    moduleName,
    status: 'active',
    createdBy: 'system',
    updatedBy: 'system'
  });

  logger.info(`✅ Module "${moduleName}" created successfully`);
  return newModule;
}

/**
 * Get or create a permission for a module
 */
async function getOrCreatePermission(
  moduleId: string, 
  permissionType: string, 
  description: string
): Promise<PermissionType> {
  // Check if permission exists
  const existingPermissions = await rbacRepository.getPermission({
    moduleId,
    permissionType,
  });
  
  if (existingPermissions.length > 0) {
    logger.info(`✓ Permission "${permissionType}" already exists for module`);
    return existingPermissions[0];
  }

  const newPermission = await rbacRepository.createPermission({
    moduleId,
    permissionType,
    description,
    status: 'active',
    createdBy: 'system',
    updatedBy: 'system'
  });

  logger.info(`✅ Permission "${permissionType}" created successfully`);
  return newPermission;
}

/**
 * Assign permission to role if not already assigned
 */
async function assignPermissionToRoleIfNeeded(roleId: string, permissionId: string): Promise<void> {
  try {
    const existingRolePermissions = await rbacRepository.getRolePermission({ roleId, permissionId });
    
    if (existingRolePermissions.length > 0) {
      logger.info(`✓ Permission already assigned to role`);
      return;
    }

    await rbacRepository.createRolePermission({
      roleId,
      permissionId,
      createdBy: 'system',
      updatedBy: 'system',
    });
    
    logger.info(`✅ Permission assigned to role successfully`);
  } catch (error) {
    logger.error('❌ Error assigning permission to role:', error);
    throw error;
  }
}

/**
 * Initialize RBAC module with basic permissions
 */
async function initRbacModule(): Promise<void> {
  logger.info('📦 Initializing RBAC module...');
  
  // Create RBAC module (for Role management)
  const rbacModule = await getOrCreateModule(ModuleName.ROLE);
  
  // Create basic CRUD permissions for RBAC
  const permissions = [
    { type: PermissionTypeCode.VIEW, desc: 'View roles and permissions' },
    { type: PermissionTypeCode.CREATE, desc: 'Create new roles' },
    { type: PermissionTypeCode.UPDATE, desc: 'Update existing roles' },
    { type: PermissionTypeCode.DELETE, desc: 'Delete roles' },
  ];

  const createdPermissions: PermissionType[] = [];
  
  for (const perm of permissions) {
    const permission = await getOrCreatePermission(rbacModule.moduleId, perm.type, perm.desc);
    createdPermissions.push(permission);
  }

  // Get the Admin role and assign all RBAC permissions to it
  const adminRole = await authRepository.getRoleByName(RoleCode.ADMIN);
  
  if (adminRole) {
    logger.info('🔐 Assigning RBAC permissions to Admin role...');
    for (const permission of createdPermissions) {
      await assignPermissionToRoleIfNeeded(adminRole.roleId, permission.permissionId);
    }
    logger.info('✅ Admin role now has full RBAC permissions');
  } else {
    logger.warn('⚠️ Admin role not found - please run initAdminUser first');
  }

  // Also assign to Management role
  const managementRole = await authRepository.getRoleByName(RoleCode.MANAGEMENT);
  
  if (managementRole) {
    logger.info('🔐 Assigning RBAC permissions to Management role...');
    for (const permission of createdPermissions) {
      await assignPermissionToRoleIfNeeded(managementRole.roleId, permission.permissionId);
    }
    logger.info('✅ Management role now has full RBAC permissions');
  }

  logger.info('✅ RBAC module initialization complete!');
}

/**
 * Create a user account
 */
async function createUser(userData: CreateUserData): Promise<UserType> {
  try {
    const createdUser = await authRepository.createUser(userData);
    return createdUser;
  } catch (error) {
    logger.error('❌ Error creating user:', error);
    throw error;
  }
}

/**
 * Get or create a role by name, returns the role ID
 */
async function getOrCreateRole(roleName: string): Promise<string> {
  // Check if role exists
  const existingRole = await authRepository.getRoleByName(roleName);
  
  if (existingRole && existingRole.roleId) {
    logger.info(`✓ Role "${roleName}" already exists`);
    return existingRole.roleId;
  }

  // Create the role if it doesn't exist
  const newRole = await authRepository.createRole({
    roleName,
    status: 'active',
    createdBy: 'system',
    updatedBy: 'system'
  });

  logger.info(`✅ Role "${roleName}" created successfully`);
  return newRole.roleId;
}

/**
 * Assign role to user if not already assigned
 */
async function assignRoleToUserIfNeeded(userId: string, roleId: string): Promise<void> {
  try {
    // Check if user already has this role
    const userRoles = await authRepository.getUserRoles(userId);
    const hasRole = userRoles.some(r => r.roleId === roleId);
    
    if (hasRole) {
      logger.info(`✓ User already has the role assigned`);
      return;
    }

    // Assign the role
    await authRepository.assignRoleToUser({
      userId,
      roleId,
      status: 'active',
      createdBy: 'system',
      updatedBy: 'system',
    });
    
    logger.info(`✅ Role assigned to user successfully`);
  } catch (error) {
    logger.error('❌ Error assigning role to user:', error);
    throw error;
  }
}

/**
 * Create admin user account if it doesn't exist
 */
async function initAdminUser(): Promise<void> {
  const email = 'admin@smee.com.my';
  const password = 'admin123';
  
  const existingAdminUser = await authRepository.getUserByEmail(email);
  
  if (!existingAdminUser) {
    // Get or create the ADMIN role first
    const adminRoleId = await getOrCreateRole(RoleCode.ADMIN);
    
    const hashedPassword = await hashPassword(password);

    const user = await createUser({
      email,
      displayName: 'Admin',
      passwordHash: hashedPassword,
      contactNo: '+60123567891',
      isActive: true,
      createdBy: 'system',
      updatedBy: 'system',
    });

    // Assign role to user via junction table
    await assignRoleToUserIfNeeded(user.id, adminRoleId);
    
    logger.info('✅ Admin user account created successfully!');
    logger.info(`   Email: ${email}`);
    logger.debug(`   Password: ${password}`);
  } else {
    logger.info('✓ Admin user account already exists');
    
    // Ensure role is assigned even if user exists
    const adminRoleId = await getOrCreateRole(RoleCode.ADMIN);
    await assignRoleToUserIfNeeded(existingAdminUser.id, adminRoleId);
  }
}

/**
 * Create storekeeper user account if it doesn't exist
 */
async function initStorekeeperUser(): Promise<void> {
  const email = 'storekeeper@smee.com.my';
  const password = 'storekeeper123';
  
  const existingUser = await authRepository.getUserByEmail(email);
  
  if (!existingUser) {
    const roleId = await getOrCreateRole(RoleCode.STOREKEEPER);
    const hashedPassword = await hashPassword(password);

    const user = await createUser({
      email,
      displayName: 'Storekeeper',
      passwordHash: hashedPassword,
      contactNo: '+60123567892',
      isActive: true,
      createdBy: 'system',
      updatedBy: 'system',
    });

    // Assign role to user via junction table
    await assignRoleToUserIfNeeded(user.id, roleId);
    
    logger.info('✅ Storekeeper user account created successfully!');
    logger.info(`   Email: ${email}`);
    logger.debug(`   Password: ${password}`);
  } else {
    logger.info('✓ Storekeeper user account already exists');
    
    // Ensure role is assigned even if user exists
    const roleId = await getOrCreateRole(RoleCode.STOREKEEPER);
    await assignRoleToUserIfNeeded(existingUser.id, roleId);
  }
}

/**
 * Create logistic/driver user account if it doesn't exist
 */
async function initLogisticUser(): Promise<void> {
  const email = 'driver@smee.com.my';
  const password = 'driver123';
  
  const existingUser = await authRepository.getUserByEmail(email);
  
  if (!existingUser) {
    const roleId = await getOrCreateRole(RoleCode.LOGISTIC);
    const hashedPassword = await hashPassword(password);

    const user = await createUser({
      email,
      displayName: 'Driver',
      passwordHash: hashedPassword,
      contactNo: '+60123567893',
      isActive: true,
      createdBy: 'system',
      updatedBy: 'system',
    });

    // Assign role to user via junction table
    await assignRoleToUserIfNeeded(user.id, roleId);
    
    logger.info('✅ Logistic user account created successfully!');
    logger.info(`   Email: ${email}`);
    logger.debug(`   Password: ${password}`);
  } else {
    logger.info('✓ Logistic user account already exists');
    
    // Ensure role is assigned even if user exists
    const roleId = await getOrCreateRole(RoleCode.LOGISTIC);
    await assignRoleToUserIfNeeded(existingUser.id, roleId);
  }
}

/**
 * Create management user account if it doesn't exist
 */
async function initManagementUser(): Promise<void> {
  const email = 'management@smee.com.my';
  const password = 'management123';
  
  const existingUser = await authRepository.getUserByEmail(email);
  
  if (!existingUser) {
    const roleId = await getOrCreateRole(RoleCode.MANAGEMENT);
    const hashedPassword = await hashPassword(password);

    const user = await createUser({
      email,
      displayName: 'Management',
      passwordHash: hashedPassword,
      contactNo: '+60123567894',
      isActive: true,
      createdBy: 'system',
      updatedBy: 'system',
    });

    // Assign role to user via junction table
    await assignRoleToUserIfNeeded(user.id, roleId);
    
    logger.info('✅ Management user account created successfully!');
    logger.info(`   Email: ${email}`);
    logger.debug(`   Password: ${password}`);
  } else {
    logger.info('✓ Management user account already exists');
    
    // Ensure role is assigned even if user exists
    const roleId = await getOrCreateRole(RoleCode.MANAGEMENT);
    await assignRoleToUserIfNeeded(existingUser.id, roleId);
  }
}

/**
 * Main initialization function
 */
export async function initAccounts() {
  try {
    logger.info('🚀 Starting accounts initialization...');
    
    // Initialize users and roles first
    await initAdminUser();
    await initStorekeeperUser();
    await initLogisticUser();
    await initManagementUser();
    
    // Initialize RBAC modules and permissions
    await initRbacModule();
    
    logger.info('✅ Accounts initialization complete!');
  } catch (error) {
    logger.error('❌ Error initializing accounts:', error);
    throw error;
  }
}
