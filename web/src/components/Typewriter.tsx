import React, { useState, useEffect } from 'react';

const words = ['shareable.', 'memorable.', 'trackable.', 'clean.', 'powerful.'];

export const Typewriter: React.FC = () => {
  const [wordIndex, setWordIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentWord = words[wordIndex];
    let timeout: NodeJS.Timeout;

    if (!isDeleting && charIndex < currentWord.length) {
      // Typing
      timeout = setTimeout(() => {
        setCharIndex((prev) => prev + 1);
      }, 110);
    } else if (!isDeleting && charIndex === currentWord.length) {
      // Pause before deleting
      timeout = setTimeout(() => {
        setIsDeleting(true);
      }, 2000);
    } else if (isDeleting && charIndex > 0) {
      // Deleting
      timeout = setTimeout(() => {
        setCharIndex((prev) => prev - 1);
      }, 55);
    } else if (isDeleting && charIndex === 0) {
      // Switch word
      setIsDeleting(false);
      setWordIndex((prev) => (prev + 1) % words.length);
    }

    return () => clearTimeout(timeout);
  }, [charIndex, isDeleting, wordIndex]);

  return (
    <span
      style={{
        color: '#FF5A00',
        display: 'inline-block',
        whiteSpace: 'nowrap',
      }}
    >
      <span>{words[wordIndex].substring(0, charIndex)}</span>
      <span className="cursor-blink" style={{ marginLeft: '2px', fontWeight: 300, color: '#FF5A00' }}>
        |
      </span>
    </span>
  );
};
