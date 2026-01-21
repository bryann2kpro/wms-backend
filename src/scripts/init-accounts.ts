import { authRepository } from '@/features/auth/auth.repository';
import { hashPassword } from '@/util/password-checker';
import { UserType } from '@/features/auth/auth.model';
import { db } from '@/db';
import { logger } from '@/util/logger';

type UserData = Omit<UserType, 'userId' | 'createdAt' | 'updatedAt'>;

/**
 * Create a user account with Hedera account
 */
async function createUserWithHederaAccount(userData: UserData): Promise<void> {
  await db.transaction(async (tx) => {
    const createdUser = await authRepository.createUser(userData, tx);
    
  });
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
      userEmail: 'platform@silsilat.finance',
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

    await createUserWithHederaAccount(userData);
    
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
  const email = 'admin@silsilat.finance';
  const password = 'admin123';
  const existingAdminUser = await authRepository.getUserByEmail(email);
  
  if (!existingAdminUser) {
    const hashedPassword = await hashPassword(password);

    await createUserWithHederaAccount({
      userEmail: email,
      balance: 0,
      userContactNo: '+60123567891',
      userPassword: hashedPassword,
      icNo: '000000000000',
      icFrontPicture: 'default_front.jpg',
      icBackPicture: 'default_back.jpg',
      userFirstName: 'Silsilat',
      userLastName: 'Admin',
      gender: 'M',
      accountId: '',
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
  const email = 'investor@silsilat.finance';
  const password = 'investor123';
  const existingInvestorUser = await authRepository.getUserByEmail(email);
  
  if (!existingInvestorUser) {
    const hashedPassword = await hashPassword(password);

    await createUserWithHederaAccount({
      userEmail: email,
      balance: 0,
      userContactNo: '+60123567892',
      userPassword: hashedPassword,
      icNo: '000000000001',
      icFrontPicture: 'default_front.jpg',
      icBackPicture: 'default_back.jpg',
      userFirstName: 'Silsilat',
      userLastName: 'Investor',
      gender: 'M',
      accountId: '',
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
 * Get decrypted keys for admin account
 */
async function getAdminAccountKeys() {
  const adminAccount = await hederaAccountRepository.getAccountByHederaId(
    process.env.ADMIN_HEDERA_ACCOUNT_ID || ''
  );
  
  if (!adminAccount) {
    throw new Error('Admin account not found. Cannot create LQT token.');
  }
  
  const hashedPrivateKey = decryptPrivateKey(
    adminAccount.privateKey || '', 
    process.env.ENCRYPTION_MASTER_KEY || ''
  );
  const hashedPublicKey = PublicKey.fromString(adminAccount.publicKey || '');
  
  return {
    adminAccount,
    privateKey: PrivateKey.fromStringECDSA(hashedPrivateKey),
    publicKey: hashedPublicKey
  };
}

/**
 * Create LQT (Liquidity Token) if it doesn't exist
 */
async function initLQTToken(): Promise<void> {  
  try {
    const existingLQTToken = await hederaTokenRepository.findFungibleTokenBySymbol('LQT');
    
    if (!existingLQTToken) {      
      const { adminAccount, privateKey, publicKey } = await getAdminAccountKeys();
      
      const lqtParams = {
        name: 'Liquidity Token',
        symbol: 'LQT',
        treasuryAccountId: adminAccount.hederaAccountId,
        treasuryPrivateKey: privateKey,
        supplyKey: publicKey,
        adminKey: publicKey,
        freezeKey: publicKey,
        wipeKey: publicKey,
        initialSupply: 1000000, // Initial supply of 1,000,000 LQT
        price: 1,
        expiredAt: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString()
      };
      
      const result = await hederaTokenRepository.createFungibleToken(lqtParams);
      
      logger.info('✅ LQT token created successfully!');
      logger.info(`   Token ID: ${result.tokenId}`);
      logger.info(`   Transaction ID: ${result.transactionId}`);
      logger.info(`   Add this to your .env file: FUNGIBLE_TOKEN_ID=${result.tokenId}`);
    } else {
      logger.info('✓ LQT token already exists');
      logger.info(`   Token ID: ${existingLQTToken.tokenId}`);
      logger.info(`   Symbol: ${existingLQTToken.symbol}`);
      logger.info(`   Total Supply: ${existingLQTToken.totalSupply}`);
    }
  } catch (error) {
    logger.error('⚠️  Failed to initialize LQT token:', error);
    throw error; // Re-throw so initAccounts() knows it failed
  }
}

/**
 * Main initialization function
 */
export async function initAccounts() {
  try {
    await initPlatformAccount();
    await initAdminUser();
    await initInvestorUser();
    await initLQTToken();
    
    logger.info('✅ Accounts initialization complete!');
  } catch (error) {
    logger.error('❌ Error initializing accounts:', error);
    throw error;
  }
}

