import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import logoSrc from '../assets/newlogo.jpeg';
import { Menu, X } from 'lucide-react';

const LINKS = [
  { href: '#services', label: 'Services' },
  { href: '#why', label: 'Why us' },
  { href: '#visit', label: 'Visit us' },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 border-b transition-colors duration-200 ${
        scrolled ? 'border-line bg-white/85 backdrop-blur-md' : 'border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 lg:px-8">
        <a href="#top" className="pressable flex shrink-0 items-center" aria-label="Elite Blue Veterinary Center — home">
          <img src={logoSrc} alt="Elite Blue Veterinary Center" className="logo-blend h-11 w-auto object-contain" />
        </a>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-mute transition-colors hover:bg-brand-50 hover:text-brand-700"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to="/staff"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-mute transition-colors hover:text-brand-700 sm:block"
          >
            Staff sign in
          </Link>
          <a
            href="#book"
            className="pressable hidden rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 sm:inline-block"
          >
            Book appointment
          </a>
          <button
            onClick={() => setOpen((v) => !v)}
            className="pressable rounded-lg p-2 text-ink md:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-line bg-white px-5 py-3 md:hidden">
          <div className="flex flex-col">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-brand-50"
              >
                {l.label}
              </a>
            ))}
            <Link to="/staff" className="rounded-lg px-3 py-2.5 text-sm font-medium text-mute hover:bg-brand-50">
              Staff sign in
            </Link>
            <a
              href="#book"
              onClick={() => setOpen(false)}
              className="pressable mt-2 rounded-xl bg-brand-600 px-4 py-3 text-center text-sm font-semibold text-white"
            >
              Book appointment
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
