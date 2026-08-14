import type { Locale } from "../i18n";
import type { QrDesignConfig } from "../qr-template-designs";
import { esc } from "../utils";

export type QrStudioDestination = {
  key: string;
  label: string;
  url: string;
  qrSvg: string;
};

export const qrTemplateFamilies = [
  { key: "minimal", name: "Minimal", kind: "minimal", bg: "#fffdf8", accent: "#7c3aed", ink: "#2b174d" },
  { key: "editorial", name: "Editorial", kind: "editorial", bg: "#f4efe8", accent: "#9b6b43", ink: "#29231f" },
  { key: "botanical", name: "Botanical", kind: "botanical", bg: "#eef4ec", accent: "#6c8b72", ink: "#27382c" },
  { key: "midnight", name: "Midnight", kind: "midnight", bg: "#211633", accent: "#c9a7ff", ink: "#fffaff" },
  { key: "celebration", name: "Celebration", kind: "confetti", bg: "#fff5f7", accent: "#f45b91", ink: "#47203a" },
  { key: "film", name: "Film", kind: "film", bg: "#f3ead8", accent: "#c2513d", ink: "#30261f" },
  { key: "modern", name: "Modern", kind: "modern", bg: "#edf3ff", accent: "#4169e1", ink: "#1c2850" },
  { key: "romantic", name: "Romantic", kind: "romantic", bg: "#fff4f2", accent: "#c96f82", ink: "#512f39" },
  { key: "mediterranean", name: "Mediterranean", kind: "mediterranean", bg: "#fffaf0", accent: "#247a91", ink: "#183f4a" },
  { key: "playful", name: "Playful", kind: "playful", bg: "#fff8d9", accent: "#ff6b57", ink: "#382956" },
  { key: "luxe", name: "Luxe", kind: "luxe", bg: "#171719", accent: "#d8b76a", ink: "#fffaf0" },
  { key: "monogram", name: "Monogram", kind: "monogram", bg: "#f7f2ff", accent: "#8c63c7", ink: "#35234e" },
] as const;

export const qrTemplateFormats = [
  { key: "a3", label: "A3", width: 700, height: 990, css: "297mm 420mm" },
  { key: "a4", label: "A4", width: 700, height: 990, css: "210mm 297mm" },
  { key: "a5", label: "A5", width: 700, height: 990, css: "148mm 210mm" },
  { key: "a6", label: "A6", width: 700, height: 990, css: "105mm 148mm" },
  { key: "square", label: "Square", width: 1000, height: 1000, css: "210mm 210mm" },
  { key: "story", label: "Story", width: 900, height: 1600, css: "108mm 192mm" },
] as const;

export const qrTemplateCopyPresets = [
  { key: "remember", el: ["Σκάναρε · Μοιράσου · Θυμήσου", "Ανέβασε τις φωτογραφίες και τα βίντεό σου"], en: ["Scan · Share · Remember", "Add your photos and videos"] },
  { key: "moment", el: ["Μοιράσου τη στιγμή", "Κάθε οπτική γωνία γίνεται μέρος της ιστορίας"], en: ["Share the moment", "Every point of view becomes part of the story"] },
  { key: "gallery", el: ["Η κοινή μας συλλογή", "Σκάναρε για να μπεις στο άλμπουμ της εκδήλωσης"], en: ["Our shared gallery", "Scan to join the event album"] },
] as const;

type QrStudioInput = {
  locale: Locale;
  eventCode: string;
  eventName: string;
  eventDate: string;
  headerHtml: string;
  backUrl: string;
  destinations: QrStudioDestination[];
  initialDestination?: string;
  savedDesigns?: Array<{ id: string; name: string; config: QrDesignConfig; updatedAt: number }>;
  defaultBackground: string;
  defaultAccent: string;
  defaultInk: string;
};

