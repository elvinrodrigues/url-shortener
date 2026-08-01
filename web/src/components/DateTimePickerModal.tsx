import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, X, Check, RotateCcw, Zap } from 'lucide-react';

interface DateTimePickerModalProps {
  isOpen: boolean;
  value: string; // ISO or date string, or empty
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
  onChange,
  onClose,
}) => {
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 7);
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
    }
  }, [value, isOpen]);

  if (!isOpen) return null;

  // Calendar math
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const applyPreset = (durationMs: number) => {
    const now = new Date();
    const future = new Date(now.getTime() + durationMs);
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
    const finalDate = new Date(viewYear, viewMonth, dayNumber, targetHour24, minute, 0, 0);
    return finalDate;
  };

  const handleSelectDay = (day: number) => {
    const newDate = constructFinalDate(day);
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
    setSelectedDate(newDate);
  };

  const handleApply = () => {
    onChange(selectedDate.toISOString());
    onClose();
  };

  const handleClear = () => {
    onChange('');
    onClose();
  };

  // Format relative time helper
  const getRelativeTime = (d: Date): string => {
    const diffMs = d.getTime() - new Date().getTime();
    if (diffMs <= 0) return 'Expired in past';
    const hours = Math.round(diffMs / (1000 * 60 * 60));
    if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
    const days = Math.round(hours / 24);
    return `in ${days} day${days === 1 ? '' : 's'}`;
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="glass-panel modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '440px', width: '92%' }}
      >
        <div className="modal-header">
          <div className="modal-title">
            <CalendarIcon size={18} className="text-gradient" />
            <h3>Set Expiration Date & Time</h3>
          </div>
          <button onClick={onClose} className="btn-close-modal">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ gap: '1rem', display: 'flex', flexDirection: 'column' }}>
          {/* Quick Presets */}
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }} className="font-mono">
              <Zap size={12} className="text-accent" /> QUICK PRESETS
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
              <button
                type="button"
                className="btn-secondary-modal"
                style={{ padding: '0.4rem 0.25rem', fontSize: '0.75rem' }}
                onClick={() => applyPreset(1 * 60 * 60 * 1000)}
              >
                1 Hour
              </button>
              <button
                type="button"
                className="btn-secondary-modal"
                style={{ padding: '0.4rem 0.25rem', fontSize: '0.75rem' }}
                onClick={() => applyPreset(24 * 60 * 60 * 1000)}
              >
                24 Hours
              </button>
              <button
                type="button"
                className="btn-secondary-modal"
                style={{ padding: '0.4rem 0.25rem', fontSize: '0.75rem' }}
                onClick={() => applyPreset(7 * 24 * 60 * 60 * 1000)}
              >
                7 Days
              </button>
              <button
                type="button"
                className="btn-secondary-modal"
                style={{ padding: '0.4rem 0.25rem', fontSize: '0.75rem' }}
                onClick={() => applyPreset(30 * 24 * 60 * 60 * 1000)}
              >
                30 Days
              </button>
            </div>
          </div>

          {/* Calendar Picker */}
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <button type="button" onClick={prevMonth} className="btn-close-modal" style={{ padding: '0.35rem' }}>
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </span>
              <button type="button" onClick={nextMonth} className="btn-close-modal" style={{ padding: '0.35rem' }}>
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Days of week header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.2rem', textAlign: 'center', fontSize: '0.7rem', color: '#64748b', fontWeight: 600, marginBottom: '0.4rem' }} className="font-mono">
              <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
            </div>

            {/* Calendar Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.25rem' }}>
              {Array.from({ length: firstDayOfMonth }).map((_, idx) => (
                <div key={`empty-${idx}`} />
              ))}

              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const dayNum = idx + 1;
                const cellDate = new Date(viewYear, viewMonth, dayNum);
                const isPast = cellDate < today;
                const isSelected =
                  selectedDate.getDate() === dayNum &&
                  selectedDate.getMonth() === viewMonth &&
                  selectedDate.getFullYear() === viewYear;

                return (
                  <button
                    key={`day-${dayNum}`}
                    type="button"
                    disabled={isPast}
                    onClick={() => handleSelectDay(dayNum)}
                    style={{
                      padding: '0.4rem 0',
                      borderRadius: '8px',
                      border: isSelected ? '1px solid #38bdf8' : 'none',
                      background: isSelected
                        ? 'linear-gradient(135deg, #0284c7, #0369a1)'
                        : isPast
                        ? 'transparent'
                        : 'rgba(255, 255, 255, 0.03)',
                      color: isSelected ? '#fff' : isPast ? '#334155' : '#e2e8f0',
                      fontSize: '0.8rem',
                      fontWeight: isSelected ? 700 : 400,
                      cursor: isPast ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {dayNum}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Clock Time Selector */}
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#94a3b8', fontSize: '0.8rem' }} className="font-mono">
              <Clock size={15} className="text-accent" />
              <span>TIME:</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              {/* Hour Select */}
              <select
                value={hour12}
                onChange={(e) => handleTimeChange(parseInt(e.target.value), minute, ampm)}
                className="font-mono"
                style={{ background: '#1e293b', border: '1px solid #334155', color: '#fff', padding: '0.3rem 0.4rem', borderRadius: '6px', fontSize: '0.85rem' }}
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={`h-${i + 1}`} value={i + 1}>
                    {String(i + 1).padStart(2, '0')}
                  </option>
                ))}
              </select>

              <span style={{ fontWeight: 700, color: '#64748b' }}>:</span>

              {/* Minute Select */}
              <select
                value={minute}
                onChange={(e) => handleTimeChange(hour12, parseInt(e.target.value), ampm)}
                className="font-mono"
                style={{ background: '#1e293b', border: '1px solid #334155', color: '#fff', padding: '0.3rem 0.4rem', borderRadius: '6px', fontSize: '0.85rem' }}
              >
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                  <option key={`m-${m}`} value={m}>
                    {String(m).padStart(2, '0')}
                  </option>
                ))}
              </select>

              {/* AM/PM Toggle */}
              <div style={{ display: 'flex', background: '#0f172a', borderRadius: '6px', padding: '2px', border: '1px solid #334155' }}>
                <button
                  type="button"
                  onClick={() => handleTimeChange(hour12, minute, 'AM')}
                  style={{
                    padding: '0.2rem 0.4rem',
                    fontSize: '0.7rem',
                    borderRadius: '4px',
                    border: 'none',
                    background: ampm === 'AM' ? '#0284c7' : 'transparent',
                    color: ampm === 'AM' ? '#fff' : '#64748b',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => handleTimeChange(hour12, minute, 'PM')}
                  style={{
                    padding: '0.2rem 0.4rem',
                    fontSize: '0.7rem',
                    borderRadius: '4px',
                    border: 'none',
                    background: ampm === 'PM' ? '#0284c7' : 'transparent',
                    color: ampm === 'PM' ? '#fff' : '#64748b',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  PM
                </button>
              </div>
            </div>
          </div>

          {/* Live Preview Display */}
          <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '10px', padding: '0.65rem 0.85rem', fontSize: '0.8rem', color: '#e0f2fe' }}>
            <span style={{ fontWeight: 600 }}>Expires on: </span>
            <span>{selectedDate.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
            <span style={{ color: '#38bdf8', marginLeft: '0.5rem', fontWeight: 600 }}>
              ({getRelativeTime(selectedDate)})
            </span>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
            {value && (
              <button
                type="button"
                onClick={handleClear}
                className="btn-secondary-modal"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.85rem', fontSize: '0.8rem' }}
              >
                <RotateCcw size={14} /> Clear (Permanent Link)
              </button>
            )}
            <button
              type="button"
              onClick={handleApply}
              className="btn-primary-modal"
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.5rem 0.85rem', fontSize: '0.85rem' }}
            >
              <Check size={16} /> Set Expiration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
