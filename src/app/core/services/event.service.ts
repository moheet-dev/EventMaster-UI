import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
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
}

export interface EventReq {
  name: string;
  description: string;
  display_image: string;
  venue_id: number;
  event_on: string;   // ISO datetime string sent to backend
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

  create(data: EventReq): Observable<EventMutateResponse> {
    return this.http.post<EventMutateResponse>(`${this.base}/events/add`, data);
  }

  update(id: number, data: EventReq): Observable<EventMutateResponse> {
    return this.http.patch<EventMutateResponse>(
      `${this.base}/events/update/${id}`,
      data,
    );
  }
}
