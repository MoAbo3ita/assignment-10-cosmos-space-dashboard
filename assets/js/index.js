const NASA_API_KEY = "DEMO_KEY";
const APOD_URL = "https://api.nasa.gov/planetary/apod";

const LAUNCHES_URLS = [
  "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=10",
  "https://lldev.thespacedevs.com/2.3.0/launches/upcoming/?limit=10",
];

const SOLAR_URL = "https://solar-system-opendata-proxy.vercel.app/api/planets";

const AU_KM = 149597870.7;
const EARTH_MASS_KG = 5.972e24;
const LAUNCH_PLACEHOLDER = "./assets/images/launch-placeholder.png";

const $ = (id) => document.getElementById(id);

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const fmt = (n, digits = 0) =>
  Number(n).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "-": "⁻" };
const toSup = (n) => String(n).split("").map((c) => SUP[c] ?? c).join("");

async function fetchJSON(url, options = {}, retries = 1) {
  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        message = body.error?.message || body.msg || body.detail || message;
      } catch {}
      const error = new Error(message);
      error.status = res.status;
      throw error;
    }
    return await res.json();
  } catch (err) {
    const timedOut = err.name === "TimeoutError";
    const networkDown = err.name === "TypeError";
    if (retries > 0 && (err.status >= 500 || timedOut || networkDown)) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return fetchJSON(url, options, retries - 1);
    }
    if (timedOut) throw new Error("The request timed out. Check your internet connection and try again.");
    if (networkDown) throw new Error("Could not reach the server. Check your internet connection.");
    throw err;
  }
}

const formatDate = (iso, month = "short") =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month,
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

const todayISO = () => new Date().toLocaleDateString("en-CA");

function showError(container, message, onRetry) {
  container.innerHTML = `
    <div class="app-error">
      <i class="fas fa-triangle-exclamation text-2xl text-yellow-400 mb-3"></i>
      <p class="font-semibold mb-1">Something went wrong</p>
      <p class="text-sm text-slate-400 mb-4">${esc(message)}</p>
      <button type="button" class="retry-btn px-4 py-2 bg-blue-500 rounded-xl hover:bg-blue-600 transition-colors font-semibold text-sm">
        <i class="fas fa-rotate-right mr-2"></i>Try again
      </button>
    </div>`;
  container.querySelector(".retry-btn").addEventListener("click", onRetry);
}

const navLinks = document.querySelectorAll(".nav-link");
const sections = document.querySelectorAll(".app-section");
const sidebar = $("sidebar");

const ACTIVE_CLASSES = ["bg-blue-500/10", "text-blue-400"];
const IDLE_CLASSES = ["text-slate-300", "hover:bg-slate-800"];

