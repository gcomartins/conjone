import db from '../database';

export const logger = {
  log: (component: string, message: string) => {
    let retries = 5;
    while (retries > 0) {
      try {
        db.prepare('INSERT INTO activity_logs (component, message) VALUES ($component, $message)')
          .run({ $component: component, $message: message });
        
        // Também imprime no console do processo atual
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] [${component}] ${message}`);
        break;
      } catch (e: any) {
        if (e.code === "SQLITE_BUSY" && retries > 1) {
          retries--;
          // Pequena espera antes de tentar novamente
          const start = Date.now();
          while (Date.now() - start < 100) {} 
          continue;
        }
        console.error('Erro ao salvar log:', e);
        break;
      }
    }
  },
  
  getHistory: (limit = 10) => {
    try {
      return db.prepare('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT $limit')
        .all({ $limit: limit }) as any[];
    } catch (e) {
      console.error('Erro ao buscar histórico:', e);
      return [];
    }
  }
};
