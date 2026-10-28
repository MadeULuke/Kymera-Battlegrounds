# Kymera Battlegrounds: HANDOFF (read this entire file first)

## 0. For the next assistant
- You are continuing a long build with one owner (MadeULuke). They run the game on Windows 11 and play it with close friends. This file is the source of truth. Chat memory is only a helper.
- Build in stages. Test each stage. Keep each update small enough to check.
- Ask questions before any big change. Put your suggested answer in brackets. The owner often replies "defaults," which means "accept all the brackets." Start coding only after the owner answers, or when they say "get to coding."
- The owner says "get to coding" when they're ready. Don't ask the same question twice.
- Explain steps in plain language, as if to a non-programmer. For anything on their PC, use Windows 11 PowerShell and `npm.cmd` (plain `npm` is blocked by PowerShell by default).
- Never abbreviate K Serum in game text. Always write "K Serum." (Code comments may say KS.)
- Be honest about what has and hasn't been tested. The game page has NOT been run in a real browser by the assistant. Only the server has been tested. Say so every time.
- The owner likes: a clear list of changes after each update, a "what to check" list, and short answers. They like being told when something was a guess.

## 1. Starting in a new chat
- Do NOT ask the owner to run npm install before uploading. The zip is source only. It has no node_modules and no data folder.
- In your workspace: extract the zip to /home/claude/kymera-server, then run `npm install express socket.io socket.io-client` in that folder. Tests need socket.io-client.
- NEVER ask the owner to upload accounts.json or owner.txt. They contain personal account data and password hashes. Only the zip is needed.
- Read this file, then the current server.js and the game page (public/index.html), before changing anything.

## 2. Files
- server.js: everything on the server. Accounts, rooms, lobbies, matches, rounds, abilities, K Serum, leaderboards, titles, history, gifts, favorite Kymera, owner admin, settings saving, leaving rules.
- package.json: the server's packages (express, socket.io). Run `npm install` after extracting.
- public/index.html: the whole game page in one file (HTML, CSS, JavaScript). About 65 KB.
- public/kymera/xeno, cc, tm: model.glb plus textures for each Kymera. tm also has metal/ (the fully metallic texture set).
- public/ui/: bg1.jpg to bg5.jpg (home background, rotates every 6 seconds), logo.png (red K), wordmark.png (KYMERA, white on transparent), last_stand_concept.jpg (reference art, not used yet), icons/xeno.svg, cc.svg, tm.svg (waiting-room icons drawn as placeholders).
- data/accounts.json: created by the server. Holds all accounts, K Serum, wins, losses, match history, gifts, favorites, settings, key binds, and login sessions. Passwords are stored only as scrypt hashes.
- data/owner.txt: owner setup. One line: the owner's account name. Only that account sees the Owner admin page. Not in the zip. The owner creates it by hand.

## 3. Running it (owner's PC, Windows 11)
- First time after extracting: open PowerShell in the kymera-server folder, run `npm.cmd install`.
- Start: `npm.cmd start`, then open http://localhost:3000.
- Friends (temporary public link, the PC must stay on): `cloudflared tunnel --url http://localhost:3000`. Send the trycloudflare.com address. Keep both windows open.
- If port 3000 is busy: close old windows, or find the process with `netstat -ano | findstr :3000` and run `taskkill /PID <number> /F`.
- If PowerShell says scripts are disabled, use npm.cmd.
- Keep the data folder when replacing the kymera-server folder. Deleting it deletes all accounts.
- Permanent hosting for friends is not set up yet (Render needs GitHub; Railway or Fly.io cost money). Ask the owner before choosing.

