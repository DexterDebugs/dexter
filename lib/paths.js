/* Canonical paths — single source of truth (BUILD.md Phase 0.1) */
const path = require('path');
const os = require('os');

const DEXTER_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'dexter');
const DATA_FILE = path.join(DEXTER_DIR, 'dexter-data.json');
const HOME_DIR = path.join(os.homedir(), '.dexter');
const LEGACY_PATHS = [
  path.join(process.env.APPDATA || '', 'Electron', 'dexter-data.json')
];

module.exports = { DEXTER_DIR, DATA_FILE, HOME_DIR, LEGACY_PATHS };
