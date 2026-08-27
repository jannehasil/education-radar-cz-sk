import test from "node:test";
import assert from "node:assert/strict";
import { parseFeed, parseRss, updateIndex } from "../scripts/radar-lib.mjs";

const markers = ["GLOBAL", "EUROPE", "REGION", "SEDUO"]
  .map((name) => `<!-- AUTO:${name}:START -->\n<!-- AUTO:${name}:END -->`).join("\n");

test("RSS parser zachová datum, zdroj a titulek", () => {
  const xml = `<rss><channel><item><title>Novinka Coursera - Example</title><link>https://example.test/a</link><pubDate>Thu, 13 Aug 2026 08:00:00 GMT</pubDate><source>Example</source><description><![CDATA[<p>Popis zprávy</p>]]></description></item></channel></rss>`;
  const [item] = parseRss(xml, "global");
  assert.equal(item.title, "Novinka Coursera");
  assert.equal(item.source, "Example");
  assert.equal(item.summary, "Popis zprávy");
  assert.equal(item.group, "global");
});

test("vícejazyčný parser zachová přímý odkaz a jazyk", () => {
  const xml = `<feed><entry><title>Babbel startet eine neue Funktion</title><link href="https://example.de/babbel-neu"/><updated>2026-08-27T06:00:00Z</updated><summary>Neue KI-Funktion für Lernende.</summary></entry></feed>`;
  const [item] = parseFeed(xml, { group: "europe", language: "de", name: "Beispiel", official: true });
  assert.equal(item.url, "https://example.de/babbel-neu");
  assert.equal(item.language, "de");
  assert.equal(item.source, "Beispiel");
  assert.equal(item.official, true);
});

test("renderer aktualizuje datum, počet a sekce idempotentně", () => {
  const input = `<span class="dateBadge">staré</span><span class="updateText">staré</span><section class="summary"><div><strong>3</strong><span>úrovně trhu</span></div><div><strong>93</strong><span>sledovaných platforem</span></div><div><strong>0</strong><span>nových zpráv za 24 h</span></div></section><section class="dailyStatus"><span>staré</span></section><p class="mediaDate">staré</p>${markers}`;
  const article = { title: "Coursera představila novinku", source: "Coursera", url: "https://example.test", summary: "Ověřený popis nové produktové funkce.", publishedAt: "2026-08-13T08:00:00.000Z" };
  const result = { global: [{ ...article, originalLanguage: "en" }], europe: [], region: [], seduo: [], sourceSummary: { succeeded: 17, configured: 19, languages: ["cs", "de", "en"] } };
  const now = new Date("2026-08-13T10:15:00.000Z");
  const once = updateIndex(input, result, now);
  const twice = updateIndex(once, result, now);
  assert.equal(once, twice);
  assert.match(once, /Aktualizováno 13\. srpna 2026/);
  assert.match(once, /v 12:15 · Europe\/Prague/);
  assert.match(once, /<strong>1<\/strong><span>nových zpráv/);
  assert.match(once, /Coursera představila novinku/);
  assert.match(once, /Původní zdroj: Coursera/);
  assert.match(once, /17 z 19 přímých zdrojů/);
});

test("renderer bezpečně obnoví ověřenou závěrečnou cenu", () => {
  const card = `<article class="stockCard cour" data-ticker="COUR"><time datetime="2026-08-11">závěr 11. 8.</time><div class="stockPrice"><strong>5,69</strong><span>USD</span><em class="stockDown">−1,22 %</em></div></article>`;
  const input = `<span class="dateBadge">staré</span><span class="updateText">staré</span><section class="summary"><div><strong>3</strong><span>úrovně trhu</span></div><div><strong>93</strong><span>sledovaných platforem</span></div><div><strong>0</strong><span>nových zpráv za 24 h</span></div></section><section class="dailyStatus"><span>staré</span></section><p class="mediaDate">staré</p>${markers}${card}`;
  const result = { global: [], europe: [], region: [], seduo: [], finance: [{ ticker: "COUR", date: "2026-08-12", price: 5.58, changePct: 0.27, currency: "USD" }] };
  const output = updateIndex(input, result, new Date("2026-08-13T10:15:00.000Z"));
  assert.match(output, /datetime="2026-08-12">závěr 12\. 8\./);
  assert.match(output, /<strong>5,58<\/strong><span>USD<\/span><em class="stockUp">\+0,27 %<\/em>/);
});
