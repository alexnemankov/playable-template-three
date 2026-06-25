import { sdk } from '@smoud/playable-sdk';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { gsap } from 'gsap';

interface Category {
  id: string;
  rimColor: string;
  baseColor: string;
  textColor: string;
  icon: string;
  words: string[];
}

export class Game {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private noisePass: ShaderPass;
  private ambientLight: THREE.AmbientLight;
  private keyLight: THREE.DirectionalLight;
  private warmFill: THREE.DirectionalLight;
  
  private table: THREE.Mesh;
  private tableMat: THREE.MeshPhysicalMaterial;
  private dragPlane: THREE.Mesh;
  private magRing: THREE.Mesh;
  
  private tiles: THREE.Mesh[] = [];
  private dropZones: THREE.Group[] = [];
  private lines: THREE.Mesh[] = [];
  private particleSystems: Array<{
    mesh: THREE.Points;
    vels: THREE.Vector3[];
    life: number;
  }> = [];
  
  private clock: THREE.Clock;
  public isPaused: boolean = false;
  
  private isLandscape: boolean = false;
  private draggedTile: THREE.Mesh | null = null;
  private dragOffset: THREE.Vector3 = new THREE.Vector3();
  private completedGroups: number = 0;
  private gameCompleted: boolean = false;
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private mouse: THREE.Vector2 = new THREE.Vector2();

  private CATEGORIES: Record<string, Category> = {
    SPORTS: { id: 'SPORT', rimColor: '#1a66c2', baseColor: '#d95a2b', textColor: '#a33a1b', icon: '🏈', words: ['BALL', 'GYM', 'TEAM', 'GOAL'] },
    ART:    { id: 'ART', rimColor: '#4b9933', baseColor: '#cc3333', textColor: '#5a1515', icon: '🎨', words: ['BRUSH', 'PAINT', 'DRAW', 'CANVAS'] }
  };