function showSection(name) {
  sections.forEach((s) => s.classList.toggle("hidden", s.dataset.section !== name));

  navLinks.forEach((link) => {
    const active = link.dataset.section === name;
    link.classList.remove(...(active ? IDLE_CLASSES : ACTIVE_CLASSES));
    link.classList.add(...(active ? ACTIVE_CLASSES : IDLE_CLASSES));
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeSidebar() {
  sidebar.classList.remove("sidebar-open");
  document.querySelector(".sidebar-overlay")?.remove();
}

function openSidebar() {
  sidebar.classList.add("sidebar-open");
  const overlay = document.createElement("div");
  overlay.className = "sidebar-overlay";
  overlay.addEventListener("click", closeSidebar);
  document.body.appendChild(overlay);
}

navLinks.forEach((link) =>
  link.addEventListener("click", (e) => {
    e.preventDefault();
    showSection(link.dataset.section);
    closeSidebar();
  }),
);

$("sidebar-toggle").addEventListener("click", () =>
  sidebar.classList.contains("sidebar-open") ? closeSidebar() : openSidebar(),
);

const apodDateInput = $("apod-date-input");
const apodContainer = $("apod-image-container");
const apodImage = $("apod-image");
const apodLoading = $("apod-loading");

function syncDateLabel(iso) {
  apodDateInput.value = iso;
  apodDateInput.parentElement.dataset.date = formatDate(iso);
}

function renderApodMedia(data) {
  apodContainer.querySelector("#apod-video")?.remove();

  if (data.media_type === "video") {
    apodImage.classList.add("hidden");
    const frame = document.createElement("iframe");
    frame.id = "apod-video";
    frame.src = data.url;
    frame.title = data.title;
    frame.className = "w-full h-full";
    frame.allowFullscreen = true;
    apodContainer.prepend(frame);
  } else {
    apodImage.classList.remove("hidden");
    apodImage.src = data.url;
    apodImage.alt = data.title;
  }
}

function renderApod(data) {
  syncDateLabel(data.date);
  $("apod-date").textContent = `Astronomy Picture of the Day - ${formatDate(data.date, "long")}`;
  $("apod-title").textContent = data.title;
  $("apod-date-detail").innerHTML = `<i class="far fa-calendar mr-2"></i>${esc(data.date)}`;
  $("apod-explanation").textContent = data.explanation;
  $("apod-copyright").innerHTML = `&copy; ${esc(data.copyright?.replace(/\n/g, " ").trim() || "NASA")}`;
  $("apod-date-info").textContent = data.date;
  $("apod-media-type").textContent = data.media_type === "video" ? "Video" : "Image";

  const fullRes = $("apod-fullres-btn");
  fullRes.onclick = () => window.open(data.hdurl || data.url, "_blank", "noopener");
  fullRes.parentElement.parentElement.classList.toggle("hidden", data.media_type === "video");

  renderApodMedia(data);
}

async function loadApod(date) {
  apodLoading.classList.remove("hidden");
  apodImage.classList.add("hidden");
  apodContainer.querySelector("#apod-video")?.remove();
  apodContainer.querySelector(".app-error")?.remove();

  try {
    const params = new URLSearchParams({ api_key: NASA_API_KEY });
    if (date) params.set("date", date);
    const data = await fetchJSON(`${APOD_URL}?${params}`);
    renderApod(data);
  } catch (err) {
    const box = document.createElement("div");
    apodContainer.appendChild(box);
    showError(box, err.message, () => {
      box.remove();
      loadApod(date);
    });
  } finally {
    apodLoading.classList.add("hidden");
  }
}

$("load-date-btn").addEventListener("click", () => loadApod(apodDateInput.value));
$("today-apod-btn").addEventListener("click", () => loadApod());
apodDateInput.addEventListener("change", () => syncDateLabel(apodDateInput.value));

let launches = [];

function statusClass(abbrev = "") {
  const key = abbrev.toLowerCase();
  if (key === "go" || key === "success") return "status-go";
  if (key === "tbc") return "status-tbc";
  if (key === "tbd") return "status-tbd";
  if (key === "hold") return "status-hold";
  if (key.includes("fail")) return "status-fail";
  return "status-other";
}

function launchImage(l) {
  const img = typeof l.image === "string" ? l.image : l.image?.image_url || l.image?.thumbnail_url;
  return img || LAUNCH_PLACEHOLDER;
}

function launchWhen(l) {
  const d = new Date(l.net);
  const precision = (l.net_precision?.name || "").toLowerCase();
  if (precision === "month" || precision === "year") {
    const opts = precision === "year" ? { year: "numeric" } : { month: "long", year: "numeric" };
    return { date: d.toLocaleDateString("en-US", { ...opts, timeZone: "UTC" }), time: "TBD" };
  }
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }),
    time: `${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`,
  };
}

function launchPlace(l) {
  const loc = l.pad?.location;
  const country = loc?.country?.alpha_3_code || loc?.country?.name || loc?.country_code || "N/A";
  return { place: l.pad?.location?.name || l.pad?.name || "Unknown", country };
}

