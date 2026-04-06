"use client";

import { useEffect } from "react";

export default function Home() {
  const handleClick = (msg: string) => {
    alert(msg);
  };

  useEffect(() => {
    const cursor = document.getElementById("cursor")!;
    const ring = document.getElementById("cursor-ring")!;

    let mx = 0,
      my = 0;
    let rx = 0,
      ry = 0;

    const move = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      cursor.style.left = mx + "px";
      cursor.style.top = my + "px";
    };

    document.addEventListener("mousemove", move);

    const animate = () => {
      rx += (mx - rx) * 0.12;
      ry += (my - ry) * 0.12;

      ring.style.left = rx + "px";
      ring.style.top = ry + "px";

      requestAnimationFrame(animate);
    };

    animate();

    const elements = document.querySelectorAll("a, button, input");

    elements.forEach((el) => {
      el.addEventListener("mouseenter", () => {
        cursor.style.transform = "translate(-50%, -50%) scale(2.5)";
        ring.style.transform = "translate(-50%, -50%) scale(1.4)";
      });

      el.addEventListener("mouseleave", () => {
        cursor.style.transform = "translate(-50%, -50%) scale(1)";
        ring.style.transform = "translate(-50%, -50%) scale(1)";
      });
    });

    return () => {
      document.removeEventListener("mousemove", move);
    };
  }, []);

  return (
    <main className="bg-[#0a0a0a] text-[#f0ede8] min-h-screen font-body cursor-none">
      {/* 🔥 CUSTOM CURSOR */}
      <div
        id="cursor"
        className="fixed w-2.5 h-2.5 bg-[#e8ff47] rounded-full pointer-events-none z-[9999] -translate-x-1/2 -translate-y-1/2 mix-blend-difference"
      ></div>
      <div
        id="cursor-ring"
        className="fixed w-9 h-9 border border-[#e8ff47]/50 rounded-full pointer-events-none z-[9998] -translate-x-1/2 -translate-y-1/2"
      ></div>

      {/* NAVBAR */}
      <nav className="fixed top-0 w-full flex justify-between items-center px-6 py-4 border-b border-white/10 backdrop-blur bg-black/60 z-50">
        <div className="flex items-center gap-2 font-heading text-lg font-bold">
          <div className="w-2 h-2 bg-[#e8ff47] rounded-full"></div>
          PriceHound
        </div>

        <div className="hidden md:flex gap-8 text-sm text-gray-400 font-mono">
          <a href="#features" className="hover:text-white">
            Features
          </a>
          <a href="#how" className="hover:text-white">
            How it works
          </a>
          <a href="#preview" className="hover:text-white">
            Preview
          </a>
        </div>

        <button
          onClick={() => handleClick("Go to auth")}
          className="bg-[#e8ff47] text-black px-4 py-2 text-sm font-mono rounded hover:scale-105 transition"
        >
          Get Access →
        </button>
      </nav>

      {/* HERO */}
      <section className="relative min-h-screen flex items-center px-6 pt-28 pb-20 overflow-hidden">
        {/* 🔥 GRID BACKGROUND */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:60px_60px]" />
        </div>

        {/* 🔥 GLOW EFFECT */}
        <div className="absolute w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(232,255,71,0.08),transparent_70%)] top-20 left-1/2 -translate-x-1/2 z-0" />

        <div className="relative z-10 max-w-5xl">
          {/* TAG */}
          <div className="font-mono text-xs border border-[#e8ff47]/30 text-[#e8ff47] px-4 py-2 inline-flex items-center gap-2 mb-10 tracking-widest">
            <span className="w-2 h-2 bg-[#e8ff47] rounded-full"></span>
            PRICE INTELLIGENCE PLATFORM
          </div>

          {/* 🔥 HEADLINE */}
          <h1 className="font-heading tracking-tight leading-[0.95]">
            <span className="block text-6xl md:text-[110px] font-extrabold">
              Never overpay
            </span>

            {/* OUTLINE TEXT
            <span className="block text-6xl md:text-[110px] font-extrabold text-transparent stroke-white/20 [text-stroke:1px]">
              for anything
            </span> */}

            {/* HIGHLIGHT */}
            <span className="block text-6xl md:text-[110px] font-extrabold text-[#e8ff47] relative w-fit">
              ever.
              <span className="absolute bottom-2 left-0 w-full h-[4px] bg-[#e8ff47]" />
            </span>
          </h1>

          {/* SUBTEXT */}
          <p className="mt-10 text-gray-400 max-w-xl text-lg leading-relaxed font-body">
            PriceHound watches your favourite products 24/7 and hits your inbox
            the moment prices drop below your target.
          </p>

          {/* BUTTONS */}
          <div className="mt-10 flex gap-6">
            <button
              onClick={() => alert("Start tracking")}
              className="bg-[#e8ff47] text-black px-8 py-4 font-mono text-sm tracking-widest hover:scale-105 transition"
            >
              START TRACKING FREE
            </button>

            <button
              onClick={() => alert("Demo")}
              className="border border-white/20 px-8 py-4 font-mono text-sm tracking-widest text-gray-300 hover:bg-white/10 transition"
            >
              SEE A DEMO →
            </button>
          </div>
        </div>
      </section>

      {/* 🔥 INFINITE TICKER */}
      <div className="border-y border-white/10 py-4 overflow-hidden bg-[#111]">
        <div className="flex whitespace-nowrap animate-scroll gap-16 font-mono text-sm">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex gap-16 items-center">
              <div className="flex gap-2">
                <span>Sony WH-1000XM5</span>
                <span className="text-green-400 font-semibold">↓ ₹3,200</span>
              </div>

              <div className="flex gap-2">
                <span>AirPods Pro</span>
                <span className="text-green-400 font-semibold">↓ ₹1,800</span>
              </div>

              <div className="flex gap-2">
                <span>Galaxy S24</span>
                <span className="text-red-400 font-semibold">↑ ₹500</span>
              </div>

              <div className="flex gap-2">
                <span>LG Monitor</span>
                <span className="text-green-400 font-semibold">↓ ₹4,100</span>
              </div>

              <div className="flex gap-2">
                <span>Kindle</span>
                <span className="text-green-400 font-semibold">↓ ₹890</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FEATURES */}
      <section id="features" className="py-24 px-6">
        <h2 className="font-heading text-4xl tracking-tight mb-12">
          Everything you need
          <br />
          to track smarter.
        </h2>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            "Price Drop Alerts",
            "Price History Graphs",
            "Auto Scraping",
            "Gmail OAuth",
            "Analytics Dashboard",
            "Multi-Platform Support",
          ].map((f, i) => (
            <div
              key={i}
              className="border border-white/10 p-6 hover:bg-white/5 transition"
            >
              <p className="font-mono text-xs text-gray-500 mb-2">0{i + 1}</p>
              <h3 className="font-heading text-lg mb-2">{f}</h3>
              <p className="text-gray-400 text-sm">
                Track and monitor product prices with ease and precision.
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* PREVIEW */}
      <section id="preview" className="py-24 px-6">
        <h2 className="font-heading text-4xl tracking-tight mb-12">
          Your dashboard,
          <br />
          beautifully simple.
        </h2>

        <div className="border border-white/10 bg-[#141414] p-6">
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div className="border border-white/10 p-4">
              <p className="font-mono text-xs text-gray-500">CURRENT PRICE</p>
              <p className="text-xl text-[#e8ff47]">₹24,990</p>
            </div>

            <div className="border border-white/10 p-4">
              <p className="font-mono text-xs text-gray-500">TARGET</p>
              <p className="text-xl">₹22,000</p>
            </div>

            <div className="border border-white/10 p-4">
              <p className="font-mono text-xs text-gray-500">LOWEST</p>
              <p className="text-xl text-green-400">₹21,490</p>
            </div>
          </div>

          <div className="border border-white/10 bg-[#111] p-2 rounded-md shadow-[0_0_40px_rgba(232,255,71,0.05)]">
            <img
              src="/dashboardlanding.png"
              alt="Dashboard Preview"
              className="w-full h-auto rounded-md object-cover"
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 text-center">
        <h2 className="font-heading text-5xl tracking-tight mb-6">
          Ready to hunt
          <br />
          better prices?
        </h2>

        <p className="text-gray-400 mb-8">
          Join the waitlist. We’ll notify you when we launch.
        </p>

        <div className="flex justify-center max-w-md mx-auto">
          <input
            placeholder="your@email.com"
            className="flex-1 px-4 py-3 bg-[#111] border border-white/20 text-sm"
          />
          <button
            onClick={() => handleClick("Join waitlist")}
            className="bg-[#e8ff47] text-black px-6 font-mono hover:scale-105 transition"
          >
            Join →
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 px-6 py-6 flex flex-col md:flex-row justify-between items-center text-sm text-gray-500">
        <div className="flex items-center gap-2 font-heading text-white">
          <div className="w-2 h-2 bg-[#e8ff47] rounded-full"></div>
          PriceHound
        </div>

        <div>© 2026 PriceHound</div>

        <div className="flex gap-4 font-mono">
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
        </div>
      </footer>

      {/* 🔥 TICKER ANIMATION */}
      <style jsx global>{`
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-scroll {
          animation: scroll 20s linear infinite;
        }
      `}</style>
    </main>
  );
}
