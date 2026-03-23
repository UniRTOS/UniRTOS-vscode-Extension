import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function showBuildFirmware(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel(
    'unirtosBuildFirmware',
    'UniRTOS — Build Firmware',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(context.extensionPath)]
    }
  );

  // prefer HTML under src/webview (like other pages), fallback to webview/ at repo root
  const candidates = [
    path.join(context.extensionPath, 'src', 'webview', 'build-firmware.html'),
    path.join(context.extensionPath, 'webview', 'build-firmware.html')
  ];
  let html = '<p>Build page not found</p>';
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        html = fs.readFileSync(p, 'utf8');
        break;
      }
    } catch (e) {
      // continue to next candidate
    }
  }

  // add header file
  try {
    const headerFile = path.join(context.extensionPath, 'src', 'webview', 'header.html');
    const headerHtml = fs.readFileSync(headerFile, 'utf8');
    html = html.replace('<div id="header-root"></div>', headerHtml);
  } catch (e) {
    console.warn('Header fragment not injected:', e);
  }

  // replace image placeholder with a proper webview URI for the image if it exists
  try {
    const imgPath = path.join(context.extensionPath, 'images', 'download-mode.png');
    if (fs.existsSync(imgPath)) {
      try {
        const uri = vscode.Uri.file(imgPath);
        const asWebview = (panel.webview as any).asWebviewUri;
        const imgUri = typeof asWebview === 'function' ? asWebview.call(panel.webview, uri) : uri;
        html = html.replace('%%DOWNLOAD_IMAGE%%', imgUri.toString());
      } catch (inner) {
        html = html.replace('%%DOWNLOAD_IMAGE%%', '');
      }
    } else {
      html = html.replace('%%DOWNLOAD_IMAGE%%', '');
    }
  } catch (e) {
    html = html.replace('%%DOWNLOAD_IMAGE%%', '');
  }

  panel.webview.html = html;

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (!msg || msg.command !== 'buildFirmware') return;
    const webview = panel.webview;
    webview.postMessage({ command: 'buildStatus', text: 'Locating build task...' });

    try {
      const tasks = await vscode.tasks.fetchTasks();
      const found = tasks.find(t => t.name === 'compile' || t.name === 'npm: compile' || (t.definition && (t.definition.label === 'compile')));
      if (found) {
        webview.postMessage({ command: 'buildStatus', text: 'Starting configured "compile" task...' });
        const exec = await vscode.tasks.executeTask(found);
        const disp = vscode.tasks.onDidEndTaskProcess(e => {
          if (e.execution.task === found) {
            webview.postMessage({ command: 'buildStatus', text: `Build finished (exit code ${e.exitCode})` });
            disp.dispose();
          }
        });
        return;
      }
    } catch (e) {
      console.warn('Error while fetching tasks', e);
    }

    // Fallback: run npm script directly in extension root
    webview.postMessage({ command: 'buildStatus', text: 'No configured task found — running `npm run compile`...' });
    const child = require('child_process').exec('npm run compile', { cwd: context.extensionPath });
    child.stdout.on('data', (d: any) => webview.postMessage({ command: 'buildStatus', text: String(d).trim() }));
    child.stderr.on('data', (d: any) => webview.postMessage({ command: 'buildStatus', text: String(d).trim() }));
    child.on('close', (code: number) => webview.postMessage({ command: 'buildStatus', text: `Build process exited with code ${code}` }));
  });
}

export default showBuildFirmware;
