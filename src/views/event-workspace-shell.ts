import type { EventRole } from "../domain";
import type { Locale } from "../i18n";
import { esc } from "../utils";

type WorkspaceSection = {
  id: string;
  path: string;
  label: string;
  hint: string;
  group: "home" | "journey" | "access";
  phase?: number;
  symbol: string;
  ownerOnly?: boolean;
  when?: boolean;
};

export type EventWorkspaceSection = "overview" | "website" | "guests" | "media" | "experience" | "menu" | "share" | "archive" | "team";

type EventWorkspaceShellInput = {
  locale: Locale;
  eventCode: string;
  eventName: string;
  membership: EventRole;
  eventPageLabel: string;
  hasRemovalRequests: boolean;
  activeSection: EventWorkspaceSection;
  showMenuTools: boolean;
  content: string;
};

const copy: Record<Locale, {
  back: string;
  navigation: string;
  overview: string;
  overviewHint: string;
  eventPageHint: string;
  media: string;
  mediaHint: string;
  guests: string;
  guestsHint: string;
  share: string;
  shareHint: string;
  team: string;
  teamHint: string;
  requests: string;
  requestsHint: string;
  plan: string;
  planHint: string;
  settings: string;
  settingsHint: string;
  journey: string;
  access: string;
}> = {
  en: { back: "All events", navigation: "Event workspace", overview: "Start here", overviewHint: "Your status and next best action", eventPageHint: "Page, design and event details", media: "Collect memories", mediaHint: "Albums, uploads and moderation", guests: "Guests", guestsHint: "Directory, invitations and RSVP", share: "Share & print", shareHint: "Links, QR codes and print files", team: "Team & roles", teamHint: "Members and access", requests: "Removal requests", requestsHint: "Pending moderation", plan: "Archive & backup", planHint: "Package, exports and recovery", settings: "Live experience", settingsHint: "Guestbook, slideshow and branding", journey: "Event journey", access: "Access" },
  el: { back: "Όλα τα events", navigation: "Χώρος event", overview: "Ξεκίνα εδώ", overviewHint: "Κατάσταση και επόμενη σωστή κίνηση", eventPageHint: "Σελίδα, design και στοιχεία event", media: "Συλλογή αναμνήσεων", mediaHint: "Albums, uploads και moderation", guests: "Καλεσμένοι", guestsHint: "Λίστα, προσκλήσεις και RSVP", share: "Μοίρασμα & εκτυπώσεις", shareHint: "Links, QR codes και έντυπα", team: "Ομάδα & ρόλοι", teamHint: "Μέλη και πρόσβαση", requests: "Αιτήματα αφαίρεσης", requestsHint: "Εκκρεμής διαχείριση", plan: "Αρχείο & backup", planHint: "Πακέτο, exports και επαναφορά", settings: "Εμπειρία εκδήλωσης", settingsHint: "Guestbook, slideshow και branding", journey: "Ροή event", access: "Πρόσβαση" },
  fr: { back: "Tous les événements", navigation: "Espace événement", overview: "Commencer ici", overviewHint: "État et prochaine action", eventPageHint: "Page, design et détails", media: "Collecter les souvenirs", mediaHint: "Albums, envois et modération", guests: "Invités", guestsHint: "Liste, invitations et RSVP", share: "Partager et imprimer", shareHint: "Liens, QR codes et impressions", team: "Équipe et rôles", teamHint: "Membres et accès", requests: "Demandes de retrait", requestsHint: "Modération en attente", plan: "Archive et sauvegarde", planHint: "Forfait, exports et récupération", settings: "Expérience en direct", settingsHint: "Livre d’or, diaporama et marque", journey: "Parcours événement", access: "Accès" },
  de: { back: "Alle Events", navigation: "Event-Arbeitsbereich", overview: "Hier starten", overviewHint: "Status und nächster Schritt", eventPageHint: "Seite, Design und Details", media: "Erinnerungen sammeln", mediaHint: "Alben, Uploads und Moderation", guests: "Gäste", guestsHint: "Liste, Einladungen und RSVP", share: "Teilen und drucken", shareHint: "Links, QR-Codes und Druck", team: "Team und Rollen", teamHint: "Mitglieder und Zugriff", requests: "Entfernungsanfragen", requestsHint: "Ausstehende Moderation", plan: "Archiv und Backup", planHint: "Paket, Exporte und Wiederherstellung", settings: "Live-Erlebnis", settingsHint: "Gästebuch, Slideshow und Branding", journey: "Event-Ablauf", access: "Zugriff" },
  es: { back: "Todos los eventos", navigation: "Espacio del evento", overview: "Empieza aquí", overviewHint: "Estado y siguiente acción", eventPageHint: "Página, diseño y detalles", media: "Recoger recuerdos", mediaHint: "Álbumes, cargas y moderación", guests: "Invitados", guestsHint: "Lista, invitaciones y RSVP", share: "Compartir e imprimir", shareHint: "Enlaces, QR e impresiones", team: "Equipo y roles", teamHint: "Miembros y acceso", requests: "Solicitudes de retirada", requestsHint: "Moderación pendiente", plan: "Archivo y copia", planHint: "Paquete, exportaciones y recuperación", settings: "Experiencia en vivo", settingsHint: "Libro, presentación y marca", journey: "Recorrido del evento", access: "Acceso" },
  it: { back: "Tutti gli eventi", navigation: "Spazio evento", overview: "Inizia qui", overviewHint: "Stato e prossima azione", eventPageHint: "Pagina, design e dettagli", media: "Raccogli ricordi", mediaHint: "Album, upload e moderazione", guests: "Ospiti", guestsHint: "Elenco, inviti e RSVP", share: "Condividi e stampa", shareHint: "Link, QR e stampe", team: "Team e ruoli", teamHint: "Membri e accesso", requests: "Richieste di rimozione", requestsHint: "Moderazione in attesa", plan: "Archivio e backup", planHint: "Pacchetto, export e recupero", settings: "Esperienza live", settingsHint: "Guestbook, slideshow e branding", journey: "Percorso evento", access: "Accesso" },
};

