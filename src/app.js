import "./styles.css";
import bookHtml from "./book.html?raw";
import { book, readingPhases } from "./content.js";
import { createOceanField } from "./effects.js";

const app = document.querySelector("#app");
const motionButton = document.querySelector("#motion-toggle");
const motionLabel = document.querySelector("#motion-label");
const percentLabel = document.querySelector("#reader-percent");
const phaseLabel = document.querySelector("#reader-phase");
const progressFill = document.querySelector("#reader-progress-fill");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

app.innerHTML = `
  <section class="opening" id="top" aria-labelledby="book-title">
    <div class="opening-water" aria-hidden="true">
      <i></i><i></i><i></i><i></i>
    </div>
    <div class="opening-inner">
      <p class="opening-overline"><span>AN OCEAN READING</span><span>1952 / 2015</span></p>
      <div class="opening-title-wrap">
        <p class="opening-original">${book.originalTitle}</p>
        <h1 id="book-title" data-fluid-text data-fluid-whole>${book.title}</h1>
        <p class="opening-byline">${book.author}<small>${book.authorLatin}</small></p>
      </div>
      <div class="opening-bottom">
        <p class="opening-copy"></p>
        <a class="begin-reading" href="#book-start"><span>読みはじめる</span><i aria-hidden="true">↓</i></a>
      </div>
      <p class="opening-instruction"><span aria-hidden="true">↝</span> カーソルを動かす／ページを送る</p>
    </div>
  </section>

  <section class="book-shell" id="book-start" aria-labelledby="text-heading">
    <header class="text-frontispiece">
      <p>COMPLETE JAPANESE TRANSLATION</p>
      <h2 id="text-heading">${book.title}</h2>
      <dl>
        <div><dt>著者</dt><dd>${book.author}</dd></div>
        <div><dt>翻訳</dt><dd>${book.translator}</dd></div>
        <div><dt>底本</dt><dd>${book.originalEdition}</dd></div>
      </dl>
      <div class="current-key" aria-label="操作方法">
        <span><i class="key-pointer" aria-hidden="true"></i> 指先が潮を引く</span>
        <span><i class="key-scroll" aria-hidden="true"></i> 巻物が海を送る</span>
      </div>
      <p class="edition-note">本作には、今日からみれば不適切と受け取られる可能性のある表現があります。青空文庫の方針に基づき、そのまま掲載しています。</p>
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
        翻訳文は<a href="${book.sourceUrl}" target="_blank" rel="noreferrer">青空文庫 No.57347 収録ファイル</a>を利用し、
        <a href="${book.licenseUrl}" target="_blank" rel="license noreferrer">${book.licenseLabel}</a>のもとで掲載しています。
        ${book.translationPublished}。
      </p>
      <p class="adaptation-note">
        本サイトでは、公式XHTMLのルビを保持したまま改ページ注記を区切りへ変換し、本文を段落化・分節化して動的に配置しています。
        翻訳内容そのものの改変は行っていません。
      </p>
      <div class="colophon-links">
        <a href="${book.cardUrl}" target="_blank" rel="noreferrer">青空文庫 図書カード ↗</a>
        <a href="#top">はじめの岸へ戻る ↑</a>
      </div>
    </div>
  </footer>
`;

const ocean = createOceanField({
  roots: document.querySelectorAll("[data-fluid-text]"),
  onActivity({ active, total }) {
    const meter = document.querySelector("#active-segments");
    if (meter) meter.textContent = `${active} / ${total}`;
  },
});

let progressFrame = 0;
function updateReadingPosition() {
  progressFrame = 0;
  const scrollable = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  const progress = Math.max(0, Math.min(1, scrollY / scrollable));
  const percent = Math.round(progress * 100);
  const phase = [...readingPhases].reverse().find((item) => progress >= item.at) || readingPhases[0];
  percentLabel.textContent = `${percent}%`;
  phaseLabel.textContent = phase.label;
  progressFill.style.transform = `scaleX(${progress})`;
}

addEventListener("scroll", () => {
  if (!progressFrame) progressFrame = requestAnimationFrame(updateReadingPosition);
}, { passive: true });

motionButton.addEventListener("click", () => {
  const paused = ocean.togglePaused();
  motionButton.setAttribute("aria-pressed", String(paused));
  motionLabel.textContent = paused ? "潮流を起こす" : "潮流を止める";
});

if (reducedMotion) {
  motionButton.setAttribute("aria-pressed", "true");
  motionLabel.textContent = "潮流は停止中";
}

document.fonts?.ready.then(() => ocean.measure());
updateReadingPosition();
