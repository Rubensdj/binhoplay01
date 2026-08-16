import Hero from "../components/Hero";
import InstallGuide from "../components/InstallGuide";
import { LogoMarquee } from "../components/LogoMarquee";
import Footer from "../components/Footer";
import type { Route } from "../lib/router";

export default function HomePage({ navigate }: { navigate: (route: Route) => void }) {
  return (
    <>
      <Hero navigate={navigate} />
      <LogoMarquee />
      <InstallGuide />
      <Footer />
    </>
  );
}
