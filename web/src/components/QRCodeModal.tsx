import React, { useState, useEffect } from 'react';
import { X, Download, Copy, Check, ExternalLink, QrCode as QrIcon, Loader2 } from 'lucide-react';
import QRCode from 'qrcode';

interface QRCodeModalProps {
  url?: string;
  shortUrl?: string;
  shortCode: string;
  isOpen: boolean;
  onClose: () => void;
  onShowToast?: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
  onCopy?: (text: string) => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  url,
  shortUrl,
  shortCode,
  isOpen,
  onClose,
  onShowToast,
  onCopy,
}) => {
  const [copied, setCopied] = useState(false);
  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const [pngDataUrl, setPngDataUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const targetUrl = url || shortUrl || '';

  useEffect(() => {
    if (!isOpen || !targetUrl) return;

    let isMounted = true;
    setLoading(true);

    const generate = async () => {
      try {
        const [svg, dataUrl] = await Promise.all([
          QRCode.toString(targetUrl, {
            type: 'svg',
            margin: 2,
            errorCorrectionLevel: 'M',
            color: {
              dark: '#000000',
              light: '#FFFFFF',
            },
          }),
          QRCode.toDataURL(targetUrl, {
            width: 800,
            margin: 2,
            errorCorrectionLevel: 'H',
            color: {
              dark: '#000000',
              light: '#FFFFFF',
            },
          }),
        ]);

        if (isMounted) {
          setSvgMarkup(svg);
          setPngDataUrl(dataUrl);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) setLoading(false);
      }
    };

    generate();

    return () => {
      isMounted = false;
    };
  }, [isOpen, targetUrl]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(targetUrl);
    if (onCopy) onCopy(targetUrl);
    if (onShowToast) onShowToast('Copied short link', targetUrl, 'success');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!pngDataUrl) return;
    const a = document.createElement('a');
    a.download = `qr-${shortCode || 'link'}.png`;
    a.href = pngDataUrl;
    a.click();
    if (onShowToast) onShowToast('Downloaded QR Code', `Saved qr-${shortCode || 'link'}.png`, 'success');
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '1.5rem',
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '390px',
          backgroundColor: 'var(--bg-modal)',
          borderRadius: '1.25rem',
          padding: '1.75rem',
          boxShadow: 'var(--dock-shadow)',
          border: '1px solid var(--border-subtle)',
          textAlign: 'center',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 90, 0, 0.12)',
                color: '#FF5A00',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <QrIcon size={16} />
            </div>
            <h3 className="font-display" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-title)', margin: 0 }}>
              Dynamic QR Code
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* QR Code Container (Always white backing for scannability) */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            padding: '1.15rem',
            borderRadius: '1.25rem',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.18)',
            marginBottom: '1.25rem',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            width: '230px',
            height: '230px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: '#64748B' }}>
              <Loader2 size={26} className="spinner" color="#FF5A00" />
              <span style={{ fontSize: '11px', fontWeight: 600 }}>Generating QR...</span>
            </div>
          ) : svgMarkup ? (
            <div
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
          ) : pngDataUrl ? (
            <img
              src={pngDataUrl}
              alt={`QR Code for ${targetUrl}`}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <span style={{ fontSize: '12px', color: '#EF4444' }}>Failed to generate QR code</span>
          )}
        </div>

        {/* Short Link URL Pill */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '9999px',
            padding: '0.4rem 0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            marginBottom: '1.25rem',
          }}
        >
          <span
            className="font-mono"
            style={{
              fontSize: '0.8rem',
              fontWeight: 700,
              color: '#FF5A00',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {targetUrl}
          </span>

          <a
            href={targetUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--text-dim)', display: 'flex', alignItems: 'center' }}
            title="Open link"
          >
            <ExternalLink size={13} />
          </a>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={handleCopy}
            className="btn-icon-action"
            style={{ padding: '0.6rem', fontSize: '0.82rem', fontWeight: 600, gap: '5px' }}
          >
            {copied ? <Check size={14} color="#FF5A00" /> : <Copy size={14} />}
            <span>{copied ? 'Copied' : 'Copy Link'}</span>
          </button>

          {/* Orange Download Button */}
          <button
            type="button"
            onClick={handleDownload}
            className="btn-pill-primary"
            style={{ padding: '0.6rem', fontSize: '0.82rem', justifyContent: 'center', gap: '5px' }}
          >
            <Download size={14} />
            <span>Download PNG</span>
          </button>
        </div>
      </div>
    </div>
  );
};
