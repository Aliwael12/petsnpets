import { useBookableServices, useOpeningHours } from '../api/appointments';
import { Reveal } from './Reveal';
import {
  Bath,
  Clock,
  HeartPulse,
  MapPin,
  PhoneCall,
  PawPrint,
  Scan,
  ShieldCheck,
  ShoppingBag,
  Stethoscope,
  Syringe,
  Scissors,
} from 'lucide-react';
import type { ComponentType } from 'react';

function money(piastres: number): string {
  return `EGP ${(piastres / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/** Matches a catalog service name to an icon. Falls back to the stethoscope so a service
 * added later in the CRM still renders correctly without a code change here. */
function iconForService(name: string): ComponentType<{ size?: number; className?: string }> {
  const n = name.toLowerCase();
  if (n.includes('vaccin')) return Syringe;
  if (n.includes('sonar') || n.includes('ultrasound') || n.includes('scan')) return Scan;
  if (n.includes('groom')) return Scissors;
  if (n.includes('bath') || n.includes('shower')) return Bath;
  if (n.includes('nail')) return PawPrint;
  return Stethoscope;
}

const SERVICE_BLURBS: Record<string, string> = {
  'General Checkup / Consultation': 'A full nose-to-tail examination with one of our vets, plus a written plan you take home.',
  'Vaccination Administration': 'Core and travel vaccines, with the next due date tracked for you so nothing is missed.',
  'Sonar (Ultrasound Scan)': 'In-house ultrasound imaging — diagnosis and results in the same visit, no referral needed.',
  'Full Grooming Service': 'Wash, cut, blow-dry, ears and nails, handled by groomers who work with anxious animals daily.',
  'Bath & Shower Service': 'Medicated or routine bathing with coat-appropriate products and a proper dry.',
  'Nail Trimming Service': 'A quick, low-stress trim — walk in, or add it onto any other appointment.',
};

export function Services() {
  const { data: services = [] } = useBookableServices();

  return (
    <section id="services" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 lg:px-8 lg:py-28">
      <Reveal>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">What we do</p>
        <h2 className="mt-2.5 max-w-2xl text-3xl font-bold leading-[1.12] text-ink sm:text-4xl">
          One clinic for check-ups, grooming and everything in between.
        </h2>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-mute">
          Prices below are the ones on our counter today — this page reads them straight from the clinic system, so what
          you see is what you pay.
        </p>
      </Reveal>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((service, i) => {
          const Icon = iconForService(service.name);
          return (
            <Reveal key={service.id} delay={Math.min(i, 5) * 60}>
              <article className="lift flex h-full flex-col rounded-2xl border border-line bg-white p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon size={18} />
                </span>
                <h3 className="mt-3.5 text-[17px] font-bold text-ink">{service.name}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-mute">
                  {SERVICE_BLURBS[service.name] ?? 'Booked and carried out by our clinical team at the 6th of October centre.'}
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3.5">
                  <span className="tnum text-[15px] font-bold text-brand-700">{money(service.unitPrice)}</span>
                  <a href="#book" className="pressable text-sm font-semibold text-brand-600 hover:text-brand-800">
                    Book →
                  </a>
                </div>
              </article>
            </Reveal>
          );
        })}
      </div>

      <Reveal delay={80}>
        <div className="mt-4 flex flex-col items-start gap-3 rounded-2xl border border-line bg-ground p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-brand-600">
              <ShoppingBag size={18} />
            </span>
            <div>
              <h3 className="text-[15px] font-bold text-ink">The shop is open too</h3>
              <p className="text-sm text-mute">Food, medicine, accessories and grooming supplies — no appointment needed.</p>
            </div>
          </div>
          <a href="#visit" className="pressable shrink-0 text-sm font-semibold text-brand-600 hover:text-brand-800">
            Opening hours →
          </a>
        </div>
      </Reveal>
    </section>
  );
}

const REASONS = [
  {
    icon: HeartPulse,
    title: 'Your pet’s history, in one place',
    body: 'Every visit, vaccine and treatment is recorded against your pet — so the vet seeing them in two years knows exactly what happened today.',
  },
  {
    icon: Clock,
    title: 'Reminders before things are due',
    body: 'Vaccines and follow-ups are tracked with a due date. We reach out before it lapses instead of waiting for you to remember.',
  },
  {
    icon: ShieldCheck,
    title: 'Prices agreed up front',
    body: 'You see the price when you book, and it is the same one on the invoice. No consultation-fee surprises at the counter.',
  },
  {
    icon: PhoneCall,
    title: 'A real person on the phone, 24/7',
    body: 'Emergencies do not keep opening hours. Someone from the clinic answers the emergency line at any time of night.',
  },
];

export function WhyUs() {
  return (
    <section id="why" className="scroll-mt-20 border-y border-line bg-ground">
      <div className="mx-auto max-w-6xl px-5 py-20 lg:px-8 lg:py-28">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">Why Elite Blue</p>
            <h2 className="mt-2.5 text-3xl font-bold leading-[1.12] text-ink sm:text-4xl">
              The care is the same whether anyone is watching.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-mute">
              We are a small team in 6th of October looking after a few thousand animals across Cairo. That means the vet who
              treats your pet is usually the one who remembers them — and the systems behind us are built so nothing
              falls through the cracks when they don&apos;t.
            </p>
            <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-line pt-6">
              {[
                ['12+', 'years open'],
                ['3,400', 'pets on record'],
                ['24/7', 'emergency line'],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="tnum font-display text-2xl font-extrabold text-brand-700">{value}</dt>
                  <dd className="mt-0.5 text-xs text-mute">{label}</dd>
                </div>
              ))}
            </dl>
          </Reveal>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {REASONS.map((r, i) => (
              <Reveal key={r.title} delay={i * 60}>
                <div className="lift h-full rounded-2xl border border-line bg-white p-5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <r.icon size={17} />
                  </span>
                  <h3 className="mt-3 text-[15px] font-bold text-ink">{r.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-mute">{r.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function hour12(h: number): string {
  const suffix = h >= 12 ? 'pm' : 'am';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${suffix}`;
}

