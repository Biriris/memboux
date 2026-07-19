/** Keeps the 15 template choices aligned and previews their distinct composition. */
export const weddingTemplatePickerStyles = `<style>
  .w-template-card{position:relative;display:flex;min-width:0;height:100%;flex-direction:column;isolation:isolate;transition:border-color .2s ease,box-shadow .2s ease,transform .2s ease}
  .w-template-card[data-selected="true"]{border-color:#2f6b5b!important;box-shadow:0 0 0 3px #b9d5ca,0 16px 38px #183c3324!important;transform:translateY(-2px) scale(1.01)}
  .w-template-selected{position:absolute;z-index:8;right:.7rem;top:.7rem;display:inline-flex;align-items:center;gap:.35rem;border:1px solid #ffffff80;border-radius:999px;background:#183c33e8;padding:.42rem .65rem;color:#fff;font:700 .62rem/1 Manrope,sans-serif;letter-spacing:.08em;text-transform:uppercase;box-shadow:0 6px 18px #10292045;opacity:0;transform:translateY(-4px);transition:opacity .2s ease,transform .2s ease;backdrop-filter:blur(10px)}
  .w-template-card[data-selected="true"] .w-template-selected{opacity:1;transform:none}
  .w-template-card:focus-within{outline:3px solid #8bb9a8;outline-offset:3px}
  .w-template-card>label{display:flex;min-height:0;flex:1;flex-direction:column}
  .w-template-card>label>span:last-child{display:flex;min-height:9.25rem;flex:1;flex-direction:column}
  .w-template-card>label>span:last-child>span:nth-child(2){display:-webkit-box;min-height:3.75rem;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:3}
  .w-template-card>label>span:last-child>span:last-child{margin-top:auto}
  .w-template-preview{height:auto!important;min-height:0;aspect-ratio:4/3}
  .w-template-copy{min-width:0}
  .w-template-copy small{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .w-template-copy b{max-width:100%;font-size:clamp(1.75rem,3.1vw,2.3rem)!important;line-height:.88!important;overflow-wrap:anywhere;text-wrap:balance}
  .w-template-card>a{margin-top:.1rem}
  .w-template-card:nth-child(1) .w-template-image:before{content:"";position:absolute;inset:18% 24%;border:1px solid #ffffff70;border-radius:50% 50% 8% 8%}
  .w-template-card:nth-child(1) .w-template-copy b{font-style:italic}
  .w-template-card:nth-child(2) .w-template-copy{justify-content:flex-end;padding-bottom:1.6rem}.w-template-card:nth-child(2) .w-template-copy b{max-width:4ch;text-align:left}
  .w-template-card:nth-child(3) .w-template-preview{margin:.6rem;width:calc(100% - 1.2rem);aspect-ratio:1/1.12;border-radius:8rem 8rem 1.2rem 1.2rem}.w-template-card:nth-child(3) .w-template-copy b{font-style:italic}
  .w-template-card:nth-child(4) .w-template-image{filter:grayscale(1);clip-path:inset(0 0 0 46%)}.w-template-card:nth-child(4) .w-template-copy{align-items:flex-start;justify-content:flex-end;width:48%;color:var(--preview-ink);text-shadow:none}.w-template-card:nth-child(4) .w-template-copy b{font-family:Manrope,sans-serif!important;font-weight:250;text-transform:uppercase}
  .w-template-card:nth-child(5) .w-template-image{left:50%}.w-template-card:nth-child(5) .w-template-copy{right:50%;align-items:flex-start;color:var(--preview-ink);text-align:left;text-shadow:none}
  .w-template-card:nth-child(6) .w-template-frame{display:block;inset:.55rem;box-shadow:inset 0 0 0 5px color-mix(in srgb,var(--preview-bg) 25%,transparent)}
  .w-template-card:nth-child(7) .w-template-image{background:radial-gradient(circle at 20% 18%,#efb8bd 0 12%,transparent 13%),radial-gradient(circle at 82% 74%,#f5d791 0 15%,transparent 16%),linear-gradient(135deg,var(--preview-soft),var(--preview-ink))}.w-template-card:nth-child(7) .w-template-copy{align-items:flex-start;justify-content:flex-end;text-align:left}.w-template-card:nth-child(7) .w-template-copy b{font-style:italic}
  .w-template-card:nth-child(8) .w-template-image{clip-path:polygon(25% 0,100% 0,100% 100%,0 100%)}.w-template-card:nth-child(8) .w-template-copy{right:45%;align-items:flex-start;text-align:left}
  .w-template-card:nth-child(9) .w-template-image{opacity:.18;filter:grayscale(1)}.w-template-card:nth-child(9) .w-template-frame{display:block}.w-template-card:nth-child(9) .w-template-copy{color:var(--preview-ink);text-shadow:none}.w-template-card:nth-child(9) .w-template-copy:before{content:"AB";position:absolute;color:color-mix(in srgb,var(--preview-ink) 9%,transparent);font-family:var(--preview-font);font-size:7rem}
  .w-template-card:nth-child(10) .w-template-frame{display:block;inset:.45rem;border-color:var(--preview-soft);transform:rotate(45deg) scale(.72)}.w-template-card:nth-child(10) .w-template-copy b{text-transform:uppercase}
  .w-template-card:nth-child(11) .w-template-preview{margin:.5rem;width:calc(100% - 1rem);border-radius:1.2rem}.w-template-card:nth-child(11) .w-template-copy{justify-content:flex-end;padding-bottom:1.4rem}
  .w-template-card:nth-child(12) .w-template-copy{align-items:flex-start;justify-content:center;padding-left:2rem;text-align:left}.w-template-card:nth-child(12) .w-template-image:after{background:linear-gradient(90deg,var(--preview-ink),transparent)}
  .w-template-card:nth-child(13) .w-template-preview{margin:.8rem;width:calc(100% - 1.6rem);aspect-ratio:1.15/1}.w-template-card:nth-child(13) .w-template-image{inset:12% 9%;opacity:.5}.w-template-card:nth-child(13) .w-template-copy{color:var(--preview-ink);text-shadow:none}
  .w-template-card:nth-child(14) .w-template-image{left:50%}.w-template-card:nth-child(14) .w-template-copy{right:50%;align-items:flex-start;justify-content:flex-end;text-align:left}.w-template-card:nth-child(14) .w-template-copy b{font-family:Manrope,sans-serif!important;font-weight:250;text-transform:uppercase}
  .w-template-card:nth-child(15) .w-template-image{left:42%}.w-template-card:nth-child(15) .w-template-preview:after{content:"";position:absolute;z-index:1;inset:0;background:repeating-linear-gradient(90deg,transparent 0 calc(20% - 1px),#ffffff2b calc(20% - 1px) 20%)}.w-template-card:nth-child(15) .w-template-copy{right:58%;align-items:flex-start;justify-content:flex-end;text-align:left}
  @media(max-width:767px){.w-template-card>label>span:last-child{min-height:8.5rem}.w-template-copy b{font-size:clamp(1.8rem,8vw,2.5rem)!important}.w-template-selected{font-size:.58rem}}
</style>`;
