"use client";

import { useEffect } from "react";
import { bootFolio } from "./host";

let booted = false;

/** The shell the Folio scripts fill in (ids are theirs). React renders it once and never touches it again. */
export function FolioPage() {
  useEffect(() => {
    if (booted) return;
    booted = true;
    document.documentElement.dataset.board = "print";
    bootFolio().catch((e: Error) => {
      const main = document.getElementById("main");
      if (main) main.textContent = e.message;
    });
  }, []);
  return (
    <>
      <a className="skip" href="#main">
        Saltar al contenido
      </a>
      <aside className="ribbon" id="ribbon" />
      <div className="shell">
        <header className="runhead" id="runhead" />
        <div className="desk-head" id="deskhead" />
        <main id="main" tabIndex={-1} />
        <footer id="colophon" />
      </div>
      <nav className="dock" id="dock" aria-label="Libro" />
    </>
  );
}
