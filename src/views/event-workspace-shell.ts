import type { EventRole } from "../domain";
import type { Locale } from "../i18n";
import { esc } from "../utils";

type WorkspaceSection = {
  id: string;
  path: string;
  label: string;
  hint: string;
  ownerOnly?: boolean;
  when?: boolean;
};

export type EventWorkspaceSection = "overview" | "website" | "guests" | "media" | "menu" | "share" | "team" | "manage";

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
}> = {
  en: { back: "All events", navigation: "Event workspace", overview: "Overview", overviewHint: "Status and next steps", eventPageHint: "Page, design and preview", media: "Photos & videos", mediaHint: "Gallery and cover", guests: "Guests & engagement", guestsHint: "RSVP, guestbook and live", share: "Share & privacy", shareHint: "Links, QR codes and PIN", team: "Team & roles", teamHint: "Members and access", requests: "Removal requests", requestsHint: "Pending moderation", plan: "Plan & access", planHint: "Trial, limits and package", settings: "Settings", settingsHint: "Event details and deletion" },
  el: { back: "Όλα τα events", navigation: "Χώρος διαχείρισης event", overview: "Επισκόπηση", overviewHint: "Κατάσταση και επόμενα βήματα", eventPageHint: "Σελίδα, design και preview", media: "Φωτογραφίες & βίντεο", mediaHint: "Gallery και cover", guests: "Καλεσμένοι & συμμετοχή", guestsHint: "RSVP, guestbook και live", share: "Κοινοποίηση & ιδιωτικότητα", shareHint: "Links, QR codes και PIN", team: "Ομάδα & ρόλοι", teamHint: "Μέλη και πρόσβαση", requests: "Αιτήματα αφαίρεσης", requestsHint: "Εκκρεμής διαχείριση", plan: "Plan & πρόσβαση", planHint: "Trial, όρια και πακέτο", settings: "Ρυθμίσεις", settingsHint: "Στοιχεία event και διαγραφή" },
  fr: { back: "Tous les événements", navigation: "Espace événement", overview: "Vue d’ensemble", overviewHint: "État et prochaines étapes", eventPageHint: "Page, design et aperçu", media: "Photos et vidéos", mediaHint: "Galerie et couverture", guests: "Invités et participation", guestsHint: "RSVP, livre d’or et direct", share: "Partage et confidentialité", shareHint: "Liens, QR codes et PIN", team: "Équipe et rôles", teamHint: "Membres et accès", requests: "Demandes de retrait", requestsHint: "Modération en attente", plan: "Forfait et accès", planHint: "Essai, limites et forfait", settings: "Paramètres", settingsHint: "Détails et suppression" },
  de: { back: "Alle Events", navigation: "Event-Arbeitsbereich", overview: "Übersicht", overviewHint: "Status und nächste Schritte", eventPageHint: "Seite, Design und Vorschau", media: "Fotos und Videos", mediaHint: "Galerie und Titelbild", guests: "Gäste und Interaktion", guestsHint: "RSVP, Gästebuch und Live", share: "Teilen und Datenschutz", shareHint: "Links, QR-Codes und PIN", team: "Team und Rollen", teamHint: "Mitglieder und Zugriff", requests: "Entfernungsanfragen", requestsHint: "Ausstehende Moderation", plan: "Plan und Zugriff", planHint: "Testphase, Limits und Paket", settings: "Einstellungen", settingsHint: "Eventdetails und Löschung" },
  es: { back: "Todos los eventos", navigation: "Espacio del evento", overview: "Resumen", overviewHint: "Estado y próximos pasos", eventPageHint: "Página, diseño y vista previa", media: "Fotos y vídeos", mediaHint: "Galería y portada", guests: "Invitados y participación", guestsHint: "RSVP, libro de visitas y directo", share: "Compartir y privacidad", shareHint: "Enlaces, códigos QR y PIN", team: "Equipo y roles", teamHint: "Miembros y acceso", requests: "Solicitudes de retirada", requestsHint: "Moderación pendiente", plan: "Plan y acceso", planHint: "Prueba, límites y paquete", settings: "Ajustes", settingsHint: "Detalles y eliminación" },
  it: { back: "Tutti gli eventi", navigation: "Spazio evento", overview: "Panoramica", overviewHint: "Stato e prossimi passi", eventPageHint: "Pagina, design e anteprima", media: "Foto e video", mediaHint: "Galleria e copertina", guests: "Ospiti e partecipazione", guestsHint: "RSVP, guestbook e live", share: "Condivisione e privacy", shareHint: "Link, codici QR e PIN", team: "Team e ruoli", teamHint: "Membri e accesso", requests: "Richieste di rimozione", requestsHint: "Moderazione in attesa", plan: "Piano e accesso", planHint: "Prova, limiti e pacchetto", settings: "Impostazioni", settingsHint: "Dettagli ed eliminazione" },
};

