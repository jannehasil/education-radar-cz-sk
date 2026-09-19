import test from "node:test";
import assert from "node:assert/strict";
import { candidateScore, matchesWatchlist, parseFeed, parseRss, renderDailyCards, updateIndex } from "../scripts/radar-lib.mjs";

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
  assert.match(once, /Dnes zachycen 1 nový ověřený signál/);
  assert.match(once, /<strong>1<\/strong><span>nových zpráv/);
  assert.match(once, /nových zpráv za 24 h/);
  assert.match(once, /Coursera představila novinku/);
  assert.match(once, /Původní zdroj: Coursera/);
  assert.match(once, /17 z 19 přímých zdrojů/);
});

test("renderer bez novější zprávy zachová předchozí ověřenou kartu", () => {
  const input = `<span class="dateBadge">staré</span><span class="updateText">staré</span><section class="summary"><div><strong>3</strong><span>úrovně trhu</span></div><div><strong>93</strong><span>sledovaných platforem</span></div><div><strong>1</strong><span>nových zpráv za 24 h</span></div></section><section class="dailyStatus"><span>staré</span></section><p class="mediaDate">staré</p><!-- AUTO:GLOBAL:START --><article><time datetime="2026-08-31">31. 8.</time><h3>Ověřený signál</h3></article><!-- AUTO:GLOBAL:END --><!-- AUTO:EUROPE:START -->\n<!-- AUTO:EUROPE:END --><!-- AUTO:REGION:START -->\n<!-- AUTO:REGION:END --><!-- AUTO:SEDUO:START -->\n<!-- AUTO:SEDUO:END -->`;
  const result = { global: [], europe: [], region: [], seduo: [], sourceSummary: { succeeded: 25, configured: 25, languages: ["cs", "en"] } };
  const output = updateIndex(input, result, new Date("2026-09-01T10:15:00.000Z"));
  assert.match(output, /Ověřený signál/);
  assert.match(output, /Dnes bez nového ověřeného tržního signálu/);
  assert.match(output, /<strong>0<\/strong><span>nových zpráv za 24 h/);
});

test("renderer kumuluje posledních šest automatických karet", () => {
  const existing = Array.from({ length: 6 }, (_, index) => ({
    title: `Starší signál ${index + 1}`, source: "Example", url: `https://example.test/old-${index + 1}`,
    summary: "Starší ověřená produktová novinka s dostatečně dlouhým popisem.", publishedAt: `2026-09-0${index + 1}T08:00:00.000Z`, originalLanguage: "cs",
  }));
  const input = `<span class="dateBadge">staré</span><span class="updateText">staré</span><section class="summary"><div><strong>3</strong><span>úrovně trhu</span></div><div><strong>93</strong><span>sledovaných platforem</span></div><div><strong>0</strong><span>nových zpráv za 24 h</span></div></section><section class="dailyStatus"><span>staré</span></section><p class="mediaDate">staré</p><!-- AUTO:GLOBAL:START -->${renderDailyCards(existing, "global")}<!-- AUTO:GLOBAL:END --><!-- AUTO:EUROPE:START --><!-- AUTO:EUROPE:END --><!-- AUTO:REGION:START --><!-- AUTO:REGION:END --><!-- AUTO:SEDUO:START --><!-- AUTO:SEDUO:END -->`;
  const incoming = { title: "Nový signál", source: "Example", url: "https://example.test/new", summary: "Nová ověřená produktová novinka s dostatečně dlouhým popisem.", publishedAt: "2026-09-07T08:00:00.000Z", originalLanguage: "cs" };
  const output = updateIndex(input, { global: [incoming], europe: [], region: [], seduo: [] }, new Date("2026-09-07T10:00:00.000Z"));
  assert.match(output, /Nový signál/);
  assert.match(output, /Starší signál 2/);
  assert.doesNotMatch(output, /Starší signál 1/);
  assert.equal((output.match(/class="signalCard blue"/g) || []).length, 6);
});

test("renderer u stejného odkazu zachová již kurátorovaný text", () => {
  const curated = [{
    title: "Kurátorovaný název", source: "Example", url: "https://example.test/same",
    summary: "Kurátorovaný český souhrn s dostatečnou délkou pro vykreslení.", publishedAt: "2026-09-09T08:00:00.000Z", originalLanguage: "cs",
  }];
  const input = `<span class="dateBadge">staré</span><span class="updateText">staré</span><section class="summary"><div><strong>3</strong><span>úrovně trhu</span></div><div><strong>93</strong><span>sledovaných platforem</span></div><div><strong>1</strong><span>nových zpráv za 24 h</span></div></section><section class="dailyStatus"><span>staré</span></section><p class="mediaDate">staré</p><!-- AUTO:GLOBAL:START -->${renderDailyCards(curated, "global")}<!-- AUTO:GLOBAL:END --><!-- AUTO:EUROPE:START --><!-- AUTO:EUROPE:END --><!-- AUTO:REGION:START --><!-- AUTO:REGION:END --><!-- AUTO:SEDUO:START --><!-- AUTO:SEDUO:END -->`;
  const incoming = { title: "Strojový překlad", source: "Example", url: "https://example.test/same", summary: "Automaticky přeložený souhrn s dostatečnou délkou pro vykreslení.", publishedAt: "2026-09-09T09:00:00.000Z", originalLanguage: "en" };
  const output = updateIndex(input, { global: [incoming], europe: [], region: [], seduo: [] }, new Date("2026-09-10T10:00:00.000Z"));
  assert.match(output, /Kurátorovaný název/);
  assert.doesNotMatch(output, /Strojový překlad/);
  assert.equal((output.match(/https:\/\/example\.test\/same/g) || []).length, 1);
});

