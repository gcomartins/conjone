import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { exec } from "node:child_process";
import { logger } from "./services/logger";
import path from "path";
import fs from "fs";
import db from "./database";

const execPromise = promisify(exec);

// Identidade do Worker
const WORKER_NAME = "Yung Wan";
const WORKER_LABEL = "worker:yung-wan";
const GITHUB_ROOT = path.resolve(process.cwd(), '..'); 
const POLLING_INTERVAL = 30000;

async function notifyOwner(message: string) {
  // Envia um sinal para o server.ts via banco para ele notificar no WhatsApp
  db.prepare('INSERT INTO activity_logs (component, message) VALUES ($comp, $msg)')
    .run({ $comp: 'WORKER_NOTIFY', $msg: message });
  
  db.prepare('INSERT OR REPLACE INTO system_control (key, value) VALUES ("notify_owner", $msg)')
    .run({ $msg: message });
}

async function runWorker() {
  logger.log('WORKER', `👷 Auditoria iniciada. ${WORKER_NAME} vigiando /GitHub...`);

  while (true) {
    try {
      await patrolRepositories();
    } catch (e: any) {
      logger.log('ERRO', `[${WORKER_NAME}] Falha na patrulha: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, POLLING_INTERVAL));
  }
}

async function patrolRepositories() {
  const repos = fs.readdirSync(GITHUB_ROOT).filter(file => {
    const fullPath = path.join(GITHUB_ROOT, file);
    return fs.statSync(fullPath).isDirectory() && fs.existsSync(path.join(fullPath, '.git'));
  });

  for (const repoName of repos) {
    const repoPath = path.join(GITHUB_ROOT, repoName);
    
    try {
      const { stdout } = await execPromise(`gh issue list --label "${WORKER_LABEL}" --state open --json number,title,body --limit 1`, { cwd: repoPath });
      const issues = JSON.parse(stdout);

      if (issues.length > 0) {
        await processIssue(repoPath, issues[0]);
      }
    } catch (e) {}
  }
}

async function processIssue(repoPath: string, issue: any) {
  const issueId = issue.number;
  const repoName = path.basename(repoPath);
  const branchName = `dev/${WORKER_NAME.toLowerCase().replace(' ', '-')}/issue-${issueId}`;

  // LOG DE IDENTIFICAÇÃO
  logger.log('WORKER', `🔍 ${WORKER_NAME} identificou tarefa #${issueId} no repo "${repoName}"`);
  await notifyOwner(`👷 *${WORKER_NAME}* identificou uma nova tarefa!\n📂 *Repo:* ${repoName}\n🆔 *Issue:* #${issueId}\n📝 *Título:* ${issue.title}`);

  try {
    // LOG DE INÍCIO
    await notifyOwner(`⚙️ *${WORKER_NAME}* iniciando trabalhos...\n🌿 *Branch:* \`${branchName}\``);
    
    await execPromise(`git checkout master || git checkout main`, { cwd: repoPath });
    await execPromise(`git pull origin`, { cwd: repoPath });
    await execPromise(`git checkout -b ${branchName}`, { cwd: repoPath }).catch(() => execPromise(`git checkout ${branchName}`, { cwd: repoPath }));

    const prompt = `Agente: ${WORKER_NAME}\nRepo: ${repoName}\nTarefa: #${issueId}\nDescrição: ${issue.body}\n\nExecute a tarefa agora.`;

    const child = spawn('gemini', ['-p', `"${prompt.replace(/"/g, '\\"')}"`, '--yolo'], {
      cwd: repoPath,
      env: { ...process.env, FORCE_COLOR: "0" },
      shell: true
    });

    await new Promise((resolve) => child.on('close', resolve));

    // LOG DE CONCLUSÃO TÉCNICA
    await notifyOwner(`💾 *${WORKER_NAME}* finalizou o código. Enviando commit e abrindo Pull Request...`);

    await execPromise(`git add .`, { cwd: repoPath });
    await execPromise(`git commit -m "feat(${WORKER_NAME.toLowerCase()}): resolved #${issueId}"`, { cwd: repoPath });
    await execPromise(`git push origin ${branchName} --force`, { cwd: repoPath });
    
    await execPromise(`gh pr create --title "[${WORKER_NAME}] ${issue.title}" --body "Trabalho concluído por ${WORKER_NAME} no repo ${repoName}.\n\nResolves #${issueId}" --head ${branchName}`, { cwd: repoPath });
    
    await execPromise(`gh issue edit ${issueId} --remove-label "${WORKER_LABEL}" --add-label "status:review"`, { cwd: repoPath });
    
    // LOG DE FINALIZAÇÃO
    await notifyOwner(`✅ *TAREFA CONCLUÍDA!*\n👷 *Agente:* ${WORKER_NAME}\n📂 *Repo:* ${repoName}\n🆔 *Issue:* #${issueId}\n🚀 *Status:* Aguardando sua revisão (PR Aberto).`);
    
    logger.log('WORKER', `✅ [${repoName}] Tarefa #${issueId} concluída.`);
  } catch (err: any) {
    await notifyOwner(`❌ *ERRO NA TAREFA #${issueId}*\n👷 *Agente:* ${WORKER_NAME}\n⚠️ *Erro:* ${err.message}`);
    logger.log('ERRO', `[${WORKER_NAME}] Falha em ${repoName}: ${err.message}`);
  }

  await execPromise(`git checkout master || git checkout main`, { cwd: repoPath });
}

runWorker();
