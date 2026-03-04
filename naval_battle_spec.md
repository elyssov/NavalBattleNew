# NAVAL BATTLE: STRATEGIC EDITION
## Technical Specification & Implementation Prompt for Claude Code

---

## PROJECT OVERVIEW

Build a two-player turn-based naval strategy game — an advanced version of Battleship. The game runs in a web browser (HTML/CSS/JS). No frameworks — vanilla JS. Single HTML file for alpha, can be split later.

The game has two modes: local (vs AI) and LAN P2P (two browsers on same network).

Reference design document: `naval_battle_design_doc_v4.md` — contains complete game rules. This spec translates those rules into implementation requirements.

---

## TECHNOLOGY STACK

- **Frontend:** HTML5 Canvas (game rendering) + DOM (UI panels, buttons, menus).
- **Networking:** WebRTC DataChannel for P2P over LAN. No server required.
- **AI:** Local JS module, probability-based (no neural networks).
- **Sound:** HTML5 Audio API. Alpha version: stubs only (console.log instead of actual sounds). Reserve function signatures for later.
- **State:** All game state in a single JS object. JSON-serializable for networking and replay.

---

## ARCHITECTURE

```
index.html
├── Game Engine (game state, rules validation, turn logic)
├── Renderer (Canvas drawing for map and radar)
├── UI Controller (DOM menus, buttons, phase indicators)
├── AI Module (enemy logic for single-player)
├── Network Module (WebRTC P2P for multiplayer)
├── Sound Module (stubs in alpha)
└── Replay Module (turn log, playback)
```

### Core Principle: Two Separate Spaces

The game has TWO independent grids per player. They are NOT connected spatially. There is no distance between them. Ships cannot move from one to the other.

**Fleet Map (карта флота):** Player's own ships. Blue/ocean themed. Shows:
- Own ships (models/sprites).
- Enemy hits on own ships (red markers).
- Enemy misses (white markers).
- Incoming torpedoes (animated marker approaching own ship).
- Incoming striker (icon near attacked ship).
- Landscape (islands, wrecks) — always visible.

**Radar Screen (радар):** Player's view of enemy's field. Black/green themed with scan line animation. Shows:
- Coordinate grid (empty at start).
- Own shots: hits (red) and misses (white).
- Sunk enemy ships (full outlines).
- Recon data: detected enemy ships (with aging/fading).
- Landscape: islands VISIBLE, wrecks NOT VISIBLE.

### State Object Structure

```javascript
const gameState = {
  settings: {
    fieldSize: 50,          // 30, 50, or 100
    landscape: 'ocean',     // 'ocean' | 'wrecks' | 'islands' | 'archipelago'
    pcrIntercept: false,    // mini-game on/off
    weather: false,         // reserved for future
    gameMode: 'ai',         // 'ai' | 'p2p'
    aiDifficulty: 'easy'    // 'easy' | 'medium' | 'hard'
  },
  
  landscape: {
    // Same for both players
    islands: [],    // [{x, y, w, h}] — visible on both map and radar
    wrecks: []      // [{x, y, w, h}] — visible on own map, NOT on enemy radar
  },
  
  players: [
    {
      id: 0,
      ships: [
        {
          type: 'destroyer',     // ship type
          size: 3,               // cells
          cells: [{x:5, y:3}, {x:6, y:3}, {x:7, y:3}],
          orientation: 'horizontal',  // 'horizontal' | 'vertical'
          hits: [false, false, false], // per cell
          sunk: false,
          // Special fields for TARKR:
          reactor: 2,            // index of reactor cell (center)
          launchers: [           // ПУ status
            {index: 0, loaded: true, damaged: false},
            {index: 1, loaded: true, damaged: false},
            {index: 3, loaded: true, damaged: false},
            {index: 4, loaded: true, damaged: false}
          ],
          // Special fields for carrier:
          planes: 3,             // remaining recon planes
          blocked: false,        // aviation blocked this turn
          // Special fields for submarine:
          deployed: false,       // has been placed on field
          surfaced: false,       // visible after torpedo launch
          torpedoes: 3,
          // General:
          radarCooldown: 0       // turns until radar available from this ship
        }
      ],
      
      // Radar data (what this player knows about enemy)
      radarData: {
        shots: [],              // [{x, y, hit: bool}]
        detectedShips: [],      // [{shipRef, cells, turnDetected, aged: bool}]
        sunkShips: []           // [{type, cells}]
      },
      
      nuclearUsed: false,
      nuclearZone: null,        // {centerX, centerY, turnsRemaining}
      
      turnLog: []               // [{turn, action, details}]
    },
    // Player 2 — same structure
  ],
  
  currentTurn: 0,
  currentPlayer: 0,              // 0 or 1
  phase: 'recon',                // 'recon' | 'action' | 'waiting'
  reconDone: false,              // has player used recon this turn
  activeTorpedoes: [],           // [{owner, targetX, targetY, distanceRemaining, cells:[]}]
  
  turnHistory: []                // for replay
};
```

