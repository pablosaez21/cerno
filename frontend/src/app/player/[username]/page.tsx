import type { Metadata } from "next";
import { PlayerProfile } from "@/components/player-profile";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Player profile | Cerno",
};

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  return (
    <>
      <SiteHeader />
      <PlayerProfile username={decodeURIComponent(username)} />
    </>
  );
}
