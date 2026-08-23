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
  BookSeatsPayload,
  PaymentVerifyPayload,
} from '../../../core/services/booking.service';
import { environment } from '../../../../environments/environment';

// Declare Razorpay global (loaded via checkout.js in index.html)
declare const Razorpay: any;

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

  /* ── Booking state ── */
  booking = signal(false);
  bookingError = signal<string | null>(null);
  bookingSuccess = signal(false);

  /* ── Payment state ── */
  paymentProcessing = signal(false);
  paymentError = signal<string | null>(null);

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
    if (this.activeSectionIndex() === index) return;
    // Clear any previously selected seats from a different section
    this.selectedSeats.set([]);
    this.bookingError.set(null);
    this.bookingSuccess.set(false);
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

  /* ── Proceed / Book ── */
  proceedToBook(): void {
    const seats = this.selectedSeats();
    const sec = this.activeSection();
    if (!seats.length || !sec) return;

    const payload: BookSeatsPayload = {
      section_id: sec.id,
      event_id: this.eventId,
      seats: seats.map((s) => s.seatId),
    };

    this.booking.set(true);
    this.bookingError.set(null);
    this.bookingSuccess.set(false);

    this.bookingSvc.bookSeats(payload).subscribe({
      next: (res) => {
        this.booking.set(false);
        // Open Razorpay checkout with the order details from the backend
        this.openRazorpay(res.data.order_id, res.data.amount);
      },
      error: (err) => {
        this.booking.set(false);
        const msg =
          err?.error?.message ?? err?.error?.detail ?? 'Booking failed. Please try again.';
        this.bookingError.set(msg);
      },
    });
  }

  /* ── Razorpay Checkout ── */
  private openRazorpay(orderId: string, amount: number): void {
    const ev = this.event();

    const options = {
      key: environment.razorpayKeyId,
      amount: amount * 100, // Razorpay expects paise
      currency: 'INR',
      name: 'EventMaster',
      description: ev ? `Tickets — ${ev.name}` : 'Event Ticket Booking',
      order_id: orderId,
      theme: {
        color: '#e94560',
      },
      handler: (response: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      }) => {
        // Payment captured successfully by Razorpay
        this.onPaymentSuccess(
          response.razorpay_payment_id,
          response.razorpay_order_id,
          response.razorpay_signature
        );
      },
      modal: {
        ondismiss: () => {
          this.router.navigate(['/home']);
        },
      },
    };

    const rzp = new Razorpay(options);

    rzp.on('payment.failed', (_response: { error: { description: string } }) => {
      this.router.navigate(['/home']);
    });

    rzp.open();
  }

  /* ── Payment Success Handler ── */
  private onPaymentSuccess(
    paymentId: string,
    orderId: string,
    signature: string
  ): void {
    const payload: PaymentVerifyPayload = {
      payment_id: paymentId,
      order_id: orderId,
      signature,
    };

    this.paymentProcessing.set(true);
    this.paymentError.set(null);

    this.bookingSvc.verifyPayment(payload).subscribe({
      next: () => {
        this.paymentProcessing.set(false);
        this.bookingSuccess.set(true);
        this.selectedSeats.set([]);
        // Redirect to events page after a brief moment so the user sees the success banner
        setTimeout(() => this.router.navigate(['/home']), 2000);
      },
      error: (err) => {
        this.paymentProcessing.set(false);
        const msg =
          err?.error?.detail ??
          err?.error?.message ??
          'Payment verification failed. Please contact support.';
        this.paymentError.set(msg);
      },
    });
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
