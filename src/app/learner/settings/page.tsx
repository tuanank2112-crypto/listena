"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { VoiceSettings } from "@/features/voice/voice-settings";

/**
 * Voice settings outside a Mission (Plan18 SPEC-P183). The picker used to live
 * only inside the session player, so a learner had to start a Mission before
 * they could choose the voice they would then hear everywhere else.
 */
export default function LearnerSettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <header>
        <p className="text-xs font-black uppercase tracking-[.18em] text-[#ef765d]">Your voice</p>
        <h1 className="mt-1 text-3xl font-black tracking-[-.05em] sm:text-4xl">Giọng nói</h1>
        <p className="mt-2 text-sm font-bold leading-6 text-[#758078]">
          Giọng bạn chọn ở đây được dùng ở mọi chỗ có nút Nghe: bài học, thẻ từ, trò chơi và cả hội thoại Mission.
        </p>
      </header>

      <VoiceSettings className="mt-6" />

      <section className="paper-card mt-5 rounded-[30px] p-5 sm:p-7">
        <h2 className="text-lg font-black">Nghe chưa hay?</h2>
        <ul className="mt-3 space-y-2 text-sm font-bold leading-6 text-[#45584f]">
          <li>1. Mở app bằng <strong>Microsoft Edge</strong> — có sẵn hàng chục giọng Natural miễn phí, không cần cài gì.</li>
          <li>2. Hoặc cài giọng Natural dùng được cả khi offline: <strong>Settings → Accessibility → Narrator → Add natural voices</strong> (Windows 11).</li>
          <li>3. Trên máy Mac/iPhone: <strong>Cài đặt → Trợ năng → Nội dung nói → Giọng nói</strong>, tải bản Premium.</li>
          <li>4. Cài xong hãy mở lại trình duyệt, giọng mới sẽ hiện trong danh sách ở trên.</li>
        </ul>
        <Link href="/learner/dashboard" className="mt-5 inline-flex items-center gap-2 text-xs font-black text-[#176b55]">
          Về trang hôm nay <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  );
}
