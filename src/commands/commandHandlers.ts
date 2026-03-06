import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { CommandItem } from '../views/commandsView';
import { showGuide } from './guideView';

export function registerCommandHandlers(context: vscode.ExtensionContext, treeView: vscode.TreeView<CommandItem>) {
  // load platforms JSON
  const platformFile = path.join(context.extensionPath, 'src', 'data', 'platform.json');
  let platforms: Record<string, any> = {};
  try {
    const raw = fs.readFileSync(platformFile, 'utf8');
    platforms = JSON.parse(raw);
  } catch (e) {
    platforms = {};
  }

  context.subscriptions.push(vscode.commands.registerCommand('unirtos.runCommand', (item) => {
    (async () => {
      const selection = Array.isArray(item) ? item : (item ? [item] : treeView.selection);
      const labelsArr: string[] = (selection || []).map((s: CommandItem) => s.label);
      // handle guide view selection
      if (labelsArr.includes('Guide - How to')) {
        showGuide(context);
        return;
      }

      if (await handleNewProject(labelsArr, platforms)) {
        return;
      }

      const labels = labelsArr.join(', ');
      vscode.window.showInformationMessage(`Running: ${labels || 'none'}`);
    })();
  }));
}

export async function handleNewProject(labelsArr: string[], platforms: Record<string, any>): Promise<boolean> {
  // show to user list of platforms and models to choose and download the sdk

  if (!labelsArr.includes('New Project')) return false;

  const platformKeys = Object.keys(platforms);
  if (platformKeys.length === 0) {
    vscode.window.showInformationMessage('No platforms available');
    return true;
  }

  const pickedPlatform = await vscode.window.showQuickPick(platformKeys, { placeHolder: 'Please choose platform', canPickMany: false });
  if (!pickedPlatform) return true;

  const pickedPlatformKey = Array.isArray(pickedPlatform) ? pickedPlatform[0] : pickedPlatform;
  if (!pickedPlatformKey) return true;

  // support platforms where models are either an array or an object mapping
  const modelsRaw = platforms[pickedPlatformKey];
  let models: string[] = [];
  if (Array.isArray(modelsRaw)) {
    models = modelsRaw;
  } else if (modelsRaw && typeof modelsRaw === 'object') {
    models = Object.keys(modelsRaw as Record<string, unknown>);
  }

  let pickedModel: string | undefined;
  if (models.length > 0) {
    const chosen = await vscode.window.showQuickPick(models, { placeHolder: `Select model for ${pickedPlatformKey}`, canPickMany: false });
    if (!chosen) {
      vscode.window.showInformationMessage('New Project cancelled');
      return true;
    }
    pickedModel = Array.isArray(chosen) ? chosen[0] : chosen;
  }

  // attempt to get a URL/value for the chosen model when models are provided as a mapping
  let sdkUrl: string | undefined;
  if (modelsRaw && typeof modelsRaw === 'object' && !Array.isArray(modelsRaw) && pickedModel) {
    sdkUrl = (modelsRaw as Record<string, unknown>)[pickedModel] as string | undefined;
  }

  const msg = pickedModel
    ? sdkUrl
      ? `Selected: ${pickedPlatformKey} / ${pickedModel} — ${sdkUrl}`
      : `Selected: ${pickedPlatformKey} / ${pickedModel}`
    : `Selected: ${pickedPlatformKey}`;
  console.log(msg);
  vscode.window.showInformationMessage(msg);

  // if we have an sdk URL, offer to download/clone it
  if (sdkUrl) {
    await downloadAndCloneSdk(sdkUrl);
  }

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
