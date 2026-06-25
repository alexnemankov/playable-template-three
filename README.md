# Word Association Tiles — 3D Playable Ad

An engaging, lightweight, and performance-optimized 3D playable ad for **Word Association Tiles**, built using a custom interaction mechanic designed to captivate mobile gamers in the first few seconds of engagement.

---

## 1. Game Design & Custom Mechanics

Rather than replicating a standard grid or card match, this playable implements a tactile, physics-based **"Magnetized Cluster Sorting"** mechanic.

*   **Interactive Magnetism**: When the player drags a word tile, matching tiles in the same category are pulled toward it by a damped spring force, forming a dynamic physical cluster. A pulsing connection arc links them to indicate semantic associations.
*   **Ambient Introduction Beat**: The bold tutorial instruction text is hidden initially and fades in after a `1.5s` delay, letting the player absorb the premium wooden board layout and ambient bounce-in animations first without immediate demands.
*   **Staggered Entrance Layout**: Instead of spawning all 8 tiles in a messy pile, the tiles drop from above one-by-one (staggered by `100ms` using GSAP `bounce.out`), settling into a clean, slightly randomized layout that preserves at least 40% negative space to make the initial board inviting.
*   **Thematic "Juice" Particles**: In place of generic spark effects, category-specific visual feedback is triggered upon successful snaps:
    *   **ART category**: Triggers 40 larger, slower-falling "paint splatters" in the category's signature red/orange/green color.
    *   **SPORT category**: Triggers 30 smaller, fast-outward "dust kicks" in light gray.
*   **Material Surprise**: Snapping a category triggers a 2D DOM overlay (`#fx-layer`) that draws a hand-drawn SVG checkmark path (animating `stroke-dashoffset` from 100% to 0) directly above the snapped zone's projected 3D coordinates. This breaks the 3D depth illusion with a satisfying flat-graphic surprise.
*   **Orientation Adaptability**: Real-time layout recalculations adapt the camera position, Field of View (FOV), drop zones, and boundary borders seamlessly between **Portrait** and **Landscape** modes, ensuring optimal layout flow for all device aspect ratios.

---

## 2. Tech Stack & Architecture

The playable is built as a lightweight, single-page WebGL application, prioritizing high performance and zero network overhead.

### Engines & Frameworks
*   **Graphics Engine**: **Three.js** (v0.174.0) for WebGL rendering, directional lighting, materials, and 3D rounded geometry.
*   **Animation Engine**: **GSAP** (v3.15.0) for UI tweens, staggered tile bounce-in, elastic squash/stretch effects, snapping animations, and camera shake.
*   **Playable SDK**: **@smoud/playable-sdk** (v1.0.24) to manage playable lifecycle hooks (`init`, `start`, `pause`, `finish`, `install`) and user interaction logging.

### Architecture Approach
*   **Modular Entry Points**:
    *   `src/index.ts`: Manages ad lifecycle events and binds them to the main loop.
    *   `src/Game.ts`: The central core. Contains 3D scene setup, game loops, responsive layout math, spring physics, and circle-circle collision solvers.
    *   `src/SoundManager.ts`: Synthesizes audio programmatically using the browser's **Web Audio API** (`AudioContext`), eliminating the need to load external MP3/WAV audio assets and saving bandwidth.
*   **Zero-Network Asset Optimization**:
    *   **Textures**: Textures (including wood grain table color, normal maps, text decals, inner trays, and icons) are generated dynamically at runtime on HTML5 Canvas elements and converted into `THREE.CanvasTexture` objects.
    *   **Result**: The production bundle compiles into a single, fully-inlined HTML file under **608 KB** (well within strict ad network limits).

---

## 3. Installed Dependencies

### Production Dependencies (Bundled)
*   `three` (`^0.174.0`): WebGL 3D graphics library.
*   `gsap` (`^3.15.0`): Tweening library for custom UI and spring transitions.
*   `@smoud/playable-sdk` (`^1.0.24`): Ad network SDK interface wrapper.

### Development Dependencies (Build & Tooling)
*   `@smoud/playable-scripts` (`^1.1.4`): Custom build script to transpile TypeScript, process styles, inline assets, and compile the game into a single file.
*   `@types/three` (`^0.174.0`): TypeScript typings for Three.js.
*   `prettier` (`^2.7.1`): Code formatting.

---

## 4. Build Tools & Packaging

*   **Bundler**: `@smoud/playable-scripts` is used to package the app.
*   **Build Commands**:
    *   Development Server: `npm run dev`
    *   Single-File Production Bundle: `npm run build`
*   **Ad Network Targets**: The single-file HTML bundle generated in the `dist/` directory is designed to work out-of-the-box on:
    *   **AppLovin**
    *   **Mintegral**
    *   **Google Ads**
    *   **Unity Ads**
    *   **Moloco**
    *   **Facebook**

---

## 5. AI Tools Used During Development

AI tools were integrated to accelerate ideas investigation, code structure design, and implementation efficiency:

*   **Claude**:
    *   *Usage*: Used during the initial ideas investigation and conceptual drafts phase to outline the interaction logic and flow (referencing initial game draft files like `playable_ad_plan_word_association.html`).
*   **Gemini (Custom Gems)**:
    *   *Usage*: Utilized custom-created Gemini Gems specifically configured for Playable Ad creation to assist with:
        *   WebGL rendering configuration and Three.js physics implementation.
        *   Implementing the circle-circle collision solver (with double-pass iteration and velocity filtration).
        *   Writing the dynamic particle systems (ART splatters vs. SPORT dust kicks).
        *   Animating DOM-based SVG checks for the "Material Surprise" snapping feedback.
*   **Project Build Scaffold**:
    *   *Usage*: Utilized the [playable-template-three](https://github.com/smoudjs/playable-template-three) template scaffold as the baseline framework to ensure compliance with strict single-file inlining rules.
