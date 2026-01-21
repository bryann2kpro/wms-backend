
import { describe, test, expect, beforeAll } from 'vitest';
import { authRepository } from './auth.repository';
import { UserType, UserRoleType, RolePermissionType, CompanyAdminType } from './auth.model';

describe('auth', () => {
    // Store IDs for use across tests
    let createdPermissionId: string;
    let createdRoleId: string;

    // Step 1: Create Permission first
    describe('Role Permission', () => {
        test('permission should be created', async () => {
            const permissionData: RolePermissionType = {
                permissionName: 'admin_full_access',
                policy: 'full_access',
                status: 'ACTIVE',
                createdBy: 'system',
                updatedBy: 'system',
            };

            await expect(authRepository.createRolePermission(permissionData)).resolves.not.toThrow();

            // Verify permission was created
            const permission = await authRepository.getRolePermision('admin_full_access');
            expect(permission).not.toBeNull();
            expect(permission?.permissionName).toBe('admin_full_access');
            
            if (permission?.permissionId) {
                createdPermissionId = permission.permissionId;
            }
        });

        test('should get permission by name', async () => {
            const permission = await authRepository.getRolePermision('admin_full_access');
            expect(permission).not.toBeNull();
            expect(permission?.policy).toBe('full_access');
        });
    });

    // Step 2: Create Role with Permission
    describe('User Role', () => {
        test('role should be created with permission', async () => {
            const roleData: UserRoleType = {
                roleName: 'Admin',
                permissionId: createdPermissionId || 'test-permission-id',
                status: 'ACTIVE',
                createdBy: 'system',
                updatedBy: 'system',
            };

            await expect(authRepository.createUserRole(roleData)).resolves.not.toThrow();

            // Verify role was created
            const role = await authRepository.getUserRole('Admin');
            expect(role).not.toBeNull();
            expect(role?.roleName).toBe('Admin');
            
            if (role?.roleId) {
                createdRoleId = role.roleId;
            }
        });

        test('should get role by name', async () => {
            const role = await authRepository.getUserRole('Admin');
            expect(role).not.toBeNull();
            expect(role?.status).toBe('ACTIVE');
        });

        test('should get role by roleId', async () => {
            if (!createdRoleId) return;
            
            const role = await authRepository.getUserRoleByRoleId(createdRoleId);
            expect(role).not.toBeNull();
            expect(role?.roleName).toBe('Admin');
        });

        test('should get permissionId by roleId', async () => {
            if (!createdRoleId) return;
            
            const permissionId = await authRepository.getRolePermissionByRoleId(createdRoleId);
            expect(permissionId).not.toBeNull();
        });

        test('should update role', async () => {
            if (!createdRoleId) return;

            const updatedRoleData: Partial<UserRoleType> = {
                roleId: createdRoleId,
                roleName: 'Admin',
                status: 'INACTIVE',
                updatedBy: 'test',
            };

            await expect(authRepository.updateUserRole(updatedRoleData)).resolves.not.toThrow();
        });
    });

    // Step 3: Create User with Role
    describe('User', () => {
        test('user should be created with role', async () => {
            const userData: UserType = {
                userCode: 'USR001',
                userEmail: 'admin@smee.com.my',
                userContactNo: '0123456789',
                userPassword: 'hashedPassword123',
                icNo: '123456789012',
                icFrontPicture: 'https://example.com/ic-front.jpg',
                icBackPicture: 'https://example.com/ic-back.jpg',
                userFirstName: 'Admin',
                userLastName: 'Smee',
                gender: 'Male',
                addressId: 'addr-001',
                companyId: 'comp-001',
                vehicleId: null,
                walletId: 'wallet-001',
                userSkillId: null,
                jobReviewId: null,
                roleId: createdRoleId || 'test-role-id',
                sessionId: null,
                status: 'ACTIVE',
                createdBy: 'system',
                updatedBy: 'system',
            };

            await expect(authRepository.createUser(userData)).resolves.not.toThrow();
        });

        test('should get user by email', async () => {
            const user = await authRepository.getUserByEmail('admin@smee.com.my');
            expect(user).not.toBeNull();
            expect(user?.userFirstName).toBe('Admin');
            expect(user?.roleId).toBeDefined();
        });

        test('should get user by contact number', async () => {
            const user = await authRepository.getUserByContactNo('0123456789');
            expect(user).not.toBeNull();
            expect(user?.userEmail).toBe('admin@smee.com.my');
        });

        test('user should have role assigned', async () => {
            const user = await authRepository.getUserByEmail('admin@smee.com.my');
            expect(user?.roleId).not.toBeNull();
            
            if (user?.roleId) {
                const role = await authRepository.getUserRoleByRoleId(user.roleId);
                expect(role).not.toBeNull();
            }
        });
    });

    // Step 4: Create Company Admin with Role
    describe('Company Admin', () => {
        test('company admin should be created with role', async () => {
            const companyAdminData: CompanyAdminType = {
                companyAdminFirstName: 'Company',
                companyAdminLastName: 'Admin',
                companyAdminEmail: 'companyadmin@smee.com.my',
                companyAdminContactNo: '0198765432',
                companyAdminPassword: 'hashedPassword456',
                companyId: 'comp-001',
                boolModule: true,
                moduleAccessId: ['module-1', 'module-2'],
                boolPermission: true,
                roleId: createdRoleId || 'test-role-id',
                sessionId: null,
                status: 'ACTIVE',
                createdBy: 'system',
                updatedBy: 'system',
            };

            await expect(authRepository.createCompanyAdmin(companyAdminData)).resolves.not.toThrow();
        });

        test('should get company admin by email', async () => {
            const admin = await authRepository.getCompanyAdminByEmail('companyadmin@smee.com.my');
            expect(admin).not.toBeNull();
            expect(admin?.companyAdminFirstName).toBe('Company');
        });

        test('should get company admin by contact number', async () => {
            const admin = await authRepository.getCompanyAdminByContactNo('0198765432');
            expect(admin).not.toBeNull();
            expect(admin?.companyAdminEmail).toBe('companyadmin@smee.com.my');
        });

        test('company admin should have role and module access', async () => {
            const admin = await authRepository.getCompanyAdminByEmail('companyadmin@smee.com.my');
            expect(admin?.roleId).not.toBeNull();
            expect(admin?.boolModule).toBe(true);
            expect(admin?.moduleAccessId).toContain('module-1');
        });
    });
});