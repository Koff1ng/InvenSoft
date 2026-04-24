export default function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-sm py-8 transition-all">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--primary)]">
            <polyline points="20 12 20 22 4 22 4 12"/>
            <rect x="2" y="7" width="20" height="5"/>
            <line x1="12" y1="22" x2="12" y2="7"/>
            <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
            <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
          </svg>
          <span className="font-bold tracking-tight text-sm">La Comitiva</span>
        </div>
        <p className="text-xs text-[var(--text-subtle)] text-center md:text-right font-medium">
          Designed by Juan Trujillo © 2026. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  );
}
