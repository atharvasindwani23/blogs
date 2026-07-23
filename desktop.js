/*
 * Catharty desktop
 * ----------------
 * Add a post by copying one object in POSTS. `contentSource` points to the
 * standalone HTML page; its `.post-page` element is safely imported into a
 * window. Set `iconImage` to a local image path to replace the generated icon,
 * and change `background` to theme that post's window.
 */

const POSTS = [
    {
        id: 'indecisive-over-inactive',
        title: 'Indecisive > Inactive',
        href: 'posts/indecisive-over-inactive.html',
        contentSource: 'posts/indecisive-over-inactive.html',
        iconType: 'choice',
        iconGlyph: '↗',
        iconImage: '',
        x: 18,
        y: 28,
        depth: 1.1,
        accent: '#ef7163',
        accentLight: '#ffc39f',
        background: 'linear-gradient(145deg, rgba(255, 252, 248, 0.99), rgba(247, 235, 229, 0.97))'
    },
    {
        id: 'junior-year-effect',
        title: 'Junior Year Effect',
        href: 'posts/junior-year-effect.html',
        contentSource: 'posts/junior-year-effect.html',
        iconType: 'journal',
        iconGlyph: 'III',
        iconImage: '',
        x: 79,
        y: 25,
        depth: 0.82,
        accent: '#7f8fce',
        accentLight: '#c9d5ff',
        background: 'linear-gradient(145deg, rgba(250, 252, 255, 0.99), rgba(232, 237, 249, 0.97))'
    },
    {
        id: 'confusion',
        title: 'Confusion',
        href: 'posts/confusion.html',
        contentSource: 'posts/confusion.html',
        iconType: 'question',
        iconGlyph: '?',
        iconImage: '',
        x: 24,
        y: 72,
        depth: 0.7,
        accent: '#8870c8',
        accentLight: '#dac3fa',
        background: 'linear-gradient(145deg, rgba(253, 250, 255, 0.99), rgba(238, 231, 247, 0.97))'
    },
    // Future posts can stay visible as placeholders until `href` and
    // `contentSource` are filled in and `placeholder` is set to false.
    {
        id: 'future-field-notes',
        title: 'Field Notes',
        href: '',
        contentSource: '',
        iconType: 'future',
        iconGlyph: '✦',
        iconImage: '',
        x: 82,
        y: 68,
        depth: 1.02,
        accent: '#9a927f',
        accentLight: '#ddd7c8',
        background: 'linear-gradient(145deg, #fdfcf9, #eeece5)',
        placeholder: true
    }
];

// Swap this value to `assets/portrait.png` after adding a portrait. A vertical
// 4:5 image around 1600 × 2000 px works best; a light or transparent background
// gives the shader the cleanest alpha-masked silhouette.
const PORTRAIT_SOURCE = 'assets/portrait-placeholder.svg';
const README_DISMISSAL_KEY = 'catharty.readmeDismissed.v1';
const MOBILE_QUERY = window.matchMedia('(max-width: 760px)');
const REDUCED_MOTION_QUERY = window.matchMedia('(prefers-reduced-motion: reduce)');
const FINE_POINTER_QUERY = window.matchMedia('(hover: hover) and (pointer: fine)');
const ICON_GLYPHS = Object.freeze({ choice: '↗', journal: 'III', question: '?', future: '✦' });

const elements = {
    desktop: document.querySelector('#desktop'),
    icons: document.querySelector('#desktop-icons'),
    windowLayer: document.querySelector('#window-layer'),
    windowTemplate: document.querySelector('#window-template'),
    dock: document.querySelector('#dock'),
    minimizedDock: document.querySelector('#minimized-dock'),
    minimizedDivider: document.querySelector('#minimized-divider'),
    menuClock: document.querySelector('#menu-clock'),
    liveRegion: document.querySelector('#live-region'),
    canvas: document.querySelector('#scene-canvas'),
    flowField: document.querySelector('#flow-field'),
    flowCore: document.querySelector('#flow-core')
};

// The wallpaper's spark sits at ~50.7% / 50.9% of the source image. Because the
// wallpaper uses background-size: cover, we recompute where that point lands in
// the viewport whenever the window resizes.
const SPARK_FRAC = { x: 0.507, y: 0.509 };
const WALLPAPER_SIZE = { w: 1136, h: 640 };

const pointer = {
    targetX: 0,
    targetY: 0,
    x: 0,
    y: 0
};

let windowManager;
let stopThreeScene = () => {};

function safelyReadStorage(key) {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safelyWriteStorage(key, value) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Privacy modes may block storage. The desktop remains fully usable.
    }
}

function announce(message) {
    elements.liveRegion.textContent = '';
    window.requestAnimationFrame(() => {
        elements.liveRegion.textContent = message;
    });
}

function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
}

function isPrimaryPointer(event) {
    return event.isPrimary && (event.pointerType !== 'mouse' || event.button === 0);
}