function countdown(net) {
  const diff = new Date(net) - Date.now();
  if (diff <= 0) return { value: "Now", label: "Launch Window Open" };
  const days = Math.floor(diff / 864e5);
  if (days >= 1) return { value: days, label: days === 1 ? "Day Until Launch" : "Days Until Launch" };
  const hours = Math.max(1, Math.floor(diff / 36e5));
  return { value: hours, label: hours === 1 ? "Hour Until Launch" : "Hours Until Launch" };
}

const providerName = (l) => l.launch_service_provider?.name || "Unknown";
const rocketName = (l) => l.rocket?.configuration?.full_name || l.rocket?.configuration?.name || "Unknown";

function featuredLaunchHTML(l) {
  const when = launchWhen(l);
  const { place, country } = launchPlace(l);
  const cd = countdown(l.net);
  const desc = l.mission?.description || "No mission description available yet.";
  const infoBox = (icon, label, value) => `
    <div class="bg-slate-900/50 rounded-xl p-4">
      <p class="text-xs text-slate-400 mb-1 flex items-center gap-2"><i class="fas ${icon}"></i>${label}</p>
      <p class="font-semibold text-sm">${esc(value)}</p>
    </div>`;

  return `
    <div class="relative bg-slate-800/30 border border-slate-700 rounded-3xl overflow-hidden group hover:border-blue-500/50 transition-all">
      <div class="relative grid grid-cols-1 lg:grid-cols-2 gap-6 p-8">
        <div class="flex flex-col justify-between">
          <div>
            <div class="flex items-center gap-3 mb-4">
              <span class="px-4 py-1.5 bg-blue-500/20 text-blue-400 rounded-full text-sm font-semibold flex items-center gap-2">
                <i class="fas fa-star"></i>Featured Launch
              </span>
              <span class="status-badge status-soft ${statusClass(l.status?.abbrev)}">${esc(l.status?.abbrev || "N/A")}</span>
            </div>
            <h3 class="text-3xl font-bold mb-3 leading-tight">${esc(l.name)}</h3>
            <div class="flex flex-col xl:flex-row xl:items-center gap-4 mb-6 text-slate-400">
              <div class="flex items-center gap-2"><i class="fas fa-building"></i><span>${esc(providerName(l))}</span></div>
              <div class="flex items-center gap-2"><i class="fas fa-rocket"></i><span>${esc(rocketName(l))}</span></div>
            </div>
            <div class="inline-flex items-center gap-3 px-6 py-3 bg-linear-to-r from-blue-500/20 to-purple-500/20 rounded-xl mb-6">
              <i class="fas fa-clock text-2xl text-blue-400"></i>
              <div>
                <p class="text-2xl font-bold text-blue-400">${esc(cd.value)}</p>
                <p class="text-xs text-slate-400">${esc(cd.label)}</p>
              </div>
            </div>
            <div class="grid xl:grid-cols-2 gap-4 mb-6">
              ${infoBox("fa-calendar", "Launch Date", when.date)}
              ${infoBox("fa-clock", "Launch Time", when.time)}
              ${infoBox("fa-map-marker-alt", "Location", place)}
              ${infoBox("fa-globe", "Country", country)}
            </div>
            <p class="text-slate-300 leading-relaxed mb-6 line-clamp-2">${esc(desc)}</p>
          </div>
          <div class="flex flex-col md:flex-row gap-3">
            <button data-launch-id="${esc(l.id)}" class="flex-1 self-start md:self-center px-6 py-3 bg-blue-500 rounded-xl hover:bg-blue-600 transition-colors font-semibold flex items-center justify-center gap-2">
              <i class="fas fa-info-circle"></i>View Full Details
            </button>
          </div>
        </div>
        <div class="relative">
          <div class="relative h-full min-h-[400px] rounded-2xl overflow-hidden bg-slate-900/50">
            <img src="${esc(launchImage(l))}" alt="${esc(l.name)}" class="absolute inset-0 w-full h-full object-cover"
                 onerror="this.onerror=null;this.src='${LAUNCH_PLACEHOLDER}'" />
            <div class="absolute inset-0 bg-linear-to-t from-slate-900 via-transparent to-transparent"></div>
          </div>
        </div>
      </div>
    </div>`;
}

