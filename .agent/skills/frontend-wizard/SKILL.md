---
name: frontend-wizard
description: Scaffolds React Three Fiber (R3F) components with best practices.
---

# Frontend Wizard: Component Generator

Use this skill when you need to create a new UI or 3D component for the React frontend. It ensures consistency with the "Neural Glass" design system and R3F performance best practices.

## Guidelines

1. **Immutability:** Always type props with an interface.
2. **Performance:** Use `useMemo` for heavy calculations and `useFrame` sparingly.
3. **Styling:** Use `tailwind-merge` (`twMerge`) for className props.

## Workflow

1. **Define Location:** check if `frontend-pro/src/components` exists.
2. **Create File:** Create `[ComponentName].tsx`.
3. **Boilerplate:**

```tsx
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import { twMerge } from 'tailwind-merge';

interface [ComponentName]Props {
  position?: [number, number, number];
  scale?: number;
  className?: string;
}

export const [ComponentName]: React.FC<[ComponentName]Props> = ({ 
  position = [0, 0, 0], 
  scale = 1,
  className 
}) => {
  const groupRef = useRef<Group>(null);

  // Example animation loop
  useFrame((state, delta) => {
    if (groupRef.current) {
      // groupRef.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <group ref={groupRef} position={position} scale={scale}>
      {/* 3D Content Here */}
      <mesh>
        <boxGeometry />
        <meshStandardMaterial color="#00f3ff" />
      </mesh>
    </group>
  );
};
```
