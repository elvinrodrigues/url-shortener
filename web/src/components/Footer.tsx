import React from 'react';
import { Github, Link2 } from 'lucide-react';

interface FooterProps {
  darkMode: boolean;
}

export const Footer: React.FC<FooterProps> = () => {
  return (
    <footer
      style={{
        maxWidth: '820px',
        margin: '0 auto',
        padding: '2.5rem 1.25rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        fontSize: '11.5px',
        color: 'var(--text-dim)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
        <Link2 size={13} color="#FF5A00" />
        <span>
          <strong style={{ color: 'var(--text-muted)' }}>Slug</strong> by Elvin Rodrigues
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        <span className="font-mono" style={{ fontSize: '11px' }}>
          Go 1.26 • PostgreSQL • Redis
        </span>
        <a
          href="https://github.com/elvinrodrigues/url-shortener"
          target="_blank"
          rel="noreferrer"
          style={{
            color: 'var(--text-main)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            textDecoration: 'none',
            fontWeight: 600,
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#FF5A00')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-main)')}
        >
          <Github size={13} />
          <span>GitHub</span>
        </a>
      </div>
    </footer>
  );
};
