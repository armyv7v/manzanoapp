import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  BINANCE_P2P_EMAIL: z.string().optional().default(''),
  BINANCE_P2P_PASSWORD: z.string().optional().default(''),
  BINANCE_P2P_HEADLESS: z.string().optional().default('false'),
  BINANCE_P2P_LOGIN_URL: z.string().url().default('https://accounts.binance.com/en/login'),
  BINANCE_P2P_TARGET_URL: z.string().url().default('https://c2c.binance.com/en/trade/sell/USDT?fiat=VES'),
  BINANCE_P2P_STORAGE_STATE_PATH: z.string().default('.auth/binance-p2p-storage-state.json'),
  BINANCE_P2P_PERSISTENT_PROFILE_DIR: z.string().default('.auth/binance-p2p-chrome-profile'),
  BINANCE_P2P_ARTIFACTS_DIR: z.string().default('artifacts'),
  BINANCE_P2P_TIMEOUT_MS: z.string().optional().default('45000'),
  BINANCE_P2P_SLOW_MO_MS: z.string().optional().default('250'),
  BINANCE_P2P_TRACE_ON: z.string().optional().default('true'),
  BINANCE_P2P_BROWSER_EXECUTABLE_PATH: z.string().optional().default(''),
  BINANCE_P2P_CDP_URL: z.string().url().default('http://127.0.0.1:9222'),
  BINANCE_P2P_CDP_SKIP_NAVIGATION: z.string().optional().default('false'),
  BINANCE_P2P_CAPTURE_BODY_MAX_CHARS: z.string().optional().default('20000'),
  BINANCE_P2P_PREPARE_ADVERTISER: z.string().optional().default(''),
  BINANCE_P2P_PREPARE_ROW_INDEX: z.string().optional().default('0'),
  BINANCE_P2P_PREPARE_AMOUNT: z.string().optional().default(''),
  BINANCE_P2P_PREPARE_AMOUNT_MODE: z.enum(['fiat', 'asset']).optional().default('fiat'),
  BINANCE_P2P_PREPARE_OPEN_PANEL_WAIT_MS: z.string().optional().default('2500'),
  BINANCE_P2P_PREPARE_MAX_ADS: z.string().optional().default('10'),
});

const parsed = envSchema.parse(process.env);

export const botConfig = {
  email: parsed.BINANCE_P2P_EMAIL.trim(),
  password: parsed.BINANCE_P2P_PASSWORD,
  headless: parsed.BINANCE_P2P_HEADLESS === 'true',
  loginUrl: parsed.BINANCE_P2P_LOGIN_URL,
  targetUrl: parsed.BINANCE_P2P_TARGET_URL,
  storageStatePath: parsed.BINANCE_P2P_STORAGE_STATE_PATH,
  persistentProfileDir: parsed.BINANCE_P2P_PERSISTENT_PROFILE_DIR,
  artifactsDir: parsed.BINANCE_P2P_ARTIFACTS_DIR,
  timeoutMs: Number(parsed.BINANCE_P2P_TIMEOUT_MS || 45000),
  slowMoMs: Number(parsed.BINANCE_P2P_SLOW_MO_MS || 250),
  traceOn: parsed.BINANCE_P2P_TRACE_ON === 'true',
  browserExecutablePath: parsed.BINANCE_P2P_BROWSER_EXECUTABLE_PATH.trim() || undefined,
  cdpUrl: parsed.BINANCE_P2P_CDP_URL,
  cdpSkipNavigation: parsed.BINANCE_P2P_CDP_SKIP_NAVIGATION === 'true',
  captureBodyMaxChars: Number(parsed.BINANCE_P2P_CAPTURE_BODY_MAX_CHARS || 20000),
  prepareAdvertiser: parsed.BINANCE_P2P_PREPARE_ADVERTISER.trim(),
  prepareRowIndex: Number(parsed.BINANCE_P2P_PREPARE_ROW_INDEX || 0),
  prepareAmount: parsed.BINANCE_P2P_PREPARE_AMOUNT.trim(),
  prepareAmountMode: parsed.BINANCE_P2P_PREPARE_AMOUNT_MODE,
  prepareOpenPanelWaitMs: Number(parsed.BINANCE_P2P_PREPARE_OPEN_PANEL_WAIT_MS || 2500),
  prepareMaxAds: Number(parsed.BINANCE_P2P_PREPARE_MAX_ADS || 10),
};
