import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runBasicEnvChecks } from '../checkView';
import { injectHeaderIntoHtml } from '../header';
import { setupWebviewTheme } from '../../utils';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { AT_DOWNLOAD, QUECTEL_DRIVER_URL } from '../../constants';
import { downloadAndInstall } from '../toolchainDownload';

let flashFirmwarePanel: vscode.WebviewPanel | undefined;

interface AtWorkerResult {
  success: boolean;
  lines: string[];
  error?: string;
}

interface AtWorkerOptions {
  portPath: string;
  command: string;
  baudRate?: number;
  timeoutMs?: number;
}

function findQuecCfgInRelease(context: vscode.ExtensionContext): string | null {
  try {
    const folders = vscode.workspace.workspaceFolders || [];
    for (const f of folders) {
      const base = path.join(f.uri.fsPath, 'qos_build', 'release');
      if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) continue;
      const entries = fs.readdirSync(base);
      for (const e of entries) {
        try {
          const releaseDir = path.join(base, e);
          const configFile = path.join(releaseDir, 'quec_download_usb.ini');
          if (fs.existsSync(configFile) && fs.statSync(configFile).isFile()) return configFile;

          const packageFile = fs.readdirSync(releaseDir)
            .find((file) => file.toLowerCase().endsWith('.hbinpkg'));
          if (packageFile) return path.join(releaseDir, packageFile);
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

async function listAvailablePorts(output?: vscode.OutputChannel, context?: vscode.ExtensionContext): Promise<Array<{ label: string; value: string }>> {
  const ports: Array<{ label: string; value: string }> = [];
  try {
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
      let quectelFound = false;
      let atFound = false;
      let qdloaderFound = false;
      for (const p of portList) {
        const value = (p.path || p.comName || p.com) as string;
        const manufacturer = (p.manufacturer || '').toString().toLowerCase();
        if (!manufacturer.includes('quectel')) continue; // only include Quectel devices
        quectelFound = true;
        const friendly = (p.friendlyName || '').toString();
        const label = `${friendly} (${value})`;
        const labelLower = label.toLowerCase();
        if (labelLower.includes('qdloader') || (value && value.toLowerCase().includes('qdloader')) || manufacturer.includes('qdloader')) {
          qdloaderFound = true;
        }
        if (labelLower.includes('at') || (value && value.toLowerCase().includes('at')) || friendly.toLowerCase().includes('at')) {
          atFound = true;
        }
        ports.push({ label: label.trim(), value: value });
      }
      if (quectelFound && !atFound && !qdloaderFound) {
        // don't block returning the port list on the dialog response
        (async () => {
          try {
            const label = 'at port is missing, download the driver or check the readme';
            const downloadBtn = 'Download';
            const choice = await vscode.window.showWarningMessage(label, downloadBtn);
            if (choice === downloadBtn) {
              try {
                if (!context) {
                  if (output) output.appendLine('[listAvailablePorts] context required to download driver');
                } else {
                  await downloadAndInstall(QUECTEL_DRIVER_URL, context, { defaultDir: path.join(os.tmpdir(), 'quectel-driver-downloads'), title: 'Downloading Quectel driver', installTitle: 'Installing Quectel driver', autoRunInstaller: false });
                }
              } catch (err) {
                if (output) output.appendLine('[listAvailablePorts] failed to start download: ' + String(err));
              }
            }
          } catch (e) {
            if (output) output.appendLine('[listAvailablePorts] at port is missing');
          }
        })();
      }
    } else {
      if (output) output.appendLine('[listAvailablePorts] serialport list() not available; install @serialport/list or a compatible package');
    }
  } catch (e) {
    if (output) output.appendLine('[listAvailablePorts] Error listing ports: ' + String(e));
  }
  return ports;
}

interface CommandState {
  outputBuffer: string;
  sawSysresetFinish: boolean;
  sawBurnFailed: boolean;
}

async function runCommand(cmd: { exe: string; args: string[] }, output: vscode.OutputChannel, state: CommandState): Promise<number> {
  const spawn = require('child_process').spawn;
  
  return new Promise<number>((resolve) => {
    try {
      output.appendLine('> ' + [cmd.exe].concat(cmd.args || []).join(' '));
      const child = spawn(cmd.exe, cmd.args || [], { cwd: require('path').dirname(cmd.exe) || undefined });

      if (child.stdout) child.stdout.on('data', (d: any) => {
        const text = String(d);
        output.append(text);
        try {
          state.outputBuffer += text;
          // keep buffer bounded
          if (state.outputBuffer.length > 8192) state.outputBuffer = state.outputBuffer.slice(-8192);
          const buf = state.outputBuffer.toLowerCase();
          if (buf.includes('sysreset finish')) state.sawSysresetFinish = true;
          if (buf.includes('burn failed')) state.sawBurnFailed = true;
        } catch {}
      });
      if (child.stderr) child.stderr.on('data', (d: any) => {
        const text = String(d);
        output.append(text);
        try {
          state.outputBuffer += text;
          const buf = state.outputBuffer.toLowerCase();
          if (state.outputBuffer.length > 8192) state.outputBuffer = state.outputBuffer.slice(-8192);
          if (buf.includes('sysreset finish')) state.sawSysresetFinish = true;
          if (buf.includes('burn failed')) state.sawBurnFailed = true;
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

async function handleFlashFirmware(msg: any, webview: vscode.Webview, context: vscode.ExtensionContext, output: vscode.OutputChannel) {
  // run FlashToolCLI with the selected cfg file and stream output to the channel
  try {
    output.show(true);
    // Ensure evn is setup correctly before flashing
    try {
      const basic = runBasicEnvChecks(context);
      if (!basic || !basic.configPassed) {
        const reason = basic && basic.reason ? String(basic.reason) : 'Workspace is not a UniRTOS SDK project!';
        output.appendLine('[flashFirmware] Aborting: ' + reason);
        try { webview.postMessage({ command: 'flashComplete', success: false, reason }); } catch {}
        try { vscode.window.showErrorMessage(reason); } catch {}
        return;
      }
    } catch (e) {
      output.appendLine('[flashFirmware] workspace check failed: ' + String(e));
      try { webview.postMessage({ command: 'flashComplete', success: false, reason: 'Workspace check failed' }); } catch {}
      return;
    }

    // check if it's AT port
    let selectedLabel = msg && msg.selectedLabel ? String(msg.selectedLabel).toLowerCase() : '';
    let selectedPort = msg && msg.selectedPort ? String(msg.selectedPort) : '';
    if (selectedLabel.includes('at')) {
      try {
        await sendAtCommand({
          portPath: selectedPort,
          command: AT_DOWNLOAD,
          baudRate: 115200,
          timeoutMs: 4000
        });

        // Wait 5 seconds for the device to switch to download mode
        output.appendLine('[flashFirmware] Switching to download mode, waiting 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));
          
        // Search for qdloader port
        output.appendLine('[flashFirmware] Searching for QDLoader port...');
        const availablePorts = await listAvailablePorts(output, context);
        let qdloaderPort = availablePorts.find(p => p.label.toLowerCase().includes('qdloader'));
        
        if (qdloaderPort) {
          output.appendLine('[flashFirmware] Found QDLoader port: ' + qdloaderPort.label);
          selectedPort = qdloaderPort.value;
          selectedLabel = qdloaderPort.label.toLowerCase();
        } else {
          const msg = 'QDLoader port not found. Please enable download mode manually or try again';
          output.appendLine('[flashFirmware] ' + msg + '.');
          output.appendLine('[flashFirmware] ' + 'Available ports: ' + availablePorts.map(p => p.label).join(', '));
          try { webview.postMessage({ command: 'flashComplete', success: false, reason: 'QDLoader port not found, please enable download mode manually or try again' }); } catch {}
          try { vscode.window.showErrorMessage(msg); } catch {}
          return;
        }
      } catch (e) {
        output.appendLine('[flashFirmware] Error checking AT port: ' + String(e));
      }
    } else {
      output.appendLine('[flashFirmware] Port is not an AT port (label: ' + selectedLabel + ')');
    }
    
    const exe = path.join(context.extensionPath, 'src', 'data', 'Eigen_718', 'FlashToolCLI.exe');
    const cfg = msg && msg.selectedFile ? String(msg.selectedFile) : '';
    const port = selectedPort;
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

    const commandState: CommandState = {
      outputBuffer: '',
      sawSysresetFinish: false,
      sawBurnFailed: false
    };

    // Execute commands sequentially
    let hadError = false;
    for (const c of commands) {
      // If exe is the packaged FlashToolCLI, validate it exists
      if (c.exe === exe && !fs.existsSync(c.exe)) {
        output.appendLine(`[flashFirmware] FlashToolCLI not found at ${c.exe}`);
        return;
      }
      const code = await runCommand(c, output, commandState);
      if (code !== 0) {
        hadError = true;
        break;
      }
    }
    // After running commands (or breaking on error), notify the webview and user based on observed markers
    try {
      if (commandState.sawSysresetFinish && !hadError) {
        output.appendLine('[flashFirmware] flashing completed successfully.');
        try { webview.postMessage({ command: 'flashComplete', success: true }); } catch {}
        try { vscode.window.showInformationMessage('Flashing completed successfully.'); } catch {}
      } else if (commandState.sawBurnFailed || hadError) {
        const reason = commandState.sawBurnFailed ? 'burn failed' : 'process error';
        output.appendLine('[flashFirmware] flashing failed (' + reason + ').');
        try { webview.postMessage({ command: 'flashComplete', success: false, reason }); } catch {}
        try { vscode.window.showErrorMessage('Flashing failed (' + reason + ').'); } catch {}
      }
    } catch {}
  } catch (e) {
    output.appendLine('[flashFirmware] failed to start FlashToolCLI: ' + String(e));
  }
}

function flashMessageHandler(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, output: vscode.OutputChannel) {
  return async function handleWebviewMessage(msg: any) {
    if (!msg) return;
    const webview = panel.webview;

    if (msg.command === 'flashFirmware') {
      await handleFlashFirmware(msg, webview, context, output);
      return;
    }

    if (msg.command === 'requestPorts') {
      try {
        const ports = await listAvailablePorts(output, context);
        webview.postMessage({ command: 'ports', ports });
      } catch (e) {
        output.appendLine('[flashFirmware] requestPorts handler error: ' + String(e));
        webview.postMessage({ command: 'ports', ports: [] });
      }
      return;
    }

    if (msg.command === 'requestProjectStatus') {
      try { runBasicEnvChecks(context); } catch (e) {}
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
          webview.postMessage({ command: 'pickedFile', file: path.dirname(uris[0].fsPath) || '', pkg: uris[0].fsPath || '' });
          return;
        } else {
          // User canceled the file picker, dont change the current file
        }
      } catch (e) {
        output.appendLine('[flashFirmware] pickFile handler error: ' + String(e));
        webview.postMessage({ command: 'pickedFile', file: '' , pkg: ''});
      }
      return;
    }

    if (msg.command === 'cancel') {
      try { panel.dispose(); } catch (e) { /* ignore */ }
      return;
    }
  };
}

// build flash webview panel
export async function showFlashFirmware(context: vscode.ExtensionContext) {
  // Use 1 tab only, not multiple ones
  if (flashFirmwarePanel) {
    flashFirmwarePanel.reveal(vscode.ViewColumn.One);
    try { setupWebviewTheme(flashFirmwarePanel); } catch (e) {}
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
  runBasicEnvChecks(context);

  // If the webview signals it's ready, resend theme and status to ensure styling is correct
  panel.webview.onDidReceiveMessage((msg) => {
    try {
      if (msg && msg.command === 'ready') {
        try { setupWebviewTheme(panel); } catch (e) {}
        try { runBasicEnvChecks(context); } catch (e) {}
      }
    } catch (e) {}
  });

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

  const handleWebviewMessage = flashMessageHandler(panel, context, output);

  panel.webview.onDidReceiveMessage((msg) => void handleWebviewMessage(msg));

}

// Sends an AT command to a specified serial port
export function sendAtCommand(options: AtWorkerOptions): Promise<AtWorkerResult> {
  const { portPath, command, baudRate = 115200, timeoutMs = 4000 } = options;

  return new Promise((resolve) => {
    const port = new SerialPort({
      path: portPath,
      baudRate,
      autoOpen: false,
    });

    const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
    const output: string[] = [];

    // Safety timeout to prevent hanging if modem stops responding
    const timeout = setTimeout(() => {
      if (port.isOpen) {
        port.close();
      }
      resolve({
        success: false,
        error: `Command timed out after ${timeoutMs}ms`,
        lines: output,
      });
    }, timeoutMs);

    // Capture incoming lines from the device
    parser.on('data', (line: string) => {
      const trimmed = line.trim();
      if (trimmed) {
        output.push(trimmed);
      }

      // Check for standard AT command terminal responses
      if (trimmed === 'OK' || trimmed.includes('ERROR')) {
        clearTimeout(timeout);
        port.close();
        resolve({ success: true, lines: output });
      }
    });

    // Handle serial connection or transmission errors
    port.on('error', (err: Error) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message, lines: output });
    });

    // Open port and transmit the command
    port.open((err) => {
      if (err) {
        clearTimeout(timeout);
        return resolve({ success: false, error: err.message, lines: [] });
      }

      port.write(`${command}\r\n`, (writeErr) => {
        if (writeErr) {
          clearTimeout(timeout);
          port.close();
          resolve({ success: false, error: writeErr.message, lines: output });
        }
      });
    });
  });
}
