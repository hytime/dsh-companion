import { mkdir, readFile, writeFile as fsWriteFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** 插件配置 Schema(~/.hy-companion/config.json)。 */
export interface CompanionSettings {
  companionName: string;
  userCallName: string;
  showAffection: boolean;
  showBubble: boolean;
  reminderEnabled: boolean;
  reminderIntervalMin: number;
}

/** 缺省配置:文件不存在 / 非法 JSON 时的兜底值。 */
export const DEFAULT_SETTINGS: CompanionSettings = {
  companionName: '旅伴',
  userCallName: '造物主',
  showAffection: true,
  showBubble: true,
  reminderEnabled: true,
  reminderIntervalMin: 60,
};

export interface ReadSettingsOptions {
  /** 配置文件路径,缺省 ~/.hy-companion/config.json。 */
  configPath?: string;
}

export interface WriteSettingsOptions {
  /** 配置文件路径,缺省 ~/.hy-companion/config.json。 */
  configPath?: string;
  /** 注入用写入实现,缺省 node:fs/promises writeFile(测试注入失败场景)。 */
  writeFile?: (path: string, data: string, encoding: 'utf8') => Promise<void>;
}

export interface WriteResult {
  ok: boolean;
  error?: string;
}

/** 缺省配置文件路径:~/.hy-companion/config.json(与 last-reply.json 同目录)。 */
function defaultConfigPath(): string {
  return join(homedir(), '.hy-companion', 'config.json');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** JSON 深合并:普通对象按字段递归合并,其余值直接覆盖。 */
function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = deepMerge(merged[key], value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

/** 只取 CompanionSettings 的 6 个已知字段(凭据等未知字段一律不落盘)。 */
function pickKnownFields(partial: Partial<CompanionSettings>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof CompanionSettings>) {
    if (partial[key] !== undefined) picked[key] = partial[key];
  }
  return picked;
}

/**
 * 读取配置:文件不存在 / 非法 JSON / 读取失败一律返回缺省,不抛出。
 * 已存在文件按「缺省为底、文件覆盖」深合并,缺失字段回落到缺省。
 */
export async function readSettings(options: ReadSettingsOptions = {}): Promise<CompanionSettings> {
  const configPath = options.configPath ?? defaultConfigPath();
  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) return { ...DEFAULT_SETTINGS };
    return deepMerge({ ...DEFAULT_SETTINGS }, parsed) as unknown as CompanionSettings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * 写入配置:以当前磁盘配置为底(读不到则用缺省)深合并,只写 6 个已知字段;
 * 父目录不存在时 mkdir -p;写入失败返回 { ok:false, error },不抛出。
 */
export async function writeSettings(
  settings: Partial<CompanionSettings>,
  options: WriteSettingsOptions = {},
): Promise<WriteResult> {
  const configPath = options.configPath ?? defaultConfigPath();
  const writeFile = options.writeFile ?? fsWriteFile;
  try {
    const current = await readSettings({ configPath });
    const merged = deepMerge({ ...current }, pickKnownFields(settings));
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(merged, null, 2), 'utf8');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
