import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface CyberpunkCityProps {
  position?: [number, number, number];
  scale?: number;
  buildingCount?: number;
  colorPalette?: string[];
}

interface Building {
  position: [number, number, number];
  height: number;
  width: number;
  depth: number;
  color: string;
  windows: boolean;
  antenna: boolean;
}

/**
 * CyberpunkCity - A reusable glyph component for Loom
 * 
 * This glyph renders a procedural cyberpunk cityscape that can be
 * positioned anywhere in the Loom spatial canvas.
 * 
 * Usage:
 * <CyberpunkCity position={[0, -200, -500]} scale={1.5} buildingCount={30} />
 */
export function CyberpunkCity({
  position = [0, 0, 0],
  scale = 1,
  buildingCount = 25,
  colorPalette = ['#00ffff', '#ff00ff', '#ffff00', '#00ff00', '#ff0066', '#6600ff', '#ff3300'],
}: CyberpunkCityProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { viewport } = useThree();

  // Generate procedural buildings
  const buildings = useMemo<Building[]>(() => {
    const result: Building[] = [];
    const spreadX = 400 * scale;
    const spreadZ = 300 * scale;

    for (let i = 0; i < buildingCount; i++) {
      const height = (30 + Math.random() * 150) * scale;
      const width = (15 + Math.random() * 30) * scale;
      const depth = (15 + Math.random() * 30) * scale;

      result.push({
        position: [
          (Math.random() - 0.5) * spreadX,
          height / 2,
          (Math.random() - 0.5) * spreadZ,
        ],
        height,
        width,
        depth,
        color: colorPalette[Math.floor(Math.random() * colorPalette.length)],
        windows: Math.random() > 0.3,
        antenna: Math.random() > 0.7 && height > 100,
      });
    }
    return result;
  }, [buildingCount, scale, colorPalette]);

  // Animate building glow
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.children.forEach((child, i) => {
        if (child instanceof THREE.Group) {
          const buildingMesh = child.children[0] as THREE.Mesh;
          if (buildingMesh && buildingMesh.material instanceof THREE.MeshBasicMaterial) {
            buildingMesh.material.opacity = 
              0.3 + Math.sin(state.clock.elapsedTime * 1.5 + i * 0.5) * 0.15;
          }
        }
      });
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[500 * scale, 400 * scale]} />
        <meshBasicMaterial 
          color="#1a0a2e" 
          transparent 
          opacity={0.5}
        />
      </mesh>

      {/* Grid overlay */}
      <gridHelper
        args={[500 * scale, 40, '#ff00ff', '#00ffff']}
        position={[0, 1, 0]}
      />

      {/* Buildings */}
      {buildings.map((building, i) => (
        <group key={i} position={building.position}>
          {/* Main building structure */}
          <mesh>
            <boxGeometry args={[building.width, building.height, building.depth]} />
            <meshBasicMaterial
              color={building.color}
              transparent
              opacity={0.4}
              wireframe
            />
          </mesh>

          {/* Inner solid */}
          <mesh scale={[0.9, 0.98, 0.9]}>
            <boxGeometry args={[building.width, building.height, building.depth]} />
            <meshBasicMaterial
              color={building.color}
              transparent
              opacity={0.1}
            />
          </mesh>

          {/* Windows */}
          {building.windows && (
            <mesh position={[0, 0, building.depth / 2 + 0.5]}>
              <planeGeometry args={[building.width * 0.8, building.height * 0.9]} />
              <meshBasicMaterial
                color="#ffffff"
                transparent
                opacity={0.1}
              />
            </mesh>
          )}

          {/* Antenna */}
          {building.antenna && (
            <mesh position={[0, building.height / 2 + 15 * scale, 0]}>
              <cylinderGeometry args={[1 * scale, 2 * scale, 30 * scale]} />
              <meshBasicMaterial color="#ff0000" transparent opacity={0.8} />
            </mesh>
          )}

          {/* Roof light */}
          <mesh position={[0, building.height / 2 + 2, 0]}>
            <sphereGeometry args={[3 * scale, 8, 8]} />
            <meshBasicMaterial
              color={building.color}
              transparent
              opacity={0.8}
            />
          </mesh>
        </group>
      ))}

      {/* Floating holographic signs */}
      {[...Array(5)].map((_, i) => (
        <mesh
          key={`sign-${i}`}
          position={[
            (Math.random() - 0.5) * 300 * scale,
            80 + Math.random() * 100,
            (Math.random() - 0.5) * 200 * scale,
          ]}
          rotation={[0, Math.random() * Math.PI, 0]}
        >
          <planeGeometry args={[40 * scale, 20 * scale]} />
          <meshBasicMaterial
            color={colorPalette[Math.floor(Math.random() * colorPalette.length)]}
            transparent
            opacity={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

export default CyberpunkCity;

