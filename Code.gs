// ═══════════════════════════════════════════════════════════════════
//  DE BELEGGER TRENDS — Google Apps Script Backend v1.2
//
//  NIEUW IN DEZE VERSIE:
//  - Betere filtering (minder valse positieven zoals "tijd")
//  - Scraper voor debelegger.nl
//  - SEO-matching: match / gap / kans per keyword
//
//  INSTALLATIE:
//  1. Vul je Anthropic API key in op regel 12
//  2. setupSheets() uitvoeren
//  3. setupTrigger() uitvoeren
//  4. testRun() uitvoeren om direct te testen
// ═══════════════════════════════════════════════════════════════════

const CONFIG = {
  ANTHROPIC_API_KEY: "JOUW_ANTHROPIC_API_KEY",  // ← hier invullen
  SITE_URL:          "https://www.debelegger.nl",
  SPIKE_THRESHOLD:   0.70,
  MIN_RELEVANCE:     0.55,  // verhoogd van 0.45 naar 0.55 voor betere filtering
  REGION:            "NL",
};

// ── Finance taxonomie ─────────────────────────────────────────────
const CLUSTERS = {
  beleggen:                 ["beleggen","belegger","belegging","investeren","rendement","vermogensbeheer","portfolio","portefeuille","vermogen opbouwen","financiële vrijheid","fire beweging"],
  aandelen:                 ["aandelen","aandeel","beurskoers","aandelenmarkt","wall street","nasdaq","dow jones","nikkei","dax","ftse","eurostoxx","ipo","beursgang","s&p 500"],
  etf:                      ["etf","indexfonds","indexbeleggen","tracker","vanguard","ishares","msci world","all world","small cap","factor beleggen"],
  crypto:                   ["bitcoin","ethereum","crypto","cryptocurrency","blockchain","defi","nft","binance","coinbase","stablecoin","solana","xrp","cardano","halving","web3"],
  rente:                    ["ecb rente","fed rente","spaarrente","hypotheekrente","depositorente","renteverhoging","renteverlaging","rentestand","basisrente","yield curve"],
  sparen:                   ["spaarrekening","spaargeld","spaarrente vergelijken","deposito","noodpot","bufferkapitaal","spaartips"],
  macro:                    ["inflatie","deflatie","recessie","economische groei","bbp","gdp","werkloosheid","cpi inflatie","ppi","handelsbalans","stagflatie"],
  economie:                 ["eurozone economie","staatsschuld","begrotingstekort","centrale bank","monetair beleid","economische crisis","conjunctuur"],
  hypotheek:                ["hypotheek","hypotheekrente","nhg hypotheek","woonlening","oversluiten hypotheek","hypotheekadvies","lineaire hypotheek","annuïteitenhypotheek"],
  huizenmarkt:              ["huizenmarkt","woningmarkt","huizenprijzen","woningprijzen","koopwoning","starterswoning","overbieden","wooncrisis","nieuwbouw woningen","kadaster","funda"],
  belasting:                ["belasting","belastingaangifte","box 3","vermogensbelasting","dividendbelasting","belastingteruggave","inkomstenbelasting beleggen"],
  pensioen:                 ["pensioen","pensioenstelsel","aow","pensioenopbouw","pensioenfonds","abp pensioen","lijfrente","pensioensparen","eerder stoppen met werken"],
  "persoonlijke financiën": ["persoonlijk budget","schulden afbetalen","financiële planning","financiële vrijheid","fire methode","passief inkomen"],
  goud:                     ["goudprijs","goud kopen","zilverprijs","grondstoffen","commodities","olieprijzen","ruwe olie prijs"],
  obligaties:               ["staatsobligaties","bedrijfsobligaties","obligatierendement","high yield obligaties","obligaties kopen"],
  dividend:                 ["dividendaandelen","dividendrendement","dividend uitkering","ex-dividenddatum","dividend beleggen"],
};

