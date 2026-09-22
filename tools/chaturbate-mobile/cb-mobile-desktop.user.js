// ==UserScript==
// @name         CB Desktop — Mobile Layout
// @namespace    https://github.com/EchinopsisM/rentals/tools/chaturbate-mobile
// @version      1.0.0
// @description  Use the full Chaturbate desktop site on a phone: forces the desktop site, then re-lays it out for a small touch screen (big chat, PM/Users/Room tabs on a thumb bar, keyboard-aware input).
// @match        https://chaturbate.com/*
// @match        https://www.chaturbate.com/*
// @match        https://m.chaturbate.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  if (window.top !== window.self) return;
  if (window.__cbmLoaded) return;
  window.__cbmLoaded = true;

  // ---------------------------------------------------------------------------
  // Small persistent settings (per device, localStorage; everything tolerates it
  // being unavailable).
  // ---------------------------------------------------------------------------
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('cbm:' + k);
        return v === null ? d : v;
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('cbm:' + k, String(v));
      } catch (e) { /* ignore */ }
    },
  };
  const session = {
    get(k) {
      try { return sessionStorage.getItem('cbm:' + k); } catch (e) { return null; }
    },
    set(k, v) {
      try { sessionStorage.setItem('cbm:' + k, v); } catch (e) { /* ignore */ }
    },
  };

  // ---------------------------------------------------------------------------
  // 1. Always get the desktop site.
  //    Chaturbate serves the mobile site to phone user agents unless the
  //    `mobile_redirect=never` cookie is present. Setting it means the phone
  //    browser can stay in normal (mobile) mode — which keeps the real screen
  //    width, so the layout below can actually fit the screen.
  // ---------------------------------------------------------------------------
  if (location.hostname === 'm.chaturbate.com') {
    location.replace('https://chaturbate.com' + location.pathname + location.search + location.hash);
    return;
  }
  const hasDesktopCookie = /(?:^|;\s*)mobile_redirect=never(?:;|$)/.test(document.cookie);
  if (!hasDesktopCookie) {
    const maxAge = 60 * 60 * 24 * 365 * 5;
    document.cookie = 'mobile_redirect=never; domain=.chaturbate.com; path=/; max-age=' + maxAge + '; secure; samesite=lax';
    // Reload once so the server sends the desktop page. Guard against a loop in
    // case cookies are blocked.
    if (!session.get('reloaded') && /(?:^|;\s*)mobile_redirect=never/.test(document.cookie)) {
      session.set('reloaded', '1');
      location.reload();
      return;
    }
  }

  let enabled = store.get('enabled', '1') === '1';
  let root = document.documentElement;

  // At document-start some browsers haven't created <html> yet.
  function whenRoot(cb) {
    if (document.documentElement) { root = document.documentElement; cb(); return; }
    const mo = new MutationObserver(() => {
      if (!document.documentElement) return;
      mo.disconnect();
      root = document.documentElement;
      cb();
    });
    mo.observe(document, { childList: true });
  }

  // ---------------------------------------------------------------------------
  // 2. Viewport. The desktop site ships no viewport meta, so phones render it at
  //    ~980px and shrink it. We want real device width when the mobile layout is
  //    on, and a zoomable desktop-width page when it's off.
  // ---------------------------------------------------------------------------
  function setViewport() {
    const content = enabled
      ? 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content'
      : 'width=1200';
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      (document.head || root).appendChild(meta);
    }
    meta.setAttribute('content', content);
  }

  // ---------------------------------------------------------------------------
  // 3. Styles.
  // ---------------------------------------------------------------------------
  const CSS = String.raw`
:root {
  --cbm-top-h: 46px;
  --cbm-nav-h: 58px;
  --cbm-safe-b: env(safe-area-inset-bottom, 0px);
  --cbm-safe-t: env(safe-area-inset-top, 0px);
  --cbm-vh: 100vh;
  --cbm-vtop: 0px;
  --cbm-scale: 1;
  --cbm-bg: #ffffff;
  --cbm-fg: #1f2328;
  --cbm-muted: #6b7280;
  --cbm-bar: #0c6a93;
  --cbm-bar-fg: #ffffff;
  --cbm-bar-muted: rgba(255,255,255,.72);
  --cbm-accent: #f47321;
  --cbm-line: rgba(0,0,0,.12);
  --cbm-sheet: #ffffff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --cbm-bg: #16181d; --cbm-fg: #e8eaed; --cbm-muted: #9aa0a6;
    --cbm-bar: #0f2a3a; --cbm-line: rgba(255,255,255,.14); --cbm-sheet: #1f2228;
  }
}

/* ---------- always-on (only when enabled) : global fixes ---------- */
html.cbm-on { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
html.cbm-on body {
  min-width: 0 !important;
  overflow-x: hidden !important;
  padding-top: calc(var(--cbm-top-h) + var(--cbm-safe-t)) !important;
  padding-bottom: calc(var(--cbm-nav-h) + var(--cbm-safe-b)) !important;
  zoom: 1;
}
html.cbm-on #base,
html.cbm-on #main,
html.cbm-on .main-content-wrapper,
html.cbm-on #main > .content,
html.cbm-on .content,
html.cbm-on .c-1,
html.cbm-on .container,
html.cbm-on .footer-holder,
html.cbm-on .footercon {
  min-width: 0 !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
}
html.cbm-on img, html.cbm-on video, html.cbm-on iframe { max-width: 100%; }
html.cbm-on table { max-width: 100%; }
html.cbm-on .cbm-scroll-x { overflow-x: auto !important; -webkit-overflow-scrolling: touch; max-width: 100% !important; display: block; }

/* Inputs >= 16px so iOS doesn't zoom on focus. */
html.cbm-on input:not([type=checkbox]):not([type=radio]):not([type=range]),
html.cbm-on select,
html.cbm-on textarea,
html.cbm-on [contenteditable="true"] {
  font-size: max(16px, 1em) !important;
}

/* Site header becomes a slide-down drawer opened from the top bar. */
html.cbm-on #desktop-spa-header,
html.cbm-on #header {
  position: fixed !important;
  top: calc(var(--cbm-top-h) + var(--cbm-safe-t)) !important;
  left: 0 !important; right: 0 !important;
  width: 100% !important; min-width: 0 !important;
  height: auto !important;
  max-height: calc(var(--cbm-vh) - var(--cbm-top-h) - var(--cbm-nav-h) - var(--cbm-safe-t) - var(--cbm-safe-b));
  overflow-y: auto !important; overflow-x: hidden !important;
  z-index: 2147482000 !important;
  box-shadow: 0 12px 30px rgba(0,0,0,.35);
  transform: translateY(-120%);
  visibility: hidden;
  transition: transform .2s ease, visibility 0s linear .2s;
  background: var(--cbm-sheet);
}
html.cbm-on.cbm-menu #desktop-spa-header,
html.cbm-on.cbm-menu #header {
  transform: none; visibility: visible;
  transition: transform .2s ease;
}
html.cbm-on #desktop-spa-header *,
html.cbm-on #header * { max-width: 100%; }
html.cbm-on #desktop-spa-header > *,
html.cbm-on #desktop-spa-header > * > *,
html.cbm-on #desktop-spa-header nav,
html.cbm-on #desktop-spa-header [class*="nav"],
html.cbm-on #desktop-spa-header [class*="row"],
html.cbm-on #header > *,
html.cbm-on #header nav {
  width: auto !important; min-width: 0 !important;
  height: auto !important;
  flex-wrap: wrap !important;
  white-space: normal !important;
}
html.cbm-on #desktop-spa-header a,
html.cbm-on #desktop-spa-header button,
html.cbm-on #header a { min-height: 36px; display: inline-flex; align-items: center; }

html.cbm-on .top_alert { font-size: 13px; }
/* "Try our mobile site" nag — the whole point is not to. */
html.cbm-on .top_alert:has([data-testid="mobile-site-notice-link"]) { display: none !important; }

/* ---------- top bar & bottom nav ---------- */
#cbm-top, #cbm-nav, #cbm-sheet, #cbm-scrim { display: none; }
html.cbm-on #cbm-top {
  display: flex; align-items: center; gap: 4px;
  position: fixed; left: 0; right: 0;
  top: var(--cbm-vtop);
  height: calc(var(--cbm-top-h) + var(--cbm-safe-t));
  padding: var(--cbm-safe-t) 6px 0;
  box-sizing: border-box;
  background: var(--cbm-bar); color: var(--cbm-bar-fg);
  z-index: 2147482600;
  font: 600 15px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  box-shadow: 0 1px 0 rgba(0,0,0,.2);
}
#cbm-top .cbm-title {
  flex: 1 1 auto; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 0 4px;
}
#cbm-top .cbm-title small { display: block; font-weight: 400; font-size: 11px; color: var(--cbm-bar-muted); overflow: hidden; text-overflow: ellipsis; }
.cbm-ib {
  flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 40px; height: 40px; padding: 0 8px;
  border: 0; border-radius: 10px;
  background: transparent; color: inherit;
  font: 600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-tap-highlight-color: transparent;
  cursor: pointer;
}
.cbm-ib:active { background: rgba(255,255,255,.18); }
.cbm-ib svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

html.cbm-on.cbm-room #cbm-nav {
  display: grid; grid-auto-flow: column; grid-auto-columns: 1fr;
  position: fixed; left: 0; right: 0;
  top: calc(var(--cbm-vtop) + var(--cbm-vh) - var(--cbm-nav-h) - var(--cbm-safe-b));
  height: calc(var(--cbm-nav-h) + var(--cbm-safe-b));
  padding-bottom: var(--cbm-safe-b);
  box-sizing: border-box;
  background: var(--cbm-sheet); color: var(--cbm-muted);
  border-top: 1px solid var(--cbm-line);
  z-index: 2147482600;
}
html.cbm-on:not(.cbm-room) body { padding-bottom: var(--cbm-safe-b) !important; }
#cbm-nav button {
  position: relative;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  border: 0; background: transparent; color: inherit;
  font: 600 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-tap-highlight-color: transparent;
  cursor: pointer;
}
#cbm-nav button svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
#cbm-nav button[aria-current="true"] { color: var(--cbm-accent); }
.cbm-badge {
  position: absolute; top: 5px; left: calc(50% + 6px);
  min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box;
  border-radius: 9px; background: #e5383b; color: #fff;
  font: 700 11px/18px -apple-system, BlinkMacSystemFont, sans-serif; text-align: center;
}
.cbm-badge:empty { display: none; }

/* Keyboard open: hide the bottom bar so the input sits right above the keys. */
html.cbm-on.cbm-kb #cbm-nav { display: none !important; }

/* Bottom sheet (layout options) */
html.cbm-on #cbm-scrim.cbm-open {
  display: block; position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 2147482800;
}
html.cbm-on #cbm-sheet.cbm-open {
  display: block; position: fixed; left: 0; right: 0; bottom: 0;
  max-height: 80vh; overflow: auto;
  padding: 8px 16px calc(16px + var(--cbm-safe-b));
  background: var(--cbm-sheet); color: var(--cbm-fg);
  border-radius: 16px 16px 0 0;
  z-index: 2147482900;
  font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
#cbm-sheet h3 { margin: 10px 0 4px; font-size: 13px; font-weight: 600; color: var(--cbm-muted); text-transform: uppercase; letter-spacing: .04em; }
#cbm-sheet .cbm-row { display: flex; gap: 8px; flex-wrap: wrap; margin: 6px 0 12px; }
#cbm-sheet .cbm-row button {
  flex: 1 1 0; min-width: 72px; min-height: 44px;
  border: 1px solid var(--cbm-line); border-radius: 10px;
  background: transparent; color: inherit; font: inherit; cursor: pointer;
}
#cbm-sheet .cbm-row button[aria-pressed="true"] { border-color: var(--cbm-accent); color: var(--cbm-accent); font-weight: 600; }
#cbm-sheet p { margin: 4px 0 8px; color: var(--cbm-muted); font-size: 13px; }
#cbm-sheet .cbm-grip { width: 40px; height: 5px; border-radius: 3px; background: var(--cbm-line); margin: 0 auto 6px; }

/* ---------- room page ---------- */
html.cbm-on.cbm-room #footer-holder,
html.cbm-on.cbm-room .footer-holder { display: none !important; }

html.cbm-on.cbm-room #main,
html.cbm-on.cbm-room .main-content-wrapper,
html.cbm-on.cbm-room #theatermode-root,
html.cbm-on.cbm-room .BaseRoomContents {
  width: 100% !important; min-width: 0 !important; max-width: 100% !important;
  margin: 0 !important; padding: 0 !important; left: 0 !important;
  box-sizing: border-box !important;
}
html.cbm-on.cbm-room .topSectionWrapper {
  display: flex !important; flex-direction: column !important;
  width: 100% !important; min-width: 0 !important; max-width: 100% !important;
  height: auto !important; margin: 0 !important; padding: 0 !important;
  box-sizing: border-box !important;
}
html.cbm-on.cbm-room #VideoPanel {
  width: 100% !important; min-width: 0 !important; max-width: 100% !important;
  height: auto !important; margin: 0 !important; flex: none !important;
  box-sizing: border-box !important;
}
html.cbm-on.cbm-room #VideoPanel > *,
html.cbm-on.cbm-room #VideoPanel [data-testid="control-panel"] {
  max-width: 100% !important; box-sizing: border-box !important;
}
html.cbm-on.cbm-room #TheaterModePlayer,
html.cbm-on.cbm-room #VideoPanel [data-testid="video-container"] {
  width: 100% !important; min-width: 0 !important;
  height: auto !important;
  aspect-ratio: 16 / 9;
  max-height: var(--cbm-video-max, 42vh);
  left: 0 !important; top: 0 !important;
}
html.cbm-on.cbm-room #VideoPanel [data-testid="video-container"] { position: absolute !important; height: 100% !important; max-height: none; }
html.cbm-on.cbm-room #VideoPanel [data-testid="video"],
html.cbm-on.cbm-room #VideoPanel video,
html.cbm-on.cbm-room #VideoPanel .video-js {
  width: 100% !important; height: 100% !important; object-fit: contain;
}
html.cbm-on.cbm-room .theater-video-controls {
  width: 100% !important; left: 0 !important; right: 0 !important;
  box-sizing: border-box !important;
  overflow-x: auto; overflow-y: visible;
}
html.cbm-on.cbm-room .theater-video-controls .hover-btn { min-width: 32px; }
html.cbm-on.cbm-room .theater-overlay { width: auto !important; }
html.cbm-on.cbm-room .topSectionWrapper > .resizeHandle,
html.cbm-on.cbm-room .topSectionWrapper > [class*="resizeHandle"] { display: none !important; }
/* Draggable floating chat only exists for mouse use; the split chat below replaces it. */
html.cbm-on.cbm-room.cbm-has-split #draggableCanvasChatWindow { display: none !important; }

/* Video sizes */
html.cbm-on.cbm-room.cbm-video-small { --cbm-video-max: 24vh; }
html.cbm-on.cbm-room.cbm-video-large { --cbm-video-max: 60vh; }
html.cbm-on.cbm-room.cbm-video-off.cbm-view-chat #VideoPanel { display: none !important; }

/* The chat panel (CHAT / PM / USERS / SETTINGS and any broadcaster tabs). */
html.cbm-on.cbm-room #ChatTabContainer {
  width: 100% !important; min-width: 0 !important; max-width: 100% !important;
  margin: 0 !important; box-sizing: border-box !important;
  font-size: calc(14px * var(--cbm-scale)) !important;
}
html.cbm-on.cbm-room #ChatTabContainer > #tab-row,
html.cbm-on.cbm-room #ChatTabContainer > [id="tab-row"] {
  height: auto !important; min-height: 40px;
  display: flex !important; flex-wrap: nowrap; align-items: stretch;
  overflow-x: auto !important; overflow-y: hidden !important;
  padding: 2px 4px 0 !important; box-sizing: border-box !important;
  scrollbar-width: none;
}
html.cbm-on.cbm-room #ChatTabContainer > #tab-row::-webkit-scrollbar { display: none; }
html.cbm-on.cbm-room #ChatTabContainer > #tab-row > * { flex: none; float: none !important; }
/* The "…" overflow menu for tabs that don't fit: put it at the end of the row. */
html.cbm-on.cbm-room #ChatTabContainer > #tab-row > .dropdown-anchor { position: static !important; order: 99; }
html.cbm-on.cbm-room #ChatTabContainer .chat-tab-handle,
html.cbm-on.cbm-room #ChatTabContainer #tab-row .tab {
  height: auto !important; min-height: 36px;
  display: inline-flex !important; align-items: center;
  padding: 0 14px !important; font-size: 13px !important;
}

/* chat view: video + chat fill the screen between the two bars */
html.cbm-on.cbm-room.cbm-view-chat,
html.cbm-on.cbm-room.cbm-view-chat body { overflow: hidden !important; overscroll-behavior: none; }
html.cbm-on.cbm-room.cbm-view-chat .topSectionWrapper {
  position: fixed !important;
  left: 0 !important; right: 0 !important;
  top: calc(var(--cbm-vtop) + var(--cbm-top-h) + var(--cbm-safe-t)) !important;
  height: calc(var(--cbm-vh) - var(--cbm-top-h) - var(--cbm-safe-t) - var(--cbm-nav-h) - var(--cbm-safe-b)) !important;
  z-index: 40;
  background: var(--cbm-bg);
}
html.cbm-on.cbm-room.cbm-view-chat.cbm-kb .topSectionWrapper {
  height: calc(var(--cbm-vh) - var(--cbm-top-h) - var(--cbm-safe-t)) !important;
}
/* While typing, keep the video small so the conversation stays readable. */
html.cbm-on.cbm-room.cbm-view-chat.cbm-kb { --cbm-video-max: 18vh; }
html.cbm-on.cbm-room.cbm-view-chat #VideoPanel > :not(#TheaterModePlayer) { display: none !important; }
html.cbm-on.cbm-room.cbm-view-chat #roomTabs { display: none !important; }
html.cbm-on.cbm-room.cbm-view-chat #ChatTabContainer {
  flex: 1 1 auto !important; min-height: 0 !important; height: auto !important;
  display: flex !important; flex-direction: column !important;
  overflow: hidden !important;
}
html.cbm-on.cbm-room.cbm-view-chat #ChatTabContainer > .window,
html.cbm-on.cbm-room.cbm-view-chat #ChatTabContainer > div:not(#tab-row) {
  flex: 1 1 auto !important; min-height: 0 !important;
  height: auto !important; width: 100% !important;
  position: relative !important;
  display: flex; flex-direction: column;
}
html.cbm-on.cbm-room.cbm-view-chat #ChatTabContainer > .window > *,
html.cbm-on.cbm-room.cbm-view-chat #ChatTabContainer > .window > * > * {
  width: 100% !important; max-width: 100% !important;
  box-sizing: border-box !important;
}
html.cbm-on.cbm-room.cbm-view-chat #ChatTabContainer > .window > * {
  flex: 1 1 auto; min-height: 0 !important; height: auto !important;
  position: relative !important;
}
html.cbm-on.cbm-room.cbm-view-chat #ChatTabContents {
  display: flex; flex-direction: column;
  height: 100% !important;
}
html.cbm-on.cbm-room.cbm-view-chat #ChatTabContents > .msg-list-wrapper-split,
html.cbm-on.cbm-room.cbm-view-chat #ChatTabContents > [class*="msg-list-wrapper"] {
  flex: 1 1 auto !important; min-height: 0 !important; height: auto !important;
  position: relative !important;
}
html.cbm-on.cbm-room.cbm-view-chat #ChatTabContents .message-list {
  position: absolute !important; inset: 0 !important;
  width: auto !important; height: auto !important;
  overflow-y: auto !important; -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding: 4px 8px !important; box-sizing: border-box !important;
}
html.cbm-on.cbm-room #ChatTabContainer [data-testid="chat-message"],
html.cbm-on.cbm-room #ChatTabContainer .msg-text {
  font-size: calc(14px * var(--cbm-scale)) !important;
  line-height: 1.4 !important;
  width: auto !important;
  padding-top: 2px !important; padding-bottom: 2px !important;
}
html.cbm-on.cbm-room #ChatTabContainer [data-testid="chat-message"] * { font-size: inherit !important; line-height: inherit !important; }
html.cbm-on.cbm-room #ChatTabContainer [data-testid="chat-message-username"],
html.cbm-on.cbm-room #ChatTabContainer .username { padding: 2px 0; }

/* Chat input row: tall, easy to hit. */
html.cbm-on.cbm-room .chat-row-div {
  flex: none !important; width: 100% !important; box-sizing: border-box !important;
  height: auto !important; min-height: 52px;
  display: flex !important; align-items: center;
}
html.cbm-on.cbm-room .chat-row-div > .chat-input-div { flex: 1 1 auto !important; min-width: 0 !important; width: auto !important; }
html.cbm-on.cbm-room .chat-input-div {
  height: auto !important; min-height: 50px !important;
  padding: 6px 6px 6px 10px !important;
  align-items: center;
}
html.cbm-on.cbm-room .chat-input-form { min-height: 38px; }
html.cbm-on.cbm-room [data-testid="chat-input"],
html.cbm-on.cbm-room .chat-input-field {
  height: auto !important; min-height: 22px;
  line-height: 22px !important;
  font-size: 16px !important;
  white-space: pre-wrap !important; overflow-x: hidden !important;
  max-height: 88px; overflow-y: auto !important;
}
html.cbm-on.cbm-room .tip-button,
html.cbm-on.cbm-room [data-testid="send-tip-button"],
html.cbm-on.cbm-room [data-testid="emoji-button"],
html.cbm-on.cbm-room .SendButton,
html.cbm-on.cbm-room [data-testid="send-dm-button"] {
  min-height: 36px; min-width: 36px;
  display: inline-flex !important; align-items: center; justify-content: center;
  font-size: 15px !important;
}

/* PM + user list panes: fill, scroll, larger rows. */
html.cbm-on.cbm-room.cbm-view-chat #UserListTab,
html.cbm-on.cbm-room.cbm-view-chat [id*="PmTab"],
html.cbm-on.cbm-room.cbm-view-chat [id*="SettingsTab"] {
  height: 100% !important; overflow-y: auto !important; -webkit-overflow-scrolling: touch;
}
html.cbm-on.cbm-room #UserListTab .username,
html.cbm-on.cbm-room #UserListTab [data-testid="username"] {
  display: inline-block; padding: 7px 4px !important; font-size: calc(15px * var(--cbm-scale)) !important;
}
html.cbm-on.cbm-room [data-testid="conversation-list-item"] { padding-top: 10px !important; padding-bottom: 10px !important; font-size: calc(14px * var(--cbm-scale)) !important; }
html.cbm-on.cbm-room [data-testid="message-preview"] { font-size: calc(13px * var(--cbm-scale)) !important; }
html.cbm-on.cbm-room [data-testid="back-to-conversation-list-button"] { min-height: 40px; min-width: 40px; }

/* room view: normal scrolling page with video, controls, tip/token panel and all room tabs */
html.cbm-on.cbm-room.cbm-view-room #ChatTabContainer { display: none !important; }
html.cbm-on.cbm-room.cbm-view-room #roomTabs {
  width: 100% !important; min-width: 0 !important; max-width: 100% !important;
  margin: 0 !important; height: auto !important; box-sizing: border-box !important;
}
html.cbm-on.cbm-room.cbm-view-room #roomTabs .tabBar {
  height: auto !important; min-height: 40px;
  display: flex !important; flex-wrap: wrap; align-items: center; gap: 4px;
  padding: 6px !important;
}
html.cbm-on.cbm-room.cbm-view-room #roomTabs .tabBar > * { float: none !important; position: static !important; }
html.cbm-on.cbm-room.cbm-view-room #roomTabs .tabLink { display: inline-flex !important; align-items: center; min-height: 36px; padding: 0 10px !important; }
html.cbm-on.cbm-room.cbm-view-room #roomTabs table,
html.cbm-on.cbm-room.cbm-view-room #roomTabs tbody,
html.cbm-on.cbm-room.cbm-view-room #roomTabs tr { display: block; width: 100% !important; }
html.cbm-on.cbm-room.cbm-view-room #roomTabs td { display: block; width: auto !important; box-sizing: border-box; }
html.cbm-on.cbm-room.cbm-view-room #roomTabs td.label { padding-top: 10px !important; font-weight: 600; }
html.cbm-on.cbm-room.cbm-view-room #roomTabs .bioContentText { display: flex; flex-wrap: wrap; gap: 6px; }
html.cbm-on.cbm-room.cbm-view-room #roomTabs * { max-width: 100%; box-sizing: border-box; }
html.cbm-on.cbm-room.cbm-view-room #roomTabs input,
html.cbm-on.cbm-room.cbm-view-room #roomTabs select,
html.cbm-on.cbm-room.cbm-view-room #roomTabs textarea { max-width: 100% !important; }
html.cbm-on.cbm-room.cbm-view-room [data-testid="control-panel"] {
  display: block !important; width: 100% !important; height: auto !important;
  padding: 8px !important; font-size: 13px !important;
}
html.cbm-on.cbm-room.cbm-view-room [data-testid="control-panel"] > * { display: block !important; width: auto !important; }
html.cbm-on.cbm-room.cbm-view-room [data-testid="control-panel"] .panelLink { display: inline-flex !important; min-height: 36px; align-items: center; }

/* Modals / popups the site positions for a wide screen: keep them on-screen. */
html.cbm-on [data-testid="tip-modal-container"],
html.cbm-on .cbm-clamped {
  max-width: calc(100vw - 16px) !important;
  max-height: calc(var(--cbm-vh) - 16px) !important;
  overflow: auto !important;
  box-sizing: border-box !important;
}

/* ---------- non-room pages ---------- */
html.cbm-on:not(.cbm-room) #main { padding-left: 8px !important; padding-right: 8px !important; }
html.cbm-on:not(.cbm-room) .main-content-wrapper { width: 100% !important; flex: 1 1 auto; min-width: 0 !important; padding-left: 0 !important; padding-right: 0 !important; }
html.cbm-on:not(.cbm-room) .HomepagePaginatedRoomlist,
html.cbm-on:not(.cbm-room) [class*="PaginatedRoomlist"] { margin-left: 0 !important; margin-right: 0 !important; }
html.cbm-on:not(.cbm-room) .RoomCardGrid {
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)) !important;
  gap: 8px !important; width: 100% !important;
}
html.cbm-on:not(.cbm-room) .RoomCardGrid > * { width: auto !important; min-width: 0 !important; margin: 0 !important; }
html.cbm-on:not(.cbm-room) .top-section { flex-wrap: wrap !important; height: auto !important; gap: 6px; }
/* Homepage filter sidebar becomes a slide-over panel (the site's own close button still works). */
html.cbm-on .homepageFilterPanel.active {
  position: fixed !important;
  top: calc(var(--cbm-vtop) + var(--cbm-top-h) + var(--cbm-safe-t)) !important;
  right: 0 !important; bottom: 0 !important; left: auto !important;
  width: min(86vw, 340px) !important; height: auto !important;
  overflow-y: auto !important; -webkit-overflow-scrolling: touch;
  padding: 8px 12px calc(16px + var(--cbm-safe-b)) !important; box-sizing: border-box !important;
  z-index: 2147481000 !important;
  box-shadow: -10px 0 30px rgba(0,0,0,.3);
}
html.cbm-on .homepageFilterPanel.active .closeButton { padding: 12px; margin: -12px; }
html.cbm-on .homepageFilterPanel.active .filterSectionOptions,
html.cbm-on .homepageFilterPanel.active .tagSearchDiv,
html.cbm-on .homepageFilterPanel.active .tagSearchInput { width: auto !important; max-width: 100% !important; }
html.cbm-on .homepageFilterPanel.active .tagSearchInput { position: static !important; width: 100% !important; }
html.cbm-on:not(.cbm-room) ul.list,
html.cbm-on:not(.cbm-room) ul.room_list,
html.cbm-on:not(.cbm-room) #roomlist_root ul {
  display: grid !important;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px; width: 100% !important; margin: 0 !important; padding: 0 !important;
}
html.cbm-on:not(.cbm-room) ul.list > li,
html.cbm-on:not(.cbm-room) ul.room_list > li,
html.cbm-on:not(.cbm-room) #roomlist_root ul > li.room_list_room,
html.cbm-on:not(.cbm-room) #roomlist_root li.roomCard {
  width: auto !important; min-width: 0 !important; margin: 0 !important; float: none !important;
}
html.cbm-on:not(.cbm-room) ul.list > li img,
html.cbm-on:not(.cbm-room) #roomlist_root li img { width: 100% !important; height: auto !important; }
html.cbm-on:not(.cbm-room) form input:not([type=checkbox]):not([type=radio]),
html.cbm-on:not(.cbm-room) form select,
html.cbm-on:not(.cbm-room) form textarea { max-width: 100% !important; box-sizing: border-box; }
html.cbm-on:not(.cbm-room) #footer-holder ul { display: flex !important; flex-wrap: wrap; justify-content: center; gap: 4px 10px; }
`;

  function injectStyle() {
    if (document.getElementById('cbm-style')) return;
    const s = document.createElement('style');
    s.id = 'cbm-style';
    s.textContent = CSS;
    (document.head || root).appendChild(s);
  }

  function applyEnabled() {
    root.classList.toggle('cbm-on', enabled);
    setViewport();
  }

  // Kick off as early as possible to avoid a flash of the tiny desktop layout.
  whenRoot(() => {
    injectStyle();
    applyEnabled();
  });

  // ---------------------------------------------------------------------------
  // 4. UI chrome.
  // ---------------------------------------------------------------------------
  const ICONS = {
    menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
    pm: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2A6.5 6.5 0 0 1 21.5 20"/></svg>',
    room: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 13h8M8 16h5"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>',
    tune: '<svg viewBox="0 0 24 24"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    top: '<svg viewBox="0 0 24 24"><path d="M6 14l6-6 6 6"/></svg>',
    desktop: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/></svg>',
  };

  let topBar, nav, sheet, scrim, titleEl, badgeEl, restoreBtn;
  let view = store.get('view', 'chat'); // 'chat' | 'room'
  let lastTab = 'chat';

  function h(tag, attrs, html) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (html != null) el.innerHTML = html;
    return el;
  }

  function buildChrome() {
    if (document.getElementById('cbm-top')) return;

    topBar = h('div', { id: 'cbm-top', role: 'banner' });
    const menuBtn = h('button', { class: 'cbm-ib', type: 'button', 'aria-label': 'Site menu', id: 'cbm-menu-btn' }, ICONS.menu);
    titleEl = h('div', { class: 'cbm-title' });
    const layoutBtn = h('button', { class: 'cbm-ib', type: 'button', 'aria-label': 'Layout options' }, ICONS.tune);
    topBar.append(menuBtn, titleEl, layoutBtn);

    menuBtn.addEventListener('click', () => toggleMenu());
    layoutBtn.addEventListener('click', () => openSheet());
    titleEl.addEventListener('click', () => {
      if (!root.classList.contains('cbm-room')) window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    nav = h('nav', { id: 'cbm-nav', 'aria-label': 'Room' });
    const items = [
      ['chat', 'Chat', ICONS.chat],
      ['pm', 'PMs', ICONS.pm],
      ['users', 'Users', ICONS.users],
      ['room', 'Room', ICONS.room],
    ];
    for (const [key, label, icon] of items) {
      const b = h('button', { type: 'button', 'data-cbm': key }, icon + '<span>' + label + '</span>');
      if (key === 'pm') {
        badgeEl = h('span', { class: 'cbm-badge', 'aria-label': 'unread' });
        b.appendChild(badgeEl);
      }
      b.addEventListener('click', () => onNav(key));
      nav.appendChild(b);
    }

    scrim = h('div', { id: 'cbm-scrim' });
    sheet = h('div', { id: 'cbm-sheet', role: 'dialog', 'aria-label': 'Layout options' });
    scrim.addEventListener('click', closeSheet);

    // Floating "back to mobile layout" button shown only when disabled.
    restoreBtn = h('button', { id: 'cbm-restore', type: 'button', 'aria-label': 'Mobile layout' }, 'Mobile layout');
    restoreBtn.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483000;padding:14px 18px;border:0;border-radius:24px;background:#0c6a93;color:#fff;font:600 28px/1 -apple-system,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.35);';
    restoreBtn.addEventListener('click', () => setEnabled(true));

    document.body.append(topBar, nav, scrim, sheet, restoreBtn);

    // Close the menu drawer when a link in it is followed or the page is tapped.
    document.addEventListener('click', (e) => {
      if (!root.classList.contains('cbm-menu')) return;
      const t = e.target;
      if (t.closest('#cbm-top')) return;
      const hdr = t.closest('#desktop-spa-header, #header');
      if (!hdr) { toggleMenu(false); return; }
      if (t.closest('a[href]:not([href="#"])')) toggleMenu(false);
    }, true);
  }

  function toggleMenu(force) {
    const open = force === undefined ? !root.classList.contains('cbm-menu') : force;
    root.classList.toggle('cbm-menu', open);
    const b = document.getElementById('cbm-menu-btn');
    if (b) b.innerHTML = open ? ICONS.close : ICONS.menu;
  }

  function sheetButtons(title, options, current, onPick, note) {
    let html = '<h3>' + title + '</h3><div class="cbm-row">';
    for (const [val, label] of options) {
      html += '<button type="button" data-val="' + val + '" aria-pressed="' + (String(val) === String(current)) + '">' + label + '</button>';
    }
    html += '</div>' + (note ? '<p>' + note + '</p>' : '');
    const wrap = h('div', null, html);
    wrap.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { onPick(b.dataset.val); renderSheet(); }));
    return wrap;
  }

  function renderSheet() {
    sheet.innerHTML = '<div class="cbm-grip"></div>';
    sheet.appendChild(sheetButtons('Video size', [['off', 'Hidden'], ['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']],
      store.get('video', 'medium'), (v) => { store.set('video', v); applyPrefs(); },
      'Hidden only hides the player in the chat view; the stream keeps running.'));
    sheet.appendChild(sheetButtons('Chat text size', [['0.9', 'S'], ['1', 'M'], ['1.15', 'L'], ['1.3', 'XL']],
      store.get('scale', '1'), (v) => { store.set('scale', v); applyPrefs(); }));
    sheet.appendChild(sheetButtons('Layout', [['on', 'Mobile'], ['off', 'Plain desktop']],
      enabled ? 'on' : 'off', (v) => { closeSheet(); setEnabled(v === 'on'); },
      'Plain desktop shows the untouched site (pinch to zoom). A button in the corner brings this layout back.'));
  }

  function openSheet() {
    toggleMenu(false);
    renderSheet();
    sheet.classList.add('cbm-open');
    scrim.classList.add('cbm-open');
  }
  function closeSheet() {
    sheet.classList.remove('cbm-open');
    scrim.classList.remove('cbm-open');
  }

  function setEnabled(on) {
    enabled = on;
    store.set('enabled', on ? '1' : '0');
    applyEnabled();
    if (restoreBtn) restoreBtn.style.display = on ? 'none' : 'block';
    if (on) { applyPrefs(); tick(); }
    else { root.classList.remove('cbm-menu', 'cbm-kb'); }
    window.dispatchEvent(new Event('resize'));
  }

  function applyPrefs() {
    const v = store.get('video', 'medium');
    for (const k of ['off', 'small', 'medium', 'large']) root.classList.toggle('cbm-video-' + k, v === k);
    root.style.setProperty('--cbm-scale', store.get('scale', '1'));
    setView(view, true);
  }

  // ---------------------------------------------------------------------------
  // 5. Room navigation. The bottom bar drives the site's own tabs, so every
  //    desktop feature (PM threads, user list actions, chat settings, broadcaster
  //    tabs) keeps working exactly as it does on a computer.
  // ---------------------------------------------------------------------------
  const NATIVE_TAB = {
    chat: ['#chat-tab-default', '[data-testid="chat-tab-default"]'],
    pm: ['#pm-tab-default', '[data-testid="pm-tab-default"]'],
    users: ['#users-tab-default', '[data-testid="users-tab-default"]'],
  };

  function q(sels) {
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  }

  function onNav(key) {
    toggleMenu(false);
    if (key === 'room') {
      setView('room');
      return;
    }
    setView('chat');
    const tab = q(NATIVE_TAB[key]);
    if (tab) tab.click();
    lastTab = key;
    markNav();
  }

  function setView(v, silent) {
    view = v;
    store.set('view', v);
    root.classList.toggle('cbm-view-chat', v === 'chat');
    root.classList.toggle('cbm-view-room', v === 'room');
    if (!silent) {
      window.scrollTo(0, 0);
      // The site recalculates its own sizes on resize; let it know.
      window.dispatchEvent(new Event('resize'));
    }
    markNav();
  }

  function activeNativeTab() {
    for (const k of ['chat', 'pm', 'users']) {
      const t = q(NATIVE_TAB[k]);
      if (t && /\bactive\b/.test(t.className)) return k;
    }
    // Settings or a broadcaster-only tab is open.
    return null;
  }

  function markNav() {
    if (!nav) return;
    const current = view === 'room' ? 'room' : (activeNativeTab() || '');
    nav.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.cbm === current)));
  }

  function unreadCount() {
    // Prefer the site's own counter; fall back to a number inside the PM tab label.
    const el = document.querySelector('#pm-tab-default [data-testid="unread-message-count"], [data-testid="unread-message-count"]');
    let n = el ? parseInt(el.textContent.replace(/\D+/g, ''), 10) : NaN;
    if (isNaN(n)) {
      const tab = q(NATIVE_TAB.pm);
      const m = tab && tab.textContent.match(/\((\d+)\)/);
      n = m ? parseInt(m[1], 10) : 0;
    }
    return n || 0;
  }

  function roomName() {
    const m = location.pathname.match(/^\/(?:b\/)?([A-Za-z0-9_]+)\/?$/);
    return m ? m[1] : '';
  }

  // ---------------------------------------------------------------------------
  // 6. Keyboard / visual viewport. Size the fixed shell to what's actually
  //    visible so the chat input sits right on top of the on-screen keyboard.
  // ---------------------------------------------------------------------------
  let baseH = 0;
  function onViewport() {
    const vv = window.visualViewport;
    const hgt = vv ? vv.height : window.innerHeight;
    const top = vv ? vv.offsetTop : 0;
    baseH = Math.max(baseH, window.innerHeight, hgt);
    root.style.setProperty('--cbm-vh', hgt + 'px');
    root.style.setProperty('--cbm-vtop', top + 'px');
    const ae = document.activeElement;
    const typing = ae && (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName));
    root.classList.toggle('cbm-kb', !!typing && hgt < baseH * 0.8);
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onViewport);
    window.visualViewport.addEventListener('scroll', onViewport);
  }
  window.addEventListener('resize', () => { baseH = 0; onViewport(); });
  window.addEventListener('orientationchange', () => { baseH = 0; setTimeout(onViewport, 300); });
  document.addEventListener('focusin', () => setTimeout(onViewport, 50));
  document.addEventListener('focusout', () => setTimeout(onViewport, 50));

  // ---------------------------------------------------------------------------
  // 7. Keep site popups (user menus, tip dialog, emoji picker…) on screen. They
  //    are positioned for a mouse on a wide screen; nudge them back inside.
  // ---------------------------------------------------------------------------
  function clampPopups() {
    const vw = document.documentElement.clientWidth;
    const candidates = document.querySelectorAll('body > div, #main div[style*="z-index"], #base div[style*="z-index"]');
    for (const el of candidates) {
      if (el.id && el.id.startsWith('cbm-')) continue;
      const st = el.style;
      if (!st || !(st.position === 'absolute' || st.position === 'fixed')) continue;
      const z = parseInt(st.zIndex || '0', 10);
      if (z < 100) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.right > vw + 1 || r.left < -1) {
        el.classList.add('cbm-clamped');
        const w = Math.min(r.width, vw - 16);
        const left = Math.max(8, Math.min(r.left, vw - w - 8));
        const parent = el.offsetParent ? el.offsetParent.getBoundingClientRect() : { left: 0 };
        st.left = (left - (st.position === 'fixed' ? 0 : parent.left)) + 'px';
        st.right = 'auto';
        st.marginLeft = '0';
        st.transform = st.transform && /translateX\(-50%\)/.test(st.transform) ? 'none' : st.transform;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 8. Main loop: the desktop site is a single-page app, so pages change without
  //    reloads. Re-check what's on screen a few times a second (cheap).
  // ---------------------------------------------------------------------------
  let lastPath = '';
  function tick() {
    if (!enabled) return;
    injectStyle();
    // Room components also sit hidden inside other pages of the app, so only
    // count them when they're actually rendered.
    const isRoom = [...document.querySelectorAll('.BaseRoomContents, #VideoPanel')].some((el) => el.getClientRects().length > 0);
    root.classList.toggle('cbm-room', isRoom);

    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      toggleMenu(false);
      closeSheet();
      if (isRoom) setView(store.get('view', 'chat'), true);
    }

    if (isRoom) {
      const split = document.querySelector('#ChatTabContainer');
      const splitVisible = split && split.style.display !== 'none';
      root.classList.toggle('cbm-has-split', !!splitVisible);
      // If the site is in "chat over video" mode the split chat is hidden;
      // switch back to the split layout the phone view is built around.
      if (split && !splitVisible && !tick.switched) {
        const toggle = document.querySelector('#theater-mode-icon');
        if (toggle) { tick.switched = true; toggle.click(); }
      }
      if (!root.classList.contains('cbm-view-chat') && !root.classList.contains('cbm-view-room')) setView('chat', true);

      const n = unreadCount();
      if (badgeEl) badgeEl.textContent = n ? String(n > 99 ? '99+' : n) : '';
      markNav();
    }

    const name = roomName();
    const subject = document.querySelector('[data-testid="room-subject"], .RoomSubject, [data-testid="roomSubjectContainer"]');
    let title = isRoom && name ? name : (document.title || 'Chaturbate').replace(/\s*[-|–]\s*Chaturbate.*$/i, '');
    if (/^Chaturbate\s*[-|–]/i.test(title)) title = 'Chaturbate';
    if (titleEl) {
      let sub = isRoom && subject ? subject.textContent.trim() : '';
      if (/^error loading component$/i.test(sub)) sub = '';
      if (name && sub.toLowerCase().startsWith(name.toLowerCase())) sub = sub.slice(name.length).trim();
      const html = escapeHtml(title) + (sub ? '<small>' + escapeHtml(sub) + '</small>' : '');
      if (titleEl.innerHTML !== html) titleEl.innerHTML = html;
    }

    // Wide tables on settings/stats pages: let them scroll sideways.
    document.querySelectorAll('#main table:not(.cbm-seen)').forEach((t) => {
      t.classList.add('cbm-seen');
      if (t.closest('#roomTabs')) return;
      if (t.scrollWidth > document.documentElement.clientWidth) t.classList.add('cbm-scroll-x');
    });

    clampPopups();
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function start() {
    injectStyle();
    setViewport();
    buildChrome();
    restoreBtn.style.display = enabled ? 'none' : 'block';
    applyPrefs();
    onViewport();
    tick();
    setInterval(tick, 700);
    // Tabs switched by tapping the site's own tab row should update our bar too.
    document.addEventListener('click', () => setTimeout(() => { markNav(); clampPopups(); }, 60), true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
