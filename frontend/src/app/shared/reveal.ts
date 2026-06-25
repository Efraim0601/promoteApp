import {
  Directive, ElementRef, Input, OnInit, AfterViewInit, NgZone, inject,
} from '@angular/core';
import { gsap } from 'gsap';

/**
 * Socle d'animation « effets de dynamisme » du portail cible (Afriland Portal), rejoué via GSAP.
 *
 * Pose un attribut `data-reveal` sur les éléments à animer (le CSS global les met à `opacity:0`
 * pour éviter tout flash), puis une directive `[reveal]` orchestre une timeline d'entrée :
 *
 *   <div reveal="screen">                     ← conteneur : anime ses enfants [data-reveal] en cascade
 *     <img data-reveal="logo" …>              ← preset par élément (override du preset conteneur)
 *     <input data-reveal="input" …>
 *     <button data-reveal="button" …>
 *   </div>
 *
 *   <div reveal="card" data-reveal></div>      ← élément seul (s'auto-anime)
 *
 * Presets (fidèles aux timelines du template) :
 *   logo    — chute élastique (elastic.out) : y:-60, scale:.2 → 1
 *   card/kpi— montée rebond (back.out 1.4) en cascade : y:60, scale:.85 → 1
 *   input   — glissé depuis la gauche : x:-40 → 0
 *   button  — pop (back.out 1.7) : y:20, scale:.8 → 1
 *   check   — check de succès : scale:0, rotation:-90 → 1 (elastic)
 *   fail    — icône d'échec : scale:0, rotation:-360 → 1 puis shake
 *   screen  — preset auto par défaut pour un conteneur (déduit du type d'enfant)
 *
 * Respecte `prefers-reduced-motion` (rend simplement le contenu visible, sans mouvement) et
 * dégrade proprement si GSAP est indisponible (try/catch → révélation immédiate).
 */
type Preset = 'logo' | 'card' | 'kpi' | 'input' | 'button' | 'check' | 'fail' | 'item' | 'screen';

const PRESETS: Record<Exclude<Preset, 'screen'>, (els: Element[], tl: gsap.core.Timeline, pos: string) => void> = {
  logo: (els, tl, pos) => tl.fromTo(els,
    { y: -60, opacity: 0, scale: 0.2, rotation: -8 },
    { y: 0, opacity: 1, scale: 1, rotation: 0, duration: 1, ease: 'elastic.out(1, 0.5)' }, pos),
  card: (els, tl, pos) => tl.fromTo(els,
    { y: 60, opacity: 0, scale: 0.85 },
    { y: 0, opacity: 1, scale: 1, duration: 0.8, stagger: 0.12, ease: 'back.out(1.4)' }, pos),
  kpi: (els, tl, pos) => tl.fromTo(els,
    { y: 40, opacity: 0, scale: 0.85 },
    { y: 0, opacity: 1, scale: 1, duration: 0.7, stagger: 0.1, ease: 'back.out(1.4)' }, pos),
  input: (els, tl, pos) => tl.fromTo(els,
    { x: -40, opacity: 0 },
    { x: 0, opacity: 1, duration: 0.6, stagger: 0.13, ease: 'power3.out' }, pos),
  button: (els, tl, pos) => tl.fromTo(els,
    { y: 20, opacity: 0, scale: 0.8 },
    { y: 0, opacity: 1, scale: 1, duration: 0.6, stagger: 0.12, ease: 'back.out(1.7)' }, pos),
  item: (els, tl, pos) => tl.fromTo(els,
    { y: 24, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.55, stagger: 0.1, ease: 'power3.out' }, pos),
  check: (els, tl, pos) => tl.fromTo(els,
    { scale: 0, opacity: 0, rotation: -90 },
    { scale: 1, opacity: 1, rotation: 0, duration: 1.2, ease: 'elastic.out(1.2, 0.4)' }, pos),
  fail: (els, tl, pos) => {
    tl.fromTo(els,
      { scale: 0, opacity: 0, rotation: -360 },
      { scale: 1, opacity: 1, rotation: 0, duration: 1, ease: 'elastic.out(1, 0.4)' }, pos);
    tl.to(els, { x: -12, duration: 0.06, yoyo: true, repeat: 7, clearProps: 'x' });
  },
};

