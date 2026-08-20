import * as THREE from 'three';

// SOURCE: target-bound Alkemy module, preserved constants/shaders/pass order.
export const FLUID_CONFIG = {
  SIM_RESOLUTION: 128,
  DYE_RESOLUTION: /Mobi|Android/i.test(navigator.userAgent) ? 512 : 1024,
  DENSITY_DISSIPATION: 0.97,
  VELOCITY_DISSIPATION: 0.98,
  PRESSURE: 0.8,
  PRESSURE_ITERATIONS: 20,
  CURL: 30,
  SPLAT_RADIUS: 0.25,
  SPLAT_FORCE: 3000,
  BLOOM_ITERATIONS: 6,
  BLOOM_RESOLUTION: 256,
  BLOOM_INTENSITY: 0.25,
  BLOOM_THRESHOLD: 0.9,
  BLOOM_SOFT_KNEE: 0.4,
  SUNRAYS_RESOLUTION: 196,
  SUNRAYS_WEIGHT: 0.5,
  AUTO_SPLAT_INTERVAL: 2.5,
};

const CONFIG = FLUID_CONFIG;

// Intentional project adaptation: Alkemy's source palette is mapped to the
// life.exe cobalt spectrum while preserving the recovered fluid pipeline.
const PALETTE = [
  { r: 0.08, g: 0.28, b: 1.0 }, { r: 0.12, g: 0.42, b: 1.0 },
  { r: 0.24, g: 0.56, b: 1.0 }, { r: 0.04, g: 0.18, b: 0.82 },
  { r: 0.34, g: 0.68, b: 1.0 }, { r: 0.12, g: 0.52, b: 0.92 },
  { r: 0.18, g: 0.34, b: 0.76 },
];

