import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as os from 'os';
import { execSync, spawnSync } from 'child_process';
import { TOOLCHAIN_URL } from '../constants';

export async function downloadUnirtos(context: vscode.ExtensionContext): Promise<void> {
  return downloadAndInstall(TOOLCHAIN_URL, context, { defaultDir: path.join(os.tmpdir(), 'unirtos-downloads'), title: 'Downloading UniRTOS toolchain', installTitle: 'Installing UniRTOS toolchain' });
}

export async function downloadAndInstall(
  url: string,
  context: vscode.ExtensionContext,
  options?: { defaultDir?: string; title?: string; installTitle?: string; autoRunInstaller?: boolean }
): Promise<void> {
  const defaultDir = options && options.defaultDir ? options.defaultDir : path.join(os.tmpdir(), 'unirtos-downloads');
  const progressTitle = options && options.title ? options.title : 'Downloading';
  const installTitle = options && options.installTitle ? options.installTitle : 'Installing';
  const autoRunInstaller = options && typeof options.autoRunInstaller === 'boolean' ? options.autoRunInstaller : true;

  let targetDir = defaultDir;
  let pick: readonly vscode.Uri[] | undefined;
  try {
    pick = await vscode.window.showOpenDialog({
      defaultUri: vscode.Uri.file(defaultDir),
      canSelectFiles: false,
      canSelectFolders: true,
      openLabel: 'Select download folder',
      canSelectMany: false
    });
  } catch (e) {
    pick = undefined;
  }

  // If the user cancelled the folder picker, abort the download.
  if (typeof pick === 'undefined') {
    vscode.window.showInformationMessage('Download cancelled.');
    return;
  }

  if (pick && pick.length > 0) {
    targetDir = pick[0].fsPath;
  }

  try {
    fs.mkdirSync(targetDir, { recursive: true });
  } catch (e) {
    // ignore
  }

  // Derive filename from URL to avoid hardcoded mismatch
  let filename = '';
  try {
    filename = path.basename(new URL(url).pathname);
  } catch (e) {
    // fallback if URL parsing fails
    vscode.window.showWarningMessage('Failed to parse filename from URL, using default name. Error: ' + String(e));
    return;
  }
  const dest = path.join(targetDir, filename);

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: progressTitle,
    cancellable: true
  }, (progress, token) => {
    return new Promise<void>((resolve, reject) => {
      let cancelled = false;
      const req = https.get(url, (res) => {
        const startTs = Date.now();
        let lastReportTs = 0;

        function formatSeconds(sec: number) {
          if (!isFinite(sec) || sec < 0) return 'calculating...';
          const s = Math.max(0, Math.round(sec));
          const hours = Math.floor(s / 3600);
          const mins = Math.floor((s % 3600) / 60);
          const secs = s % 60;
          if (hours > 0) return `${hours}h ${mins}m`;
          if (mins > 0) return `${mins}m ${secs}s`;
          return `${secs}s`;
        }

        if ((res.statusCode || 0) >= 400) {
          reject(new Error('Download failed with status ' + res.statusCode));
          return;
        }
        const total = parseInt(String(res.headers['content-length'] || '0'), 10) || 0;
        let received = 0;
        let lastPercentReported = 0;
        const fileStream = fs.createWriteStream(dest);

        token.onCancellationRequested(() => {
          cancelled = true;
          try { req.destroy(); } catch (e) {}
          try { fileStream.close(); } catch (e) {}
          try { fs.unlinkSync(dest); } catch (e) {}
          vscode.window.showErrorMessage('Download cancelled. Please check readme for the URL and manual download if needed.');
          resolve();
        });

        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (total) {
            const now = Date.now();
            const percent = Math.min(100, (received / total) * 100);
            const inc = Math.max(0, percent - lastPercentReported);

            // estimate time left
            const elapsed = (now - startTs) / 1000; // seconds
            const rate = elapsed > 0 ? (received / elapsed) : 0; // bytes/sec
            let etaMsg = 'ETA: calculating...';
            if (rate > 0) {
              const remaining = Math.max(0, total - received);
              etaMsg = `ETA: ${formatSeconds(remaining / rate)}`;
            }

            // throttle updates to once every 5 seconds, but always report on completion
            if ((now - lastReportTs >= 5000 && inc > 0) || percent === 100) {
              progress.report({ increment: inc, message: etaMsg });
              lastReportTs = now;
              lastPercentReported = percent;
            }
          }
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => {
            if (cancelled) {
              try { fs.unlinkSync(dest); } catch (e) {}
              resolve();
              return;
            }

            // Automatically unzip and run installer with progress messages
            vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: installTitle, cancellable: false }, async (progress) => {
              progress.report({ message: 'Unpacking...' });
              let outDir: string;
              try {
                outDir = await unzipArchive(dest);
              } catch (err) {
                vscode.window.showErrorMessage('Failed to unzip archive: ' + String(err));
                return;
              }

              // If autoRunInstaller is disabled, stop here and instruct the user where to install
              if (!autoRunInstaller) {
                const installMsg = `Please install the files from here: ${outDir}`;
                const open = 'Open folder';
                const choice = await vscode.window.showInformationMessage(installMsg, open);
                if (choice === open) {
                  try {
                    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outDir));
                  } catch (e) {
                    // ignore
                  }
                }
                return;
              }

              progress.report({ message: 'Running installer...' });
              try {
                await promptAndRunExecutable(outDir);
              } catch (err) {
                vscode.window.showErrorMessage('Failed to run installer: ' + String(err));
                return;
              }

              progress.report({ message: 'Done' });
            });

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

export async function unzipArchive(zipPath: string, destDir?: string): Promise<string> {
  // Default to a sibling folder named after the zip (without extension) to keep extracted files isolated
  const inferredFolderName = path.basename(zipPath, path.extname(zipPath));
  const outDir = destDir || path.join(path.dirname(zipPath), inferredFolderName);
  try {
    try {
      fs.mkdirSync(outDir, { recursive: true });
    } catch (e) {
      // ignore
    }

    if (process.platform === 'win32') {
      // Use PowerShell Expand-Archive on Windows into the dedicated outDir
      const cmd = `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${outDir}' -Force -ErrorAction Stop"`;
      execSync(cmd, { stdio: 'inherit' });
    } else {
      // Try native unzip on Unix-like systems
      execSync(`unzip -o "${zipPath}" -d "${outDir}"`, { stdio: 'inherit' });
    }

    // Log extracted files to the UniRTOS output channel
    try {
      const channel = vscode.window.createOutputChannel('UniRTOS');
      channel.appendLine(`Unpacked UniRTOS toolchain to: ${outDir}`);
      function listFiles(dir: string, rel = ''): void {
        for (const name of fs.readdirSync(dir)) {
          const full = path.join(dir, name);
          let st;
          try { st = fs.statSync(full); } catch (e) { continue; }
          const relPath = path.join(rel, name);
          if (st.isDirectory()) {
            channel.appendLine(`[DIR]  ${relPath}`);
            listFiles(full, relPath);
          } else {
            channel.appendLine(`[FILE] ${relPath}`);
          }
        }
      }
      listFiles(outDir);
      channel.show(true);

      // Do not auto-run the installer here; caller will run it and show progress.
      return outDir;
    } catch (e) {
      // non-fatal: log and still return the outDir so caller can proceed
      const channel = vscode.window.createOutputChannel('UniRTOS');
      channel.appendLine('Error while listing extracted files: ' + String(e));
      channel.show(true);
      return outDir;
    }
  } catch (err) {
    vscode.window.showErrorMessage('Unzip failed: ' + String(err));
    throw err;
  }
}

export async function promptAndRunExecutable(outDir: string): Promise<void> {
  try {
    function findExes(dir: string): string[] {
      let results: string[] = [];
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        let st;
        try { st = fs.statSync(full); } catch (e) { continue; }
        if (st.isDirectory()) {
          results = results.concat(findExes(full));
        } else if (name.toLowerCase().endsWith('.exe')) {
          results.push(full);
        }
      }
      return results;
    }

    const exes = findExes(outDir);
    if (exes.length === 0) return;

    // Run the first discovered executable (assumes single .exe present)
    const exePath = exes[0];
    const channel = vscode.window.createOutputChannel('UniRTOS');
    channel.appendLine(`Running executable: ${exePath}`);
    const runRes = spawnSync(exePath, [], { cwd: outDir, encoding: 'utf8' });
    channel.appendLine(`Exit code: ${runRes.status}`);
    if (runRes.stdout) channel.appendLine(`stdout:\n${runRes.stdout}`);
    if (runRes.stderr) channel.appendLine(`stderr:\n${runRes.stderr}`);
    if (runRes.error) channel.appendLine(`error: ${String(runRes.error)}`);
    channel.show(true);

    if (runRes.error || (runRes.status && runRes.status !== 0)) {
      vscode.window.showErrorMessage('Executable failed: ' + (runRes.stderr || runRes.stdout || String(runRes.error)));
    } else {
      vscode.window.showInformationMessage('Please restart you PC, UniRTOS toolchain installation finished!');
    }
  } catch (e) {
    const channel = vscode.window.createOutputChannel('UniRTOS');
    channel.appendLine('Error while searching/running exe: ' + String(e));
    channel.show(true);
  }
}
