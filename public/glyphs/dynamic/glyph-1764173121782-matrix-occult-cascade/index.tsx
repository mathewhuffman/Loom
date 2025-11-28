import * as THREE from 'three';
import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Plane } from '@react-three/drei';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform vec2 uResolution;
  uniform sampler2D uFontTex;
  uniform float uCharCount;

  varying vec2 vUv;

  float random(float x) {
    return fract(sin(x) * 43758.5453123);
  }

  void main() {
    float charSize = 24.0;
    vec2 grid = uResolution / charSize;
    vec2 cell = floor(vUv * grid);
    vec2 cellUV = fract(vUv * grid);

    float colRandom = random(cell.x);
    float speed = 8.0 + colRandom * 12.0;
    float offset = uTime * speed;
    float rowTotal = grid.y;
    float invY = rowTotal - cell.y;
    float streamPos = mod(offset, rowTotal + 20.0);
    float dist = streamPos - invY;
    float tailLen = 10.0 + colRandom * 15.0;

    float brightness = 0.0;
    bool isHead = false;

    if (dist >= 0.0 && dist < tailLen) {
      brightness = 1.0 - (dist / tailLen);
      if (dist < 1.0) {
        brightness = 2.5;
        isHead = true;
      }
    }

    float charChangeSpeed = 4.0;
    float charSeed = cell.x * 12.9898 + cell.y * 78.233 + floor(uTime * charChangeSpeed);
    float charIndex = floor(mod(random(charSeed) * 1000.0, uCharCount));

    float charWidthUV = 1.0 / uCharCount;
    float texU = (charIndex + cellUV.x * 0.8 + 0.1) * charWidthUV;
    float texV = cellUV.y;

    vec4 texColor = texture2D(uFontTex, vec2(texU, texV));

    if (texColor.r < 0.1) discard;

    vec3 matrixGreen = vec3(0.0, 1.0, 0.35);
    vec3 headColor = vec3(0.8, 1.0, 0.8);
    vec3 finalColor = matrixGreen;
    if (isHead) finalColor = headColor;

    gl_FragColor = vec4(finalColor * texColor.r * brightness, 1.0);
  }
`;

export default function MatrixOccultCascade() {
  const shaderRef = useRef(null);
  // ✅ Get BOTH viewport and size from useThree for proper resize handling
  const { viewport, size } = useThree();

  // Generate Texture Atlas
  const { texture, count } = useMemo(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const charList = "0101010101ZHꙮᚠᚢᚦᚨᚱᚲᚳᚷᚹᚻᚾᛁᛃᛈᛇᛉᛋᛏᛒᛖᛗᛚᛜᛝᛟᛞ☾☿♀♁♂♃♄";
    const charCount = charList.length;
    const fontSize = 64;
    canvas.width = charCount * fontSize;
    canvas.height = fontSize;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    for (let i = 0; i < charCount; i++) {
      ctx.fillStyle = '#ffffff';
      const char = charList[i];
      const x = i * fontSize + fontSize / 2;
      const y = fontSize / 2;
      ctx.fillText(char, x, y);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    
    return { texture: tex, count: charCount };
  }, []);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(size.width, size.height) },
    uFontTex: { value: texture },
    uCharCount: { value: count }
  }), [texture, count]);

  useFrame(() => {
    if (shaderRef.current) {
      shaderRef.current.uniforms.uTime.value += 0.016; // ~60fps delta
      // ✅ Update resolution using size from useThree (same source as viewport)
      shaderRef.current.uniforms.uResolution.value.set(size.width, size.height);
    }
  });

  return (
    // ✅ Use viewport from useThree (same source as size)
    <Plane args={[viewport.width, viewport.height]}>
      <shaderMaterial
        ref={shaderRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent={true}
        depthWrite={false}
      />
    </Plane>
  );
}
