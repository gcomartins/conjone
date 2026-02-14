import inquirer from 'inquirer';
import db from './database';
import { logger } from './services/logger';
import { fullConjoneLogo } from './ui/ascii';

// Cores ANSI para o degradê laranja/ouro
const ORANGE = '\x1b[38;5;208m';
const GOLD = '\x1b[38;5;214m';
const YELLOW = '\x1b[38;5;226m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function printGradientLogo(logo: string) {
  const lines = logo.split('\n').filter(l => l.trim().length > 0);
  const colors = [ORANGE, GOLD, GOLD, YELLOW, YELLOW, GOLD, GOLD, ORANGE];
  
  lines.forEach((line, i) => {
    const color = colors[i % colors.length];
    console.log(`${color}${line}${RESET}`);
  });
}

async function displayInterface() {
  console.log('\n\n' + ORANGE + '━'.repeat(80) + RESET);
  console.log('\x1b[1m' + GOLD + '  [ SISTEMA INICIALIZADO - PAINEL DE CONTROLE ]  ' + RESET);
  console.log(ORANGE + '━'.repeat(80) + RESET + '\n');
  
  // Exibe a Logo com degradê laranja
  printGradientLogo(fullConjoneLogo);
  
  console.log(`\n  ${BOLD}${GOLD}🚀 PAINEL DE CONTROLE SOBERANO${RESET}`);
  console.log(`  \x1b[2m${ORANGE}──────────────────────────────────────────────────────────────────────────────────${RESET}`);

  // Mostrar Histórico
  console.log(`\n  ${BOLD}${YELLOW}📜 ÚLTIMAS ATIVIDADES:${RESET}`);
  const history = logger.getHistory(5);
  if (history.length === 0) {
    console.log('    \x1b[2m(Nenhuma atividade registrada)\x1b[0m');
  } else {
    history.reverse().forEach(log => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      const component = log.component.padEnd(10);
      const color = log.component === 'ERRO' || log.component === 'SEGURANÇA' ? '\x1b[31m' : '\x1b[36m';
      console.log(`    \x1b[2m[${time}]\x1b[0m ${color}${component}${RESET} │ ${log.message}`);
    });
  }
  console.log(`  \x1b[2m${ORANGE}──────────────────────────────────────────────────────────────────────────────────${RESET}\n`);

  const { option } = await inquirer.prompt([
    {
      type: 'list',
      name: 'option',
      message: 'O que deseja fazer?',
      choices: [
        { name: '📱 1. Conectar WhatsApp (Baileys)', value: 'whatsapp' },
        { name: '🧹 2. Limpar Histórico', value: 'clear' },
        { name: '❌ 3. Sair', value: 'exit' }
      ]
    }
  ]);

  switch (option) {
    case 'whatsapp':
      logger.log('CLI', 'Solicitada conexão WhatsApp');
      db.prepare('INSERT OR REPLACE INTO system_control (key, value) VALUES ("cmd", "CONNECT_WA")').run();
      console.log(`\n${GOLD}⏳ Comando enviado. Verifique o QR Code nos logs do motor.${RESET}`);
      await new Promise(r => setTimeout(r, 2000));
      displayInterface();
      break;

    case 'clear':
      db.run('DELETE FROM activity_logs');
      logger.log('SISTEMA', 'Histórico limpo');
      displayInterface();
      break;
    
    case 'exit':
      console.log(`\n${ORANGE}Até logo, Soberano! 👋${RESET}`);
      process.exit(0);
  }
}

displayInterface();
