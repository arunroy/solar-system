import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'

let glowTexture
/** Soft radial gradient used for stars and the Sun's corona. */
export function getGlowTexture() {
  if (glowTexture) return glowTexture
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  glowTexture = new THREE.CanvasTexture(canvas)
  glowTexture.colorSpace = THREE.SRGBColorSpace
  return glowTexture
}

/** Clickable HTML label anchored just above a body. */
export function createLabel(body) {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'label'
  el.textContent = body.data.name
  el.style.setProperty('--c', body.data.color)
  const label = new CSS2DObject(el)
  label.position.set(0, body.radius * 1.15 + 0.3, 0)
  label.center.set(0.5, 1)
  return label
}

/** Circular orbit path in the ecliptic (XZ) plane. */
export function createOrbit(radius, segments = 256) {
  const points = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius))
  }
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false }),
  )
}