## 4. What is built and working (server tested; game page not browser-tested unless noted)
- Platform choice on first visit (Mobile or PC), saved in the browser. Changeable from the home screen (bottom right button).
- Home: Play, Choose Character, Settings. Instructions (bottom left). Title "Kymera Battlegrounds." Browser tab title "Kymera Battlegrounds." Home background: 5 rotating darkened images.
- Play: Battle (create or join a room) and Waves (coming soon page with Back to Play).
- Choose Character: Kymera are ordered by price, cheapest first (Xeno and Tank Maestro at 600 K Serum, then CatClaw at 1000). The screen opens on the Kymera you have selected. Each Kymera stands on its own stand, with a glow ring in its colour (CS_COLORS). < and > slide the camera to the next stand; quick clicks retarget the camera smoothly. Price in the middle, Buy or Select, Stats panel (Stats ^ / Stats v), name in each Kymera's color. "Unlock all (testing)" button (remove later).
- Battle: Create Room (1v1 or 2v2, choose map, Private or Public), Join Room (5-letter code), Join Random (Random 1v1 or Random 2v2, public rooms only).
- Waiting room: code, map, mode, Blue side and Red side with icon and username (Guest if not logged in), Switch side, host Start, Details button (Details ^ / Details v shows mode, map, players per side, and whether the room is ready).
- Matches: best of 3 rounds. 1v1 or 2v2. Fights to the death.
- Leaving: see section 7.
- Find a player (Account > Find a player, guests too): search by part of a name, not case-sensitive, up to 10 results. Opens a public profile: K Serum, wins, losses, win rate, titles, favourite Kymera, Kymera owned, and the last 10 matches. Never shows passwords, sessions, key binds, settings or gifts.
- Accounts: register and log in. Settings: Account, Key Binds, Audio & Mouse. Leaderboards, match history, K Serum gifts, favorite Kymera, win rate, titles, owner admin.
- HUD (PC): ultimate bar, ability bar with name and key, four move squares, health bars, meters, a "left" notice, lives text.
- Maps: QVX (circle arena, blue) and Last Stand for Imira (rectangle arena, red, walls, placeholder nuclear factory behind the back wall).
- Spawn protection: CatClaw gets a yellow outline for 3 seconds after respawning.
- Names: every fighter except yourself shows its username above it, in the side colour (blue side = blue, red side = red). Guests show Guest.
- Instructions page explaining controls and matches.

## 5. Menus (current)
- Home: Play, Choose Character, Settings.
- Play: Battle, Waves (coming soon page, Back to Play).
- Settings: Account, Key Binds, Audio & Mouse.
- Audio & Mouse: Effect volume (slider and number box, 0 to 100, default 70, does nothing yet). Background music (slider and number box, 0 to 100, default 70, does nothing yet). Music track dropdown (None only, add tracks later). Mouse sensitivity (slider and number box, 1 to 100, default 50 = the original speed). Only mouse sensitivity works.
- Settings are saved in the browser and, when logged in, to the account. They are loaded when the account logs in.
- Account: log in or register (username 3 to 16 letters, numbers, underscores; unique, not case-sensitive; password 6+ characters, case-sensitive). When logged in: K Serum, wins, losses, win rate, titles, owned count, favorite Kymera (dropdown), send K Serum (username and amount), Leaderboards, Match history, Owner admin (owner only), Log out.
- Leaderboards: top 10 by wins and top 10 by K Serum (only scores above 0).
- Match history: last 50 matches (result, score, opponent names, mode, Kymera, map). Last 30 gifts.
- Owner admin: list of accounts with Delete (asks for confirmation). Owner cannot delete own account. Deleting signs out anyone logged in to that account.
- Key Binds: list of 11 actions. Click one, then press a key or mouse button. Esc cancels. Two actions on one key turn both boxes red and block Save. Keys are saved per platform (PC or Mobile) per account, and per browser when logged out.
- Instructions: controls and match rules. Back to home.

## 6. Controls and key binds
- Defaults: move W A S D; ability E; ultimate G; basic attack (M1) Space (J and K are no longer attack keys); Move 1 Z; Move 2 X; Move 3 C; Move 4 V.
- Fixed (not rebindable): arrow keys turn the camera (Left/Right = turn, Up/Down = tilt). Shift toggles shift lock (captures the mouse; the camera stays behind your Kymera and your Kymera turns with it). Esc releases the mouse. Reserved keys: Escape, Shift, arrows.
- Mouse buttons can be bound (Left, Middle, Right, Mouse 4, Mouse 5).
- Mouse look: left and right are inverted (drag left, look right). Up and down are NOT inverted (drag down, look down). Sensitivity is set in Audio & Mouse.
- Mobile key binds: shown as "Mobile key binds: coming soon." Mobile uses on-screen buttons instead (not built yet, see section 10).

## 7. Battle rules
- Room sizes: 1v1 = 2 players (1 per side). 2v2 = 4 players (2 per side).
- Sides: Blue (team 0) starts on the left, Red (team 1) on the right. In 2v2, players can switch sides in the waiting room if the other side has room. Each side holds at most 2.
- Host: the first player in the room. Only the host can start, and only when the room is full and balanced (2 per side in 2v2; 1 per side in 1v1).
- Waiting-room leaving: the player is removed. The lobby stays open. If the host leaves, the next player becomes host automatically. A room with nobody left is closed.
- In-match leaving: the player is out of the round and everyone sees "<name> left." The match carries on.
  - If their side still has someone in the round, the round goes on (2v2 becomes 2v1).
  - If they were the last one in the round on their side, the other side wins the round.
  - If a whole side has left, the other side wins the match automatically, and each remaining winner gets the 20 K Serum match bonus.
  - Leavers keep the K Serum from rounds they already won. They get nothing more. Their match is recorded as a loss with result "left."
  - One player left per side turns it into a 1v1 (or the 2v1 above).
