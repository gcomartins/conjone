import { whatsapp } from './services/whatsapp';
import { GeminiService } from './services/gemini';
import db from './database';
import { logger } from './services/logger';
import fs from 'fs';
import path from 'path';

const gemini = new GeminiService();

async function bootstrap() {
  logger.log('SISTEMA', 'Motor do Conjone Iniciado [Modo Nativo]');

  const setupEvents = (sock: any) => {
    sock.ev.on('messages.upsert', async (m: any) => {
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe) return;
      const from = msg.key.remoteJid;
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
      if (!from || !text) return;

      logger.log('WHATSAPP', `Mensagem recebida de ${from}: ${text.substring(0, 20)}...`);

      try {
        // O motor agora opera diretamente com o Gemini CLI local
        await gemini.chat(from, text);
        logger.log('GEMINI', `Comando disparado para o terminal de ${from}`);
      } catch (geminiError: any) {
        logger.log('ERRO', `Falha no motor agêntico: ${geminiError.message}`);
        await whatsapp.sendMessage(from, `❌ *FALHA NO MOTOR AGÊNTICO*\n${geminiError.message}`);
      }
    });
  };

  const sessionPath = path.resolve(process.cwd(), 'data/session/creds.json');
  if (fs.existsSync(sessionPath)) {
    logger.log('SISTEMA', 'Sessão encontrada. Conectando WhatsApp automaticamente...');
    const sock = await whatsapp.start();
    setupEvents(sock);
  }

  setInterval(async () => {
    const cmd = db.prepare('SELECT value FROM system_control WHERE key = "cmd"').get() as any;
    if (cmd?.value === 'CONNECT_WA') {
      db.prepare('DELETE FROM system_control WHERE key = "cmd"').run();
      if (!whatsapp.sock) {
        logger.log('WHATSAPP', 'Iniciando socket Baileys via comando manual...');
        const sock = await whatsapp.start();
        setupEvents(sock);
      }
    }
  }, 2000);
}

bootstrap().catch(err => {
  logger.log('CRÍTICO', err.message);
  console.error(err);
});
