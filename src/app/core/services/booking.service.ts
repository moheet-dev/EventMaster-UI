import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SectionService, Section } from './section.service';
import { SeatService, SeatRow } from './seat.service';

// ── Booking-API specific interfaces ──────────────────────────────────────────

export interface BookingSection {
  id: number;
  name: string;
  tier: number;
  venue_id: number;
  seat_count: number;
  price: number;
}

export interface BookingSeat {
  status: 'AVAILABLE' | 'BOOKED' | 'HELD';
  timeout_at: string | null;
  seat_id: number;
  code: string;
}

/** One row of seats coming from /bookings/:eventId/sections/:sectionId/seats */
export interface BookingSeatRow {
  row_number: number;
  seats: BookingSeat[];
}

/** Section enriched with its loaded seat rows (new booking API) */
export interface BookingSectionWithSeats extends BookingSection {
  rows: BookingSeatRow[];
}

// Legacy interface kept for other callers
/** Section enriched with its loaded seat rows */
export interface EventSectionWithSeats extends Section {
  rows: SeatRow[];
}

// ── Response shapes ───────────────────────────────────────────────────────────

interface BookingSectionsResponse {
  data: BookingSection[];
  message: string;
  status: number;
}

/** data is a plain object keyed by row_number (as string) */
interface BookingSeatsResponse {
  data: { [rowNumber: string]: BookingSeat[] };
  message: string;
  status: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly base = environment.apiBaseUrl;

  constructor(
    private http: HttpClient,
    private sectionSvc: SectionService,
    private seatSvc: SeatService,
  ) {}

  // ── New event-scoped booking APIs ──────────────────────────────────────────

  /** GET /bookings/:eventId/sections/ */
  getEventSections(eventId: number): Observable<BookingSection[]> {
    return this.http
      .get<BookingSectionsResponse>(`${this.base}/bookings/${eventId}/sections/`)
      .pipe(map((r) => r.data));
  }

  /** GET /bookings/:eventId/sections/:sectionId/seats */
  getEventSectionSeats(eventId: number, sectionId: number): Observable<BookingSeatRow[]> {
    return this.http
      .get<BookingSeatsResponse>(`${this.base}/bookings/${eventId}/sections/${sectionId}/seats`)
      .pipe(
        map((r) => {
          // Transform { "1": [{...}], "2": [...] } → BookingSeatRow[]
          return Object.entries(r.data)
            .map(([rowKey, seats]) => ({
              row_number: Number(rowKey),
              seats,
            }))
            .sort((a, b) => a.row_number - b.row_number);
        })
      );
  }

  /**
   * Fetch all sections for an event from the booking API,
   * then in parallel fetch the seat rows for every section.
   */
  getEventSectionsWithSeats(eventId: number): Observable<BookingSectionWithSeats[]> {
    return this.getEventSections(eventId).pipe(
      switchMap((sections) => {
        if (sections.length === 0) {
          return of([] as BookingSectionWithSeats[]);
        }
        return forkJoin(
          sections.map((sec) =>
            this.getEventSectionSeats(eventId, sec.id).pipe(
              map((rows) => ({ ...sec, rows }) as BookingSectionWithSeats)
            )
          )
        );
      })
    );
  }

  // ── Legacy venue-scoped API (kept for backward compatibility) ────────────────

  /**
   * Fetch all sections for a venue (GET /venues/:venueId),
   * then in parallel fetch the seat layout for every section
   * (GET /venues/:venueId/:sectionId).
   */
  getVenueSectionsWithSeats(venueId: number): Observable<EventSectionWithSeats[]> {
    return this.sectionSvc.getSections(venueId).pipe(
      switchMap((sections) => {
        if (sections.length === 0) {
          return of([] as EventSectionWithSeats[]);
        }
        return forkJoin(
          sections.map((sec) =>
            this.seatSvc.getSeats(venueId, sec.id).pipe(
              map((rows) => ({ ...sec, rows } as EventSectionWithSeats))
            )
          )
        );
      })
    );
  }
}