// Strikte uitsluitingen — minimaal 2 woorden of zeer specifieke financiële term vereist
const EXCLUDE_PATTERNS = [
  /^(tijd|nieuws|vandaag|update|live|now|top|best|new|hot|trending)$/i,
  /sport|voetbal|eredivisie|ajax|psv|feyenoord|\bwk\b|\bek\b|champions league|formula 1|\bf1\b/i,
  /netflix|disney\+|spotify|gaming|\bgame\b|fortnite|twitch|youtube|tiktok|instagram/i,
  /celebrity|gossip|dating|tinder|relatie|koppel|breuk/i,
  /iphone|android|samsung|apple(?! aandeel| beurs| koers| stock)/i,
  /serie|film|bioscoop|album|zanger|acteur|artiest|muziek(?! aandeel)/i,
  /weer|vakantie|reizen(?! etf| fonds)|vlucht|hotel(?! aandeel)/i,
  /recept|koken|mode|fashion|beauty|make-up/i,
  /politiek|partij|\bpvv\b|\bvvd\b|\bd66\b|\bpvda\b(?! economie| beleid)/i,
];

// Minimum woordlengte voor niet-taxonomie keywords
const MIN_KEYWORD_LENGTH = 6;

// ═══════════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════════

function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabs = [
    { name: "Ranked Trends", headers: ["timestamp","keyword","cluster","relevance_score","spike_score","confidence_score","final_rank","trend_type","seo_match","seo_gap","seo_kans","explanation"] },
    { name: "Raw Trends",    headers: ["timestamp","keyword","source_type","raw_value","region","cluster_candidate"] },
    { name: "SEO Kansen",    headers: ["timestamp","keyword","cluster","spike_score","relevance_score","seo_match","seo_gap","seo_advies"] },
    { name: "Site Content",  headers: ["timestamp","url","titel","categorie","zoekwoorden"] },
    { name: "Systeem Log",   headers: ["timestamp","niveau","bericht"] },
  ];
  tabs.forEach(function(tab) {
    var sheet = ss.getSheetByName(tab.name);
    if (!sheet) sheet = ss.insertSheet(tab.name);
    if (sheet.getLastRow() === 0) {
      var range = sheet.getRange(1, 1, 1, tab.headers.length);
      range.setValues([tab.headers]);
      range.setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#ffffff");
      sheet.setFrozenRows(1);
    }
  });
  sysLog("INFO", "Tabbladen aangemaakt v1.2");
  SpreadsheetApp.getUi().alert("Tabbladen klaar.\n\nVoer nu setupTrigger() uit.\n\nTip: voer ook scrapeSiteContent() uit om De Belegger website te indexeren.");
}

function setupTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === "runWorkflow"; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("runWorkflow").timeBased().everyMinutes(15).create();

  // Dagelijkse site-scrape om 6:00
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === "scrapeSiteContent"; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("scrapeSiteContent").timeBased().atHour(6).everyDays(1).create();

  sysLog("INFO", "Triggers aangemaakt: workflow elke 15 min, site-scrape dagelijks 06:00");
  SpreadsheetApp.getUi().alert("Systeem gestart.\n\nWorkflow: elke 15 minuten\nSite scrape: dagelijks 06:00\n\nTest direct via testRun().");
}

function testRun() {
  runWorkflow();
}

// ═══════════════════════════════════════════════════════════════════
// WEBSITE SCRAPER — debelegger.nl
// ═══════════════════════════════════════════════════════════════════

function scrapeSiteContent() {
  sysLog("INFO", "Site scrape gestart: " + CONFIG.SITE_URL);
  var articles = [];

  // Scrape homepage en categoriepagina's
  var pagesToScrape = [
    CONFIG.SITE_URL,
    CONFIG.SITE_URL + "/beleggen",
    CONFIG.SITE_URL + "/aandelen",
    CONFIG.SITE_URL + "/crypto",
    CONFIG.SITE_URL + "/etf",
    CONFIG.SITE_URL + "/sparen",
    CONFIG.SITE_URL + "/hypotheek",
    CONFIG.SITE_URL + "/belasting",
    CONFIG.SITE_URL + "/pensioen",
  ];

  pagesToScrape.forEach(function(url) {
    try {
      var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
      if (response.getResponseCode() !== 200) return;
      var html = response.getContentText();
      var extracted = extractArticlesFromHTML(html, url);
      articles = articles.concat(extracted);
      Utilities.sleep(1500);
    } catch (err) {
      sysLog("WARN", "Scrape mislukt voor " + url + ": " + err.message);
    }
  });

  // Dedupliceer
  var seen = {};
  articles = articles.filter(function(a) {
    if (seen[a.titel]) return false;
    seen[a.titel] = true;
    return true;
  });

  // Sla op in Site Content tabblad
  if (articles.length > 0) {
    var sheet = getOrCreateSheet("Site Content");
    // Verwijder oude data
    if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
    var ts = new Date().toISOString();
    var rows = articles.map(function(a) {
      return [ts, a.url, a.titel, a.categorie, a.zoekwoorden];
    });
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    sysLog("INFO", articles.length + " artikelen geïndexeerd van debelegger.nl");
  } else {
    sysLog("WARN", "Geen artikelen gevonden op debelegger.nl");
  }

  return articles;
}