- Rounds: a player with no lives left is out for the round. A side loses the round when every player on it is out. Each winning player gets 5 K Serum per round.
- Match: winning side's players each get the 20 K Serum bonus. Recorded in history for both sides, with mode.
- Join Random joins the first waiting PUBLIC room of the chosen mode with space. If none, it creates one (map QVX, public).
- Create Room is Private by default: it can only be joined by code. Choosing Public lets Join Random find it. Joining by code works in any waiting room that has space.
- 2v2 lie-down: a fighter who is out lies on the floor and cannot move or attack. 1v1 has no lie-down (the next round starts at once).
- CatClaw lies down only after his third death (out for the round). After his first or second death he teleports back with 3 seconds of protection and cannot attack.

## 8. Rules and numbers (placeholders marked *)
- K Serum: round win 5; match win bonus 20. Name is always "K Serum."
- Prices*: Xeno 600 (everyone owns Xeno to start), CatClaw 1000, Tank Maestro 600.
- Xeno*: 100 HP. Punch 11, move speed 4.2. Dark aura (E): lasts 5 seconds, punches deal 1.5x, and his punches drain the bar during the aura. Press E again during the aura to heal 35 HP and end it early. Cooldown 15 seconds from when the aura starts (20 if he healed). Bar refills during the cooldown. While Xeno's aura is on, a CatClaw dash into him deals 30% of his max HP and knocks him back (see the dash effects below).
- CatClaw*: 50 HP per life, 3 lives per round (150 per round). Punch 10, move speed 7.5. A death costs a life. He respawns alone with no pause, and is protected for 3 seconds (cannot be damaged, cannot punch or use E; yellow outline). The third death ends his life for the round.
- CatClaw burst dash (E)*: press E to start a timing bar (a marker sweeps back and forth, one sweep per 1.2 seconds). Press E again when the marker is in the gold zone (16% of the bar, centered). Success: he dashes at speed 34 for 0.9 seconds, so he can cross most of the map, and stops at walls, other players' hit (enemies only), or the end of the dash. Miss, or no press in 2.5 seconds: tired out for 5 seconds (move speed 1.2, punch cooldown 1 second). Cooldown 15 seconds, and it keeps counting while tired. He cannot start a dash while tired. Bar: empty right after the dash, refills during the cooldown.
- Dash effects on an enemy: normal player = instant kill. Tank Maestro in metal form = 10% of his max HP, he stands still. Xeno with aura = 30% of his max HP and he is knocked back 2.5 units. Shielded (protected) players take no damage.
- Tank Maestro*: 150 HP. Punch 8, move speed 3.2. Metal form (E): special meter fills over 20 seconds (only while metal form is off) and gains 10 per punch that lands. Turning it on needs a meter above 0. It drains over 5 seconds while on, then turns off by itself. Pressing E again turns it off and keeps the meter where it is. In metal form: takes 50% damage, deals 120% damage.
- Ultimate (G)*: bar fills ONLY with punches: each punch that lands adds 5% (20 landed punches to full). Reset every round. When full it says "Press G"; pressing G shows "Coming soon" for 1.5 seconds. No effect yet.
- Move squares (1 to 4)*: fill over time, 30 seconds to full, during a fight. Reset every round. No effect yet (Moves 1 to 4 are not designed yet).
- Each basic attack (M1): punches land on the nearest living enemy in range (2.6). Teammates are never hit. 80% of swings land (one in five is dodged). Cooldown 0.45 seconds (1 second while tired).
- Round carryover: half of the meter (rounded) carries to the next round. Ability bars reset each round.
- Titles*: the top 3 on each leaderboard get "Rank N for Wins" or "Rank N for K Serum" (TITLE_RANKS = 3 in server.js). Titles update automatically. Only players with a score above 0 count. Wording still to confirm with the owner.
- Win rate: wins / (wins + losses), shown on Account.

## 9. Maps
- QVX: circle arena (radius 8.7 for fighters). Blue floor and ring. Default map.
- Last Stand for Imira: rectangle arena (fighters stay within x = ±12.7, z = ±7.7). Red floor, grey walls, and a placeholder nuclear factory behind the back wall (a block, two yellow-capped cooling towers, three chimneys). Real art is not built yet. The owner's concept image is in public/ui/last_stand_concept.jpg.
- Map choice is in Create Room. Joining players see the map in the waiting room.
- Boundaries are enforced on the server AND the game page, so no one can move or dash past walls.

## 10. HUD
### PC HUD (built)
- Bottom of the screen, stacked: ultimate bar (top, big, gold), ability bar (its name and key, e.g. "Burst dash (E)"), then four move squares labeled "Move 1 (Z)" etc. with their bound keys.
- Top: your health bar (top left), the opponent's health bar (top right). In 2v2: your teammate's bar is under yours on the left, and the second enemy's bar is under the first enemy's on the right. Meters for Tank Maestro. "Your lives" text in the top middle for CatClaw.
- Notice: "<name> left." at the top middle, 4 seconds.
- Timing bar (CatClaw): appears above the HUD when the dash timing is running. Marker sweeps, press E in the gold zone.
- The old control hint at the bottom left was removed. Instructions are on the home screen.

