import type { Metadata } from "next";
import { Archivo, Big_Shoulders, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SupportWidget } from "@/components/support-widget";
import { getSession } from "@/lib/auth";

const bigShoulders = Big_Shoulders({
  subsets: ["latin"],
  variable: "--font-big-shoulders",
  weight: ["700", "800", "900"],
});
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", weight: ["400", "500", "600", "700"] });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "BodyTag — sell every sellable inch of your event",
    template: "%s · BodyTag",
  },
  description:
    "Map numbered sponsor slots onto a photo or 3D model of your event's walking billboard, publish one live link, and let brands buy or take over placements — vetted, tracked, and paid out without the DM spreadsheet.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  return (
    <html
      lang="en"
      className={`${bigShoulders.variable} ${archivo.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-ink text-paper">
        {/*
          THESIS: The walking billboard is a liveried race panel — numbered sponsor zones sold by
          position value, priced and stated with pit-lane precision. Refuses the generic
          hero-plus-feature-grid B2B template.
          OWN-WORLD: Graphite ink / paddock paper / one committed Pit Orange accent, Flag Red
          reserved only for live-sold states. Big Shoulders condensed display, Archivo UI sans,
          JetBrains Mono for every number. Roundel slot badges, one hazard pinstripe per section
          break, carbon-weave dark chrome, pit-board data readouts.
          STORY: A creator sees, in one viewport, that their event has real numbered ad zones,
          live pricing, and vetted brand demand — then starts a campaign.
          FORM: Pit Wall — grounded direction 1 (motorsport pit-lane livery) of 7, user-picked
          over the assigned index 3 ("Sponsorship media kit"); seed key 854ed057.
          FINISH: unreviewed and undocumented is unfinished; this build ends with the finish
          review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
        */}
        <SiteHeader session={session} />
        <div className="flex-1">{children}</div>
        <SiteFooter />
        <SupportWidget />
      </body>
    </html>
  );
}
