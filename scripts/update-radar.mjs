import fs from "node:fs/promises";
import { dedupe, isRecent, matchesWatchlist, parseRss, updateIndex } from "./radar-lib.mjs";

const WATCHLISTS = {
  global: ["Coursera", "Udemy", "edX", "LinkedIn Learning", "Skillshare", "MasterClass", "Pluralsight", "DataCamp", "Codecademy", "Udacity", "Khan Academy", "Brilliant", "Maven", "Reforge", "DeepLearning.AI", "Duolingo"],
  europe: ["GoStudent", "Babbel", "Kahoot", "360Learning", "Multiverse", "OpenClassrooms", "Preply", "LearnWorlds", "TalentLMS", "Lingoda", "StudySmarter", "CoachHub", "simpleclub", "Knowunity", "sofatutor", "Seneca Learning", "CENTURY Tech", "Atom Learning", "Sparx Learning", "Twinkl", "FutureLearn", "Perlego", "FourthRev", "MyTutor", "LearnUpon", "Alison", "StuDocu", "Lepaya", "FeedbackFruits", "GoodHabitz", "Studytube", "Wooclap", "BookWidgets", "Edflex", "Didask", "Genially", "ODILO", "Innovamat", "Smartick", "Ironhack", "Domestika", "WeSchool", "Docsity", "EPICODE", "Kognity", "Sana", "Eduten", "Claned", "99math", "Turing College"],
  region: ["Seduo", "Scio", "Umíme to", "Edjet", "Vividbooks", "Corinth", "Digiskills", "ENGETO", "ITnetwork", "Mooveez", "OrgPad", "Edyta", "Edugym", "GPT-EDU", "Edueeno", "Playful", "EduPage", "Skillmea", "SmartBooks", "KUBO", "Kozmix", "Žmudri", "Nexineo", "Fenomény sveta", "BezKriedy", "Wibo", "Viki", "Databanka"],
};

const QUERY_CHUNKS = {
  global: [WATCHLISTS.global.slice(0, 8), WATCHLISTS.global.slice(8)],
  europe: Array.from({ length: 5 }, (_, i) => WATCHLISTS.europe.slice(i * 10, i * 10 + 10)),
  region: Array.from({ length: 3 }, (_, i) => WATCHLISTS.region.slice(i * 10, i * 10 + 10)),
};

function newsUrl(names, period = "1d") {
  const query = `${names.map((name) => `"${name}"`).join(" OR ")} when:${period}`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=cs&gl=CZ&ceid=CZ:cs`;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "EducationRadarBot/1.0 (+https://jannehasil.github.io/education-radar-cz-sk/)" },
    signal: AbortSignal.timeout(20_000),
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
    signal: AbortSignal.timeout(20_000),
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
  await Promise.all(Object.entries(QUERY_CHUNKS).flatMap(([group, chunks]) => chunks.map(async (names) => {
    try {
      grouped[group].push(...parseRss(await fetchText(newsUrl(names)), group));
    } catch (error) {
      errors.push(`${group}: ${error.message}`);
    }
  })));
  for (const group of Object.keys(grouped)) {
    grouped[group] = dedupe(grouped[group])
      .filter((item) => isRecent(item, 30, now))
      .filter((item) => matchesWatchlist(item, WATCHLISTS[group]))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }
  let seduo = [];
  try {
    seduo = dedupe(parseRss(await fetchText(newsUrl(["Seduo"], "30d")), "seduo"))
      .filter((item) => isRecent(item, 31 * 24, now))
      .filter((item) => !/seduo\.(cz|sk)/i.test(`${item.url} ${item.source}`))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  } catch (error) {
    errors.push(`seduo: ${error.message}`);
  }
  return { grouped, seduo, errors };
}

function highConfidenceFallback(candidates) {
  const trusted = /(coursera|udemy|duolingo|linkedin|reuters|bloomberg|forbes|techcrunch|sifted|minister|univer|škola|skola|education|edtech|hr|lupa|e15|hn|deník|denik|čtk|ctk|trend|živě|zive)/i;
  return candidates.filter((item) => trusted.test(`${item.source} ${item.title}`)).slice(0, 2);
}

async function selectWithGitHubModels(grouped) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  const candidates = Object.values(grouped).flat().slice(0, 60).map((item, id) => ({ id, ...item }));
  if (!candidates.length) return { global: [], europe: [], region: [] };
  const prompt = `Jsi editor Education Radaru. Z RSS kandidátů vyber pouze významné produktové, strategické, finanční nebo tržní novinky o sledovaných online education platformách. Odmítni marketingové články, nabídky kurzů, návody, burzovní spekulace bez nové skutečnosti a falešné shody názvů. Vrať výhradně JSON {"global":[id],"europe":[id],"region":[id]}, nejvýše 2 položky v každé skupině. Když si nejsi jistý, položku nevybírej. Kandidáti: ${JSON.stringify(candidates)}`;
  const response = await fetch("https://models.github.ai/inference/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
    body: JSON.stringify({ model: "openai/gpt-4o", temperature: 0, max_tokens: 300, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`GitHub Models: ${response.status} ${await response.text()}`);
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content || "";
  const json = JSON.parse(content.replace(/^```json\s*|\s*```$/g, ""));
  const byId = new Map(candidates.map((item) => [item.id, item]));
  return Object.fromEntries(["global", "europe", "region"].map((group) => [group,
    (Array.isArray(json[group]) ? json[group] : []).map((id) => byId.get(Number(id)))
      .filter((item) => item?.group === group).slice(0, 2),
  ]));
}

async function main() {
  const now = process.env.RADAR_NOW ? new Date(process.env.RADAR_NOW) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("RADAR_NOW není platné datum.");
  const { grouped, seduo, errors } = await collectCandidates(now);
  const financeSettled = await Promise.allSettled(FINANCE.map((item) => fetchQuote(item, now)));
  const finance = financeSettled.filter((item) => item.status === "fulfilled").map((item) => item.value);
  financeSettled.filter((item) => item.status === "rejected").forEach((item) => errors.push(item.reason.message));
  let selected;
  let modelStatus = "not-configured";
  try {
    selected = await selectWithGitHubModels(grouped);
    if (selected) modelStatus = "ok";
  } catch (error) {
    errors.push(error.message);
    modelStatus = "fallback";
  }
  selected ||= Object.fromEntries(Object.entries(grouped).map(([group, items]) => [group, highConfidenceFallback(items)]));
  const result = { ...selected, seduo: seduo.filter((item) => !/^Seduo$/i.test(item.source)).slice(0, 8), finance };
  const html = await fs.readFile("index.html", "utf8");
  await fs.writeFile("index.html", updateIndex(html, result, now));
  const status = {
    schemaVersion: 1, updatedAt: now.toISOString(), timezone: "Europe/Prague",
    selectedCounts: Object.fromEntries(Object.entries(result).filter(([group]) => group !== "finance").map(([group, items]) => [group, items.length])),
    candidateCounts: Object.fromEntries(Object.entries(grouped).map(([group, items]) => [group, items.length])),
    finance: finance.map(({ ticker, date, price, changePct, currency }) => ({ ticker, date, price, changePct, currency })),
    modelStatus, sourceErrors: errors,
  };
  await fs.mkdir("data", { recursive: true });
  await fs.writeFile("data/automation-status.json", `${JSON.stringify(status, null, 2)}\n`);
  console.log(JSON.stringify(status));
}

await main();
