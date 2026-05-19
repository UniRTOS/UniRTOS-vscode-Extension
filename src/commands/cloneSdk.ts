import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { writeAppJsonToFolder } from '../utils';

export async function chooseDirectoryAndSet(webview: vscode.Webview, openLabel = 'Choose folder', responseField: 'path' | 'value' = 'path') {
  try {
    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel
    });
    if (selected && selected.length > 0) {
      const fsPath = selected[0].fsPath;
      if (responseField === 'value') webview.postMessage({ type: 'setTargetDir', value: fsPath });
      else webview.postMessage({ type: 'setTargetDir', path: fsPath });
    }
  } catch (e) {
    console.warn('chooseDirectoryAndSet failed:', e);
  }
}

async function runGitCloneWithProgress(sdkUrl: string, dest: string, repoName: string, cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Cloning ${repoName}`, cancellable: true },
    (progress, token) => {
      return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
        const gitArgs = ['clone', '--progress', sdkUrl, dest];
        const child = spawn('git', gitArgs, { cwd });
        let stdout = '';
        let stderr = '';
        let lastPct = 0;

        token.onCancellationRequested(() => {
          try { child.kill(); } catch (e) {}
          resolve({ code: 1, stdout, stderr: stderr + '\nCancelled by user' });
        });

        child.stdout?.on('data', (data) => { stdout += data.toString(); });
        child.stderr?.on('data', (data) => {
          const text = data.toString();
          stderr += text;

          const phases: { regex: RegExp; base: number; weight: number }[] = [
            { regex: /Counting objects/i, base: 0, weight: 5 },
            { regex: /Compressing objects/i, base: 5, weight: 5 },
            { regex: /Receiving objects/i, base: 10, weight: 60 },
            { regex: /Resolving deltas/i, base: 70, weight: 15 },
            { regex: /Updating files/i, base: 85, weight: 15 },
          ];

          const phasePctMatch = text.match(/([A-Za-z ]+):\s*([0-9]{1,3})%/);
          if (phasePctMatch) {
            const phaseText = phasePctMatch[1].trim();
            const rawPct = Math.min(100, Math.max(0, parseInt(phasePctMatch[2], 10)));
            const phase = phases.find(p => phaseText.match(p.regex));
            let mappedPct = rawPct;
            if (phase) {
              mappedPct = Math.min(100, Math.round(phase.base + (rawPct * phase.weight) / 100));
            }
            if (mappedPct >= lastPct) {
              const delta = mappedPct - lastPct;
              if (delta > 0) {
                progress.report({ increment: delta, message: `${mappedPct}%` });
                lastPct = mappedPct;
              } else {
                progress.report({ message: `${mappedPct}%` });
              }
            }
            return;
          }

          const pctMatch = text.match(/([0-9]{1,3})%/);
          if (pctMatch) {
            const pct = Math.min(100, Math.max(0, parseInt(pctMatch[1], 10)));
            if (pct >= lastPct) {
              const delta = pct - lastPct;
              if (delta > 0) {
                progress.report({ increment: delta, message: `${pct}%` });
                lastPct = pct;
              } else {
                progress.report({ message: `${pct}%` });
              }
            }
          } else {
            const msg = text.split('\n')[0].trim();
            if (msg) {
              const lower = msg.toLowerCase();
              if (lower.startsWith('remote:') || /pack-reused/i.test(msg) || /reused \d+/i.test(msg) || /total \d+/i.test(msg) || /^cloning\b/i.test(msg)) {
              } else {
                progress.report({ message: msg });
              }
            }
          }
        });

        child.on('close', (code) => {
          if (lastPct < 100) progress.report({ increment: 100 - lastPct, message: '100%' });
          resolve({ code: code ?? 0, stdout, stderr });
        });

        child.on('error', (err) => {
          resolve({ code: 1, stdout, stderr: stderr + err.message });
        });
      });
    }
  );
}

export async function downloadAndCloneSdk(sdkUrl: string, targetDir?: string, projectName?: string): Promise<string | null> {
  if (!sdkUrl) return null;

  if (!targetDir) {
    vscode.window.showWarningMessage('Please select a target directory to clone the SDK repository.');
    return null;
  }

  const repoNameMatch = sdkUrl.match(/\/([^\/]+?)(?:\.git)?$/);
  const repoName = repoNameMatch ? repoNameMatch[1].replace(/\.git$/, '') : 'repo';
  const folderName = projectName && projectName.trim().length > 0 ? projectName.trim() : repoName;
  const dest = path.join(targetDir as string, folderName);

  if (fs.existsSync(dest)) {
    const overwrite = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: `Folder ${dest} exists. Remove and re-clone?`, canPickMany: false });
    if (overwrite !== 'Yes') return null;
    try { fs.rmSync(dest, { recursive: true, force: true }); } catch (e) {}
  }

  const result = await runGitCloneWithProgress(sdkUrl, dest, repoName, targetDir as string);

  if (result.code !== 0) {
    vscode.window.showErrorMessage(`git clone failed: ${result.stderr || result.stdout}`);
    return null;
  }

  const appManifest: any = {
    demo: false,
    createdBy: 'unirtos-extension'
  };
  const createAppFile = writeAppJsonToFolder(dest, appManifest);
  if (!createAppFile) {
    vscode.window.showWarningMessage('Failed to write app config file.');
    return null;
  }

  vscode.window.showInformationMessage(`Cloned -> ${dest}`);
  return dest;
}