function workspaceSections(input: EventWorkspaceShellInput): WorkspaceSection[] {
  const labels = copy[input.locale];
  const sections: WorkspaceSection[] = [
    { id: "overview", path: "", label: labels.overview, hint: labels.overviewHint, group: "home", symbol: "⌂" },
    { id: "website", path: "/website", label: input.eventPageLabel, hint: labels.eventPageHint, group: "journey", phase: 1, symbol: "✦", ownerOnly: true },
    { id: "menu", path: "/menu", label: input.locale === "el" ? "Μενού & εκτυπώσεις" : "Menu & print", hint: input.locale === "el" ? "Πιάτα και έντυπα" : "Courses and print files", group: "journey", phase: 1, symbol: "≡", ownerOnly: true, when: input.showMenuTools },
    { id: "guests", path: "/guests", label: labels.guests, hint: labels.guestsHint, group: "journey", phase: 2, symbol: "◎", ownerOnly: true },
    { id: "media", path: "/media", label: labels.media, hint: input.hasRemovalRequests ? labels.requestsHint : labels.mediaHint, group: "journey", phase: 3, symbol: "▧" },
    { id: "experience", path: "/experience", label: labels.settings, hint: labels.settingsHint, group: "journey", phase: 4, symbol: "▶", ownerOnly: true },
    { id: "share", path: "/share", label: labels.share, hint: labels.shareHint, group: "journey", phase: 5, symbol: "⌁" },
    { id: "archive", path: "/lifecycle", label: labels.plan, hint: labels.planHint, group: "journey", phase: 6, symbol: "↓", ownerOnly: true },
    { id: "team", path: "/team", label: labels.team, hint: labels.teamHint, group: "access", symbol: "♙", ownerOnly: true },
  ];
  return sections.filter((section) => section.when !== false && (!section.ownerOnly || input.membership === "owner"));
}

function navigationLinks(input: EventWorkspaceShellInput, sections: WorkspaceSection[], compact: boolean) {
  return sections.map((section) => {
    const active = section.id === input.activeSection;
    const href = `/dashboard/${encodeURIComponent(input.eventCode)}${section.path}?lang=${input.locale}`;
    if (compact) {
      return `<a data-workspace-section-link="${esc(section.id)}" data-workspace-phase="${section.phase ?? "utility"}" href="${href}"${active ? ' aria-current="page"' : ""} class="group flex min-h-12 max-w-[12.5rem] shrink-0 snap-start items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm ${active ? "border-[#6d28d9] bg-[#6d28d9] text-white shadow-sm" : "border-[#e6dff0] bg-white text-[#5f536a]"} outline-none transition hover:border-[#c4b5fd] hover:bg-[#f4effc] hover:text-[#2b174d] focus-visible:ring-2 focus-visible:ring-[#a78bfa]"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-white/20 text-white" : "bg-[#f1eaff] text-[#7c3aed]"} text-sm font-bold">${esc(section.symbol)}</span><span class="min-w-0"><strong class="block truncate font-semibold">${section.phase ? `${section.phase}. ` : ""}${esc(section.label)}</strong></span></a>`;
    }
    return `<a data-workspace-section-link="${esc(section.id)}" data-workspace-phase="${section.phase ?? "utility"}" href="${href}"${active ? ' aria-current="page"' : ""} class="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${active ? "bg-[#f1eaff] text-[#2b174d]" : "text-[#5f536a]"} outline-none transition hover:bg-[#f4effc] hover:text-[#2b174d] focus-visible:ring-2 focus-visible:ring-[#a78bfa]"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${active ? "border-[#c4b5fd] bg-[#7c3aed] text-white" : "border-[#e6dff0] bg-white text-[#7c3aed]"} text-sm font-bold shadow-sm">${esc(section.symbol)}</span><span class="min-w-0"><strong class="block truncate font-semibold">${section.phase ? `${section.phase}. ` : ""}${esc(section.label)}</strong><small class="mt-0.5 block truncate text-[11px] font-normal text-[#8a8093]">${esc(section.hint)}</small></span></a>`;
  }).join("");
}

