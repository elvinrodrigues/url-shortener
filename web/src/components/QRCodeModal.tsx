import React, { useState, useRef } from 'react';
import { X, Download, Copy, Check, ExternalLink, QrCode as QrIcon } from 'lucide-react';

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
  const svgRef = useRef<SVGSVGElement | null>(null);

  const targetUrl = url || shortUrl || '';

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(targetUrl);
    if (onCopy) onCopy(targetUrl);
    if (onShowToast) onShowToast('Copied short link', targetUrl, 'success');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const svg = svgRef.current;
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      if (!ctx) return;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, 600, 600);
      ctx.drawImage(img, 0, 0, 600, 600);
      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.download = `qr-${shortCode}.png`;
      a.href = pngUrl;
      a.click();
      if (onShowToast) onShowToast('Downloaded QR Code', `Saved qr-${shortCode}.png`, 'success');
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
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
            padding: '1.25rem',
            borderRadius: '1rem',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.15)',
            marginBottom: '1.25rem',
            border: '1px solid rgba(0, 0, 0, 0.08)',
          }}
        >
          <svg
            ref={svgRef}
            width="200"
            height="200"
            viewBox="0 0 200 200"
            style={{ display: 'block' }}
          >
            {/* Background */}
            <rect width="200" height="200" fill="#FFFFFF" rx="8" />

            {/* Top Left Finder */}
            <rect x="20" y="20" width="45" height="45" fill="#0F0F12" rx="4" />
            <rect x="27" y="27" width="31" height="31" fill="#FFFFFF" rx="2" />
            <rect x="34" y="34" width="17" height="17" fill="#FF5A00" rx="2" />

            {/* Top Right Finder */}
            <rect x="135" y="20" width="45" height="45" fill="#0F0F12" rx="4" />
            <rect x="142" y="27" width="31" height="31" fill="#FFFFFF" rx="2" />
            <rect x="149" y="34" width="17" height="17" fill="#FF5A00" rx="2" />

            {/* Bottom Left Finder */}
            <rect x="20" y="135" width="45" height="45" fill="#0F0F12" rx="4" />
            <rect x="27" y="142" width="31" height="31" fill="#FFFFFF" rx="2" />
            <rect x="34" y="149" width="17" height="17" fill="#FF5A00" rx="2" />

            {/* Decorative Data Dots Matrix */}
            <rect x="75" y="25" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="90" y="25" width="8" height="8" fill="#FF5A00" rx="1.5" />
            <rect x="105" y="25" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="120" y="25" width="8" height="8" fill="#0F0F12" rx="1.5" />

            <rect x="75" y="40" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="105" y="40" width="8" height="8" fill="#FF5A00" rx="1.5" />
            <rect x="120" y="40" width="8" height="8" fill="#0F0F12" rx="1.5" />

            <rect x="75" y="55" width="8" height="8" fill="#FF5A00" rx="1.5" />
            <rect x="90" y="55" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="120" y="55" width="8" height="8" fill="#0F0F12" rx="1.5" />

            <rect x="25" y="75" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="40" y="75" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="55" y="75" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="75" y="75" width="8" height="8" fill="#FF5A00" rx="1.5" />
            <rect x="90" y="75" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="105" y="75" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="120" y="75" width="8" height="8" fill="#FF5A00" rx="1.5" />
            <rect x="140" y="75" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="155" y="75" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="170" y="75" width="8" height="8" fill="#0F0F12" rx="1.5" />

            <rect x="25" y="90" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="55" y="90" width="8" height="8" fill="#FF5A00" rx="1.5" />
            <rect x="75" y="90" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="90" y="90" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="105" y="90" width="8" height="8" fill="#FF5A00" rx="1.5" />
            <rect x="140" y="90" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="170" y="90" width="8" height="8" fill="#0F0F12" rx="1.5" />

            <rect x="25" y="105" width="8" height="8" fill="#FF5A00" rx="1.5" />
            <rect x="40" y="105" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="75" y="105" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="105" y="105" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="120" y="105" width="8" height="8" fill="#FF5A00" rx="1.5" />
            <rect x="155" y="105" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="170" y="105" width="8" height="8" fill="#0F0F12" rx="1.5" />

            <rect x="75" y="135" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="90" y="135" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="105" y="135" width="8" height="8" fill="#FF5A00" rx="1.5" />
            <rect x="120" y="135" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="140" y="135" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="155" y="135" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="170" y="135" width="8" height="8" fill="#FF5A00" rx="1.5" />

            <rect x="75" y="150" width="8" height="8" fill="#FF5A00" rx="1.5" />
            <rect x="105" y="150" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="140" y="150" width="8" height="8" fill="#FF5A00" rx="1.5" />
            <rect x="170" y="150" width="8" height="8" fill="#0F0F12" rx="1.5" />

            <rect x="75" y="165" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="90" y="165" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="105" y="165" width="8" height="8" fill="#0F0F12" rx="1.5" />
            <rect x="120" y="165" width="8" height="8" fill="#FF5A00" rx="1.5" />
            <rect x="155" y="165" width="8" height="8" fill="#0F0F12" rx="1.5" />
          </svg>
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
