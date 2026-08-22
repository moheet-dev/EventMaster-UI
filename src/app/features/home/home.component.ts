import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { EventService, Event as AppEvent, Pagination } from '../../core/services/event.service';
import { VenueService, Venue } from '../../core/services/venue.service';
import { VenueFormComponent } from '../venues/venue-form/venue-form.component';
import { EventFormComponent } from '../events/event-form/event-form.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, VenueFormComponent, EventFormComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit, OnDestroy {
  /* ── State ── */
  events = signal<AppEvent[]>([]);
  venues = signal<Venue[]>([]);
  pagination = signal<Pagination | null>(null);

  loadingEvents = signal(true);
  loadingVenues = signal(false);
  apiError = signal<string | null>(null);

  /* ── Filters ── */
  nameSearch = '';
  venueFilter: number | null = null;
  fromDate = '';
  toDate = '';
  currentPage = signal(1);
  readonly limit = 9;

  /* ── Modals ── */
  showVenuesPanel = signal(false);
  showEventForm = signal(false);
  showVenueForm = signal(false);
  editingEvent = signal<AppEvent | null>(null);
  editingVenue = signal<Venue | null>(null);

  /* ── Current user ── */
  readonly currentUserId: number | null;

  private readonly destroy$ = new Subject<void>();
  private readonly searchSubject = new Subject<string>();

  /* ── Pagination helpers ── */
  readonly totalPages = computed(() => this.pagination()?.total_pages ?? 1);
  readonly pageNumbers = computed(() => {
    const total = this.totalPages();
    const cur = this.currentPage();
    const pages: (number | '…')[] = [];

    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      if (cur > 3) pages.push('…');
      for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) {
        pages.push(i);
      }
      if (cur < total - 2) pages.push('…');
      pages.push(total);
    }
    return pages;
  });

  constructor(
    private authSvc: AuthService,
    private eventSvc: EventService,
    private venueSvc: VenueService,
    private router: Router,
  ) {
    this.currentUserId = this.authSvc.currentUserId();
  }

  ngOnInit(): void {
    this.loadEvents();
    this.loadVenues();

    // Debounce name search
    this.searchSubject
      .pipe(debounceTime(400), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage.set(1);
        this.loadEvents();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /* ── Data Loading ── */
  loadEvents(): void {
    this.loadingEvents.set(true);
    this.apiError.set(null);

    this.eventSvc
      .getAll({
        nameSearch: this.nameSearch || undefined,
        venueSearch: this.venueFilter ?? undefined,
        from_date: this.fromDate || undefined,
        to_date: this.toDate || undefined,
        page: this.currentPage(),
        limit: this.limit,
      })
      .subscribe({
        next: (res) => {
          this.events.set(res.data);
          this.pagination.set(res.pagination);
          this.loadingEvents.set(false);
        },
        error: (err) => {
          this.apiError.set(err?.message ?? 'Failed to load events.');
          this.loadingEvents.set(false);
        },
      });
  }

  loadVenues(): void {
    this.loadingVenues.set(true);
    this.venueSvc.getAll().subscribe({
      next: (v) => {
        this.venues.set(v);
        this.loadingVenues.set(false);
      },
      error: () => this.loadingVenues.set(false),
    });
  }

  /* ── Filter Handlers ── */
  onNameSearchChange(value: string): void {
    this.nameSearch = value;
    this.searchSubject.next(value);
  }

  onVenueFilterChange(): void {
    this.currentPage.set(1);
    this.loadEvents();
  }

  clearFilters(): void {
    this.nameSearch = '';
    this.venueFilter = null;
    this.fromDate = '';
    this.toDate = '';
    this.currentPage.set(1);
    this.loadEvents();
  }

  onDateFilterChange(): void {
    this.currentPage.set(1);
    this.loadEvents();
  }

  get hasActiveFilters(): boolean {
    return !!(this.nameSearch || this.venueFilter || this.fromDate || this.toDate);
  }

  /* ── Pagination ── */
  goToPage(page: number | '…'): void {
    if (page === '…') return;
    this.currentPage.set(page);
    this.loadEvents();
  }

  prevPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.update((p) => p - 1);
      this.loadEvents();
    }
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update((p) => p + 1);
      this.loadEvents();
    }
  }

  /* ── Venue Name Lookup ── */
  getVenueName(venueId: number): string {
    return this.venues().find((v) => v.id === venueId)?.name ?? '—';
  }

  /* ── Modals ── */
  openCreateEvent(): void {
    this.editingEvent.set(null);
    this.showEventForm.set(true);
  }

  openEditEvent(event: AppEvent): void {
    this.editingEvent.set(event);
    this.showEventForm.set(true);
  }

  openBooking(eventId: number): void {
    this.router.navigate(['/book', eventId]);
  }

  closeEventForm(): void {
    this.showEventForm.set(false);
    this.editingEvent.set(null);
  }

  onEventSaved(): void {
    this.closeEventForm();
    this.loadEvents();
  }

  openCreateVenue(): void {
    this.editingVenue.set(null);
    this.showVenueForm.set(true);
  }

  openEditVenue(venue: Venue): void {
    this.editingVenue.set(venue);
    this.showVenueForm.set(true);
  }

  closeVenueForm(): void {
    this.showVenueForm.set(false);
    this.editingVenue.set(null);
  }

  onVenueSaved(): void {
    this.closeVenueForm();
    this.loadVenues();
    this.loadEvents(); // refresh venue names in event cards
  }

  toggleVenuesPanel(): void {
    this.showVenuesPanel.update((v) => !v);
  }

  /* ── Helpers ── */
  isOwner(createdBy: number | null): boolean {
    return this.currentUserId != null && createdBy === this.currentUserId;
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  logout(): void {
    this.authSvc.logout();
    this.router.navigate(['/login']);
  }
}