---

## GAME FLOW

### 1. Main Menu

Screen with options:
- **New Game** → Settings screen.
- Settings screen shows:
  - Field size: 30×30 / 50×50 / 100×100 (radio buttons).
  - Landscape: Ocean / Wrecks / Islands / Archipelago (radio buttons, with hover/click description popup showing flavor text from design doc).
  - PCR Intercept mini-game: checkbox.
  - Mode: vs AI / vs Player (LAN).
  - AI Difficulty (if vs AI): Easy / Medium / Hard.
  - **Start** button.

### 2. Landscape Generation

After settings confirmed, generate landscape:

```
function generateLandscape(fieldSize, type):
  if type == 'ocean': return empty
  
  targetCoverage:
    'wrecks': 10% of field
    'islands': 20% of field  
    'archipelago': 30% of field
  
  For 'wrecks': place random rectangles 1×1, 2×1, rarely 2×2
  For 'islands': place random rectangles 2×2, 3×3, up to 4×4
  For 'archipelago': same as islands but more dense
  
  After generation: flood-fill pathfinding check.
  Every free cell must be reachable from every other free cell 
  (for surface ships, not diagonal movement).
  If not — regenerate.
  
  Landscape is identical for both players.
```

### 3. Ship Placement Phase

Each player places ships on their fleet map. For AI — auto-placement with rules validation.

**Placement rules (validate all):**
- Ships horizontal or vertical only.
- No overlapping.
- No touching (1 cell gap in all directions including diagonals).
- Not on landscape cells.
- Submarine is NOT placed during this phase.

**UI for placement:**
- Show fleet map.
- Ship roster on the side — drag ships onto field.
- Click ship to rotate 90°.
- Validate in real-time: valid position = green highlight, invalid = red.
- "Auto-place" button for random valid placement.
- "Ready" button when done.

For P2P: both players place simultaneously, hidden from each other. Game starts when both press Ready.

### 4. Turn Execution

```
function executeTurn(player):
  phase = 'recon'
  
  // Step 1: RECON (optional)
  showReconOptions(player)
  // Player can: use radar, use air recon, or skip
  // After choice (or skip):
  
  phase = 'action'
  
  // Step 2: MOVE or FIRE (mutually exclusive)
  showActionToggle(player)  // MOVE | FIRE | SKIP
  
  // If MOVE:
  //   Select ship → show movement options (1-3 cells forward/back, or rotate 90°)
  //   Validate move (no collisions, no landscape, no off-grid)
  //   Execute move
  //   Cannot fire this turn
  //   NOTE: deploying submarine counts as MOVE
  
  // If FIRE:
  //   Select action: Shot | PCR | Torpedo | Striker | Nuclear
  //   Execute action (see combat functions below)
  //   Cannot move this turn
  
  // Step 3: End of turn processing
  advanceTorpedoes()       // move active torpedoes 1 cell closer
  ageReconData(player)     // fade old detections
  decrementCooldowns(player)
  decrementNuclearZone()
  applyRadiationDamage()   // ships partially hit by nuke lose 1 cell
  checkSubmarineDeadline() // if turn 11 and sub not deployed — sunk
  checkVictory()
  
  currentPlayer = 1 - currentPlayer
  currentTurn++
```

