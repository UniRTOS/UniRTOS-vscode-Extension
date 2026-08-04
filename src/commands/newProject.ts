import * as vscode from 'vscode';
import * as path from 'path';
import { chooseDirectoryAndSet } from './cloneSdk';
import { runUnirtosCli, ensureVenv } from './pythonCli';
import { showNewProjectDemo } from './newProjectDemo';
import {
  getPlatforms,
  sendPlatforms,
  handlePlatformChanged,
  setupWebviewTheme,
  writeConfigFile,
  openWorkspaceOrFolder
} from '../utils';
import { injectHeaderIntoHtml } from './header';
import * as fs from 'fs';
import { runBasicEnvChecks } from './checkView';

let newProjectPanel: vscode.WebviewPanel | undefined;

// get an array of SDK versions.
export function getSdkVersions(): string[] {
  try {
    ensureVenv();
  } catch (e) {
    console.warn('Failed to ensure venv before listing SDKs:', e);
  }

  try {
    const out = runUnirtosCli(['ls-sdk', '-r']);
    const lines = out.split(/\r?\n/);
    const versions: string[] = [];
    for (const line of lines) {
      const m = line.match(/^\s*-\s*(\S.*)$/);
      if (m) versions.push(m[1].trim());
    }
    return versions;
  } catch (e) {
    console.warn('Failed to get installed SDK versions:', e);
    return [];
  }
}

export async function handleNewProject(labelsArr: string[], context: vscode.ExtensionContext): Promise<boolean> {
  // show to user list of platforms and modules to choose and download the sdk
  let title = 'New Project';
  if (!labelsArr.includes(title)) return false;

  // load platforms JSON from extension
  const platforms = getPlatforms(context);

  const platformKeys = Object.keys(platforms);
  if (platformKeys.length === 0) {
    vscode.window.showInformationMessage('No platforms available');
    return true;
  }

  const basic = runBasicEnvChecks(context, true);
  if (!basic.configPassed) {
    vscode.window.showErrorMessage((basic.reason || 'unknown') + ' Environment checks failed.');
    return false;
  }

  // Use 1 tab only, not multiple ones
  if (newProjectPanel) {
    newProjectPanel.reveal(vscode.ViewColumn.One);
    try { newProjectPanel.webview.postMessage({ type: 'setUniRTOSProject', value: basic.configPassed }); } catch (e) {}
    try { setupWebviewTheme(newProjectPanel); } catch (e) {}
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

  try { setupWebviewTheme(panel); } catch (e) { /* ignore if helper missing */ }

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'ready') {
      sendPlatforms(panel.webview, platformKeys);
      try {
        const sdks = getSdkVersions();
        panel.webview.postMessage({ type: 'setSdkVersions', versions: sdks });
      } catch (e) {
        console.warn('Failed to send SDK versions to webview:', e);
      }
      // If there's only one platform, pre-send its modules so the webview can populate `module` without a platform selector
      try {
        if (platformKeys.length === 1) {
          handlePlatformChanged(platformKeys[0], platforms, panel.webview);
        }
      } catch (e) { /* ignore */ }
      // Ensure theme is applied when the webview is ready
      try { setupWebviewTheme(panel); } catch (e) { /* ignore */ }
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
      const pickedModule = msg.module as string | undefined;
      const sdkVersion = msg.sdkVersion as string | undefined;

      let dest: string | undefined;
      try {
        if (pickedProjectName && pickedTargetDir) {
          vscode.window.showInformationMessage(`Creating new project and setting up environment...`);
          try {
            runUnirtosCli(['new', pickedProjectName, '-d', pickedTargetDir]); // create project
            dest = path.join(pickedTargetDir, pickedProjectName);
            writeConfigFile(dest, { pickedModule: pickedModule, sdkVersion: sdkVersion }); // update config file
            runUnirtosCli(['env-setup', '-d', dest]); // run env-setup command first
          } catch (cliErr) {
            vscode.window.showErrorMessage(`unirtos_cli failed: ${cliErr}`);
          }
        }
      } catch (e) {
        console.warn('Error invoking unirtos_cli:', e);
      }

      panel.dispose();
      if (dest) {
        try {
          await openWorkspaceOrFolder(dest);
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
