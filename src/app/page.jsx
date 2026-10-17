'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { ARButton } from 'three/examples/jsm/webxr/ARButton';

export default function Home() {
  const mountRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const base64ToArrayBuffer = (base64) => {
      const binary = atob(base64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    };

    // --- Scene & Camera ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.01,
      100
    );
    camera.position.set(0, 1.5, 3);

    // --- Renderer ---
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    // AR Button
    const arButton = ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] });
    document.body.appendChild(arButton);

    // --- Controls ---
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    renderer.xr.addEventListener('sessionstart', () => {
      controls.enabled = false;
    });
    renderer.xr.addEventListener('sessionend', () => {
      controls.enabled = true;
      camera.position.set(0, 1.5, 3);
      controls.target.set(0, 0, 0);
    });

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    // --- State & Variables ---
    const clock = new THREE.Clock();
    let mixer = null;
    const meshList = [];
    const audioList = [];
    let animationList = [];

    let hitTestSource = null;
    let hitTestSourceRequested = false;
    let placedModel = null;
    let modelPlaced = false;

    // Reticle for AR hit-testing
    const reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.05, 0.08, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // Raycasting & Interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const dragPlane = new THREE.Plane();
    const dragIntersection = new THREE.Vector3();
    const dragOffset = new THREE.Vector3();
    let isDragging = false;
    let initialDistance = 0;
    let initialScale = 1;
    let rotationStartAngle = 0;
    let initialRotationY = 0;

    // Process & Display Model
    function processModel(model, animations = []) {
      if (placedModel) scene.remove(placedModel);
      placedModel = model;

      meshList.length = 0;
      audioList.length = 0;
      animationList = animations;

      model.traverse((child) => {
        if (child.isMesh) meshList.push(child);
        if (child.type === 'Audio') audioList.push(child);
      });

      // Normalize size and center pivot
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const sizeVec = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z) || 1;
      const scale = Math.min(1, 0.8 / maxDim);

      model.position.sub(center);
      model.scale.setScalar(scale);

      // Add directly to scene for 3D desktop/mobile preview
      scene.add(placedModel);

      // Setup Animation Mixer
      if (animations && animations.length > 0) {
        mixer = new THREE.AnimationMixer(model);
        const buttonsContainer = document.getElementById('meshButtons');
        if (buttonsContainer) {
          buttonsContainer.innerHTML = '';
          animations.forEach((clip, i) => {
            const btn = document.createElement('button');
            btn.textContent = clip.name || `Animation ${i + 1}`;
            btn.style.display = 'block';
            btn.style.marginBottom = '6px';
            btn.style.width = '100%';
            btn.onclick = () => {
              mixer.stopAllAction();
              mixer.clipAction(clip).reset().play();
            };
            buttonsContainer.appendChild(btn);
          });
        }
      }

      const animElem = document.getElementById('animations');
      if (animElem) animElem.textContent = JSON.stringify(animations.map((a) => a.name), null, 2);
    }

    // Load from Session Storage
    try {
      const stored = sessionStorage.getItem('model');
      const modelType = sessionStorage.getItem('modelType');

      if (stored && modelType) {
        const buffer = base64ToArrayBuffer(stored);
        if (modelType === 'fbx') {
          const fbxLoader = new FBXLoader();
          const model = fbxLoader.parse(buffer, '');
          processModel(model, model.animations || []);
        } else {
          const gltfLoader = new GLTFLoader();
          gltfLoader.parse(
            buffer,
            '',
            (gltf) => processModel(gltf.scene, gltf.animations || []),
            (err) => console.error('Failed to parse GLTF/GLB:', err)
          );
        }
      }
    } catch (err) {
      console.error('Error reading model from storage:', err);
    }

    function handleRaycast(r) {
      const intersects = r.intersectObjects(meshList, true);
      if (intersects.length > 0) {
        const mesh = intersects[0].object;
        const selected = document.getElementById('selectedMesh');
        if (selected) selected.textContent = mesh.name || 'Unnamed Mesh';

        if (mixer && mesh.name) {
          const clip = animationList.find((c) => c.name === mesh.name);
          if (clip) {
            mixer.stopAllAction();
            mixer.clipAction(clip).reset().play();
          }
        }
      }
    }

    const handleClick = (e) => {
      if (renderer.xr.isPresenting) return;
      mouse.x = (e.clientX / container.clientWidth) * 2 - 1;
      mouse.y = -(e.clientY / container.clientHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      handleRaycast(raycaster);
    };
    window.addEventListener('click', handleClick);

    // Controller Selection for AR
    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', () => {
      if (reticle.visible && placedModel && !modelPlaced) {
        placedModel.position.setFromMatrixPosition(reticle.matrix);
        reticle.visible = false;
        hitTestSourceRequested = true;
        hitTestSource = null;
        modelPlaced = true;
      } else {
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).transformDirection(controller.matrixWorld);
        handleRaycast(raycaster);
      }
    });
    scene.add(controller);

    // Touch events for drag & scale
    const handleTouchStart = (e) => {
      if (!placedModel) return;
      if (e.touches.length === 1) {
        isDragging = true;
        const touch = e.touches[0];
        const ndc = new THREE.Vector2(
          (touch.clientX / container.clientWidth) * 2 - 1,
          -(touch.clientY / container.clientHeight) * 2 + 1
        );
        raycaster.setFromCamera(ndc, camera);
        dragPlane.setFromNormalAndCoplanarPoint(
          camera.getWorldDirection(new THREE.Vector3()).normalize(),
          placedModel.position
        );
        raycaster.ray.intersectPlane(dragPlane, dragIntersection);
        dragOffset.copy(dragIntersection).sub(placedModel.position);
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialDistance = Math.hypot(dx, dy);
        initialScale = placedModel.scale.x;
        rotationStartAngle = Math.atan2(dy, dx);
        initialRotationY = placedModel.rotation.y;
      }
    };

    const handleTouchMove = (e) => {
      if (!placedModel) return;
      if (e.touches.length === 1 && isDragging) {
        const touch = e.touches[0];
        const ndc = new THREE.Vector2(
          (touch.clientX / container.clientWidth) * 2 - 1,
          -(touch.clientY / container.clientHeight) * 2 + 1
        );
        raycaster.setFromCamera(ndc, camera);
        if (raycaster.ray.intersectPlane(dragPlane, dragIntersection)) {
          placedModel.position.copy(dragIntersection.sub(dragOffset));
        }
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const newDistance = Math.hypot(dx, dy);
        if (initialDistance > 0) {
          const factor = newDistance / initialDistance;
          placedModel.scale.setScalar(initialScale * factor);
        }
        const angle = Math.atan2(dy, dx);
        placedModel.rotation.y = initialRotationY + (angle - rotationStartAngle);
      }
    };

    const handleTouchEnd = () => {
      isDragging = false;
    };

    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);

    // Animation Loop
    function animate(time, frame) {
      const delta = clock.getDelta();
      mixer?.update(delta);
      controls.update();

      if (frame && !modelPlaced) {
        const ref = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        if (!hitTestSourceRequested) {
          session.requestReferenceSpace('viewer').then((vref) =>
            session.requestHitTestSource({ space: vref }).then((src) => (hitTestSource = src))
          );
          session.addEventListener('end', () => {
            hitTestSourceRequested = false;
            hitTestSource = null;
            modelPlaced = false;
          });
          hitTestSourceRequested = true;
        }

        if (hitTestSource) {
          const hits = frame.getHitTestResults(hitTestSource);
          if (hits.length > 0) {
            const pose = hits[0].getPose(ref);
            reticle.visible = true;
            reticle.matrix.fromArray(pose.transform.matrix);
          } else {
            reticle.visible = false;
          }
        }
      }

      renderer.render(scene, camera);
    }

    renderer.setAnimationLoop(animate);

    const handleResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      renderer.setAnimationLoop(null);
      if (arButton.parentNode) arButton.parentNode.removeChild(arButton);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <>
      <a
        href="/uploader"
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 99,
          padding: '8px 14px',
          background: '#222',
          color: '#fff',
          borderRadius: 4,
          textDecoration: 'none',
          fontSize: '14px',
        }}
      >
        Upload Model
      </a>

      <div ref={mountRef} style={{ width: '100vw', height: '100vh', overflow: 'hidden' }} />

      <div
        id="infoPanel"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 200,
          height: '100%',
          overflowY: 'auto',
          background: 'rgba(17, 17, 17, 0.85)',
          color: '#eee',
          padding: 15,
          fontSize: 13,
          zIndex: 10,
        }}
      >
        <h4 style={{ margin: '0 0 10px 0' }}>Animations</h4>
        <div id="meshButtons">No animations loaded</div>
        <h4 style={{ margin: '15px 0 5px 0' }}>All Clips</h4>
        <pre id="animations" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}></pre>
        <h4 style={{ margin: '15px 0 5px 0' }}>Selected Mesh</h4>
        <div id="selectedMesh">None</div>
      </div>
    </>
  );
}
