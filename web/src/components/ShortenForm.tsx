import React, { useState } from 'react';
import { ArrowRight, Clipboard, Sliders, Calendar, Clock, Tag, AlertCircle, Loader2, X } from 'lucide-react';
import { shortenURL, type CreateURLResponse } from '../api';
import { DateTimePickerModal } from './DateTimePickerModal';

interface ShortenFormProps {
  token: string;
  onSuccess: (res: CreateURLResponse, originalUrl: string, expiresAt?: string) => void;
}

export const ShortenForm: React.FC<ShortenFormProps> = ({ token, onSuccess }) => {
  const [longUrl, setLongUrl] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aliasError, setAliasError] = useState<string | null>(null);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setLongUrl(text);
        setError(null);
      }
    } catch {
      // Clipboard permission denied or unavailable
    }
  };

  const validateUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

const RESERVED_KEYWORDS = new Set([
  'health', 'shorten', 'stats', 'auth', 'user', 'users',
  'admin', 'api', 'dashboard', 'login', 'logout', 'register',
  'static', 'assets', 'favicon.ico', 'robots.txt', 'sitemap.xml',
  'index', 'home'
]);

  const handleCustomCodeChange = (val: string) => {
    setCustomCode(val);
    if (aliasError) setAliasError(null);
    const cleaned = val.trim();
    if (cleaned && !/^[a-zA-Z0-9_-]+$/.test(cleaned)) {
      setAliasError('Alias can only contain letters, numbers, hyphens & underscores');
    } else if (cleaned && RESERVED_KEYWORDS.has(cleaned.toLowerCase())) {
      setAliasError('That alias is a reserved keyword. Please choose another.');
    } else {
      setAliasError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!longUrl.trim()) {
      setError('Please enter a link to shorten');
      return;
    }

    let formattedUrl = longUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }

    if (!validateUrl(formattedUrl)) {
      setError("That doesn't look like a valid link. Check for a typo (e.g. https://example.com).");
      return;
    }

    if (customCode.trim() && !/^[a-zA-Z0-9_-]+$/.test(customCode.trim())) {
      setAliasError('Alias can only contain letters, numbers, hyphens & underscores');
      return;
    }

    let expiryISO: string | undefined = undefined;
    if (expiresAt.trim()) {
      const parsedDate = new Date(expiresAt);
      if (isNaN(parsedDate.getTime())) {
        setError('Please select a valid expiration date & time');
        return;
      }
      expiryISO = parsedDate.toISOString();
    }

    setLoading(true);
    setError(null);

    try {
      const payload: { long_url: string; custom_code?: string; expires_at?: string } = {
        long_url: formattedUrl,
      };

      if (customCode.trim()) {
        payload.custom_code = customCode.trim();
      }

      if (expiryISO) {
        payload.expires_at = expiryISO;
      }

      const res = await shortenURL(payload, token);
      onSuccess(res, formattedUrl, expiryISO);
      setLongUrl('');
      setCustomCode('');
      setExpiresAt('');
      setAliasError(null);
    } catch (err: any) {
      if (err.message && err.message.includes('already taken')) {
        setAliasError(err.message);
      } else {
        setError(err.message || 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
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
    <div className="glass-panel shorten-form-card">
      <form onSubmit={handleSubmit} className="shorten-form">
        <div className="form-main-group">
          <div className="input-wrapper">
            <input
              type="text"
              value={longUrl}
              onChange={(e) => {
                setLongUrl(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Paste any URL here (e.g. https://example.com/long-page)"
              className="url-input"
              disabled={loading}
              id="long-url-input"
            />
            <button
              type="button"
              onClick={handlePaste}
              className="btn-paste"
              title="Paste from clipboard"
            >
              <Clipboard size={15} />
              <span>Paste</span>
            </button>
          </div>

          <button type="submit" className="btn-submit" disabled={loading} id="shorten-submit-btn">
            {loading ? (
              <Loader2 className="spinner" size={18} />
            ) : (
              <>
                <span>Shorten</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>

        <div className="options-toggle-container">
          <button
            type="button"
            className={`btn-toggle-options ${showOptions || expiresAt ? 'active' : ''}`}
            onClick={() => setShowOptions(!showOptions)}
          >
            <Sliders size={14} />
            <span>{showOptions ? 'Hide Custom Options' : 'Custom Alias & Expiration'}</span>
          </button>

          {expiresAt && (
            <span
              className="badge font-mono"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: 'rgba(56, 189, 248, 0.12)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                padding: '0.25rem 0.6rem',
                fontSize: '0.75rem',
              }}
            >
              <Clock size={12} />
              <span>Expires: {formattedExpirationDisplay}</span>
              <button
                type="button"
                onClick={() => setExpiresAt('')}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                title="Remove expiration"
              >
                <X size={12} />
              </button>
            </span>
          )}
        </div>

        {showOptions && (
          <div className="advanced-options-grid">
            <div className="option-field">
              <label htmlFor="custom-code-input">
                <Tag size={14} />
                <span>Custom Alias (Optional)</span>
              </label>
              <input
                id="custom-code-input"
                type="text"
                placeholder="e.g. my-promo-link"
                value={customCode}
                onChange={(e) => handleCustomCodeChange(e.target.value)}
                maxLength={30}
                className={aliasError ? 'input-error' : ''}
              />
              {aliasError ? (
                <span className="field-error-text">{aliasError}</span>
              ) : (
                <span className="field-hint">Letters, numbers, hyphens & underscores allowed</span>
              )}
            </div>

            <div className="option-field">
              <label>
                <Calendar size={14} />
                <span>Expiration Date & Time</span>
              </label>
              <button
                type="button"
                onClick={() => setDateModalOpen(true)}
                className="btn-secondary-modal"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.65rem 0.85rem',
                  fontSize: '0.85rem',
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: expiresAt ? '#38bdf8' : '#94a3b8',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Clock size={15} />
                  <span>{expiresAt ? formattedExpirationDisplay : 'Pick Calendar & Clock Time'}</span>
                </div>
                <Calendar size={15} />
              </button>
              <span className="field-hint">
                {expiresAt ? 'Click to change or reset expiration' : 'Leave blank for permanent link'}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="error-banner">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
      </form>

      <DateTimePickerModal
        isOpen={dateModalOpen}
        value={expiresAt}
        onChange={(val) => setExpiresAt(val)}
        onClose={() => setDateModalOpen(false)}
      />
    </div>
  );
};