### 5. Combat Functions

#### 5.1. Regular Shot

```
function regularShot(attacker, x, y):
  // Requires: attacker has at least 1 living surface ship
  // Target: coordinates on attacker's RADAR
  
  defender = otherPlayer(attacker)
  cell = defender.fleetMap[x][y]
  
  if cell has ship:
    mark hit on ship
    mark hit on attacker's radar
    
    if ship fully destroyed:
      mark sunk
      reveal full ship outline on attacker's radar
      
      // Special: TARKR/Carrier reactor/launcher detonation checks
      // are triggered per-cell on hit, not on sinking
    
    return 'hit'
  else:
    mark miss on both
    return 'miss'
```

#### 5.2. Radar

```
function useRadar(player, sourceShip):
  // Cooldown check: sourceShip.radarCooldown must be 0
  // Set cooldown: sourceShip.radarCooldown = 3
  
  // COST: source ship revealed to enemy
  enemy = otherPlayer(player)
  enemy.radarData.detectedShips.push({
    cells: sourceShip.cells,
    turnDetected: currentTurn
  })
  
  // Check each enemy ship:
  for each enemyShip in enemy.ships:
    if enemyShip.sunk: skip
    
    baseChance = 60
    sizeBonus = enemyShip.size * 5
    damagePenalty = sourceShip.isAnyHit() ? 15 : 0
    
    chance = clamp(baseChance + sizeBonus - damagePenalty, 5, 95)
    
    roll = randomD100()
    if roll <= chance:
      player.radarData.detectedShips.push({
        cells: enemyShip.cells.copy(),
        turnDetected: currentTurn
      })
```

#### 5.3. Air Recon

```
function airRecon(player):
  carrier = player.getCarrier()
  // Requires: carrier alive, carrier.planes > 0, carrier.blocked == false
  carrier.planes--
  
  planeAlive = true
  
  enemy = otherPlayer(player)
  for each enemyShip in enemy.ships:
    if enemyShip.sunk: skip
    if !planeAlive: break
    
    baseChance = 55
    sizeBonus = enemyShip.size * 5
    chance = clamp(baseChance + sizeBonus, 5, 95)
    
    roll = randomD100()
    if roll <= chance:
      // Detected
      player.radarData.detectedShips.push({
        cells: enemyShip.cells.copy(),
        turnDetected: currentTurn
      })
    else:
      // Failed detection — check if plane shot down
      shootDownRoll = randomD100()
      if shootDownRoll <= 30:
        planeAlive = false
        // Plane lost, stop checking remaining ships
  
  // Does NOT reveal carrier position (no cost)
```

#### 5.4. PCR P-1000 "Vulkan" (Anti-Ship Missile)

```
// PCR intercept chances by ship class (intact / damaged)
const PCR_INTERCEPT = {
  'patrol_boat':  { intact: 0,  damaged: 0  },  // AK-630 30mm — useless vs Vulkan
  'mrk':          { intact: 10, damaged: 5  },  // Osa-M, single-channel SAM
  'destroyer':    { intact: 25, damaged: 12 },  // medium-range SAM
  'cruiser':      { intact: 40, damaged: 20 },  // multi-layered PVO
  'tarkr':        { intact: 50, damaged: 25 },  // S-300F + Kinzhal + Kortik
  'carrier':      { intact: 40, damaged: 20 },  // Kinzhal + ZRAK
  'submarine':    { intact: -1, damaged: 0  }   // -1 = invalid target (underwater)
  // Exception: surfaced submarine = 0% intercept (no PVO), guaranteed kill
};

function launchPCR(player, launcherIndex, targetX, targetY):
  tarkr = player.getTARKR()
  launcher = tarkr.launchers[launcherIndex]
  // Requires: launcher.loaded && !launcher.damaged
  launcher.loaded = false
  
  enemy = otherPlayer(player)
  targetShip = enemy.getShipAt(targetX, targetY)
  
  if !targetShip:
    // Miss — PCR wasted on empty water
    return 'miss'
  
  if targetShip.type == 'submarine' && !targetShip.surfaced:
    // Cannot target submerged submarine
    return 'invalid_target'
  
  // Determine intercept chance based on target class and damage
  isDamaged = targetShip.hits.some(h => h)
  interceptChance = isDamaged 
    ? PCR_INTERCEPT[targetShip.type].damaged
    : PCR_INTERCEPT[targetShip.type].intact
  
  if settings.pcrIntercept:
    // Mini-game mode: number of attempts based on ship class
    // patrol_boat: 0 attempts (auto-hit, no mini-game)
    // mrk: 1 attempt
    // destroyer: 2 attempts  
    // cruiser/carrier: 3 attempts
    // tarkr: 3 attempts + only 2 blips instead of 3 (easier)
    intercepted = playInterceptMiniGame(enemy, targetShip.type, isDamaged)
  else:
    // Auto-resolve: D100 roll
    roll = randomD100()
    intercepted = (roll <= interceptChance)
  
  if intercepted:
    return 'intercepted'  // PCR shot down, ship survives
  else:
    // VULKAN HIT — SHIP SUNK ENTIRELY
    destroyEntireShip(targetShip)
    return 'kill'
```

