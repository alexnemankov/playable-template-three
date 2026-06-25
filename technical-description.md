# Technical and Design Description: Word Association Tiles (3D Playable Ad)

This document provides a comprehensive analysis of the technical architecture, design aesthetics, user experience (UX/UI), and motion/interaction systems of the **Word Association Tiles** 3D playable ad.

---

## 1. Technical Architecture & Stack

The project is built as a lightweight, high-performance, single-file HTML5 3D playable ad. It uses the following stack:

*   **Graphics Engine**: [Three.js](file:///f:/Front/31-word-ad-test/package.json#L24) (v0.174.0) for WebGL rendering, lighting, shadows, and materials.
*   **Animation Engine**: [GSAP](file:///f:/Front/31-word-ad-test/package.json#L23) (v3.15.0) for UI transitions, collision squash/stretch effects, snapping animations, and fallback triggers.
*   **Playable SDK**: [@smoud/playable-sdk](file:///f:/Front/31-word-ad-test/package.json#L22) for managing ad lifecycle hooks (`init`, `start`, `pause`, `resume`, `volume`, `finish`, `install`).
*   **Build Tooling**: [@smoud/playable-scripts](file:///f:/Front/31-word-ad-test/package.json#L27) to compile TypeScript and bundle all assets (CSS, JS, and procedural code) into a single, inlined HTML output.

### Codebase Entry Points
*   **[index.ts](file:///f:/Front/31-word-ad-test/src/index.ts)**: Initializes the Playable SDK and maps lifecycle events to the main game class.
*   **[Game.ts](file:///f:/Front/31-word-ad-test/src/Game.ts)**: Contains the 3D scene setup, game state, loop updates, rendering pipeline, custom physics, layout constraints, and event listeners.
*   **[SoundManager.ts](file:///f:/Front/31-word-ad-test/src/SoundManager.ts)**: Handles procedural audio synthesis using the Web Audio API.

### Asset Optimization (Zero-Network Overhead)
To comply with strict file-size limitations of ad networks (e.g., AppLovin, Mintegral, Unity Ads), the project uses **procedural asset generation**:
1.  **Textures**: Generated dynamically at runtime on HTML5 `canvas` elements and uploaded as `THREE.CanvasTexture` instances:
    *   `createWoodTexture` for the table surface.
    *   `createTextTexture` for the text on the word tiles.
    *   `createTrayInnerTexture` for drop zones.
    *   `createBadgeTexture` for category icons.
2.  **Audio**: Synthesized programmatically on-the-fly using the browser's Web Audio API (`AudioContext`), eliminating the need for loaded MP3 or WAV audio files.
3.  **Result**: The final production build is a single inlined HTML file under **610 KB** (uncompressed).

---

## 2. Visuals & Design System

The visual theme is a warm, woody tabletop puzzle aesthetic, designed to feel tactile and premium:

*   **Color Palette**:
    *   Table surface: Rich wood tones (`#2d180d` base with `#381e10` and `#311a0d` planks).
    *   Tiles: Creamy ivory bases (`#fceabb`) with category-themed text and accents.
    *   Drop zones: SPORTS (`#1a66c2` rim, `#d95a2b` base) and ART (`#4b9933` rim, `#cc3333` base).
*   **Lighting**:
    *   `AmbientLight`: General flat illumination (`#ffffff`, intensity 1.0).
    *   `DirectionalLight` (Key): Warm primary spotlight (`#fff0dd`, intensity 2.2) casting soft shadows.
    *   `DirectionalLight` (Fill): Counter-balancing warm light (`#ffcba4`, intensity 1.0) to soften dark areas.
*   **Tone Mapping & Fog**: Uses `ACESFilmicToneMapping` (exposure: 1.1) for high dynamic range colors, paired with exponential fog (`THREE.FogExp2`) to blur out the boundaries of the table.
*   **Post-Processing**: Uses `EffectComposer` with a custom `NoiseShader` to project a dynamic, cinema-style film grain over the scene. (Disabled on mobile platforms to preserve fill-rate performance).

---

## 3. UX and UI Flow

The interaction design focuses on satisfying physical feedback and immediate comprehension:

*   **Tutorial Hook**:
    *   A floating, green, pulsating 3D cone pointer sits above the first tile to direct the user's eye immediately upon load.
    *   Any pointer interaction dismisses the hint.
*   **Core Gameplay Loop**:
    1.  The user drags a 3D tile across the board.
    2.  If the dragged tile is moved near other tiles of the **same category**, they are pulled together via a "magnetic" attraction force.
    3.  A glowing connection line (curved Bezier tube) links the magnetized tiles together.
    4.  Dragging the grouped tiles over the matching drop zone and releasing snaps them into place.
*   **Visual & Audio Feedback**:
    *   **Success Snapping**: Custom arpeggio synthesizers play, haptic vibrations trigger on mobile, the drop tray flips from "?" to show the category name, and a 30-particle colorful burst radiates from the tray.
    *   **Invalid Actions**: Dragging a tile to the wrong zone triggers a rapid rotational shake (GSAP), lights the tile red via its point light and emissive map, and fades the red color out.
*   **End Card & CTA**:
    *   Visible upon solving both categories, displaying a clean overlay with a 5-star rating, a "Brilliant!" win message, and a prominent "Play Free Now" install button.
    *   **Idle Fallback**: If no interaction occurs for 30 seconds, the end card is shown automatically with the headline *"Think you can sort faster?"* to capture passive viewers.

---

## 4. Motion & Interaction Engine

The project implements custom mechanics within the requestAnimationFrame loop:

*   **Interaction Raycasting**: Traces screen coordinates to the 3D plane using `THREE.Raycaster`. Dragging operates along a virtual horizontal constraint plane positioned at `y = 1.5` (lifting tiles slightly when held).
*   **Damped Springs (Magnetism)**: Magnetism calculates distance between matching categories. If `distance < 4.5`, an attraction force vector pulls the tiles toward the dragged tile's relative cluster offsets. Damping is applied at `velocity * 0.85`.
*   **Circle-Circle Collision Physics**:
    *   Tiles repel each other on the XZ plane to prevent overlapping.
    *   Momentum transfers from the dragged tile to any collided tile.
    *   On collision, a wood-tap sound synthesizes, a mobile haptic vibration fires, and GSAP scale squashes the tiles (`x: 1.15, y: 0.72, z: 1.15`) for tactile elasticity.
*   **Dynamic Connection Lines**: Formed using `THREE.TubeGeometry` mapped along a `THREE.QuadraticBezierCurve3` using the mid-point between tiles as the curve's control point, with line opacity fading out over distance.
*   **Camera Parallax**: Mouse movements translate into smooth camera shifts, adding depth and parallax to the 3D space.

---

## 5. Performance & Visual Analysis

Below is an analysis of performance bottlenecks and visual enhancements:

### Performance Critical Analysis

1.  **`TubeGeometry` Allocation Bottleneck (High Severity)**:
    *   *Issue*: Inside `animate()`, the connection lines are constantly disposed and re-instantiated:
        ```typescript
        this.lines[lineIdx].geometry.dispose();
        this.lines[lineIdx].geometry = new THREE.TubeGeometry(curve, 20, 0.04, 6, false);
        ```
    *   *Impact*: Allocating geometry buffers inside the render loop causes constant CPU-to-GPU memory uploads and forces the JavaScript garbage collector to run frequently. This causes micro-stutters, particularly on mid-range Android devices.
2.  **Redundant Shadow Map Updates (Medium Severity)**:
    *   *Issue*: The shadows are enabled on desktop, but because the table and trays are static, the depth buffers are recalculated every frame.
    *   *Impact*: Wastes GPU cycles.
3.  **Procedural Texture Redundancy (Low Severity)**:
    *   *Issue*: Creating canvas textures on initialization is clean, but drawing multiple canvas instances with identical parameters can be consolidated.

### Visual Critical Analysis

1.  **Flat Procedural Materials**:
    *   The table and tiles use basic color mapping. While physical clearcoats are set, the lack of normal/bump maps makes the wood grain and tile surfaces look synthetic and flat.
2.  **Text Sharpness**:
    *   Using a `256x256` Canvas texture for word labels can look pixelated or blurry when viewed at lower camera angles or on high-density displays (Retina/SuperAMOLED).
3.  **Abstract Tutorial Hint**:
    *   The cone floating over the tile is ambiguous. It indicates *attention* but does not clearly communicate the *drag* mechanic.

---

## 6. Actionable Suggestions to Improve

### Performance Improvements
*   **Replace Tube Geometry with Instanced meshes or Pre-allocated cylinders**:
    *   Create a single cylinder geometry once. In the render loop, position, rotate, and scale it to stretch between the two matching tiles. This requires **zero garbage collection** or buffer re-allocation.
*   **Bake Shadows into a Lightmap**:
    *   Since the table and trays are stationary, bake the soft shadows of the trays and a soft ambient occlusion map directly into the table texture.
    *   This allows you to disable real-time shadow mapping entirely (`renderer.shadowMap.enabled = false`), saving rendering time on both desktop and mobile, while displaying highly realistic soft shadows.
*   **Throttle Collision Checks**:
    *   Limit collision logic checks (`O(n^2)` search) or only run them for tiles that have velocities higher than a threshold.

### Visual & UX Improvements
*   **Add Normal Maps**:
    *   In the table wood texture generator, create a normal map representing the grain ridges. Apply it to `tableMat.normalMap`. This will make directional light glisten off the wood plank gaps, creating a premium feel.
    *   Add a subtle bevel or normal map to the tiles to catch corner highlights.
*   **Upgrade to a Hand Gesture Tutorial**:
    *   Replace the green cone pointer with a 3D or 2D hand icon that performs a drag animation from the first tile to its destination tray, fading out once the user touches the screen.
*   **Add Energy Flow along Connection Lines**:
    *   Instead of solid cyan lines, map a scrolling texture coordinates offset over the connection tubes to make energy "flow" between connected tiles, reinforcing the magnetism theme.
*   **Enhance Snapping Physics**:
    *   When the group snaps, apply a minor camera shake (GSAP shake on camera coordinates) to convey weight and visual impact.
