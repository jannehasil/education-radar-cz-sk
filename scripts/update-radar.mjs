import fs from "node:fs/promises";
import { dedupe, isRecent, matchesWatchlist, parseFeed, updateIndex } from "./radar-lib.mjs";

const AUTOMATION_VERSION = "2.0.0";
const MONITOR_HOURS = 48;

const WATCHLISTS = {
  global: ["Coursera", "Udemy", "edX", "LinkedIn Learning", "Skillshare", "MasterClass", "Pluralsight", "DataCamp", "Codecademy", "Udacity", "Khan Academy", "Brilliant", "Maven", "Reforge", "DeepLearning.AI", "Duolingo"],
  europe: ["GoStudent", "Babbel", "Kahoot", "360Learning", "Multiverse", "OpenClassrooms", "Preply", "LearnWorlds", "TalentLMS", "Lingoda", "StudySmarter", "CoachHub", "simpleclub", "Knowunity", "sofatutor", "Seneca Learning", "CENTURY Tech", "Atom Learning", "Sparx Learning", "Twinkl", "FutureLearn", "Perlego", "FourthRev", "MyTutor", "LearnUpon", "Alison", "StuDocu", "Lepaya", "FeedbackFruits", "GoodHabitz", "Studytube", "Wooclap", "BookWidgets", "Edflex", "Didask", "Genially", "ODILO", "Innovamat", "Smartick", "Ironhack", "Domestika", "WeSchool", "Docsity", "EPICODE", "Kognity", "Sana", "Eduten", "Claned", "99math", "Turing College"],
  region: ["Seduo", "Scio", "Umíme to", "Edjet", "Vividbooks", "Corinth", "Digiskills", "ENGETO", "ITnetwork", "Mooveez", "OrgPad", "Edyta", "Edugym", "GPT-EDU", "Edueeno", "Playful", "EduPage", "Skillmea", "SmartBooks", "KUBO", "Kozmix", "Žmudri", "Nexineo", "Fenomény sveta", "BezKriedy", "Wibo", "Viki", "Databanka"],
};

const SOURCE_FEEDS = [
  { name: "Coursera Blog", url: "https://blog.coursera.org/feed/", language: "en", group: "global", owned: true, official: true },
  { name: "Duolingo Blog", url: "https://blog.duolingo.com/rss/", language: "en", group: "global", owned: true, official: true },
  { name: "Kahoot! News", url: "https://kahoot.com/kahoot-news/feed/", language: "en", group: "europe", owned: true, official: true },
  { name: "Preply Blog", url: "https://preply.com/en/blog/feed/", language: "en", group: "europe", owned: true, official: true },
  { name: "FutureLearn Blog", url: "https://www.futurelearn.com/info/blog/feed", language: "en", group: "europe", owned: true, official: true },
  { name: "TalentLMS Blog", url: "https://www.talentlms.com/blog/feed/", language: "en", group: "europe", owned: true, official: true },
  { name: "Lingoda Blog", url: "https://www.lingoda.com/blog/en/feed/", language: "en", group: "europe", owned: true, official: true },
  { name: "EdSurge", url: "https://www.edsurge.com/articles_rss", language: "en", groups: ["global", "europe", "region"] },
  { name: "Class Central Report", url: "https://www.classcentral.com/report/feed/", language: "en", groups: ["global", "europe"] },
  { name: "Learning News", url: "https://learningnews.com/feed/", language: "en", groups: ["global", "europe"] },
  { name: "FE News", url: "https://www.fenews.co.uk/feed/", language: "en", groups: ["global", "europe"] },
  { name: "eLearning Industry", url: "https://elearningindustry.com/feed", language: "en", groups: ["global", "europe"] },
  { name: "The PIE News", url: "https://thepienews.com/feed/", language: "en", groups: ["global", "europe"] },
  { name: "PR Newswire Education", url: "https://www.prnewswire.com/rss/education-latest-news/education-latest-news-list.rss", language: "en", groups: ["global", "europe", "region"] },
  { name: "Sifted", url: "https://sifted.eu/feed", language: "en", groups: ["europe"] },
  { name: "EU-Startups", url: "https://www.eu-startups.com/feed/", language: "en", groups: ["europe"] },
  { name: "FRENCHWEB", url: "https://www.frenchweb.fr/feed", language: "fr", groups: ["europe"] },
  { name: "Maddyness", url: "https://www.maddyness.com/feed/", language: "fr", groups: ["europe"] },
  { name: "t3n", url: "https://t3n.de/rss.xml", language: "de", groups: ["europe"] },
  { name: "Gründerszene", url: "https://www.businessinsider.de/gruenderszene/feed/", language: "de", groups: ["europe"] },
  { name: "Genbeta", url: "https://www.genbeta.com/index.xml", language: "es", groups: ["europe"] },
  { name: "Lupa.cz", url: "https://www.lupa.cz/rss/clanky/", language: "cs", groups: ["region"] },
  { name: "CzechCrunch", url: "https://cc.cz/feed/", language: "cs", groups: ["region"] },
  { name: "Startitup", url: "https://www.startitup.sk/feed/", language: "sk", groups: ["region"] },
  { name: "TOUCHIT", url: "https://touchit.sk/feed/", language: "sk", groups: ["region"] },
];

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "EducationRadarBot/2.0 (+https://jannehasil.github.io/education-radar-cz-sk/)" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

