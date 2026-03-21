// ═══════════════════════════════════════════════════════════════════
//  DE BELEGGER TRENDS — Google Apps Script Backend
//  Versie 1.0 — Volledig zelfstandig werkend systeem
//
//  INSTALLATIE (eenmalig, 5 minuten):
//  1. Open je Google Sheet "De Belegger Trends"
//  2. Extensies → Apps Script
//  3. Verwijder alle bestaande code en plak dit bestand erin
//  4. Vul JOUW_ANTHROPIC_API_KEY en JOUW_TELEGRAM_TOKEN/CHAT_ID in
//  5. Klik op setupSheets() → uitvoeren → toestaan
//  6. Klik op setupTrigger() → uitvoeren
//  7. Klaar — het systeem draait nu automatisch elke 15 minuten
// ═══════════════════════════════════════════════════════════════════

// ── CONFIGURATIE — alleen dit hoef je aan te passen ──────────────
const CONFIG = {
  ANTHROPIC_API_KEY:  "JOUW_ANTHROPIC_API_KEY",   // van console.anthropic.com
  TELEGRAM_TOKEN:     "JOUW_TELEGRAM_BOT_TOKEN",   // van @BotFather in Telegram
  TELEGRAM_CHAT_ID:   "JOUW_TELEGRAM_CHAT_ID",     // chat ID van je team-groep
  SPIKE_THRESHOLD:    0.70,
  MAX_ALERTS_PER_RUN: 5,
  MIN_RELEVANCE:      0.45,
  REGION:             "NL",
};

// ── FINANCE TAXONOMIE ─────────────────────────────────────────────
const CLUSTERS = {
  beleggen:              ["beleggen","belegger","belegging","investeren","rendement","vermogensbeheer","portfolio","portefeuille","vermogen opbouwen","financiële vrijheid","fire"],
  aandelen:              ["aandelen","aandeel","beurskoers","aandelenmarkt","wall street","nasdaq","dow jones","nikkei","dax","ftse","eurostoxx","ipo","beursgang","s&p"],
  etf:                   ["etf","indexfonds","indexbeleggen","tracker","vanguard","ishares","msci world","all world","small cap","factor beleggen"],
  crypto:                ["bitcoin","ethereum","crypto","blockchain","defi","nft","binance","coinbase","stablecoin","solana","xrp","cardano","halving","web3"],
  rente:                 ["rente","rentestand","renteverhoging","renteverlaging","ecb rente","fed rente","spaarrente","depositorente","yield","basisrente"],
  sparen:                ["sparen","spaarrekening","spaargeld","deposito","spaartips","noodpot","bufferkapitaal"],
  macro:                 ["inflatie","deflatie","recessie","economische groei","bbp","gdp","werkloosheid","cpi","ppi","handelsbalans","stagflatie"],
  economie:              ["economie","macro-economie","conjunctuur","eurozone","staatsschuld","begrotingstekort","fed","ecb","centrale bank","monetair beleid"],
  hypotheek:             ["hypotheek","hypotheekrente","nhg","woonlening","oversluiten","hypotheekadvies","lineaire hypotheek","annuïteitenhypotheek"],
  huizenmarkt:           ["huizenmarkt","woningmarkt","huizenprijzen","woningprijzen","koopwoning","huurwoning","starterswoning","overbieden","wooncrisis","nieuwbouw","kadaster","funda"],
  belasting:             ["belasting","belastingaangifte","box 3","vermogensbelasting","dividendbelasting","belastingdienst","btw","inkomstenbelasting","belastingteruggave"],
  pensioen:              ["pensioen","pensioenstelsel","aow","pensioenleeftijd","pensioenopbouw","pensioenfonds","abp","pggm","lijfrente","pensioensparen"],
  "persoonlijke financiën": ["budget","budgetteren","schulden","krediet","persoonlijke lening","financiële planning"],
  goud:                  ["goud","goudprijs","zilver","grondstoffen","commodities","olieprijzen","ruwe olie"],
  obligaties:            ["obligaties","staatsobligaties","bedrijfsobligaties","obligatierendement","high yield"],
  dividend:              ["dividend","dividendaandelen","dividendrendement","dividenduitkering"],
};

