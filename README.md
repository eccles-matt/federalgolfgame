# Federal Minigolf

A bright, cartoon minigolf phone game based on Federal Golf Club, Canberra. Installable PWA, no build step.

**Play:** https://eccles-matt.github.io/federalgolfgame/

All 18 holes (par 54), laid out from the real Federal course. Play the full 18, the front 9, the back 9, or pick any single hole. Scores and bests are saved on the phone.

- Drag back from the ball and let go to putt. Further back = harder.
- Walls bounce, sand slows the ball a lot, water costs a stroke and you replay from where you hit it.
- Kangaroos: hoppers cross the fairway, kickers boot your ball back while they're watching (wait for them to graze), sleepy ones lie in the way.
- Ramps up to raised greens, jump ramps over the pond (8) and gully (12), hills that roll your ball back (11, 18), stray balls from the driving range (15), and a funnel green on 16.
- The pause button has sliders for putt power, grass drag, sand grip and wall bounce, saved on the phone.

To install on iPhone: open the link in Safari, Share, Add to Home Screen.

## Files
- `index.html` HUD, menus and PWA setup
- `game.js` physics, input, drawing
- `holes.js` hole geometry (walls, sand, water, slopes, ramps, roos), generated from the design generator
- `holes/h1.svg` … `h18.svg`, `roo.svg` art exported from the design mockups
- `sw.js`, `manifest.webmanifest`, `icons/` for install and offline play
