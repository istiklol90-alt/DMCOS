import { useLocation, useNavigate } from "react-router-dom";

// Sections of the public home page the menu scrolls to (Home.tsx ids).
export const SITE_SECTIONS = ["about", "destinations", "services", "why-us", "how-it-works"] as const;
export const SECTION_LABEL: Record<(typeof SITE_SECTIONS)[number], string> = {
  about: "site.nav.about",
  services: "site.nav.services",
  "why-us": "site.nav.why",
  destinations: "site.nav.destinations",
  "how-it-works": "site.nav.howItWorks",
};

// Scroll to a home-page section; from another page, go home first and let
// Home's own hash effect do the scrolling.
export function useGoToSection() {
  const navigate = useNavigate();
  const location = useLocation();
  return (id: string) => {
    if (location.pathname === "/") {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `/#${id}`);
    } else {
      navigate(`/#${id}`);
    }
  };
}