const EXCLUDE_PATTERNS = [
  /sport|voetbal|eredivisie|ajax|psv|feyenoord|\bwk\b|\bek\b/i,
  /netflix|disney|spotify|gaming|\bgame\b|fortnite|twitch|youtube/i,
  /celebrity|gossip|dating|tinder|relatie/i,
  /iphone|android|samsung|apple(?! aandeel| beurs| koers)/i,
  /serie|film|bioscoop|album|zanger|acteur|artiest/i,
  /weer|vakantie|reizen(?! etf| fonds)/i,
  /recept|koken|mode|fashion/i,
];

// ═══════════════════════════════════════════════════════════════════
// STAP 1 — SETUP: tabbladen en triggers aanmaken
// ═══════════════════════════════════════════════════════════════════

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabs = [
    { name: "Ranked Trends",  headers: ["timestamp","keyword","cluster","relevance_score","spike_score","confidence_score","final_rank","trend_type","explanation"] },
    { name: "Raw Trends",     headers: ["timestamp","keyword","source_type","raw_value","region","cluster_candidate"] },
    { name: "Alerts Log",     headers: ["timestamp","keyword","alert_reason","spike_score","relevance_score","confidence_score","telegram_sent","bericht"] },
    { name: "Systeem Log",    headers: ["timestamp","niveau","bericht"] },
  ];

  tabs.forEach(tab => {
    let sheet = ss.getSheetByName(tab.name);
    if (!sheet) sheet = ss.insertSheet(tab.name);
    if (sheet.getLastRow() === 0) {
      const range = sheet.getRange(1, 1, 1, tab.headers.length);
      range.setValues([tab.headers]);
      range.setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#ffffff");
      sheet.setFrozenRows(1);
    }
  });

  sysLog("INFO", "Tabbladen aangemaakt of bevestigd");
  SpreadsheetApp.getUi().alert("✅ Klaar! Tabbladen zijn aangemaakt.\n\nVoer nu setupTrigger() uit om het systeem te starten.");
}

function setupTrigger() {
  // Verwijder bestaande triggers voor deze functie
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "runWorkflow")
    .forEach(t => ScriptApp.deleteTrigger(t));

  // Maak nieuwe trigger elke 15 minuten
  ScriptApp.newTrigger("runWorkflow")
    .timeBased()
    .everyMinutes(15)
    .create();

  sysLog("INFO", "Trigger aangemaakt: elke 15 minuten");
  SpreadsheetApp.getUi().alert("✅ Systeem gestart!\n\nDe workflow draait nu automatisch elke 15 minuten.\n\nJe kunt ook handmatig runWorkflow() uitvoeren om direct te testen.");
}

function removeTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "runWorkflow")
    .forEach(t => ScriptApp.deleteTrigger(t));
  sysLog("INFO", "Trigger verwijderd — systeem gestopt");
}

// ═══════════════════════════════════════════════════════════════════
// STAP 2 — HOOFDWORKFLOW
// ═══════════════════════════════════════════════════════════════════

