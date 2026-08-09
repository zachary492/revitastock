export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">OmniSync</h1>
      <p className="text-gray-600">
        Stop inventory data drift before it costs you a sale. Upload your
        physical stock, connect eBay, and let OmniSync catch ghost listings
        and phantom drops automatically.
      </p>
      <a
        href="/auth"
        className="w-fit rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Get started
      </a>
    </main>
  );
}
