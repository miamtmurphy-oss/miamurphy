# Escape the Audio Maze

An audio-first maze game for blind players who are fast, expert screen-reader users.
The maze is never drawn as a picture that was later made accessible — it only ever
existed as sound, text and memory. Sighted players are the ones at a disadvantage.

## Running it

Open `index.html` in a browser. There is no build step, no install, and no server:
it is four static files.

Headphones make the stereo positioning much more useful, but they are not required —
every sound has a short text equivalent.

## How to play

You wake up in a maze. Find the keys, reach the exit door, and escape before the
timer hits zero.

At the start you get a clue about what the exit sounds like, for example
"the exit is near fresh air". A matching landmark sits next to the real exit, and
decoy landmarks are deliberately placed far away from it.

### Controls

| Key | Action |
| --- | --- |
| Up Arrow | Move forward |
| Down Arrow | Move backward |
| Left / Right Arrow | Turn |
| Enter | Take keys and bonuses, flip switches, open doors, disarm a trap ahead, use the exit |
| L | Listen — full description of where you are |
| S | Status — time, score, lives, keys |
| R | Repeat the most recent important clue |
| H | Help |
| M | Toggle built-in speech narration |
| Escape | Pause / resume |

### What is in the maze

- **Keys** jingle. You need them to open the exit.
- **Locked doors** rattle. A **switch** somewhere powers them.
- The switch also opens a **secret room** holding treasure.
- **Traps** hiss when you are beside them. Stepping on one costs a life and ten
  seconds. Work out the direction of the hiss, face it, and press Enter to disarm it
  for points.
- **Bonus items** chime.
- On Adventurer and Audio Master something **follows you**. Listen for footsteps.
- Occasional joke sounds are clearly labelled as "not a clue" so they never mislead.

### Difficulty

| | Explorer | Adventurer | Audio Master |
| --- | --- | --- | --- |
| Maze | 9×9 | 13×13 | 17×17 |
| Timer | 5:00 | 4:00 | 3:00 |
| Lives | 5 | 3 | 3 |
| Keys | 1 | 2 | 2 |
| Traps | 2 | 5 | 8 |
| Guidance | Surfaces, exits, traps and two landmarks named on every move | Exits and one landmark | Room shape only — everything else must be heard |
| Loops / misleading paths | none | some | many |
| Stalker | no | slow | fast |

Winning offers a **Next level**, which grows the maze, shortens the timer, adds
hazards and speeds the stalker up, carrying your score forward.

## Accessibility design

- **Keyboard only.** Nothing needs a mouse. No custom widgets where a native
  `button`, `input` or `dialog` would do.
- **Announcement modes.** Screen reader only (ARIA live region, the default),
  built-in speech only, both, or off with transcript text only. The default never
  speaks over your screen reader — which also means it is **silent if no screen
  reader is running**. A **Test announcement** button on the menu confirms your
  chosen mode reaches you before you start; it plays a chime as well, so "no audio
  at all" is distinguishable from "no speech".
- **Nothing is announced continuously.** Status is read only when you press `S`;
  the status panel and transcript are plain text you can navigate to at any time.
- **Messages are short**, for high speech rates: "Stone corridor. Open: ahead and
  behind. Chimes ahead." rather than a paragraph.
- **Stereo is never the only cue.** Direction is also given in words relative to your
  facing — ahead, behind, left, right — and sounds behind you are muffled as well as
  quieter, so front and back are distinguishable in mono.
- **Sound follows corridors, not straight lines.** Audio is routed with a
  breadth-first search over open cells, so "water left" means the *route* to the
  water turns left. Walls, locked doors and sealed passages block sound.
- **Focus is left alone.** Focus stays on the play surface during a run; it only
  moves when a dialog opens or a run ends.
- **No colour-coded or visual-only state.** The optional visual map is marked
  `aria-hidden` and exists purely for sighted companions.
- If the Web Audio API is unavailable, the game still runs on text alone.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Semantic markup, menus, status, transcript, live regions, dialogs |
| `styles.css` | High-contrast dark theme with visible focus indicators |
| `audio.js` | Synthesized spatial audio: landmark emitters and one-shot effects |
| `maze.js` | Maze generation, feature placement, sound/route field |
| `game.js` | Game rules, perception, announcements, scoring, timer |

No audio assets are shipped — every sound is generated at runtime, so the game is
only a few kilobytes and works offline.

## Verification

Maze generation and a scripted playthrough were tested in a headless browser:

- 1,600 generated mazes across four sizes: every one solvable, with the switch always
  reachable before any locked door, the exit beacon always adjacent to the exit, and
  sealed secret rooms never cutting off any other cell.
- Automated playthroughs: Explorer 12/12 escapes, Adventurer 11/12, Audio Master 11/12.
  The losses were the stalker catching a bot that never flees.
- All four endings confirmed: escape, out of lives, caught, and time out — each with
  the correct spoken reason and a focused "Play again" button.
- Pause confirmed to freeze movement; focus confirmed to stay on the play surface.

`window.EscapeAudioMaze.state()` exposes the current run for debugging and for
re-running those automated playthroughs.
