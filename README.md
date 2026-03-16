# Development Process

---

### Step 1 — Project Setup

I initialised the project repository on GitHub and set up the basic folder structure. From there I copied the code to get a local dev server running with `npm install` / `npm start` from the demo's.

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

#### Pivot to Conway's Game of Life

After reflection I moved toward something more algorithmically interesting: **Conway's Game of Life with sensor-driven rule mutation**. Rather than drawing freely, the user's physical presence and environment continuously reshape the underlying simulation rules — making the automaton feel alive and personal.

---

### Step 4 — Sensor Architecture

The final project maps **7 sensor variables** to Game of Life parameters:

| Sensor | Variable | Why |
|---|---|---|
| Accelerometer | `tiltX / tiltY` | Smooth and continuous — maps intuitively to 2D space |
| Gyroscope | `gyroMagnitude` | Single number for total rotational energy |
| Microphone | `bassEnergy` | Reacts to voice, music, clapping — expressive input |
| Camera | `dominantColor` | Provides live R/G/B values from the environment | *using if extra time* |
| Screen / Touch | `touchVelocity` | Captures gesture speed and intensity | *not using anymore* |
| Magnetometer | `compassHeading` | 0–360° rotation, slow and smooth |
| Battery | `batteryLevel` | 0.0–1.0, slow-changing — acts as a global mood modifier |

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

```html
peerConnection.createDataChannel('init');
```

This forces the data channel to be negotiated during the WebRTC handshake, even if no data is immediately sent through it — ensuring the channel exists and is ready when needed.

---

### Step 7 — Transition to SimplePeer Framework

After completing the manual WebRTC implementation, I received feedback to transition to the **[SimplePeer](https://github.com/feross/simple-peer)** library, as referenced in the course docs at [devinekask/creative-code-4-s26]

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

        peer.on('error', err => {
            console.error('Peer error:', err);
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

For my use case I only needed `beta` and `gamma`, so I added a `window.addEventListener("deviceorientation", ...)` inside the `orientationData()` function. Each time the event fires it reads those two values, formats them to one decimal place, and updates the text content of the `#tilt-display` h2 element on the page in real time.

The event does not need to be polled — it pushes updates automatically as the device moves, so the display stays live with no extra logic needed.

---

### Step 11 — Gyroscope

Added gyroscope logic, mostly by copying the accelerometer logic and tweaking it. Used the MDN docs as reference:
https://developer.mozilla.org/en-US/docs/Web/API/Gyroscope

---

### Step 12 — Compass

Added compass logic, mostly by copying the orientationData logic and tweaking it. Used the MDN docs as reference:
https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent

---

### Step 13 — Battery

Added battery logic.

---

### Step 14 — Particle Life Simulation (Canvas Feature)

As an additional visual component, I built a **Particle Life Simulation** in vanilla JavaScript and HTML5 Canvas. The simulation demonstrates emergent behaviour — complex, lifelike patterns arising from simple attraction and repulsion rules between coloured particle groups.

This was built step-by-step with the assistance of **Claude (Anthropic)** over a single session, with each AI-generated step reviewed, modified, and extended manually before moving on.

#### References / Inspiration

- [hunar4321/particle-life](https://github.com/hunar4321/particle-life) — original particle life concept and force function algorithm
- [OfficialCodeNoodles/Particle-Life-Simulation](https://github.com/OfficialCodeNoodles/Particle-Life-Simulation) — Godot implementation used as reference for emergent behaviour patterns

---

#### Sub-step 14.1 — Canvas & Game Loop

**AI generated:**
- Full-screen `<canvas>` setup with `requestAnimationFrame` loop
- FPS tracking system, HUD display, pause/resume overlay
- Placeholder grid visual, controls hint UI, CSS styling with dark theme

**My modifications:**
- Removed entire `<style>` block, Google Fonts, FPS tracker, pause overlay, placeholder grid
- Converted `function` declarations to arrow functions (`const loop = () =>`)
- Simplified the main loop (removed `now` timestamp parameter)

**Reason:** Stripped the output down to the absolute minimum to understand the core loop without styling noise.

---

#### Sub-step 14.2 — Particle Spawning & Rendering

**AI generated:**
- `colors` object with 4 colour groups, `createParticle()`, `spawnGroups()`, `drawParticles()` using `ctx.arc`
- R key wired to reset and respawn

**My modifications:**
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
- `randomizeMatrix()`, nested update loop, toroidal edge wrapping, M key

**My modifications:**
- Renamed all short variable names to descriptive ones: `fx/fy` → `forceX/forceY`, `dx/dy` → `distanceX/distanceY`, `d` → `distance`, `F` → `force`, `vx/vy` → `velocityX/velocityY`, `W/H` → `width/height`
- Changed `interactionRadius` 80 → **100**, `friction` 0.5 → **0.65**, `particleRadius` 3 → **7**
- Changed edge behaviour from **wrap** to **bounce** (`velocityX *= -3` on wall hit)
- Changed `randomForce()` to bias toward repulsion: `(Math.random() * 2 - 1) - 0.3`

**Reason:** Renaming every variable forced a full understanding of the physics logic. Bounce over wrap was a deliberate design choice — particles feel more contained and energetic. The repulsion bias produces more open, spread-out formations rather than dense blobs.

---

#### Critical Reflection on AI Use (Particle Life)

**What AI did well:** Claude was effective at generating boilerplate and scaffolding quickly and correctly. The step-by-step structure meant each piece could be understood before moving to the next. The force function explanation (why `g / distance` produces the right behaviour, how friction works as a multiplier) helped me understand the physics rather than just copy it.

**Where I thought independently:**
- **Renaming variables** — going through every variable name forced me to understand what each one actually does
- **Bounce vs wrap** — a deliberate design choice requiring understanding of the velocity system
- **Repulsion zone** — my own addition after noticing particles collapsing into single points
- **Repulsion bias** in `randomForce()` — shifting the distribution so random universes tend toward repulsion, producing more open formations
