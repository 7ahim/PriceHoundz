// /app/components/Features.tsx

export default function Features() {
  const features = [
    "Track product prices automatically",
    "Set your desired price alerts",
    "Visualize price trends with charts",
    "Get notified instantly via email",
  ]

  return (
    <section className="py-20 px-6 bg-gray-50">
      <h2 className="text-3xl font-bold text-center mb-10">
        Features
      </h2>

      <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {features.map((feature, i) => (
          <div key={i} className="p-6 border rounded-lg bg-white">
            {feature}
          </div>
        ))}
      </div>
    </section>
  )
}