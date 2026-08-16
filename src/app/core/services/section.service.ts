import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Section {
  id: number;
  name: string;
  venue_id: number;
  tier: number;
}

export interface SectionModel {
  id: number;
  name: string;
  venue_id: number;
  tier: number;
}

interface SectionListResponse {
  data: Section[];
  message: string;
  status: number;
}

interface SectionMutateResponse {
  message: string;
  status: number;
}

@Injectable({ providedIn: 'root' })
export class SectionService {
  private readonly base = environment.apiBaseUrl;

  constructor(private http: HttpClient) { }

  getSections(venueId: number): Observable<Section[]> {
    return this.http
      .get<SectionListResponse>(`${this.base}/venues/${venueId}`)
      .pipe(map((r) => r.data));
  }

  addSection(venueId: number, name: string): Observable<SectionMutateResponse> {
    return this.http.post<SectionMutateResponse>(
      `${this.base}/venues/${venueId}/add-section`,
      { name }
    );
  }

  updateSection(
    venueId: number,
    sectionId: number,
    name: string
  ): Observable<SectionMutateResponse> {
    return this.http.post<SectionMutateResponse>(
      `${this.base}/venues/${venueId}/${sectionId}/update-section`,
      { name }
    );
  }

  updateTiers(
    venueId: number,
    sections: SectionModel[]
  ): Observable<SectionMutateResponse> {
    return this.http.patch<SectionMutateResponse>(
      `${this.base}/venues/${venueId}/update-tier`,
      sections
    );
  }
}
