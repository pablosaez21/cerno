import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Cerno</h1>
      <p>La interfaz definitiva está pendiente. Mientras tanto:</p>
      <ul>
        <li>
          <Link href="/lab">Laboratorio de análisis</Link>
        </li>
        <li>
          <Link href="/review">Revisión de etiquetas</Link>
        </li>
      </ul>
    </main>
  );
}
