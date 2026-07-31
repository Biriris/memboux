const baseUrl = (process.env.BASE_URL || "https://memboux.com").replace(/\/$/, "");
const locales = ["en", "el", "fr", "de", "es", "it"];
const eventVerticals = [
  "engagement",
  "bachelor",
  "birthday",
  "party",
  "baptism",
  "baby",
  "graduation",
  "corporate",
  "trip",
  "reunion",
  "community",
  "memorial",
  "other",
];

const checks = [
  {
    name: "liveness",
    path: "/health/live",
    status: 200,
    body: '"status":"ok"',
  },
  {
    name: "D1 readiness",
    path: "/health/ready",
    status: 200,
    body: '"status":"ready"',
  },
  {
    name: "English homepage",
    path: "/en",
    status: 200,
    body: 'data-page="home" data-locale="en"',
  },
  {
    name: "Greek homepage",
    path: "/el",
    status: 200,
    body: 'data-page="home" data-locale="el"',
  },
  {
    name: "French homepage",
    path: "/fr",
    status: 200,
    body: "Rassemblez chaque moment. Gardez-le à vous.",
  },
  {
    name: "German homepage",
    path: "/de",
    status: 200,
    body: "Sammle jeden Moment. Behalte ihn für dich.",
  },
  {
    name: "Spanish homepage",
    path: "/es",
    status: 200,
    body: "Reúne cada momento. Hazlo tuyo.",
  },
  {
    name: "Italian homepage",
    path: "/it",
    status: 200,
    body: "Raccogli ogni momento. Tienilo per te.",
  },
  {
    name: "anonymous Studio boundary",
    path: "/studio?lang=en",
    status: 302,
    location: "/en/login",
  },
  {
    name: "anonymous Studio trash boundary",
    path: "/studio/trash?lang=en",
    status: 302,
    location: "/en/login",
  },
  {
    name: "anonymous admin boundary",
    path: "/admin/readiness",
    status: 302,
    location: "/admin/login",
  },
  {
    name: "anonymous admin users boundary",
    path: "/admin/users",
    status: 302,
    location: "/admin/login",
  },
  {
    name: "anonymous admin support boundary",
    path: "/admin/support",
    status: 302,
    location: "/admin/login",
  },
  {
    name: "anonymous admin events boundary",
    path: "/admin/events",
    status: 302,
    location: "/admin/login",
  },
  {
    name: "anonymous cloud backup boundary",
    path: "/en/backups",
    status: 302,
    location: "/en/login",
  },
];

for (const [index, type] of eventVerticals.entries()) {
  const locale = locales[index % locales.length];
  checks.push(
    {
      name: `${type} landing (${locale})`,
      path: `/${locale}/events/${type}`,
      status: 200,
      body: `/${locale}/events/${type}/preview`,
    },
    {
      name: `${type} preview shell (${locale})`,
      path: `/${locale}/events/${type}/preview`,
      status: 200,
      body: 'id="demo-frame"',
    },
    {
      name: `${type} preview frame (${locale})`,
      path: `/${locale}/events/${type}/demo-frame?theme=signature`,
      status: 200,
      body: `data-event-preview="${type}"`,
    },
  );
}

for (const locale of locales) {
  checks.push(
    {
      name: `wedding landing (${locale})`,
      path: `/${locale}/wedding`,
      status: 200,
      body: `/${locale}/wedding/preview`,
    },
    {
      name: `wedding preview shell (${locale})`,
      path: `/${locale}/wedding/preview`,
      status: 200,
      body: 'id="wedding-demo-frame"',
    },
    {
      name: `wedding preview frame (${locale})`,
      path: `/${locale}/wedding/demo-frame?theme=cypress`,
      status: 200,
      body: 'data-wedding-theme="cypress"',
    },
    {
      name: `bachelor landing (${locale})`,
      path: `/${locale}/events/bachelor`,
      status: 200,
      body: `/${locale}/events/bachelor/preview`,
    },
    {
      name: `bachelor preview shell (${locale})`,
      path: `/${locale}/events/bachelor/preview`,
      status: 200,
      body: 'id="demo-frame"',
    },
    {
      name: `bachelor preview frame (${locale})`,
      path: `/${locale}/events/bachelor/demo-frame?theme=signature`,
      status: 200,
      body: 'data-event-preview="bachelor"',
    },
  );
}

if (process.env.SMOKE_GALLERY_CODE) {
  const code = encodeURIComponent(process.env.SMOKE_GALLERY_CODE);
  checks.push(
    {
      name: "guest gallery",
      path: `/gallery/${code}?lang=en`,
      status: 200,
      body: "Gallery",
    },
    {
      name: "official album",
      path: `/gallery/${code}/official?lang=en`,
      status: 200,
      body: "Official album",
    },
  );
}

let failed = false;
for (const check of checks) {
  try {
    const response = await fetch(`${baseUrl}${check.path}`, {
      redirect: "manual",
      headers: { "User-Agent": "Memboux production smoke/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.text();
    const location = response.headers.get("location");
    const valid =
      response.status === check.status &&
      (!check.body || body.includes(check.body)) &&
      (!check.location || location === check.location);
    console.log(`${valid ? "PASS" : "FAIL"} ${check.name} (${response.status})`);
    if (!valid) {
      failed = true;
      const reasons = [];
      if (response.status !== check.status)
        reasons.push(`expected status ${check.status}`);
      if (check.body && !body.includes(check.body))
        reasons.push(`missing body marker ${JSON.stringify(check.body)}`);
      if (check.location && location !== check.location)
        reasons.push(`expected location ${JSON.stringify(check.location)}, received ${JSON.stringify(location)}`);
      console.error(`  ${reasons.join("; ")}`);
    }
  } catch (error) {
    failed = true;
    console.error(`FAIL ${check.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed) process.exitCode = 1;
