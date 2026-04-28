export default function ScanIcon({ size = 24, color = "currentColor", strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" stroke={color} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round">
      {/* Top-left corner */}
      <path d="M3 9V5a2 2 0 0 1 2-2h4" />
      {/* Top-right corner */}
      <path d="M15 3h4a2 2 0 0 1 2 2v4" />
      {/* Bottom-right corner */}
      <path d="M21 15v4a2 2 0 0 1-2 2h-4" />
      {/* Bottom-left corner */}
      <path d="M9 21H5a2 2 0 0 1-2-2v-4" />
      {/* Center scan line */}
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  );
}