### Mobile HUD (NOT BUILT, the owner's full spec, in their own words)
Owner's words: "Mobile: adds buttons on screen for mobile. 4 squares are pressable and are a tad bit bigger. There will be kinda see through arrows for movement on the left side of the screen. Drag the camera to look around. Ult bar is pressable when full. Ability has its own button and is a circle with a star icon, kinda see through and yes the ability bar should still be there. M1 button is a kinda see through circle with a fist in it, Pressable."
Also from earlier: "For mobile: custom buttons, buttons can be moved, size can be changed." And: "4 move squares size can also be changed."
Interpreted as:
- Move squares 1 to 4: same as PC (same bars, same 30-second fill, same labels), but bigger than the PC squares (a little bigger, roughly 1.3x). Pressable (tap). Tapping does nothing yet.
- Movement arrows: semi-transparent arrows on the LEFT side of the screen (up, down, left, right) for moving. Movement is relative to the camera, as on PC.
- Camera: drag the screen to look around. The drag area should be the part of the screen not covered by buttons (likely the right side). Mouse sensitivity setting also applies to drag speed (to confirm).
- Ultimate bar: pressable when full (tap = "Coming soon" for now, same as pressing G).
- Ability button: its own button. A semi-transparent circle with a star icon. The ability bar still shows above (same as PC).
- M1 button: semi-transparent circle with a fist icon. Pressable (basic attack).
- Layout: all these buttons can be moved and resized by the owner (layout editor). Buttons are custom: positions and sizes saved per device (and per account, if logged in, to decide later).
- Mobile key binds are not used on mobile (mobile uses buttons). The Key Binds page for Mobile says "coming soon."
- Platform choice (Mobile) switches the HUD. The platform is stored in the browser.
- Needs multi-touch: moving, dragging the camera, and attacking can happen at once. Stop the page from scrolling or zooming on touch.
- The safe-area (notches) must not cover buttons.
- Icons needed: a fist (M1) and a star (ability) in semi-transparent style. Draw as SVG placeholders unless the owner gives art.
- Open choices to ask the owner before building (see section 15).

## 11. Accounts, data, owner, social features
- Storage: data/accounts.json (automatic). Survives updates if the data folder is kept.
- Passwords: scrypt hashes. Usernames: case-insensitive unique. Passwords: case-sensitive.
- Sessions: stored in accounts.json. Log out removes the session. Logged-in sessions resume automatically after a page refresh (token in browser).
- Account data: K Serum, owned Kymera, wins, losses, match history (last 50), gifts (last 30), favorite Kymera, key binds (PC and Mobile separately), settings.
- Gifts: send to another username. Refused for yourself, unknown names, amounts under 1, and amounts over your balance. Guests can't send gifts.
- Owner admin: the account named in data/owner.txt. Sees the Owner admin button. Can list and delete accounts. Can't delete own account. Nothing else is restricted.
- Unlock all (testing): on Choose Character. Gives every Kymera to the logged-in or guest player. Remove later.

## 12. Settings and sound (plans)
- Settings page: Audio & Mouse (see section 5). Volume sliders exist but do nothing yet.
- Sound plan (agreed in principle, not started): placeholder sounds first, then real files. Priority: punch hits and swings, dash, aura start, metal form on/off, timing bar success and failure, round won/lost, match result, UI clicks, the "left" notice, and a waiting-room countdown. Music track list starts with None.
- Visual effect plan (agreed in principle): punch impact sparks, a dash trail behind CatClaw, aura and metal glow, respawn burst (on top of the yellow outline), ultimate-ready pulse.

## 13. Placeholders and things to confirm
- Numbers: all Kymera stats, prices, ability times, ultimate per punch (5%), move fill time (30 s), titles (top 3, wording "Rank N for Wins").
- Moves 1 to 4 have no effect. The ultimate does nothing when full (shows Coming soon).
- Waves is a coming soon page.
- Art: icons are simple SVG drawings. Last Stand is primitives, not the concept art. Kymera models are the real ones.
- Waiting room: no 3D snapshot; icons only.
- Sound: none yet. Sliders do nothing (except mouse sensitivity).
- Mobile: not built.
- Friends hosting: temporary tunnel only.

