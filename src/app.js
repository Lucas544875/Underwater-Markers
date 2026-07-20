import "./styles.css";
import { title, originalTitle, author, translator, chapters, credit } from "./content.js";
import { createSeaEffects } from "./effects.js";

const app = document.querySelector("#app");

function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function paragraphHtml(text) {
  return `<p class="line" data-effect-text>${escapeHtml(text)}</p>`;
}

function chapterHtml(chapter) {
  return `<section class="scene chapter" data-palette="${chapter.palette}" data-swell="${chapter.swell}">
    <span class="chapter-mark" aria-hidden="true">〇</span>
    ${chapter.paragraphs.map(paragraphHtml).join("")}
  </section>`;
}

function render() {
  document.title = title;
  app.innerHTML = `
    <section class="scene hero" data-palette="pre-dawn" data-swell="0.05">
      <p class="hero-kicker" data-effect-text>${escapeHtml(author)}</p>
      <h1 data-effect-text>${escapeHtml(title)}</h1>
      <p class="hero-original">${escapeHtml(originalTitle)}</p>
      <p class="hero-credit" data-effect-text>${escapeHtml(translator)}　訳</p>
      <span class="scroll-cue" aria-hidden="true">読み進める　↓</span>
    </section>
    <div class="page">
      ${chapters.map(chapterHtml).join("")}
      <footer class="scene colophon" data-palette="dawn2" data-swell="0.04">
        <p class="credit-text">${escapeHtml(credit.work)}</p>
        <p class="credit-links">
          <a href="${credit.sourceUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(credit.sourceLabel)}</a>
          <span aria-hidden="true">　・　</span>
          <a href="${credit.licenseUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(credit.licenseLabel)}</a>
        </p>
      </footer>
    </div>
  `;
}

render();
createSeaEffects();
