import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  BookingService,
  UserBooking,
  BookedSeat,
} from '../../../core/services/booking.service';

@Component({
  selector: 'app-my-bookings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './my-bookings.component.html',
  styleUrl: './my-bookings.component.scss',
})
export class MyBookingsComponent implements OnInit {
  /* ── State ── */
  bookings = signal<UserBooking[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  /* ── Detail modal ── */
  selectedBooking = signal<UserBooking | null>(null);
  detailSeats = signal<BookedSeat[]>([]);
  detailLoading = signal(false);
  detailError = signal<string | null>(null);
  showModal = signal(false);

  constructor(
    private bookingSvc: BookingService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.loadBookings();
  }

  loadBookings(): void {
    this.loading.set(true);
    this.error.set(null);

    this.bookingSvc.getMyBookings().subscribe({
      next: (data) => {
        // Sort newest first
        this.bookings.set([...data].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ));
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.detail ?? err?.message ?? 'Failed to load bookings.');
        this.loading.set(false);
      },
    });
  }

  /* ── Open booking detail modal ── */
  openDetail(booking: UserBooking): void {
    this.selectedBooking.set(booking);
    this.detailSeats.set([]);
    this.detailError.set(null);
    this.detailLoading.set(true);
    this.showModal.set(true);

    this.bookingSvc.getBookingSeats(booking.id).subscribe({
      next: (seats) => {
        this.detailSeats.set(seats);
        this.detailLoading.set(false);
      },
      error: (err) => {
        this.detailError.set(err?.error?.detail ?? 'Failed to load seat details.');
        this.detailLoading.set(false);
      },
    });
  }

  closeModal(): void {
    this.showModal.set(false);
    this.selectedBooking.set(null);
    this.detailSeats.set([]);
  }

  /* ── Group seats by section for display ── */
  groupedSeats(): { section: string; seats: BookedSeat[] }[] {
    const map = new Map<string, BookedSeat[]>();
    for (const s of this.detailSeats()) {
      if (!map.has(s.section_name)) map.set(s.section_name, []);
      map.get(s.section_name)!.push(s);
    }
    return Array.from(map.entries()).map(([section, seats]) => ({ section, seats }));
  }

  /* ── Helpers ── */
  goHome(): void {
    this.router.navigate(['/home']);
  }

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

  formatDateShort(iso: string): string {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  formatPrice(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  }

  statusClass(status: string): string {
    switch (status) {
      case 'CONFIRMED': return 'status--confirmed';
      case 'PENDING':   return 'status--pending';
      case 'CANCELLED': return 'status--cancelled';
      default:          return '';
    }
  }
}
