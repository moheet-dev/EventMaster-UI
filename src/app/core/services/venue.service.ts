import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Venue {
  id: number;
  name: string;
  address: string;
  display_image: string;
  created_at: string;
  created_by: number | null;
}

export interface VenueReq {
  name: string;
  address: string;
  display_image: string;
}

interface VenueListResponse {
  data: Venue[];
  message: string;
  status: number;
}

interface VenueMutateResponse {
  data?: Venue;
  message: string;
  status: number;
}

@Injectable({ providedIn: 'root' })
export class VenueService {
  private readonly base = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  getAll(): Observable<Venue[]> {
    return this.http
      .get<VenueListResponse>(`${this.base}/venues`)
      .pipe(map((r) => r.data));
  }

  create(data: VenueReq): Observable<VenueMutateResponse> {
    return this.http.post<VenueMutateResponse>(`${this.base}/venues/add`, data);
  }

  update(id: number, data: VenueReq): Observable<VenueMutateResponse> {
    return this.http.patch<VenueMutateResponse>(
      `${this.base}/venues/update/${id}`,
      data,
    );
  }
}
