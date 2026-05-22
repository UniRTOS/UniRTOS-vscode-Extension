import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as os from 'os';
import { execSync } from 'child_process';

export let projectConfigPassed = { configPassed: false, reason: 'Test not run yet' };

function checkWorkspaceForSdk(context: vscode.ExtensionContext): boolean {
  try {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return false;
    }

    const wf = folders[0].uri.fsPath;
    // check for build.sh
    let hasBatch = false;
    try {
      // Check top-level first
      hasBatch = fs.existsSync(path.join(wf, 'build.sh'));
      // If not found at top-level, check one-level deep subfolders
      if (!hasBatch) {
        try {
          const entries = fs.readdirSync(wf, { withFileTypes: true });
          for (const e of entries) {
            if (e.isDirectory()) {
              const candidate = path.join(wf, e.name, 'build.sh');
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
      return true;
    } else {
      return false;
    }
  } catch (e) {
    return false;
  }
}

function checkPython3(): boolean {
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
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  } catch (e) {
    return false;
  }
}

/**
 * Run basic environment check: git, python, and unirtos tool.
 * return result with reason
 */
export function runBasicEnvChecks(context: vscode.ExtensionContext): { configPassed: boolean, reason: string } {
  if (projectConfigPassed.configPassed) {
    return { configPassed: true, reason: 'All checks passed' };
  }

  const workspaceOk = checkWorkspaceForSdk(context);
  if (!workspaceOk) {
    projectConfigPassed = { configPassed: false, reason: 'Workspace is not a UniRTOS SDK project!' };
    return projectConfigPassed;
  }

  let gitFound = false;
  let unirtosFound = false;

  try {
    execSync('git --version').toString().trim();
    gitFound = true;
  } catch (e) {
    gitFound = false;
    projectConfigPassed = { configPassed: false, reason: 'Git not found!' };
    return projectConfigPassed;
  }

  try {
    try {
      execSync('unirtossdf.exe --version', { stdio: 'pipe' }).toString().trim();
    } catch (e) {
      execSync('unirtossdf --version', { stdio: 'pipe' }).toString().trim();
    }
    unirtosFound = true;
  } catch (e) {
    unirtosFound = false;
    // Ask the user if they want to download the toolchain
    vscode.window.showInformationMessage('UniRTOS toolchain tool not found. Do you want to install the UniRTOS toolchain?', 'Yes', 'No')
      .then(answer => {
        if (answer === 'Yes') {
          downloadUnirtos(context).catch(err => {
            vscode.window.showErrorMessage('Failed to download UniRTOS toolchain: ' + String(err));
          });
        }
      });

    projectConfigPassed = { configPassed: false, reason: 'UniRTOS toolchain tool not found please check our site!' };
    return projectConfigPassed;
  }

  const pythonOk = checkPython3(); // 3. python check
  if (!pythonOk) {
    projectConfigPassed = { configPassed: false, reason: 'Python 3 not found!' };
    return projectConfigPassed;
  }

  projectConfigPassed = { configPassed: true, reason: 'All checks passed' };
  return projectConfigPassed;
}

async function downloadUnirtos(context: vscode.ExtensionContext): Promise<void> {
  const url = 'https://www.quectel.com.cn/wp-content/uploads/2026/04/unirtos-toolchain_1.0.3.zip';
  const defaultDir = path.join(os.tmpdir(), 'unirtos-downloads');

  let targetDir = defaultDir;
  try {
    const pick = await vscode.window.showOpenDialog({
      defaultUri: vscode.Uri.file(defaultDir),
      canSelectFiles: false,
      canSelectFolders: true,
      openLabel: 'Select download folder (Cancel to use temp)',
      canSelectMany: false
    });
    if (pick && pick.length > 0) {
      targetDir = pick[0].fsPath;
    }
  } catch (e) {
    // ignore and fall back to defaultDir
  }

  try {
    fs.mkdirSync(targetDir, { recursive: true });
  } catch (e) {
    // ignore
  }
  const dest = path.join(targetDir, 'unirtos-toolchain_1.0.3.zip');

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Downloading UniRTOS toolchain',
    cancellable: true
  }, (progress, token) => {
    return new Promise<void>((resolve, reject) => {
      const req = https.get(url, (res) => {
        if ((res.statusCode || 0) >= 400) {
          reject(new Error('Download failed with status ' + res.statusCode));
          return;
        }
        const total = parseInt(String(res.headers['content-length'] || '0'), 10) || 0;
        let received = 0;
        const fileStream = fs.createWriteStream(dest);

        token.onCancellationRequested(() => {
          try { req.destroy(); } catch (e) {}
          try { fileStream.close(); } catch (e) {}
          try { fs.unlinkSync(dest); } catch (e) {}
          reject(new Error('Download cancelled'));
        });

        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (total) {
            const inc = (chunk.length / total) * 100;
            progress.report({ increment: inc });
          }
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => {
            vscode.window.showInformationMessage('Downloaded UniRTOS toolchain to: ' + dest);
            resolve();
          });
        });

        fileStream.on('error', (err) => {
          reject(err);
        });
      });

      req.on('error', (err) => {
        reject(err);
      });
    });
  });
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

  // Inject icon path into header placeholder using webview URI
  try {
    const iconFile = path.join(context.extensionPath, 'images', 'icon.png');
    if (fs.existsSync(iconFile)) {
      const uri = vscode.Uri.file(iconFile);
      const asWebview = (panel.webview as any).asWebviewUri;
      const iconUriObj = typeof asWebview === 'function' ? asWebview.call(panel.webview, uri) : uri;
      html = html.replace('%%UNIRTOS_ICON%%', iconUriObj ? iconUriObj.toString() : '');
    } else {
      html = html.replace('%%UNIRTOS_ICON%%', '');
    }
  } catch (e) {
    html = html.replace('%%UNIRTOS_ICON%%', '');
  }

  panel.webview.html = html;
  projectConfigPassed = runBasicEnvChecks(context);
}