const baseVertex = `
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform vec2 texelSize;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const blurVertex = `
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
uniform vec2 texelSize;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  float offset = 1.33333333;
  vL = vUv - texelSize * offset;
  vR = vUv + texelSize * offset;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const shaders = {
  curl: `varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB; uniform sampler2D uVelocity;
void main(){float L=texture2D(uVelocity,vL).y;float R=texture2D(uVelocity,vR).y;float T=texture2D(uVelocity,vT).x;float B=texture2D(uVelocity,vB).x;float vorticity=R-L-T+B;gl_FragColor=vec4(0.5*vorticity,0.0,0.0,1.0);}`,
  vorticity: `varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB; uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform float curl; uniform float dt;
void main(){float L=texture2D(uCurl,vL).x;float R=texture2D(uCurl,vR).x;float T=texture2D(uCurl,vT).x;float B=texture2D(uCurl,vB).x;float C=texture2D(uCurl,vUv).x;vec2 force=0.5*vec2(abs(T)-abs(B),abs(R)-abs(L));force/=length(force)+0.0001;force*=curl*C;force.y*=-1.0;vec2 velocity=texture2D(uVelocity,vUv).xy;velocity+=force*dt;velocity=min(max(velocity,-1000.0),1000.0);gl_FragColor=vec4(velocity,0.0,1.0);}`,
  divergence: `varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB; uniform sampler2D uVelocity;
void main(){float L=texture2D(uVelocity,vL).x;float R=texture2D(uVelocity,vR).x;float T=texture2D(uVelocity,vT).y;float B=texture2D(uVelocity,vB).y;vec2 C=texture2D(uVelocity,vUv).xy;if(vL.x<0.0)L=-C.x;if(vR.x>1.0)R=-C.x;if(vT.y>1.0)T=-C.y;if(vB.y<0.0)B=-C.y;float div=0.5*(R-L+T-B);gl_FragColor=vec4(div,0.0,0.0,1.0);}`,
  pressure: `varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB; uniform sampler2D uPressure; uniform sampler2D uDivergence;
void main(){float L=texture2D(uPressure,vL).x;float R=texture2D(uPressure,vR).x;float T=texture2D(uPressure,vT).x;float B=texture2D(uPressure,vB).x;float divergence=texture2D(uDivergence,vUv).x;float pressure=(L+R+B+T-divergence)*0.25;gl_FragColor=vec4(pressure,0.0,0.0,1.0);}`,
  gradient: `varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB; uniform sampler2D uPressure; uniform sampler2D uVelocity;
void main(){float L=texture2D(uPressure,vL).x;float R=texture2D(uPressure,vR).x;float T=texture2D(uPressure,vT).x;float B=texture2D(uPressure,vB).x;vec2 velocity=texture2D(uVelocity,vUv).xy;velocity.xy-=vec2(R-L,T-B);gl_FragColor=vec4(velocity,0.0,1.0);}`,
  advection: `varying vec2 vUv; uniform sampler2D uVelocity; uniform sampler2D uSource; uniform vec2 texelSize; uniform float dt; uniform float dissipation;
void main(){vec2 coord=vUv-dt*texture2D(uVelocity,vUv).xy*texelSize;vec4 result=texture2D(uSource,coord);float decay=1.0+dissipation*dt;gl_FragColor=result/decay;}`,
  splat: `varying vec2 vUv; uniform sampler2D uTarget; uniform float aspectRatio; uniform vec3 color; uniform vec2 point; uniform float radius;
void main(){vec2 p=vUv-point.xy;p.x*=aspectRatio;vec3 splat=exp(-dot(p,p)/radius)*color;vec3 base=texture2D(uTarget,vUv).xyz;gl_FragColor=vec4(base+splat,1.0);}`,
  copy: `varying vec2 vUv; uniform sampler2D uTexture; void main(){gl_FragColor=texture2D(uTexture,vUv);}`,
  clear: `varying vec2 vUv; uniform sampler2D uTexture; uniform float value; void main(){gl_FragColor=value*texture2D(uTexture,vUv);}`,
  bloomPrefilter: `varying vec2 vUv; uniform sampler2D uTexture; uniform vec3 curve; uniform float threshold;
void main(){vec3 c=texture2D(uTexture,vUv).rgb;float br=max(c.r,max(c.g,c.b));float rq=clamp(br-curve.x,0.0,curve.y);rq=curve.z*rq*rq;c*=max(rq,br-threshold)/max(br,0.0001);gl_FragColor=vec4(c,0.0);}`,
  bloomBlur: `varying vec2 vL;varying vec2 vR;varying vec2 vT;varying vec2 vB;uniform sampler2D uTexture;
void main(){vec4 sum=vec4(0.0);sum+=texture2D(uTexture,vL);sum+=texture2D(uTexture,vR);sum+=texture2D(uTexture,vT);sum+=texture2D(uTexture,vB);gl_FragColor=sum*0.25;}`,
  bloomFinal: `varying vec2 vL;varying vec2 vR;varying vec2 vT;varying vec2 vB;uniform sampler2D uTexture;uniform float intensity;
void main(){vec4 sum=vec4(0.0);sum+=texture2D(uTexture,vL);sum+=texture2D(uTexture,vR);sum+=texture2D(uTexture,vT);sum+=texture2D(uTexture,vB);gl_FragColor=sum*0.25*intensity;}`,
  sunMask: `varying vec2 vUv;uniform sampler2D uTexture;void main(){vec4 c=texture2D(uTexture,vUv);float br=max(c.r,max(c.g,c.b));c.a=1.0-min(max(br*20.0,0.0),0.8);gl_FragColor=c;}`,
  sunrays: `varying vec2 vUv;uniform sampler2D uTexture;uniform float weight;
#define ITERATIONS 16
void main(){float Density=0.3;float Decay=0.95;float Exposure=0.7;vec2 coord=vUv;vec2 dir=vUv-0.5;dir*=1.0/float(ITERATIONS)*Density;float illuminationDecay=1.0;float color=texture2D(uTexture,vUv).a;for(int i=0;i<ITERATIONS;i++){coord-=dir;float col=texture2D(uTexture,coord).a;color+=col*illuminationDecay*weight;illuminationDecay*=Decay;}gl_FragColor=vec4(color*Exposure,0.0,0.0,1.0);}`,
  blur: `varying vec2 vUv;varying vec2 vL;varying vec2 vR;uniform sampler2D uTexture;void main(){vec4 sum=texture2D(uTexture,vUv)*0.29411764;sum+=texture2D(uTexture,vL)*0.35294117;sum+=texture2D(uTexture,vR)*0.35294117;gl_FragColor=sum;}`,
  output: `varying vec2 vUv;varying vec2 vL;varying vec2 vR;varying vec2 vT;varying vec2 vB;uniform sampler2D uTexture;uniform sampler2D uBloom;uniform sampler2D uSunrays;uniform vec2 texelSize;
vec3 linearToGamma(vec3 color){color=max(color,vec3(0));return max(1.055*pow(color,vec3(0.416666667))-0.055,vec3(0));}
void main(){vec3 c=texture2D(uTexture,vUv).rgb;
#ifdef SHADING
vec3 lc=texture2D(uTexture,vL).rgb;vec3 rc=texture2D(uTexture,vR).rgb;vec3 tc=texture2D(uTexture,vT).rgb;vec3 bc=texture2D(uTexture,vB).rgb;float dx=length(rc)-length(lc);float dy=length(tc)-length(bc);vec3 n=normalize(vec3(dx,dy,length(texelSize)));vec3 l=vec3(0.0,0.0,1.0);float diffuse=clamp(dot(n,l)+0.7,0.7,1.0);c*=diffuse;
#endif
#ifdef BLOOM
vec3 bloom=texture2D(uBloom,vUv).rgb;
#endif
#ifdef SUNRAYS
float sunrays=texture2D(uSunrays,vUv).r;c*=sunrays;
#ifdef BLOOM
bloom*=sunrays;
#endif
#endif
#ifdef BLOOM
bloom=linearToGamma(bloom);c+=bloom;
#endif
float a=max(c.r,max(c.g,c.b));gl_FragColor=vec4(c,a);}`,
};

