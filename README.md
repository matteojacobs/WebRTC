# Development Process

---

### Step 1 — Project Setup

I initialised the project repository on GitHub and set up the basic folder structure. From there I copied the code to get a local dev server running with `npm install` / `npm start` from the demos.

**AI involvement:** The initial server setup code was copied from the demo.

**My modification (🟢 code green):** I edited/optimized the server startup script so the terminal prints the **complete clickable URL** (host + port combined), instead of printing the host address and port separately.

---

### Step 2 — QR Code Phone–Desktop Link

I copied the QR-code pairing flow from a provided demo.

**AI involvement:** The QR pairing and WebSocket connection code came from the demo.

**My modification (🟢 code green):** I removed the continuous motion-update listener that fired every time the phone moved. In the original demo this caused a flood of unnecessary events. I stripped this out so the phone only sends meaningful, debounced sensor snapshots — keeping the connection clean and the canvas responsive.

---

### Step 3 — Concept Development

#### Initial Brainstorm

My first idea was a generative art tool where the smartphone acts as a paintbrush in 3D space:

> *Move the phone → lines and colours appear on a desktop canvas. Tilt changes brush colour, speed changes brush width, vertical movement shifts the brush up/down with accompanying volume changes, horizontal movement shifts left/right with pitch changes. Tapping the screen saves the artwork and resets the canvas.*

#### Pivot to Particle Life

After reflection I moved toward something more algorithmically interesting: **Particle Life with sensor-driven rule mutation**. Rather than drawing freely, the user's physical presence and environment continuously reshape the underlying simulation rules — making the system feel alive and personal. The phone becomes a "magic wand" that bends an emergent microbial world to the user's will.

---

### Step 4 — Sensor Architecture

The final project maps **6 sensor variables** to Particle Life parameters:

| Sensor | Variable | Effect on simulation |
|---|---|---|
| Accelerometer / Orientation | `tiltX` | Controls particle radius (phone tilt angle) |
| Gyroscope | `gyroMagnitude` | Controls max particle speed |
| Microphone | `bassEnergy` | Shifts the entire attraction matrix toward repulsion |
| Magnetometer | `compassOrientation` | Sets gravity direction (N/NE/E/SE/S/SW/W/NW) |
| Orientation | `tiltY` | Controls gravity strength (how steeply the phone is tilted) |
| Battery | `battery` | Controls how many colour groups are active (1–10) |

---

### Step 5 — WebRTC Streaming

I set up a WebRTC peer-to-peer connection between the phone (controller) and desktop (receiver), following the **P04-simple-peer-to-peer** demo and the video series below:

* 🎬 `webrtc_03-webcam-local-https`
* 🎬 `webrtc_05-streaming-clients-list`
* 🎬 `webrtc_06-streaming-create-offer`
* 🎬 `webrtc_07-streaming-create-answer`
* 🎬 `webrtc_08-handle-answer`
* 🎬 `webrtc_09-exchange-ice-candidates`

---

### Step 6 — Debugging Data Channels

After setting up the streaming logic, the WebRTC data channels weren't working. I asked AI why the data channel wasn't being created, and it pointed out that **if no data is sent through a data channel, the browser never actually establishes it**.

The fix was to create a dummy initialisation channel on the peer connection before the offer is made:

```javascript
peerConnection.createDataChannel('init');
```

This forces the data channel to be negotiated during the WebRTC handshake, even if no data is immediately sent through it — ensuring the channel exists and is ready when needed.

---

### Step 7 — Transition to SimplePeer Framework

