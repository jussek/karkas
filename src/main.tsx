import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App() {
  return (
    <main className="page-shell">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Настольная стратегия</p>
        <h1 id="page-title">Каркассон онлайн</h1>
        <p className="lead">
          Игровой движок готов. Скоро здесь можно будет строить города, прокладывать
          дороги и собирать друзей за одной картой.
        </p>
        <div className="status" role="status">
          <span className="status-dot" aria-hidden="true" />
          Проект готов к следующему этапу
        </div>
      </section>
    </main>
  );
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element was not found");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