const vec2 = () => ({ value: new THREE.Vector2() });
const vec3 = () => ({ value: new THREE.Vector3() });
const texture = () => ({ value: null });
const scalar = (value = 0) => ({ value });
const material = (vertexShader, fragmentShader, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, depthTest: false, depthWrite: false, ...extra });

function resolution(base, width, height) {
  let ratio = width / height;
  if (ratio < 1) ratio = 1 / ratio;
  const min = Math.round(base);
  const max = Math.round(base * ratio);
  return width > height ? { width: max, height: min } : { width: min, height: max };
}
function target(width, height, filter) {
  return { target: new THREE.WebGLRenderTarget(width, height, { minFilter: filter, magFilter: filter, type: THREE.HalfFloatType, format: THREE.RGBAFormat, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false, stencilBuffer: false }), texelSizeX: 1 / width, texelSizeY: 1 / height };
}
function doubleTarget(width, height, filter) {
  let read = target(width, height, filter); let write = target(width, height, filter);
  return { get read() { return read; }, get write() { return write; }, texelSizeX: 1 / width, texelSizeY: 1 / height, swap() { [read, write] = [write, read]; } };
}
export function randomFluidColor() {
  const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  return { r: 0.15 * color.r, g: 0.15 * color.g, b: 0.15 * color.b };
}

