"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { Sparkles, User, Mail, Lock, Eye, EyeOff } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"LEARNER" | "TEACHER">("LEARNER");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Đăng ký thất bại");
      setLoading(false);
      return;
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.ok) {
      if (role === "TEACHER") {
        router.push("/teacher/dashboard");
      } else {
        router.push("/learner/dashboard");
      }
      router.refresh();
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#030014] px-4">
      <div className="absolute inset-0 z-0">
        <div className="absolute left-1/2 top-1/4 h-96 w-96 -translate-x-1/2 rounded-full bg-cyan-600/10 blur-[120px]" />
        <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-indigo-600/10 blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-[0_0_20px_rgba(99,102,241,0.4)]">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">
              Listen<span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">AI</span>
            </span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-white">Đăng ký</h1>
          <p className="mt-2 text-sm text-slate-400">Bắt đầu hành trình học tiếng Anh của bạn</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-300">
                Họ tên
              </label>
              <div className="relative mt-1">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="block w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 backdrop-blur-sm transition-all focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                  placeholder="Nguyễn Văn A"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                Email
              </label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="block w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 backdrop-blur-sm transition-all focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                Mật khẩu
              </label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="block w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-10 text-sm text-white placeholder-slate-500 backdrop-blur-sm transition-all focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300">Vai trò</label>
              <div className="mt-1 flex gap-3">
                <button
                  type="button"
                  onClick={() => setRole("LEARNER")}
                  className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                    role === "LEARNER"
                      ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-300"
                      : "border-white/10 text-slate-400 hover:bg-white/5"
                  }`}
                >
                  🎓 Học viên
                </button>
                <button
                  type="button"
                  onClick={() => setRole("TEACHER")}
                  className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                    role === "TEACHER"
                      ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-300"
                      : "border-white/10 text-slate-400 hover:bg-white/5"
                  }`}
                >
                  👨‍🏫 Giáo viên
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400"
                role="alert"
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:from-indigo-500 hover:to-cyan-500 hover:shadow-xl hover:shadow-indigo-500/30 disabled:opacity-50"
            >
              {loading ? "Đang tạo tài khoản..." : "Tạo tài khoản"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Đã có tài khoản?{" "}
            <Link href="/login" className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors">
              Đăng nhập
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
