import { promisify } from "node:util";
import { exec, spawn } from "node:child_process";
import { logger } from "./services/logger";
import path from "path";
import fs from "fs";
import db from "./database";

const execPromise = promisify(exec);

// Identidade do Scrum Master
const SCRUM_NAME = "Genevro";
const CONJONE_REPOS_ROOT = path.resolve(process.cwd(), '../conjone-repos'); 
const POLLING_INTERVAL = 1800000; // 30 minutos

async function notifyOwner(message: string) {
  db.prepare('INSERT OR REPLACE INTO system_control (key, value) VALUES ("notify_owner", $msg)')
    .run({ $msg: message });
}

async function runScrumMaster() {
  logger.log('SCRUM', `🎩 ${SCRUM_NAME} em patrulha ativa em /conjone-repos.`);

  while (true) {
    try {
      await performCeremonies();
    } catch (e: any) {
      logger.log('ERRO', `[${SCRUM_NAME}] Falha na cerimônia: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, POLLING_INTERVAL));
  }
}

async function performCeremonies() {
  if (!fs.existsSync(CONJONE_REPOS_ROOT)) return;

  const repos = fs.readdirSync(CONJONE_REPOS_ROOT).filter(file => {
    const fullPath = path.join(CONJONE_REPOS_ROOT, file);
    try {
      return fs.statSync(fullPath).isDirectory() && fs.existsSync(path.join(fullPath, '.git'));
    } catch { return false; }
  });

  for (const repoName of repos) {
    const repoPath = path.join(CONJONE_REPOS_ROOT, repoName);
    logger.log('SCRUM', `🧐 Auditando backlog de "${repoName}"...`);

    try {
      const { stdout } = await execPromise(`gh issue list --state open --json number,title,body,labels,updatedAt`, { cwd: repoPath });
      const issues = JSON.parse(stdout);

      for (const issue of issues) {
        await auditAndFixIssue(repoPath, repoName, issue);
      }
    } catch (e) {}
  }
}

async function auditAndFixIssue(repoPath: string, repoName: string, issue: any) {
  const labels = issue.labels.map((l: any) => l.name);
  const issueId = issue.number;

  // 1. CORREÇÃO: Issue sem nenhuma label
  if (labels.length === 0) {
    await execPromise(`gh issue edit ${issueId} --add-label "bug"`, { cwd: repoPath }).catch(() => {});
    await notifyOwner(`🎩 *${SCRUM_NAME}* organizou o backlog em *${repoName}*!\n🆔 *Issue:* #${issueId}\n🛠️ *Ação:* Adicionada label automática.`);
  }

  // 2. CORREÇÃO: Descrição vazia
  if (!issue.body || issue.body.length < 20) {
    const prompt = `Você é o Scrum Master Genevro. A issue "${issue.title}" no repositório "${repoName}" está sem descrição. Escreva uma descrição técnica concisa.`;
    const child = spawn('gemini', ['-p', `"${prompt.replace(/"/g, '\\"')}"`, '--yolo'], {
      cwd: repoPath,
      env: { ...process.env, FORCE_COLOR: "0" },
      shell: true
    });
    let newBody = "";
    child.stdout.on('data', (d) => newBody += d.toString());
    await new Promise(r => child.on('close', r));

    if (newBody.trim()) {
      await execPromise(`gh issue edit ${issueId} --body "${newBody.replace(/"/g, '\\"').trim()}"`, { cwd: repoPath });
    }
  }

  // 3. AUDITORIA: Gargalo
  if (labels.includes('status:in-progress')) {
    const lastUpdate = new Date(issue.updatedAt).getTime();
    const now = new Date().getTime();
    const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);

    if (hoursSinceUpdate > 1) {
      await execPromise(`gh issue comment ${issueId} --body "🎩 **${SCRUM_NAME}:** @worker, esta tarefa está em progresso há mais de 1 hora."`, { cwd: repoPath });
    }
  }
}

runScrumMaster();