export function eventWorkspaceShell(input: EventWorkspaceShellInput) {
  const labels = copy[input.locale];
  const sections = workspaceSections(input);
  const desktopNavigation = (["home", "journey", "access"] as const).map((group) => {
    const grouped = sections.filter((section) => section.group === group);
    if (!grouped.length) return "";
    const label = group === "journey" ? labels.journey : group === "access" ? labels.access : "";
    return `${label ? `<p class="mb-1 mt-4 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#8a8093]">${esc(label)}</p>` : ""}<div class="space-y-1">${navigationLinks(input, grouped, false)}</div>`;
  }).join("");
  const activeIndex = Math.max(0, sections.findIndex((section) => section.id === input.activeSection));
  return `<main data-event-workspace-shell data-event-code="${esc(input.eventCode)}" data-event-role="${input.membership}" data-active-section="${input.activeSection}" class="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 sm:py-7">
    <section data-workspace-mobile-navigation class="sticky top-2 z-30 -mx-2 mb-4 rounded-2xl border border-[#e6dff0] bg-white/95 shadow-[0_10px_35px_rgba(43,23,77,.12)] backdrop-blur xl:hidden">
      <div class="flex min-h-12 items-center gap-3 px-3 py-2"><a href="/${input.locale}/account" aria-label="${esc(labels.back)}" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f1eaff] text-lg font-bold text-[#7c3aed] outline-none transition hover:bg-[#e7ddff] focus-visible:ring-2 focus-visible:ring-[#a78bfa]">←</a><div class="min-w-0 flex-1"><p class="text-[10px] font-bold uppercase tracking-[.14em] text-[#8a8093]">${esc(labels.navigation)}</p><p class="truncate text-sm font-semibold text-[#2b174d]" title="${esc(input.eventName)}">${esc(input.eventName)}</p></div><span aria-hidden="true" class="rounded-full bg-[#f8f5ff] px-2.5 py-1 text-[10px] font-bold text-[#7c3aed]">${activeIndex + 1}/${sections.length}</span></div>
      <nav data-workspace-mobile-nav aria-label="${esc(labels.navigation)}" class="flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain border-t border-[#eee8f5] px-3 py-2 scroll-smooth">${navigationLinks(input, sections, true)}</nav>
    </section>
    <div class="grid gap-6 xl:grid-cols-[250px_minmax(0,1fr)]">
      <aside class="hidden h-fit xl:sticky xl:top-5 xl:block"><div class="rounded-[1.6rem] border border-[#e6dff0] bg-white p-3 shadow-sm"><a href="/${input.locale}/account" class="mb-3 flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[#7c3aed] hover:bg-[#f8f5ff]">← ${esc(labels.back)}</a><div class="border-t border-[#eee8f5] px-3 pb-3 pt-4"><p class="text-[10px] font-bold uppercase tracking-[.16em] text-[#8a8093]">${esc(labels.navigation)}</p><p class="mt-1 truncate font-semibold text-[#2b174d]" title="${esc(input.eventName)}">${esc(input.eventName)}</p></div><nav aria-label="${esc(labels.navigation)}">${desktopNavigation}</nav></div></aside>
      <div class="min-w-0">${input.content}</div>
    </div>
  </main><style>[data-workspace-mobile-nav]{scrollbar-width:none}[data-workspace-mobile-nav]::-webkit-scrollbar{display:none}</style><script>(()=>{const root=document.querySelector('[data-event-workspace-shell]');if(!root)return;const legacy={template:'website',engagement:'experience',gallery:'media',requests:'media',share:'share',people:'team','event-access':'archive','package-access-title':'archive','event-protection-title':'archive',settings:'overview',danger:'overview'},target=legacy[location.hash.slice(1)];if(root.dataset.activeSection==='overview'&&target&&target!=='overview'){const path=target==='archive'?'lifecycle':target;location.replace('/dashboard/'+encodeURIComponent(root.dataset.eventCode)+'/'+path+'?lang=${input.locale}');return}const emit=(action,detail={})=>document.dispatchEvent(new CustomEvent('memboux:workspace-action',{detail:{action,...detail}})),activeMobileLink=root.querySelector('[data-workspace-mobile-nav] [aria-current="page"]');activeMobileLink?.scrollIntoView({block:'nearest',inline:'center'});root.querySelectorAll('[data-workspace-section-link]').forEach(link=>link.addEventListener('click',()=>{const detail={section:link.dataset.workspaceSectionLink,phase:link.dataset.workspacePhase};root.dispatchEvent(new CustomEvent('memboux:workspace-navigation',{detail}));emit('navigate',detail)}));root.querySelector('[data-workspace-recommended-action]')?.addEventListener('click',event=>emit('recommended_action',{href:event.currentTarget.getAttribute('href')}));root.querySelectorAll('[data-workspace-journey-step]').forEach(link=>link.addEventListener('click',()=>emit('journey_step',{phase:link.dataset.workspaceJourneyStep,href:link.getAttribute('href')})))})()<\/script>`;
}
