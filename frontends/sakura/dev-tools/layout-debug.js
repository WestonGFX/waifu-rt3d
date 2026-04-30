/**
 * Sakura layout-debug snippet.
 *
 * Why this exists
 * ---------------
 * After the Tier 4 HUD redesign (commit 6120377, 2026-04-28) the user
 * reported that Sakura renders top-left-anchored with significant void
 * to the right and bottom of their Chrome viewport at innerWH 1440×900,
 * dpr 1, zoom 100%. The same bundle could not be reproduced in
 * Playwright at any viewport, nor in a Claude-driven Chrome instance
 * — both correctly fill the viewport. So whatever is causing the void
 * is local to the user's Chrome environment (extension, OS-level CSS,
 * service-worker stale cache, or accessibility setting).
 *
 * This snippet captures everything we'd otherwise have to ask for
 * round-trip-by-round-trip, so the user pastes the result back once
 * and we can see the answer in one shot.
 *
 * How to use
 * ----------
 * 1. Open the Sakura app in Chrome at the broken state.
 * 2. Open DevTools → Console.
 * 3. Paste the entire contents of this file into the console and run.
 * 4. The result is auto-copied to clipboard. Paste it back.
 *
 * The snippet runs as a single self-invoking async function. It does
 * not modify the page. It returns one JSON blob.
 */
(async () => {
  const out = {};
  const safe = (label, fn) => {
    try {
      out[label] = fn();
    } catch (err) {
      out[label] = { error: String(err) };
    }
  };

  out.timestamp = new Date().toISOString();
  out.userAgent = navigator.userAgent;
  out.platform = navigator.platform;
  out.language = navigator.language;

  safe('viewport', () => ({
    inner: [window.innerWidth, window.innerHeight],
    outer: [window.outerWidth, window.outerHeight],
    docClient: [
      document.documentElement.clientWidth,
      document.documentElement.clientHeight,
    ],
    bodyClient: [document.body.clientWidth, document.body.clientHeight],
    dpr: window.devicePixelRatio,
    visualViewport: window.visualViewport
      ? {
          width: window.visualViewport.width,
          height: window.visualViewport.height,
          scale: window.visualViewport.scale,
          offsetLeft: window.visualViewport.offsetLeft,
          offsetTop: window.visualViewport.offsetTop,
        }
      : null,
    screen: {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
    },
  }));

  safe('htmlComputed', () => {
    const cs = getComputedStyle(document.documentElement);
    return {
      width: cs.width,
      height: cs.height,
      transform: cs.transform,
      zoom: cs.zoom,
      overflow: cs.overflow,
      fontSize: cs.fontSize,
    };
  });

  safe('bodyComputed', () => {
    const cs = getComputedStyle(document.body);
    return {
      width: cs.width,
      height: cs.height,
      margin: cs.margin,
      padding: cs.padding,
      transform: cs.transform,
      zoom: cs.zoom,
      overflow: cs.overflow,
      position: cs.position,
    };
  });

  safe('rootComputed', () => {
    const root = document.getElementById('root');
    if (!root) return null;
    const cs = getComputedStyle(root);
    return {
      rect: root.getBoundingClientRect(),
      width: cs.width,
      height: cs.height,
      transform: cs.transform,
      position: cs.position,
      display: cs.display,
    };
  });

  safe('rootChildComputed', () => {
    const root = document.getElementById('root');
    const child = root?.firstElementChild;
    if (!child) return null;
    const cs = getComputedStyle(child);
    return {
      tag: child.tagName,
      className: child.className?.toString?.(),
      rect: child.getBoundingClientRect(),
      width: cs.width,
      height: cs.height,
      transform: cs.transform,
      display: cs.display,
      flexDirection: cs.flexDirection,
    };
  });

  // Anything with a non-identity transform (matrix(1,0,0,1,...) is identity).
  safe('transformedElements', () => {
    const all = [...document.querySelectorAll('*')];
    return all
      .map((el) => {
        const t = getComputedStyle(el).transform;
        if (!t || t === 'none') return null;
        if (/^matrix\(1,\s*0,\s*0,\s*1,\s*0,\s*0\)$/.test(t)) return null;
        return {
          tag: el.tagName,
          cls: el.className?.toString?.()?.slice(0, 60),
          transform: t,
          rect: el.getBoundingClientRect(),
        };
      })
      .filter(Boolean)
      .slice(0, 20);
  });

  // Position: fixed elements (chrome-extension content-scripts often inject these).
  safe('fixedElements', () => {
    return [...document.querySelectorAll('*')]
      .filter((el) => getComputedStyle(el).position === 'fixed')
      .slice(0, 20)
      .map((el) => ({
        tag: el.tagName,
        cls: el.className?.toString?.()?.slice(0, 60),
        id: el.id || null,
        rect: el.getBoundingClientRect(),
        zIndex: getComputedStyle(el).zIndex,
      }));
  });

  // List EVERY <style> tag and the first 80 chars of each — catches
  // extension-injected stylesheets that override layout.
  safe('inlineStyles', () => {
    return [...document.querySelectorAll('style')].map((el, i) => ({
      idx: i,
      length: el.textContent?.length || 0,
      head: el.textContent?.slice(0, 80) || '',
    }));
  });

  safe('linkedStylesheets', () => {
    return [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => ({
      href: l.href,
      media: l.media,
      disabled: l.disabled,
    }));
  });

  // Service worker + caches state.
  out.serviceWorker = await (async () => {
    try {
      if (!('serviceWorker' in navigator)) return { supported: false };
      const regs = await navigator.serviceWorker.getRegistrations();
      const cacheList = await caches.keys();
      const cacheContents = {};
      for (const name of cacheList) {
        try {
          const cache = await caches.open(name);
          const reqs = await cache.keys();
          cacheContents[name] = reqs.slice(0, 10).map((r) => r.url);
        } catch (err) {
          cacheContents[name] = { error: String(err) };
        }
      }
      return {
        supported: true,
        registrations: regs.map((r) => ({
          scriptURL: r.active?.scriptURL,
          state: r.active?.state,
          scope: r.scope,
        })),
        cacheNames: cacheList,
        cacheContents,
      };
    } catch (err) {
      return { error: String(err) };
    }
  })();

  out.scrollState = {
    docScrollLeftTop: [
      document.documentElement.scrollLeft,
      document.documentElement.scrollTop,
    ],
    docScrollSize: [
      document.documentElement.scrollWidth,
      document.documentElement.scrollHeight,
    ],
  };

  // Big elements that don't fill expected dimensions — flag them for review.
  safe('mainSizingChain', () => {
    const root = document.getElementById('root');
    if (!root) return null;
    const chain = [];
    let el = root;
    while (el && chain.length < 8) {
      const cs = getComputedStyle(el);
      chain.push({
        tag: el.tagName,
        cls: el.className?.toString?.()?.slice(0, 50),
        rect: el.getBoundingClientRect(),
        width: cs.width,
        height: cs.height,
        position: cs.position,
        display: cs.display,
      });
      el = el.firstElementChild;
    }
    return chain;
  });

  const blob = JSON.stringify(out, null, 2);
  try {
    await navigator.clipboard.writeText(blob);
    console.info('[layout-debug] result copied to clipboard. Length:', blob.length);
  } catch (err) {
    console.warn('[layout-debug] clipboard write failed:', err);
  }
  console.info('[layout-debug] full result:', out);
  return blob;
})();