function extractArticlesFromHTML(html, pageUrl) {
  var articles = [];
  var categorie = detectCategorie(pageUrl);

  // Extract artikel-titels via <h1>, <h2>, <h3> en <title>
  var titlePatterns = [
    /<title[^>]*>([^<]+)<\/title>/gi,
    /<h1[^>]*>([^<]+)<\/h1>/gi,
    /<h2[^>]*>([^<]+)<\/h2>/gi,
    /<h3[^>]*>([^<]+)<\/h3>/gi,
    /<a[^>]*class="[^"]*(?:article|post|titel|title)[^"]*"[^>]*>([^<]+)<\/a>/gi,
  ];

  titlePatterns.forEach(function(pattern) {
    var match;
    while ((match = pattern.exec(html)) !== null) {
      var titel = match[1].replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&#\d+;/g,'').trim();
      if (titel.length > 10 && titel.length < 200 && !isNavItem(titel)) {
        articles.push({
          url: pageUrl,
          titel: titel,
          categorie: categorie,
          zoekwoorden: extractKeywordsFromTitle(titel),
        });
      }
    }
  });

  return articles.slice(0, 50); // max 50 per pagina
}

function detectCategorie(url) {
  if (url.indexOf("/crypto") !== -1) return "crypto";
  if (url.indexOf("/aandelen") !== -1) return "aandelen";
  if (url.indexOf("/etf") !== -1) return "etf";
  if (url.indexOf("/beleggen") !== -1) return "beleggen";
  if (url.indexOf("/sparen") !== -1) return "sparen";
  if (url.indexOf("/hypotheek") !== -1) return "hypotheek";
  if (url.indexOf("/belasting") !== -1) return "belasting";
  if (url.indexOf("/pensioen") !== -1) return "pensioen";
  return "algemeen";
}

function extractKeywordsFromTitle(titel) {
  return titel.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(function(w) { return w.length > 3; })
    .slice(0, 10)
    .join(", ");
}

function isNavItem(text) {
  var navItems = ["home","menu","contact","over ons","privacy","cookies","inloggen","registreren","zoeken","abonnement"];
  return navItems.indexOf(text.toLowerCase()) !== -1;
}

// ═══════════════════════════════════════════════════════════════════
// HOOFDWORKFLOW
// ═══════════════════════════════════════════════════════════════════