export class FluidSimulation {
  constructor(renderer, width, height) {
    this.renderer = renderer; this.width = width; this.height = height; this.autoSplatTimer = 0;
    this.scene = new THREE.Scene(); this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.mesh.frustumCulled = false; this.scene.add(this.mesh);
    this.curlMat = material(baseVertex, shaders.curl, { texelSize: vec2(), uVelocity: texture() });
    this.vorticityMat = material(baseVertex, shaders.vorticity, { texelSize: vec2(), uVelocity: texture(), uCurl: texture(), curl: scalar(CONFIG.CURL), dt: scalar() });
    this.divergenceMat = material(baseVertex, shaders.divergence, { texelSize: vec2(), uVelocity: texture() });
    this.pressureMat = material(baseVertex, shaders.pressure, { texelSize: vec2(), uPressure: texture(), uDivergence: texture() });
    this.gradientMat = material(baseVertex, shaders.gradient, { texelSize: vec2(), uPressure: texture(), uVelocity: texture() });
    this.advectionMat = material(baseVertex, shaders.advection, { texelSize: vec2(), uVelocity: texture(), uSource: texture(), dt: scalar(), dissipation: scalar() });
    this.splatMat = material(baseVertex, shaders.splat, { texelSize: vec2(), uTarget: texture(), aspectRatio: scalar(), color: vec3(), point: vec2(), radius: scalar() });
    this.copyMat = material(baseVertex, shaders.copy, { texelSize: vec2(), uTexture: texture() });
    this.clearMat = material(baseVertex, shaders.clear, { texelSize: vec2(), uTexture: texture(), value: scalar() });
    this.bloomPreMat = material(baseVertex, shaders.bloomPrefilter, { texelSize: vec2(), uTexture: texture(), curve: vec3(), threshold: scalar() });
    this.bloomBlurMat = material(baseVertex, shaders.bloomBlur, { texelSize: vec2(), uTexture: texture() });
    this.bloomFinalMat = material(baseVertex, shaders.bloomFinal, { texelSize: vec2(), uTexture: texture(), intensity: scalar() });
    this.sunMaskMat = material(baseVertex, shaders.sunMask, { texelSize: vec2(), uTexture: texture() });
    this.sunMat = material(baseVertex, shaders.sunrays, { texelSize: vec2(), uTexture: texture(), weight: scalar() });
    this.blurMat = material(blurVertex, shaders.blur, { texelSize: vec2(), uTexture: texture() });
    this.initTargets(); this.multipleSplats(Math.floor(15 * Math.random()) + 8);
  }
  initTargets() {
    const sim = resolution(CONFIG.SIM_RESOLUTION, this.width, this.height), dye = resolution(CONFIG.DYE_RESOLUTION, this.width, this.height);
    this.velocity = doubleTarget(sim.width, sim.height, THREE.LinearFilter); this.dye = doubleTarget(dye.width, dye.height, THREE.LinearFilter); this.pressure = doubleTarget(sim.width, sim.height, THREE.NearestFilter);
    this.curl = target(sim.width, sim.height, THREE.NearestFilter); this.divergence = target(sim.width, sim.height, THREE.NearestFilter);
    const bloom = resolution(CONFIG.BLOOM_RESOLUTION, this.width, this.height); this.bloom = target(bloom.width, bloom.height, THREE.LinearFilter); this.bloomFBOs = [];
    for (let i = 0; i < CONFIG.BLOOM_ITERATIONS; i++) { const w = bloom.width >> (i + 1), h = bloom.height >> (i + 1); if (w < 2 || h < 2) break; this.bloomFBOs.push(target(w, h, THREE.LinearFilter)); }
    const sun = resolution(CONFIG.SUNRAYS_RESOLUTION, this.width, this.height); this.sunrays = target(sun.width, sun.height, THREE.LinearFilter); this.sunraysTemp = target(sun.width, sun.height, THREE.LinearFilter);
  }
  blit(mat, destination) { this.mesh.material = mat; this.renderer.setRenderTarget(destination); this.renderer.render(this.scene, this.camera); }
  setTexel(mat, x, y) { mat.uniforms.texelSize.value.set(x, y); }
  step(dt) {
    const v = this.velocity;
    this.setTexel(this.curlMat, v.texelSizeX, v.texelSizeY); this.curlMat.uniforms.uVelocity.value = v.read.target.texture; this.blit(this.curlMat, this.curl.target);
    this.setTexel(this.vorticityMat, v.texelSizeX, v.texelSizeY); Object.assign(this.vorticityMat.uniforms, {}); this.vorticityMat.uniforms.uVelocity.value = v.read.target.texture; this.vorticityMat.uniforms.uCurl.value = this.curl.target.texture; this.vorticityMat.uniforms.dt.value = dt; this.blit(this.vorticityMat, v.write.target); v.swap();
    this.setTexel(this.divergenceMat, v.texelSizeX, v.texelSizeY); this.divergenceMat.uniforms.uVelocity.value = v.read.target.texture; this.blit(this.divergenceMat, this.divergence.target);
    this.setTexel(this.clearMat, v.texelSizeX, v.texelSizeY); this.clearMat.uniforms.uTexture.value = this.pressure.read.target.texture; this.clearMat.uniforms.value.value = CONFIG.PRESSURE; this.blit(this.clearMat, this.pressure.write.target); this.pressure.swap();
    this.setTexel(this.pressureMat, v.texelSizeX, v.texelSizeY); this.pressureMat.uniforms.uDivergence.value = this.divergence.target.texture;
    for (let i = 0; i < CONFIG.PRESSURE_ITERATIONS; i++) { this.pressureMat.uniforms.uPressure.value = this.pressure.read.target.texture; this.blit(this.pressureMat, this.pressure.write.target); this.pressure.swap(); }
    this.setTexel(this.gradientMat, v.texelSizeX, v.texelSizeY); this.gradientMat.uniforms.uPressure.value = this.pressure.read.target.texture; this.gradientMat.uniforms.uVelocity.value = v.read.target.texture; this.blit(this.gradientMat, v.write.target); v.swap();
    this.setTexel(this.advectionMat, v.texelSizeX, v.texelSizeY); this.advectionMat.uniforms.uVelocity.value = v.read.target.texture; this.advectionMat.uniforms.uSource.value = v.read.target.texture; this.advectionMat.uniforms.dt.value = dt; this.advectionMat.uniforms.dissipation.value = CONFIG.VELOCITY_DISSIPATION; this.blit(this.advectionMat, v.write.target); v.swap();
    this.advectionMat.uniforms.uVelocity.value = v.read.target.texture; this.advectionMat.uniforms.uSource.value = this.dye.read.target.texture; this.advectionMat.uniforms.dissipation.value = CONFIG.DENSITY_DISSIPATION; this.blit(this.advectionMat, this.dye.write.target); this.dye.swap();
  }
  applyBloom() {
    if (this.bloomFBOs.length < 2) return;
    const knee = CONFIG.BLOOM_THRESHOLD * CONFIG.BLOOM_SOFT_KNEE + 0.0001, curve = CONFIG.BLOOM_THRESHOLD - knee;
    this.bloomPreMat.uniforms.uTexture.value = this.dye.read.target.texture; this.bloomPreMat.uniforms.curve.value.set(curve, 2 * knee, 0.25 / knee); this.bloomPreMat.uniforms.threshold.value = CONFIG.BLOOM_THRESHOLD; this.blit(this.bloomPreMat, this.bloom.target);
    let last = this.bloom;
    for (const fbo of this.bloomFBOs) { this.setTexel(this.bloomBlurMat, last.texelSizeX, last.texelSizeY); this.bloomBlurMat.uniforms.uTexture.value = last.target.texture; this.blit(this.bloomBlurMat, fbo.target); last = fbo; }
    this.bloomBlurMat.blending = THREE.CustomBlending; this.bloomBlurMat.blendSrc = THREE.OneFactor; this.bloomBlurMat.blendDst = THREE.OneFactor; this.bloomBlurMat.transparent = true;
    for (let i = this.bloomFBOs.length - 2; i >= 0; i--) { const fbo = this.bloomFBOs[i]; this.setTexel(this.bloomBlurMat, last.texelSizeX, last.texelSizeY); this.bloomBlurMat.uniforms.uTexture.value = last.target.texture; this.blit(this.bloomBlurMat, fbo.target); last = fbo; }
    this.bloomBlurMat.blending = THREE.NormalBlending; this.bloomBlurMat.transparent = false; this.setTexel(this.bloomFinalMat, last.texelSizeX, last.texelSizeY); this.bloomFinalMat.uniforms.uTexture.value = last.target.texture; this.bloomFinalMat.uniforms.intensity.value = CONFIG.BLOOM_INTENSITY; this.blit(this.bloomFinalMat, this.bloom.target);
  }
  applySunrays() {
    this.sunMaskMat.uniforms.uTexture.value = this.dye.read.target.texture; this.blit(this.sunMaskMat, this.dye.write.target);
    this.sunMat.uniforms.weight.value = CONFIG.SUNRAYS_WEIGHT; this.sunMat.uniforms.uTexture.value = this.dye.write.target.texture; this.blit(this.sunMat, this.sunrays.target);
    this.blurMat.uniforms.texelSize.value.set(this.sunrays.texelSizeX, 0); this.blurMat.uniforms.uTexture.value = this.sunrays.target.texture; this.blit(this.blurMat, this.sunraysTemp.target);
    this.blurMat.uniforms.texelSize.value.set(0, this.sunrays.texelSizeY); this.blurMat.uniforms.uTexture.value = this.sunraysTemp.target.texture; this.blit(this.blurMat, this.sunrays.target);
  }
  splat(x, y, dx, dy, color) {
    const aspect = this.width / this.height; let radius = CONFIG.SPLAT_RADIUS / 100; if (aspect > 1) radius *= aspect;
    this.splatMat.uniforms.uTarget.value = this.velocity.read.target.texture; this.splatMat.uniforms.aspectRatio.value = aspect; this.splatMat.uniforms.point.value.set(x, y); this.splatMat.uniforms.color.value.set(dx, dy, 0); this.splatMat.uniforms.radius.value = radius; this.blit(this.splatMat, this.velocity.write.target); this.velocity.swap();
    this.splatMat.uniforms.uTarget.value = this.dye.read.target.texture; this.splatMat.uniforms.color.value.set(color.r, color.g, color.b); this.blit(this.splatMat, this.dye.write.target); this.dye.swap();
  }
  multipleSplats(count) { for (let i = 0; i < count; i++) { const c = randomFluidColor(); c.r *= 10; c.g *= 10; c.b *= 10; this.splat(Math.random(), Math.random(), 1000 * (Math.random() - 0.5), 1000 * (Math.random() - 0.5), c); } }
  get dyeTexture() { return this.dye.read.target.texture; }
  get bloomTexture() { return this.bloom.target.texture; }
  get sunraysTexture() { return this.sunrays.target.texture; }
  dispose() {
    const doubles = [this.velocity, this.dye, this.pressure];
    doubles.forEach((item) => { item.read.target.dispose(); item.write.target.dispose(); });
    [this.curl, this.divergence, this.bloom, ...this.bloomFBOs, this.sunrays, this.sunraysTemp].forEach((item) => item.target.dispose());
    this.mesh.geometry.dispose();
    [this.curlMat, this.vorticityMat, this.divergenceMat, this.pressureMat, this.gradientMat, this.advectionMat, this.splatMat, this.copyMat, this.clearMat, this.bloomPreMat, this.bloomBlurMat, this.bloomFinalMat, this.sunMaskMat, this.sunMat, this.blurMat].forEach((item) => item.dispose());
  }
}