## 14. Roadmap (suggested order; ask the owner first)
1. Owner tests the menus, Battle (1v1 and 2v2), leaving, the facing (nearest enemy), the spawn outline, the Details panel, Settings, and the Instructions page in a real browser. Fix what breaks.
2. Mobile HUD (basic version): on-screen arrows, camera drag, four move squares (bigger), ultimate tap, ability button (star), M1 button (fist), touch handling. Default layout, no editor yet. Ask the open questions in section 15 first.
3. Mobile layout editor: move and resize buttons, save per device.
4. Sound: placeholder sounds, wire the Effect volume slider, then music (background music slider and track list).
5. Visual effects (section 12).
6. Real Moves 1 to 4 and ultimate designs for each Kymera (needs owner design).
7. Art: real icons (waiting room, mobile fist and star), Last Stand map layout from the concept.
8. Waves mode (needs design first).
9. Hosting for friends without the tunnel (needs owner decision and possibly money).
Always check with the owner before starting a step.

## 15. Mobile HUD questions (all answered, see section 17)
- Camera drag area: right half of the screen, or anywhere not covered by buttons? [Anywhere not covered by buttons.]
- Button sizes and default positions. [Ask for a rough layout or use defaults: arrows bottom-left, M1 and ability bottom-right, move squares along the bottom centre, ultimate bar at the top.]
- Transparency of the semi-transparent buttons. [50%.]
- Arrows: four separate arrows, or a joystick-style pad? (Owner said arrows.) [Four arrows in a diamond shape.]
- Does mouse sensitivity also control drag speed on mobile? [Yes.]
- Should the layout editor be in Settings, and is it saved per device or per account? [Per device, in Settings.]
- Shift lock on mobile: none, since there is no mouse. [None.]
- Do tablets with a mouse use the PC HUD? [Use whichever platform was chosen.]
- Fist and star icons: draw placeholders now, or wait for art? [Draw placeholders.]

## 16. Testing approach and pitfalls (learned the hard way)
- Server tests: write a Node script that uses socket.io-client to act as several players. Run the server on a free port with a fresh data folder, and create data/owner.txt if owner features are tested.
- Background processes do not survive between tool calls. Start the server and run the test in the SAME command.
- A single tool command times out after 300 seconds. Run one test file per command. Use `timeout 120` on tests.
- Tests that wait for matches take 20 to 60 seconds each. Plan for that.
- Use fresh data folders for each run to avoid "username taken" failures.
- Player-facing text changes break old test expectations. Update the test, not the game, if the new behavior is what was asked for.
- Python patching the game page: assert the exact text count before every replacement. Write the file only after all replacements succeed. A failed assert leaves the file untouched (check that the file was not partly changed).
- Careful with re.subn: its 4th positional argument is count, not a function. Use keyword arguments carefully.
- Client check (no browser here): `node --check` on the extracted script, plus a check that every $('id') used in the script exists in the HTML. Known harmless missing IDs: moneySel, roster, shopMsg (old unreachable roster code).
- Image conversion: keep the alpha channel. The logo bug came from dropping transparency with convert('RGB').
- Do not put node_modules or data in the zip.
- Round 3 fixes: tests/round3-smoke.js (page, no server).
- Mobile controls: tests/mobile-smoke.js (page, fake touches; no server needed).
- Button Configuration: tests/layout-smoke.js (page, no server). Server: tests/layout-test.js against a copy with a fresh data folder (PORT=3110).
- Settings per platform: tests/settings-smoke.js (page, no server). Server: tests/settings-test.js in three steps against one server on PORT 3106: `setup`, restart, `keep`, then rewrite data/accounts.json so setter1's settings are the old flat format (fx 33, music 44, sens 66), restart, `legacy`. Run it from a copy with a fresh data folder.
- Find a player: tests/find-players-test.js (server; run against a copy with a fresh data folder, PORT=3104) and tests/find-smoke.js (page logic, fake socket and DOM).
- Choose screen smoke test: tests/choose-smoke.js (no server needed; runs the real page script with a fake 3D library and checks logic and colours, not how it looks).
- Room rule tests: tests/rooms-test.js. Start the server on a free port first (PORT=3102 node server.js), then run `node tests/rooms-test.js` with the same PORT.

