# Getting VOIDBLOOM on sale

What's done, and what only you can do. Facts about fees were checked in November 2026; check them again before you pay anything.

## Done
- Remastered game, version 2.0.0: new typeface and menus, neon glow, settings, how to play, credits
- Windows build that is tested automatically before every release
- Store builds made on every release:
  - `VOIDBLOOM-x.y.z-windows-store.zip` for itch.io or Steam (no self-updater; the store updates it)
  - `VOIDBLOOM-x.y.z-web.zip` to upload to itch.io as a browser game
- Cover art in every size itch.io and Steam ask for (`store/capsules/`)
- Seven 1920×1080 screenshots (`store/screenshots/`)
- Store page text and AI disclosure wording (`store/STORE_PAGE.md`)

## Decide first
1. **What stays free.** Today the whole game is free at ryangils.github.io/voidbloom, the installers are free on the GitHub Releases page, and the code is public. Pick one before you charge:
   - Free in the browser, paid download. Common on itch.io. People pay for the desktop version and to support you.
   - Browser version becomes a demo (for example one arena, first boss) that points to the full game.
   - Take the free version down.
2. **Name on the game.** The credits screen and store page need your name or a studio name. Set `GAME_STUDIO` in `web/js/version.js`.
3. **Price.**

## itch.io (free to list, can be live the same day)
1. Create an account at itch.io and open Dashboard → Create new project.
2. Kind of project: "Downloadable" if you only sell the Windows build, or "HTML" to also let people play in the browser.
3. Upload `VOIDBLOOM-x.y.z-windows-store.zip` and tick Windows. For browser play, upload `VOIDBLOOM-x.y.z-web.zip`, tick "This file will be played in the browser", and set the size to 1280×720 with the fullscreen button on.
4. Set the price. itch.io keeps 10% by default and you can change that share.
5. Add the cover image, at least three screenshots, the description and tags.
6. Fill in the AI disclosure setting.
7. Set up payouts (PayPal or Stripe) under Settings → Publisher.

## Steam (US$100 per game, usually a few weeks)
1. Sign up at partner.steamgames.com. You need tax and bank details, and Valve verifies your identity.
2. Pay the US$100 Steam Direct fee. It is not refundable, and Valve returns it after the game has US$1,000 in adjusted gross revenue.
3. Build the store page: capsules, screenshots, description, content survey including the AI disclosure. Steam wants at least five screenshots and a trailer is strongly recommended.
4. Upload the contents of `VOIDBLOOM-x.y.z-windows-store.zip` as the game's depot. The launch file is `VOIDBLOOM.exe`.
5. Valve reviews the page and the build. Allow about 30 days from sign-up to launch, including the mandatory "coming soon" period.
6. Steam keeps 30% of sales after taxes and refunds.

## Still worth doing before a Steam launch
- A 30 to 60 second gameplay trailer
- Steam achievements and cloud saves (the game's 17 achievements exist in-game only today)
- A free demo on Steam
- Testing on a few different PCs and controllers
- Mac and Linux builds, if you want them

## Money and paperwork
Game sales are business income. Whether to sell as yourself or through a company, and how sales tax applies, is worth a short conversation with your accountant. Nothing in this folder is legal or tax advice.