function getFocusable(container) {
    return [...container.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
}

function finaliseAnimation(element, properties, onComplete) {
    for (const [property, value] of Object.entries(properties)) {
        element.style[property] = typeof value === 'number' && ['left', 'top', 'width', 'height'].includes(property)
            ? `${value}px`
            : value;
    }
    onComplete?.();
}

function animateElement(element, keyframes, options = {}, onComplete) {
    if (REDUCED_MOTION_QUERY.matches || typeof element.animate !== 'function') {
        const finalFrame = keyframes[keyframes.length - 1];
        finaliseAnimation(element, finalFrame, onComplete);
        return null;
    }

    const animation = element.animate(keyframes, {
        duration: options.duration ?? 420,
        easing: options.easing ?? 'cubic-bezier(.2,.85,.25,1)',
        fill: 'both'
    });
    animation.addEventListener('finish', () => {
        animation.cancel();
        onComplete?.();
    }, { once: true });
    return animation;
}

function runGsapOrFallback(element, gsapFrom, gsapTo, fallbackFrames, onComplete) {
    if (REDUCED_MOTION_QUERY.matches) {
        onComplete?.();
        return;
    }

    if (window.gsap) {
        window.gsap.killTweensOf(element);
        window.gsap.fromTo(element, gsapFrom, {
            ...gsapTo,
            onComplete
        });
        return;
    }

    animateElement(element, fallbackFrames, { duration: (gsapTo.duration ?? 0.42) * 1000 }, onComplete);
}

function renderDesktopIcons() {
    const fragment = document.createDocumentFragment();

    POSTS.forEach((post, index) => {
        const icon = document.createElement(post.placeholder ? 'button' : 'a');
        icon.className = `desktop-icon${post.placeholder ? ' is-placeholder' : ''}`;
        icon.dataset.postId = post.id;
        icon.style.setProperty('--icon-x', `${post.x}%`);
        icon.style.setProperty('--icon-y', `${post.y}%`);
        icon.style.setProperty('--icon-accent', post.accent);
        icon.style.setProperty('--icon-accent-light', post.accentLight);
        icon.style.setProperty('--entry-delay', `${index * 65}ms`);

        if (post.placeholder) {
            icon.type = 'button';
            icon.setAttribute('aria-label', `${post.title}, coming soon`);
        } else {
            icon.href = post.href;
            icon.setAttribute('aria-label', `Open “${post.title}” in a window`);
        }

        const motion = document.createElement('span');
        motion.className = 'desktop-icon__motion';
        const artwork = document.createElement('span');
        artwork.className = 'app-icon';
        artwork.dataset.iconType = post.iconType;
        artwork.setAttribute('aria-hidden', 'true');

        if (post.iconImage) {
            const image = document.createElement('img');
            image.className = 'app-icon__image';
            image.src = post.iconImage;
            image.alt = '';
            artwork.append(image);
        } else {
            const glyph = document.createElement('span');
            glyph.className = 'app-icon__glyph';
            glyph.textContent = post.iconGlyph || ICON_GLYPHS[post.iconType] || post.title.charAt(0);
            artwork.append(glyph);
        }

        const label = document.createElement('span');
        label.className = 'desktop-icon__label';
        label.textContent = post.title;
        motion.append(artwork, label);
        icon.append(motion);

        icon.addEventListener('click', (event) => {
            event.preventDefault();
            if (post.placeholder) {
                windowManager.openPlaceholder(post, icon);
                return;
            }
            windowManager.openPost(post, icon);
        });

        fragment.append(icon);

        if (!REDUCED_MOTION_QUERY.matches) {
            window.requestAnimationFrame(() => {
                if (window.gsap) {
                    window.gsap.from(icon, {
                        opacity: 0,
                        scale: 0.72,
                        y: 18,
                        duration: 0.65,
                        delay: 0.12 + index * 0.07,
                        ease: 'back.out(1.45)',
                        clearProps: 'opacity,scale,y'
                    });
                } else {
                    animateElement(icon, [
                        { opacity: 0, scale: 0.72 },
                        { opacity: 1, scale: 1 }
                    ], { duration: 520 + index * 45 });
                }
            });
        }
    });

    elements.icons.replaceChildren(fragment);
}

class DesktopWindowManager {
    constructor() {
        this.windows = new Map();
        this.activeId = null;
        this.highestZIndex = 20;
        this.cascadeIndex = 0;
        this.bindGlobalInteractions();
    }

    bindGlobalInteractions() {
        elements.desktop.addEventListener('pointerdown', (event) => {
            if (event.target.closest('.mac-window, .desktop-icon, .dock, .menu-bar')) return;
            this.defocusAll();
        });

        document.addEventListener('keydown', (event) => this.handleKeyboard(event));
        window.addEventListener('resize', () => this.constrainWindows());
    }

    createWindow({ id, title, kind, background, width = 720, height = 570, trigger }) {
        const existing = this.windows.get(id);
        if (existing) {
            if (existing.state === 'minimized') this.restore(id);
            else this.focus(id);
            return { record: existing, created: false };
        }

        const element = elements.windowTemplate.content.firstElementChild.cloneNode(true);
        const titleElement = element.querySelector('.window-title');
        const titleId = `window-title-${id}`;
        titleElement.id = titleId;
        titleElement.textContent = title;
        element.dataset.windowId = id;
        element.dataset.windowKind = kind;
        element.setAttribute('aria-labelledby', titleId);
        element.style.setProperty('--window-background', background);

        const bounds = this.initialBounds(width, height);
        this.applyBounds(element, bounds);

        const record = {
            id,
            title,
            kind,
            element,
            content: element.querySelector('[data-window-content]'),
            state: 'open',
            maximized: false,
            restoreBounds: null,
            trigger,
            dockItem: null,
            accent: '#6d62cf',
            accentLight: '#b8b1f1'
        };

        this.windows.set(id, record);
        this.bindWindowInteractions(record);
        elements.windowLayer.append(element);
        this.focus(id, { focusElement: false });
        this.animateOpen(record, trigger);
        element.focus({ preventScroll: true });
        this.cascadeIndex += 1;
        return { record, created: true };
    }

    initialBounds(requestedWidth, requestedHeight) {
        if (MOBILE_QUERY.matches) {
            return {
                left: 0,
                top: 36,
                width: window.innerWidth,
                height: window.innerHeight - 36
            };
        }

        const availableHeight = window.innerHeight - 32 - 92;
        const width = Math.min(requestedWidth, window.innerWidth - 44);
        const height = Math.min(requestedHeight, availableHeight);
        const offset = (this.cascadeIndex % 6) * 22;
        const left = clamp((window.innerWidth - width) / 2 + offset - 44, 12, window.innerWidth - width - 12);
        const top = clamp((window.innerHeight - height) / 2 + offset - 30, 44, window.innerHeight - height - 82);
        return { left, top, width, height };
    }

    applyBounds(element, bounds) {
        element.style.left = `${Math.round(bounds.left)}px`;
        element.style.top = `${Math.round(bounds.top)}px`;
        element.style.width = `${Math.round(bounds.width)}px`;
        element.style.height = `${Math.round(bounds.height)}px`;
    }

    currentBounds(element) {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }

    bindWindowInteractions(record) {
        const { element } = record;
        element.addEventListener('pointerdown', () => this.focus(record.id, { focusElement: false }));

        element.querySelectorAll('[data-window-action]').forEach((control) => {
            control.addEventListener('pointerdown', (event) => event.stopPropagation());
            control.addEventListener('click', (event) => {
                event.stopPropagation();
                const action = control.dataset.windowAction;
                if (action === 'close') this.close(record.id);
                if (action === 'minimize') this.minimize(record.id);
                if (action === 'zoom') this.toggleMaximize(record.id);
            });
        });

        const titlebar = element.querySelector('[data-drag-handle]');
        titlebar.addEventListener('pointerdown', (event) => this.startDrag(event, record));
        titlebar.addEventListener('dblclick', (event) => {
            if (event.target.closest('.traffic-lights')) return;
            this.toggleMaximize(record.id);
        });

        element.querySelectorAll('[data-resize]').forEach((handle) => {
            handle.addEventListener('pointerdown', (event) => this.startResize(event, record, handle.dataset.resize));
        });
    }

    async openPost(post, trigger) {
        const { record, created } = this.createWindow({
            id: `post-${post.id}`,
            title: post.title,
            kind: 'post',
            background: post.background,
            width: 760,
            height: 610,
            trigger
        });

        record.accent = post.accent;
        record.accentLight = post.accentLight;
        if (!created) return;

        record.content.innerHTML = '<div class="loading-state" aria-label="Loading post"><span></span><span></span><span></span><span></span></div>';
        this.markLauncherRunning(post.id, true);

        try {
            const response = await fetch(post.contentSource);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const source = await response.text();
            const parsed = new DOMParser().parseFromString(source, 'text/html');
            const article = parsed.querySelector('.post-page');
            if (!article) throw new Error('The post page does not contain .post-page');

            const importedArticle = document.importNode(article, true);
            importedArticle.querySelectorAll('script, style, link, iframe, object, embed').forEach((node) => node.remove());
            this.resolveImportedUrls(importedArticle, post.contentSource);
            record.content.replaceChildren(importedArticle);
            announce(`${post.title} opened`);
        } catch (error) {
            const fallback = document.createElement('div');
            fallback.className = 'window-message';
            const eyebrow = document.createElement('p');
            eyebrow.className = 'window-message__eyebrow';
            eyebrow.textContent = 'Could not load the preview';
            const heading = document.createElement('h3');
            heading.textContent = post.title;
            const copy = document.createElement('p');
            copy.textContent = 'The standalone post is still available.';
            const link = document.createElement('a');
            link.href = post.href;
            link.textContent = 'Open the post page instead →';
            fallback.append(eyebrow, heading, copy, link);
            record.content.replaceChildren(fallback);
            console.warn(`Catharty could not load ${post.contentSource}:`, error);
            announce(`${post.title} preview could not be loaded`);
        }
    }

    resolveImportedUrls(container, sourcePath) {
        const baseUrl = new URL(sourcePath, document.baseURI);
        const attributes = [
            ['a[href]', 'href'],
            ['img[src]', 'src'],
            ['video[src]', 'src'],
            ['source[src]', 'src']
        ];

        attributes.forEach(([selector, attribute]) => {
            container.querySelectorAll(selector).forEach((element) => {
                const value = element.getAttribute(attribute);
                if (!value || value.startsWith('#') || /^(?:https?:|mailto:|tel:|data:)/i.test(value)) return;
                element.setAttribute(attribute, new URL(value, baseUrl).href);
            });
        });
    }

    openSystemWindow(type, trigger) {
        if (type === 'readme') {
            const { record, created } = this.createWindow({
                id: 'readme',
                title: 'README',
                kind: 'readme',
                background: 'linear-gradient(145deg, rgba(255, 254, 251, 0.99), rgba(240, 238, 232, 0.97))',
                width: 660,
                height: 510,
                trigger
            });
            if (created) record.content.append(this.createReadmeContent());
            this.markSystemLauncherRunning('readme', true);
            return;
        }

        if (type === 'about') {
            const { record, created } = this.createWindow({
                id: 'about',
                title: 'About Atharva',
                kind: 'about',
                background: 'linear-gradient(145deg, rgba(251, 250, 255, 0.99), rgba(235, 232, 247, 0.97))',
                width: 700,
                height: 475,
                trigger
            });
            if (created) record.content.append(this.createAboutContent());
            this.markSystemLauncherRunning('about', true);
        }
    }

    openPlaceholder(post, trigger) {
        const { record, created } = this.createWindow({
            id: `placeholder-${post.id}`,
            title: post.title,
            kind: 'placeholder',
            background: post.background,
            width: 520,
            height: 350,
            trigger
        });
        record.accent = post.accent;
        record.accentLight = post.accentLight;
        if (!created) return;

        const content = document.createElement('div');
        content.className = 'window-message';
        content.innerHTML = `
            <p class="window-message__eyebrow">Still taking shape</p>
            <h3>${post.title}</h3>
            <p>This note is sitting on the desktop while Atharva works on it. Check back soon.</p>
        `;
        record.content.append(content);
        announce(`${post.title} is coming soon`);
    }

    createReadmeContent() {
        const content = document.createElement('div');
        content.className = 'window-message';
        content.innerHTML = `
            <p class="window-message__eyebrow">A tiny field guide</p>
            <h3>Welcome to my desktop.</h3>
            <p>Click any icon to open a post. Drag windows around, resize them, minimize them, stack them. <strong>Explore.</strong></p>
            <div class="readme-shortcuts" aria-label="Desktop tips">
                <div class="readme-shortcut"><span aria-hidden="true">●</span><p>Use the three window controls to close, minimize, or zoom.</p></div>
                <div class="readme-shortcut"><span aria-hidden="true">⌘</span><p><kbd>⌘M</kbd> minimizes and <kbd>⌘W</kbd> closes the focused window.</p></div>
                <div class="readme-shortcut"><span aria-hidden="true">↗</span><p>Standalone post pages remain available from each icon link.</p></div>
            </div>
        `;
        return content;
    }

    createAboutContent() {
        const content = document.createElement('div');
        content.className = 'about-card';
        content.innerHTML = `
            <div class="about-avatar" aria-hidden="true">A</div>
            <div class="about-copy">
                <h3>Atharva Sindwani</h3>
                <p class="about-pronunciation">/uh-THAR-vuh sin-DWAH-nee/</p>
                <p>Hi, I'm Atharva. I love writing, cats, and fried chicken.</p>
                <div class="about-links" aria-label="Atharva's links">
                    <a href="https://atharvasindwani23.github.io" target="_blank" rel="noopener noreferrer">Website</a>
                    <a href="https://github.com/atharvasindwani23" target="_blank" rel="noopener noreferrer">GitHub</a>
                    <a href="https://x.com/atharwows" target="_blank" rel="noopener noreferrer">X</a>
                    <a href="https://www.linkedin.com/in/atharva-sindwani-686b292a7/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
                </div>
            </div>
        `;
        return content;
    }

    focus(id, { focusElement = true } = {}) {
        const record = this.windows.get(id);
        if (!record || record.state !== 'open') return;

        this.activeId = id;
        this.highestZIndex += 1;
        this.windows.forEach((candidate) => {
            const active = candidate.id === id && candidate.state === 'open';
            candidate.element.classList.toggle('is-inactive', !active);
            if (active) candidate.element.style.zIndex = String(this.highestZIndex);
        });

        if (focusElement && !record.element.contains(document.activeElement)) {
            record.element.focus({ preventScroll: true });
        }
    }

    defocusAll() {
        this.activeId = null;
        this.windows.forEach((record) => record.element.classList.add('is-inactive'));
    }

    close(id) {
        const record = this.windows.get(id);
        if (!record) return;

        if (id === 'readme') safelyWriteStorage(README_DISMISSAL_KEY, 'true');
        const destination = record.dockItem?.getBoundingClientRect() || record.trigger?.getBoundingClientRect();
        const windowRect = record.element.getBoundingClientRect();
        const deltaX = destination ? destination.left + destination.width / 2 - (windowRect.left + windowRect.width / 2) : 0;
        const deltaY = destination ? destination.top + destination.height / 2 - (windowRect.top + windowRect.height / 2) : 18;

        const complete = () => {
            record.dockItem?.remove();
            record.element.remove();
            this.windows.delete(id);
            this.updateMinimizedDivider();
            this.markLauncher(record, false);
            this.focusTopWindow();
            record.trigger?.focus?.({ preventScroll: true });
            announce(`${record.title} closed`);
        };

        if (REDUCED_MOTION_QUERY.matches) {
            complete();
            return;
        }

        runGsapOrFallback(
            record.element,
            { opacity: 1, scale: 1, x: 0, y: 0 },
            { opacity: 0, scale: 0.18, x: deltaX, y: deltaY, filter: 'blur(8px)', duration: 0.34, ease: 'power3.in' },
            [
                { opacity: 1, transform: 'translate(0, 0) scale(1)', filter: 'blur(0)' },
                { opacity: 0, transform: `translate(${deltaX}px, ${deltaY}px) scale(.18)`, filter: 'blur(8px)' }
            ],
            complete
        );
    }

    minimize(id) {
        const record = this.windows.get(id);
        if (!record || record.state !== 'open') return;

        const dockItem = this.createMinimizedDockItem(record);
        record.dockItem = dockItem;
        elements.minimizedDock.append(dockItem);
        this.updateMinimizedDivider();
        const destination = dockItem.getBoundingClientRect();
        const windowRect = record.element.getBoundingClientRect();
        const deltaX = destination.left + destination.width / 2 - (windowRect.left + windowRect.width / 2);
        const deltaY = destination.top + destination.height / 2 - (windowRect.top + windowRect.height / 2);

        const complete = () => {
            record.state = 'minimized';
            record.element.hidden = true;
            record.element.setAttribute('aria-hidden', 'true');
            record.element.style.opacity = '';
            record.element.style.transform = '';
            record.element.style.filter = '';
            this.focusTopWindow();
            dockItem.focus({ preventScroll: true });
            announce(`${record.title} minimized`);
        };

        if (REDUCED_MOTION_QUERY.matches) {
            complete();
            return;
        }

        runGsapOrFallback(
            record.element,
            { opacity: 1, scale: 1, x: 0, y: 0, transformOrigin: 'center center' },
            { opacity: 0, scale: 0.08, x: deltaX, y: deltaY, filter: 'blur(9px)', duration: 0.46, ease: 'power3.in' },
            [
                { opacity: 1, transform: 'translate(0, 0) scale(1)', filter: 'blur(0)' },
                { opacity: 0, transform: `translate(${deltaX}px, ${deltaY}px) scale(.08)`, filter: 'blur(9px)' }
            ],
            complete
        );
    }

    restore(id) {
        const record = this.windows.get(id);
        if (!record || record.state !== 'minimized') return;

        const source = record.dockItem?.getBoundingClientRect();
        record.state = 'open';
        record.element.hidden = false;
        record.element.removeAttribute('aria-hidden');
        const windowRect = record.element.getBoundingClientRect();
        const deltaX = source ? source.left + source.width / 2 - (windowRect.left + windowRect.width / 2) : 0;
        const deltaY = source ? source.top + source.height / 2 - (windowRect.top + windowRect.height / 2) : 20;
        this.focus(id, { focusElement: false });

        const complete = () => {
            record.element.style.opacity = '';
            record.element.style.transform = '';
            record.element.style.filter = '';
            record.dockItem?.remove();
            record.dockItem = null;
            this.updateMinimizedDivider();
            record.element.focus({ preventScroll: true });
            announce(`${record.title} restored`);
        };

        if (REDUCED_MOTION_QUERY.matches) {
            complete();
            return;
        }

        runGsapOrFallback(
            record.element,
            { opacity: 0, scale: 0.08, x: deltaX, y: deltaY, filter: 'blur(9px)' },
            { opacity: 1, scale: 1, x: 0, y: 0, filter: 'blur(0px)', duration: 0.5, ease: 'back.out(1.25)', clearProps: 'transform,filter,opacity' },
            [
                { opacity: 0, transform: `translate(${deltaX}px, ${deltaY}px) scale(.08)`, filter: 'blur(9px)' },
                { opacity: 1, transform: 'translate(0, 0) scale(1)', filter: 'blur(0)' }
            ],
            complete
        );
    }

    createMinimizedDockItem(record) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dock-item dock-item--minimized';
        button.setAttribute('aria-label', `Restore ${record.title}`);
        button.style.setProperty('--window-accent', record.accent);
        button.style.setProperty('--window-accent-light', record.accentLight);

        const icon = document.createElement('span');
        icon.className = 'dock-icon dock-icon--window';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = record.title.charAt(0).toUpperCase();
        const tooltip = document.createElement('span');
        tooltip.className = 'dock-tooltip';
        tooltip.setAttribute('aria-hidden', 'true');
        tooltip.textContent = record.title;
        button.append(icon, tooltip);
        button.addEventListener('click', () => this.restore(record.id));
        return button;
    }

    updateMinimizedDivider() {
        elements.minimizedDivider.classList.toggle('is-visible', elements.minimizedDock.childElementCount > 0);
    }

    toggleMaximize(id) {
        const record = this.windows.get(id);
        if (!record || record.state !== 'open' || MOBILE_QUERY.matches) return;

        const from = this.currentBounds(record.element);
        let target;
        if (!record.maximized) {
            record.restoreBounds = from;
            target = {
                left: 10,
                top: 42,
                width: window.innerWidth - 20,
                height: window.innerHeight - 42 - 88
            };
            record.maximized = true;
            record.element.classList.add('is-maximized');
        } else {
            target = record.restoreBounds || this.initialBounds(760, 610);
            record.maximized = false;
            record.element.classList.remove('is-maximized');
        }
        this.animateBounds(record.element, from, target);
        announce(`${record.title} ${record.maximized ? 'zoomed' : 'restored to its previous size'}`);
    }

    animateBounds(element, from, target) {
        if (REDUCED_MOTION_QUERY.matches) {
            this.applyBounds(element, target);
            return;
        }

        if (window.gsap) {
            window.gsap.killTweensOf(element);
            window.gsap.to(element, {
                left: target.left,
                top: target.top,
                width: target.width,
                height: target.height,
                duration: 0.48,
                ease: 'power3.inOut'
            });
            return;
        }

        animateElement(element, [
            { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` },
            { left: `${target.left}px`, top: `${target.top}px`, width: `${target.width}px`, height: `${target.height}px` }
        ], { duration: 480 }, () => this.applyBounds(element, target));
    }

    startDrag(event, record) {
        if (!isPrimaryPointer(event) || event.target.closest('.traffic-lights') || record.maximized || MOBILE_QUERY.matches) return;
        event.preventDefault();
        this.focus(record.id, { focusElement: false });
        const start = this.currentBounds(record.element);
        const origin = { x: event.clientX, y: event.clientY };
        const pointerTarget = event.currentTarget;
        record.element.classList.add('is-dragging');
        pointerTarget.setPointerCapture(event.pointerId);

        const move = (moveEvent) => {
            const left = clamp(start.left + moveEvent.clientX - origin.x, 8, window.innerWidth - start.width - 8);
            const top = clamp(start.top + moveEvent.clientY - origin.y, 32, window.innerHeight - 68);
            record.element.style.left = `${left}px`;
            record.element.style.top = `${top}px`;
        };

        const finish = () => {
            record.element.classList.remove('is-dragging');
            pointerTarget.removeEventListener('pointermove', move);
            pointerTarget.removeEventListener('pointerup', finish);
            pointerTarget.removeEventListener('pointercancel', finish);
        };

        pointerTarget.addEventListener('pointermove', move);
        pointerTarget.addEventListener('pointerup', finish);
        pointerTarget.addEventListener('pointercancel', finish);
    }

    startResize(event, record, direction) {
        if (!isPrimaryPointer(event) || record.maximized || MOBILE_QUERY.matches) return;
        event.preventDefault();
        event.stopPropagation();
        this.focus(record.id, { focusElement: false });
        const start = this.currentBounds(record.element);
        const origin = { x: event.clientX, y: event.clientY };
        const pointerTarget = event.currentTarget;
        const minimumWidth = 400;
        const minimumHeight = 270;
        record.element.classList.add('is-resizing');
        pointerTarget.setPointerCapture(event.pointerId);

        const move = (moveEvent) => {
            const deltaX = moveEvent.clientX - origin.x;
            const deltaY = moveEvent.clientY - origin.y;
            let { left, top, width, height } = start;

            if (direction.includes('e')) width = clamp(start.width + deltaX, minimumWidth, window.innerWidth - start.left - 8);
            if (direction.includes('s')) height = clamp(start.height + deltaY, minimumHeight, window.innerHeight - start.top - 72);
            if (direction.includes('w')) {
                const nextWidth = clamp(start.width - deltaX, minimumWidth, start.left + start.width - 8);
                left = start.left + start.width - nextWidth;
                width = nextWidth;
            }
            if (direction.includes('n')) {
                const nextHeight = clamp(start.height - deltaY, minimumHeight, start.top + start.height - 34);
                top = start.top + start.height - nextHeight;
                height = nextHeight;
            }

            this.applyBounds(record.element, { left, top, width, height });
        };

        const finish = () => {
            record.element.classList.remove('is-resizing');
            pointerTarget.removeEventListener('pointermove', move);
            pointerTarget.removeEventListener('pointerup', finish);
            pointerTarget.removeEventListener('pointercancel', finish);
        };

        pointerTarget.addEventListener('pointermove', move);
        pointerTarget.addEventListener('pointerup', finish);
        pointerTarget.addEventListener('pointercancel', finish);
    }

    animateOpen(record, trigger) {
        const windowRect = record.element.getBoundingClientRect();
        const origin = trigger?.getBoundingClientRect();
        const deltaX = origin ? origin.left + origin.width / 2 - (windowRect.left + windowRect.width / 2) : 0;
        const deltaY = origin ? origin.top + origin.height / 2 - (windowRect.top + windowRect.height / 2) : 20;

        runGsapOrFallback(
            record.element,
            { opacity: 0, scale: 0.16, x: deltaX, y: deltaY, filter: 'blur(10px)', transformOrigin: 'center center' },
            { opacity: 1, scale: 1, x: 0, y: 0, filter: 'blur(0px)', duration: 0.55, ease: 'back.out(1.3)', clearProps: 'transform,filter,opacity' },
            [
                { opacity: 0, transform: `translate(${deltaX}px, ${deltaY}px) scale(.16)`, filter: 'blur(10px)' },
                { opacity: 1, transform: 'translate(0, 0) scale(1)', filter: 'blur(0)' }
            ],
            () => {
                record.element.style.opacity = '';
                record.element.style.transform = '';
                record.element.style.filter = '';
            }
        );
    }

    constrainWindows() {
        this.windows.forEach((record) => {
            if (record.state !== 'open') return;
            if (MOBILE_QUERY.matches) return;
            if (record.maximized) {
                this.applyBounds(record.element, {
                    left: 10,
                    top: 42,
                    width: window.innerWidth - 20,
                    height: window.innerHeight - 42 - 88
                });
                return;
            }
            const bounds = this.currentBounds(record.element);
            const width = Math.min(bounds.width, window.innerWidth - 24);
            const height = Math.min(bounds.height, window.innerHeight - 108);
            this.applyBounds(record.element, {
                left: clamp(bounds.left, 8, window.innerWidth - width - 8),
                top: clamp(bounds.top, 34, window.innerHeight - 72),
                width,
                height
            });
        });
    }

    focusTopWindow() {
        const candidates = [...this.windows.values()]
            .filter((record) => record.state === 'open')
            .sort((a, b) => Number(b.element.style.zIndex || 0) - Number(a.element.style.zIndex || 0));
        if (candidates[0]) this.focus(candidates[0].id, { focusElement: false });
        else this.defocusAll();
    }

    handleKeyboard(event) {
        const record = this.activeId ? this.windows.get(this.activeId) : null;
        if (!record || record.state !== 'open') return;

        if (event.key === 'Escape') {
            event.preventDefault();
            this.close(record.id);
            return;
        }
        if (event.metaKey && event.key.toLowerCase() === 'w') {
            event.preventDefault();
            this.close(record.id);
            return;
        }
        if (event.metaKey && event.key.toLowerCase() === 'm') {
            event.preventDefault();
            this.minimize(record.id);
            return;
        }
        if (event.key !== 'Tab' || !record.element.contains(document.activeElement)) return;

        const focusable = getFocusable(record.element);
        if (focusable.length === 0) {
            event.preventDefault();
            record.element.focus();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    markLauncher(record, running) {
        if (record.kind === 'post') this.markLauncherRunning(record.id.replace(/^post-/, ''), running);
        if (record.kind === 'readme' || record.kind === 'about') this.markSystemLauncherRunning(record.kind, running);
    }

    markLauncherRunning(postId, running) {
        elements.icons.querySelector(`[data-post-id="${CSS.escape(postId)}"]`)?.classList.toggle('is-open', running);
    }

    markSystemLauncherRunning(type, running) {
        elements.dock.querySelector(`[data-launch="${type}"]`)?.classList.toggle('is-running', running);
    }
}

function bindLaunchers() {
    document.querySelectorAll('[data-launch]').forEach((launcher) => {
        launcher.addEventListener('click', (event) => {
            event.preventDefault();
            windowManager.openSystemWindow(launcher.dataset.launch, launcher);
        });
    });
}

function updateMenuClock() {
    if (!elements.menuClock) return;
    const now = new Date();
    const formatter = new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
    elements.menuClock.dateTime = now.toISOString();
    elements.menuClock.textContent = formatter.format(now).replace(',', '');
}

function initDockMagnification() {
    let frame = 0;
    elements.dock.addEventListener('pointermove', (event) => {
        if (!FINE_POINTER_QUERY.matches || REDUCED_MOTION_QUERY.matches) return;
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            elements.dock.querySelectorAll('.dock-item').forEach((item) => {
                const rect = item.getBoundingClientRect();
                const center = rect.left + rect.width / 2;
                const distance = Math.abs(event.clientX - center);
                const influence = Math.max(0, 1 - distance / 105);
                const scale = 1 + influence * 0.48;
                const lift = -influence * 13;
                if (window.gsap) {
                    window.gsap.to(item, { scale, y: lift, duration: 0.2, ease: 'power2.out', overwrite: true });
                } else {
                    item.style.setProperty('--dock-scale', scale.toFixed(3));
                    item.style.setProperty('--dock-lift', `${lift.toFixed(1)}px`);
                }
            });
        });
    });

    elements.dock.addEventListener('pointerleave', () => {
        elements.dock.querySelectorAll('.dock-item').forEach((item) => {
            if (window.gsap) {
                window.gsap.to(item, { scale: 1, y: 0, duration: 0.42, ease: 'elastic.out(1, 0.55)', overwrite: true });
            } else {
                item.style.setProperty('--dock-scale', '1');
                item.style.setProperty('--dock-lift', '0px');
            }
        });
    });
}

// Returns the spark's pixel position in the viewport, accounting for how
// background-size: cover scales/crops the wallpaper.
function computeSparkPoint() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = Math.max(vw / WALLPAPER_SIZE.w, vh / WALLPAPER_SIZE.h);
    const drawnW = WALLPAPER_SIZE.w * scale;
    const drawnH = WALLPAPER_SIZE.h * scale;
    const offsetX = (vw - drawnW) / 2;
    const offsetY = (vh - drawnH) / 2;
    return {
        x: offsetX + SPARK_FRAC.x * drawnW,
        y: offsetY + SPARK_FRAC.y * drawnH
    };
}

const flowState = { lines: [], built: false };

function buildFlowField() {
    if (!elements.flowField || flowState.built) return;
    const ns = 'http://www.w3.org/2000/svg';

    // One line per visible icon — including the Field Notes placeholder, so all
    // four icons receive a pulsing vessel.
    POSTS.forEach((post, index) => {
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('class', 'flow-line');
        line.style.setProperty('--flow-color', post.accent);

        const pulse = document.createElementNS(ns, 'line');
        pulse.setAttribute('class', 'flow-pulse');
        pulse.style.setProperty('--flow-color', post.accentLight || post.accent);

        // Insert lines before the core so the bright core renders on top.
        elements.flowField.insertBefore(line, elements.flowCore);
        elements.flowField.insertBefore(pulse, elements.flowCore);

        // delay 0 for every line so all pulses fire in sync, like one heartbeat.
        flowState.lines.push({ postId: post.id, line, pulse, animation: null, delay: 0 });
    });

    flowState.built = true;
}

// Reposition every line to run from the spark to its icon's center, and (re)build
// the traveling-pulse animation whenever a line's length changes meaningfully.
function updateFlowField() {
    if (!flowState.built || REDUCED_MOTION_QUERY.matches) return;
    const spark = computeSparkPoint();
    elements.flowCore.setAttribute('cx', spark.x.toFixed(1));
    elements.flowCore.setAttribute('cy', spark.y.toFixed(1));

    flowState.lines.forEach((entry) => {
        const icon = elements.icons.querySelector(`[data-post-id="${CSS.escape(entry.postId)}"] .app-icon`);
        if (!icon) return;
        const rect = icon.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        entry.line.setAttribute('x1', spark.x.toFixed(1));
        entry.line.setAttribute('y1', spark.y.toFixed(1));
        entry.line.setAttribute('x2', cx.toFixed(1));
        entry.line.setAttribute('y2', cy.toFixed(1));
        entry.pulse.setAttribute('x1', spark.x.toFixed(1));
        entry.pulse.setAttribute('y1', spark.y.toFixed(1));
        entry.pulse.setAttribute('x2', cx.toFixed(1));
        entry.pulse.setAttribute('y2', cy.toFixed(1));

        const length = Math.hypot(cx - spark.x, cy - spark.y);
        if (Math.abs(length - (entry.length || 0)) > 1.5) {
            entry.length = length;
            startPulse(entry, length);
        }
    });
}

// A short bright dash travels from the spark out to the icon, then fades —
// like a heartbeat pushing a pulse of light down each vessel.
function startPulse(entry, length) {
    if (entry.animation) entry.animation.cancel();
    const seg = 16; // length of the visible traveling segment
    entry.pulse.style.strokeDasharray = `${seg} ${length + seg}`;
    entry.animation = entry.pulse.animate(
        [
            { strokeDashoffset: length + seg, opacity: 0, offset: 0 },
            { opacity: 1, offset: 0.14 },
            { opacity: 0.95, offset: 0.82 },
            { strokeDashoffset: 0, opacity: 0, offset: 1 }
        ],
        {
            duration: 1900,
            iterations: Infinity,
            easing: 'cubic-bezier(0.55, 0, 0.2, 1)'
        }
    );

    // Pin every pulse to one shared origin on the document timeline so their
    // loops stay phase-locked — all four beat as a single heartbeat, even
    // though each animation is (re)created at a different moment.
    if (flowState.pulseOrigin == null) {
        flowState.pulseOrigin = document.timeline.currentTime ?? 0;
    }
    entry.animation.startTime = flowState.pulseOrigin;
}

function initFlowField() {
    if (!elements.flowField || REDUCED_MOTION_QUERY.matches) return;
    buildFlowField();
    updateFlowField();
    window.addEventListener('resize', updateFlowField, { passive: true });
}

function initParallax() {
    if (!FINE_POINTER_QUERY.matches || REDUCED_MOTION_QUERY.matches || MOBILE_QUERY.matches) return;

    window.addEventListener('pointermove', (event) => {
        pointer.targetX = (event.clientX / window.innerWidth - 0.5) * 2;
        pointer.targetY = (event.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });

    const tick = () => {
        pointer.x += (pointer.targetX - pointer.x) * 0.055;
        pointer.y += (pointer.targetY - pointer.y) * 0.055;
        POSTS.forEach((post) => {
            const icon = elements.icons.querySelector(`[data-post-id="${CSS.escape(post.id)}"]`);
            if (!icon) return;
            icon.style.setProperty('--parallax-x', `${(pointer.x * post.depth * 13).toFixed(2)}px`);
            icon.style.setProperty('--parallax-y', `${(pointer.y * post.depth * 9).toFixed(2)}px`);
        });
        elements.desktop.style.setProperty('--portrait-x', `${(-pointer.x * 9).toFixed(2)}px`);
        elements.desktop.style.setProperty('--portrait-y', `${(-pointer.y * 6).toFixed(2)}px`);
        updateFlowField();
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

function webGLIsAvailable() {
    try {
        const canvas = document.createElement('canvas');
        return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
    } catch {
        return false;
    }
}

async function initThreeScene() {
    if (!elements.canvas || MOBILE_QUERY.matches || REDUCED_MOTION_QUERY.matches || !webGLIsAvailable()) {
        document.documentElement.classList.add('webgl-fallback');
        return;
    }

    try {
        const THREE = await import('three');
        const renderer = new THREE.WebGLRenderer({
            canvas: elements.canvas,
            alpha: true,
            antialias: true,
            powerPreference: 'high-performance'
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
        renderer.setClearColor(0xffffff, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
        camera.position.set(0, 0, 6.4);

        const portraitGroup = new THREE.Group();
        scene.add(portraitGroup);

        const texture = await new THREE.TextureLoader().loadAsync(PORTRAIT_SOURCE);
        texture.colorSpace = THREE.SRGBColorSpace;
        const portraitMaterial = new THREE.ShaderMaterial({
            uniforms: {
                portraitMap: { value: texture },
                opacity: { value: 0.32 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D portraitMap;
                uniform float opacity;
                varying vec2 vUv;
                void main() {
                    vec4 sampleColor = texture2D(portraitMap, vUv);
                    float grayscale = dot(sampleColor.rgb, vec3(0.299, 0.587, 0.114));
                    float silhouette = smoothstep(0.035, 0.8, 1.0 - grayscale) * sampleColor.a;
                    float edgeX = smoothstep(0.0, 0.09, vUv.x) * smoothstep(0.0, 0.09, 1.0 - vUv.x);
                    float edgeY = smoothstep(0.0, 0.08, vUv.y) * smoothstep(0.0, 0.08, 1.0 - vUv.y);
                    gl_FragColor = vec4(vec3(0.35, 0.34, 0.33), silhouette * opacity * edgeX * edgeY);
                }
            `,
            transparent: true,
            depthWrite: false
        });
        const portrait = new THREE.Mesh(new THREE.PlaneGeometry(3.85, 4.82), portraitMaterial);
        portrait.position.set(0.2, -0.12, 0.1);
        portraitGroup.add(portrait);

        const glowMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xe5e2de,
            transparent: true,
            opacity: 0.1,
            roughness: 0.9,
            depthWrite: false
        });
        const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(2.18, 4), glowMaterial);
        glow.scale.set(1.03, 1.22, 0.35);
        glow.position.set(0.15, -0.08, -0.7);
        scene.add(glow);

        scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b4ae, 1.8));
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
        keyLight.position.set(-3, 4, 5);
        scene.add(keyLight);

        const pointCount = 90;
        const positions = new Float32Array(pointCount * 3);
        for (let index = 0; index < pointCount; index += 1) {
            positions[index * 3] = (Math.random() - 0.5) * 8;
            positions[index * 3 + 1] = (Math.random() - 0.5) * 5;
            positions[index * 3 + 2] = (Math.random() - 0.5) * 3 - 1;
        }
        const pointsGeometry = new THREE.BufferGeometry();
        pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const points = new THREE.Points(pointsGeometry, new THREE.PointsMaterial({
            color: 0x7d7872,
            size: 0.018,
            transparent: true,
            opacity: 0.19,
            depthWrite: false
        }));
        scene.add(points);

        const resize = () => {
            const width = window.innerWidth;
            const height = Math.max(1, window.innerHeight - 32);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height, false);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
        };
        resize();
        window.addEventListener('resize', resize);

        let animationFrame = 0;
        let running = true;
        const clock = new THREE.Clock();
        const render = () => {
            if (!running) return;
            const elapsed = clock.getElapsedTime();
            portraitGroup.rotation.y += ((pointer.x * 0.045) - portraitGroup.rotation.y) * 0.04;
            portraitGroup.rotation.x += ((-pointer.y * 0.022) - portraitGroup.rotation.x) * 0.04;
            portrait.position.y = -0.12 + Math.sin(elapsed * 0.32) * 0.012;
            points.rotation.z = elapsed * 0.006;
            glow.rotation.y = elapsed * 0.018;
            renderer.render(scene, camera);
            animationFrame = requestAnimationFrame(render);
        };

        const visibilityHandler = () => {
            running = !document.hidden;
            if (running) {
                clock.start();
                render();
            } else {
                cancelAnimationFrame(animationFrame);
                clock.stop();
            }
        };
        document.addEventListener('visibilitychange', visibilityHandler);
        elements.canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            running = false;
            cancelAnimationFrame(animationFrame);
            document.documentElement.classList.remove('webgl-ready');
            document.documentElement.classList.add('webgl-fallback');
        });

        stopThreeScene = () => {
            running = false;
            cancelAnimationFrame(animationFrame);
            window.removeEventListener('resize', resize);
            document.removeEventListener('visibilitychange', visibilityHandler);
            portrait.geometry.dispose();
            portraitMaterial.dispose();
            texture.dispose();
            glow.geometry.dispose();
            glowMaterial.dispose();
            pointsGeometry.dispose();
            points.material.dispose();
            renderer.dispose();
        };

        document.documentElement.classList.add('webgl-ready');
        render();
    } catch (error) {
        document.documentElement.classList.add('webgl-fallback');
        console.warn('Catharty is using the lightweight portrait fallback:', error);
    }
}

