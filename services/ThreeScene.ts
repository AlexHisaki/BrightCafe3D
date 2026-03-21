
import * as THREE from 'three';
import { Player, PieceData, GameMode } from '../types';

export class ThreeScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  
  // 階層構造
  private pivot: THREE.Group; // 全体を回転させるための親
  private boardGroup: THREE.Group;
  private boardPiecesGroup: THREE.Group; // 盤面の駒専用
  private shelfGroupP1: THREE.Group;
  private shelfGroupP2: THREE.Group;

  private targetRotationY: number = Math.PI / 4;
  private isDragging: boolean = false;
  private previousMousePosition = { x: 0, y: 0 };
  private dragDistance: number = 0;

  // ズーム機能
  private targetZoom: number = 22;
  private currentZoom: number = 22;
  private minZoom: number = 12;
  private maxZoom: number = 35;

  private onInteract: (slotIndex: number) => void;
  private onSelectPiece: (player: Player, value: number) => void;

  private woodTexture: THREE.CanvasTexture;

  constructor(
    container: HTMLElement, 
    onInteract: (slotIndex: number) => void,
    onSelectPiece: (player: Player, value: number) => void
  ) {
    this.onInteract = onInteract;
    this.onSelectPiece = onSelectPiece;
    this.woodTexture = this.generateWoodTexture();

    this.scene = new THREE.Scene();
    
    // 背景画像の設定（提供されたカフェの雰囲気に近いお洒落な画像をロード）
    const loader = new THREE.TextureLoader();
    loader.load('https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=2000', (texture) => {
      // 背景として設定（固定背景）
      this.scene.background = texture;
    });

    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 14, this.currentZoom);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.initLights();
    
    this.pivot = new THREE.Group();
    this.boardGroup = new THREE.Group();
    this.boardPiecesGroup = new THREE.Group();
    this.shelfGroupP1 = new THREE.Group();
    this.shelfGroupP2 = new THREE.Group();

    this.scene.add(this.pivot);
    this.pivot.add(this.boardGroup);
    this.pivot.add(this.boardPiecesGroup);
    this.pivot.add(this.shelfGroupP1);
    this.pivot.add(this.shelfGroupP2);

    this.createEnvironment();
    this.addEventListeners(container);
    this.animate();
  }

  private generateWoodTexture(): THREE.CanvasTexture {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#2c1a10';
    ctx.fillRect(0, 0, size, size);

    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < 300; i++) {
        const x = Math.random() * size;
        const width = (layer === 0 ? 0.4 : 1.5) + Math.random() * 2;
        const opacity = 0.04 + Math.random() * 0.15;
        
        const colors = ['#1a0f0a', '#3d2b1f', '#4e3b2c', '#25160d'];
        ctx.strokeStyle = colors[Math.floor(Math.random() * colors.length)];
        ctx.globalAlpha = opacity;
        ctx.lineWidth = width;
        
        ctx.beginPath();
        let currentY = -100;
        let currentX = x;
        ctx.moveTo(currentX, currentY);
        
        while (currentY < size + 100) {
          currentY += 4 + Math.random() * 12;
          currentX += Math.sin(currentY * 0.008 + x) * 2.5 + (Math.random() - 0.5) * 5;
          ctx.lineTo(currentX, currentY);
        }
        ctx.stroke();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 16;
    return texture;
  }

  private initLights() {
    // カフェの暖色系の照明を再現
    const ambientLight = new THREE.AmbientLight(0xffe4b5, 0.4);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
    this.scene.add(hemiLight);

    // カフェのペンダントライトをイメージした暖色スポットライト
    const mainLight = new THREE.SpotLight(0xffd700, 3.5);
    mainLight.position.set(10, 25, 10);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.bias = -0.0001;
    mainLight.angle = Math.PI / 4;
    mainLight.penumbra = 0.6;
    this.scene.add(mainLight);

    // 反対側からの柔らかいフィルライト
    const fillLight = new THREE.DirectionalLight(0xfffaf0, 0.5);
    fillLight.position.set(-10, 15, -5);
    this.scene.add(fillLight);
  }

  private createEnvironment() {
    const tableRadius = 26;
    const tableHeight = 0.6;
    const tableGeo = new THREE.CylinderGeometry(tableRadius, tableRadius, tableHeight, 64);
    const tableMat = new THREE.MeshStandardMaterial({ 
        map: this.woodTexture,
        roughness: 0.15,
        metalness: 0.1,
    });
    const table = new THREE.Mesh(tableGeo, tableMat);
    table.position.y = -tableHeight / 2;
    table.receiveShadow = true;
    this.scene.add(table);

    const trayWidth = 2.8;
    const trayHeight = 16.0;
    const trayGeo = new THREE.BoxGeometry(trayWidth, 0.3, trayHeight);
    const trayMat = new THREE.MeshStandardMaterial({ 
      map: this.woodTexture, 
      color: 0x221108, // さらに深く濃い焦げ茶色
      roughness: 0.5,
    });
    
    const trayP1 = new THREE.Mesh(trayGeo, trayMat);
    trayP1.position.set(-9.5, 0, 0);
    trayP1.receiveShadow = true;
    trayP1.castShadow = true;
    this.shelfGroupP1.add(trayP1);

    const trayP2 = new THREE.Mesh(trayGeo, trayMat);
    trayP2.position.set(9.5, 0, 0);
    trayP2.receiveShadow = true;
    trayP2.castShadow = true;
    this.shelfGroupP2.add(trayP2);

    for (let i = 0; i < 9; i++) {
        const x = (i % 3) * 3.0 - 3.0;
        const z = Math.floor(i / 3) * 3.0 - 3.0;
        
        const slotGeo = new THREE.PlaneGeometry(2.8, 2.8);
        const slotMat = new THREE.MeshStandardMaterial({ 
            color: 0x000000, 
            transparent: true, 
            opacity: 0.15, 
            side: THREE.DoubleSide 
        });
        const slot = new THREE.Mesh(slotGeo, slotMat);
        slot.rotation.x = -Math.PI / 2;
        slot.position.set(x, 0.005, z);
        slot.userData = { isSlot: true, index: i };
        this.boardGroup.add(slot);

        const borderGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(2.8, 2.8));
        const borderMat = new THREE.LineBasicMaterial({ 
          color: 0xffffff, 
          transparent: true, 
          opacity: 0.7 
        });
        const borderLine = new THREE.LineSegments(borderGeo, borderMat);
        borderLine.rotation.x = -Math.PI / 2;
        borderLine.position.set(x, 0.015, z);
        this.boardGroup.add(borderLine);

        const frameGeo = new THREE.BoxGeometry(2.85, 0.05, 2.85);
        const frameMat = new THREE.MeshStandardMaterial({ 
          color: 0xffffff, 
          transparent: true, 
          opacity: 0.18 
        });
        const frame = new THREE.Mesh(frameGeo, frameMat);
        frame.position.set(x, 0, z);
        this.boardGroup.add(frame);
    }
  }

  private createPieceMesh(player: Player, value: number, isUI: boolean = false) {
    const height = 0.6 + (value * 0.45);
    const bottomRadius = 0.6 + (value * 0.08);
    const topRadius = bottomRadius * 0.45;
    
    const baseColor = player === 'player1' ? 0x10b981 : 0xf43f5e;
    const group = new THREE.Group();
    
    const points: THREE.Vector2[] = [];
    const segments = 30;
    
    points.push(new THREE.Vector2(0, 0));
    points.push(new THREE.Vector2(bottomRadius, 0));
    points.push(new THREE.Vector2(bottomRadius, 0.05));
    points.push(new THREE.Vector2(bottomRadius - 0.05, 0.1));

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const y = 0.1 + (t * (height - 0.1));
        let r;
        if (t < 0.8) {
            r = (bottomRadius - 0.05) - (Math.pow(t, 0.55) * (bottomRadius - 0.05 - topRadius));
        } else {
            const nt = (t - 0.8) / 0.2;
            r = topRadius * Math.cos(nt * Math.PI / 2);
        }
        points.push(new THREE.Vector2(r, y));
    }

    const bodyGeo = new THREE.LatheGeometry(points, 40);
    const bodyMat = new THREE.MeshPhysicalMaterial({ 
        color: baseColor, 
        roughness: 0.1, 
        metalness: 0.5,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        sheen: 1.0,
        sheenColor: new THREE.Color(0xffffff),
        emissive: baseColor,
        emissiveIntensity: 0.02
    });
    
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = 'rgba(255,255,255,0.98)';
        ctx.font = 'bold 160px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 10;
        ctx.fillText(value.toString(), 128, 128);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    const labelGeo = new THREE.CircleGeometry(topRadius * 0.7, 32);
    const labelMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const label = new THREE.Mesh(labelGeo, labelMat);
    
    label.rotation.x = -Math.PI / 2.05;
    label.position.set(0, height - 0.005, topRadius * 0.2);
    group.add(label);

    group.userData = { player, value, isUI };
    return group;
  }

  public sync(state: {
    board: (PieceData | null)[],
    currentPlayer: Player,
    onBoardPieces: { [key in Player]: number[] },
    cooldown: { [key in Player]: number | null },
    selectedPieceValue: number | null,
    mode: GameMode,
    isConfirm: boolean
  }) {
    this.boardPiecesGroup.clear();
    
    const clearShelf = (group: THREE.Group) => {
        const toRemove = group.children.filter(child => !((child as THREE.Mesh).geometry instanceof THREE.BoxGeometry));
        toRemove.forEach(child => group.remove(child));
    };
    clearShelf(this.shelfGroupP1);
    clearShelf(this.shelfGroupP2);

    state.board.forEach((topPiece, i) => {
        if (!topPiece) return;
        const x = (i % 3) * 3.0 - 3.0;
        const z = Math.floor(i / 3) * 3.0 - 3.0;
        const mesh = this.createPieceMesh(topPiece.player, topPiece.value);
        mesh.position.set(x, 0, z);
        this.boardPiecesGroup.add(mesh);
    });

    const drawShelf = (player: Player, group: THREE.Group, xOffset: number) => {
        const allVals = [1, 2, 3, 4, 5, 6];
        const spacing = 2.45;
        const startZ = (allVals.length - 1) * spacing / 2;

        allVals.forEach((val, idx) => {
            const isUsed = state.onBoardPieces[player].includes(val);
            const isCooldown = state.cooldown[player] === val;
            const isSelected = (state.currentPlayer === player && state.selectedPieceValue === val);
            
            if (isUsed || isCooldown) return;

            const mesh = this.createPieceMesh(player, val, true);
            const zPos = startZ - (idx * spacing);
            const zOffset = (idx % 2 === 0 ? 0.2 : -0.2);
            mesh.position.set(xOffset + zOffset, 0.2, zPos);
            
            if (isSelected) {
                mesh.userData.floating = true;
            }
            
            if (state.currentPlayer !== player || (state.mode === 'return' && !isSelected) || state.isConfirm) {
              mesh.traverse(child => {
                if (child instanceof THREE.Mesh) {
                  child.material = child.material.clone();
                  child.material.transparent = true;
                  child.material.opacity = 0.2;
                }
              });
            }
            group.add(mesh);
        });
    };

    drawShelf('player1', this.shelfGroupP1, -9.5);
    drawShelf('player2', this.shelfGroupP2, 9.5);
  }

  private addEventListeners(container: HTMLElement) {
    const onDown = (clientX: number, clientY: number) => {
      this.isDragging = true;
      this.dragDistance = 0;
      this.previousMousePosition = { x: clientX, y: clientY };
    };

    const onMove = (clientX: number, clientY: number) => {
      if (this.isDragging) {
        const deltaX = clientX - this.previousMousePosition.x;
        this.dragDistance += Math.abs(deltaX);
        this.targetRotationY += deltaX * 0.0075;
        this.previousMousePosition = { x: clientX, y: clientY };
      }
    };

    const onUp = (clientX: number, clientY: number) => {
      if (this.isDragging && this.dragDistance < 15) {
        this.handleClick(clientX, clientY);
      }
      this.isDragging = false;
    };

    // ズーム機能のリスナー
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY * 0.01;
      this.targetZoom = THREE.MathUtils.clamp(this.targetZoom + delta, this.minZoom, this.maxZoom);
    }, { passive: false });

    container.addEventListener('mousedown', (e) => onDown(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', (e) => onUp(e.clientX, e.clientY));

    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) onDown(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        onMove(e.touches[0].clientX, e.touches[0].clientY);
        e.preventDefault();
      }
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
      if (e.changedTouches.length === 1) onUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    });

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  private handleClick(clientX: number, clientY: number) {
    this.mouse.x = (clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const objectsToTest = [
        ...this.boardGroup.children, 
        ...this.boardPiecesGroup.children,
        ...this.shelfGroupP1.children,
        ...this.shelfGroupP2.children
    ];
    const intersects = this.raycaster.intersectObjects(objectsToTest, true);
    
    let clickedPieceUI: any = null;
    let clickedSlot: any = null;

    for (let i of intersects) {
        let obj: any = i.object;
        while (obj && !obj.userData.isUI && !obj.userData.isSlot && obj.parent) obj = obj.parent;
        
        if (obj.userData.isUI) {
            clickedPieceUI = obj;
            break;
        }
        if (obj.userData.isSlot) {
            clickedSlot = obj;
            break;
        }
    }

    if (clickedPieceUI) {
        this.onSelectPiece(clickedPieceUI.userData.player, clickedPieceUI.userData.value);
    } else if (clickedSlot) {
        this.onInteract(clickedSlot.userData.index);
    }
  }

  private animate() {
    requestAnimationFrame(() => this.animate());
    
    // スムーズな回転
    this.pivot.rotation.y += (this.targetRotationY - this.pivot.rotation.y) * 0.08;

    // スムーズなズーム
    this.currentZoom = THREE.MathUtils.lerp(this.currentZoom, this.targetZoom, 0.1);
    this.camera.position.z = this.currentZoom;
    // ズームに合わせて高さも少し調整して視点を保つ
    this.camera.position.y = 8 + (this.currentZoom * 0.3);
    this.camera.lookAt(0, 0, 0);

    const time = Date.now() * 0.005;
    
    const updatePieceAnim = (group: THREE.Group) => {
        group.children.forEach(p => {
            if (p.userData.isUI) {
                if (p.userData.floating) {
                    p.position.y = 1.0 + Math.sin(time * 0.9) * 0.6;
                    p.rotation.y += 0.04;
                } else {
                    p.position.y = THREE.MathUtils.lerp(p.position.y, 0.2, 0.15);
                    p.rotation.y = THREE.MathUtils.lerp(p.rotation.y, 0, 0.1);
                }
            }
        });
    };

    updatePieceAnim(this.shelfGroupP1);
    updatePieceAnim(this.shelfGroupP2);
    updatePieceAnim(this.boardPiecesGroup);

    this.renderer.render(this.scene, this.camera);
  }

  public destroy() {
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
