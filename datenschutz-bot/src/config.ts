import path from "node:path";
import { fileURLToPath } from "node:url";

// dist/config.js liegt eine Ebene unter dem Projektordner.
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const DATA_DIR = path.resolve(process.env.DSB_DATA_DIR ?? path.join(PROJECT_ROOT, "data"));
export const CONFIG_DIR = path.resolve(process.env.DSB_CONFIG_DIR ?? path.join(PROJECT_ROOT, "config"));
export const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
export const EXAMPLES_DIR = path.join(PROJECT_ROOT, "examples");

export const HOST = process.env.DSB_HOST ?? "127.0.0.1";
export const PORT = Number(process.env.DSB_PORT ?? 4317);
