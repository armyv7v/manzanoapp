import path from 'node:path';
import playwright from 'playwright';
import { botConfig } from './config.js';
import { ensureDir, timestampSlug, writeJson, writeText } from './utils.js';

type Browser = playwright.Browser;
type BrowserContext = playwright.BrowserContext;
type Page = playwright.Page;
type Response = playwright.Response;
type ElementHandle<T extends Node = Node> = playwright.ElementHandle<T>;

type CapturedTrafficEntry = {
  at: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  postData: string | null;
  response?: {
    at: string;
    status: number;
    ok: boolean;
    url: string;
    headers: Record<string, string>;
    bodyText?: string | null;
  };
  failure?: {
    at: string;
    errorText: string;
  };
};

export type PrepareOrderOptions = {
  advertiser?: string;
  rowIndex?: number;
  amount?: string;
  amountMode?: 'fiat' | 'asset';
  openPanelWaitMs?: number;
  maxAdsToInspect?: number;
};

type VisibleAdCandidate = {
  index: number;
  advertiser: string;
  buttonText: string;
  textPreview: string;
};

type PreparedApiCapture = {
  name: string;
  matched: boolean;
  url: string | null;
  status: number | null;
  ok: boolean | null;
  headers: Record<string, string>;
  bodyText: string | null;
  json: unknown | null;
};

type PreparedInputState = {
  mode: 'fiat' | 'asset';
  value: string;
  placeholder: string | null;
};

type PreparedPanelSummary = {
  textPreview: string;
  buttons: Array<{ text: string; disabled: boolean }>;
  inputs: Array<{ value: string; placeholder: string | null; type: string }>;
};

export type PreparedOrderResult = {
  selectedAd: VisibleAdCandidate;
  requestedInput: {
    advertiser: string | null;
    rowIndex: number;
    amount: string | null;
    amountMode: 'fiat' | 'asset';
  };
  panel: PreparedPanelSummary;
  filledInput: PreparedInputState | null;
  apis: {
    checkMakeOrder: PreparedApiCapture;
    prePlaceOrderPageInfo: PreparedApiCapture;
  };
};

function tryParseJson(bodyText: string | null): unknown | null {
  if (!bodyText) return null;
  try {
    return JSON.parse(bodyText);
  } catch {
    return null;
  }
}

export class BinanceP2PClient {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private capturedTraffic: CapturedTrafficEntry[] = [];
  private pendingTraffic = new Map<playwright.Request, CapturedTrafficEntry>();
  private connectedOverCDP = false;

  private shouldCaptureRequest(url: string): boolean {
    return /\/bapi\//i.test(url) || /c2c|fiatOrder|orderMatch|chat|ads|adv/i.test(url);
  }

  private shouldCaptureResponseBody(url: string): boolean {
    return /checkMakeOrder|pre-place-order-page-info|placeOrder|place-order|createOrder|order-list|binance-chat\/common\/token|retrieveChatCredential|chat-group\/group-list|immed\/web\/register/i.test(url);
  }

  private async serializeResponseBody(response: Response): Promise<string | null> {
    const contentType = response.headers()['content-type'] || '';
    if (!/json|text|javascript/i.test(contentType)) {
      return null;
    }

    const bodyText = await response.text();
    if (!bodyText) return null;

    return bodyText.length > botConfig.captureBodyMaxChars
      ? `${bodyText.slice(0, botConfig.captureBodyMaxChars)}\n...[truncated ${bodyText.length - botConfig.captureBodyMaxChars} chars]`
      : bodyText;
  }

  private attachNetworkCapture(context: BrowserContext): void {
    context.on('request', async (request) => {
      const url = request.url();
      if (!this.shouldCaptureRequest(url)) return;

      let postData = request.postData();
      try {
        const json = request.postDataJSON();
        postData = JSON.stringify(json);
      } catch {}

      const entry: CapturedTrafficEntry = {
        at: new Date().toISOString(),
        method: request.method(),
        url,
        headers: request.headers(),
        postData: postData || null,
      };

      this.capturedTraffic.push(entry);
      this.pendingTraffic.set(request, entry);
    });

    context.on('response', async (response) => {
      const request = response.request();
      const entry = this.pendingTraffic.get(request);
      if (!entry) return;

      try {
        entry.response = {
          at: new Date().toISOString(),
          status: response.status(),
          ok: response.ok(),
          url: response.url(),
          headers: response.headers(),
          bodyText: this.shouldCaptureResponseBody(response.url())
            ? await this.serializeResponseBody(response)
            : null,
        };
      } catch {
        entry.response = {
          at: new Date().toISOString(),
          status: response.status(),
          ok: response.ok(),
          url: response.url(),
          headers: response.headers(),
          bodyText: null,
        };
      } finally {
        this.pendingTraffic.delete(request);
      }
    });

    context.on('requestfailed', (request) => {
      const entry = this.pendingTraffic.get(request);
      if (!entry) return;

      entry.failure = {
        at: new Date().toISOString(),
        errorText: request.failure()?.errorText || 'unknown',
      };
      this.pendingTraffic.delete(request);
    });
  }

