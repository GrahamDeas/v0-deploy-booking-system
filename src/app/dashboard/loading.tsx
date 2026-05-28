export default function DashboardLoading() {
  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <div className="h-20 animate-pulse rounded-lg bg-white/70" />
        <div className="grid gap-3 md:grid-cols-3">
          <div className="h-24 animate-pulse rounded-lg bg-white/70" />
          <div className="h-24 animate-pulse rounded-lg bg-white/70" />
          <div className="h-24 animate-pulse rounded-lg bg-white/70" />
        </div>
        <div className="h-[620px] animate-pulse rounded-lg bg-white/70" />
      </div>
    </main>
  );
}
