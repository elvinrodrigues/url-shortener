import React, { useState, useEffect } from 'react';

interface CursorGlowProps {
  darkMode: boolean;
}

export const CursorGlow: React.FC<CursorGlowProps> = ({ darkMode }) => {
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: -1000, y: -1000 });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
      if (!visible) setVisible(true);
    };

    const handleMouseLeave = () => {
      setVisible(false);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [visible]);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.25s ease',
        background: darkMode
          ? `radial-gradient(650px circle at ${mousePos.x}px ${mousePos.y}px, rgba(255, 90, 0, 0.15) 0%, rgba(255, 140, 0, 0.06) 40%, rgba(255, 180, 0, 0.02) 65%, transparent 80%)`
          : `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, rgba(255, 90, 0, 0.12) 0%, rgba(255, 120, 30, 0.06) 40%, rgba(255, 160, 60, 0.02) 65%, transparent 80%)`,
      }}
    />
  );
};
