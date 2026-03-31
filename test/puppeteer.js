#!/usr/bin/env node

import puppeteer from 'puppeteer';
import path from 'path';
import {fileURLToPath} from 'url';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = 3000;

app.use(express.static(path.dirname(__dirname)));
const server = app.listen(port, () => {
  console.log(`Example app listening on port ${port}!`);
  test(port).catch(err => {
    console.error(err);
    process.exit(1);
  });
});

function makePromiseInfo() {
  const info = {};
  const promise = new Promise((resolve, reject) => {
    Object.assign(info, {resolve, reject});
  });
  info.promise = promise;
  return info;
}


async function test(port) {
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 4 * 60 * 1000, // 4 mins
    args: [
      '--user-agent=puppeteer',
      '--no-sandbox',
    ],
  });
  const page = await browser.newPage();

  page.on('console', async e => {
    const args = await Promise.all(e.args().map(a => a.jsonValue().catch(() => a.toString())));
    console.log(...args);
  });

  // Prevent unhandled page errors (uncaught exceptions/rejections in the browser)
  // from propagating to Node.js as unhandled rejections in Puppeteer 21+.
  page.on('pageerror', err => {
    console.error('Page error:', err.message);
    // If a page error occurs while waiting for tests, reject the waiting promise so Puppeteer exits.
    if (waitingPromiseInfo && waitingPromiseInfo.reject) {
      waitingPromiseInfo.reject(err);
    }
  });

  let totalFailures = 0;
  let waitingPromiseInfo;

  // Get the "viewport" of the page, as reported by the page.
  page.on('domcontentloaded', async() => {
    try {
      const failures = await page.evaluate(() => {
        return window.testsPromiseInfo.promise;
      });

      totalFailures += failures;

      waitingPromiseInfo.resolve();
    } catch (e) {
      waitingPromiseInfo.reject(e);
    }
  });

  const urls = [
    `http://localhost:${port}/test/index.html?reporter=spec`,
    `http://localhost:${port}/test/ts/ts-test.html?reporter=spec`,
  ];

  for (const url of urls) {
    waitingPromiseInfo = makePromiseInfo();

    // per-page test timeout (ms)
    const perTestTimeout = 60 * 1000; // 60s
    const timer = globalThis.setTimeout(() => {
      waitingPromiseInfo.reject(new Error(`Test timeout after ${perTestTimeout}ms for ${url}`));
    }, perTestTimeout);

    // track failed requests (e.g. failed module loads)
    const onRequestFailed = req => {
      const msg = `Request failed: ${req.url()} (${req.failure() && req.failure().errorText})`;
      console.error(msg);
      waitingPromiseInfo.reject(new Error(msg));
    };

    page.on('requestfailed', onRequestFailed);

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: perTestTimeout });
      await waitingPromiseInfo.promise;
    } finally {
      globalThis.clearTimeout(timer);
      page.off('requestfailed', onRequestFailed);
    }
  }

  await browser.close();
  server.close();

  process.exit(totalFailures ? 1 : 0);
}
