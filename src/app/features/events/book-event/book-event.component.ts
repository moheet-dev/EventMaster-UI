import {
  Component,
  OnInit,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { EventService, Event as AppEvent } from '../../../core/services/event.service';
import { VenueService, Venue } from '../../../core/services/venue.service';
import {
  BookingService,
  BookingSectionWithSeats,
  BookingSeat,
} from '../../../core/services/booking.service';

export interface SelectedSeat {
  sectionId: number;
  sectionName: string;
  sectionPrice: number;
  code: string;
  seatId: number;
  rowNumber: number;
}

@Component({
  selector: 'app-book-event',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './book-event.component.html',
  styleUrl: './book-event.component.scss',
})
export class BookEventComponent implements OnInit {
  /* ── Route data ── */
  private eventId!: number;

  /* ── State ── */
  event = signal<AppEvent | null>(null);
  venue = signal<Venue | null>(null);
  sections = signal<BookingSectionWithSeats[]>([]);
  activeSectionIndex = signal(0);

  loading = signal(true);
  error = signal<string | null>(null);

  /* ── Seat selection ── */
  selectedSeats = signal<SelectedSeat[]>([]);

  /* ── Section colours (one per tier, cycling if >5) ── */
  private readonly SECTION_COLOURS = [
    '#e94560', // red accent
    '#4e9af1', // blue
    '#f0a500', // amber
    '#3ecf8e', // green
    '#b57bee', // purple
  ];

  sectionColor(tier: number): string {
    return this.SECTION_COLOURS[(tier - 1) % this.SECTION_COLOURS.length];
  }

  /* ── Computed ── */
  readonly activeSection = computed(() => this.sections()[this.activeSectionIndex()] ?? null);

  readonly displayRows = computed(() => {
    const sec = this.activeSection();
    if (!sec) return [];
    return this.buildDisplayRows(sec);
  });

  /** Total price across all selected seats */
  readonly totalPrice = computed(() =>
    this.selectedSeats().reduce((sum, s) => sum + s.sectionPrice, 0)
  );

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private eventSvc: EventService,
    private venueSvc: VenueService,
    private bookingSvc: BookingService,
  ) {}

  ngOnInit(): void {
    this.eventId = Number(this.route.snapshot.paramMap.get('eventId'));
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set(null);

    this.eventSvc.getById(this.eventId).subscribe({
      next: (ev) => {
        this.event.set(ev);

        forkJoin({
          venues: this.venueSvc.getAll(),
          sections: this.bookingSvc.getEventSectionsWithSeats(this.eventId),
        }).subscribe({
          next: ({ venues, sections }) => {
            this.venue.set(venues.find((v) => v.id === ev.venue_id) ?? null);
            // Sort by tier ascending (tier 1 = most premium)
            this.sections.set([...sections].sort((a, b) => a.tier - b.tier));
            this.loading.set(false);
          },
          error: () => {
            this.error.set('Failed to load seat layout. Please try again.');
            this.loading.set(false);
          },
        });
      },
      error: () => {
        this.error.set('Event not found or failed to load.');
        this.loading.set(false);
      },
    });
  }

  /* ── Section tab ── */
  selectSection(index: number): void {
    this.activeSectionIndex.set(index);
  }

  /* ── Seat selection ── */
  isSeatSelected(sectionId: number, code: string): boolean {
    return this.selectedSeats().some(
      (s) => s.sectionId === sectionId && s.code === code
    );
  }

  toggleSeat(seat: BookingSeat, rowNumber: number): void {
    if (seat.status !== 'AVAILABLE') return;

    const sec = this.activeSection();
    if (!sec) return;

    const existing = this.selectedSeats().findIndex(
      (s) => s.sectionId === sec.id && s.code === seat.code
    );

    if (existing >= 0) {
      this.selectedSeats.update((seats) => seats.filter((_, i) => i !== existing));
    } else {
      this.selectedSeats.update((seats) => [
        ...seats,
        {
          sectionId: sec.id,
          sectionName: sec.name,
          sectionPrice: sec.price,
          code: seat.code,
          seatId: seat.seat_id,
          rowNumber,
        },
      ]);
    }
  }

  removeSeat(seat: SelectedSeat): void {
    this.selectedSeats.update((seats) =>
      seats.filter((s) => !(s.sectionId === seat.sectionId && s.code === seat.code))
    );
  }

  /* ── Display rows helper ── */
  buildDisplayRows(sec: BookingSectionWithSeats): {
    row_number: number;
    seats: BookingSeat[];
    padLeft: number;
    isEmpty: boolean;
  }[] {
    if (!sec.rows.length) return [];
    const maxRow = Math.max(...sec.rows.map((r) => r.row_number));
    const maxSeats = Math.max(...sec.rows.map((r) => r.seats.length));
    const rowMap = new Map(sec.rows.map((r) => [r.row_number, r.seats]));
    const result = [];
    for (let i = 1; i <= maxRow; i++) {
      const seats = rowMap.get(i) ?? [];
      const isEmpty = seats.length === 0;
      const padLeft = Math.floor((maxSeats - seats.length) / 2);
      result.push({ row_number: i, seats, padLeft, isEmpty });
    }
    return result;
  }

  /* ── Helpers ── */
  formatDate(iso: string): string {
    return new Date(iso).toLocaleString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);
  }

  goBack(): void {
    this.router.navigate(['/home']);
  }
}
