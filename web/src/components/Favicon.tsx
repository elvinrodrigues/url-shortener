import React, { useState } from 'react';
import { Globe } from 'lucide-react';

interface FaviconProps {
  url: string;
  size?: number;
}

export const Favicon: React.FC<FaviconProps> = ({ url, size = 20 }) => {
  const [error, setError] = useState(false);

  let hostname = '';
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    hostname = parsed.hostname;
  } catch {
    hostname = '';
  }

  if (!hostname || error) {
    return (
      <div
        style={{
          width: `${size + 14}px`,
          height: `${size + 14}px`,
          borderRadius: '50%',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          flexShrink: 0,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
      >
        <Globe size={size - 2} />
      </div>
    );
  }

  const faviconSrc = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;

  return (
    <div
      style={{
        width: `${size + 14}px`,
        height: `${size + 14}px`,
        borderRadius: '50%',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
      }}
    >
      <img
        src={faviconSrc}
        alt=""
        width={size}
        height={size}
        onError={() => setError(true)}
        style={{
          borderRadius: '4px',
          objectFit: 'contain',
        }}
      />
    </div>
  );
};
