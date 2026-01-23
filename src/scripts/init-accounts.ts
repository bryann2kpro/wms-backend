import 'dotenv/config';

import { hashPassword } from '@/util/password-checker';
import { UserType } from '@/features/auth/auth.model';
import { RoleCode } from '@/features/rbac/rbac.model';
import { logger } from '@/util/logger';
import { authRepository } from '@/composition-root';

type CreateUserData = Omit<UserType, 'id' | 'createdAt' | 'updatedAt'>;

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
    
    await initAdminUser();
    // Uncomment these to create additional test users:
    await initStorekeeperUser();
    await initLogisticUser();
    await initManagementUser();
    
    logger.info('✅ Accounts initialization complete!');
  } catch (error) {
    logger.error('❌ Error initializing accounts:', error);
    throw error;
  }
}
