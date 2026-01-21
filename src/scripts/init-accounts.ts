import 'dotenv/config';
import { authRepository } from '@/features/auth/auth.repository';
import { hashPassword } from '@/util/password-checker';
import { UserType } from '@/features/auth/auth.model';
import { db } from '@/db';
import { logger } from '@/util/logger';

type UserData = Omit<UserType, 'userId' | 'createdAt' | 'updatedAt'>;

/**
 * Create a user account with Hedera account
 */
async function createUser(userData: UserData): Promise<void> {
    try {
      const createdUser = await authRepository.createUser(userData);
      return createdUser;
    } catch (error) {
      logger.error('❌ Error creating user:', error);
      throw error;
    }
  
}

/**
 * Create platform account if it doesn't exist
 */
async function initPlatformAccount(): Promise<void> {
  const email = 'platform@silsilat.finance';
  const password = 'platform123';
  const existingPlatformUser = await authRepository.getUserByEmail(email);
  
  if (!existingPlatformUser) {
    const hashedPassword = await hashPassword(password);

    const userData = {
      userEmail: 'admin@smee.com.my',
      balance: 0,
      userContactNo: '+60123567890',
      userPassword: hashedPassword,
      icNo: '000000000002',
      icFrontPicture: 'default_front.jpg',
      icBackPicture: 'default_back.jpg',
      userFirstName: 'Silsilat',
      userLastName: 'Platform',
      gender: 'M',
      accountId: '',
      addressId: 'DEFAULT_ADDRESS',
      companyId: 'DEFAULT_COMPANY',
      vehicleId: null,
      walletId: 'DEFAULT_WALLET',
      userSkillId: null,
      jobReviewId: null,
      roleId: 'platform',
      sessionId: null,
      status: 'ACTIVE',
      createdBy: 'system',
      updatedBy: 'system'
    }; 

    await createUser(userData);
    
    logger.info('✅ Platform user account created successfully!');
    logger.info(`   Email: ${email}`);
    logger.debug(`   Password: ${password}`);
  } else {
    logger.info('✓ Platform user account already exists');
  }
}

/**
 * Create admin user (pawnshop) account if it doesn't exist
 */
async function initAdminUser(): Promise<void> {
  const email = 'admin@smee.com.my';
  const password = 'admin123';
  const existingAdminUser = await authRepository.getUserByEmail(email);
  
  if (!existingAdminUser) {
    const hashedPassword = await hashPassword(password);

    await createUser({
      userEmail: email,
      userContactNo: '+60123567891',
      userPassword: hashedPassword,
      icNo: '000000000000',
      icFrontPicture: 'default_front.jpg',
      icBackPicture: 'default_back.jpg',
      userFirstName: 'Silsilat',
      userLastName: 'Admin',
      gender: 'M',
      addressId: 'DEFAULT_ADDRESS',
      companyId: 'DEFAULT_COMPANY',
      vehicleId: null,
      walletId: 'DEFAULT_WALLET',
      userSkillId: null,
      jobReviewId: null,
      roleId: 'admin',
      sessionId: null,
      status: 'ACTIVE',
      createdBy: 'system',
      updatedBy: 'system'
    });
    
    logger.info('✅ Admin user account created successfully!');
    logger.info(`   Email: ${email}`);
    logger.debug(`   Password: ${password}`);
  } else {
    logger.info('✓ Admin user account already exists');
  }
}

/**
 * Create investor user account if it doesn't exist
 */
async function initInvestorUser(): Promise<void> {
  const email = 'investor@smee.com.my';
  const password = 'investor123';
  const existingInvestorUser = await authRepository.getUserByEmail(email);
  
  if (!existingInvestorUser) {
    const hashedPassword = await hashPassword(password);

    await createUser({
      userEmail: email,
      userContactNo: '+60123567892',
      userPassword: hashedPassword,
      icNo: '000000000001',
      icFrontPicture: 'default_front.jpg',
      icBackPicture: 'default_back.jpg',
      userFirstName: 'Silsilat',
      userLastName: 'Investor',
      gender: 'M',
      addressId: 'DEFAULT_ADDRESS',
      companyId: 'DEFAULT_COMPANY',
      vehicleId: null,
      walletId: 'DEFAULT_WALLET',
      userSkillId: null,
      jobReviewId: null,
      roleId: 'investor',
      sessionId: null,
      status: 'ACTIVE',
      createdBy: 'system',
      updatedBy: 'system' 
    });
    
    logger.info('✅ Investor user account created successfully!');
    logger.info(`   Email: ${email}`);
    logger.debug(`   Password: ${password}`);
  } else {  
    logger.info('✓ Investor user account already exists');
  }
}


/**
 * Main initialization function
 */
export async function initAccounts() {
  try {
    // await initPlatformAccount();
    await initAdminUser();
    // await initInvestorUser();
    // await initLQTToken();
    
    logger.info('✅ Accounts initialization complete!');
  } catch (error) {
    logger.error('❌ Error initializing accounts:', error);
    throw error;
  }
}

