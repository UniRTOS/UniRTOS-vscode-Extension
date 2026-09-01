import * as vscode from 'vscode';
import { execSync, exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { UNIRTOS_VENV } from '../constants';

let venvPath: string; // creat and use our own venv for the extension
let pythonExe: string;

export function initVenv(context: vscode.ExtensionContext) {
  venvPath = path.join(context.globalStoragePath, UNIRTOS_VENV);
  pythonExe = process.platform === 'win32'
    ? path.join(venvPath, 'Scripts', 'python.exe')
    : path.join(venvPath, 'bin', 'python');

  return pythonExe;
}

function getPythonLauncher(): string {
  const launchers = ['python', 'python3', 'py -3'];
  for (const launcher of launchers) {
    try {
      execSync(`${launcher} --version`, { stdio: 'pipe' });
      return launcher;
    } catch (e) {}
  }
  throw new Error('Python not found');
}

export function ensureVenv(silent: boolean = false): boolean {
  if (!venvPath) return false;
  if (fs.existsSync(venvPath)) {
    try {
      if (!silent) vscode.window.showInformationMessage('Activating UniRTOS virtual environment...');
      execSync(`"${pythonExe}" -m unirtos_cli version`, { stdio: 'pipe' });
      execSync(`"${pythonExe}" -m pip install --upgrade pip unirtos_cli`, { stdio: 'pipe' });
      return true;
    } catch (e) {}
  }

  try {
    const launcher = getPythonLauncher();
    fs.mkdirSync(path.dirname(venvPath), { recursive: true });
    if (!silent) vscode.window.showInformationMessage('Creating UniRTOS virtual environment...');
    execSync(`${launcher} -m venv "${venvPath}"`, { stdio: 'pipe' });
    if (!silent) vscode.window.showInformationMessage('Initializing UniRTOS cli...');
    execSync(`"${pythonExe}" -m pip install --upgrade pip unirtos_cli`, { stdio: 'pipe' });
    return true;
  } catch (e) {
    console.error('Failed to create venv:', e);
    return false;
  }
}

/**
 * Check for the Python-based UniRTOS CLI module (`unirtos_cli`).
 * If missing, prompt the user to install it via pip. Returns true when available.
 */
export function checkUnirtosCli(context: vscode.ExtensionContext): boolean {
  initVenv(context);
  if (!ensureVenv()) {
    vscode.window.showInformationMessage('Failed to set up UniRTOS CLI venv. Install Python and retry?', 'Yes', 'No')
      .then(answer => {
        if (answer === 'Yes') {
          ensureVenv();
        }
      });
    return false;
  }
  return true;
}

/**
 * Run the UniRTOS CLI Python module with given args and return stdout string.
 * Throws if execution fails. Uses the venv python executable.
 */
export function runUnirtosCli(args: string[]): string {
  if (!pythonExe) throw new Error('Venv not initialized');
  const safeArgs = args.map(a => a.replace(/"/g, '\\"')).join(' ');
  try {
    return execSync(`"${pythonExe}" -m unirtos_cli ${safeArgs}`, { stdio: 'pipe' }).toString().trim();
  } catch (error: any) {
    const stdout = error.stdout?.toString() || '';
    const stderr = error.stderr?.toString() || '';
    console.error('unirtos_cli stdout:', stdout);
    console.error('unirtos_cli stderr:', stderr);
    throw error;
  }
}

/**
 * Run pip list and return the output as a string.
 */
export function runPipList(): string {
  if (!pythonExe) throw new Error('Venv not initialized');
  return execSync(`"${pythonExe}" -m pip list`, { stdio: 'pipe' }).toString();
}

/**
 * Run a CLI command with streaming output to a VS Code output channel.
 * Streams stdout/stderr in real-time as the command executes.
 */
export function runCliCommandWithStreaming(args: string[], output: vscode.OutputChannel, cwd: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (!pythonExe) {
      reject(new Error('Venv not initialized'));
      return;
    }

    const safeArgs = args.map(a => a.replace(/"/g, '\\"')).join(' ');
    const cmd = `"${pythonExe}" -m unirtos_cli ${safeArgs}`;
    const child = exec(cmd, { cwd });

    if (child.stdout) child.stdout.on('data', (d) => output.append(d.toString()));
    if (child.stderr) child.stderr.on('data', (d) => output.append(d.toString()));

    child.on('error', (err) => {
      output.appendLine('Command error: ' + err.message);
      reject(err);
    });

    child.on('close', (code) => {
      if (code === 0) {
        output.appendLine('Command completed successfully.');
        resolve();
      } else {
        output.appendLine(`Command exited with code ${code}.`);
        reject(new Error(`Command failed with code ${code}`));
      }
    });
  });
}
