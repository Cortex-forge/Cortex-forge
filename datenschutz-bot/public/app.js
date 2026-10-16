"use strict";

// Farbgruppe je Datenart (siehe style.css .g-*)
const GROUP = {
  PERSON: "person", FIRMA: "firma", EMAIL: "kontakt", TELEFON: "kontakt", IBAN: "finanz", KREDITKARTE: "finanz",
  UID: "finanz", STEUERNR: "finanz", ADRESSE: "adresse", GEBURTSDATUM: "id", AUSWEIS: "id", KENNZEICHEN: "id",
  KUNDENNR: "id", SVNR: "id", GESUNDHEIT: "sensibel", RELIGION: "sensibel", SONSTIGES: "sonst",
};
const STEPS = ["Prüfen", "KI arbeitet", "Ergebnis prüfen", "Erledigt"];
const STEP_INDEX = { neu: 0, bereit: 1, zur_pruefung: 2, freigegeben: 3, abgeschlossen: 4 };
const PLACEHOLDER_RE = /\[([A-ZÄÖÜ]+)_(\d+)(?::[^\]\n]*)?\]/g;

const state = { info: null, beispiele: [], list: [], current: null, selection: "", busy: false };
const main = document.getElementById("main");
const listEl = document.getElementById("doc-list");

// ---------------------------------------------------------------------------
// Hilfsfunktionen

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

async function api(path, options = {}) {
  const init = { method: options.method || "GET", headers: {} };
  if (options.body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.fehler || `Fehler ${res.status}`);
  return data;
}

function toast(message, isError) {
  const el = h("div", { class: "toast" + (isError ? " err" : ""), text: message });
  document.getElementById("toasts").append(el);
  setTimeout(() => el.remove(), isError ? 6000 : 3200);
}

async function act(fn, success) {
  if (state.busy) return;
  state.busy = true;
  try {
    await fn();
    if (success) toast(success);
  } catch (err) {
    toast(err.message, true);
  } finally {
    state.busy = false;
  }
}

function relTime(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
  return new Date(iso).toLocaleDateString("de-AT");
}

const EURO = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" });
const euro = (n) => EURO.format(n);
const artLabel = (id) => (state.info?.arten.find((a) => a.id === id) || {}).label || id;
const typeLabel = (id) => (state.info?.typen.find((t) => t.id === id) || {}).label || id;
const statusLabel = (s) => (state.info?.status || {})[s] || s;

/** Titel eines Dokuments: Betreff-Zeile, sonst erste Zeile. */
function docTitle(text) {
  const lines = (text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const subject = lines.find((l) => /^(Betreff|Subject|Oggetto|Onderwerp)\s*:/i.test(l));
  return (subject ? subject.replace(/^[^:]+:\s*/, "") : lines[0] || "").slice(0, 90);
}

function badge(status) {
  return h("span", { class: `badge st-${status}`, text: statusLabel(status) });
}

/** Original mit farbig markierten Fundstellen. */
function highlightOriginal(text, marks) {
  const frag = document.createDocumentFragment();
  let pos = 0;
  for (const m of [...marks].sort((a, b) => a.start - b.start)) {
    if (m.start < pos) continue;
    frag.append(text.slice(pos, m.start));
    frag.append(h("mark", {
      class: `ent g-${GROUP[m.type] || "sonst"}`,
      title: `${m.id} · ${typeLabel(m.type)} (${m.source})`,
      text: text.slice(m.start, m.end),
    }));
    pos = m.end;
  }
  frag.append(text.slice(pos));
  return frag;
}

/** Platzhalter in einem KI-Text farbig hervorheben. */
function highlightPlaceholders(text) {
  const frag = document.createDocumentFragment();
  let pos = 0;
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    frag.append(text.slice(pos, m.index));
    frag.append(h("span", { class: `ph g-${GROUP[m[1]] || "sonst"}`, title: typeLabel(m[1]), text: m[0] }));
    pos = m.index + m[0].length;
  }
  frag.append(text.slice(pos));
  return frag;
}

// ---------------------------------------------------------------------------
// Seitenleiste

