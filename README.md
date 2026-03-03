## Development Process

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
| Camera | `dominantColor` | Provides live R/G/B values from the environment |
| Screen / Touch | `touchVelocity` | Captures gesture speed and intensity |
| Magnetometer | `compassHeading` | 0–360° rotation, slow and smooth |
| Battery | `batteryLevel` | 0.0–1.0, slow-changing — acts as a global mood modifier |

---

