'use client'

import { Canvas } from '@react-three/fiber'
import { XR, ARButton } from '@react-three/xr'
import { OrbitControls } from '@react-three/drei'
import XRContent from './XRContent'

export default function ARViewer({ url }) {
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <ARButton
        sessionInit={{ requiredFeatures: ['hit-test'] }}
        style={{
          position: 'absolute',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          padding: '12px 24px',
          background: '#000',
          color: '#fff',
          borderRadius: '8px',
          border: '1px solid #444',
          cursor: 'pointer'
        }}
      />
      <Canvas>
        <XR>
          <ambientLight intensity={1.2} />
          <directionalLight position={[5, 10, 5]} intensity={2.0} />
          <OrbitControls makeDefault />
          <XRContent url={url} />
        </XR>
      </Canvas>
    </div>
  )
}