function renderList() {
  listEl.replaceChildren();
  if (state.list.length === 0) {
    listEl.append(h("p", { class: "empty-list", text: "Noch keine Dokumente. Lege eines ab oder lade ein Beispiel." }));
    return;
  }
  for (const doc of state.list) {
    const active = state.current && state.current.job.id === doc.id && location.hash === `#${doc.id}`;
    listEl.append(
      h("button", { class: "doc-item" + (active ? " active" : ""), type: "button", onclick: () => (location.hash = doc.id) },
        h("span", { class: "t", text: doc.titel || doc.id }),
        h("span", { class: "m" },
          badge(doc.status),
          h("span", { text: artLabel(doc.art) }),
          h("span", { text: relTime(doc.erstellt) }),
          doc.hinweise ? h("span", { text: `⚠ ${doc.hinweise}` }) : null,
        ),
      ),
    );
  }
}

async function refreshList() {
  state.list = await api("/api/dokumente");
  renderList();
}

// ---------------------------------------------------------------------------
// Neues Dokument

function renderNew() {
  state.current = null;
  renderList();
  const arten = state.info.arten;
  const form = h("form", { class: "card", onsubmit: (e) => { e.preventDefault(); submit(); } });
  const textArea = h("textarea", { id: "f-text", required: true, placeholder: "E-Mail, Rechnung oder Notiz hier einfügen …" });
  const betreff = h("input", { id: "f-betreff", type: "text", placeholder: "z. B. Anfrage Februar" });
  const fileInput = h("input", { type: "file", accept: ".txt,.eml,.md,.csv,text/plain", onchange: async (e) => {
    const file = e.target.files[0];
    if (file) textArea.value = await file.text();
  } });

  const seg = h("div", { class: "segmented", role: "radiogroup", "aria-label": "Art des Dokuments" },
    arten.map((a, i) => h("label", {}, h("input", { type: "radio", name: "art", value: a.id, checked: i === 0 }), a.label)),
  );

  async function submit() {
    const art = form.querySelector("input[name=art]:checked").value;
    await act(async () => {
      const { id } = await api("/api/dokumente", { method: "POST", body: { art, betreff: betreff.value, text: textArea.value } });
      await refreshList();
      location.hash = id;
    }, "Dokument abgelegt. Bitte prüfen, was die KI sehen wird.");
  }

  function loadExample(ex) {
    textArea.value = ex.text;
    betreff.value = ex.betreff;
    form.querySelector(`input[name=art][value=${ex.art}]`).checked = true;
  }

  form.append(
    h("div", { class: "field" }, h("span", { class: "label", text: "Art" }), seg),
    h("div", { class: "field" }, h("label", { for: "f-betreff", text: "Betreff (optional)" }), betreff),
    h("div", { class: "field" }, h("label", { for: "f-text", text: "Inhalt" }), textArea),
    h("div", { class: "row spread" },
      h("div", { class: "row" },
        h("span", { class: "muted", text: "Beispiel laden:" }),
        state.beispiele.map((ex) => h("button", { type: "button", class: "small", onclick: () => loadExample(ex), text: ex.titel })),
      ),
      h("div", { class: "row" },
        h("label", { class: "small muted" }, "Datei: ", fileInput),
        h("button", { type: "submit", class: "primary", text: "Prüfen →" }),
      ),
    ),
  );

  main.replaceChildren(
    h("h2", { text: "Dokument ablegen" }),
    h("p", { class: "lead", text: "Der Bot ersetzt Namen, Adressen, Kontodaten und andere persönliche Angaben durch Platzhalter. Du siehst vorher genau, was die KI bekommt." }),
    form,
  );
}

// ---------------------------------------------------------------------------
// KI verbinden