@Directive({ selector: '[reveal]', standalone: true })
export class RevealDirective implements OnInit, AfterViewInit {
  /** Preset par défaut du conteneur (les enfants peuvent surcharger via leur valeur data-reveal). */
  @Input('reveal') preset: Preset | '' = '';
  /** Délai avant le démarrage de la timeline (s). */
  @Input() revealDelay = 0.1;

  private host = inject(ElementRef) as ElementRef<HTMLElement>;
  private zone = inject(NgZone);

  ngOnInit(): void {
    // Marque le sous-arbre prêt : le repli CSS (reveal-ready) garantit la visibilité même si la
    // timeline n'aboutit pas (JS lent, GSAP absent). GSAP repart d'opacity:0 via fromTo.
    this.host.nativeElement.classList.add('reveal-ready');
  }

  ngAfterViewInit(): void {
    const el = this.host.nativeElement;
    const reduce = typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Cible : les descendants [data-reveal], sinon l'élément lui-même.
    const marked = Array.from(el.querySelectorAll<HTMLElement>('[data-reveal]'));
    const targets = marked.length ? marked : (el.hasAttribute('data-reveal') ? [el] : []);
    if (!targets.length) return;

    if (reduce) { gsap.set(targets, { opacity: 1, clearProps: 'transform' }); return; }

    // Hors zone Angular : les rAF de GSAP ne doivent pas déclencher la détection de changements.
    this.zone.runOutsideAngular(() => {
      try {
        const tl = gsap.timeline({
          defaults: { ease: 'power3.out', clearProps: 'transform,opacity' },
          delay: this.revealDelay,
        });
        // Regroupe les cibles par preset effectif pour rejouer le bon mouvement, dans l'ordre du DOM.
        const groups = new Map<Exclude<Preset, 'screen'>, Element[]>();
        for (const t of targets) {
          const p = this.resolve(t.getAttribute('data-reveal'));
          (groups.get(p) ?? groups.set(p, []).get(p)!).push(t);
        }
        let first = true;
        // Ordre de jeu : logo → inputs/items → cards/kpi → buttons → check/fail.
        const order: Exclude<Preset, 'screen'>[] = ['logo', 'input', 'item', 'card', 'kpi', 'button', 'check', 'fail'];
        for (const key of order) {
          const els = groups.get(key);
          if (!els || !els.length) continue;
          PRESETS[key](els, tl, first ? '0' : '-=0.35');
          first = false;
        }
      } catch {
        gsap.set(targets, { opacity: 1, clearProps: 'transform' });
      }
    });
  }

  /** Résout le preset effectif d'un élément : sa valeur data-reveal, sinon le preset du conteneur. */
  private resolve(val: string | null): Exclude<Preset, 'screen'> {
    const v = (val && val !== '' ? val : (this.preset || 'item')) as Preset;
    if (v === 'screen') return 'item';
    return v;
  }
}

/**
 * Effet « confettis » du succès (template) : projette N points colorés depuis un centre.
 * Appelable depuis un composant après le paiement réussi.
 */
export function burstConfetti(origin: HTMLElement, count = 28): void {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#C8102E', '#059669', '#D97706', '#2563EB', '#7C3AED', '#FF7900'];
  const rect = origin.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('div');
    dot.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:9px;height:9px;border-radius:50%;`
      + `pointer-events:none;z-index:9999;background:${colors[i % colors.length]};`;
    document.body.appendChild(dot);
    gsap.to(dot, {
      x: (Math.random() - 0.5) * 300,
      y: (Math.random() - 0.5) * 300 - 100,
      opacity: 0,
      scale: Math.random() * 2 + 0.5,
      duration: 1.2 + Math.random() * 0.8,
      ease: 'power2.out',
      delay: 0.1 + Math.random() * 0.3,
      onComplete: () => dot.remove(),
    });
  }
}
