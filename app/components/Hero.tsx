// /app/components/Hero.tsx

export default function Hero() {
  return (
    <section className="text-center py-20 px-6">
      <h1 className="text-4xl md:text-6xl font-bold">
        Track Prices. Save Money.
      </h1>

      <p className="mt-6 text-gray-600 max-w-xl mx-auto">
        Get notified when your favorite products drop in price.
        Just paste a link and relax.
      </p>

      <div className="mt-8">
        <button className="bg-black text-white px-6 py-3 rounded-lg">
          Get Started Free
        </button>
      </div>
    </section>
  )
}