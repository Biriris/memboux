/**
 * Structural art direction for the public wedding editions.
 *
 * The base wedding view owns content and accessibility. This layer gives every
 * edition an intentionally different composition while keeping long names,
 * translated navigation and integrated guest tools collision-safe.
 */
export const weddingArtDirectionStyles = `
  .w-page{
    --w-radius:0;
    --w-control-radius:0;
    --w-nav-bg:#10191624;
    --w-nav-border:#ffffff45;
    --w-nav-ink:#fff;
    --w-hero-size:clamp(3rem,7.4vw,6.9rem);
    --w-title-size:clamp(2.2rem,4.7vw,4.5rem);
    --w-section-space:clamp(4.8rem,10vw,9rem);
    overflow-wrap:break-word;
  }
  .w-page :is(a,button,select,input,label,[role="button"]){cursor:pointer}
  .w-page :is(.w-hero h1,.w-section h2,.w-integrated-card h3,.w-event-card h3){text-wrap:balance;overflow-wrap:anywhere}
  .w-page .w-section{padding-block:var(--w-section-space)}
  .w-page .w-section h2{font-size:var(--w-title-size);line-height:.98}
  .w-page .w-hero h1{width:100%;max-width:12ch;font-size:var(--w-hero-size);line-height:.86;overflow-wrap:normal;word-break:normal;hyphens:none}
  .w-page[data-wedding-layout="poster"] .w-hero h1{font-size:var(--w-hero-size)}
  .w-page[data-wedding-name-scale="compact"]{--w-hero-size:clamp(2.75rem,6.7vw,6rem)}
  .w-page[data-wedding-name-scale="long"]{--w-hero-size:clamp(2.25rem,5.5vw,4.9rem)}
  .w-page .w-kicker,.w-page .w-eyebrow{font-size:clamp(.7rem,.75vw,.78rem);line-height:1.45}
  .w-page .w-story-copy{font-size:clamp(1rem,1.35vw,1.12rem);line-height:1.8}
  .w-page .w-event-card h3,.w-page .w-detail-grid h3,.w-page .w-experience-card h3{font-size:clamp(1.3rem,2vw,1.8rem);line-height:1.18}

  /* Pre-wedding imagery is part of the composition, not decorative content. */
  .w-page .w-hero-media{position:absolute;inset:0;overflow:hidden}
  .w-page .w-hero-slide{opacity:0;transform:scale(1.015);transition:opacity 1.4s ease,transform 8s cubic-bezier(.2,.72,.25,1)}
  .w-page .w-hero-slide.is-active{opacity:1;transform:scale(1.075)}
  .w-page .w-story-portrait{position:relative;grid-column:1/-1;justify-self:end;width:min(100%,36rem);margin:-1rem clamp(0rem,4vw,4rem) 0 0;aspect-ratio:4/5;overflow:hidden;background:var(--w-soft)}
  .w-page .w-story-portrait .w-story-image{width:100%;height:100%;max-height:none;border-radius:0;object-fit:cover;box-shadow:none;transition:transform 1.2s cubic-bezier(.2,.75,.2,1)}
  .w-page .w-story-portrait:hover .w-story-image{transform:scale(1.025)}
  .w-page .w-story-portrait span{position:absolute;right:1rem;bottom:.25rem;color:#fff9;font-family:var(--w-display);font-size:clamp(3rem,8vw,7rem);font-weight:400;line-height:1;mix-blend-mode:soft-light}
  .w-page .w-divider{position:relative;max-height:none;background:var(--w-ink)}
  .w-page .w-divider-image{height:clamp(25rem,66vw,52rem);object-position:center 42%;transition:transform 1.6s cubic-bezier(.2,.75,.2,1)}
  .w-page .w-divider:hover .w-divider-image{transform:scale(1.018)}
  .w-page .w-divider:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 56%,#0007);pointer-events:none}
  .w-page .w-divider-mark{position:absolute;z-index:2;right:clamp(1rem,4vw,4rem);bottom:clamp(1rem,4vw,3rem);color:#fff;border-bottom:1px solid #fff8;padding-bottom:.45rem;font-size:.68rem;font-weight:700;letter-spacing:.2em}
  .w-page .w-prewedding{overflow:hidden;background:var(--w-bg)}
  .w-page .w-photo-head{display:grid;grid-template-columns:minmax(0,1fr) minmax(16rem,.55fr);align-items:end;gap:clamp(2rem,7vw,7rem);margin-bottom:clamp(2.5rem,6vw,5.5rem)}
  .w-page .w-photo-head>p{max-width:34rem;margin:0;color:color-mix(in srgb,var(--w-ink) 72%,transparent);font-size:clamp(.95rem,1.3vw,1.08rem);line-height:1.8}
  .w-page .w-photo-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));grid-auto-flow:dense;grid-auto-rows:clamp(11rem,20vw,19rem);gap:clamp(.45rem,1.15vw,1rem)}
  .w-page .w-photo-card{position:relative;grid-column:span 4;min-width:0;overflow:hidden;background:var(--w-soft)}
  .w-page .w-photo-card>img{display:block;width:100%;height:100%;object-fit:cover;transition:transform 1.25s cubic-bezier(.2,.75,.2,1),filter .6s ease}
  .w-page .w-photo-card:hover>img{transform:scale(1.035)}
  .w-page .w-photo-card>span{position:absolute;right:.8rem;bottom:.65rem;color:#fff;font-size:.62rem;font-weight:750;letter-spacing:.16em;text-shadow:0 1px 10px #000}
  .w-page[data-wedding-layout="centered"] .w-photo-card:nth-child(1){grid-column:1/8;grid-row:span 2}
  .w-page[data-wedding-layout="centered"] .w-photo-card:nth-child(2),.w-page[data-wedding-layout="centered"] .w-photo-card:nth-child(3){grid-column:8/13}
  .w-page[data-wedding-layout="editorial"] .w-photo-grid{gap:clamp(.7rem,2vw,2rem)}
  .w-page[data-wedding-layout="editorial"] .w-photo-card:nth-child(1){grid-column:1/7;grid-row:span 2}
  .w-page[data-wedding-layout="editorial"] .w-photo-card:nth-child(2){grid-column:8/13;grid-row:span 1}
  .w-page[data-wedding-layout="editorial"] .w-photo-card:nth-child(3){grid-column:7/12;grid-row:span 1}
  .w-page[data-wedding-layout="split"] .w-photo-grid{grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:auto;gap:clamp(1rem,3vw,3rem);align-items:start}
  .w-page[data-wedding-layout="split"] .w-photo-card{grid-column:auto;aspect-ratio:4/5}
  .w-page[data-wedding-layout="split"] .w-photo-card:nth-child(even){margin-top:clamp(3rem,9vw,8rem);aspect-ratio:5/4}
  .w-page[data-wedding-layout="framed"] .w-photo-grid{gap:clamp(1rem,2.5vw,2.5rem);padding:clamp(1rem,3vw,3rem);border:1px solid color-mix(in srgb,var(--w-ink) 22%,transparent)}
  .w-page[data-wedding-layout="framed"] .w-photo-card{grid-column:span 6;padding:clamp(.45rem,1vw,.85rem);border:1px solid color-mix(in srgb,var(--w-ink) 22%,transparent);background:var(--w-bg)}
  .w-page[data-wedding-layout="poster"] .w-photo-grid{gap:0;grid-auto-rows:clamp(11rem,24vw,23rem)}
  .w-page[data-wedding-layout="poster"] .w-photo-card:nth-child(1){grid-column:1/9;grid-row:span 2}
  .w-page[data-wedding-layout="poster"] .w-photo-card:nth-child(2){z-index:2;grid-column:8/13;margin:clamp(2rem,7vw,6rem) 0 calc(clamp(2rem,7vw,6rem) * -1) clamp(1rem,2vw,2rem)}
  .w-page[data-wedding-layout="poster"] .w-photo-card:nth-child(3){grid-column:9/13}
  .w-page[data-wedding-layout="poster"] .w-photo-card:nth-child(n+4){grid-column:span 4}

  .w-page[data-wedding-theme="cypress"] .w-story-portrait,.w-page[data-wedding-theme="lumiere"] .w-story-portrait{border-radius:50% 50% 1.5rem 1.5rem}
  .w-page[data-wedding-theme="nocturne"] .w-prewedding,.w-page[data-wedding-theme="vinifera"] .w-prewedding{background:var(--w-panel)}
  .w-page[data-wedding-theme="nocturne"] .w-photo-card:nth-child(even),.w-page[data-wedding-theme="vinifera"] .w-photo-card:nth-child(even){transform:translateY(clamp(1rem,4vw,3rem))}
  .w-page[data-wedding-theme="atelier"] .w-photo-card{border:2px solid var(--w-ink)}
  .w-page[data-wedding-theme="atelier"] .w-photo-card>img{filter:grayscale(1) contrast(1.04)}
  .w-page[data-wedding-theme="champagne"] .w-photo-card{outline:1px solid var(--w-accent);outline-offset:-.8rem}
  .w-page[data-wedding-theme="wildflower"] .w-photo-card:nth-child(odd){transform:rotate(-1.15deg)}
  .w-page[data-wedding-theme="wildflower"] .w-photo-card:nth-child(even){transform:rotate(1.15deg)}
  .w-page[data-wedding-theme="terracotta"] .w-photo-card:nth-child(1){clip-path:polygon(7% 0,100% 0,93% 100%,0 100%)}
  .w-page[data-wedding-theme="monogram"] .w-photo-card>span{color:var(--w-ink);text-shadow:none}
  .w-page[data-wedding-theme="deco"] .w-photo-grid{border-color:var(--w-accent)}
  .w-page[data-wedding-theme="deco"] .w-photo-card{outline:1px solid var(--w-accent);outline-offset:-.55rem}
  .w-page[data-wedding-theme="celeste"] .w-photo-card{border-radius:1.25rem}
  .w-page[data-wedding-theme="pearl"] .w-photo-grid{gap:clamp(1.5rem,4vw,4rem);border:0;padding:0}
  .w-page[data-wedding-theme="solstice"] .w-photo-card:nth-child(2){box-shadow:clamp(.8rem,2vw,1.5rem) clamp(.8rem,2vw,1.5rem) 0 var(--w-accent)}
  .w-page[data-wedding-theme="alpine"] .w-photo-card{outline:1px solid color-mix(in srgb,var(--w-ink) 28%,transparent);outline-offset:-1px}

  /* Collision-safe translated navigation. */
  .w-page .w-top{
    position:absolute;
    inset:0 0 auto;
    z-index:40;
    display:grid;
    grid-template-columns:minmax(12rem,.8fr) minmax(0,2.7fr) minmax(5.5rem,.65fr);
    align-items:center;
    gap:clamp(.65rem,1.8vw,1.4rem);
    width:100%;
    min-width:0;
    padding:clamp(.9rem,2vw,1.6rem) clamp(1rem,3vw,3.25rem);
    color:var(--w-nav-ink);
  }
  .w-page .w-top>.brand-mark{min-width:11.5rem;max-width:none;color:inherit;filter:none}
  .w-page .w-top>.brand-mark>span{display:block!important;min-width:0;overflow:visible;text-overflow:clip;white-space:nowrap}
  .w-page .w-top>.brand-mark strong{font-size:clamp(1rem,1.45vw,1.25rem);line-height:1}
  .w-page .w-top>.brand-mark strong+span{display:block!important;margin-top:.3rem;font-size:clamp(.46rem,.58vw,.56rem);line-height:1;letter-spacing:.17em;overflow:visible;text-overflow:clip}
  .w-page:is([data-wedding-theme="lumiere"],[data-wedding-theme="atelier"],[data-wedding-theme="aegean"],[data-wedding-theme="wildflower"],[data-wedding-theme="terracotta"],[data-wedding-theme="monogram"],[data-wedding-theme="celeste"],[data-wedding-theme="pearl"],[data-wedding-theme="solstice"]) .w-top>.brand-mark img{filter:brightness(0)}
  .w-page .w-top>select{
    justify-self:end;
    width:auto;
    min-width:4.6rem;
    max-width:7rem;
    border:1px solid var(--w-nav-border);
    border-radius:var(--w-control-radius);
    background:var(--w-nav-bg);
    color:inherit;
    box-shadow:none;
    backdrop-filter:blur(16px) saturate(125%);
  }
  .w-page .w-nav{
    display:flex;
    min-width:0;
    max-width:100%;
    align-items:center;
    justify-content:safe center;
    gap:clamp(.65rem,1.4vw,1.25rem);
    overflow-x:auto;
    overscroll-behavior-inline:contain;
    scrollbar-width:none;
  }
  .w-page .w-nav::-webkit-scrollbar{display:none}
  .w-page .w-nav a{
    flex:0 0 auto;
    padding:.48rem .05rem;
    color:inherit;
    font-size:clamp(.66rem,.72vw,.74rem);
    font-weight:650;
    line-height:1.2;
    letter-spacing:.105em;
    text-align:center;
    text-decoration:none;
    text-shadow:none;
    text-transform:uppercase;
    white-space:nowrap;
  }
  .w-page .w-nav a:after{background:currentColor}

  /* Guest tools inherit the edition instead of falling back to app UI. */
  .w-page :is(.w-integrated-card,.w-detail-grid article,.w-experience-card,.w-event-card,.w-menu-document,.w-empty){border-radius:var(--w-radius)!important}
  .w-page :is(.w-integrated-button,.w-select-actions button,.w-button){border-radius:var(--w-control-radius)!important;font-family:inherit}
  .w-page .w-integrated :is(input[type="text"],input[type="file"],input:not([type]),textarea,select){
    border-color:color-mix(in srgb,var(--w-ink) 22%,transparent)!important;
    border-radius:var(--w-control-radius)!important;
    background:color-mix(in srgb,var(--w-panel) 94%,transparent)!important;
    color:var(--w-ink)!important;
    font-family:inherit;
  }
  .w-page .w-integrated label{border-radius:var(--w-radius)!important}
  .w-page .w-share-card [class*="rounded-full"]{border:1px solid color-mix(in srgb,#fff 28%,transparent);box-shadow:none}
  .w-page .w-section-head{align-items:flex-start}
  .w-page .w-guest-grid,.w-page .w-detail-grid,.w-page .w-experience-grid{align-items:stretch}
  .w-page #participate{
    width:100%;
    margin:0;
    border:0!important;
    border-radius:0!important;
    background:var(--w-panel)!important;
    padding:var(--w-section-space) clamp(1.25rem,6vw,7rem)!important;
    color:var(--w-ink);
    box-shadow:none!important;
  }
  .w-page #participate>div{width:min(100%,76rem);margin:auto;gap:clamp(2rem,5vw,5rem)}
  .w-page #participate h2{margin-top:.6rem!important;color:var(--w-ink)!important;font-family:var(--w-display);font-size:clamp(2.25rem,4.5vw,4rem)!important;font-weight:400;line-height:1}
  .w-page #participate p{color:color-mix(in srgb,var(--w-ink) 74%,transparent)!important}
  .w-page #participate div>p:first-child{color:var(--w-accent)!important;font-size:.68rem;letter-spacing:.2em}
  .w-page #participate :is(input,select,textarea){border-color:color-mix(in srgb,var(--w-ink) 22%,transparent)!important;border-radius:var(--w-control-radius)!important;background:var(--w-bg)!important;color:var(--w-ink)!important;font-family:inherit}
  .w-page #participate button{border-radius:var(--w-control-radius)!important;background:var(--w-ink)!important;color:var(--w-bg)!important;font-family:inherit}
  .w-page #participate blockquote,.w-page #participate form+div>p{border-color:color-mix(in srgb,var(--w-ink) 18%,transparent)!important;border-radius:var(--w-radius)!important;background:var(--w-bg)!important}

  /* 01 — Cypress: quiet Mediterranean editorial, centered and organic. */
  .w-page[data-wedding-theme="cypress"]{--w-radius:1.6rem;--w-control-radius:999px;--w-title-size:clamp(2.3rem,4.6vw,4.4rem)}
  .w-page[data-wedding-theme="cypress"] .w-top{margin:1rem auto 0;left:50%;right:auto;width:min(calc(100% - 2rem),78rem);transform:translateX(-50%);border:1px solid #ffffff32;border-radius:999px;background:#173d344f;backdrop-filter:blur(18px)}
  .w-page[data-wedding-theme="cypress"] .w-hero-copy{justify-content:center;padding-top:10rem;padding-bottom:5rem}
  .w-page[data-wedding-theme="cypress"] .w-hero h1{font-style:italic;max-width:10ch}
  .w-page[data-wedding-theme="cypress"] .w-story-grid{grid-template-columns:minmax(12rem,.62fr) minmax(0,1.38fr)}
  .w-page[data-wedding-theme="cypress"] .w-event-card{border-radius:8rem 8rem 1.6rem 1.6rem!important;padding-top:5rem}

  /* 02 — Nocturne: cinematic left rail and dark editorial pacing. */
  .w-page[data-wedding-theme="nocturne"]{--w-radius:0;--w-control-radius:0;--w-title-size:clamp(2.5rem,5.4vw,5.1rem);--w-section-space:clamp(5rem,10vw,9rem)}
  .w-page[data-wedding-theme="nocturne"] .w-top{grid-template-columns:8rem minmax(0,1fr) 6rem;border-bottom:1px solid #ffffff2e;background:linear-gradient(#090a0acc,#090a0a42)}
  .w-page[data-wedding-theme="nocturne"] .w-nav{justify-content:flex-start}
  .w-page[data-wedding-theme="nocturne"] .w-hero-copy{align-items:flex-start;justify-content:center;width:min(88%,82rem);padding-left:clamp(1rem,8vw,9rem);text-align:left}
  .w-page[data-wedding-theme="nocturne"] .w-hero h1{max-width:7ch;margin:0;text-align:left}
  .w-page[data-wedding-theme="nocturne"] .w-hero h1:after{margin-left:0}
  .w-page[data-wedding-theme="nocturne"] .w-story-grid{grid-template-columns:.45fr 1.55fr}
  .w-page[data-wedding-theme="nocturne"] .w-schedule-grid{grid-template-columns:1fr;border-block:1px solid currentColor;background:transparent}
  .w-page[data-wedding-theme="nocturne"] .w-event-card{display:grid;grid-template-columns:5rem .45fr 1.55fr;align-items:center;border-bottom:1px solid color-mix(in srgb,var(--w-ink) 18%,transparent);padding:2.5rem 0}
  .w-page[data-wedding-theme="nocturne"] .w-event-card>span{position:static;grid-column:1;grid-row:1/3;font-size:2rem}
  .w-page[data-wedding-theme="nocturne"] .w-event-card>p{grid-column:2;grid-row:1/3}
  .w-page[data-wedding-theme="nocturne"] .w-event-card h3{grid-column:3;grid-row:1;margin:0}
  .w-page[data-wedding-theme="nocturne"] .w-event-card a{grid-column:3;grid-row:2}

  /* 03 — Lumiere: romantic invitation with soft arches. */
  .w-page[data-wedding-theme="lumiere"]{--w-radius:2.4rem;--w-control-radius:999px;--w-title-size:clamp(2.35rem,4.8vw,4.6rem)}
  .w-page[data-wedding-theme="lumiere"] .w-top{top:1rem;left:50%;width:min(calc(100% - 2rem),70rem);transform:translateX(-50%);border-radius:999px;background:#fff8;color:#5d4541;box-shadow:0 18px 55px #5d45411f;backdrop-filter:blur(20px)}
  .w-page[data-wedding-theme="lumiere"] .w-top>select{--w-nav-bg:#fff8;--w-nav-border:#5d454134}
  .w-page[data-wedding-theme="lumiere"] .w-hero{min-height:92svh;margin:1rem;border-radius:clamp(1.5rem,4vw,4rem)}
  .w-page[data-wedding-theme="lumiere"] .w-hero-copy{justify-content:flex-end;padding-bottom:clamp(3rem,8vh,7rem)}
  .w-page[data-wedding-theme="lumiere"] .w-hero h1{font-style:italic;line-height:.94}
  .w-page[data-wedding-theme="lumiere"] .w-story-grid{grid-template-columns:1fr;justify-items:center;text-align:center}.w-page[data-wedding-theme="lumiere"] .w-story-copy{margin:auto}
  .w-page[data-wedding-theme="lumiere"] .w-event-card{border:0;box-shadow:0 28px 80px #6d514c15}

  /* 04 — Atelier: fashion magazine, monochrome and asymmetric. */
  .w-page[data-wedding-theme="atelier"]{--w-radius:0;--w-control-radius:0;--w-hero-size:clamp(3.2rem,7.7vw,7rem);--w-title-size:clamp(2.6rem,5.6vw,5.2rem);--w-section-space:clamp(5rem,9vw,8rem)}
  .w-page[data-wedding-theme="atelier"] .w-top{color:#111;border-bottom:2px solid #111;background:#f7f5f0f0;mix-blend-mode:normal}
  .w-page[data-wedding-theme="atelier"] .w-top>select{--w-nav-bg:transparent;--w-nav-border:#111}
  .w-page[data-wedding-theme="atelier"] .w-nav a{font-weight:800;letter-spacing:.03em}
  .w-page[data-wedding-theme="atelier"] .w-hero{min-height:96svh;margin-top:0;background:#f7f5f0;color:#111}
  .w-page[data-wedding-theme="atelier"] .w-cover{left:42%;width:58%}
  .w-page[data-wedding-theme="atelier"] .w-hero:after{background:linear-gradient(90deg,#f7f5f0 0 42%,transparent 42%)}
  .w-page[data-wedding-theme="atelier"] .w-hero:before{display:none}
  .w-page[data-wedding-theme="atelier"] .w-hero-copy{align-items:flex-start;justify-content:flex-end;width:42%;margin-right:auto;padding:9rem 3vw 5rem;text-align:left}
  .w-page[data-wedding-theme="atelier"] .w-hero h1{max-width:7ch;margin:0;color:#111;background:none;-webkit-text-fill-color:currentColor;text-transform:uppercase;filter:none}
  .w-page[data-wedding-theme="atelier"] :is(.w-kicker,.w-hero-message,.w-date,.w-scroll){color:#111;text-shadow:none}
  .w-page[data-wedding-theme="atelier"] .w-hero h1:after{margin-left:0;background:#111}
  .w-page[data-wedding-theme="atelier"] .w-story-grid{grid-template-columns:1.3fr .7fr}.w-page[data-wedding-theme="atelier"] .w-story-copy{font-size:1rem;columns:2;column-gap:3rem}
  .w-page[data-wedding-theme="atelier"] .w-event-card{border:2px solid var(--w-ink);margin-top:-2px}

  /* 05 — Aegean: destination split screen with a paper information panel. */
  .w-page[data-wedding-theme="aegean"]{--w-radius:.35rem;--w-control-radius:.35rem;--w-title-size:clamp(2.3rem,4.9vw,4.7rem)}
  .w-page[data-wedding-theme="aegean"] .w-top{color:#153b56;background:#f7f2e8e8;border-bottom:1px solid #153b5630}
  .w-page[data-wedding-theme="aegean"] .w-top>select{--w-nav-bg:#fff8;--w-nav-border:#153b5638}
  .w-page[data-wedding-theme="aegean"] .w-hero{background:#f7f2e8;color:#153b56}
  .w-page[data-wedding-theme="aegean"] .w-cover{left:50%;width:50%}
  .w-page[data-wedding-theme="aegean"] .w-hero:after{background:linear-gradient(90deg,#f7f2e8 0 50%,transparent 50%)}
  .w-page[data-wedding-theme="aegean"] .w-hero:before{left:50%;inset-block:0;right:0;background:linear-gradient(180deg,#153b5610,#153b5668);animation:none}
  .w-page[data-wedding-theme="aegean"] .w-hero-copy{align-items:flex-start;width:50%;margin-right:auto;padding:9rem 6vw 4rem;text-align:left}
  .w-page[data-wedding-theme="aegean"] .w-hero h1{max-width:8ch;margin:0;color:#153b56;background:none;-webkit-text-fill-color:currentColor;filter:none}
  .w-page[data-wedding-theme="aegean"] :is(.w-kicker,.w-hero-message,.w-date,.w-scroll){color:#153b56;text-shadow:none}.w-page[data-wedding-theme="aegean"] .w-hero h1:after{margin-left:0;background:#153b56}
  .w-page[data-wedding-theme="aegean"] .w-story-grid{grid-template-columns:.7fr 1.3fr}

  /* 06 — Champagne: formal double-frame ballroom invitation. */
  .w-page[data-wedding-theme="champagne"]{--w-radius:0;--w-control-radius:0;--w-title-size:clamp(2.25rem,4.4vw,4.25rem)}
  .w-page[data-wedding-theme="champagne"] .w-top{top:2rem;left:50%;width:min(calc(100% - 6rem),74rem);transform:translateX(-50%);border-bottom:1px solid #fff8}
  .w-page[data-wedding-theme="champagne"] .w-hero{min-height:calc(100svh - 3rem);margin:1.5rem;outline:1px solid #fff8;outline-offset:-1.2rem}
  .w-page[data-wedding-theme="champagne"] .w-hero-copy{width:min(84%,56rem);justify-content:center;padding-top:10rem}
  .w-page[data-wedding-theme="champagne"] .w-hero-copy:before{content:"";position:absolute;inset:8rem 0 3rem;border:1px solid #ffffff42;pointer-events:none}
  .w-page[data-wedding-theme="champagne"] .w-hero h1{max-width:12ch;line-height:1}
  .w-page[data-wedding-theme="champagne"] .w-story-grid{grid-template-columns:1fr;justify-items:center;text-align:center}
  .w-page[data-wedding-theme="champagne"] .w-schedule-grid{gap:1.5rem;background:transparent}.w-page[data-wedding-theme="champagne"] .w-event-card{border:1px solid var(--w-accent)}

  /* 07 — Wildflower: expressive garden collage. */
  .w-page[data-wedding-theme="wildflower"]{--w-radius:2rem 0 2rem 0;--w-control-radius:999px;--w-title-size:clamp(2.45rem,5.2vw,4.9rem)}
  .w-page[data-wedding-theme="wildflower"] .w-top{margin:.8rem;width:calc(100% - 1.6rem);border-radius:1.4rem;background:#fff9;color:#334f3d;box-shadow:0 12px 40px #334f3d18}
  .w-page[data-wedding-theme="wildflower"] .w-top>select{--w-nav-bg:#fff;--w-nav-border:#334f3d32}
  .w-page[data-wedding-theme="wildflower"] .w-hero{min-height:94svh;margin:.8rem;border-radius:2rem 0 2rem 0}
  .w-page[data-wedding-theme="wildflower"] .w-hero-copy{align-items:flex-start;justify-content:flex-end;text-align:left;padding-left:7vw}
  .w-page[data-wedding-theme="wildflower"] .w-hero h1{max-width:9ch;margin:0;font-style:italic}.w-page[data-wedding-theme="wildflower"] .w-hero h1:after{margin-left:0}
  .w-page[data-wedding-theme="wildflower"] .w-story:after{content:"✽";position:absolute;right:7vw;bottom:2vw;color:var(--w-accent);font-size:clamp(5rem,13vw,12rem);opacity:.18}
  .w-page[data-wedding-theme="wildflower"] .w-schedule-grid{gap:1rem;background:transparent}.w-page[data-wedding-theme="wildflower"] .w-event-card:nth-child(even){transform:translateY(2rem)}

  /* 08 — Terracotta: relaxed Mediterranean blocks and diagonal image crop. */
  .w-page[data-wedding-theme="terracotta"]{--w-radius:.75rem;--w-control-radius:.25rem;--w-title-size:clamp(2.35rem,5vw,4.7rem)}
  .w-page[data-wedding-theme="terracotta"] .w-top{color:#4f3b30;background:#f3e6d4e6;border-bottom:1px solid #4f3b3030}
  .w-page[data-wedding-theme="terracotta"] .w-top>select{--w-nav-bg:#fff7;--w-nav-border:#4f3b3038}
  .w-page[data-wedding-theme="terracotta"] .w-hero{background:#bd7658;color:#fff}
  .w-page[data-wedding-theme="terracotta"] .w-cover{left:38%;width:62%;clip-path:polygon(16% 0,100% 0,100% 100%,0 100%)}
  .w-page[data-wedding-theme="terracotta"] .w-hero:after{background:linear-gradient(90deg,#9f583f 0 43%,transparent 70%),linear-gradient(180deg,transparent,#4f2b1e8f)}
  .w-page[data-wedding-theme="terracotta"] .w-hero-copy{align-items:flex-start;width:48%;margin-right:auto;padding-left:6vw;text-align:left}.w-page[data-wedding-theme="terracotta"] .w-hero h1{max-width:8ch;margin:0}.w-page[data-wedding-theme="terracotta"] .w-hero h1:after{margin-left:0}
  .w-page[data-wedding-theme="terracotta"] .w-section:nth-of-type(even) .w-inner{width:min(90%,64rem)}
  .w-page[data-wedding-theme="terracotta"] .w-event-card{border-left:.45rem solid var(--w-accent)}

  /* 09 — Monogram: restrained stationery with a large custom seal. */
  .w-page[data-wedding-theme="monogram"]{--w-radius:0;--w-control-radius:0;--w-hero-size:clamp(2.9rem,6vw,5.7rem);--w-title-size:clamp(2.4rem,5vw,4.6rem);--w-section-space:clamp(5rem,9vw,7.5rem)}
  .w-page[data-wedding-theme="monogram"] .w-top{top:1rem;left:50%;width:min(calc(100% - 2rem),76rem);transform:translateX(-50%);color:#2d3431;border:1px solid #2d343138;background:#faf9f4e8}
  .w-page[data-wedding-theme="monogram"] .w-top>select{--w-nav-bg:transparent;--w-nav-border:#2d343142}
  .w-page[data-wedding-theme="monogram"] .w-hero{min-height:calc(100svh - 2rem);margin:1rem;background:#faf9f4;color:#2d3431;outline:1px solid #2d343150;outline-offset:-1.2rem}
  .w-page[data-wedding-theme="monogram"] .w-cover{opacity:.18;filter:grayscale(1)}
  .w-page[data-wedding-theme="monogram"] .w-hero:after{background:#faf9f4b8}
  .w-page[data-wedding-theme="monogram"] .w-hero:before{content:var(--w-monogram);inset:auto;left:50%;top:45%;width:auto;transform:translate(-50%,-50%);background:none;color:#2d34310b;font-family:var(--w-display);font-size:min(42vw,30rem);line-height:1;opacity:1;animation:none}
  .w-page[data-wedding-theme="monogram"] .w-hero-copy{justify-content:center;color:#2d3431}.w-page[data-wedding-theme="monogram"] .w-hero h1{color:#2d3431;background:none;-webkit-text-fill-color:currentColor;filter:none;letter-spacing:.02em}.w-page[data-wedding-theme="monogram"] :is(.w-kicker,.w-hero-message,.w-date,.w-scroll){color:#2d3431;text-shadow:none}
  .w-page[data-wedding-theme="monogram"] .w-story-grid{grid-template-columns:1fr;justify-items:center;text-align:center}

  /* 10 — Deco: geometric evening poster. */
  .w-page[data-wedding-theme="deco"]{--w-radius:0;--w-control-radius:0;--w-hero-size:clamp(3rem,6.8vw,6.2rem);--w-title-size:clamp(2.45rem,5.2vw,4.9rem)}
  .w-page[data-wedding-theme="deco"] .w-top{top:1.7rem;left:50%;width:min(calc(100% - 7rem),70rem);transform:translateX(-50%);border-block:1px solid var(--w-accent)}
  .w-page[data-wedding-theme="deco"] .w-nav a{letter-spacing:.17em}
  .w-page[data-wedding-theme="deco"] .w-hero{min-height:100svh;outline:1px solid var(--w-accent);outline-offset:-1.4rem}
  .w-page[data-wedding-theme="deco"] .w-hero-copy{justify-content:center;width:min(82%,60rem);padding-top:10rem}
  .w-page[data-wedding-theme="deco"] .w-hero h1{text-transform:uppercase;line-height:.82;letter-spacing:-.045em}
  .w-page[data-wedding-theme="deco"] .w-story-grid{grid-template-columns:1fr;justify-items:center;text-align:center}
  .w-page[data-wedding-theme="deco"] :is(.w-event-card,.w-integrated-card,.w-detail-grid article){border:1px solid var(--w-accent)!important;background:transparent}

  /* 11 — Celeste: airy coastal photo with a lower glass navigation dock. */
  .w-page[data-wedding-theme="celeste"]{--w-radius:1.25rem;--w-control-radius:999px;--w-title-size:clamp(2.3rem,4.7vw,4.5rem)}
  .w-page[data-wedding-theme="celeste"] .w-top{top:auto;bottom:1.25rem;left:50%;width:min(calc(100% - 2.5rem),76rem);transform:translateX(-50%);border:1px solid #ffffff58;border-radius:1.4rem;background:#f7faf9cf;color:#334855;box-shadow:0 18px 65px #2337422b;backdrop-filter:blur(24px)}
  .w-page[data-wedding-theme="celeste"] .w-top>select{--w-nav-bg:#fff8;--w-nav-border:#33485538}
  .w-page[data-wedding-theme="celeste"] .w-hero{min-height:92svh;margin:1rem;border-radius:1.5rem}
  .w-page[data-wedding-theme="celeste"] .w-hero-copy{justify-content:flex-end;padding-bottom:8rem}
  .w-page[data-wedding-theme="celeste"] .w-story-grid{grid-template-columns:1fr;justify-items:center;text-align:center}
  .w-page[data-wedding-theme="celeste"] .w-schedule-grid{gap:1rem;background:transparent}.w-page[data-wedding-theme="celeste"] .w-event-card{box-shadow:0 24px 65px #33485513}

  /* 12 — Vinifera: vineyard editorial with a burgundy content rail. */
  .w-page[data-wedding-theme="vinifera"]{--w-radius:.2rem;--w-control-radius:.2rem;--w-title-size:clamp(2.45rem,5.2vw,5rem)}
  .w-page[data-wedding-theme="vinifera"] .w-top{grid-template-columns:8rem minmax(0,1fr) 6rem;background:#35121cd1;border-bottom:1px solid #ffffff2e}
  .w-page[data-wedding-theme="vinifera"] .w-nav{justify-content:flex-start}
  .w-page[data-wedding-theme="vinifera"] .w-hero-copy{align-items:flex-start;justify-content:center;width:min(92%,82rem);padding-left:clamp(1rem,8vw,8rem);text-align:left}.w-page[data-wedding-theme="vinifera"] .w-hero h1{max-width:7ch;margin:0}.w-page[data-wedding-theme="vinifera"] .w-hero h1:after{margin-left:0}
  .w-page[data-wedding-theme="vinifera"] .w-story-grid{grid-template-columns:.5fr 1.5fr}
  .w-page[data-wedding-theme="vinifera"] .w-section{border-top:1px solid color-mix(in srgb,var(--w-ink) 18%,transparent)}
  .w-page[data-wedding-theme="vinifera"] .w-event-card{border-left:1px solid var(--w-accent)}

  /* 13 — Pearl: gallery-like whitespace and near-invisible chrome. */
  .w-page[data-wedding-theme="pearl"]{--w-radius:0;--w-control-radius:999px;--w-hero-size:clamp(2.9rem,6.5vw,6rem);--w-title-size:clamp(2.5rem,5vw,4.7rem);--w-section-space:clamp(6rem,12vw,10rem)}
  .w-page[data-wedding-theme="pearl"] .w-top{color:#4d504e;background:#fdfcf8e8;border-bottom:1px solid #4d504e20}
  .w-page[data-wedding-theme="pearl"] .w-top>select{--w-nav-bg:transparent;--w-nav-border:#4d504e30}
  .w-page[data-wedding-theme="pearl"] .w-hero{min-height:88svh;margin:5rem 4vw 0;background:#fdfcf8;color:#4d504e}
  .w-page[data-wedding-theme="pearl"] .w-cover{inset:3rem 8%;width:84%;height:calc(100% - 6rem);opacity:.78}
  .w-page[data-wedding-theme="pearl"] .w-hero:after{background:linear-gradient(180deg,#fdfcf822,#fdfcf8e8)}.w-page[data-wedding-theme="pearl"] .w-hero:before{display:none}
  .w-page[data-wedding-theme="pearl"] .w-hero-copy{justify-content:flex-end;color:#4d504e;padding-bottom:3rem}.w-page[data-wedding-theme="pearl"] .w-hero h1{color:#4d504e;background:none;-webkit-text-fill-color:currentColor;filter:none}.w-page[data-wedding-theme="pearl"] :is(.w-kicker,.w-hero-message,.w-date,.w-scroll){color:#4d504e;text-shadow:none}
  .w-page[data-wedding-theme="pearl"] .w-story-grid{grid-template-columns:1fr;justify-items:center;text-align:center}.w-page[data-wedding-theme="pearl"] :is(.w-event-card,.w-integrated-card,.w-detail-grid article){border-inline:0!important;background:transparent}

  /* 14 — Solstice: bold contemporary color-block poster. */
  .w-page[data-wedding-theme="solstice"]{--w-radius:0;--w-control-radius:0;--w-hero-size:clamp(3.3rem,7.8vw,7rem);--w-title-size:clamp(2.65rem,5.8vw,5.35rem);--w-section-space:clamp(4.5rem,8vw,7rem)}
  .w-page[data-wedding-theme="solstice"] .w-top{color:#432a38;background:#f6d9c8;border-bottom:3px solid #432a38}
  .w-page[data-wedding-theme="solstice"] .w-top>select{--w-nav-bg:transparent;--w-nav-border:#432a38}
  .w-page[data-wedding-theme="solstice"] .w-nav a{font-weight:850;letter-spacing:0}
  .w-page[data-wedding-theme="solstice"] .w-hero{min-height:100svh;background:#432a38}
  .w-page[data-wedding-theme="solstice"] .w-cover{left:50%;width:50%}
  .w-page[data-wedding-theme="solstice"] .w-hero:after{background:linear-gradient(90deg,#432a38 0 50%,#432a3830 50%)}.w-page[data-wedding-theme="solstice"] .w-hero:before{display:none}
  .w-page[data-wedding-theme="solstice"] .w-hero-copy{align-items:flex-start;width:50%;margin-right:auto;padding:9rem 4vw 3rem;text-align:left}.w-page[data-wedding-theme="solstice"] .w-hero h1{max-width:6ch;margin:0;text-transform:uppercase;line-height:.74}.w-page[data-wedding-theme="solstice"] .w-hero h1:after{margin-left:0}
  .w-page[data-wedding-theme="solstice"] .w-story-grid{grid-template-columns:1.4fr .6fr}.w-page[data-wedding-theme="solstice"] .w-event-card>span{font-family:Manrope,sans-serif;font-weight:200}

  /* 15 — Alpine: precise architectural grid. */
  .w-page[data-wedding-theme="alpine"]{--w-radius:0;--w-control-radius:0;--w-hero-size:clamp(2.9rem,6.2vw,5.6rem);--w-title-size:clamp(2.35rem,4.8vw,4.6rem);--w-section-space:clamp(5rem,9vw,8rem)}
  .w-page[data-wedding-theme="alpine"] .w-top{color:#e8e9e4;background:#233a36e8;border-bottom:1px solid #e8e9e44a}
  .w-page[data-wedding-theme="alpine"] .w-hero{background:#233a36}
  .w-page[data-wedding-theme="alpine"] .w-cover{left:40%;width:60%}
  .w-page[data-wedding-theme="alpine"] .w-hero:after{background:linear-gradient(90deg,#233a36 0 40%,transparent 40%),linear-gradient(180deg,transparent,#233a3690)}.w-page[data-wedding-theme="alpine"] .w-hero:before{inset:0;background:repeating-linear-gradient(90deg,transparent 0 calc(20% - 1px),#ffffff18 calc(20% - 1px) 20%);animation:none;mix-blend-mode:normal}
  .w-page[data-wedding-theme="alpine"] .w-hero-copy{align-items:flex-start;width:40%;margin-right:auto;padding:9rem 4vw 4rem;text-align:left}.w-page[data-wedding-theme="alpine"] .w-hero h1{max-width:7ch;margin:0}.w-page[data-wedding-theme="alpine"] .w-hero h1:after{margin-left:0}
  .w-page[data-wedding-theme="alpine"] .w-inner{width:min(100%,82rem)}.w-page[data-wedding-theme="alpine"] .w-story-grid{grid-template-columns:.6fr 1.4fr}.w-page[data-wedding-theme="alpine"] :is(.w-event-card,.w-integrated-card,.w-detail-grid article){border:1px solid color-mix(in srgb,var(--w-ink) 24%,transparent)!important}

  @media(max-width:900px){
    .w-page .w-top{grid-template-columns:minmax(11rem,1fr) auto;gap:.65rem;padding:.8rem 1rem}
    .w-page .w-top>.brand-mark{min-width:10.5rem;max-width:none}
    .w-page .w-nav{grid-column:1/-1;grid-row:2;justify-content:flex-start;width:100%;padding-top:.2rem}
    .w-page .w-nav a{font-size:.66rem}
    .w-page[data-wedding-theme="celeste"] .w-top{top:1rem;bottom:auto}
    .w-page[data-wedding-theme="deco"] .w-top,.w-page[data-wedding-theme="champagne"] .w-top{width:calc(100% - 3rem)}
  }
  @media(max-width:759px){
    .w-page{--w-section-space:clamp(4.25rem,18vw,6.5rem);--w-title-size:clamp(2.15rem,9.2vw,3.55rem);--w-hero-size:clamp(2.75rem,11.5vw,4.6rem)}
    .w-page .w-top{display:grid}.w-page .w-nav{display:flex}
    .w-page .w-hero-copy{width:100%;min-height:100svh;padding:9.5rem 1.15rem 4rem}
    .w-page .w-hero h1{max-width:100%;font-size:var(--w-hero-size);line-height:.9}
    .w-page[data-wedding-name-scale="compact"]{--w-hero-size:clamp(2.45rem,10.5vw,4.15rem)}
    .w-page[data-wedding-name-scale="long"]{--w-hero-size:clamp(2.05rem,8.8vw,3.45rem)}
    .w-page[data-wedding-layout="poster"] .w-hero h1{font-size:var(--w-hero-size)}
    .w-page .w-story-grid,.w-page[data-wedding-theme] .w-story-grid{grid-template-columns:1fr}
    .w-page[data-wedding-theme="nocturne"] .w-event-card{display:block;padding:2rem 0}.w-page[data-wedding-theme="nocturne"] .w-event-card>span{display:block;margin-bottom:1rem}
    .w-page[data-wedding-theme="atelier"] .w-cover,.w-page[data-wedding-theme="aegean"] .w-cover,.w-page[data-wedding-theme="solstice"] .w-cover,.w-page[data-wedding-theme="alpine"] .w-cover{left:0;top:0;width:100%;height:52%}
    .w-page[data-wedding-theme="atelier"] .w-hero:after{background:linear-gradient(180deg,transparent 0 35%,#f7f5f0 52%)}
    .w-page[data-wedding-theme="aegean"] .w-hero:after{background:linear-gradient(180deg,transparent 0 35%,#f7f2e8 52%)}
    .w-page[data-wedding-theme="solstice"] .w-hero:after{background:linear-gradient(180deg,transparent 0 35%,#432a38 52%)}
    .w-page[data-wedding-theme="alpine"] .w-hero:after{background:linear-gradient(180deg,transparent 0 35%,#233a36 52%)}
    .w-page[data-wedding-theme="atelier"] .w-hero-copy,.w-page[data-wedding-theme="aegean"] .w-hero-copy,.w-page[data-wedding-theme="solstice"] .w-hero-copy,.w-page[data-wedding-theme="alpine"] .w-hero-copy{width:100%;justify-content:flex-end;padding:48svh 1.25rem 3rem}
    .w-page[data-wedding-theme="terracotta"] .w-cover{left:0;width:100%;clip-path:none}.w-page[data-wedding-theme="terracotta"] .w-hero:after{background:linear-gradient(180deg,#4f2b1e20,#4f2b1edb)}.w-page[data-wedding-theme="terracotta"] .w-hero-copy{width:100%;justify-content:flex-end;padding-inline:1.25rem}
    .w-page[data-wedding-theme="atelier"] .w-story-copy{columns:1}
    .w-page[data-wedding-theme="wildflower"] .w-event-card:nth-child(even){transform:none}
    .w-page[data-wedding-theme="pearl"] .w-hero{margin:6.5rem .6rem 0}.w-page[data-wedding-theme="pearl"] .w-cover{inset:1rem 4%;width:92%;height:calc(100% - 2rem)}
    .w-page .w-story-portrait{justify-self:stretch;width:100%;margin:0;aspect-ratio:4/5}
    .w-page .w-divider-image{height:65svh;min-height:26rem}
    .w-page .w-photo-head{grid-template-columns:1fr;gap:1.25rem;margin-bottom:2.25rem}
    .w-page .w-photo-grid,
    .w-page[data-wedding-layout="split"] .w-photo-grid,
    .w-page[data-wedding-layout="framed"] .w-photo-grid,
    .w-page[data-wedding-layout="poster"] .w-photo-grid{grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-flow:dense;grid-auto-rows:clamp(10rem,55vw,17rem);gap:.35rem;padding:0;border:0}
    .w-page .w-photo-card,
    .w-page[data-wedding-layout] .w-photo-card,
    .w-page[data-wedding-layout] .w-photo-card:nth-child(n){grid-column:auto;grid-row:auto;min-width:0;margin:0;aspect-ratio:auto;padding:0;transform:none;clip-path:none;border-radius:0}
    .w-page[data-wedding-layout] .w-photo-card:nth-child(1){grid-column:1/-1;grid-row:span 2}
    .w-page[data-wedding-layout] .w-photo-card:nth-child(4n+2){grid-row:span 2}
    .w-page[data-wedding-theme="champagne"] .w-photo-card,.w-page[data-wedding-theme="deco"] .w-photo-card{outline-offset:-.4rem}
  }
  @media(prefers-reduced-motion:reduce){.w-page *{scroll-behavior:auto!important}}
`;