function runWorkflow() {
  var ts = new Date().toISOString();
  sysLog("INFO", "Workflow gestart @ " + ts);
  try {
    // 1. Haal site content op (vanuit cache)
    var siteContent = getSiteContentFromSheet();
    sysLog("INFO", siteContent.length + " site-artikelen geladen uit cache");

    // 2. Google Trends ophalen
    var rawItems = fetchGoogleTrends();
    if (!rawItems || rawItems.length === 0) { sysLog("WARN", "Geen trends opgehaald"); return; }
    sysLog("INFO", rawItems.length + " trends opgehaald");
    logRawTrends(rawItems, ts);

    // 3. Lokale scoring + filter
    var scored = rawItems
      .map(function(item) { return scoreLocally(item, ts); })
      .filter(function(item) { return item.relevance_score >= CONFIG.MIN_RELEVANCE; });
    sysLog("INFO", scored.length + "/" + rawItems.length + " door filter (min relevantie: " + CONFIG.MIN_RELEVANCE + ")");
    if (scored.length === 0) { sysLog("WARN", "Niets door filter"); return; }

    // 4. Claude verrijking + SEO matching
    var top20 = scored.slice().sort(function(a,b){ return composite(b)-composite(a); }).slice(0,20);
    var enriched = enrichWithClaude(top20, siteContent);

    // 5. Rangschik
    var top10 = enriched.slice().sort(function(a,b){ return composite(b)-composite(a); }).slice(0,10);
    top10.forEach(function(it,i){ it.final_rank=i+1; it.trend_type="actueel"; });
    var spikes = enriched.slice().sort(function(a,b){ return b.spike_score-a.spike_score; }).slice(0,10);
    spikes.forEach(function(it,i){ it.final_rank=i+1; it.trend_type="uitschieter"; });

    // 6. Log
    var allRanked = dedupeByKeyword(top10.concat(spikes));
    logRankedTrends(allRanked, ts);

    // 7. Log SEO kansen apart
    var seoKansen = allRanked.filter(function(it) { return it.seo_gap === "JA" || it.seo_kans === "HOOG"; });
    if (seoKansen.length > 0) logSeoKansen(seoKansen, ts);

    sysLog("INFO", allRanked.length + " items gelogd | " + seoKansen.length + " SEO kansen");
    sysLog("INFO", "Workflow klaar @ " + new Date().toISOString());
  } catch (err) {
    sysLog("ERROR", "Workflow fout: " + err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
// GOOGLE TRENDS OPHALEN
// ═══════════════════════════════════════════════════════════════════

function fetchGoogleTrends() {
  var items = [];
  var urls = [
    "https://trends.google.com/trending/rss?geo=" + CONFIG.REGION,
    "https://trends.google.com/trends/trendingsearches/daily/rss?geo=" + CONFIG.REGION,
  ];
  for (var i = 0; i < urls.length; i++) {
    try {
      var response = UrlFetchApp.fetch(urls[i], { muteHttpExceptions: true, followRedirects: true });
      if (response.getResponseCode() !== 200) continue;
      items = items.concat(parseRSS(response.getContentText(), i === 0 ? "realtime" : "daily"));
    } catch (err) { sysLog("WARN", "RSS fetch mislukt: " + err.message); }
    Utilities.sleep(1000);
  }
  return dedupeByKeyword(items);
}

function parseRSS(xmlText, sourceType) {
  var items = [];
  var matches = xmlText.match(/<item>[\s\S]*?<\/item>/g) || [];
  matches.forEach(function(item) {
    var m = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/);
    if (m && m[1] && m[1].trim()) {
      items.push({ keyword: m[1].trim(), source_type: sourceType, raw_value: 75 });
    }
  });
  return items;
}

// ═══════════════════════════════════════════════════════════════════
// LOKALE SCORING (verbeterd)
// ═══════════════════════════════════════════════════════════════════

function scoreLocally(item, ts) {
  var kw = item.keyword.toLowerCase().trim();
  var relevance = 0;
  var cluster = "overig";

  // Directe uitsluitingen: te kort of exclusion pattern
  if (kw.length < MIN_KEYWORD_LENGTH) return { keyword: item.keyword, source_type: item.source_type, raw_value: item.raw_value, cluster: "overig", relevance_score: 0, spike_score: 0, confidence_score: 0, explanation: "Te kort", timestamp: ts };

  for (var p = 0; p < EXCLUDE_PATTERNS.length; p++) {
    if (EXCLUDE_PATTERNS[p].test(kw)) {
      return { keyword: item.keyword, source_type: item.source_type, raw_value: item.raw_value, cluster: "overig", relevance_score: 0.1, spike_score: 0, confidence_score: 0, explanation: "Uitgesloten", timestamp: ts };
    }
  }

  // Taxonomie matching
  var clusterNames = Object.keys(CLUSTERS);
  for (var c = 0; c < clusterNames.length; c++) {
    var cl = clusterNames[c];
    var terms = CLUSTERS[cl];
    for (var t = 0; t < terms.length; t++) {
      var score = 0;
      if (kw === terms[t]) score = 0.95;
      else if (kw.indexOf(terms[t]) !== -1) score = 0.80;
      else if (terms[t].indexOf(kw) !== -1 && kw.length > 5) score = 0.70;
      if (score > relevance) { relevance = score; cluster = cl; }
    }
  }

  // Contextboost voor financiële patronen
  if (/\d+%|€\d|\$\d|\d+\s*(euro|dollar|procent)|koers|prijs|rente|rendement/.test(kw)) {
    relevance = Math.min(1, relevance + 0.08);
  }

  // Spike score
  var spike = Math.min(1, (item.raw_value / 100) + (item.source_type === "realtime" ? 0.15 : 0.05));

  // Confidence score
  var confidence = 0.65;
  if (kw.split(" ").length >= 2) confidence += 0.15; // multi-word = specifieker
  if (kw.split(" ").length >= 3) confidence += 0.10;
  if (relevance > 0.80) confidence += 0.10;
  if (kw.length < 6) confidence -= 0.30;

  return {
    keyword: item.keyword,
    source_type: item.source_type,
    raw_value: item.raw_value,
    cluster: cluster,
    relevance_score: round2(relevance),
    spike_score: round2(spike),
    confidence_score: round2(Math.max(0, Math.min(1, confidence))),
    explanation: "Cluster: " + cluster,
    seo_match: "",
    seo_gap: "",
    seo_kans: "",
    timestamp: ts,
  };
}

// ═══════════════════════════════════════════════════════════════════
// CLAUDE API — verrijking + SEO matching
// ═══════════════════════════════════════════════════════════════════

function enrichWithClaude(items, siteContent) {
  if (!CONFIG.ANTHROPIC_API_KEY || CONFIG.ANTHROPIC_API_KEY.indexOf("JOUW_") === 0) {
    sysLog("WARN", "Geen API key — gebruik lokale scores");
    return items;
  }

  var kwList = items.map(function(it) { return it.keyword; }).join("\n");

  // Maak een samenvatting van site content voor Claude
  var siteOverview = siteContent.slice(0, 40).map(function(a) {
    return a.categorie + ": " + a.titel;
  }).join("\n");

  var prompt = "Je bent een SEO-analist voor De Belegger (debelegger.nl), een Nederlandse financiële website.\n\n" +
    "BESTAANDE CONTENT OP DEBELEGGER.NL:\n" + (siteOverview || "Geen site content beschikbaar") + "\n\n" +
    "TRENDING KEYWORDS OP GOOGLE NEDERLAND:\n" + kwList + "\n\n" +
    "Analyseer elk keyword en geef uitsluitend een JSON array terug zonder markdown.\n\n" +
    "Voor elk keyword:\n" +
    "{\"keyword\": \"exact zoals aangeleverd\", \"relevance_score\": 0.00, \"spike_score\": 0.00, \"confidence_score\": 0.00, \"cluster\": \"beleggen|aandelen|etf|crypto|rente|sparen|macro|economie|hypotheek|huizenmarkt|belasting|pensioen|overig\", \"explanation\": \"één zin waarom relevant voor De Belegger\", \"seo_match\": \"JA of NEE — bestaat er al content over op debelegger.nl?\", \"seo_gap\": \"JA of NEE — ontbreekt deze content nog?\", \"seo_kans\": \"HOOG, MIDDEL of LAAG — hoe groot is de SEO-kans voor debelegger.nl?\", \"seo_advies\": \"één concrete actie voor de redactie\"}\n\n" +
    "Geef ALLE keywords terug.";

  try {
    var response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
      method: "post",
      contentType: "application/json",
      headers: { "x-api-key": CONFIG.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      payload: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 3000, messages: [{ role: "user", content: prompt }] }),
      muteHttpExceptions: true,
    });

    if (response.getResponseCode() !== 200) {
      sysLog("WARN", "Claude API fout " + response.getResponseCode());
      return items;
    }

    var data = JSON.parse(response.getContentText());
    var text = (data.content && data.content[0]) ? data.content[0].text : "[]";
    var claudeResults = JSON.parse(text.replace(/```json|```/g, "").trim());

    var claudeMap = {};
    claudeResults.forEach(function(r) { claudeMap[r.keyword] = r; });

    var enriched = [];
    items.forEach(function(item) {
      var cr = claudeMap[item.keyword];
      if (cr) {
        enriched.push({
          keyword:          item.keyword,
          source_type:      item.source_type,
          raw_value:        item.raw_value,
          timestamp:        item.timestamp,
          cluster:          cr.cluster || item.cluster,
          relevance_score:  round2(cr.relevance_score || item.relevance_score),
          spike_score:      round2(cr.spike_score || item.spike_score),
          confidence_score: round2(cr.confidence_score || item.confidence_score),
          explanation:      cr.explanation || item.explanation,
          seo_match:        cr.seo_match || "",
          seo_gap:          cr.seo_gap || "",
          seo_kans:         cr.seo_kans || "",
          seo_advies:       cr.seo_advies || "",
        });
      } else {
        enriched.push(item);
      }
    });

    sysLog("INFO", "Claude verrijking + SEO matching klaar: " + enriched.length + " items");
    return enriched;

  } catch (err) {
    sysLog("WARN", "Claude verrijking mislukt: " + err.message);
    return items;
  }
}

