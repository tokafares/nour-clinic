import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { addDays, toZonedDateString, zonedTimeToUtc } from '../../shared/time.js';
import { computeSlots, type BusyInterval } from '../lib/slots.js';
import { generateReference } from '../lib/reference.js';
import { closeDb, getDb } from './client.js';
import { admins, appointments, doctors, services, workingHours } from './schema.js';
import type { Db } from './types.js';

export const DEMO_ADMIN = { email: 'admin@nourdental.demo', password: 'NourDemo2026', name: 'Clinic Manager' };

const photo = (id: string): string => `https://images.unsplash.com/${id}?w=600&h=600&fit=crop&crop=faces&q=80&auto=format`;

export const SEED_SERVICES = [
  {
    slug: 'checkup',
    name: 'Checkup & Consultation',
    description: 'Full oral exam, digital X-rays if needed, and a personalised treatment plan.',
    durationMin: 30,
    priceEgp: 400,
  },
  {
    slug: 'cleaning',
    name: 'Professional Cleaning',
    description: 'Scaling and polishing to remove plaque and tartar for healthier gums.',
    durationMin: 45,
    priceEgp: 750,
  },
  {
    slug: 'whitening',
    name: 'Teeth Whitening',
    description: 'In-chair whitening session for a brighter smile, several shades lighter.',
    durationMin: 90,
    priceEgp: 3500,
  },
  {
    slug: 'filling',
    name: 'Tooth-Coloured Filling',
    description: 'Composite filling that restores a decayed or chipped tooth and blends in naturally.',
    durationMin: 60,
    priceEgp: 1200,
  },
  {
    slug: 'braces-consult',
    name: 'Braces Consultation',
    description: 'Orthodontic assessment covering metal, ceramic and clear-aligner options.',
    durationMin: 30,
    priceEgp: 500,
  },
];

// weekday: 0 = Sunday … 6 = Saturday. The clinic is closed on Fridays.
export const SEED_DOCTORS = [
  {
    name: 'Dr. Nour Hassan',
    title: 'BDS, MSc Orthodontics',
    specialty: 'Orthodontics',
    bio: 'Founder of the clinic. Nour has spent 12 years straightening smiles with braces and clear aligners for children and adults.',
    photoUrl: photo('photo-1594824476967-48c8b964273f'),
    hours: [6, 1, 3].map((weekday) => ({ weekday, startMin: 10 * 60, endMin: 18 * 60 })),
  },
  {
    name: 'Dr. Karim Mansour',
    title: 'BDS, Restorative Dentistry',
    specialty: 'General & Restorative',
    bio: 'Karim focuses on preventive care, fillings and root-canal treatment, with a gentle approach for anxious patients.',
    photoUrl: photo('photo-1612349317150-e413f6a5b16d'),
    hours: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, startMin: 9 * 60, endMin: 17 * 60 })),
  },
  {
    name: 'Dr. Laila Farouk',
    title: 'BDS, Aesthetic Dentistry Diploma',
    specialty: 'Cosmetic Dentistry',
    bio: 'Laila designs natural-looking smiles through whitening, bonding and veneers, and loves a good before-and-after.',
    photoUrl: photo('photo-1559839734-2b71ea197ec2'),
    hours: [6, 0, 2, 4].map((weekday) => ({ weekday, startMin: 12 * 60, endMin: 20 * 60 })),
  },
];

const DEMO_PATIENTS = [
  ['Mariam Adel', '01001234567'],
  ['Omar Khaled', '01112345678'],
  ['Salma Youssef', '01223456789'],
  ['Youssef Ibrahim', '01534567890'],
  ['Hana Mostafa', '01045678901'],
  ['Ahmed Samir', '01156789012'],
  ['Farida Nabil', '01267890123'],
  ['Tarek Fathy', '01578901234'],
  ['Nadine Wael', '01089012345'],
  ['Mohamed Ashraf', '01190123456'],
] as const;

