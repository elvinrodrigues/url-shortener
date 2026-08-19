import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, X, Check, RotateCcw, Zap, Info } from 'lucide-react';

interface DateTimePickerModalProps {
  isOpen: boolean;
  value: string; // ISO string, or empty
  isGuest?: boolean;
  onChange: (val: string) => void;
  onClose: () => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const DateTimePickerModal: React.FC<DateTimePickerModalProps> = ({
  isOpen,
  value,
  isGuest = false,
  onChange,
  onClose,
}) => {
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + (isGuest ? 30 : 7));
    defaultDate.setHours(18, 0, 0, 0);
    return defaultDate;
  });

  const [viewYear, setViewYear] = useState<number>(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(selectedDate.getMonth());

  // Time state (12-hour clock)
  const [hour12, setHour12] = useState<number>(() => {
    const h = selectedDate.getHours() % 12;
    return h === 0 ? 12 : h;
  });
  const [minute, setMinute] = useState<number>(selectedDate.getMinutes());
  const [ampm, setAmPm] = useState<'AM' | 'PM'>(selectedDate.getHours() >= 12 ? 'PM' : 'AM');

  useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        setSelectedDate(d);
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
        const h = d.getHours() % 12;
        setHour12(h === 0 ? 12 : h);
        setMinute(d.getMinutes());
        setAmPm(d.getHours() >= 12 ? 'PM' : 'AM');
      }
    } else {
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + (isGuest ? 30 : 7));
      defaultDate.setHours(18, 0, 0, 0);
      setSelectedDate(defaultDate);
      setViewYear(defaultDate.getFullYear());
      setViewMonth(defaultDate.getMonth());
      const h = defaultDate.getHours() % 12;
      setHour12(h === 0 ? 12 : h);
      setMinute(defaultDate.getMinutes());
      setAmPm(defaultDate.getHours() >= 12 ? 'PM' : 'AM');
    }
  }, [value, isOpen, isGuest]);

  if (!isOpen) return null;

  // Calendar math
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Maximum allowed date for guest users (strictly 30 days from today)
  const maxGuestDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  maxGuestDate.setHours(23, 59, 59, 999);

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
  const isMaxGuestMonth = isGuest && (
    viewYear > maxGuestDate.getFullYear() ||
    (viewYear === maxGuestDate.getFullYear() && viewMonth >= maxGuestDate.getMonth())
  );

  const prevMonth = () => {
    if (isCurrentMonth) return;
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (isMaxGuestMonth) return;
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const applyPreset = (durationMs: number) => {
    const now = new Date();
    const targetMs = isGuest ? Math.min(durationMs, 30 * 24 * 60 * 60 * 1000) : durationMs;
    const future = new Date(now.getTime() + targetMs);
    setSelectedDate(future);
    setViewYear(future.getFullYear());
    setViewMonth(future.getMonth());

    const h = future.getHours() % 12;
    setHour12(h === 0 ? 12 : h);
    setMinute(future.getMinutes());
    setAmPm(future.getHours() >= 12 ? 'PM' : 'AM');
  };

  const constructFinalDate = (dayNumber: number): Date => {
    let targetHour24 = hour12 % 12;
    if (ampm === 'PM') targetHour24 += 12;
    return new Date(viewYear, viewMonth, dayNumber, targetHour24, minute, 0, 0);
  };

  const handleSelectDay = (day: number) => {
    const newDate = constructFinalDate(day);
    if (isGuest && newDate > maxGuestDate) {
      setSelectedDate(maxGuestDate);
      return;
    }
    setSelectedDate(newDate);
  };

  const handleTimeChange = (h: number, m: number, p: 'AM' | 'PM') => {
    setHour12(h);
    setMinute(m);
    setAmPm(p);

    let targetHour24 = h % 12;
    if (p === 'PM') targetHour24 += 12;

    const newDate = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      targetHour24,
      m,
      0,
      0
    );

    if (isGuest && newDate > maxGuestDate) {
      setSelectedDate(maxGuestDate);
    } else {
      setSelectedDate(newDate);
    }
  };

  const handleApply = () => {
    let dateToSave = selectedDate;
    if (isGuest && selectedDate > maxGuestDate) {
      dateToSave = maxGuestDate;
    }
    onChange(dateToSave.toISOString());
    onClose();
  };

  const handleClear = () => {
    if (isGuest) {
      // For guests, reset to default 30 days
      const default30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      onChange(default30d.toISOString());
    } else {
      // For logged in users, clear to null (permanent link)
      onChange('');
    }
    onClose();
  };

  const getRelativeTime = (d: Date): string => {
    const diffMs = d.getTime() - new Date().getTime();
    if (diffMs <= 0) return 'Expired in past';
    const hours = Math.round(diffMs / (1000 * 60 * 60));
    if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
    const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
    return `in ${days} day${days === 1 ? '' : 's'}`;
  };

  const presets = isGuest
    ? [
        { label: '1 Hour', ms: 1 * 60 * 60 * 1000 },
        { label: '24 Hours', ms: 24 * 60 * 60 * 1000 },
        { label: '7 Days', ms: 7 * 24 * 60 * 60 * 1000 },
        { label: '30 Days (Max)', ms: 30 * 24 * 60 * 60 * 1000 },
      ]
    : [
        { label: '24 Hours', ms: 24 * 60 * 60 * 1000 },
        { label: '7 Days', ms: 7 * 24 * 60 * 60 * 1000 },
        { label: '30 Days', ms: 30 * 24 * 60 * 60 * 1000 },
        { label: '1 Year', ms: 365 * 24 * 60 * 60 * 1000 },
      ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
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
          maxWidth: '430px',
          backgroundColor: 'var(--bg-modal)',
          borderRadius: '1.35rem',
          padding: '1.5rem',
          boxShadow: 'var(--dock-shadow)',
          border: '1px solid var(--border-subtle)',
          position: 'relative',
          animation: 'fadeSlideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
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
              <CalendarIcon size={16} />
            </div>
            <h3 className="font-display" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-title)', margin: 0 }}>
              Set Expiration Date & Time
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {/* Quick Presets */}
          <div>
            <div
              className="font-mono"
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: 'var(--text-dim)',
                marginBottom: '0.45rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              <Zap size={12} color="#FF5A00" />
              <span>{isGuest ? 'Quick Presets (Max 30 Days for Guests)' : 'Quick Presets'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p.ms)}
                  className="btn-icon-action"
                  style={{
                    padding: '0.45rem 0.2rem',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    borderRadius: '7px',
                    textAlign: 'center',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Calendar Picker Card */}
          <div
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
              <button
                type="button"
                onClick={prevMonth}
                disabled={isCurrentMonth}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: isCurrentMonth ? 'var(--text-dim)' : 'var(--text-muted)',
                  cursor: isCurrentMonth ? 'not-allowed' : 'pointer',
                  padding: '3px',
                  opacity: isCurrentMonth ? 0.35 : 1,
                }}
                title={isCurrentMonth ? 'Cannot select past months' : 'Previous Month'}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-title)' }}>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </span>
              <button
                type="button"
                onClick={nextMonth}
                disabled={isMaxGuestMonth}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: isMaxGuestMonth ? 'var(--text-dim)' : 'var(--text-muted)',
                  cursor: isMaxGuestMonth ? 'not-allowed' : 'pointer',
                  padding: '3px',
                  opacity: isMaxGuestMonth ? 0.35 : 1,
                }}
                title={isMaxGuestMonth ? 'Guest links capped at 30 days. Sign in for longer dates.' : 'Next Month'}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Days of week header */}
            <div
              className="font-mono"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: '0.2rem',
                textAlign: 'center',
                fontSize: '0.7rem',
                color: 'var(--text-dim)',
                fontWeight: 600,
                marginBottom: '0.35rem',
              }}
            >
              <span>Su</span>
              <span>Mo</span>
              <span>Tu</span>
              <span>We</span>
              <span>Th</span>
              <span>Fr</span>
              <span>Sa</span>
            </div>

            {/* Calendar Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.25rem' }}>
              {Array.from({ length: firstDayOfMonth }).map((_, idx) => (
                <div key={`empty-${idx}`} />
              ))}

              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const dayNum = idx + 1;
                const cellDate = new Date(viewYear, viewMonth, dayNum);
                cellDate.setHours(0, 0, 0, 0);
                const isPast = cellDate < today;
                const isExceedingGuestLimit = isGuest && cellDate > maxGuestDate;
                const isDisabled = isPast || isExceedingGuestLimit;
                const isSelected =
                  selectedDate.getDate() === dayNum &&
                  selectedDate.getMonth() === viewMonth &&
                  selectedDate.getFullYear() === viewYear;

                return (
                  <button
                    key={`day-${dayNum}`}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleSelectDay(dayNum)}
                    style={{
                      padding: '0.4rem 0',
                      borderRadius: '7px',
                      border: isSelected ? '1px solid #FF5A00' : 'none',
                      background: isSelected
                        ? 'linear-gradient(135deg, #FF4500, #FF5A00)'
                        : isDisabled
                        ? 'transparent'
                        : 'var(--bg-card)',
                      color: isSelected ? '#FFFFFF' : isDisabled ? 'var(--text-dim)' : 'var(--text-main)',
                      fontSize: '0.8rem',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease',
                      opacity: isDisabled ? 0.3 : 1,
                    }}
                    title={isExceedingGuestLimit ? 'Guest links max duration is 30 days. Sign in to select dates beyond 30 days.' : ''}
                  >
                    {dayNum}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Clock Time Selector */}
          <div
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '0.7rem 0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-dim)', fontSize: '0.8rem' }} className="font-mono">
              <Clock size={15} color="#FF5A00" />
              <span>TIME:</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              {/* Hour Select */}
              <select
                value={hour12}
                onChange={(e) => handleTimeChange(parseInt(e.target.value), minute, ampm)}
                className="font-mono"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-main)',
                  padding: '0.3rem 0.45rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={`h-${i + 1}`} value={i + 1}>
                    {String(i + 1).padStart(2, '0')}
                  </option>
                ))}
              </select>

              <span style={{ fontWeight: 700, color: 'var(--text-dim)' }}>:</span>

              {/* Minute Select */}
              <select
                value={minute}
                onChange={(e) => handleTimeChange(hour12, parseInt(e.target.value), ampm)}
                className="font-mono"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-main)',
                  padding: '0.3rem 0.45rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                  <option key={`m-${m}`} value={m}>
                    {String(m).padStart(2, '0')}
                  </option>
                ))}
              </select>

              {/* AM/PM Toggle */}
              <div
                style={{
                  display: 'flex',
                  background: 'var(--bg-card)',
                  borderRadius: '6px',
                  padding: '2px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <button
                  type="button"
                  onClick={() => handleTimeChange(hour12, minute, 'AM')}
                  style={{
                    padding: '0.2rem 0.45rem',
                    fontSize: '0.72rem',
                    borderRadius: '4px',
                    border: 'none',
                    background: ampm === 'AM' ? 'linear-gradient(135deg, #FF4500, #FF5A00)' : 'transparent',
                    color: ampm === 'AM' ? '#FFFFFF' : 'var(--text-dim)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => handleTimeChange(hour12, minute, 'PM')}
                  style={{
                    padding: '0.2rem 0.45rem',
                    fontSize: '0.72rem',
                    borderRadius: '4px',
                    border: 'none',
                    background: ampm === 'PM' ? 'linear-gradient(135deg, #FF4500, #FF5A00)' : 'transparent',
                    color: ampm === 'PM' ? '#FFFFFF' : 'var(--text-dim)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  PM
                </button>
              </div>
            </div>
          </div>

          {/* Live Preview Display */}
          <div
            style={{
              background: 'var(--badge-orange-bg)',
              border: '1px solid var(--badge-orange-border)',
              borderRadius: '10px',
              padding: '0.65rem 0.85rem',
              fontSize: '0.82rem',
              color: 'var(--text-main)',
            }}
          >
            <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Expires on: </span>
            <span style={{ fontWeight: 700 }}>
              {selectedDate.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
            <span style={{ color: '#FF5A00', marginLeft: '0.45rem', fontWeight: 700 }}>
              ({getRelativeTime(selectedDate)})
            </span>
          </div>

          {isGuest && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.75rem',
                color: 'var(--text-dim)',
                padding: '0.25rem 0.4rem',
              }}
            >
              <Info size={13} color="#FF5A00" style={{ flexShrink: 0 }} />
              <span>Guest links expire in maximum 30 days. Sign in for permanent URLs.</span>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
            {!isGuest && (
              <button
                type="button"
                onClick={handleClear}
                className="btn-icon-action"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.55rem 0.85rem',
                  fontSize: '0.8rem',
                }}
              >
                <RotateCcw size={14} />
                <span>Permanent Link</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleApply}
              className="btn-pill-primary"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                padding: '0.55rem 0.85rem',
                fontSize: '0.85rem',
              }}
            >
              <Check size={16} />
              <span>Set Expiration</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
