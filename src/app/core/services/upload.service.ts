import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, switchMap, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface UploadSignature {
  signature: string;
  timestamp: number;
  api_key: string;
  cloud_name: string;
}

interface SignatureResponse {
  data: UploadSignature;
  message: string;
  status: number;
}

@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly base = environment.apiBaseUrl;

  constructor(private http: HttpClient) { }

  /** Get upload signature from the backend */
  getSignature(): Observable<UploadSignature> {
    return this.http
      .get<SignatureResponse>(`${this.base}/global/upload-signature`)
      .pipe(map((r) => r.data));
  }

  /**
   * Upload a file to Cloudinary using the backend-generated signature.
   * Returns the secure_url of the uploaded asset.
   */
  uploadFile(file: File): Observable<string> {
    return this.getSignature().pipe(
      switchMap((sig) => {
        const form = new FormData();
        form.append('file', file);
        form.append('api_key', sig.api_key);
        form.append('timestamp', sig.timestamp.toString());
        form.append('signature', sig.signature);

        return this.http
          .post<{ secure_url: string }>(
            `https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`,
            form,
          )
          .pipe(map((res) => res.secure_url));
      }),
    );
  }
}
