import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { runBasicEnvChecks } from './checkView';
import { injectHeaderIntoHtml } from './header';
import { setupWebviewTheme } from '../utils';

let flashFirmwarePanel: vscode.WebviewPanel | undefined;

function findQuecCfgInRelease(context: vscode.ExtensionContext): string | null {
  try {
    const folders = vscode.workspace.workspaceFolders || [];
    for (const f of folders) {
      const base = path.join(f.uri.fsPath, 'qos_build', 'release');
      if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) continue;
      const entries = fs.readdirSync(base);
      for (const e of entries) {
        try {
          const candidate = path.join(base, e, 'quec_download_usb.ini');
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
        } catch (err) {
          // ignore
        }
      }
    }
  } catch (e) {
    console.warn('findQuecCfgInRelease failed:', e);
  }
  return null;
}

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

    // flag set when the tool outputs the success indicator
    let sawSysresetFinish = false;
    // flag when a burn step fails
    let sawBurnFailed = false;
    // rolling buffer to catch split output chunks
    let outputBuffer = '';

    async function runCommand(cmd: { exe: string; args: string[] }) {
      return new Promise<number>((resolve) => {
        try {
          output.appendLine('> ' + [cmd.exe].concat(cmd.args || []).join(' '));
          const child = spawn(cmd.exe, cmd.args || [], { cwd: path.dirname(cmd.exe) || undefined });

          if (child.stdout) child.stdout.on('data', (d: any) => {
            const text = String(d);
            output.append(text);
            try {
              outputBuffer += text;
              // keep buffer bounded
              if (outputBuffer.length > 8192) outputBuffer = outputBuffer.slice(-8192);
              const buf = outputBuffer.toLowerCase();
              if (buf.includes('sysreset finish')) sawSysresetFinish = true;
              if (buf.includes('burn failed')) sawBurnFailed = true;
            } catch {}
          });
          if (child.stderr) child.stderr.on('data', (d: any) => {
            const text = String(d);
            output.append(text);
            try {
              outputBuffer += text;
              const buf = outputBuffer.toLowerCase();
              if (outputBuffer.length > 8192) outputBuffer = outputBuffer.slice(-8192);
              if (buf.includes('sysreset finish')) sawSysresetFinish = true;
              if (buf.includes('burn failed')) sawBurnFailed = true;
            } catch {}
          });

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
    let hadError = false;
    for (const c of commands) {
      // If exe is the packaged FlashToolCLI, validate it exists
      if (c.exe === exe && !fs.existsSync(c.exe)) {
        output.appendLine(`[flashFirmware] FlashToolCLI not found at ${c.exe}`);
        return;
      }
      const code = await runCommand(c);
      if (code !== 0) {
        hadError = true;
        break;
      }
    }
    // After running commands (or breaking on error), notify the webview and user based on observed markers
    try {
      if (sawSysresetFinish && !hadError) {
        output.appendLine('[flashFirmware] flashing completed successfully.');
        try { webview.postMessage({ command: 'flashComplete', success: true }); } catch {}
        try { vscode.window.showInformationMessage('Flashing completed successfully.'); } catch {}
      } else if (sawBurnFailed || hadError) {
        const reason = sawBurnFailed ? 'burn failed' : 'process error';
        output.appendLine('[flashFirmware] flashing failed (' + reason + ').');
        try { webview.postMessage({ command: 'flashComplete', success: false, reason }); } catch {}
        try { vscode.window.showErrorMessage('Flashing failed (' + reason + ').'); } catch {}
      }
    } catch {}
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
          let chosen = uris[0].fsPath;
          let cfgPath = '';
          let pkgPath = '';
          try {
            const dir = path.dirname(chosen);
            const ext = path.extname(chosen).toLowerCase();
            if (ext === '.hbinpkg') {
              // user picked package; prefer finding a sibling .ini for flashing
              pkgPath = chosen;
              // look for quec_download_usb.ini first, then any .ini
              const prefer = path.join(dir, 'quec_download_usb.ini');
              if (fs.existsSync(prefer) && fs.statSync(prefer).isFile()) {
                cfgPath = prefer;
              } else {
                const entries = fs.readdirSync(dir);
                for (const e of entries) {
                  if (e.toLowerCase().endsWith('.ini')) { cfgPath = path.join(dir, e); break; }
                }
              }
            } else if (ext === '.ini') {
              // user picked ini; use it for flashing and try to find sibling .hbinpkg
              cfgPath = chosen;
              const base = path.basename(chosen, path.extname(chosen));
              const expected = path.join(dir, base + '.hbinpkg');
              if (fs.existsSync(expected) && fs.statSync(expected).isFile()) {
                pkgPath = expected;
              } else {
                const entries = fs.readdirSync(dir);
                for (const e of entries) {
                  if (e.toLowerCase().endsWith('.hbinpkg')) { pkgPath = path.join(dir, e); break; }
                }
              }
            } else {
              // neither .ini nor .hbinpkg: try to find .ini and .hbinpkg in same dir
              const entries = fs.readdirSync(dir);
              for (const e of entries) {
                if (!cfgPath && e.toLowerCase().endsWith('.ini')) cfgPath = path.join(dir, e);
                if (!pkgPath && e.toLowerCase().endsWith('.hbinpkg')) pkgPath = path.join(dir, e);
                if (cfgPath && pkgPath) break;
              }
              // fallback: use chosen as cfgPath
              if (!cfgPath) cfgPath = chosen;
            }
          } catch (e) {
            // ignore
            cfgPath = chosen;
          }
          webview.postMessage({ command: 'pickedFile', file: cfgPath || '', pkg: pkgPath || '' });
        } else {
          webview.postMessage({ command: 'pickedFile', file: '' , pkg: ''});
        }
      } catch (e) {
        output.appendLine('[flashFirmware] pickFile handler error: ' + String(e));
        webview.postMessage({ command: 'pickedFile', file: '' , pkg: ''});
      }
      return;
    }
  };
}

export async function showFlashFirmware(context: vscode.ExtensionContext) {
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

  try { setupWebviewTheme(panel); } catch (e) { /* ignore if helper missing */ }

  // check if project is unirtos
  const basic = runBasicEnvChecks(context);
  panel.webview.postMessage({ type: 'setUniRTOSProject', value: basic.configPassed });

  // Try to auto-detect a quec_download_usb.ini under qos_build/release/<firmware>/ and prefill the file selector
  try {
    const autoCfg = findQuecCfgInRelease(context);
    if (autoCfg) {
      // try to find sibling .hbinpkg for auto-detected cfg
      let pkgPath = '';
      try {
        const dir = path.dirname(autoCfg);
        const base = path.basename(autoCfg, path.extname(autoCfg));
        const expected = path.join(dir, base + '.hbinpkg');
        if (fs.existsSync(expected) && fs.statSync(expected).isFile()) {
          pkgPath = expected;
        } else {
          const entries = fs.readdirSync(dir);
          for (const e of entries) {
            if (e.toLowerCase().endsWith('.hbinpkg')) { pkgPath = path.join(dir, e); break; }
          }
        }
      } catch {}
      panel.webview.postMessage({ command: 'pickedFile', file: autoCfg, pkg: pkgPath });
    }
  } catch (e) {
    console.warn('Auto-detect cfg failed:', e);
  }

  const output = vscode.window.createOutputChannel('UniRTOS Flash Firmware');
  // keep the output channel hidden until user wants to view; we'll show on first debug log

  const handleWebviewMessage = createWebviewMessageHandler(panel, context, output);

  panel.webview.onDidReceiveMessage((msg) => void handleWebviewMessage(msg));

}

export default showFlashFirmware;