function runWorkflow() {
  const ts = new Date().toISOString();
  sysLog("INFO", `▶ Workflow gestart @ ${ts}`);

  try {
    // 1. Haal Google Trends RSS op
    const rawItems = fetchGoogleTrends();
    if (!rawItems || rawItems.length === 0) {
      sysLog("WARN", "Geen trends opgehaald");
      return;
    }
    sysLog("INFO", `${rawItems.length} trends opgehaald`);

    // 2. Log raw trends
    logRawTrends(rawItems, ts);

    // 3. Score met lokale engine (snel, geen API-kosten voor elk item)
    const scored = rawItems.map(item => scoreLocally(item, ts)).filter(item => item.relevance_score >= CONFIG.MIN_RELEVANCE);
    sysLog("INFO", `${scored.length}/${rawItems.length} door relevantiefilter`);

    if (scored.length === 0) {
      sysLog("WARN", "Niets door filter");
      return;
    }

    // 4. Verrijk top 10 met Claude API (alleen voor de beste kandidaten)
    const top20candidates = [...scored].sort((a, b) => composite(b) - composite(a)).slice(0, 20);
    const enriched = enrichWithClaude(top20candidates);

    // 5. Rangschik
    const top10  = [...enriched].sort((a, b) => composite(b) - composite(a)).slice(0, 10).map((it, i) => ({ ...it, final_rank: i + 1, trend_type: "actueel" }));
    const spikes = [...enriched].sort((a, b) => b.spike_score - a.spike_score).slice(0, 10).map((it, i) => ({ ...it, final_rank: i + 1, trend_type: "uitschieter" }));

    // 6. Log naar Ranked Trends
    const allRanked = dedupeByKeyword([...top10, ...spikes]);
    logRankedTrends(allRanked, ts);
    sysLog("INFO", `${allRanked.length} items gelogd in Ranked Trends`);

    // 7. Detecteer en stuur alerts
    const alerts = detectAlerts(top10, ts);
    if (alerts.length > 0) {
      const msg = formatTelegramMessage(alerts, ts);
      const sent = sendTelegram(msg);
      logAlerts(alerts, ts, sent, msg);
      sysLog("INFO", `${alerts.length} alert(s) — Telegram: ${sent ? "verstuurd" : "MISLUKT"}`);
    } else {
      sysLog("INFO", "Geen alerts (geen spike boven drempel)");
    }

    sysLog("INFO", `✅ Workflow klaar @ ${new Date().toISOString()}`);

  } catch (err) {
    sysLog("ERROR", `Workflow fout: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// LAAG 1 — GOOGLE TRENDS OPHALEN (RSS)
// ═══════════════════════════════════════════════════════════════════

function fetchGoogleTrends() {
  const items = [];
  const urls = [
    `https://trends.google.com/trending/rss?geo=${CONFIG.REGION}`,
    `https://trends.google.com/trends/trendingsearches/daily/rss?geo=${CONFIG.REGION}`,
  ];

  for (const url of urls) {
    try {
      const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
      if (response.getResponseCode() !== 200) continue;
      const xml = response.getContentText();
      const parsed = parseRSS(xml, url.includes("daily") ? "daily_trending" : "realtime_trending");
      items.push(...parsed);
    } catch (err) {
      sysLog("WARN", `RSS fetch mislukt voor ${url}: ${err.message}`);
    }
    Utilities.sleep(1000);
  }

  return dedupeByKeyword(items);
}

function parseRSS(xmlText, sourceType) {
  const items = [];
  try {
    const titleMatches = xmlText.match(/<item>[\s\S]*?<\/item>/g) || [];
    titleMatches.forEach(item => {
      const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/))?.[1];
      if (title && title.trim()) {
        items.push({ keyword: title.trim(), source_type: sourceType, raw_value: 75 });
      }
    });
  } catch (err) {
    sysLog("WARN", `RSS parse fout: ${err.message}`);
  }
  return items;
}

// ═══════════════════════════════════════════════════════════════════
// LAAG 2 — LOKALE SCORING ENGINE
// ═══════════════════════════════════════════════════════════════════

function scoreLocally(item, ts) {
  const kw = item.keyword.toLowerCase();
  let relevance = 0;
  let cluster = "overig";

  // Relevantie op basis van taxonomie
  for (const [cl, terms] of Object.entries(CLUSTERS)) {
    for (const term of terms) {
      if (kw === term)                      { relevance = Math.max(relevance, 0.95); cluster = cl; }
      else if (kw.includes(term) || term.includes(kw)) { relevance = Math.max(relevance, 0.75); if (relevance > 0.60) cluster = cl; }
    }
  }

  // Contextboost
  if (/\d+%|euro|€|\$|miljard|miljoen|rente|koers|prijs/.test(kw)) relevance = Math.min(1, relevance + 0.08);

  // Exclusies
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(kw)) { relevance = Math.min(relevance, 0.15); break; }
  }

  // Spike op basis van RSS positie
  const positionBoost = item.source_type === "realtime_trending" ? 0.15 : 0.05;
  const spike = Math.min(1, (item.raw_value / 100) + positionBoost);

  // Confidence
  let confidence = 0.70;
  if (kw.length < 4)    confidence -= 0.25;
  if (kw.includes(" ")) confidence += 0.10;
  if (relevance > 0.80) confidence += 0.15;
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    keyword:          item.keyword,
    source_type:      item.source_type,
    raw_value:        item.raw_value,
    cluster,
    relevance_score:  round2(relevance),
    spike_score:      round2(spike),
    confidence_score: round2(confidence),
    explanation:      `Cluster: ${cluster} | Bron: ${item.source_type}`,
    timestamp:        ts,
  };
}