// ═══════════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════════

function logRawTrends(items, ts) {
  try {
    var sheet = getOrCreateSheet("Raw Trends");
    var rows = items.map(function(it) { return [ts, it.keyword, it.source_type, it.raw_value, CONFIG.REGION, it.cluster || ""]; });
    if (rows.length > 0) sheet.getRange(sheet.getLastRow()+1, 1, rows.length, rows[0].length).setValues(rows);
  } catch (err) { sysLog("WARN", "Raw Trends fout: " + err.message); }
}

function logRankedTrends(items, ts) {
  try {
    var sheet = getOrCreateSheet("Ranked Trends");
    var rows = items.map(function(it) {
      return [ts, it.keyword, it.cluster, it.relevance_score, it.spike_score, it.confidence_score, it.final_rank||"", it.trend_type||"actueel", it.seo_match||"", it.seo_gap||"", it.seo_kans||"", it.explanation||""];
    });
    if (rows.length > 0) sheet.getRange(sheet.getLastRow()+1, 1, rows.length, rows[0].length).setValues(rows);
  } catch (err) { sysLog("WARN", "Ranked Trends fout: " + err.message); }
}

function logSeoKansen(items, ts) {
  try {
    var sheet = getOrCreateSheet("SEO Kansen");
    var rows = items.map(function(it) {
      return [ts, it.keyword, it.cluster, it.spike_score, it.relevance_score, it.seo_match||"", it.seo_gap||"", it.seo_advies||""];
    });
    if (rows.length > 0) sheet.getRange(sheet.getLastRow()+1, 1, rows.length, rows[0].length).setValues(rows);
  } catch (err) { sysLog("WARN", "SEO Kansen fout: " + err.message); }
}

function getSiteContentFromSheet() {
  try {
    var sheet = getOrCreateSheet("Site Content");
    if (sheet.getLastRow() < 2) return [];
    var data = sheet.getRange(2, 1, sheet.getLastRow()-1, 5).getValues();
    return data.map(function(row) {
      return { timestamp: row[0], url: row[1], titel: row[2], categorie: row[3], zoekwoorden: row[4] };
    }).filter(function(a) { return a.titel; });
  } catch (err) { return []; }
}

function sysLog(level, message) {
  console.log("[" + level + "] " + message);
  try { getOrCreateSheet("Systeem Log").appendRow([new Date().toISOString(), level, message]); } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════════
// HULPFUNCTIES
// ═══════════════════════════════════════════════════════════════════

function composite(item) {
  return (item.relevance_score||0)*0.45 + (item.spike_score||0)*0.35 + (item.confidence_score||0)*0.20;
}
function round2(n) { return Math.round(parseFloat(n)*100)/100; }
function dedupeByKeyword(items) {
  var seen = {};
  return items.filter(function(it) { if (seen[it.keyword]) return false; seen[it.keyword]=true; return true; });
}
function getOrCreateSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