function launchCardHTML(l) {
  const when = launchWhen(l);
  const { place } = launchPlace(l);
  const row = (icon, text, extra = "") => `
    <div class="flex items-center gap-2 text-sm">
      <i class="fas ${icon} text-slate-500 w-4"></i>
      <span class="text-slate-300 ${extra}">${esc(text)}</span>
    </div>`;

  return `
    <div data-launch-id="${esc(l.id)}" class="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden hover:border-blue-500/30 transition-all group cursor-pointer">
      <div class="relative h-48 bg-slate-900/50 flex items-center justify-center overflow-hidden">
        <img src="${esc(launchImage(l))}" alt="${esc(l.name)}" loading="lazy" class="w-full h-full object-cover"
             onerror="this.onerror=null;this.src='${LAUNCH_PLACEHOLDER}'" />
        <div class="absolute top-3 right-3">
          <span class="status-badge status-solid ${statusClass(l.status?.abbrev)}">${esc(l.status?.abbrev || "N/A")}</span>
        </div>
      </div>
      <div class="p-5">
        <div class="mb-3">
          <h4 class="font-bold text-lg mb-2 line-clamp-2 group-hover:text-blue-400 transition-colors">${esc(l.name)}</h4>
          <p class="text-sm text-slate-400 flex items-center gap-2"><i class="fas fa-building text-xs"></i>${esc(providerName(l))}</p>
        </div>
        <div class="space-y-2 mb-4">
          ${row("fa-calendar", when.date)}
          ${row("fa-clock", when.time)}
          ${row("fa-rocket", l.rocket?.configuration?.name || rocketName(l))}
          ${row("fa-map-marker-alt", place, "line-clamp-1")}
        </div>
        <div class="flex items-center gap-2 pt-4 border-t border-slate-700">
          <button data-launch-id="${esc(l.id)}" class="flex-1 px-4 py-2 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors text-sm font-semibold">Details</button>
        </div>
      </div>
    </div>`;
}

