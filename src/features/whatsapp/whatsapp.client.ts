import { Client, LocalAuth } from 'whatsapp-web.js';
import { logger } from '@/util/logger';
import { io } from '@/socket/socket-server';

type WhatsAppConnectionStatus = 'initializing' | 'qr_needed' | 'ready' | 'disconnected';

type WhatsAppStatusSnapshot = {
  status: WhatsAppConnectionStatus;
  connectedPhone: string | null;
  lastQr: string | null;
};

class WhatsAppClientManager {
  private client: Client | null = null;
  private initialized = false;
  private status: WhatsAppConnectionStatus = 'disconnected';
  private connectedPhone: string | null = null;
  private lastQr: string | null = null;

  init(): void {
    if (this.initialized) return;

    this.client = new Client({
      authStrategy: new LocalAuth({ clientId: 'smee-wms' }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    this.status = 'initializing';
    this.emitStatus();

    this.client.on('qr', (qr) => {
      this.status = 'qr_needed';
      this.lastQr = qr;
      logger.info('ℹ️ [WhatsAppClient] QR code generated');
      this.emitStatus();
      io?.to('whatsapp-admin').emit('whatsapp:qr', { qr });
    });

    this.client.on('authenticated', () => {
      logger.info('✅ [WhatsAppClient] Authenticated');
    });

    this.client.on('ready', async () => {
      this.status = 'ready';
      this.lastQr = null;
      this.connectedPhone = this.client?.info?.wid?.user ?? null;
      try {
        const info = await this.client?.getState();
        logger.info(`✅ [WhatsAppClient] Ready (state=${info ?? 'unknown'})`);
      } catch {
        logger.info('✅ [WhatsAppClient] Ready');
      }
      this.emitStatus();
    });

    this.client.on('change_state', (state) => {
      logger.info(`ℹ️ [WhatsAppClient] State changed: ${state}`);
    });

    this.client.on('disconnected', (reason) => {
      this.status = 'disconnected';
      this.connectedPhone = null;
      logger.warn(`⚠️ [WhatsAppClient] Disconnected: ${reason}`);
      this.emitStatus();
    });

    this.client
      .initialize()
      .then(() => {
        this.initialized = true;
      })
      .catch((error) => {
        this.status = 'disconnected';
        logger.error('❌ [WhatsAppClient] Failed to initialize', error);
        this.emitStatus();
      });
  }

  async sendMessage(toPhone: string, text: string): Promise<void> {
    if (!this.client || this.status !== 'ready') {
      throw new Error('WhatsApp client is not ready');
    }

    const chatId = this.toChatId(toPhone);
    await this.client.sendMessage(chatId, text);
    logger.info(`✅ [WhatsAppClient] Message sent to ${chatId}`);
  }

  getStatus(): WhatsAppStatusSnapshot {
    return {
      status: this.status,
      connectedPhone: this.connectedPhone,
      lastQr: this.lastQr,
    };
  }

  private toChatId(rawPhone: string): string {
    const digits = rawPhone.replace(/\D/g, '');
    if (!digits) {
      throw new Error(`Invalid WhatsApp phone number: ${rawPhone}`);
    }
    return `${digits}@c.us`;
  }

  private emitStatus(): void {
    io?.to('whatsapp-admin').emit('whatsapp:status', this.getStatus());
  }
}

export const whatsAppClient = new WhatsAppClientManager();