## 17. Recent decisions (change log, newest last)
- Title "Kymera Battlegrounds" on home. Logo and wordmark are transparent PNGs.
- Leaving: waiting room keeps the lobby open (host passes automatically). Match carries on; sides and automatic-win rules as in section 7.
- Mouse: up/down not inverted; left/right inverted; sensitivity slider added.
- Instructions page (bottom left of home). Control hint removed from the game.
- Move squares fill over time (30 s). Ultimate fills per punch (5%).
- CatClaw: 50 HP per life; dash speed 34 for 0.9 s, runs across the map, stops at walls.
- 2v2 built (sides, teammate safety, CatClaw respawn, leaving, Details panel).
- Respawn: no pause for anyone; only the CatClaw who died respawns; 3 seconds protection with a yellow outline.
- Facing: each fighter turns toward its nearest living enemy.
- Menus: Play (Battle, Waves), Choose Character, Settings (Account, Key Binds, Audio & Mouse).
- Accounts keep settings and key binds. Owner admin, leaderboards, history, gifts, favorites, titles, and win rate built earlier.
- Stage 1 (round 2 fixes), server tested; game page NOT browser-tested: Create Room has Private (default) / Public; Join Random uses public rooms only; Instructions say "Space is the basic attack"; J and K removed as attack keys; old PC control hint removed; teammate and Opponent 2 bars hidden when leaving; name labels above other fighters in the side colour; 2v2 fallen fighters lie down (CatClaw only after his third death).
- Owner decisions, round 3 (not built yet unless marked): Mobile HUD: round joystick bottom-left (push up = forward, relative to camera). M1 = see-through circle with a fist (upper right, bigger). Ability = see-through circle with a star (lower right). Ability bar shows on both platforms; only the star triggers it. Move squares 1-4 and the Ultimate bar are pressable on mobile only; on PC they stay unpressable. Camera drag = drag any empty screen area (no button).
- Button Configuration (mobile only, replaces Key Binds on mobile): move buttons, resize each button, resize the joystick, opacity slider with a number box (10 to 100, default 50, one value for all buttons). Layouts save to the account, under the Mobile platform, like key binds.
- ALL Audio & Mouse settings (effect volume, music, track, sensitivity) are stored separately for PC and Mobile. On mobile the sensitivity label reads "Drag sensitivity".
- Character select redesign (not built yet): every Kymera stands on its own stand, the stand's glow ring is the Kymera's colour, and the arrows slide the camera from stand to stand. No sliding models.
- Account search (not built yet): search box on the Account page, partial name match, up to 10 results. Profile shows username, wins, losses, win rate, titles, favourite Kymera, owned count, K Serum, last 10 matches. Gift sending stays on your own Account page.
- Look: keep the dark red and bone colours; tidy spacing, alignment and text sizes; no new colours or fonts.

