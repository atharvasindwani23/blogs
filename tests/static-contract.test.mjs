import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');
const indexHtml = read('index.html');
const desktopCss = read('desktop.css');
const desktopJs = read('desktop.js');
const portraitSvg = read('assets/portrait-placeholder.svg');
const postPaths = [
    'posts/indecisive-over-inactive.html',
    'posts/junior-year-effect.html',
    'posts/confusion.html'
];

function assertIncludesAll(source, values, message) {
    values.forEach((value) => assert.ok(source.includes(value), `${message}: ${value}`));
}

test('homepage loads only the isolated desktop assets and pinned CDN libraries', () => {
    assert.match(indexHtml, /href="desktop\.css"/);
    assert.match(indexHtml, /type="module" src="desktop\.js"/);
    assert.match(indexHtml, /three@0\.164\.1\/build\/three\.module\.js/);
    assert.match(indexHtml, /gsap@3\.12\.5\/dist\/gsap\.min\.js/);
    assert.doesNotMatch(indexHtml, /href="style\.css"/);
    assert.doesNotMatch(indexHtml, /react|webpack|vite/i);
});

test('all current standalone posts are configured as desktop windows and fallbacks', () => {
    postPaths.forEach((postPath) => {
        assert.ok(existsSync(join(root, postPath)), `missing standalone post: ${postPath}`);
        assert.ok(desktopJs.includes(`href: '${postPath}'`), `missing href config for ${postPath}`);
        assert.ok(desktopJs.includes(`contentSource: '${postPath}'`), `missing contentSource config for ${postPath}`);
        assert.ok(indexHtml.includes(`href="${postPath}"`), `missing noscript fallback for ${postPath}`);

        const post = read(postPath);
        assert.match(post, /href="\.\.\/style\.css"/);
        assert.match(post, /class="post-page"/);
        assert.match(post, /class="post-body"/);
    });
});

test('post configuration exposes the documented one-object customization fields', () => {
    assertIncludesAll(desktopJs, [
        "const POSTS = [",
        'contentSource:',
        'iconType:',
        'iconImage:',
        'x:',
        'y:',
        'background:',
        "const PORTRAIT_SOURCE = 'assets/portrait-placeholder.svg'"
    ], 'missing customization contract');
    assert.match(desktopJs, /placeholder:\s*true/);
});

test('window template and manager implement native-feeling lifecycle controls', () => {
    assert.match(indexHtml, /class="mac-window" role="dialog"/);
    assertIncludesAll(indexHtml, [
        'data-window-action="close"',
        'data-window-action="minimize"',
        'data-window-action="zoom"',
        'data-resize="n"',
        'data-resize="e"',
        'data-resize="s"',
        'data-resize="w"',
        'data-resize="ne"',
        'data-resize="se"',
        'data-resize="sw"',
        'data-resize="nw"'
    ], 'missing window control');
    assertIncludesAll(desktopJs, [
        'class DesktopWindowManager',
        'startDrag(event, record)',
        'startResize(event, record, direction)',
        'minimize(id)',
        'restore(id)',
        'toggleMaximize(id)',
        'focusTopWindow()',
        "event.key === 'Escape'",
        'event.metaKey'
    ], 'missing window-manager behavior');
});

test('README persistence and dynamic minimized dock are present', () => {
    assert.match(desktopJs, /catharty\.readmeDismissed\.v1/);
    assert.match(desktopJs, /localStorage\.getItem/);
    assert.match(desktopJs, /localStorage\.setItem/);
    assert.match(indexHtml, /id="minimized-dock"/);
    assert.match(desktopJs, /createMinimizedDockItem/);
    assert.match(desktopJs, /record\.element\.hidden = true/);
});

test('social and personal links use the supplied destinations safely', () => {
    const links = [
        'https://github.com/atharvasindwani23',
        'https://x.com/atharwows',
        'https://www.linkedin.com/in/atharva-sindwani-686b292a7/',
        'https://atharvasindwani23.github.io'
    ];
    assertIncludesAll(indexHtml, links, 'homepage is missing supplied URL');
    assertIncludesAll(desktopJs, links, 'About window is missing supplied URL');
    assert.match(indexHtml, /target="_blank" rel="noopener noreferrer"/);
});

test('accessibility contracts cover keyboard, dialog, labels, focus, and no-script use', () => {
    assert.match(indexHtml, /class="skip-link"/);
    assert.match(indexHtml, /aria-label="Blog posts"/);
    assert.match(indexHtml, /aria-label="Applications"/);
    assert.match(indexHtml, /aria-live="polite"/);
    assert.match(indexHtml, /<noscript>/);
    assert.match(desktopJs, /getFocusable/);
    assert.match(desktopJs, /aria-labelledby/);
    assert.match(desktopJs, /focus\(\{ preventScroll: true \}\)/);
    assert.match(desktopCss, /:focus-visible/);
    assert.match(desktopCss, /@media \(forced-colors: active\)/);
});

test('responsive, reduced-motion, and WebGL fallback paths are explicit', () => {
    assert.match(desktopCss, /@media \(max-width: 760px\)/);
    assert.match(desktopCss, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(desktopCss, /@media \(hover: none\), \(pointer: coarse\)/);
    assert.match(desktopCss, /\.portrait-fallback/);
    assert.match(desktopJs, /requestIdleCallback/);
    assert.match(desktopJs, /Math\.min\(window\.devicePixelRatio \|\| 1, 1\.6\)/);
    assert.match(desktopJs, /webGLIsAvailable/);
    assert.match(desktopJs, /webglcontextlost/);
    assert.match(desktopJs, /document\.hidden/);
    assert.match(desktopJs, /await import\('three'\)/);
});

test('portrait fallback has the expected high-resolution 4:5 dimensions', () => {
    assert.match(portraitSvg, /width="1600" height="2000"/);
    assert.match(portraitSvg, /viewBox="0 0 1600 2000"/);
    assert.match(portraitSvg, /Abstract portrait placeholder/);
});

test('imported post content is constrained and failure keeps a standalone link', () => {
    assert.match(desktopJs, /querySelector\('\.post-page'\)/);
    assert.match(desktopJs, /querySelectorAll\('script, style, link, iframe, object, embed'\)/);
    assert.match(desktopJs, /resolveImportedUrls/);
    assert.match(desktopJs, /The standalone post is still available/);
    assert.match(desktopJs, /link\.href = post\.href/);
});

test('pointer cleanup captures a stable event target for asynchronous callbacks', () => {
    const capturedTargets = desktopJs.match(/const pointerTarget = event\.currentTarget;/g) || [];
    assert.equal(capturedTargets.length, 2, 'drag and resize should each capture their pointer target');
    assert.doesNotMatch(desktopJs, /event\.currentTarget\.removeEventListener/);
});

test('homepage provides an inline favicon without another network request', () => {
    assert.match(indexHtml, /<link rel="icon" href="data:image\/svg\+xml,/);
});

test('CSS blocks are structurally balanced', () => {
    const openingBraces = (desktopCss.match(/\{/g) || []).length;
    const closingBraces = (desktopCss.match(/\}/g) || []).length;
    assert.equal(openingBraces, closingBraces, 'desktop.css has unmatched braces');
});
