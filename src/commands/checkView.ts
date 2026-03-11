import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

function checkWorkspaceForSdk(context: vscode.ExtensionContext, post: (id: string, value: string) => void) {
  try {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      post('unirtos_sdk', `Current folder: <span class="bad">No workspace open</span>`);
      return;
    }

    const wf = folders[0].uri.fsPath;
    // Only check that a workspace is open (handled above) and that the
    // root contains either CMakeLists.txt or buildlib_quecos.bat.
    let hasCMake = false;
    let hasBatch = false;
    try {
      hasCMake = fs.existsSync(path.join(wf, 'CMakeLists.txt'));
      hasBatch = fs.existsSync(path.join(wf, 'buildlib_quecos.bat'));
    } catch (err) {
      // ignore read errors
    }

    if (hasCMake || hasBatch) {
      post('unirtos_sdk', `Detected Current Folder as UniRTOS project: <span class="ok">Yes</span>`);
    } else {
      post('unirtos_sdk', `Detected Current Folder as UniRTOS project: <span class="bad">No</span> — Not detected as UniRTOS project`);
    }
  } catch (e) {
    post('unirtos_sdk', `Detected Current Folder as UniRTOS project: <span class="bad">Check failed</span>`);
  }
}

export function showCheckRequirements(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel(
    'unirtosCheckRequirements',
    'UniRTOS — Check Requirements',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(context.extensionPath)]
    }
  );

  const file = path.join(context.extensionPath, 'src', 'webview', 'check-requirements.html');
  let html = '<p>Check page not found</p>';
  try {
    html = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.error('Failed to read check-requirements.html', e);
  }

  panel.webview.html = html;

  // Optionally attempt basic checks and post messages to the webview
  const webview = panel.webview;
  const post = (id: string, value: string) => webview.postMessage({ type: 'status', id, value });

  // Basic checks using environment - best effort
  try {
    const git = require('child_process').execSync('git --version').toString().trim();
    post('git', `Git: <span class="ok">${git}</span>`);
  } catch (e) {
    post('git', `Git: <span class="bad">Not found</span> — install from <a href="https://git-scm.com/downloads">git-scm.com</a>`);
  }

  // check for unirtos.exe (Windows) or unirtos (unix)
  try {
    let out: string;
    try {
      out = require('child_process').execSync('unirtos.exe --version', { stdio: 'pipe' }).toString().trim();
    } catch (e) {
      // fallback to `unirtos` without .exe
      out = require('child_process').execSync('unirtos --version', { stdio: 'pipe' }).toString().trim();
    }
    post('unirtos', `UniRTOS compiler tool: <span class="ok">${out}</span>`);
  } catch (e) {
    post('unirtos', `UniRTOS compiler tool: <span class="bad">Not found</span>  — insure you installed all requirments here <a href="https://github.com/UniRTOS/unirtos">requirments</a>`);
  }

  // check if current workspace folder looks like an UniRTOS SDK
  checkWorkspaceForSdk(context, post);
}

export default showCheckRequirements;
