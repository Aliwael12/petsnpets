import logoSrc from '../assets/newlogo.jpeg';

/** The source image is already a full lockup (mark + wordmark + tagline), so there's no
 * separate icon-only mark to render — every call site just picks a height. */
export function LogoLockup({ className = 'h-11' }: { className?: string }) {
  return <img src={logoSrc} alt="Elite Blue Veterinary Center" className={`w-auto object-contain ${className}`} />;
}