const FINANCE = [
  { ticker: "COUR", exchange: "NYSE" },
  { ticker: "DUOL", exchange: "NASDAQ" },
  { ticker: "DTOL", exchange: "TSE" },
];

async function fetchQuote({ ticker, exchange }, now) {
  const url = `https://www.google.com/finance/quote/${ticker}:${exchange}?hl=en`;
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125 Safari/537.36" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Finance ${ticker}: HTTP ${response.status}`);
  const html = await response.text();
  const start = html.indexOf('<div class="jZZ2de">');
  if (start < 0) throw new Error(`Finance ${ticker}: cena nebyla nalezena`);
  const snippet = html.slice(start, start + 4000);
  const headerMatch = snippet.match(/<div class="jZZ2de">([\s\S]*?)<\/div>/);
  const header = (headerMatch?.[1] || "").replace(/&nbsp;/g, " ").replace(/&middot;/g, "·").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const priceMatch = snippet.match(/<div class="fpRuab">[\s\S]*?<span>([^<]+)<\/span>/);
  const textSnippet = snippet.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const changeMatch = textSnippet.match(/([+−-]?\d+(?:\.\d+)?)%/);
  const dateMatch = header.match(/(?:Closed|Previous close):?\s*([A-Z][a-z]{2})\s+(\d{1,2})/);
  const currencyMatch = header.match(/·\s*([A-Z]{3})/);
  if (!priceMatch || !changeMatch || !dateMatch || !currencyMatch) throw new Error(`Finance ${ticker}: neúplná data`);
  const month = new Date(`${dateMatch[1]} 1, 2000`).getMonth();
  let year = now.getUTCFullYear();
  if (month > now.getUTCMonth() + 6) year -= 1;
  const date = new Date(Date.UTC(year, month, Number(dateMatch[2]))).toISOString().slice(0, 10);
  const price = Number(priceMatch[1].replace(/[^0-9.-]/g, ""));
  const changePct = Number(changeMatch[1].replace("−", "-").replace(/[^0-9+.-]/g, ""));
  if (!Number.isFinite(price) || !Number.isFinite(changePct)) throw new Error(`Finance ${ticker}: neplatné číslo`);
  return { ticker, date, price, changePct, currency: currencyMatch[1], source: url };
}

