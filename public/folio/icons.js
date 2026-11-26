/* Cerno: book icons. One rule for all of them, from cernō ("to sift"): a fine ink mesh, the sieve,
 * and one red pencil mark on what stays in it. Ink follows currentColor, the mark follows --red,
 * so both themes work. 24×24, drawn on the same grid as the favicon. */
(function () {
  const F = window.F;
  const ink = 'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"';
  const red = 'class="r" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
  const mesh = `<rect x="3.5" y="3.5" width="17" height="17" ${ink}/><path class="m" d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>`;
  const fine = [1, 2, 3, 4].map((i) => { const v = (3.5 + (i * 17) / 5).toFixed(2); return `M${v} 3.5v17M3.5 ${v}h17`; }).join("");
  const ICONS = {
    contents: `${mesh}<rect class="rf" x="9.9" y="15.5" width="4.2" height="4.2"/>`,
    card: `<path d="M12 3.5l8.1 5.9-3.1 9.6H7L3.9 9.4z" ${ink}/><path d="M12 8.6l3.6 2.6-1.4 4.3H9.8l-1.4-4.3z" ${red}/>`,
    preface: `<path d="M6 3.5h12v17l-6-4-6 4z" ${ink}/><path d="M12 7.2v4.6M9.7 9.5h4.6" ${red}/>`,
    tactics: `${mesh}<path d="M12 17.5l-4.5-9M12 17.5l4.5-9M6 10.5l1.5-2 2.3.6M18 10.5l-1.5-2-2.3.6" ${red}/>`,
    strategy: `${mesh}<path d="M6.3 17.7L17.7 6.3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="1.6 2.2" stroke-linecap="round"/><circle class="rf" cx="17.7" cy="6.3" r="1.8"/>`,
    openings: `<path d="M3.5 9.5v11h17v-11" ${ink}/><path class="m" d="M9.2 9.5v11M14.8 9.5v11M3.5 15h17"/><path d="M12 3v8.5M9.4 8.8L12 11.5l2.6-2.7" ${red}/>`,
    endgames: `<rect x="3.5" y="3.5" width="17" height="17" ${ink}/><circle cx="8" cy="16" r="1.6" fill="currentColor"/><circle class="rf" cx="16" cy="8" r="2.1"/>`,
    clock: `<path d="M6 3.5h12M6 20.5h12M7.2 3.5c0 5 9.6 5 9.6 8.5s-9.6 3.5-9.6 8.5M16.8 3.5c0 5-9.6 5-9.6 8.5s9.6 3.5 9.6 8.5" ${ink}/><circle class="rf" cx="12" cy="13.8" r=".9"/><circle class="rf" cx="12" cy="16.4" r=".9"/><path d="M9 19.3h6" ${red}/>`,
    exercises: `${mesh}<path d="M17.2 11C16.2 6.8 7.8 6.2 6.8 12S16.2 17.8 17.8 11.4" ${red}/>`,
    games: `<rect x="3.5" y="3.5" width="17" height="17" ${ink}/><path class="m" d="${fine}"/><rect class="rf" x="13.7" y="10.3" width="3.4" height="3.4"/>`,
    method: `<path d="M3.5 12h17" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 1.6" stroke-linecap="round"/><circle cx="6.5" cy="7" r="1.2" fill="currentColor"/><circle cx="11" cy="5" r="1.2" fill="currentColor"/><circle cx="15" cy="8" r="1.2" fill="currentColor"/><circle cx="18" cy="5.5" r="1.2" fill="currentColor"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle class="rf" cx="13.5" cy="17.5" r="1.8"/>`,
    level: `<rect x="3.5" y="3.5" width="7.5" height="17" ${ink}/><rect x="13" y="3.5" width="7.5" height="17" ${red}/><path d="M5.5 14h3.5" ${ink}/><path d="M15 10h3.5" ${red}/>`,
    errata: `<path d="M4 16h16" ${ink}/><path d="M4 12h16" ${ink} opacity=".45"/><path d="M8.5 20.5l3.5-5 3.5 5M6 12.4l12-.8" ${red}/>`,
    settings: `<path d="M4 7h16M4 12h16M4 17h16" ${ink}/><circle cx="8" cy="7" r="1.9" fill="var(--paper)" stroke="currentColor" stroke-width="1.4"/><circle cx="15.5" cy="12" r="1.9" fill="var(--paper)" stroke="currentColor" stroke-width="1.4"/><circle class="rf" cx="10.5" cy="17" r="2.1"/>`,
  };
  F.ICONS = ICONS;
  // The Cerno mark (same drawing as src/app/icon.svg): a Roman capital C round a corner of a printed board,
  // hatched as in the diagrams, with the red square that stays in the sieve. Fixed colours: it is a stamp, in both themes.
  const MARK = "<defs><pattern id=\"hm@\" width=\"2.1\" height=\"2.1\" patternUnits=\"userSpaceOnUse\" patternTransform=\"rotate(45)\"><rect width=\"1.05\" height=\"2.1\" fill=\"#f5efe3\"/></pattern></defs><rect width=\"32\" height=\"32\" rx=\"7\" fill=\"#1b1d22\"/><path transform=\"translate(1.36 28.74) scale(0.0364 -0.0364)\" fill=\"#f5efe3\" d=\"M722 292 731 120Q709 83 672 53Q635 23 580 4Q525 -14 450 -14Q328 -13 237 30Q145 74 95 155Q45 236 45 351Q45 463 94 545Q143 626 235 670Q326 714 453 714Q533 714 597 698Q660 682 702 659L704 488H695Q668 587 607 629Q546 672 464 672Q384 672 327 633Q270 594 239 523Q208 452 208 353Q208 254 238 182Q267 110 322 70Q376 30 450 28Q527 28 580 53Q633 78 666 136Q698 194 714 292Z\"/><rect x=\"11.2\" y=\"9.4\" width=\"6.0\" height=\"6.0\" fill=\"#f5efe3\"/><rect x=\"18.00\" y=\"9.4\" width=\"6.0\" height=\"6.0\" fill=\"url(#hm@)\"/><rect x=\"11.2\" y=\"16.20\" width=\"6.0\" height=\"6.0\" fill=\"url(#hm@)\"/><rect x=\"18.00\" y=\"16.20\" width=\"6.0\" height=\"6.0\" fill=\"#bf2c24\"/>";
  let markN = 0;
  F.mark = (cls = "") => `<svg class="mark ${cls}" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${MARK.replace(/@/g, ++markN)}</svg>`;
  F.icon = (k, cls = "") => (ICONS[k] ? `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[k]}</svg>` : "");
})();