## 18. Next steps (as of stage 1)
Build order, one stage at a time, each tested before the next:
1. (done) Stage 1: rooms, instructions, help text, leftover bars, name labels, 2v2 lie-down.
2. (done) Character select redesign: stands, camera slide, glow colours. Checked with tests/choose-smoke.js only; the look needs a browser check.
3. (done) Account search and profile. Checked with tests/find-players-test.js (server) and tests/find-smoke.js (page logic); the look needs a browser check.
4. (done) Per-platform Audio & Mouse settings. Checked with tests/settings-smoke.js (page) and tests/settings-test.js (server, three steps).
5. (done) Mobile HUD. Checked with tests/mobile-smoke.js only; the look and feel on a phone need a real test.
6. (done) Button Configuration on mobile. Checked with tests/layout-smoke.js (page) and tests/layout-test.js (server, fresh copy); the look and feel on a phone need a real test.
Then the older roadmap in section 14 (sound, visual effects, real moves, art, Waves, hosting).
Stage 1 was checked with server tests only. Ask the owner to test the lie-down and name labels in a browser, since the assistant cannot run the game page.
- Stage 2 (Character select redesign): each Kymera on its own stand in one row; glow ring colour from CS_COLORS; < and > slide the camera (same easing as before) and quick clicks retarget it; no models slide; Join screen keeps its single pedestal. Checked with tests/choose-smoke.js; browser check still needed.
- Stage 2 fix: Kymera order is price-based (cheapest first). The stand row rebuilds when prices change the order.
- Stage 3 (Find a player): server handlers findPlayers and playerProfile (helpers publicProfileOf, cleanQuery; no secrets sent). Account page has a Find a player button. New screens sFind and sProfile. Checked by tests only; browser check still needed.
- Stage 4 (per-platform settings): audio and sensitivity saved separately for PC and Mobile, locally (kymera_settings_pc / kymera_settings_mobile) and on the account (u.settings.pc / u.settings.mobile). Old single-set settings count as PC. When logged in, the account copy for the current platform wins. Sensitivity label reads Drag sensitivity on Mobile. Mobile drag itself is built in Stage 5.
- Bug fixed in Stage 4: the start-up settings load ran before `settings` existed, and a try block hid the error, so saved settings were never restored on refresh. It now runs after the settings code.
- Stage 5 (mobile HUD), built with the defaults from section 15: round joystick bottom-left (push up = forward, relative to the camera; small pushes walk slower). M1 is a see-through circle with a fist, bottom right, upper. Ability is a see-through circle with a star, bottom right, lower; the ability bar still shows and only the star uses it. Move squares 1-4 (1.3x size) and the Ultimate bar are pressable on mobile only and run the same actions as the keys. Camera drag works on any empty screen space. Mouse-bound actions never fire from a phone's touches.
- Stage 5 is hard-coded: positions, sizes, and 50% opacity live in the #mobileHud CSS. Stage 6 (Button Configuration) moves them into a saved layout the player can change.
- Stage 5 hides nothing extra on mobile; the Shift lock and Leave buttons stay visible.
- Stage 6 (Button Configuration, Mobile only): Key Binds becomes Button Configuration on mobile (PC keeps Key Binds). The screen shows a preview box with the real mobile buttons. Drag to move. Tap one to choose it, then use the size slider or number box (60 to 160%, 100 is default). One opacity slider and number box (10 to 100, default 50) apply to the joystick, M1, ability and move squares. The Ultimate bar and ability bar keep full strength. Reset to default and Save buttons. Changes save as you make them (device, and account when logged in), and Save sends at once.
- Stage 6 choices I made that were not in the spec: the ability bar is also movable (it is a bar, but it has to move with the rest of the bottom stack). The move squares and Ultimate bar were moved into the mobile overlay on Mobile so they can be placed; they go back to the bottom bar on PC.
- Layout storage: per device in kymera_layout_mobile, and on the account as u.layouts.mobile (only Mobile). Positions are the top-left corner as a % of the screen; sizes are a % of the default size. Server cleans every value (unknown buttons dropped, numbers kept in range).
- Bug note: the mobile test fakes now keep every handler and give each run its own elements, matching a real browser.
- Round 3 (owner testing feedback), all built and checked by tests only, browser and phone checks still needed:
  - Room visibility buttons highlight like mode and map; Private is highlighted from the start. The waiting-room details show Visibility.
  - Name labels above heads are raised to 3.2 units (tune in makeNameLabel).
  - Xeno's stand glow and name colour: maroon (#800000).
  - Fallen 2v2 fighter: the body stays on the floor and no longer turns to face enemies. Its owner can move an invisible ghost (camera follows it; the ghost is not sent to the server or shown to anyone; kept within the central arena circle of radius 8.7). Position is not sent while fallen.
  - Match over: the result screen uses the pedestal (join) scene, so the winner stands on the stand and the camera orbits them.
  - Metal form: each fighter is updated from the server's per-player metal list (meter event metals[]), not only the first opponent.
  - Camera drag only follows the finger that started it; a cancelled touch ends the drag.
  - Shift lock on mobile no longer asks for pointer lock (it blocked the joystick).
  - Top bars: You (Your Lives: n/m) for CatClaw; teammate and opponents show their username (Nathan (Lives: 2/3)); guests show initials (Guest (CC)(Lives: 3/3), Guest (X)). Above heads still shows the plain name. Lives no longer shown in the middle line.
  - Button Configuration fills the screen (preview = real screen); panel at the bottom.
  - Move squares and bars: 40% width, normal scale, default x 30 (centred).
  - Choose Character: compact layout on short screens (max-height 600px).
  - Full screen button in Settings on Mobile (not on iPhone Safari, which does not support it).
  - Profile: Last matches opens and closes with an arrow.
- Punch fix: the local punch animation no longer plays for a fallen (2v2 out) or shielded (just respawned) fighter, because the server ignores those punches. Checked in tests/round3-smoke.js.
- Small update (CatClaw and labels): a missed timing in the burst dash does not tire CatClaw (he waits out the cooldown). A dash that hits someone tires him. A dash that ends without hitting anyone tires him. Ability and Ultimate labels no longer show key letters (G) or (E); the ultimate prompt reads 'Ultimate ready'. Key Binds labels for Ability and Ultimate also lost (E) and (G). Brand: name on top, logo centred below it. Checked by tests/dash-test.js (source check; not a live match run).
- Not built yet, waiting on decisions: equippable titles, Free For All mode, and Console (controller) support.
- Decisions for the next builds (owner-approved):
  - Titles: Velmarian (blue, free), Draxen (green, free), Xeno Glazer (maroon, 10 matches in a row as Xeno, win or lose). Titles show only on the profile, never in the lobby. One title equipped at a time, chosen from a Titles button in the Account area. Leaderboard titles follow the leaderboard rule: moving from 1st to 2nd removes the 1st place title.
  - Free For All: 3 to 10 players, host starts at 3 or more. 3 rounds, last player standing wins the round. Round win pays players x 5 K Serum on top of kill rewards (5 K Serum per kill). Map is 4x the current arena: plains with grass, and a katana in the middle (wooden orange-brown handle, metal blade). HUD shows only your health and kill count.
  - Console: third platform option (PC, Mobile, Console). Generic controller via the browser Gamepad API. Instructions text changes per platform. Mobile instructions are also missing and need writing.
  - Instructions today: one text for all platforms, describing keyboard and mouse only. It still names E and G, which can now be rebound. Needs per-platform text (PC, Mobile, Console).
