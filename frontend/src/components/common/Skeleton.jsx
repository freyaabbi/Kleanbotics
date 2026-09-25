import React from 'react';

// Pulsing placeholder block. Compose several to mimic a loading layout.
export default function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-sunk rounded-xl ${className}`} />;
}
