import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

export async function handleNewProject(labelsArr: string[], context: vscode.ExtensionContext): Promise<boolean> {
  // show to user list of platforms and models to choose and download the sdk

  if (!labelsArr.includes('New Project')) return false;

  // load platforms JSON from extension
  const platformFile = path.join(context.extensionPath, 'src', 'data', 'platform.json');
  let platforms: Record<string, any> = {};
  try {
    const raw = fs.readFileSync(platformFile, 'utf8');
    platforms = JSON.parse(raw);
  } catch (e) {
    platforms = {};
  }

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

  // send platforms when webview is ready or on-demand
  const sendPlatforms = () => {
    panel.webview.postMessage({ type: 'setPlatforms', platforms: platformKeys });
  };

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'ready') {
      sendPlatforms();
      return;
    }
    
    if (msg.type === 'platformChanged') {
      const selected = msg.value as string | undefined;
      let models: string[] = [];
      if (selected) {
        const modelsRaw = platforms[selected];
        if (Array.isArray(modelsRaw)) models = modelsRaw as string[];
        else if (modelsRaw && typeof modelsRaw === 'object') models = Object.keys(modelsRaw as Record<string, unknown>);
      }
      panel.webview.postMessage({ type: 'setModels', models });
      return;
    }

    if (msg.type === 'create') {
      const pickedPlatformKey = msg.platform as string | undefined;
      const pickedModel = msg.model as string | undefined;
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
      vscode.window.showInformationMessage(infoMsg);

      if (sdkUrl) {
        await downloadAndCloneSdk(sdkUrl);
      }
      panel.dispose();
      return;
    }

    if (msg.type === 'cancel') {
      panel.dispose();
      return;
    }
  });

  return true;
}

export async function downloadAndCloneSdk(sdkUrl: string): Promise<boolean> {
  if (!sdkUrl) return false;

  const uri = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Select folder to save SDK'
  });
  if (!uri || uri.length === 0) return false;

  const targetDir = uri[0].fsPath;
  const repoNameMatch = sdkUrl.match(/\/([^\/]+?)(?:\.git)?$/);
  const repoName = repoNameMatch ? repoNameMatch[1].replace(/\.git$/, '') : 'repo';
  const dest = path.join(targetDir, repoName);

  if (fs.existsSync(dest)) {
    const overwrite = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: `Folder ${dest} exists. Remove and re-clone?`, canPickMany: false });
    if (overwrite !== 'Yes') return false;
    try { fs.rmSync(dest, { recursive: true, force: true }); } catch (e) {}
  }

  const cloneCmd = `git clone ${sdkUrl} "${dest}"`;
  const p = new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    exec(cloneCmd, { cwd: targetDir }, (error, stdout, stderr) => {
      if (error) resolve({ code: (error as any).code ?? 1, stdout: stdout ?? '', stderr: stderr ?? '' });
      else resolve({ code: 0, stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });

  const result = await p;
  if (result.code !== 0) {
    vscode.window.showErrorMessage(`git clone failed: ${result.stderr || result.stdout}`);
    return false;
  }

  vscode.window.showInformationMessage(`Cloned ${sdkUrl} -> ${dest}`);
  return true;
}
