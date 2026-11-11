# Flagship 50 — Angela, 2026-11-11

## Durability

Original public build: `187fc5350b66a60b0c0e4fdb87800ea2f298f8be`.
Remote rollback branch: `archive/pre-angela-20261111`.
Development: `codex/flagship-50`. Main / public Pages remains unchanged.
Initial worktree was clean; no worktrees removed or moved.

## Implemented first phase

- Synchronous action consumption closes rapid-click multiple shots.
- Nuclear footprint 11x11, clipped at edges, not 19x19.
- Radiation and zone lifetime tick on the affected player's turns only.
  The same zone cannot restart an expired three-tick radiation course.
- Torpedoes do not advance on launch; defender gets one response turn;
  impact at end of next attacking turn. Wrecks and islands block the path.
- Reserve submarine prevents victory until destroyed or turn-11 expiry.
- No movement during nuclear/PCR animation or after game over.
- Functional CIC maps: no own ships on enemy radar; restored targeting,
  movement highlights, terrain, submarine ghost and shot markers.
- Bridge separated from maps; full-size panels, brighter rings/sweep,
  wrapped controls and stacked narrow-screen maps.

## Verification

`node --test tests/mechanics.test.cjs`: eight isolated regressions exercising
actual functions from the shipped script, not a parallel mechanics model.
`NAVAL_BASELINE=1` compares these fixtures with the parked original.
No dependency install/native build required.
The initial comparison detected seven failing fixtures on the parked build
versus eight passing on the patched build. The launch-position assertion was
then tightened so it checks position as well as the remaining phase count.

Live local browser: 50x50 ocean, TARKR, auto-placement, shot, immediate action
lock, AI response, turn 2. Wide/narrow layouts checked; no horizontal overflow.
Local screenshot: `artifacts/flagship-50-desktop.jpg`.
Not a full playthrough or acceptance of every weapon/hotseat/AI edge case.

The old v4 document differs in action economy. Preserve the existing web game's
one action plus nine movement points, not the old MOVE-versus-FIRE restriction.
Inline torpedo/victory rules updated to the implemented timing.

## Art / coordination / remaining

New built-in-generated asset: `sprites/showcase/usagi-bridge-v2.png`.
Prompt: panoramic modern naval bridge at cold blue dawn; unobstructed windows
and ocean; red equipment on far side bulkheads; quiet dark lower space;
no people, painted screens, radar, text, buttons or logos.
Art is atmosphere above real controls, not a fake UI.

Owner requested Phoebe curator through Ochag. Request #5932; advisory response
from `lara-fable`. Phoebe explicitly confirmed that handle is hers after the
identity clarification #5941. Advisory curation accepted, no parallel code.
No new worker, task or automation.

Remaining: further combat edge cases, save/resume, ship/terrain/effect art,
audio and event pacing, nuclear cinematic and owner visual acceptance.
This first phase is not a completed game; public main has not been replaced.
