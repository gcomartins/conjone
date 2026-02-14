import { spawn } from "node:child_process";
import { logger } from "./logger";
import { whatsapp } from "./whatsapp";
import path from "node:path";

export class GeminiService {
  /**
   * Executa o Gemini CLI com uma persona de Gestor Soberano.
   */
  async chat(from: string, userMessage: string) {
    logger.log('AGENTE', `Processando tarefa para ${from}`);

    const systemPrompt = `Você é o CONJONE, o Gestor Soberano desta Fábrica de Software. Sua missão é coordenar a equipe de robôs e manter o Dono (usuário) sempre informado.

Sua equipe atual:
- 👷 **Yung Wan**: Desenvolvedor Worker focado em execução de código e correções.

REGRAS CRÍTICAS DE SEGURANÇA:
1. **PROIBIÇÃO DE AUTO-MODIFICAÇÃO**: Você está terminantemente PROIBIDO de operar, criar issues ou delegar tarefas para o repositório 'conjone'. Este é o seu próprio código-fonte. Alterá-lo pode causar instabilidade ou falha total do sistema.
2. Se o Dono pedir para fazer algo no projeto 'conjone', explique que por segurança você não pode alterar seu próprio código.
3. Você opera na pasta /GitHub, que contém outros projetos. Trabalhe neles.

Regras de Operação:
1. **Identificação de Repo**: Identifique qual repositório o Dono mencionou.
2. **Execução Real**: Use 'gh issue create' para delegar ao Yung Wan (label 'worker:yung-wan'). NÃO apenas diga que vai fazer, EXECUTE o comando.
3. **WhatsApp**: Use negrito (*), emojis e listas para clareza.

Mensagem do Dono: ${userMessage}`;

    const args = ['-p', `"${systemPrompt.replace(/"/g, '\\"')}"`, '--resume', 'latest', '--yolo', '-o', 'text'];
    
    const child = spawn('gemini', args, {
      cwd: path.resolve(process.cwd(), '..'), // Pasta /GitHub
      env: { ...process.env, FORCE_COLOR: "0" },
      shell: true
    });

    let stdoutData = "";
    let stderrData = "";

    child.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    child.on('close', async (code) => {
      const response = this.cleanOutput(stdoutData);
      
      if (response.trim()) {
        await whatsapp.sendMessage(from, response);
        logger.log('GEMINI', `Gestor respondeu: "${response.substring(0, 50)}..."`);
      } else {
        if (code !== 0) {
          logger.log('ERRO', `Falha no motor (Code ${code})`);
          await whatsapp.sendMessage(from, "❌ Falha crítica no motor agêntico.");
        } else {
          await whatsapp.sendMessage(from, "⚠️ Comando processado sem retorno visual.");
        }
      }
    });
  }

  private cleanOutput(text: string) {
    return text.replace(/\x1B\[[0-9;]*[JKmsu]/g, '').trim();
  }
}
