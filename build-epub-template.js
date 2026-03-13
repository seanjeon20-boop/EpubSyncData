const https = require('https');
const fs = require('fs');
const path = require('path');

const JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.1.5/jszip.min.js';
const EPUB_URL = 'https://cdn.jsdelivr.net/npm/epubjs/dist/epub.min.js';
const ASSETS_DIR = path.join(__dirname, 'assets', 'epubjs');
const COMPONENTS_DIR = path.join(__dirname, 'src', 'components');

fs.mkdirSync(ASSETS_DIR, { recursive: true });
fs.mkdirSync(COMPONENTS_DIR, { recursive: true });

function download(url, dest) {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(dest)) {
            console.log(`File ${dest} exists, skipping download.`);
            return resolve();
        }
        const file = fs.createWriteStream(dest);
        https.get(url, function (response) {
            if (response.statusCode === 301 || response.statusCode === 302) {
                https.get(response.headers.location, function (redirectResponse) {
                    redirectResponse.pipe(file);
                    file.on('finish', () => file.close(() => resolve()));
                }).on('error', (err) => {
                    fs.unlink(dest, () => reject(err));
                });
                return;
            }
            response.pipe(file);
            file.on('finish', function () {
                file.close(() => resolve());
            });
        }).on('error', function (err) {
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
}

async function buildTemplate() {
    await download(JSZIP_URL, path.join(ASSETS_DIR, 'jszip.min.js'));
    await download(EPUB_URL, path.join(ASSETS_DIR, 'epub.min.js'));

    const jszip = fs.readFileSync(path.join(ASSETS_DIR, 'jszip.min.js'), 'utf8');
    const epub = fs.readFileSync(path.join(ASSETS_DIR, 'epub.min.js'), 'utf8');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <script>${jszip}</script>
  <script>${epub}</script>
  <style>
    body { margin: 0; padding: 0; overflow: hidden; transition: background 0.3s, color 0.3s; }
    #viewer { width: 100vw; height: 100vh; }
    .epub-container { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="viewer"></div>
  <script>
    window.book = null;
    window.rendition = null;
    window.lastSelectedCfiRange = null;

    function sendMsg(msg) {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
      else window.parent.postMessage(msg, "*");
    }

    window.initEpub = function(bookUrl, cfi) {
      console.log("[initEpub] Loading:", bookUrl ? bookUrl.substring(0, 80) : 'N/A');

      window.book = ePub(bookUrl);
      window.rendition = window.book.renderTo("viewer", {
        width: "100%",
        height: "100%",
        spread: "none",
        manager: "continuous",
        flow: "paginated"
      });

      window.rendition.themes.register("dark", { "body": { "background": "#121212", "color": "#ffffff" }});
      window.rendition.themes.register("light", { "body": { "background": "#ffffff", "color": "#000000" }});

      // 책 내부 iframe에 스와이프 감지 주입 (epub.js는 내부적으로 nested iframe을 만들기 때문)
      var swipeStartX = 0;
      var swipeStartY = 0;
      function handleSwipeStart(e) {
        swipeStartX = e.changedTouches[0].screenX;
        swipeStartY = e.changedTouches[0].screenY;
      }
      function handleSwipeEnd(e) {
        var deltaX = e.changedTouches[0].screenX - swipeStartX;
        var deltaY = e.changedTouches[0].screenY - swipeStartY;
        // 수평 스와이프가 확실할 때만 (수직 스크롤과 구분)
        if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
          if (deltaX < 0) window.goNext();
          else window.goPrev();
        }
      }

      // epub.js 콘텐츠 iframe에 터치 이벤트 심기
      window.rendition.hooks.content.register(function(contents) {
        try {
          contents.document.addEventListener('touchstart', handleSwipeStart, { passive: true });
          contents.document.addEventListener('touchend', handleSwipeEnd, { passive: true });
        } catch(e) { console.warn('swipe hook error', e); }
      });

      // 페이지 위치 변경 이벤트
      window.rendition.on("relocated", function(location) {
        var progress = 0, currentLocation = 0, totalLocations = 0;
        if (window.book.locations && window.book.locations.length() > 0) {
          progress = window.book.locations.percentageFromCfi(location.start.cfi);
          currentLocation = location.start.location;
          totalLocations = window.book.locations.total;
        }
        sendMsg(JSON.stringify({
          type: 'location',
          cfi: location.start.cfi,
          progress: progress,
          currentLocation: currentLocation,
          totalLocations: totalLocations
        }));
      });

      // 텍스트 선택 이벤트
      window.rendition.on("selected", function(cfiRange, contents) {
        window.lastSelectedCfiRange = cfiRange;
        sendMsg(JSON.stringify({ type: 'textSelected', cfiRange: cfiRange }));
      });

      // 책 로드 완료 이벤트
      window.book.ready.then(function() {
        // 페이지 표시
        if (cfi && cfi !== 'null' && cfi !== '') {
          window.rendition.display(cfi);
        } else {
          window.rendition.display();
        }

        // TOC 전송
        window.book.loaded.navigation.then(function(nav) {
          var toc = nav.toc.map(function(item) { return { label: item.label, href: item.href }; });
          sendMsg(JSON.stringify({ type: 'toc', toc: toc }));
        });

        // ready 신호 즉시 전송 (로딩 스피너 제거)
        sendMsg(JSON.stringify({ type: 'ready', totalLocations: 0 }));

        // 위치 데이터는 백그라운드에서 생성
        window.book.locations.generate(1600).then(function(locations) {
          sendMsg(JSON.stringify({ type: 'ready', totalLocations: locations.length }));
        });
      }).catch(function(err) {
        console.error("[initEpub] Error:", err);
        sendMsg(JSON.stringify({ type: 'error', message: 'Failed to load book: ' + err.message }));
      });
    };

    window.jumpTo = function(href) {
      if (window.rendition) window.rendition.display(href);
    };

    window.addHighlight = function(color) {
      if (window.lastSelectedCfiRange) {
        window.rendition.annotations.highlight(window.lastSelectedCfiRange, {}, function(e) {
          console.log("highlight clicked", e);
        });
        sendMsg(JSON.stringify({
          type: 'annotation',
          action: 'highlight',
          cfiRange: window.lastSelectedCfiRange,
          color: color || 'yellow'
        }));
        var contents = window.rendition.getContents();
        if (contents && contents.length > 0) {
          var selection = contents[0].window.getSelection();
          if (selection && selection.removeAllRanges) selection.removeAllRanges();
        }
        window.lastSelectedCfiRange = null;
      }
    };

    window.changeTheme = function(theme) {
      if (window.rendition) window.rendition.themes.select(theme);
    };

    window.changeFontSize = function(size) {
      if (window.rendition) window.rendition.themes.fontSize(size + "%");
    };

    window.goNext = function() {
      if (window.rendition) window.rendition.next();
    };

    window.goPrev = function() {
      if (window.rendition) window.rendition.prev();
    };

    // 모바일 스와이프 지원
    var touchStartX = 0, touchEndX = 0;
    var minSwipeDistance = 50;
    document.addEventListener('touchstart', function(e) { touchStartX = e.changedTouches[0].screenX; }, false);
    document.addEventListener('touchend', function(e) {
      touchEndX = e.changedTouches[0].screenX;
      var deltaX = touchEndX - touchStartX;
      if (Math.abs(deltaX) > minSwipeDistance) {
        if (deltaX < 0) window.goNext();
        else window.goPrev();
      }
    }, false);
  </script>
</body>
</html>`;

    const tsContent = `export const EPUB_TEMPLATE = ${JSON.stringify(html)};\n`;
    fs.writeFileSync(path.join(COMPONENTS_DIR, 'EpubTemplate.ts'), tsContent);
    console.log('EpubTemplate.ts generated successfully!');
}

buildTemplate().catch(console.error);
