import * as THREE from 'three'

// Shared loader for the planet imagery in public/textures (credits in the README).
// The manager lets the app keep its loader up until every image has arrived.

export const textureManager = new THREE.LoadingManager()
const loader = new THREE.TextureLoader(textureManager)

export function loadTexture(path, { color = true } = {}) {
  const texture = loader.load(`${import.meta.env.BASE_URL}${path}`)
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace
  texture.wrapS = THREE.RepeatWrapping // clouds drift across the date line
  texture.anisotropy = 8
  return texture
}
