import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { exec } from 'child_process';

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
    let models: string[] = [];
    if (selected) {
        const modelsRaw = platforms[selected];
        if (Array.isArray(modelsRaw)) models = modelsRaw as string[];
        else if (modelsRaw && typeof modelsRaw === 'object') models = Object.keys(modelsRaw as Record<string, unknown>);
    }
    try {
        webview.postMessage({ type: 'setModels', models });
    } catch (e) {
        console.warn('Failed to post setModels message to webview:', e);
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
 * Write a minimal `app.json` manifest into `folderPath`.
 * Returns true on success, false on error.
 */
export function writeAppJsonToFolder(folderPath: string, appManifest: any): boolean {
    try {
        // add computed version if missing: model + "R01A01_BETA_OCPU" + date(YYYYMMDD)
        if (!appManifest.version) {
            const model = (appManifest && typeof appManifest.model === 'string') ? appManifest.model : '';
            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            const date = `${yyyy}${mm}${dd}`;
            appManifest.version = `${model}R01A01_BETA_OCPU${date}`;
        }

        const appJsonPath = path.join(folderPath, 'app.json');
        fs.writeFileSync(appJsonPath, JSON.stringify(appManifest, null, 2), 'utf8');
        exec(`attrib +h "${appJsonPath}"`); // hide the file on Windows
        return true;
    } catch (e) {
        console.warn('Failed to write app.json correctly to folder:', folderPath, e);
        return false;
    }
}
