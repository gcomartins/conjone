import { google } from 'googleapis';
import { config } from '../config';
import db from '../database';

export const oauth2Client = new google.auth.OAuth2(
  config.google.clientId,
  config.google.clientSecret,
  config.google.redirectUri
);

export const googleService = {
  // Gera a URL para o usuário clicar e autorizar
  generateAuthUrl: (whatsappNumber: string) => {
    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'openid'
    ];

    return oauth2Client.generateAuthUrl({
      access_type: 'offline', // Importante para receber o refresh_token
      prompt: 'consent',     // Força o envio do refresh_token novamente
      scope: scopes,
      state: whatsappNumber,
    });
  },

  // Troca o código recebido pelo Token real e salva no banco
  saveUserToken: async (code: string, whatsappNumber: string) => {
    const { tokens } = await oauth2Client.getToken(code);
    
    // Salva no SQLite
    const query = db.prepare(`
      INSERT INTO users (id, whatsapp_number, google_refresh_token) 
      VALUES ($id, $whatsapp_number, $token)
      ON CONFLICT(whatsapp_number) DO UPDATE SET google_refresh_token = $token
    `);

    query.run({
      $id: crypto.randomUUID(),
      $whatsapp_number: whatsappNumber,
      $token: tokens.refresh_token
    });

    return true;
  },

  // Recupera o cliente autenticado para um usuário específico
  getAuthClient: async (whatsappNumber: string) => {
    const query = db.prepare('SELECT google_refresh_token FROM users WHERE whatsapp_number = $number');
    const user: any = query.get({ $number: whatsappNumber });

    if (!user || !user.google_refresh_token) {
      return null;
    }

    const client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );

    client.setCredentials({ refresh_token: user.google_refresh_token });
    return client;
  }
};
