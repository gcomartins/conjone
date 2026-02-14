import db from '../database';

export const logger = {
  log: (component: string, message: string) => {
    try {
      db.prepare('INSERT INTO activity_logs (component, message) VALUES ($component, $message)')
        .run({ $component: component, $message: message });
      
      // Também imprime no console do processo atual
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] [${component}] ${message}`);
    } catch (e) {
      console.error('Erro ao salvar log:', e);
    }
  },
  
  getHistory: (limit = 10) => {
    return db.prepare('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT $limit')
      .all({ $limit: limit }) as any[];
  }
};
