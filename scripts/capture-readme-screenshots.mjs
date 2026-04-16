import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "assets", "images");
const TARGET_URL = process.env.README_SCREENSHOT_URL ?? "http://127.0.0.1:4173";

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForGameReady(page) {
  await page.waitForFunction(
    () => {
      const loadingBar = document.getElementById("loading-bar");
      const error = document.getElementById("error");
      if (!loadingBar || !error) return false;
      const loadingHidden =
        loadingBar.style.display === "none" ||
        getComputedStyle(loadingBar).display === "none";
      const hasError = error.classList.contains("show");
      return loadingHidden && !hasError;
    },
    { timeout: 45000 },
  );
}

async function capture(page, fileName, action) {
  if (action) await action();
  await page.screenshot({
    path: path.join(OUTPUT_DIR, fileName),
    fullPage: false,
  });
}

const browser = await puppeteer.launch({
  headless: true,
  defaultViewport: {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1.5,
  },
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

try {
  const page = await browser.newPage();
  const origin = new URL(TARGET_URL).origin;
  await browser.defaultBrowserContext().overridePermissions(origin, ["camera"]);
  await ensureDir(OUTPUT_DIR);

  await page.goto(TARGET_URL, { waitUntil: "networkidle2", timeout: 30000 });
  await waitForGameReady(page);

  await capture(page, "bang-zombie-menu.png");

  await capture(page, "bang-zombie-ranking.png", async () => {
    await page.click('[data-tab="ranking"]');
    await sleep(1200);
  });

  await capture(page, "bang-zombie-howto.png", async () => {
    await page.click('[data-tab="howto"]');
    await sleep(400);
  });

  await capture(page, "bang-zombie-gameplay.png", async () => {
    await page.click('[data-tab="play"]');
    await page.$eval("#nickname", (el) => {
      el.value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.type("#nickname", "TNT");
    await page.click("#start-btn");
    await page.waitForFunction(
      () => !document.getElementById("menu")?.classList.contains("show"),
      { timeout: 5000 },
    );
    await sleep(1200);
  });

  console.log(`Saved README screenshots to ${OUTPUT_DIR}`);
} finally {
  await browser.close();
}
