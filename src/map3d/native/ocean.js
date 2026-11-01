import * as THREE from 'three';
/** GPU-only, 2,048 triangles. No CPU vertex writes or normal recalculation. */
export function createOcean(center, radius, height, lowSpec) {
 const material=new THREE.ShaderMaterial({uniforms:{time:{value:0},amplitude:{value:lowSpec?0:2.2},center:{value:new THREE.Vector2(center.x,center.z)},radius:{value:radius},horizon:{value:new THREE.Color(0x8fd0ff)}},
 vertexShader:`uniform float time;uniform float amplitude;varying vec3 world;varying float crest;
 void main(){vec3 p=position;float a=p.x*.018+time*.65;float b=p.y*.027-time*.42;float c=(p.x+p.y)*.043+time*.8;
 float wave=sin(a)+.55*sin(b)+.22*sin(c);p.z+=amplitude*wave;crest=wave;world=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,
 fragmentShader:`uniform vec2 center;uniform float radius;uniform float time;uniform vec3 horizon;varying vec3 world;varying float crest;
 void main(){float d=length(world.xz-center);float near=1.-smoothstep(radius*.9,radius*3.,d);
 vec3 deep=vec3(.025,.19,.30),shallow=vec3(.04,.48,.57);vec3 color=mix(deep,shallow,near*.65+crest*.07);
 float ripple=sin(world.x*.055+world.z*.025+sin(world.z*.009+time*.2)*1.5+time*.6);float shine=pow(max(0.,ripple),24.)*.16;
 float foam=smoothstep(1.25,1.68,crest)*.43;float wake=exp(-pow((d-radius*1.03)/(radius*.075),2.))*(.35+.3*ripple);
 color+=vec3(.45,.72,.73)*shine;color=mix(color,vec3(.8,.94,.91),clamp(foam+max(0.,wake),0.,.68));color=mix(color,horizon,smoothstep(radius*5.,radius*10.,d));gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`,side:THREE.DoubleSide});
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(radius*24,radius*24,32,32),material);mesh.name='decoration-ocean';mesh.rotation.x=-Math.PI/2;mesh.position.set(center.x,height,center.z);return mesh;
}
