import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SeatRow {
  row_number: number;
  codes: string[];
}

export interface SeatReq {
  code: string;
  row_number: number;
}

interface SeatListResponse {
  data: SeatRow[];
  message: string;
  status: number;
}

interface SeatMutateResponse {
  message: string;
  status: number;
}

@Injectable({ providedIn: 'root' })
export class SeatService {
  private readonly base = environment.apiBaseUrl;

  constructor(private http: HttpClient) { }

  getSeats(venueId: number, sectionId: number): Observable<SeatRow[]> {
    return this.http
      .get<SeatListResponse>(`${this.base}/venues/${venueId}/${sectionId}`)
      .pipe(map((r) => r.data));
  }

  addSeat(venueId: number, sectionId: number, data: SeatReq): Observable<SeatMutateResponse> {
    return this.http.post<SeatMutateResponse>(
      `${this.base}/venues/${venueId}/${sectionId}/add-seat`,
      data
    );
  }
}
