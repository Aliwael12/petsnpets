import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  /** Stagger offset in ms. Keep between 30–80ms per sibling — longer reads as slow. */
  delay?: number;
  className?: string;
  as?: ElementType;
}

/**
 * Reveals its children once, when they scroll into view. Fires `once` deliberately:
 * re-animating on every scroll-past is decoration the reader has already seen, and it
 * makes long pages feel restless.
 *
 * The actual transition lives in CSS (`[data-reveal]` in index.css) rather than here, so
 * it runs off the main thread and stays smooth while React is busy.
 */
export function Reveal({ children, delay = 0, className = '', as: Tag = 'div' }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Anything already on screen at mount (the hero) should not wait for a scroll
    // event that may never come.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      data-reveal={shown ? 'shown' : ''}
      style={{ '--reveal-delay': `${delay}ms` } as React.CSSProperties}
      className={className}
    >
      {children}
    </Tag>
  );
}
