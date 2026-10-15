(() => {
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const preferences = ["system", "light", "dark"];

  const getPreference = () => {
    const stored = localStorage.getItem("theme");
    return stored === "light" || stored === "dark" ? stored : "system";
  };

  const apply = (preference) => {
    const isDark =
      preference === "dark" || (preference === "system" && media.matches);
    root.dataset.theme = isDark ? "dark" : "light";
    root.dataset.themePreference = preference;
  };

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest("[data-theme-toggle]")) return;

    const next =
      preferences[(preferences.indexOf(getPreference()) + 1) % preferences.length];
    if (next === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", next);
    apply(next);
  });

  media.addEventListener("change", () => {
    if (getPreference() === "system") apply("system");
  });

  apply(getPreference());
})();
