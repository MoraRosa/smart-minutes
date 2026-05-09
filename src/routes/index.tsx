import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import CondoBoardApp from "@/components/CondoBoardApp";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Condo Board Minutes — AI Generator" },
      { name: "description", content: "Paste a meeting transcript and get formatted condo board minutes — runs entirely in your browser with WebLLM." },
    ],
  }),
});

function Index() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div style={{ minHeight: "100vh", background: "#F0F3F8", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: "#4A5568" }}>
        Loading…
      </div>
    );
  }
  return <CondoBoardApp />;
}
