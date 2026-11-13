CRYPT OF ASHES - Diablo-style action RPG prototype (look & play-style demo)
==========================================================================

HOW TO RUN
- Just double-click index.html (opens in Chrome / Edge / Firefox). No server or install needed -
  all assets (textures, models, fonts) are embedded in assets.js, so it works from file://.
- First load takes a few seconds (about 11 MB of embedded assets).
- Best on a desktop/laptop browser with hardware acceleration enabled.
- Optional URL flags: index.html?fps (show fps), ?low (force low quality), ?seed=12 (different cave layout).

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
- Click an item (or its name label) on the ground: the hero walks over and picks it up into the bag.
  Gold and healing potions are picked up automatically by walking over them. A full bag (40 slots)
  shows "Inventory full" and leaves the item on the ground.
- Inventory: hover an item for its tooltip (rarity-coloured name, damage/armor, affixes, legendary/unique
  power, flavour text, comparison with what you wear); click to equip; right-click to salvage for gold.
- Click a treasure chest to open it.

THE LEVEL
"The Smoldering Depths" is a procedurally generated CAVE (no square rooms): blob-shaped chambers joined by
winding tunnels, noise-displaced rock walls, uneven floor, stalagmites/stalactites, rubble, glowing
crystals, lava cracks, light shafts with dust, dripping water into puddles, torches and braziers.
Find and kill the Lord of the Smoldering Deep in the far chamber, then "Descend Deeper" for a new, harder cave.

ITEM RARITIES: Common (grey) < Magic (blue) < Rare (yellow) < Legendary (orange) < Unique (gold-tan).
Rare+ items drop with a coloured light beam.

SOURCE
- source/ has the readable code (src/*.js). Rebuild with:
    npm install three@0.170.0 esbuild
    npx esbuild src/main.js --bundle --format=iife --minify --outfile=../game.js
- Tests (Playwright + Chrome): source/tests/mtest.mjs (mobile touch, landscape + portrait),
  dtest.mjs (desktop), loottest.mjs (drop -> pickup -> inventory, desktop + phone), cavetest.mjs
  (cave shape/connectivity over 6 seeds), swing.mjs (combo frame sequence), shots.mjs (screenshots).
  Screenshots are in screenshots/ (the d4_*.jpg files are the current build).

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
  Bottom bar ............ everything sits in one Diablo-style bar along the bottom:
                          joystick (left) - life orb - potion / Bag / Map - resource orb -
                          attack + skills (right)
  Potion button ......... drink a potion (count shown)
  Bag / Map ............. inventory (tap an item for its card: Equip / Salvage / Close) / minimap
  Tap enemy / chest / item ... works anywhere above the bar; tapped items are walked to and picked up
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
The page is ~11 MB (textures/models are embedded in assets.js), so the first
load on mobile data takes a few seconds; afterwards it is browser-cached.
The screenshots/ and source/ folders are optional for hosting.
