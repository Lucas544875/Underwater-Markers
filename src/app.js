import "./styles.css";
import { articles, ending, evidence, imagePath } from "./content.js";
import { clearState, loadState, saveState } from "./state.js";
import { createHorrorEffects } from "./effects.js";

const app = document.querySelector("#app");
const recordsPanel = document.querySelector("#records-panel");
const recordsButton = document.querySelector("#records-button");
const resetDialog = document.querySelector("#reset-dialog");
let state = loadState();
let current = getRoute();
const effects = createHorrorEffects({ getState: () => state, save: () => saveState(state) });

function getRoute() {
  const id = Number(location.hash.match(/article-(\d+)/)?.[1] || 1);
  return Math.min(7, Math.max(1, id));
}

function articleFigure(item) {
  if (!item.image) return "";
  const anomalyCount = item.id >= 4 && item.image.crop !== "missing" ? Math.min(6, item.id - 1) : 0;
  const anomalies = Array.from({ length: anomalyCount }, (_, index) => {
    const left = [18, 33, 47, 62, 76, 86][index];
    const top = [58, 41, 66, 49, 61, 35][index];
    const height = [16, 22, 13, 19, 24, 14][index];
    return `<i class="photo-marker marker-${index + 1}" style="--marker-x:${left}%;--marker-y:${top}%;--marker-h:${height}%"></i>`;
  }).join("");
  return `<figure class="article-photo crop-${item.image.crop}">
    <div class="photo-frame">
      <img src="${imagePath}" alt="${item.image.caption}" />
      ${anomalyCount ? `<span class="photo-anomalies" aria-hidden="true">${anomalies}</span>` : ""}
      ${anomalyCount ? `<span class="photo-verification">画像劣化　なし（写像則）</span>` : ""}
    </div>
    <figcaption><span>収蔵画像</span>${item.image.caption}</figcaption>
  </figure>`;
}

function paragraphHtml(entry) {
  if (typeof entry === "string") return `<p class="body-line">${entry}</p>`;
  if (entry.kind === "buoyant") return `<p class="body-line line-buoyant">${entry.text}</p>`;
  return `<p class="body-line line-drowned w${entry.w || 1}">${entry.text}</p>`;
}