  async open(usePersistentProfile = false): Promise<void> {
    await ensureDir(botConfig.artifactsDir);
    await ensureDir(path.dirname(botConfig.storageStatePath));
    await ensureDir(botConfig.persistentProfileDir);

    const contextOptions = {
      viewport: { width: 1440, height: 1024 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      locale: 'es-ES',
      timezoneId: 'America/Santiago',
      colorScheme: 'light' as const,
    };

    if (usePersistentProfile) {
      this.context = await playwright.chromium.launchPersistentContext(botConfig.persistentProfileDir, {
        ...contextOptions,
        executablePath: botConfig.browserExecutablePath,
        headless: botConfig.headless,
        slowMo: botConfig.headless ? 0 : botConfig.slowMoMs,
      });
      this.page = this.context.pages()[0] || await this.context.newPage();
    } else {
      this.browser = await playwright.chromium.launch({
        headless: botConfig.headless,
        slowMo: botConfig.headless ? 0 : botConfig.slowMoMs,
        executablePath: botConfig.browserExecutablePath,
      });
      this.context = await this.browser.newContext(contextOptions);
      this.page = await this.context.newPage();
    }

    this.context.setDefaultTimeout(botConfig.timeoutMs);
    if (botConfig.traceOn) {
      await this.context.tracing.start({ screenshots: true, snapshots: true });
    }
    this.attachNetworkCapture(this.context);
  }

  async openOverCDP(): Promise<void> {
    await ensureDir(botConfig.artifactsDir);
    this.browser = await playwright.chromium.connectOverCDP(botConfig.cdpUrl);
    this.connectedOverCDP = true;

    const contexts = this.browser.contexts();
    const existingPages = contexts.flatMap((context) =>
      context.pages().map((page) => ({ context, page })),
    );
    let preferredPage: { context: BrowserContext; page: Page } | null = null;
    let preferredScore = Number.NEGATIVE_INFINITY;

    for (const candidate of existingPages) {
      const url = candidate.page.url();
      if (!/binance\.com/i.test(url) || url.startsWith('chrome-extension://') || url === 'about:blank') {
        continue;
      }

      let score = 0;
      if (/c2c\.binance\.com/i.test(url)) score += 5;
      if (/accounts\.binance\.com/i.test(url)) score += 2;
      if (/my\/dashboard/i.test(url)) score += 3;

      try {
        const pageSignals = await candidate.page.evaluate(() => {
          const text = document.body?.innerText || '';
          return {
            hasDeposit: text.includes('Deposit'),
            hasLoginCta: text.includes('Log In') && text.includes('Sign Up'),
          };
        });

        if (pageSignals.hasDeposit) score += 4;
        if (pageSignals.hasLoginCta) score -= 4;
      } catch {}

      if (score > preferredScore) {
        preferredScore = score;
        preferredPage = candidate;
      }
    }

    if (preferredPage) {
      this.context = preferredPage.context;
      this.page = preferredPage.page;
    } else {
      this.context = contexts[0] || await this.browser.newContext();
      this.page = this.context.pages()[0] || await this.context.newPage();
    }
    this.context.setDefaultTimeout(botConfig.timeoutMs);
    this.attachNetworkCapture(this.context);
  }

  async close(): Promise<void> {
    if (this.connectedOverCDP) {
      await this.page?.close().catch(() => undefined);
      return;
    }

    if (this.context && botConfig.traceOn) {
      const tracePath = path.join(botConfig.artifactsDir, `binance-p2p-trace-${timestampSlug()}.zip`);
      await this.context.tracing.stop({ path: tracePath }).catch(() => undefined);
    }
    await this.context?.close();
    await this.browser?.close();
  }

  private getPage(): Page {
    if (!this.page) throw new Error('El navegador Binance P2P no esta inicializado.');
    return this.page;
  }

  private async dismissConsentBanner(): Promise<void> {
    const page = this.getPage();
    const patterns = [/Permitirlas todas/i, /Allow All/i, /Aceptar/i];

    for (const pattern of patterns) {
      const button = page.getByRole('button', { name: pattern }).first();
      const visible = await button.isVisible().catch(() => false);
      if (!visible) continue;

      await button.click().catch(() => undefined);
      await page.waitForTimeout(500);
      break;
    }
  }

  private async collapseOpenTradePanel(): Promise<void> {
    const page = this.getPage();
    const hideButton = page.getByRole('button', { name: /^(Ocultar|Hide)$/i }).first();
    if (await hideButton.isVisible().catch(() => false)) {
      await hideButton.click().catch(() => undefined);
      await page.waitForTimeout(700);
    }
  }

  private waitForApiResponse(urlPattern: RegExp): Promise<Response | null> {
    const page = this.getPage();
    return page.waitForResponse((response) => urlPattern.test(response.url()), {
      timeout: botConfig.timeoutMs,
    }).catch(() => null);
  }

  private async captureApiResponse(name: string, response: Response | null): Promise<PreparedApiCapture> {
    if (!response) {
      return {
        name,
        matched: false,
        url: null,
        status: null,
        ok: null,
        headers: {},
        bodyText: null,
        json: null,
      };
    }

    const bodyText = await this.serializeResponseBody(response).catch(() => null);
    return {
      name,
      matched: true,
      url: response.url(),
      status: response.status(),
      ok: response.ok(),
      headers: response.headers(),
      bodyText,
      json: tryParseJson(bodyText),
    };
  }

  async goToLogin(): Promise<void> {
    const page = this.getPage();
    await page.goto(botConfig.loginUrl, { waitUntil: 'domcontentloaded', timeout: botConfig.timeoutMs });
  }

  async goToP2P(): Promise<void> {
    const page = this.getPage();
    await page.goto(botConfig.targetUrl, { waitUntil: 'domcontentloaded', timeout: botConfig.timeoutMs });
  }

  async captureSnapshot(step: string): Promise<string> {
    const page = this.getPage();
    const slug = `${step}-${timestampSlug()}`;
    const screenshotPath = path.join(botConfig.artifactsDir, `${slug}.png`);
    const htmlPath = path.join(botConfig.artifactsDir, `${slug}.html`);
    const metaPath = path.join(botConfig.artifactsDir, `${slug}.meta.json`);

    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
    await writeText(htmlPath, await page.content()).catch(() => undefined);
    await writeJson(metaPath, {
      step,
      url: page.url(),
      title: await page.title().catch(() => ''),
      capturedAt: new Date().toISOString(),
    }).catch(() => undefined);

    return screenshotPath;
  }

  async inspectP2PPage(): Promise<Record<string, unknown>> {
    const page = this.getPage();
    const summary = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const links = Array.from(document.querySelectorAll('a')).slice(0, 20).map((a) => ({
        text: a.textContent?.trim() || '',
        href: a.getAttribute('href') || '',
      }));
      const buttons = Array.from(document.querySelectorAll('button')).slice(0, 30).map((button) => ({
        text: button.textContent?.trim() || '',
        disabled: (button instanceof HTMLButtonElement) ? button.disabled : false,
      }));
      return {
        url: location.href,
        title: document.title,
        bodyPreview: text.slice(0, 4000),
        links,
        buttons,
      };
    });

