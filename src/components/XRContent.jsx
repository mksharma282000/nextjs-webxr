'use client'

import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, Html } from '@react-three/drei'
import { useHitTest, useXREvent } from '@react-three/xr'
import * as THREE from 'three'

export default function XRContent({ url }) {
  const [model, setModel] = useState(null)
  const gltf = useGLTF(url || '', true)
  const mixer = useRef(null)
  const [clipList, setClipList] = useState([])
  const reticle = useRef(null)

  useEffect(() => {
    if (!gltf || !gltf.scene) return
    const scene = gltf.scene.clone()
    const { animations } = gltf

    const box = new THREE.Box3().setFromObject(scene)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1

    scene.position.sub(center)
    const scale = Math.min(1, 0.8 / maxDim)
    scene.scale.setScalar(scale)

    if (animations && animations.length > 0) {
      mixer.current = new THREE.AnimationMixer(scene)
      setClipList(animations)
    }

    setModel(scene)
  }, [gltf])

  useHitTest((hitMatrix) => {
    if (!reticle.current) return
    reticle.current.visible = true
    hitMatrix.decompose(reticle.current.position, reticle.current.quaternion, reticle.current.scale)
  })

  useXREvent('select', () => {
    if (model && reticle.current && reticle.current.visible) {
      model.position.copy(reticle.current.position)
      reticle.current.visible = false
    }
  })

  useFrame((_, delta) => {
    mixer.current?.update(delta)
  })

  return (
    <>
      {/* Placement Reticle */}
      <mesh ref={reticle} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.05, 0.08, 32]} />
        <meshBasicMaterial color="#00ff00" side={THREE.DoubleSide} />
      </mesh>

      {/* Model */}
      {model && <primitive object={model} />}

      {/* HTML Animation Control Overlay */}
      {clipList.length > 0 && (
        <Html position={[-1, 1, 0]} transform={false}>
          <div
            style={{
              position: 'fixed',
              top: 16,
              left: 16,
              background: 'rgba(17, 17, 17, 0.85)',
              color: '#eee',
              padding: 12,
              borderRadius: 6,
              fontSize: 13,
              maxHeight: '40vh',
              overflowY: 'auto',
              pointerEvents: 'auto'
            }}
          >
            <strong style={{ display: 'block', marginBottom: 8 }}>Clips</strong>
            {clipList.map((clip, idx) => (
              <button
                key={idx}
                onClick={() => {
                  if (!mixer.current) return
                  mixer.current.stopAllAction()
                  mixer.current.clipAction(clip)?.reset().play()
                }}
                style={{
                  display: 'block',
                  marginBottom: 6,
                  padding: '4px 8px',
                  background: '#333',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left'
                }}
              >
                {clip.name || `Clip ${idx + 1}`}
              </button>
            ))}
          </div>
        </Html>
      )}
    </>
  )
}
