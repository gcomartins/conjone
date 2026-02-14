import { spawn } from "node:child_process";
import { logger } from "./logger";
import { whatsapp } from "./whatsapp";
import path from "node:path";

export class GeminiService {
  /**
   * Executa o Gemini CLI e captura o stdout puro como resposta.
   * Os logs de carregamento do sistema vão para o stderr, portanto o stdout
   * contém apenas o que o modelo/agente gerou.
   */
  async chat(from: string, userMessage: string) {
    logger.log('AGENTE', `Processando comando para ${from}`);

    // --resume latest: Mantém o histórico da conversa
    // --yolo: Execução autônoma de ferramentas
    // -o text: Saída em texto puro no stdout
    const args = ['-p', `"${userMessage.replace(/"/g, '\\"')}"`, '--resume', 'latest', '--yolo', '-o', 'text'];
    
    const child = spawn('gemini', args, {
      cwd: path.resolve(process.cwd(), '..'), // Inicia no diretório pai (GitHub)
      env: { ...process.env, FORCE_COLOR: "0" },
      shell: true
    });

    let stdoutData = "";
    let stderrData = "";

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdoutData += chunk;
      console.log(`[STDOUT] ${chunk}`);
    });

    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderrData += chunk;
      // Não logamos o stderr completo para não poluir o histórico do usuário,
      // pois o Gemini CLI joga logs de carregamento lá.
    });

    child.on('close', async (code) => {
      const response = this.cleanOutput(stdoutData);
      
      if (response.trim()) {
        await whatsapp.sendMessage(from, response);
        logger.log('GEMINI', `Resposta enviada para ${from}`);
      } else {
        // Se o stdout estiver vazio, mas o processo terminou bem, 
        // verificamos se houve erro real no stderr.
        if (code !== 0) {
          logger.log('ERRO', `Gemini falhou (Code ${code}). Stderr: ${stderrData.substring(0, 50)}...`);
          await whatsapp.sendMessage(from, "❌ O motor agêntico encontrou um erro ao processar seu comando.");
        } else {
          logger.log('AVISO', `Gemini retornou vazio para ${from}`);
          await whatsapp.sendMessage(from, "⚠️ O comando foi processado, mas não houve retorno visual.");
        }
      }
    });
  }

  private cleanOutput(text: string) {
    return text
      .replace(/\x1B\[[0-9;]*[JKmsu]/g, '') // Remove ANSI
      .trim();
  }
}
