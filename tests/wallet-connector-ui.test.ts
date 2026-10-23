import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../apps/web/verify-wallet.html", import.meta.url)), "utf8");

test("wallet connection has exactly one visible entry button", () => {
  assert.match(html, /<button id="connect"[^>]*>Connect Wallet/);
  assert.doesNotMatch(html, /id="choose-wallet"|id="refresh"|Connect automatically|Rescan extensions/);
  assert.match(html, /<div id="wallet-picker" hidden>/);
});

test("one detected wallet connects directly, multiple wallets require selection", () => {
  assert.match(html, /if\(wallets\.size===1\)/);
  assert.match(html, /return connectSelected\(\)/);
  assert.match(html, /"Choose one of your detected Sui wallets to connect\."/);
  assert.match(html, /wallets\.get\(\$\("wallet"\)\.value\)/);
});

test("wallet connection never claims payment authorization or stores a memory", () => {
  assert.doesNotMatch(html, /sui:signAndExecuteTransaction|sui:signTransaction|\/v1\/recipient-memory"\s*,\s*\{method:"POST"/);
  assert.match(html, /No Walrus memory was written/);
});
