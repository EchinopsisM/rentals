# CB Desktop — Mobile Layout

A userscript that gives you the **full Chaturbate desktop site on your phone**, re-laid out for a touch screen. You stay logged in with your normal session; nothing leaves your browser.

## What it does

- **Forces the desktop site.** It sets the `mobile_redirect=never` cookie, which makes Chaturbate serve the desktop site to a phone. You don't need "Request desktop site", so the page keeps your phone's real screen width.
- **Room / broadcast pages** become a phone app layout:
  - The video sits on top, and the desktop chat panel fills the rest of the screen. The site's own CHAT / PM / USERS / ⚙ tabs are all still there (plus any extra broadcaster tabs and the "…" overflow menu), with bigger tap targets.
  - A thumb bar at the bottom has **Chat · PMs · Users · Room**. PMs shows an unread badge.
  - **Room** switches to a normal scrolling page with the video controls, the token/tip panel, and every room tab (Bio, Pics & Videos, broadcaster settings tabs, and so on).
  - The layout follows the keyboard. When you type, the bottom bar hides and the video shrinks so the input sits right on the keys. Inputs use 16px text so iOS doesn't zoom in.
  - The chat, PM and user list scroll inside their own panes, and user names are big enough to tap for the desktop user menu (PM, ignore, silence, etc.).
- **Every other page** (home, followed, account, settings, stats): the header becomes a drawer behind ☰, room grids use two columns, the filter sidebar slides over the page, and wide tables scroll sideways.
- **⚙ (top right)** sets the video size (hidden/small/medium/large), chat text size, and a **Plain desktop** switch that shows the untouched site. A floating "Mobile layout" button brings the layout back.

Everything works by rearranging the site's own interface, so all the desktop features behave exactly as they do on a computer.

## Install

### iPhone / iPad (Safari)
1. Install **Userscripts** (free, by Justin Wasack / quoid) from the App Store.
2. Settings → Apps → Safari → Extensions → Userscripts: turn it on and set **chaturbate.com** to *Allow*.
3. Open the raw `cb-mobile-desktop.user.js` file in Safari, tap the **aA / puzzle** icon → Userscripts → **Install**.
   (Or save the file into the Userscripts folder in the Files app.)
4. Go to chaturbate.com. The page reloads once into the desktop site, then switches to the mobile layout.

### Android
1. Install **Firefox** and add the **Violentmonkey** or **Tampermonkey** add-on (Menu → Add-ons).
2. Open the raw `cb-mobile-desktop.user.js` file. The add-on will offer to install it.
3. Go to chaturbate.com.

(Other Android browsers that run userscripts, like Edge Canary, Kiwi forks or Quetta, also work.)

**Leave "Request desktop site" off.** The script handles the desktop switch, and desktop mode in Chrome-based browsers ignores the page's width setting.

## Tips
- Log in the normal way after installing. Your session cookie is shared, so if you're already logged in, you stay logged in.
- To go back to the official mobile site, turn the script off and visit `https://chaturbate.com/?mobile_site=1`.
- Settings are saved per device in the browser.

## Limits
- Chaturbate changes its markup from time to time. The script mostly relies on stable IDs and `data-testid` hooks, but if a panel looks wrong after a site update, use **⚙ → Plain desktop** as a fallback. It's still fully usable with pinch-zoom.
- Broadcasting video *from* the phone still goes through Chaturbate's own broadcast flow. This script is for running the room, chat, PMs and account from the phone.
