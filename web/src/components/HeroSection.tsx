import React, { useState } from 'react';
import {
  Link2,
  ArrowRight,
  Loader2,
  Copy,
  Check,
  QrCode,
  BarChart3,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Clock,
  Calendar,
  AlertCircle,
  ClipboardPaste,
  Sparkles,
  X,
  Zap,
  ShieldCheck,
} from 'lucide-react';
import { shortenURL, getShortHost, type CreateURLResponse } from '../api.ts';
import { Typewriter } from './Typewriter.tsx';
import { DateTimePickerModal } from './DateTimePickerModal.tsx';

interface HeroSectionProps {
  token: string;
  onShortenSuccess: (res: CreateURLResponse, originalUrl: string, expiresAt?: string) => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
  onOpenQR: (url: string, code: string) => void;
  onViewStats: (code: string) => void;
  onOpenAuth: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  token,
  onShortenSuccess,
  onShowToast,
  onOpenQR,
  onViewStats,
  onOpenAuth,
}) => {
  const [url, setUrl] = useState('');
  const [customAlias, setCustomAlias] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<{
    res: CreateURLResponse;
    originalUrl: string;
    expiresAt?: string;
  } | null>(null);
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const displayHost = getShortHost();

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        onShowToast('Pasted URL from clipboard', text, 'info');
      }
    } catch {
      // clipboard permission fallback
    }
  };

  const handleShorten = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    let validUrl = url.trim();
    if (!/^https?:\/\//i.test(validUrl)) {
      validUrl = 'https://' + validUrl;
    }

    setLoading(true);
    setError(null);

    try {
      let expiryISO: string | undefined = undefined;
      if (expiresAt.trim()) {
        const parsedDate = new Date(expiresAt);
        if (isNaN(parsedDate.getTime())) {
          setError('Please select a valid expiration date & time');
          setLoading(false);
          return;
        }
        // If guest, cap at 30 days
        if (!token) {
          const maxGuestMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
          if (parsedDate.getTime() > maxGuestMs) {
            parsedDate.setTime(maxGuestMs);
          }
        }
        expiryISO = parsedDate.toISOString();
      } else if (!token) {
        // Unauthenticated guest without custom expiration defaults to 30 days (1 month)
        expiryISO = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }

      const payload: { long_url: string; custom_code?: string; expires_at?: string } = {
        long_url: validUrl,
      };
      if (customAlias.trim()) payload.custom_code = customAlias.trim();
      if (expiryISO) payload.expires_at = expiryISO;

      const res = await shortenURL(payload, token || undefined);
      setResult({ res, originalUrl: validUrl, expiresAt: payload.expires_at });
      setShowAuthPrompt(true);
      onShortenSuccess(res, validUrl, payload.expires_at);
      onShowToast('Short link created', res.short_url, 'success');

      // Clear input fields so user can immediately paste/type another URL
      setUrl('');
      setCustomAlias('');
      setExpiresAt('');
      setShowAdvanced(false);
    } catch (err: any) {
      setError(err.message || 'Failed to shorten URL');
      onShowToast('Shortening failed', err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.res.short_url);
    setCopied(true);
    onShowToast('Copied to clipboard', result.res.short_url, 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedExpirationDisplay = expiresAt
    ? new Date(expiresAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

  return (
    <section
      className="hero-section"
      style={{
        position: 'relative',
        padding: '7.5rem 1.25rem 2.5rem',
        maxWidth: '820px',
        margin: '0 auto',
        textAlign: 'center',
      }}
    >
      {/* Background radial spotlight */}
      <div
        style={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(750px, 90vw)',
          height: '420px',
          background: 'var(--spotlight-glow)',
          filter: 'blur(70px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Top Feature Pill Badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 14px',
            borderRadius: '9999px',
            backgroundColor: 'var(--badge-orange-bg)',
            border: '1px solid var(--badge-orange-border)',
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--badge-orange-text)',
            marginBottom: '1.25rem',
            boxShadow: '0 2px 14px rgba(255, 90, 0, 0.12)',
            letterSpacing: '0.02em',
            animation: 'fadeSlideIn 0.3s ease forwards',
          }}
        >
          <Sparkles size={13} color="#FF5A00" />
          <span>High-Performance Link Engine • Sub-millisecond Redis Caching</span>
        </div>

        {/* Main Hero Title */}
        <h1
          className="font-display hero-title"
          style={{
            fontSize: 'clamp(1.95rem, 5.8vw, 3.8rem)',
            fontWeight: 800,
            lineHeight: 1.16,
            letterSpacing: '-0.03em',
            marginBottom: '0.85rem',
            color: 'var(--text-title)',
          }}
        >
          Make your links <br />
          <span style={{ whiteSpace: 'nowrap', display: 'inline-block' }}>
            short, smart & <Typewriter />
          </span>
        </h1>

        {/* Subtitle */}
        <p
          className="hero-subtitle"
          style={{
            fontSize: 'clamp(0.88rem, 3.5vw, 1.02rem)',
            color: 'var(--text-muted)',
            maxWidth: 'min(90vw, 520px)',
            margin: '0 auto 1.85rem',
            lineHeight: 1.55,
          }}
        >
          Transform long, cluttered URLs into clean short links with instant redirection, live telemetry, and customizable QR codes.
        </p>

        {/* Glowing Pill Input Form (Transforms to mobile card on <520px) */}
        <div
          className="hero-form-container"
          style={{
            border: isInputFocused ? '1px solid rgba(255, 90, 0, 0.45)' : '1px solid var(--border-subtle)',
            boxShadow: isInputFocused
              ? '0 0 55px rgba(255, 90, 0, 0.35), 0 0 20px rgba(255, 90, 0, 0.18), 0 8px 24px rgba(0, 0, 0, 0.7)'
              : 'var(--input-shadow)',
          }}
        >
          <form onSubmit={handleShorten} className="hero-form-inner">
            <div className="hero-input-row">
              <Link2 size={16} color="#FF5A00" style={{ flexShrink: 0, opacity: 0.9 }} />

              <input
                type="text"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                placeholder="https://example.com/long-url"
                className="hero-input-field"
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-main)',
                  fontSize: '0.9rem',
                  fontFamily: 'inherit',
                  padding: '0.45rem 0.2rem',
                }}
              />

              {/* Paste button */}
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="hero-paste-btn"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  padding: '5px 6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  flexShrink: 0,
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-title)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
                title="Paste from clipboard"
              >
                <ClipboardPaste size={14} />
                <span className="paste-text">Paste</span>
              </button>
            </div>

            {/* Shorten Button: Vibrant Orange */}
            <button
              type="submit"
              disabled={loading}
              className="btn-pill-primary hero-submit-btn"
              style={{
                padding: '0.52rem 1.25rem',
                borderRadius: '9999px',
                flexShrink: 0,
                fontSize: '0.84rem',
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="spinner" />
                  <span>Shortening...</span>
                </>
              ) : (
                <>
                  <span>Shorten</span>
                  <ArrowRight size={13} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Sub-bar toggle: + Custom alias & expiration & active expiration badge */}
        <div
          style={{
            marginTop: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: '0.65rem',
          }}
        >
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              background: 'transparent',
              border: 'none',
              color: showAdvanced || expiresAt ? '#FF5A00' : 'var(--text-dim)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#FF5A00')}
            onMouseLeave={(e) => {
              if (!showAdvanced && !expiresAt) e.currentTarget.style.color = 'var(--text-dim)';
            }}
          >
            <span>{showAdvanced ? 'Hide options' : '+ Custom alias & expiration'}</span>
            {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {/* Active Expiration Capsule Badge */}
          {expiresAt && (
            <span
              className="font-mono"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                backgroundColor: 'rgba(255, 90, 0, 0.12)',
                color: '#FF5A00',
                border: '1px solid rgba(255, 90, 0, 0.3)',
                borderRadius: '9999px',
                padding: '0.2rem 0.65rem',
                fontSize: '0.74rem',
                fontWeight: 600,
              }}
            >
              <Clock size={11} />
              <span>Expires: {formattedExpirationDisplay}</span>
              <button
                type="button"
                onClick={() => setExpiresAt('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#FF5A00',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Remove expiration"
              >
                <X size={12} />
              </button>
            </span>
          )}
        </div>

        {/* Collapsible Advanced Options */}
        {showAdvanced && (
          <div
            style={{
              marginTop: '0.75rem',
              maxWidth: '560px',
              margin: '0.75rem auto 0',
              padding: '0.95rem 1.15rem',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '0.85rem',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
              animation: 'fadeSlideIn 0.15s ease forwards',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            {/* Custom Alias */}
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                Custom Alias (Optional)
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  padding: '0.45rem 0.75rem',
                  borderRadius: '8px',
                }}
              >
                <span className="font-mono" style={{ fontSize: '0.8rem', color: '#FF5A00', marginRight: '2px' }}>
                  {displayHost}
                </span>
                <input
                  type="text"
                  placeholder="custom-slug"
                  value={customAlias}
                  onChange={(e) => setCustomAlias(e.target.value)}
                  className="font-mono"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-main)',
                    fontSize: '0.85rem',
                  }}
                />
              </div>
            </div>

            {/* Custom Expiration Trigger Modal Button */}
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={12} />
                <span>Expiration Date & Time</span>
              </label>

              <button
                type="button"
                onClick={() => setDateModalOpen(true)}
                className="btn-icon-action"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.65rem 0.85rem',
                  fontSize: '0.82rem',
                  backgroundColor: 'var(--bg-input)',
                  border: `1px solid ${expiresAt ? 'rgba(255, 90, 0, 0.4)' : 'var(--border-subtle)'}`,
                  color: expiresAt ? '#FF5A00' : 'var(--text-muted)',
                  borderRadius: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={14} color={expiresAt ? '#FF5A00' : 'var(--text-dim)'} />
                  <span>
                    {expiresAt
                      ? formattedExpirationDisplay
                      : token
                      ? 'Select expiration (Default: Permanent Link)'
                      : 'Select expiration (Default: 30 Days)'}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: '#FF5A00', fontWeight: 600 }}>Set</span>
              </button>

              {!token && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                  <Sparkles size={11} color="#FF5A00" style={{ flexShrink: 0 }} />
                  <span>
                    Guest links expire in 30 days max.{' '}
                    <button
                      type="button"
                      onClick={onOpenAuth}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#FF5A00',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontSize: '0.74rem',
                        padding: 0,
                        textDecoration: 'underline',
                      }}
                    >
                      Sign in to extend time & get analytics
                    </button>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error notice */}
        {error && (
          <div
            style={{
              marginTop: '0.75rem',
              maxWidth: '560px',
              margin: '0.75rem auto 0',
              padding: '0.65rem 0.85rem',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '8px',
              color: '#EF4444',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              textAlign: 'left',
            }}
          >
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Result Capsule Pill */}
        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.65rem', marginTop: '1.25rem', width: '100%' }}>
            <div
              className="hero-result-card"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.35rem 0.45rem 0.35rem 1.15rem',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-hover)',
                borderRadius: '9999px',
                boxShadow: 'var(--card-shadow)',
                animation: 'fadeSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                maxWidth: '100%',
              }}
            >
              <a
                href={result.res.short_url}
                target="_blank"
                rel="noreferrer"
                className="font-mono hero-result-link"
                style={{
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  color: '#FF5A00',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{result.res.short_url}</span>
                <ExternalLink size={12} style={{ flexShrink: 0 }} />
              </a>

              <div className="hero-result-actions" style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => onViewStats(result.res.short_code)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 7px',
                    borderRadius: '6px',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-title)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                  title="Inspect Analytics"
                >
                  <BarChart3 size={13} color="#FF5A00" />
                  <span>Stats</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenQR(result.res.short_url, result.res.short_code)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '5px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-title)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                  title="QR Code"
                >
                  <QrCode size={14} />
                </button>

                {/* Orange Copy Button */}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="btn-pill-primary"
                  style={{
                    padding: '5px 12px',
                    fontSize: '0.78rem',
                  }}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Prompt for Guests */}
            {!token && showAuthPrompt && (
              <div
                className="hero-auth-prompt"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  padding: '0.4rem 0.65rem 0.4rem 0.95rem',
                  backgroundColor: 'var(--badge-orange-bg)',
                  border: '1px solid var(--badge-orange-border)',
                  borderRadius: '9999px',
                  fontSize: '0.76rem',
                  color: 'var(--text-main)',
                  animation: 'fadeSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                  maxWidth: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Sparkles size={12} color="#FF5A00" style={{ flexShrink: 0 }} />
                  <span>Link saved! Sign in to extend expiration, track analytics & sync.</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={onOpenAuth}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#FF5A00',
                      fontWeight: 700,
                      fontSize: '0.76rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '2px',
                      padding: '2px 4px',
                    }}
                  >
                    <span>Sign In</span>
                    <ArrowRight size={11} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowAuthPrompt(false)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-dim)',
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title="Dismiss"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Feature Highlights Bar */}
        <div
          style={{
            marginTop: '2.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: '0.65rem',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '9999px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              fontSize: '11.5px',
              color: 'var(--text-muted)',
              boxShadow: 'var(--card-shadow)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
            }}
          >
            <Zap size={13} color="#FF5A00" />
            <span><strong style={{ color: 'var(--text-main)' }}>&lt;1ms</strong> Redis Latency</span>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '9999px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              fontSize: '11.5px',
              color: 'var(--text-muted)',
              boxShadow: 'var(--card-shadow)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
            }}
          >
            <BarChart3 size={13} color="#FF5A00" />
            <span><strong style={{ color: 'var(--text-main)' }}>Live</strong> Click Telemetry</span>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '9999px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              fontSize: '11.5px',
              color: 'var(--text-muted)',
              boxShadow: 'var(--card-shadow)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
            }}
          >
            <QrCode size={13} color="#FF5A00" />
            <span><strong style={{ color: 'var(--text-main)' }}>Dynamic</strong> QR Codes</span>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '9999px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              fontSize: '11.5px',
              color: 'var(--text-muted)',
              boxShadow: 'var(--card-shadow)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
            }}
          >
            <ShieldCheck size={13} color="#FF5A00" />
            <span><strong style={{ color: 'var(--text-main)' }}>Custom</strong> Expiration & Sync</span>
          </div>
        </div>
      </div>

      {/* Date Time Picker Modal */}
      <DateTimePickerModal
        isOpen={dateModalOpen}
        value={expiresAt}
        isGuest={!token}
        onChange={(val: string) => {
          setExpiresAt(val);
          setDateModalOpen(false);
          onShowToast('Expiration set', 'Short URL will automatically expire', 'info');
        }}
        onClose={() => setDateModalOpen(false)}
      />
    </section>
  );
};
