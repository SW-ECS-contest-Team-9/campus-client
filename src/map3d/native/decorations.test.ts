import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createDecorations, normalizeMapTheme } from './decorations';
function setup(lowSpec=false) {
 const scene=new THREE.Scene(); scene.background=new THREE.Color(0xabcdef);
 scene.add(new THREE.HemisphereLight(),new THREE.DirectionalLight());
 const root=new THREE.Group();const floor=new THREE.Mesh(new THREE.BoxGeometry(60,4,80),new THREE.MeshBasicMaterial());floor.name='structures';floor.position.y=100;root.add(floor);scene.add(root);
 return {scene,root,dec:createDecorations(scene,root,{lowSpec})};
}
describe('map decorations',()=>{
 it('accepts only supported saved themes',()=>{expect(normalizeMapTheme('falcon')).toBe('default');expect(normalizeMapTheme('pirate')).toBe('pirate');});
 it.each(['island','trek','pirate'] as const)('keeps campus geometry/transforms untouched for %s',name=>{
  const {root,dec,scene}=setup();const geometry=(root.children[0] as THREE.Mesh).geometry;const matrix=root.matrix.clone();const count=root.children.length;
  dec.setTheme(name);dec.setMotion(true);dec.tick(1000);dec.tick(1200);
  expect(root.children.length).toBe(count);expect((root.children[0] as THREE.Mesh).geometry).toBe(geometry);expect(root.matrix.equals(matrix)).toBe(true);
  expect(scene.children.some(n=>n.name==='campus-decoration')).toBe(true);dec.dispose();
 });
 it('restores background and releases removed geometry/materials/textures',()=>{
  const {scene,dec}=setup();dec.setTheme('pirate');const calls:ReturnType<typeof vi.spyOn>[]=[];scene.getObjectByName('campus-decoration')!.traverse(n=>{const m=n as THREE.Mesh;if(m.geometry)calls.push(vi.spyOn(m.geometry,'dispose'));});
  dec.setTheme('default');expect(calls.length).toBeGreaterThan(0);expect(calls.every(s=>s.mock.calls.length>0)).toBe(true);expect((scene.background as THREE.Color).getHex()).toBe(0xabcdef);dec.dispose();
 });
 it('disables background motion in low spec and when motion is off',()=>{
  const a=setup(true);a.dec.setTheme('pirate');a.dec.setMotion(true);expect(a.dec.tick(1000)).toBe(false);a.dec.dispose();
  const b=setup();b.dec.setTheme('trek');b.dec.setMotion(false);expect(b.dec.tick(1000)).toBe(false);b.dec.setMotion(true);expect(b.dec.tick(2000)).toBe(true);expect(b.dec.tick(2001)).toBe(false);b.dec.dispose();
 });
 it('updates ocean only through uniforms, without changing the CPU vertex buffer',()=>{
  const {dec,scene}=setup();dec.setTheme('pirate');dec.setMotion(true);const sea=scene.getObjectByName('decoration-ocean') as THREE.Mesh;const p=sea.geometry.attributes.position;const initial=Array.from(p.array);dec.tick(1000);dec.tick(2000);expect(Array.from(p.array)).toEqual(initial);expect((sea.material as THREE.ShaderMaterial).uniforms.time.value).toBeGreaterThan(0);dec.dispose();
 });
});