export function Visit() {
  const { data: hours } = useOpeningHours();
  const todayIndex = new Date().getDay();

  // Collapse consecutive weekdays that share hours into one row ("Sat – Thu") rather
  // than printing seven near-identical lines.
  const rows: { label: string; hours: [number, number]; includesToday: boolean }[] = [];
  if (hours) {
    const order = [6, 0, 1, 2, 3, 4, 5]; // Saturday-first, matching the Egyptian week
    for (const day of order) {
      const dayHours = hours.hoursByWeekday[String(day)];
      if (!dayHours) continue;
      const last = rows[rows.length - 1];
      const sameAsLast = last && last.hours[0] === dayHours[0] && last.hours[1] === dayHours[1];
      if (sameAsLast) {
        last.label = `${last.label.split(' – ')[0]} – ${WEEKDAY_NAMES[day]}`;
        last.includesToday = last.includesToday || day === todayIndex;
      } else {
        rows.push({ label: WEEKDAY_NAMES[day], hours: dayHours, includesToday: day === todayIndex });
      }
    }
  }

  return (
    <section id="visit" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 lg:px-8 lg:py-28">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">Visit us</p>
          <h2 className="mt-2.5 text-3xl font-bold leading-[1.12] text-ink sm:text-4xl">Find us in 6th of October.</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-mute">
            Street parking out front, and the clinic is on the ground floor — no stairs with a carrier.
          </p>

          <div className="mt-7 flex flex-col gap-3">
            <a
              href="https://maps.google.com/?q=Central+Axis,+6th+of+October+City,+Giza"
              target="_blank"
              rel="noopener noreferrer"
              className="lift flex items-start gap-3.5 rounded-2xl border border-line bg-white p-4"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <MapPin size={17} />
              </span>
              <span>
                <span className="block text-[15px] font-bold text-ink">14 Central Axis, 6th of October City</span>
                <span className="block text-sm text-mute">Giza Governorate, Egypt · Open in Maps →</span>
              </span>
            </a>

            <a href="tel:+201094118811" className="lift flex items-start gap-3.5 rounded-2xl border border-line bg-white p-4">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <PhoneCall size={17} />
              </span>
              <span>
                <span className="tnum block text-[15px] font-bold text-ink">+20 109 411 8811</span>
                <span className="block text-sm text-mute">Reception, and the 24/7 emergency line</span>
              </span>
            </a>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <div className="rounded-2xl border border-line bg-white p-5 sm:p-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Clock size={17} />
              </span>
              <h3 className="text-[15px] font-bold text-ink">Opening hours</h3>
            </div>

            <dl className="mt-4 flex flex-col">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className={`flex items-center justify-between border-b border-line py-3 last:border-0 ${
                    row.includesToday ? 'text-ink' : 'text-mute'
                  }`}
                >
                  <dt className="flex items-center gap-2 text-sm font-medium">
                    {row.label}
                    {row.includesToday && (
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700">
                        Today
                      </span>
                    )}
                  </dt>
                  <dd className="tnum text-sm font-semibold">
                    {hour12(row.hours[0])} – {hour12(row.hours[1])}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="mt-4 rounded-xl bg-ground px-4 py-3 text-sm leading-relaxed text-mute">
              Outside these hours the clinic is closed, but the{' '}
              <span className="font-semibold text-ink">emergency line is always answered</span> — call and a vet will
              meet you here.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