function scheduleThreeScene() {
    const start = () => initThreeScene();
    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(start, { timeout: 1200 });
    } else {
        window.setTimeout(start, 250);
    }
}

function init() {
    renderDesktopIcons();
    windowManager = new DesktopWindowManager();
    bindLaunchers();
    initDockMagnification();
    initFlowField();
    initParallax();
    updateMenuClock();
    window.setInterval(updateMenuClock, 30_000);
    scheduleThreeScene();

    const launchReadme = () => {
        if (safelyReadStorage(README_DISMISSAL_KEY)) return;
        const launcher = elements.dock.querySelector('[data-launch="readme"]');
        windowManager.openSystemWindow('readme', launcher);
    };
    window.setTimeout(launchReadme, REDUCED_MOTION_QUERY.matches ? 0 : 420);

    window.addEventListener('pagehide', () => stopThreeScene(), { once: true });
    document.documentElement.classList.add('desktop-ready');

    // A small public hook makes manual QA and future enhancements straightforward.
    window.cathartyDesktop = {
        posts: POSTS,
        openPost: (id) => {
            const post = POSTS.find((candidate) => candidate.id === id && !candidate.placeholder);
            const trigger = elements.icons.querySelector(`[data-post-id="${CSS.escape(id)}"]`);
            if (post) windowManager.openPost(post, trigger);
        },
        openReadme: () => windowManager.openSystemWindow('readme', elements.dock.querySelector('[data-launch="readme"]')),
        openAbout: () => windowManager.openSystemWindow('about', elements.dock.querySelector('[data-launch="about"]'))
    };
}

init();