  constructor(width: number, height: number) {
    // ==========================================
    // 1. CORE SETUP
    // ==========================================
    const container = document.getElementById('webgl-container');
    if (!container) {
      throw new Error('WebGL container element not found!');
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2d1a0f');
    this.scene.fog = new THREE.FogExp2('#2d1a0f', 0.03);

    this.camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    this.camera.position.set(0, 14, 12);
    this.camera.lookAt(0, 0, 2);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();

    // ==========================================
    // 2. POST-PROCESSING
    // ==========================================
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const NoiseShader = {
      name: 'NoiseShader',
      uniforms: {
        'tDiffuse': { value: null as THREE.Texture | null },
        'amount': { value: 0.035 },
        'time': { value: 0.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float amount;
        uniform float time;
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        float random(vec2 p) {
          return fract(cos(dot(p, vec2(23.14069, 2.66514))) * 12345.6789);
        }
        void main() {
          vec4 color = texture2D(tDiffuse, vUv);
          vec2 uvRandom = vUv;
          uvRandom.y *= random(vec2(uvRandom.y, time));
          color.rgb += random(uvRandom) * amount;
          gl_FragColor = color;
        }
      `
    };
    this.noisePass = new ShaderPass(NoiseShader);
    this.composer.addPass(this.noisePass);

    // ==========================================
    // 3. LIGHTING
    // ==========================================
    this.ambientLight = new THREE.AmbientLight('#ffffff', 1.0);
    this.scene.add(this.ambientLight);

    this.keyLight = new THREE.DirectionalLight('#fff0dd', 2.2);
    this.keyLight.position.set(5, 15, 2);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.width = 1024;
    this.keyLight.shadow.mapSize.height = 1024;
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 30;
    this.keyLight.shadow.camera.left = -10;
    this.keyLight.shadow.camera.right = 10;
    this.keyLight.shadow.camera.top = 10;
    this.keyLight.shadow.camera.bottom = -10;
    this.keyLight.shadow.bias = -0.001;
    this.scene.add(this.keyLight);

    this.warmFill = new THREE.DirectionalLight('#ffcba4', 1.0);
    this.warmFill.position.set(-5, 10, -5);
    this.scene.add(this.warmFill);

    // ==========================================
    // 4. MATERIALS & PROCEDURAL TEXTURES
    // ==========================================
    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.tableMat = new THREE.MeshPhysicalMaterial({
      map: this.createWoodTexture(maxAnisotropy),
      roughness: 0.8,
      clearcoat: 0.1
    });

    // ==========================================
    // 5. SCENE ASSEMBLY (Table, Zones, Tiles)
    // ==========================================
    const tableGeo = new THREE.PlaneGeometry(50, 50);
    this.table = new THREE.Mesh(tableGeo, this.tableMat);
    this.table.rotation.x = -Math.PI / 2;
    this.table.receiveShadow = true;
    this.scene.add(this.table);

    // Build drop zones
    for (const key in this.CATEGORIES) {
      const cat = this.CATEGORIES[key];
      const trayGroup = new THREE.Group();

      const rimMat = new THREE.MeshPhysicalMaterial({ color: cat.rimColor, roughness: 0.4, clearcoat: 0.8 });
      const rim = new THREE.Mesh(new RoundedBoxGeometry(3.6, 0.4, 3.6, 6, 0.3), rimMat);
      rim.receiveShadow = true;
      rim.castShadow = true;
      trayGroup.add(rim);

      const innerGeo = new RoundedBoxGeometry(3.2, 0.42, 3.2, 6, 0.1);
      const hiddenTex = this.createTrayInnerTexture(false, '', maxAnisotropy);
      const revealedTex = this.createTrayInnerTexture(true, cat.id, maxAnisotropy);
      const innerMat = new THREE.MeshPhysicalMaterial({ map: hiddenTex, roughness: 0.8 });
      const inner = new THREE.Mesh(innerGeo, innerMat);
      inner.position.y = 0.02;
      inner.receiveShadow = true;
      trayGroup.add(inner);

      const badgeGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.25, 32);
      const badgeMat = new THREE.MeshPhysicalMaterial({
        map: this.createBadgeTexture(cat.icon, cat.rimColor, cat.id, maxAnisotropy),
        roughness: 0.2,
        clearcoat: 1.0
      });
      const badge = new THREE.Mesh(badgeGeo, badgeMat);
      badge.position.set(0, 0.25, -1.8);
      badge.castShadow = true;
      trayGroup.add(badge);

      trayGroup.userData = {
        isZone: true,
        category: cat.id,
        innerMesh: inner,
        revealedTex: revealedTex
      };
      this.scene.add(trayGroup);
      this.dropZones.push(trayGroup);
    }

    // Create floating tiles
    const allWords: Array<{ w: string; c: string }> = [];
    allWords.push(...this.CATEGORIES.SPORTS.words.map(w => ({ w, c: 'SPORTS' })));
    allWords.push(...this.CATEGORIES.ART.words.map(w => ({ w, c: 'ART' })));
    allWords.sort(() => Math.random() - 0.5);

    const clusterOffsets = [
      new THREE.Vector3(-0.85, 0, -0.85),
      new THREE.Vector3(0.85, 0, -0.85),
      new THREE.Vector3(-0.85, 0, 0.85),
      new THREE.Vector3(0.85, 0, 0.85)
    ];
    const catCounters: Record<string, number> = { 'SPORTS': 0, 'ART': 0 };
    const tileGeo = new RoundedBoxGeometry(1.6, 0.6, 1.6, 6, 0.15);

    allWords.forEach((item) => {
      const cat = this.CATEGORIES[item.c];
      const topMat = new THREE.MeshPhysicalMaterial({
        map: this.createTextTexture(item.w, cat.textColor, maxAnisotropy),
        roughness: 0.4,
        clearcoat: 0.5,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 0.0
      });
      const baseMat = new THREE.MeshPhysicalMaterial({
        color: cat.baseColor,
        roughness: 0.3,
        clearcoat: 0.8
      });

      const tileMats = [baseMat, baseMat, topMat, baseMat, baseMat, baseMat];
      const tile = new THREE.Mesh(tileGeo, tileMats);
      tile.castShadow = true;
      tile.receiveShadow = true;

      const startX = (Math.random() - 0.5) * 5;
      const startZ = (Math.random() - 0.5) * 3 - 1.5;
      const startY = 1.0 + Math.random() * 0.5;
      tile.position.set(startX, startY, startZ);
      tile.rotation.y = (Math.random() - 0.5) * 0.5;

      const hintLight = new THREE.PointLight(cat.baseColor, 0, 3);
      hintLight.position.set(0, 0.5, 0);
      tile.add(hintLight);

      tile.userData = {
        category: cat.id,
        isSnapped: false,
        isDragging: false,
        isMagnetized: false,
        baseY: startY,
        randomOff: Math.random() * Math.PI * 2,
        clusterOffset: clusterOffsets[catCounters[item.c]++],
        floatTarget: tile.position.clone(),
        hintLight: hintLight,
        topMat: topMat
      };
      this.scene.add(tile);
      this.tiles.push(tile);
    });

    this.dragPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.dragPlane.rotation.x = -Math.PI / 2;
    this.dragPlane.position.y = 1.5;
    this.scene.add(this.dragPlane);

    // Magnetic Ring
    const ringGeo = new THREE.RingGeometry(4.3, 4.5, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x8fb866, transparent: true, opacity: 0, side: THREE.DoubleSide });
    this.magRing = new THREE.Mesh(ringGeo, ringMat);
    this.magRing.rotation.x = -Math.PI / 2;
    this.scene.add(this.magRing);

    // Connection lines (TubeGeometry)
    for (let i = 0; i < 4; i++) {
      const lineGeo = new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(), new THREE.Vector3(0, 1, 0)), 20, 0.05, 6, false);
      const lineMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0 });
      const line = new THREE.Mesh(lineGeo, lineMat);
      this.scene.add(line);
      this.lines.push(line);
    }

    // Hide loader DOM element
    const loaderEl = document.getElementById('loader');
    if (loaderEl) {
      loaderEl.style.opacity = '0';
      setTimeout(() => loaderEl.remove(), 500);
    }

    // Wire DOM events
    const closeBtn = document.getElementById('close-btn-cta');
    const ctaBtn = document.getElementById('cta-button-cta');

    if (closeBtn) closeBtn.onclick = () => this.handleCTA();
    if (ctaBtn) ctaBtn.onclick = () => this.handleCTA();

    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);

    // 30-second idle fallback CTA
    setTimeout(() => {
      if (!this.gameCompleted) {
        const winTitle = document.querySelector('.win-title') as HTMLElement;
        if (winTitle) winTitle.innerText = 'Think you can sort faster?';
        const endCard = document.getElementById('end-card');
        if (endCard) endCard.classList.add('visible');
      }
    }, 30000);

    // Initial Layout Recalc
    this.resize(width, height);

    // Start render loop
    this.animate();

    // Start playable SDK
    sdk.start();
  }

  // ==========================================
  // PROCEDURAL TEXTURE GENERATION
  // ==========================================
  private createWoodTexture(maxAnisotropy: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#2d180d';
    ctx.fillRect(0, 0, 1024, 1024);

    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#381e10' : '#311a0d';
      ctx.fillRect(0, i * 128, 1024, 126);
      ctx.lineWidth = 1.5;
      for (let j = 0; j < 150; j++) {
        ctx.beginPath();
        const y = i * 128 + Math.random() * 126;
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(300, y + (Math.random() - 0.5) * 15, 700, y + (Math.random() - 0.5) * 15, 1024, y);
        ctx.strokeStyle = '#221005';
        ctx.globalAlpha = Math.random() * 0.2;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1.0;
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    tex.anisotropy = maxAnisotropy;
    return tex;
  }

  private createTextTexture(text: string, textColor: string, maxAnisotropy: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Creamy tile top matching target art
    ctx.fillStyle = '#fceabb';
    ctx.fillRect(0, 0, 256, 256);

    // Inner bevel highlight
    ctx.strokeStyle = '#e6c891';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, 244, 244);

    ctx.font = 'bold 50px sans-serif';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 128);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = maxAnisotropy;
    return tex;
  }

  private createTrayInnerTexture(isRevealed: boolean, text: string, maxAnisotropy: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#221f1c'; // Dark recessed tray center
    ctx.fillRect(0, 0, 512, 512);

    ctx.font = 'bold 140px sans-serif';
    ctx.fillStyle = isRevealed ? '#ffffff' : '#dcb98a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isRevealed ? text : '?', 256, 256);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = maxAnisotropy;
    return tex;
  }

  private createBadgeTexture(icon: string, color: string, text: string, maxAnisotropy: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(128, 128, 120, 0, Math.PI * 2);
    ctx.fill();

    // Inner gradient bulb effect
    const grad = ctx.createRadialGradient(128, 80, 20, 128, 128, 120);
    grad.addColorStop(0, 'rgba(255,255,255,0.4)');
    grad.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.font = '80px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, 128, 100);

    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 128, 180);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = maxAnisotropy;
    return tex;
  }

  // ==========================================
  // INPUT INTERACTION HANDLERS
  // ==========================================
  private getIntersects(event: PointerEvent, objects: THREE.Object3D[]): THREE.Intersection[] {
    const clientX = event.clientX !== undefined ? event.clientX : ((event as any).touches?.[0]?.clientX || 0);
    const clientY = event.clientY !== undefined ? event.clientY : ((event as any).touches?.[0]?.clientY || 0);
    this.mouse.x = (clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    return this.raycaster.intersectObjects(objects, true);
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.completedGroups >= 2) return;
    const intersects = this.getIntersects(e, this.tiles);
    if (intersects.length > 0) {
      let obj: THREE.Object3D | null = intersects[0].object;
      // Resolve up to root Mesh
      while (obj && obj.parent && obj.parent !== this.scene) {
        obj = obj.parent;
      }

      if (obj instanceof THREE.Mesh && !obj.userData.isSnapped) {
        this.draggedTile = obj;
        this.draggedTile.userData.isDragging = true;

        const planeIntersects = this.getIntersects(e, [this.dragPlane]);
        if (planeIntersects.length > 0) {
          this.dragOffset.copy(this.draggedTile.position).sub(planeIntersects[0].point);
        }

        gsap.to(this.draggedTile.rotation, { x: -0.2, z: 0.1, duration: 0.2 });
        const ringMat = this.magRing.material as THREE.MeshBasicMaterial;
        gsap.to(ringMat, { opacity: 0.4, duration: 0.3 });
        document.body.style.cursor = 'grabbing';
      }
    }
  }

  private onPointerMove = (e: PointerEvent): void => {
    const clientX = e.clientX !== undefined ? e.clientX : ((e as any).touches?.[0]?.clientX || window.innerWidth / 2);
    const clientY = e.clientY !== undefined ? e.clientY : ((e as any).touches?.[0]?.clientY || window.innerHeight / 2);
    this.mouse.x = (clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(clientY / window.innerHeight) * 2 + 1;

    if (this.draggedTile) {
      const planeIntersects = this.getIntersects(e, [this.dragPlane]);
      if (planeIntersects.length > 0) {
        this.draggedTile.position.copy(planeIntersects[0].point.add(this.dragOffset));
        if (this.isLandscape) {
          this.draggedTile.position.x = Math.min(this.draggedTile.position.x, 3);
        }
      }
    }
  }

  private onPointerUp = (e: PointerEvent): void => {
    document.body.style.cursor = 'default';
    if (!this.draggedTile) return;

    const zoneIntersects = this.getIntersects(e, this.dropZones);

    const cluster = [this.draggedTile];
    this.tiles.forEach(t => {
      if (t !== this.draggedTile && t.userData.isMagnetized) {
        cluster.push(t);
      }
    });

    let snappedToZone: THREE.Group | null = null;
    if (zoneIntersects.length > 0) {
      let zone: THREE.Object3D | null = zoneIntersects[0].object;
      while (zone && zone.parent && !zone.userData.isZone) {
        zone = zone.parent;
      }

      if (zone && zone.userData.isZone) {
        const zoneGroup = zone as THREE.Group;
        const categoryObj = Object.values(this.CATEGORIES).find(c => c.id === zoneGroup.userData.category);
        const requiredLength = categoryObj ? categoryObj.words.length : 4;

        if (zoneGroup.userData.category === this.draggedTile.userData.category && cluster.length === requiredLength) {
          snappedToZone = zoneGroup;
        } else {
          // Strong wrong-zone feedback
          gsap.to(this.draggedTile.rotation, { z: 0.2, yoyo: true, repeat: 5, duration: 0.06 });
          this.draggedTile.userData.hintLight.color.setHex(0xff0000);
          this.draggedTile.userData.hintLight.intensity = 2;
          gsap.to(this.draggedTile.userData.hintLight, { intensity: 0, duration: 0.5, delay: 0.3 });

          const topMat = this.draggedTile.userData.topMat as THREE.MeshPhysicalMaterial;
          gsap.to(topMat, { emissiveIntensity: 0.5, yoyo: true, repeat: 1, duration: 0.2 });
          topMat.emissive.setHex(0xff0000);

          const failedTile = this.draggedTile;
          setTimeout(() => {
            if (failedTile && failedTile.userData && failedTile.userData.topMat) {
              failedTile.userData.topMat.emissive.setHex(0xffffff);
            }
          }, 400);
        }
      }
    }

    if (snappedToZone) {
      const basePos = snappedToZone.position.clone();
      basePos.y += 0.4;

      // Reveal category
      const innerMesh = snappedToZone.userData.innerMesh as THREE.Mesh;
      const innerMat = innerMesh.material as THREE.MeshPhysicalMaterial;
      innerMat.map = snappedToZone.userData.revealedTex;
      innerMat.needsUpdate = true;
      gsap.from(snappedToZone.scale, { x: 1.05, y: 1.05, z: 1.05, duration: 0.5, ease: 'back.out(1.5)' });

      // Burst particles
      const categoryObj = Object.values(this.CATEGORIES).find(c => c.id === snappedToZone!.userData.category);
      if (categoryObj) {
        this.burstParticles(basePos, categoryObj.rimColor);
      }

      let delay = 0;
      cluster.forEach((t) => {
        t.userData.isSnapped = true;
        t.userData.isMagnetized = false;
        const targetPos = basePos.clone().add(t.userData.clusterOffset);

        gsap.to(t.position, { x: targetPos.x, y: targetPos.y, z: targetPos.z, duration: 0.5, delay: delay, ease: 'back.out(1.2)' });
        gsap.to(t.rotation, { x: 0, y: 0, z: 0, duration: 0.4, delay: delay });

        const hintLight = t.userData.hintLight as THREE.PointLight;
        if (categoryObj) {
          hintLight.color.set(categoryObj.baseColor);
        }
        gsap.to(hintLight, { intensity: 3, duration: 0.2, yoyo: true, repeat: 1, delay: delay });

        delay += 0.05;
      });

      this.completedGroups++;
      const instructions = document.getElementById('instructions');
      if (instructions) {
        instructions.innerText = 'Great connection!';
        setTimeout(() => {
          if (this.completedGroups < 2 && instructions) {
            instructions.innerText = 'Find the next group...';
          }
        }, 2000);
      }
      this.checkWin();
    } else {
      cluster.forEach(t => {
        t.userData.isMagnetized = false;
        gsap.to(t.rotation, { x: 0, z: 0, duration: 0.4 });
      });
    }

    const ringMat = this.magRing.material as THREE.MeshBasicMaterial;
    gsap.to(ringMat, { opacity: 0, duration: 0.2 });
    this.draggedTile.userData.isDragging = false;
    this.draggedTile = null;
  }

  // ==========================================
  // PARTICLE BURST
  // ==========================================
  private burstParticles(pos: THREE.Vector3, colorStr: string): void {
    const geo = new THREE.BufferGeometry();
    const count = 30;
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y + 0.5;
      positions[i * 3 + 2] = pos.z;
      velocities.push(new THREE.Vector3((Math.random() - 0.5) * 0.2, Math.random() * 0.3, (Math.random() - 0.5) * 0.2));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: colorStr, size: 0.2, transparent: true, opacity: 1 });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.particleSystems.push({ mesh: points, vels: velocities, life: 1.0 });
  }

  private checkWin(): void {
    if (this.completedGroups >= 2) {
      this.gameCompleted = true;
      const instructions = document.getElementById('instructions');
      if (instructions) instructions.style.display = 'none';
      setTimeout(() => {
        const winTitle = document.querySelector('.win-title') as HTMLElement;
        if (winTitle) winTitle.innerText = 'Brilliant!';
        const endCard = document.getElementById('end-card');
        if (endCard) endCard.classList.add('visible');
        gsap.to(this.camera.position, { x: this.isLandscape ? 4 : 5, z: 15, duration: 10, ease: 'power1.inOut' });
        
        // Notify SDK that the game is finished
        sdk.finish();
      }, 1000);
    }
  }

  public handleCTA(): void {
    sdk.install();
  }

  // ==========================================
  // RENDER & ANIMATION LOOP
  // ==========================================
  private animate = (): void => {
    requestAnimationFrame(this.animate);
    if (this.isPaused) return;

    const time = this.clock.getElapsedTime();

    // Camera parallax + ambient wave movement
    if (!this.draggedTile && this.completedGroups < 2) {
      const targetX = this.mouse.x * 2;
      const targetZ = (this.isLandscape ? 11 : 12) + this.mouse.y * 1.5;
      this.camera.position.x += (targetX - this.camera.position.x) * 0.05;
      this.camera.position.z += (targetZ - this.camera.position.z) * 0.05;

      if (Math.abs(this.mouse.x) < 0.01 && Math.abs(this.mouse.y) < 0.01) {
        this.camera.position.x += Math.sin(time * 0.5) * 0.005;
        this.camera.position.z += Math.cos(time * 0.3) * 0.005;
      }
      this.camera.lookAt(this.isLandscape ? 2 : 0, 0, 2);
    }

    this.noisePass.material.uniforms.time.value = time;

    // Reset lines
    let lineIdx = 0;
    this.lines.forEach((l) => {
      const lMat = l.material as THREE.MeshBasicMaterial;
      lMat.opacity = 0;
    });

    if (this.draggedTile) {
      this.magRing.position.copy(this.draggedTile.position);
      this.magRing.position.y = 0.05;
    }

    // Tiles animation and magnet physics logic
    this.tiles.forEach((tile) => {
      if (tile.userData.isSnapped) return;

      if (this.draggedTile) {
        if (tile === this.draggedTile) return;

        if (tile.userData.category === this.draggedTile.userData.category) {
          const dist = tile.position.distanceTo(this.draggedTile.position);
          if (dist < 4.5) {
            const targetPos = this.draggedTile.position.clone().add(tile.userData.clusterOffset);
            tile.position.lerp(targetPos, 0.08);
            tile.userData.isMagnetized = true;

            // Connection arcs
            if (lineIdx < this.lines.length) {
              const curve = new THREE.QuadraticBezierCurve3(
                tile.position,
                new THREE.Vector3(
                  (tile.position.x + this.draggedTile.position.x) / 2,
                  Math.max(tile.position.y, this.draggedTile.position.y) + 2.0,
                  (tile.position.z + this.draggedTile.position.z) / 2
                ),
                this.draggedTile.position
              );
              this.lines[lineIdx].geometry.dispose();
              this.lines[lineIdx].geometry = new THREE.TubeGeometry(curve, 20, 0.04, 6, false);
              
              const lineMat = this.lines[lineIdx].material as THREE.MeshBasicMaterial;
              lineMat.color.setHex(0x00ffcc);
              lineMat.opacity = (1 - dist / 4.5) * 0.9;
              lineIdx++;
            }
          } else {
            tile.userData.isMagnetized = false;
            tile.userData.floatTarget.y = tile.userData.baseY + Math.sin(time * 2 + tile.userData.randomOff) * 0.2;
            tile.position.lerp(tile.userData.floatTarget, 0.03);
          }
        }
      } else {
        tile.userData.floatTarget.y = tile.userData.baseY + Math.sin(time * 2 + tile.userData.randomOff) * 0.2;
        tile.position.lerp(tile.userData.floatTarget, 0.02);
        tile.rotation.y += Math.sin(time + tile.userData.randomOff) * 0.002;
      }
    });

    // Particle systems update
    for (let i = this.particleSystems.length - 1; i >= 0; i--) {
      const ps = this.particleSystems[i];
      ps.life -= 0.02;
      const positions = ps.mesh.geometry.attributes.position.array as Float32Array;
      for (let j = 0; j < positions.length; j += 3) {
        positions[j] += ps.vels[j / 3].x;
        positions[j + 1] += ps.vels[j / 3].y;
        positions[j + 2] += ps.vels[j / 3].z;
      }
      ps.mesh.geometry.attributes.position.needsUpdate = true;
      const psMat = ps.mesh.material as THREE.PointsMaterial;
      psMat.opacity = ps.life;
      if (ps.life <= 0) {
        this.scene.remove(ps.mesh);
        this.particleSystems.splice(i, 1);
      }
    }

    this.composer.render();
  }

  // ==========================================
  // PLAYABLE LIFECYCLE HOOKS
  // ==========================================
  public resize = (width: number, height: number): void => {
    const uiContainer = document.getElementById('ui-layer');
    if (uiContainer) {
      uiContainer.style.width = `${width}px`;
      uiContainer.style.height = `${height}px`;
    }

    this.isLandscape = width > height;
    if (this.isLandscape) {
      this.dropZones[0].position.set(4.5, 0.1, -2);
      this.dropZones[1].position.set(4.5, 0.1, 2);
      this.camera.position.set(1.5, 14, 11);
      this.camera.fov = 40;
    } else {
      this.dropZones[0].position.set(-2.2, 0.1, 4.5);
      this.dropZones[1].position.set(2.2, 0.1, 4.5);
      this.camera.position.set(0, 14, 12);
      this.camera.fov = 35;
    }

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
  }

  public pause(): void {
    this.isPaused = true;
    console.log('Game paused');
  }

  public resume(): void {
    this.isPaused = false;
    console.log('Game resumed');
  }

  public volume(value: number): void {
    console.log(`Volume changed to: ${value}`);
  }

  public finish(): void {
    console.log('Game finished');
  }
}