function workspaceSections(input: EventWorkspaceShellInput): WorkspaceSection[] {
  const labels = copy[input.locale];
  return [
    { id: "overview", path: "", label: labels.overview, hint: labels.overviewHint },
    { id: "website", path: "/website", label: input.eventPageLabel, hint: labels.eventPageHint, ownerOnly: true },
    { id: "guests", path: "/guests", label: labels.guests, hint: labels.guestsHint, ownerOnly: true },
    { id: "media", path: "/media", label: labels.media, hint: input.hasRemovalRequests ? labels.requestsHint : labels.mediaHint },
    { id: "menu", path: "/menu", label: input.locale === "el" ? "Μενού & εκτυπώσεις" : "Menu & print", hint: input.locale === "el" ? "Πιάτα και έντυπα" : "Courses and print files", ownerOnly: true, when: input.showMenuTools },
    { id: "share", path: "/share", label: labels.share, hint: labels.shareHint },
    { id: "team", path: "/team", label: labels.team, hint: labels.teamHint, ownerOnly: true },
    { id: "manage", path: "/manage", label: `${labels.plan} · ${labels.settings}`, hint: labels.settingsHint, ownerOnly: true },
  ].filter((section) => section.when !== false && (!section.ownerOnly || input.membership === "owner"));
}

function navigationLinks(input: EventWorkspaceShellInput, sections: WorkspaceSection[], compact: boolean) {
  return sections.map((section, index) => {
    const active = section.id === input.activeSection;
    const href = `/dashboard/${encodeURIComponent(input.eventCode)}${section.path}?lang=${input.locale}`;
    return `<a data-workspace-section-link="${esc(section.id)}" href="${href}"${active ? ' aria-current="page"' : ""} class="group flex ${compact ? "min-w-[12rem]" : "w-full"} items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${active ? "bg-[#f1eaff] text-[#2b174d]" : "text-[#5f536a]"} outline-none transition hover:bg-[#f4effc] hover:text-[#2b174d] focus-visible:ring-2 focus-visible:ring-[#a78bfa]"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${active ? "border-[#c4b5fd] bg-[#7c3aed] text-white" : "border-[#e6dff0] bg-white text-[#7c3aed]"} text-xs font-bold shadow-sm">${index + 1}</span><span class="min-w-0"><strong class="block truncate font-semibold">${esc(section.label)}</strong><small class="mt-0.5 block truncate text-[11px] font-normal text-[#8a8093]">${esc(section.hint)}</small></span></a>`;
  }).join("");
}

export function eventWorkspaceShell(input: EventWorkspaceShellInput) {
  const labels = copy[input.locale];
  const sections = workspaceSections(input);
  return `<main data-event-workspace-shell data-event-code="${esc(input.eventCode)}" data-event-role="${input.membership}" data-active-section="${input.activeSection}" class="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 sm:py-7">
    <div class="mb-4 xl:hidden"><details class="group rounded-2xl border border-[#e6dff0] bg-white shadow-sm"><summary class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-[#2b174d]"><span>${esc(labels.navigation)}</span><span aria-hidden="true" class="text-[#7c3aed] transition group-open:rotate-180">⌄</span></summary><nav aria-label="${esc(labels.navigation)}" class="flex gap-1 overflow-x-auto border-t border-[#eee8f5] p-2">${navigationLinks(input, sections, true)}</nav></details></div>
    <div class="grid gap-6 xl:grid-cols-[250px_minmax(0,1fr)]">
      <aside class="hidden h-fit xl:sticky xl:top-5 xl:block"><div class="rounded-[1.6rem] border border-[#e6dff0] bg-white p-3 shadow-sm"><a href="/${input.locale}/account" class="mb-3 flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[#7c3aed] hover:bg-[#f8f5ff]">← ${esc(labels.back)}</a><div class="border-t border-[#eee8f5] px-3 pb-3 pt-4"><p class="text-[10px] font-bold uppercase tracking-[.16em] text-[#8a8093]">${esc(labels.navigation)}</p><p class="mt-1 truncate font-semibold text-[#2b174d]" title="${esc(input.eventName)}">${esc(input.eventName)}</p></div><nav aria-label="${esc(labels.navigation)}" class="space-y-1">${navigationLinks(input, sections, false)}</nav></div></aside>
      <div class="min-w-0">${input.content}</div>
    </div>
  </main><script>(()=>{const root=document.querySelector('[data-event-workspace-shell]');if(!root)return;const legacy={template:'website',engagement:'guests',gallery:'media',requests:'media',share:'share',people:'team','event-access':'manage',settings:'manage',danger:'manage'},target=legacy[location.hash.slice(1)];if(root.dataset.activeSection==='overview'&&target){location.replace('/dashboard/'+encodeURIComponent(root.dataset.eventCode)+'/'+target+'?lang=${input.locale}');return}root.querySelectorAll('[data-workspace-section-link]').forEach(link=>link.addEventListener('click',()=>root.dispatchEvent(new CustomEvent('memboux:workspace-navigation',{detail:{section:link.dataset.workspaceSectionLink}}))))})()<\/script>`;
}
