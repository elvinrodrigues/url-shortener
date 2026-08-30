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
        backgroundColor: '#09090b',
        color: '#EDEDED',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px',
        position: 'relative',
        overflowX: 'hidden',
        fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Top Orange Radial Glow */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100vw',
          height: '520px',
          background: 'radial-gradient(circle at 50% 0%, rgba(255, 90, 0, 0.22) 0%, rgba(255, 140, 0, 0.05) 50%, transparent 75%)',
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
          padding: '8px 20px',
          backgroundColor: 'rgba(18, 18, 22, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '9999px',
          marginBottom: '32px',
          textDecoration: 'none',
          color: '#FFFFFF',
          position: 'relative',
          zIndex: 1,
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontWeight: 800,
          fontSize: '1.1rem',
          letterSpacing: '-0.02em',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4), 0 0 15px rgba(255, 90, 0, 0.08)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          transition: 'all 0.25s ease',
        }}
      >
        <Link2 size={18} color="#FF5A00" strokeWidth={2.5} />
        <span>Slug</span>
        <span
          className="font-mono"
          style={{
            fontSize: '0.65rem',
            padding: '3px 8px',
            borderRadius: '9999px',
            backgroundColor: 'rgba(255, 90, 0, 0.12)',
            color: '#FF5A00',
            border: '1px solid rgba(255, 90, 0, 0.28)',
            fontWeight: 700,
            letterSpacing: '0.06em',
          }}
        >
          URL SHORTENER
        </span>
      </a>

      {/* Main 404 Glass Card */}
      <div
        style={{
          backgroundColor: 'rgba(15, 15, 18, 0.88)',
          border: '1px solid rgba(255, 255, 255, 0.09)',
          borderRadius: '22px',
          padding: '44px 34px 40px',
          textAlign: 'center',
          maxWidth: '520px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          position: 'relative',
          zIndex: 1,
          boxShadow: '0 20px 50px -15px rgba(0, 0, 0, 0.7), 0 0 30px rgba(255, 90, 0, 0.05)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          animation: 'fadeSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        {/* Top subtle highlight line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '15%',
            right: '15%',
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(255, 90, 0, 0.4), rgba(255, 255, 255, 0.3), rgba(255, 90, 0, 0.4), transparent)',
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
            color: isExpired ? '#F59E0B' : '#FF5A00',
            backgroundColor: isExpired ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255, 90, 0, 0.1)',
            border: `1px solid ${isExpired ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255, 90, 0, 0.3)'}`,
            boxShadow: isExpired
              ? '0 0 28px -2px rgba(245, 158, 11, 0.3)'
              : '0 0 28px -2px rgba(255, 90, 0, 0.3)',
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
            padding: '4px 12px',
            borderRadius: '9999px',
            fontSize: '0.725rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            backgroundColor: isExpired ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255, 90, 0, 0.1)',
            color: isExpired ? '#F59E0B' : '#FF5A00',
            border: `1px solid ${isExpired ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255, 90, 0, 0.3)'}`,
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
            fontSize: '1.95rem',
            fontWeight: 800,
            color: '#FFFFFF',
            letterSpacing: '-0.025em',
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
            padding: '7px 16px',
            backgroundColor: '#08080a',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            margin: '2px 0',
          }}
        >
          <span
            className="font-mono"
            style={{ fontSize: '0.65rem', color: '#8E8E93', fontWeight: 700, letterSpacing: '0.08em' }}
          >
            TARGET PATH
          </span>
          <span
            className="font-mono"
            style={{ fontSize: '0.9rem', fontWeight: 700, color: '#FF5A00' }}
          >
            /{pathCode}
          </span>
        </div>

        {/* Description */}
        <p style={{ color: '#8E8E93', fontSize: '0.925rem', lineHeight: 1.6, maxWidth: '420px', margin: 0 }}>
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
            padding: '12px 26px',
            borderRadius: '9999px',
            background: 'linear-gradient(135deg, #FF4500 0%, #FF5A00 50%, #F59E0B 100%)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#FFFFFF',
            fontSize: '0.85rem',
            fontWeight: 700,
            textDecoration: 'none',
            marginTop: '8px',
            boxShadow: '0 4px 18px 0 rgba(255, 90, 0, 0.38)',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            cursor: 'pointer',
          }}
        >
          <Plus size={16} strokeWidth={2.5} />
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
          Elvin Rodrigues — Slug • Go 1.26+ • PostgreSQL • Redis
        </p>
      </div>
    </div>
  );
};
