import * as vscode from 'vscode';
import * as path from 'path';
import { downloadAndCloneSdk, chooseDirectoryAndSet } from './cloneSdk';
import { showNewProjectDemo } from './newProjectDemo';
import { platformFilePath, sendPlatforms, handlePlatformChanged } from '../utils';
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

  const basic = runBasicEnvChecks(context);

  // Use 1 tab only, not multiple ones
  if (newProjectPanel) {
    newProjectPanel.reveal(vscode.ViewColumn.One);
    try { newProjectPanel.webview.postMessage({ type: 'setUniRTOSProject', value: basic.configPassed }); } catch (e) {}
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
  
  try { newProjectPanel.webview.postMessage({ type: 'setUniRTOSProject', value: basic.configPassed }); } catch (e) {}

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
      await chooseDirectoryAndSet(panel.webview, 'Select folder to save SDK', 'path');
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
      const pickedTargetDir = msg.targetDir as string | undefined;
      const pickedProjectName = msg.projectName as string | undefined;
      const pickedModel = msg.model as string | undefined;

      const dest = await downloadAndCloneSdk(UNIRTOS_REPO, pickedTargetDir, pickedProjectName, pickedModel);
      panel.dispose();
      if (dest) {
        try {
          await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(dest), true);
        } catch (e) {
          console.warn('Failed to open cloned project folder:', e);
        }
      }
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
