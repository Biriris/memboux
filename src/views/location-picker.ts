import type { EventRow } from "../domain";
import type { Locale } from "../i18n";
import { esc } from "../utils";

export function locationPickerMarkup(options: {
  id: string;
  locale: Locale;
  location?: Pick<EventRow, "location" | "location_place_id" | "location_lat" | "location_lng">;
  compact?: boolean;
  inputName?: string;
  placeIdName?: string;
  sessionName?: string;
  clearName?: string;
  latitudeName?: string;
  longitudeName?: string;
}) {
  const {
    id,
    locale,
    location,
    compact = false,
    inputName = "location",
    placeIdName = "locationPlaceId",
    sessionName = "locationSessionToken",
    clearName = "clearLocation",
    latitudeName = "locationLat",
    longitudeName = "locationLng",
  } = options;
  const el = locale === "el";
  const value = location?.location ?? "";
  const placeId = location?.location_place_id ?? "";
  const latitude = typeof location?.location_lat === "number" && Number.isFinite(location.location_lat) ? String(location.location_lat) : "";
  const longitude = typeof location?.location_lng === "number" && Number.isFinite(location.location_lng) ? String(location.location_lng) : "";
  const hasLockedLocation = Boolean(placeId || (latitude && longitude));
  const status = placeId
    ? (el ? "Επαληθευμένη τοποθεσία" : "Verified location")
    : latitude && longitude
      ? (el ? "Το ακριβές σημείο είναι κλειδωμένο στον χάρτη" : "The exact point is pinned on the map")
    : value
      ? (el ? "Επίλεξέ την ξανά για να κλειδωθεί στον χάρτη" : "Select it again to lock it to the map")
      : (el ? "Επίλεξε αποτέλεσμα από τη λίστα" : "Choose a result from the list");
  return `<div data-location-picker data-initial-location="${esc(value)}" data-initial-place-id="${esc(placeId)}" data-initial-latitude="${esc(latitude)}" data-initial-longitude="${esc(longitude)}" class="relative ${compact ? "min-w-0 flex-1" : "mt-2"}">
    <input id="${esc(id)}" data-location-input name="${esc(inputName)}" maxlength="200" autocomplete="off" value="${esc(value)}" placeholder="${el ? "Αναζήτησε εκκλησία, χώρο, επιχείρηση ή διεύθυνση" : "Search for a church, venue, business or address"}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${esc(id)}-results" class="w-full rounded-xl border border-[#d6e0dc] bg-white px-4 py-3 pr-11 font-normal text-[#183c33] outline-none focus:border-[#3f7d6c] focus:ring-2 focus:ring-[#c8ddd5]">
    <input data-location-place-id type="hidden" name="${esc(placeIdName)}" value="${esc(placeId)}">
    <input data-location-session type="hidden" name="${esc(sessionName)}">
    <input data-location-clear type="hidden" name="${esc(clearName)}" value="0">
    <input data-location-latitude type="hidden" name="${esc(latitudeName)}" value="${esc(latitude)}">
    <input data-location-longitude type="hidden" name="${esc(longitudeName)}" value="${esc(longitude)}">
    <button data-location-reset type="button" aria-label="${el ? "Καθαρισμός τοποθεσίας" : "Clear location"}" class="${value ? "flex" : "hidden"} absolute right-2 top-1.5 h-9 w-9 cursor-pointer items-center justify-center rounded-full text-xl text-[#697a74] hover:bg-[#f0f5f2]">×</button>
    <div id="${esc(id)}-results" data-location-results role="listbox" class="absolute left-0 right-0 z-50 mt-2 hidden overflow-hidden rounded-2xl border border-[#d6e0dc] bg-white p-1 shadow-2xl"></div>
    <div class="mt-2 flex flex-wrap items-center gap-2"><button data-location-map-open type="button" class="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-[#d6e0dc] bg-white px-3.5 py-2 text-xs font-semibold text-[#2f6b5b] transition hover:border-[#9fc0b4] hover:bg-[#f3f7f5]"><span aria-hidden="true">⌖</span><span>${el ? "Επιλογή από χάρτη" : "Choose on map"}</span></button><span data-location-coordinate-label class="${latitude && longitude ? "inline-flex" : "hidden"} rounded-full bg-[#edf4f1] px-3 py-1.5 text-[11px] font-semibold text-[#48645a]">${latitude && longitude ? `${esc(latitude)}, ${esc(longitude)}` : ""}</span></div>
    <div data-location-map-panel class="mt-3 hidden overflow-hidden rounded-2xl border border-[#d6e0dc] bg-[#edf3f0] p-2 shadow-inner"><div data-location-map-canvas class="h-72 w-full overflow-hidden rounded-xl bg-[#dfe8e4]" role="application" aria-label="${el ? "Χάρτης επιλογής τοποθεσίας" : "Location selection map"}"></div><p class="px-2 pb-1 pt-2 text-[11px] leading-5 text-[#64766f]">${el ? "Πάτησε στο ακριβές σημείο. Χρήσιμο για εκκλησίες, κτήματα ή χώρους χωρίς πλήρη διεύθυνση." : "Tap the exact point. Useful for churches, estates, or venues without a complete address."}</p></div>
    <p data-location-status class="mt-2 flex items-center gap-1.5 text-xs ${hasLockedLocation ? "font-semibold text-emerald-700" : "text-[#697a74]"}"><span aria-hidden="true">${hasLockedLocation ? "✓" : "⌖"}</span><span>${status}</span></p>
  </div>`;
}

