import "./styles.css";
import { articles, evidence, imagePath } from "./content.js";
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
      <img src="${imagePath}" alt="渇水で露出した湖底の旧道、バス停跡、赤い目印" />
      ${anomalyCount ? `<span class="photo-anomalies" aria-hidden="true">${anomalies}</span>` : ""}
      ${item.id >= 3 ? `<span class="photo-verification">撮影日時　${item.id >= 5 ? "照合不能" : "未確認"}</span>` : ""}
    </div>
    <figcaption><span>資料写真</span>${item.image.caption}</figcaption>
  </figure>`;
}

function finalArchive() {
  return `<section class="archive" aria-labelledby="archive-title">
    <div class="archive-heading"><p>復元ファイル 4件</p><h2 id="archive-title">順序情報がありません</h2></div>
    <div class="evidence-field">
      ${evidence.map((item, i) => `<article class="evidence evidence-${item.tone}" data-id="${item.id}" tabindex="0" style="--x:${i % 2 * 41 + 4}%;--y:${Math.floor(i / 2) * 37 + 3}%;--r:${[-2.5,1.8,2.2,-1.2][i]}deg">
        <div class="evidence-image" style="--focus:${item.pos}"><img src="${imagePath}" alt="復元された湖底の記録断片 ${i + 1}" draggable="false" /></div>
        <div class="evidence-meta"><time>${item.time}</time><p>${item.label}</p><span>IMG_0${31 + i}.JPG</span></div>
      </article>`).join("")}
    </div>
    <p class="archive-hint">画像を動かすと、復元前の位置情報は上書きされます。</p>
    <div class="last-record" ${isEndingVisible() ? "" : "hidden"}>
      <p>目印は消されたのではない。<br />見ようとした人間が多すぎたため、目印ではなくなった。</p>
      <small>捜索関係者は、事件発生直後の現場が維持されていれば、失踪者の移動経路を特定できた可能性があるとしている。</small>
      <blockquote>この記事には、公開当初、現場を示す画像が一枚掲載されていた。<br />現在、その画像がどれであったかを特定することはできない。</blockquote>
    </div>
  </section>`;
}

function isEndingVisible() { return state.evidenceMoves >= 3 || state.evidenceSeen.length === evidence.length; }

function renderArticle() {
  const item = articles[current - 1];
  if (!state.visited.includes(current)) state.visited.push(current);
  saveState(state);
  document.title = `${item.title} | 北嶺日報`;

  const paras = item.paragraphs.map((p) => `<p class="body-line">${p}</p>`).join("");
  const next = articles[current];
  app.innerHTML = `<article class="news-article depth-${current}">
    <header class="article-header">
      <div class="article-flags"><span>${item.section}</span><span>記事 ${String(current).padStart(2,"0")} / 07</span></div>
      <h1 data-effect-text>${item.title}</h1>
      <p class="lead" data-effect-text>${item.lead}</p>
      <dl class="byline"><div><dt>公開</dt><dd>${item.date}</dd></div><div><dt>更新</dt><dd>${item.updated}</dd></div><div><dt>取材</dt><dd>${item.author}</dd></div></dl>
    </header>
    ${articleFigure(item)}
    <div class="article-body" data-effect-text>${paras}</div>
    ${current === 7 ? finalArchive() : ""}
    <aside class="notice"><span>編集部注</span><p data-effect-text>${item.notice}</p></aside>
    <footer class="article-footer">
      ${current > 1 ? `<a class="previous-link" href="#article-${current - 1}">前の記録</a>` : `<span></span>`}
      ${next ? `<a class="related-link" href="#article-${current + 1}"><span>関連する記録</span><strong>${next.title}</strong><small>${next.date}</small></a>` : `<span class="archive-end">記録はここで途切れています</span>`}
    </footer>
  </article>`;
  renderRecords(); bindEvidence(); effects.refresh(current);
  scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function renderRecords() {
  recordsPanel.innerHTML = `<div class="records-title"><span>保存記録</span><strong>${state.visited.length} / 7</strong></div>${articles.map((a) => state.visited.includes(a.id) ? `<a href="#article-${a.id}" class="${a.id === current ? "current" : ""} visited"><span>${String(a.id).padStart(2,"0")}</span><span>${a.title}</span></a>` : `<div class="locked"><span>${String(a.id).padStart(2,"0")}</span><span>未取得の記録</span></div>`).join("")}`;
}

function bindEvidence() {
  const field = document.querySelector(".evidence-field"); if (!field) return;
  field.querySelectorAll(".evidence").forEach((card) => {
    let drag = null;
    const inspect = () => { if (!state.evidenceSeen.includes(card.dataset.id)) state.evidenceSeen.push(card.dataset.id); card.classList.add("inspected"); saveState(state); revealEnding(); };
    card.addEventListener("pointerdown", (event) => { inspect(); drag = { x:event.clientX, y:event.clientY, left:card.offsetLeft, top:card.offsetTop }; card.setPointerCapture(event.pointerId); card.classList.add("dragging"); });
    card.addEventListener("pointermove", (event) => { if (!drag) return; const maxX=field.clientWidth-card.offsetWidth; const maxY=field.clientHeight-card.offsetHeight; card.style.left=`${Math.max(0,Math.min(maxX,drag.left+event.clientX-drag.x))}px`; card.style.top=`${Math.max(0,Math.min(maxY,drag.top+event.clientY-drag.y))}px`; card.style.setProperty("--x","0px"); card.style.setProperty("--y","0px"); });
    card.addEventListener("pointerup", () => { if (!drag) return; drag=null; card.classList.remove("dragging"); state.evidenceMoves++; saveState(state); revealEnding(); });
    card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); inspect(); state.evidenceMoves++; card.style.transform=`translate(${(state.evidenceMoves%3-1)*18}px,${state.evidenceMoves%2*12}px) rotate(var(--r))`; revealEnding(); } });
  });
}

function revealEnding() {
  const ending=document.querySelector(".last-record"); if (ending && isEndingVisible()) { ending.hidden=false; requestAnimationFrame(()=>ending.classList.add("revealed")); }
}

recordsButton.addEventListener("click", () => { const open=recordsPanel.hidden; recordsPanel.hidden=!open; recordsButton.setAttribute("aria-expanded",String(open)); });
recordsPanel.addEventListener("click", (event) => { if(event.target.closest("a")){ recordsPanel.hidden=true; recordsButton.setAttribute("aria-expanded","false"); } });
document.querySelector("#reset-button").addEventListener("click",()=>resetDialog.showModal());
document.querySelector("#confirm-reset").addEventListener("click",()=>{ clearState(); state=loadState(); current=1; history.replaceState(null,"","#article-1"); effects.reset(); renderArticle(); });
addEventListener("hashchange",()=>{ current=getRoute(); renderArticle(); app.focus({preventScroll:true}); });
renderArticle();
