export interface PicoConfig {
  model?: string;
  modelProvider?: string;
  cwd?: string;
  approvalPolicy?: string;
  sandbox?: unknown;
  personality?: string;
  developerInstructions?: string;
  codexBinary?: string;
}

const CONFIG_PATH = ".pico/config.json";

export async function loadPicoConfig(cwd: string = process.cwd()): Promise<PicoConfig> {
  const home = Bun.env.HOME || process.env.HOME || ".";
  const globalConfig = await readConfig(`${home}/${CONFIG_PATH}`);
  const projectConfig = await readConfig(`${cwd}/${CONFIG_PATH}`);
  return {
    ...globalConfig,
    ...projectConfig,
    cwd: projectConfig.cwd || globalConfig.cwd || cwd,
  };
}

async function readConfig(path: string): Promise<PicoConfig> {
  const file = Bun.file(path);
  if (!(await file.exists().catch(() => false))) {
    return {};
  }

  try {
    return JSON.parse(await file.text()) as PicoConfig;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid Pico config ${path}: ${message}`);
  }
}