export function locationPickerScript(locale: Locale) {
  const labels = locale === "el" ? {
    loading: "Αναζήτηση…", empty: "Δεν βρέθηκαν τοποθεσίες.",
    error: "Η αναζήτηση τοποθεσίας δεν είναι διαθέσιμη τώρα.",
    choose: "Επίλεξε μία τοποθεσία από τα αποτελέσματα.",
    verified: "Επαληθευμένη τοποθεσία", hint: "Επίλεξε αποτέλεσμα ή σημείο στον χάρτη",
    coordinates: "Το ακριβές σημείο κλειδώθηκε στον χάρτη",
    mapError: "Ο χάρτης δεν μπόρεσε να φορτώσει.",
  } : {
    loading: "Searching…", empty: "No locations found.",
    error: "Location search is unavailable right now.",
    choose: "Choose a location from the results.",
    verified: "Verified location", hint: "Choose a result or a point on the map",
    coordinates: "The exact point is pinned on the map",
    mapError: "The map could not be loaded.",
  };
  const setup = `
    if(picker.dataset.ready)return;
    picker.dataset.ready='1';
    const input=picker.querySelector('[data-location-input]'),placeId=picker.querySelector('[data-location-place-id]'),session=picker.querySelector('[data-location-session]'),clear=picker.querySelector('[data-location-clear]'),latitude=picker.querySelector('[data-location-latitude]'),longitude=picker.querySelector('[data-location-longitude]'),reset=picker.querySelector('[data-location-reset]'),results=picker.querySelector('[data-location-results]'),status=picker.querySelector('[data-location-status]'),coordinateLabel=picker.querySelector('[data-location-coordinate-label]'),mapButton=picker.querySelector('[data-location-map-open]'),mapPanel=picker.querySelector('[data-location-map-panel]'),mapCanvas=picker.querySelector('[data-location-map-canvas]'),form=picker.closest('form');
    let timer=0,request=0,active=-1,selectedLabel=input.value,map=null,marker=null;
    session.value=crypto.randomUUID().replaceAll('-','');
    const setStatus=(message,verified=false)=>{status.lastElementChild.textContent=message;status.firstElementChild.textContent=verified?'✓':'⌖';status.className='mt-2 flex items-center gap-1.5 text-xs '+(verified?'font-semibold text-emerald-700':'text-[#697a74]')};
    const close=()=>{results.classList.add('hidden');results.replaceChildren();input.setAttribute('aria-expanded','false');active=-1};
    const validCoordinates=()=>latitude.value!==''&&longitude.value!==''&&Number.isFinite(Number(latitude.value))&&Number.isFinite(Number(longitude.value));
    const showCoordinates=()=>{if(!validCoordinates()){coordinateLabel.textContent='';coordinateLabel.classList.add('hidden');coordinateLabel.classList.remove('inline-flex');return}coordinateLabel.textContent=Number(latitude.value).toFixed(6)+', '+Number(longitude.value).toFixed(6);coordinateLabel.classList.remove('hidden');coordinateLabel.classList.add('inline-flex')};
    const moveMarker=(lat,lng,zoom=true)=>{if(!map||!window.L)return;if(marker)marker.setLatLng([lat,lng]);else marker=window.L.marker([lat,lng]).addTo(map);if(zoom)map.setView([lat,lng],Math.max(map.getZoom(),16))};
    const setMapPoint=(lat,lng)=>{latitude.value=Number(lat).toFixed(7);longitude.value=Number(lng).toFixed(7);placeId.value='';clear.value='0';if(!input.value.trim())input.value=Number(lat).toFixed(6)+', '+Number(lng).toFixed(6);selectedLabel=input.value;reset.classList.remove('hidden');reset.classList.add('flex');showCoordinates();setStatus(labels.coordinates,true);moveMarker(Number(lat),Number(lng),false)};
    const resolveSelection=async selectedPlaceId=>{try{const response=await fetch('/api/account/locations/resolve?locale='+locale+'&placeId='+encodeURIComponent(selectedPlaceId)+'&sessionToken='+encodeURIComponent(session.value),{credentials:'include',headers:{Accept:'application/json'}}),data=await response.json().catch(()=>null);if(!response.ok||!data?.place)return;latitude.value=String(data.place.lat);longitude.value=String(data.place.lng);showCoordinates();moveMarker(data.place.lat,data.place.lng)}catch{}};
    const choose=item=>{input.value=item.label;selectedLabel=item.label;placeId.value=item.placeId;latitude.value='';longitude.value='';clear.value='0';reset.classList.remove('hidden');reset.classList.add('flex');setStatus(labels.verified,true);showCoordinates();close();resolveSelection(item.placeId)};
    const attribution=()=>{const item=document.createElement('div');item.className='border-t border-[#edf3f0] px-3 py-2 text-right text-xs font-normal text-[#5e5e5e]';item.setAttribute('translate','no');item.textContent='Google Maps';return item};
    const render=items=>{results.replaceChildren();items.forEach(item=>{const button=document.createElement('button');button.type='button';button.role='option';button.className='block w-full cursor-pointer rounded-xl px-3 py-2.5 text-left text-sm text-[#2b443c] hover:bg-[#f2f7f4] focus:bg-[#e9f2ee]';button.textContent=item.label;button.addEventListener('mousedown',event=>event.preventDefault());button.addEventListener('click',()=>choose(item));results.append(button)});results.append(attribution());results.classList.remove('hidden');input.setAttribute('aria-expanded','true')};
    const showMessage=(message,error=false)=>{results.replaceChildren();const line=document.createElement('p');line.className='px-3 py-3 text-sm '+(error?'text-red-700':'text-[#697a74]');line.textContent=message;results.append(line);if(!error)results.append(attribution());results.classList.remove('hidden')};
    const search=async()=>{const query=input.value.trim(),current=++request;if(query.length<2){close();return}showMessage(labels.loading);try{const response=await fetch('/api/account/locations/search?locale='+locale+'&q='+encodeURIComponent(query)+'&sessionToken='+encodeURIComponent(session.value),{credentials:'include',headers:{Accept:'application/json'}}),data=await response.json().catch(()=>null);if(current!==request)return;if(!response.ok)throw new Error(typeof data?.message==='string'?data.message:labels.error);data?.suggestions?.length?render(data.suggestions):showMessage(labels.empty)}catch(error){if(current===request)showMessage(error instanceof Error&&error.message?error.message:labels.error,true)}};
    const loadMapLibrary=()=>{if(window.L)return Promise.resolve(window.L);if(window.__membouxLeafletPromise)return window.__membouxLeafletPromise;window.__membouxLeafletPromise=new Promise((resolve,reject)=>{if(!document.getElementById('memboux-leaflet-css')){const link=document.createElement('link');link.id='memboux-leaflet-css';link.rel='stylesheet';link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.append(link)}const existing=document.getElementById('memboux-leaflet-js');if(existing){existing.addEventListener('load',()=>resolve(window.L),{once:true});existing.addEventListener('error',reject,{once:true});return}const script=document.createElement('script');script.id='memboux-leaflet-js';script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';script.onload=()=>resolve(window.L);script.onerror=reject;document.head.append(script)});return window.__membouxLeafletPromise};
    const openMap=async()=>{mapPanel.classList.toggle('hidden');if(mapPanel.classList.contains('hidden'))return;try{const L=await loadMapLibrary();if(!map){const hasPoint=validCoordinates(),lat=hasPoint?Number(latitude.value):37.9838,lng=hasPoint?Number(longitude.value):23.7275;map=L.map(mapCanvas,{scrollWheelZoom:false}).setView([lat,lng],hasPoint?16:6);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);map.on('click',event=>setMapPoint(event.latlng.lat,event.latlng.lng));if(hasPoint)moveMarker(lat,lng,false)}setTimeout(()=>map.invalidateSize(),0)}catch{mapPanel.classList.add('hidden');setStatus(labels.mapError)}};
    mapButton.addEventListener('click',openMap);
    input.addEventListener('input',()=>{if(input.value!==selectedLabel){placeId.value='';latitude.value='';longitude.value='';showCoordinates();clear.value=input.value.trim()?'0':'1';setStatus(labels.hint)}reset.classList.toggle('hidden',!input.value);reset.classList.toggle('flex',Boolean(input.value));clearTimeout(timer);timer=setTimeout(search,250)});
    input.addEventListener('focus',()=>{if(input.value.trim().length>=2&&!placeId.value)search()});
    input.addEventListener('keydown',event=>{const choices=[...results.querySelectorAll('[role=option]')];if(event.key==='Escape'){close();return}if(!choices.length)return;if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();active=(active+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length;choices[active].focus()}else if(event.key==='Enter'&&active>=0){event.preventDefault();choices[active].click()}});
    reset.addEventListener('click',()=>{input.value='';selectedLabel='';placeId.value='';latitude.value='';longitude.value='';showCoordinates();clear.value='1';if(marker&&map){map.removeLayer(marker);marker=null}reset.classList.add('hidden');reset.classList.remove('flex');setStatus(labels.hint);close();input.focus()});
    document.addEventListener('click',event=>{if(!picker.contains(event.target))close()});
    form?.addEventListener('submit',event=>{const changed=input.value.trim()!==picker.dataset.initialLocation||latitude.value!==picker.dataset.initialLatitude||longitude.value!==picker.dataset.initialLongitude;if(input.value.trim()&&!placeId.value&&!validCoordinates()&&changed){event.preventDefault();setStatus(labels.choose);input.setCustomValidity(labels.choose);input.reportValidity();input.setCustomValidity('');input.focus()}});
    showCoordinates();
  `;
  return `<script>(()=>{const labels=${JSON.stringify(labels)},locale=${JSON.stringify(locale)};const init=()=>document.querySelectorAll('[data-location-picker]').forEach(picker=>{${setup}});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init()})()<\/script>`;
}
