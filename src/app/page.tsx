"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Brain, Ear, RotateCcw, Target, Sparkles, GraduationCap } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 1000], [0, 200]);
  const y2 = useTransform(scrollY, [0, 1000], [0, -200]);
  const opacity = useTransform(scrollY, [0, 300], [1, 0]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="relative min-h-screen bg-[#030014] text-slate-200 overflow-hidden selection:bg-indigo-500/30">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none" />
        <div className="absolute top-[20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-cyan-600/20 blur-[150px] pointer-events-none" />
        <div className="absolute bottom-[-20%] left-[20%] w-[50%] h-[50%] rounded-full bg-purple-600/20 blur-[120px] pointer-events-none" />
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay pointer-events-none" />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-transform duration-300 group-hover:scale-105">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">
              Listen<span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">AI</span>
            </span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="hidden sm:block text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="relative inline-flex h-10 items-center justify-center overflow-hidden rounded-full p-[1px] focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-slate-50"
            >
              <span className="absolute inset-[-1000%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#E2CBFF_0%,#393BB2_50%,#E2CBFF_100%)]" />
              <span className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-full bg-slate-950 px-6 py-1 text-sm font-medium text-white backdrop-blur-3xl transition-all hover:bg-slate-950/80 gap-2">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-24 lg:pb-32 px-6">
          <div className="mx-auto max-w-5xl text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-8 inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-sm font-medium text-indigo-300 shadow-[0_0_20px_rgba(99,102,241,0.15)]"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              Next-Gen Adaptive Learning System
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mx-auto max-w-4xl font-display text-5xl font-extrabold tracking-tight text-white sm:text-7xl"
            >
              Master English with{" "}
              <span className="relative whitespace-nowrap text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400">
                <span className="relative">AI-Powered</span>
              </span>{" "}
              Dictation
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mx-auto mt-8 max-w-2xl text-lg tracking-tight text-slate-400 sm:text-xl leading-relaxed"
            >
              ListenAI analyzes your listening mistakes, generates personalized flashcards, and adapts to your skill level using spaced repetition and deep learning.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-10 flex flex-col justify-center gap-4 sm:flex-row"
            >
              <Link
                href="/register"
                className="group relative inline-flex h-12 items-center justify-center overflow-hidden rounded-xl bg-indigo-600 px-8 font-medium text-neutral-50 duration-300 hover:bg-indigo-700 hover:shadow-[0_0_40px_rgba(99,102,241,0.5)]"
              >
                <div className="absolute inset-0 flex h-full w-full justify-center [transform:skew(-12deg)_translateX(-100%)] group-hover:duration-1000 group-hover:[transform:skew(-12deg)_translateX(100%)]">
                  <div className="relative h-full w-8 bg-white/20" />
                </div>
                <span className="flex items-center gap-2">
                  Start Learning Free
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-8 font-medium text-white backdrop-blur-sm transition-all hover:bg-white/10"
              >
                View Live Demo
              </Link>
            </motion.div>
          </div>
        </section>

        {/* Bento Grid Features */}
        <section className="relative px-6 py-24 sm:py-32 max-w-7xl mx-auto">
          <div className="mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Engineered for <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400">fluency.</span>
            </h2>
            <p className="mt-4 text-lg text-slate-400 max-w-2xl">
              Everything you need to master English listening, beautifully designed and powered by cutting-edge AI.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[300px]">
            {/* Feature 1 - Large */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="md:col-span-2 md:row-span-2 relative group overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm transition-colors hover:bg-white/[0.07]"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <div className="relative z-10 flex flex-col h-full justify-between">
                <div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 mb-6">
                    <Ear className="h-7 w-7" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">Smart Dictation Engine</h3>
                  <p className="text-slate-400 max-w-md leading-relaxed">
                    Type exactly what you hear. Our advanced diffing algorithm highlights missing words, extra words, and spelling mistakes with pinpoint accuracy.
                  </p>
                </div>
                
                {/* Visual mock */}
                <div className="mt-8 rounded-xl border border-white/10 bg-[#0A0A0A] p-4 font-mono text-sm shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-cyan-500" />
                  <div className="flex gap-2 mb-3 items-center border-b border-white/5 pb-3">
                    <div className="h-3 w-3 rounded-full bg-red-500/20 border border-red-500/50" />
                    <div className="h-3 w-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                    <div className="h-3 w-3 rounded-full bg-green-500/20 border border-green-500/50" />
                  </div>
                  <p className="text-slate-300">
                    He <span className="text-red-400 line-through">has</span> <span className="text-green-400">had</span> a <span className="text-yellow-400 border-b border-yellow-400/50 border-dashed">very</span> long day at work.
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Feature 2 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="relative group overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm hover:bg-white/[0.07]"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 mb-6">
                <Brain className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">AI Error Analysis</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Stop wondering why you missed a word. AI explains if it was a liaison, a weak form, or just a vocabulary gap.
              </p>
            </motion.div>

            {/* Feature 3 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="relative group overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm hover:bg-white/[0.07]"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 mb-6">
                <RotateCcw className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">SM-2 Spaced Repetition</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Mistakes automatically convert to flashcards. Review them right when you're about to forget.
              </p>
            </motion.div>

            {/* Feature 4 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="md:col-span-2 relative group overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm hover:bg-white/[0.07] flex flex-col md:flex-row gap-8 items-center"
            >
              <div className="absolute inset-0 bg-gradient-to-bl from-purple-500/10 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <div className="flex-1">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-400 mb-6">
                  <Target className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">Adaptive Recommendations</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">
                  The system tracks your mastery across 6 dimensions: Listening, Vocabulary, Spelling, Function Words, Segments, and Final Sounds. It then recommends the perfect lesson to push your boundaries.
                </p>
              </div>
              <div className="flex-1 w-full flex items-center justify-center p-4">
                <div className="w-full space-y-4">
                  {[
                    { label: "Listening", val: 85, color: "bg-indigo-500" },
                    { label: "Vocabulary", val: 62, color: "bg-cyan-500" },
                    { label: "Spelling", val: 92, color: "bg-emerald-500" },
                  ].map((stat) => (
                    <div key={stat.label}>
                      <div className="flex justify-between text-xs font-medium mb-1">
                        <span className="text-slate-300">{stat.label}</span>
                        <span className="text-slate-400">{stat.val}%</span>
                      </div>
                      <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          whileInView={{ width: `${stat.val}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 1, delay: 0.5 }}
                          className={`h-full ${stat.color} rounded-full`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Feature 5 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="relative group overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm hover:bg-white/[0.07]"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 mb-6">
                <GraduationCap className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Teacher Tools</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Are you an educator? Use our AI lesson generator to turn any text into a complete dictation lesson in seconds.
              </p>
            </motion.div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="relative py-24 sm:py-32 px-6 border-t border-white/10">
          <div className="absolute inset-0 bg-indigo-900/10" />
          <div className="relative mx-auto max-w-4xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-5xl mb-6">
              Ready to transform your listening skills?
            </h2>
            <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
              Join thousands of learners who have already leveled up their English comprehension with ListenAI.
            </p>
            <Link
              href="/register"
              className="group relative inline-flex h-14 items-center justify-center overflow-hidden rounded-xl bg-white px-10 font-bold text-indigo-950 duration-300 hover:bg-slate-200 hover:scale-105 hover:shadow-[0_0_40px_rgba(255,255,255,0.3)]"
            >
              <span className="flex items-center gap-2">
                Create Free Account
                <Sparkles className="h-5 w-5 text-indigo-600" />
              </span>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-black/50 py-12 px-6">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 border border-indigo-500/30">
              <Sparkles className="h-4 w-4 text-indigo-400" />
            </div>
            <span className="text-sm font-semibold text-white">ListenAI</span>
          </div>
          <p className="text-sm text-slate-500">
            © {new Date().getFullYear()} ListenAI. Adaptive Learning System.
          </p>
        </div>
      </footer>
    </div>
  );
}
