import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export let projectConfigPassed = true;

function checkWorkspaceForSdk(context: vscode.ExtensionContext, post: (id: string, value: string) => void): boolean {
  try {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      post('unirtos_sdk', `Current folder: <span class="bad">No workspace open</span>`);
      return false;
    }

    const wf = folders[0].uri.fsPath;
    // check for buildlib_unirtos.bat
    let hasBatch = false;
    try {
      // Check top-level first
      hasBatch = fs.existsSync(path.join(wf, 'buildlib_unirtos.bat'));
      // If not found at top-level, check one-level deep subfolders
      if (!hasBatch) {
        try {
          const entries = fs.readdirSync(wf, { withFileTypes: true });
          for (const e of entries) {
            if (e.isDirectory()) {
              const candidate = path.join(wf, e.name, 'buildlib_unirtos.bat');
              if (fs.existsSync(candidate)) {
                hasBatch = true;
                break;
              }
            }
          }
        } catch (innerErr) {
          // ignore read errors of directory
        }
      }
    } catch (err) {
      // ignore read errors
    }

    if (hasBatch) {
      post('unirtos_sdk', `Detected Current Folder as UniRTOS project: <span class="ok">Yes</span>`);
      return true;
    } else {
      post('unirtos_sdk', `Detected Current Folder as UniRTOS project: <span class="bad">No</span> — Not detected as UniRTOS project`);
      return false;
    }
  } catch (e) {
    post('unirtos_sdk', `Detected Current Folder as UniRTOS project: <span class="bad">Check failed</span>`);
    return false;
  }
}

function checkPython3(post: (id: string, value: string) => void): boolean {
  try {
    let pyOut = '';
    try {
      pyOut = require('child_process').execSync('python3 --version', { stdio: 'pipe' }).toString().trim();
    } catch (e) {
      pyOut = require('child_process').execSync('python --version', { stdio: 'pipe' }).toString().trim();
    }
    const found = pyOut.match(/Python\s+(\d+)\.(\d+)(?:\.(\d+))?/i);
    if (found) {
      const major = parseInt(found[1], 10);
      if (major >= 3) {
        post('python', `Python3 or higher: <span class="ok">Yes</span> — ${pyOut}`);
        return true;
      } else {
        post('python', `Python3 or higher: <span class="bad">No</span> — ${pyOut} (requires Python 3+)`);
        return false;
      }
    } else {
      post('python', `Python3 or higher: <span class="bad">No</span> — unexpected version output: ${pyOut}`);
      return false;
    }
  } catch (e) {
    post('python', `Python3 or higher: <span class="bad">Not found</span> — install from <a href="https://www.python.org/downloads/">python.org</a>`);
    return false;
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

  // add header file
  try {
    const headerFile = path.join(context.extensionPath, 'src', 'webview', 'header.html');
    const headerHtml = fs.readFileSync(headerFile, 'utf8');
    html = html.replace('<div id="header-root"></div>', headerHtml);
  } catch (e) {
    console.warn('Header fragment not injected:', e);
  }

  panel.webview.html = html;

  // Optionally attempt basic checks and post messages to the webview
  const webview = panel.webview;
  const post = (id: string, value: string) => webview.postMessage({ type: 'status', id, value });
  // 1. Basic checks using environment - best effort
  let gitFound = false;
  let unirtosFound = false;

  try {
    const git = require('child_process').execSync('git --version').toString().trim();
    post('git', `Git: <span class="ok">${git}</span>`);
    gitFound = true;
  } catch (e) {
    post('git', `Git: <span class="bad">Not found</span> — install from <a href="https://git-scm.com/downloads">git-scm.com</a>`);
    gitFound = false;
  }

  // 2. check for unirtos.exe (Windows) or unirtos (unix)
  try {
    let out: string;
    try {
      out = require('child_process').execSync('unirtos.exe --version', { stdio: 'pipe' }).toString().trim();
    } catch (e) {
      // fallback to `unirtos` without .exe
      out = require('child_process').execSync('unirtos --version', { stdio: 'pipe' }).toString().trim();
    }
    post('unirtos', `UniRTOS compiler tool: <span class="ok">${out}</span>`);
    unirtosFound = true;
  } catch (e) {
    post('unirtos', `UniRTOS compiler tool: <span class="bad">Not found</span>  — insure you installed all requirments here <a href="https://github.com/UniRTOS/unirtos">requirments</a>`);
    unirtosFound = false;
  }

  const pythonOk = checkPython3(post); // 3. python check
  const workspaceOk = checkWorkspaceForSdk(context, post); // 4. check if current workspace is UniRTOS SDK

  projectConfigPassed = gitFound && unirtosFound && pythonOk && workspaceOk;
}
