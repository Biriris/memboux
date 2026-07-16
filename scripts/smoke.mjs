const baseUrl = (process.env.BASE_URL || "https://memboux.com").replace(/\/$/, "");

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
];

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
