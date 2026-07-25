import "./styles.css";
import bookHtml from "./book.html?raw";
import { book } from "./content.js";
import { createOceanField } from "./effects.js";
import { createFluidDistortion } from "./distortion.js";

const app = document.querySelector("#app");
const motionButton = document.querySelector("#motion-toggle");
const motionLabel = document.querySelector("#motion-label");
const percentLabel = document.querySelector("#reader-percent");
const progressFill = document.querySelector("#reader-progress-fill");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

app.innerHTML = `
  <section class="opening" id="top" aria-labelledby="book-title">
    <div class="opening-water" aria-hidden="true">
      <i></i><i></i><i></i><i></i>
    </div>
    <div class="opening-inner">
      <p class="opening-overline"><span>EXPERIMENTAL READING</span><span>1952 / 2015</span></p>
      <div class="opening-title-wrap">
        <p class="opening-original">${book.originalTitle}</p>
        <h1 id="book-title" data-fluid-text data-fluid-whole>${book.title}</h1>
        <p class="opening-byline">${book.author}<small>${book.authorLatin}</small></p>
      </div>
      <div class="opening-bottom">
        <p class="opening-copy"></p>
        <a class="begin-reading" href="#book-start"><span>読みはじめる</span><i aria-hidden="true">↓</i></a>
      </div>
    </div>
  </section>

  <section class="book-shell" id="book-start" aria-labelledby="text-heading">
    <header class="text-frontispiece">
      <h2 id="text-heading">${book.title}</h2>
      <dl>
        <div><dt>著者</dt><dd>${book.author}</dd></div>
        <div><dt>翻訳</dt><dd>${book.translator}</dd></div>
        <div><dt>底本</dt><dd>${book.originalEdition}</dd></div>
      </dl>
    </header>

    <article class="book-copy" aria-label="老人と海 本文">
      ${bookHtml}
    </article>
  </section>

  <footer class="colophon" id="credit" aria-labelledby="credit-title">
    <div class="colophon-number" aria-hidden="true">85</div>
    <div class="colophon-main">
      <p class="colophon-kicker">TEXT &amp; LICENSE</p>
      <h2 id="credit-title">作品と翻訳について</h2>
      <p>
        『${book.title}』（${book.originalTitle}）<br />
        ${book.author} 著 ／ ${book.translator} 訳
      </p>
      <p>
        本サイトの翻訳文には<a href="${book.sourceUrl}" target="_blank" rel="noreferrer">青空文庫 No.57347 収録</a>のテキストを利用しています。当該翻訳文は、元ファイルに適用される
        <a href="${book.licenseUrl}" target="_blank" rel="license noreferrer">${book.licenseLabel}</a>の条件に従って掲載しています。
        このライセンスは、本サイトのその他のコンテンツには適用されません。
      </p>
      <p class="adaptation-note">
        本サイトでは、元のテキストから本文以外の部分を削除し、本文を数文字程度のオブジェクト単位に分割して動的に配置しています。
        翻訳内容そのものの改変は行っていません。
      </p>
      <div class="colophon-links">
      <a href="#top">はじめに戻る ↑</a>
        <a href="${book.sourceUrl}" target="_blank" rel="noreferrer">青空文庫</a>
      </div>
    </div>
  </footer>
`;

const rubyAnnotations = [...document.querySelectorAll("ruby > rt")];
let rubyLayoutFrame = 0;

function alignRubyAnnotations() {
  const edgePadding = 8;

  for (const annotation of rubyAnnotations) {
    annotation.style.removeProperty("--ruby-shift");
  }

  for (const annotation of rubyAnnotations) {
    const rect = annotation.getBoundingClientRect();
    let shift = 0;
    if (rect.left < edgePadding) {
      shift = edgePadding - rect.left;
    } else if (rect.right > innerWidth - edgePadding) {
      shift = innerWidth - edgePadding - rect.right;
    }
    if (shift) annotation.style.setProperty("--ruby-shift", `${shift}px`);
  }
}

function scheduleRubyAlignment() {
  if (rubyLayoutFrame) cancelAnimationFrame(rubyLayoutFrame);
  rubyLayoutFrame = requestAnimationFrame(() => {
    rubyLayoutFrame = 0;
    alignRubyAnnotations();
  });
}

const ocean = createOceanField({
  roots: [...document.querySelectorAll("[data-fluid-text]")]
    .filter((root) => !root.closest(".opening")),
  onActivity({ moved, active }) {
    const meter = document.querySelector("#active-segments");
    if (meter) meter.textContent = `${moved} / ${active}`;
  },
});

const distortion = createFluidDistortion({
  field: ocean,
  header: document.querySelector(".reader-bar"),
  hero: document.querySelector(".opening"),
  footer: document.querySelector(".colophon"),
});

let progressFrame = 0;
function updateReadingPosition() {
  progressFrame = 0;
  const scrollable = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  const progress = Math.max(0, Math.min(1, scrollY / scrollable));
  const percent = Math.round(progress * 100);
  percentLabel.textContent = `${percent}%`;
  progressFill.style.transform = `scaleX(${progress})`;
  distortion.invalidate("header");
}

addEventListener("scroll", () => {
  if (!progressFrame) progressFrame = requestAnimationFrame(updateReadingPosition);
}, { passive: true });

addEventListener("resize", scheduleRubyAlignment, { passive: true });

motionButton.addEventListener("click", () => {
  const paused = ocean.togglePaused();
  motionButton.setAttribute("aria-pressed", String(paused));
  motionLabel.textContent = paused ? "浮動を起こす" : "浮動を止める";
  distortion.invalidate("header");
});

if (reducedMotion) {
  motionButton.setAttribute("aria-pressed", "true");
  motionLabel.textContent = "浮動は停止中";
}

alignRubyAnnotations();
document.fonts?.ready.then(() => {
  alignRubyAnnotations();
  ocean.measure();
  distortion.invalidate();
});
updateReadingPosition();
