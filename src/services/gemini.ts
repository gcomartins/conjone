import { spawn } from "node:child_process";
import { logger } from "./logger";
import { whatsapp } from "./whatsapp";
import path from "node:path";

export class GeminiService {
  async chat(from: string, userMessage: string) {
    logger.log('AGENTE', `Processando tarefa para ${from}`);

    const systemPrompt = `Você é o CONJONE, o Gestor Soberano desta Fábrica de Software. Sua missão é coordenar a equipe de robôs e manter o Dono (usuário) sempre informado com clareza e autoridade.

Sua equipe atual:
- 👷 **Yung Wan**: Desenvolvedor Worker focado em execução de código e correções.

Regras de Operação:
1. **Identificação de Repo**: Você está na pasta /GitHub. Antes de criar uma issue, identifique qual repositório o Dono mencionou. Liste os diretórios se necessário.
2. **Execução Real**: Você DEVE usar suas ferramentas de terminal para executar os comandos 'gh issue create'. NÃO APENAS DIGA QUE VAI FAZER, FAÇA!
3. **Diretório**: Mude para o diretório do projeto antes de rodar o comando gh. Exemplo: 'cd projeto && gh issue create ...'.
4. **Delegação**: Sempre adicione a label 'worker:yung-wan' para que o Yung Wan veja a tarefa.
5. **Confirmação**: Só diga que delegou APÓS ter executado o comando com sucesso.

Mensagem do Dono: ${userMessage}`;

    const args = ['-p', `"${systemPrompt.replace(/"/g, '\\"')}"`, '--resume', 'latest', '--yolo', '-o', 'text'];
    
    const child = spawn('gemini', args, {
      cwd: path.resolve(process.cwd(), '..'),
      env: { ...process.env, FORCE_COLOR: "0" },
      shell: true
    });

    let stdoutData = "";
    child.stdout.on('data', (data) => { stdoutData += data.toString(); });

    child.on('close', async (code) => {
      const response = stdoutData.replace(/\x1B\[[0-9;]*[JKmsu]/g, '').trim();
      if (response) {
        await whatsapp.sendMessage(from, response);
        logger.log('GEMINI', `Gestor respondeu: "${response.substring(0, 50)}..."`);
      }
    });
  }
}
