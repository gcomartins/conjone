import { Elysia } from 'elysia';
import { oauth2Client } from './services/google';
import { config } from './config';
import db from './database';
import { logger } from './services/logger';

export const startAuthServer = () => {
  new Elysia()
    .get('/', () => 'Conjone Auth Server is active! 🚀')
    .get('/google/callback', async ({ query, set }: any) => {
      const code = query.code;

      if (code) {
        try {
          const { tokens } = await oauth2Client.getToken(code);
          
          if (tokens.refresh_token) {
            db.prepare('INSERT OR REPLACE INTO system_control (key, value) VALUES ("google_refresh_token", $token)')
              .run({ $token: tokens.refresh_token });
            
            db.prepare('INSERT OR REPLACE INTO system_control (key, value) VALUES ("google_auth_status", "COMPLETE")').run();
            logger.log('GOOGLE', 'Sucesso: Refresh Token recebido e armazenado.');
          } else {
            // Se não veio refresh_token, mas já temos um no banco, mantemos o que existe
            const existing: any = db.prepare('SELECT value FROM system_control WHERE key = "google_refresh_token"').get();
            if (existing?.value) {
              db.prepare('INSERT OR REPLACE INTO system_control (key, value) VALUES ("google_auth_status", "COMPLETE")').run();
              logger.log('GOOGLE', 'Aviso: Usando Refresh Token existente (Google não enviou um novo).');
            } else {
              throw new Error('Google não enviou o Refresh Token e não há um salvo.');
            }
          }

          return '✅ Autenticação concluída! O Conjone agora tem acesso ao Google. Pode fechar esta janela.';
        } catch (e: any) {
          logger.log('ERRO', `Falha no OAuth: ${e.message}`);
          set.status = 500;
          return `Erro: ${e.message}`;
        }
      }
      return 'Dados inválidos.';
    })
    .listen({
      port: config.server.port,
      hostname: '0.0.0.0'
    });

  logger.log('SISTEMA', `Servidor de Auth rodando em http://localhost:${config.server.port}`);
};