// ═══════════════════════════════════════════════════════════════════
// LAAG 3 — CLAUDE API VERRIJKING (alleen top kandidaten)
// ═══════════════════════════════════════════════════════════════════

function enrichWithClaude(items) {
  if (!CONFIG.ANTHROPIC_API_KEY || CONFIG.ANTHROPIC_API_KEY.startsWith("JOUW_")) {
    sysLog("WARN", "Geen Anthropic API key — sla Claude verrijking over");
    return items;
  }

  const enriched = [];
  // Batch: stuur alle keywords in één Claude-call voor efficiëntie en minder kosten
  const kwList = items.map(it => it.keyword).join("\n");

  try {
    const prompt = `Je bent een financiële trendanalist voor Nederland. Analyseer deze Google Trends keywords en geef uitsluitend een JSON array terug. Geen markdown, geen uitleg, alleen de JSON.

Keywords (één per regel):
${kwList}

Geef voor elk keyword:
{
  "keyword": "exact zoals aangeleverd",
  "relevance_score": 0.00,
  "spike_score": 0.00,
  "confidence_score": 0.00,
  "cluster": "beleggen|aandelen|etf|crypto|rente|sparen|macro|economie|hypotheek|huizenmarkt|belasting|pensioen|overig",
  "explanation": "één zin in het Nederlands"
}

Regels:
- relevance_score: 0-1, hoe sterk past dit bij finance/economie/beleggen/huizenmarkt NL
- spike_score: 0-1, hoe sterk lijkt de stijging nu
- confidence_score: 0-1, hoe betrouwbaar is dit als financieel signaal
- cluster: kies het meest passende cluster
- explanation: kort en direct bruikbaar voor redactie
- Geef ALLE keywords terug, ook niet-relevante (met lage scores)`;

    const payload = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    };

    const response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
      method: "post",
      contentType: "application/json",
      headers: {
        "x-api-key": CONFIG.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    if (response.getResponseCode() !== 200) {
      sysLog("WARN", `Claude API fout ${response.getResponseCode()} — gebruik lokale scores`);
      return items;
    }

    const data = JSON.parse(response.getContentText());
    const text = data.content?.[0]?.text || "[]";
    const clean = text.replace(/```json|```/g, "").trim();
    const claudeResults = JSON.parse(clean);

    // Merge Claude scores met lokale data
    const claudeMap = {};
    claudeResults.forEach(r => { claudeMap[r.keyword] = r; });

    items.forEach(item => {
      const cr = claudeMap[item.keyword];
      if (cr) {
        enriched.push({
          ...item,
          relevance_score:  round2(cr.relevance_score || item.relevance_score),
          spike_score:      round2(cr.spike_score      || item.spike_score),
          confidence_score: round2(cr.confidence_score || item.confidence_score),
          cluster:          cr.cluster || item.cluster,
          explanation:      cr.explanation || item.explanation,
        });
      } else {
        enriched.push(item);
      }
    });

    sysLog("INFO", `Claude verrijking klaar: ${enriched.length} items`);
    return enriched;

  } catch (err) {
    sysLog("WARN", `Claude verrijking mislukt: ${err.message} — gebruik lokale scores`);
    return items;
  }
}

// ═══════════════════════════════════════════════════════════════════
// LAAG 4 — ALERT ENGINE
// ═══════════════════════════════════════════════════════════════════

