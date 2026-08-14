"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Email hoặc mật khẩu không chính xác");
      setLoading(false);
      return;
    }

    // Get session to determine role
    const res = await fetch("/api/auth/session");
    const session = await res.json();
    const role = session?.user?.role;

    if (role === "TEACHER" || role === "ADMIN") {
      router.push("/teacher/dashboard");
    } else {
      router.push("/learner/dashboard");
    }
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              L
            </div>
            <span className="text-lg font-semibold text-gray-900">ListenAI</span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Đăng nhập</h1>
          <p className="mt-2 text-sm text-gray-600">
            Chào mừng bạn trở lại!
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Mật khẩu
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Chưa có tài khoản?{" "}
          <Link href="/register" className="font-medium text-indigo-600 hover:text-indigo-500">
            Đăng ký
          </Link>
        </p>

        <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-medium text-gray-500">TÀI KHOẢN DEMO</p>
          <p className="mt-1 text-xs text-gray-600">
            <strong>Học viên:</strong> learner@example.com / demo1234
          </p>
          <p className="text-xs text-gray-600">
            <strong>Giáo viên:</strong> teacher@example.com / demo1234
          </p>
          <p className="mt-1 text-xs text-amber-600">
            ⚠ Chỉ dùng cho local demo
          </p>
        </div>
      </div>
    </div>
  );
}
