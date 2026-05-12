import fs from 'node:fs';
import path from 'node:path';
import { BinanceP2PClient } from './client.js';
import { botConfig } from './config.js';
import { writeJson } from './utils.js';

async function runPrepareOrder(client: BinanceP2PClient, useCdp: boolean): Promise<void> {
  if (useCdp) {
    await client.openOverCDP();
    if (!botConfig.cdpSkipNavigation) {
      await client.goToP2P();
    }
  } else {
    await client.open(true);
    await client.goToP2P();
  }

  await client.wait(2500);

  const result = await client.prepareOrder({
    advertiser: botConfig.prepareAdvertiser || undefined,
    rowIndex: botConfig.prepareRowIndex,
    amount: botConfig.prepareAmount || undefined,
    amountMode: botConfig.prepareAmountMode,
    openPanelWaitMs: botConfig.prepareOpenPanelWaitMs,
    maxAdsToInspect: botConfig.prepareMaxAds,
  });

  await client.captureSnapshot(useCdp ? 'prepare-order-cdp' : 'prepare-order');
  await client.saveStorageState().catch(() => undefined);

  const suffix = useCdp ? '-cdp' : '';
  const outPath = path.join(botConfig.artifactsDir, `binance-p2p-prepare-order${suffix}.json`);
  const requestsPath = path.join(botConfig.artifactsDir, `binance-p2p-network-prepare-order${suffix}.json`);
  const criticalRequestsPath = path.join(botConfig.artifactsDir, `binance-p2p-critical-network-prepare-order${suffix}.json`);

  await writeJson(outPath, result);
  await writeJson(requestsPath, client.getCapturedRequests());
  await writeJson(criticalRequestsPath, client.getCriticalCapturedRequests());

  console.log(JSON.stringify({
    ok: true,
    outPath,
    requestsPath,
    criticalRequestsPath,
    selectedAd: result.selectedAd,
    requestedInput: result.requestedInput,
    filledInput: result.filledInput,
    apiMatches: {
      checkMakeOrder: result.apis.checkMakeOrder.matched,
      prePlaceOrderPageInfo: result.apis.prePlaceOrderPageInfo.matched,
    },
  }, null, 2));

  await client.close();
}

async function main(): Promise<void> {
  const command = process.argv[2] || 'inspect';
  const client = new BinanceP2PClient();

  try {
    if (command === 'attach-cdp') {
      await client.openOverCDP();
      await client.goToP2P();
      await client.captureSnapshot('attach-cdp-p2p');
      console.log('Conectado a un Chrome real por CDP y navegado a P2P.');
      await client.close();
      return;
    }

    if (command === 'attach') {
      await client.open(true);
      await client.goToP2P();
      await client.captureSnapshot('attach-p2p');
      console.log('Perfil persistente abierto en P2P. Usa esta sesion para login manual y luego cierra el navegador.');
      return;
    }

    if (command === 'login') {
      await client.open(true);
      await client.goToLogin();
      await client.captureSnapshot('login-screen');
      console.log('Pantalla de login abierta. Realiza el login manualmente en el navegador persistente y luego cierra manualmente.');
      return;
    }

    if (command === 'inspect-p2p' || command === 'inspect') {
      await client.open(true);
      await client.goToP2P();
      await client.wait(10000);
      const summary = await client.inspectP2PPage();
      await client.captureSnapshot('inspect-p2p');
      await client.saveStorageState();

      const outPath = path.join(botConfig.artifactsDir, 'binance-p2p-inspect.json');
      const requestsPath = path.join(botConfig.artifactsDir, 'binance-p2p-network.json');
      await writeJson(outPath, summary);
      await writeJson(requestsPath, client.getCapturedRequests());
      console.log(JSON.stringify({ ok: true, outPath, requestsPath, summary, capturedRequests: client.getCapturedRequests().length }, null, 2));
      await client.close();
      return;
    }

    if (command === 'inspect-cdp') {
      await client.openOverCDP();
      if (!botConfig.cdpSkipNavigation) {
        await client.goToP2P();
      }
      await client.wait(3000);
      const summary = await client.inspectP2PPage();
      await client.captureSnapshot('inspect-cdp-p2p');

      const outPath = path.join(botConfig.artifactsDir, 'binance-p2p-inspect-cdp.json');
      const requestsPath = path.join(botConfig.artifactsDir, 'binance-p2p-network-cdp.json');
      const criticalRequestsPath = path.join(botConfig.artifactsDir, 'binance-p2p-critical-network-cdp.json');
      await writeJson(outPath, summary);
      await writeJson(requestsPath, client.getCapturedRequests());
      await writeJson(criticalRequestsPath, client.getCriticalCapturedRequests());
      console.log(JSON.stringify({ ok: true, outPath, requestsPath, criticalRequestsPath, summary, capturedRequests: client.getCapturedRequests().length, criticalCapturedRequests: client.getCriticalCapturedRequests().length }, null, 2));
      await client.close();
      return;
    }

    if (command === 'prepare-order') {
      await runPrepareOrder(client, false);
      return;
    }

    if (command === 'prepare-order-cdp') {
      await runPrepareOrder(client, true);
      return;
    }

    if (command === 'watch-cdp') {
      await client.openOverCDP();
      if (!botConfig.cdpSkipNavigation) {
        await client.goToP2P();
        await client.wait(1500);
      }
      const watchMs = Number(process.env.BINANCE_P2P_WATCH_MS || 600000);
      const stopFilePath = path.join(botConfig.artifactsDir, 'stop-cdp-watch');

      if (fs.existsSync(stopFilePath)) {
        fs.rmSync(stopFilePath, { force: true });
      }

      console.log(`Captura CDP iniciada. Esperando hasta ${watchMs}ms o hasta detectar ${stopFilePath}`);

      const startedAt = Date.now();
      while (Date.now() - startedAt < watchMs) {
        if (fs.existsSync(stopFilePath)) {
          console.log('Archivo de parada detectado. Cerrando captura CDP.');
          break;
        }
        await client.wait(1000);
      }

      const summary = await client.inspectP2PPage();
      await client.captureSnapshot('watch-cdp-p2p');

      const outPath = path.join(botConfig.artifactsDir, 'binance-p2p-watch-cdp.json');
      const requestsPath = path.join(botConfig.artifactsDir, 'binance-p2p-network-watch-cdp.json');
      const criticalRequestsPath = path.join(botConfig.artifactsDir, 'binance-p2p-critical-network-watch-cdp.json');
      await writeJson(outPath, summary);
      await writeJson(requestsPath, client.getCapturedRequests());
      await writeJson(criticalRequestsPath, client.getCriticalCapturedRequests());
      console.log(JSON.stringify({ ok: true, outPath, requestsPath, criticalRequestsPath, summary, capturedRequests: client.getCapturedRequests().length, criticalCapturedRequests: client.getCriticalCapturedRequests().length }, null, 2));
      await client.close();
      return;
    }

    throw new Error(`Comando no soportado: ${command}`);
  } catch (error) {
    console.error('Binance P2P bot fallo:', error instanceof Error ? error.message : error);
    await client.captureSnapshot('failure').catch(() => undefined);
    await client.close().catch(() => undefined);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Binance P2P bot finalizo con error:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
