import dotenv from 'dotenv';
dotenv.config();

export const config = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/google/callback',
  },
  server: {
    port: parseInt(process.env.PORT || '3000'),
  },
};