async function collectCandidates(now) {
  const errors = [];
  const grouped = { global: [], europe: [], region: [] };
  const seduoPool = [];
  const sourceRuns = await Promise.all(SOURCE_FEEDS.map(async (feed) => {
    try {
      const parsed = parseFeed(await fetchText(feed.url), {
        group: feed.group, language: feed.language, name: feed.name, official: feed.official,
      });
      for (const item of parsed) {
        if (isRecent(item, 31 * 24, now) && matchesWatchlist(item, ["Seduo"]) && !/seduo\.(cz|sk)/i.test(item.url)) {
          seduoPool.push({ ...item, group: "seduo", sourceUrl: feed.url });
        }
        if (!isRecent(item, MONITOR_HOURS, now)) continue;
        const group = feed.owned
          ? feed.group
          : feed.groups.find((candidateGroup) => matchesWatchlist(item, WATCHLISTS[candidateGroup]));
        if (!group) continue;
        const candidate = { ...item, group, sourceUrl: feed.url };
        grouped[group].push(candidate);
      }
      console.log(`[zdroj] ${feed.name}: ${parsed.length} položek`);
      return { name: feed.name, language: feed.language, ok: true, parsed: parsed.length };
    } catch (error) {
      errors.push(`Zdroj ${feed.name}: ${error.message}`);
      console.warn(`[zdroj] ${feed.name}: ${error.message}`);
      return { name: feed.name, language: feed.language, ok: false, parsed: 0 };
    }
  }));
  for (const group of Object.keys(grouped)) {
    grouped[group] = dedupe(grouped[group])
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }
  const seduo = dedupe(seduoPool)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const successfulSources = sourceRuns.filter((source) => source.ok);
  const sourceSummary = {
    configured: SOURCE_FEEDS.length,
    succeeded: successfulSources.length,
    failed: sourceRuns.length - successfulSources.length,
    languages: [...new Set(successfulSources.map((source) => source.language))].sort(),
    parsedItems: sourceRuns.reduce((sum, source) => sum + source.parsed, 0),
  };
  return { grouped, seduo, errors, sourceRuns, sourceSummary };
}

const SIGNIFICANT = /(launch|announc|acqui|merg|funding|raises?|invest|revenue|earnings|results?|partnership|expand|appoint|layoff|restructur|product|feature|platform|lance|annonce|acqui|financement|partenariat|résultat|umsatz|übern|finanzier|partnerschaft|startet|führt.+ein|lanza|anuncia|adquier|financiación|alianza|resultados|spoušt|uvád|akviz|investic|partner|tržb|výsledk|nová funk|nova funk|prepúšť|restrukt)/i;
const NOISE = /(guide|how to|course|certification|certificate|discount|sale|tips|webinar|podcast|best\s+\w|top\s+\d|explore why|why .+ matters|průvodce|návod|kurz|sleva|webinář|nejlepších|guía|curso|descuento|mejores|ratgeber|kurs|rabatt|besten)/i;

export function candidateScore(item) {
  const text = `${item.title} ${item.summary}`;
  const significant = SIGNIFICANT.test(text);
  let score = item.official ? 2 : 1;
  if (significant) score += 4;
  if (NOISE.test(item.title)) score -= 6;
  if (significant && item.summary.length >= 80) score += 1;
  return score;
}

function selectSignificant(grouped) {
  return Object.fromEntries(Object.entries(grouped).map(([group, items]) => [group,
    items.map((item) => ({ ...item, editorialScore: candidateScore(item) }))
      .filter((item) => item.editorialScore >= 5)
      .sort((a, b) => b.editorialScore - a.editorialScore || b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, 2),
  ]));
}

