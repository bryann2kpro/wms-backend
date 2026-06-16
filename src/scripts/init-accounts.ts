import 'dotenv/config';

import { hashPassword } from '@/util/password-checker';
import { UserType } from '@/features/auth/auth.model';
import { RoleCode, ModuleName, PermissionTypeCode, ModuleType, PermissionType } from '@/features/rbac/rbac.model';
import { logger } from '@/util/logger';
import { authRepository, rbacRepository, organizationRepository } from '@/composition-root';
import { db } from '@/db';

/** Default organization ID used by migrations and init (single-tenant / default org). */
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

type CreateUserData = Omit<UserType, 'id' | 'createdAt' | 'updatedAt'>;

// ============================================
// DEFAULT ORGANIZATION
// ============================================

/**
 * Get or create the default organization (used by migrations and init).
 * Returns the default organization ID.
 */
async function getOrCreateDefaultOrganization(): Promise<string> {
  const existing = await organizationRepository.getOrganizationByCode('DEFAULT_ORG');
  if (existing) {
    logger.info('✓ Default organization already exists');
    return existing.organizationId;
  }
  await organizationRepository.createOrganization({
    organizationId: DEFAULT_ORG_ID,
    organizationName: 'Default Organization',
    organizationCode: 'DEFAULT_ORG',
    status: 'active',
    createdBy: 'system',
    updatedBy: 'system',
  });
  logger.info('✅ Default organization created successfully');
  return DEFAULT_ORG_ID;
}

/**
 * Get or create the SME-Edaran organization (used for all non-superadmin accounts).
 * Returns the organization ID.
 */
