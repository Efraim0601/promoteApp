import { Component, Input } from '@angular/core';

/** The real Promote prepaid card model — the artwork used for printing. */
@Component({
  selector: 'promote-card',
  standalone: true,
  template: `
  <div style="width:100%;border-radius:18px;overflow:hidden;box-shadow:0 16px 38px rgba(4,30,28,.5);line-height:0;aspect-ratio:1200/714;background:#0a1f1c">
    <img src="assets/card_model.jpg" alt="Carte Promote" style="width:100%;height:100%;object-fit:cover;display:block" />
  </div>`,
})
export class PromoteCardComponent {
  // Kept for backward compatibility with existing call sites (the model artwork is fixed).
  @Input() holder = '';
  @Input() exp = '';
}