#### 5.5. Striker

```
function launchStriker(player, targetX, targetY):
  carrier = player.getCarrier()
  // Requires: carrier alive, carrier.blocked == false
  
  enemy = otherPlayer(player)
  
  // Chain attack loop
  while true:
    targetShip = enemy.getShipAt(targetX, targetY)
    if !targetShip:
      break  // miss, striker returns
    
    // Both players roll D100
    attackRoll = randomD100()
    defenseRoll = randomD100()
    
    if attackRoll == defenseRoll:
      // Tie — reroll
      continue  // same target, reroll
    
    if attackRoll > defenseRoll:
      // Striker wins — hit
      hitCell(targetShip, targetX, targetY)
      
      // Player chooses next target
      nextTarget = getPlayerInput('Next striker target coordinates (or abort)')
      if nextTarget == abort: break
      targetX = nextTarget.x
      targetY = nextTarget.y
      // Continue chain
    else:
      // Striker shot down
      break
```

#### 5.6. Torpedo

```
function launchTorpedo(player, targetX, targetY):
  sub = player.getSubmarine()
  // Requires: sub.deployed, sub.torpedoes > 0
  sub.torpedoes--
  sub.surfaced = true  // visible for 1 turn
  
  // Calculate spawn point: 3 cells from target, along line from sub to target
  // Direction: from submarine position toward target on radar
  // Since fields are separate, torpedo just appears 3 cells from target
  // on the DEFENDER's fleet map, approaching from arbitrary direction
  
  // Check landscape blockage on DEFENDER's field:
  // Draw line from spawn (3 cells from target) to target
  // If any wreck or island cell is on this line — torpedo destroyed
  
  spawnPoint = calculateTorpedoSpawn(targetX, targetY)
  pathCells = getLineCells(spawnPoint, {x: targetX, y: targetY})
  
  for each cell in pathCells:
    if isLandscape(enemy.field, cell.x, cell.y):
      // Torpedo hits obstacle — destroyed
      return 'blocked'
  
  // Torpedo enters play
  activeTorpedoes.push({
    owner: player.id,
    targetX, targetY,
    distanceRemaining: 3,
    spawnPoint: spawnPoint
  })
  
  // Torpedo resolves over next turns via advanceTorpedoes()

function advanceTorpedoes():
  for each torpedo in activeTorpedoes:
    torpedo.distanceRemaining--
    
    if torpedo.distanceRemaining <= 0:
      // Arrived at target
      defender = getPlayer(1 - torpedo.owner)
      targetShip = defender.getShipAt(torpedo.targetX, torpedo.targetY)
      
      if targetShip:
        // GUARANTEED KILL — entire ship destroyed, no rolls
        destroyEntireShip(targetShip)
      else:
        // Ship moved — torpedo misses
      
      removeTorpedo(torpedo)
```

#### 5.7. Nuclear Strike

