import React, { useState } from 'react';
import { Typewriter } from './Typewriter.tsx';
import { DateTimePickerModal } from './DateTimePickerModal.tsx';
import {
  Link2,
  ArrowRight,
  Copy,
  Check,
  QrCode,
  Calendar,
  AlertCircle,
  BarChart3,
  Loader2,
  ClipboardPaste,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
} from 'lucide-react';
import { shortenURL, API_BASE_URL, type CreateURLResponse } from '../api.ts';

interface HeroSectionProps {
  token: string;
  onShortenSuccess: (res: CreateURLResponse, originalUrl: string, expiresAt?: string) => void;
  onViewStats: (code: string) => void;
  onOpenQR: (url: string, code: string) => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
  onOpenAuth: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  token,
  onShortenSuccess,
  onViewStats,
  onOpenQR,
  onShowToast,
  onOpenAuth,
}) => {
  const [url, setUrl] = useState('');
  const [customAlias, setCustomAlias] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ res: CreateURLResponse; originalUrl: string; expiresAt?: string } | null>(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const displayHost = API_BASE_URL.replace(/^https?:\/\//, '') + '/';

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        onShowToast('Pasted URL from clipboard', text, 'info');
      }
    } catch {
      // clipboard permission denied
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
        expiryISO = parsedDate.toISOString();
      }

      const payload: { long_url: string; custom_code?: string; expires_at?: string } = {
        long_url: validUrl,
      };
      if (customAlias.trim()) payload.custom_code = customAlias.trim();
      if (expiryISO) payload.expires_at = expiryISO;

      const res = await shortenURL(payload, token || undefined);
      setResult({ res, originalUrl: validUrl, expiresAt: payload.expires_at });
      setShowAuthPrompt(true); // show sign-in prompt for guest users
      onShortenSuccess(res, validUrl, payload.expires_at);
      onShowToast('Short link created', res.short_url, 'success');
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
      id="shortener"
      style={{
        position: 'relative',
        paddingTop: '6.5rem',
        paddingBottom: '2.5rem',
        textAlign: 'center',
      }}
    >
      {/* Pure Crisp White Ambient Spotlight Glow */}
      <div
        style={{
          position: 'absolute',
          top: '-12%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '820px',
          height: '520px',
          background: 'radial-gradient(ellipse at center, rgba(255, 255, 255, 0.13) 0%, rgba(255, 255, 255, 0.03) 45%, transparent 70%)',
          filter: 'blur(80px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: '740px',
          margin: '0 auto',
          padding: '0 1.25rem',
        }}
      >
        {/* Main Headline with Typewriter */}
        <h1
          className="font-display"
          style={{
            fontSize: 'clamp(2.2rem, 5vw, 3.6rem)',
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            color: '#FFFFFF',
            marginBottom: '0.85rem',
          }}
        >
          Make your links <br />
          short, smart & <Typewriter />
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontSize: '1rem',
            color: 'var(--text-muted)',
            maxWidth: '520px',
            margin: '0 auto 2rem',
            lineHeight: 1.5,
          }}
        >
          Turn long, messy URLs into neat short links with live click tracking and instant QR codes.
        </p>

        {/* Pure White Glowing Pill Input Form */}
        <div
          style={{
            position: 'relative',
            borderRadius: '9999px',
            backgroundColor: '#08080A',
            border: '1px solid rgba(255, 255, 255, 0.22)',
            boxShadow: '0 0 40px rgba(255, 255, 255, 0.16), 0 8px 24px rgba(0, 0, 0, 0.7)',
            padding: '5px 6px 5px 18px',
            display: 'flex',
            alignItems: 'center',
            backdropFilter: 'blur(16px)',
          }}
        >
          <form
            onSubmit={handleShorten}
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              gap: '0.5rem',
            }}
          >
            <Link2 size={17} color="#FFFFFF" style={{ flexShrink: 0, opacity: 0.8 }} />

            <input
              type="text"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/long-url"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#FFFFFF',
                fontSize: '0.92rem',
                fontFamily: 'inherit',
                padding: '0.45rem 0.25rem',
              }}
            />

            {/* Paste button */}
            <button
              type="button"
              onClick={handlePasteClipboard}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                padding: '5px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.78rem',
                fontWeight: 600,
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
              title="Paste from clipboard"
            >
              <ClipboardPaste size={13} />
              <span>Paste</span>
            </button>

            {/* Shorten Button: Vibrant Orange */}
            <button
              type="submit"
              disabled={loading}
              className="btn-pill-primary"
              style={{
                padding: '0.55rem 1.35rem',
                borderRadius: '9999px',
                flexShrink: 0,
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
                  <ArrowRight size={14} />
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Clock size={14} color={expiresAt ? '#FF5A00' : 'var(--text-dim)'} />
                  <span style={{ fontWeight: expiresAt ? 700 : 500 }}>
                    {expiresAt ? formattedExpirationDisplay : 'Pick Calendar & Clock Time (Quick Presets)'}
                  </span>
                </div>
                <Calendar size={14} color={expiresAt ? '#FF5A00' : 'var(--text-dim)'} />
              </button>
            </div>
          </div>
        )}

        {/* Error Message */}
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.65rem', marginTop: '1.25rem' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.35rem 0.45rem 0.35rem 1.15rem',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid rgba(255, 255, 255, 0.22)',
                borderRadius: '9999px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5), 0 0 25px rgba(255, 255, 255, 0.15)',
                animation: 'fadeSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              }}
            >
              <a
                href={result.res.short_url}
                target="_blank"
                rel="noreferrer"
                className="font-mono"
                style={{
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  color: '#FF5A00',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>{result.res.short_url}</span>
                <ExternalLink size={12} />
              </a>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
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
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
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

            {/* Prompt for Guests: "Sign in to manage your URLs and view analytics" */}
            {!token && showAuthPrompt && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  padding: '0.4rem 0.65rem 0.4rem 0.95rem',
                  backgroundColor: 'rgba(255, 90, 0, 0.08)',
                  border: '1px solid rgba(255, 90, 0, 0.25)',
                  borderRadius: '9999px',
                  fontSize: '0.76rem',
                  color: 'var(--text-main)',
                  animation: 'fadeSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Sparkles size={12} color="#FF5A00" />
                  <span>Sign in to manage your URLs and view analytics</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
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
      </div>

      {/* Expiration DateTimePickerModal */}
      <DateTimePickerModal
        isOpen={dateModalOpen}
        value={expiresAt}
        onChange={(val) => setExpiresAt(val)}
        onClose={() => setDateModalOpen(false)}
      />
    </section>
  );
};
