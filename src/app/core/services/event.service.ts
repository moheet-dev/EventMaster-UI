import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Event {
  id: number;
  name: string;
  description: string;
  display_image: string;
  venue_id: number;
  event_on: string;
  created_at: string;
  created_by: number | null;
  rank?: number;
}

export interface EventReq {
  name: string;
  description: string;
  display_image: string;
  venue_id: number;
  event_on: string;   // ISO datetime string sent to backend
}

export interface SectionReq {
  id: number;
  name: string;
  venue_id: number;
  tier: number;
  seat_count: number;
  price: number;
}

export interface EventFilters {
  nameSearch?: string;
  venueSearch?: number;
  from_date?: string;   // YYYY-MM-DD
  to_date?: string;     // YYYY-MM-DD
  page?: number;
  limit?: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface EventListResponse {
  data: Event[];
  pagination: Pagination;
  message: string;
  status: number;
}

interface EventMutateResponse {
  data?: Event;
  message: string;
  status: number;
}

/* ── Dashboard API types ── */
export interface SectionStat {
  name: string;
  tier: number;
  price: string;
  capacity: number;
  sold: number;
  available: number;
  revenue: string;
}

export interface BookingHealth {
  total: number;
  PENDING: number;
  CONFIRMED: number;
  CANCELLED: number;
  EXPIRED: number;
}

export interface DashboardData {
  total_seats: number;
  booked_seats: number;
  held_seats: number;
  available_seats: number;
  total_revenue: number;
  days_since_live: number;
  days_booked_since_live: Record<string, number>;
  booking_health: BookingHealth;
  section_wise: Record<string, SectionStat>;
}

export interface DashboardResponse {
  data: DashboardData;
  message: string;
  status: number;
}

export interface PredictionResponse {
  data: { prediction: number };
  message: string;
  status: number;
}

@Injectable({ providedIn: 'root' })
export class EventService {
  private readonly base = environment.apiBaseUrl;

  constructor(private http: HttpClient) { }

  getAll(filters: EventFilters = {}): Observable<EventListResponse> {
    let params = new HttpParams();
    if (filters.nameSearch) params = params.set('nameSearch', filters.nameSearch);
    if (filters.venueSearch != null)
      params = params.set('venueSearch', filters.venueSearch.toString());
    if (filters.from_date) params = params.set('from_date', filters.from_date);
    if (filters.to_date) params = params.set('to_date', filters.to_date);
    if (filters.page != null) params = params.set('page', filters.page.toString());
    if (filters.limit != null) params = params.set('limit', filters.limit.toString());

    return this.http.get<EventListResponse>(`${this.base}/events`, { params });
  }

  getById(id: number): Observable<Event> {
    return this.http
      .get<{ data: Event; message: string; status: number }>(`${this.base}/events/${id}`)
      .pipe(map((r) => r.data));
  }

  create(data: EventReq, sections: SectionReq[]): Observable<EventMutateResponse> {
    return this.http.post<EventMutateResponse>(`${this.base}/events/add`, { "data": data, "eventSections": sections });
  }

  update(id: number, data: EventReq): Observable<EventMutateResponse> {
    return this.http.patch<EventMutateResponse>(
      `${this.base}/events/update/${id}`,
      data,
    );
  }

  /** Fetch event dashboard analytics */
  getDashboard(eventId: number): Observable<DashboardResponse> {
    return this.http.get<DashboardResponse>(`${this.base}/events/${eventId}/dashboard`);
  }

  /** Get ML ticket-sale prediction */
  predictTicketSale(days_since_live: number, capacity: number): Observable<PredictionResponse> {
    return this.http.post<PredictionResponse>(`${this.base}/predictions/ticket_sale`, {
      days_since_live,
      capacity,
    });
  }
}
