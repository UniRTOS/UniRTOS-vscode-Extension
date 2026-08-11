import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { downloadUnirtos } from './toolchainDownload';
import { checkUnirtosCli } from './pythonCli';
import { CONFIG_FILE } from '../constants';

export let projectConfigPassed = { configPassed: false, reason: 'Test not run yet' };

function checkWorkspaceForSdk(context: vscode.ExtensionContext): boolean {
  try {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return false;
    }

    const wf = folders[0].uri.fsPath;
    // check for CONFIG_FILE
    let hasBatch = false;
    try {
      // Check top-level first
      hasBatch = fs.existsSync(path.join(wf, CONFIG_FILE));
      // If not found at top-level, check one-level deep subfolders
      if (!hasBatch) {
        try {
          const entries = fs.readdirSync(wf, { withFileTypes: true });
          for (const e of entries) {
            if (e.isDirectory()) {
              const candidate = path.join(wf, e.name, CONFIG_FILE);
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
export function runBasicEnvChecks(context: vscode.ExtensionContext, skipWorkspaceCheck: boolean = false): { configPassed: boolean, reason: string } {
  // check 1, workspace
  if (!skipWorkspaceCheck) {
    const workspaceOk = checkWorkspaceForSdk(context);
    if (!workspaceOk) {
      projectConfigPassed = { configPassed: false, reason: 'Workspace is not a UniRTOS SDK project!' };
      return projectConfigPassed;
    }
  }

  if (projectConfigPassed.configPassed) {
    return { configPassed: true, reason: 'All checks passed' };
  }

  // check 1, workspace
  if (!skipWorkspaceCheck) {
    const workspaceOk = checkWorkspaceForSdk(context);
    if (!workspaceOk) {
      projectConfigPassed = { configPassed: false, reason: 'Workspace is not a UniRTOS SDK project!' };
      return projectConfigPassed;
    }
  }

  // check 2, git
  try {
    execSync('git --version').toString().trim();
  } catch (e) {
    projectConfigPassed = { configPassed: false, reason: 'Git not found!' };
    return projectConfigPassed;
  }

  // check 3, unirtos toolchain
  try {
    try {
      execSync('unirtos.exe --version', { stdio: 'pipe' }).toString().trim();
    } catch (e) {
      execSync('unirtos --version', { stdio: 'pipe' }).toString().trim();
    }
  } catch (e) {
    // Ask the user if they want to download the toolchain
    vscode.window.showInformationMessage(`Do you want to download the UniRTOS toolchain?`, 'Yes', 'No')
      .then(answer => {
        if (answer === 'Yes') {
          downloadUnirtos(context).catch(err => {
            vscode.window.showErrorMessage('Failed to download UniRTOS toolchain: ' + String(err));
          });
        } else {
          // User chose 'No' or dismissed the dialog: do not download.
        }
      });

    projectConfigPassed = { configPassed: false, reason: 'UniRTOS toolchain tool not found please check extension README for the correct setup!' };
    return projectConfigPassed;
  }

  // check 4, python
  const pythonOk = checkPython3();
  if (!pythonOk) {
    projectConfigPassed = { configPassed: false, reason: 'Python 3 not found!' };
    return projectConfigPassed;
  }

  // check 5, venv
  try {
    const venvOk = checkUnirtosCli(context);
    if (!venvOk) {
      projectConfigPassed = { configPassed: false, reason: 'Failed to create or initialize venv' };
      return projectConfigPassed;
    }
  } catch (e) {
    projectConfigPassed = { configPassed: false, reason: 'Venv setup error: ' + String(e) };
    return projectConfigPassed;
  }

  // // check 6, UniRTOS CLI module
  // try {
  //   const pyCliOk = checkUnirtosCli(context);
  //   if (!pyCliOk) {
  //     projectConfigPassed = { configPassed: false, reason: 'UniRTOS CLI not found;' };
  //     return projectConfigPassed;
  //   }
  // } catch (e) {
  //   // ignore unexpected errors from the Python CLI check and continue with other checks
  // }

  projectConfigPassed = { configPassed: true, reason: 'All checks passed' };
  return projectConfigPassed;
}