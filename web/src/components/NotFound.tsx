import React from 'react';
import { Link2, Plus, Unlink } from 'lucide-react';

interface NotFoundProps {
  pathCode: string;
  isExpired?: boolean;
}

export const NotFound: React.FC<NotFoundProps> = ({ pathCode, isExpired = false }) => {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0a0a0b',
        color: '#f5f5f7',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        position: 'relative',
        overflowX: 'hidden',
        fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Top Blue Radial Glow matching Go template */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100vw',
          height: '500px',
          background: 'radial-gradient(circle at 50% 0%, rgba(76, 126, 243, 0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Header Logo Pill */}
      <a
        href="/"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 18px',
          backgroundColor: '#131316',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '9999px',
          marginBottom: '32px',
          textDecoration: 'none',
          color: '#f5f5f7',
          position: 'relative',
          zIndex: 1,
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontWeight: 700,
          fontSize: '1.05rem',
          letterSpacing: '-0.01em',
          transition: 'all 0.2s ease',
        }}
      >
        <Link2 size={18} color="#4c7ef3" />
        <span>Slug</span>
        <span
          className="font-mono"
          style={{
            fontSize: '0.65rem',
            padding: '2px 7px',
            borderRadius: '4px',
            backgroundColor: 'rgba(76, 126, 243, 0.12)',
            color: '#5f8df5',
            fontWeight: 600,
            letterSpacing: '0.05em',
          }}
        >
          URL SHORTENER
        </span>
      </a>

      {/* Main 404 Glass Card */}
      <div
        style={{
          backgroundColor: '#131316',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '18px',
          padding: '44px 32px 40px',
          textAlign: 'center',
          maxWidth: '520px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          position: 'relative',
          zIndex: 1,
          boxShadow: '0 16px 40px -12px rgba(0, 0, 0, 0.5)',
          animation: 'fadeSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        {/* Top subtle highlight line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '10%',
            right: '10%',
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent)',
          }}
        />

        {/* Broken link circle icon */}
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isExpired ? '#fcbb00' : '#ff4757',
            backgroundColor: isExpired ? 'rgba(252, 187, 0, 0.1)' : 'rgba(255, 71, 87, 0.1)',
            border: `1px solid ${isExpired ? 'rgba(252, 187, 0, 0.25)' : 'rgba(255, 71, 87, 0.25)'}`,
            boxShadow: isExpired
              ? '0 0 24px -2px rgba(252, 187, 0, 0.25)'
              : '0 0 24px -2px rgba(255, 71, 87, 0.25)',
            marginBottom: '2px',
          }}
        >
          <Unlink size={28} />
        </div>

        {/* Badge Pill */}
        <div
          className="font-mono"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '9999px',
            fontSize: '0.725rem',
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            backgroundColor: isExpired ? 'rgba(252, 187, 0, 0.1)' : 'rgba(255, 71, 87, 0.1)',
            color: isExpired ? '#fcbb00' : '#ff4757',
            border: `1px solid ${isExpired ? 'rgba(252, 187, 0, 0.25)' : 'rgba(255, 71, 87, 0.25)'}`,
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: 'currentColor',
              boxShadow: '0 0 6px currentColor',
            }}
          />
          {isExpired ? '410 // LINK EXPIRED' : '404 // LINK NOT FOUND'}
        </div>

        {/* Title */}
        <h1
          className="font-display"
          style={{
            fontSize: '1.85rem',
            fontWeight: 700,
            color: '#f5f5f7',
            letterSpacing: '-0.02em',
            margin: 0,
          }}
        >
          {isExpired ? 'This link has expired' : 'Destination unreachable'}
        </h1>

        {/* Target Path Box */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '12px',
            padding: '6px 14px',
            backgroundColor: '#0f0f12',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            margin: '2px 0',
          }}
        >
          <span
            className="font-mono"
            style={{ fontSize: '0.65rem', color: '#636366', fontWeight: 700, letterSpacing: '0.08em' }}
          >
            TARGET PATH
          </span>
          <span
            className="font-mono"
            style={{ fontSize: '0.85rem', fontWeight: 600, color: '#5f8df5' }}
          >
            /{pathCode}
          </span>
        </div>

        {/* Description */}
        <p style={{ color: '#8e8e93', fontSize: '0.925rem', lineHeight: 1.6, maxWidth: '420px', margin: 0 }}>
          {isExpired
            ? 'This short link has reached its scheduled expiration date and is no longer redirecting.'
            : 'The short link you are attempting to visit does not exist, was mistyped, or has been removed.'}
        </p>

        {/* Action Button */}
        <a
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '11px 22px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #4c7ef3 0%, #60a5fa 50%, #818cf8 100%)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            color: '#ffffff',
            fontSize: '0.825rem',
            fontWeight: 600,
            textDecoration: 'none',
            marginTop: '8px',
            boxShadow: '0 4px 14px 0 rgba(76, 126, 243, 0.35)',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            cursor: 'pointer',
          }}
        >
          <Plus size={16} />
          <span>Shorten a New Link</span>
        </a>
      </div>

      {/* Footer Note */}
      <div
        style={{
          marginTop: '40px',
          fontSize: '0.8rem',
          color: '#636366',
          textAlign: 'center',
          position: 'relative',
          zIndex: 1,
          lineHeight: 1.6,
        }}
      >
        <p>Don't shorten links to illegal, phishing, or harmful content.</p>
        <p className="font-mono" style={{ fontSize: '0.725rem', marginTop: '4px' }}>
          Elvin Rodrigues — Slug • Go 1.26 • PostgreSQL 15 • Redis 7
        </p>
      </div>
    </div>
  );
};
