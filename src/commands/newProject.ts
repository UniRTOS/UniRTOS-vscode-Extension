import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { showNewProjectDemo } from './newProjectDemo';
import { platformFilePath, sendPlatforms, handlePlatformChanged, writeAppJsonToFolder } from '../utils';
import * as fs from 'fs';

export async function handleNewProject(labelsArr: string[], context: vscode.ExtensionContext): Promise<boolean> {
  // show to user list of platforms and models to choose and download the sdk

  if (!labelsArr.includes('New Project')) return false;

  // load platforms JSON from extension
  const platforms = platformFilePath(context);

  const platformKeys = Object.keys(platforms);
  if (platformKeys.length === 0) {
    vscode.window.showInformationMessage('No platforms available');
    return true;
  }

  // Instead of quick pick, open a webview to present platforms/models
  const panel = vscode.window.createWebviewPanel(
    'unirtosNewProject',
    'UniRTOS — New Project',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'src', 'webview'))]
    }
  );

  const file = path.join(context.extensionPath, 'src', 'webview', 'new-project.html');
  let html = '<p>New project UI not found</p>';
  try {
    html = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.error('Failed to read new-project.html', e);
  }

  // inject header fragment if available (uses <div id="header-root"></div> in HTML)
  try {
    const headerFile = path.join(context.extensionPath, 'src', 'webview', 'header.html');
    const headerHtml = fs.readFileSync(headerFile, 'utf8');
    html = html.replace('<div id="header-root"></div>', headerHtml);
  } catch (e) {
    console.warn('Header fragment not injected into new-project.html:', e);
  }

  panel.webview.html = html;

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
      let sdkUrl: string | undefined;
      if (pickedPlatformKey) {
        const modelsRaw = platforms[pickedPlatformKey];
        if (modelsRaw && typeof modelsRaw === 'object' && !Array.isArray(modelsRaw) && pickedModel) {
          sdkUrl = (modelsRaw as Record<string, unknown>)[pickedModel] as string | undefined;
        }
      }

      const infoMsg = pickedModel
        ? sdkUrl
          ? `Selected: ${pickedPlatformKey} / ${pickedModel} — ${sdkUrl}`
          : `Selected: ${pickedPlatformKey} / ${pickedModel}`
        : `Selected: ${pickedPlatformKey}`;
      console.log(infoMsg);

      if (sdkUrl) {
        await downloadAndCloneSdk(sdkUrl, pickedTargetDir);
      }
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

export async function downloadAndCloneSdk(sdkUrl: string, targetDir?: string): Promise<boolean> {
  if (!sdkUrl) return false;

  
  if (!targetDir) {
    vscode.window.showWarningMessage('Please select a target directory to clone the SDK repository.');
    return false;
  }
  const repoNameMatch = sdkUrl.match(/\/([^\/]+?)(?:\.git)?$/);
  const repoName = repoNameMatch ? repoNameMatch[1].replace(/\.git$/, '') : 'repo';
  const dest = path.join(targetDir as string, repoName);

  if (fs.existsSync(dest)) {
    const overwrite = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: `Folder ${dest} exists. Remove and re-clone?`, canPickMany: false });
    if (overwrite !== 'Yes') return false;
    try { fs.rmSync(dest, { recursive: true, force: true }); } catch (e) {}
  }

  const cloneCmd = `git clone ${sdkUrl} "${dest}"`;
  const p = new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    exec(cloneCmd, { cwd: targetDir as string }, (error, stdout, stderr) => {
      if (error) resolve({ code: (error as any).code ?? 1, stdout: stdout ?? '', stderr: stderr ?? '' });
      else resolve({ code: 0, stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });

  const result = await p;
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
