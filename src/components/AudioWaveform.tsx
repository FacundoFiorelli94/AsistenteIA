import React from 'react';

interface AudioWaveformProps {
  isActive: boolean;
  type: 'listening' | 'speaking' | 'processing';
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({ isActive, type }) => {
  if (!isActive) return null;

  const barCount = 12;
  const colorClass =
    type === 'listening'
      ? 'bg-rose-500'
      : type === 'speaking'
      ? 'bg-blue-400'
      : 'bg-emerald-400';

  return (
    <div className="flex items-center justify-center gap-1 h-6 px-3 py-1">
      {Array.from({ length: barCount }).map((_, index) => {
        const delay = (index * 0.08).toFixed(2);
        const duration = type === 'processing' ? '0.6s' : '0.8s';

        return (
          <span
            key={index}
            className={`w-1 rounded-full transition-all duration-150 ${colorClass}`}
            style={{
              height: isActive ? `${Math.max(6, Math.sin(index + Date.now() / 200) * 16 + 10)}px` : '4px',
              animation: `soundwave ${duration} ease-in-out infinite alternate`,
              animationDelay: `${delay}s`,
            }}
          />
        );
      })}
    </div>
  );
};
