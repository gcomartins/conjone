import { spawn } from "node:child_process";
import { logger } from "./logger";
import { whatsapp } from "./whatsapp";
import path from "node:path";

export class GeminiService {
  /**
   * O Gestor agora orquestra o Worker (Yung Wan) que por sua vez utiliza o motor JULES.
   */
  async chat(from: string, userMessage: string) {
    logger.log('AGENTE', `Gestor processando tarefa para ${from}`);

    const systemPrompt = `Você é o CONJONE, o Gestor Soberano.
Seu ambiente de trabalho é o diretório \`/conjone-repos\`.

Sua equipe de Elite:
- 👷 **Yung Wan**: Seu desenvolvedor principal. Ele agora está armado com a extensão **JULES**, o motor de engenharia autônoma mais avançado do Google. 
- 🎩 **Genevro**: Seu Scrum Master para auditoria e documentação.

Regras de Operação:
1. **Poder do Jules**: Quando o Dono pedir qualquer codificação, refatoração ou correção, delegue IMEDIATAMENTE para o Yung Wan. Ele usará o motor JULES para resolver.
2. **Delegação**: Crie issues com a label 'worker:yung-wan' nos repositórios em \`/conjone-repos\`.
3. **Clonagem**: Se o repositório não estiver na pasta, use 'git clone' antes de criar a issue.
4. **Segurança**: NUNCA opere no diretório 'conjone'.

Mensagem do Dono: ${userMessage}`;

    const args = ['-p', `"${systemPrompt.replace(/"/g, '\\"')}"`, '--resume', 'latest', '--yolo', '-o', 'text'];
    
    const child = spawn('gemini', args, {
      cwd: path.resolve(process.cwd(), '../conjone-repos'),
      env: { ...process.env, FORCE_COLOR: "0" },
      shell: true
    });

    let stdoutData = "";
    let stderrData = "";

    child.stdout.on('data', (data) => { stdoutData += data.toString(); });
    child.stderr.on('data', (data) => { stderrData += data.toString(); });

    const timeout = setTimeout(() => {
      child.kill();
      logger.log('ERRO', 'Timeout no Gestor.');
    }, 120000);

    child.on('close', async (code) => {
      clearTimeout(timeout);
      const response = this.cleanOutput(stdoutData);
      if (response) {
        await whatsapp.sendMessage(from, response);
        logger.log('GEMINI', `Gestor respondeu.`);
      } else if (code !== 0) {
        logger.log('ERRO', `Falha no Gestor: ${stderrData.substring(0, 100)}`);
      }
    });
  }

  private cleanOutput(text: string) {
    return text.replace(/\x1B\[[0-9;]*[JKmsu]/g, '').trim();
  }
}
