"use client"

export default function Home() {
  return (
    <main className="bg-[#0a0a0a] text-[#f0ede8] min-h-screen">

      {/* NAVBAR */}
      <nav className="fixed top-0 w-full flex justify-between items-center px-6 py-4 border-b border-white/10 backdrop-blur bg-black/60 z-50">
        <div className="flex items-center gap-2 font-bold text-lg">
          <div className="w-2 h-2 bg-[#e8ff47] rounded-full"></div>
          PriceHound
        </div>

        <div className="hidden md:flex gap-8 text-sm text-gray-400">
          <a href="#features" className="hover:text-white">Features</a>
          <a href="#how" className="hover:text-white">How it works</a>
          <a href="#preview" className="hover:text-white">Preview</a>
        </div>

        <button className="bg-[#e8ff47] text-black px-4 py-2 text-sm font-medium rounded">
          Get Access →
        </button>
      </nav>

      {/* HERO */}
      <section className="min-h-screen flex items-center px-6 pt-28 pb-20">
        <div className="max-w-4xl">
          <div className="text-xs border border-[#e8ff47]/30 text-[#e8ff47] px-3 py-1 inline-flex items-center gap-2 mb-6">
            <span className="w-2 h-2 bg-[#e8ff47] rounded-full"></span>
            PRICE INTELLIGENCE PLATFORM
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold leading-tight">
            Never overpay
            <br />
            <span className="text-transparent stroke-white/30 [text-stroke:1px]">
              for anything
            </span>
            <span className="text-[#e8ff47]"> ever.</span>
          </h1>

          <p className="mt-6 text-gray-400 max-w-lg">
            PriceHound watches your favourite products 24/7 and notifies you
            when prices drop below your target.
          </p>

          <div className="mt-8 flex gap-4">
            <button className="bg-[#e8ff47] text-black px-6 py-3 font-medium">
              Start Tracking
            </button>
            <button className="border border-white/20 px-6 py-3 text-gray-300">
              See Demo →
            </button>
          </div>
        </div>
      </section>

      {/* TICKER */}
      <div className="border-y border-white/10 py-4 overflow-hidden bg-[#111]">
        <div className="flex gap-10 animate-[scroll_20s_linear_infinite] whitespace-nowrap text-sm text-gray-400">
          <span>Sony WH-1000XM5 ↓ ₹3,200</span>
          <span>AirPods Pro ↓ ₹1,800</span>
          <span>Galaxy S24 ↑ ₹500</span>
          <span>LG Monitor ↓ ₹4,100</span>
          <span>Kindle ↓ ₹890</span>
        </div>
      </div>

      {/* FEATURES */}
      <section id="features" className="py-24 px-6">
        <h2 className="text-4xl font-bold mb-12">
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
              <p className="text-sm text-gray-500 mb-2">
                0{i + 1}
              </p>
              <h3 className="text-lg font-semibold mb-2">{f}</h3>
              <p className="text-gray-400 text-sm">
                Track and monitor product prices with ease and precision.
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="py-24 px-6 bg-[#111]">
        <h2 className="text-4xl font-bold mb-12">
          Four steps to
          <br />
          never miss a deal.
        </h2>

        <div className="grid md:grid-cols-4 gap-6">
          {[
            "Sign in with Google",
            "Paste product URL",
            "Set target price",
            "Get notified",
          ].map((step, i) => (
            <div key={i} className="space-y-3">
              <div className="border border-white/20 w-12 h-12 flex items-center justify-center text-gray-400">
                0{i + 1}
              </div>
              <h3 className="font-semibold">{step}</h3>
              <p className="text-sm text-gray-400">
                Simple step to get started quickly.
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* PREVIEW */}
      <section id="preview" className="py-24 px-6">
        <h2 className="text-4xl font-bold mb-12">
          Your dashboard,
          <br />
          beautifully simple.
        </h2>

        <div className="border border-white/10 bg-[#141414] p-6">
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div className="border border-white/10 p-4">
              <p className="text-xs text-gray-500">CURRENT PRICE</p>
              <p className="text-xl text-[#e8ff47]">₹24,990</p>
            </div>
            <div className="border border-white/10 p-4">
              <p className="text-xs text-gray-500">TARGET</p>
              <p className="text-xl">₹22,000</p>
            </div>
            <div className="border border-white/10 p-4">
              <p className="text-xs text-gray-500">LOWEST</p>
              <p className="text-xl text-green-400">₹21,490</p>
            </div>
          </div>

          <div className="h-40 bg-[#111] flex items-center justify-center text-gray-500">
            Chart Preview (Recharts later)
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 text-center">
        <h2 className="text-5xl font-bold mb-6">
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
          <button className="bg-[#e8ff47] text-black px-6">
            Join →
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 px-6 py-6 flex flex-col md:flex-row justify-between items-center text-sm text-gray-500">
        <div className="flex items-center gap-2 font-bold text-white">
          <div className="w-2 h-2 bg-[#e8ff47] rounded-full"></div>
          PriceHound
        </div>

        <div>© 2026 PriceHound</div>

        <div className="flex gap-4">
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
        </div>
      </footer>
    </main>
  )
}