async function fetchLaunches() {
  let lastError;
  for (const url of LAUNCHES_URLS) {
    try {
      return (await fetchJSON(url, {}, 0)).results;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function loadLaunches() {
  const featured = $("featured-launch");
  const grid = $("launches-grid");
  featured.innerHTML = `<div class="app-loading"><i class="fas fa-spinner fa-spin text-3xl text-blue-400 mb-3"></i><p class="text-slate-400">Loading upcoming launches...</p></div>`;
  grid.innerHTML = "";

  try {
    launches = await fetchLaunches();
    if (!launches.length) throw new Error("No upcoming launches found.");

    featured.innerHTML = featuredLaunchHTML(launches[0]);
    grid.innerHTML = launches.slice(1).map(launchCardHTML).join("");

    $("launches-count").textContent = `${launches.length} Launches`;
    $("launches-count-mobile").textContent = launches.length;
  } catch (err) {
    showError(featured, err.message, loadLaunches);
  }
}

function openLaunchModal(id) {
  const l = launches.find((x) => x.id === id);
  if (!l) return;
  const when = launchWhen(l);
  const { place, country } = launchPlace(l);
  const mission = l.mission;
  const video = l.vid_urls?.[0]?.url;
  const detail = (label, value) =>
    value
      ? `<div class="flex justify-between gap-4 py-2 border-b border-slate-700 text-sm"><span class="text-slate-400">${label}</span><span class="font-semibold text-right">${esc(value)}</span></div>`
      : "";

  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal-panel" role="dialog" aria-modal="true" aria-label="${esc(l.name)}">
      <div class="relative h-56 bg-slate-800">
        <img src="${esc(launchImage(l))}" alt="" class="w-full h-full object-cover" onerror="this.onerror=null;this.src='${LAUNCH_PLACEHOLDER}'" />
        <button type="button" class="modal-close w-10 h-10 absolute top-3 right-3 bg-slate-900/80 rounded-lg hover:bg-slate-700 transition-colors" aria-label="Close"><i class="fas fa-xmark"></i></button>
      </div>
      <div class="p-6">
        <div class="flex items-center gap-3 mb-3">
          <span class="status-badge status-soft ${statusClass(l.status?.abbrev)}">${esc(l.status?.name || l.status?.abbrev || "N/A")}</span>
        </div>
        <h3 class="text-2xl font-bold mb-2">${esc(l.name)}</h3>
        <p class="text-slate-300 leading-relaxed mb-5">${esc(mission?.description || l.status?.description || "No description available.")}</p>
        ${detail("Provider", providerName(l))}
        ${detail("Rocket", rocketName(l))}
        ${detail("Mission", mission?.name)}
        ${detail("Mission Type", mission?.type)}
        ${detail("Orbit", mission?.orbit?.name)}
        ${detail("Date", when.date)}
        ${detail("Time", when.time)}
        ${detail("Launch Pad", l.pad?.name)}
        ${detail("Location", `${place}${country !== "N/A" ? ` (${country})` : ""}`)}
        ${l.probability != null ? detail("Launch Probability", `${l.probability}%`) : ""}
        ${video ? `<a href="${esc(video)}" target="_blank" rel="noopener noreferrer" class="mt-5 w-full py-3 bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors font-semibold flex items-center justify-center gap-2"><i class="fas fa-play"></i>Watch Live / Video</a>` : ""}
      </div>
    </div>`;

  const close = () => {
    modal.remove();
    document.removeEventListener("keydown", onKey);
    document.body.classList.remove("modal-open");
  };
  const onKey = (e) => e.key === "Escape" && close();

  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.closest(".modal-close")) close();
  });
  document.addEventListener("keydown", onKey);
  document.body.classList.add("modal-open");
  document.body.appendChild(modal);
}

["featured-launch", "launches-grid"].forEach((id) =>
  $(id).addEventListener("click", (e) => {
    const target = e.target.closest("[data-launch-id]");
    if (target) openLaunchModal(target.dataset.launchId);
  }),
);

const PLANET_META = {
  mercury: {
    type: "Terrestrial", badge: "type-orange",
    description: "Mercury is the smallest planet in the Solar System and the closest to the Sun. It has almost no atmosphere, so its surface is covered in craters and swings between extreme heat and freezing cold.",
    facts: ["A solar day (sunrise to sunrise) lasts about 176 Earth days", "Has no moons and almost no atmosphere", "Temperatures swing from about -180°C to 430°C", "Its heavily cratered surface looks a lot like our Moon"],
  },
  venus: {
    type: "Terrestrial", badge: "type-orange",
    description: "Venus is the hottest planet in the Solar System, wrapped in a thick carbon-dioxide atmosphere that traps heat. It is similar to Earth in size, but its surface is a crushing, volcanic inferno.",
    facts: ["Hottest planet: about 465°C on the surface", "Spins backwards compared to most planets", "A day on Venus is longer than its year", "Atmospheric pressure is about 90 times Earth's"],
  },
  earth: {
    type: "Terrestrial", badge: "type-blue",
    description: "Earth is the third planet from the Sun and the only astronomical object known to harbor life. About 71% of its surface is covered with water, mostly oceans, while the rest is continents and islands.",
    facts: ["Only known planet with liquid water on its surface", "Atmosphere is about 78% nitrogen and 21% oxygen", "Magnetic field protects us from the solar wind", "Formed about 4.54 billion years ago"],
  },
  mars: {
    type: "Terrestrial", badge: "type-red",
    description: "Mars is a cold desert world with a thin carbon-dioxide atmosphere. Iron oxide on its surface gives it the red color that earned it the name the Red Planet, and robots have been exploring it for decades.",
    facts: ["Home to Olympus Mons, the tallest volcano known in the Solar System", "Has two small moons: Phobos and Deimos", "A day lasts about 24 hours and 37 minutes", "Polar ice caps are made of water and frozen CO₂"],
  },
  jupiter: {
    type: "Gas Giant", badge: "type-purple",
    description: "Jupiter is the largest planet in the Solar System, a gas giant made mostly of hydrogen and helium. Its Great Red Spot is a storm that has raged for centuries.",
    facts: ["More massive than all the other planets combined", "Has the shortest day of any planet: about 10 hours", "The Great Red Spot is a storm wider than Earth", "Has a faint ring system and over 100 known moons"],
  },
  saturn: {
    type: "Gas Giant", badge: "type-yellow",
    description: "Saturn is a gas giant best known for its spectacular ring system made of ice and rock. It is the least dense planet in the Solar System.",
    facts: ["Less dense than water, so it would float in a big enough ocean", "Its rings are made mostly of water-ice particles", "Has a strange hexagon-shaped storm at its north pole", "Its moon Titan is bigger than the planet Mercury"],
  },
  uranus: {
    type: "Ice Giant", badge: "type-cyan",
    description: "Uranus is an ice giant that rotates on its side, tilted about 98 degrees. Methane in its atmosphere gives it a pale blue-green color.",
    facts: ["Rotates on its side, almost rolling along its orbit", "First planet discovered with a telescope (1781)", "Has the coldest planetary atmosphere, about -224°C", "Has 13 known rings"],
  },
  neptune: {
    type: "Ice Giant", badge: "type-blue",
    description: "Neptune is the farthest planet from the Sun: a dark, cold and very windy ice giant. It was found in 1846 thanks to mathematical predictions before anyone saw it.",
    facts: ["Winds reach over 2,000 km/h, the fastest in the Solar System", "First planet located by math rather than observation", "One orbit around the Sun takes about 165 Earth years", "Its largest moon, Triton, orbits backwards"],
  },
};

let planets = {};
let selectedPlanet = "earth";

const orbitText = (days) => (days >= 1000 ? `${fmt(days / 365.25, 1)} years` : `${fmt(days, 1)} days`);
const rotationText = (hours) => {
  const h = Math.abs(hours);
  return h > 48 ? `${fmt(h / 24, 1)} days` : `${fmt(h, 2)} hours`;
};
const millionKm = (km) => `${fmt(km / 1e6, 1)}M km`;
const massKg = (m) => (m ? m.massValue * 10 ** m.massExponent : 0);

function renderPlanetDetails(id) {
  const p = planets[id];
  const meta = PLANET_META[id];
  if (!p || !meta) return;
  selectedPlanet = id;

  document.querySelectorAll(".planet-card").forEach((c) =>
    c.classList.toggle("planet-card-active", c.dataset.planetId === id),
  );

  const name = p.englishName;
  const img = $("planet-detail-image");
  img.src = `./assets/images/${id}.png`;
  img.alt = `${name} planet`;
  $("planet-detail-name").textContent = name;
  $("planet-detail-description").textContent = meta.description;

  $("planet-distance").textContent = millionKm(p.semimajorAxis);
  $("planet-radius").textContent = `${fmt(p.meanRadius)} km`;
  $("planet-mass").textContent = p.mass ? `${fmt(p.mass.massValue, 2)} × 10${toSup(p.mass.massExponent)} kg` : "N/A";
  $("planet-density").textContent = `${fmt(p.density, 2)} g/cm³`;
  $("planet-orbital-period").textContent = orbitText(p.sideralOrbit);
  $("planet-rotation").textContent = rotationText(p.sideralRotation);
  $("planet-moons").textContent = p.moons?.length ?? 0;
  $("planet-gravity").textContent = `${fmt(p.gravity, 1)} m/s²`;

  $("planet-discoverer").textContent = p.discoveredBy || "Known since antiquity";
  $("planet-discovery-date").textContent = p.discoveryDate || "Ancient";
  $("planet-body-type").textContent = p.bodyType || "Planet";
  $("planet-volume").textContent = p.vol ? `${fmt(p.vol.volValue, 2)} × 10${toSup(p.vol.volExponent)} km³` : "N/A";

  $("planet-perihelion").textContent = millionKm(p.perihelion);
  $("planet-aphelion").textContent = millionKm(p.aphelion);
  $("planet-eccentricity").textContent = fmt(p.eccentricity, 4);
  $("planet-inclination").textContent = `${fmt(p.inclination, 2)}°`;
  $("planet-axial-tilt").textContent = `${fmt(p.axialTilt, 2)}°`;
  $("planet-temp").textContent = `${fmt(p.avgTemp - 273.15)}°C`;
  $("planet-escape").textContent = `${fmt(p.escape / 1000, 1)} km/s`;

  $("planet-facts").innerHTML = meta.facts
    .map(
      (f) => `<li class="flex items-start"><i class="fas fa-check text-green-400 mt-1 mr-2"></i><span class="text-slate-300">${esc(f)}</span></li>`,
    )
    .join("");
}

function renderComparisonTable() {
  const colorOf = (id) =>
    document.querySelector(`.planet-card[data-planet-id="${id}"]`)?.style.getPropertyValue("--planet-color") || "#64748b";
  const cell = "px-4 md:px-6 py-3 md:py-4 text-slate-300 text-sm md:text-base whitespace-nowrap";

  $("planet-comparison-tbody").innerHTML = Object.keys(PLANET_META)
    .filter((id) => planets[id])
    .map((id) => {
      const p = planets[id];
      const meta = PLANET_META[id];
      return `
        <tr class="hover:bg-slate-800/30 transition-colors">
          <td class="px-4 md:px-6 py-3 md:py-4 sticky left-0 bg-slate-800 z-10">
            <div class="flex items-center space-x-2 md:space-x-3">
              <div class="w-6 h-6 md:w-8 md:h-8 rounded-full flex-shrink-0" style="background-color: ${colorOf(id)}"></div>
              <span class="font-semibold text-sm md:text-base whitespace-nowrap">${esc(p.englishName)}</span>
            </div>
          </td>
          <td class="${cell}">${fmt(p.semimajorAxis / AU_KM, 2)}</td>
          <td class="${cell}">${fmt(p.meanRadius * 2)}</td>
          <td class="${cell}">${fmt(massKg(p.mass) / EARTH_MASS_KG, 3)}</td>
          <td class="${cell}">${orbitText(p.sideralOrbit)}</td>
          <td class="${cell}">${p.moons?.length ?? 0}</td>
          <td class="px-4 md:px-6 py-3 md:py-4 whitespace-nowrap">
            <span class="px-2 py-1 rounded text-xs ${meta.badge}">${meta.type}</span>
          </td>
        </tr>`;
    })
    .join("");
}

async function loadPlanets() {
  document.querySelector(".planets-error")?.remove();
  try {
    const response = await fetchJSON(SOLAR_URL);
    const all = Array.isArray(response) ? response : response.bodies || response.planets || [];
    const bodies = all.filter((b) => b.isPlanet);

    planets = {};
    bodies.forEach((b) => (planets[b.englishName.toLowerCase()] = b));

    document.querySelectorAll(".planet-card").forEach((card) => {
      const p = planets[card.dataset.planetId];
      if (p) card.querySelector("p").textContent = `${fmt(p.semimajorAxis / AU_KM, 2)} AU`;
    });

    renderComparisonTable();
    renderPlanetDetails(selectedPlanet);
  } catch (err) {
    const box = document.createElement("div");
    box.className = "planets-error mb-6";
    $("planets-grid").before(box);
    showError(box, err.message, loadPlanets);
  }
}

$("planets-grid").addEventListener("click", (e) => {
  const card = e.target.closest(".planet-card");
  if (card) renderPlanetDetails(card.dataset.planetId);
});

apodDateInput.max = todayISO();
syncDateLabel(todayISO());
showSection("today-in-space");

loadApod();
loadLaunches();
loadPlanets();