test("renderer bezpečně obnoví ověřenou závěrečnou cenu", () => {
  const card = `<article class="stockCard cour" data-ticker="COUR"><time datetime="2026-08-11">závěr 11. 8.</time><div class="stockPrice"><strong>5,69</strong><span>USD</span><em class="stockDown">−1,22 %</em></div></article>`;
  const input = `<span class="dateBadge">staré</span><span class="updateText">staré</span><section class="summary"><div><strong>3</strong><span>úrovně trhu</span></div><div><strong>93</strong><span>sledovaných platforem</span></div><div><strong>0</strong><span>nových zpráv za 24 h</span></div></section><section class="dailyStatus"><span>staré</span></section><p class="mediaDate">staré</p>${markers}${card}`;
  const result = { global: [], europe: [], region: [], seduo: [], finance: [{ ticker: "COUR", date: "2026-08-12", price: 5.58, changePct: 0.27, currency: "USD" }] };
  const output = updateIndex(input, result, new Date("2026-08-13T10:15:00.000Z"));
  assert.match(output, /datetime="2026-08-12">závěr 12\. 8\./);
  assert.match(output, /<strong>5,58<\/strong><span>USD<\/span><em class="stockUp">\+0,27 %<\/em>/);
});

test("výběr odmítne marketingové články typu discover how", () => {
  const item = {
    title: "Discover how workforce leaders can learn from teachers",
    summary: "A general advice article about engagement strategies in people management.",
    official: true,
  };
  assert.ok(candidateScore(item) < 2);
});

test("výběr odmítne pozvánku k poslechu rozhovoru", () => {
  const item = {
    title: "Listen to insights into the evolution of Kahoot! and the future of learning",
    summary: "Explore how Kahoot! has grown from a classroom quiz tool to a learning and engagement platform for all ages.",
    official: true,
  };
  assert.ok(candidateScore(item) < 2);
});

test("výběr odmítne cestovní slovníčky z produktových blogů", () => {
  const item = {
    title: "30+ Common Spanish Phrases for Your Trip to Mexico",
    summary: "A little Spanish goes a long way. Use these phrases on your trip.",
    official: true,
  };
  assert.ok(candidateScore(item) < 2);
});

test("výběr odmítne technický rozbor dříve spuštěné funkce", () => {
  const item = {
    title: "How we created Chess Game Review: What's a key moment?",
    summary: "A behind-the-scenes engineering article about a feature launched last month.",
    official: true,
  };
  assert.ok(candidateScore(item) < 2);
});

test("výběr odmítne jazykové seznamy a obecné rady pro školení", () => {
  assert.ok(candidateScore({
    title: "80+ Most Common Adjectives in English",
    summary: "Are you describing things in English? These are the adjectives you will use.",
    official: true,
  }) < 2);
  assert.ok(candidateScore({
    title: "7 signs your training can't keep up with your business",
    summary: "A general advice article about learning and development.",
    official: true,
  }) < 2);
});

test("oficiální blog bez nové události sám o sobě nepřekročí práh", () => {
  assert.ok(candidateScore({
    title: "The hidden rules of English adjective order",
    summary: "Want to stack adjectives in English? There is a set of rules and a cheat sheet.",
    official: true,
  }) < 2);
});

test("výběr zachytí jmenování nového vedoucího pracovníka", () => {
  assert.ok(candidateScore({
    title: "Welcoming Karthik Chakkarapani as Coursera's new Chief Information Officer",
    summary: "The new CIO will lead IT, information systems, and internal AI enablement.",
    official: true,
  }) >= 2);
});

test("watchlist nebere název platformy jako část jiného slova", () => {
  const item = {
    title: "Kapital raises new financing from Fasanara Capital",
    summary: "The financial institution will expand across several markets.",
  };
  assert.equal(matchesWatchlist(item, ["Sana"]), false);
  assert.equal(matchesWatchlist({ ...item, title: "Sana launches a learning product" }, ["Sana"]), true);
});

test("watchlist nezamění platformu Alison za jméno osoby", () => {
  const item = {
    title: "Dr. Alison Armour becomes Chief Medical Officer",
    summary: "A clinical-stage drug company advances its therapy platform.",
  };
  assert.equal(matchesWatchlist(item, ["Alison"]), false);
  assert.equal(matchesWatchlist({ ...item, title: "Alison launches a new learning platform" }, ["Alison"]), true);
});
