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
                // Handle redirect
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

    window.initEpub = function(bookUrl, cfi) {
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

      if (cfi && cfi !== 'null') {
         window.rendition.display(cfi);
      } else {
         window.rendition.display();
      }

      window.rendition.on("relocated", function(location) {
        let progress = 0;
        if (window.book.locations && window.book.locations.length() > 0) {
            progress = window.book.locations.percentageFromCfi(location.start.cfi);
        }
        const msg = JSON.stringify({
          type: 'location',
          cfi: location.start.cfi,
          progress: progress
        });
        if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(msg);
        } else {
            window.parent.postMessage(msg, "*");
        }
      });

      window.book.ready.then(() => {
        return window.book.locations.generate(1600);
      }).then((locations) => {
        const readyMsg = JSON.stringify({
          type: 'ready',
          totalLocations: locations.length
        });
        if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(readyMsg);
        } else {
            window.parent.postMessage(readyMsg, "*");
        }
      });
    };

    window.changeTheme = function(theme) {
       if (window.rendition) {
          window.rendition.themes.select(theme);
       }
    };

    window.changeFontSize = function(size) {
       if (window.rendition) {
          window.rendition.themes.fontSize(size + "%");
       }
    };

    window.goNext = function() {
       if (window.rendition) window.rendition.next();
    };

    window.goPrev = function() {
       if (window.rendition) window.rendition.prev();
    };
  </script>
</body>
</html>`;

    const tsContent = `export const EPUB_TEMPLATE = ${JSON.stringify(html)};\n`;
    fs.writeFileSync(path.join(COMPONENTS_DIR, 'EpubTemplate.ts'), tsContent);
    console.log('EpubTemplate.ts generated successfully!');
}

buildTemplate().catch(console.error);
