import React, { useState, useRef } from 'react';
import { X, Download, Copy, Check, ExternalLink, QrCode as QrIcon } from 'lucide-react';

interface QRCodeModalProps {
  isOpen: boolean;
  shortUrl: string;
  shortCode: string;
  onClose: () => void;
  onCopy: (text: string) => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  isOpen,
  shortUrl,
  shortCode,
  onClose,
  onCopy,
}) => {
  const [copied, setCopied] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  if (!isOpen) return null;

  const handleCopy = () => {
    onCopy(shortUrl);
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
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
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
          backgroundColor: '#0F0F12',
          borderRadius: '1.25rem',
          padding: '1.75rem',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
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
            <h3 className="font-display" style={{ fontSize: '1.15rem', fontWeight: 800, color: '#FFFFFF' }}>
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

        {/* QR Code Container */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            padding: '1.25rem',
            borderRadius: '1rem',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.25)',
            marginBottom: '1.25rem',
          }}
        >
          <svg
            ref={svgRef}
            width="200"
            height="200"
            viewBox="0 0 220 220"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="220" height="220" fill="white" />
            {/* Corner Marker Top Left */}
            <rect x="20" y="20" width="50" height="50" rx="10" fill="#0A0A0A" />
            <rect x="30" y="30" width="30" height="30" rx="6" fill="#FFFFFF" />
            <rect x="38" y="38" width="14" height="14" rx="3" fill="#FF5A00" />

            {/* Corner Marker Top Right */}
            <rect x="150" y="20" width="50" height="50" rx="10" fill="#0A0A0A" />
            <rect x="160" y="30" width="30" height="30" rx="6" fill="#FFFFFF" />
            <rect x="168" y="38" width="14" height="14" rx="3" fill="#FF5A00" />

            {/* Corner Marker Bottom Left */}
            <rect x="20" y="150" width="50" height="50" rx="10" fill="#0A0A0A" />
            <rect x="30" y="160" width="30" height="30" rx="6" fill="#FFFFFF" />
            <rect x="38" y="168" width="14" height="14" rx="3" fill="#FF5A00" />

            {/* Matrix Data Bits */}
            <rect x="80" y="25" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="100" y="25" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="120" y="25" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="80" y="45" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="110" y="45" width="20" height="10" rx="2" fill="#0A0A0A" />
            <rect x="90" y="65" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="110" y="65" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="130" y="65" width="10" height="10" rx="2" fill="#FF5A00" />

            <rect x="25" y="80" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="45" y="80" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="75" y="80" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="95" y="80" width="30" height="10" rx="2" fill="#0A0A0A" />
            <rect x="135" y="80" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="165" y="80" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="185" y="80" width="10" height="10" rx="2" fill="#0A0A0A" />

            <rect x="25" y="100" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="55" y="100" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="85" y="100" width="20" height="10" rx="2" fill="#FF5A00" />
            <rect x="115" y="100" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="145" y="100" width="20" height="10" rx="2" fill="#0A0A0A" />
            <rect x="175" y="100" width="20" height="10" rx="2" fill="#0A0A0A" />

            <rect x="25" y="120" width="20" height="10" rx="2" fill="#0A0A0A" />
            <rect x="65" y="120" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="95" y="120" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="125" y="120" width="20" height="10" rx="2" fill="#0A0A0A" />
            <rect x="155" y="120" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="185" y="120" width="10" height="10" rx="2" fill="#0A0A0A" />

            <rect x="85" y="145" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="105" y="145" width="20" height="10" rx="2" fill="#0A0A0A" />
            <rect x="135" y="145" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="155" y="145" width="20" height="10" rx="2" fill="#0A0A0A" />
            <rect x="185" y="145" width="10" height="10" rx="2" fill="#0A0A0A" />

            <rect x="85" y="165" width="20" height="10" rx="2" fill="#0A0A0A" />
            <rect x="115" y="165" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="135" y="165" width="20" height="10" rx="2" fill="#FF5A00" />
            <rect x="165" y="165" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="185" y="165" width="15" height="10" rx="2" fill="#0A0A0A" />

            <rect x="85" y="185" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="105" y="185" width="30" height="10" rx="2" fill="#0A0A0A" />
            <rect x="145" y="185" width="10" height="10" rx="2" fill="#0A0A0A" />
            <rect x="165" y="185" width="30" height="10" rx="2" fill="#0A0A0A" />
          </svg>
        </div>

        {/* URL Pill */}
        <div
          className="font-mono"
          style={{
            fontSize: '0.85rem',
            fontWeight: 700,
            color: '#FF5A00',
            backgroundColor: 'var(--bg-input)',
            padding: '0.5rem 0.75rem',
            borderRadius: '8px',
            marginBottom: '1.25rem',
            wordBreak: 'break-all',
          }}
        >
          {shortUrl}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
          <button
            type="button"
            onClick={handleCopy}
            className="btn-icon-action"
            style={{ width: '100%', padding: '0.6rem', fontSize: '0.85rem' }}
          >
            {copied ? <Check size={14} color="#FF5A00" /> : <Copy size={14} />}
            <span style={{ marginLeft: '4px' }}>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          {/* Orange Save PNG Button */}
          <button
            type="button"
            onClick={handleDownload}
            className="btn-pill-primary"
            style={{ width: '100%', padding: '0.6rem', fontSize: '0.85rem', justifyContent: 'center' }}
          >
            <Download size={14} />
            <span>Save PNG</span>
          </button>
        </div>

        <div style={{ marginTop: '0.75rem' }}>
          <a
            href={shortUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>Test open redirect</span>
            <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </div>
  );
};