After completing the manual WebRTC implementation, I received feedback to transition to the **[SimplePeer](https://github.com/feross/simple-peer)** library, as referenced in the course docs at [devinekask/creative-code-4-s26].

---

### Step 8 — Fixing the SimplePeer Signal Error

#### The Problem

When the phone (`controller.html`) received a WebRTC signal from the desktop, the following error was thrown in the browser console:

```
Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'signal')
```

The error occurred inside the `socket.on('signal', ...)` handler:

```javascript
socket.on('signal', async (myId, signal, peerId) => {
    peer.signal(signal); // ← peer was undefined
});
```

`peer` was declared with `let peer;` but never assigned a `new SimplePeer(...)` instance before `.signal()` was called on it.

#### The Fix

The peer needs to be created the first time a signal arrives, since the controller (phone) is the **non-initiator** — it waits for the desktop to reach out first.

```javascript
socket.on('signal', async (myId, signal, peerId) => {
    if (!peer) {
        peer = new SimplePeer({ initiator: false });

        peer.on('signal', data => {
            socket.emit('signal', peerId, data);
        });

        peer.on('connect', () => {
            console.log('Peer connection established!');
        });
    }

    peer.signal(signal);
});
```

#### How AI Helped

I used AI (Claude) to diagnose this bug. I pasted the error and my code into the chat, and it identified that `peer` was never initialised before `.signal()` was called on it. It also pointed out that the commented-out `answerPeerOffer` function I had written was actually the right approach — the fix was just to inline that logic directly into the signal handler.

---

### Step 9 — Requesting Device Orientation Permission

To read tilt data from the phone, I needed to request permission to access the device's gyroscope and accelerometer sensors.

I referenced the MDN docs for [`DeviceOrientationEvent.requestPermission()`](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static) which explained that:
- The method is **iOS/Safari only** — Android and desktop don't require it
- It returns a Promise resolving to `"granted"` or `"denied"`
- It requires **transient activation**, meaning it must be called directly from a user gesture like a button click — it cannot be called on page load

With the help of AI I implemented a `requestOrientation()` function that checks if `DeviceOrientationEvent.requestPermission` exists as a function before calling it (to handle the Android/desktop case), and wrapped it in a try/catch. The permission request is triggered by a button click, and only if it resolves to `"granted"` does the app start listening to `deviceorientation` events to read `event.beta` (vertical tilt) and `event.gamma` (horizontal tilt).

---

### Step 10 — Reading Tilt Data with the deviceorientation Event

Once permission was granted, I needed to actually read the tilt values. I referenced the MDN docs for the [`deviceorientation`](https://developer.mozilla.org/en-US/docs/Web/API/Window/deviceorientation_event) event on `window`.

The event fires continuously whenever the device's physical orientation changes, and each event carries three read-only properties:

- `event.beta` — rotation around the **x-axis** (front/back tilt), ranging from -180° to 180°
- `event.gamma` — rotation around the **y-axis** (left/right tilt), ranging from -90° to 90°
- `event.alpha` — rotation around the **z-axis** (compass heading), ranging from 0° to 360°

For my use case I only needed `beta` and `gamma`, so I added a `window.addEventListener("deviceorientation", ...)` inside the `orientationData()` function. Each time the event fires it reads those two values, formats them to one decimal place, and updates the display in real time.

The event does not need to be polled — it pushes updates automatically as the device moves.

---

### Step 11 — Gyroscope

Added gyroscope logic using the `devicemotion` event, mostly by copying the orientation logic and tweaking it. Used the MDN docs as reference:
https://developer.mozilla.org/en-US/docs/Web/API/Gyroscope

The raw rotation rate values (`alpha`, `beta`, `gamma`) are combined into a single `gyroMagnitude` using Euclidean magnitude: `√(α² + β² + γ²)`, then normalised to a 0–100 scale.

---

### Step 12 — Compass

Added compass logic by reading `event.webkitCompassHeading` (iOS) or deriving it from `event.alpha` (Android/absolute mode). The raw heading degree is bucketed into one of 8 cardinal/intercardinal directions: N, NE, E, SE, S, SW, W, NW.

Used the MDN docs as reference:
https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent

---

### Step 13 — Battery

Added battery logic using `navigator.getBattery()`. Battery level (0.0–1.0) is stored as a percentage (0–100) in `sensorState.batteryPercentage` and updated via the `levelchange` event. The listener is registered once inside `requestBattery()` to avoid accumulating duplicate listeners.

---

### Step 14 — Particle Life Simulation

As the visual centrepiece, I built a **Particle Life Simulation** in vanilla JavaScript and HTML5 Canvas. The simulation demonstrates emergent behaviour — complex, lifelike patterns arising from simple attraction and repulsion rules between coloured particle groups.

#### References / Inspiration

- [hunar4321/particle-life](https://github.com/hunar4321/particle-life) — original particle life concept and force function algorithm
- [OfficialCodeNoodles/Particle-Life-Simulation](https://github.com/OfficialCodeNoodles/Particle-Life-Simulation) — Godot implementation used as reference for emergent behaviour patterns

---

#### Sub-step 14.1 — Canvas & Game Loop

**AI generated:**
- Full-screen `<canvas>` setup with `requestAnimationFrame` loop
- FPS tracking system, HUD display, pause/resume overlay
- Placeholder grid visual, controls hint UI, CSS styling with dark theme

**My modifications (🟢 code green):**
- Removed entire `<style>` block, Google Fonts, FPS tracker, pause overlay, placeholder grid
- Converted `function` declarations to arrow functions (`const loop = () =>`)
- Simplified the main loop (removed `now` timestamp parameter)

**Reason:** Stripped the output down to the absolute minimum to understand the core loop without styling noise.

---

#### Sub-step 14.2 — Particle Spawning & Rendering

**AI generated:**
- `colors` object with 4 colour groups, `createParticle()`, `spawnGroups()`, `drawParticles()` using `ctx.arc`
- R key wired to reset and respawn

**My modifications (🟢 code green):**
- Expanded from 4 to **10 colour groups**: added orange, purple, cyan, pink, lime, white
- Reduced particles per group 200 → **80** to keep performance stable
- Renamed constants to lowercase (`colors`, `particleCount`, `particleRadius`)

**Reason:** More colour variety creates richer emergent patterns. Lowering count per group compensates for the higher number of groups.

---

#### Sub-step 14.3 — Core Force Function

**AI generated:**
- `rule(groupA, groupB, g)` — the O(N²) force loop
- `interactionRadius` and `friction` constants
- `matrix` object — 10×10 force values between every colour pair
- `randomizeMatrix()`, nested update loop, toroidal edge wrapping

**My modifications (🟢 code green):**
- Renamed all short variable names to descriptive ones: `fx/fy` → `forceX/forceY`, `dx/dy` → `distanceX/distanceY`, `d` → `distance`, `F` → `force`, `vx/vy` → `velocityX/velocityY`, `W/H` → `width/height`
- Changed `interactionRadius` 80 → **100**, `friction` 0.5 → **0.65**, `particleRadius` 3 → **7**
- Rewrote the force function to use a **two-zone model**: repulsion zone below `r = 0.3`, attraction zone between `0.3` and `1.0` with a triangular peak at the midpoint
- Changed edge behaviour from **wrap** to **bounce** (`velocityX *= -3` on wall hit), then later reverted back to **wrap** after integrating gravity — bounce caused particles to cluster at walls rather than respond to directional gravity

**Reason:** Renaming every variable forced a full understanding of the physics logic. The two-zone force function (repulsion + attraction) is closer to the reference implementations and produces more interesting emergent structures. Wrap-around was reintroduced because it works better with the compass gravity direction feature — particles can flow in a consistent direction indefinitely.

---

### Step 15 — Debugging Frozen Sensor Values

#### The Problem

After the sensor pipeline was working, I noticed that `gyroMagnitude` (and silently, `compassOrientation` and the tilt values) would correctly capture a value on first load but then **never update** — staying frozen at that initial reading for the entire session, even when physically moving the phone.

The symptom was clear: the first WebRTC packet sent to the desktop contained real sensor data, but every packet after that was identical.

#### Diagnosing the Root Cause

Before asking AI, I identified the likely culprit myself: all three sensor functions — `gyroData()`, `orientationData()`, and `compassData()` — used the same pattern:

```javascript
const gyroData = () => {
    return new Promise((resolve) => {
        window.addEventListener('devicemotion', (event) => {
            // ... compute value ...
            resolve({ mappedGyroMagnitude });
        }, { once: true });
    });
};
```

Each call to `gyroData()` inside `setInterval` registers a new `{once: true}` listener, waits for the next `devicemotion` fire, resolves the Promise, then removes itself. My hypothesis was that this was causing a race condition or listener exhaustion.

I wrote a detailed prompt for AI explaining the pattern, my hypothesis, and asking for a precise technical explanation of the failure, the correct architectural fix, and a rewritten version of all three affected functions.

#### The AI Explanation

AI confirmed the hypothesis but clarified the exact failure mode. `devicemotion` fires at ~60Hz on iOS Safari. The `setInterval` fires every 100ms. On iOS, if the browser throttles the event stream (background tab, permission edge case, or the stream being momentarily quiet), the `{once: true}` listener registers but the event never fires. The `await gyroData()` call hangs indefinitely. Since `setInterval` runs on wall-clock time regardless of whether the previous async callback has finished, **unresolved Promises accumulate on every tick** — each holding a registered-but-never-fired listener. The value freezes because the assignment `sensorState.gyroMagnitude = mappedGyroMagnitude` simply never runs again.

A secondary bug was also identified: `batteryData()` called `getBattery()` and registered a new `levelchange` listener on every interval tick, meaning after 100 seconds there were 1,000 dangling listeners.

#### The Fix

The core architectural change: **sensors are push-based, not poll-based**. The correct pattern is a persistent listener that continuously writes to a shared state object, and a separate polling loop that reads from it synchronously.

The persistent listeners are registered once, immediately after permissions are granted, inside `requestGyro()` and `requestOrientation()`:

```javascript
// Inside requestGyro(), after permission is confirmed:
window.addEventListener('devicemotion', (event) => {
    const { alpha, beta, gamma } = event.rotationRate ?? {};
    if (alpha == null) return;
    const raw = Math.sqrt(alpha ** 2 + beta ** 2 + gamma ** 2);
    sensorState.gyroMagnitude = Math.min(Math.round((raw / 500) * 100), 100);
});
```

The `dataCollection()` loop becomes fully synchronous — no `async`, no `await`, just a direct read from `sensorState`:

```javascript
const dataCollection = () => {
    setInterval(() => {
        const sensorData = {
            tiltY:              sensorState.horizontal,
            tiltX:              sensorState.vertical,
            gyroMagnitude:      sensorState.gyroMagnitude,
            bassEnergy:         microphoneData(),
            compassOrientation: sensorState.compassOrientation,
            battery:            sensorState.batteryPercentage,
        };
        if (peer && peer.connected) {
            peer.send(JSON.stringify({ permissions: permissionResults, sensors: sensorData }));
        }
    }, 100);
};
```

The `batteryData()`, `orientationData()`, `gyroData()`, and `compassData()` functions were deleted entirely. Orientation and compass were merged into a single persistent `deviceorientation` listener. Battery initialisation was moved into `requestBattery()`.

#### How AI Helped

I had already identified the pattern as the problem before asking. AI's main contribution was explaining **why** the freeze happens specifically on iOS — the interaction between Promise-based async, `setInterval`'s wall-clock firing, and the browser's event stream throttling. It also caught the battery memory leak, which I hadn't noticed.

#### My Modifications to the AI Output (🟢 code green)

AI's suggested fix kept `gyroData()`, `orientationData()`, and `compassData()` as separate standalone functions. I removed them entirely and instead folded the persistent listener registration directly into the existing `requestGyro()` and `requestOrientation()` permission functions — keeping the structure consistent with the rest of the file and avoiding new top-level functions that would need to be called separately.

---

### Step 16 — Reversed Connection Direction (Phone Initiates)

#### The Problem

The original setup had the **desktop as the SimplePeer initiator** — it would create the peer and emit signals to the phone. This worked on a local network but broke in some cross-device scenarios because the desktop's socket connection fired before the phone had navigated to the controller URL, leaving no peer on the other end to receive the initial offer.

#### The Fix

I reversed the initiation direction: the **phone (controller) is now the initiator**, and the desktop is the responder. The phone connects to the socket and immediately creates a `SimplePeer({ initiator: true })`, emitting its signal to the desktop's socket ID (passed as a URL query parameter `?id=...`). The desktop listens for incoming signals and creates a non-initiator peer on the first signal received.

**My modification (🟢 code green):** This architectural reversal was my own decision after observing the timing issue. I restructured both `index_logic.js` and `controller_logic.js` to swap the initiator/responder roles, and updated the QR code URL to embed the desktop's socket ID so the phone knows exactly which peer to signal.

---

### Step 17 — Sensor Rules Integration

With the data pipeline stable, I wired each sensor to a specific simulation parameter. Each rule is only applied when the corresponding permission is `'granted'` — if a sensor is unavailable or muted by the user, the simulation falls back to its default behaviour.

#### Gyroscope → Speed & Particle Radius

```javascript
if (permissions.Gyro === 'granted') {
    const tiltX = (Math.max(-180, Math.min(180, sensors.tiltX)) + 180) / 360;
    maxSpeed = 3 + (sensors.gyroMagnitude / 50) * 7;
    particleRadius = 2 + Math.pow(tiltX, 3) * 10;
}
```

Shaking the phone increases `gyroMagnitude`, raising `maxSpeed` — particles become frantic. Tilting the phone on the X axis (front/back) warps `particleRadius` via a cubic curve, so only extreme tilts produce very large or very small particles.

**AI involvement:** AI suggested the linear mapping for `maxSpeed`. I replaced the linear tilt mapping for `particleRadius` with `Math.pow(tiltX, 3)` so that small tilts have almost no effect and extreme tilts have a dramatic one.

**My modification (🟢 code green):** The cubic exponent on `tiltX` is my own addition — the AI output used a linear `tiltX * 10` which produced too gradual a change across the full range.

---

#### Microphone → Attraction Matrix Shift

```javascript
if (permissions.Microphone === 'granted') {
    const shift = (sensors.bassEnergy / 100);
    for (let i = 0; i < colorsAmount; i++) {
        for (let j = 0; j < colorsAmount; j++) {
            attractionMatrix[i][j] = Math.max(-1, baseMatrix[i][j] - shift);
        }
    }
}
```

Bass energy (normalised 0–100) shifts every attraction value in the matrix downward. Loud bass pushes all particle pairs toward maximum repulsion — the simulation explodes outward in response to sound. When the microphone is silent or muted, `attractionMatrix` resets to the base random values.

**AI involvement:** AI generated the matrix loop. I added the `Math.max(-1, ...)` clamp so values don't go below the physical minimum, and separated `baseMatrix` from `attractionMatrix` so the shift is always relative to the original random state rather than compounding over time.

**My modification (🟢 code green):** The `baseMatrix` / `attractionMatrix` split. Without it, repeated loud sounds would permanently push the matrix to `-1` across the board and the simulation would lose all variety.

---

#### Battery → Active Colour Groups

```javascript
if (permissions.Battery === 'granted') {
    const newColorsAmount = Math.ceil(sensors.battery / 10);
    // adds or removes particle groups and rebuilds the matrix accordingly
}
```

Battery percentage (1–100) maps to 1–10 active colour groups. A fully charged phone gives the maximum 10 groups and the richest emergent patterns. As battery drains, colour groups are removed and particles of those colours are filtered out of the simulation. The attraction matrix is regenerated each time the count changes.

**AI involvement:** AI generated the branching add/remove logic. I defined the mapping formula (`Math.ceil(battery / 10)`) and chose to rebuild the full matrix on every group count change rather than patching it, which AI had initially suggested. Rebuilding is simpler and avoids stale cross-references between old and new group indices.

---

#### Compass + Tilt → Directional Gravity

```javascript
if (permissions.Orientation === 'granted') {
    const compassMap = {
        'N':  { gx:  0,            gy: -1            },
        'NE': { gx:  1/Math.SQRT2, gy: -1/Math.SQRT2 },
        // ... etc
    };
    const direction = compassMap[sensors.compassOrientation];
    if (direction) {
        const tiltStrength = Math.abs(sensors.tiltY) / 90;
        gravity.x = direction.gx * tiltStrength * 3;
        gravity.y = direction.gy * tiltStrength * 3;
    }
}
```

The compass heading sets the gravity direction (8 cardinal/intercardinal directions). The phone's Y-tilt controls gravity strength — holding the phone flat produces no gravity, tilting it vertically produces maximum pull. Pointing the phone North and tilting it pulls all particles upward on screen.

**AI involvement:** AI generated the `compassMap` lookup table with unit vectors. I added the `tiltStrength` multiplier (`Math.abs(tiltY) / 90`) — AI's original output applied full gravity whenever a direction was detected, regardless of how much the phone was tilted. The tilt-as-strength mapping makes the gravity feel physically intuitive.

**My modification (🟢 code green):** The `tiltStrength` scaling. Without it the gravity snaps on/off with the direction, which feels abrupt. With it, the user can feather the gravitational pull by adjusting their tilt angle.

---

### Step 18 — Shuffle Feature

Added a "Shuffle Attraction Rules" button on the controller that sends a `{ action: 'shuffleMatrix' }` message over the WebRTC data channel. The desktop receives this and calls `makeRandomMatrix()`, immediately regenerating all particle attraction/repulsion rules and creating a fresh emergent universe.

The button has a CSS spinning animation on the icon (`.spinning` class added/removed via `setTimeout`) to give tactile feedback without blocking the UI.

**AI involvement:** None — this was written entirely by me after understanding the data channel send/receive pattern from the earlier steps.

---

### Step 19 — Style Overhaul, Sensor Dashboard & Final Polish

This step covered everything visual and structural: the desktop QR card, the full phone controller dashboard, all CSS architecture, the sensor bar system, the compass, the toggle/permission system, and extracting all JS into separate files. It involved many iterative conversations with AI and several rounds of my own modifications on top.

---

#### Design Direction

The overall aesthetic was established through a conversation with AI about font and colour choices. The goal was something that felt like a **scientific instrument panel** — refined but slightly arcane, matching the "magic wand controlling a microbial world" concept. The result:

- **Cinzel** (classical serif) for all headings, labels, and buttons — gives a ritualistic, slightly mysterious feel
- **Raleway** (light sans-serif) for body text and hints
- **Share Tech Mono** (monospace) for all live sensor readouts, status labels, and compass directions — reinforces the instrument/readout aesthetic
- A dark near-black palette (`#000`, `#0a0c10`, `#0e1016`) with CSS variables for every colour and glow
- Blue accent (`#3a6fd8`) for interactive elements, cyan (`#00ddff`) for tilt/mic readouts, green (`#44ff88`) for battery and connection status

**AI involvement:** AI proposed the Cinzel + Raleway pairing and generated the full CSS variable system.

**My modification (🟢 code green):** I added Share Tech Mono as a third typeface specifically for sensor readout labels and the status indicator. The two-font system AI proposed felt too uniform — sensor values needed to read as machine output, not editorial text.

---

#### Desktop — `index.html` / `index_styling.css`

The desktop has a full-screen canvas as its background (`position: fixed`, z-index 0) with a floating white card centered on top (z-index 10). All styles are in `index_styling.css`; the HTML contains only markup.

**Canvas layout:** The canvas uses `position: fixed; inset: 0` so it fills the viewport exactly and sits behind everything else. The overlay uses a full-screen fixed wrapper (`#qr-overlay`) with flexbox centering.

**QR card:** The white card (`#qr-card`) has a `cardIn` entrance animation — a combined fade, upward translate, and scale — that plays on load. It uses multiple box-shadow layers: a thin white ring, a deep dark drop-shadow, and a soft blue ambient glow.

```css
#qr-card {
    animation: cardIn 0.9s cubic-bezier(0.16, 1, 0.3, 1) both;
    box-shadow:
        0 0 0 1px rgba(255,255,255,0.15),
        0 8px 40px rgba(0,0,0,0.55),
        0 0 80px rgba(100,160,255,0.12);
}

@keyframes cardIn {
    from { opacity: 0; transform: translateY(18px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
}
```

**Shimmer placeholder:** Before the socket connects and the QR code is injected, `#qr-code` is an empty div. A CSS `::empty::before` pseudo-element fills it with an animated shimmer gradient so the card never looks broken.

```css
#qr-code:empty::before {
    content: '';
    display: block;
    width: 220px; height: 220px;
    background: linear-gradient(120deg, #e8edf5 25%, #f4f6fb 50%, #e8edf5 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
}
```

**Two-state card:** The card has two inner states managed by the `is-connected` CSS class on `#qr-card`. The `#state-scan` div is visible by default. When `peer.on('connect')` fires, `is-connected` is added — this hides `#state-scan` and reveals `#state-connected` (pulsing `✦` icon + permission instruction) with a `fadeUp` animation. Both states share the same card shell so there is no layout jump.

```css
#qr-card.is-connected #state-scan    { display: none; }
#qr-card.is-connected #state-connected {
    display: flex;
    animation: fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.connected-icon {
    font-size: 38px;
    color: #3a6fd8;
    animation: pulse 2.4s ease-in-out infinite;
}
```

**Overlay dismissal:** Once real sensor data arrives, `dismissOverlay()` adds `.hide` to `#qr-overlay` (fade + scale-down transition) and removes the element from the DOM after 700 ms so it never blocks the canvas.

```css
#qr-overlay.hide {
    opacity: 0;
    transform: scale(0.97);
    pointer-events: none;
}
```

```javascript
const dismissOverlay = () => {
    if (overlayDismissed) return;
    overlayDismissed = true;
    const overlay = document.getElementById('qr-overlay');
    if (overlay) {
        overlay.classList.add('hide');
        setTimeout(() => overlay.remove(), 700);
    }
};
```

**AI involvement:** AI generated the card layout, `cardIn` animation, shimmer CSS, `.hide` transition, and the pulsing `✦` icon CSS.

**My modification (🟢 code green):** I designed the two-state card system — the `#state-scan` / `#state-connected` HTML structure and the `is-connected` class swap. I also tied dismissal to the first `phoneData` packet rather than to the `connect` event. The peer connects before the user has granted permissions on the phone, so dismissing on `connect` would remove the instruction screen too early. I also structured `peer.on('data')` to branch on `parsed.action` first and return early, so shuffle command packets never overwrite `phoneData` or re-trigger `dismissOverlay()`.

```javascript
peer.on('data', (data) => {
    const parsed = JSON.parse(data);
    if (parsed.action === 'shuffleMatrix') {
        makeRandomMatrix();
        return;
    }
    phoneData = parsed;
    dismissOverlay();
});
```

---

#### Desktop Logic — `index_logic.js`

`makeRandomMatrix`, `colorsAmount`, `baseMatrix`, and `attractionMatrix` are declared at module scope (outside `initParticleLife`) so the `peer.on('data')` handler can reach them without any hoisting workarounds.

**AI involvement:** AI generated the `initSocket` structure and the initial `peer.on('data')` handler.

**My modification (🟢 code green):** Moving the matrix variables to module scope. AI's original structure had everything inside `initParticleLife`, which would have made them unreachable from the data handler. I identified this and moved them out before wiring up the shuffle feature.

---

#### Phone Controller — `controller.html` / `controller_styling.css`

The controller is a full-height dark flex column. It uses the same font system as the desktop but with a completely different character — dense, technical, utilitarian.

**CSS variable system:** The entire colour palette is defined as CSS variables so every surface, border, accent colour, and glow is consistent.

```css
:root {
    --bg:          #000000;
    --surface:     #0a0c10;
    --surface2:    #0e1016;
    --border:      rgba(255,255,255,0.07);
    --accent:      #3a6fd8;
    --accent-glow: rgba(58,111,216,0.35);
    --accent2:     #00ddff;
    --green:       #44ff88;
    --red:         #ff4444;
    --text:        rgba(255,255,255,0.82);
    --text-dim:    rgba(255,255,255,0.30);
}
```

**Permission overlay:** Same card aesthetic as the desktop — white card, `cardIn` animation, blue button — but on a blurred dark backdrop (`backdrop-filter: blur(8px)`). It blocks the UI until permissions resolve, then fades out with `.hide` and is removed from the DOM.

**App shell:** `#app` is a flex column with `gap: 1px` and a near-invisible background colour. The 1px gaps between panels are the background bleeding through — a single CSS trick that creates clean panel dividers without any border elements.

**Header:** Fixed at the top with a blinking green status dot (box-shadow glow + `blink` keyframe) and the "Magic Wand" eyebrow label. Slides in from above on load via `fadeDown`.

**Panel entrance animations:** All panels stagger in with `fadeUp` using `animation-delay` on `:nth-child` selectors — each panel arrives 40 ms after the previous, making the dashboard feel like it assembles itself.

```css
.panel:nth-child(2) { animation-delay: 0.04s; }
.panel:nth-child(3) { animation-delay: 0.08s; }
.panel:nth-child(4) { animation-delay: 0.12s; }
.panel:nth-child(5) { animation-delay: 0.16s; }
.panel:nth-child(6) { animation-delay: 0.20s; }
```

**Permission badges:** Small monospace pills in the panel header. Three visual states set via class after permissions resolve: green `active` (`.badge-granted`), red `denied` or `unavailable` (`.badge-denied`), grey `muted` (`.badge-muted`).

```css
.badge-granted { background: rgba(68,255,136,0.10); color: var(--green); }
.badge-denied  { background: rgba(255,68,68,0.08);  color: var(--red);   }
.badge-muted   { background: rgba(255,255,255,0.04); color: var(--text-dim); }
```

**Toggle pill:** A pure CSS toggle — the pill track is the `<button>` element itself; the thumb is its `::after` pseudo-element. It starts invisible and non-interactive. `.can-toggle` reveals it only for granted permissions. `.no-toggle` hides it completely for denied/unavailable sensors. The thumb uses a spring easing (`cubic-bezier(0.34, 1.56, 0.64, 1)`) that gives a slight overshoot, making it feel physical.

```css
.toggle-btn { opacity: 0; pointer-events: none; }
.toggle-btn.can-toggle { opacity: 1; pointer-events: auto; }
.toggle-btn.no-toggle  { display: none; }

.toggle-btn::after {
    content: ''; position: absolute;
    top: 3px; left: 3px; width: 11px; height: 11px;
    border-radius: 50%;
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.25s;
}
.toggle-btn.is-on::after {
    transform: translateX(15px);
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent-glow);
}
```

**Muted and disabled panel states:** When a panel is muted via toggle, `.panel-muted` drops the `.panel-body` to 28% opacity with `pointer-events: none` — the bars freeze but the header stays fully visible. Permanently unavailable panels get `.panel-disabled` at 45% opacity across the whole panel.

```css
.panel-muted .panel-body { opacity: 0.28; pointer-events: none; }
.panel-disabled          { opacity: 0.45; }
```

**Sensor bars:** Five bars across three panels. Each is a 5px tall track (`.bar-track`) with an absolutely positioned fill (`.bar-fill`). `transition: width 0.09s linear` gives smooth live updates.

Tilt X uses a `center-origin` track with a centre line marker — the fill grows outward from the 50% midpoint in whichever direction the phone tilts, using both `width` and `left` to anchor correctly. Tilt Y uses a plain 0–100% absolute bar because the simulation uses `Math.abs(tiltY)` — the sign is irrelevant so the bar shows only magnitude. Motion, Bass Energy, and Battery are standard left-to-right fills in blue, cyan, and green.

```css
.bar-fill.accent  { background: var(--accent);  box-shadow: 0 0 6px var(--accent-glow); }
.bar-fill.accent2 { background: var(--accent2); box-shadow: 0 0 6px rgba(0,221,255,0.35); }
.bar-fill.mic     { background: var(--accent2); box-shadow: 0 0 6px rgba(0,221,255,0.35); }
.bar-fill.battery { background: var(--green);   box-shadow: 0 0 6px rgba(68,255,136,0.25); }
```

**Compass SVG:** The Direction panel has `flex: 1` — it expands to fill all remaining vertical space. The compass is an inline SVG with `width: min(220px, 72vw)` so it scales on any screen. It has a circular border ring, cardinal tick marks (`<line>`), N/S/E/W and NE/SE/SW/NW text labels at different opacities, a centre dot, and a two-polygon arrow (blue north tip, dim south tip). The arrow group rotates via a `transform` attribute updated in JS with a smooth CSS cubic transition.

```css
#compass-arrow { transition: transform 0.35s cubic-bezier(0.25, 0.8, 0.25, 1); }
```

**Shuffle button:** Full-width button at the bottom with a `⟳` icon that spins 360° on click via the `.spinning` class and a CSS `transform` transition. The class is added and removed with `setTimeout` so it can re-trigger on repeated clicks.

```css
.shuffle-icon { display: inline-block; transition: transform 0.6s ease; }
.shuffle-btn.spinning .shuffle-icon { transform: rotate(360deg); }
```

**AI involvement:** AI generated the full panel/badge/toggle HTML and CSS structure, the compass SVG markup, all sensor bar CSS, the `setBar` / `setTiltBar` / `updateCompass` JS helpers, the `startUILoop` interval, and the initial toggle implementation using a separate `sensorEnabled` boolean object.

**My modifications (🟢 code green):**
- Adding Share Tech Mono as the third typeface for sensor readouts
- Changing Tilt Y to an absolute bar — AI treated both tilt axes identically; I changed Y after understanding that `Math.abs(tiltY)` is what the simulation uses
- Changing `.panel-muted` to use 28% opacity instead of hiding the panel body entirely — AI's version hid it completely; 28% opacity keeps the bars faintly visible so the user can see the sensor is still active but muted
- Removing the `sensorEnabled` boolean object and `effectivePerms` block (see Controller Logic)

---

#### Controller Logic — `controller_logic.js`

AI's original toggle implementation maintained a `sensorEnabled` object and computed an `effectivePerms` block on every `dataCollection` tick:

```javascript
// AI's original approach (removed)
const effectivePerms = {
    Gyro: sensorEnabled.Gyro ? permissionResults.Gyro : 'denied',
    // ...
};
sensorInformation = { permissions: effectivePerms, sensors: sensorData };
```

This created two parallel sources of truth and required a translation step on every 100 ms tick. I replaced it with direct mutation of the single `permissionResults` object. A snapshot (`originalPermissions`) is taken once after requests resolve. The toggle handler then sets `permissionResults[key]` to `'denied'` on mute and restores from `originalPermissions` on re-enable. `dataCollection` sends `permissionResults` directly with no translation.

```javascript
originalPermissions = { ...results };  // snapshot once

toggleEl.addEventListener('click', () => {
    const on = permissionResults[key] === 'denied';
    permissionResults[key] = on ? originalPermissions[key] : 'denied';
    toggleEl.classList.toggle('is-on',  on);
    toggleEl.classList.toggle('is-off', !on);
    badgeEl.textContent = on ? 'active' : 'muted';
    badgeEl.className   = on ? 'permission-badge badge-granted' : 'permission-badge badge-muted';
    panel.classList.toggle('panel-muted', !on);
});
```

The simulation's existing guards (`if (permissions.Gyro === 'granted')`) then respect the mute state automatically on every frame — no changes needed on the desktop side at all.

**AI involvement:** AI generated the `dataCollection` interval, `microphoneData()` FFT function, `requestWakeLock`, and the initial `sensorEnabled`/`effectivePerms` toggle approach.

**My modification (🟢 code green):** Replacing the two-source-of-truth toggle architecture with direct `permissionResults` mutation. The insight was that since the simulation already reads `permissionResults` every frame, the toggle only needs to change that one object — any indirection is unnecessary.

---

#### Separating Logic into Dedicated Files

All JavaScript was extracted from both HTML files into `index_logic.js` and `controller_logic.js`, placed in a `logic/` subfolder inside `public/`. The HTML files now each contain only markup and a single `<script src="...">` tag.

**AI involvement:** None. This was a structural decision I made to keep the HTML readable, Git diffs clean, and the logic independently editable.

---