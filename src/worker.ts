import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { exec } from "node:child_process";
import { logger } from "./services/logger";
import path from "path";
import fs from "fs";
import db from "./database";

const execPromise = promisify(exec);

/**
 * WORKER: Yung Wan
 * ENGINE: Jules Extension (Gemini CLI)
 */
const WORKER_NAME = "Yung Wan";
const WORKER_LABEL = "worker:yung-wan";
const CONJONE_REPOS_ROOT = path.resolve(process.cwd(), '../conjone-repos'); 
const POLLING_INTERVAL = 30000;

async function notifyOwner(message: string) {
  db.prepare('INSERT INTO activity_logs (component, message) VALUES ($comp, $msg)')
    .run({ $comp: 'WORKER_NOTIFY', $msg: message });
  
  db.prepare('INSERT OR REPLACE INTO system_control (key, value) VALUES ("notify_owner", $msg)')
    .run({ $msg: message });
}

async function runWorker() {
  logger.log('WORKER', `👷 Operário ${WORKER_NAME} armado com a extensão JULES. Vigiando /conjone-repos...`);

  if (!fs.existsSync(CONJONE_REPOS_ROOT)) {
    fs.mkdirSync(CONJONE_REPOS_ROOT, { recursive: true });
  }

  while (true) {
    try {
      await patrolAndWork();
    } catch (e: any) {
      logger.log('ERRO', `[${WORKER_NAME}] Falha no ciclo: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, POLLING_INTERVAL));
  }
}

async function patrolAndWork() {
  const repos = fs.readdirSync(CONJONE_REPOS_ROOT).filter(file => {
    const fullPath = path.join(CONJONE_REPOS_ROOT, file);
    try {
      return fs.statSync(fullPath).isDirectory() && fs.existsSync(path.join(fullPath, '.git'));
    } catch {
      return false;
    }
  });

  for (const repoName of repos) {
    const repoPath = path.join(CONJONE_REPOS_ROOT, repoName);
    const hasWork = await checkRepoForWork(repoPath);
    if (hasWork) return; 
  }
}

async function checkRepoForWork(repoPath: string): Promise<boolean> {
  try {
    const { stdout } = await execPromise(`gh issue list --label "${WORKER_LABEL}" --state open --json number,title,body --limit 1`, { cwd: repoPath });
    const issues = JSON.parse(stdout);

    if (issues.length > 0) {
      await processIssue(repoPath, issues[0]);
      return true;
    }
  } catch (e) {}
  return false;
}

async function processIssue(repoPath: string, issue: any) {
  const issueId = issue.number;
  const repoName = path.basename(repoPath);
  const branchName = `dev/${WORKER_NAME.toLowerCase().replace(/\s+/g, '-')}/issue-${issueId}`;

  logger.log('WORKER', `🚀 [${repoName}] Invocando JULES para a tarefa #${issueId}`);
  await notifyOwner(`👷 *${WORKER_NAME}* acionou o motor *JULES* para resolver uma tarefa!\n📂 *Repo:* ${repoName}\n🆔 *Issue:* #${issueId}\n📝 *Título:* ${issue.title}`);

  try {
    // 1. LIMPEZA E PREPARAÇÃO
    await execPromise(`git reset --hard && git clean -fd`, { cwd: repoPath });
    const { stdout: mainBranchRaw } = await execPromise(`git remote show origin | sed -n '/HEAD branch/s/.*: //p'`, { cwd: repoPath });
    const mainBranch = mainBranchRaw.trim() || 'master';
    await execPromise(`git checkout ${mainBranch} && git pull origin ${mainBranch}`, { cwd: repoPath });

    // 2. STATUS IN PROGRESS
    await execPromise(`gh issue edit ${issueId} --add-label "status:in-progress"`, { cwd: repoPath });
    await execPromise(`gh issue comment ${issueId} --body "👷 **${WORKER_NAME}:** Delegando execução para a extensão **JULES**. \nBranch base: \`${mainBranch}\`."`, { cwd: repoPath });

    // 3. INVOCAÇÃO DO JULES
    // Instruímos o Gemini CLI a usar especificamente a extensão Jules
    const prompt = `Use a extensão Jules para resolver a issue #${issueId} (${issue.title}) neste repositório. 
A descrição da issue é: ${issue.body}
Implemente a solução, rode os testes e certifique-se de que o código está robusto.
Não faça commits, eu farei a finalização.`;

    const child = spawn('gemini', ['-p', `"${prompt.replace(/"/g, '\\"')}"`, '--yolo'], {
      cwd: repoPath,
      env: { ...process.env, FORCE_COLOR: "0" },
      shell: true
    });

    await new Promise((resolve) => child.on('close', resolve));

    // 4. VERIFICAR MUDANÇAS E FINALIZAR
    const { stdout: status } = await execPromise(`git status --porcelain`, { cwd: repoPath });
    if (!status.trim()) {
      throw new Error("O motor JULES não realizou alterações nos arquivos.");
    }

    await notifyOwner(`💾 *JULES* finalizou o código. *${WORKER_NAME}* enviando PR...`);

    await execPromise(`git checkout -b ${branchName}`, { cwd: repoPath }).catch(() => execPromise(`git checkout ${branchName}`, { cwd: repoPath }));
    await execPromise(`git add .`, { cwd: repoPath });
    await execPromise(`git commit -m "feat(jules): resolved #${issueId} via ${WORKER_NAME}"`, { cwd: repoPath });
    await execPromise(`git push origin ${branchName} --force`, { cwd: repoPath });
    
    await execPromise(`gh pr create --title "[JULES] ${issue.title}" --body "Trabalho realizado pelo motor JULES via ${WORKER_NAME}.\n\nResolves #${issueId}" --head ${branchName}`, { cwd: repoPath });
    
    // 5. STATUS DONE
    await execPromise(`gh issue edit ${issueId} --remove-label "${WORKER_LABEL}" --remove-label "status:in-progress" --add-label "status:done"`, { cwd: repoPath });
    
    await notifyOwner(`✅ *JULES CONCLUIU!*\n👷 *Agente:* ${WORKER_NAME}\n📂 *Repo:* ${repoName}\n🆔 *Issue:* #${issueId}\n🚀 *Status:* PR Aberto.`);
    
    logger.log('WORKER', `✅ [${repoName}] Jules concluiu a tarefa #${issueId}`);
  } catch (err: any) {
    await notifyOwner(`❌ *ERRO NO JULES (Issue #${issueId})*\n👷 *Agente:* ${WORKER_NAME}\n⚠️ *Erro:* ${err.message}`);
    logger.log('ERRO', `[JULES] Falha em ${repoName}: ${err.message}`);
    await execPromise(`gh issue comment ${issueId} --body "❌ **${WORKER_NAME}:** O motor JULES falhou: ${err.message}"`, { cwd: repoPath }).catch(()=>{});
  }

  // Reset final
  try {
    const { stdout: mainBranchRaw } = await execPromise(`git remote show origin | sed -n '/HEAD branch/s/.*: //p'`, { cwd: repoPath });
    const mainBranch = mainBranchRaw.trim() || 'master';
    await execPromise(`git checkout ${mainBranch} && git reset --hard`, { cwd: repoPath });
  } catch (e) {}
}

runWorker();
