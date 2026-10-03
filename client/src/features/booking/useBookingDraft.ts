import { useCallback, useEffect, useState } from 'react';
import type { SlotDto } from '@shared/types';
import type { DoctorChoice } from '../../lib/api';

export interface PatientDraft {
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  notes: string;
}

export interface BookingDraft {
  step: number;
  serviceId: number | null;
  doctorId: DoctorChoice | null;
  date: string | null;
  slot: SlotDto | null;
  patient: PatientDraft;
}

export const emptyDraft: BookingDraft = {
  step: 0,
  serviceId: null,
  doctorId: null,
  date: null,
  slot: null,
  patient: { patientName: '', patientPhone: '', patientEmail: '', notes: '' },
};

const KEY = 'nour.booking-draft.v1';

function load(): BookingDraft {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return emptyDraft;
    const parsed = JSON.parse(raw) as Partial<BookingDraft>;
    const draft = { ...emptyDraft, ...parsed, patient: { ...emptyDraft.patient, ...parsed.patient } };
    // A remembered time slot may have expired; make the patient pick it again.
    if (draft.slot && new Date(draft.slot.startsAt).getTime() < Date.now()) {
      return { ...draft, slot: null, step: Math.min(draft.step, 2) };
    }
    return draft;
  } catch {
    return emptyDraft;
  }
}

/** Booking wizard state, kept in sessionStorage so a refresh doesn't lose progress. */
export function useBookingDraft() {
  const [draft, setDraft] = useState<BookingDraft>(load);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(draft));
    } catch {
      // Storage unavailable (private mode etc.): the wizard still works in memory.
    }
  }, [draft]);

  const update = useCallback((patch: Partial<BookingDraft>) => setDraft((d) => ({ ...d, ...patch })), []);

  const reset = useCallback(() => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // ignore
    }
    setDraft(emptyDraft);
  }, []);

  return { draft, update, reset };
}
