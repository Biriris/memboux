import type { Locale } from "../i18n";
import { esc } from "../utils";

export function shareIconButtons(
  guestUrl: string,
  eventName: string,
  locale: Locale,
) {
  const shareText =
    locale === "el"
      ? `Δες και πρόσθεσε στιγμές στο ${eventName}: ${guestUrl}`
      : `View and add moments to ${eventName}: ${guestUrl}`;
  const text = encodeURIComponent(shareText);
  const icon = (body: string) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true" class="h-5 w-5 fill-current">${body}</svg>`;
  const base =
    "inline-flex h-11 w-11 items-center justify-center rounded-full text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#654534] focus:ring-offset-2";
  const messageButton = (app: "messenger" | "instagram", label: string, color: string, body: string) =>
    `<button type="button" data-message-app="${app}" data-title="${esc(eventName)}" data-text="${esc(shareText)}" data-url="${esc(guestUrl)}" class="${base} ${color}" aria-label="${label}" title="${label}">${icon(body)}</button>`;

  return `<div class="mt-5 flex flex-wrap justify-center gap-2">
    <a href="sms:?&body=${text}" class="${base} bg-[#334155] md:hidden" aria-label="Text message" title="Text message">${icon('<path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/>')}</a>
    <a href="viber://forward?text=${text}" class="${base} bg-[#7360f2]" aria-label="Viber" title="Viber">${icon('<path d="M12 2a9 9 0 0 0-7.7 13.7L3 22l6.4-1.5A9 9 0 1 0 12 2Zm4.7 13.2c-.3.8-1.6 1.5-2.3 1.6-.6.1-1.4.2-4.1-.9-3.5-1.5-5.8-5.1-6-5.3-.2-.3-1.4-1.9-1.4-3.6 0-1.7.9-2.6 1.2-2.9.3-.3.7-.4 1-.4h.7c.2 0 .5-.1.8.6l1.1 2.7c.1.3.1.6-.1.9l-.5.8c-.2.3-.4.5-.2.8.2.3.9 1.5 2 2.4 1.4 1.3 2.6 1.7 3 1.9.3.2.6.2.8-.1l1.1-1.3c.3-.3.6-.4.9-.2l2.5 1.2c.4.2.6.3.7.5.1.2.1.8-.2 1.6Z"/>')}</a>
    <a href="https://wa.me/?text=${text}" target="_blank" rel="noopener" class="${base} bg-[#25d366]" aria-label="WhatsApp" title="WhatsApp">${icon('<path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.8 14.1c-.2.7-1.3 1.3-1.9 1.4-.5.1-1.2.2-3.5-.8-3-1.3-4.9-4.3-5.1-4.5-.1-.2-1.2-1.6-1.2-3.1s.8-2.2 1-2.5c.3-.3.6-.3.8-.3h.6c.2 0 .4-.1.7.5l.9 2.3c.1.3.1.5-.1.7l-.4.7c-.2.2-.3.4-.1.7.2.3.8 1.3 1.7 2.1 1.2 1.1 2.2 1.4 2.5 1.6.3.1.5.1.7-.1l.9-1.1c.2-.3.5-.3.8-.2l2.1 1c.3.2.5.3.6.4.1.2.1.7-.1 1.3Z"/>')}</a>
    ${messageButton("messenger", "Messenger", "bg-gradient-to-br from-[#00b2ff] to-[#7b2cff]", '<path d="M12 2C6.4 2 2 6.1 2 11.5c0 3 1.4 5.6 3.7 7.3V22l3.2-1.8c1 .3 2 .5 3.1.5 5.6 0 10-4.1 10-9.5S17.6 2 12 2Zm1 12.8-2.5-2.6-4.9 2.6 5.4-5.7 2.5 2.6 4.9-2.6-5.4 5.7Z"/>')}
    ${messageButton("instagram", "Instagram Direct", "bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af]", '<path fill-rule="evenodd" d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm5 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6ZM18.3 5.5a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z"/>')}
    <button type="button" data-native-share data-title="${esc(eventName)}" data-text="${esc(shareText)}" data-url="${esc(guestUrl)}" class="${base} bg-black" aria-label="TikTok or another app" title="TikTok or another app">${icon('<path d="M14 3h3c.3 2 1.5 3.4 4 3.8v3.1a8.2 8.2 0 0 1-4-1.2V15a7 7 0 1 1-6-6.9v3.2a3.8 3.8 0 1 0 3 3.7V3Z"/>')}</button>
  </div><a href="${esc(guestUrl)}/official?lang=${locale}" class="mt-4 inline-flex rounded-xl border border-[#d8c8bc] bg-white px-5 py-2 text-sm text-[#654534]">Official album</a>
  <script>(()=>{const nativeShare=async button=>{const payload={title:button.dataset.title,text:button.dataset.text,url:button.dataset.url};if(navigator.share){try{await navigator.share(payload);return true}catch(error){if(error?.name==='AbortError')return true}}try{await navigator.clipboard.writeText(button.dataset.text);return false}catch{return false}};document.querySelectorAll('[data-native-share]').forEach(button=>button.onclick=()=>nativeShare(button));document.querySelectorAll('[data-message-app]').forEach(button=>button.onclick=async()=>{const app=button.dataset.messageApp,isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);try{await navigator.clipboard.writeText(button.dataset.text)}catch{}if(!isMobile){window.open(app==='instagram'?'https://www.instagram.com/direct/inbox/':'https://www.facebook.com/messages/new','_blank','noopener');return}let hidden=false;const visibility=()=>{if(document.hidden)hidden=true};document.addEventListener('visibilitychange',visibility,{once:true});location.href=app==='instagram'?'instagram://direct-inbox':'fb-messenger://share/?link='+encodeURIComponent(button.dataset.url);setTimeout(()=>{if(!hidden)nativeShare(button)},900)})})()<\/script>`;
}
