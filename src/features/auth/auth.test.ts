import { describe, test, expect } from 'vitest';
import { authRepository } from './auth.repository';
import { UserType } from './auth.model';

describe('auth', () => {
    test('user should be created', async () => {

        const userData: UserType = {
            userCode: '1234567890',
            userEmail: 'admin@smee.com.my',
            userContactNo: '0123456789',
            userPassword: 'demo123',
            icNo: '123456789012',
            icFrontPicture: 'https://example.com/ic-front.jpg',
            icBackPicture: 'https://example.com/ic-back.jpg',
            userFirstName: 'Admin',
            userLastName: 'Smee',
            gender: 'Male',
            addressId: '1234567890',
            companyId: '1234567890',
            vehicleId: '1234567890',
            walletId: '1234567890',
            userSkillId: '1234567890',
            jobReviewId: '1234567890',
            roleId: '1234567890',
            sessionId: '1234567890',
            status: 'ACTIVE',
            createdBy: 'system',
            updatedBy: 'system',
        };
        const userCreated = await authRepository.createUser(userData);
        expect(userCreated).toBe(true);
    });
});