```
function nuclearStrike(player, centerX, centerY):
  // Requires: !player.nuclearUsed, not 'skirmish' mode
  player.nuclearUsed = true
  
  enemy = otherPlayer(player)
  zone = get11x11zone(centerX, centerY)
  
  for each cell in zone:
    ship = enemy.getShipAt(cell.x, cell.y)
    if ship:
      if isShipFullyInZone(ship, zone):
        // Instant kill
        destroyEntireShip(ship)
      else:
        // Partial — mark for radiation damage
        ship.radiationDamage = true
  
  // Set contamination zone
  player.nuclearZone = {
    centerX, centerY,
    turnsRemaining: 3
  }
  
  // Radiation damage applied each turn in end-of-turn processing:
  // Ships with radiationDamage lose 1 healthy cell per turn until sunk
  // Ships MOVING through contaminated zone lose 1 cell
```

#### 5.8. Hit Cell (with special detonation checks)

```
function hitCell(ship, x, y):
  cellIndex = ship.getCellIndex(x, y)
  ship.hits[cellIndex] = true
  
  // Check if all cells hit — ship sunk
  if ship.hits.every(h => h):
    ship.sunk = true
  
  // TARKR special checks
  if ship.type == 'tarkr':
    if cellIndex == ship.reactor:
      // Hit reactor
      roll = randomD100()
      if roll <= 50:
        triggerNuclearExplosion(ship)  // 5x5 from reactor
    else:
      // Check if this cell is a loaded launcher
      launcher = ship.launchers.find(l => l.index == cellIndex)
      if launcher && launcher.loaded && !launcher.damaged:
        launcher.damaged = true
        roll = randomD100()
        if roll <= 15:
          triggerNuclearExplosion(ship)  // 5x5 from reactor
  
  // Carrier special checks
  if ship.type == 'carrier':
    ship.blocked = true  // block aviation next turn
    
    if cellIndex == ship.reactor:
      roll = randomD100()
      if roll <= 50:
        triggerNuclearExplosion(ship)
    else:
      // Fuel detonation check
      roll = randomD100()
      if roll <= 15:
        triggerNuclearExplosion(ship)

function triggerNuclearExplosion(ship):
  // 5x5 zone centered on reactor cell
  reactorCell = ship.cells[ship.reactor]
  zone = get5x5zone(reactorCell.x, reactorCell.y)
  
  // Destroy everything in zone on THIS player's fleet map
  // (including own ships!)
  owner = getShipOwner(ship)
  for each cell in zone:
    ownerShip = owner.getShipAt(cell.x, cell.y)
    if ownerShip:
      destroyEntireShip(ownerShip)
```

---

## MOVEMENT

```
function moveShip(player, ship, moveType, param):
  if moveType == 'slide':
    // param = number of cells (1, 2, or 3) and direction (forward or backward along axis)
    newCells = calculateSlide(ship, param.direction, param.distance)
    
    // Validate each cell in path and destination:
    for each cell in pathAndDestination:
      if outOfBounds(cell): return invalid
      if isLandscape(player.field, cell):
        if ship.type == 'submarine' && isWreck(cell): continue  // sub passes under wrecks
        return invalid
      if hasOwnShip(player, cell, excludeShip=ship): return invalid
      if hasSunkShip(player, cell): return invalid
    
    ship.cells = newCells
    
  if moveType == 'rotate':
    // Rotate 90° around center cell
    if ship.size % 2 == 1:
      // Odd size: center cell is middle
      pivot = ship.cells[Math.floor(ship.size / 2)]
    else:
      // Even size: coin flip which of two middle cells is pivot
      coinFlip = randomD100() <= 50
      pivotIndex = coinFlip ? (ship.size/2 - 1) : (ship.size/2)
      pivot = ship.cells[pivotIndex]
    
    newCells = calculateRotation(ship.cells, pivot)
    
    // Validate all new cells
    for each cell in newCells:
      if outOfBounds(cell): return invalid
      if isLandscape(player.field, cell): return invalid  
      if hasOwnShip(player, cell, excludeShip=ship): return invalid
    
    ship.cells = newCells
    ship.orientation = (ship.orientation == 'horizontal') ? 'vertical' : 'horizontal'

function deploySubmarine(player, cells):
  // This is a MOVE action (no firing this turn)
  // Requires: turn <= 10, sub not yet deployed
  sub = player.getSubmarine()
  
  // Validate placement:
  // - 3 cells, horizontal or vertical
  // - Can be on cells where enemy previously missed
  // - Cannot be on sunk ship cells
  // - Cannot touch own ships (1 cell gap)
  // - Can be on wreck cells (sub goes under)
  // - Cannot be on island cells
  
  if valid:
    sub.cells = cells
    sub.deployed = true
```

