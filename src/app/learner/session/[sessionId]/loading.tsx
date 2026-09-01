export default function LearningSessionLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="h-14 animate-pulse rounded-2xl bg-[#e8e0d3]" />
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="h-[560px] animate-pulse rounded-[30px] bg-[#fffdf8]" />
        <div className="h-72 animate-pulse rounded-[28px] bg-[#18332d]/15" />
      </div>
    </div>
  );
}
