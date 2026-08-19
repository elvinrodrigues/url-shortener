import React, { useState, useEffect } from 'react';

interface CursorGlowProps {
  darkMode: boolean;
}

export const CursorGlow: React.FC<CursorGlowProps> = ({ darkMode }) => {
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: -1000, y: -1000 });
  const [visible, setVisible] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // Only enable glow on devices with a fine pointer (mouse/trackpad) and hover capability
    const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)');

    const handleMediaChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsSupported(e.matches);
      if (!e.matches) {
        setVisible(false);
      }
    };

    handleMediaChange(mediaQuery);

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange);
    } else {
      mediaQuery.addListener(handleMediaChange);
    }

    const handlePointerMove = (e: PointerEvent) => {
      // Explicitly ignore touch events
      if (e.pointerType === 'touch') return;
      if (!mediaQuery.matches) return;

      setMousePos({ x: e.clientX, y: e.clientY });
      setVisible(true);
    };

    const handlePointerLeave = () => {
      setVisible(false);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('mouseleave', handlePointerLeave);

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleMediaChange);
      } else {
        mediaQuery.removeListener(handleMediaChange);
      }
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('mouseleave', handlePointerLeave);
    };
  }, []);

  if (!isSupported) {
    return null;
  }

  return (
    <div
      className="cursor-glow"
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

