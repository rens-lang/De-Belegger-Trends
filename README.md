# De Belegger Trends

Twee onderdelen:

1. **`Code.gs`** — de volledige backend (draait in Google Sheets, automatisch elke 15 min)
2. **`app/`** — de installeerbare app voor laptop en telefoon

---

## Wat je moet doen (eenmalig, ~30 min)

### A. Backend starten in Google Sheets

1. Ga naar sheets.google.com → maak nieuw spreadsheet: **De Belegger Trends**
2. Extensies → Apps Script → verwijder alle bestaande code
3. Plak de volledige inhoud van `Code.gs`
4. Vul bovenaan je 3 sleutels in:
   - `ANTHROPIC_API_KEY` → haal op bij console.anthropic.com/settings/keys
   - `TELEGRAM_TOKEN` → maak bot via @BotFather in Telegram
   - `TELEGRAM_CHAT_ID` → stuur testbericht in je groep → open api.telegram.org/botTOKEN/getUpdates → zoek "chat" → "id"
5. Kies functie **setupSheets** → Uitvoeren → toestemming geven
6. Kies functie **setupTrigger** → Uitvoeren

Het systeem draait nu automatisch elke 15 minuten. Google Sheets vult zichzelf.

### B. App live zetten op Vercel

1. Ga naar vercel.com → gratis account aanmaken
2. Vercel new → sleep de **app** map op het scherm → Deploy
3. Je krijgt een URL (bijv. belegger-trends.vercel.app)

### C. Google Sheets koppelen aan de app

1. In je Google Sheet: Bestand → Delen → Publiceren op het web
2. Kies tabblad **Ranked Trends** → Bestandsindeling **CSV** → Publiceren
3. Kopieer de URL
4. Open de app → tab ⚙️ Instellen → plak de URL → klik Opslaan

### D. App installeren

- **iPhone**: Safari → Deel → Voeg toe aan beginscherm
- **Android**: Chrome → ⋮ → Toevoegen aan beginscherm  
- **Laptop**: Chrome/Edge → installeer-icoontje in adresbalk

---

## Kosten

| Wat | Kosten |
|-----|--------|
| Google Sheets + Apps Script | Gratis |
| Vercel hosting | Gratis |
| Anthropic API | ~€2–5/maand |
| Telegram | Gratis |

---

## Wat er automatisch gebeurt (elke 15 minuten)

1. Apps Script haalt Google Trends RSS op voor Nederland
2. Claude API scoort elk keyword op relevantie, spike en confidence
3. Niet-financiële trends worden weggefilterd
4. Top 10 + uitschieters worden gerankt en gelogd in Google Sheets
5. Bij spike_score > 0.70 → Telegram alert naar het team
6. App leest automatisch nieuwe data uit het Sheet
