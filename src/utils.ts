import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { exec } from 'child_process';
import { CONFIG_FILE } from './constants';

export function platformFilePath(context: vscode.ExtensionContext): Record<string, any> {
    const platformFile = path.join(context.extensionPath, 'src', 'data', 'platform.json');
    let platforms: Record<string, any> = {};
    try {
        const raw = fs.readFileSync(platformFile, 'utf8');
        platforms = JSON.parse(raw);
    } catch (e) {
        platforms = {};
    }
    return platforms;
}

export function handlePlatformChanged(msgValue: unknown, platforms: Record<string, any>, webview: vscode.Webview) {
    const selected = (msgValue as string) || undefined;
    let modules: string[] = [];
    if (selected) {
        const modulesRaw = platforms[selected];
        if (Array.isArray(modulesRaw)) modules = modulesRaw as string[];
        else if (modulesRaw && typeof modulesRaw === 'object') modules = Object.keys(modulesRaw as Record<string, unknown>);
    }
    try {
        webview.postMessage({ type: 'setModules', modules: modules });
    } catch (e) {
        console.warn('Failed to post setModules message to webview:', e);
    }
}

// send platforms when webview is ready or on-demand
export const sendPlatforms = (webview: vscode.Webview, platformKeys: string[]) => {
    webview.postMessage({ type: 'setPlatforms', platforms: platformKeys });
};

export function setupWebviewTheme(panel: vscode.WebviewPanel) {
    function sendTheme() {
        try {
            const vwin: any = vscode.window as any;
            const kind = vwin && vwin.activeColorTheme && vwin.activeColorTheme.kind;
            const ColorThemeKind: any = (vscode as any).ColorThemeKind || { Light: 1 };
            const theme = (kind === ColorThemeKind.Light) ? 'light' : 'dark';
            panel.webview.postMessage({ type: 'theme', theme });
        } catch (e) {
            // ignore
        }
    }
    sendTheme();
    const vwin: any = vscode.window as any;
    const disp = (typeof vwin.onDidChangeActiveColorTheme === 'function')
        ? vwin.onDidChangeActiveColorTheme(() => sendTheme())
        : { dispose() { /* noop */ } };
    panel.onDidDispose(() => disp.dispose());
}

/**
 * Write a minimal CONFIG_FILE manifest into `folderPath`.
 * Returns true on success, false on error.
 */
export function writeConfigFileToFolder(folderPath: string, appManifest: any): boolean {
    try {
        // add computed version if missing: module + "R01A01_BETA_OCPU" + date(YYYYMMDD)
        if (!appManifest.version) {
            const module = (appManifest && typeof appManifest.pickedModule === 'string') ? appManifest.pickedModule : '';
            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            const date = `${yyyy}${mm}${dd}`;
            appManifest.version = `${module}R01A01_BETA_OCPU${date}`;
        }

        // Merge into existing CONFIG_FILE if present; only update build.module and build.version
        const appJsonPath = path.join(folderPath, CONFIG_FILE);
        let toWrite: any = {};
        try {
            if (fs.existsSync(appJsonPath)) {
                const rawExisting = fs.readFileSync(appJsonPath, 'utf8');
                toWrite = rawExisting ? JSON.parse(rawExisting) : {};
            } else {
                toWrite = {};
            }
        } catch (e) {
            toWrite = {};
        }

        if (!toWrite.build || typeof toWrite.build !== 'object') {
            toWrite.build = {};
        }
        if (typeof appManifest.pickedModule !== 'undefined') {
            toWrite.build.module = appManifest.pickedModule;
        }
        if (typeof appManifest.version !== 'undefined') {
            toWrite.build.version = appManifest.version;
        }

        fs.writeFileSync(appJsonPath, JSON.stringify(toWrite, null, 2), 'utf8');
        exec(`attrib +h "${appJsonPath}"`); // hide the file on Windows
        return true;
    } catch (e) {
        console.warn(`Failed to write ${CONFIG_FILE} correctly to folder:`, folderPath, e);
        return false;
    }
}
