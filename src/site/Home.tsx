import { Link } from 'react-router-dom';
import { SiteNav } from './SiteNav';
import { BookingCard } from './BookingCard';
import { Services, Visit, WhyUs } from './Sections';
import { Reveal } from './Reveal';
import logoSrc from '../assets/newlogo.jpeg';
import { PawPrint, PhoneCall, ShieldCheck, Stethoscope } from 'lucide-react';

const TRUST = [
  { icon: Stethoscope, label: 'Licensed vets on site' },
  { icon: ShieldCheck, label: 'In-house lab & ultrasound' },
  { icon: PawPrint, label: 'Clinic, grooming & shop' },
];

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* A single soft brand wash behind the hero. Deliberately one quiet gradient
          rather than decorative blobs — the blue is the only bold move on the page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-gradient-to-b from-brand-50 via-brand-50/40 to-transparent"
      />
      <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-5 pb-16 pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-16 lg:px-8 lg:pb-24 lg:pt-16">
        <div>
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-brand-700">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-600" />
              </span>
              6th of October, Giza · Open today
            </span>
          </Reveal>

          <Reveal delay={60}>
            <h1 className="mt-5 text-[2.6rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-ink sm:text-6xl">
              Your pet is <span className="text-brand-600">family</span>.
              <br />
              We treat them like it.
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-mute sm:text-[17px]">
              Elite Blue is a full veterinary centre in 6th of October — consultations, vaccinations, ultrasound, grooming and a
              stocked pet shop, all under one roof. Book a time online and we&apos;ll call you back to confirm.
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a
                href="#book"
                className="pressable inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_12px_30px_-14px_rgb(20_84_163/0.9)] hover:bg-brand-700"
              >
                Book an appointment
              </a>
              <a
                href="tel:+201094118811"
                className="pressable inline-flex items-center gap-2 rounded-xl border border-line bg-white px-5 py-3.5 text-sm font-semibold text-ink hover:border-brand-300"
              >
                <PhoneCall size={16} className="text-brand-600" /> +20 109 411 8811
              </a>
            </div>
          </Reveal>

          <Reveal delay={240}>
            <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2.5 border-t border-line pt-6">
              {TRUST.map((t) => (
                <li key={t.label} className="flex items-center gap-2 text-sm text-mute">
                  <t.icon size={15} className="text-brand-500" />
                  {t.label}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={140}>
          <BookingCard />
        </Reveal>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="bg-brand-900 text-brand-100">
      <div className="mx-auto max-w-6xl px-5 py-14 lg:px-8">
        <div className="flex flex-col justify-between gap-10 sm:flex-row sm:gap-8">
          <div className="max-w-xs">
            {/* The logo file is dark-on-white, so the dark footer gets the wordmark
                set in type rather than a JPEG sitting in a white box. */}
            <p className="font-display text-xl font-extrabold tracking-tight text-white">
              Elite<span className="text-brand-300">Blue</span>
            </p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-300">Veterinary Center</p>
            <p className="mt-4 text-sm leading-relaxed text-brand-200/90">
              Clinic, grooming and pet shop in 6th of October, Giza. Caring for Cairo&apos;s animals since 2013.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:gap-14">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-brand-300">Clinic</h3>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                <li>
                  <a href="#services" className="text-brand-100/90 transition-colors hover:text-white">
                    Services &amp; prices
                  </a>
                </li>
                <li>
                  <a href="#why" className="text-brand-100/90 transition-colors hover:text-white">
                    Why Elite Blue
                  </a>
                </li>
                <li>
                  <a href="#book" className="text-brand-100/90 transition-colors hover:text-white">
                    Book an appointment
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-brand-300">Contact</h3>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                <li>
                  <a href="tel:+201094118811" className="tnum text-brand-100/90 transition-colors hover:text-white">
                    +20 109 411 8811
                  </a>
                </li>
                <li className="text-brand-100/90">14 Central Axis, 6th of October City</li>
                <li>
                  <Link to="/staff" className="text-brand-100/90 transition-colors hover:text-white">
                    Staff sign in
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-brand-200/70 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Elite Blue Veterinary Center. All rights reserved.</p>
          <p>Emergency line answered 24 hours a day.</p>
        </div>
      </div>
    </footer>
  );
}

export function Home() {
  return (
    <div data-site>
      <SiteNav />
      <main>
        <Hero />
        <Services />
        <WhyUs />
        <Visit />
        <section className="border-t border-line bg-white">
          <div className="mx-auto max-w-6xl px-5 py-16 lg:px-8 lg:py-20">
            <Reveal>
              <div className="flex flex-col items-center gap-5 rounded-3xl bg-brand-600 px-6 py-12 text-center sm:px-12">
                <img src={logoSrc} alt="" aria-hidden className="h-14 w-auto rounded-xl bg-white p-2" />
                <h2 className="max-w-lg text-2xl font-bold leading-tight text-white sm:text-3xl">
                  Ready when you are.
                </h2>
                <p className="max-w-md text-[15px] leading-relaxed text-brand-100">
                  Pick a time that suits you — it takes under a minute, and we&apos;ll call to confirm before you come in.
                </p>
                <a
                  href="#book"
                  className="pressable mt-1 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                >
                  Book an appointment
                </a>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
