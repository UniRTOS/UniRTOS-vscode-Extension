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
    let detectedBy = '';
    try {
      if (fs.existsSync(path.join(wf, 'unirtos.json'))) detectedBy = 'unirtos.json';
      else if (fs.existsSync(path.join(wf, 'unirtos.sdk'))) detectedBy = 'unirtos.sdk';
      else if (fs.existsSync(path.join(wf, 'sdk')) && fs.statSync(path.join(wf, 'sdk')).isDirectory()) detectedBy = 'sdk/ folder';
      else if (fs.existsSync(path.join(wf, 'Makefile'))) {
        const readmePath = path.join(wf, 'README.md');
        if (fs.existsSync(readmePath)) {
          const readme = fs.readFileSync(readmePath, 'utf8');
          if (/unirtos/i.test(readme)) detectedBy = 'Makefile + README mention';
          else detectedBy = 'Makefile present';
        } else {
          detectedBy = 'Makefile present';
        }
      }
    } catch (err) {
      // ignore read errors
    }

    if (detectedBy) {
      post('unirtos_sdk', `Current folder: <span class="ok">${wf}</span> — detected as UniRTOS SDK (${detectedBy})`);
    } else {
      post('unirtos_sdk', `Current folder: <span class="bad">${wf}</span> — Not detected as UniRTOS SDK (no unirtos.json, sdk/, or README mention)`);
    }
  } catch (e) {
    post('unirtos_sdk', `Current folder: <span class="bad">Check failed</span>`);
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
    post('git', `Git: <span class="ok">${git}</span> <small>(checked with 'git --version')</small>`);
  } catch (e) {
    post('git', `Git: <span class="bad">Not found</span> — install from <a href="https://git-scm.com/downloads">git-scm.com</a>`);
  }

  try {
    const node = process.version;
    let nodeMsg = `Node.js: <span class="ok">${node}</span>`;
    nodeMsg += ` <small>(checked via process.version)</small>`;
    post('node', nodeMsg);
  } catch (e) {
    post('node', `Node.js: <span class="bad">Not found</span> — install from <a href="https://nodejs.org/">nodejs.org</a>`);
  }

  try {
    const make = require('child_process').execSync('make --version').toString().split('\n')[0];
    post('make', `Make: <span class="ok">${make}</span> <small>(checked with 'make --version')</small>`);
  } catch (e) {
    post('make', `Make: <span class="bad">Not found</span> — install GNU Make (or build tools) for your platform`);
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
    post('unirtos', `unirtos: <span class="ok">${out}</span> <small>(checked with 'unirtos.exe --version' or 'unirtos --version')</small>`);
  } catch (e) {
    post('unirtos', `unirtos: <span class="bad">Not found</span> — ensure 'unirtos' is installed and on your PATH; try installing from your distro or put the binary in PATH (checked with 'unirtos.exe --version')`);
  }

  // check if current workspace folder looks like an UniRTOS SDK
  checkWorkspaceForSdk(context, post);
}

export default showCheckRequirements;