function safeJson(value: unknown) {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

export function renderQrTemplateStudio(input: QrStudioInput) {
  const greek = input.locale === "el";
  const t = (el: string, en: string) => greek ? el : en;
  const combinationCount = qrTemplateFamilies.length * qrTemplateFormats.length * qrTemplateCopyPresets.length;
  const initialDestination = input.destinations.some((item) => item.key === input.initialDestination)
    ? input.initialDestination
    : input.destinations[0]?.key;
  const data = {
    locale: input.locale,
    code: input.eventCode,
    name: input.eventName,
    date: input.eventDate,
    families: qrTemplateFamilies,
    formats: qrTemplateFormats,
    copies: qrTemplateCopyPresets,
    destinations: input.destinations,
    initialDestination,
    savedDesigns: input.savedDesigns ?? [],
    defaults: { background: input.defaultBackground, accent: input.defaultAccent, ink: input.defaultInk },
  };
  const familyButtons = qrTemplateFamilies.map((family, index) => `<button type="button" data-family="${family.key}" class="qr-family flex min-h-20 flex-col justify-between rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm" aria-pressed="${index === 0}"><span class="h-7 rounded-lg border" style="background:linear-gradient(135deg,${family.bg} 0 64%,${family.accent} 64%)"></span><span class="mt-2 text-xs font-semibold text-[#382f43]">${family.name}</span></button>`).join("");
  const formatOptions = qrTemplateFormats.map((format) => `<option value="${format.key}">${format.label}</option>`).join("");
  const copyOptions = qrTemplateCopyPresets.map((copy) => `<option value="${copy.key}">${copy[greek ? "el" : "en"][0]}</option>`).join("");
  const destinationOptions = input.destinations.map((destination) => `<option value="${esc(destination.key)}" ${destination.key === initialDestination ? "selected" : ""}>${esc(destination.label)}</option>`).join("");

  return `${input.headerHtml}<main class="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
    <div class="flex flex-col gap-4 border-b border-[#e9e4ec] pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div><a href="${esc(input.backUrl)}" class="text-sm font-semibold text-[#6d28d9]">← ${t("Πίσω στο event", "Back to event")}</a><p class="mt-5 text-xs font-bold uppercase tracking-[.18em] text-[#7c3aed]">QR Template Studio</p><h1 class="mt-2 text-3xl sm:text-4xl">${t("Σχεδίασε το QR της εκδήλωσης", "Design your event QR")}</h1><p class="mt-3 max-w-3xl text-sm leading-6 text-[#756b82]">${t(`${combinationCount}+ επεξεργάσιμοι συνδυασμοί για τραπέζια, είσοδο, προσκλήσεις και social stories.`, `${combinationCount}+ editable combinations for tables, entrances, invitations and social stories.`)}</p></div>
      <span class="w-fit rounded-full bg-[#f1eafe] px-4 py-2 text-xs font-bold text-[#5f34a8]">${t("Αυτόματο QR · Χωρίς Canva", "Automatic QR · No Canva required")}</span>
    </div>
    <div class="mt-6 grid gap-6 xl:grid-cols-[370px_minmax(0,1fr)]">
      <aside class="space-y-4 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-2">
        <section class="rounded-3xl border border-[#e8e2eb] bg-white p-4 shadow-[0_10px_35px_rgba(45,25,63,.05)]"><div class="flex items-center justify-between gap-3"><h2 class="text-lg font-semibold">${t("Αποθηκευμένα σχέδια", "Saved designs")}</h2><span id="qr-saved-count" class="text-xs text-[#8b8192]"></span></div><div class="mt-3 flex gap-2"><input id="qr-design-name" maxlength="80" placeholder="${t("π.χ. QR υποδοχής", "e.g. Welcome sign")}" class="min-w-0 flex-1 rounded-xl border border-[#ddd5e2] px-3 py-2.5 text-sm"><button id="qr-save-new" type="button" class="rounded-xl bg-[#6d28d9] px-3 py-2.5 text-xs font-bold text-white">${t("Αποθήκευση", "Save")}</button></div><div id="qr-active-actions" hidden class="mt-2 grid grid-cols-3 gap-2"><button id="qr-update" type="button" class="rounded-xl border border-[#d8cfe0] px-2 py-2 text-xs font-semibold">${t("Ενημέρωση", "Update")}</button><button id="qr-duplicate" type="button" class="rounded-xl border border-[#d8cfe0] px-2 py-2 text-xs font-semibold">${t("Αντίγραφο", "Duplicate")}</button><button id="qr-delete" type="button" class="rounded-xl border border-red-200 px-2 py-2 text-xs font-semibold text-red-700">${t("Διαγραφή", "Delete")}</button></div><div id="qr-saved-list" class="mt-3 grid gap-2"></div><p id="qr-save-status" role="status" aria-live="polite" class="mt-2 min-h-4 text-xs text-[#73687b]"></p></section>
        <section class="rounded-3xl border border-[#e8e2eb] bg-white p-4 shadow-[0_10px_35px_rgba(45,25,63,.05)]"><div class="flex items-center justify-between"><h2 class="text-lg font-semibold">${t("1. Στυλ", "1. Style")}</h2><span class="text-xs text-[#8b8192]">12 ${t("οικογένειες", "families")}</span></div><div class="mt-3 grid grid-cols-3 gap-2">${familyButtons}</div></section>
        <section class="rounded-3xl border border-[#e8e2eb] bg-white p-4 shadow-[0_10px_35px_rgba(45,25,63,.05)]"><h2 class="text-lg font-semibold">${t("2. Περιεχόμενο", "2. Content")}</h2><div class="mt-4 grid gap-3">
          <label class="grid gap-1 text-xs font-semibold text-[#605768]">${t("Προορισμός QR", "QR destination")}<select id="qr-destination" class="rounded-xl border border-[#ddd5e2] bg-white px-3 py-2.5 text-sm">${destinationOptions}</select></label>
          <label class="grid gap-1 text-xs font-semibold text-[#605768]">${t("Έτοιμο κείμενο", "Copy preset")}<select id="qr-copy" class="rounded-xl border border-[#ddd5e2] bg-white px-3 py-2.5 text-sm">${copyOptions}</select></label>
          <label class="grid gap-1 text-xs font-semibold text-[#605768]">${t("Κεντρικός τίτλος", "Main title")}<input id="qr-title" maxlength="70" value="${esc(input.eventName)}" class="rounded-xl border border-[#ddd5e2] px-3 py-2.5 text-sm"></label>
          <label class="grid gap-1 text-xs font-semibold text-[#605768]">${t("Προτροπή", "Call to action")}<input id="qr-heading" maxlength="70" class="rounded-xl border border-[#ddd5e2] px-3 py-2.5 text-sm"></label>
          <label class="grid gap-1 text-xs font-semibold text-[#605768]">${t("Περιγραφή", "Description")}<textarea id="qr-subtitle" maxlength="140" rows="2" class="resize-none rounded-xl border border-[#ddd5e2] px-3 py-2.5 text-sm"></textarea></label>
          <label class="grid gap-1 text-xs font-semibold text-[#605768]">${t("Μορφή", "Format")}<select id="qr-format" class="rounded-xl border border-[#ddd5e2] bg-white px-3 py-2.5 text-sm">${formatOptions}</select></label>
        </div></section>
        <section class="rounded-3xl border border-[#e8e2eb] bg-white p-4 shadow-[0_10px_35px_rgba(45,25,63,.05)]"><h2 class="text-lg font-semibold">${t("3. Χρώματα", "3. Colors")}</h2><div class="mt-4 grid grid-cols-3 gap-3">${[["background",t("Φόντο","Background")],["accent",t("Έμφαση","Accent")],["ink",t("Κείμενο","Text")]].map(([key,label]) => `<label class="grid gap-1 text-center text-[10px] font-semibold text-[#6f6577]">${label}<input id="qr-${key}" type="color" value="${esc(data.defaults[key as keyof typeof data.defaults])}" class="h-10 w-full cursor-pointer rounded-lg border-0 bg-transparent p-0"></label>`).join("")}</div><button id="qr-reset-colors" type="button" class="mt-3 w-full rounded-xl border border-[#ddd5e2] px-3 py-2 text-xs font-semibold text-[#5e5366]">${t("Επαναφορά χρωμάτων στυλ", "Reset style colors")}</button></section>
      </aside>
      <section class="min-w-0 rounded-3xl border border-[#e5dfe8] bg-[#f5f2f7] p-3 sm:p-5 lg:p-8"><div class="flex flex-wrap items-center justify-between gap-3"><div><p class="text-xs font-bold uppercase tracking-[.15em] text-[#766c7e]">Live preview</p><p id="qr-combination" class="mt-1 text-sm text-[#5f5666]"></p></div><div class="flex flex-wrap gap-2"><button id="qr-svg" type="button" class="rounded-xl border border-[#d8cfe0] bg-white px-4 py-2.5 text-sm font-semibold">SVG</button><button id="qr-png" type="button" class="rounded-xl border border-[#d8cfe0] bg-white px-4 py-2.5 text-sm font-semibold">PNG</button><button id="qr-print" type="button" class="rounded-xl bg-[#2b174d] px-4 py-2.5 text-sm font-semibold text-white">${t("Εκτύπωση / PDF", "Print / PDF")}</button></div></div><div class="mt-5 flex min-h-[520px] items-center justify-center overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_top,#fff_0,#eee8f2_72%)] p-3 sm:p-8"><div id="qr-preview" class="flex max-h-[75vh] max-w-full items-center justify-center drop-shadow-[0_24px_40px_rgba(40,20,55,.22)]"></div></div><p class="mt-4 text-center text-xs leading-5 text-[#7c7283]">${t("Για επαγγελματική εκτύπωση χρησιμοποίησε SVG ή αποθήκευσε ως PDF. Το PNG εξάγεται σε υψηλή ανάλυση.", "Use SVG or save as PDF for professional printing. PNG exports at high resolution.")}</p></section>
    </div>
  </main><script id="qr-studio-data" type="application/json">${safeJson(data)}</script><script>
  (()=>{
    const data=JSON.parse(document.getElementById('qr-studio-data').textContent); const by=id=>document.getElementById(id); const greek=data.locale==='el';
    const state={family:data.families[0].key,format:data.formats[0].key,copy:data.copies[0].key,destination:data.initialDestination||data.destinations[0].key,activeDesign:null};
    const xml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
    const family=()=>data.families.find(item=>item.key===state.family); const format=()=>data.formats.find(item=>item.key===state.format); const destination=()=>data.destinations.find(item=>item.key===state.destination);
    const lines=(value,limit)=>{const words=String(value).trim().split(/\\s+/);const out=[];let line='';for(const word of words){if((line+' '+word).trim().length>limit&&line){out.push(line);line=word}else line=(line+' '+word).trim()}if(line)out.push(line);return out.slice(0,3)};
    const tspans=(value,x,y,size,limit,gap=1.12)=>lines(value,limit).map((line,index)=>'<tspan x="'+x+'" y="'+(y+index*size*gap)+'">'+xml(line)+'</tspan>').join('');
    const decorations=(kind,w,h,accent,ink)=>{const a=xml(accent),i=xml(ink);if(kind==='botanical')return '<g opacity=".28" fill="none" stroke="'+a+'" stroke-width="5"><path d="M-30 230 Q120 80 250 -20M'+(w+30)+' '+(h-240)+' Q'+(w-120)+' '+(h-80)+' '+(w-260)+' '+(h+20)+'"/><ellipse cx="90" cy="120" rx="32" ry="75" transform="rotate(-45 90 120)"/><ellipse cx="'+(w-90)+'" cy="'+(h-120)+'" rx="32" ry="75" transform="rotate(-45 '+(w-90)+' '+(h-120)+')"/></g>';if(kind==='confetti'||kind==='playful')return '<g fill="'+a+'" opacity=".8"><circle cx="70" cy="90" r="12"/><circle cx="'+(w-85)+'" cy="150" r="18"/><path d="M120 '+(h-80)+'l35-45 20 55zM'+(w-160)+' 70l45 18-38 32z"/></g>';if(kind==='film')return '<path d="M35 35H'+(w-35)+'V'+(h-35)+'H35z" fill="none" stroke="'+i+'" stroke-width="3" stroke-dasharray="18 12" opacity=".35"/>';if(kind==='modern')return '<path d="M0 0H'+w+'L'+(w*.72)+' '+(h*.3)+'L0 '+(h*.18)+'Z" fill="'+a+'" opacity=".18"/><circle cx="'+(w*.9)+'" cy="'+(h*.78)+'" r="'+(w*.25)+'" fill="'+a+'" opacity=".12"/>';if(kind==='romantic')return '<g fill="none" stroke="'+a+'" stroke-width="3" opacity=".45"><path d="M60 150C110 70 180 90 190 160C200 90 270 70 320 150"/><path d="M'+(w-60)+' '+(h-150)+'C'+(w-110)+' '+(h-70)+' '+(w-180)+' '+(h-90)+' '+(w-190)+' '+(h-160)+'C'+(w-200)+' '+(h-90)+' '+(w-270)+' '+(h-70)+' '+(w-320)+' '+(h-150)+'"/></g>';if(kind==='mediterranean')return '<g fill="none" stroke="'+a+'" stroke-width="10" opacity=".28"><path d="M0 95Q55 45 110 95T220 95T330 95T440 95T550 95T660 95T770 95T880 95T990 95"/><path d="M0 '+(h-75)+'Q55 '+(h-125)+' 110 '+(h-75)+'T220 '+(h-75)+'T330 '+(h-75)+'T440 '+(h-75)+'T550 '+(h-75)+'T660 '+(h-75)+'T770 '+(h-75)+'T880 '+(h-75)+'T990 '+(h-75)+'"/></g>';if(kind==='luxe'||kind==='editorial')return '<rect x="28" y="28" width="'+(w-56)+'" height="'+(h-56)+'" rx="8" fill="none" stroke="'+a+'" stroke-width="2"/><rect x="40" y="40" width="'+(w-80)+'" height="'+(h-80)+'" rx="5" fill="none" stroke="'+a+'" stroke-width="1" opacity=".45"/>';if(kind==='monogram')return '<circle cx="'+(w/2)+'" cy="'+(h*.18)+'" r="'+(w*.13)+'" fill="none" stroke="'+a+'" stroke-width="2" opacity=".35"/><text x="'+(w/2)+'" y="'+(h*.2)+'" text-anchor="middle" font-size="'+(w*.12)+'" fill="'+a+'" opacity=".18">M</text>';if(kind==='midnight')return '<g fill="'+a+'" opacity=".38"><circle cx="70" cy="110" r="3"/><circle cx="'+(w-90)+'" cy="180" r="5"/><circle cx="130" cy="'+(h-140)+'" r="4"/><path d="M'+(w-140)+' 75l6 18 18 6-18 6-6 18-6-18-18-6 18-6z"/></g>';return '<path d="M'+(w*.18)+' 42H'+(w*.82)+'" stroke="'+a+'" stroke-width="5" stroke-linecap="round"/>'};
    const render=()=>{const f=family(),size=format(),dest=destination(),w=size.width,h=size.height,bg=by('qr-background').value,accent=by('qr-accent').value,ink=by('qr-ink').value;const title=by('qr-title').value||data.name,heading=by('qr-heading').value,subtitle=by('qr-subtitle').value;const portrait=h>w*1.2,qrSize=Math.round(Math.min(w,h)*(portrait?.38:.31)),qrX=(w-qrSize)/2,qrY=portrait?h*.45:h*.33,headingOffset=portrait?h*.095:h*.06,subtitleOffset=portrait?h*.185:h*.13;const titleSize=Math.max(34,Math.round(w*.066)),headingSize=Math.max(26,Math.round(w*.047));let embedded=dest.qrSvg.replace(/<\\?xml[^>]*>/g,'').replace(/\\s(?:width|height)="[^"]*"/g,'').replace('<svg','<svg x="'+qrX+'" y="'+qrY+'" width="'+qrSize+'" height="'+qrSize+'"');const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'"><rect width="100%" height="100%" fill="'+xml(bg)+'"/>'+decorations(f.kind,w,h,accent,ink)+'<text x="'+(w/2)+'" y="'+(h*.13)+'" text-anchor="middle" fill="'+xml(ink)+'" font-family="Georgia,Times New Roman,serif" font-size="'+titleSize+'" font-weight="600">'+tspans(title,w/2,h*.13,titleSize,portrait?20:26)+'</text><text x="'+(w/2)+'" y="'+(h*.3)+'" text-anchor="middle" fill="'+xml(ink)+'" opacity=".68" font-family="Arial,sans-serif" font-size="'+Math.max(15,w*.025)+'" letter-spacing="2">'+xml(data.date)+'</text><rect x="'+(qrX-18)+'" y="'+(qrY-18)+'" width="'+(qrSize+36)+'" height="'+(qrSize+36)+'" rx="'+Math.round(qrSize*.09)+'" fill="#fff" opacity=".98"/>'+embedded+'<text x="'+(w/2)+'" y="'+(qrY+qrSize+headingOffset)+'" text-anchor="middle" fill="'+xml(ink)+'" font-family="Arial,sans-serif" font-size="'+headingSize+'" font-weight="700">'+tspans(heading,w/2,qrY+qrSize+headingOffset,headingSize,portrait?27:35)+'</text><text x="'+(w/2)+'" y="'+(qrY+qrSize+subtitleOffset)+'" text-anchor="middle" fill="'+xml(ink)+'" opacity=".72" font-family="Arial,sans-serif" font-size="'+Math.max(17,w*.027)+'">'+tspans(subtitle,w/2,qrY+qrSize+subtitleOffset,Math.max(17,w*.027),portrait?42:52,1.25)+'</text><text x="'+(w/2)+'" y="'+(h-48)+'" text-anchor="middle" fill="'+xml(ink)+'" opacity=".58" font-family="Arial,sans-serif" font-size="'+Math.max(13,w*.019)+'" letter-spacing="1.5">MEMBOUX · '+xml(data.code)+'</text></svg>';by('qr-preview').innerHTML=svg;by('qr-preview').firstElementChild.style.cssText='max-width:100%;max-height:72vh;width:auto;height:auto';by('qr-combination').textContent=f.name+' · '+size.label+' · '+dest.label;return svg};
    const applyCopy=()=>{const copy=data.copies.find(item=>item.key===state.copy);const values=copy[greek?'el':'en'];by('qr-heading').value=values[0];by('qr-subtitle').value=values[1]};
    const applyFamily=(key,reset=true)=>{state.family=key;const f=family();document.querySelectorAll('[data-family]').forEach(button=>{const active=button.dataset.family===key;button.setAttribute('aria-pressed',String(active));button.classList.toggle('ring-2',active);button.classList.toggle('ring-[#7c3aed]',active)});if(reset){by('qr-background').value=f.bg;by('qr-accent').value=f.accent;by('qr-ink').value=f.ink}render()};
    const config=()=>({family:state.family,format:state.format,copy:state.copy,destination:state.destination,title:by('qr-title').value,heading:by('qr-heading').value,subtitle:by('qr-subtitle').value,background:by('qr-background').value,accent:by('qr-accent').value,ink:by('qr-ink').value});
    const status=(message,error=false)=>{by('qr-save-status').textContent=message;by('qr-save-status').classList.toggle('text-red-700',error)};
    const renderSaved=()=>{const list=by('qr-saved-list');list.replaceChildren();by('qr-saved-count').textContent=data.savedDesigns.length+'/50';for(const design of data.savedDesigns){const button=document.createElement('button');button.type='button';button.className='flex items-center justify-between rounded-xl border border-[#e1d9e6] px-3 py-2 text-left text-xs transition hover:bg-[#f8f5ff]';button.setAttribute('aria-pressed',String(state.activeDesign===design.id));if(state.activeDesign===design.id)button.classList.add('ring-2','ring-[#7c3aed]');const name=document.createElement('strong');name.textContent=design.name;const meta=document.createElement('span');meta.className='text-[10px] text-[#8b8192]';meta.textContent=(data.families.find(item=>item.key===design.config.family)?.name||design.config.family)+' · '+String(design.config.format).toUpperCase();button.append(name,meta);button.addEventListener('click',()=>loadDesign(design));list.append(button)}if(!data.savedDesigns.length){const empty=document.createElement('p');empty.className='rounded-xl bg-[#f8f5ff] p-3 text-xs leading-5 text-[#756b82]';empty.textContent=greek?'Αποθήκευσε ένα σχέδιο για να το ανοίγεις από κάθε συσκευή.':'Save a design to reopen it from any device.';list.append(empty)}by('qr-active-actions').hidden=!state.activeDesign};
    const loadDesign=design=>{const value=design.config;state.activeDesign=design.id;state.family=data.families.some(item=>item.key===value.family)?value.family:data.families[0].key;state.format=data.formats.some(item=>item.key===value.format)?value.format:data.formats[0].key;state.copy=data.copies.some(item=>item.key===value.copy)?value.copy:data.copies[0].key;state.destination=data.destinations.some(item=>item.key===value.destination)?value.destination:data.destinations[0].key;by('qr-format').value=state.format;by('qr-copy').value=state.copy;by('qr-destination').value=state.destination;by('qr-title').value=value.title;by('qr-heading').value=value.heading;by('qr-subtitle').value=value.subtitle;by('qr-background').value=value.background;by('qr-accent').value=value.accent;by('qr-ink').value=value.ink;by('qr-design-name').value=design.name;applyFamily(state.family,false);renderSaved();status(greek?'Το σχέδιο φορτώθηκε.':'Design loaded.')};
    const saveDesign=async(id=null,nameOverride='')=>{const name=(nameOverride||by('qr-design-name').value).trim();if(!name){status(greek?'Γράψε πρώτα ένα όνομα σχεδίου.':'Enter a design name first.',true);return}status(greek?'Αποθήκευση…':'Saving…');try{const response=await fetch('/api/account/events/'+encodeURIComponent(data.code)+'/qr-designs',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({id,name,config:config()})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Save failed');const existing=data.savedDesigns.find(item=>item.id===result.id);if(existing)Object.assign(existing,result);else data.savedDesigns.unshift(result);state.activeDesign=result.id;by('qr-design-name').value=result.name;renderSaved();status(greek?'Το σχέδιο αποθηκεύτηκε.':'Design saved.')}catch(error){status(error instanceof Error?error.message:(greek?'Η αποθήκευση απέτυχε.':'Save failed.'),true)}};
    const track=action=>fetch('/api/account/events/'+encodeURIComponent(data.code)+'/qr-template-activity',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,family:state.family,format:state.format}),keepalive:true}).catch(()=>{});
    const download=(blob,extension)=>{const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='memboux-'+data.code+'-'+state.family+'-'+state.format+'.'+extension;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)};
    document.querySelectorAll('[data-family]').forEach(button=>button.addEventListener('click',()=>applyFamily(button.dataset.family)));
    ['qr-title','qr-heading','qr-subtitle','qr-background','qr-accent','qr-ink'].forEach(id=>by(id).addEventListener('input',render));
    by('qr-format').addEventListener('change',event=>{state.format=event.target.value;render()});by('qr-destination').addEventListener('change',event=>{state.destination=event.target.value;render()});by('qr-copy').addEventListener('change',event=>{state.copy=event.target.value;applyCopy();render()});by('qr-reset-colors').addEventListener('click',()=>applyFamily(state.family));
    by('qr-save-new').addEventListener('click',()=>saveDesign());by('qr-update').addEventListener('click',()=>saveDesign(state.activeDesign));by('qr-duplicate').addEventListener('click',()=>saveDesign(null,(by('qr-design-name').value||'Design')+(greek?' · αντίγραφο':' · copy')));by('qr-delete').addEventListener('click',async()=>{if(!state.activeDesign||!confirm(greek?'Να διαγραφεί αυτό το σχέδιο;':'Delete this design?'))return;try{const response=await fetch('/api/account/events/'+encodeURIComponent(data.code)+'/qr-designs/'+encodeURIComponent(state.activeDesign)+'/delete',{method:'POST',headers:{'accept':'application/json'}});if(!response.ok)throw new Error();data.savedDesigns=data.savedDesigns.filter(item=>item.id!==state.activeDesign);state.activeDesign=null;by('qr-design-name').value='';renderSaved();status(greek?'Το σχέδιο διαγράφηκε.':'Design deleted.')}catch{status(greek?'Η διαγραφή απέτυχε.':'Delete failed.',true)}});
    by('qr-svg').addEventListener('click',()=>{download(new Blob([render()],{type:'image/svg+xml;charset=utf-8'}),'svg');track('download_svg')});
    by('qr-png').addEventListener('click',()=>{const svg=render(),size=format(),width=Math.min(2400,Math.max(1800,size.width*3)),height=Math.round(width*size.height/size.width),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),image=new Image();image.onload=()=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(image,0,0,width,height);URL.revokeObjectURL(url);canvas.toBlob(blob=>blob&&download(blob,'png'),'image/png',.96)};image.src=url;track('download_png')});
    by('qr-print').addEventListener('click',()=>{const popup=window.open('','_blank');if(!popup)return;popup.opener=null;const size=format();popup.document.write('<!doctype html><html><head><title>'+xml(data.name)+'</title><style>@page{size:'+size.css+';margin:0}html,body{margin:0;width:100%;height:100%}svg{display:block;width:100%;height:100%}</style></head><body>'+render()+'</body></html>');popup.document.close();popup.focus();setTimeout(()=>popup.print(),250);track('print')});
    applyCopy();applyFamily(state.family,false);renderSaved();track('opened');
  })();
  <\/script>`;
}
