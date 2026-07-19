export const weddingLuxuryStyles = `
  .w-page{--w-display:'EB Garamond',Georgia,serif;--w-panel:color-mix(in srgb,var(--w-bg) 90%,#fff);overflow:clip;font-weight:330}
  .w-page[data-wedding-font="didot"]{--w-display:'GFS Didot','Noto Serif',Georgia,serif}
  .w-page[data-wedding-font="garamond"]{--w-display:'EB Garamond','Noto Serif',Georgia,serif}
  .w-page[data-wedding-font="noto-serif"]{--w-display:'Noto Serif',Georgia,serif}
  .w-page[data-wedding-font="modern"]{--w-display:Manrope,Arial,sans-serif}
  .w-page[data-wedding-font="modern"] :is(.w-hero h1,.w-section h2,.w-event-card h3,.w-detail-grid h3,.w-experience-card h3,.w-menu-document strong){font-weight:250;letter-spacing:-.055em}
  .w-top{position:absolute;inset:0 0 auto;z-index:30;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:1.25rem;padding:clamp(1rem,2.8vw,2.4rem) clamp(1rem,4vw,4.5rem);background:transparent!important;border:0!important;box-shadow:none!important;color:#fff}
  .w-top>.brand-mark{justify-self:start;color:#fff;filter:drop-shadow(0 2px 14px #0008)}
  .w-top>select{justify-self:end;min-width:4.6rem;border:1px solid #ffffff52;background:#10191624;color:#fff;box-shadow:inset 0 1px 0 #ffffff35,0 8px 28px #0002;backdrop-filter:blur(18px) saturate(130%)}
  .w-nav{align-items:center;justify-content:center;gap:clamp(.85rem,2vw,1.65rem)}
  .w-nav a{position:relative;padding:.45rem 0;color:#fff;text-decoration:none;text-shadow:0 2px 12px #0009;transition:opacity .25s ease}
  .w-nav a:after{content:"";position:absolute;left:50%;right:50%;bottom:.15rem;height:1px;background:linear-gradient(90deg,transparent,#fff,transparent);transition:left .3s ease,right .3s ease}
  .w-nav a:hover:after,.w-nav a:focus-visible:after{left:0;right:0}
  .w-hero{isolation:isolate;min-height:100svh;place-items:center;background:radial-gradient(circle at 22% 15%,color-mix(in srgb,var(--w-accent) 80%,#fff),transparent 36%),linear-gradient(145deg,#102f27,#365f52)}
  .w-cover{z-index:-3;transform:scale(1.012);animation:w-cover-arrive 2.2s cubic-bezier(.18,.75,.2,1) both}
  .w-hero:after{z-index:-1;background:linear-gradient(180deg,#08171070 0%,#10251d26 32%,#0b1e17d9 100%),linear-gradient(105deg,#0003,transparent 55%,#0004)}
  .w-hero:before{content:"";position:absolute;z-index:0;inset:-35%;pointer-events:none;background:radial-gradient(circle at 30% 28%,#fff5 0 2%,transparent 24%),radial-gradient(circle at 70% 45%,color-mix(in srgb,var(--w-accent) 48%,#fff) 0,transparent 26%),linear-gradient(115deg,transparent 38%,#fff1 48%,#fff4 50%,transparent 60%);background-size:auto,auto,220% 100%;mix-blend-mode:screen;opacity:.72;animation:w-aurora 10s ease-in-out infinite alternate}
  .w-hero-copy{display:flex;min-height:100svh;flex-direction:column;align-items:center;justify-content:flex-end;width:min(94%,78rem);padding:9.5rem 1rem clamp(4.5rem,9vh,8rem);text-align:center}
  .w-kicker{margin-bottom:clamp(1.4rem,3vw,2.4rem);font-size:.64rem;font-weight:600;letter-spacing:.38em;color:#fffef1;text-shadow:0 2px 18px #000b}
  .w-hero h1{position:relative;max-width:12ch;margin:0 auto;background:linear-gradient(105deg,#fff 5%,#f4e4c3 30%,#fff 48%,#d6b77f 58%,#fff 80%);background-size:240% auto;-webkit-background-clip:text;background-clip:text;color:transparent;font-size:clamp(3.8rem,11.5vw,10rem);font-weight:400;line-height:.82;letter-spacing:-.055em;filter:drop-shadow(0 8px 28px #0008);animation:w-title-shine 7.5s ease-in-out infinite}
  .w-hero h1:after{content:"";display:block;width:clamp(4rem,9vw,7rem);height:1px;margin:clamp(1.6rem,3vw,2.5rem) auto 0;background:linear-gradient(90deg,transparent,#fff9,transparent);box-shadow:0 0 18px #fff7}
  .w-hero-message{margin-top:1.1rem;color:#fffefa;font-weight:300;text-shadow:0 2px 16px #000a}
  .w-date{margin-top:1.25rem;color:#fff;font-weight:550;text-shadow:0 2px 14px #000b}
  .w-scroll{width:2.8rem;height:2.8rem;align-items:center;justify-content:center;border:1px solid #ffffff4d;border-radius:50%;margin-top:2.2rem;background:#ffffff0d;text-decoration:none;box-shadow:inset 0 1px 0 #ffffff2e;backdrop-filter:blur(12px)}
  .w-section{position:relative}
  .w-section h2{letter-spacing:-.045em;text-wrap:balance}
  .w-eyebrow{font-weight:650}
  .w-story:before{content:"";position:absolute;right:-12rem;top:-12rem;width:30rem;height:30rem;border-radius:50%;background:color-mix(in srgb,var(--w-accent) 9%,transparent);filter:blur(2rem);pointer-events:none}
  .w-event-card{overflow:hidden;transition:transform .45s cubic-bezier(.2,.8,.2,1),background .45s ease}
  .w-event-card:before{content:"";position:absolute;inset:0;background:linear-gradient(120deg,transparent 35%,color-mix(in srgb,var(--w-accent) 8%,transparent),transparent 65%);transform:translateX(-110%);transition:transform .8s ease}
  .w-event-card:hover:before{transform:translateX(110%)}
  .w-menu{overflow:hidden;background:linear-gradient(145deg,var(--w-panel),color-mix(in srgb,var(--w-soft) 44%,var(--w-panel)))}
  .w-menu-layout{display:grid;gap:clamp(2rem,6vw,6rem);align-items:center}
  .w-menu-frame{position:relative;margin-top:2.5rem}
  .w-menu-frame:before{content:"";position:absolute;inset:-1.1rem;border:1px solid color-mix(in srgb,var(--w-accent) 28%,transparent);pointer-events:none}
  .w-menu-image{display:block;width:100%;max-height:78svh;object-fit:contain;background:#fff;box-shadow:0 35px 90px #162b2324}
  .w-menu-document{display:flex;min-height:22rem;flex-direction:column;align-items:center;justify-content:center;border:1px solid color-mix(in srgb,var(--w-ink) 16%,transparent);background:color-mix(in srgb,var(--w-panel) 94%,transparent);padding:3rem;text-align:center;box-shadow:0 30px 80px #162b2317}
  .w-menu-document strong{font-family:var(--w-display);font-size:clamp(2rem,5vw,4rem);font-weight:400}
  .w-menu-document span{margin-top:1rem;color:color-mix(in srgb,var(--w-ink) 66%,transparent)}
  .w-page [data-reveal]{transform:translateY(38px);transition-duration:1.05s;transition-timing-function:cubic-bezier(.16,1,.3,1)}
  .w-page [data-reveal].is-visible{transform:none}
  .w-page[data-wedding-theme="nocturne"] .w-hero h1{background-image:linear-gradient(110deg,#fff 5%,#d9c29e 35%,#fff 51%,#9c7548 64%,#fff 82%)}
  .w-page[data-wedding-theme="lumiere"] .w-hero h1{background-image:linear-gradient(105deg,#fff 10%,#f6ded6 34%,#fff 50%,#d6a996 63%,#fff 82%)}
  .w-page[data-wedding-theme="atelier"] .w-cover{filter:grayscale(1) contrast(1.08)}
  .w-page[data-wedding-theme="atelier"] .w-hero:after{background:linear-gradient(90deg,#050505e8 0 43%,#05050542 72%,#05050570)}
  .w-page[data-wedding-theme="aegean"] .w-cover{filter:saturate(.8) contrast(.94) brightness(1.03)}
  .w-page[data-wedding-theme="aegean"] .w-hero:after{background:linear-gradient(90deg,#102f46e8 0 42%,#102f4652 72%),linear-gradient(180deg,transparent,#0f3045b8)}
  .w-page[data-wedding-theme="champagne"] .w-hero{outline:1px solid color-mix(in srgb,var(--w-accent) 70%,#fff);outline-offset:-1.15rem}
  .w-page[data-wedding-theme="champagne"] .w-cover{filter:sepia(.16) saturate(.82)}
  .w-page[data-wedding-theme="wildflower"] .w-hero:before{background:radial-gradient(circle at 12% 25%,#efb8bd70,transparent 25%),radial-gradient(circle at 88% 72%,#f5d79160,transparent 30%),linear-gradient(115deg,transparent 38%,#fff4 50%,transparent 60%)}
  .w-page[data-wedding-theme="terracotta"] .w-cover{filter:sepia(.2) saturate(.95)}
  .w-page[data-wedding-theme="terracotta"] .w-hero:after{background:linear-gradient(90deg,#4f2b1ee8 0 42%,#4f2b1e38 76%),linear-gradient(180deg,transparent,#4a2a20c9)}
  .w-page[data-wedding-theme="monogram"] .w-hero{outline:1px solid #fff9;outline-offset:-1.15rem}
  .w-page[data-wedding-theme="monogram"] .w-cover{filter:grayscale(.65) saturate(.7)}
  .w-page[data-wedding-theme="deco"] .w-hero{outline:1px solid color-mix(in srgb,var(--w-accent) 80%,#fff);outline-offset:-1.3rem}
  .w-page[data-wedding-theme="deco"] .w-hero:before{inset:1.9rem;border:1px solid color-mix(in srgb,var(--w-accent) 70%,transparent);background:linear-gradient(135deg,var(--w-accent) 0 1px,transparent 1px calc(100% - 1px),var(--w-accent) calc(100% - 1px));mix-blend-mode:normal;opacity:.55;animation:none}
  .w-page[data-wedding-theme="celeste"] .w-cover{filter:saturate(.72) brightness(1.06)}
  .w-page[data-wedding-theme="celeste"] .w-hero:after{background:linear-gradient(180deg,#2543543d,#243e4fbf)}
  .w-page[data-wedding-theme="vinifera"] .w-cover{filter:saturate(.78) sepia(.12)}
  .w-page[data-wedding-theme="vinifera"] .w-hero:after{background:linear-gradient(90deg,#35121ce8 0 46%,#35121c40 74%),linear-gradient(180deg,transparent,#32141ec9)}
  .w-page[data-wedding-theme="pearl"] .w-cover{filter:saturate(.45) brightness(1.13)}
  .w-page[data-wedding-theme="pearl"] .w-hero:after{background:linear-gradient(180deg,#2a302f38,#2a302fb8)}
  .w-page[data-wedding-theme="solstice"] .w-cover{filter:saturate(1.05) sepia(.12)}
  .w-page[data-wedding-theme="solstice"] .w-hero:after{background:linear-gradient(120deg,#331727dc,#8f493d4a 58%,#2f1727bf)}
  .w-page[data-wedding-theme="alpine"] .w-cover{filter:saturate(.58) contrast(1.04)}
  .w-page[data-wedding-theme="alpine"] .w-hero:after{background:linear-gradient(90deg,#18332ee3 0 44%,#18332e38 76%),linear-gradient(180deg,transparent,#172d29c7)}
  .w-page[data-wedding-layout="framed"] .w-section h2{max-width:12ch}
  .w-page[data-wedding-layout="poster"] .w-hero h1{text-transform:uppercase;max-width:14ch;font-size:clamp(4rem,12vw,11rem);line-height:.76;letter-spacing:-.075em}
  .w-page[data-wedding-layout="poster"] .w-kicker{padding:.55rem .85rem;border:1px solid #ffffff85}
  .w-page[data-wedding-layout="poster"] .w-section h2{text-transform:uppercase;max-width:13ch;line-height:.86}
  .w-page[data-wedding-layout="poster"] .w-event-card>span{font-family:Manrope,sans-serif;font-weight:200}
  @media(min-width:760px){
    .w-menu-layout{grid-template-columns:minmax(0,.72fr) minmax(320px,1.28fr)}.w-menu-frame{margin-top:0}
    .w-page[data-wedding-layout="editorial"] .w-hero-copy{align-items:flex-start;justify-content:center;width:min(92%,82rem);padding-left:clamp(2rem,7vw,8rem);text-align:left}
    .w-page[data-wedding-layout="editorial"] .w-hero h1{max-width:8ch;margin:0;text-align:left}
    .w-page[data-wedding-layout="editorial"] .w-hero h1:after{margin-left:0;background:linear-gradient(90deg,#fff,transparent)}
    .w-page[data-wedding-layout="editorial"] .w-hero-message{max-width:32rem;margin-left:0}
    .w-page[data-wedding-layout="editorial"] .w-story-grid{grid-template-columns:minmax(0,.52fr) minmax(0,1.48fr)}
    .w-page[data-wedding-layout="split"] .w-hero-copy{align-items:flex-start;justify-content:center;width:50%;min-height:100svh;margin-right:auto;padding-left:clamp(2rem,7vw,8rem);text-align:left}
    .w-page[data-wedding-layout="split"] .w-hero h1{max-width:8ch;margin:0}
    .w-page[data-wedding-layout="split"] .w-hero h1:after{margin-left:0;background:linear-gradient(90deg,#fff,transparent)}
    .w-page[data-wedding-layout="split"] .w-hero-message{margin-left:0}
    .w-page[data-wedding-layout="split"] .w-section:nth-of-type(even) .w-inner{width:min(88%,70rem)}
    .w-page[data-wedding-layout="framed"] .w-hero{min-height:calc(100svh - 2rem);margin:1rem}
    .w-page[data-wedding-layout="framed"] .w-hero-copy{min-height:calc(100svh - 2rem)}
    .w-page[data-wedding-layout="framed"] .w-top{padding-inline:2.5rem}
    .w-page[data-wedding-layout="framed"] .w-story-grid{grid-template-columns:1fr;justify-items:center;text-align:center}
    .w-page[data-wedding-layout="framed"] .w-story-copy{max-width:52rem}
    .w-page[data-wedding-layout="poster"] .w-hero-copy{align-items:flex-start;justify-content:center;width:min(92%,84rem);text-align:left}
    .w-page[data-wedding-layout="poster"] .w-hero h1{margin:0;text-align:left}
    .w-page[data-wedding-layout="poster"] .w-hero h1:after{margin-left:0}
    .w-page[data-wedding-layout="poster"] .w-hero-message{margin-left:0}
  }
  @media(max-width:759px){.w-top{grid-template-columns:1fr auto}.w-nav{display:none}.w-top>.brand-mark span{display:none}.w-hero-copy{width:100%;padding:8rem 1.15rem 4.5rem}.w-hero h1{width:100%;max-width:100%;font-size:clamp(2.8rem,13.5vw,5rem);line-height:.86;letter-spacing:-.05em;text-wrap:balance}.w-menu-frame:before{inset:-.55rem}.w-page[data-wedding-layout="framed"] .w-hero{min-height:calc(100svh - 1rem);margin:.5rem}.w-page[data-wedding-layout="framed"] .w-hero-copy{min-height:calc(100svh - 1rem)}.w-page[data-wedding-layout="poster"] .w-hero h1{font-size:clamp(3rem,14vw,5.5rem);line-height:.8}.w-page[data-wedding-layout="poster"] .w-kicker{letter-spacing:.22em}}
  @media(prefers-reduced-motion:reduce){.w-cover,.w-hero:before,.w-hero h1{animation:none!important}.w-page [data-reveal]{opacity:1;transform:none;transition:none}}
  @keyframes w-title-shine{0%,18%{background-position:100% center}58%,100%{background-position:-35% center}}
  @keyframes w-aurora{0%{transform:translate3d(-2%,-1%,0) rotate(-2deg)}100%{transform:translate3d(3%,2%,0) rotate(2deg)}}
  @keyframes w-cover-arrive{from{opacity:.55;transform:scale(1.08)}to{opacity:1;transform:scale(1.012)}}
`;
