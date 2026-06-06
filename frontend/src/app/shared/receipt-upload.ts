import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, inject, signal } from '@angular/core';
import { I18n } from '../core/i18n';
import { IconComponent } from './icon';

/**
 * SARA money receipt upload. Lets the client attach the proof of payment they downloaded
 * from the SARA app — an image (screenshot) OR a PDF. Reads the file as a data URL and emits
 * it; the parent uploads it via /api/kyc/image (kind = sara-receipt). Unlike photo-capture,
 * this is a plain file picker (no canvas) so PDFs pass through untouched.
 */
@Component({
  selector: 'receipt-upload',
  standalone: true,
  imports: [IconComponent],
  template: `
    @if (imageData) {
      <div class="card" style="padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px">
        @if (isPdf()) {
          <div style="display:flex;align-items:center;gap:10px;width:100%;padding:14px;border-radius:12px;background:var(--surface-2)">
            <span style="width:40px;height:40px;border-radius:10px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center">
              <ic name="copy" [size]="20"></ic>
            </span>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:13px">{{ i18n.t('sara_receipt_pdf') }}</div>
              <div class="muted" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ fileName() }}</div>
            </div>
            <span style="width:26px;height:26px;border-radius:50%;background:var(--success);color:#fff;display:flex;align-items:center;justify-content:center">
              <ic name="check" [size]="15" [sw]="2.6"></ic>
            </span>
          </div>
        } @else {
          <div style="position:relative;width:100%;max-width:280px;border-radius:12px;overflow:hidden;box-shadow:var(--shadow)">
            <img [src]="imageData" alt="reçu" style="width:100%;display:block;max-height:340px;object-fit:contain;background:var(--surface-2)" />
            <span style="position:absolute;right:8px;bottom:8px;width:28px;height:28px;border-radius:50%;background:var(--success);color:#fff;display:flex;align-items:center;justify-content:center">
              <ic name="check" [size]="16" [sw]="2.6"></ic>
            </span>
          </div>
        }
        <button class="btn btn-ghost" (click)="pick()" style="padding:10px 14px;font-size:13px;width:auto">
          <ic name="refresh" [size]="16"></ic> {{ i18n.t('sara_receipt_replace') }}
        </button>
      </div>
    } @else {
      <div class="card" style="padding:18px;display:flex;flex-direction:column;align-items:center;gap:12px">
        <span style="width:54px;height:54px;border-radius:14px;background:var(--surface-2);color:var(--muted);display:flex;align-items:center;justify-content:center">
          <ic name="copy" [size]="26"></ic>
        </span>
        <p class="muted" style="font-size:12px;text-align:center;line-height:1.45;max-width:280px">{{ guide || i18n.t('sara_receipt_guide') }}</p>
        <button class="btn btn-primary" (click)="pick()" style="width:auto;padding:11px 18px">
          <ic name="image" [size]="18"></ic> {{ i18n.t('sara_receipt_pick') }}
        </button>
      </div>
    }
    <input #file type="file" accept="image/*,application/pdf" (change)="onFile($event)" style="display:none" />`,
})
export class ReceiptUploadComponent {
  i18n = inject(I18n);

  /** Current receipt as a data URL (image/* or application/pdf), or null. */
  @Input() imageData: string | null = null;
  @Input() guide = '';
  @Output() captured = new EventEmitter<string>();

  @ViewChild('file') file?: ElementRef<HTMLInputElement>;

  fileName = signal('');

  isPdf(): boolean {
    return !!this.imageData && this.imageData.startsWith('data:application/pdf');
  }

  pick() {
    this.file?.nativeElement.click();
  }

  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    this.fileName.set(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      input.value = ''; // allow re-picking the same file
      const data = reader.result as string;
      this.imageData = data;
      this.captured.emit(data);
    };
    reader.onerror = () => { input.value = ''; };
    reader.readAsDataURL(f);
  }
}
