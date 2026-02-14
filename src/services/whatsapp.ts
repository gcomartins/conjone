import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import path from 'path';

export class WhatsAppService {
  public sock: any;
  private logger = pino({ level: 'info' });

  async start() {
    if (this.sock) {
      console.log('⚠️ WhatsApp já está inicializado ou conectando.');
      return this.sock;
    }
    console.log('🚀 Iniciando conexão nativa com WhatsApp...');
    
    // Pasta para salvar a sessão (soberania de dados)
    const { state, saveCreds } = await useMultiFileAuthState(path.resolve(__dirname, '../../data/session'));
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logger),
      },
      logger: this.logger,
      browser: ['Mac OS', 'Chrome', '10.15.7'],
    });

    // Escuta atualizações de conexão
    this.sock.ev.on('connection.update', (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n📱 ESCANEIE O QR CODE ABAIXO PARA CONECTAR O CONJONE:\n');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('🔌 Conexão fechada. Motivo:', lastDisconnect?.error, 'Tentando reconectar:', shouldReconnect);
        if (shouldReconnect) this.start();
      } else if (connection === 'open') {
        console.log('✅ CONJONE CONECTADO AO WHATSAPP!');
      }
    });

    // Salva as credenciais sempre que houver mudança
    this.sock.ev.on('creds.update', saveCreds);

    return this.sock;
  }

  async sendMessage(to: string, text: string) {
    if (!this.sock) throw new Error('WhatsApp não conectado.');
    await this.sock.sendMessage(to, { text });
  }
}

export const whatsapp = new WhatsAppService();
