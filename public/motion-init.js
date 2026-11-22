(() => {
  const root = document.documentElement;
  // Remove any pending marker left by the retired page transition.
  try { sessionStorage.removeItem('portfolio-curtain'); } catch {}
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (root.dataset.home === 'true' && !location.hash) root.classList.add('hero-intro-pending');
  setTimeout(() => root.classList.remove('hero-intro-pending'), 2500);
})();