- Built (titles, instructions, CatClaw shop text), checked by tests only:
  - Titles: Velmarian (blue) and Draxen (green) are free for everyone. Xeno Glazer (maroon) is earned by 10 matches in a row as Xeno (win or lose); recordMatch keeps u.xenoStreak and u.earnedTitles. Leaderboard titles come from titlesFor() and disappear automatically when rank changes. One title is worn at a time (u.equippedTitle), set with the setTitle socket event. Titles appear on profiles only, never in the lobby. Account > Titles screen (sTitles) lists and wears them.
  - Instructions: Controls text is per platform (INSTR_CONTROLS in index.html: pc, mobile, console). E and G stay in the PC text (defaults). The CatClaw sentence moved to his shop description (desc field in CHARS).
  - Console text is written for the agreed layout (left stick move, right stick camera, A basic attack, B ability, Y ultimate, D-pad for Moves 1 to 4, Start leaves, right stick in for shift lock). The Console platform option itself is not built yet.
- Still to build: Free For All mode (3 to 10 players, 4x arena with plains and grass, katana in the middle, own-health and kill count HUD, round and kill rewards), and the Console platform with Gamepad API support.
- Titles now show one line: Account shows "Title: <worn title>" (or None), and so does the Find a player profile. The full list appears only on the Account > Titles screen.
- Console platform (third option in the platform menu): standard Gamepad layout. Left stick moves, right stick turns the camera (up looks up), A basic attack, B ability, Y ultimate, D-pad left/up/right/down = Moves 1 to 4, Start leaves the match, right stick press toggles shift lock (no pointer lock on console). Settings are saved per platform (console too). Checked by tests/console-smoke.js with a fake controller; not yet tested with a real controller.
- platformNow() returns 'pc', 'mobile' or 'console'.
- Still not built: Free For All mode.
- Free For All (built; tests cover the lobby, the start rules and the page wiring; a live fight is not tested):
  - Create Room has a Free For All button. Rooms hold 3 to 10 players (the host starts at 3). Free For All always plays on the 'plains' map, so the map buttons are hidden for it.
  - Each player has their own team number, so 'enemy' checks treat everyone else as an enemy.
  - Spawns sit on a ring of radius 12. The plain is radius 17.4 (4x the arena's area).
  - A knock-out pays the attacker KILL_REWARD (5 K Serum). Every life lost counts, so a CatClaw knock-out on lives 1 or 2 also pays a kill.
  - A round ends when one player is left, and the winner gets players x 5 K Serum (players still in the room at the end of the round).
  - The match winner is the player with the most round wins, then the most kills. No match bonus in Free For All.
  - Knocked-out players lie down and become ghosts, as in 2v2.
  - Names above heads are plain (no blue or red sides). The HUD shows only your health bar and your kills (in the middle line).
  - Join Random still only finds 1v1 and 2v2 rooms.
  - Plain: grass with a procedurally drawn texture, and a katana (orange-brown wooden handle, dark guard, metal blade) lying in the middle.
  - Instructions include a Free For All line under Matches.
- Free For All fixes: Join Random has a Random Free For All button (server accepts mode 'ffa'; a new one is created on the plain). The waiting room lists every Free For All player in one list (open spots up to 10), with no Blue or Red side. Grass is a brighter green; the katana handle is a brownish orange.
- CatClaw timing game: running out of time (no second press) no longer tires him. He only gets tired when a dash hits or a committed dash misses. Checked in tests/dash-test.js.
- The shop (Choose Character): a six-tier hallway with 'Tier 1' to 'Tier 6' signs, a Pyro Wanted poster (cleaned from the drawing, public/ui/shop/pyro_wanted.png, yellowed paper, no blue hand), a Join The Velmarians! poster drawn in code (blue-suited soldiers in blue helmets), and a shopkeeper behind a counter at the far end. Stands run in the listed shop order; each name is in its colour, with its price (Tier 1 Free, Kaizer ???). Placeholders (no model yet) show Coming soon under the name, an empty stand, and Buy says Coming soon. Checked in tests/choose-smoke.js.
- Not done yet: more people in the background of deeper tiers (the owner's idea), and the shopkeeper's look is placeholder primitives.
- Shop layout (depth): each tier is its own row, one row further forward per tier (ROW_DEPTH = 6). Tier 1 is at the back, nearest the shopkeeper's counter and the posters. The camera sits in front of the current row and moves forward with each tier, so the lower tiers stay in view behind it. Stands without models are empty stands with their glow ring.
- Shop spacing: tier rows are 12 apart (ROW_DEPTH), so the next tier sits behind the camera and does not block the current one. Every tier is centred on the shopkeeper (SHOP_X = 14), and each tier sign is centred above its row. The Velmarians poster title shrinks to fit.

