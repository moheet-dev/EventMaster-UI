import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface AuthResponse {
  data: { token: string };
  message: string;
  status: number;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  identifier: string;
  password: string;
}

const TOKEN_KEY = 'em_token';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly baseUrl = environment.apiBaseUrl;
  private readonly _token = signal<string | null>(localStorage.getItem(TOKEN_KEY));

  readonly isLoggedIn = computed(() => !!this._token());

  constructor(private http: HttpClient) {}

  register(data: RegisterRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/users/register`, data)
      .pipe(
        tap((res) => this.saveToken(res.data.token)),
        catchError(this.handleError),
      );
  }

  login(data: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/users/login`, data)
      .pipe(
        tap((res) => this.saveToken(res.data.token)),
        catchError(this.handleError),
      );
  }

  saveToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
    this._token.set(token);
  }

  getToken(): string | null {
    return this._token();
  }

  /** Decode JWT payload and return the user's numeric id, or null if unavailable. */
  currentUserId(): number | null {
    const token = this._token();
    if (!token) return null;
    try {
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload));
      // Try common JWT id claim names
      return decoded.id ?? decoded.sub ?? decoded.user_id ?? null;
    } catch {
      return null;
    }
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    this._token.set(null);
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    const message =
      error.error?.detail ?? error.message ?? 'An unexpected error occurred.';
    return throwError(() => new Error(message));
  }
}