function renderHelp() {
  state.current = null;
  renderList();
  const p = state.info.mcpPfad;
  main.replaceChildren(
    h("h2", { text: "KI verbinden" }),
    h("p", { class: "lead", text: "Der Bot ist ein MCP-Server. Claude und Codex sprechen ihn direkt an und bekommen nur die Platzhalter-Version freigegebener Dokumente." }),
    h("div", { class: "card" },
      h("h3", { text: "Claude Code" }),
      h("pre", { class: "snippet", text: `claude mcp add datenschutz-bot -- node ${p}` }),
      h("h3", { text: "Claude Desktop (claude_desktop_config.json)" }),
      h("pre", { class: "snippet", text: JSON.stringify({ mcpServers: { "datenschutz-bot": { command: "node", args: [p] } } }, null, 2) }),
      h("h3", { text: "Codex (~/.codex/config.toml)" }),
      h("pre", { class: "snippet", text: `[mcp_servers.datenschutz-bot]\ncommand = "node"\nargs = ["${p}"]` }),
      h("h3", { text: "Und dann in Claude oder Codex sagen" }),
      h("pre", { class: "snippet", text: "Bearbeite die freigegebenen Dokumente im Datenschutz-Bot:\nHotel-Anfragen beantworten, für Belege Buchungsvorschläge machen." }),
      h("p", { class: "muted", text: "Wichtig: Dokumente nicht direkt in den Chat ziehen. Sonst sieht die KI das Original. Immer hier ablegen und freigeben." }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Dokument-Ansicht

function stepper(status) {
  const idx = STEP_INDEX[status];
  return h("ol", { class: "stepper" },
    STEPS.map((s, i) => h("li", { class: i < idx ? "done" : i === idx ? "current" : "", text: s })),
  );
}

function findingsTable(detail) {
  const rows = detail.zuordnung.map((e) =>
    h("tr", {},
      h("td", {}, h("span", { class: `ph g-${GROUP[e.type] || "sonst"}`, text: e.description ? `[${e.id}: ${e.description}]` : `[${e.id}]` })),
      h("td", { text: e.variants.join(" · ") }),
      h("td", { text: typeLabel(e.type) }),
      h("td", { class: "r" }, h("button", { class: "small", type: "button", text: "Nicht sensibel", onclick: () =>
        act(async () => {
          for (const v of e.variants) await api(`/api/dokumente/${detail.job.id}/ausnehmen`, { method: "POST", body: { wert: v } });
          await loadDetail(detail.job.id);
        }, "Wird nicht mehr ersetzt."),
      })),
    ),
  );
  return h("div", { class: "pane" },
    h("h3", {}, "Ersetzte Angaben", h("small", { text: `${detail.zuordnung.length} Platzhalter` })),
    rows.length
      ? h("div", { class: "table-wrap" }, h("table", { class: "data" },
          h("thead", {}, h("tr", {}, h("th", { text: "Platzhalter" }), h("th", { text: "Original" }), h("th", { text: "Art" }), h("th"))),
          h("tbody", {}, rows)))
      : h("p", { class: "muted", text: "Nichts gefunden. Markiere Sensibles bei Bedarf im Original." }),
  );
}

function manualList(detail) {
  const items = [
    ...detail.manuell.map((m) => ({ value: m.value, text: `geschwärzt: „${m.value}“ (${typeLabel(m.type)})` })),
    ...detail.ausgeschlossen.map((v) => ({ value: v, text: `nicht sensibel: „${v}“` })),
  ];
  if (!items.length) return null;
  return h("div", { class: "callout" },
    h("strong", { text: "Deine Änderungen" }),
    h("ul", {}, items.map((it) => h("li", {}, it.text, " ",
      h("button", { class: "small ghost", type: "button", text: "zurücknehmen", onclick: () =>
        act(async () => {
          await api(`/api/dokumente/${detail.job.id}/zuruecknehmen`, { method: "POST", body: { wert: it.value } });
          await loadDetail(detail.job.id);
        }),
      }),
    ))),
  );
}

function viewNeu(detail) {
  const orig = h("pre", { class: "doc", id: "orig" }, highlightOriginal(detail.original, detail.markierungen));
  const typeSelect = h("select", { "aria-label": "Art der Angabe" },
    state.info.typen.map((t) => h("option", { value: t.id, text: t.label, selected: t.id === "PERSON" })),
  );
  const selLabel = h("span", { class: "muted", id: "sel-label", text: "Text im Original markieren, dann schwärzen." });
  state.selection = "";

  return [
    h("div", { class: "callout info" },
      h("strong", { text: "Prüfe, was die KI sehen wird. " }),
      "Fehlt etwas? Markiere es links im Original und klicke „Schwärzen“. Zu viel ersetzt? „Nicht sensibel“ in der Tabelle.",
    ),
    h("div", { class: "panes" },
      h("div", { class: "pane" },
        h("h3", {}, "Original", h("small", { text: "bleibt bei euch" })),
        orig,
        h("div", { class: "selbar" },
          selLabel,
          typeSelect,
          h("button", { class: "small", type: "button", text: "Schwärzen", onclick: () => {
            const value = state.selection.trim();
            if (!value) return toast("Bitte zuerst Text im Original markieren.", true);
            act(async () => {
              await api(`/api/dokumente/${detail.job.id}/markieren`, { method: "POST", body: { wert: value, typ: typeSelect.value } });
              await loadDetail(detail.job.id);
            }, "Geschwärzt.");
          } }),
        ),
      ),
      h("div", { class: "pane" },
        h("h3", {}, "Das sieht die KI", h("small", { text: "nur Platzhalter" })),
        h("pre", { class: "doc" }, highlightPlaceholders((detail.job.betreffKi ? detail.job.betreffKi + "\n\n" : "") + detail.job.textKi)),
      ),
    ),
    manualList(detail),
    findingsTable(detail),
    h("div", { class: "bar" },
      h("button", { class: "primary", type: "button", text: "Für KI freigeben", onclick: () =>
        act(async () => {
          await api(`/api/dokumente/${detail.job.id}/ki-freigeben`, { method: "POST", body: {} });
          await loadDetail(detail.job.id);
          await refreshList();
        }, "Freigegeben. Die KI kann das Dokument jetzt lesen."),
      }),
    ),
  ];
}

function viewBereit(detail) {
  return [
    h("div", { class: "callout info" },
      h("div", { class: "waiting" }, h("span", { class: "pulse" }), h("strong", { text: "Wartet auf die KI." })),
      h("p", { style: "margin:8px 0 0" }, "Sag in Claude oder Codex: ",
        h("code", { text: "„Bearbeite die freigegebenen Dokumente im Datenschutz-Bot.“" }),
        " Das Ergebnis erscheint hier automatisch."),
    ),
    h("div", { class: "pane" },
      h("h3", {}, "Das sieht die KI", h("small", { text: "nur Platzhalter" })),
      h("pre", { class: "doc" }, highlightPlaceholders((detail.job.betreffKi ? detail.job.betreffKi + "\n\n" : "") + detail.job.textKi)),
    ),
  ];
}

function resultView(detail) {
  const r = detail.ergebnis;
  if (!r) return h("p", { class: "muted", text: "Kein Ergebnis vorhanden." });
  if (r.art === "text") {
    return h("div", {},
      r.titel ? h("div", { class: "result-title", text: r.titel }) : null,
      h("p", { class: "result-text", text: r.text }),
    );
  }
  if (r.art === "buchungen") {
    return h("div", { class: "table-wrap" }, h("table", { class: "data" },
      h("thead", {}, h("tr", {}, ["Datum", "Beleg", "Konto", "Gegenkonto", "Text", "Netto", "USt", "Brutto"].map((c, i) =>
        h("th", { class: i >= 5 ? "r" : "", text: c })))),
      h("tbody", {},
        r.buchungen.map((b) => h("tr", {},
          h("td", { text: b.datum }), h("td", { text: b.belegnummer || "" }), h("td", { text: b.konto }),
          h("td", { text: b.gegenkonto }), h("td", { text: b.text }), h("td", { class: "r", text: euro(b.netto) }),
          h("td", { class: "r", text: `${euro(b.ust_betrag)} (${b.ust_satz} %)` }), h("td", { class: "r", text: euro(b.brutto) }),
        )),
        h("tr", { class: "sum" }, h("td", { colspan: 5, text: "Summe" }), h("td", { class: "r", text: euro(r.summen.netto) }),
          h("td", { class: "r", text: euro(r.summen.ust) }), h("td", { class: "r", text: euro(r.summen.brutto) })),
      ),
    ));
  }
  const frame = h("iframe", { class: "invoice", title: "Rechnung", sandbox: "allow-same-origin allow-modals" });
  frame.srcdoc = r.html;
  return h("div", {},
    frame,
    h("div", { class: "row", style: "margin-top:10px" },
      h("button", { class: "small", type: "button", text: "Drucken / als PDF speichern", onclick: () => frame.contentWindow.print() }),
    ),
  );
}

function plainResult(r) {
  if (!r) return "";
  if (r.art === "text") return (r.titel ? r.titel + "\n\n" : "") + r.text;
  if (r.art === "buchungen") {
    return r.buchungen.map((b) => [b.datum, b.belegnummer || "", b.konto, b.gegenkonto, b.text, b.netto, b.ust_satz, b.brutto].join("\t")).join("\n");
  }
  return "";
}

function checksView(job) {
  const p = job.pruefung;
  if (!p) return null;
  const warnings = [
    ...p.unbekannt.map((u) => `Die KI hat einen Platzhalter verwendet, den es nicht gibt: ${u}`),
    ...p.erfunden.map((e) => `Die KI hat selbst ${e.label === "E-Mail" ? "eine E-Mail-Adresse" : e.label} geschrieben: ${e.value}. Bitte prüfen.`),
    ...p.hinweise,
  ];
  const info = p.repariert.length ? `Leicht veränderte Platzhalter wurden erkannt und ersetzt: ${p.repariert.join(", ")}` : null;
  if (!warnings.length && !info) {
    return h("div", { class: "callout ok" }, h("strong", { text: "Keine Auffälligkeiten. " }), "Alle Platzhalter wurden zurückübersetzt. Bitte trotzdem inhaltlich prüfen.");
  }
  return h("div", { class: warnings.length ? "callout warn" : "callout info" },
    h("strong", { text: warnings.length ? `${warnings.length} Prüfhinweis(e)` : "Hinweis" }),
    h("ul", {}, warnings.map((w) => h("li", { text: w })), info ? h("li", { text: info }) : null),
  );
}

function aiAnswer(job) {
  if (!job.ergebnisKi) return null;
  const e = job.ergebnisKi;
  const text = e.art === "text" ? (e.titel ? e.titel + "\n\n" : "") + e.text : JSON.stringify(e.art === "buchungen" ? e.buchungen : e.rechnung, null, 2);
  return h("details", { class: "box" },
    h("summary", { text: "Antwort der KI (so hat sie es geschrieben, mit Platzhaltern)" }),
    h("pre", { class: "doc", style: "margin-top:10px" }, highlightPlaceholders(text)),
  );
}

function copyButton(detail) {
  const text = plainResult(detail.ergebnis);
  if (!text) return null;
  return h("button", { type: "button", text: "Kopieren", onclick: async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast("In die Zwischenablage kopiert.");
    } catch {
      toast("Kopieren nicht möglich. Bitte Text markieren und kopieren.", true);
    }
  } });
}

function viewPruefung(detail) {
  const id = detail.job.id;
  return [
    checksView(detail.job),
    h("div", { class: "pane" }, h("h3", {}, "Ergebnis mit echten Daten", h("small", { text: "nur hier sichtbar" })), resultView(detail)),
    aiAnswer(detail.job),
    h("div", { class: "bar" },
      h("button", { type: "button", text: "Zurück an die KI", onclick: () =>
        act(async () => {
          await api(`/api/dokumente/${id}/zurueck`, { method: "POST", body: {} });
          await loadDetail(id);
          await refreshList();
        }, "Ergebnis verworfen. Die KI kann es neu bearbeiten."),
      }),
      copyButton(detail),
      h("button", { class: "primary", type: "button", text: "Freigeben ✓", onclick: () =>
        act(async () => {
          await api(`/api/dokumente/${id}/freigeben`, { method: "POST", body: {} });
          await loadDetail(id);
          await refreshList();
        }, detail.ergebnis && detail.ergebnis.art === "rechnung" ? "Freigegeben, Rechnungsnummer vergeben." : "Freigegeben."),
      }),
    ),
  ];
}

function viewFreigegeben(detail) {
  const id = detail.job.id;
  return [
    h("div", { class: "callout ok" },
      h("strong", { text: "Freigegeben. " }),
      detail.job.rechnungsnummer ? `Rechnungsnummer ${detail.job.rechnungsnummer}. ` : "",
      "Jetzt herunterladen oder kopieren und versenden bzw. buchen. Danach abschließen, dann werden die Originaldaten gelöscht.",
    ),
    h("div", { class: "pane" }, h("h3", { text: "Ergebnis" }), resultView(detail)),
    h("div", { class: "bar" },
      h("a", { class: "btn", href: `/api/dokumente/${id}/export`, download: "", text: "Herunterladen" }),
      copyButton(detail),
      h("button", { class: "danger", type: "button", text: "Abschließen & Originaldaten löschen", onclick: () => {
        if (!confirm("Originaldaten, Zuordnung und Ergebnis endgültig löschen? Lade das Ergebnis vorher herunter.")) return;
        act(async () => {
          await api(`/api/dokumente/${id}/abschliessen`, { method: "POST", body: {} });
          await loadDetail(id);
          await refreshList();
        }, "Abgeschlossen. Originaldaten gelöscht.");
      } }),
    ),
  ];
}

function viewAbgeschlossen(detail) {
  return [
    h("div", { class: "callout" },
      h("strong", { text: "Abgeschlossen. " }),
      "Originaldaten, Zuordnung und Ergebnis wurden gelöscht. Übrig ist nur die anonyme Platzhalter-Version.",
    ),
    h("div", { class: "pane" },
      h("h3", { text: "Platzhalter-Version" }),
      h("pre", { class: "doc" }, highlightPlaceholders((detail.job.betreffKi ? detail.job.betreffKi + "\n\n" : "") + detail.job.textKi)),
    ),
  ];
}

function renderDetail(detail) {
  const job = detail.job;
  const views = { neu: viewNeu, bereit: viewBereit, zur_pruefung: viewPruefung, freigegeben: viewFreigegeben, abgeschlossen: viewAbgeschlossen };
  const title = docTitle(detail.original || (job.betreffKi ? job.betreffKi + "\n" : "") + job.textKi) || job.id;

  const head = h("div", { class: "doc-head" },
    h("div", {},
      h("div", { class: "kicker", text: artLabel(job.art) }),
      h("h2", { text: title }),
      h("div", { class: "sub", text: `${job.id} · abgelegt ${relTime(job.erstellt)} · ${job.platzhalter.length} Angaben ersetzt` }),
    ),
    h("div", { class: "row" }, badge(job.status),
      h("button", { class: "small danger", type: "button", text: "Verwerfen", onclick: () => {
        if (!confirm("Dokument komplett löschen?")) return;
        act(async () => {
          await api(`/api/dokumente/${job.id}`, { method: "DELETE" });
          location.hash = "neu";
          await refreshList();
        }, "Dokument gelöscht.");
      } }),
    ),
  );

  const protocol = h("details", { class: "box protocol" },
    h("summary", { text: "Protokoll" }),
    h("ul", {}, (detail.protokoll || []).map((p) =>
      h("li", {}, h("b", { text: new Date(p.zeit).toLocaleString("de-AT") }), ` · ${p.quelle === "ki" ? "KI" : p.quelle === "oberflaeche" ? "Oberfläche" : "System"} · ${p.ereignis}`),
    )),
  );

  main.replaceChildren(head, job.status === "abgeschlossen" ? h("div") : stepper(job.status), ...views[job.status](detail).filter(Boolean), protocol);
}

async function loadDetail(id) {
  const detail = await api(`/api/dokumente/${id}`);
  state.current = detail;
  renderDetail(detail);
  renderList();
}

// ---------------------------------------------------------------------------
// Navigation, Auswahl, Aktualisierung

async function route() {
  const hash = location.hash.slice(1);
  try {
    if (/^D-[0-9a-f]{6}$/.test(hash)) await loadDetail(hash);
    else if (hash === "hilfe") renderHelp();
    else renderNew();
  } catch (err) {
    toast(err.message, true);
    renderNew();
  }
}

document.addEventListener("selectionchange", () => {
  const orig = document.getElementById("orig");
  const label = document.getElementById("sel-label");
  const sel = document.getSelection();
  if (!orig || !label || !sel || sel.rangeCount === 0) return;
  if (!orig.contains(sel.anchorNode) || !orig.contains(sel.focusNode)) return;
  const text = sel.toString().trim();
  if (!text) return;
  state.selection = text;
  label.textContent = `Ausgewählt: „${text.length > 40 ? text.slice(0, 40) + "…" : text}“ schwärzen als`;
});

async function poll() {
  try {
    await refreshList();
    const cur = state.current;
    if (cur && location.hash === `#${cur.job.id}`) {
      const fresh = state.list.find((d) => d.id === cur.job.id);
      const selecting = document.getSelection() && document.getSelection().toString().trim();
      if (fresh && fresh.aktualisiert !== cur.job.aktualisiert && !selecting) await loadDetail(cur.job.id);
    }
  } catch {
    // Server kurz nicht erreichbar: beim nächsten Durchlauf erneut versuchen.
  }
}

async function init() {
  [state.info, state.beispiele] = await Promise.all([api("/api/info"), api("/api/beispiele")]);
  document.getElementById("btn-new").addEventListener("click", () => {
    if (location.hash === "#neu") renderNew();
    location.hash = "neu";
  });
  document.getElementById("btn-help").addEventListener("click", () => (location.hash = "hilfe"));
  window.addEventListener("hashchange", route);
  await refreshList();
  await route();
  setInterval(poll, 3000);
}

init().catch((err) => {
  main.replaceChildren(h("div", { class: "callout warn", text: `Die Oberfläche konnte nicht geladen werden: ${err.message}` }));
});
