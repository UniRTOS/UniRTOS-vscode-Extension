import * as vscode from 'vscode';
import * as path from 'path';
import { exec, spawn } from 'child_process';
import { showNewProjectDemo } from './newProjectDemo';
import { platformFilePath, sendPlatforms, handlePlatformChanged, writeAppJsonToFolder } from '../utils';
import { injectHeaderIntoHtml } from './header';
import * as fs from 'fs';
import { runBasicEnvChecks } from './checkView';
import { UNIRTOS_REPO } from '../constants';

let newProjectPanel: vscode.WebviewPanel | undefined;

export async function handleNewProject(labelsArr: string[], context: vscode.ExtensionContext): Promise<boolean> {
  // show to user list of platforms and models to choose and download the sdk
  let title = 'New Project';
  if (!labelsArr.includes(title)) return false;

  // load platforms JSON from extension
  const platforms = platformFilePath(context);

  const platformKeys = Object.keys(platforms);
  if (platformKeys.length === 0) {
    vscode.window.showInformationMessage('No platforms available');
    return true;
  }

  // Use 1 tab only, not multiple ones
  if (newProjectPanel) {
    newProjectPanel.reveal(vscode.ViewColumn.One);
    const basicExisting = runBasicEnvChecks(context);
    const passedExisting = basicExisting.gitFound && basicExisting.unirtosFound && basicExisting.pythonOk && basicExisting.workspaceOk;
    try { newProjectPanel.webview.postMessage({ type: 'setUniRTOSProject', value: passedExisting }); } catch (e) {}
    return true;
  }

  const panel = vscode.window.createWebviewPanel(
    'unirtosNewProject',
    `UniRTOS — ${title}`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(context.extensionPath)]
    }
  );
  newProjectPanel = panel;
  panel.onDidDispose(() => { newProjectPanel = undefined; });

  const file = path.join(context.extensionPath, 'src', 'webview', 'new-project.html');
  let html = '<p>New project UI not found</p>';
  try {
    html = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.error('Failed to read new-project.html', e);
  }

  // inject header
  html = injectHeaderIntoHtml(html, panel, context, title);

  panel.webview.html = html;
  
  // check if project is unirtos
  const basic = runBasicEnvChecks(context);
  const gitFound = basic.gitFound;
  const unirtosFound = basic.unirtosFound;

  const pythonOk = basic.pythonOk; // 3. python check
  const workspaceOk = basic.workspaceOk; // 4. check if current workspace is UniRTOS SDK

  let projectConfigPassed = gitFound && unirtosFound && pythonOk && workspaceOk;
  if (projectConfigPassed) {
    panel.webview.postMessage({ type: 'setUniRTOSProject', value: true });
  }

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'ready') {
      sendPlatforms(panel.webview, platformKeys);
      return;
    }
    
    if (msg.type === 'platformChanged') {
      handlePlatformChanged(msg.value, platforms, panel.webview);
      return;
    }

    if (msg.type === 'chooseDir') {
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select folder to save SDK'
      });
      if (uris && uris.length > 0) {
        panel.webview.postMessage({ type: 'setTargetDir', path: uris[0].fsPath });
      }
      return;
    }

    // show message from webview (info/warning/error)
    if (msg.type === 'showMessage') {
      try {
        const level = (msg.level || 'info') as string;
        const text = msg.text || '';
        if (level === 'warning') vscode.window.showWarningMessage(text);
        else if (level === 'error') vscode.window.showErrorMessage(text);
        else vscode.window.showInformationMessage(text);
      } catch (e) {
        console.warn('Failed to show message from webview:', e);
      }
      return;
    }

    if (msg.type === 'create') {
      const pickedPlatformKey = msg.platform as string | undefined;
      const pickedModel = msg.model as string | undefined;
      const pickedTargetDir = msg.targetDir as string | undefined;
      const pickedProjectName = msg.projectName as string | undefined;
      
      const infoMsg = pickedModel
        ? UNIRTOS_REPO
          ? `Selected: ${pickedPlatformKey} / ${pickedModel} — ${UNIRTOS_REPO}`
          : `Selected: ${pickedPlatformKey} / ${pickedModel}`
        : `Selected: ${pickedPlatformKey}`;
      console.log(infoMsg);

      await downloadAndCloneSdk(UNIRTOS_REPO, pickedTargetDir, pickedProjectName);
      panel.dispose();
      return;
    }

    if (msg.type === 'cancel') {
      panel.dispose();
      return;
    }
    
    if (msg.type === 'openDemo') {
      // open the demo page (reuses existing demo handler)
      try {
        showNewProjectDemo(context);
      } catch (e) {
        console.warn('Failed to open demo page:', e);
      }
      return;
    }
  });

  return true;
}