---

## RECON DATA AGING

```
function ageReconData(player):
  for each detection in player.radarData.detectedShips:
    age = currentTurn - detection.turnDetected
    
    if age >= 4:
      removeDetection(detection)  // fully gone
    else:
      detection.opacity = [1.0, 0.7, 0.4, 0.15][age]
      // 0 = bright, 1 = fading, 2 = dim, 3 = ghost with "?"
```

---

## RENDERING

### Fleet Map (Canvas)

```
- Background: ocean blue (#1a5276 or similar)
- Grid lines: subtle, lighter blue
- Own ships: colored sprites or rectangles
  - Healthy cells: dark gray
  - Hit cells: red with damage texture
  - Sunk ships: black
- Enemy hits on own ships: red X marker
- Enemy misses: white dot
- Landscape:
  - Islands: green/brown rectangles with simple texture
  - Wrecks: dark gray rectangles with jagged outline
- Incoming torpedo: animated red triangle moving toward target
- Incoming striker: aircraft icon near attacked ship
- Nuclear explosion zone: black charred area, orange glow fading over 3 turns
- Coordinate labels on edges (letters + numbers)
```

### Radar Screen (Canvas)

```
- Background: black (#0a0a0a)
- Grid lines: dark green (#0d3d0d)
- Scan line: animated bright green line rotating from center (cosmetic)
- Own shots:
  - Misses: dim green dot
  - Hits: bright green dot
- Detected enemy ships: green outlines, opacity based on age
  - Fresh: bright green
  - Aging: fading green
  - Old: barely visible, "?" marker
- Sunk enemy ships: full outline in red
- Landscape:
  - Islands: visible, dark green rectangles
  - Wrecks: NOT SHOWN
- Torpedo in transit: green moving marker
- Striker path: green vector arrows between attack points
```

### Navigation (for large fields)

```
- Mouse wheel / pinch: zoom in/out
- Click-drag / one-finger drag: pan
- Minimap in corner: shows full field overview
  - Click on minimap: jump camera to that area
- Coordinate input field: type "K-47" to jump to coordinates
- Current zoom level indicator
```

### UI Panels (DOM, not Canvas)

```
- Top bar: Turn number, current player, phase indicator
- Phase indicator: 
  - RECON phase: blue highlight
  - MOVE/FIRE toggle: two buttons, selected one highlighted
    - MOVE selected: green
    - FIRE selected: red
- Right panel: Ship roster with status
  - Each ship: name, health bar, special status (ammo count, cooldowns)
- Bottom panel: Action buttons (context-dependent on phase)
  - RECON phase: [Radar] [Air Recon] [Skip]
  - MOVE phase: [Select Ship to Move] [Deploy Submarine]
  - FIRE phase: [Shot] [PCR] [Torpedo] [Striker] [Nuclear] [Skip]
- Recon log: collapsible panel, toggle with button or hotkey
- Turn result popup: brief animation/text showing what happened
```

---

## AI OPPONENT (Alpha — Easy Difficulty)

```
AI decision tree for easy difficulty:

RECON phase:
  if radarCooldown == 0 on any ship AND no recent detections (last 3 turns):
    use radar from healthiest ship
  else:
    skip recon

ACTION phase:
  // Priority 1: finish off detected ships
  if any detected enemy ship with known position and hits:
    FIRE: shoot adjacent cell to known hit
  
  // Priority 2: shoot at detected ship
  if any detected enemy ship (not aged out):
    FIRE: shoot at detected ship cell
  
  // Priority 3: deploy submarine before deadline
  if submarine not deployed AND currentTurn >= 7:
    MOVE: deploy submarine at random valid position
  
  // Priority 4: random shot using probability heatmap
  else:
    FIRE: shoot at highest-probability cell
    // Heatmap: cells near hits = higher priority
    // Cells already shot = zero priority
    // Center of field slightly preferred over edges

  // AI never moves ships (easy difficulty)
  // AI never uses PCR, torpedoes, striker, or nuclear (easy difficulty)
```

