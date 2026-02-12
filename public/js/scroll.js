window.addEventListener("scroll", function() {
  const header = document.getElementById("siteHeader");
  const navLogo = document.getElementById("navLogo");
  const scrollPosition = window.scrollY;

  if (header) {
    if (scrollPosition > 50) {
      header.classList.add("scrolled");
      if (navLogo) {
        navLogo.classList.add("visible");
        navLogo.classList.remove("hidden");
      }
    } else {
      header.classList.remove("scrolled");
      if (navLogo) {
        navLogo.classList.add("hidden");
        navLogo.classList.remove("visible");
      }
    }
  } else {
    console.error("Site header with ID 'siteHeader' not found.");
  }
});

// Ensure initial state is set on load
document.addEventListener("DOMContentLoaded", () => {
  const navLogo = document.getElementById("navLogo");
  const header = document.getElementById("siteHeader");
  if (navLogo && header && window.scrollY <= 50) {
    navLogo.classList.add("hidden");
  } else if (navLogo && header && window.scrollY > 50) {
    navLogo.classList.add("visible");
    header.classList.add("scrolled"); // Also ensure header has scrolled class if page loads scrolled
  }
});