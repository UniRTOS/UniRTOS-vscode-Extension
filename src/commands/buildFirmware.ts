import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { projectConfigPassed, showCheckRequirements } from './checkView';

function createWebviewMessageHandler(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, output: vscode.OutputChannel) {
  return async function handleWebviewMessage(msg: any) {
    if (!msg) return;
    const webview = panel.webview;

    if (msg.command === 'buildFirmware') {
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
      return;
    }

    if (msg.command === 'requestPorts') {
      try {
        const ports: Array<{ label: string; value: string }> = [];
        try {
          // Try to load serialport and prefer a `list` method on the constructor.
          let SerialPortCtor: any = null;
          let listFn: any = null;
          try {
            const mod: any = await import('serialport');
            SerialPortCtor = mod.SerialPort || mod.default || mod;
          } catch {
            try {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const mod2: any = require('serialport');
              SerialPortCtor = mod2.SerialPort || mod2.default || mod2;
            } catch {
              SerialPortCtor = null;
            }
          }

          if (SerialPortCtor && typeof SerialPortCtor.list === 'function') {
            listFn = SerialPortCtor.list.bind(SerialPortCtor);
          } else {
            try {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const listMod: any = require('@serialport/list');
              listFn = listMod.default || listMod.list || listMod;
            } catch {
              listFn = null;
            }
          }

          if (typeof listFn === 'function') {
            const portList = await listFn();
            for (const p of portList) {
              const value = (p.path || p.comName || p.com) as string;
              if (!p.manufacturer.toLowerCase().includes('quectel')) continue; // only include Quetcel devices
              const label = `${p.friendlyName} (${p.path})`;
              ports.push({ label: label.trim(), value: value });
            }
          } else {
            output.appendLine('[buildFirmware] serialport list() not available; install @serialport/list or a compatible package');
          }
        } catch (e) {
          output.appendLine('[buildFirmware] serialport list error: ' + String(e));
        }

        webview.postMessage({ command: 'ports', ports });
      } catch (e) {
        output.appendLine('[buildFirmware] requestPorts handler error: ' + String(e));
        webview.postMessage({ command: 'ports', ports: [] });
      }
      return;
    }
  };
}

export async function showBuildFirmware(context: vscode.ExtensionContext) {
  // If global checks have not passed, disable this page and offer to open checks
  if (!projectConfigPassed) {
    const choice = await vscode.window.showWarningMessage(
      'Environment checks have not passed — New Project (Demo) is disabled.',
      { modal: true },
      'Open Checks'
    );
    if (choice === 'Open Checks') {
      showCheckRequirements(context);
    }
    return;
  }

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

  // replace image placeholders with proper webview URIs for images if they exist
  try {
    const images = [
      { placeholder: '%%DOWNLOAD_IMAGE%%', file: path.join(context.extensionPath, 'images', 'download-mode.png') },
      { placeholder: '%%QDLOADER_IMAGE%%', file: path.join(context.extensionPath, 'images', 'QDLoader-port.png') }
    ];
    for (const img of images) {
      if (fs.existsSync(img.file)) {
        try {
          const uri = vscode.Uri.file(img.file);
          const asWebview = (panel.webview as any).asWebviewUri;
          const imgUri = typeof asWebview === 'function' ? asWebview.call(panel.webview, uri) : uri;
          html = html.replace(img.placeholder, imgUri.toString());
        } catch {
          html = html.replace(img.placeholder, '');
        }
      } else {
        html = html.replace(img.placeholder, '');
      }
    }
  } catch (e) {
    html = html.replace('%%DOWNLOAD_IMAGE%%', '').replace('%%QDLOADER_IMAGE%%', '');
  }

  panel.webview.html = html;

  const output = vscode.window.createOutputChannel('UniRTOS Build');
  // keep the output channel hidden until user wants to view; we'll show on first debug log

  const handleWebviewMessage = createWebviewMessageHandler(panel, context, output);

  panel.webview.onDidReceiveMessage((msg) => void handleWebviewMessage(msg));

}

export default showBuildFirmware;