function detectAlerts(top10, ts) {
  const prevKwJson = PropertiesService.getScriptProperties().getProperty("prev_top10") || "[]";
  const prevKws = new Set(JSON.parse(prevKwJson));
  const alerts = [];

  for (const item of top10) {
    let reason = null;
    if (item.spike_score > CONFIG.SPIKE_THRESHOLD) reason = `Spike ${item.spike_score.toFixed(2)} boven drempel ${CONFIG.SPIKE_THRESHOLD}`;
    else if (prevKws.size > 0 && !prevKws.has(item.keyword)) reason = "Nieuw in top 10";
    if (reason) alerts.push({ ...item, alert_reason: reason });
    if (alerts.length >= CONFIG.MAX_ALERTS_PER_RUN) break;
  }

  // Sla huidige top10 op voor volgende run
  PropertiesService.getScriptProperties().setProperty("prev_top10", JSON.stringify(top10.map(it => it.keyword)));
  return alerts;
}

function formatTelegramMessage(alerts, ts) {
  const dt = Utilities.formatDate(new Date(ts), "Europe/Amsterdam", "dd-MM-yyyy HH:mm");
  const lines = alerts.map((it, i) => `${i + 1}. *${it.keyword}* — ${it.explanation || it.alert_reason}`).join("\n");
  return `🔥 *De Belegger Trends*\n\nNieuwe signalen in Nederland:\n${lines}\n\n_Laatste update: ${dt}_`;
}

function sendTelegram(message) {
  if (!CONFIG.TELEGRAM_TOKEN || CONFIG.TELEGRAM_TOKEN.startsWith("JOUW_")) {
    sysLog("WARN", "Geen Telegram token — bericht niet verstuurd");
    return false;
  }
  try {
    const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/sendMessage`;
    const response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ chat_id: CONFIG.TELEGRAM_CHAT_ID, text: message, parse_mode: "Markdown" }),
      muteHttpExceptions: true,
    });
    return response.getResponseCode() === 200;
  } catch (err) {
    sysLog("ERROR", `Telegram fout: ${err.message}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// LAAG 5 — GOOGLE SHEETS LOGGING
// ═══════════════════════════════════════════════════════════════════

function logRawTrends(items, ts) {
  try {
    const sheet = getOrCreateSheet("Raw Trends");
    const rows = items.map(it => [ts, it.keyword, it.source_type, it.raw_value, CONFIG.REGION, it.cluster || ""]);
    if (rows.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  } catch (err) { sysLog("WARN", `Raw Trends log fout: ${err.message}`); }
}

function logRankedTrends(items, ts) {
  try {
    const sheet = getOrCreateSheet("Ranked Trends");
    const rows = items.map(it => [
      ts, it.keyword, it.cluster,
      it.relevance_score, it.spike_score, it.confidence_score,
      it.final_rank || "", it.trend_type || "actueel", it.explanation || "",
    ]);
    if (rows.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  } catch (err) { sysLog("WARN", `Ranked Trends log fout: ${err.message}`); }
}

function logAlerts(alerts, ts, sent, msg) {
  try {
    const sheet = getOrCreateSheet("Alerts Log");
    const rows = alerts.map(it => [
      ts, it.keyword, it.alert_reason,
      it.spike_score, it.relevance_score, it.confidence_score,
      sent ? "Ja" : "Nee", msg.substring(0, 200),
    ]);
    if (rows.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  } catch (err) { sysLog("WARN", `Alerts log fout: ${err.message}`); }
}

function sysLog(level, message) {
  console.log(`[${level}] ${message}`);
  try {
    const sheet = getOrCreateSheet("Systeem Log");
    sheet.appendRow([new Date().toISOString(), level, message]);
  } catch (e) {}
}

// ═══════════════════════════════════════════════════════════════════
// HULPFUNCTIES
// ═══════════════════════════════════════════════════════════════════

function composite(item) {
  return (item.relevance_score || 0) * 0.45 + (item.spike_score || 0) * 0.35 + (item.confidence_score || 0) * 0.20;
}

function round2(n) { return Math.round(parseFloat(n) * 100) / 100; }

function dedupeByKeyword(items) {
  const seen = new Set();
  return items.filter(it => { if (seen.has(it.keyword)) return false; seen.add(it.keyword); return true; });
}

function getOrCreateSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

// ── Handmatig testen via Apps Script editor ───────────────────────
function testRun() {
  runWorkflow();
}
