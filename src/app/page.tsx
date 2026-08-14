import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              L
            </div>
            <span className="text-lg font-semibold text-gray-900">ListenAI</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              Đăng nhập
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Đăng ký
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="flex flex-1 items-center justify-center px-4 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-700">
            🎯 AI-Powered Learning
          </div>
          <h1 className="mb-6 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
            Học tiếng Anh{" "}
            <span className="bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">
              thích ứng
            </span>{" "}
            với AI
          </h1>
          <p className="mx-auto mb-10 max-w-xl text-lg leading-7 text-gray-600">
            Luyện nghe, chép chính tả, và học từ vựng thông minh. AI phân tích lỗi,
            tạo flashcard, và đề xuất bài học phù hợp với trình độ của bạn.
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/register"
              className="inline-flex h-12 w-full max-w-xs items-center justify-center rounded-xl bg-indigo-600 px-8 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700 hover:shadow-xl hover:shadow-indigo-200 sm:w-auto"
            >
              Bắt đầu học ngay
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 w-full max-w-xs items-center justify-center rounded-xl border border-gray-300 bg-white px-8 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 sm:w-auto"
            >
              Tôi đã có tài khoản
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-gray-100 bg-white px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-gray-900">
            Tại sao chọn ListenAI?
          </h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => (
              <div
                key={i}
                className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-2xl">
                  {feature.icon}
                </div>
                <h3 className="mb-2 text-lg font-semibold text-gray-900">
                  {feature.title}
                </h3>
                <p className="text-sm leading-6 text-gray-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white px-4 py-8">
        <div className="mx-auto max-w-6xl text-center text-sm text-gray-500">
          <p>ListenAI - AI-Native Adaptive English Learning System</p>
          <p className="mt-1">
            Phản hồi AI có thể sai. Vui lòng kiểm tra thông tin từ nguồn đáng tin cậy.
          </p>
        </div>
      </footer>
    </div>
  );
}

const features = [
  {
    icon: "🎧",
    title: "Luyện nghe chép chính tả",
    description:
      "Nghe audio từng câu, chép lại chính xác những gì bạn nghe được. Hệ thống chấm điểm và phân tích lỗi chi tiết.",
  },
  {
    icon: "🤖",
    title: "Phân tích lỗi bằng AI",
    description:
      "AI phân tích nguyên nhân lỗi, phân biệt lỗi chính tả và lỗi nghe, đưa ra giải thích và bài tập sửa lỗi phù hợp.",
  },
  {
    icon: "🔄",
    title: "Ôn tập ngắt quãng",
    description:
      "Từ vựng sai được tự động chuyển thành flashcard và đưa vào lịch ôn tập thông minh (SM-2) để ghi nhớ lâu dài.",
  },
  {
    icon: "📊",
    title: "Học tập thích ứng",
    description:
      "Hệ thống theo dõi tiến bộ và đề xuất bài học phù hợp với trình độ, điểm yếu và sở thích của bạn.",
  },
  {
    icon: "👨‍🏫",
    title: "Công cụ cho giáo viên",
    description:
      "Giáo viên tạo bài học, sử dụng AI làm nháp, duyệt và xuất bản nội dung, theo dõi tiến độ học viên.",
  },
  {
    icon: "🎯",
    title: "Cá nhân hóa",
    description:
      "Mỗi câu trả lời đều cập nhật hồ sơ năng lực và ảnh hưởng đến hoạt động học tiếp theo.",
  },
];