async function getOrCreateSmeEdaranOrganization(): Promise<string> {
  const existing = await organizationRepository.getOrganizationByCode('SME');
  if (existing) {
    logger.info('✓ SME-Edaran organization already exists');
    return existing.organizationId;
  }
  const org = await organizationRepository.createOrganization({
    organizationName: 'SME-Edaran',
    organizationCode: 'SME',
    status: 'active',
    createdBy: 'system',
    updatedBy: 'system',
  });
  logger.info('✅ SME-Edaran organization created successfully');
  return org.organizationId;
}

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
  }, {});
  
  if (existingPermissions.pagination.totalCount > 0) {
    logger.info(`✓ Permission "${permissionType}" already exists for module`);
    return existingPermissions.query[0];
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
    { type: PermissionTypeCode.READ, desc: 'View roles and permissions' },
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
  const adminRole = await authRepository.getRoleByName(RoleCode.SUPER_ADMIN);
  
  if (adminRole) {
    logger.info('🔐 Assigning RBAC permissions to Super Admin role...');
    for (const permission of createdPermissions) {
      await assignPermissionToRoleIfNeeded(adminRole.roleId, permission.permissionId);
    }
    logger.info('✅ Super Admin role now has full RBAC permissions');
  } else {
    logger.warn('⚠️ Super Admin role not found - please run initAdminUser first');
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
 * Initialize the Return module (Return Management) with CRUD permissions.
 * Used by the warehouse-keeper putaway flow and the Return Management admin page.
 */
async function initReturnModule(): Promise<void> {
  logger.info('📦 Initializing Return module...');

  const returnModule = await getOrCreateModule(ModuleName.RETURN);

  const permissions = [
    { type: PermissionTypeCode.READ, desc: 'View return documents' },
    { type: PermissionTypeCode.CREATE, desc: 'Capture returns' },
    { type: PermissionTypeCode.UPDATE, desc: 'Assign return items to racks (putaway)' },
    { type: PermissionTypeCode.DELETE, desc: 'Delete return documents' },
  ];

  const createdPermissions: PermissionType[] = [];
  for (const perm of permissions) {
    const permission = await getOrCreatePermission(returnModule.moduleId, perm.type, perm.desc);
    createdPermissions.push(permission);
  }

  // Assign to Admin and Storekeeper roles (Super Admin gets them via the backfill)
  for (const roleName of [RoleCode.ADMIN, RoleCode.STOREKEEPER]) {
    const role = await authRepository.getRoleByName(roleName);
    if (role) {
      logger.info(`🔐 Assigning Return permissions to ${roleName} role...`);
      for (const permission of createdPermissions) {
        await assignPermissionToRoleIfNeeded(role.roleId, permission.permissionId);
      }
    }
  }

  logger.info('✅ Return module initialization complete!');
}

/**
 * Backfill: assign all existing module permissions to Super Admin role.
 * Use for existing deployments where modules were created before auto-assign was added.
 */
async function initAllModulePermissionsForSuperAdmin(): Promise<void> {
  logger.info('📦 Backfilling Super Admin with all existing module permissions...');

  const superAdminRole = await authRepository.getRoleByName(RoleCode.SUPER_ADMIN);
  if (!superAdminRole) {
    logger.warn('⚠️ Super Admin role not found - skipping permission backfill');
    return;
  }

  const { query: permissions } = await rbacRepository.getPermission(
    {},
    { pageSize: 10_000, pageNumber: 1 }
  );

  let assigned = 0;
  for (const permission of permissions) {
    const existing = await rbacRepository.getRolePermission({
      roleId: superAdminRole.roleId,
      permissionId: permission.permissionId,
    });
    if (existing.length === 0) {
      await rbacRepository.createRolePermission({
        roleId: superAdminRole.roleId,
        permissionId: permission.permissionId,
        createdBy: 'system',
        updatedBy: 'system',
      });
      assigned += 1;
    }
  }

  if (assigned > 0) {
    logger.info(`✅ Super Admin backfill: assigned ${assigned} permission(s)`);
  } else {
    logger.info('✓ Super Admin already has all existing permissions');
  }
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
 * Get or create a role by name in the given organization, returns the role ID
 */
async function getOrCreateRole(roleName: string, organizationId: string): Promise<string> {
  // Check if role exists
  const existingRole = await authRepository.getRoleByName(roleName);
  
  if (existingRole && existingRole.roleId) {
    logger.info(`✓ Role "${roleName}" already exists`);
    return existingRole.roleId;
  }

  // Create the role if it doesn't exist
  const newRole = await authRepository.createRole({
    organizationId,
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
async function initAdminUser(defaultOrgId: string): Promise<void> {
  const email = 'admin@smee.com.my';
  const password = 'admin123';
  
  const existingAdminUser = await authRepository.getUserByEmail(email);
  
  if (!existingAdminUser) {
    // Get or create the ADMIN role first
    const adminRoleId = await getOrCreateRole(RoleCode.ADMIN, defaultOrgId);
    
    const hashedPassword = await hashPassword(password);

    const user = await createUser({
      email,
      displayName: 'Admin',
      passwordHash: hashedPassword,
      contactNo: '+60123567891',
      isActive: true,
      primaryOrganizationId: defaultOrgId,
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
    // Ensure user is assigned to this organization (e.g. after adding SME-Edaran)
    if (existingAdminUser.primaryOrganizationId !== defaultOrgId) {
      await authRepository.updateUser(existingAdminUser.id, {
        primaryOrganizationId: defaultOrgId,
        updatedBy: 'system',
      });
    }
    // Ensure role is assigned even if user exists
    const adminRoleId = await getOrCreateRole(RoleCode.ADMIN, defaultOrgId);
    await assignRoleToUserIfNeeded(existingAdminUser.id, adminRoleId);
  }
}

/**
 * Create storekeeper user account if it doesn't exist
 */
async function initStorekeeperUser(defaultOrgId: string): Promise<void> {
  const email = 'storekeeper@smee.com.my';
  const password = 'storekeeper123';
  
  const existingUser = await authRepository.getUserByEmail(email);
  
  if (!existingUser) {
    const roleId = await getOrCreateRole(RoleCode.STOREKEEPER, defaultOrgId);
    const hashedPassword = await hashPassword(password);

    const user = await createUser({
      email,
      displayName: 'Storekeeper',
      passwordHash: hashedPassword,
      contactNo: '+60123567892',
      isActive: true,
      primaryOrganizationId: defaultOrgId,
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
    if (existingUser.primaryOrganizationId !== defaultOrgId) {
      await authRepository.updateUser(existingUser.id, {
        primaryOrganizationId: defaultOrgId,
        updatedBy: 'system',
      });
    }
    const roleId = await getOrCreateRole(RoleCode.STOREKEEPER, defaultOrgId);
    await assignRoleToUserIfNeeded(existingUser.id, roleId);
  }
}

/**
 * Create logistic/driver user account if it doesn't exist
 */
async function initLogisticUser(defaultOrgId: string): Promise<void> {
  const email = 'driver@smee.com.my';
  const password = 'driver123';
  
  const existingUser = await authRepository.getUserByEmail(email);
  
  if (!existingUser) {
    const roleId = await getOrCreateRole(RoleCode.LOGISTIC, defaultOrgId);
    const hashedPassword = await hashPassword(password);

    const user = await createUser({
      email,
      displayName: 'Driver',
      passwordHash: hashedPassword,
      contactNo: '+60123567893',
      isActive: true,
      primaryOrganizationId: defaultOrgId,
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
    if (existingUser.primaryOrganizationId !== defaultOrgId) {
      await authRepository.updateUser(existingUser.id, {
        primaryOrganizationId: defaultOrgId,
        updatedBy: 'system',
      });
    }
    const roleId = await getOrCreateRole(RoleCode.LOGISTIC, defaultOrgId);
    await assignRoleToUserIfNeeded(existingUser.id, roleId);
  }
}

/**
 * Create management user account if it doesn't exist
 */
async function initManagementUser(defaultOrgId: string): Promise<void> {
  const email = 'management@smee.com.my';
  const password = 'management123';
  
  const existingUser = await authRepository.getUserByEmail(email);
  
  if (!existingUser) {
    const roleId = await getOrCreateRole(RoleCode.MANAGEMENT, defaultOrgId);
    const hashedPassword = await hashPassword(password);

    const user = await createUser({
      email,
      displayName: 'Management',
      passwordHash: hashedPassword,
      contactNo: '+60123567894',
      isActive: true,
      primaryOrganizationId: defaultOrgId,
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
    if (existingUser.primaryOrganizationId !== defaultOrgId) {
      await authRepository.updateUser(existingUser.id, {
        primaryOrganizationId: defaultOrgId,
        updatedBy: 'system',
      });
    }
    const roleId = await getOrCreateRole(RoleCode.MANAGEMENT, defaultOrgId);
    await assignRoleToUserIfNeeded(existingUser.id, roleId);
  }
}

async function initSuperAdminUser(defaultOrgId: string): Promise<void> {
  const email = 'superadmin@smee.com.my';
  const password = 'superadmin123';
  
  const existingUser = await authRepository.getUserByEmail(email);
  
  if (!existingUser) {
    const hashedPassword = await hashPassword(password);

    await db.transaction(async (tx) => {
      let roleId = '';

      // Check if SUPER ADMIN role exists
      const superAdminRole = await authRepository.getRoleByName(RoleCode.SUPER_ADMIN);
      if (!superAdminRole) {
        const newRole = await authRepository.createRole({
          organizationId: defaultOrgId,
          roleName: RoleCode.SUPER_ADMIN,
          status: 'active',
          createdBy: 'system',
          updatedBy: 'system',
        }, tx);
        roleId = newRole.roleId;
      } else {
        roleId = superAdminRole.roleId;
      }

      const user = await authRepository.createUser({
        email,
        displayName: 'Super Admin',
        passwordHash: hashedPassword,
        contactNo: '+60123567895',
        isActive: true,
        primaryOrganizationId: defaultOrgId,
        createdBy: 'system',
        updatedBy: 'system',
      }, tx);

      await authRepository.assignRoleToUser({
        userId: user.id,
        roleId,
        status: 'active',
        createdBy: 'system',
        updatedBy: 'system',
      }, tx);
    });
    
    logger.info('✅ Super Admin user account created successfully!');
    logger.info(`   Email: ${email}`);
    logger.debug(`   Password: ${password}`);
  } else {
    logger.info('✓ Super Admin user account already exists');
    
    // Ensure role is assigned even if user exists
    const roleId = await getOrCreateRole(RoleCode.SUPER_ADMIN, defaultOrgId);
    await assignRoleToUserIfNeeded(existingUser.id, roleId);
  }
}

/**
 * Main initialization function
 */
export async function initAccounts() {
  try {
    logger.info('🚀 Starting accounts initialization...');

    // Ensure default organization exists (same ID as migrations); used for Super Admin only
    const defaultOrgId = await getOrCreateDefaultOrganization();
    // SME-Edaran organization for all other accounts (admin, storekeeper, logistic, management)
    const smeOrgId = await getOrCreateSmeEdaranOrganization();

    // Initialize users and roles: non-superadmin accounts → SME-Edaran; Super Admin → default org
    await initAdminUser(smeOrgId);
    await initStorekeeperUser(smeOrgId);
    await initLogisticUser(smeOrgId);
    await initManagementUser(smeOrgId);
    await initSuperAdminUser(defaultOrgId);
    
    // Initialize RBAC modules and permissions
    await initRbacModule();
    await initReturnModule();

    // Backfill Super Admin with all existing module permissions (for existing deployments)
    await initAllModulePermissionsForSuperAdmin();

    logger.info('✅ Accounts initialization complete!');
  } catch (error) {
    logger.error('❌ Error initializing accounts:', error);
    throw error;
  }
}
