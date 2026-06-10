import Link from "next/link";
import { CircleDotDashed } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="border-b border-[#d8dfda] bg-white/90">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-sm font-semibold"
          aria-label="Cerno home"
        >
          <span className="grid size-8 place-items-center rounded-[6px] bg-[#17211d] text-white">
            <CircleDotDashed size={17} strokeWidth={1.8} />
          </span>
          CERNO
        </Link>
        <span className="hidden text-xs font-medium text-[#64706a] sm:block">
          Analysis that turns into practice
        </span>
      </div>
    </header>
  );
}