export async function seed(db: Db, opts: { now?: Date; demoAppointments?: boolean } = {}): Promise<void> {
  const now = opts.now ?? new Date();

  const passwordHash = await bcrypt.hash(DEMO_ADMIN.password, 10);
  await db
    .insert(admins)
    .values({ email: DEMO_ADMIN.email, name: DEMO_ADMIN.name, passwordHash })
    .onConflictDoUpdate({ target: admins.email, set: { passwordHash, name: DEMO_ADMIN.name } });

  for (const [i, s] of SEED_SERVICES.entries()) {
    await db
      .insert(services)
      .values({ ...s, sortOrder: i + 1 })
      .onConflictDoNothing({ target: services.slug });
  }

  for (const d of SEED_DOCTORS) {
    const { hours, ...doctor } = d;
    const [existing] = await db.select({ id: doctors.id }).from(doctors).where(eq(doctors.name, doctor.name));
    if (existing) continue;
    const [created] = await db.insert(doctors).values(doctor).returning({ id: doctors.id });
    if (!created) throw new Error(`Failed to insert ${doctor.name}`);
    await db.insert(workingHours).values(hours.map((h) => ({ ...h, doctorId: created.id })));
  }

  if (opts.demoAppointments === false) return;
  const [{ count } = { count: 0 }] = await db.select({ count: sql<number>`count(*)::int` }).from(appointments);
  if (count > 0) {
    console.log(`Skipping demo appointments (${count} already exist).`);
    return;
  }
  await seedDemoAppointments(db, now);
}

/** Spreads realistic demo appointments from 10 days ago to 10 days ahead so the dashboard has data. */
async function seedDemoAppointments(db: Db, now: Date): Promise<void> {
  const serviceRows = await db.select().from(services);
  const doctorRows = await db.select().from(doctors);
  const hourRows = await db.select().from(workingHours);
  const busy: BusyInterval[] = [];
  const today = toZonedDateString(now);
  let n = 0;

  for (let offset = -10; offset <= 10; offset++) {
    const date = addDays(today, offset);
    for (const doctor of doctorRows) {
      const shifts = hourRows.filter((h) => h.doctorId === doctor.id);
      // Deterministic pseudo-random pick so reseeding gives a similar picture.
      const perDay = (doctor.id + offset + 30) % 3 === 0 ? 1 : 2;
      for (let k = 0; k < perDay; k++) {
        const service = serviceRows[(n + doctor.id) % serviceRows.length];
        const patient = DEMO_PATIENTS[n % DEMO_PATIENTS.length];
        if (!service || !patient) continue;
        const slots = computeSlots({
          date,
          durationMin: service.durationMin,
          doctors: [{ doctorId: doctor.id, shifts }],
          busy,
          now: new Date(zonedTimeToUtc(date, 0).getTime() - 3 * 3_600_000), // ignore "now" for demo data
        });
        const slot = slots[(n * 5 + k * 7) % Math.max(slots.length, 1)];
        if (!slot) continue;
        const isPast = slot.endsAt.getTime() < now.getTime();
        const status = isPast ? (n % 9 === 0 ? 'no_show' : n % 7 === 0 ? 'cancelled' : 'completed') : n % 11 === 0 ? 'cancelled' : 'confirmed';
        await db.insert(appointments).values({
          reference: generateReference(),
          serviceId: service.id,
          doctorId: doctor.id,
          patientName: patient[0],
          patientPhone: patient[1],
          patientEmail: `${patient[0].toLowerCase().replace(/\s+/g, '.')}@example.com`,
          notes: n % 4 === 0 ? 'Prefers morning reminders by WhatsApp.' : '',
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          priceEgp: service.priceEgp,
          status,
          createdAt: new Date(slot.startsAt.getTime() - 5 * 86_400_000),
        });
        if (status !== 'cancelled') busy.push({ doctorId: doctor.id, startsAt: slot.startsAt, endsAt: slot.endsAt });
        n++;
      }
    }
  }
  console.log(`Inserted ${n} demo appointments.`);
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('server/db/seed.ts');
if (isMain) {
  seed(getDb())
    .then(() => console.log(`Seed complete. Demo admin: ${DEMO_ADMIN.email} / ${DEMO_ADMIN.password}`))
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