function experimentTable(table) {
  if (!table) return "";
  return `<div class="exp-table"><table>
    <thead><tr>${table.head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${table.rows.map((row) => `<tr class="${row.cls.includes("control") ? "control-row" : ""}">
      <td class="specimen ${row.cls}">${row.text}</td><td>${row.result}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function finalArchive() {
  const spots = [[6, 4], [52, 2], [30, 34], [4, 64], [55, 60]];
  const tilts = [-2, 1.6, -1.2, 2.4, -2.2];
  return `<section class="archive" aria-labelledby="archive-title">
    <div class="archive-heading"><p>付録YMS-B 収蔵断片 5点</p><h2 id="archive-title">各断片の閲覧は、一度しか行えません</h2></div>
    <div class="evidence-field">
      ${evidence.map((item, i) => {
        const seen = state.evidenceSeen.includes(item.id);
        return `<article class="evidence evidence-${item.tone}" data-id="${item.id}" tabindex="0" style="--x:${spots[i][0]}%;--y:${spots[i][1]}%;--r:${tilts[i]}deg">
        <div class="evidence-doc ${seen ? "drowned-out" : "sealed"}">
          <span class="frag-name">${item.name}</span>
          <span class="frag-quote">${seen ? "──　判読不能　──" : item.quote}</span>
        </div>
        <div class="evidence-meta"><time>${item.file}</time><p>${item.label}</p><span class="frag-state">${seen ? "閲覧済 / 溺没" : "未閲覧 / 閲覧は一度のみ"}</span></div>
      </article>`;
      }).join("")}
    </div>
    <p class="archive-hint">触れた断片は、溺れ始めます。</p>
    <button class="finish-reading" type="button">これ以上読まずに、閲覧を終了する</button>
    <div class="last-record" ${isEndingVisible() ? "" : "hidden"}>
      <p class="pristine">${ending.pristine}</p>
      <blockquote class="pristine">${ending.assurance}</blockquote>
      <div class="view-count">
        <p>閲覧記録：あなたは本文書 第9版の${ending.viewerNumber.toLocaleString("ja-JP")}人目の閲覧者です。</p>
        <p>あなたの閲覧により、本文書の残存率は${(state.damage * 3.1 + 0.02).toFixed(2)}％低下しました。</p>
        <p>次の閲覧者に残る本文は、あなたが読んだものより少ない。</p>
      </div>
      <a class="return-link" href="#article-1">${ending.returnLabel}</a>
    </div>
  </section>`;
}

function isEndingVisible() { return state.endingSeen || state.evidenceSeen.length === evidence.length; }

function renderArticle() {
  const item = articles[current - 1];
  if (!state.visited.includes(current)) state.visited.push(current);
  saveState(state);
  document.title = `${item.title} | 記録保全機構`;
  document.body.classList.toggle("ending-seen", state.endingSeen);

  const paras = item.paragraphs.map(paragraphHtml).join("");
  const next = articles[current];
  app.innerHTML = `<article class="news-article depth-${current}">
    <header class="article-header">
      <div class="article-flags"><span>${item.section}</span><span>文書 ${String(current).padStart(2,"0")} / 07</span></div>
      <h1 data-effect-text>${item.title}</h1>
      <p class="lead" data-effect-text>${item.lead}</p>
      <dl class="byline">${item.meta.map((m) => `<div><dt>${m.k}</dt><dd>${m.v}</dd></div>`).join("")}</dl>
    </header>
    ${articleFigure(item)}
    ${experimentTable(item.table)}
    <div class="article-body" data-effect-text>${paras}</div>
    ${current === 7 ? finalArchive() : ""}
    <aside class="notice"><span>機構注記</span><p data-effect-text>${item.notice}</p></aside>
    <footer class="article-footer">
      ${current > 1 ? `<a class="previous-link" href="#article-${current - 1}">前の文書</a>` : `<span></span>`}
      ${next ? `<a class="related-link" href="#article-${current + 1}"><span>次の文書</span><strong>${next.title}</strong><small>${next.section}</small></a>` : `<span class="archive-end">この先の文書は存在しません</span>`}
    </footer>
  </article>`;
  renderRecords(); bindEvidence(); effects.refresh(current);
  scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function renderRecords() {
  recordsPanel.innerHTML = `<div class="records-title"><span>文書一覧</span><strong>${state.visited.length} / 7</strong></div>${articles.map((a) => state.visited.includes(a.id) ? `<a href="#article-${a.id}" class="${a.id === current ? "current" : ""} visited"><span>${String(a.id).padStart(2,"0")}</span><span>${a.title}</span></a>` : `<div class="locked"><span>${String(a.id).padStart(2,"0")}</span><span>未閲覧の文書</span></div>`).join("")}`;
}

function bindEvidence() {
  const field = document.querySelector(".evidence-field"); if (!field) return;
  document.querySelector(".finish-reading")?.addEventListener("click", () => revealEnding(true));
  field.querySelectorAll(".evidence").forEach((card) => {
    let drag = null;
    const doc = card.querySelector(".evidence-doc");
    const stateLabel = card.querySelector(".frag-state");
    const inspect = () => {
      if (state.evidenceSeen.includes(card.dataset.id)) return;
      state.evidenceSeen.push(card.dataset.id);
      card.classList.add("inspected");
      doc.classList.remove("sealed");
      stateLabel.textContent = "閲覧中 / 溺れています";
      saveState(state);
      setTimeout(() => {
        doc.classList.add("drowning");
        stateLabel.textContent = "閲覧済 / 溺没";
        revealEnding();
      }, 9000);
    };
    card.addEventListener("pointerdown", (event) => { inspect(); drag = { x:event.clientX, y:event.clientY, left:card.offsetLeft, top:card.offsetTop }; card.setPointerCapture(event.pointerId); card.classList.add("dragging"); });
    card.addEventListener("pointermove", (event) => { if (!drag) return; const maxX=field.clientWidth-card.offsetWidth; const maxY=field.clientHeight-card.offsetHeight; card.style.left=`${Math.max(0,Math.min(maxX,drag.left+event.clientX-drag.x))}px`; card.style.top=`${Math.max(0,Math.min(maxY,drag.top+event.clientY-drag.y))}px`; card.style.setProperty("--x","0px"); card.style.setProperty("--y","0px"); });
    card.addEventListener("pointerup", () => { if (!drag) return; drag=null; card.classList.remove("dragging"); state.evidenceMoves++; saveState(state); });
    card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); inspect(); } });
  });
}

function revealEnding(force = false) {
  const panel=document.querySelector(".last-record"); if (!panel || (!force && !isEndingVisible())) return;
  panel.hidden=false; requestAnimationFrame(()=>panel.classList.add("revealed"));
  if (!state.endingSeen) { state.endingSeen=true; saveState(state); document.body.classList.add("ending-seen"); }
}

recordsButton.addEventListener("click", () => { const open=recordsPanel.hidden; recordsPanel.hidden=!open; recordsButton.setAttribute("aria-expanded",String(open)); });
recordsPanel.addEventListener("click", (event) => { if(event.target.closest("a")){ recordsPanel.hidden=true; recordsButton.setAttribute("aria-expanded","false"); } });
document.querySelector("#reset-button").addEventListener("click",()=>resetDialog.showModal());
document.querySelector("#confirm-reset").addEventListener("click",()=>{ clearState(); state=loadState(); current=1; history.replaceState(null,"","#article-1"); effects.reset(); renderArticle(); });
addEventListener("hashchange",()=>{ current=getRoute(); renderArticle(); app.focus({preventScroll:true}); });
renderArticle();