---

## P2P NETWORKING (Alpha)

```
Connection flow:
1. Host clicks "Create Game" — generates offer, displays room code (IP:port or signaling)
2. Guest enters host IP on local network
3. WebRTC DataChannel established
4. Both players enter placement phase simultaneously
5. When both ready — game begins, host goes first (or random)

Message protocol (JSON):
{
  type: 'READY',          // placement done
  type: 'TURN',           // turn action
  type: 'RESULT',         // result of opponent's action on my field
  type: 'STATE_SYNC',     // full state sync (periodic, anti-desync)
  
  payload: { ... }        // action-specific data
}

Turn flow for P2P:
1. Active player chooses action locally
2. Sends TURN message: {type: 'TURN', action: 'shot', x: 15, y: 23}
3. Defender receives, checks own field, sends RESULT: {type: 'RESULT', result: 'hit', shipType: 'destroyer', sunk: false}
4. Both update displays
5. Turn passes to other player

Trust model: NONE (alpha). Each player's client is authoritative over their own field.
No anti-cheat. Proof of concept.
```

---

## PCR INTERCEPT MINI-GAME (Optional)

When enabled in settings:

```
Render interceptor radar screen:
- Dark background, green grid
- Blips appear moving toward defender's ship
- 1 real, 2 decoys (TARKR target: 1 real, 1 decoy — easier)
- Number of intercept attempts depends on ship class:
  - Patrol boat: 0 (no mini-game, auto-hit)
  - MRK: 1 attempt
  - Destroyer: 2 attempts
  - Cruiser/Carrier: 3 attempts
  - TARKR: 3 attempts + only 2 blips (easier)
- If player clicks real blip within attempts: intercepted, PCR destroyed
- If attempts exhausted on decoys: PCR hits, SHIP SUNK

Real blip behavior:
- Moves smoothly in arc toward ship
- Slightly brighter than decoys
- Every 2-3 seconds: brief brightness pulse (subtle)

Decoy behavior:
- Moves jerkily, changes direction
- Slightly dimmer
- Pulses randomly

Timer: 8 seconds total
```

---

## SOUND STUBS (Alpha)

```javascript
const SFX = {
  shot_fire: () => console.log('SFX: shot_fire'),
  shot_hit: () => console.log('SFX: shot_hit'),
  shot_miss: () => console.log('SFX: shot_miss'),
  ship_sunk: () => console.log('SFX: ship_sunk'),
  radar_ping: () => console.log('SFX: radar_ping'),
  radar_detect: () => console.log('SFX: radar_detect'),
  pcr_launch: () => console.log('SFX: pcr_launch'),
  pcr_hit: () => console.log('SFX: pcr_hit'),
  pcr_intercept: () => console.log('SFX: pcr_intercept'),
  torpedo_launch: () => console.log('SFX: torpedo_launch'),
  torpedo_hit: () => console.log('SFX: torpedo_hit'),
  torpedo_miss: () => console.log('SFX: torpedo_miss'),
  torpedo_blocked: () => console.log('SFX: torpedo_blocked'),
  striker_attack: () => console.log('SFX: striker_attack'),
  striker_hit: () => console.log('SFX: striker_hit'),
  striker_down: () => console.log('SFX: striker_down'),
  nuclear_launch: () => console.log('SFX: nuclear_launch'),
  nuclear_explosion: () => console.log('SFX: nuclear_explosion'),
  reactor_meltdown: () => console.log('SFX: reactor_meltdown'),
  fuel_detonation: () => console.log('SFX: fuel_detonation'),
  plane_flyby: () => console.log('SFX: plane_flyby'),
  ambient_ocean: () => console.log('SFX: ambient_ocean'),
  turn_start: () => console.log('SFX: turn_start'),
  victory: () => console.log('SFX: victory'),
  defeat: () => console.log('SFX: defeat')
};
```

