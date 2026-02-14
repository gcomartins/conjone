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
  db.prepare('INSERT INTO activity_logs (component, message) VALUES ($comp, $msg)')
    .run({ $comp: 'WORKER_NOTIFY', $msg: message });
  
  db.prepare('INSERT OR REPLACE INTO system_control (key, value) VALUES ("notify_owner", $msg)')
    .run({ $msg: message });
}

async function runWorker() {
  logger.log('WORKER', `👷 Auditoria iniciada. ${WORKER_NAME} vigiando /GitHub...`);

  while (true) {
    try {
      // O Worker processa apenas uma tarefa por ciclo, garantindo foco total.
      await patrolAndWork();
    } catch (e: any) {
      logger.log('ERRO', `[${WORKER_NAME}] Falha no ciclo: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, POLLING_INTERVAL));
  }
}

async function patrolAndWork() {
  const repos = fs.readdirSync(GITHUB_ROOT).filter(file => {
    const fullPath = path.join(GITHUB_ROOT, file);
    try {
      return fs.statSync(fullPath).isDirectory() && fs.existsSync(path.join(fullPath, '.git'));
    } catch {
      return false;
    }
  });

  for (const repoName of repos) {
    // TRAVA DE SEGURANÇA: O Worker nunca deve operar no projeto do próprio Conjone
    if (repoName.toLowerCase() === 'conjone') continue;

    const repoPath = path.join(GITHUB_ROOT, repoName);
    
    try {
      // Busca a primeira issue designada para este worker
      const { stdout } = await execPromise(`gh issue list --label "${WORKER_LABEL}" --state open --json number,title,body --limit 1`, { cwd: repoPath });
      const issues = JSON.parse(stdout);

      if (issues.length > 0) {
        await processIssue(repoPath, issues[0]);
        return; // Sai após processar UMA issue para garantir que não atue em várias ao mesmo tempo
      }
    } catch (e) {}
  }
}

async function processIssue(repoPath: string, issue: any) {
  const issueId = issue.number;
  const repoName = path.basename(repoPath);
  const branchName = `dev/${WORKER_NAME.toLowerCase().replace(/\s+/g, '-')}/issue-${issueId}`;

  logger.log('WORKER', `🚀 [${repoName}] Atuando na tarefa #${issueId}`);
  await notifyOwner(`👷 *${WORKER_NAME}* assumiu a tarefa!\n📂 *Repo:* ${repoName}\n🆔 *Issue:* #${issueId}\n📝 *Título:* ${issue.title}`);

  try {
    // 1. GARANTIR REPOSITÓRIO LIMPO
    logger.log('WORKER', `🧹 Limpando repositório ${repoName}...`);
    await execPromise(`git reset --hard && git clean -fd`, { cwd: repoPath });
    
    // 2. IDENTIFICAR E VOLTAR PARA BRANCH PRINCIPAL
    const { stdout: mainBranchRaw } = await execPromise(`git remote show origin | sed -n '/HEAD branch/s/.*: //p'`, { cwd: repoPath });
    const mainBranch = mainBranchRaw.trim() || 'master';
    
    logger.log('WORKER', `🌿 Sincronizando com a branch ${mainBranch}...`);
    await execPromise(`git checkout ${mainBranch} && git pull origin ${mainBranch}`, { cwd: repoPath });

    // 3. ATUALIZAR STATUS NO GITHUB (IN PROGRESS)
    await execPromise(`gh issue edit ${issueId} --add-label "status:in-progress"`, { cwd: repoPath }).catch(() => {});
    await execPromise(`gh issue comment ${issueId} --body "👷 **${WORKER_NAME}:** Iniciando desenvolvimento. Branch baseada na \`${mainBranch}\`."`, { cwd: repoPath });

    // 4. CRIAR BRANCH A PARTIR DA MAIN
    await notifyOwner(`⚙️ *${WORKER_NAME}* criando branch \`${branchName}\` a partir da \`${mainBranch}\`...`);
    await execPromise(`git checkout -b ${branchName}`, { cwd: repoPath }).catch(() => execPromise(`git checkout ${branchName}`, { cwd: repoPath }));

    const prompt = `Agente: ${WORKER_NAME}\nRepo: ${repoName}\nTarefa: #${issueId}\nDescrição: ${issue.body}\n\nAnalise o projeto e implemente a solução. Não faça commits.`;

    const child = spawn('gemini', ['-p', `"${prompt.replace(/"/g, '\\"')}"`, '--yolo'], {
      cwd: repoPath,
      env: { ...process.env, FORCE_COLOR: "0" },
      shell: true
    });

    await new Promise((resolve) => child.on('close', resolve));

    // 5. VERIFICAR MUDANÇAS E COMMITAR
    const { stdout: status } = await execPromise(`git status --porcelain`, { cwd: repoPath });
    if (!status.trim()) {
      throw new Error("O Gemini CLI não realizou alterações nos arquivos.");
    }

    await notifyOwner(`💾 *${WORKER_NAME}* finalizou o código. Abrindo Pull Request...`);

    await execPromise(`git add .`, { cwd: repoPath });
    await execPromise(`git commit -m "feat(${WORKER_NAME.toLowerCase()}): resolved #${issueId}"`, { cwd: repoPath });
    await execPromise(`git push origin ${branchName} --force`, { cwd: repoPath });
    
    await execPromise(`gh pr create --title "[${WORKER_NAME}] ${issue.title}" --body "Trabalho concluído por ${WORKER_NAME} no repo ${repoName}.\n\nResolves #${issueId}" --head ${branchName}`, { cwd: repoPath });
    
    // 6. ATUALIZAR STATUS FINAL (REMOVE IN-PROGRESS, ADD DONE)
    await execPromise(`gh issue edit ${issueId} --remove-label "${WORKER_LABEL}" --remove-label "status:in-progress" --add-label "status:done"`, { cwd: repoPath });
    
    await notifyOwner(`✅ *TAREFA PRONTA!*\n👷 *Agente:* ${WORKER_NAME}\n📂 *Repo:* ${repoName}\n🆔 *Issue:* #${issueId}\n🚀 *Status:* Trocado de 'in-progress' para 'done'. PR Aberto.`);
    
    logger.log('WORKER', `✅ [${repoName}] Tarefa #${issueId} concluída com sucesso.`);
  } catch (err: any) {
    await notifyOwner(`❌ *ERRO NA TAREFA #${issueId}*\n👷 *Agente:* ${WORKER_NAME}\n⚠️ *Erro:* ${err.message}`);
    logger.log('ERRO', `[${WORKER_NAME}] Falha em ${repoName}: ${err.message}`);
    
    try {
      await execPromise(`gh issue comment ${issueId} --body "❌ **${WORKER_NAME}:** Falha ao processar tarefa. \n\n**Erro:** ${err.message}"`, { cwd: repoPath });
    } catch (e) {}
  }

  // 7. VOLTAR PARA BRANCH PRINCIPAL E LIMPAR
  try {
    const { stdout: mainBranchRaw } = await execPromise(`git remote show origin | sed -n '/HEAD branch/s/.*: //p'`, { cwd: repoPath });
    const mainBranch = mainBranchRaw.trim() || 'master';
    await execPromise(`git checkout ${mainBranch} && git reset --hard`, { cwd: repoPath });
  } catch (e) {}
}

runWorker();
