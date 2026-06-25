# Technical and Design Description: Word Association Tiles (3D Playable Ad)

This document provides a comprehensive analysis of the technical architecture, design aesthetics, user experience (UX/UI), and motion/interaction systems of the **Word Association Tiles** 3D playable ad.

---

## 1. Technical Architecture & Stack

The project is built as a lightweight, high-performance, single-file HTML5 3D playable ad. It uses the following stack:

*   **Graphics Engine**: [Three.js](file:///f:/Front/31-word-ad-test/package.json#L24) (v0.174.0) for WebGL rendering, lighting, materials, and geometries like `RoundedBoxGeometry`.
*   **Animation Engine**: [GSAP](file:///f:/Front/31-word-ad-test/package.json#L23) (v3.15.0) for UI transitions, collision squash/stretch effects, snapping animations, camera shakes, and hand gestures.
*   **Playable SDK**: [@smoud/playable-sdk](file:///f:/Front/31-word-ad-test/package.json#L22) for managing ad lifecycle hooks (`init`, `start`, `pause`, `resume`, `volume`, `finish`, `install`).
*   **Build Tooling**: [@smoud/playable-scripts](file:///f:/Front/31-word-ad-test/package.json#L27) to compile TypeScript and bundle all assets (CSS, HTML, JS) into a single, inlined HTML output.

### Codebase Entry Points
*   **[index.ts](file:///f:/Front/31-word-ad-test/src/index.ts)**: Initializes the Playable SDK and maps lifecycle events to the main game class.
*   **[Game.ts](file:///f:/Front/31-word-ad-test/src/Game.ts)**: Contains the 3D scene setup, game state, loop updates, rendering pipeline, custom physics, layout constraints, and event listeners.
*   **[SoundManager.ts](file:///f:/Front/31-word-ad-test/src/SoundManager.ts)**: Handles procedural audio synthesis using the Web Audio API.

### Asset Optimization (Zero-Network Overhead)
To comply with strict file-size limitations of ad networks (e.g., AppLovin, Mintegral, Unity Ads), the project uses **procedural asset generation**:
1.  **Textures**: Generated dynamically at runtime on HTML5 `canvas` elements and uploaded as `THREE.CanvasTexture` instances:
    *   `createWoodTexture` for the table surface color.
    *   `createWoodNormalTexture` for table plank grain normal mapping.
    *   `createShadowTexture` for soft shadows.
    *   `createTextTexture` for the text on the word tiles (HD `512x512` resolution).
    *   `createTrayInnerTexture` for drop zones.
    *   `createBadgeTexture` for category icons.
2.  **Audio**: Synthesized programmatically on-the-fly using the browser's Web Audio API (`AudioContext`), eliminating the need for loaded MP3 or WAV audio files.
3.  **Result**: The final production build is a single inlined HTML file under **608 KB** (uncompressed).

---

## 2. Visuals & Design System

The visual theme is a warm, organic wooden tabletop puzzle aesthetic, designed to feel tactile and premium:

*   **Color Palette**:
    *   Table surface: Rich wood tones (`#2d180d` base with `#381e10` and `#311a0d` planks).
    *   Tiles: Creamy ivory bases (`#fceabb`) with category-themed text and accents.
    *   Drop zones: SPORTS (`#1a66c2` rim, `#d95a2b` base) and ART (`#4b9933` rim, `#cc3333` base).
*   **Normal Mapping**:
    *   Uses a procedurally generated height-to-normal canvas texture. The directional key light glistens off the plank grooves and vertical wood grains, enhancing depth.
*   **Lighting & Render Passes**:
    *   `AmbientLight`: General flat illumination (`#ffffff`, intensity 1.0).
    *   `DirectionalLight` (Key): Warm spotlight (`#fff0dd`, intensity 2.2). Real-time WebGL shadow maps are disabled globally (`renderer.shadowMap.enabled = false`) to optimize CPU/GPU processing.
    *   `DirectionalLight` (Fill): Warm light (`#ffcba4`, intensity 1.0) to soften dark areas.
    *   Tone Mapping: ACES Filmic mapping (exposure: 1.1) paired with exponential fog (`THREE.FogExp2`).
    *   Post-Processing: Custom `NoiseShader` pass for a cinematic film grain overlay (disabled on mobile).

---

## 3. UX and UI Flow

The interaction design focuses on satisfying physical feedback and immediate comprehension:

*   **Gesture Hand Tutorial overlay**:
    *   Uses a vector hand SVG overlay element (`#tutorial-hand`) positioned in 2D space.
    *   On load, it projects 3D coords of the first Sport tile and its target tray, performing a looping drag gesture animated via GSAP.
    *   The loop clears its timeout tracker `tutorialTimeoutId` and terminates active timelines on updates to prevent flickering during window resizes.
    *   Any pointer interaction immediately kills the timeline, fades the hand, and halts further cycles.
*   **Core Gameplay Loop**:
    1.  The user drags a 3D tile. The `ctaVisible` flag blocks any drag interactions when the CTA overlay is displayed.
    2.  If the dragged tile is moved near matching category tiles, they get pulled together via a "magnetic" spring force.
    3.  Glowing pulsing connection lines (groups of pre-allocated spheres sampled along a Bezier path) link them.
    4.  Dragging the grouped tiles over the matching drop zone and releasing snaps them.
*   **Visual & Audio Feedback**:
    *   **Success Snapping**: Custom arpeggio synthesizers play, haptics trigger on mobile, the drop tray flips from "?" to show the category name, a 30-particle colorful burst radiates, and a camera offset shake triggers for impact.
    *   **Invalid Actions**: Dragging a tile to the wrong zone triggers a rapid rotational shake (GSAP), lights the tile red, and fades the red color out.
*   **End Card & CTA**:
    *   Visible upon solving both categories, displaying a clean overlay with a 5-star rating, a "Brilliant!" win message, and a prominent "Play Free Now" install button.
    *   **Idle Fallback**: If no interaction occurs for 30 seconds, the end card is shown automatically with the headline *"Think you can sort faster?"* to capture passive viewers.

---

## 4. Motion & Interaction Engine

The project implements custom mechanics within the requestAnimationFrame loop:

*   **Interaction Raycasting**: Traces screen coordinates to the 3D plane using `THREE.Raycaster`. Dragging operates along a virtual horizontal constraint plane positioned at `y = 1.5` (lifting tiles slightly when held).
*   **Procedural Soft Shadows**:
    *   Trays feature a static, blurred soft shadow plane (`THREE.NormalBlending`).
    *   Tiles feature a dynamic shadow plane. During drags, as the tile position lifts, the shadow mesh automatically shifts, scales larger, and fades its opacity in [animate](file:///f:/Front/31-word-ad-test/src/Game.ts#L1006).
*   **Damped Springs (Magnetism)**: Magnetism calculates distance between matching categories. If `distance < 4.5`, an attraction force vector pulls the tiles toward the dragged tile's relative cluster offsets. Damping is applied at `velocity * 0.85`.
*   **Circle-Circle Collision Physics**:
    *   Tiles repel each other on the XZ plane to prevent overlapping.
    *   To prevent infinite high-frequency collision jitter and bouncing sound loops, self-collisions between matching category tiles are bypassed once they are magnetized or dragged.
    *   On valid collisions, a wood-tap sound synthesizes, a mobile haptic vibration fires, and GSAP scale squashes the tiles (`x: 1.15, y: 0.72, z: 1.15`) for tactile elasticity.
*   **Dynamic Connection Lines**:
    *   Formed using 8 pre-allocated spheres placed along a `THREE.QuadraticBezierCurve3`. It samples points at runtime, scaling them dynamically with a sine wave over time to create a pulsing energy flow without GC allocations.
*   **Camera Parallax & Offset Shake**:
    *   Parallax: Mouse movements translate into smooth camera shifts.
    *   Offset Shake: Snap success triggers a quick, decaying shake tween on the `cameraOffset` vector, which is added to the parallax position.
*   **Responsive Layout**:
    *   The `resize` listener dynamically adjusts camera position, FOV, bounding borders, and drop tray alignments depending on the aspect ratio (Landscape vs. Portrait), and refreshes the hand tutorial's coordinates.