async function translateText(text, language) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(language)}%7Ccs`;
  const response = await fetch(url, { headers: { "user-agent": "EducationRadarBot/2.0" }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`překlad ${language}: HTTP ${response.status}`);
  const body = await response.json();
  if (Number(body.responseStatus) !== 200 || !body.responseData?.translatedText) throw new Error(`překlad ${language}: neplatná odpověď`);
  return body.responseData.translatedText.trim();
}

async function translateItem(item) {
  if (item.language === "cs") return { ...item, originalLanguage: "cs", translated: false };
  const separator = "[[[RADAR_SPLIT]]]";
  const originalTitle = item.title.slice(0, 180);
  const originalSummary = item.summary.slice(0, 300);
  const translated = await translateText(`${originalTitle}\n${separator}\n${originalSummary}`, item.language);
  let [title, summary] = translated.split(separator).map((part) => part?.trim());
  if (!summary) {
    const lines = translated.split(/\n+/).map((part) => part.trim()).filter(Boolean);
    if (lines.length >= 2) {
      title = lines[0];
      summary = lines.at(-1);
    }
  }
  if (!title || !summary) {
    [title, summary] = await Promise.all([
      translateText(originalTitle, item.language),
      translateText(originalSummary, item.language),
    ]);
  }
  if (!title || !summary) throw new Error(`překlad ${item.language}: neúplný překlad`);
  return { ...item, title, summary, originalLanguage: item.language, translated: true };
}

async function translateSelection(selected, errors) {
  const output = { global: [], europe: [], region: [] };
  const stats = { requested: 0, succeeded: 0, failed: 0, provider: "MyMemory" };
  const tasks = Object.entries(selected).flatMap(([group, items]) => items.map((item) => ({ group, item })));
  stats.requested = tasks.filter(({ item }) => item.language !== "cs").length;
  const settled = await Promise.allSettled(tasks.map(({ item }) => translateItem(item)));
  settled.forEach((result, index) => {
    const { group, item } = tasks[index];
    if (result.status === "fulfilled") {
      output[group].push(result.value);
      if (item.language !== "cs") stats.succeeded += 1;
    } else {
      stats.failed += 1;
      errors.push(`${item.source}: ${result.reason.message}`);
    }
  });
  return { selected: output, translationStats: stats };
}

async function main() {
  const now = process.env.RADAR_NOW ? new Date(process.env.RADAR_NOW) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("RADAR_NOW není platné datum.");
  const { grouped, seduo, errors, sourceRuns, sourceSummary } = await collectCandidates(now);
  console.log(`[sběr] kandidáti global=${grouped.global.length}, europe=${grouped.europe.length}, region=${grouped.region.length}`);
  const financeSettled = await Promise.allSettled(FINANCE.map((item) => fetchQuote(item, now)));
  const finance = financeSettled.filter((item) => item.status === "fulfilled").map((item) => item.value);
  financeSettled.forEach((item, index) => {
    if (item.status === "rejected") {
      const message = item.reason.message;
      errors.push(message.startsWith("Finance ") ? message : `Finance ${FINANCE[index].ticker}: ${message}`);
    }
  });
  const { selected, translationStats } = await translateSelection(selectSignificant(grouped), errors);
  console.log(`[překlad] požadováno=${translationStats.requested}, úspěch=${translationStats.succeeded}, chyba=${translationStats.failed}`);
  const seduoCandidates = seduo.filter((candidate) => !/^Seduo$/i.test(candidate.source)).slice(0, 8);
  translationStats.requested += seduoCandidates.filter((item) => item.language !== "cs").length;
  const seduoSettled = await Promise.allSettled(seduoCandidates.map((item) => translateItem(item)));
  const translatedSeduo = seduoSettled.flatMap((translation, index) => {
    const item = seduoCandidates[index];
    if (translation.status === "fulfilled") {
      if (item.language !== "cs") translationStats.succeeded += 1;
      return [translation.value];
    }
    translationStats.failed += 1;
    errors.push(`${item.source}: ${translation.reason.message}`);
    return [];
  });
  const result = { ...selected, seduo: translatedSeduo, finance, sourceSummary };
  let previousStatus = {};
  try { previousStatus = JSON.parse(await fs.readFile("data/automation-status.json", "utf8")); } catch {}
  const selectedTotal = selected.global.length + selected.europe.length + selected.region.length;
  const consecutiveEmptyRuns = selectedTotal === 0 ? Number(previousStatus.consecutiveEmptyRuns || 0) + 1 : 0;
  const status = {
    schemaVersion: 1, automationVersion: AUTOMATION_VERSION, updatedAt: now.toISOString(), timezone: "Europe/Prague",
    selectedCounts: Object.fromEntries(["global", "europe", "region", "seduo"].map((group) => [group, result[group].length])),
    candidateCounts: Object.fromEntries(Object.entries(grouped).map(([group, items]) => [group, items.length])),
    finance: finance.map(({ ticker, date, price, changePct, currency }) => ({ ticker, date, price, changePct, currency })),
    selectionStatus: "deterministic-v2", sourceSummary, sourceRuns, translationStats, consecutiveEmptyRuns, sourceErrors: errors,
  };
  if (process.env.RADAR_DRY_RUN === "1") {
    console.log(JSON.stringify(status));
    return;
  }
  const html = await fs.readFile("index.html", "utf8");
  await fs.writeFile("index.html", updateIndex(html, result, now));
  await fs.mkdir("data", { recursive: true });
  await fs.writeFile("data/automation-status.json", `${JSON.stringify(status, null, 2)}\n`);
  console.log(JSON.stringify(status));
}

await main();
