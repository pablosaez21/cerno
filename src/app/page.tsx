import { FolioPage } from "@/folio/folio-page";

// The Folio interface is plain CSS and scripts in public/folio (see src/folio/host.ts),
// so its stylesheets and fonts are linked here rather than imported.
/* eslint-disable @next/next/no-page-custom-font, @next/next/no-css-tags */
export default function Home() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        precedence="default"
        href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300..700;1,8..60,300..700&family=Funnel+Sans:wght@400..600&family=IBM+Plex+Mono:wght@400;500&display=swap"
      />
      <link rel="stylesheet" precedence="default" href="folio/styles.css" />
      <link rel="stylesheet" precedence="default" href="folio/figurines.css" />
      <FolioPage />
    </>
  );
}
