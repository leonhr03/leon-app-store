import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../app/api.service';

@Component({
  imports: [RouterLink, FormsModule],
  selector: 'app-new-app',
  styleUrl: './new-app.css',
  templateUrl: './new-app.html',
})
export class NewApp {
  private api = inject(ApiService);
  private router = inject(Router);

  iconSrc: string | null = null;
  appPackageName = '';
  iconFile: File | null = null;
  apkFile: File | null = null;

  name = '';
  version = '';
  description = '';

  isDeploying = false;
  errorMessage: string | null = null;

  onAppFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.apkFile = input.files[0];
      this.appPackageName = this.apkFile.name;
      if (!this.name) {
        this.name = this.apkFile.name.replace(/\.apk$/i, '');
      }
    }
  }

  onIconFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.iconFile = input.files[0];
      const reader = new FileReader();
      reader.onload = () => (this.iconSrc = reader.result as string);
      reader.readAsDataURL(this.iconFile);
    }
  }

  async deployApp(): Promise<void> {
    this.errorMessage = null;

    if (!this.iconFile || !this.apkFile) {
      this.errorMessage = 'Bitte Icon und App-Datei auswählen.';
      return;
    }
    if (!this.name || !this.version || !this.description) {
      this.errorMessage = 'Bitte Name, Version und Beschreibung ausfüllen.';
      return;
    }

    this.isDeploying = true;
    try {
      const formData = new FormData();
      formData.append('name', this.name);
      formData.append('version', this.version);
      formData.append('description', this.description);
      formData.append('icon', this.iconFile, this.iconFile.name);
      formData.append('apk', this.apkFile, this.apkFile.name);

      await this.api.createApp(formData);
      await this.router.navigate(['/']);
    } catch (error) {
      this.errorMessage = this.toReadableError(error);
    } finally {
      this.isDeploying = false;
    }
  }

  private toReadableError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      return error.error?.error ?? `Upload fehlgeschlagen (${error.status}).`;
    }
    return error instanceof Error ? error.message : String(error);
  }
}
