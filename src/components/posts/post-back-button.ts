document.querySelectorAll<HTMLAnchorElement>("[data-post-back]").forEach((link) => {
  if (link.dataset.initialized) return;
  link.dataset.initialized = "true";

  link.addEventListener("click", (event) => {
    if (!document.referrer || history.length <= 1) return;

    const referrer = new URL(document.referrer);
    if (referrer.origin !== window.location.origin) return;

    event.preventDefault();
    history.back();
  });
});
