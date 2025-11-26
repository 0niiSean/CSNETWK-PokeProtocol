import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as BattleManager from './game/battle-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('public/battle-ui.html');
    
    // Initialize battle manager with window reference
    BattleManager.initialize(mainWindow);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// ===== IPC Handlers =====

ipcMain.on('start-battle', (event, data) => {
    const { role, ip, port } = data;
    console.log(`Starting battle as ${role} connecting to ${ip}:${port}`);
    BattleManager.startBattle(role, ip, parseInt(port));
});

ipcMain.on('attack', (event, moveName) => {
    console.log(`Attack: ${moveName}`);
    BattleManager.executeAttack(moveName);
});