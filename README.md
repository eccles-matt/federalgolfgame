# Federal Minigolf

A bright, cartoon minigolf phone game based on Federal Golf Club, Canberra. Installable PWA, no build step.

**Play:** https://eccles-matt.github.io/federalgolfgame/

Right now it has Hole 1 (The Opener, par 4) for testing the putting feel.

- Drag back from the ball and let go to putt. Further back = harder.
- Walls bounce, sand slows the ball a lot, water costs a stroke and you replay from where you hit it.
- The kangaroo hops across the fairway and bounces your ball away when it's on the ground.
- The pause button has sliders for putt power, grass drag, sand grip and wall bounce, saved on the phone.

To install on iPhone: open the link in Safari, Share, Add to Home Screen.

## Files
- `index.html` HUD, menus and PWA setup
- `game.js` physics, input, drawing
- `hole1.svg`, `roo.svg`, `flag.svg` art exported from the design mockups
- `sw.js`, `manifest.webmanifest`, `icons/` for install and offline play