export async function downloadAndCloneSdk(sdkUrl: string, targetDir?: string, projectName?: string): Promise<boolean> {
  if (!sdkUrl) return false;

  
  if (!targetDir) {
    vscode.window.showWarningMessage('Please select a target directory to clone the SDK repository.');
    return false;
  }
  const repoNameMatch = sdkUrl.match(/\/([^\/]+?)(?:\.git)?$/);
  const repoName = repoNameMatch ? repoNameMatch[1].replace(/\.git$/, '') : 'repo';
  const folderName = projectName && projectName.trim().length > 0 ? projectName.trim() : repoName;
  const dest = path.join(targetDir as string, folderName);

  if (fs.existsSync(dest)) {
    const overwrite = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: `Folder ${dest} exists. Remove and re-clone?`, canPickMany: false });
    if (overwrite !== 'Yes') return false;
    try { fs.rmSync(dest, { recursive: true, force: true }); } catch (e) {}
  }

  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Cloning ${repoName}`, cancellable: true },
    (progress, token) => {
      return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
        const gitArgs = ['clone', '--progress', sdkUrl, dest];
        const child = spawn('git', gitArgs, { cwd: targetDir as string });
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

          // Define git clone phases with weight ranges to map to a single 0-100 counter
          const phases: { regex: RegExp; base: number; weight: number }[] = [
            { regex: /Counting objects/i, base: 0, weight: 5 },
            { regex: /Compressing objects/i, base: 5, weight: 5 },
            { regex: /Receiving objects/i, base: 10, weight: 60 },
            { regex: /Resolving deltas/i, base: 70, weight: 15 },
            { regex: /Updating files/i, base: 85, weight: 15 },
          ];

          // Look for phase and percent like 'Receiving objects: 42%'
          const phasePctMatch = text.match(/([A-Za-z ]+):\s*([0-9]{1,3})%/);
          if (phasePctMatch) {
            const phaseText = phasePctMatch[1].trim();
            const rawPct = Math.min(100, Math.max(0, parseInt(phasePctMatch[2], 10)));
            // find matching phase by name
            const phase = phases.find(p => phaseText.match(p.regex));
            let mappedPct = rawPct;
            if (phase) {
              mappedPct = Math.min(100, Math.round(phase.base + (rawPct * phase.weight) / 100));
            }
            // ensure monotonic non-decreasing
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

          // fallback: generic percent anywhere in text
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
              // only update progress 
              if (lower.startsWith('remote:') || /pack-reused/i.test(msg) || /reused \d+/i.test(msg) || /total \d+/i.test(msg) || /^cloning\b/i.test(msg)) {
                // skip reporting this noisy line
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
  if (result.code !== 0) {
    vscode.window.showErrorMessage(`git clone failed: ${result.stderr || result.stdout}`);
    return false;
  }

  // create an app.json manifest inside the demo project folder
  const appManifest: any = {
    demo: false,
    createdBy: 'unirtos-extension'
  };
  const createAppFile = writeAppJsonToFolder(dest, appManifest);
  if (!createAppFile) {
    vscode.window.showWarningMessage('Failed to write app config file.');
    return false;
  }


  vscode.window.showInformationMessage(`Cloned ${sdkUrl} -> ${dest}`);
  return true;
}
