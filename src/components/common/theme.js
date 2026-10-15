(() => {
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const preferences = ["system", "light", "dark"];

  let preference = "system";
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") preference = stored;
  } catch {
    // Storage may be unavailable. Keep the system preference.
  }

  const apply = () => {
    const isDark =
      preference === "dark" || (preference === "system" && media.matches);
    root.dataset.theme = isDark ? "dark" : "light";
    root.dataset.themePreference = preference;
  };

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest("[data-theme-toggle]")) return;

    preference =
      preferences[(preferences.indexOf(preference) + 1) % preferences.length];
    apply();
    try {
      if (preference === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", preference);
    } catch {
      // Keep the active preference when persistence fails.
    }
  });

  media.addEventListener("change", () => {
    if (preference === "system") apply();
  });

  apply();
})();
