import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { projectConfigPassed, showCheckRequirements } from './checkView';
import { injectHeaderIntoHtml } from './header';

let flashFirmwarePanel: vscode.WebviewPanel | undefined;

async function handleFlashFirmware(msg: any, webview: vscode.Webview, context: vscode.ExtensionContext, output: vscode.OutputChannel) {
  // run FlashToolCLI with the selected cfg file and stream output to the channel
  try {
    output.show(true);
    const exe = path.join(context.extensionPath, 'src', 'data', 'Eigen_718', 'FlashToolCLI.exe');
    const cfg = msg && msg.selectedFile ? String(msg.selectedFile) : '';
    const port = msg && msg.selectedPort ? String(msg.selectedPort) : '';
    // require a cfg file
    if (!cfg) {
      output.appendLine('[flashFirmware] No cfg file selected; aborting.');
      return;
    }

    // Build a list of commands to run. 
    const commands: Array<{ exe: string; args: string[] }> = [];

    commands.push({ exe, args: ['--cfgfile', cfg, 'pkg2img'] }); // Generate configuration file
    commands.push({ exe, args: ['--cfgfile', cfg, '--port', port, 'probe'] }); // Establish connection

    // Burn partitions
    commands.push({ exe, args: ['--skipconnect', '1', '--cfgfile', cfg, '--port', port, 'burnone', 'agentboot'] });
    commands.push({ exe, args: ['--skipconnect', '1', '--cfgfile', cfg, '--port', port, 'burnone', 'bootloader'] });
    commands.push({ exe, args: ['--skipconnect', '1', '--cfgfile', cfg, '--port', port, 'burnone', 'system'] });
    commands.push({ exe, args: ['--skipconnect', '1', '--cfgfile', cfg, '--port', port, 'burnone', 'cp_system'] });
    commands.push({ exe, args: ['--skipconnect', '1', '--cfgfile', cfg, '--port', port, 'burnone', 'pkgflx0'] });
    commands.push({ exe, args: ['--skipconnect', '1', '--cfgfile', cfg, '--port', port, 'burnone', 'pkgflx1'] });

    commands.push({ exe, args: ['--skipconnect', '1', '--cfgfile', cfg, '--port', port, 'sysreset'] }); // Reboot

    const spawn = require('child_process').spawn;

    async function runCommand(cmd: { exe: string; args: string[] }) {
      return new Promise<number>((resolve) => {
        try {
          output.appendLine('> ' + [cmd.exe].concat(cmd.args || []).join(' '));
          const child = spawn(cmd.exe, cmd.args || [], { cwd: path.dirname(cmd.exe) || undefined });

          if (child.stdout) child.stdout.on('data', (d: any) => output.append(String(d)));
          if (child.stderr) child.stderr.on('data', (d: any) => output.append(String(d)));

          child.on('error', (err: any) => {
            output.appendLine('[flashFirmware] process error: ' + (err && err.message ? err.message : String(err)));
            resolve(-1);
          });

          child.on('close', (code: number) => {
            output.appendLine(`[flashFirmware] process exited with code ${code}`);
            resolve(typeof code === 'number' ? code : -1);
          });
        } catch (e) {
          output.appendLine('[flashFirmware] runCommand exception: ' + String(e));
          resolve(-1);
        }
      });
    }

    // Execute commands sequentially
    for (const c of commands) {
      // If exe is the packaged FlashToolCLI, validate it exists
      if (c.exe === exe && !fs.existsSync(c.exe)) {
        output.appendLine(`[flashFirmware] FlashToolCLI not found at ${c.exe}`);
        return;
      }
      const code = await runCommand(c);
      if (code !== 0) {
        return;
      }
    }

  } catch (e) {
    output.appendLine('[flashFirmware] failed to start FlashToolCLI: ' + String(e));
  }
}

function createWebviewMessageHandler(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, output: vscode.OutputChannel) {
  return async function handleWebviewMessage(msg: any) {
    if (!msg) return;
    const webview = panel.webview;

    if (msg.command === 'flashFirmware') {
      await handleFlashFirmware(msg, webview, context, output);
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
            output.appendLine('[flashFirmware] serialport list() not available; install @serialport/list or a compatible package');
          }
        } catch (e) {
          output.appendLine('[flashFirmware] serialport list error: ' + String(e));
        }

        webview.postMessage({ command: 'ports', ports });
      } catch (e) {
        output.appendLine('[flashFirmware] requestPorts handler error: ' + String(e));
        webview.postMessage({ command: 'ports', ports: [] });
      }
      return;
    }

    if (msg.command === 'pickFile') {
      try {
        const defaultUri = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0)
          ? vscode.workspace.workspaceFolders[0].uri
          : undefined;
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectMany: false,
          defaultUri
        });
        if (uris && uris.length > 0) {
          webview.postMessage({ command: 'pickedFile', file: uris[0].fsPath });
        } else {
          webview.postMessage({ command: 'pickedFile', file: '' });
        }
      } catch (e) {
        output.appendLine('[flashFirmware] pickFile handler error: ' + String(e));
        webview.postMessage({ command: 'pickedFile', file: '' });
      }
      return;
    }
  };
}

export async function showFlashFirmware(context: vscode.ExtensionContext) {
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

  // Use 1 tab only, not multiple ones
  if (flashFirmwarePanel) {
    flashFirmwarePanel.reveal(vscode.ViewColumn.One);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'unirtosFlashFirmware',
    'UniRTOS — Flash Firmware',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(context.extensionPath)]
    }
  );
  flashFirmwarePanel = panel;
  panel.onDidDispose(() => { flashFirmwarePanel = undefined; });

  // prefer HTML under src/webview (like other pages), fallback to webview/ at repo root
  const file = path.join(context.extensionPath, 'src', 'webview', 'flash-firmware.html');
  let html = '<p>Flash page not found</p>';
  if (fs.existsSync(file)) {
    html = fs.readFileSync(file, 'utf8');
  }

  // inject header
  html = injectHeaderIntoHtml(html, panel, context, 'Flash Firmware');

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

  const output = vscode.window.createOutputChannel('UniRTOS Flash Firmware');
  // keep the output channel hidden until user wants to view; we'll show on first debug log

  const handleWebviewMessage = createWebviewMessageHandler(panel, context, output);

  panel.webview.onDidReceiveMessage((msg) => void handleWebviewMessage(msg));

}

export default showFlashFirmware;
