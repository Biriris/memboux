import type { Locale } from "./i18n";

export const weddingThemeKeys = [
  "cypress",
  "nocturne",
  "lumiere",
  "atelier",
  "aegean",
  "champagne",
  "wildflower",
  "terracotta",
  "monogram",
  "deco",
  "celeste",
  "vinifera",
  "pearl",
  "solstice",
  "alpine",
] as const;
export type WeddingThemeKey = (typeof weddingThemeKeys)[number];
export type WeddingThemeLayout = "centered" | "editorial" | "split" | "framed" | "poster";
export type WeddingThemeFont = "didot" | "garamond" | "noto-serif" | "modern";

type ThemeCopy = Record<Locale, string>;

export type WeddingTheme = {
  key: WeddingThemeKey;
  name: ThemeCopy;
  description: ThemeCopy;
  palette: readonly [string, string, string];
  defaultAccent: string;
  layout: WeddingThemeLayout;
  font: WeddingThemeFont;
};

const copy = (en: string, el: string, fr: string, de: string, es: string, it: string): ThemeCopy => ({ en, el, fr, de, es, it });
const name = (value: string): ThemeCopy => ({ en: value, el: value, fr: value, de: value, es: value, it: value });

export const weddingThemes: readonly WeddingTheme[] = [
  {
    key: "cypress", name: name("Cypress"), layout: "centered", font: "garamond",
    description: copy("Editorial botanicals with quiet Mediterranean luxury.", "Editorial βοτανική αισθητική με ήσυχη μεσογειακή πολυτέλεια.", "Botanique éditoriale au luxe méditerranéen discret.", "Editoriale Botanik mit stiller mediterraner Eleganz.", "Botánica editorial con lujo mediterráneo sereno.", "Botanica editoriale dal lusso mediterraneo discreto."),
    palette: ["#173d34", "#c8b7a6", "#f4f0e7"], defaultAccent: "#8f6d55",
  },
  {
    key: "nocturne", name: name("Nocturne"), layout: "editorial", font: "didot",
    description: copy("Cinematic black, candlelight and dramatic typography.", "Κινηματογραφικό μαύρο, φως κεριών και δραματική τυπογραφία.", "Noir cinématographique, bougies et typographie dramatique.", "Filmisches Schwarz, Kerzenlicht und dramatische Typografie.", "Negro cinematográfico, velas y tipografía dramática.", "Nero cinematografico, candele e tipografia scenografica."),
    palette: ["#151717", "#a77b4f", "#e8dfd2"], defaultAccent: "#b68a5c",
  },
  {
    key: "lumiere", name: name("Lumière"), layout: "centered", font: "didot",
    description: copy("Airy blush tones and softly romantic movement.", "Ανάλαφροι blush τόνοι και απαλά ρομαντική κίνηση.", "Tons poudrés aériens et mouvement délicatement romantique.", "Luftige Pudertöne und sanft romantische Bewegung.", "Tonos empolvados y movimiento suavemente romántico.", "Toni cipria ariosi e movimento delicatamente romantico."),
    palette: ["#6d514c", "#d6b8ae", "#fbf6f1"], defaultAccent: "#a46f65",
  },
  {
    key: "atelier", name: name("Atelier"), layout: "editorial", font: "modern",
    description: copy("High-fashion monochrome with a magazine-cover composition.", "High-fashion μονόχρωμο με σύνθεση εξωφύλλου περιοδικού.", "Monochrome haute couture composé comme une couverture de magazine.", "High-Fashion-Monochrom im Stil eines Magazincovers.", "Monocromo de alta moda con composición de portada.", "Monocromia haute couture con composizione da copertina."),
    palette: ["#111111", "#a9a9a7", "#f7f5f0"], defaultAccent: "#6f6f6b",
  },
  {
    key: "aegean", name: name("Aegean"), layout: "split", font: "noto-serif",
    description: copy("Sea blue, sun-washed ivory and a destination feel.", "Μπλε του Αιγαίου, ηλιόλουστο ivory και destination αίσθηση.", "Bleu Égée, ivoire solaire et esprit destination.", "Ägäisblau, sonniges Elfenbein und Destination-Flair.", "Azul Egeo, marfil soleado y espíritu de destino.", "Blu Egeo, avorio solare e atmosfera destination."),
    palette: ["#153b56", "#8fb7c5", "#f7f2e8"], defaultAccent: "#d09b63",
  },
  {
    key: "champagne", name: name("Champagne"), layout: "framed", font: "didot",
    description: copy("Warm metallic details and timeless ballroom elegance.", "Ζεστές μεταλλικές λεπτομέρειες και διαχρονική ballroom κομψότητα.", "Détails métalliques chauds et élégance intemporelle de ballroom.", "Warme Metalldetails und zeitlose Ballsaal-Eleganz.", "Detalles metálicos cálidos y elegancia de salón atemporal.", "Dettagli metallici caldi ed eleganza senza tempo."),
    palette: ["#4b3b2f", "#c7aa79", "#f7f0e3"], defaultAccent: "#b38a4e",
  },
  {
    key: "wildflower", name: name("Wildflower"), layout: "centered", font: "garamond",
    description: copy("A joyful garden palette with expressive romantic type.", "Χαρούμενη garden παλέτα με εκφραστική ρομαντική γραφή.", "Palette de jardin joyeuse et typographie romantique expressive.", "Fröhliche Gartenpalette mit expressiver romantischer Schrift.", "Paleta de jardín alegre y tipografía romántica expresiva.", "Palette da giardino gioiosa e caratteri romantici espressivi."),
    palette: ["#334f3d", "#efb8bd", "#fff8ed"], defaultAccent: "#c75f74",
  },
  {
    key: "terracotta", name: name("Terracotta"), layout: "split", font: "garamond",
    description: copy("Earthy clay, olive and relaxed Mediterranean character.", "Γήινος πηλός, ελιά και χαλαρός μεσογειακός χαρακτήρας.", "Argile, olive et caractère méditerranéen décontracté.", "Terrakotta, Olive und entspannter mediterraner Charakter.", "Arcilla, oliva y carácter mediterráneo relajado.", "Argilla, oliva e carattere mediterraneo rilassato."),
    palette: ["#4f3b30", "#bd7658", "#f3e6d4"], defaultAccent: "#9f583f",
  },
  {
    key: "monogram", name: name("Monogram"), layout: "framed", font: "noto-serif",
    description: copy("Invitation-suite minimalism with precise lines and spacing.", "Μινιμαλισμός invitation suite με ακριβείς γραμμές και αποστάσεις.", "Minimalisme de papeterie avec lignes et espacements précis.", "Einladungs-Minimalismus mit präzisen Linien und Abständen.", "Minimalismo de invitación con líneas y espacios precisos.", "Minimalismo da invito con linee e spaziature precise."),
    palette: ["#2d3431", "#b9b7ae", "#faf9f4"], defaultAccent: "#77756d",
  },
  {
    key: "deco", name: name("Deco"), layout: "poster", font: "didot",
    description: copy("Geometric black and gold inspired by evening glamour.", "Γεωμετρικό μαύρο και χρυσό εμπνευσμένο από evening glamour.", "Noir et or géométriques inspirés du glamour nocturne.", "Geometrisches Schwarz und Gold mit Abendglamour.", "Negro y oro geométricos con glamour nocturno.", "Nero e oro geometrici ispirati al glamour serale."),
    palette: ["#0b1212", "#b99455", "#eee3ce"], defaultAccent: "#c49b55",
  },
  {
    key: "celeste", name: name("Celeste"), layout: "centered", font: "noto-serif",
    description: copy("Powder blue, clean light and effortless modern romance.", "Powder blue, καθαρό φως και ανεπιτήδευτος σύγχρονος ρομαντισμός.", "Bleu poudré, lumière pure et romance moderne sans effort.", "Puderblau, klares Licht und mühelose moderne Romantik.", "Azul empolvado, luz limpia y romance moderno natural.", "Azzurro polvere, luce pulita e romanticismo moderno."),
    palette: ["#334855", "#b9ced8", "#f7faf9"], defaultAccent: "#718f9d",
  },
  {
    key: "vinifera", name: name("Vinifera"), layout: "editorial", font: "garamond",
    description: copy("Burgundy depth and vineyard warmth for autumn celebrations.", "Βάθος μπορντό και ζεστασιά αμπελώνα για φθινοπωρινές γιορτές.", "Profondeur bordeaux et chaleur du vignoble pour l’automne.", "Bordeaux-Tiefe und Weinbergwärme für Herbstfeiern.", "Profundidad burdeos y calidez de viñedo para el otoño.", "Profondità bordeaux e calore da vigneto per l’autunno."),
    palette: ["#4a2029", "#ad7e69", "#f3e9dc"], defaultAccent: "#985c4e",
  },
  {
    key: "pearl", name: name("Pearl"), layout: "framed", font: "noto-serif",
    description: copy("Ultra-minimal ivory with pearl highlights and quiet type.", "Ultra-minimal ivory με pearl ανταύγειες και ήσυχη τυπογραφία.", "Ivoire ultra-minimal, reflets nacrés et typographie discrète.", "Ultra-minimales Elfenbein mit Perlschimmer und ruhiger Typografie.", "Marfil ultraminimal con reflejos perlados y tipografía serena.", "Avorio ultra-minimal con riflessi perlati e tipografia discreta."),
    palette: ["#4d504e", "#d8d7d0", "#fdfcf8"], defaultAccent: "#a3a198",
  },
  {
    key: "solstice", name: name("Solstice"), layout: "poster", font: "modern",
    description: copy("Sunset rust, plum shadows and bold contemporary energy.", "Sunset rust, plum σκιές και τολμηρή σύγχρονη ενέργεια.", "Rouille coucher de soleil, ombres prune et énergie contemporaine.", "Sonnenuntergangsrost, Pflaumenschatten und moderne Energie.", "Óxido de atardecer, sombras ciruela y energía contemporánea.", "Ruggine al tramonto, ombre prugna ed energia contemporanea."),
    palette: ["#432a38", "#d07b5d", "#f6d9c8"], defaultAccent: "#d46f50",
  },
  {
    key: "alpine", name: name("Alpine"), layout: "split", font: "modern",
    description: copy("Cool stone, deep forest and architectural restraint.", "Cool stone, βαθύ δάσος και αρχιτεκτονική λιτότητα.", "Pierre froide, forêt profonde et retenue architecturale.", "Kühler Stein, tiefer Wald und architektonische Zurückhaltung.", "Piedra fría, bosque profundo y sobriedad arquitectónica.", "Pietra fredda, bosco profondo e rigore architettonico."),
    palette: ["#233a36", "#8b9992", "#e8e9e4"], defaultAccent: "#697c74",
  },
] as const;

export function normalizeWeddingTheme(value: unknown): WeddingThemeKey {
  const key = String(value ?? "").toLowerCase();
  return weddingThemeKeys.includes(key as WeddingThemeKey) ? key as WeddingThemeKey : "cypress";
}

export function weddingThemeFor(value: unknown): WeddingTheme {
  const key = normalizeWeddingTheme(value);
  return weddingThemes.find((theme) => theme.key === key) ?? weddingThemes[0];
}

export function validWeddingAccent(value: unknown): string | null {
  const accent = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(accent) ? accent.toLowerCase() : null;
}
