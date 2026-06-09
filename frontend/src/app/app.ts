import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { I18n } from './core/i18n';
import { ThemeService } from './core/theme';
import { ImagePreviewComponent } from './shared/image-preview';

/** Root shell: renders the app inside a centred phone frame (the prototype's stage). */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ImagePreviewComponent],
  template: `
    <div class="app-shell">
      <div class="promote-app" [attr.data-theme]="theme.theme()">
        <router-outlet />
      </div>
    </div>
    <image-preview></image-preview>`,
})
export class App {
  i18n = inject(I18n);
  theme = inject(ThemeService);
}