    return summary;
  }

  async listVisibleAds(maxAds = 10): Promise<VisibleAdCandidate[]> {
    const page = this.getPage();
    return page.evaluate((maxAdsToInspect) => {
      const candidates = Array.from(document.querySelectorAll('button'))
        .filter((button) => {
          const htmlElement = button as HTMLElement;
          const style = window.getComputedStyle(htmlElement);
          const rect = htmlElement.getBoundingClientRect();
          const isVisible = rect.width > 0
            && rect.height > 0
            && style.visibility !== 'hidden'
            && style.display !== 'none';
          return isVisible && /^(Vender USDT|Sell USDT)$/i.test(button.textContent?.trim() || '');
        })
        .slice(0, maxAdsToInspect)
        .map((button, index) => {
          let container: HTMLElement | null = button.parentElement;
          let depth = 0;
          while (container && depth < 7) {
            const textLength = (container.innerText || '').trim().length;
            if (textLength > 80) break;
            container = container.parentElement;
            depth += 1;
          }

          const rawText = container?.innerText || button.textContent || '';
          const normalizedText = rawText.replace(/\s+/g, ' ').trim();
          const advertiser = normalizedText.match(/[A-Za-z][A-Za-z0-9_-]{2,}/)?.[0] || '';

          return {
            index,
            advertiser,
            buttonText: button.textContent?.trim() || '',
            textPreview: normalizedText.slice(0, 400),
          };
        });

      return candidates;
    }, maxAds);
  }

  private async fillOrderAmount(amount: string, amountMode: 'fiat' | 'asset'): Promise<PreparedInputState> {
    const page = this.getPage();
    const inputHandle = await page.evaluateHandle((mode) => {
      const editableInputs = Array.from(document.querySelectorAll('input'))
        .filter((input) => {
          const htmlInput = input as HTMLInputElement;
          const style = window.getComputedStyle(htmlInput);
          const rect = htmlInput.getBoundingClientRect();
          const isVisible = rect.width > 0
            && rect.height > 0
            && style.visibility !== 'hidden'
            && style.display !== 'none';
          return isVisible
            && htmlInput.type !== 'hidden'
            && !htmlInput.disabled
            && !htmlInput.readOnly;
        }) as HTMLInputElement[];

      const labelPatterns = mode === 'fiat'
        ? [/Recibes/i, /You receive/i, /Monto/i, /Amount/i]
        : [/Vendes/i, /You sell/i, /USDT/i];

      for (const pattern of labelPatterns) {
        const labelledInput = editableInputs.find((input) => {
          let cursor: HTMLElement | null = input.parentElement;
          let depth = 0;
          while (cursor && depth < 6) {
            if (pattern.test(cursor.innerText || '')) return true;
            cursor = cursor.parentElement;
            depth += 1;
          }
          return false;
        });
        if (labelledInput) return labelledInput;
      }

      return editableInputs[0] || null;
    }, amountMode);

    const inputElement = inputHandle.asElement() as ElementHandle<HTMLInputElement> | null;
    if (!inputElement) {
      throw new Error('No se encontro un input editable en el panel de pre-order.');
    }

    await inputElement.scrollIntoViewIfNeeded().catch(() => undefined);
    await inputElement.click({ clickCount: 3 }).catch(() => undefined);
    await inputElement.fill(amount);
    await page.waitForTimeout(700);

    const state = await inputElement.evaluate((input, mode) => ({
      mode,
      value: input.value,
      placeholder: input.getAttribute('placeholder'),
    }), amountMode);

    await inputHandle.dispose();
    return state;
  }

  private async inspectPrepareOrderPanel(): Promise<PreparedPanelSummary> {
    const page = this.getPage();
    return page.evaluate(() => {
      const hideButton = Array.from(document.querySelectorAll('button'))
        .find((button) => {
          const htmlElement = button as HTMLElement;
          const style = window.getComputedStyle(htmlElement);
          const rect = htmlElement.getBoundingClientRect();
          const isVisible = rect.width > 0
            && rect.height > 0
            && style.visibility !== 'hidden'
            && style.display !== 'none';
          return isVisible && /^(Ocultar|Hide)$/i.test(button.textContent?.trim() || '');
        });
      let scope: HTMLElement = document.body;

      if (hideButton) {
        let cursor: HTMLElement | null = hideButton.parentElement;
        let depth = 0;
        while (cursor && depth < 6) {
          if ((cursor.innerText || '').trim().length > 120) {
            scope = cursor;
            break;
          }
          cursor = cursor.parentElement;
          depth += 1;
        }
      }

      const buttons = Array.from(scope.querySelectorAll('button'))
        .filter((button) => {
          const htmlElement = button as HTMLElement;
          const style = window.getComputedStyle(htmlElement);
          const rect = htmlElement.getBoundingClientRect();
          return rect.width > 0
            && rect.height > 0
            && style.visibility !== 'hidden'
            && style.display !== 'none';
        })
        .slice(0, 12)
        .map((button) => ({
          text: button.textContent?.trim() || '',
          disabled: button instanceof HTMLButtonElement ? button.disabled : false,
        }));

      const inputs = Array.from(scope.querySelectorAll('input'))
        .filter((input) => {
          const htmlInput = input as HTMLInputElement;
          const style = window.getComputedStyle(htmlInput);
          const rect = htmlInput.getBoundingClientRect();
          return rect.width > 0
            && rect.height > 0
            && style.visibility !== 'hidden'
            && style.display !== 'none'
            && htmlInput.type !== 'hidden';
        })
        .map((input) => {
          const htmlInput = input as HTMLInputElement;
          return {
            value: htmlInput.value,
            placeholder: htmlInput.getAttribute('placeholder'),
            type: htmlInput.type,
          };
        });

      return {
        textPreview: (scope.innerText || '').slice(0, 4000),
        buttons,
        inputs,
      };
    });
  }

  async prepareOrder(options: PrepareOrderOptions = {}): Promise<PreparedOrderResult> {
    const page = this.getPage();
    const amountMode = options.amountMode || 'fiat';
    const requestedAdvertiser = options.advertiser?.trim() || '';
    const requestedRowIndex = options.rowIndex ?? 0;
    const openPanelWaitMs = options.openPanelWaitMs ?? 2500;
    const maxAdsToInspect = options.maxAdsToInspect ?? 10;

    await this.dismissConsentBanner();
    await this.collapseOpenTradePanel();
    await page.waitForTimeout(500);

    const visibleAds = await this.listVisibleAds(maxAdsToInspect);
    if (!visibleAds.length) {
      throw new Error('No se encontraron anuncios visibles con boton de trade en Binance P2P.');
    }

    const selectedAd = requestedAdvertiser
      ? visibleAds.find((candidate) =>
        candidate.advertiser.toLowerCase().includes(requestedAdvertiser.toLowerCase())
        || candidate.textPreview.toLowerCase().includes(requestedAdvertiser.toLowerCase()))
      : visibleAds[requestedRowIndex];

    if (!selectedAd) {
      const availableAds = visibleAds.map((candidate) =>
        `${candidate.index}: ${candidate.advertiser || candidate.textPreview.slice(0, 80)}`).join(' | ');
      throw new Error(`No se encontro el anuncio solicitado. Disponibles: ${availableAds}`);
    }

    const tradeButtons = page.locator('button').filter({ hasText: /^(Vender USDT|Sell USDT)$/i });
    const buttonCount = await tradeButtons.count();
    if (selectedAd.index >= buttonCount) {
      throw new Error(`El indice de anuncio ${selectedAd.index} ya no coincide con los botones visibles (${buttonCount}).`);
    }

    const checkMakeOrderPromise = this.waitForApiResponse(/checkMakeOrder/i);
    const prePlaceOrderPromise = this.waitForApiResponse(/pre-place-order-page-info/i);

    const targetButton = tradeButtons.nth(selectedAd.index);
    await targetButton.scrollIntoViewIfNeeded();
    await targetButton.click();
    await page.waitForTimeout(openPanelWaitMs);

    const filledInput = options.amount
      ? await this.fillOrderAmount(options.amount, amountMode)
      : null;

    const [checkMakeOrder, prePlaceOrderPageInfo, panel] = await Promise.all([
      this.captureApiResponse('checkMakeOrder', await checkMakeOrderPromise),
      this.captureApiResponse('prePlaceOrderPageInfo', await prePlaceOrderPromise),
      this.inspectPrepareOrderPanel(),
    ]);

    return {
      selectedAd,
      requestedInput: {
        advertiser: requestedAdvertiser || null,
        rowIndex: selectedAd.index,
        amount: options.amount || null,
        amountMode,
      },
      panel,
      filledInput,
      apis: {
        checkMakeOrder,
        prePlaceOrderPageInfo,
      },
    };
  }

  async wait(ms: number): Promise<void> {
    const page = this.getPage();
    await page.waitForTimeout(ms);
  }

  getCapturedRequests(): CapturedTrafficEntry[] {
    return [...this.capturedTraffic];
  }

  getCriticalCapturedRequests(): CapturedTrafficEntry[] {
    return this.capturedTraffic.filter((entry) =>
      /checkMakeOrder|pre-place-order-page-info|placeOrder|place-order|createOrder|order-list|binance-chat\/common\/token|retrieveChatCredential|chat-group\/group-list|immed\/web\/register/i.test(entry.url),
    );
  }

  async saveStorageState(): Promise<void> {
    await this.context?.storageState({ path: botConfig.storageStatePath });
  }
}
