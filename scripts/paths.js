// Paths shared by the build scripts.
import path from 'node:path';

export const ROOT = path.join(import.meta.dirname, '..');
export const DIST = path.join(ROOT, 'dist');
export const DATA_OUT = path.join(DIST, 'data');
export const TRILOGY = path.join(ROOT, 'vendor/trilogy/data');
