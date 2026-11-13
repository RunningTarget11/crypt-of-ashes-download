CRYPT OF ASHES - Diablo-style action RPG prototype (look & play-style demo)
==========================================================================

HOW TO RUN
- Just double-click index.html (opens in Chrome / Edge / Firefox). No server or install needed -
  all assets (textures, models, fonts) are embedded in assets.js, so it works from file://.
- First load takes a few seconds (about 9 MB of embedded assets).
- Best on a desktop/laptop browser with hardware acceleration enabled.
- Optional URL flags: index.html?fps (show fps), ?low (force low quality), ?seed=12 (different dungeon).

CONTROLS
- Left-click ground ............ move (hold to keep walking toward the cursor)
- Left-click enemy ............. attack (hold to chain the 3-hit combo)
- Space (hold) ................. attack / combo, soft-locks the enemy in front of the hero
- Shift + left-click ........... attack in place
- Right-click .................. Hellfire Orb (fireball) at cursor
- 1 ............................ Bone Cleave (spinning AoE)
- 2 ............................ Hellfire Orb
- 3 ............................ Shadow Charge (dash through enemies)
- Q ............................ Healing potion
- I (or C) ..................... Inventory / character panel (click an item to equip it)
- M ............................ toggle minimap
- Mouse wheel .................. zoom
- Click an item's name on the ground to pick it up; gold is picked up by walking over it;
  click a treasure chest to open it.

Find and kill Varkoth, the Bone Warden, in the far room, then "Descend Deeper" for a new, harder floor.

SOURCE
- source/ has the readable code (src/*.js). Rebuild with:
    npm install three@0.170.0 esbuild
    npx esbuild src/main.js --bundle --format=iife --minify --outfile=../game.js
- Tests (Playwright + Chrome): source/tests/mtest.mjs (mobile touch), dtest.mjs (desktop),
  swing.mjs (combo frame sequence). Screenshots are in screenshots/.

------------------------------------------------------------
PLAYING ON A PHONE (touch controls)
------------------------------------------------------------
Phones/tablets are detected automatically (coarse pointer / touch screen).
Force a mode with ?mobile or ?desktop in the URL.

  Left thumb ............ floating analog joystick: touch anywhere on the left side,
                          it appears under your thumb and follows it; small deadzone;
                          the hero turns to face the direction you push
  Big sword button ...... attack; hold it to chain the 3-hit combo. Soft-locks the best
                          enemy in a frontal cone (or in the stick direction) and turns
                          the hero toward it; push the stick to cancel the recovery
  Arc of 3 buttons ...... Bone Cleave / Hellfire Orb / Shadow Charge (auto-aimed; Charge
                          follows the stick). Glowing cooldown sweep + seconds countdown
  Potion button ......... drink a potion (count shown)
  Bag / Map (top-left) .. inventory (tap an item for details + Equip) / minimap
  Tap enemy / chest ..... still works on the right side of the screen
Joystick and buttons are fully multitouch (move and attack at the same time);
the page never scrolls or zooms.
Works in portrait and landscape. Android goes full-screen on "Enter";
on iPhone use Share > Add to Home Screen for a full-screen app.

Mobile defaults to a lighter renderer (pixel ratio 1.25, no MSAA, no torch
shadows, 512px hero shadow) and steps down automatically (to 1.0, then 0.8 and
no shadows) if the frame rate stays under ~28 fps. Add ?low to start at the
lowest setting, or ?noadapt to disable auto quality.

------------------------------------------------------------
HOSTING ON GITHUB PAGES
------------------------------------------------------------
All paths are relative, so the game works from any subpath
(e.g. https://<user>.github.io/<repo>/).
  1. Create a repo and upload the CONTENTS of this folder (index.html,
     game.js, assets.js, manifest.webmanifest, .nojekyll, ...) to its root
     (or to a /docs folder).
  2. Settings > Pages > Deploy from branch > main / (root) (or /docs).
  3. Open https://<user>.github.io/<repo>/ on your phone.
The page is ~9 MB (textures/models are embedded in assets.js), so the first
load on mobile data takes a few seconds; afterwards it is browser-cached.
The screenshots/ and source/ folders are optional for hosting.
