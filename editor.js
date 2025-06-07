import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

class LevelEditor {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.controls = new OrbitControls(this.camera, this.canvas);
        
        // Grid settings
        this.gridSize = 32;
        this.slabHeight = 0.25;
        this.slabMap = new Map(); // Store placed slabs
        
        // Editor state
        this.mode = 'place';
        this.selectedColor = '#ff6b6b';
        
        // Interaction
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.gridPlane = null;
        this.hoveredPosition = null;
        this.hoverIndicator = null;
        
        this.init();
        this.setupEventListeners();
        this.animate();
    }
    
    init() {
        // Renderer setup
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setClearColor(0x1a1a2e, 1);
        
        // Camera setup
        this.camera.position.set(20, 20, 20);
        this.camera.lookAt(0, 0, 0);
        
        // Controls setup
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI * 0.45;
        this.controls.minDistance = 10;
        this.controls.maxDistance = 100;
        
        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(50, 50, 25);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 200;
        directionalLight.shadow.camera.left = -50;
        directionalLight.shadow.camera.right = 50;
        directionalLight.shadow.camera.top = 50;
        directionalLight.shadow.camera.bottom = -50;
        this.scene.add(directionalLight);
        
        // Grid
        this.createGrid();
        this.createGridPlane();
        this.createHoverIndicator();
    }
    
    createGrid() {
        const gridHelper = new THREE.GridHelper(this.gridSize, this.gridSize, 0x444466, 0x333344);
        gridHelper.position.y = 0;
        this.scene.add(gridHelper);
        
        // Add border
        const borderGeometry = new THREE.EdgesGeometry(
            new THREE.PlaneGeometry(this.gridSize, this.gridSize)
        );
        const borderMaterial = new THREE.LineBasicMaterial({ color: 0x6666aa });
        const border = new THREE.LineSegments(borderGeometry, borderMaterial);
        border.rotation.x = -Math.PI / 2;
        this.scene.add(border);
    }
    
    createGridPlane() {
        const geometry = new THREE.PlaneGeometry(this.gridSize, this.gridSize);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x000000, 
            transparent: true, 
            opacity: 0 
        });
        this.gridPlane = new THREE.Mesh(geometry, material);
        this.gridPlane.rotation.x = -Math.PI / 2;
        this.gridPlane.position.y = 0;
        this.scene.add(this.gridPlane);
    }
    
    createHoverIndicator() {
        const geometry = new THREE.BoxGeometry(1, this.slabHeight, 1);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0xffffff, 
            transparent: true, 
            opacity: 0.3,
            wireframe: true
        });
        this.hoverIndicator = new THREE.Mesh(geometry, material);
        this.hoverIndicator.visible = false;
        this.scene.add(this.hoverIndicator);
    }
    
    setupEventListeners() {
        // Window resize
        window.addEventListener('resize', () => this.onWindowResize());
        
        // Mouse events
        this.canvas.addEventListener('mousemove', (event) => this.onMouseMove(event));
        this.canvas.addEventListener('click', (event) => this.onClick(event));
        this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
        
        // UI events
        document.getElementById('placeMode').addEventListener('click', () => this.setMode('place'));
        document.getElementById('deleteMode').addEventListener('click', () => this.setMode('delete'));
        document.getElementById('clearAll').addEventListener('click', () => this.clearAll());
        document.getElementById('saveLevel').addEventListener('click', () => this.saveLevel());
        document.getElementById('loadLevel').addEventListener('click', () => this.loadLevel());
        
        // Color picker
        document.querySelectorAll('.color-option').forEach(option => {
            option.addEventListener('click', () => this.selectColor(option.dataset.color, option));
        });
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    onMouseMove(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        this.updateHoverIndicator();
    }
    
    onClick(event) {
        if (event.button !== 0) return; // Only left click
        
        const gridPos = this.getGridPosition();
        if (!gridPos) return;
        
        if (this.mode === 'place') {
            this.placeSlab(gridPos.x, gridPos.z);
        } else if (this.mode === 'delete') {
            this.deleteSlab(gridPos.x, gridPos.z);
        }
    }
    
    updateHoverIndicator() {
        const gridPos = this.getGridPosition();
        if (gridPos) {
            this.hoverIndicator.position.set(gridPos.x, this.slabHeight / 2, gridPos.z);
            this.hoverIndicator.visible = true;
            this.hoveredPosition = gridPos;
            
            // Update coords display
            document.getElementById('coords').textContent = 
                `Position: ${Math.floor(gridPos.x + this.gridSize/2)}, ${Math.floor(gridPos.z + this.gridSize/2)}`;
        } else {
            this.hoverIndicator.visible = false;
            this.hoveredPosition = null;
            document.getElementById('coords').textContent = 'Position: -';
        }
    }
    
    getGridPosition() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.gridPlane);
        
        if (intersects.length > 0) {
            const point = intersects[0].point;
            // Snap to grid
            const x = Math.floor(point.x) + 0.5;
            const z = Math.floor(point.z) + 0.5;
            
            // Check bounds
            const halfGrid = this.gridSize / 2;
            if (x >= -halfGrid && x < halfGrid && z >= -halfGrid && z < halfGrid) {
                return { x, z };
            }
        }
        return null;
    }
    
    placeSlab(x, z) {
        const key = `${x},${z}`;
        
        // Remove existing slab if present
        if (this.slabMap.has(key)) {
            this.scene.remove(this.slabMap.get(key));
        }
        
        // Create new slab
        const geometry = new THREE.BoxGeometry(1, this.slabHeight, 1);
        const material = new THREE.MeshLambertMaterial({ color: this.selectedColor });
        const slab = new THREE.Mesh(geometry, material);
        
        slab.position.set(x, this.slabHeight / 2, z);
        slab.castShadow = true;
        slab.receiveShadow = true;
        
        this.scene.add(slab);
        this.slabMap.set(key, slab);
    }
    
    deleteSlab(x, z) {
        const key = `${x},${z}`;
        if (this.slabMap.has(key)) {
            this.scene.remove(this.slabMap.get(key));
            this.slabMap.delete(key);
        }
    }
    
    setMode(mode) {
        this.mode = mode;
        
        // Update UI
        document.querySelectorAll('#ui-container button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(mode + 'Mode').classList.add('active');
        
        // Update cursor
        this.canvas.style.cursor = mode === 'place' ? 'crosshair' : 'not-allowed';
        
        // Update hover indicator color
        if (mode === 'place') {
            this.hoverIndicator.material.color.setHex(0xffffff);
        } else {
            this.hoverIndicator.material.color.setHex(0xff0000);
        }
    }
    
    selectColor(color, element) {
        this.selectedColor = color;
        
        // Update UI
        document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('active'));
        element.classList.add('active');
    }
    
    clearAll() {
        this.slabMap.forEach(slab => this.scene.remove(slab));
        this.slabMap.clear();
    }
    
    saveLevel() {
        const levelData = {
            gridSize: this.gridSize,
            slabs: []
        };
        
        this.slabMap.forEach((slab, key) => {
            const [x, z] = key.split(',').map(Number);
            levelData.slabs.push({
                x, z,
                color: '#' + slab.material.color.getHexString()
            });
        });
        
        const dataStr = JSON.stringify(levelData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = 'level.json';
        link.click();
        
        URL.revokeObjectURL(url);
    }
    
    loadLevel() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const levelData = JSON.parse(e.target.result);
                    this.clearAll();
                    
                    levelData.slabs.forEach(slabData => {
                        const oldColor = this.selectedColor;
                        this.selectedColor = slabData.color;
                        this.placeSlab(slabData.x, slabData.z);
                        this.selectedColor = oldColor;
                    });
                } catch (error) {
                    alert('Error loading level file: ' + error.message);
                }
            };
            reader.readAsText(file);
        };
        
        input.click();
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

// Initialize the level editor
new LevelEditor();