---

## REPLAY SYSTEM

```
Every action is logged to turnHistory[]:
{
  turn: 14,
  player: 0,
  recon: {type: 'radar', sourceShip: 'cruiser_1', results: [...]},
  action: {type: 'fire_shot', x: 47, y: 23, result: 'hit', shipType: 'destroyer'},
  torpedoAdvance: [{id: 1, newDistance: 1}],
  radiationDamage: [],
  sinkings: []
}

Post-game replay:
- Show both fields simultaneously (no fog of war)
- Step through turns with forward/back buttons
- Speed control
- Text log alongside: "Turn 14: Player 1 fires at F-23. HIT — Destroyer."
```

---

## IMPLEMENTATION ORDER

### Phase 1: Core Engine
1. Game state object and initialization.
2. Field generation (grid, landscape generation with pathfinding validation).
3. Ship placement logic with all validation rules.
4. Turn structure: recon → toggle MOVE/FIRE.

### Phase 2: Combat
5. Regular shot (hit/miss/sunk).
6. Movement (slide + rotate with validation).
7. Radar (D100, detection, aging, source reveal).
8. Submarine deployment, invisibility, surfacing.
9. Torpedo (delayed arrival, landscape blockage, guaranteed kill).

### Phase 3: Advanced Combat
10. PCR (launch, D100 hit check, detonation checks on TARKR).
11. Striker (D100 vs D100 chain, carrier aviation block).
12. Nuclear strike (11×11 zone, radiation, contamination).
13. Reactor/launcher/fuel detonation → 5×5 nuclear explosion on OWN field.
14. Air recon (D100, plane loss check).

### Phase 4: UI & Rendering
15. Canvas renderer for fleet map.
16. Canvas renderer for radar.
17. Navigation (zoom, pan, minimap).
18. DOM UI panels (phase indicator, ship roster, action buttons).
19. Turn result display.

### Phase 5: AI
20. Easy AI (probability heatmap + finish-off logic).

### Phase 6: Multiplayer
21. WebRTC DataChannel P2P connection.
22. Turn message protocol.
23. State sync.

### Phase 7: Polish
24. Recon log panel.
25. Replay system.
26. Sound stubs.
27. Fleet size scaling for 30×30 and 100×100.

---

## KEY VALIDATION RULES (Checklist)

- [ ] Two fields are NEVER connected. No "distance between fields."
- [ ] Regular shot: no roll. Hit = hit. Player needs living surface ship to fire.
- [ ] Wrecks visible on own fleet map, NOT on enemy radar.
- [ ] Islands visible on BOTH fleet map and radar.
- [ ] Torpedo blocked by wrecks AND islands (checked on DEFENDER's field).
- [ ] Shots and PCR NOT blocked by landscape (fly over).
- [ ] Submarine invisible to regular shots. Only radar/air recon detect it.
- [ ] MOVE and FIRE mutually exclusive. Toggle, not phases.
- [ ] RECON happens BEFORE the MOVE/FIRE toggle. Independent.
- [ ] PCR "Vulkan": if it hits, ship is SUNK ENTIRELY (not one cell — whole ship)
- [ ] PCR intercept chance depends on TARGET ship class (0% for patrol boat, up to 50% for TARKR)
- [ ] PCR damaged target: intercept chance halved
- [ ] PCR cannot target submerged submarine (only surfaced = guaranteed kill)
- [ ] Striker: both roll D100, higher wins. No degradation. Fair 50/50 each exchange.
- [ ] Movement = up to 3 cells along axis OR 90° rotation. Not both.
- [ ] Even-size ship rotation: coin flip for pivot cell.
- [ ] TARKR explosion happens on OWNER's fleet map (can kill own ships).
- [ ] Nuclear strike hits ENEMY field (via radar). Own ships unaffected.
- [ ] Submarine must be deployed by turn 10 or it's sunk.
- [ ] Submarine deployment counts as MOVE action.
- [ ] Carrier: ANY hit blocks aviation for 1 turn.
- [ ] Radar: reveals source ship to enemy.
- [ ] Air recon: does NOT reveal carrier.
